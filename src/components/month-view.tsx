'use client';
import { useCallback, useEffect, useState } from 'react';
import { formatMonth } from '@/domain/dates.mjs';
import { monthNavigation } from '@/domain/month-navigation.mjs';
import { matchesMemory } from '@/domain/memories.mjs';
import type { Memory, Snapshot, Profile } from '@/domain/types';
import { api } from './api';
import { Icon } from './icons';
import { Dialog } from './dialog';
import { MemoryCard } from './memory-card';
import { PhotoViewer } from './photo-viewer';
import { createLatestRequest } from './latest-request.mjs';
export function MonthView({ month, state, revision, paused, query, onNavigate, onAdd, onEdit, onChanged }: {
  month: string;
  state: Snapshot & {
    profile: Profile;
  };
  revision: number;
  paused: boolean;
  query: string;
  onNavigate: (month: string) => void;
  onAdd: () => void;
  onEdit: (memory: Memory) => void;
  onChanged: () => void;
}) {
  const [entries, setEntries] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<Memory | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [onlyWithMemories, setOnlyWithMemories] = useState(false);
  const [lightbox, setLightbox] = useState<{
    photoIds: string[];
    title: string;
    index: number;
  } | null>(null);
  const [requests] = useState(createLatestRequest);
  const refresh = useCallback(async () => {
    const request = requests.start();
    try {
      const data = await api<Memory[]>(`/api/memories?month=${month}`, { signal: request.signal });
      if (request.isCurrent()) {
        setEntries(data);
        setError('');
      }
    }
    catch (error) {
      if (request.isCurrent())
        setError(error instanceof Error ? error.message : 'No se pudieron cargar los recuerdos.');
    }
    finally {
      if (request.isCurrent())
        setLoading(false);
    }
  }, [month, requests]);
  useEffect(() => {
    setLoading(true);
    setEntries([]);
    setError('');
    void refresh();
    return () => requests.cancel();
  }, [refresh, revision, requests]);
  useEffect(() => {
    if (paused || deleting)
      return;
    function sync() {
      if (document.visibilityState === 'visible')
        void refresh();
    }
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [refresh, paused, deleting]);
  async function remove() {
    if (!deleting || busy)
      return;
    setBusy(true);
    setDeleteError('');
    try {
      await api(`/api/memories/${deleting.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: deleting.version }) });
      setDeleting(null);
      await refresh();
      onChanged();
    }
    catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'No se pudo eliminar el recuerdo.');
    }
    finally {
      setBusy(false);
    }
  }
  const first = state.profile.birthDate.slice(0, 7);
  const current = state.today.slice(0, 7);
  const filtered = entries.filter(memory => matchesMemory(memory, query));
  const navigationCounts = query.trim() ? state.search?.query === query.trim() ? state.search.monthCounts : {} : state.monthCounts;
  const { previous, next } = monthNavigation(month, first, current, navigationCounts, onlyWithMemories);
  return <section id="selected-month" className="month-panel" aria-labelledby="selected-month-heading">
    <span className="eyebrow">RECUERDOS DEL MES</span>
    <div className="month-toolbar">
      <div className="month-browsing">
        <div className="month-navigation">
          <button
            className="icon-button bordered"
            aria-label={onlyWithMemories ? 'Mes anterior con recuerdos' : 'Mes anterior'}
            disabled={!previous}
            onClick={() => {
              if (previous)
                onNavigate(previous);
            }}
          >
            <Icon name="chevron" style={{ transform: 'rotate(180deg)' }} />
          </button>
          <h2 id="selected-month-heading" className="month-title">
            {formatMonth(month, false)} {month.slice(0, 4)}
          </h2>
          <button
            className="icon-button bordered"
            aria-label={onlyWithMemories ? 'Mes siguiente con recuerdos' : 'Mes siguiente'}
            disabled={!next}
            onClick={() => {
              if (next)
                onNavigate(next);
            }}
          >
            <Icon name="chevron" />
          </button>
        </div>
        <label className="memory-navigation-option">
          <input
            type="checkbox"
            checked={onlyWithMemories}
            onChange={event => setOnlyWithMemories(event.target.checked)}
          />
          Saltar meses sin recuerdos al navegar
        </label>
      </div>
      <div className="month-toolbar-right">
        <span className="entry-count">{filtered.length} {filtered.length === 1 ? 'recuerdo' : 'recuerdos'}{query.trim() ? ' con coincidencias' : ''}</span>
        {month !== current && <button className="text-button" onClick={() => onNavigate(current)}>Mes actual<Icon name="calendar" size={16} /></button>}
        <button className="button primary" onClick={onAdd}><Icon name="plus" size={18} />Añadir recuerdo</button>
      </div>
    </div>
    {error && <div className="error" role="alert">
      {error}
      <button className="text-button" onClick={() => void refresh()}>Reintentar</button>
    </div>}
    {loading ? (<div className="loading-state" role="status"><span className="loading-dot" />Abriendo tus recuerdos…</div>) : !error && filtered.length === 0 ? (<section className="empty-month">
      <Icon name="image" size={25} />
      <h3>
        {query.trim() ? 'No hay recuerdos que coincidan en este mes.' : 'Este mes todavía no tiene recuerdos.'}
      </h3>
      <p>
        {query.trim() ? 'Prueba otra palabra o limpia la búsqueda para ver todos los recuerdos.' : 'Una conversación, un viaje, un día cualquiera. ¿Qué te gustaría guardar?'}
      </p>
    </section>) : (<div className="memory-list">
      {filtered.map(memory => (<MemoryCard
        key={memory.id}
        memory={memory}
        onEdit={onEdit}
        onDelete={entry => {
          setDeleteError('');
          setDeleting(entry);
        }}
        onPhoto={(entry, index) => setLightbox({ photoIds: [...entry.photoIds], title: entry.title, index })}
      />))}
    </div>)}
    {deleting && <Dialog
      title="¿Eliminar este recuerdo?"
      className="small-dialog"
      onClose={() => {
        if (!busy)
          setDeleting(null);
      }}
    >
      <p className="dialog-intro">Se eliminará <strong>«{deleting.title}»</strong> y sus fotografías de forma definitiva. Esta acción no se puede deshacer.</p>
      {deleteError && <p className="error" role="alert">
        {deleteError}
      </p>}
      <div className="dialog-actions">
        <button className="button secondary" disabled={busy} onClick={() => setDeleting(null)} autoFocus>Cancelar</button>
        <button className="button danger" disabled={busy} onClick={() => void remove()}>
          {busy ? 'Eliminando…' : 'Eliminar recuerdo'}
        </button>
      </div>
    </Dialog>}
    {lightbox && <PhotoViewer
      title={lightbox.title}
      photoIds={lightbox.photoIds}
      initialIndex={lightbox.index}
      onClose={() => setLightbox(null)}
    />}
  </section>;
}
