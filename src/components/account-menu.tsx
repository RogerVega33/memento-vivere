'use client';
import { useEffect, useRef, useState } from 'react';
import { usePopupMenu } from './use-popup-menu';
import { ChangePasswordDialog } from './change-password-dialog';
import { Icon } from './icons';
import { useHistoryPanel } from './use-history-panel';
import type { User } from '@/domain/types';

const panels = ['closed', 'password'] as const;
export function AccountMenu({ user, onLogout, busy }: { user: User; onLogout: () => void; busy: boolean }) {
  const menu = usePopupMenu();
  const [panel, navigate] = useHistoryPanel('closed', panels);
  const changingPassword = panel === 'password';
  const wasChangingPassword = useRef(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (wasChangingPassword.current && !changingPassword) menu.triggerRef.current?.focus({ preventScroll: true });
    wasChangingPassword.current = changingPassword;
  }, [changingPassword, menu.triggerRef]);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(timer);
  }, [saved]);
  function closeDialog() { navigate('closed'); }
  return <>
    <div className="account-controls" {...menu.rootProps}>
      <button ref={menu.triggerRef} type="button" className="account-avatar" aria-label={`Menú de la cuenta de ${user.username}`}
        aria-haspopup="menu" aria-expanded={menu.open} aria-controls={menu.open ? menu.menuId : undefined} disabled={busy} onClick={menu.toggle}>
        <span aria-hidden="true">{user.username[0]?.toLocaleUpperCase('es')}</span>
      </button>
      {menu.open && <div ref={menu.menuRef} id={menu.menuId} className="account-menu" role="menu" aria-label="Mi cuenta">
        <span className="account-menu-heading" aria-hidden="true">{user.username}</span>
        <button type="button" role="menuitem" tabIndex={-1} disabled={busy} onClick={() => { menu.close(); navigate('password'); }}><Icon name="key" size={18} />Cambiar contraseña</button>
        <button type="button" role="menuitem" tabIndex={-1} disabled={busy} onClick={() => { menu.close(); onLogout(); }}><Icon name="logout" size={18} />Cerrar sesión</button>
      </div>}
    </div>
    {changingPassword && <ChangePasswordDialog onClose={closeDialog} onSaved={() => { closeDialog(); setSaved(true); }} />}
    {saved && <div className="toast" role="status"><Icon name="check" size={17} />Contraseña actualizada.</div>}
  </>;
}
