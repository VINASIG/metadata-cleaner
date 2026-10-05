import ExifReader from 'exifreader';
import { DOMParser, onErrorStopParsing } from '@xmldom/xmldom';
import { ascii } from './binary.ts';

export interface Entry {
  key: string;
  value: string;
}
export interface Metadata {
  format: string;
  fields: Entry[];
  scope: 'image' | 'pdf' | 'audio' | 'archive' | 'basic';
  warnings: string[];
}
export function flatten(
  value: unknown,
  prefix = '',
  out: Entry[] = [],
  depth = 0,
): Entry[] {
  if (out.length >= 5000 || depth > 12 || value === undefined || value === null)
    return out;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    out.push({
      key: prefix.slice(0, 512),
      value: String(value).slice(0, 8192),
    });
    return out;
  }
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    out.push({
      key: prefix,
      value: `${String(value instanceof ArrayBuffer ? value.byteLength : value.length)} bytes`,
    });
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length > 64) {
      out.push({ key: prefix, value: `${String(value.length)} items` });
      return out;
    }
    for (const [i, item] of value.entries())
      flatten(item, `${prefix}[${String(i)}]`, out, depth + 1);
  } else if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['description'] === 'string') {
      flatten(record['description'], prefix, out, depth + 1);
    } else
      for (const [key, item] of Object.entries(record)) {
        if (
          key === 'base64' ||
          key === 'image' ||
          key === 'buffer' ||
          key === '_raw'
        )
          continue;
        flatten(item, prefix ? `${prefix}.${key}` : key, out, depth + 1);
      }
  }
  return out;
}
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
export async function readMetadata(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Metadata> {
  const tags = await ExifReader.load(bytes.buffer, {
    expanded: true,
    async: true,
    includeUnknown: true,
    domParser: new DOMParser({ onError: onErrorStopParsing }),
    decompress: { maxDecompressedSize: 8 * 1024 * 1024 },
  });
  return {
    format: imageFormat(bytes),
    fields: flatten(tags),
    scope: 'image',
    warnings: [],
  };
}
