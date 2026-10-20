import { parseMonth } from './dates.mjs';

/** @param {string} from @param {string} to */
export function calendarMonthsBetween(from, to) {
  const start = parseMonth(from.slice(0, 7));
  const end = parseMonth(to.slice(0, 7));
  return (end.year - start.year) * 12 + end.month - start.month;
}

/** @param {number} total */
export function formatMonthDuration(total) {
  const years = Math.floor(total / 12);
  const months = total % 12;
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
  if (months || !years) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
  return parts.join(' y ');
}

/** @param {string} month @param {string} birthDate @param {string} today @param {number} count */
export function describeLifeMonth(month, birthDate, today, count) {
  if (month > today.slice(0, 7)) {
    return { detail: `Por vivir · dentro de ${formatMonthDuration(calendarMonthsBetween(today, month))}`, memories: null };
  }
  return {
    detail: `Edad: ${formatMonthDuration(Math.max(0, calendarMonthsBetween(birthDate, month)))}`,
    memories: count ? `${count} ${count === 1 ? 'recuerdo' : 'recuerdos'}` : 'Sin recuerdos',
  };
}
