import { ascii, join, requireBytes, view } from './binary.ts';

export interface DisplayExif {
  orientation: number;
  colorSpace: number | null;
  adobeRgb: boolean;
}
// Read only known SHORT display tags. Never preserve raw MakerNote, pointers or padding.
export function displayExif(bytes: Uint8Array): DisplayExif {
  const tiff = ascii(bytes, 0, 6) === 'Exif\0\0' ? bytes.subarray(6) : bytes;
  requireBytes(tiff.length >= 8);
  const little = ascii(tiff, 0, 2) === 'II';
  requireBytes(little || ascii(tiff, 0, 2) === 'MM');
  const d = view(tiff);
  requireBytes(d.getUint16(2, little) === 42);
  const result: DisplayExif = {
    orientation: 1,
    colorSpace: null,
    adobeRgb: false,
  };
  const visited = new Set<number>();
  function readIfd(offset: number, kind: 'root' | 'exif' | 'interop'): void {
    requireBytes(
      offset >= 8 && offset + 2 <= tiff.length && !visited.has(offset),
    );
    visited.add(offset);
    const count = d.getUint16(offset, little);
    requireBytes(count <= 4096 && offset + 2 + count * 12 + 4 <= tiff.length);
    for (let i = 0; i < count; i++) {
      const p = offset + 2 + i * 12;
      const tag = d.getUint16(p, little);
      const type = d.getUint16(p + 2, little);
      const n = d.getUint32(p + 4, little);
      if (kind === 'root' && tag === 0x112) {
        requireBytes(type === 3 && n === 1);
        const value = d.getUint16(p + 8, little);
        requireBytes(value >= 1 && value <= 8);
        result.orientation = value;
      }
      if (kind === 'exif' && tag === 0xa001) {
        requireBytes(type === 3 && n === 1);
        const value = d.getUint16(p + 8, little);
        if (value === 1) result.colorSpace = value;
      }
      if (kind === 'interop' && tag === 1 && type === 2 && n === 4) {
        result.adobeRgb = ascii(tiff, p + 8, p + 12) === 'R03\0';
      }
      if (
        (kind === 'root' && tag === 0x8769) ||
        (kind === 'exif' && tag === 0xa005)
      ) {
        requireBytes(type === 4 && n === 1);
        readIfd(
          d.getUint32(p + 8, little),
          kind === 'root' ? 'exif' : 'interop',
        );
      }
    }
  }
  readIfd(d.getUint32(4, little), 'root');
  return result;
}

export function minimalExif(
  display: DisplayExif,
): Uint8Array<ArrayBuffer> | null {
  const orientation = display.orientation !== 1;
  const color = display.colorSpace !== null || display.adobeRgb;
  if (!orientation && !color) return null;
  const rootCount = Number(orientation) + Number(color);
  const rootEnd = 8 + 2 + rootCount * 12 + 4;
  const exifCount =
    Number(display.colorSpace !== null) + Number(display.adobeRgb);
  const exifEnd = rootEnd + 2 + exifCount * 12 + 4;
  const out = new Uint8Array(
    color ? exifEnd + (display.adobeRgb ? 18 : 0) : rootEnd,
  );
  const d = view(out);
  out.set([0x49, 0x49, 42, 0, 8, 0, 0, 0]);
  d.setUint16(8, rootCount, true);
  let p = 10;
  function tag(id: number, type: number, value: number): void {
    d.setUint16(p, id, true);
    d.setUint16(p + 2, type, true);
    d.setUint32(p + 4, 1, true);
    d.setUint32(p + 8, value, true);
    p += 12;
  }
  if (orientation) tag(0x112, 3, display.orientation);
  if (color) {
    tag(0x8769, 4, rootEnd);
    d.setUint16(rootEnd, exifCount, true);
    p = rootEnd + 2;
    if (display.colorSpace !== null) tag(0xa001, 3, display.colorSpace);
    if (display.adobeRgb) {
      tag(0xa005, 4, exifEnd);
      d.setUint16(exifEnd, 1, true);
      p = exifEnd + 2;
      tag(1, 2, 0);
      d.setUint32(p - 8, 4, true);
      out.set([82, 48, 51, 0], p - 4);
    }
  }
  return out;
}
export function jpegSegment(
  marker: number,
  data: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array([255, marker, 0, 0]);
  view(header).setUint16(2, data.length + 2);
  return join([header, data]);
}
