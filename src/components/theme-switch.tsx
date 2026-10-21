'use client';
import { useEffect, useState } from 'react';
import { createThemePreference } from './theme-preference.mjs';
import { Icon } from './icons';

const preference = createThemePreference(() => window.localStorage);

type Theme = 'light' | 'dark';
const themeLabels: Record<Theme, string> = { light: 'Tema claro', dark: 'Tema oscuro' };

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
    document.documentElement.dataset.theme = theme;
  }, [theme, ready]);
  function select(next: Theme) {
    setTheme(preference.select(next));
  }
  const next: Theme = theme === 'light' ? 'dark' : 'light';
  const action = { light: 'Activar tema claro', dark: 'Activar tema oscuro' }[next];
  return <button
    type="button"
    className="icon-button theme-toggle header-theme-switch"
    aria-label={action}
    title={`${themeLabels[theme]}. ${action}`}
    onClick={() => select(next)}
  >
    <Icon name={next === 'light' ? 'sun' : 'moon'} size={next === 'light' ? 18 : 19} />
  </button>;
}
