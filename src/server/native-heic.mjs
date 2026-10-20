import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname } from 'node:path';
import { RepositoryError } from '../domain/errors.mjs';
import { ValidationError } from '../domain/errors.mjs';
import { log } from './logger.mjs';

const execute = promisify(execFile);
const TIMEOUT_MS = 60_000;

/** @typedef {(command: string, args: string[], options: import('node:child_process').ExecFileOptionsWithStringEncoding) => Promise<{stdout: string, stderr: string}>} Execute */

/** Convert in a disposable process. Do not cap virtual address space: native
 * codec threads reserve arenas/mappings that are not resident photograph pixels.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{execute?: Execute, timeoutMs?: number}} [options] */
export async function runHeicDecoder(inputPath, outputPath, options = {}) {
  const started = performance.now();
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  log('info', 'heic.decode.started', { decoder: 'native-libheif', timeoutMs, allocatorArenas: 2 });
  const heartbeat = setInterval(() => log('info', 'heic.decode.progress', { durationMs: Math.round(performance.now() - started) }), 10_000);
  heartbeat.unref();
  try {
    await (options.execute ?? execute)('/usr/bin/prlimit', [
      '--core=0', '--', '/usr/bin/heif-thumbnailer',
      '-p', '-s', '1600', inputPath, outputPath,
    ], {
      encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 64 * 1024,
      // Do not inherit application secrets or load shell profiles.
      env: {
        PATH: '/usr/bin:/bin', LANG: 'C', TMPDIR: dirname(inputPath), NODE_ENV: 'production',
        MALLOC_ARENA_MAX: '2', MALLOC_TRIM_THRESHOLD_: '131072',
      },
      windowsHide: true,
    });
    log('info', 'heic.decode.completed', { durationMs: Math.round(performance.now() - started) });
  } catch (error) {
    const failure = /** @type {Error & {code?: string | number, signal?: string, killed?: boolean, stderr?: string}} */ (error);
    log('error', 'heic.decode.failed', {
      durationMs: Math.round(performance.now() - started),
      code: failure.code, signal: failure.signal, killed: failure.killed ?? false,
      // The CLI only receives generated temporary paths, never user filenames.
      diagnostic: failure.stderr?.slice(0, 2000),
    });
    if (failure.code === 'ENOENT' || failure.code === 127) {
      throw new RepositoryError('El conversor HEIC no está disponible en el servidor.', 503);
    }
    if (failure.killed) {
      throw new RepositoryError('La conversión HEIC tardó demasiado. El recuerdo no se ha modificado.', 504);
    }
    if (/memory|alloc|resource/i.test(failure.stderr ?? '')) {
      throw new RepositoryError('No se pudo convertir la fotografía HEIC con los recursos disponibles. El recuerdo no se ha modificado.', 503);
    }
    if (failure.signal) {
      throw new RepositoryError('El conversor HEIC se interrumpió. El recuerdo no se ha modificado.', 503);
    }
    throw new ValidationError('No se pudo decodificar la fotografía HEIC.');
  } finally {
    clearInterval(heartbeat);
  }
}
