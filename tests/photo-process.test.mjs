import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runPhotoProcess, PHOTO_TIMEOUT_MS, PHOTO_EXIT } from '../src/server/photo-process.mjs';
import { optimizePhoto } from '../src/server/images.mjs';
import { ValidationError, RepositoryError } from '../src/domain/errors.mjs';

// Scripted children only: unit tests never start a process or access a database.
function worker() {
  const child = Object.assign(new EventEmitter(), { pid: 12345 });
  const calls = [], kills = [];
  return { child, calls, kills, options: {
    spawn(...args) { calls.push(args); return child; },
    kill(...args) { kills.push(args); return true; },
  } };
}
const input = '/tmp/fictional-photo/input', output = '/tmp/fictional-photo/output.webp';

test('photo workers use a separate process group, 90 seconds and an explicit environment without app credentials', async () => {
  const fake = worker();
  assert.equal(PHOTO_TIMEOUT_MS, 90_000);
  const waiting = runPhotoProcess(input, output, fake.options);
  const [command, args, options] = fake.calls[0];
  assert.equal(command, '/usr/bin/prlimit');
  assert.deepEqual(args.slice(0, 3), ['--core=0', '--', process.execPath]);
  assert.match(args[3], /src\/server\/photo-worker\.mjs$/);
  assert.deepEqual(args.slice(4), [input, output]);
  assert.equal(options.detached, true);
  assert.equal(options.stdio, 'ignore');
  assert.equal(options.shell, undefined);
  assert.deepEqual(options.env, { PATH: '/usr/bin:/bin', LANG: 'C', NODE_ENV: 'production', TMPDIR: dirname(input),
    MALLOC_ARENA_MAX: '2', MALLOC_TRIM_THRESHOLD_: '131072' });
  fake.child.emit('close', 0, null);
  await waiting;
  assert.deepEqual(fake.kills, [[-12345, 'SIGKILL']]);
});

test('timeout kills the entire group and waits for close before releasing its operation', async () => {
  const fake = worker();
  let killed;
  const signal = new Promise(resolve => { killed = resolve; });
  const waiting = runPhotoProcess(input, output, { ...fake.options, timeoutMs: 5,
    kill(...args) { fake.kills.push(args); killed(); return true; } });
  const rejected = assert.rejects(waiting, error => error.status === 504 && /90 segundos/.test(error.message));
  // The production timer is unref'ed; this simulates a referenced child handle.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await signal;
    let settled = false;
    void waiting.catch(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false);
    assert.deepEqual(fake.kills[0], [-12345, 'SIGKILL']);
    fake.child.emit('close', null, 'SIGKILL');
    await rejected;
  } finally { clearTimeout(keepAlive); }
});

test('cancellation terminates the group and already aborted requests never spawn a worker', async () => {
  const controller = new AbortController(), fake = worker();
  const waiting = runPhotoProcess(input, output, { ...fake.options, signal: controller.signal });
  const rejected = assert.rejects(waiting, { status: 499 });
  controller.abort();
  assert.deepEqual(fake.kills[0], [-12345, 'SIGKILL']);
  fake.child.emit('close', null, 'SIGKILL');
  await rejected;
  await assert.rejects(runPhotoProcess(input, output, { ...fake.options, signal: controller.signal }), { status: 499 });
  assert.equal(fake.calls.length, 1);
});

test('crashes and fixed exit categories are translated without disclosing worker diagnostics', async () => {
  for (const [code, signal, status] of [[PHOTO_EXIT.invalid, null, 400], [PHOTO_EXIT.timeout, null, 504],
    [PHOTO_EXIT.unavailable, null, 503], [null, 'SIGSEGV', 503], [1, null, 503]]) {
    const fake = worker();
    const waiting = runPhotoProcess(input, output, fake.options);
    const rejected = assert.rejects(waiting, error => status === 400 ? error instanceof ValidationError : error.status === status);
    fake.child.emit('close', code, signal);
    await rejected;
  }
  const fake = worker();
  const waiting = runPhotoProcess(input, output, fake.options);
  const rejected = assert.rejects(waiting, error => error.status === 503 && !error.message.includes('PRIVATE'));
  fake.child.emit('error', Object.assign(new Error('PRIVATE_PATH'), { code: 'ENOENT' }));
  fake.child.emit('close', -2, null);
  await rejected;
});

test('conversion temporary originals and results are private and always removed', async () => {
  let directory;
  const photo = await optimizePhoto(new Uint8Array([1, 2, 3]), { run: async (inputPath, outputPath) => {
    directory = dirname(inputPath);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await stat(inputPath)).mode & 0o777, 0o600);
    assert.deepEqual(await readFile(inputPath), Buffer.from([1, 2, 3]));
    await writeFile(outputPath, 'fictional WebP');
    await writeFile(outputPath + '.json', JSON.stringify({ width: 10, height: 20 }));
  } });
  assert.equal(photo.width, 10);
  assert.equal(photo.height, 20);
  await assert.rejects(access(directory), { code: 'ENOENT' });
  for (const reason of ['failure', 'invalid-result']) {
    await assert.rejects(optimizePhoto(new Uint8Array([1]), { run: async (inputPath, outputPath) => {
      directory = dirname(inputPath);
      if (reason === 'failure') throw new RepositoryError('Fallo ficticio', 504);
      await writeFile(outputPath + '.json', '{invalid');
    } }), { status: reason === 'failure' ? 504 : 503 });
    await assert.rejects(access(directory), { code: 'ENOENT' });
  }
});

test('only one photo conversion runs and a failure releases the slot for the next request', async () => {
  let release, started;
  const began = new Promise(resolve => { started = resolve; });
  const waiting = optimizePhoto(new Uint8Array([1]), { run: async () => {
    started();
    await new Promise(resolve => { release = resolve; });
    throw new RepositoryError('Fallo ficticio', 504);
  } });
  const rejected = assert.rejects(waiting, { status: 504 });
  await began;
  try {
    await assert.rejects(optimizePhoto(new Uint8Array([1]), { run: async () => assert.fail('Must not start a second conversion') }), { status: 429 });
  } finally { release(); }
  await rejected;
  await assert.rejects(optimizePhoto(new Uint8Array([1]), { run: async () => { throw new RepositoryError('Retry started', 503); } }), /Retry started/);
});
