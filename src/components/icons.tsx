import type { CSSProperties, ReactNode } from 'react';
type Name = 'help' | 'hourglass' | 'arrow' | 'chevron' | 'plus' | 'close' | 'calendar' | 'image' | 'edit' | 'trash' | 'spark' | 'grid' | 'check' | 'expand' | 'collapse' | 'search' | 'more' | 'eye' | 'eye-off' | 'key' | 'logout' | 'download' | 'refresh' | 'github' | 'sun' | 'moon';
const paths: Record<Name, ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
  moon: <path strokeWidth="1.5" d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  github: <path fill="currentColor" stroke="none" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.438 9.8 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12Z" />,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5M6.3 6.3a8 8 0 0 1 13 2.7M4.7 15a8 8 0 0 0 13 2.7" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4M12 17h.01" /></>,
  key: <><circle cx="8" cy="8" r="5" /><path d="m11.5 11.5 9 9M17 17l3-3M14 14l3-3" /></>,
  logout: <><path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4" /></>,
  eye: <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
  'eye-off': <>
    <path d="m3 3 18 18M10.6 5.1A12 12 0 0 1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3 4M6.1 6.1A20 20 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.9-1.9M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </>,
  more: <>
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
  </>,
  hourglass: <>
    <path d="M6 3h12M6 21h12M8 3c0 5 0 6 4 9-4 3-4 4-4 9M16 3c0 5 0 6-4 9 4 3 4 4 4 9" />
    <path d="m9 18 3-3 3 3" />
  </>,
  search: <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m16 16 4 4" />
  </>,
  arrow: <path d="M19 12H5m6-6-6 6 6 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  calendar: <>
    <rect x="4" y="5" width="16" height="16" rx="3" />
    <path d="M8 3v4m8-4v4M4 11h16m-11 5h.01M14 16h.01" />
  </>,
  image: <>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="8" cy="8" r="1.5" />
    <path d="m3 17 5-5 4 4 4-6 5 7" />
  </>,
  edit: <>
    <path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z" />
  </>,
  trash: <>
    <path d="M3 6h18M9 6V3h6v3m-10 0 1 15h12l1-15M10 10v7m4-7v7" />
  </>,
  spark: <>
    <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
  </>,
  grid: <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </>,
  check: <path d="m5 12 4 4L19 6" />,
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
  collapse: <path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5" />,
};
export function Icon({ name, size = 20, className, style }: {
  name: Name;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    style={style}
  >
    {paths[name]}
  </svg>;
}
