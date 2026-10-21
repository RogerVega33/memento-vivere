import { createRequire } from 'node:module';
import { RepositoryError } from '../../domain/errors.mjs';
import { log } from '../logger.mjs';

/** @typedef {import('../contracts').SqlPool} SqlPool */
/** @typedef {{Pool:new (config:import('./config.mjs').DatabaseConfig) => SqlPool & {on(event:string, listener:(error:unknown)=>void):void}}} Driver */

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
        created.on('error', error => log('error', 'database.idle_connection_failed', { error }));
        pool = created;
      }
      try { return await pool.connect(); }
      catch (error) {
        log('error', 'database.connection_failed', { error });
        throw new RepositoryError('No se pudo acceder al almacenamiento. Inténtalo de nuevo.', 503);
      }
    },
    async end() { if (pool) await pool.end(); },
  };
}
