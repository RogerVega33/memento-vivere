import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponent } from './component-render.mjs';

const route = name => loadComponent(`src/app/api/${name}/route.ts`);
const { auth } = loadComponent('src/server/store.ts');
const { sessionCookie, sessionToken } = loadComponent('src/server/auth-http.ts');
const { RepositoryError } = loadComponent('src/domain/errors.mjs');
const token = 'a'.repeat(43);
const cookie = `mv_session=${token}`;
const password = 'una contraseña ficticia de prueba';
const request = (path, method = 'GET', cookie = '', body, origin) => new Request(`http://localhost/api/${path}`, {
  method, headers: { cookie, ...(origin ? { origin } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const context = id => ({ params: Promise.resolve({ id }) });

test('every life endpoint requires authentication, including photos and writes', async () => {
  const previous = auth.authenticate;
  auth.authenticate = async () => null;
  try {
    for (const response of await Promise.all([
      route('state').GET(request('state')), route('profile').POST(request('profile', 'POST')),
      route('memories').GET(request('memories?month=2020-01')), route('memories').POST(request('memories', 'POST')),
      route('memories/[id]').PATCH(request('memories/a', 'PATCH'), context('a')),
      route('memories/[id]').DELETE(request('memories/a', 'DELETE'), context('a')),
      route('photos/[id]').GET(request('photos/a'), context('a')),
    ])) assert.equal(response.status, 401);
    assert.deepEqual(await (await route('auth/session').GET(request('auth/session'))).json(), { user: null });
  } finally { auth.authenticate = previous; }
});

test('auth routes forward credentials and the previous token but expose only public fields', async () => {
  const previous = { ...auth };
  const user = { id: 'fictional-user', username: 'Alice' };
  const phrase = 'acorn baker cabin dance eager fable giant habit';
  try {
    for (const action of ['register', 'login', 'recover']) {
      const input = { username: user.username, password, ...(action === 'recover' ? { recoveryPhrase: phrase } : {}) };
      let calls = 0;
      auth[action] = async (value, oldToken) => {
        calls++; assert.deepEqual(value, input); assert.equal(oldToken, token);
        return { user, token, ...(action === 'login' ? {} : { recoveryPhrase: phrase }) };
      };
      const response = await route(`auth/${action}`).POST(request(`auth/${action}`, 'POST', cookie, input));
      assert.equal(response.status, action === 'register' ? 201 : 200);
      assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=604800/);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.deepEqual(await response.json(), { user, ...(action === 'login' ? {} : { recoveryPhrase: phrase }) });
      assert.equal((await route(`auth/${action}`).POST(request(`auth/${action}`, 'POST', cookie, input, 'https://evil.test'))).status, 403);
      assert.equal(calls, 1);
    }
  } finally { Object.assign(auth, previous); }
});

test('session cookies reject duplicates and malformed tokens and use Secure for HTTPS', () => {
  assert.equal(sessionToken(request('state', 'GET', 'mv_session=invalid')), null);
  assert.equal(sessionToken(request('state', 'GET', `${cookie}; ${cookie}`)), null);
  assert.match(sessionCookie(new Request('https://localhost'), token), /; Secure$/);
});

test('password changes reject cross-origin and stale-account requests before writing', async () => {
  const previous = { ...auth };
  const user = { id: 'fictional-user', username: 'Alice' };
  const input = { currentPassword: password, newPassword: password };
  let changes = 0;
  auth.authenticate = async () => ({ user, repository: {} });
  auth.changePassword = async (value, received) => {
    changes++; assert.deepEqual(value, input); assert.equal(received, token); return user;
  };
  try {
    const endpoint = route('auth/password');
    assert.equal((await endpoint.POST(request('auth/password', 'POST', cookie, input, 'https://evil.test'))).status, 403);
    const stale = request('auth/password', 'POST', cookie, input);
    stale.headers.set('X-Memento-User', 'other-account');
    assert.equal((await endpoint.POST(stale)).status, 401);
    assert.equal(changes, 0);
    const changed = await endpoint.POST(request('auth/password', 'POST', cookie, input));
    assert.equal(changed.status, 200);
    assert.deepEqual(await changed.json(), { user });
    assert.equal(changed.headers.has('set-cookie'), false);
    assert.equal(changes, 1);
    auth.changePassword = async () => { throw new RepositoryError('La contraseña actual no es correcta.', 400); };
    assert.equal((await endpoint.POST(request('auth/password', 'POST', cookie, input))).status, 400);
  } finally { Object.assign(auth, previous); }
});
