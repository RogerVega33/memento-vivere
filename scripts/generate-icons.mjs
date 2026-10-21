import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Match Kindle Notes: shrink the artwork to 75% around its center so launchers
// can enlarge or mask it without making the symbol look oversized.
const source = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const artwork = source.replace('<g id="artwork"', '<g id="artwork" transform="translate(32 32) scale(0.75) translate(-32 -32)"');
for (const [name, size, fullBackground] of /** @type {[string,number,boolean][]} */ ([
  ['pwa-192.png', 192, false], ['pwa-512.png', 512, false],
  ['pwa-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true],
])) {
  const svg = fullBackground ? artwork.replace(/(<rect id="background"[^>]*?)rx="[^"]*"/, '$1rx="0"') : artwork;
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url)));
}
