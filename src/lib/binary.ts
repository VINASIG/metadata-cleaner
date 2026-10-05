export class MetadataError extends Error {
  readonly code: 'unsupported' | 'invalid' | 'large' | 'unsafe';
  constructor(code: 'unsupported' | 'invalid' | 'large' | 'unsafe') {
    super(code);
    this.code = code;
  }
}
export function requireBytes(condition: unknown): asserts condition {
  if (!condition) throw new MetadataError('invalid');
}
export function ascii(
  bytes: Uint8Array,
  start = 0,
  end = bytes.length,
): string {
  return String.fromCharCode(
    ...bytes.subarray(start, Math.min(end, start + 256)),
  );
}
export function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
export function join(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
export function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function pngChunk(
  name: string,
  data: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(data.length + 12);
  const header = view(output);
  header.setUint32(0, data.length);
  output.set(new TextEncoder().encode(name), 4);
  output.set(data, 8);
  header.setUint32(output.length - 4, crc32(output.subarray(4, -4)));
  return output;
}
