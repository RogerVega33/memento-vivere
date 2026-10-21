import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const template = await readFile(new URL('../pwa/service-worker.js', import.meta.url), 'utf8');
const assets = ['/', '/_next/static/chunks/app.js', '/_next/static/chunks/app.css', '/pwa-192.png'];
const cacheName = 'memento-vivere-static-ficticio';
function fixture() {
    const events = new Map();
    const cached = new Map();
    const added = [];
    const deleted = [];
    let claims = 0;
    let skips = 0;
    let network = async (_request) => new Response('red ficticia');
    const cache = {
        async addAll(requests) { added.push(...requests); },
        async match(path) { return cached.get(path)?.clone(); },
    };
    vm.runInNewContext(template.replace('__PWA_CONFIG__', JSON.stringify({ version: cacheName, cacheName, assets })), {
        self: {
            location: { origin: 'https://example.test' },
            addEventListener: (type, listener) => events.set(type, listener),
            clients: { claim: async () => { claims++; } },
            skipWaiting: async () => { skips++; },
        },
        caches: {
            open: async (name) => { assert.equal(name, cacheName); return cache; },
            keys: async () => [cacheName, 'memento-vivere-static-viejo', 'otra-aplicacion'],
            delete: async (name) => { deleted.push(name); return true; },
        },
        fetch: (request) => network(request), URL, Response,
        Request: class extends Request {
            constructor(path, options) { super(new URL(path, 'https://example.test'), options); }
        },
    });
    async function lifecycle(type, data, ports = []) {
        const pending = [];
        events.get(type)({ data, ports, waitUntil: (task) => pending.push(task) });
        await Promise.all(pending);
    }
    function request(path, mode = 'cors', method = 'GET') {
        let response;
        events.get('fetch')({ request: { url: new URL(path, 'https://example.test').href, mode, method, headers: new Headers() }, respondWith: (task) => { response = task; } });
        return response;
    }
    return { events, cached, added, deleted, lifecycle, request, claims: () => claims, skips: () => skips,
        setNetwork: (callback) => { network = callback; } };
}
test('el worker instala solo recursos públicos y no activa una actualización sin consentimiento', async () => {
    const worker = fixture();
    await worker.lifecycle('install');
    assert.deepEqual(worker.added.map(request => new URL(request.url).pathname), assets);
    assert.ok(worker.added.every(request => request.cache === 'reload' && request.credentials === 'omit'));
    assert.equal(worker.skips(), 0);
    assert.deepEqual([...worker.events.keys()], ['install', 'activate', 'message', 'fetch']);
    await worker.lifecycle('message', { type: 'otro-mensaje' });
    assert.equal(worker.skips(), 0);
    await worker.lifecycle('message', { type: 'SKIP_WAITING' });
    assert.equal(worker.skips(), 1);
});
test('activar limpia únicamente las versiones anteriores de esta app', async () => {
    const worker = fixture();
    await worker.lifecycle('activate');
    assert.deepEqual(worker.deleted, ['memento-vivere-static-viejo']);
    assert.equal(worker.claims(), 1);
});
test('el worker informa su versión mediante el puerto privado sin activar una actualización', async () => {
    const worker = fixture();
    const replies = [];
    await worker.lifecycle('message', { type: 'GET_VERSION' }, [{ postMessage: (value) => replies.push(value) }]);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].version, cacheName);
    assert.equal(worker.skips(), 0);
    await worker.lifecycle('message', { type: 'GET_VERSION' });
});
test('autenticación, datos privados, escrituras, recursos ajenos y archivos desconocidos pasan directamente a la red', () => {
    const worker = fixture();
    for (const path of ['/api', '/api/auth/session', '/api/memories', '/api/memories/libro/cover?v=1', '/api/profile', 'https://other.test/_next/static/chunks/app.js', '/archivo-desconocido.js', '/sw.js']) {
        assert.equal(worker.request(path), undefined, path);
    }
    assert.equal(worker.request('/api/memories', 'navigate'), undefined);
    assert.equal(worker.request('/', 'cors', 'POST'), undefined);
    assert.equal(worker.cached.size, 0);
});
test('una navegación sin red recupera la interfaz conservando las URL de la aplicación, sin emitir mensajes', async () => {
    const worker = fixture();
    worker.cached.set('/', new Response('interfaz pública ficticia'));
    worker.setNetwork(async () => { throw new TypeError('Sin red ficticia'); });
    for (const path of ['/', '/?view=login', '/?view=register', '/?view=recover']) {
        const response = await worker.request(path, 'navigate');
        assert.equal(await response.text(), 'interfaz pública ficticia');
    }
    assert.equal(worker.cached.size, 1);
    const empty = fixture();
    empty.setNetwork(async () => { throw new TypeError('Sin red ficticia'); });
    assert.equal((await empty.request('/', 'navigate')).type, 'error');
});
test('la navegación intenta primero la red y los archivos de interfaz se recuperan de la caché', async () => {
    const worker = fixture();
    worker.cached.set('/', new Response('interfaz anterior'));
    assert.equal(await (await worker.request('/?month=2026-10', 'navigate')).text(), 'red ficticia');
    worker.cached.set('/_next/static/chunks/app.js', new Response('script ficticio'));
    worker.setNetwork(async () => { assert.fail('Un archivo precargado debe abrirse sin red.'); });
    assert.equal(await (await worker.request('/_next/static/chunks/app.js')).text(), 'script ficticio');
});

test('requests for React Server Components never receive cached HTML', () => {
    const worker = fixture();
    for (const path of ['/?_rsc=ficticio', '/?query=PRIVATE', '/manifest.webmanifest']) {
        let intercepted = false;
        worker.events.get('fetch')({ request: {
            url: new URL(path, 'https://example.test').href,
            method: 'GET', mode: 'cors', headers: new Headers({ RSC: '1' }),
        }, respondWith() { intercepted = true; } });
        assert.equal(intercepted, false);
    }
    assert.equal(worker.request('/?_rsc=ficticio'), undefined);
});
