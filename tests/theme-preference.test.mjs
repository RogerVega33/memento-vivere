import test from 'node:test';
import assert from 'node:assert/strict';
import { createThemePreference } from '../src/components/theme-preference.mjs';

function browserStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('each selected theme survives header remounts and page reloads', () => {
  const storage = browserStorage();
  const preference = createThemePreference(() => storage);
  assert.equal(preference.read(), 'auto');
  for (const theme of ['light', 'dark', 'auto']) {
    preference.select(theme);
    assert.equal(preference.current(), theme);
    assert.equal(preference.read(), theme);
    assert.equal(createThemePreference(() => storage).read(), theme);
  }
});

test('unavailable storage cannot reset a manual theme when the header remounts', () => {
  const preference = createThemePreference(() => { throw new Error('Fictional blocked storage'); });
  assert.equal(preference.read(), 'auto');
  preference.select('light');
  assert.equal(preference.current(), 'light');
  assert.equal(preference.read(), 'light');
  preference.select('dark');
  assert.equal(preference.read(), 'dark');
});

test('invalid stored themes are ignored without overwriting the current selection', () => {
  const storage = { getItem: () => 'invalid-theme', setItem() {} };
  const preference = createThemePreference(() => storage);
  assert.equal(preference.read(), 'auto');
  preference.select('light');
  assert.equal(preference.read(), 'light');
});
