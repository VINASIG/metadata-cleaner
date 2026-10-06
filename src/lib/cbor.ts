export type CborValue =
  | string
  | number
  | boolean
  | null
  | Uint8Array
  | CborValue[]
  | { [key: string]: CborValue };

// A bounded data decoder. It does not evaluate tags or validate signatures.
export function decodeCbor(bytes: Uint8Array): CborValue {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder('utf-8', { fatal: true });
  let offset = 0;
  let nodes = 0;
  function ensure(count: number): void {
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      offset + count > bytes.length
    )
      throw new Error('Truncated CBOR');
  }
  function unsigned(info: number): number {
    if (info < 24) return info;
    const count = { 24: 1, 25: 2, 26: 4, 27: 8 }[info];
    if (!count) throw new Error('Invalid CBOR length');
    ensure(count);
    let value: number;
    if (count === 1) value = data.getUint8(offset);
    else if (count === 2) value = data.getUint16(offset);
    else if (count === 4) value = data.getUint32(offset);
    else
      value = data.getUint32(offset) * 4294967296 + data.getUint32(offset + 4);
    offset += count;
    if (!Number.isSafeInteger(value)) throw new Error('CBOR integer limit');
    return value;
  }
  function read(depth: number): CborValue {
    if (++nodes > 20000 || depth > 32) throw new Error('CBOR complexity limit');
    ensure(1);
    const initial = data.getUint8(offset++);
    const major = initial >> 5;
    const info = initial & 31;
    if (major === 7) {
      if (info === 20 || info === 21) return info === 21;
      if (info === 22 || info === 23) return null;
      if (info === 25) {
        ensure(2);
        const half = data.getUint16(offset);
        offset += 2;
        const exponent = (half >> 10) & 31;
        const fraction = half & 1023;
        const sign = half & 32768 ? -1 : 1;
        return exponent === 31
          ? fraction
            ? NaN
            : sign * Infinity
          : sign *
              (exponent
                ? (1 + fraction / 1024) * 2 ** (exponent - 15)
                : fraction * 2 ** -24);
      }
      if (info === 26 || info === 27) {
        ensure(info === 26 ? 4 : 8);
        const value =
          info === 26 ? data.getFloat32(offset) : data.getFloat64(offset);
        offset += info === 26 ? 4 : 8;
        return value;
      }
      throw new Error('Unsupported CBOR simple value');
    }
    const indefinite = info === 31;
    if (indefinite && (major < 2 || major > 5))
      throw new Error('Invalid CBOR indefinite item');
    const length = indefinite ? 0 : unsigned(info);
    if (major === 0) return length;
    if (major === 1) return -1 - length;
    if (major === 6) return read(depth + 1);
    if (major === 2 || major === 3) {
      if (indefinite) {
        const parts: Uint8Array[] = [];
        let total = 0;
        while (bytes[offset] !== 255) {
          ensure(1);
          if (
            (bytes[offset] ?? 0) >> 5 !== major ||
            ((bytes[offset] ?? 0) & 31) === 31
          )
            throw new Error('Invalid CBOR string part');
          const part = read(depth + 1);
          const encoded =
            typeof part === 'string' ? new TextEncoder().encode(part) : part;
          if (!(encoded instanceof Uint8Array))
            throw new Error('Invalid CBOR string');
          parts.push(encoded);
          total += encoded.length;
          if (total > 8 * 1024 * 1024) throw new Error('CBOR string limit');
        }
        offset++;
        const joined = new Uint8Array(total);
        let p = 0;
        for (const part of parts) {
          joined.set(part, p);
          p += part.length;
        }
        return major === 3 ? text.decode(joined) : joined;
      }
      ensure(length);
      const value = bytes.subarray(offset, offset + length);
      offset += length;
      return major === 3 ? text.decode(value) : value;
    }
    if (length > 10000) throw new Error('CBOR collection limit');
    if (major === 4) {
      const values: CborValue[] = [];
      for (let i = 0; indefinite || i < length; i++) {
        if (indefinite && bytes[offset] === 255) {
          offset++;
          break;
        }
        if (i >= 10000) throw new Error('CBOR array limit');
        values.push(read(depth + 1));
      }
      return values;
    }
    if (major === 5) {
      const values: [string, CborValue][] = [];
      const keys = new Set<string>();
      for (let i = 0; indefinite || i < length; i++) {
        if (indefinite && bytes[offset] === 255) {
          offset++;
          break;
        }
        if (i >= 10000) throw new Error('CBOR map limit');
        const key = read(depth + 1);
        if (typeof key !== 'string' && typeof key !== 'number')
          throw new Error('Unsupported CBOR map key');
        if (keys.has(String(key))) throw new Error('Duplicate CBOR map key');
        keys.add(String(key));
        values.push([String(key), read(depth + 1)]);
      }
      return Object.fromEntries(values);
    }
    throw new Error('Unsupported CBOR item');
  }
  const result = read(0);
  if (offset !== bytes.length) throw new Error('Trailing CBOR data');
  return result;
}
