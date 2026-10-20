import { AsyncLocalStorage } from 'node:async_hooks';

/** @type {AsyncLocalStorage<{requestId: string}>} */
export const requestContext = new AsyncLocalStorage();

/** JSON lines on stdout/stderr, captured by Docker. Never pass request bodies,
 * filenames, query strings, headers or photo contents into log fields.
 * @param {'info' | 'warn' | 'error'} level
 * @param {string} event
 * @param {Record<string, unknown>} [fields] */
export function log(level, event, fields = {}) {
  const memory = process.memoryUsage();
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(), level, event, pid: process.pid,
    ...requestContext.getStore(), ...fields,
    rssMB: Math.round(memory.rss / 1048576),
    heapMB: Math.round(memory.heapUsed / 1048576),
    externalMB: Math.round(memory.external / 1048576),
  });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.info(entry);
}

/** @param {unknown} error */
export function errorDetails(error) {
  // PostgreSQL error text may contain private values. Retain only SQLSTATE.
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) {
    return { name: 'DatabaseError', code: error.code };
  }
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { name: 'UnknownError' };
}
