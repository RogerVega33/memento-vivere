'use client';
import { Icon } from './icons';

export function AppFooter() {
  return <footer className="site-footer">
    <div className="footer-content page-width">
      <p className="footer-brand">Memento Vivere</p>
      <nav className="footer-links" aria-label="Enlaces del pie de página">
        <a className="footer-link" href="https://github.com/RogerVega33/memento-vivere"
          target="_blank" rel="noopener noreferrer" aria-label="Ver el proyecto en GitHub (se abre en otra pestaña)" title="Proyecto en GitHub">
          <Icon name="github" size={18} />
          GitHub
        </a>
        <button type="button" className="footer-link" onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' })}>
          <Icon name="arrow" size={18} style={{ transform: 'rotate(90deg)' }} />
          Volver arriba
        </button>
      </nav>
      <p className="footer-copyright">© {new Date().getFullYear()} Memento Vivere</p>
    </div>
  </footer>;
}
