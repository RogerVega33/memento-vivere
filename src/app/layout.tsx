import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Memento Vivere — Tu vida, mes a mes', description: 'Visualiza tu vida en meses y conserva los recuerdos de cada etapa.', icons: { icon: '/icon.svg' } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
