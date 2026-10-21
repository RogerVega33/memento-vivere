'use client';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Dialog } from './dialog';
import { Icon } from './icons';
import { HelpLabel } from './help-tip';
import { api } from './api';
import { daysInMonth, monthKey, parseMonth } from '@/domain/dates.mjs';
import { validateMemory, singleLineDescription, LIMITS } from '@/domain/memories.mjs';
import { isSupportedPhotoFile, PHOTO_ACCEPT, PHOTO_FORMATS_LABEL } from '@/domain/photos.mjs';
import type { Memory } from '@/domain/types';
type NewPhoto = {
  id: string;
  file: File;
  url: string;
  previewFailed: boolean;
};
export function MemoryEditor({ memory, selectedMonth, birthDate, today, onClose, onSaved }: {
  memory?: Memory;
  selectedMonth: string;
  birthDate: string;
  today: string;
  onClose: () => void;
  onSaved: (memory: Memory) => void;
}) {
  const [title, setTitle] = useState(memory?.title ?? '');
  const [description, setDescription] = useState(() => singleLineDescription(memory?.description ?? ''));
  const [tags, setTags] = useState((memory?.tags ?? []).join(', '));
  const [month, setMonth] = useState(memory ? monthKey(memory.year, memory.month) : selectedMonth);
  const [day, setDay] = useState(memory?.day?.toString() ?? '');
  const [retained, setRetained] = useState(memory?.photoIds ?? []);
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());
  const dirty = title !== (memory?.title ?? '') || description !== singleLineDescription(memory?.description ?? '') || tags !== (memory?.tags ?? []).join(', ') || month !== (memory ? monthKey(memory.year, memory.month) : selectedMonth) || day !== (memory?.day?.toString() ?? '') || retained.length !== (memory?.photoIds.length ?? 0) || photos.length > 0;
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls)
        URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function close() {
    if (!busy && (!dirty || window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')))
      onClose();
  }
  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    setError('');
    if (retained.length + photos.length + files.length > LIMITS.photosPerMemory) {
      setError(`Puedes añadir hasta ${LIMITS.photosPerMemory} fotografías.`);
      return;
    }
    if (files.some(file => file.size > LIMITS.fileBytes)) {
      setError('Cada fotografía puede pesar hasta 20 MB.');
      return;
    }
    if (files.some(file => !isSupportedPhotoFile(file))) {
      setError(`Utiliza fotografías ${PHOTO_FORMATS_LABEL}.`);
      return;
    }
    setPhotos(previous => [...previous, ...files.map(file => {
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      return { id: url, file, url, previewFailed: false };
    })]);
  }
  function removeNewPhoto(photo: NewPhoto) {
    URL.revokeObjectURL(photo.url);
    objectUrls.current.delete(photo.url);
    setPhotos(previous => previous.filter(value => value.id !== photo.id));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const date = parseMonth(month);
      const draft = validateMemory({ title, description, tags, ...date, day: day === '' ? null : Number(day) }, birthDate, today);
      setBusy(true);
      const form = new FormData();
      form.set('payload', JSON.stringify({ ...draft, retainedPhotoIds: retained, version: memory?.version }));
      for (const photo of photos)
        form.append('photos', photo.file);
      const saved = await api<Memory>(memory ? `/api/memories/${memory.id}` : '/api/memories', { method: memory ? 'PATCH' : 'POST', body: form });
      onSaved(saved);
    }
    catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo guardar el recuerdo.');
    }
    finally {
      setBusy(false);
    }
  }
  let maximumDay = 31;
  try {
    const parsed = parseMonth(month);
    maximumDay = month === today.slice(0, 7) ? Number(today.slice(8)) : daysInMonth(parsed.year, parsed.month);
  }
  catch { /* Native validation handles incomplete months. */ }
  const minimumDay = month === birthDate.slice(0, 7) ? Number(birthDate.slice(8)) : 1;
  return <Dialog title={memory ? 'Editar recuerdo' : 'Nuevo recuerdo'} onClose={close}>
    <form onSubmit={submit} className="memory-form">
      <fieldset disabled={busy}>
        <label htmlFor="memory-title">Título <span className="required-mark">*</span></label>
        <input
          id="memory-title"
          autoFocus
          required
          maxLength={LIMITS.titleLength}
          placeholder=""
          value={title}
          onChange={event => setTitle(event.target.value)}
        />
        <div className="date-fields">
          <div>
            <label htmlFor="memory-month">Mes y año <span className="required-mark">*</span></label>
            <input
              id="memory-month"
              type="month"
              required
              min={birthDate.slice(0, 7)}
              max={today.slice(0, 7)}
              value={month}
              onChange={event => setMonth(event.target.value)}
            />
          </div>
          <div>
            <HelpLabel htmlFor="memory-day" label="Día" suffix={<span className="optional-label">opcional</span>} hintId="memory-day-hint" hint="Si no recuerdas el día, puedes dejarlo vacío." />
            <input
              id="memory-day"
              aria-describedby="memory-day-hint"
              type="number"
              inputMode="numeric"
              step={1}
              min={minimumDay}
              max={maximumDay}
              placeholder="—"
              value={day}
              onChange={event => setDay(event.target.value)}
            />
          </div>
        </div>
        <label htmlFor="memory-description">Tu recuerdo <span className="optional-label">opcional</span></label>
        <textarea
          id="memory-description"
          rows={3}
          maxLength={LIMITS.descriptionLength}
          aria-describedby="memory-description-hint"
          placeholder="¿Qué pasó?"
          value={description}
          onKeyDown={event => {
            if (event.key === 'Enter')
              event.preventDefault();
          }}
          onChange={event => setDescription(singleLineDescription(event.target.value))}
        />
        <p id="memory-description-hint" className="field-hint description-hint">
          <span>{description.length}/{LIMITS.descriptionLength}</span>
        </p>
        <HelpLabel htmlFor="memory-tags" label="Etiquetas" suffix={<span className="optional-label">opcional</span>} hintId="memory-tags-hint" hint={`Sepáralas con comas. Hasta ${LIMITS.tagsPerMemory} etiquetas de ${LIMITS.tagLength} caracteres.`} />
        <input
          id="memory-tags"
          aria-describedby="memory-tags-hint"
          placeholder="Viajes, Familia, Amigos, Logros, Historias, ..."
          value={tags}
          onChange={event => setTags(event.target.value)}
        />
        <div className="photo-field-heading">
          <HelpLabel htmlFor="photos" label="Fotos" suffix={<span className="optional-label">opcional</span>} hintId="photo-restrictions" hint={`${PHOTO_FORMATS_LABEL}. Máximo ${LIMITS.photosPerMemory} fotos de 20 MB cada una.`} />
          <span>{retained.length + photos.length}/{LIMITS.photosPerMemory}</span>
        </div>
        <input
          ref={fileInput}
          className="visually-hidden"
          id="photos"
          type="file"
          accept={PHOTO_ACCEPT}
          aria-describedby="photo-restrictions"
          multiple
          onChange={addPhotos}
          tabIndex={-1}
        />
        {(retained.length + photos.length > 0) && <div className="photo-previews">
          {retained.map((id, index) => <div className="photo-preview" key={id}>
            <img src={`/api/photos/${id}`} alt={`Fotografía guardada ${index + 1}`} />
            <button
              type="button"
              aria-label={`Quitar fotografía guardada ${index + 1}`}
              onClick={() => setRetained(previous => previous.filter(value => value !== id))}
            >
              <Icon name="close" size={15} />
            </button>
          </div>)}
          {photos.map((photo, index) => <div className="photo-preview" key={photo.id}>
            {photo.previewFailed ? <div className="photo-preview-placeholder">
              <Icon name="image" size={24} />
              <span>
                {photo.file.name}
              </span>
              <small>Vista previa al guardar</small>
            </div> : <img
              src={photo.url}
              alt={`Nueva fotografía ${index + 1}`}
              onError={() => setPhotos(previous => previous.map(value => value.id === photo.id ? { ...value, previewFailed: true } : value))}
            />}
            <button
              type="button"
              aria-label={`Quitar nueva fotografía ${index + 1}`}
              onClick={() => removeNewPhoto(photo)}
            >
              <Icon name="close" size={15} />
            </button>
          </div>)}
        </div>}
        <button
          type="button"
          className="button secondary photo-add-button"
          aria-describedby="photo-restrictions"
          disabled={retained.length + photos.length >= LIMITS.photosPerMemory}
          onClick={() => fileInput.current?.click()}
        >
          <Icon name="image" size={17} />
          Añadir fotos
        </button>
      </fieldset>
      {error && <p className="error" role="alert">
        {error}
      </p>}
      <div className="dialog-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={close}>Cancelar</button>
        <button type="submit" className="button primary" disabled={busy}>
          <Icon name={busy ? 'hourglass' : 'check'} size={18} />
          {busy ? 'Guardando…' : 'Guardar recuerdo'}
        </button>
      </div>
    </form>
  </Dialog>;
}
