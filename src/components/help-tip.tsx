'use client';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

export function HelpTip({ label, children, id }: { label: string; children: ReactNode; id?: string }) {
  const generatedId = useId();
  const hintId = id ?? generatedId;
  const container = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const visible = (hovered || focused || pinned) && !dismissed;
  const dismiss = useCallback(() => { setPinned(false); setDismissed(true); }, []);

  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);
  useEffect(() => {
    if (!visible) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) dismiss();
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    }
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [visible, dismiss]);

  useLayoutEffect(() => {
    if (!visible) return;
    function place() {
      if (!trigger.current || !tooltip.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const popup = tooltip.current.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      if (anchor.bottom < 0 || anchor.top > height) { dismiss(); return; }
      const left = Math.max(12, Math.min(anchor.left, width - popup.width - 12));
      const below = anchor.bottom + 6;
      const above = anchor.top - popup.height - 6;
      const top = below + popup.height <= height - 12 ? below : Math.max(12, above);
      setPosition({ left, top });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [visible, children, dismiss]);

  return <span className="help-tip" ref={container}
    onPointerEnter={event => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      if (event.pointerType !== 'touch') { setHovered(true); setDismissed(false); }
    }}
    onPointerLeave={() => { leaveTimer.current = setTimeout(() => setHovered(false), 150); }}>
    <button type="button" className="help-trigger" ref={trigger} aria-label={`Ayuda: ${label}`}
      aria-expanded={visible} aria-controls={hintId} aria-describedby={hintId}
      onFocus={() => { setFocused(true); setDismissed(false); }}
      onBlur={() => { setFocused(false); setPinned(false); }}
      onClick={() => { if (pinned) dismiss(); else { setPinned(true); setDismissed(false); } }}>
      <Icon name="help" size={16} />
    </button>
    <span id={hintId} ref={tooltip} className="help-tooltip" role="tooltip" hidden={!visible}
      style={position ?? { visibility: 'hidden' }}>{children}</span>
  </span>;
}

export function HelpLabel({ htmlFor, label, hint, hintId, suffix }: {
  htmlFor: string; label: string; hint: ReactNode; hintId: string; suffix?: ReactNode;
}) {
  return <div className="field-label">
    <label htmlFor={htmlFor}>{label}{suffix && <> {suffix}</>}</label>
    <HelpTip label={label} id={hintId}>{hint}</HelpTip>
  </div>;
}
