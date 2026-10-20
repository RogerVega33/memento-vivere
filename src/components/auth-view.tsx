'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from './api';
import { Icon } from './icons';
import { HelpLabel, HelpTip } from './help-tip';
import { OnboardingIntro } from './onboarding';
import { useHistoryPanel } from './use-history-panel';
import type { AuthResponse } from '@/domain/types';

type Action = 'login' | 'register' | 'recover';
const actions = ['login', 'register', 'recover'] as const;
export function AuthView({ onAuthenticated, notice }: { onAuthenticated: (result: AuthResponse, action: Action) => void; notice: string }) {
  const [action, navigate] = useHistoryPanel<Action>('login', actions);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [phrase, setPhrase] = useState('');
  const [visible, setVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title = useRef<HTMLHeadingElement>(null);
  const previousAction = useRef<Action>('login');
  const creating = action !== 'login';
  const heading = action === 'register' ? 'Crea tu cuenta' : action === 'recover' ? 'Recupera tu cuenta' : 'Inicia sesión';

  useEffect(() => {
    if (previousAction.current === action) return;
    previousAction.current = action;
    title.current?.focus({ preventScroll: true });
    setPassword(''); setConfirmation(''); setPhrase(''); setVisible(false); setConfirmationVisible(false); setError('');
  }, [action]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (creating && password !== confirmation) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    try {
      const result = await api<AuthResponse>(`/api/auth/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, ...(action === 'recover' ? { recoveryPhrase: phrase } : {}) }),
      });
      if (creating && !result.recoveryPhrase) throw new Error('No se recibieron las palabras de recuperación. Inténtalo de nuevo.');
      setPassword(''); setConfirmation(''); setPhrase('');
      onAuthenticated(result, action);
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo acceder.'); }
    finally { setBusy(false); }
  }

  return <main className={`onboarding auth-page page-width${creating ? ' auth-page--centered' : ''}`}>
    {action === 'login' && <OnboardingIntro />}
    <section className="setup-card auth-card" aria-labelledby="auth-title">
      <div className="auth-card-heading">
        <div className="round-icon"><Icon name="hourglass" size={25} /></div>
        <div className="heading-with-help">
          <h2 id="auth-title" ref={title} tabIndex={-1}>{heading}</h2>
          {creating && <HelpTip label={heading}>{action === 'register' ? 'Solo necesitas un usuario y una contraseña. Recibirás ocho palabras para recuperar tu cuenta.' : 'Introduce tu usuario, tus ocho palabras en orden y una nueva contraseña. Al recuperar la cuenta recibirás otras palabras.'}</HelpTip>}
        </div>
      </div>
      {notice && <p className="confirmation-note session-notice" role="status">{notice}</p>}
      <form onSubmit={event => void submit(event)} aria-busy={busy}>
        {creating ? <HelpLabel htmlFor="username" label="Nombre de usuario" hintId="username-hint" hint="De 3 a 50 caracteres: letras sin acentos, números o @ . _ -. Sin espacios." /> : <label htmlFor="username">Nombre de usuario</label>}
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={50} pattern="[a-zA-Z0-9@._\-]+" value={username} disabled={busy} onChange={event => setUsername(event.target.value)} aria-describedby={creating ? 'username-hint' : undefined} />
        {action === 'recover' && <>
          <HelpLabel htmlFor="recovery-phrase" label="Palabras de recuperación" hintId="phrase-hint" hint="Escribe las ocho palabras en el orden en que las guardaste, separadas por espacios o guiones. No importan las mayúsculas." />
          <textarea id="recovery-phrase" name="recoveryPhrase" required maxLength={512} rows={3} autoComplete="off" autoCapitalize="none" spellCheck={false} value={phrase} disabled={busy} onChange={event => setPhrase(event.target.value)} aria-describedby="phrase-hint" />
        </>}
        {creating ? <HelpLabel htmlFor="password" label={action === 'recover' ? 'Nueva contraseña' : 'Contraseña'} hintId="password-hint" hint="Entre 12 y 128 caracteres." /> : <label htmlFor="password">Contraseña</label>}
        <div className="password-input">
          <input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete={creating ? 'new-password' : 'current-password'} required minLength={creating ? 12 : 1} maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} aria-describedby={creating ? 'password-hint' : undefined} />
          <button className="password-visibility" type="button" disabled={busy} onClick={() => setVisible(value => !value)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-controls="password" aria-pressed={visible}><Icon name={visible ? 'eye-off' : 'eye'} size={20} /></button>
        </div>
        {creating && <>
          <label htmlFor="confirmation">Confirmar contraseña</label>
          <div className="password-input">
            <input id="confirmation" name="confirmation" type={confirmationVisible ? 'text' : 'password'} autoComplete="new-password" required maxLength={128} value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} />
            <button className="password-visibility" type="button" disabled={busy} onClick={() => setConfirmationVisible(value => !value)} aria-label={confirmationVisible ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'} aria-controls="confirmation" aria-pressed={confirmationVisible}><Icon name={confirmationVisible ? 'eye-off' : 'eye'} size={20} /></button>
          </div>
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button primary full-width" type="submit" disabled={busy}>{busy ? 'Un momento…' : action === 'register' ? 'Crear cuenta' : action === 'recover' ? 'Recuperar cuenta' : 'Iniciar sesión'}</button>
      </form>
      <nav className="auth-links" aria-label="Acceso a tu cuenta">
        {action === 'login' ? <>
          <button className="text-button" disabled={busy} onClick={() => navigate('recover')}>¿Olvidaste tu contraseña?</button>
          <p>¿Primera vez aquí? <button className="text-button" disabled={busy} onClick={() => navigate('register')}>Crea tu cuenta</button></p>
        </> : <button className="text-button" disabled={busy} onClick={() => navigate('login')}>Volver a iniciar sesión</button>}
      </nav>
    </section>
  </main>;
}

export function RecoveryWords({ username, phrase, recovered, onContinue }: { username: string; phrase: string; recovered: boolean; onContinue: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  async function copy() {
    try { await navigator.clipboard.writeText(phrase); setCopied(true); setError(''); }
    catch { setError('No se pudo copiar. Selecciona las palabras y cópialas o anótalas a mano.'); }
  }
  return <main className="recovery-page page-width">
    <section className="setup-card recovery-card" aria-labelledby="recovery-title">
      <span className="eyebrow">{recovered ? 'CONTRASEÑA ACTUALIZADA' : 'CUENTA CREADA'}</span>
      <h1 id="recovery-title" ref={title} tabIndex={-1}>Guarda tus palabras de recuperación</h1>
      <p>Anota estas ocho palabras en orden junto con tu usuario <strong>{username}</strong>. Las necesitarás si olvidas tu contraseña.</p>
      <ol className="recovery-words" aria-label="Palabras de recuperación en orden">{phrase.split(' ').map((word, index) => <li key={index}><span aria-hidden="true">{index + 1}.</span><strong>{word}</strong></li>)}</ol>
      <button type="button" className="text-button" onClick={() => void copy()}>{copied ? 'Palabras copiadas' : 'Copiar palabras'}</button>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="recovery-notice">Solo se muestran esta vez. {recovered && 'Estas palabras reemplazan las anteriores y se han cerrado las sesiones previas. '}Guárdalas en un lugar privado: permiten recuperar tu cuenta.</p>
      <form onSubmit={event => { event.preventDefault(); if (saved) onContinue(); }}>
        <label className="recovery-confirmation"><input type="checkbox" required checked={saved} onChange={event => setSaved(event.target.checked)} /><span>Ya guardé mi usuario y las ocho palabras en orden.</span></label>
        <button className="button primary full-width" type="submit" disabled={!saved}>Continuar a mi historia</button>
      </form>
    </section>
  </main>;
}
