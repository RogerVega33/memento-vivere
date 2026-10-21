import { RepositoryError } from '../domain/errors.mjs';
import { networkContext } from './request-network.mjs';
import { LIMITS } from '../domain/memories.mjs';
import { ValidationError } from '../domain/errors.mjs';
import { log, newRequestContext, requestContext } from './logger.mjs';

// Limit simultaneous upload buffers, independently from the conversion slot.
const scope = /** @type {typeof globalThis & {mementoFormReader?:{busy:boolean}}} */ (globalThis);
const formReader = scope.mementoFormReader ??= { busy: false };

/** @param {unknown} data @param {number} [status] */
export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
}

/** @param {() => Promise<Response> | Response} action @param {Request} [request] */
export async function handle(action, request) {
  const context = requestContext.getStore() ?? newRequestContext(request?.method, request ? new URL(request.url).pathname : undefined);
  return requestContext.run(context, async () => {
    const started = performance.now();
    if (!context.boundary) log('info', 'request.started');
    let response;
    try { response = await action(); }
    catch (error) {
      if (error instanceof RepositoryError) {
        response = json({ error: error.message }, error.status);
        if ('retryAfter' in error && typeof error.retryAfter === 'number') response.headers.set('Retry-After', String(error.retryAfter));
      }
      else if (error instanceof ValidationError) response = json({ error: error.message }, 400);
      else response = json({ error: 'No se pudo completar la operación.' }, 500);
      log(response.status >= 500 ? 'error' : 'warn', 'request.failed', { status: response.status, error });
    }
    response.headers.set('X-Request-Id', context.requestId);
    if (!context.boundary) log('info', 'request.completed', { status: response.status, durationMs: Math.round(performance.now() - started) });
    return response;
  });
}

/** @param {Request} request */
export function requireSameOrigin(request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const network = networkContext();
  const allowedHosts = network ? [network.host] : [new URL(request.url).host, request.headers.get('host')];
  let originHost = null, originProtocol = null;
  if (origin) {
    try { const url = new URL(origin); originHost = url.host; originProtocol = url.protocol; }
    catch { throw new RepositoryError('La solicitud debe proceder de la propia aplicación.', 403); }
  }
  if (fetchSite === 'cross-site' || (originHost !== null && (!allowedHosts.includes(originHost)
    || (network && originProtocol !== (network.secure ? 'https:' : 'http:'))))) {
    throw new RepositoryError('La solicitud debe proceder de la propia aplicación.', 403);
  }
}

/** Parse client JSON without classifying unrelated SyntaxErrors as bad requests.
 * @param {string} text @returns {unknown} */
export function parseJson(text) {
  try { return JSON.parse(text); }
  catch (error) {
    if (error instanceof SyntaxError) throw new ValidationError('La solicitud no es válida.');
    throw error;
  }
}

/** @param {Request} request @param {number} maximum */
export async function readJson(request, maximum) {
  return parseJson(await (await boundedRequest(request, maximum)).text());
}

/** @param {Request} request */
export async function readFormData(request) {
  if (formReader.busy) throw new RepositoryError('Se está recibiendo otro recuerdo. Inténtalo de nuevo en un momento.', 429);
  formReader.busy = true;
  try {
    const body = await boundedRequest(request);
    try { return await body.formData(); }
    catch (error) {
      if (error instanceof TypeError) throw new ValidationError('El formulario del recuerdo no es válido.');
      throw error;
    }
  } finally { formReader.busy = false; }
}

/** Read a bounded stream before parsing; Content-Length alone is not trustworthy.
 * @param {Request} request @param {number} [maximum] */
export async function boundedRequest(request, maximum = LIMITS.requestBytes) {
  const declared = Number(request.headers.get('content-length'));
  if (declared > maximum) throw new RepositoryError('La selección de fotografías es demasiado grande. Añade menos imágenes a la vez.', 413);
  if (!request.body) throw new RepositoryError('La solicitud está vacía.', 400);
  const reader = request.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.byteLength;
    if (length > maximum) {
      await reader.cancel();
      throw new RepositoryError('La selección es demasiado grande. El recuerdo no se ha modificado.', 413);
    }
    chunks.push(next.value);
  }
  // Response copies a Uint8Array body again. A Blob snapshots the chunks once
  // and Response streams it, avoiding another upload-sized contiguous buffer.
  const body = new Blob(/** @type {BlobPart[]} */ (chunks));
  chunks.length = 0;
  return new Response(body, { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } });
}
