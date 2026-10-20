'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPanelHistory } from './panel-history.mjs';

export function useHistoryPanel<T extends string>(initial: T, panels: readonly T[]) {
  const [panel, setPanel] = useState<T>(initial);
  const controller = useRef<ReturnType<typeof createPanelHistory<T>> | null>(null);
  useEffect(() => {
    const history = createPanelHistory(window, { initial, panels, onChange: setPanel });
    controller.current = history;
    return () => { history.dispose(); controller.current = null; };
  }, [initial, panels]);
  const navigate = useCallback((next: T) => controller.current?.navigate(next), []);
  return [panel, navigate] as const;
}
