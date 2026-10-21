import { readFile } from 'node:fs/promises';
import { PHASE_PRODUCTION_SERVER } from 'next/constants.js';
import { pwaVersion } from './scripts/pwa.mjs';

/** @param {string} phase @returns {Promise<import('next').NextConfig>} */
export default async function config(phase) {
  const version = phase === PHASE_PRODUCTION_SERVER
    ? (await readFile(new URL('./.next/BUILD_ID', import.meta.url), 'utf8')).trim()
    : await pwaVersion();
  return {
    poweredByHeader: false,
    env: { NEXT_PUBLIC_APP_VERSION: version },
    generateBuildId: async () => version,
    serverExternalPackages: ['sharp', 'pg'],
    async headers() {
      return [{
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      }, {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; connect-src 'self'" },
        ],
      }, {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      }];
    },
  };
}
