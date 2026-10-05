import { deflateSync } from 'node:zlib';
import { join, pngChunk, view } from '../src/lib/binary.ts';
import { jpegSegment } from '../src/lib/exif.ts';
export const privateText = 'PRIVATE_DEVICE_SERIAL_GPS_123';
export function exifFixture(): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(38 + privateText.length + 1);
  out.set([73, 73, 42, 0, 8, 0, 0, 0]);
  const d = view(out);
  d.setUint16(8, 2, true);
  d.setUint16(10, 0x112, true);
  d.setUint16(12, 3, true);
  d.setUint32(14, 1, true);
  d.setUint16(18, 6, true);
  d.setUint16(22, 0x10f, true);
  d.setUint16(24, 2, true);
  d.setUint32(26, privateText.length + 1, true);
  d.setUint32(30, 38, true);
  out.set(new TextEncoder().encode(privateText), 38);
  return out;
}
export function pngFixture(): Uint8Array<ArrayBuffer> {
  const ihdr = new Uint8Array(13);
  const d = view(ihdr);
  d.setUint32(0, 1);
  d.setUint32(4, 1);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return join([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('tEXt', new TextEncoder().encode('Owner\0' + privateText)),
    pngChunk('eXIf', exifFixture()),
    pngChunk('IDAT', deflateSync(new Uint8Array([0, 255, 0, 0, 255]))),
    pngChunk('IEND', new Uint8Array()),
    new TextEncoder().encode(privateText),
  ]);
}
// Container fixtures test surgery only. Browser tests use actual encoded image fixtures.
export function jpegFixture(): Uint8Array<ArrayBuffer> {
  return join([
    new Uint8Array([255, 216]),
    jpegSegment(
      0xe1,
      join([new TextEncoder().encode('Exif\0\0'), exifFixture()]),
    ),
    jpegSegment(0xfe, new TextEncoder().encode(privateText)),
    jpegSegment(0xc0, new Uint8Array([8, 0, 1, 0, 1, 1, 1, 17, 0])),
    jpegSegment(0xda, new Uint8Array([1, 1, 0, 0, 63, 0])),
    new Uint8Array([3, 255, 0, 4, 255, 208, 5]),
    new Uint8Array([255, 217]),
    new TextEncoder().encode(privateText),
  ]);
}
export function webpFixture(): Uint8Array<ArrayBuffer> {
  function chunk(name: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(8 + data.length + (data.length % 2));
    out.set(new TextEncoder().encode(name));
    view(out).setUint32(4, data.length, true);
    out.set(data, 8);
    return out;
  }
  const header = new Uint8Array(12);
  header.set(new TextEncoder().encode('RIFF'));
  header.set(new TextEncoder().encode('WEBP'), 8);
  const vp8x = new Uint8Array(10);
  vp8x[0] = 12;
  const out = join([
    header,
    chunk('VP8X', vp8x),
    chunk('EXIF', exifFixture()),
    chunk('XMP ', new TextEncoder().encode(privateText)),
    chunk('VP8L', new Uint8Array([47, 0, 0, 0, 0, 0])),
  ]);
  view(out).setUint32(4, out.length - 8, true);
  return join([out, new TextEncoder().encode(privateText)]);
}
export function gifFixture(): Uint8Array<ArrayBuffer> {
  const original = new Uint8Array(
    Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64',
    ),
  );
  const comment = join([
    new Uint8Array([33, 254, privateText.length]),
    new TextEncoder().encode(privateText),
    new Uint8Array([0]),
  ]);
  return join([
    original.subarray(0, 19),
    comment,
    original.subarray(19),
    new TextEncoder().encode(privateText),
  ]);
}
