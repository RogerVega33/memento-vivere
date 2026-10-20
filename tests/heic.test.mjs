import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeHeic, isHeic } from '../src/server/decode-heic.mjs';
import { ValidationError } from '../src/domain/errors.mjs';
import { runHeicDecoder } from '../src/server/native-heic.mjs';
import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isSupportedPhotoFile, PHOTO_ACCEPT } from '../src/domain/photos.mjs';

test('HEIC and HEIF files can be selected even when the phone omits their MIME type', () => {
  for (const file of [{ name: 'foto.HEIC', type: '' }, { name: 'foto.heif', type: 'application/octet-stream' }, { name: 'foto', type: 'image/heic' }]) {
    assert.equal(isSupportedPhotoFile(file), true);
  }
  assert.equal(isSupportedPhotoFile({ name: 'texto.txt', type: 'text/plain' }), false);
  assert.ok(PHOTO_ACCEPT.includes('.heic'));
  assert.ok(PHOTO_ACCEPT.includes('image/heif'));
});

test('HEIC container detection uses actual bytes and excludes AVIF and image sequences', () => {
  const container = (...brands) => {
    const data = Buffer.alloc(16 + brands.length * 4);
    data.writeUInt32BE(data.length, 0);
    data.write('ftyp', 4);
    data.write(brands[0], 8);
    brands.forEach((brand, index) => data.write(brand, 16 + index * 4));
    return data;
  };
  for (const brands of [['heic', 'mif1'], ['mif1', 'heic'], ['heix']]) assert.equal(isHeic(container(...brands)), true);
  for (const brands of [['avif', 'mif1'], ['mif1', 'avif'], ['msf1', 'hevc'], ['jpeg']]) assert.equal(isHeic(container(...brands)), false);
  assert.equal(isHeic(new Uint8Array([1, 2, 3])), false);
  const truncated = container('heic');
  truncated.writeUInt32BE(1000, 0);
  assert.equal(isHeic(truncated), false);
});

test('HEIC conversion returns only reduced bytes and removes temporary originals', async () => {
  let directory;
  const input = new Uint8Array([1, 2, 3]);
  const output = Buffer.from('fictional reduced PNG');
  const converted = await decodeHeic(input, async (inputPath, outputPath) => {
    directory = dirname(inputPath);
    assert.deepEqual(await readFile(inputPath), Buffer.from(input));
    await writeFile(outputPath, output);
  });
  assert.deepEqual(converted, output);
  await assert.rejects(() => access(directory), { code: 'ENOENT' });
});

test('failed HEIC conversion cleans its temporary directory and preserves the error', async () => {
  let directory;
  const failure = new Error('fallo ficticio');
  await assert.rejects(() => decodeHeic(new Uint8Array([1]), async inputPath => {
    directory = dirname(inputPath);
    throw failure;
  }), error => error === failure);
  await assert.rejects(() => access(directory), { code: 'ENOENT' });
});

test('native conversion does not impose a virtual-address limit and controls allocator arenas without inheriting secrets', async () => {
  let calls = 0;
  await runHeicDecoder('/tmp/fictional/input.heic', '/tmp/fictional/output.png', {
    execute: async (command, args, options) => {
      calls++;
      assert.equal(command, '/usr/bin/prlimit');
      assert.ok(!args.some(arg => arg.startsWith('--as')));
      assert.deepEqual(args, ['--core=0', '--', '/usr/bin/heif-thumbnailer', '-p', '-s', '1600', '/tmp/fictional/input.heic', '/tmp/fictional/output.png']);
      assert.equal(options.timeout, 60000);
      assert.equal(options.killSignal, 'SIGKILL');
      assert.equal(options.shell, undefined);
      assert.deepEqual(options.env, {
        PATH:'/usr/bin:/bin', LANG:'C', TMPDIR:'/tmp/fictional', NODE_ENV:'production',
        MALLOC_ARENA_MAX:'2', MALLOC_TRIM_THRESHOLD_:'131072',
      });
      return {stdout:'', stderr:''};
    },
  });
  assert.equal(calls, 1);
});

test('decoder timeout, termination, missing executable and invalid contents return useful errors', async () => {
  for (const [details, status, message] of [
    [{ killed: true, signal: 'SIGKILL' }, 504, /tardó demasiado/],
    [{ signal: 'SIGABRT' }, 503, /se interrumpió/],
    [{ code: 1, stderr: 'memory allocation failed' }, 503, /recursos disponibles/],
    [{ code: 'ENOENT' }, 503, /no está disponible/],
    [{ code: 127 }, 503, /no está disponible/],
    [{ code: 1, stderr: 'invalid HEIF file' }, undefined, /No se pudo decodificar/],
  ]) {
    await assert.rejects(() => runHeicDecoder('/tmp/fictional/in.heic', '/tmp/fictional/out.png', {
      execute: async () => { throw Object.assign(new Error('fallo simulado'), details); },
    }), error => {
      assert.match(error.message, message);
      if (status) assert.equal(error.status, status);
      else assert.ok(error instanceof ValidationError);
      return true;
    });
  }
});
