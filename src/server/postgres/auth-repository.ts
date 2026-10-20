import { RepositoryError } from '../../domain/errors.mjs';
import type { SqlClient } from '../contracts';
import { SESSION_SECONDS } from '../auth.mjs';
import { Database } from './database';
import { lockSession } from './life-repository';

type CredentialRow = { id: string; username: string; password_hash: string; recovery_phrase_hash: string };
const columns = 'id, username, password_hash, recovery_phrase_hash';

/** Persistence only: no passwords, scrypt or recovery phrases in clear text. */
export class PostgresAuthRepository {
  constructor(readonly db: Database) {}
  find(username: string) {
    return this.db.transaction(async client => (await client.query<CredentialRow>(`SELECT ${columns} FROM memento.users
      WHERE (lower(username COLLATE pg_catalog."pg_unicode_fast") COLLATE "C")
        = (lower($1::text COLLATE pg_catalog."pg_unicode_fast") COLLATE "C")`, [username])).rows[0] ?? null, true);
  }
  byId(id: string) {
    return this.db.transaction(async client => (await client.query<CredentialRow>(`SELECT ${columns} FROM memento.users WHERE id = $1::uuid`, [id])).rows[0] ?? null, true);
  }
  session(hash: Buffer) {
    return this.db.transaction(async client => (await client.query<{ id: string; username: string }>(`SELECT u.id, u.username
      FROM memento.sessions s JOIN memento.users u ON u.id = s.user_id
      WHERE s.token_hash = $1::bytea AND s.expires_at > clock_timestamp()`, [hash])).rows[0] ?? null, true);
  }

  private async lockOwners(client: SqlClient, id: string, previous: Buffer | null) {
    const owners = [id];
    if (previous) {
      const { rows } = await client.query<{ user_id: string }>('SELECT user_id FROM memento.sessions WHERE token_hash = $1::bytea', [previous]);
      if (rows[0]) owners.push(rows[0].user_id);
    }
    const ids = [...new Set(owners)].sort();
    await client.query('SELECT id FROM memento.users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids]);
    return ids;
  }
  private async newSession(client: SqlClient, id: string, hash: Buffer, previous: Buffer | null, owners: string[]) {
    if (previous) await client.query('DELETE FROM memento.sessions WHERE token_hash = $1::bytea AND user_id = ANY($2::uuid[])', [previous, owners]);
    await client.query(`INSERT INTO memento.sessions (token_hash, user_id, expires_at)
      VALUES ($1::bytea, $2::uuid, CURRENT_TIMESTAMP + ($3::integer * INTERVAL '1 second'))`, [hash, id, SESSION_SECONDS]);
  }

  register(user: CredentialRow, hash: Buffer, previous: Buffer | null) {
    return this.db.transaction(async client => {
      const owners = await this.lockOwners(client, user.id, previous);
      await client.query(`INSERT INTO memento.users (id, username, password_hash, recovery_phrase_hash)
        VALUES ($1::uuid, $2, $3, $4)`, [user.id, user.username, user.password_hash, user.recovery_phrase_hash]);
      await this.newSession(client, user.id, hash, previous, owners);
    });
  }

  failedLogin(id: string, expectedHash: string) {
    return this.db.transaction(async client => {
      await client.query('SELECT id FROM memento.users WHERE id = $1::uuid FOR UPDATE', [id]);
      await client.query(`UPDATE memento.users SET login_attempts = login_attempts + 1
        WHERE id = $1::uuid AND password_hash = $2`, [id, expectedHash]);
      // Returning normally commits the count; the service throws 401 afterwards.
    });
  }

  login(id: string, expectedHash: string, hash: Buffer, previous: Buffer | null) {
    return this.db.transaction(async client => {
      const owners = await this.lockOwners(client, id, previous);
      const { rows } = await client.query<{ id: string; username: string }>(`UPDATE memento.users SET login_attempts = 0
        WHERE id = $1::uuid AND password_hash = $2 RETURNING id, username`, [id, expectedHash]);
      if (!rows[0]) return null;
      await this.newSession(client, id, hash, previous, owners);
      return rows[0];
    });
  }

  recover(id: string, expectedHash: string, passwordHash: string, recoveryHash: string, hash: Buffer, previous: Buffer | null) {
    return this.db.transaction(async client => {
      const owners = await this.lockOwners(client, id, previous);
      const { rows } = await client.query<{ id: string; username: string }>(`UPDATE memento.users
        SET password_hash = $3, recovery_phrase_hash = $4, login_attempts = 0
        WHERE id = $1::uuid AND recovery_phrase_hash = $2 RETURNING id, username`, [id, expectedHash, passwordHash, recoveryHash]);
      if (!rows[0]) return null;
      await client.query('DELETE FROM memento.sessions WHERE user_id = $1::uuid', [id]);
      await this.newSession(client, id, hash, previous, owners);
      return rows[0];
    });
  }

  changePassword(id: string, current: Buffer, expectedHash: string, passwordHash: string) {
    return this.db.transaction(async client => {
      await lockSession(client, id, current);
      const { rows } = await client.query<{ id: string; username: string }>(`UPDATE memento.users SET password_hash = $3
        WHERE id = $1::uuid AND password_hash = $2 RETURNING id, username`, [id, expectedHash, passwordHash]);
      if (!rows[0]) throw new RepositoryError('Tu contraseña cambió durante la solicitud. Inténtalo de nuevo.', 409);
      await client.query('DELETE FROM memento.sessions WHERE user_id = $1::uuid AND token_hash <> $2::bytea', [id, current]);
      return rows[0];
    });
  }

  logout(hash: Buffer) {
    return this.db.transaction(async client => {
      const { rows } = await client.query<{ user_id: string }>('SELECT user_id FROM memento.sessions WHERE token_hash = $1::bytea', [hash]);
      if (!rows[0]) return;
      await client.query('SELECT id FROM memento.users WHERE id = $1::uuid FOR UPDATE', [rows[0].user_id]);
      await client.query('DELETE FROM memento.sessions WHERE token_hash = $1::bytea AND user_id = $2::uuid', [hash, rows[0].user_id]);
    });
  }
}
