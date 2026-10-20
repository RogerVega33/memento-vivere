import { ValidationError } from './errors.mjs';
/** Calendar-only operations. Event dates never pass through timezone conversion. */
export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const HORIZON_YEARS = 80;

/** @param {number} year */
export function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** @param {number} year @param {number} month */
export function daysInMonth(year, month) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

/** @param {number} year @param {number} month @param {number} day */
export function dateKey(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** @param {number} year @param {number} month */
export function monthKey(year, month) {
  return dateKey(year, month, 1).slice(0, 7);
}

/** @param {string} value */
export function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ValidationError('Introduce una fecha válida.');
  const [, y, m, d] = match;
  const [year, month, day] = [Number(y), Number(m), Number(d)];
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new ValidationError('Introduce una fecha válida.');
  }
  return { year, month, day };
}

/** @param {string} value */
export function parseMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new ValidationError('Introduce un mes válido.');
  const { year, month } = parseDate(`${value}-01`);
  return { year, month };
}

/** Server calendar, independent from each remote device's timezone.
 * @param {Date} [now] @param {string} [timeZone] */
export function todayInZone(now = new Date(), timeZone = 'America/Guayaquil') {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (/** @type {string} */ type) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** @param {string} value @param {number} amount */
export function addMonths(value, amount) {
  const { year, month } = parseMonth(value);
  const index = year * 12 + month - 1 + amount;
  return monthKey(Math.floor(index / 12), ((index % 12) + 12) % 12 + 1);
}

/** @param {string} birthDate @param {string} today @param {number} [horizonYears] */
export function validateBirthDate(birthDate, today, horizonYears = HORIZON_YEARS) {
  parseDate(birthDate);
  parseDate(today);
  if (birthDate > today) throw new ValidationError('La fecha de nacimiento no puede estar en el futuro.');
  if (!Number.isInteger(horizonYears) || horizonYears < 1) throw new ValidationError('El horizonte debe ser un número entero de años mayor que cero.');
  // Leave space for the entire projected horizon within the supported calendar.
  if (parseDate(birthDate).year > 9999 - horizonYears) throw new ValidationError('La fecha está fuera del calendario admitido.');
  return birthDate;
}

/** @param {string} birthDate @param {string} today @param {number} [horizonYears] */
export function generateLifeMonths(birthDate, today, horizonYears = HORIZON_YEARS) {
  validateBirthDate(birthDate, today, horizonYears);
  const start = birthDate.slice(0, 7);
  const current = today.slice(0, 7);
  return Array.from({ length: horizonYears * 12 }, (_, index) => {
    const key = addMonths(start, index);
    const { year, month } = parseMonth(key);
    return { key, year, month, index, row: Math.floor(index / 12), state: key < current ? 'past' : key === current ? 'current' : 'future' };
  });
}

/** @param {string} key @param {boolean} [withYear] */
export function formatMonth(key, withYear = true) {
  const { year, month } = parseMonth(key);
  return `${MONTH_NAMES[month - 1]}${withYear ? ` de ${year}` : ''}`;
}

/** @param {{year:number, month:number, day:number|null}} memory */
export function formatMemoryDate(memory) {
  return `${memory.day === null ? '' : `${memory.day} de `}${MONTH_NAMES[memory.month - 1]} de ${memory.year}`;
}

/** @param {string} birthDate @param {string} today */
export function completedYears(birthDate, today) {
  const birth = parseDate(birthDate);
  const current = parseDate(today);
  return current.year - birth.year - (today.slice(5) < birthDate.slice(5) ? 1 : 0);
}
