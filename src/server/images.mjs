import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RepositoryError, ValidationError } from '../domain/errors.mjs';
import { LIMITS } from '../domain/memories.mjs';
import { runPhotoProcess } from './photo-process.mjs';
import { log } from './logger.mjs';

// Shared across Next's route bundles. Only conversions occupy this slot.
const scope = /** @type {typeof globalThis & {mementoPhotoSlot?:{busy:boolean}}} */ (globalThis);
const slot = scope.mementoPhotoSlot ??= { busy: false };

/** Decode in a disposable process; the API receives only optimized WebP bytes.
 * @param {Uint8Array} input
 * @param {{signal?:AbortSignal, run?:typeof runPhotoProcess}} [options] */
export async function optimizePhoto(input, options = {}) {
  if (!input.byteLength || input.byteLength > LIMITS.fileBytes) throw new ValidationError('Cada fotografía debe pesar entre 1 byte y 20 MB.');
  if (slot.busy) throw new RepositoryError('Se está procesando otra fotografía. Inténtalo de nuevo en un momento.', 429);
  slot.busy = true;
  const started = performance.now();
  /** @type {string|undefined} */
  let directory;
  log('info', 'photo.optimize.started', { inputBytes: input.byteLength });
  try {
    directory = await mkdtemp(join(tmpdir(), 'memento-photo-'));
    const inputPath = join(directory, 'input');
    const outputPath = join(directory, 'output.webp');
    await writeFile(inputPath, input, { mode: 0o600 });
    await (options.run ?? runPhotoProcess)(inputPath, outputPath, { signal: options.signal });
    const metadata = JSON.parse(await readFile(outputPath + '.json', 'utf8'));
    if (!metadata || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)
      || metadata.width < 1 || metadata.height < 1) throw new Error('Invalid converter result');
    const data = await readFile(outputPath);
    if (!data.byteLength) throw new Error('Empty converter result');
    log('info', 'photo.optimize.completed', { durationMs: Math.round(performance.now() - started), outputBytes: data.byteLength, width: metadata.width, height: metadata.height });
    return { data, width: /** @type {number} */ (metadata.width), height: /** @type {number} */ (metadata.height) };
  } catch (error) {
    log('error', 'photo.optimize.failed', { durationMs: Math.round(performance.now() - started), error,
      status: error instanceof RepositoryError ? error.status : error instanceof ValidationError ? 400 : 503 });
    if (error instanceof RepositoryError || error instanceof ValidationError) throw error;
    throw new RepositoryError('No se pudo procesar la fotografía. El recuerdo no se ha modificado.', 503);
  } finally {
    try { if (directory) await rm(directory, { recursive: true, force: true }); }
    finally { slot.busy = false; }
  }
}
