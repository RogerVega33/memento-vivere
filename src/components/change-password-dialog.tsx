'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from './api';
import { Dialog } from './dialog';
import { Icon } from './icons';
import { HelpLabel } from './help-tip';

const fields = [
  { name: 'currentPassword', label: 'Contraseña actual', visibilityLabel: 'contraseña actual' },
  { name: 'newPassword', label: 'Nueva contraseña', visibilityLabel: 'nueva contraseña' },
  { name: 'confirmation', label: 'Confirmar nueva contraseña', visibilityLabel: 'confirmación de contraseña' },
] as const;

export function ChangePasswordDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmation: '' });
  const [visible, setVisible] = useState({ currentPassword: false, newPassword: false, confirmation: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const currentInput = useRef<HTMLInputElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  useEffect(() => { currentInput.current?.focus(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    if (values.newPassword !== values.confirmation) { setError('Las contraseñas no coinciden.'); confirmationInput.current?.focus(); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      await api('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }) });
      setValues({ currentPassword: '', newPassword: '', confirmation: '' });
      onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo cambiar la contraseña.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <Dialog title="Cambiar contraseña" titleHelp="Tu sesión actual seguirá abierta. Las demás sesiones se cerrarán. Tus palabras de recuperación seguirán siendo las mismas." onClose={() => { if (!inFlight.current) onClose(); }} className="password-change-dialog">
    <form className="password-change-form" onSubmit={event => void submit(event)} aria-busy={busy}>
      {fields.map(field => <div className="password-change-field" key={field.name}>
        {field.name === 'newPassword' ? <HelpLabel htmlFor={`change-${field.name}`} label={field.label} hintId="change-password-hint" hint="Entre 12 y 128 caracteres." /> : <label htmlFor={`change-${field.name}`}>{field.label}</label>}
        <div className="password-input">
          <input id={`change-${field.name}`} name={field.name} type={visible[field.name] ? 'text' : 'password'}
            ref={field.name === 'currentPassword' ? currentInput : field.name === 'confirmation' ? confirmationInput : undefined}
            autoComplete={field.name === 'currentPassword' ? 'current-password' : 'new-password'}
            minLength={field.name === 'currentPassword' ? 1 : 12} maxLength={128} required disabled={busy} value={values[field.name]}
            aria-describedby={field.name === 'newPassword' ? 'change-password-hint' : undefined}
            onChange={event => { const value = event.target.value; setValues(previous => ({ ...previous, [field.name]: value })); setError(''); }} />
          <button type="button" className="password-visibility" disabled={busy} aria-controls={`change-${field.name}`} aria-pressed={visible[field.name]}
            aria-label={`${visible[field.name] ? 'Ocultar' : 'Mostrar'} ${field.visibilityLabel}`}
            onClick={() => setVisible(previous => ({ ...previous, [field.name]: !previous[field.name] }))}><Icon name={visible[field.name] ? 'eye-off' : 'eye'} size={20} /></button>
        </div>
      </div>)}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
      </div>
    </form>
  </Dialog>;
}
