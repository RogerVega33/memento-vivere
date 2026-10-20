'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export function MapFullscreen({ children, onClose }: {
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (<dialog
    ref={dialog}
    className="map-fullscreen"
    aria-labelledby="life-map-title"
    onCancel={event => {
      event.preventDefault();
      onClose();
    }}
  >
    {children}
  </dialog>);
}
