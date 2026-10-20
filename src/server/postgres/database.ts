import type { SqlClient, SqlPool } from '../contracts';
export { lazyPool } from './driver.mjs';

export function sqlCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
}

/** No connection is opened on import or construction. */
export class Database {
  constructor(private readonly pool: SqlPool) {}

  async transaction<T>(action: (client: SqlClient) => Promise<T>, readOnly = false): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const client = await this.pool.connect();
      let broken = false;
      try {
        await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
        const result = await action(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { broken = true; }
        if (!broken && ['40001', '40P01'].includes(sqlCode(error) ?? '') && attempt < 2) continue;
        throw error;
      } finally { client.release(broken); }
    }
  }
}
