import { randomUUID } from 'node:crypto';
import { ValidationError } from '@/domain/errors.mjs';
import { validateMemory, LIMITS } from '@/domain/memories.mjs';
import { RepositoryError } from '@/domain/errors.mjs';
import { todayInZone } from '@/domain/dates.mjs';
import { requireAccount } from './auth-http';
import { parseJson, readFormData, requireSameOrigin } from './http.mjs';
import { optimizePhoto } from './images.mjs';
import { log } from './logger.mjs';

// Serialize expensive image processing. Final repository.save also validates
// revision, birth date and today's date after asynchronous processing completes.
export async function saveMemory(request: Request, id: string | null = null) {
  const started = performance.now();
  log('info', 'memory.save.started', { operation: id ? 'update' : 'create' });
  requireSameOrigin(request);
  const account = await requireAccount(request);
  const repository = account.repository;
  const profile = await repository.requireProfile();
  if (repository.uploadInProgress) throw new RepositoryError('Se está guardando otro recuerdo. Inténtalo de nuevo en un momento.', 429);
  repository.uploadInProgress = true;
  try {
    const form = await readFormData(request);
    const payloadText = form.get('payload');
    if (typeof payloadText !== 'string') throw new ValidationError('Faltan los datos del recuerdo.');
    const payload: unknown = parseJson(payloadText);
    if (!payload || typeof payload !== 'object') throw new ValidationError('Los datos del recuerdo no son válidos.');
    const raw = payload as Record<string, unknown>;
    const draft = validateMemory(raw, profile.birthDate, todayInZone());
    const retained = raw.retainedPhotoIds ?? [];
    if (!Array.isArray(retained) || retained.some(value => typeof value !== 'string')) throw new ValidationError('La selección de fotografías no es válida.');
    if (id && (!Number.isInteger(raw.version) || Number(raw.version) < 1)) throw new ValidationError('Falta la versión del recuerdo. Actualiza la página.');
    const files = form.getAll('photos');
    if (files.length + retained.length > LIMITS.photosPerMemory) throw new ValidationError(`Puedes añadir hasta ${LIMITS.photosPerMemory} fotografías.`);
    const photos = [];
    log('info', 'memory.save.validated', { newPhotos: files.length, retainedPhotos: retained.length });
    for (const [index, file] of files.entries()) {
      if (!(file instanceof File)) throw new ValidationError('La fotografía no es válida.');
      if (file.size > LIMITS.fileBytes) throw new ValidationError('Cada fotografía puede pesar hasta 20 MB.');
      log('info', 'memory.photo.started', { photoIndex: index + 1, totalPhotos: files.length, inputBytes: file.size });
      const photo = await optimizePhoto(new Uint8Array(await file.arrayBuffer()));
      photos.push({ id: randomUUID(), ...photo });
      log('info', 'memory.photo.completed', { photoIndex: index + 1, outputBytes: photo.data.byteLength });
    }
    // Recovery/logout may revoke this session during asynchronous photo processing.
    if ((await requireAccount(request)).user.id !== account.user.id) throw new RepositoryError('Tu sesión cambió. Inicia sesión de nuevo.', 401);
    const saved = await repository.save({ id, draft, retainedPhotoIds: retained as string[], photos, version: id ? Number(raw.version) : null }, randomUUID());
    log('info', 'memory.save.completed', { durationMs: Math.round(performance.now() - started), newPhotos: photos.length });
    return saved;
  } catch (error) {
    log('error', 'memory.save.failed', { durationMs: Math.round(performance.now() - started), error });
    throw error;
  } finally { repository.uploadInProgress = false; }
}
