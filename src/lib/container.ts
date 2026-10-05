import {
  ascii,
  crc32,
  equal,
  join,
  MetadataError,
  pngChunk,
  requireBytes,
  view,
} from './binary.ts';
import { displayExif, jpegSegment, minimalExif } from './exif.ts';

export type Format = 'JPEG' | 'PNG' | 'WebP' | 'GIF';
export type Reason = 'pixels' | 'structure' | 'color' | 'animation' | 'display';
export interface Block {
  id: string;
  name: string;
  offset: number;
  length: number;
  reason: Reason | 'metadata';
  replacement?: Uint8Array;
}
export interface Inspection {
  format: Format;
  mime: string;
  blocks: Block[];
  compressed: Uint8Array[];
  width: number;
  height: number;
  warnings: string[];
}
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_BLOCKS = 20000;
function block(
  out: Inspection,
  name: string,
  offset: number,
  length: number,
  reason: Block['reason'],
  replacement?: Uint8Array,
): void {
  requireBytes(out.blocks.length < MAX_BLOCKS && length > 0);
  out.blocks.push({
    id: String(out.blocks.length),
    name,
    offset,
    length,
    reason,
    ...(replacement ? { replacement } : {}),
  });
}
function result(format: Format, mime: string): Inspection {
  return {
    format,
    mime,
    blocks: [],
    compressed: [],
    width: 0,
    height: 0,
    warnings: [],
  };
}
function tail(out: Inspection, bytes: Uint8Array, start: number): void {
  if (start < bytes.length)
    block(out, 'Trailing data', start, bytes.length - start, 'metadata');
}

function jpeg(bytes: Uint8Array): Inspection {
  const out = result('JPEG', 'image/jpeg');
  const d = view(bytes);
  block(out, 'SOI', 0, 2, 'structure');
  let p = 2;
  let scanCount = 0;
  while (p < bytes.length) {
    const start = p;
    requireBytes(bytes[p++] === 255);
    while (bytes[p] === 255) p++;
    const marker = bytes[p++];
    requireBytes(marker !== undefined && marker !== 0);
    if (marker === 0xd9) {
      block(out, 'EOI', start, p - start, 'structure');
      requireBytes(scanCount > 0 && out.width > 0 && out.height > 0);
      if (bytes[p] === 255 && bytes[p + 1] === 216)
        throw new MetadataError('unsafe');
      tail(out, bytes, p);
      return out;
    }
    requireBytes(
      marker !== 0xd8 &&
        !(marker >= 0xd0 && marker <= 0xd7) &&
        p + 2 <= bytes.length,
    );
    const n = d.getUint16(p);
    requireBytes(n >= 2 && p + n <= bytes.length);
    const end = p + n;
    const data = bytes.subarray(p + 2, end);
    let reason: Block['reason'] = 'structure';
    let replacement: Uint8Array | undefined;
    let name = `Marker ${marker.toString(16)}`;
    if (marker === 0xda) {
      block(out, 'SOS', start, end - start, 'structure');
      let q = end;
      while (q < bytes.length) {
        if (bytes[q] !== 255) {
          q++;
          continue;
        }
        let next = q + 1;
        while (bytes[next] === 255) next++;
        const code = bytes[next];
        requireBytes(code !== undefined);
        if (code === 0 || (code >= 0xd0 && code <= 0xd7)) {
          q = next + 1;
          continue;
        }
        break;
      }
      requireBytes(q > end && q < bytes.length);
      block(out, 'Compressed scan', end, q - end, 'pixels');
      out.compressed.push(bytes.subarray(end, q));
      scanCount++;
      p = q;
      continue;
    }
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      requireBytes(data.length >= 6);
      out.height = view(data).getUint16(1);
      out.width = view(data).getUint16(3);
      name = 'SOF';
    }
    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      reason = 'metadata';
      name = marker === 0xfe ? 'Comment' : `APP${String(marker - 0xe0)}`;
      if (marker === 0xe0 && ascii(data, 0, 5) === 'JFIF\0') {
        requireBytes(data.length >= 14);
        name = 'JFIF density and thumbnail';
        const minimal = new Uint8Array([
          74, 70, 73, 70, 0, 1, 2, 0, 0, 1, 0, 1, 0, 0,
        ]);
        // Density unit zero may define non-square pixels. Keep that aspect ratio.
        if (
          data[7] === 0 &&
          view(data).getUint16(8) !== view(data).getUint16(10)
        )
          minimal.set(data.subarray(8, 12), 8);
        replacement = jpegSegment(marker, minimal);
        if (equal(data, minimal)) {
          reason = 'display';
          replacement = undefined;
          name = 'JFIF display header';
        }
      } else if (marker === 0xe1 && ascii(data, 0, 6) === 'Exif\0\0') {
        name = 'EXIF';
        const kept = minimalExif(displayExif(data));
        if (kept)
          replacement = jpegSegment(
            marker,
            join([new TextEncoder().encode('Exif\0\0'), kept]),
          );
        if (replacement && equal(bytes.subarray(start, end), replacement)) {
          reason = 'display';
          replacement = undefined;
          name = 'Minimal display EXIF';
        }
      } else if (marker === 0xe1) name = 'XMP or APP1';
      else if (marker === 0xe2 && ascii(data, 0, 12) === 'ICC_PROFILE\0') {
        requireBytes(data.length >= 14);
        name = 'ICC profile';
        reason = 'color';
      } else if (marker === 0xee && ascii(data, 0, 5) === 'Adobe') {
        requireBytes(data.length >= 12);
        name = 'Adobe color transform';
        reason = 'display';
        // Keep the complete documented 12-byte transform header, discard extensions.
        if (data.length > 12) {
          reason = 'metadata';
          replacement = jpegSegment(marker, data.subarray(0, 12));
        }
      } else if (marker === 0xed) name = 'IPTC and Photoshop resources';
      if (
        (marker === 0xe2 && ascii(data, 0, 4) === 'MPF\0') ||
        (marker === 0xeb && ascii(data, 0, 2) === 'JP')
      )
        throw new MetadataError('unsafe');
      if (
        /hdrgm|hdrgainmap|GainMap|gcontainer:Directory/i.test(
          new TextDecoder('latin1').decode(data),
        )
      )
        throw new MetadataError('unsafe');
    }
    block(out, name, start, end - start, reason, replacement);
    p = end;
  }
  throw new MetadataError('invalid');
}

function png(bytes: Uint8Array): Inspection {
  const out = result('PNG', 'image/png');
  const d = view(bytes);
  block(out, 'PNG signature', 0, 8, 'structure');
  let p = 8;
  let image = false;
  const required = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS']);
  const color = new Set([
    'iCCP',
    'sRGB',
    'gAMA',
    'cHRM',
    'cICP',
    'mDCV',
    'cLLI',
    'sBIT',
    'bKGD',
  ]);
  const animation = new Set(['acTL', 'fcTL', 'fdAT']);
  while (p < bytes.length) {
    requireBytes(p + 12 <= bytes.length);
    const n = d.getUint32(p);
    const end = p + n + 12;
    requireBytes(end <= bytes.length);
    const name = ascii(bytes, p + 4, p + 8);
    requireBytes(/^[A-Za-z]{4}$/.test(name));
    requireBytes(
      crc32(bytes.subarray(p + 4, end - 4)) === d.getUint32(end - 4),
    );
    requireBytes(out.blocks.length > 1 || name === 'IHDR');
    const data = bytes.subarray(p + 8, end - 4);
    let reason: Block['reason'] = required.has(name)
      ? 'structure'
      : color.has(name)
        ? 'color'
        : animation.has(name)
          ? 'animation'
          : 'metadata';
    let replacement: Uint8Array | undefined;
    if (name === 'IHDR') {
      requireBytes(n === 13 && out.blocks.length === 1);
      out.width = view(data).getUint32(0);
      out.height = view(data).getUint32(4);
    }
    if (name === 'IDAT') {
      image = true;
      reason = 'pixels';
      out.compressed.push(data);
    }
    if (name === 'fdAT') {
      requireBytes(n >= 4);
      out.compressed.push(data.subarray(4));
    }
    if (name === 'eXIf') {
      const kept = minimalExif(displayExif(data));
      if (kept) {
        replacement = pngChunk(name, kept);
        if (equal(data, kept)) {
          reason = 'display';
          replacement = undefined;
        }
      }
    }
    if (
      name === 'pHYs' &&
      n === 9 &&
      data[8] === 0 &&
      view(data).getUint32(0) !== view(data).getUint32(4)
    )
      reason = 'display';
    if (!required.has(name) && name.charCodeAt(0) < 97)
      throw new MetadataError('unsafe');
    block(out, name, p, end - p, reason, replacement);
    p = end;
    if (name === 'IEND') {
      requireBytes(n === 0 && image && out.width > 0 && out.height > 0);
      tail(out, bytes, p);
      return out;
    }
  }
  throw new MetadataError('invalid');
}

function webp(bytes: Uint8Array): Inspection {
  const out = result('WebP', 'image/webp');
  const d = view(bytes);
  const containerEnd = d.getUint32(4, true) + 8;
  requireBytes(containerEnd >= 20 && containerEnd <= bytes.length);
  block(out, 'RIFF header', 0, 12, 'structure');
  let p = 12;
  let image = false;
  while (p < containerEnd) {
    requireBytes(p + 8 <= containerEnd);
    const n = d.getUint32(p + 4, true);
    const end = p + 8 + n + (n % 2);
    requireBytes(end <= containerEnd);
    const name = ascii(bytes, p, p + 4);
    const data = bytes.subarray(p + 8, p + 8 + n);
    let reason: Block['reason'] = 'metadata';
    let replacement: Uint8Array | undefined;
    if (['VP8 ', 'VP8L', 'ALPH'].includes(name)) {
      reason = 'pixels';
      out.compressed.push(data);
      if (name !== 'ALPH') image = true;
      if (name === 'VP8 ') {
        requireBytes(
          n >= 10 && data[3] === 157 && data[4] === 1 && data[5] === 42,
        );
        out.width = view(data).getUint16(6, true) & 0x3fff;
        out.height = view(data).getUint16(8, true) & 0x3fff;
      }
      if (name === 'VP8L') {
        requireBytes(n >= 5 && data[0] === 47);
        const bits = view(data).getUint32(1, true);
        out.width = (bits & 0x3fff) + 1;
        out.height = ((bits >>> 14) & 0x3fff) + 1;
      }
    } else if (name === 'VP8X') {
      requireBytes(n === 10);
      reason = 'structure';
      out.width =
        1 + (data[4] ?? 0) + ((data[5] ?? 0) << 8) + ((data[6] ?? 0) << 16);
      out.height =
        1 + (data[7] ?? 0) + ((data[8] ?? 0) << 8) + ((data[9] ?? 0) << 16);
    } else if (name === 'ICCP') reason = 'color';
    else if (name === 'ANIM') {
      requireBytes(n === 6);
      reason = 'animation';
    } else if (name === 'ANMF') {
      requireBytes(n >= 16);
      reason = 'animation';
      image = true;
      // Validate nested frame chunks. Unknown frame data cannot be safely discarded.
      let q = 16;
      while (q < n) {
        requireBytes(q + 8 <= n);
        const kind = ascii(data, q, q + 4);
        const len = view(data).getUint32(q + 4, true);
        const stop = q + 8 + len + (len % 2);
        requireBytes(stop <= n && ['ALPH', 'VP8 ', 'VP8L'].includes(kind));
        out.compressed.push(data.subarray(q + 8, q + 8 + len));
        q = stop;
      }
      requireBytes(q === n);
    } else if (name === 'EXIF') {
      const kept = minimalExif(displayExif(data));
      if (kept) {
        replacement = riffChunk(name, kept);
        if (equal(data, kept)) {
          reason = 'display';
          replacement = undefined;
        }
      }
    }
    block(out, name, p, end - p, reason, replacement);
    p = end;
  }
  requireBytes(p === containerEnd && image && out.width > 0 && out.height > 0);
  tail(out, bytes, p);
  return out;
}
function riffChunk(name: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(8 + data.length + (data.length % 2));
  out.set(new TextEncoder().encode(name));
  view(out).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function gif(bytes: Uint8Array): Inspection {
  const out = result('GIF', 'image/gif');
  const d = view(bytes);
  requireBytes(bytes.length >= 13);
  out.width = d.getUint16(6, true);
  out.height = d.getUint16(8, true);
  const globalEnd =
    13 + ((bytes[10] ?? 0) & 128 ? 3 * 2 ** (((bytes[10] ?? 0) & 7) + 1) : 0);
  requireBytes(globalEnd <= bytes.length);
  block(out, 'GIF header and palette', 0, globalEnd, 'structure');
  let p = globalEnd;
  let images = 0;
  function subblocks(start: number): number {
    let q = start;
    while (q < bytes.length) {
      const n = bytes[q++] ?? 0;
      if (n === 0) return q;
      requireBytes(q + n <= bytes.length);
      q += n;
    }
    throw new MetadataError('invalid');
  }
  while (p < bytes.length) {
    const start = p;
    const kind = bytes[p++];
    if (kind === 0x3b) {
      block(out, 'GIF trailer', start, 1, 'structure');
      requireBytes(images > 0);
      tail(out, bytes, p);
      return out;
    }
    if (kind === 0x2c) {
      requireBytes(p + 9 <= bytes.length);
      const flags = bytes[p + 8] ?? 0;
      const dataStart = p + 9 + (flags & 128 ? 3 * 2 ** ((flags & 7) + 1) : 0);
      requireBytes(dataStart + 1 < bytes.length);
      p = subblocks(dataStart + 1);
      block(out, 'Image frame', start, p - start, 'pixels');
      out.compressed.push(bytes.subarray(dataStart, p));
      images++;
      continue;
    }
    requireBytes(kind === 0x21);
    const label = bytes[p++];
    requireBytes(label !== undefined);
    let reason: Block['reason'] = 'metadata';
    let name = 'GIF extension';
    if (label === 0xf9) {
      requireBytes(bytes[p] === 4 && bytes[p + 5] === 0);
      p += 6;
      reason = 'animation';
      name = 'Frame transparency and timing';
    } else if (label === 0x01) {
      // Plain-text extensions are rendered content, not comments.
      requireBytes(bytes[p] === 12);
      p = subblocks(p);
      reason = 'display';
      name = 'Rendered plain text';
    } else {
      if (label === 0xff) {
        requireBytes(bytes[p] === 11 && p + 12 <= bytes.length);
        const id = ascii(bytes, p + 1, p + 12);
        if (['NETSCAPE2.0', 'ANIMEXTS1.0'].includes(id)) {
          reason = 'animation';
          name = 'Animation loop';
        } else if (id === 'ICCRGBG1012') {
          reason = 'color';
          name = 'ICC profile';
        } else name = `Application ${id}`;
      }
      if (label === 0xfe) name = 'Comment';
      p = subblocks(p);
    }
    block(out, name, start, p - start, reason);
  }
  throw new MetadataError('invalid');
}
export function inspect(bytes: Uint8Array): Inspection {
  if (bytes.length > MAX_FILE_BYTES) throw new MetadataError('large');
  requireBytes(bytes.length >= 8);
  if (bytes[0] === 255 && bytes[1] === 216) return jpeg(bytes);
  if (
    equal(
      bytes.subarray(0, 8),
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  )
    return png(bytes);
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP')
    return webp(bytes);
  if (['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) return gif(bytes);
  throw new MetadataError('unsupported');
}
export interface Cleaned {
  bytes: Uint8Array<ArrayBuffer>;
  before: Inspection;
  after: Inspection;
  removed: string[];
  saved: number;
}
export function clean(bytes: Uint8Array, remove?: readonly string[]): Cleaned {
  const before = inspect(bytes);
  const chosen = new Set(
    remove ??
      before.blocks.filter((b) => b.reason === 'metadata').map((b) => b.id),
  );
  requireBytes(
    [...chosen].every((id) =>
      before.blocks.some((b) => b.id === id && b.reason === 'metadata'),
    ),
  );
  const parts = before.blocks.flatMap((b) =>
    b.reason === 'metadata' && chosen.has(b.id)
      ? b.replacement
        ? [b.replacement]
        : []
      : [bytes.subarray(b.offset, b.offset + b.length)],
  );
  const output = join(parts);
  if (before.format === 'WebP') {
    const trailing = before.blocks.find((b) => b.name === 'Trailing data');
    const retainedTail =
      trailing && !chosen.has(trailing.id) ? trailing.length : 0;
    const riffEnd = output.length - retainedTail;
    view(output).setUint32(4, riffEnd - 8, true);
    let p = 12;
    const present = new Set<string>();
    while (p < riffEnd) {
      present.add(ascii(output, p, p + 4));
      p +=
        8 +
        view(output).getUint32(p + 4, true) +
        (view(output).getUint32(p + 4, true) % 2);
    }
    if (ascii(output, 12, 16) === 'VP8X')
      output[20] =
        (output[20] ?? 0) &
        ~((present.has('EXIF') ? 0 : 8) | (present.has('XMP ') ? 0 : 4));
  }
  const after = inspect(output);
  requireBytes(
    before.compressed.length === after.compressed.length &&
      before.compressed.every((data, i) =>
        equal(data, after.compressed[i] ?? new Uint8Array()),
      ),
  );
  requireBytes(before.width === after.width && before.height === after.height);
  return {
    bytes: output,
    before,
    after,
    removed: [...chosen],
    saved: bytes.length - output.length,
  };
}
