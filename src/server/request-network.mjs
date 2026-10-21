import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';
import { RepositoryError } from '../domain/errors.mjs';
import { log, newRequestContext, requestContext } from './logger.mjs';

/** @typedef {{ip:string, peerIp:string, secure:boolean, host:string}} Network */
const scope = /** @type {typeof globalThis & {mementoNetwork?: AsyncLocalStorage<Network>}} */ (globalThis);
const context = scope.mementoNetwork ??= new AsyncLocalStorage();
export const networkContext = () => context.getStore();

/** @param {string} value */
export function normalizeIp(value) {
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6) return null;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(canonical);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

/** @param {string|undefined} value */
export function trustedProxyIp(value) {
  if (!value) return null;
  const ip = normalizeIp(value.trim());
  if (!ip) throw new Error('TRUSTED_PROXY_IP debe ser la IP exacta del proxy.');
  return ip;
}

/** @param {string|string[]|undefined} value */
function hostName(value) {
  if (typeof value !== 'string' || !value || /[\s,/@\\?#]/.test(value)) throw new RepositoryError('Host no válido.', 400);
  try {
    const url = new URL(`http://${value}`);
    if (!url.hostname || url.pathname !== '/') throw new Error();
    return value;
  } catch { throw new RepositoryError('Host no válido.', 400); }
}

/** Read the socket before trusting forwarding headers; strips all client claims.
 * @param {{headers:import('node:http').IncomingHttpHeaders, socket:{remoteAddress?:string, encrypted?:boolean}}} request
 * @param {string|null} proxy
 * @returns {Network} */
export function prepareNetwork(request, proxy) {
  const peerIp = normalizeIp(request.socket.remoteAddress ?? '');
  if (!peerIp) throw new RepositoryError('No se pudo identificar la conexión.', 400);
  const trusted = peerIp === proxy;
  let ip = peerIp, secure = request.socket.encrypted === true, host = hostName(request.headers.host);
  if (trusted) {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded !== undefined) {
      ip = typeof forwarded === 'string' ? normalizeIp(forwarded.trim()) ?? '' : '';
      if (!ip) throw new RepositoryError('El proxy debe enviar una sola IP válida.', 400);
    }
    const protocol = request.headers['x-forwarded-proto'];
    if (protocol !== undefined) {
      if (protocol !== 'http' && protocol !== 'https') throw new RepositoryError('Protocolo del proxy no válido.', 400);
      secure = protocol === 'https';
    }
    if (request.headers['x-forwarded-host'] !== undefined) host = hostName(request.headers['x-forwarded-host']);
  }
  for (const key of Object.keys(request.headers)) {
    if (key === 'forwarded' || key.startsWith('x-forwarded-') || key === 'x-real-ip' || key === 'x-memento-client-ip') delete request.headers[key];
  }
  request.headers['x-forwarded-for'] = ip;
  request.headers['x-forwarded-proto'] = secure ? 'https' : 'http';
  request.headers['x-forwarded-host'] = host;
  return { ip, peerIp, secure, host };
}

/** @template T @param {Network} network @param {() => T} action */
export function withNetwork(network, action) { return context.run(network, action); }

/** Count body bytes passed to Node, including streamed/compressed chunks, without
 * retaining their contents. Headers and HTTP framing are excluded.
 * @param {import('node:http').ServerResponse} response @param {string} [method] */
function responseSize(response, method) {
  let bytes = 0;
  for (const name of /** @type {const} */ (['write', 'end'])) {
    const original = response[name];
    /** @this {import('node:http').ServerResponse} @param {unknown[]} args */
    const measured = function (...args) {
      let length = 0;
      if (!this.writableEnded && !this.destroyed) {
        const chunk = args[0];
        if (typeof chunk === 'string') length = Buffer.byteLength(chunk,
          typeof args[1] === 'string' ? /** @type {BufferEncoding} */ (args[1]) : 'utf8');
        else if (chunk instanceof Uint8Array) length = chunk.byteLength;
      }
      bytes += length;
      try { return Reflect.apply(original, this, args); }
      catch (error) { bytes -= length; throw error; }
    };
    response[name] = measured;
  }
  return () => method === 'HEAD' || response.statusCode < 200 || [204, 304].includes(response.statusCode) ? 0 : bytes;
}

/** HTTP boundary shared by development and production; no listener is opened here.
 * @param {(request:import('node:http').IncomingMessage, response:import('node:http').ServerResponse) => Promise<unknown>} handle
 * @param {string|null} proxy */
export function networkHandler(handle, proxy) {
  /** @param {import('node:http').IncomingMessage} request @param {import('node:http').ServerResponse} response */
  return async (request, response) => {
    const context = newRequestContext(request.method, request.url);
    context.boundary = true;
    await requestContext.run(context, async () => {
      const started = performance.now();
      const health = context.route === '/api/health' && ['GET', 'HEAD'].includes(context.method);
      const durationMs = () => Math.round(performance.now() - started);
      let completed = false;
      let startedLogged = false;
      const responseBytes = responseSize(response, request.method);
      response.setHeader('X-Request-Id', context.requestId);
      // Log the actual response lifecycle, including streams and framework 404/500s.
      const finish = () => requestContext.run(context, () => {
        if (completed) return;
        completed = true;
        if (health && response.statusCode >= 200 && response.statusCode < 300) return;
        log(response.statusCode >= 500 ? 'error' : response.statusCode >= 400 ? 'warn' : 'info', 'request.completed',
          { status: response.statusCode, durationMs: durationMs(), responseBytes: responseBytes() });
      });
      const abort = () => requestContext.run(context, () => {
        if (completed) return;
        completed = true;
        log('warn', 'request.aborted', { durationMs: durationMs(), responseBytes: responseBytes() });
      });
      response.once('finish', finish);
      response.once('close', abort);
      request.once('aborted', abort);
      response.once('timeout', () => requestContext.run(context, () => log('warn', 'request.timeout', { durationMs: durationMs(), responseBytes: responseBytes() })));
      response.once('error', error => requestContext.run(context, () => log('error', 'request.failed', { error, durationMs: durationMs() })));
      try {
        context.peerIp = normalizeIp(request.socket.remoteAddress ?? '') ?? undefined;
        const network = prepareNetwork(request, proxy);
        Object.assign(context, { clientIp: network.ip, peerIp: network.peerIp, protocol: network.secure ? 'https' : 'http' });
        const length = request.headers['content-length'];
        if (!health) {
          log('info', 'request.started', { requestBytes: typeof length === 'string' && /^\d+$/.test(length) ? Number(length) : undefined });
          startedLogged = true;
        }
        await withNetwork(network, () => handle(request, response));
      } catch (error) {
        const status = error instanceof RepositoryError ? error.status : 500;
        if (!health && !startedLogged) log('info', 'request.started');
        log(status >= 500 ? 'error' : 'warn', 'request.failed', { status, error });
        if (response.headersSent) { response.destroy(); return; }
        response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: error instanceof RepositoryError ? error.message : 'No se pudo completar la solicitud.' }));
      }
    });
  };
}
