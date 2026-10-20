import sharp from 'sharp';
import { LIMITS } from '../domain/memories.mjs';
import { ValidationError } from '../domain/errors.mjs';
import { PHOTO_FORMATS_LABEL } from '../domain/photos.mjs';
import { decodeHeic, isHeic } from './decode-heic.mjs';
import { errorDetails, log } from './logger.mjs';

const INVALID_PHOTO = `No se pudo procesar una fotografía. Utiliza una imagen ${PHOTO_FORMATS_LABEL} válida.`;

/** Decode actual bytes, auto-orient, remove metadata and retain only optimized WebP.
 * @param {Uint8Array} input */
export async function optimizePhoto(input) {
  const started = performance.now();
  log('info', 'photo.optimize.started', { inputBytes: input.byteLength });
  try {
    if (!input.byteLength || input.byteLength > LIMITS.fileBytes) throw new ValidationError('Cada fotografía debe pesar entre 1 byte y 20 MB.');
    let image = sharp(input, { limitInputPixels: false, failOn: 'error' });
    let heic = isHeic(input);
    if (!heic) {
      let metadata;
      try {
        metadata = await image.metadata();
      } catch {
        throw new ValidationError(INVALID_PHOTO);
      }
      heic = metadata.format === 'heif' && metadata.compression === 'hevc';
      const avif = metadata.format === 'heif' && metadata.compression === 'av1';
      const supported = ['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || heic || avif;
      if (!supported || (metadata.pages ?? 1) > 1) throw new ValidationError(INVALID_PHOTO);
    }
    if (heic) {
      const reduced = await decodeHeic(input);
      image = sharp(reduced, { limitInputPixels: false, failOn: 'error' });
    }
    try {
      const { data, info } = await image.autoOrient()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });
      log('info', 'photo.optimize.completed', { durationMs: Math.round(performance.now() - started), outputBytes: data.byteLength, width: info.width, height: info.height, heic });
      return { data, width: info.width, height: info.height };
    } catch (error) {
      log('error', 'photo.encode.failed', { error: errorDetails(error) });
      throw new ValidationError(INVALID_PHOTO);
    }
  } catch (error) {
    log('error', 'photo.optimize.failed', { durationMs: Math.round(performance.now() - started), error: errorDetails(error) });
    throw error;
  }
}
