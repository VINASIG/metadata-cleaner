import ExifReader from 'exifreader';
import { DOMParser, onErrorStopParsing } from '@xmldom/xmldom';
import { ascii, crc32 } from './binary.ts';
import { flatten, uniqueFields, entry, MAX_FIELDS } from './fields.ts';
import { readContentCredentials } from './jumbf.ts';
import type { Entry, Metadata } from './fields.ts';
export function imageFormat(bytes: Uint8Array): string {
  if (bytes[0] === 255 && bytes[1] === 216) return 'JPEG';
  if (ascii(bytes, 1, 4) === 'PNG') return 'PNG';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP')
    return 'WebP';
  if (ascii(bytes, 0, 3) === 'GIF') return 'GIF';
  if (['II', 'MM'].includes(ascii(bytes, 0, 2))) return 'TIFF';
  if (ascii(bytes, 4, 8) === 'ftyp') return ascii(bytes, 8, 12);
  if (
    (bytes[0] === 255 && bytes[1] === 10) ||
    (ascii(bytes, 4, 8) === 'JXL ' &&
      bytes[8] === 13 &&
      bytes[9] === 10 &&
      bytes[10] === 135 &&
      bytes[11] === 10)
  )
    return 'JPEG XL';
  return 'Unknown';
}
export async function technicalFields(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Entry[]> {
  const hashes = await Promise.all(
    ['SHA-256', 'SHA-512'].map(async (algorithm) => {
      const digest = new Uint8Array(
        await crypto.subtle.digest(algorithm, bytes),
      );
      return entry(
        'technical.' + algorithm,
        Array.from(digest, (x) => x.toString(16).padStart(2, '0')).join(''),
      );
    }),
  );
  return [
    entry('technical.FileSize', bytes.length),
    ...hashes,
    entry('technical.CRC32', crc32(bytes).toString(16).padStart(8, '0')),
    entry(
      'technical.HeaderHex',
      Array.from(bytes.subarray(0, 64), (x) =>
        x.toString(16).padStart(2, '0'),
      ).join(' '),
    ),
    entry(
      'technical.HeaderText',
      Array.from(bytes.subarray(0, 64), (x) =>
        x >= 32 && x < 127 ? String.fromCharCode(x) : '.',
      ).join(''),
    ),
  ].map((field) => ({ ...field, group: 'Technical', source: 'derived' }));
}
export async function readImageMetadata(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Metadata> {
  const warnings: string[] = [];
  let fields: Entry[] = [];
  try {
    const tags = await ExifReader.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      {
        expanded: true,
        async: true,
        includeUnknown: true,
        domParser: new DOMParser({ onError: onErrorStopParsing }),
        decompress: { maxDecompressedSize: 8 * 1024 * 1024 },
      },
    );
    const groups = tags as unknown as Record<string, unknown>;
    for (const [group, value] of Object.entries(groups)) {
      // PNG compatibility aliases refer to the same fields in ExifReader 4.46.
      const canonical = ['pngFile', 'pngText'].includes(group) ? 'png' : group;
      const parsed = flatten(value, canonical, [], 0, true).filter(
        (field) => field.key !== 'xmp.about' || field.value !== '',
      );
      fields.push(
        ...parsed.map((field) => ({
          ...field,
          group: canonical.toUpperCase(),
          source: 'embedded' as const,
        })),
      );
    }
    fields = uniqueFields(fields);
  } catch {
    warnings.push('image-parse');
  }
  const credentials = readContentCredentials(bytes);
  fields.push(...credentials.fields);
  warnings.push(...credentials.warnings);
  if (!fields.length && warnings.includes('image-parse'))
    throw new Error('Unreadable image metadata');
  const width = fields.find((field) =>
    /\.(Image Width|ImageWidth)$/.test(field.key),
  );
  const height = fields.find((field) =>
    /\.(Image Height|ImageHeight)$/.test(field.key),
  );
  const w = width ? Number.parseInt(width.value) : undefined;
  const h = height ? Number.parseInt(height.value) : undefined;
  if (w && h) {
    fields.push({
      ...entry('technical.ImageSize', `${String(w)} × ${String(h)}`),
      group: 'Technical',
      source: 'derived',
    });
    fields.push({
      ...entry('technical.Megapixels', (w * h) / 1000000),
      group: 'Technical',
      source: 'derived',
    });
  }
  fields.push(...(await technicalFields(bytes)));
  if (fields.length >= MAX_FIELDS || fields.some((field) => field.truncated))
    warnings.push('field-limit');
  const format = imageFormat(bytes);
  const mime = {
    JPEG: 'image/jpeg',
    PNG: 'image/png',
    WebP: 'image/webp',
    GIF: 'image/gif',
    TIFF: 'image/tiff',
    avif: 'image/avif',
    avis: 'image/avif',
    heic: 'image/heic',
    heix: 'image/heic',
    'JPEG XL': 'image/jxl',
  }[format];
  return {
    format,
    fields: fields.slice(0, MAX_FIELDS),
    scope: 'image',
    warnings: [...new Set(warnings)],
    ...(mime ? { mime } : {}),
    ...(w && h ? { width: w, height: h } : {}),
  };
}
