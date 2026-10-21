'use client';
import { useState, type FormEvent } from 'react';
import { Icon } from './icons';
import { minimumBirthDate, MONTH_NAMES, parseDate, validateNewBirthDate } from '@/domain/dates.mjs';
import { api } from './api';
import type { Snapshot } from '@/domain/types';
export function Onboarding({ today, onSetup }: {
  today: string;
  onSetup: (state: Snapshot) => void;
}) {
  const [birthDate, setBirthDate] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      validateNewBirthDate(birthDate, today);
      if (!confirmed) {
        setConfirmed(true);
        return;
      }
      setBusy(true);
      onSetup(await api<Snapshot>('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ birthDate }) }));
    }
    catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo empezar.');
    }
    finally {
      setBusy(false);
    }
  }
  let preview = '';
  try {
    const date = parseDate(birthDate);
    preview = `${date.day} de ${MONTH_NAMES[date.month - 1]} de ${date.year}`;
  }
  catch { /* Incomplete input. */ }
  return <main className="onboarding page-width">
    <OnboardingIntro />
    <section className="setup-card" aria-labelledby="setup-title">
      <div className="round-icon">
        <Icon name="spark" size={25} />
      </div>
      <h2 id="setup-title">Toda historia tiene una fecha de inicio</h2>
      <form onSubmit={submit}>
        <label htmlFor="birthDate">Fecha de nacimiento</label>
        <input
          id="birthDate"
          aria-describedby="birth-date-hint"
          type="date"
          required
          min={minimumBirthDate(today)}
          max={today}
          value={birthDate}
          disabled={busy}
          onChange={event => {
            setBirthDate(event.target.value);
            setConfirmed(false);
          }}
        />
        <p id="birth-date-hint" className="field-hint birth-date-hint">Introduce tu fecha de nacimiento para generar tu calendario de vida. Esta fecha se configura una sola vez. Revísala antes de continuar.</p>
        {confirmed && <div className="confirmation-note birth-date-confirmation">Tu fecha de nacimiento será el <strong>
          {preview}
        </strong>. ¿Todo correcto?</div>}
        {error && <p className="error" role="alert">
          {error}
        </p>}
        <button className="button primary full-width" disabled={busy || !birthDate} type="submit">
          {busy ? 'Generando calendario…' : confirmed ? 'Confirmar y empezar' : 'Visualizar mi vida'}
          <Icon name="arrow" style={{ transform: 'rotate(180deg)' }} size={18} />
        </button>
      </form>

    </section>
  </main>;
}

export function OnboardingIntro() {
  return <div className="onboarding-copy">
    <h1 className="onboarding-quote">«No es que tengamos poco tiempo para vivir, sino que <em>desperdiciamos mucho»</em></h1>
    <p className="onboarding-attribution">— Séneca</p>
    <div className="sample-grid" aria-hidden="true">
      {Array.from({ length: 84 }, (_, i) => <span key={i} className={i === 44 ? 'sample-current' : i < 44 ? `sample-past ${[8, 20, 31, 38].includes(i) ? 'sample-memory' : ''}` : ''} />)}
    </div>
    <p className="onboarding-caption">Visualiza tu vida en meses y conserva los recuerdos de cada etapa.</p>
  </div>;
}
