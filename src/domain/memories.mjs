import { ValidationError } from './errors.mjs';
import { dateKey, monthKey, parseDate, parseMonth, validateBirthDate } from './dates.mjs';

export const LIMITS = Object.freeze({ photosPerMemory: 6, fileBytes: 20 * 1024 * 1024, requestBytes: 50 * 1024 * 1024, titleLength: 160, descriptionLength: 500, tagsPerMemory: 20, tagLength: 60 });

/** @param {unknown} input @returns {string[]} */
export function normalizeTags(input) {
  if (input === undefined) return [];
  const values = typeof input === 'string' ? [input] : input;
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) throw new ValidationError('Las etiquetas no son válidas.');
  const seen = new Set();
  const tags = [];
  for (const value of values.flatMap(value => value.split(','))) {
    const tag = value.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    if (tag.length > LIMITS.tagLength) throw new ValidationError(`Cada etiqueta puede tener hasta ${LIMITS.tagLength} caracteres.`);
    const key = tag.toLocaleLowerCase('es');
    if (!seen.has(key)) { seen.add(key); tags.push(tag); }
  }
  if (tags.length > LIMITS.tagsPerMemory) throw new ValidationError(`Puedes añadir hasta ${LIMITS.tagsPerMemory} etiquetas.`);
  return tags;
}

/** @param {string} value */
function searchText(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').trim().replace(/\s+/g, ' ');
}

/** @param {{title:string, description:string, tags?:string[]}} memory @param {string} query */
export function matchesMemory(memory, query) {
  const text = searchText(query);
  return !text || [memory.title, memory.description, ...(memory.tags ?? [])].some(value => searchText(value).includes(text));
}

/** @param {string} value */
export function singleLineDescription(value) {
  return value.replace(/[\r\n\u2028\u2029]+/g, ' ');
}

/** @param {unknown} input @param {string} birthDate @param {string} today @returns {import('./types').MemoryDraft} */
export function validateMemory(input, birthDate, today) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('El recuerdo no es válido.');
  const raw = /** @type {Record<string, unknown>} */ (input);
  if (typeof raw.title !== 'string' || !raw.title.trim()) throw new ValidationError('Escribe un título para tu recuerdo.');
  const title = raw.title.trim();
  if (title.length > LIMITS.titleLength) throw new ValidationError(`El título puede tener hasta ${LIMITS.titleLength} caracteres.`);
  if (raw.description !== undefined && typeof raw.description !== 'string') throw new ValidationError('La descripción no es válida.');
  const description = singleLineDescription(typeof raw.description === 'string' ? raw.description : '').trim();
  if (description.length > LIMITS.descriptionLength) throw new ValidationError(`El detalle puede tener hasta ${LIMITS.descriptionLength} caracteres.`);
  const tags = normalizeTags(raw.tags);
  return { title, description, tags, ...validateEventDate(raw, birthDate, today) };
}

/** Calendar visibility is independent from current text/tag policies.
 * @param {Record<string, unknown>} raw @param {string} birthDate @param {string} today
 * @returns {Pick<import('./types').MemoryDraft, 'year' | 'month' | 'day' | 'precision'>} */
function validateEventDate(raw, birthDate, today) {
  if (!Number.isInteger(raw.year) || !Number.isInteger(raw.month)) throw new ValidationError('Elige el mes y el año del recuerdo.');
  const year = /** @type {number} */ (raw.year);
  const month = /** @type {number} */ (raw.month);
  const day = raw.day === undefined || raw.day === null ? null : /** @type {number} */ (raw.day);
  const key = monthKey(year, month);
  parseMonth(key);
  if (day !== null) {
    if (!Number.isInteger(day)) throw new ValidationError('El día debe ser un número entero.');
    parseDate(dateKey(year, month, day));
  }
  validateBirthDate(birthDate, today);
  if (key < birthDate.slice(0, 7) || (day !== null && dateKey(year, month, day) < birthDate)) throw new ValidationError('El recuerdo no puede ser anterior a tu nacimiento.');
  if (key > today.slice(0, 7) || (day !== null && dateKey(year, month, day) > today)) throw new ValidationError('Solo puedes registrar recuerdos hasta hoy.');
  return { year, month, day, precision: day === null ? 'MONTH' : 'DAY' };
}

/** Used when editing/deleting: changing birthDate hides old events without deleting them.
 * @param {import('./types').MemoryDraft} memory @param {string} birthDate @param {string} today */
export function isMemoryVisible(memory, birthDate, today) {
  try { validateEventDate(memory, birthDate, today); return true; } catch { return false; }
}
