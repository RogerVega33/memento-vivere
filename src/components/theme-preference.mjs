const STORAGE_KEY = 'memento-theme';

/** @typedef {'light' | 'dark' | 'auto'} Theme */

/** Keep the choice between header mounts, even if browser storage is blocked.
 * @param {() => Pick<Storage, 'getItem' | 'setItem'>} getStorage */
export function createThemePreference(getStorage) {
  /** @type {Theme} */
  let current = 'auto';
  return {
    current: () => current,
    read() {
      try {
        const stored = getStorage().getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'auto') current = stored;
      } catch { /* Retain the in-memory choice when storage is unavailable. */ }
      return current;
    },
    /** @param {Theme} theme */
    select(theme) {
      current = theme;
      try { getStorage().setItem(STORAGE_KEY, theme); }
      catch { /* Navigation still retains the choice for this page session. */ }
      return current;
    },
  };
}
