import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarMonthsBetween, describeLifeMonth, formatMonthDuration } from '../src/domain/month-details.mjs';

test('month durations use natural singulars and cross year boundaries', () => {
  assert.equal(calendarMonthsBetween('2026-11-30', '2027-02'), 3);
  assert.equal(formatMonthDuration(0), '0 meses');
  assert.equal(formatMonthDuration(1), '1 mes');
  assert.equal(formatMonthDuration(12), '1 año');
  assert.equal(formatMonthDuration(13), '1 año y 1 mes');
  assert.equal(formatMonthDuration(339), '28 años y 3 meses');
});

test('past month tooltips include calendar age and memory totals', () => {
  assert.deepEqual(describeLifeMonth('2022-02', '1993-11-30', '2026-10-20', 0), {
    detail: 'Edad: 28 años y 3 meses', memories: 'Sin recuerdos',
  });
  assert.equal(describeLifeMonth('1993-11', '1993-11-30', '2026-10-20', 1).detail, 'Edad: 0 meses');
  assert.equal(describeLifeMonth('2026-10', '1993-11-30', '2026-10-20', 1).memories, '1 recuerdo');
  assert.equal(describeLifeMonth('2026-10', '1993-11-30', '2026-10-20', 3).memories, '3 recuerdos');
});

test('future month tooltips show the time remaining from the shared calendar', () => {
  assert.deepEqual(describeLifeMonth('2032-04', '1993-11-30', '2026-10-20', 0), {
    detail: 'Por vivir · dentro de 5 años y 6 meses', memories: null,
  });
  assert.equal(describeLifeMonth('2026-11', '1993-11-30', '2026-10-20', 0).detail, 'Por vivir · dentro de 1 mes');
});
