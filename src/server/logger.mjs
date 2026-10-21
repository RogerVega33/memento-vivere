import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { RepositoryError, ValidationError } from '../domain/errors.mjs';

const events = new Set([
  'request.started',
  'request.completed',
  'request.failed',
  'request.aborted',
  'request.timeout',
  'framework.error',
  'framework.log',
  'database.schema_created',
  'database.schema_ready',
  'database.prepare_failed',
  'database.close_failed',
  'database.connection_failed',
  'database.idle_connection_failed',
  'database.rollback_failed',
  'database.transaction_retry',
  'server.starting',
  'server.started',
  'server.ready',
  'server.start_failed',
  'server.stopping',
  'server.stopped',
  'server.shutdown_failed',
  'server.dependency.missing',
  'server.crashed',
  'server.warning',
  'server.exited',
  'memory.save.started',
  'memory.save.validated',
  'memory.save.completed',
  'memory.save.failed',
  'memory.photo.started',
  'memory.photo.completed',
  'photo.optimize.started',
  'photo.optimize.completed',
  'photo.optimize.failed',
  'photo.encode.failed',
  'heic.decode.started',
  'heic.decode.progress',
  'heic.decode.completed',
  'heic.decode.failed',
]);
const routes = new Set([
  '/', '/api/health', '/api/state', '/api/profile', '/api/memories', '/api/memories/:id', '/api/photos/:id',
  '/api/auth/session', '/api/auth/login', '/api/auth/logout', '/api/auth/register', '/api/auth/recover', '/api/auth/password',
]);
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const errorCodes = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH',
  'ENETUNREACH', 'EADDRINUSE', 'EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'EMFILE', 'ENOMEM',
  'ERR_HTTP_HEADERS_SENT', 'ERR_STREAM_PREMATURE_CLOSE', 'ERR_HTTP_REQUEST_TIMEOUT', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
  '08000', '08001', '08003', '08004', '08006', '08P01', '22001', '22003', '22007', '22008', '22021',
  '22P02', '23502', '23503', '23505', '23514', '28000', '28P01', '40001', '40P01', '42501', '42P01',
  '42703', '53300', '53400', '57014', '57P01', '57P02', '57P03',
]);

/** @typedef {{requestId:string, method:string, route:string, boundary?:boolean, clientIp?:string, peerIp?:string, protocol?:string}} RequestLogContext */
/** @typedef {'info'|'warn'|'error'} Level */
// The native HTTP entry and Next's bundled routes must share the same context.
const scope = /** @type {typeof globalThis & {mementoLogging?: {
 * context:AsyncLocalStorage<RequestLogContext>, output?:Record<Level, (entry:string)=>void>
 * }}} */ (globalThis);
const runtime = scope.mementoLogging ??= { context: new AsyncLocalStorage() };
export const requestContext = runtime.context;

/** Raw paths, IDs and search terms are never used as a logging fallback.
 * @param {string} [path] */
export function logRoute(path = '') {
  const pathname = path.split(/[?#]/, 1)[0];
  if (routes.has(pathname)) return pathname;
  if (/^\/api\/memories\/[^/]+$/.test(pathname)) return '/api/memories/:id';
  if (/^\/api\/photos\/[^/]+$/.test(pathname)) return '/api/photos/:id';
  if (pathname.startsWith('/_next/')) return '/_next/*';
  return 'unmatched';
}

/** @param {string} [method] @param {string} [path] @returns {RequestLogContext} */
export function newRequestContext(method = '', path = '') {
  return { requestId: randomUUID(), method: methods.has(method) ? method : 'OTHER', route: logRoute(path) };
}

/** Error messages, stacks, causes and SQL details may contain private values.
 * Do not read custom getters or trust a caller-supplied error name/code.
 * @param {unknown} error */
export function errorDetails(error) {
  try {
    const code = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code')?.value : undefined;
    const safeCode = typeof code === 'string' && errorCodes.has(code) ? code : undefined;
    const name = safeCode && /^[0-9A-Z]{5}$/.test(safeCode) ? 'DatabaseError'
      : error instanceof RepositoryError ? 'RepositoryError' : error instanceof ValidationError ? 'ValidationError'
        : error instanceof TypeError ? 'TypeError' : error instanceof RangeError ? 'RangeError'
          : error instanceof ReferenceError ? 'ReferenceError' : error instanceof SyntaxError ? 'SyntaxError'
            : error instanceof Error ? 'Error' : 'UnknownError';
    return { name, ...(safeCode ? { code: safeCode } : {}) };
  } catch { return { name: 'UnknownError' }; }
}

/** @param {Record<string,unknown>} source */
function safeFields(source) {
  /** @type {Record<string,unknown>} */
  const result = {};
  const own = Object.getOwnPropertyDescriptors(source);
  const value = /** @param {string} key */ key => own[key]?.value;
  if (value('error') !== undefined) result.error = errorDetails(value('error'));
  if (value('method') !== undefined) result.method = methods.has(value('method')) ? value('method') : 'OTHER';
  if (value('route') !== undefined) result.route = typeof value('route') === 'string' ? logRoute(value('route')) : 'unmatched';
  for (const key of ['status', 'durationMs', 'inputBytes', 'outputBytes', 'requestBytes', 'responseBytes',
    'width', 'height', 'newPhotos', 'retainedPhotos', 'photoIndex', 'totalPhotos', 'timeoutMs', 'allocatorArenas', 'attempt', 'port']) {
    const number = value(key);
    if (typeof number === 'number' && Number.isFinite(number) && number >= 0
      && (key !== 'status' || (Number.isInteger(number) && number >= 100 && number <= 599))) result[key] = Math.round(number * 1000) / 1000;
  }
  for (const key of ['heic', 'killed']) if (typeof value(key) === 'boolean') result[key] = value(key);
  for (const [key, allowed] of Object.entries({
    operation: ['create', 'update'], decoder: ['native-libheif'],
    executable: ['/usr/bin/prlimit', '/usr/bin/heif-thumbnailer'],
    signal: ['SIGKILL', 'SIGTERM', 'SIGABRT', 'SIGSEGV', 'SIGBUS'],
    reason: ['timeout', 'resource', 'unavailable', 'signal', 'decode'],
    routeType: ['render', 'route', 'action', 'proxy'],
    origin: ['uncaughtException', 'unhandledRejection'], protocol: ['http', 'https'],
  })) if (allowed.includes(value(key))) result[key] = value(key);
  if (Number.isSafeInteger(value('code')) && value('code') >= 0) result.code = value('code');
  if (typeof value('node') === 'string' && /^v\d+\.\d+\.\d+$/.test(value('node'))) result.node = value('node');
  for (const key of ['clientIp', 'peerIp']) if (typeof value(key) === 'string' && isIP(value(key))) result[key] = value(key);
  if (result.clientIp === result.peerIp) delete result.clientIp;
  return result;
}

/** JSON lines captured by Docker. Only static events and permitted diagnostic
 * fields are emitted; bodies, headers, cookies and arbitrary text are discarded.
 * @param {Level} level @param {string} event @param {Record<string,unknown>} [fields] */
export function log(level, event, fields = {}) {
  const known = events.has(event);
  const safeEvent = known ? event : 'framework.log';
  /** @type {Record<string,unknown>} */
  let details;
  try {
    details = safeFields(fields);
    if (!known) details = details.error ? { error: details.error } : {};
  } catch { details = { error: { name: 'UnknownError' } }; }
  const context = requestContext.getStore();
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(), level, event: safeEvent, pid: process.pid,
    ...(context ? { requestId: context.requestId, ...safeFields(context) } : {}), ...details,
  });
  (runtime.output?.[level] ?? console[level])(entry);
}

/** Filter framework/dependency console output only in the running HTTP server,
 * never during imports, builds or unit tests. */
export function installConsoleLogging() {
  if (runtime.output) return () => {};
  const original = { info: console.info, warn: console.warn, error: console.error,
    log: console.log, debug: console.debug, trace: console.trace, dir: console.dir, table: console.table };
  runtime.output = { info: original.info.bind(console), warn: original.warn.bind(console), error: original.error.bind(console) };
  for (const key of /** @type {(keyof typeof original)[]} */ (Object.keys(original))) {
    console[key] = (...args) => log(key === 'error' || key === 'trace' ? 'error' : key === 'warn' ? 'warn' : 'info',
      'framework.log', { error: args.find(value => value instanceof Error) });
  }
  return () => { Object.assign(console, original); delete runtime.output; };
}
