import { RepositoryError } from '../../domain/errors.mjs';
import { horizonYearsForBirthDate, monthKey, parseMonth, validateBirthDate } from '../../domain/dates.mjs';
import { isMemoryVisible, LIMITS, matchesMemory, validateMemory } from '../../domain/memories.mjs';
import type { Memory, Profile, Snapshot } from '../../domain/types';
import type { LifeRepository, Photo, SaveInput, SqlClient } from '../contracts';
import { Database, sqlCode } from './database';

const validId = (id: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
const instant = (value: Date | string) => new Date(value).toISOString();
const sessionEnded = () => new RepositoryError('Tu sesión terminó. Inicia sesión de nuevo.', 401);
type ProfileRow = { birth_date: string | null; horizon_years: number | null; created_at: Date | string | null; today: string };
type MemoryRow = {
  id: string; title: string; description: string; event_year: number; event_month: number;
  event_day: number | null; version: number; created_at: Date | string; updated_at: Date | string;
  tags: string[]; photo_ids: string[];
};
const memoryColumns = `m.id, m.title, m.description, m.event_year, m.event_month, m.event_day,
  m.version, m.created_at, m.updated_at,
  ARRAY(SELECT t.label FROM memento.memory_tags t WHERE t.memory_id = m.id) AS tags,
  ARRAY(SELECT p.id FROM memento.photos p WHERE p.memory_id = m.id ORDER BY p.position) AS photo_ids`;
function memory(row: MemoryRow): Memory {
  return { id: row.id, title: row.title, description: row.description, year: row.event_year,
    month: row.event_month, day: row.event_day, precision: row.event_day === null ? 'MONTH' : 'DAY',
    tags: row.tags, photoIds: row.photo_ids, version: row.version,
    createdAt: instant(row.created_at), updatedAt: instant(row.updated_at) };
}

export async function lockSession(client: SqlClient, userId: string, sessionHash: Buffer) {
  await client.query('SELECT id FROM memento.users WHERE id = $1::uuid FOR UPDATE', [userId]);
  const result = await client.query(`SELECT token_hash FROM memento.sessions
    WHERE user_id = $1::uuid AND token_hash = $2::bytea AND expires_at > clock_timestamp() FOR UPDATE`, [userId, sessionHash]);
  if (!result.rows.length) throw sessionEnded();
}

/** Session-scoped; all writes recheck the session inside the atomic operation. */
export class PostgresLifeRepository implements LifeRepository {
  constructor(private readonly db: Database, private readonly userId: string,
    private readonly sessionHash: Buffer) {}

  private async readSession(client: SqlClient) {
    const { rows } = await client.query(`SELECT token_hash FROM memento.sessions
      WHERE user_id = $1::uuid AND token_hash = $2::bytea AND expires_at > clock_timestamp()`, [this.userId, this.sessionHash]);
    if (!rows.length) throw sessionEnded();
  }

  private async context(client: SqlClient, lock = false): Promise<{ profile: Profile | null; today: string }> {
    if (lock) await client.query('SELECT user_id FROM memento.profiles WHERE user_id = $1::uuid FOR UPDATE', [this.userId]);
    const { rows } = await client.query<ProfileRow>(`SELECT to_char(p.birth_date, 'YYYY-MM-DD') AS birth_date,
      p.horizon_years, p.created_at,
      to_char(CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD') AS today
      FROM (SELECT 1) AS singleton LEFT JOIN memento.profiles p ON p.user_id = $1::uuid`, [this.userId]);
    const row = rows[0];
    const profile = row.birth_date === null ? null : {
      birthDate: row.birth_date, horizonYears: row.horizon_years!, createdAt: instant(row.created_at!),
    };
    if (profile) validateBirthDate(profile.birthDate, row.today, profile.horizonYears);
    return { profile, today: row.today };
  }

  async requireProfile(): Promise<Profile> {
    return this.db.transaction(async client => {
      await this.readSession(client);
      const { profile } = await this.context(client);
      if (!profile) throw new RepositoryError('Configura primero tu fecha de nacimiento.', 409);
      return profile;
    }, true);
  }

  async setup(birthDate: string) {
    try {
      return await this.db.transaction(async client => {
        await lockSession(client, this.userId, this.sessionHash);
        const context = await this.context(client, true);
        if (context.profile) throw new RepositoryError('La fecha de nacimiento ya está configurada y no puede modificarse.', 409);
        const horizonYears = horizonYearsForBirthDate(birthDate, context.today);
        const { rows } = await client.query<{ created_at: Date }>(`INSERT INTO memento.profiles (user_id, birth_date, horizon_years)
          VALUES ($1::uuid, $2::date, $3::integer) RETURNING created_at`, [this.userId, birthDate, horizonYears]);
        return { birthDate, horizonYears, createdAt: instant(rows[0].created_at) };
      });
    } catch (error) {
      if (sqlCode(error) === '23505') throw new RepositoryError('La fecha de nacimiento ya está configurada y no puede modificarse.', 409);
      throw error;
    }
  }

  async snapshot(query = ''): Promise<Snapshot> {
    return this.db.transaction(async client => {
      await this.readSession(client);
      const { profile, today } = await this.context(client);
      if (!profile) return { profile: null, today, memoryCount: 0, photoCount: 0, monthCounts: {} };
      const matching: string[] = [];
      if (query.trim()) {
        const { rows } = await client.query<{ id: string; title: string; description: string; tags: string[] }>(`SELECT m.id, m.title, m.description,
          ARRAY(SELECT t.label FROM memento.memory_tags t WHERE t.memory_id = m.id) AS tags
          FROM memento.visible_memories m WHERE m.user_id = $1::uuid`, [this.userId]);
        for (const row of rows) if (matchesMemory(row, query)) matching.push(row.id);
      }
      const { rows } = await client.query<{ event_year: number; event_month: number; memory_count: string; photo_count: string; matching_count: string }>(`
        SELECT m.event_year, m.event_month, count(*)::text AS memory_count,
          sum((SELECT count(*) FROM memento.photos p WHERE p.memory_id = m.id))::text AS photo_count,
          count(*) FILTER (WHERE m.id = ANY($2::uuid[]))::text AS matching_count
        FROM memento.visible_memories m WHERE m.user_id = $1::uuid GROUP BY m.event_year, m.event_month`, [this.userId, matching]);
      const monthCounts: Record<string, number> = {}, searchCounts: Record<string, number> = {};
      let memoryCount = 0, photoCount = 0, matchingCount = 0;
      for (const row of rows) {
        const count = Number(row.memory_count), photos = Number(row.photo_count), matches = Number(row.matching_count);
        if (![count, photos, matches, memoryCount + count, photoCount + photos].every(Number.isSafeInteger)) throw new Error('Conteo fuera del rango JSON admitido.');
        const key = monthKey(row.event_year, row.event_month);
        monthCounts[key] = count;
        memoryCount += count; photoCount += photos; matchingCount += matches;
        if (matches) searchCounts[key] = matches;
      }
      return { profile, today, monthCounts, memoryCount, photoCount,
        ...(query.trim() ? { search: { query: query.trim(), monthCounts: searchCounts, memoryCount: matchingCount } } : {}) };
    }, true);
  }

  async listMonth(key: string) {
    const { year, month } = parseMonth(key);
    return this.db.transaction(async client => {
      await this.readSession(client);
      const { profile, today } = await this.context(client);
      if (!profile) throw new RepositoryError('Configura primero tu fecha de nacimiento.', 409);
      if (key < profile.birthDate.slice(0, 7) || key > today.slice(0, 7)) throw new RepositoryError('Este mes no está disponible.', 400);
      const { rows } = await client.query<MemoryRow>(`SELECT ${memoryColumns} FROM memento.visible_memories m
        WHERE m.user_id = $1::uuid AND m.event_year = $2::integer AND m.event_month = $3::integer
        ORDER BY m.event_day ASC NULLS LAST, m.created_at, m.id`, [this.userId, year, month]);
      return rows.map(memory);
    }, true);
  }

  private async existing(client: SqlClient, id: string, version: number | null, profile: Profile, today: string) {
    if (!validId(id)) throw new RepositoryError('Este recuerdo ya no existe.', 404);
    const { rows } = await client.query<MemoryRow>(`SELECT ${memoryColumns} FROM memento.memories m
      WHERE m.user_id = $1::uuid AND m.id = $2::uuid FOR UPDATE OF m`, [this.userId, id]);
    const saved = rows[0] ? memory(rows[0]) : null;
    if (!saved || !isMemoryVisible(saved, profile.birthDate, today)) throw new RepositoryError('Este recuerdo ya no existe.', 404);
    if (saved.version !== version) throw new RepositoryError('Este recuerdo cambió en otro dispositivo. Actualiza la página.', 409);
    return saved;
  }

  async save(input: SaveInput, newId: string): Promise<Memory> {
    return this.db.transaction(async client => {
      await lockSession(client, this.userId, this.sessionHash);
      const { profile, today } = await this.context(client, true);
      if (!profile) throw new RepositoryError('Configura primero tu fecha de nacimiento.', 409);
      const draft = validateMemory(input.draft, profile.birthDate, today);
      const previous = input.id ? await this.existing(client, input.id, input.version, profile, today) : null;
      if (new Set(input.retainedPhotoIds).size !== input.retainedPhotoIds.length
        || input.retainedPhotoIds.some(id => !previous?.photoIds.includes(id))) throw new RepositoryError('Las fotografías seleccionadas no son válidas.', 400);
      const photoIds = [...input.retainedPhotoIds, ...input.photos.map(photo => photo.id)];
      if (photoIds.length > LIMITS.photosPerMemory) throw new RepositoryError(`Puedes añadir hasta ${LIMITS.photosPerMemory} fotografías por recuerdo.`, 400);
      for (const photo of input.photos) {
        if (!validId(photo.id) || !photo.data.byteLength || !Number.isInteger(photo.width) || !Number.isInteger(photo.height)
          || photo.width < 1 || photo.height < 1) throw new RepositoryError('La fotografía no es válida.', 400);
      }
      const id = previous?.id ?? newId;
      const values = [this.userId, id, draft.title, draft.description, draft.year, draft.month, draft.day];
      const { rows } = previous
        ? await client.query<{ created_at: Date; updated_at: Date; version: number }>(`UPDATE memento.memories
          SET title = $3, description = $4, event_year = $5, event_month = $6, event_day = $7, version = version + 1
          WHERE user_id = $1::uuid AND id = $2::uuid RETURNING created_at, updated_at, version`, values)
        : await client.query<{ created_at: Date; updated_at: Date; version: number }>(`INSERT INTO memento.memories
          (user_id, id, title, description, event_year, event_month, event_day)
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7) RETURNING created_at, updated_at, version`, values);
      await client.query('DELETE FROM memento.memory_tags WHERE memory_id = $1::uuid', [id]);
      await client.query(`INSERT INTO memento.memory_tags (memory_id, label)
        SELECT $1::uuid, tag FROM unnest($2::text[]) AS tag`, [id, draft.tags]);
      await client.query('SET CONSTRAINTS memento.photos_memory_position_unique DEFERRED');
      await client.query('DELETE FROM memento.photos WHERE memory_id = $1::uuid AND NOT (id = ANY($2::uuid[]))', [id, input.retainedPhotoIds]);
      for (const [index, photoId] of input.retainedPhotoIds.entries()) {
        await client.query('UPDATE memento.photos SET position = $3 WHERE memory_id = $1::uuid AND id = $2::uuid', [id, photoId, index + 1]);
      }
      for (const [index, photo] of input.photos.entries()) {
        await client.query(`INSERT INTO memento.photos (id, memory_id, position, data, width, height)
          VALUES ($1::uuid, $2::uuid, $3, $4::bytea, $5, $6)`,
        [photo.id, id, input.retainedPhotoIds.length + index + 1, Buffer.from(photo.data), photo.width, photo.height]);
      }
      return { ...draft, id, photoIds, version: rows[0].version, createdAt: instant(rows[0].created_at), updatedAt: instant(rows[0].updated_at) };
    });
  }

  async delete(id: string, version: number) {
    await this.db.transaction(async client => {
      await lockSession(client, this.userId, this.sessionHash);
      const { profile, today } = await this.context(client, true);
      if (!profile) throw new RepositoryError('Configura primero tu fecha de nacimiento.', 409);
      await this.existing(client, id, version, profile, today);
      await client.query('DELETE FROM memento.memories WHERE user_id = $1::uuid AND id = $2::uuid', [this.userId, id]);
    });
  }

  async getPhoto(id: string): Promise<Photo | null> {
    if (!validId(id)) return null;
    return this.db.transaction(async client => {
      await this.readSession(client);
      const { rows } = await client.query<Photo>(`SELECT p.id, p.data, p.width, p.height FROM memento.photos p
        JOIN memento.visible_memories m ON m.id = p.memory_id WHERE m.user_id = $1::uuid AND p.id = $2::uuid`, [this.userId, id]);
      return rows[0] ?? null;
    }, true);
  }
}
