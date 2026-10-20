'use client';
import { useEffect, useRef, type KeyboardEventHandler, type ReactNode } from 'react';
import { Icon } from './icons';
import { HelpTip } from './help-tip';
export function Dialog({ title, children, onClose, className = '', onKeyDown, titleHelp }: {
  title: string;
  titleHelp?: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDialogElement>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
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
    aria-labelledby="dialog-title"
    onKeyDown={onKeyDown}
    onCancel={event => {
      event.preventDefault();
      onClose();
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
      <div className="heading-with-help"><h2 id="dialog-title">{title}</h2>{titleHelp && <HelpTip label={title}>{titleHelp}</HelpTip>}</div>
      <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
    {children}
  </dialog>;
}
