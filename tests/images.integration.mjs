import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { optimizePhoto } from '../src/server/images.mjs';
import { decodeHeic } from '../src/server/decode-heic.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runPhotoProcess } from '../src/server/photo-process.mjs';

test('large photographs become WebP within 1600px, preserving their proportions', async () => {
  const input = await sharp({ create: { width: 3200, height: 2400, channels: 3, background: '#a87a61' } }).jpeg().toBuffer();
  const output = await optimizePhoto(input);
  const metadata = await sharp(output.data).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(output.width, 1600); assert.equal(output.height, 1200); assert.ok(output.data.length < input.length);
});
test('photographs above 50 megapixels are accepted and reduced to WebP', async () => {
  const input = await sharp({ create: { width: 10000, height: 6000, channels: 3, background: '#a87a61' } }).jpeg().toBuffer();
  const output = await optimizePhoto(input);
  const metadata = await sharp(output.data).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(output.width, 1600);
  assert.equal(output.height, 960);
  assert.ok(output.data.length < input.length);
});
test('small photographs are not enlarged and EXIF metadata is removed', async () => {
  const input = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#a87a61' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const output = await optimizePhoto(input);
  const metadata = await sharp(output.data).metadata();
  assert.equal(output.width, 100); assert.equal(output.height, 200); assert.equal(metadata.exif, undefined); assert.equal(metadata.orientation, undefined);
});
test('valid AVIF photographs are accepted as HEIF with AV1 compression and converted to WebP', async () => {
  const input = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#a87a61' } }).avif().toBuffer();
  const original = await sharp(input).metadata();
  assert.equal(original.format, 'heif');
  assert.equal(original.compression, 'av1');
  const output = await optimizePhoto(input);
  const metadata = await sharp(output.data).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(output.width, 40);
  assert.equal(output.height, 30);
  assert.equal(metadata.exif, undefined);
});
test('the real native HEIF process returns a reduced PNG before Sharp receives it', async () => {
  // Synthetic AV1 container exercises native libheif without personal photos.
  // Phone HEVC files still need validation on the target deployment.
  const input = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#a87a61' } }).avif().toBuffer();
  const reduced = await decodeHeic(input);
  const metadata = await sharp(reduced).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 1066);
});
test('non-image bytes, SVG and oversized uploads are rejected', async () => {
  await assert.rejects(() => optimizePhoto(new Uint8Array([1, 2, 3])));
  await assert.rejects(() => optimizePhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>')));
  await assert.rejects(() => optimizePhoto(new Uint8Array(21 * 1024 * 1024)));
});

test('cancelling a disposable worker stops its real descendant as well', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'memento-worker-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const marker = join(directory, 'heartbeat');
  const fixture = join(directory, 'worker.mjs');
  await writeFile(fixture, `
    import { spawn } from 'node:child_process';
    const child = spawn(process.execPath, ['-e',
      'const fs = require("node:fs"); setInterval(() => fs.writeFileSync(process.argv[1], String(Date.now())), 10);',
      ${JSON.stringify(marker)}], { stdio: 'ignore', env: { PATH: '/usr/bin:/bin' } });
    setInterval(() => {}, 1000);
  `);
  const controller = new AbortController();
  const job = runPhotoProcess(join(directory, 'input'), join(directory, 'output'), {
    signal: controller.signal,
    spawn(command, args, options) {
      const changed = [...args];
      changed[3] = fixture;
      return spawn(command, changed, options);
    },
  });
  const rejected = assert.rejects(job, { status: 499 });
  try {
    let alive = false;
    for (let index = 0; index < 100; index++) {
      try { await readFile(marker); alive = true; break; }
      catch { await delay(20); }
    }
    assert.equal(alive, true, 'The test descendant must start before cancellation');
    controller.abort();
    await rejected;
    await delay(30);
    const stopped = await readFile(marker, 'utf8');
    await delay(80);
    assert.equal(await readFile(marker, 'utf8'), stopped, 'A descendant must not keep running after its worker is cancelled');
  } finally { controller.abort(); await rejected; }
});
