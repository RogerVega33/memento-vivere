import { readFile, writeFile } from 'node:fs/promises';
import { RepositoryError, ValidationError } from '../domain/errors.mjs';
import { convertPhoto } from './photo-converter.mjs';
import { PHOTO_EXIT } from './photo-process.mjs';

// Invoked only by runPhotoProcess. No database, HTTP server or environment file.
const [inputPath, outputPath] = process.argv.slice(2);
try {
  const photo = await convertPhoto(await readFile(inputPath));
  await writeFile(outputPath, photo.data, { mode: 0o600, flag: 'wx' });
  await writeFile(outputPath + '.json', JSON.stringify({ width: photo.width, height: photo.height }), { mode: 0o600, flag: 'wx' });
} catch (error) {
  // Only fixed exit categories cross the process boundary, never raw errors.
  process.exitCode = error instanceof ValidationError ? PHOTO_EXIT.invalid
    : error instanceof RepositoryError && error.status === 504 ? PHOTO_EXIT.timeout : PHOTO_EXIT.unavailable;
}
