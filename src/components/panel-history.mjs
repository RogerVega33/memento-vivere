let nextOwner = 0;
const stateKey = 'mementoPanel';

/**
 * One history entry per temporary screen. Keep Next's own history state and URL;
 * only store a panel name, never form values or account credentials.
 * Stacked panels keep a separate entry for each nested screen.
 * @template {string} T
 * @param {Pick<Window, 'history' | 'addEventListener' | 'removeEventListener'>} browser
 * @param {{ initial: T, panels: readonly T[], onChange: (panel: T) => void, stacked?: boolean }} options
 */
export function createPanelHistory(browser, { initial, panels, onChange, stacked = false }) {
  const owner = `${Date.now()}-${++nextOwner}`;
  let current = initial;
  let returning = false;
  let disposed = false;
  const stack = [initial];
  let depth = 0;

  /** @param {unknown} state */
  function read(state) {
    const entry = state && typeof state === 'object' && stateKey in state ? state[stateKey] : null;
    if (!entry || typeof entry !== 'object' || !('owner' in entry) || !('panel' in entry) || entry.owner !== owner) return initial;
    if (stacked && (!('depth' in entry) || typeof entry.depth !== 'number' || !Number.isInteger(entry.depth) || entry.depth < 0 || stack[entry.depth] !== entry.panel)) return initial;
    return panels.find(panel => panel === entry.panel) ?? initial;
  }
  /** @param {T} panel */
  function write(panel, replace = false) {
    const state = { ...browser.history.state, [stateKey]: { owner, panel, ...(stacked ? { depth } : {}) } };
    if (replace) browser.history.replaceState(state, '');
    else browser.history.pushState(state, '');
  }
  /** @param {PopStateEvent} event */
  function popped(event) {
    returning = false;
    const panel = read(event.state);
    if (stacked) depth = panel === initial ? 0 : event.state[stateKey].depth;
    if (panel !== current) { current = panel; onChange(panel); }
  }

  // A newly mounted screen starts clean, including after reload/session changes.
  // Older entries belong to the old instance and cannot reopen a stale form.
  write(initial, true);
  browser.addEventListener('popstate', popped);

  return {
    /** @param {T} panel */
    navigate(panel) {
      if (disposed || returning || panel === current || !panels.includes(panel)) return;
      if (stacked) {
        const previous = stack.slice(0, depth).lastIndexOf(panel);
        if (previous >= 0 && read(browser.history.state) === current) {
          returning = true;
          browser.history.go(previous - depth);
          return;
        }
        depth++;
        stack.splice(depth, stack.length - depth, panel);
        write(panel);
        current = panel;
        onChange(panel);
        return;
      }
      if (panel === initial && read(browser.history.state) !== initial) {
        returning = true;
        browser.history.back();
        return;
      }
      write(panel, panel === initial || current !== initial);
      current = panel;
      onChange(panel);
    },
    dispose() {
      disposed = true;
      browser.removeEventListener('popstate', popped);
      // Do not navigate during unmount (e.g. a successful login or logout).
      // Invalidate the current temporary entry without adding another entry.
      if (read(browser.history.state) !== initial) {
        depth = 0;
        write(initial, true);
      }
    },
  };
}
