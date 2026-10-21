'use client';
import { useEffect, useId, useRef, type KeyboardEventHandler, type ReactNode } from 'react';
import { Icon } from './icons';
import { HelpTip } from './help-tip';
export function Dialog({ title, children, onClose, className = '', onKeyDown, titleHelp, headerActions, onCancel }: {
  title: string;
  titleHelp?: string;
  children: ReactNode;
  onClose: () => void;
  onCancel?: () => void;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDialogElement>;
  headerActions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return <dialog
    ref={ref}
    className={`dialog ${className}`}
    aria-labelledby={titleId}
    onKeyDown={onKeyDown}
    onCancel={event => {
      event.preventDefault();
      (onCancel ?? onClose)();
    }}
    onClick={event => {
      if (event.target === event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
          onClose();
      }
    }}
  >
    <div className="dialog-top">
      <div className="heading-with-help"><h2 id={titleId}>{title}</h2>{titleHelp && <HelpTip label={title}>{titleHelp}</HelpTip>}</div>
      <div className="dialog-top-actions">
        {headerActions}
        <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
    </div>
    {children}
  </dialog>;
}
