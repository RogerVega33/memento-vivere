import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { RepositoryError, ValidationError } from '../domain/errors.mjs';
import { PHOTO_FORMATS_LABEL } from '../domain/photos.mjs';
import { log } from './logger.mjs';

export const PHOTO_TIMEOUT_MS = 90_000;
export const PHOTO_EXIT = Object.freeze({ invalid: 2, unavailable: 3, timeout: 4 });
const invalidPhoto = `No se pudo procesar una fotografía. Utiliza una imagen ${PHOTO_FORMATS_LABEL} válida.`;
const timeoutError = () => new RepositoryError(`La conversión de la fotografía superó los ${PHOTO_TIMEOUT_MS / 1000} segundos. El recuerdo no se ha modificado.`, 504);

/** One disposable Linux process group includes Node/Sharp and native HEIC children.
 * No inherited environment, shell, stdout/stderr or private decoder diagnostics.
 * @param {string} inputPath @param {string} outputPath
 * @param {{signal?:AbortSignal, timeoutMs?:number, spawn?:typeof spawn, kill?:typeof process.kill}} [options]
 * @returns {Promise<void>} */
export function runPhotoProcess(inputPath, outputPath, options = {}) {
  if (options.signal?.aborted) return Promise.reject(new RepositoryError('La conversión de la fotografía se canceló.', 499));
  return new Promise((resolveJob, reject) => {
    const child = (options.spawn ?? spawn)('/usr/bin/prlimit', [
      '--core=0', '--', process.execPath, resolve(process.cwd(), 'src/server/photo-worker.mjs'), inputPath, outputPath,
    ], {
      detached: true, stdio: 'ignore', windowsHide: true,
      env: { PATH: '/usr/bin:/bin', LANG: 'C', NODE_ENV: 'production', TMPDIR: dirname(inputPath),
        MALLOC_ARENA_MAX: '2', MALLOC_TRIM_THRESHOLD_: '131072' },
    });
    /** @type {Error|undefined} */
    let failure;
    const killGroup = () => {
      if (!child.pid) return;
      try { (options.kill ?? process.kill)(-child.pid, 'SIGKILL'); }
      catch (error) {
        if (/** @type {{code?:string}} */ (error).code !== 'ESRCH') log('error', 'photo.worker.failed', { error });
      }
    };
    /** @param {Error} error */
    const stop = error => { if (!failure) { failure = error; killGroup(); } };
    const abort = () => stop(new RepositoryError('La conversión de la fotografía se canceló.', 499));
    const timer = setTimeout(() => stop(timeoutError()), options.timeoutMs ?? PHOTO_TIMEOUT_MS);
    timer.unref();
    options.signal?.addEventListener('abort', abort, { once: true });
    process.once('exit', killGroup);
    child.once('error', error => {
      log('error', 'photo.worker.failed', { error });
      stop(new RepositoryError('El conversor de fotografías no está disponible. El recuerdo no se ha modificado.', 503));
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      process.removeListener('exit', killGroup);
      // Also terminate descendants left behind by a crashed worker.
      killGroup();
      if (failure) {
        const status = failure instanceof RepositoryError ? failure.status : 503;
        log(status === 499 ? 'warn' : 'error', 'photo.worker.failed', { status,
          reason: status === 504 ? 'timeout' : status === 499 ? 'cancelled' : 'unavailable' });
        reject(failure); return;
      }
      if (code === 0 && !signal) { resolveJob(); return; }
      log('error', 'photo.worker.failed', { code, signal });
      reject(code === PHOTO_EXIT.invalid ? new ValidationError(invalidPhoto)
        : code === PHOTO_EXIT.timeout ? timeoutError()
          : new RepositoryError('No se pudo convertir la fotografía con los recursos disponibles. El recuerdo no se ha modificado.', 503));
    });
    if (options.signal?.aborted) abort();
  });
}
