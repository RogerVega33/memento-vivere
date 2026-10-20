import test from 'node:test';
import assert from 'node:assert/strict';
import { credentials, generateRecoveryPhrase, normalizeRecoveryPhrase, hashSecret, verifySecret } from '../src/server/auth.mjs';

const password = 'una contraseña ficticia y larga';

test('passwords use distinct salts and reject missing, incompatible or wrong hashes', async () => {
  const first = await hashSecret(password);
  const second = await hashSecret(password);
  assert.notEqual(first, second);
  assert.equal(await verifySecret(password, first), true);
  assert.equal(await verifySecret('incorrecta', first), false);
  assert.equal(await verifySecret(password, null), false);
  assert.equal(await verifySecret(password, 'invalid'), false);
});

test('recovery phrases contain eight words and normalize case, separators and whitespace', () => {
  const phrase = generateRecoveryPhrase();
  assert.match(phrase, /^[a-z]+(?: [a-z]+){7}$/);
  assert.equal(normalizeRecoveryPhrase(`  ${phrase.toUpperCase().replaceAll(' ', '-\n')}  `), phrase);
  for (const value of [null, 8, 'one two', 'a '.repeat(9), 'a '.repeat(7) + '123', 'a'.repeat(513)]) assert.equal(normalizeRecoveryPhrase(value), null);
});

test('credentials preserve password text, trim usernames and enforce the existing server policy', () => {
  assert.deepEqual(credentials({ username: ' Alice ', password }, true), { username: 'Alice', password });
  for (const input of [null, {}, { username: 'ab', password }, { username: 'con espacios', password }, { username: 'Alice', password: 'corta' }]) {
    assert.throws(() => credentials(input, true), error => error.status === 400);
  }
  assert.equal(credentials({ username: 'Alice', password: 'a' }, false).password, 'a');
});
