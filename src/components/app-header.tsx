'use client';
import { ThemeSwitch } from './theme-switch';
import { AccountMenu } from './account-menu';
import type { User } from '@/domain/types';

export function AppHeader({ user, onHome, onLogout, busy = false }: {
  user?: User | null; onHome?: () => void; onLogout?: () => void; busy?: boolean;
}) {
  return <header className="site-header page-width">
    <button className="brand" onClick={onHome} aria-label="Memento Vivere, volver a la cuadrícula">
      <span className="brand-mark"><img src="/icon.svg" alt="" aria-hidden="true" width={54} height={54} /></span>
      <span>Memento <strong>Vivere</strong><small>Una vida representada en meses</small></span>
    </button>
    <div className="header-right">
      <ThemeSwitch />
      {user && onLogout && <AccountMenu key={user.id} user={user} onLogout={onLogout} busy={busy} />}
    </div>
  </header>;
}
