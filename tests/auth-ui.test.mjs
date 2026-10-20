import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './component-render.mjs';

const { AuthView, RecoveryWords } = loadComponent('src/components/auth-view.tsx');
const { api, setApiUser } = loadComponent('src/components/api.ts');
const { AccountMenu } = loadComponent('src/components/account-menu.tsx');
const { ChangePasswordDialog } = loadComponent('src/components/change-password-dialog.tsx');
const { Onboarding } = loadComponent('src/components/onboarding.tsx');

test('persistent storage screens do not claim data will disappear on a server restart', () => {
  const auth = renderToStaticMarkup(createElement(AuthView, { onAuthenticated() {}, notice: '' }));
  const setup = renderToStaticMarkup(createElement(Onboarding, { today: '2026-10-20', onSetup() {} }));
  assert.doesNotMatch(auth + setup, /perderán al reiniciar/);
});

test('the closed account menu shows only an initial and exposes its user through the accessible label', () => {
  const html = renderToStaticMarkup(createElement(AccountMenu, { user: { id: 'fake', username: 'roger' }, onLogout() {}, busy: false }));
  assert.match(html, /aria-label="Menú de la cuenta de roger"/);
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /<span aria-hidden="true">R<\/span>/);
  assert.doesNotMatch(html, /Cambiar contraseña|Cerrar sesión|>roger</);
});

test('password changes require current, new and confirmed passwords and describe session behavior', () => {
  const html = renderToStaticMarkup(createElement(ChangePasswordDialog, { onClose() {}, onSaved() {} }));
  assert.equal((html.match(/type="password"/g) ?? []).length, 3);
  assert.match(html, /Contraseña actual/);
  assert.match(html, /Confirmar nueva contraseña/);
  assert.match(html, /Las demás sesiones se cerrarán/);
  assert.match(html, /Tus palabras de recuperación seguirán siendo las mismas/);
});

test('the access screen uses a password field and an explicit recovery path', () => {
  const html = renderToStaticMarkup(createElement(AuthView, { onAuthenticated() {}, notice: '' }));
  assert.match(html, /Inicia sesión/);
  assert.match(html, /autoComplete="username"/);
  assert.match(html, /type="password"/);
  assert.match(html, /autoComplete="current-password"/);
  assert.match(html, /¿Olvidaste tu contraseña\?/);
});

test('life requests carry the displayed account identity and preserve existing headers', async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (path, options) => { sent.push({ path, headers: options.headers }); return Response.json({}); };
  try {
    setApiUser('fictional-account');
    await api('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await api('/api/auth/session');
    await api('/api/auth/password', { method: 'POST' });
    assert.equal(sent[0].headers.get('X-Memento-User'), 'fictional-account');
    assert.equal(sent[0].headers.get('Content-Type'), 'application/json');
    assert.equal(sent[1].headers.has('X-Memento-User'), false);
    assert.equal(sent[2].headers.get('X-Memento-User'), 'fictional-account');
  } finally { globalThis.fetch = originalFetch; setApiUser(null); }
});

test('recovery requires confirmation, shows eight ordered words and explains replacement', () => {
  const html = renderToStaticMarkup(createElement(RecoveryWords, {
    username: 'ficticio', phrase: 'alpha bravo charlie delta echo foxtrot golf hotel', recovered: true, onContinue() {},
  }));
  assert.equal((html.match(/<li>/g) ?? []).length, 8);
  assert.match(html, /Estas palabras reemplazan las anteriores/);
  assert.match(html, /Solo se muestran esta vez/);
  assert.match(html, /type="checkbox" required=""/);
  assert.match(html, /type="submit" disabled=""/);
});

test('a delayed unauthorized response cannot clear a newer login, but a current one expires the session', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const events = [];
  globalThis.window = { dispatchEvent: event => events.push(event.type) };
  try {
    globalThis.fetch = async path => path === '/api/state' ? response : Response.json({ user: { id: 'ficticio', username: 'ficticio' } });
    const old = api('/api/state');
    const rejection = assert.rejects(old, error => error.status === 401);
    await api('/api/auth/login', { method: 'POST' });
    release(Response.json({ error: 'Sesión anterior' }, { status: 401 }));
    await rejection;
    assert.deepEqual(events, []);
    globalThis.fetch = async () => Response.json({ error: 'Sesión caducada' }, { status: 401 });
    await assert.rejects(api('/api/state'), error => error.status === 401);
    assert.deepEqual(events, ['memento:session-expired']);
    await assert.rejects(api('/api/auth/login'), error => error.status === 401);
    assert.equal(events.length, 1);
  } finally { globalThis.fetch = originalFetch; globalThis.window = originalWindow; }
});
