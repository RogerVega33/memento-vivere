import { createRequire } from 'node:module';
import { RepositoryError } from '../../domain/errors.mjs';

/** @typedef {import('../contracts').SqlPool} SqlPool */
/** @typedef {{Pool:new (config:import('./config.mjs').DatabaseConfig) => SqlPool & {on(event:string, listener:()=>void):void}}} Driver */

/** No connection or driver load on import or construction.
 * @param {import('./config.mjs').DatabaseConfig} config @returns {SqlPool} */
export function lazyPool(config) {
  /** @type {SqlPool|undefined} */
  let pool;
  return {
    async connect() {
      if (!pool) {
        const { Pool } = /** @type {Driver} */ (createRequire(`${process.cwd()}/package.json`)('pg'));
        const created = new Pool(config);
        created.on('error', () => console.error(JSON.stringify({ event: 'database.idle_connection_failed' })));
        pool = created;
      }
      try { return await pool.connect(); }
      catch { throw new RepositoryError('No se pudo acceder al almacenamiento. Inténtalo de nuevo.', 503); }
    },
    async end() { if (pool) await pool.end(); },
  };
}
