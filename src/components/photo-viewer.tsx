'use client';
import { useEffect, useState } from 'react';
import { Dialog } from './dialog';
import { Icon } from './icons';
export function PhotoViewer({ title, photoIds, initialIndex, onClose, fullscreen, onFullscreenChange }: {
  title: string;
  photoIds: string[];
  initialIndex: number;
  onClose: () => void;
  fullscreen: boolean;
  onFullscreenChange: (fullscreen: boolean) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const multiple = photoIds.length > 1;
  const fullscreenLabel = fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa';
  useEffect(() => {
    if (!fullscreen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [fullscreen]);
  function move(direction: -1 | 1) {
    setIndex(value => Math.max(0, Math.min(photoIds.length - 1, value + direction)));
  }
  return <Dialog
    title={title}
    className={`lightbox-dialog${fullscreen ? ' lightbox-dialog--fullscreen' : ''}`}
    onClose={onClose}
    onCancel={() => fullscreen ? onFullscreenChange(false) : onClose()}
    headerActions={<button
      type="button"
      className="button secondary photo-fullscreen-toggle"
      aria-label={fullscreenLabel}
      aria-pressed={fullscreen}
      title={fullscreenLabel}
      onClick={() => onFullscreenChange(!fullscreen)}
    >
      <Icon name={fullscreen ? 'collapse' : 'expand'} size={18} />
      <span>{fullscreenLabel}</span>
    </button>}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        move(event.key === 'ArrowLeft' ? -1 : 1);
      }
    }}
  >
    <div className="lightbox-stage">
      <img
        className="lightbox-image"
        draggable={false}
        src={`/api/photos/${photoIds[index]}`}
        alt={`${title}, fotografía ${index + 1} de ${photoIds.length}`}
      />
      {multiple && <>
        <button
          type="button"
          className="icon-button bordered photo-navigation photo-previous"
          aria-label="Fotografía anterior"
          disabled={index === 0}
          onClick={() => move(-1)}
        >
          <Icon name="chevron" style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button
          type="button"
          className="icon-button bordered photo-navigation photo-next"
          aria-label="Fotografía siguiente"
          disabled={index === photoIds.length - 1}
          onClick={() => move(1)}
        >
          <Icon name="chevron" />
        </button>
      </>}
    </div>
    <p className="photo-counter" role="status" aria-live="polite" aria-atomic="true">{index + 1} de {photoIds.length}</p>
  </Dialog>;
}
