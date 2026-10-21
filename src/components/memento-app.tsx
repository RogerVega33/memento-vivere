'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, setApiUser } from './api';
import { createLatestRequest } from './latest-request.mjs';
import { AppHeader } from './app-header';
import { AuthView, RecoveryWords } from './auth-view';
import { Onboarding } from './onboarding';
import { LifeGrid } from './life-grid';
import { MonthView } from './month-view';
import { MemoryEditor } from './memory-editor';
import { Icon } from './icons';
import { monthKey } from '@/domain/dates.mjs';
import type { AuthResponse, Memory, SessionResponse, Snapshot, User } from '@/domain/types';
export function MementoApp() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [recovery, setRecovery] = useState<{ phrase: string; recovered: boolean } | null>(null);
  const [requests] = useState(createLatestRequest);
  const channel = useRef<BroadcastChannel | null>(null);
  const currentUserId = useRef<string | null>(null);
  const checkSession = useCallback(async () => {
    const request = requests.start();
    try {
      const result = await api<SessionResponse>('/api/auth/session', { signal: request.signal });
      if (!request.isCurrent()) return;
      const id = result.user?.id ?? null;
      if (currentUserId.current !== id) setRecovery(null);
      currentUserId.current = id;
      setApiUser(id);
      setUser(result.user);
      setChecking(false); setError('');
    } catch (error) {
      if (request.isCurrent()) setError(error instanceof Error ? error.message : 'No se pudo comprobar tu sesión.');
    }
  }, [requests]);
  useEffect(() => {
    void checkSession();
    function sync() { if (document.visibilityState === 'visible') void checkSession(); }
    function expired() {
      requests.cancel(); setUser(null); setRecovery(null); setChecking(false);
      currentUserId.current = null;
      setApiUser(null);
      setNotice('Tu sesión terminó. Inicia sesión de nuevo para volver a tu historia.');
    }
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('memento-session');
      channel.current.onmessage = () => {
        requests.cancel(); setUser(null); setRecovery(null); setChecking(true);
        currentUserId.current = null; setApiUser(null);
        void checkSession();
      };
    }
    window.addEventListener('focus', sync);
    window.addEventListener('pageshow', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('memento:session-expired', expired);
    return () => {
      requests.cancel(); channel.current?.close();
      window.removeEventListener('focus', sync);
      window.removeEventListener('pageshow', sync);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('memento:session-expired', expired);
    };
  }, [checkSession, requests]);
  function authenticated(result: AuthResponse, action: 'login' | 'register' | 'recover') {
    requests.cancel(); setError(''); setNotice(''); setChecking(false);
    currentUserId.current = result.user.id;
    setApiUser(result.user.id);
    setUser(result.user);
    setRecovery(result.recoveryPhrase ? { phrase: result.recoveryPhrase, recovered: action === 'recover' } : null);
    channel.current?.postMessage('changed');
  }
  async function logout() {
    if (signingOut) return;
    setSigningOut(true); setError('');
    try {
      await api('/api/auth/logout', { method: 'POST' });
      requests.cancel(); setUser(null); setRecovery(null); setNotice('');
      currentUserId.current = null;
      setApiUser(null);
      channel.current?.postMessage('changed');
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo cerrar la sesión.'); }
    finally { setSigningOut(false); }
  }
  if (user && !recovery) return <LifeApp key={user.id} user={user} onLogout={() => void logout()} signingOut={signingOut} sessionError={error} />;
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Saltar al contenido</a>
    <AppHeader user={user} onLogout={user ? () => void logout() : undefined} busy={signingOut} />
    <div id="main-content" tabIndex={-1}>
      {checking ? <main className="page-width loading-state">{error ? <div className="error" role="alert">{error}<button className="button secondary" onClick={() => void checkSession()}>Reintentar</button></div> : <span role="status">Preparando un lugar para tu historia…</span>}</main>
        : recovery && user ? <RecoveryWords username={user.username} phrase={recovery.phrase} recovered={recovery.recovered} onContinue={() => setRecovery(null)} />
          : <AuthView onAuthenticated={authenticated} notice={notice} />}
    </div>
    <footer className="site-footer page-width"><p>Memento mori. Memento vivere.</p></footer>
  </div>;
}

function LifeApp({ user, onLogout, signingOut, sessionError }: { user: User; onLogout: () => void; signingOut: boolean; sessionError: string }) {
  const [state, setState] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [month, setMonth] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    memory?: Memory;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const initialMonthSelected = useRef(false);
  const [requests] = useState(createLatestRequest);
  const refresh = useCallback(async () => {
    const request = requests.start();
    try {
      const data = await api<Snapshot>(`/api/state${query.trim() ? `?query=${encodeURIComponent(query.trim())}` : ''}`, { signal: request.signal });
      if (request.isCurrent()) {
        setState(data);
        setError('');
      }
    }
    catch (error) {
      if (request.isCurrent())
        setError(error instanceof Error ? error.message : 'No se pudo abrir tu historia.');
    }
  }, [query, requests]);
  useEffect(() => {
    void refresh();
    function sync() {
      if (document.visibilityState === 'visible')
        void refresh();
    }
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      requests.cancel();
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [refresh, requests]);
  useEffect(() => {
    if (state && !state.profile) {
      initialMonthSelected.current = false;
      setMonth(null);
      setEditor(null);
    }
    if (state?.profile && !initialMonthSelected.current) {
      initialMonthSelected.current = true;
      setMonth(state.today.slice(0, 7));
    }
    if (state?.profile && month && (month < state.profile.birthDate.slice(0, 7) || month > state.today.slice(0, 7))) {
      setMonth(null);
      setEditor(null);
    }
  }, [state, month]);
  useEffect(() => {
    if (!toast)
      return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(key: string | null) {
    setMonth(key);
    if (key === null)
      window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function saved(memory: Memory) {
    setEditor(null);
    setMonth(monthKey(memory.year, memory.month));
    setRevision(value => value + 1);
    setToast('Un recuerdo más en tu historia.');
    void refresh();
  }
  return (<div className={`app-shell${state?.profile ? ' app-shell--overview' : ''}`}>
    <a href="#main-content" className="skip-link">Saltar al contenido</a>
    <AppHeader user={user} onHome={() => { if (!editor) navigate(null); }} onLogout={onLogout} busy={signingOut} />
    <div id="main-content" tabIndex={-1}>
      {sessionError && <p className="page-width error" role="alert">{sessionError}</p>}
      {!state ? (<main className="page-width loading-state">
        {error ? (<div className="error" role="alert">
          {error}
          <button className="button secondary" onClick={() => void refresh()}>Reintentar</button>
        </div>) : <span role="status">Preparando un lugar para tu historia…</span>}
      </main>) : !state.profile ? (<Onboarding today={state.today} onSetup={setState} />) : (<>
        {error && <div className="page-width">
          <p className="error" role="alert">
            {error}
          </p>
        </div>}
        <main className="page-width dashboard">
          <LifeGrid
            state={{ ...state, profile: state.profile }}
            selectedMonth={month}
            onSelect={navigate}
            query={query}
            onSearch={setQuery}
          />
          {month ? (<MonthView
            month={month}
            state={{ ...state, profile: state.profile }}
            revision={revision}
            paused={editor !== null}
            query={query}
            onNavigate={navigate}
            onAdd={() => setEditor({})}
            onEdit={memory => setEditor({ memory })}
            onChanged={() => {
              setToast('Recuerdo eliminado.');
              void refresh();
            }}
          />) : (<section className="month-placeholder" aria-label="Recuerdos del mes">
            <div>
              <Icon name="calendar" size={20} />
              <p>Selecciona un mes en el mapa para ver y guardar sus recuerdos aquí.</p>
            </div>
            <button className="text-button" onClick={() => navigate(state.today.slice(0, 7))}>Ver este mes<Icon name="chevron" size={16} /></button>
          </section>)}
        </main>
        {editor && (<MemoryEditor
          memory={editor.memory}
          selectedMonth={month ?? state.today.slice(0, 7)}
          birthDate={state.profile.birthDate}
          today={state.today}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />)}
      </>)}
    </div>
    <footer className="site-footer page-width">
      <p>Memento mori. Memento vivere.</p>
    </footer>
    {toast && <div className="toast" role="status">
      <Icon name="check" size={17} />
      {toast}
    </div>}
  </div>);
}
