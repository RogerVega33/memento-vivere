import { readFile } from 'node:fs/promises';
import { log } from '../logger.mjs';

// Fixed identifiers only. Probes read no account, memory or photo values.
const columns = {
  users: 'id, username, password_hash, recovery_phrase_hash, login_attempts, created_at, updated_at',
  profiles: 'user_id, birth_date, horizon_years, created_at, updated_at',
  sessions: 'token_hash, user_id, created_at, updated_at, expires_at',
  memories: 'id, user_id, title, description, event_year, event_month, event_day, version, created_at, updated_at',
  memory_tags: 'memory_id, label',
  photos: 'id, memory_id, position, data, size_bytes, width, height, created_at, updated_at',
};
const loadInitialSchema = () => readFile(new URL('../../../db/001_initial.sql', import.meta.url), 'utf8');

/** Initial creation only: no alterations, drops or data imports in an existing schema.
 * @param {import('../contracts').SqlPool} pool
 * @param {()=>Promise<string>} [loadSchema] */
export async function prepareSchema(pool, loadSchema = loadInitialSchema) {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await client.query("SET LOCAL lock_timeout = '10s'");
    // One transaction owns both the emptiness check and all DDL, even when
    // multiple application processes start against the same database.
    await client.query('SELECT pg_catalog.pg_advisory_xact_lock(86151016, 1)');
    await client.query('SET LOCAL search_path = pg_catalog, public');
    const { rows } = await client.query(`SELECT n.nspname AS schema_name, c.relname AS object_name, c.relkind AS kind
      FROM pg_catalog.pg_namespace n LEFT JOIN pg_catalog.pg_class c
        ON c.relnamespace = n.oid AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
        AND (n.nspname <> 'public' OR c.oid IS NOT NULL)`);
    const created = rows.length === 0;
    if (created) {
      await client.query(await loadSchema());
    } else if (!Object.keys(columns).every(table => rows.some(row => row.schema_name === 'memento'
      && row.object_name === table && ['r', 'p'].includes(String(row.kind))))
      || !rows.some(row => row.schema_name === 'memento' && row.object_name === 'visible_memories' && row.kind === 'v')) {
      throw new Error('El esquema existente está incompleto o pertenece a otra aplicación.');
    }
    for (const [table, fields] of Object.entries(columns)) {
      await client.query(`SELECT ${fields} FROM memento.${table} LIMIT 0`);
    }
    await client.query('SELECT id, user_id, event_year, event_month, event_day FROM memento.visible_memories LIMIT 0');
    await client.query('COMMIT');
    return { created };
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) { broken = true; log('error', 'database.rollback_failed', { error: rollbackError }); }
    throw error;
  } finally { client.release(broken); }
}
