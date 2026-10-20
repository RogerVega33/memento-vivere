import { addMonths } from './dates.mjs';

/** Adjacent destinations within the visible calendar, optionally skipping empty months.
 * @param {string} month
 * @param {string} first
 * @param {string} current
 * @param {Record<string, number>} monthCounts
 * @param {boolean} onlyWithMemories
 * @returns {{previous: string|null, next: string|null}}
 */
export function monthNavigation(month, first, current, monthCounts, onlyWithMemories) {
  if (!onlyWithMemories) {
    return {
      previous: month > first ? addMonths(month, -1) : null,
      next: month < current ? addMonths(month, 1) : null,
    };
  }
  const months = Object.keys(monthCounts)
    .filter(key => monthCounts[key] > 0 && key >= first && key <= current)
    .sort();
  return {
    previous: months.findLast(key => key < month) ?? null,
    next: months.find(key => key > month) ?? null,
  };
}
