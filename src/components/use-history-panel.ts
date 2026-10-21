'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPanelHistory } from './panel-history.mjs';

/** A new scope invalidates history entries owned by the previous content. */
export function useHistoryPanel<T extends string>(initial: T, panels: readonly T[], options: { stacked?: boolean; scope?: string } = {}) {
  const stacked = options.stacked ?? false;
  const scope = options.scope;
  const [panel, setPanel] = useState<T>(initial);
  const controller = useRef<ReturnType<typeof createPanelHistory<T>> | null>(null);
  useEffect(() => {
    const history = createPanelHistory(window, { initial, panels, onChange: setPanel, stacked });
    controller.current = history;
    setPanel(initial);
    return () => { history.dispose(); controller.current = null; };
  }, [initial, panels, stacked, scope]);
  const navigate = useCallback((next: T) => controller.current?.navigate(next), []);
  return [panel, navigate] as const;
}
