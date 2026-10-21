import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNetwork, networkHandler, normalizeIp, trustedProxyIp, networkContext, withNetwork } from '../src/server/request-network.mjs';
import { loadComponent } from './component-render.mjs';
import { HttpResponse, incoming } from './http-fixtures.mjs';
const { sessionCookie } = loadComponent('src/server/auth-http.ts');
const { requireSameOrigin } = loadComponent('src/server/http.mjs');
const { networkContext: compiledContext } = loadComponent('src/server/request-network.mjs');

test('direct clients use their socket IP and cannot spoof forwarded IP, protocol or host', () => {
  const request = incoming('::ffff:203.0.113.5', { 'x-forwarded-for': '198.51.100.2', 'x-forwarded-proto': 'https',
    'x-forwarded-host': 'attacker.test', forwarded: 'for=198.51.100.2', 'x-memento-client-ip': '198.51.100.3' });
  const network = prepareNetwork(request, null);
  assert.deepEqual(network, { ip: '203.0.113.5', peerIp: '203.0.113.5', secure: false, host: 'internal:3000' });
  assert.equal(request.headers['x-forwarded-for'], '203.0.113.5');
  assert.equal(request.headers['x-forwarded-proto'], 'http');
  assert.equal(request.headers['x-forwarded-host'], 'internal:3000');
  assert(!('forwarded' in request.headers));
  assert(!('x-memento-client-ip' in request.headers));
});

test('only the exact trusted proxy can supply a client IP and HTTPS metadata', () => {
  const headers = { 'x-forwarded-for': '198.51.100.2', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'memento.example' };
  const proxy = trustedProxyIp('192.0.2.10');
  const network = prepareNetwork(incoming('192.0.2.10', headers), proxy);
  assert.equal(network.ip, '198.51.100.2');
  assert.equal(network.secure, true);
  assert.equal(network.host, 'memento.example');
  assert.equal(prepareNetwork(incoming('192.0.2.11', headers), proxy).ip, '192.0.2.11');
  assert.equal(prepareNetwork(incoming('192.0.2.10'), proxy).ip, '192.0.2.10');
});

test('proxy configuration normalizes mapped IPs and rejects names, CIDRs and invalid addresses', () => {
  assert.equal(trustedProxyIp(undefined), null);
  assert.equal(normalizeIp('::ffff:c000:20a'), '192.0.2.10');
  assert.equal(trustedProxyIp('::ffff:192.0.2.10'), '192.0.2.10');
  assert.equal(normalizeIp('0:0:0:0:0:0:0:1'), '::1');
  for (const value of ['proxy.example', '192.0.2.0/24', 'garbage']) assert.throws(() => trustedProxyIp(value), /TRUSTED_PROXY_IP/);
});

test('ambiguous forwarding from a trusted proxy is rejected', () => {
  const proxy = trustedProxyIp('192.0.2.10');
  for (const headers of [
    { 'x-forwarded-for': '198.51.100.1, 198.51.100.2' }, { 'x-forwarded-for': ['198.51.100.1', '198.51.100.2'] },
    { 'x-forwarded-for': 'invalid' }, { 'x-forwarded-proto': 'https,http' }, { 'x-forwarded-host': 'attacker.test/path' },
  ]) assert.throws(() => prepareNetwork(incoming('192.0.2.10', headers), proxy), { status: 400 });
});

test('network context survives route compilation and concurrent asynchronous requests without leakage', async () => {
  const a = prepareNetwork(incoming('198.51.100.1'), null), b = prepareNetwork(incoming('198.51.100.2'), null);
  await Promise.all([a, b].map(network => withNetwork(network, async () => {
    await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(networkContext().ip, network.ip);
    assert.equal(compiledContext().ip, network.ip);
  })));
  assert.equal(networkContext(), undefined);
});

test('verified proxy HTTPS creates Secure cookies and origin checks use the public host', () => {
  const network = prepareNetwork(incoming('192.0.2.10', { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'memento.example' }), '192.0.2.10');
  withNetwork(network, () => {
    assert.match(sessionCookie(new Request('http://internal:3000'), 'a'.repeat(43)), /; Secure$/);
    assert.doesNotThrow(() => requireSameOrigin(new Request('http://internal:3000', { headers: { origin: 'https://memento.example' } })));
    assert.throws(() => requireSameOrigin(new Request('http://internal:3000', { headers: { origin: 'https://attacker.test', host: 'attacker.test' } })), { status: 403 });
    assert.throws(() => requireSameOrigin(new Request('http://internal:3000', { headers: { origin: 'http://memento.example' } })), { status: 403 });
  });
});

test('HTTP entry runs the handler with verified identity and sanitizes unexpected failures', async () => {
  const response = new HttpResponse();
  const handle = networkHandler(async request => {
    await Promise.resolve();
    assert.equal(networkContext().ip, '203.0.113.5');
    assert.equal(request.headers['x-forwarded-for'], '203.0.113.5');
    throw new Error('fictional private database message');
  }, null);
  await handle(incoming('203.0.113.5', { 'x-forwarded-for': '198.51.100.2' }), response);
  assert.equal(response.statusCode, 500);
  assert.doesNotMatch(response.body, /private|database/);
  assert.equal(networkContext(), undefined);
});

test('invalid proxy metadata is rejected at the HTTP entry before any route executes', async () => {
  let called = false;
  const handle = networkHandler(async () => { called = true; }, '192.0.2.10');
  const response = new HttpResponse();
  await handle(incoming('192.0.2.10', { 'x-forwarded-for': 'spoofed' }), response);
  assert.equal(called, false);
  assert.equal(response.statusCode, 400);
});
