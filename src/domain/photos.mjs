export const PHOTO_FORMATS_LABEL = 'JPEG, PNG, WebP, AVIF, HEIC o HEIF';
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];
export const PHOTO_ACCEPT = [...MIME_TYPES, '.heic', '.heif'].join(',');

/** Mobile browsers may leave the MIME type of HEIC files empty.
 * Actual image bytes are always validated again on the server.
 * @param {{type:string, name:string}} file */
export function isSupportedPhotoFile(file) {
  return MIME_TYPES.includes(file.type) || /\.(heic|heif)$/i.test(file.name);
}
