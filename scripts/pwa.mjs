import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicAssets = ['icon.svg', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png', 'apple-touch-icon.png', 'manifest.webmanifest'];
const sourceExtensions = new Set(['.ts', '.tsx', '.mjs', '.js', '.css', '.json']);
const staticExtensions = new Set(['.js', '.css', '.woff', '.woff2', '.ttf', '.otf', '.svg', '.png', '.webp', '.ico']);

/** @param {string} directory @param {Set<string>} extensions @returns {Promise<string[]>} */
async function files(directory, extensions) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || /(^|\.)env($|\.)/.test(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path, extensions));
    else if (entry.isFile() && extensions.has(extname(entry.name))) result.push(path);
  }
  return result.sort();
}

/** Stable across identical builds; source/configuration changes produce an update.
 * Only explicit public/configuration inputs and source extensions are read.
 * @param {string} [root] */
export async function pwaVersion(root = project) {
  const hash = createHash('sha256');
  const inputs = ['package.json', 'package-lock.json', 'next.config.mjs', 'scripts/pwa.mjs', 'pwa/service-worker.js',
    ...publicAssets.map(name => `public/${name}`), ...(await files(join(root, 'src'), sourceExtensions)).map(path => path.slice(root.length + 1))];
  for (const name of inputs.sort()) hash.update(name).update(await readFile(join(root, name)));
  return 'memento-vivere-static-' + hash.digest('hex').slice(0, 16);
}

/** Generate after Next's successful build, without starting the app or storage.
 * @param {string} [root] */
export async function buildPwa(root = project) {
  const version = (await readFile(join(root, '.next/BUILD_ID'), 'utf8')).trim();
  if (!/^memento-vivere-static-[a-f0-9]{16}$/.test(version)) throw new Error('Falta una versión válida de la compilación PWA.');
  const directory = join(root, '.next/static');
  const staticFiles = await files(directory, staticExtensions);
  const assets = ['/', ...publicAssets.map(name => '/' + name), ...staticFiles.map(path => '/_next/static/' + path.slice(directory.length + 1))];
  const template = await readFile(join(root, 'pwa/service-worker.js'), 'utf8');
  // Isolate caches even if a different compiler emits different static assets.
  const hash = createHash('sha256').update(template).update(version);
  for (const path of staticFiles) hash.update(path.slice(directory.length + 1)).update(await readFile(path));
  for (const name of publicAssets) hash.update(name).update(await readFile(join(root, 'public', name)));
  const cacheName = 'memento-vivere-static-' + hash.digest('hex').slice(0, 16);
  await writeFile(join(root, 'public/sw.js'), template.replace('__PWA_CONFIG__', JSON.stringify({ version, cacheName, assets })));
  return { version, cacheName, assets };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildPwa();
