import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './component-render.mjs';

const { HelpLabel } = loadComponent('src/components/help-tip.tsx');
const { MemoryEditor } = loadComponent('src/components/memory-editor.tsx');
const { ChangePasswordDialog } = loadComponent('src/components/change-password-dialog.tsx');
const { Onboarding } = loadComponent('src/components/onboarding.tsx');
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const tooltip = (html, id) => html.match(new RegExp(`<span\\b(?=[^>]*id="${id}")[^>]*>`))?.[0];

test('help is a separate non-submit button with a stable hidden description', () => {
  const html = render(HelpLabel, { htmlFor: 'field', label: 'Campo', hint: 'Explicación', hintId: 'field-help' });
  assert.match(html, /<label for="field">Campo<\/label>/);
  assert.doesNotMatch(html.match(/<label[^>]*>[\s\S]*?<\/label>/)[0], /<button/);
  assert.match(html, /type="button"[^>]*aria-label="Ayuda: Campo"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="field-help"/);
  assert.match(tooltip(html, 'field-help'), /role="tooltip"[^>]*hidden=""/);
  assert.match(html, /Explicación/);
});

test('memory editor keeps optional field guidance in linked helpers', () => {
  const html = render(MemoryEditor, { selectedMonth: '2026-10', birthDate: '1990-01-01', today: '2026-10-20', onClose() {}, onSaved() {} });
  for (const id of ['memory-day-hint', 'memory-description-hint', 'memory-tags-hint', 'photo-restrictions']) {
    assert.match(tooltip(html, id), /hidden=""/);
    assert(html.includes(`aria-describedby="${id}"`));
    assert(!html.includes(`<p id="${id}"`));
  }
  assert.match(html, /aria-label="Ayuda: Etiquetas"/);
  assert.match(html, /aria-label="Ayuda: Fotos"/);
  assert.match(html, /aria-label="Ayuda: Tu recuerdo"/);
  assert.doesNotMatch(html, /0\/500/);
  assert.match(html, /0\/6/);
  assert.match(html, /Añadir fotos/);
});

test('password guidance stays available in collapsed helpers without a dialog introduction', () => {
  const html = render(ChangePasswordDialog, { onClose() {}, onSaved() {} });
  assert.doesNotMatch(html, /class="dialog-intro"/);
  assert.match(html, /aria-label="Ayuda: Cambiar contraseña"/);
  assert.match(html, /Las demás sesiones se cerrarán/);
  assert.match(tooltip(html, 'change-password-hint'), /hidden=""/);
  assert.match(html, /aria-describedby="change-password-hint"/);
});

test('birth-date guidance stays visible below the labelled date field', () => {
  const html = render(Onboarding, { today: '2026-10-20', onSetup() {} });
  assert.match(html, /<label for="birthDate">Fecha de nacimiento<\/label>/);
  assert.match(html, /id="birthDate" aria-describedby="birth-date-hint"/);
  assert.match(html, /min="1927-01-01" max="2026-10-20"/);
  assert.match(html, /<p id="birth-date-hint" class="field-hint birth-date-hint">Introduce tu fecha de nacimiento/);
  assert.doesNotMatch(html, /aria-label="Ayuda: Fecha de nacimiento"/);
});
