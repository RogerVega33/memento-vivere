import assert from 'node:assert/strict';
import { addMonths, completedYears, dateKey, daysInMonth, formatMemoryDate, generateLifeMonths, horizonYearsForBirthDate, isLeapYear, minimumBirthDate, monthKey, parseDate, parseMonth, todayInZone, validateBirthDate, validateNewBirthDate } from '../src/domain/dates.mjs';
import { isMemoryVisible, LIMITS, matchesMemory, normalizeTags, singleLineDescription, validateMemory } from '../src/domain/memories.mjs';
import { monthNavigation } from '../src/domain/month-navigation.mjs';

const today = '2026-10-19';
const birth = '2000-11-30';
const draft = (overrides = {}) => ({ title: 'Un momento', description: '', year: 2001, month: 2, day: null, ...overrides });

// Exported so the exact same cases can run in the app's Node REPL when a shell
// runtime is unavailable. No database, network, environment file or fixture secrets.
export const cases = [
  ['Stored memories stay visible regardless of current title/detail/tag write limits', () => {
    const saved = draft({ title: 'a'.repeat(LIMITS.titleLength + 1), description: 'b'.repeat(LIMITS.descriptionLength + 1), tags: ['c'.repeat(LIMITS.tagLength + 1)] });
    assert.equal(isMemoryVisible(saved, birth, today), true);
    assert.throws(() => validateMemory(saved, birth, today));
    assert.equal(isMemoryVisible({ ...saved, year: 1999 }, birth, today), false);
  }],
  ['Visibility respects birth and today while preserving memories with an unknown day', () => {
    assert.equal(isMemoryVisible(draft({ year: 2000, month: 10 }), birth, today), false);
    assert.equal(isMemoryVisible(draft({ year: 2000, month: 11, day: 29 }), birth, today), false);
    assert.equal(isMemoryVisible(draft({ year: 2000, month: 11, day: null }), birth, today), true);
    assert.equal(isMemoryVisible(draft({ year: 2026, month: 10, day: null }), birth, today), true);
    assert.equal(isMemoryVisible(draft({ year: 2026, month: 10, day: 20 }), birth, today), false);
  }],
  ['Comma-separated tags trim surplus spaces, preserve names and ignore empty or duplicate entries', () => {
    assert.deepEqual(normalizeTags(' trabajo, empresa   A , , Trabajo, empresa A, viajes, '), ['trabajo', 'empresa A', 'viajes']);
    assert.deepEqual(normalizeTags([' trabajo ', 'empresa A', 'TRABAJO']), ['trabajo', 'empresa A']);
    assert.deepEqual(normalizeTags(' , , '), []);
    assert.deepEqual(validateMemory(draft(), birth, today).tags, []);
    assert.deepEqual(validateMemory(draft({ tags: 'trabajo, empresa A' }), birth, today).tags, ['trabajo', 'empresa A']);
  }],
  ['Tags reject invalid values and excessive sizes', () => {
    for (const tags of [null, 3, {}, [1], ['trabajo', null]]) assert.throws(() => validateMemory(draft({ tags }), birth, today), /etiquetas/);
    assert.equal(normalizeTags('a'.repeat(LIMITS.tagLength))[0].length, LIMITS.tagLength);
    assert.throws(() => normalizeTags('a'.repeat(LIMITS.tagLength + 1)), /caracteres/);
    assert.throws(() => normalizeTags(Array.from({ length: LIMITS.tagsPerMemory + 1 }, (_, i) => `etiqueta ${i}`)), /20 etiquetas/);
  }],
  ['Search matches titles, descriptions and tags regardless of case, accents or extra spaces', () => {
    const memory = draft({ title: 'Un VIAJE a Perú', description: 'Una conversación especial', tags: ['trabajo', 'empresa A'] });
    for (const query of ['viaje', 'PERU', ' conversacion ', 'TRABAJO', 'empresa   a', '', '   ']) assert.equal(matchesMemory(memory, query), true, query);
    assert.equal(matchesMemory(memory, 'deportes'), false);
    assert.equal(matchesMemory(draft(), 'trabajo'), false);
    assert.equal(matchesMemory(draft(), ''), true);
  }],
  ['Month navigation crosses year boundaries and stops at birth and the current month', () => {
    const navigate = month => monthNavigation(month, '2025-11', '2026-02', {}, false);
    assert.deepEqual(navigate('2025-11'), { previous: null, next: '2025-12' });
    assert.deepEqual(navigate('2025-12'), { previous: '2025-11', next: '2026-01' });
    assert.deepEqual(navigate('2026-02'), { previous: '2026-01', next: null });
    assert.deepEqual(monthNavigation('2026-02', '2026-02', '2026-02', {}, false), { previous: null, next: null });
  }],
  ['Memory navigation skips gaps in chronological order including the current month', () => {
    const counts = { '2026-10': 1, '2025-01': 3, '2025-12': 2 };
    const navigate = month => monthNavigation(month, '2000-11', '2026-10', counts, true);
    assert.deepEqual(navigate('2025-06'), { previous: '2025-01', next: '2025-12' });
    assert.deepEqual(navigate('2025-12'), { previous: '2025-01', next: '2026-10' });
    assert.deepEqual(navigate('2026-10'), { previous: '2025-12', next: null });
    assert.deepEqual(navigate('2025-01'), { previous: null, next: '2025-12' });
  }],
  ['Memory navigation ignores empty, pre-birth and future months and handles deleted memories', () => {
    const counts = { '1999-01': 2, '2026-03': 0, '2026-04': 1, '2027-01': 2 };
    const navigate = () => monthNavigation('2026-02', '2000-11', '2026-10', counts, true);
    assert.deepEqual(navigate(), { previous: null, next: '2026-04' });
    delete counts['2026-04'];
    assert.deepEqual(navigate(), { previous: null, next: null });
    assert.deepEqual(monthNavigation('2026-02', '2000-11', '2026-10', {}, true), { previous: null, next: null });
  }],
  ['Gregorian leap years include 2000 and exclude 1900 and 2100', () => {
    assert.equal(isLeapYear(2000), true); assert.equal(isLeapYear(2024), true); assert.equal(isLeapYear(1900), false); assert.equal(isLeapYear(2100), false);
  }],
  ['February and all other month lengths are correct', () => {
    assert.equal(daysInMonth(2024, 2), 29); assert.equal(daysInMonth(2025, 2), 28);
    assert.equal(daysInMonth(2026, 4), 30); assert.equal(daysInMonth(2026, 12), 31);
  }],
  ['Invalid dates cannot silently roll into the next month', () => {
    for (const value of ['2025-02-29', '2024-02-30', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '0000-01-01', '2026-2-01', 'not-a-date']) assert.throws(() => parseDate(value));
    assert.deepEqual(parseDate('2024-02-29'), { year: 2024, month: 2, day: 29 });
  }],
  ['Month input has an unambiguous year-month format', () => {
    assert.deepEqual(parseMonth('2026-10'), { year: 2026, month: 10 });
    for (const value of ['2026-1', '2026-13', '2026-10-01', '0000-11']) assert.throws(() => parseMonth(value));
    assert.equal(dateKey(1, 2, 3), '0001-02-03'); assert.equal(monthKey(2026, 1), '2026-01');
  }],
  ['Month arithmetic crosses years in both directions', () => {
    assert.equal(addMonths('2000-11', 2), '2001-01'); assert.equal(addMonths('2001-01', -1), '2000-12'); assert.equal(addMonths('2000-11', 1199), '2100-10');
  }],
  ['The default grid contains exactly 80 continuous rows and 960 distinct months', () => {
    const months = generateLifeMonths(birth, today);
    assert.equal(months.length, 960); assert.equal(new Set(months.map(value => value.key)).size, 960);
    assert.equal(months[0].key, '2000-11'); assert.equal(months[11].key, '2001-10'); assert.equal(months[12].key, '2001-11'); assert.equal(months[959].key, '2080-10');
    for (let row = 0; row < 80; row++) assert.equal(months.filter(month => month.row === row).length, 12);
  }],
  ['November 1 and November 30 produce identical calendar-month grids', () => {
    assert.deepEqual(generateLifeMonths('2000-11-01', today), generateLifeMonths('2000-11-30', today));
  }],
  ['A variable horizon changes the number of continuous calendar months', () => {
    for (const years of [1, 25, 100]) {
      const months = generateLifeMonths(birth, today, years);
      assert.equal(months.length, years * 12);
      assert.equal(months.at(-1).key, `${2000 + years}-10`);
      assert.equal(months.at(-1).row, years - 1);
    }
    for (const years of [0, -1, 1.5, NaN, Infinity, null, '80', 8000]) {
      assert.throws(() => generateLifeMonths(birth, today, years));
    }
    assert.equal(generateLifeMonths('9919-11-01', '9999-01-01', 80).at(-1).key, '9999-10');
    assert.throws(() => generateLifeMonths('9919-11-01', '9999-01-01', 81));
  }],
  ['A leap-day birth never introduces day-overflow gaps in the grid', () => {
    const months = generateLifeMonths('2000-02-29', today);
    assert.equal(months[0].key, '2000-02'); assert.equal(months[1].key, '2000-03'); assert.equal(months[11].key, '2001-01'); assert.equal(months[12].key, '2001-02');
  }],
  ['Exactly one current month, with past and future months separated', () => {
    const months = generateLifeMonths(birth, today);
    assert.equal(months.filter(month => month.state === 'current').length, 1);
    assert.equal(months.find(month => month.key === '2026-10').state, 'current');
    assert.equal(months.find(month => month.key === '2026-09').state, 'past');
    assert.equal(months.find(month => month.key === '2026-11').state, 'future');
  }],
  ['A newborn sees its partial birth month as current', () => {
    const months = generateLifeMonths('2026-10-19', today);
    assert.equal(months[0].state, 'current'); assert.equal(months[1].state, 'future');
  }],
  ['The visualization horizon does not determine the validity of events', () => {
    const months = generateLifeMonths('1900-01-01', today);
    assert.equal(months.length, 960); assert.equal(months.every(month => month.state === 'past'), true);
    assert.equal(validateMemory(draft({ year: 2026, month: 10, day: 19 }), '1900-01-01', today).day, 19);
  }],
  ['Future and invalid birth dates are rejected', () => {
    assert.throws(() => validateBirthDate('2026-10-20', today)); assert.throws(() => validateBirthDate('2025-02-29', today)); assert.equal(validateBirthDate(today, today), today);
  }],
  ['New profiles accept the entire current-year-minus-99 birth year and reject earlier years', () => {
    assert.equal(minimumBirthDate(today), '1927-01-01');
    for (const value of ['1927-01-01', '1927-12-31', '1936-02-29', today]) {
      assert.equal(validateNewBirthDate(value, today), value);
    }
    for (const value of ['1000-01-01', '1926-12-31']) {
      assert.throws(() => validateNewBirthDate(value, today), /1927/);
    }
    assert.throws(() => validateNewBirthDate('2026-10-20', today), /futuro/);
    assert.throws(() => validateNewBirthDate('1955-02-29', today), /válida/);
    assert.equal(minimumBirthDate('2027-01-01'), '1928-01-01');
    assert.throws(() => validateNewBirthDate('1927-12-31', '2027-01-01'), /1928/);
  }],
  ['New profiles use a 100-year horizon from 70 through 99 calendar years of age', () => {
    for (const value of ['1927-01-01', '1927-12-31', '1956-01-01', '1956-12-31']) {
      const horizon = horizonYearsForBirthDate(value, today);
      assert.equal(horizon, 100);
      const months = generateLifeMonths(value, today, horizon);
      assert.equal(months.length, 1200);
      assert.equal(months.filter(month => month.state === 'current').length, 1);
    }
    for (const value of ['1957-01-01', '1957-12-31', '2000-01-01', today]) {
      assert.equal(horizonYearsForBirthDate(value, today), 80);
    }
    assert.throws(() => horizonYearsForBirthDate('1926-12-31', today), /1927/);
    assert.equal(horizonYearsForBirthDate('1957-12-31', '2027-01-01'), 100);
  }],
  ['Age changes on the birthday and leap-day age changes on March 1 in common years', () => {
    assert.equal(completedYears(birth, '2026-11-29'), 25); assert.equal(completedYears(birth, '2026-11-30'), 26);
    assert.equal(completedYears('2000-02-29', '2025-02-28'), 24); assert.equal(completedYears('2000-02-29', '2025-03-01'), 25);
  }],
  ['The shared server calendar handles UTC midnight in Ecuador', () => {
    assert.equal(todayInZone(new Date('2026-10-20T04:59:59Z')), '2026-10-19');
    assert.equal(todayInZone(new Date('2026-10-20T05:00:00Z')), '2026-10-20');
  }],
  ['Future days within the current month are rejected; today is accepted', () => {
    assert.throws(() => validateMemory(draft({ year: 2026, month: 10, day: 20 }), birth, today), /hasta hoy/);
    assert.equal(validateMemory(draft({ year: 2026, month: 10, day: 19 }), birth, today).day, 19);
    assert.throws(() => validateMemory(draft({ year: 2026, month: 11 }), birth, today), /hasta hoy/);
  }],
  ['The partial birth month allows month precision and rejects exact earlier days', () => {
    assert.equal(validateMemory(draft({ year: 2000, month: 11 }), birth, today).precision, 'MONTH');
    assert.equal(validateMemory(draft({ year: 2000, month: 11, day: 30 }), birth, today).precision, 'DAY');
    assert.throws(() => validateMemory(draft({ year: 2000, month: 11, day: 29 }), birth, today), /nacimiento/);
    assert.throws(() => validateMemory(draft({ year: 2000, month: 10 }), birth, today), /nacimiento/);
  }],
  ['Unknown days are stored as null and never as a fabricated first day', () => {
    const event = validateMemory(draft(), birth, today);
    assert.equal(event.day, null); assert.equal(event.precision, 'MONTH');
    assert.equal(formatMemoryDate(event), 'febrero de 2001');
    assert.equal(formatMemoryDate({ ...event, day: 3 }), '3 de febrero de 2001');
  }],
  ['Impossible and fractional event days are rejected', () => {
    for (const day of [0, -1, 29, 31, 1.5, '3', false, NaN]) assert.throws(() => validateMemory(draft({ day }), birth, today));
    assert.equal(validateMemory(draft({ year: 2024, day: 29 }), birth, today).day, 29);
  }],
  ['Titles are required, whitespace is trimmed, optional description stays optional', () => {
    assert.throws(() => validateMemory(draft({ title: '   ' }), birth, today));
    assert.throws(() => validateMemory(draft({ title: 'a'.repeat(LIMITS.titleLength + 1) }), birth, today));
    assert.throws(() => validateMemory(draft({ description: {} }), birth, today));
    assert.equal(validateMemory(draft({ title: '  Un día  ', description: undefined }), birth, today).title, 'Un día');
  }],
  ['Descriptions allow exactly 500 characters and reject longer text', () => {
    assert.equal(LIMITS.descriptionLength, 500);
    assert.equal(validateMemory(draft({ description: 'á'.repeat(500) }), birth, today).description.length, 500);
    assert.throws(() => validateMemory(draft({ description: 'á'.repeat(501) }), birth, today), /500 caracteres/);
    assert.equal(validateMemory(draft({ description: undefined }), birth, today).description, '');
  }],
  ['Description line breaks become spaces on both input and save', () => {
    const text = 'Primero\r\nDespués\n\nOtro\rFinal\u2028Más\u2029Fin';
    assert.equal(singleLineDescription(text), 'Primero Después Otro Final Más Fin');
    assert.equal(validateMemory(draft({ description: text }), birth, today).description, 'Primero Después Otro Final Más Fin');
    assert.throws(() => validateMemory(draft({ description: `${'a'.repeat(499)}\nb` }), birth, today), /500 caracteres/);
  }],
];
