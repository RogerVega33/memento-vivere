import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponent } from './component-render.mjs';
const { AuthRateLimiter } = loadComponent('src/server/auth-rate-limit.ts');

test('all auth operations share twenty requests per IP and expire after fifteen minutes', () => {
  let now = 0;
  const limits = new AuthRateLimiter(() => now);
  for (let index = 0; index < 20; index++) limits.ip('fictional-ip');
  assert.throws(() => limits.ip('fictional-ip'), error => error.status === 429 && error.retryAfter === 900);
  limits.ip('different-ip');
  now = 900000;
  assert.doesNotThrow(() => limits.ip('fictional-ip'));
});

test('username windows ignore case, include unknown accounts and keep recovery independent from login', () => {
  const limits = new AuthRateLimiter();
  for (let index = 0; index < 20; index++) limits.username('login', { username: ' Nobody ' });
  assert.throws(() => limits.username('login', { username: 'NOBODY' }), { status: 429 });
  assert.doesNotThrow(() => limits.username('recover', { username: 'nobody' }));
});

test('limiter capacity is bounded and expired entries release space', () => {
  let now = 0;
  const limits = new AuthRateLimiter(() => now, 1);
  limits.ip('one');
  assert.throws(() => limits.ip('two'), { status: 429 });
  now = 900000;
  assert.doesNotThrow(() => limits.ip('two'));
});
