import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { buildPwa, pwaVersion } from '../scripts/pwa.mjs';
import configuration from '../next.config.mjs';
import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';

test('Next shares a stable version with the page and serves worker/manifest with explicit non-cacheable headers', async () => {
  const config = await configuration(PHASE_PRODUCTION_BUILD);
  assert.equal(config.env.NEXT_PUBLIC_APP_VERSION, await config.generateBuildId());
  const rules = await config.headers();
  for (const route of ['/sw.js', '/manifest.webmanifest']) {
    const headers = new Map(rules.find(rule => rule.source === route).headers.map(header => [header.key, header.value]));
    assert.match(headers.get('Cache-Control'), /no-store/);
    assert(headers.get('Content-Type'));
    if (route === '/sw.js') assert.equal(headers.get('Service-Worker-Allowed'), '/');
  }
});

test('PWA icons preserve the app mark, declared dimensions and opaque maskable background', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url)));
  assert.equal(manifest.name, 'Memento Vivere');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  for (const icon of [...manifest.icons, { src: '/apple-touch-icon.png', sizes: '180x180', purpose: 'apple' }]) {
    const source = sharp(new URL('../public' + icon.src, import.meta.url).pathname);
    const metadata = await source.metadata();
    assert.equal(`${metadata.width}x${metadata.height}`, icon.sizes);
    assert.equal(metadata.format, 'png');
    if (icon.purpose !== 'any') {
      const { data, info } = await source.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let pixel = 3; pixel < data.length; pixel += info.channels) assert.equal(data[pixel], 255);
    }
  }
});

test('build creates a versioned worker from public Next assets without running an app or accessing storage', async t => {
  const root = await mkdtemp(join(tmpdir(), 'memento-pwa-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['src', 'public', 'pwa', 'scripts', '.next/static/chunks', '.next/server']) await mkdir(join(root, directory), { recursive: true });
  for (const file of ['package.json', 'package-lock.json', 'next.config.mjs', 'scripts/pwa.mjs', 'pwa/service-worker.js']) {
    await cp(new URL('../' + file, import.meta.url), join(root, file));
  }
  const names = ['icon.svg', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png', 'apple-touch-icon.png', 'manifest.webmanifest'];
  for (const name of names) await cp(new URL('../public/' + name, import.meta.url), join(root, 'public', name));
  await writeFile(join(root, 'src/app.tsx'), 'export const app = "ficticio";');
  await writeFile(join(root, '.next/static/chunks/app.js'), 'console.log("interfaz pública ficticia");');
  await writeFile(join(root, '.next/static/chunks/app.css'), 'body { color: red }');
  await writeFile(join(root, '.next/static/chunks/app.js.map'), 'source maps are not precached');
  await writeFile(join(root, '.next/server/private.js'), 'PRIVATE_DO_NOT_CACHE');
  const version = await pwaVersion(root);
  assert.match(version, /^memento-vivere-static-[a-f0-9]{16}$/);
  await writeFile(join(root, '.next/BUILD_ID'), version);
  const first = await buildPwa(root);
  const worker = await readFile(join(root, 'public/sw.js'), 'utf8');
  assert.equal(first.version, version);
  assert.deepEqual(first.assets, ['/', ...names.map(name => '/' + name), '/_next/static/chunks/app.css', '/_next/static/chunks/app.js']);
  assert(!worker.includes('__PWA_CONFIG__'));
  assert(!worker.includes('PRIVATE_DO_NOT_CACHE'));
  assert(!first.assets.some(path => path.startsWith('/api') || path.endsWith('.map')));
  assert.deepEqual(await buildPwa(root), first);
  assert.equal(await readFile(join(root, 'public/sw.js'), 'utf8'), worker);
  assert.equal(await pwaVersion(root), version, 'Generated workers must not change the source version.');
  await writeFile(join(root, '.next/static/chunks/app.js'), 'console.log("compilación distinta");');
  assert.notEqual((await buildPwa(root)).cacheName, first.cacheName);
  await writeFile(join(root, 'src/app.tsx'), 'export const app = "otra interfaz ficticia";');
  assert.notEqual(await pwaVersion(root), version);
  await writeFile(join(root, '.next/BUILD_ID'), 'invalid');
  await assert.rejects(buildPwa(root), /versión válida/);
});
