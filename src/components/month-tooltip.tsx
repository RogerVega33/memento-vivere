'use client';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatMonth } from '@/domain/dates.mjs';
import { describeLifeMonth } from '@/domain/month-details.mjs';
type TooltipState = {
  month: string;
  left: number;
  top: number;
  above: boolean;
};
export function useMonthTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hide = useCallback(() => setTooltip(null), []);
  const show = useCallback((target: EventTarget | null) => {
    const cell = target instanceof Element ? target.closest<HTMLElement>('[data-month]') : null;
    const month = cell?.dataset.month;
    if (!cell || !month) {
      setTooltip(null);
      return;
    }
    const bounds = cell.getBoundingClientRect();
    const above = bounds.top >= 112;
    const width = Math.min(260, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, bounds.left + bounds.width / 2 - width / 2));
    const top = above ? bounds.top - 9 : bounds.bottom + 9;
    setTooltip(previous => previous?.month === month && previous.left === left && previous.top === top ? previous : { month, left, top, above });
  }, []);
  const visible = tooltip !== null;
  useEffect(() => {
    if (!visible)
      return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
    };
  }, [visible, hide]);
  return { tooltip, show, hide };
}
export function MonthTooltip({ tooltip, birthDate, today, monthCounts, portal = true }: {
  tooltip: TooltipState | null;
  birthDate: string;
  today: string;
  monthCounts: Record<string, number>;
  portal?: boolean;
}) {
  if (!tooltip)
    return null;
  const details = describeLifeMonth(tooltip.month, birthDate, today, monthCounts[tooltip.month] ?? 0);
  const content = <div
    id="life-month-tooltip"
    role="tooltip"
    className="month-tooltip"
    style={{ left: tooltip.left, top: tooltip.top, transform: tooltip.above ? 'translateY(-100%)' : undefined }}
  >
    <strong>
      {formatMonth(tooltip.month)}
    </strong>
    <span>
      {details.detail}
    </span>
    {details.memories && <span>
      {details.memories}
    </span>}
  </div>;
  return portal ? createPortal(content, document.body) : content;
}
