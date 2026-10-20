import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHeicDecoder } from './native-heic.mjs';

/** Inspect the HEIF container before asking Sharp to load an unavailable HEVC codec.
 * @param {Uint8Array} input */
export function isHeic(input) {
  if (input.byteLength < 16) return false;
  const text = (/** @type {number} */ offset) => String.fromCharCode(...input.subarray(offset, offset + 4));
  if (text(4) !== 'ftyp') return false;
  const size = new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(0);
  if (size < 16 || size > input.byteLength) return false;
  const brands = [text(8)];
  for (let offset = 16; offset + 4 <= size; offset += 4) brands.push(text(offset));
  if (brands.some(brand => ['avif', 'avis', 'msf1', 'hevc', 'hevx'].includes(brand))) return false;
  return brands.some(brand => ['heic', 'heix', 'mif1'].includes(brand));
}

/** Convert in a disposable native process; only the reduced PNG enters Node memory.
 * @param {Uint8Array} input
 * @param {(inputPath: string, outputPath: string) => Promise<void>} [run] */
export async function decodeHeic(input, run = runHeicDecoder) {
  const directory = await mkdtemp(join(tmpdir(), 'memento-heic-'));
  try {
    const inputPath = join(directory, 'input.heic');
    const outputPath = join(directory, 'output.png');
    await writeFile(inputPath, input, { mode: 0o600 });
    await run(inputPath, outputPath);
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
