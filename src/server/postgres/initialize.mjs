import { databaseConfig } from './config.mjs';
import { lazyPool } from './driver.mjs';
import { prepareSchema } from './schema.mjs';

/** Use a short-lived startup pool before accepting HTTP requests. Runtime
 * repositories keep their own lazy pool. Import/build never starts this work.
 * @param {import('./config.mjs').Environment} environment
 * @param {{createPool?:(config:import('./config.mjs').DatabaseConfig)=>import('../contracts').SqlPool,
 * prepare?:(pool:import('../contracts').SqlPool)=>Promise<{created:boolean}>}} [dependencies] */
export async function prepareDatabase(environment, dependencies = {}) {
  const config = databaseConfig(environment);
  const pool = (dependencies.createPool ?? lazyPool)(config);
  let failed = false;
  try {
    const result = await (dependencies.prepare ?? prepareSchema)(pool);
    console.info(JSON.stringify({ event: result.created ? 'database.schema_created' : 'database.schema_ready' }));
    return result;
  } catch (error) {
    failed = true;
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
    console.error(JSON.stringify({ event: 'database.prepare_failed', ...(code && /^[0-9A-Z]{5}$/.test(code) ? { code } : {}) }));
    throw new Error('No se pudo preparar PostgreSQL. Revisa la conexión y que la base esté vacía o tenga el esquema completo de Memento Vivere.');
  } finally {
    try { await pool.end(); }
    catch { if (!failed) throw new Error('No se pudo cerrar la conexión de preparación PostgreSQL.'); }
  }
}
