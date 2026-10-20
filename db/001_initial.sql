-- ESQUEMA INICIAL: la aplicación lo ejecuta automáticamente si la base está vacía.
-- Destino: PostgreSQL 18, base UTF-8. Sin extensiones obligatorias.
-- prepareSchema controla la transacción y el bloqueo de inicialización.
-- Solo para una base nueva; no es una actualización de esquemas existentes.
-- Los UUID los genera el servidor con randomUUID(), como en la aplicación actual.
-- Se ejecuta con PGUSER, el mismo usuario que utiliza la aplicación.
-- Sin cuota global de fotografías: capacidad según recursos disponibles del servidor.
-- Los topes y formatos del producto se validan en el servidor, no en este esquema.

CREATE SCHEMA memento;

CREATE TABLE memento.users (
    id uuid PRIMARY KEY,
    username text NOT NULL CHECK (length(username) > 0),
    password_hash text NOT NULL CHECK (length(password_hash) > 0),
    recovery_phrase_hash text NOT NULL CHECK (length(recovery_phrase_hash) > 0),
    login_attempts bigint NOT NULL DEFAULT 0 CHECK (login_attempts >= 0),
    created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_timestamps_order CHECK (updated_at >= created_at)
);
-- Conserva la escritura original y evita cuentas que solo cambian mayúsculas.
-- Las consultas usan esta misma expresión; no se duplica el dato en otra columna.
CREATE UNIQUE INDEX users_username_case_insensitive_unique
    ON memento.users ((lower(username COLLATE pg_catalog."pg_unicode_fast") COLLATE "C"));

CREATE TABLE memento.profiles (
    user_id uuid PRIMARY KEY REFERENCES memento.users(id) ON DELETE CASCADE,
    birth_date date NOT NULL,
    horizon_years integer NOT NULL DEFAULT 80 CHECK (horizon_years > 0),
    created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT profiles_timestamps_order CHECK (updated_at >= created_at),
    CONSTRAINT profiles_valid_birth_date CHECK (
        isfinite(birth_date) AND birth_date >= DATE '0001-01-01'
    )
    -- La fecha no futura se valida con el calendario de America/Guayaquil.
    -- El adaptador solo permite INSERT de perfil: no editar el nacimiento.
    -- horizon_years se puede ajustar manualmente mediante el rol de mantenimiento.
);

CREATE TABLE memento.sessions (
    token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
    user_id uuid NOT NULL REFERENCES memento.users(id) ON DELETE CASCADE,
    created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamptz(3) NOT NULL,
    CONSTRAINT sessions_timestamps_order CHECK (updated_at >= created_at),
    CONSTRAINT sessions_expiry_order CHECK (expires_at > created_at)
);
CREATE INDEX sessions_user_id_idx ON memento.sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON memento.sessions(expires_at);

CREATE TABLE memento.memories (
    id uuid PRIMARY KEY,
    -- Exige que el usuario haya completado primero su fecha de nacimiento.
    user_id uuid NOT NULL REFERENCES memento.profiles(user_id) ON DELETE CASCADE,
    title text NOT NULL CHECK (length(title) > 0),
    description text NOT NULL DEFAULT '',
    event_year integer NOT NULL CHECK (event_year > 0),
    event_month smallint NOT NULL CHECK (event_month BETWEEN 1 AND 12),
    event_day smallint,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT memories_valid_calendar_day CHECK (
        -- make_date rechaza días imposibles y años fuera del calendario nativo.
        -- El 1 solo valida el mes si falta el día; event_day sigue siendo NULL.
        isfinite(make_date(event_year, event_month, COALESCE(event_day, 1)))
    ),
    CONSTRAINT memories_timestamps_order CHECK (updated_at >= created_at)
);
CREATE INDEX memories_owner_month_order_idx ON memento.memories (
    user_id, event_year, event_month, event_day ASC NULLS LAST, created_at, id
);

-- Filtro compartido de calendario; NO reemplaza WHERE user_id = $usuario.
-- No materializado: refleja nacimiento y fecha actual en cada lectura.
CREATE VIEW memento.visible_memories WITH (security_invoker = true) AS
SELECT m.*
FROM memento.memories AS m
JOIN memento.profiles AS p ON p.user_id = m.user_id
CROSS JOIN (
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date AS today
) AS calendar
WHERE (m.event_year, m.event_month) >= (
    EXTRACT(YEAR FROM p.birth_date)::integer,
    EXTRACT(MONTH FROM p.birth_date)::integer
)
AND (m.event_year, m.event_month) <= (
    EXTRACT(YEAR FROM calendar.today)::integer,
    EXTRACT(MONTH FROM calendar.today)::integer
)
AND (
    m.event_day IS NULL
    OR make_date(m.event_year, m.event_month, m.event_day)
        BETWEEN p.birth_date AND calendar.today
);

CREATE TABLE memento.memory_tags (
    memory_id uuid NOT NULL REFERENCES memento.memories(id) ON DELETE CASCADE,
    -- Se conserva el texto, sin topes de longitud ni restricciones de formato.
    label text NOT NULL CHECK (length(label) > 0)
);
-- PostgreSQL 18/UTF-8: lowercase Unicode completo sin depender del locale
-- de la base ni de ICU. No usar C dentro de lower (solo convierte ASCII)
-- ni casefold (equipararía, por ejemplo, ß y ss). C solo compara el resultado.
-- El índice calcula NFC, espacios agrupados y minúsculas para la unicidad,
-- sin exigir esa escritura a label ni añadir columnas normalizadas.
-- Es la única clave de unicidad necesaria: no hay posición, ID artificial
-- ni otra PK que añada un índice equivalente. Ninguna tabla referencia etiquetas.
-- El máximo de 20 etiquetas lo valida normalizeTags en el servidor, bajo el
-- bloqueo del recuerdo durante el guardado; no es un límite SQL entre filas.
CREATE UNIQUE INDEX memory_tags_unique_label
    ON memento.memory_tags (
        memory_id,
        (lower(btrim(regexp_replace(
            normalize(label, NFC) COLLATE "C",
            U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',
            ' ', 'g'
        )) COLLATE pg_catalog."pg_unicode_fast") COLLATE "C")
    );

CREATE TABLE memento.photos (
    id uuid PRIMARY KEY,
    memory_id uuid NOT NULL REFERENCES memento.memories(id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position > 0),
    data bytea NOT NULL CHECK (octet_length(data) > 0),
    size_bytes integer GENERATED ALWAYS AS (octet_length(data)) STORED,
    -- Dimensiones reales positivas, sin acoplar el esquema al conversor actual.
    width integer NOT NULL CHECK (width > 0),
    height integer NOT NULL CHECK (height > 0),
    created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT photos_timestamps_order CHECK (updated_at >= created_at),
    CONSTRAINT photos_memory_position_unique UNIQUE (memory_id, position)
        DEFERRABLE INITIALLY IMMEDIATE
);

-- Una única regla de fechas para las cinco tablas que tienen created_at.
-- Se aplica también a SQL manual. La aplicación no escribe updated_at.
-- Se comparan solo campos persistidos de datos: no la columna generada
-- size_bytes (no disponible en NEW antes de los triggers BEFORE), ni una
-- conversión JSON de la fila, que copiaría los bytes de cada fotografía.
CREATE FUNCTION memento.maintain_row_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $timestamps$
DECLARE
    data_changed boolean;
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.updated_at := NEW.created_at;
        RETURN NEW;
    END IF;

    NEW.created_at := OLD.created_at;
    CASE TG_TABLE_NAME
        WHEN 'users' THEN
            data_changed := ROW(NEW.id, NEW.username, NEW.password_hash,
                NEW.recovery_phrase_hash, NEW.login_attempts)
                IS DISTINCT FROM ROW(OLD.id, OLD.username, OLD.password_hash,
                OLD.recovery_phrase_hash, OLD.login_attempts);
        WHEN 'profiles' THEN
            data_changed := ROW(NEW.user_id, NEW.birth_date, NEW.horizon_years)
                IS DISTINCT FROM ROW(OLD.user_id, OLD.birth_date, OLD.horizon_years);
        WHEN 'sessions' THEN
            data_changed := ROW(NEW.token_hash, NEW.user_id, NEW.expires_at)
                IS DISTINCT FROM ROW(OLD.token_hash, OLD.user_id, OLD.expires_at);
        WHEN 'memories' THEN
            data_changed := ROW(NEW.id, NEW.user_id, NEW.title, NEW.description,
                NEW.event_year, NEW.event_month, NEW.event_day, NEW.version)
                IS DISTINCT FROM ROW(OLD.id, OLD.user_id, OLD.title, OLD.description,
                OLD.event_year, OLD.event_month, OLD.event_day, OLD.version);
        WHEN 'photos' THEN
            data_changed := ROW(NEW.id, NEW.memory_id, NEW.position, NEW.data,
                NEW.width, NEW.height)
                IS DISTINCT FROM ROW(OLD.id, OLD.memory_id, OLD.position, OLD.data,
                OLD.width, OLD.height);
        ELSE
            RAISE EXCEPTION 'Tabla no admitida por maintain_row_timestamps: %', TG_TABLE_NAME;
    END CASE;

    IF data_changed THEN
        -- Reloj de la escritura, no del comienzo de la transacción.
        -- Evita retroceder si el reloj del sistema se ajusta hacia atrás.
        NEW.updated_at := GREATEST(OLD.updated_at, clock_timestamp()::timestamptz(3));
    ELSE
        NEW.updated_at := OLD.updated_at;
    END IF;
    RETURN NEW;
END;
$timestamps$;

CREATE TRIGGER users_maintain_timestamps
BEFORE INSERT OR UPDATE ON memento.users
FOR EACH ROW EXECUTE FUNCTION memento.maintain_row_timestamps();

CREATE TRIGGER profiles_maintain_timestamps
BEFORE INSERT OR UPDATE ON memento.profiles
FOR EACH ROW EXECUTE FUNCTION memento.maintain_row_timestamps();

CREATE TRIGGER sessions_maintain_timestamps
BEFORE INSERT OR UPDATE ON memento.sessions
FOR EACH ROW EXECUTE FUNCTION memento.maintain_row_timestamps();

CREATE TRIGGER memories_maintain_timestamps
BEFORE INSERT OR UPDATE ON memento.memories
FOR EACH ROW EXECUTE FUNCTION memento.maintain_row_timestamps();

CREATE TRIGGER photos_maintain_timestamps
BEFORE INSERT OR UPDATE ON memento.photos
FOR EACH ROW EXECUTE FUNCTION memento.maintain_row_timestamps();

COMMENT ON TABLE memento.users IS 'Cuentas; solo hashes de contraseña y recuperación';
COMMENT ON COLUMN memento.users.login_attempts IS
    'Logins fallidos consecutivos; se reinicia al iniciar sesión o recuperar la cuenta. No sustituye el limitador temporal de solicitudes.';
COMMENT ON TABLE memento.profiles IS 'Configuración inicial de nacimiento, un perfil por usuario';
COMMENT ON TABLE memento.sessions IS 'Sesiones persistentes; hash SHA-256 del token, nunca la cookie';
COMMENT ON TABLE memento.memories IS 'Recuerdos privados con fecha parcial y control de versión';
COMMENT ON TABLE memento.memory_tags IS 'Conjunto de etiquetas propias de un recuerdo, sin orden significativo';
COMMENT ON TABLE memento.photos IS 'Únicamente WebP optimizado; sin originales ni metadatos EXIF';
