import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { ReadableStream } from 'node:stream/web';
import { boundedRequest, handle, json, parseJson, readFormData, readJson, requireSameOrigin } from '../src/server/http.mjs';
import { RepositoryError } from '../src/domain/errors.mjs';
import { ValidationError } from '../src/domain/errors.mjs';
import { validateMemory } from '../src/domain/memories.mjs';
import { log } from '../src/server/logger.mjs';
const url = 'http://localhost:3000/api/memories';
export const cases = [
  ['Request logs correlate concurrent operations without logging private bodies, headers or search terms', async () => {
    const entries = [];
    const logger = mock.method(console, 'info', entry => entries.push(JSON.parse(entry)));
    try {
      const requests = ['first', 'second'].map(label => new Request(`${url}?query=PRIVATE_QUERY_${label}`, {
        method: 'POST', headers: { authorization: 'PRIVATE_HEADER' }, body: 'PRIVATE_BODY',
      }));
      const responses = await Promise.all(requests.map((request, index) => handle(async () => {
        await new Promise(resolve => setImmediate(resolve));
        log('info', 'memory.photo.started', { photoIndex: index + 1 });
        return json({ ok: true });
      }, request)));
      assert.notEqual(responses[0].headers.get('X-Request-Id'), responses[1].headers.get('X-Request-Id'));
      for (const [index, response] of responses.entries()) {
        const requestId = response.headers.get('X-Request-Id');
        assert.equal(entries.find(entry => entry.event === 'memory.photo.started' && entry.photoIndex === index + 1).requestId, requestId);
        const completed = entries.find(entry => entry.event === 'request.completed' && entry.requestId === requestId);
        assert.equal(completed.status, 200);
        assert.equal(typeof completed.durationMs, 'number');
      }
      assert.doesNotMatch(JSON.stringify(entries), /PRIVATE_/);
    } finally { logger.mock.restore(); }
  }],
  ['The request reader preserves JSON without touching configuration files', async () => {
    const request = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"title":"Un momento"}' });
    assert.equal((await (await boundedRequest(request, 1024)).json()).title, 'Un momento');
  }],
  ['An oversized declared body is rejected before parsing', async () => {
    const request = new Request(url, { method: 'POST', headers: { 'Content-Length': '10000' }, body: 'data' });
    await assert.rejects(() => boundedRequest(request, 100), error => error.status === 413);
  }],
  ['Upload admission allows six 20 MiB photos plus form overhead and still rejects oversized requests', async () => {
    const photosBytes = 6 * 20 * 1024 * 1024;
    const form = new FormData();
    form.set('payload', '{"title":"Ficticio"}');
    // Synthetic declared lengths exercise admission without allocating 120 MiB.
    const allowed = new Request(url, { method: 'POST', body: form, headers: { 'Content-Length': String(photosBytes + 1024) } });
    assert.equal((await readFormData(allowed)).get('payload'), '{"title":"Ficticio"}');
    const excessive = new Request(url, { method: 'POST', body: form, headers: { 'Content-Length': String(photosBytes + 2 * 1024 * 1024) } });
    await assert.rejects(readFormData(excessive), { status: 413 });
  }],
  ['Chunked uploads cannot bypass the byte limit and their stream is cancelled', async () => {
    let cancelled = false;
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(6)); controller.enqueue(new Uint8Array(6)); }, cancel() { cancelled = true; } });
    const request = new Request(url, { method: 'POST', body, duplex: 'half' });
    await assert.rejects(() => boundedRequest(request, 10), error => error.status === 413); assert.equal(cancelled, true);
  }],
  ['An empty request fails with a validation status', async () => {
    await assert.rejects(() => boundedRequest(new Request(url, { method: 'POST' })), error => error.status === 400);
  }],
  ['Multipart files survive bounded parsing with their bytes unchanged', async () => {
    const boundary = 'memento-test-boundary';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n{"title":"Una foto"}\r\n--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="fictional.png"\r\nContent-Type: image/png\r\n\r\n\x01\x02\x03\r\n--${boundary}--\r\n`;
    const parsed = await (await boundedRequest(new Request(url, { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body }), 4096)).formData();
    assert.equal(parsed.get('payload'), '{"title":"Una foto"}'); assert.deepEqual(new Uint8Array(await parsed.get('photos').arrayBuffer()), new Uint8Array([1, 2, 3]));
  }],
  ['A six-photo multipart upload preserves every file when the bounded body is streamed from a Blob', async () => {
    const form = new FormData();
    form.set('payload', '{"title":"Recuerdo ficticio"}');
    const contents = Array.from({ length: 6 }, (_, index) => new Uint8Array(256 * 1024).fill(index + 1));
    contents.forEach((bytes, index) => form.append('photos', new File([bytes], `fictional-${index}.heic`, { type: 'image/heic' })));
    const parsed = await readFormData(new Request(url, { method: 'POST', body: form }));
    assert.equal(parsed.get('payload'), '{"title":"Recuerdo ficticio"}');
    const photos = parsed.getAll('photos');
    assert.equal(photos.length, 6);
    for (const [index, file] of photos.entries()) {
      assert.deepEqual(new Uint8Array(await file.arrayBuffer()), contents[index]);
    }
  }],
  ['Only one multipart body is buffered at a time and its slot is released before conversion', async () => {
    const form = new FormData();
    form.set('payload', '{"title":"Ficticio"}');
    const original = new Request(url, { method: 'POST', body: form });
    const bytes = new Uint8Array(await original.arrayBuffer());
    let controller;
    const stream = new ReadableStream({ start(value) { controller = value; } });
    const pending = readFormData(new Request(url, { method: 'POST', headers: original.headers, body: stream, duplex: 'half' }));
    try {
      await assert.rejects(readFormData(new Request(url, { method: 'POST', body: form })), { status: 429 });
    } finally { controller.enqueue(bytes); controller.close(); }
    assert.equal((await pending).get('payload'), '{"title":"Ficticio"}');
    assert.equal((await readFormData(new Request(url, { method: 'POST', body: form }))).get('payload'), '{"title":"Ficticio"}');
  }],
  ['Cross-site requests are rejected even when a host value matches', () => {
    assert.throws(() => requireSameOrigin(new Request(url, { headers: { origin: 'https://another.example', 'sec-fetch-site': 'cross-site' } })), error => error.status === 403);
    assert.throws(() => requireSameOrigin(new Request(url, { headers: { origin: 'http://localhost:3000', 'sec-fetch-site': 'cross-site' } })), error => error.status === 403);
  }],
  ['Same-host browser requests work directly and behind a TLS reverse proxy', () => {
    assert.doesNotThrow(() => requireSameOrigin(new Request(url, { headers: { origin: 'http://localhost:3000' } })));
    assert.doesNotThrow(() => requireSameOrigin(new Request(url, { headers: { origin: 'https://memento.example', host: 'memento.example' } })));
  }],
  ['HTTP errors retain conflict status and disable caching', async () => {
    const response = await handle(() => { throw new RepositoryError('Cambió en otro dispositivo.', 409); });
    assert.equal(response.status, 409); assert.equal((await response.json()).error, 'Cambió en otro dispositivo.'); assert.match(response.headers.get('cache-control'), /no-store/);
  }],
  ['Malformed JSON returns a useful validation error rather than a successful save', async () => {
    const response = await handle(() => { parseJson('invalid'); return json({ saved: true }); });
    assert.equal(response.status, 400); assert.equal((await response.json()).error, 'La solicitud no es válida.');
  }],
  ['Validation failures retain their user-facing messages and a 400 status', async () => {
    const response = await handle(() => { validateMemory({ title: '' }, '2000-01-01', '2026-10-20'); return json({ saved: true }); });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'Escribe un título para tu recuerdo.');
    assert.throws(() => parseJson('{'), ValidationError);
  }],
  ['Internal errors are logged but never disclosed or classified as invalid input', async () => {
    const logger = mock.method(console, 'error', () => {});
    try {
      for (const error of [new Error('detalle interno ficticio'), new TypeError('tipo interno ficticio'), new SyntaxError('sintaxis interna ficticia'), 'fallo inesperado ficticio']) {
        const response = await handle(() => { throw error; });
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { error: 'No se pudo completar la operación.' });
      }
      assert.equal(logger.mock.calls.length, 4);
    } finally { logger.mock.restore(); }
  }],
  ['Malformed JSON and multipart requests remain validation failures at the parsing boundary', async () => {
    const invalidJson = await handle(async () => json(await readJson(new Request(url, { method: 'POST', body: '{' }), 4096)));
    assert.equal(invalidJson.status, 400);
    const invalidForm = await handle(async () => { await readFormData(new Request(url, { method: 'POST', body: 'not a form' })); return json({ saved: true }); });
    assert.equal(invalidForm.status, 400);
    assert.deepEqual(await readJson(new Request(url, { method: 'POST', body: '{"version":1}' }), 4096), { version: 1 });
  }],
  ['Malformed origins are rejected rather than producing internal errors', () => {
    for (const origin of ['null', 'not-a-url']) assert.throws(() => requireSameOrigin(new Request(url, { headers: { origin } })), error => error.status === 403);
  }],
];
