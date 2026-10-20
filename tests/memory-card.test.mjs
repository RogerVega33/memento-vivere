import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './component-render.mjs';

const { MemoryCard } = loadComponent('src/components/memory-card.tsx');
const render = photoIds => renderToStaticMarkup(createElement(MemoryCard, {
  memory: { id: 'fictional', title: 'Un recuerdo', description: 'Texto ficticio', tags: ['Amigos'], year: 2026, month: 10, day: 3, photoIds },
  onEdit() {}, onDelete() {}, onPhoto() {},
}));

test('all photographs remain individually available in the card, including the sixth', () => {
  for (let count = 1; count <= 6; count++) {
    const ids = Array.from({ length: count }, (_, index) => `fictional-${index + 1}`);
    const html = render(ids);
    assert.equal((html.match(/class="memory-photo"/g) ?? []).length, count);
    for (const [index, id] of ids.entries()) {
      assert.ok(html.includes(`src="/api/photos/${id}"`));
      assert.ok(html.includes(`aria-label="Ampliar fotografía ${index + 1} de Un recuerdo"`));
    }
  }
});

test('a memory without photos keeps its content and exposes actions through a closed disclosure', () => {
  const html = render([]);
  assert.ok(html.includes('Opciones de Un recuerdo'));
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(!html.includes('aria-label="Editar Un recuerdo"'));
  assert.ok(!html.includes('class="memory-photos"'));
  assert.ok(html.includes('Texto ficticio'));
  assert.ok(html.includes('Amigos'));
  assert.ok(html.includes('3 de octubre de 2026'));
});
