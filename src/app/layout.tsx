import type { Metadata, Viewport } from 'next';
import { PwaProvider, PwaUpdateNotice } from '@/components/pwa/pwa-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Memento Vivere — Tu vida, mes a mes',
  applicationName: 'Memento Vivere',
  description: 'Visualiza tu vida en meses y conserva los recuerdos de cada etapa.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Memento Vivere', statusBarStyle: 'default' },
  other: { 'app-version': process.env.NEXT_PUBLIC_APP_VERSION ?? 'development' },
};
export const viewport: Viewport = { themeColor: '#191e1b' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><PwaProvider>{children}<PwaUpdateNotice /></PwaProvider></body></html>;
}
