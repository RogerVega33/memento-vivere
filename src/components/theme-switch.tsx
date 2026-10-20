'use client';
import { useEffect, useState } from 'react';
import { createThemePreference } from './theme-preference.mjs';

const preference = createThemePreference(() => window.localStorage);

export function ThemeSwitch() {
  const [theme, setTheme] = useState(preference.current);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setTheme(preference.read());
    setReady(true);
  }, []);
  useEffect(() => {
    // Restore the saved choice before applying anything to the document.
    if (!ready) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    function apply() {
      document.documentElement.dataset.theme = theme === 'auto' ? (media.matches ? 'dark' : 'light') : theme;
    }
    apply();
    if (theme === 'auto')
      media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, ready]);
  function select(next: 'light' | 'dark' | 'auto') {
    setTheme(preference.select(next));
  }
  return <div className="theme-switch" role="group" aria-label="Tema de la aplicación">
    <button
      type="button"
      aria-label="Tema claro"
      aria-pressed={theme === 'light'}
      onClick={() => select('light')}
    >
      <span>Claro</span>
    </button>
    <button
      type="button"
      aria-label="Tema oscuro"
      aria-pressed={theme === 'dark'}
      onClick={() => select('dark')}
    >
      <span>Oscuro</span>
    </button>
    <button
      type="button"
      aria-label="Tema automático"
      aria-pressed={theme === 'auto'}
      onClick={() => select('auto')}
    >
      <span>Auto</span>
    </button>
  </div>;
}
