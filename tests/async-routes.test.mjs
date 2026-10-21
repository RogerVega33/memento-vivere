import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponent } from './component-render.mjs';
const { auth, authLimits } = loadComponent('src/server/store.ts');
const { AuthLimitError } = loadComponent('src/server/auth-rate-limit.ts');
const route = name => loadComponent(`src/app/api/${name}/route.ts`);
const context = id => ({ params: Promise.resolve({ id }) });

test('life routes await asynchronous repositories and forward the authenticated request', async () => {
  const original = { ...auth };
  const calls = [];
  const user = { id: 'fictional-user', username: 'Alice' };
  const profile = { birthDate: '2000-01-01', horizonYears: 80, createdAt: '2026-10-20T00:00:00Z' };
  const memory = { id: 'fictional-memory', title: 'Recuerdo', description: '', tags: [], photoIds: [],
    year: 2020, month: 1, day: null, precision: 'MONTH', version: 1,
    createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' };
  const snapshot = { profile, today: '2026-10-20', memoryCount: 1, photoCount: 0, monthCounts: { '2020-01': 1 } };
  const stub = (name, value) => async (...args) => { await Promise.resolve(); calls.push([name, ...args]); return value; };
  const repository = { setup: stub('setup', profile), requireProfile: stub('requireProfile', profile),
    snapshot: stub('snapshot', snapshot), listMonth: stub('listMonth', [memory]), save: stub('save', memory),
    delete: stub('delete'), getPhoto: stub('getPhoto', { data: new Uint8Array([1, 2]), width: 1, height: 2 }) };
  auth.authenticate = stub('authenticate', { user, repository });
  auth.logout = stub('logout');
  const request = (path, method = 'GET', body) => new Request(`http://localhost/api/${path}`, {
    method, headers: { cookie: `mv_session=${'a'.repeat(43)}`, ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
  const form = payload => { const value = new FormData(); value.set('payload', JSON.stringify(payload)); return value; };
  try {
    assert.deepEqual(await (await route('auth/session').GET(request('auth/session'))).json(), { user });
    assert.deepEqual(await (await route('state').GET(request('state'))).json(), snapshot);
    assert.equal((await route('profile').POST(request('profile', 'POST', { birthDate: profile.birthDate }))).status, 201);
    assert.deepEqual(calls.find(call => call[0] === 'setup').slice(1, 2), [profile.birthDate]);
    assert.deepEqual(await (await route('memories').GET(request('memories?month=2020-01'))).json(), [memory]);
    const draft = { title: memory.title, year: 2020, month: 1, day: null };
    assert.equal((await route('memories').POST(request('memories', 'POST', form(draft)))).status, 201);
    assert.equal(calls.find(call => call[0] === 'save')[1].draft.title, memory.title);
    assert.equal((await route('memories/[id]').PATCH(request('memories/fictional-memory', 'PATCH', form({ ...draft, version: 1 })), context(memory.id))).status, 200);
    const photo = await route('photos/[id]').GET(request('photos/fictional-photo'), context('fictional-photo'));
    assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), new Uint8Array([1, 2]));
    assert.equal((await route('memories/[id]').DELETE(request('memories/fictional-memory', 'DELETE', { version: 1 }), context(memory.id))).status, 200);
    assert.deepEqual(calls.find(call => call[0] === 'delete').slice(1, 3), [memory.id, 1]);
    assert.equal((await route('auth/logout').POST(request('auth/logout', 'POST'))).status, 200);
    assert(calls.some(call => call[0] === 'logout' && call[1] === 'a'.repeat(43)));
  } finally { Object.assign(auth, original); }
});

test('auth routes limit before reading an invalid body and return Retry-After', async () => {
  const previous = authLimits.ip;
  authLimits.ip = () => { throw new AuthLimitError(42); };
  try {
    for (const name of ['login', 'register', 'recover', 'password']) {
      const response = await route(`auth/${name}`).POST(new Request(`http://localhost/api/auth/${name}`, { method: 'POST', body: '{' }));
      assert.equal(response.status, 429);
      assert.equal(response.headers.get('retry-after'), '42');
    }
  } finally { authLimits.ip = previous; }
});

test('profile API rejects old birth years before invoking storage setup', async () => {
  const { minimumBirthDate, todayInZone } = loadComponent('src/domain/dates.mjs');
  const original = auth.authenticate;
  const calls = [];
  const today = todayInZone();
  const minimum = minimumBirthDate(today);
  const repository = { setup: async value => { calls.push(value); }, snapshot: async () => ({ profile: null, today }) };
  let authentications = 0;
  auth.authenticate = async () => { authentications++; return { user: { id: 'fictional-user', username: 'ficticio' }, repository }; };
  const request = birthDate => new Request('http://localhost/api/profile', {
    method: 'POST', headers: { cookie: `mv_session=${'a'.repeat(43)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ birthDate }),
  });
  try {
    for (const value of ['1000-01-01', `${Number(minimum.slice(0, 4)) - 1}-12-31`]) {
      const response = await route('profile').POST(request(value));
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, new RegExp(minimum.slice(0, 4)));
    }
    assert.deepEqual(calls, []);
    for (const value of [minimum, today]) {
      assert.equal((await route('profile').POST(request(value))).status, 201);
    }
    assert.deepEqual(calls, [minimum, today]);
    assert.equal(authentications, 4, 'authenticate once per request');
  } finally { auth.authenticate = original; }
});
