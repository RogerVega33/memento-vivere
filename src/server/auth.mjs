import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { RepositoryError } from '../domain/errors.mjs';
import words from './wordlists/eff-short.json' with { type: 'json' };

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const RECOVERY_WORD_COUNT = 8;
const prefix = 'scrypt$65536$8$2$';
const dummyHash = prefix + '0'.repeat(32) + '$' + '0'.repeat(128);
let running = 0;

/** @param {string} value @param {string} salt @returns {Promise<Buffer>} */
function derive(value, salt) {
  if (running >= 2) return Promise.reject(new RepositoryError('Hay varios accesos en curso. Inténtalo de nuevo en unos segundos.', 429));
  running++;
  return new Promise((resolve, reject) => {
    scrypt(value, Buffer.from(salt, 'hex'), 64, { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 }, (error, key) => {
      running--;
      if (error) reject(error); else resolve(key);
    });
  });
}

/** @param {string} value */
export async function hashSecret(value) {
  const salt = randomBytes(16).toString('hex');
  return prefix + salt + '$' + (await derive(value, salt)).toString('hex');
}

/** @param {string} value @param {string|null} encoded */
export async function verifySecret(value, encoded) {
  const valid = encoded !== null && /^scrypt\$65536\$8\$2\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(encoded);
  const parts = (valid ? encoded : dummyHash).split('$');
  return timingSafeEqual(await derive(value, parts[4]), Buffer.from(parts[5], 'hex')) && valid;
}

export function generateRecoveryPhrase() {
  return Array.from({ length: RECOVERY_WORD_COUNT }, () => words[randomInt(words.length)]).join(' ');
}

/** @param {unknown} value */
export function normalizeRecoveryPhrase(value) {
  if (typeof value !== 'string' || value.length > 512) return null;
  const parts = value.trim().toLowerCase().split(/[\s-]+/u);
  return parts.length === RECOVERY_WORD_COUNT && parts.every(word => /^[a-z]+$/.test(word)) ? parts.join(' ') : null;
}

/** @param {unknown} input @param {boolean} creating */
export function credentials(input, creating) {
  if (!input || typeof input !== 'object' || !('username' in input) || !('password' in input)
    || typeof input.username !== 'string' || typeof input.password !== 'string') {
    throw new RepositoryError('Escribe tu usuario y contraseña.', 400);
  }
  const username = input.username.trim();
  if (!/^[a-zA-Z0-9@._-]{3,50}$/.test(username)) throw new RepositoryError('El usuario debe tener de 3 a 50 caracteres: letras sin acentos, números o @ . _ -. Sin espacios.', 400);
  const length = Array.from(input.password).length;
  if (length < (creating ? 12 : 1) || length > 128) throw new RepositoryError(`La contraseña debe tener entre ${creating ? 12 : 1} y 128 caracteres.`, 400);
  return { username, password: input.password };
}

/** @param {string} token */
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
