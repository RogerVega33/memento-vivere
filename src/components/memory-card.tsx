'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { Memory } from '@/domain/types';
import { formatMemoryDate } from '@/domain/dates.mjs';
import { Icon } from './icons';
export function MemoryCard({ memory, onEdit, onDelete, onPhoto }: {
  memory: Memory;
  onEdit: (memory: Memory) => void;
  onDelete: (memory: Memory) => void;
  onPhoto: (memory: Memory, index: number) => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const actionsId = useId();
  useEffect(() => {
    if (!actionsOpen) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !actionsRef.current?.contains(event.target)) setActionsOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [actionsOpen]);
  function chooseAction(action: (memory: Memory) => void) {
    setActionsOpen(false);
    triggerRef.current?.focus();
    action(memory);
  }
  return (<article className="memory-card">
    <div className="memory-card-top">
      <span className="memory-date">
        <Icon name="calendar" size={15} />
        {formatMemoryDate(memory)}
      </span>
      <div
        className="memory-actions"
        ref={actionsRef}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setActionsOpen(false);
        }}
        onKeyDown={event => {
          if (event.key === 'Escape' && actionsOpen) {
            event.preventDefault();
            event.stopPropagation();
            setActionsOpen(false);
            triggerRef.current?.focus();
          }
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          className="icon-button memory-actions-trigger"
          title="Opciones del recuerdo"
          aria-label={`Opciones de ${memory.title}`}
          aria-expanded={actionsOpen}
          aria-controls={actionsId}
          onClick={() => setActionsOpen(open => !open)}
        >
          <Icon name="more" size={19} />
        </button>
        {actionsOpen && <div id={actionsId} className="memory-actions-panel" role="group" aria-label={`Acciones de ${memory.title}`}>
          <button type="button" aria-label={`Editar ${memory.title}`} onClick={() => chooseAction(onEdit)}>
            <Icon name="edit" size={17} />Editar
          </button>
          <button type="button" className="delete-action" aria-label={`Eliminar ${memory.title}`} onClick={() => chooseAction(onDelete)}>
            <Icon name="trash" size={17} />Eliminar
          </button>
        </div>}
      </div>
    </div>
    <h2>
      {memory.title}
    </h2>
    {memory.description && <p className="memory-description">
      {memory.description}
    </p>}
    {memory.photoIds.length > 0 && (<div className="memory-photos" data-count={memory.photoIds.length}>
      {memory.photoIds.map((id, index) => (<button
        key={id}
        type="button"
        className="memory-photo"
        onClick={() => onPhoto(memory, index)}
        aria-label={`Ampliar fotografía ${index + 1} de ${memory.title}`}
      >
        <img loading="lazy" src={`/api/photos/${id}`} alt={`${memory.title}, fotografía ${index + 1}`} />
      </button>))}
    </div>)}
    {(memory.tags ?? []).length > 0 && <ul className="memory-tags" aria-label="Etiquetas">
      {memory.tags.map(tag => <li key={tag}>
        {tag}
      </li>)}
    </ul>}
  </article>);
}
