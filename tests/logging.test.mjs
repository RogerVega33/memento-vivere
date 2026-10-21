import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { errorDetails, installConsoleLogging, log, logRoute, newRequestContext, requestContext } from '../src/server/logger.mjs';
import { networkHandler } from '../src/server/request-network.mjs';
import { handle, json } from '../src/server/http.mjs';
import { RepositoryError } from '../src/domain/errors.mjs';
import { runHeicDecoder } from '../src/server/native-heic.mjs';
import { registerFatalLogging } from '../src/server/startup.mjs';
import { EventEmitter, once } from 'node:events';
import { gzipSync, gunzipSync } from 'node:zlib';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import compression from 'next/dist/compiled/compression/index.js';
import { HttpResponse, incoming } from './http-fixtures.mjs';
import { loadComponent } from './component-render.mjs';

const secret = 'PRIVATE_password_token_recovery_memory_filename';
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
async function capture(action) {
  const entries = [];
  const mocks = ['info', 'warn', 'error'].map(level => mock.method(console, level, entry => entries.push(JSON.parse(entry))));
  try { await action(entries); assert(!JSON.stringify(entries).includes(secret)); }
  finally { for (const mocked of mocks) mocked.mock.restore(); }
}

test('logging allows only known events, routes and diagnostics, never arbitrary data or error text', () => capture(async entries => {
  const error = Object.assign(new Error(secret, { cause: new Error(secret) }), {
    name: secret, stack: secret, code: '23505', detail: secret, query: secret,
  });
  log('error', 'request.failed', {
    error, status: 409, method: 'POST', route: `/api/memories/${secret}?query=${secret}`,
    password: secret, recoveryPhrase: secret, body: { password: secret }, response: { token: secret },
    headers: { cookie: secret }, filename: secret, diagnostic: secret,
    event: secret, message: secret, requestId: secret, timestamp: secret,
  });
  assert.deepEqual(entries[0].error, { name: 'DatabaseError', code: '23505' });
  assert.equal(entries[0].route, '/api/memories/:id');
  assert.equal(entries[0].status, 409);
  assert.equal(entries[0].event, 'request.failed');
  assert.equal(entries[0].requestId, undefined);
  log('warn', secret, { route: secret, status: 401, username: secret });
  assert.equal(entries[1].event, 'framework.log');
  assert.equal(entries[1].status, undefined);
  log('warn', 'request.failed', { method: secret, route: `/${secret}`, durationMs: NaN, status: 1000, signal: secret });
  assert.equal(entries[2].route, 'unmatched');
  assert.equal(entries[2].method, 'OTHER');
  assert.equal(entries[2].status, undefined);
  assert.equal(entries[2].durationMs, undefined);
  assert.equal(entries[2].signal, undefined);
}));

test('error sanitization ignores custom names, codes, causes and getters', () => capture(async entries => {
  let accessed = false;
  const error = new TypeError(secret);
  Object.defineProperty(error, 'code', { get() { accessed = true; throw new Error(secret); } });
  Object.defineProperty(error, 'name', { get() { accessed = true; throw new Error(secret); } });
  const fields = { error };
  Object.defineProperty(fields, 'route', { get() { accessed = true; throw new Error(secret); } });
  log('error', 'request.failed', fields);
  assert.deepEqual(entries[0].error, { name: 'TypeError' });
  assert.equal(accessed, false);
  assert.deepEqual(errorDetails(Object.assign(new Error(secret), { code: secret })), { name: 'Error' });
  assert.deepEqual(errorDetails(secret), { name: 'UnknownError' });
}));

test('request and streamed response share one ID across Next module compilation and concurrent requests', () => capture(async entries => {
  const { log: compiledLog, requestContext: compiledContext } = loadComponent('src/server/logger.mjs');
  const responses = await Promise.all([1, 2].map(async index => {
    const response = new HttpResponse();
    await networkHandler(async () => {
      assert.equal(requestContext.getStore(), compiledContext.getStore());
      await new Promise(resolve => setImmediate(resolve));
      compiledLog('info', 'memory.photo.started', { photoIndex: index });
      const result = await handle(() => json({ password: secret, token: secret }));
      assert.equal(result.headers.get('X-Request-Id'), response.getHeader('X-Request-Id'));
      response.setHeader('set-cookie', secret);
      response.setHeader('content-length', '123');
      response.statusCode = 201;
      // Route completion is not response completion; the stream is still open.
      assert(!entries.some(entry => entry.event === 'request.completed' && entry.requestId === response.getHeader('X-Request-Id')));
    }, null)(incoming('203.0.113.5', { 'x-request-id': secret, authorization: secret, 'content-length': '42' },
      `/api/memories/${secret}?q=${secret}`, 'POST'), response);
    response.end(secret);
    return response;
  }));
  assert.notEqual(responses[0].getHeader('X-Request-Id'), responses[1].getHeader('X-Request-Id'));
  for (const [index, response] of responses.entries()) {
    const requestId = response.getHeader('X-Request-Id');
    assert.match(requestId, uuid);
    const records = entries.filter(entry => entry.requestId === requestId);
    assert.equal(records.filter(entry => entry.event === 'request.started').length, 1);
    const completed = records.filter(entry => entry.event === 'request.completed');
    assert.equal(completed.length, 1);
    assert.equal(completed[0].status, 201);
    assert.equal(completed[0].responseBytes, Buffer.byteLength(secret));
    assert.equal(records.find(entry => entry.event === 'request.started').requestBytes, 42);
    assert.equal(records.find(entry => entry.event === 'memory.photo.started').photoIndex, index + 1);
    assert(records.every(entry => entry.route === '/api/memories/:id' && entry.method === 'POST'));
  }
  assert.equal(requestContext.getStore(), undefined);
}));

test('response sizes count multibyte strings, encodings and binary streams without changing callbacks or backpressure', () => capture(async entries => {
  const response = new HttpResponse();
  let callbacks = 0;
  response.write = function (chunk, callback) { callback?.(); return false; };
  await networkHandler(async () => {
    assert.equal(response.write('á🦋', () => callbacks++), false);
    assert.equal(response.write(Buffer.from([0, 1, 255]), () => callbacks++), false);
    assert.equal(response.end('é', 'latin1', () => callbacks++), response);
  }, null)(incoming('203.0.113.5', {}, '/api/state'), response);
  assert.equal(callbacks, 3);
  assert.equal(entries.find(entry => entry.event === 'request.completed').responseBytes, 10);
}));

test('compressed response sizes use the body written to Node, not the declared Content-Length or original JSON', () => capture(async entries => {
  const response = new HttpResponse();
  const compressed = gzipSync(JSON.stringify({ private: secret.repeat(100) }));
  await networkHandler(async () => {
    response.setHeader('content-encoding', 'gzip');
    response.setHeader('content-length', '999999');
    response.write(compressed.subarray(0, 10));
    response.end(compressed.subarray(10));
  }, null)(incoming('203.0.113.5', {}, '/api/state'), response);
  assert.equal(entries.find(entry => entry.event === 'request.completed').responseBytes, compressed.byteLength);
}));

test('native Node responses and Next compression count body bytes without HTTP headers or chunk framing', () => capture(async entries => {
  const payload = JSON.stringify({ private: secret.repeat(100) });
  for (const compressed of [false, true]) {
    const wire = [];
    // In-memory stream only: no network listener or user database is used.
    const socket = Object.assign(new Duplex({ read() {}, write(chunk, encoding, callback) {
      wire.push(Buffer.from(chunk)); callback();
    } }), { remoteAddress: '203.0.113.5' });
    try {
      const request = new IncomingMessage(socket);
      request.method = 'GET'; request.url = '/api/state';
      request.httpVersionMajor = 1; request.httpVersionMinor = 1;
      request.headers = { host: 'internal:3000', 'accept-encoding': compressed ? 'gzip' : 'identity' };
      const response = new ServerResponse(request);
      response.assignSocket(socket);
      const finished = once(response, 'finish');
      await networkHandler(async (req, res) => {
        if (compressed) await new Promise((resolve, reject) => compression()(req, res, error => error ? reject(error) : resolve()));
        res.setHeader('content-type', 'application/json');
        if (!compressed) res.setHeader('content-length', Buffer.byteLength(payload));
        res.end(payload);
      }, null)(request, response);
      await finished;
      const raw = Buffer.concat(wire);
      const start = raw.indexOf('\r\n\r\n') + 4;
      const headers = raw.subarray(0, start).toString();
      let body = raw.subarray(start);
      if (/transfer-encoding: chunked/i.test(headers)) {
        const chunks = [];
        let cursor = start;
        while (true) {
          const end = raw.indexOf('\r\n', cursor);
          const size = parseInt(raw.subarray(cursor, end).toString(), 16);
          assert(Number.isSafeInteger(size) && size >= 0);
          if (!size) break;
          cursor = end + 2;
          chunks.push(raw.subarray(cursor, cursor + size));
          cursor += size + 2;
        }
        body = Buffer.concat(chunks);
      }
      const completion = entries.find(entry => entry.event === 'request.completed'
        && entry.requestId === response.getHeader('X-Request-Id'));
      assert.equal(completion.responseBytes, body.byteLength);
      assert.equal((compressed ? gunzipSync(body) : body).toString(), payload);
      if (compressed) assert(body.byteLength < Buffer.byteLength(payload));
    } finally { socket.destroy(); }
  }
}));

test('HEAD, 204, 304 and empty responses log zero body bytes even when Content-Length describes a representation', () => capture(async entries => {
  for (const [method, status] of [['HEAD', 200], ['GET', 204], ['GET', 304], ['GET', 200]]) {
    const response = new HttpResponse();
    await networkHandler(async () => {
      response.statusCode = status;
      response.setHeader('content-length', '12345');
      if (method === 'HEAD' || status !== 200) response.end(secret);
      else response.end();
    }, null)(incoming('203.0.113.5', {}, '/api/state', method), response);
    const completion = entries.find(entry => entry.event === 'request.completed' && entry.requestId === response.getHeader('X-Request-Id'));
    assert.equal(completion.responseBytes, 0);
  }
}));

test('interrupted streams report only bytes already written and never a completed response', () => capture(async entries => {
  const response = new HttpResponse();
  await networkHandler(async () => { response.write(new Uint8Array(17)); response.destroy(); }, null)(
    incoming('203.0.113.5', {}, '/api/photos/private'), response);
  assert.equal(entries.find(entry => entry.event === 'request.aborted').responseBytes, 17);
  assert(!entries.some(entry => entry.event === 'request.completed'));
}));

test('framework 404/500 and route conflicts are logged with the actual response status', () => capture(async entries => {
  for (const status of [404, 409, 429, 500]) {
    const response = new HttpResponse();
    await networkHandler(async () => {
      if (status === 409 || status === 429) {
        const result = await handle(() => { throw new RepositoryError(secret, status); });
        response.statusCode = result.status;
      } else response.statusCode = status;
      response.end(secret);
    }, null)(incoming('203.0.113.5', {}, `/${secret}`), response);
    const completed = entries.find(entry => entry.event === 'request.completed' && entry.requestId === response.getHeader('X-Request-Id'));
    assert.equal(completed.status, status);
    assert.equal(completed.route, 'unmatched');
    assert.equal(completed.level, status === 500 ? 'error' : 'warn');
  }
}));

test('invalid proxy claims and uncaught handler failures have safe diagnostics and a response ID', () => capture(async entries => {
  for (const invalidProxy of [true, false]) {
    const response = new HttpResponse();
    await networkHandler(async () => { throw Object.assign(new Error(secret), { code: 'ECONNRESET' }); }, '192.0.2.10')(
      incoming('192.0.2.10', { 'x-forwarded-for': invalidProxy ? secret : '198.51.100.2' }, `/api/auth/login?user=${secret}`, 'POST'), response);
    assert.equal(response.statusCode, invalidProxy ? 400 : 500);
    assert.match(response.getHeader('X-Request-Id'), uuid);
    const failure = entries.find(entry => entry.event === 'request.failed' && entry.requestId === response.getHeader('X-Request-Id'));
    assert.equal(failure.status, response.statusCode);
    if (!invalidProxy) {
      assert.equal(failure.error.code, 'ECONNRESET');
      assert.equal(failure.peerIp, '192.0.2.10');
      assert.equal(failure.clientIp, '198.51.100.2');
    }
  }
}));

test('aborted and timed-out responses retain their context without a false completion', () => capture(async entries => {
  for (const afterHeaders of [false, true]) {
    const request = incoming('203.0.113.5', {}, '/api/photos/private');
    const response = new HttpResponse();
    await networkHandler(async () => {
      if (afterHeaders) { response.writeHead(200); throw new Error(secret); }
    }, null)(request, response);
    if (!afterHeaders) { response.emit('timeout'); request.emit('aborted'); response.emit('close'); }
    const records = entries.filter(entry => entry.requestId === response.getHeader('X-Request-Id'));
    assert.equal(records.filter(entry => entry.event === 'request.aborted').length, 1);
    assert(!records.some(entry => entry.event === 'request.completed'));
    if (!afterHeaders) assert(records.some(entry => entry.event === 'request.timeout'));
    else assert.equal(response.destroyed, true);
  }
}));

test('successful health checks are quiet but failing checks retain diagnostics', () => capture(async entries => {
  for (const status of [200, 503]) {
    const response = new HttpResponse();
    await networkHandler(async () => { response.statusCode = status; response.end(); }, null)(incoming('203.0.113.5', {}, '/api/health'), response);
    assert.match(response.getHeader('X-Request-Id'), uuid);
    assert.equal(entries.filter(entry => entry.requestId === response.getHeader('X-Request-Id')).length, status === 200 ? 0 : 1);
  }
  assert.equal(entries[0].status, 503);
}));

test('runtime console output follows the same privacy policy, including bundled modules', () => capture(async entries => {
  const restore = installConsoleLogging();
  try {
    const context = newRequestContext('GET', '/');
    requestContext.run(context, () => {
      console.error(secret, Object.assign(new Error(secret), { code: 'ECONNRESET' }));
      console.warn({ event: 'request.failed', password: secret });
      console.dir({ token: secret });
      loadComponent('src/server/logger.mjs').log('info', 'memory.save.started', { operation: 'create', body: secret });
    });
    assert.equal(entries.length, 4);
    assert.equal(entries[0].error.code, 'ECONNRESET');
    assert.equal(entries[3].event, 'memory.save.started');
    assert(entries.every(entry => entry.requestId === context.requestId));
  } finally { restore(); }
}));

test('Next instrumentation records framework errors without logging request headers or raw paths', () => capture(async entries => {
  const previous = process.env.NEXT_RUNTIME;
  process.env.NEXT_RUNTIME = 'nodejs';
  try {
    const { onRequestError } = loadComponent('src/instrumentation.ts');
    const context = newRequestContext('GET', '/');
    await requestContext.run(context, () => onRequestError(new TypeError(secret),
      { method: 'GET', path: `/${secret}`, headers: { cookie: secret } },
      { routePath: `/${secret}`, routeType: 'render' }));
    assert.equal(entries[0].event, 'framework.error');
    assert.equal(entries[0].requestId, context.requestId);
    assert.deepEqual(entries[0].error, { name: 'TypeError' });
    assert.equal(entries[0].routeType, 'render');
  } finally {
    if (previous === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = previous;
  }
}));

test('Node warnings cannot print private text through the runtime console', () => capture(async entries => {
  const restore = installConsoleLogging();
  try {
    process.emitWarning(new Error(secret));
    await new Promise(resolve => setImmediate(resolve));
    assert(entries.some(entry => entry.event === 'framework.log'));
  } finally { restore(); }
}));

test('fatal handlers sanitize failures and request exit instead of continuing a broken process', () => capture(async entries => {
  const exits = [];
  const processDouble = Object.assign(new EventEmitter(), { exit: code => exits.push(code) });
  registerFatalLogging(processDouble);
  processDouble.emit('uncaughtException', new TypeError(secret), 'uncaughtException');
  processDouble.emit('unhandledRejection', Object.assign(new Error(secret), { code: 'ECONNRESET' }));
  assert.deepEqual(exits, [1, 1]);
  assert.equal(entries[0].event, 'server.crashed');
  assert.equal(entries[0].origin, 'uncaughtException');
  assert.equal(entries[0].error.name, 'TypeError');
  assert.equal(entries[1].origin, 'unhandledRejection');
  assert.equal(entries[1].error.code, 'ECONNRESET');
}));

test('native decoder failures keep useful categories but never stderr, paths or metadata', () => capture(async entries => {
  await assert.rejects(runHeicDecoder(`/tmp/${secret}`, `/tmp/${secret}.png`, { execute: async () => {
    throw Object.assign(new Error(secret), { code: 1, stderr: `out of memory ${secret}`, signal: 'SIGABRT' });
  } }), { status: 503 });
  const failure = entries.find(entry => entry.event === 'heic.decode.failed');
  assert.equal(failure.reason, 'resource');
  assert.equal(failure.code, 1);
  assert.equal(failure.signal, 'SIGABRT');
  assert.equal(failure.diagnostic, undefined);
}));

test('transaction retries and rollback failures use safe diagnostics and preserve the original error', () => capture(async entries => {
  const { Database } = loadComponent('src/server/postgres/database.ts');
  let calls = 0;
  const failure = Object.assign(new Error(secret), { code: '40001' });
  const client = { async query() {}, release() {} };
  const db = new Database({ async connect() { return client; } });
  await db.transaction(async () => { if (++calls === 1) throw failure; });
  assert.equal(entries[0].event, 'database.transaction_retry');
  assert.equal(entries[0].error.code, '40001');
  assert.equal(entries[0].attempt, 1);
  client.query = async sql => { if (sql === 'ROLLBACK') throw Object.assign(new Error(secret), { code: 'ECONNRESET' }); };
  await assert.rejects(db.transaction(async () => { throw failure; }), error => error === failure);
  assert.equal(entries[1].event, 'database.rollback_failed');
  assert.equal(entries[1].error.code, 'ECONNRESET');
}));

test('known route templates never fall back to user paths', () => {
  for (const path of [`/${secret}`, `/api/memories/${secret}/extra`, `/api/auth/${secret}`]) assert.equal(logRoute(path), 'unmatched');
  assert.equal(logRoute('/api/auth/login?q=private'), '/api/auth/login');
  assert.equal(logRoute('/_next/static/private.js'), '/_next/*');
});
