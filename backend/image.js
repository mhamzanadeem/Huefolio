import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');
import { AppError } from './errors.js';
sharp.cache(false);
sharp.concurrency(1);
export async function prepareImage(bytes, mime, maxBytes = 9500000) {
  if (!bytes.length || bytes.length >= maxBytes) throw new AppError('IMAGE_SIZE', 413, 'Choose a photo smaller than 9.5 MB.');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!((mime === 'image/png' && png) || (mime === 'image/jpeg' && jpeg))) throw new AppError('IMAGE_TYPE', 415, 'Choose a valid JPG or PNG photo.');
  const options = { limitInputPixels: 4096 * 4096, failOn: 'warning', sequentialRead: true };
  try {
    const meta = await sharp(bytes, options).metadata();
    if (!['jpeg', 'png'].includes(meta.format) || (meta.pages || 1) !== 1) throw new AppError('IMAGE_TYPE', 415, 'Choose a single JPG or PNG photo.');
    if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 320 || Math.max(meta.width, meta.height) > 4096) throw new AppError('IMAGE_DIMENSIONS', 422, 'Use a photo with both sides between 320 and 4096 pixels.');
    // Default output strips EXIF/IPTC/XMP; never call withMetadata/keepMetadata.
    const output = await sharp(bytes, options).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
    if (output.length >= maxBytes) { output.fill(0); throw new AppError('IMAGE_SIZE', 413, 'This photo is too large after processing. Choose another photo.'); }
    return output;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('IMAGE_DECODE', 422, 'This image could not be opened. Choose a valid JPG or PNG.');
  }
}
