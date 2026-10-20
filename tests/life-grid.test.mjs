import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './component-render.mjs';

const { LifeGrid } = loadComponent('src/components/life-grid.tsx');
const state = {
  profile: { birthDate: '1993-11-30', horizonYears: 80, createdAt: '' }, today: '2026-10-20',
  monthCounts: { '2014-09': 1, '2026-10': 2 }, memoryCount: 3, photoCount: 0,
};
const render = (query = '', search, horizonYears = 80) => renderToStaticMarkup(createElement(LifeGrid, {
  state: { ...state, profile: { ...state.profile, horizonYears }, search }, selectedMonth: '2026-10', query, onSearch() {}, onSelect() {},
}));
const cell = (html, month) => html.match(new RegExp(`<button[^>]+data-month="${month}"[^>]*>`))?.[0];

test('the redesigned map renders 960 unique months in eight decades and 80 rows', () => {
  const html = render();
  assert.equal((html.match(/class="life-decade"/g) ?? []).length, 8);
  assert.equal((html.match(/class="life-row"/g) ?? []).length, 80);
  assert.equal((html.match(/data-month="/g) ?? []).length, 960);
  assert.equal(new Set([...html.matchAll(/data-month="([^"]+)"/g)].map(match => match[1])).size, 960);
  assert.ok(html.includes('Pantalla completa'));
  assert.ok(!html.includes('Expandir'));
  assert.ok(html.includes('aria-valuenow="396"'));
});

test('the current month keeps its existing orange rule without a search', () => {
  const current = cell(render(), '2026-10');
  assert.match(current, /class="month-cell current  selected"/);
  assert.doesNotMatch(current, /has-memories/);
  assert.match(cell(render(), '2014-09'), /has-memories/);
  assert.match(cell(render(), '2026-11'), /disabled=""/);
});

test('the profile horizon controls rows, partial decades and progress for shorter and longer maps', () => {
  for (const years of [1, 25, 100]) {
    const html = render('', undefined, years);
    assert.equal((html.match(/class="life-row"/g) ?? []).length, years);
    assert.equal((html.match(/data-month="/g) ?? []).length, years * 12);
    assert.equal((html.match(/class="life-decade"/g) ?? []).length, Math.ceil(years / 10));
    assert.ok(html.includes(`aria-valuemax="${years * 12}"`));
    assert.ok(html.includes(`hasta los ${years}`));
    assert.match(html, /tabindex="0"/);
  }
  const shorter = render('', undefined, 25);
  assert.ok(shorter.includes('20–24'));
  assert.ok(shorter.includes('data-month="2018-10"'));
  assert.ok(!shorter.includes('data-month="2018-11"'));
  assert.ok(shorter.includes('aria-valuenow="300"'));
  const longer = render('', undefined, 100);
  assert.ok(longer.includes('data-month="2093-10"'));
  assert.ok(longer.includes('aria-valuenow="396"'));
});

test('the current month turns blue only for matching active search results', () => {
  const matching = render('trabajo', { query: 'trabajo', monthCounts: { '2026-10': 1 }, memoryCount: 1 });
  assert.match(cell(matching, '2026-10'), /class="month-cell current has-memories selected"/);
  assert.doesNotMatch(cell(matching, '2014-09'), /has-memories/);
  const otherMonth = render('viajes', { query: 'viajes', monthCounts: { '2014-09': 1 }, memoryCount: 1 });
  assert.doesNotMatch(cell(otherMonth, '2026-10'), /has-memories/);
  assert.match(cell(otherMonth, '2014-09'), /has-memories/);
});
