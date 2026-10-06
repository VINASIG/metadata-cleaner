import { ascii, join, view } from './binary.ts';
import { decodeCbor } from './cbor.ts';
import { certificateFields } from './certificate.ts';
import { entry, flatten, MAX_FIELDS } from './fields.ts';
import type { Entry } from './fields.ts';
import type { CborValue } from './cbor.ts';
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
interface Box {
  type: string;
  start: number;
  end: number;
}
function boxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const data = view(bytes);
  const result: Box[] = [];
  let p = start;
  while (p < end) {
    if (result.length >= 4096 || p + 8 > end)
      throw new Error('JUMBF box limit');
    let length = data.getUint32(p);
    let header = 8;
    if (length === 1) {
      if (p + 16 > end) throw new Error('Truncated JUMBF length');
      length = data.getUint32(p + 8) * 4294967296 + data.getUint32(p + 12);
      header = 16;
    } else if (length === 0) length = end - p;
    if (!Number.isSafeInteger(length) || length < header || p + length > end)
      throw new Error('Invalid JUMBF box length');
    result.push({
      type: ascii(bytes, p + 4, p + 8),
      start: p + header,
      end: p + length,
    });
    p += length;
  }
  return result;
}
function isMap(value: CborValue): value is { [key: string]: CborValue } {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array)
  );
}
function signature(
  bytes: Uint8Array,
  prefix: string,
  warnings: string[],
): Entry[] {
  const value = decodeCbor(bytes);
  if (!Array.isArray(value) || value.length !== 4)
    throw new Error('Invalid COSE signature');
  const protectedBytes = value[0];
  const protectedHeaders =
    protectedBytes instanceof Uint8Array && protectedBytes.length
      ? decodeCbor(protectedBytes)
      : {};
  const fields: Entry[] = [];
  const algorithms: Record<string, string> = {
    '-7': 'ES256',
    '-35': 'ES384',
    '-36': 'ES512',
    '-37': 'PS256',
    '-38': 'PS384',
    '-39': 'PS512',
    '-8': 'EdDSA',
  };
  for (const [location, headers] of [
    ['ProtectedHeader', protectedHeaders],
    ['UnprotectedHeader', value[1] ?? null],
  ] as const) {
    if (!isMap(headers)) continue;
    const headerPrefix = prefix + '.' + location;
    for (const [key, item] of Object.entries(headers)) {
      if (key === '1')
        fields.push(
          entry(
            headerPrefix + '.Algorithm',
            typeof item === 'number' || typeof item === 'string'
              ? (algorithms[String(item)] ?? item)
              : item,
            item,
          ),
        );
      else if (key === '33' || key === 'x5chain') {
        const certificates =
          item instanceof Uint8Array ? [item] : Array.isArray(item) ? item : [];
        for (const [i, certificate] of certificates.entries()) {
          const name = `${headerPrefix}.Certificate[${String(i)}]`;
          fields.push(entry(name + '.Data', certificate));
          if (certificate instanceof Uint8Array) {
            try {
              fields.push(...certificateFields(certificate, name));
            } catch {
              warnings.push('certificate-parse');
            }
          }
        }
      } else flatten(item, `${headerPrefix}.${key}`, fields);
    }
  }
  flatten(value[2], prefix + '.Payload', fields);
  flatten(value[3], prefix + '.Signature', fields);
  return fields;
}
function readStore(
  bytes: Uint8Array,
  fields: Entry[],
  warnings: string[],
  store: number,
): void {
  if (bytes.length > MAX_METADATA_BYTES)
    throw new Error('C2PA metadata size limit');
  let boxCount = 0;
  let manifest = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  function walk(
    list: Box[],
    prefix: string,
    depth: number,
    credentials = false,
  ): void {
    if (depth > 20) throw new Error('JUMBF depth limit');
    for (const box of list) {
      if (++boxCount > 4096 || fields.length >= MAX_FIELDS)
        throw new Error('JUMBF complexity limit');
      const data = bytes.subarray(box.start, box.end);
      if (box.type === 'jumb') {
        const children = boxes(bytes, box.start, box.end);
        const descriptor = children[0];
        if (
          descriptor?.type !== 'jumd' ||
          descriptor.end - descriptor.start < 17
        )
          throw new Error('Missing JUMBF descriptor');
        const uuid = bytes.subarray(descriptor.start, descriptor.start + 16);
        const flags = bytes[descriptor.start + 16] ?? 0;
        let label = '';
        let descriptorOffset = descriptor.start + 17;
        if (flags & 2) {
          const end = bytes.indexOf(0, descriptor.start + 17);
          if (end < 0 || end >= descriptor.end || end - descriptorOffset > 1024)
            throw new Error('Invalid JUMBF label');
          label = decoder.decode(bytes.subarray(descriptor.start + 17, end));
          descriptorOffset = end + 1;
        }
        const type = ascii(uuid, 0, 4);
        const inCredentials = credentials || type === 'c2pa';
        const segment = ['c2ma', 'c2um', 'c2cm'].includes(type)
          ? `manifest[${String(manifest++)}]`
          : label || `box[${String(boxCount)}]`;
        const path =
          (inCredentials ? prefix.replace(/^jumbf\./, 'c2pa.') : prefix) +
          '.' +
          segment;
        fields.push({
          ...entry(path.replace(/^(c2pa|jumbf)/, 'jumbf') + '.Label', label),
          group: 'JUMBF',
        });
        fields.push({
          ...entry(
            path.replace(/^(c2pa|jumbf)/, 'jumbf') + '.Type',
            Array.from(uuid, (x) => x.toString(16).padStart(2, '0')).join(''),
          ),
          group: 'JUMBF',
        });
        fields.push({
          ...entry(
            path.replace(/^(c2pa|jumbf)/, 'jumbf') + '.Bytes',
            box.end - box.start + 8,
          ),
          group: 'JUMBF',
        });
        fields.push({
          ...entry(path.replace(/^(c2pa|jumbf)/, 'jumbf') + '.Toggles', flags),
          group: 'JUMBF',
        });
        if (flags & 4) {
          if (descriptorOffset + 4 > descriptor.end)
            throw new Error('Invalid JUMBF identifier');
          fields.push({
            ...entry(
              path.replace(/^(c2pa|jumbf)/, 'jumbf') + '.ID',
              view(bytes).getUint32(descriptorOffset),
            ),
            group: 'JUMBF',
          });
          descriptorOffset += 4;
        }
        if (flags & 8) {
          if (descriptorOffset + 32 > descriptor.end)
            throw new Error('Invalid JUMBF signature');
          fields.push({
            ...entry(
              path.replace(/^(c2pa|jumbf)/, 'jumbf') + '.Signature',
              bytes.subarray(descriptorOffset, descriptorOffset + 32),
            ),
            group: 'JUMBF',
          });
          descriptorOffset += 32;
        }
        if (descriptorOffset < descriptor.end) {
          for (const privateBox of boxes(
            bytes,
            descriptorOffset,
            descriptor.end,
          )) {
            const value = bytes.subarray(privateBox.start, privateBox.end);
            fields.push({
              ...entry(
                path +
                  (privateBox.type === 'c2sh'
                    ? '.Salt'
                    : '.Private.' + privateBox.type),
                privateBox.type === 'c2sh'
                  ? Array.from(value, (x) =>
                      x.toString(16).padStart(2, '0'),
                    ).join('')
                  : value,
              ),
              group: 'JUMBF',
            });
          }
        }
        walk(children.slice(1), path, depth + 1, inCredentials);
      } else if (box.type === 'cbor') {
        try {
          const decoded = prefix.endsWith('.c2pa.signature')
            ? signature(data, prefix, warnings)
            : flatten(decodeCbor(data), prefix);
          fields.push(
            ...decoded.map((field) => ({
              ...field,
              group: credentials ? 'C2PA' : 'JUMBF',
            })),
          );
        } catch {
          warnings.push('cbor-parse');
          fields.push({
            ...entry(prefix + '.UndecodedCBOR', data),
            group: 'JUMBF',
          });
        }
      } else if (box.type === 'json') {
        try {
          const value: unknown = JSON.parse(decoder.decode(data));
          fields.push(
            ...flatten(value, prefix).map((field) => ({
              ...field,
              group: credentials ? 'C2PA' : 'JUMBF',
            })),
          );
        } catch {
          warnings.push('c2pa-json');
          fields.push({
            ...entry(prefix + '.UndecodedJSON', data),
            group: 'JUMBF',
          });
        }
      } else if (box.type === 'bfdb') {
        if (data.length < 1) throw new Error('Invalid JUMBF embedded file');
        const end = data.indexOf(0, 1);
        if (end < 0) throw new Error('Invalid JUMBF media type');
        fields.push({
          ...entry(
            prefix + '.MediaType',
            decoder.decode(data.subarray(1, end)),
          ),
          group: credentials ? 'C2PA' : 'JUMBF',
        });
        if ((data[0] ?? 0) & 1)
          fields.push({
            ...entry(
              prefix + '.FileName',
              decoder.decode(data.subarray(end + 1)).replace(/\0.*$/s, ''),
            ),
            group: credentials ? 'C2PA' : 'JUMBF',
          });
      } else {
        // Embedded icons, thumbnails, salts and padding are data, never rendered markup.
        if (box.type === 'brob') warnings.push('jumbf-compressed');
        fields.push({
          ...entry(prefix + '.' + box.type, data),
          group: 'JUMBF',
        });
      }
    }
  }
  walk(boxes(bytes, 0, bytes.length), `jumbf.store[${String(store)}]`, 0);
}
export function readContentCredentials(bytes: Uint8Array): {
  fields: Entry[];
  warnings: string[];
} {
  const fields: Entry[] = [],
    warnings: string[] = [];
  const stores: Uint8Array[] = [];
  let total = 0;
  function add(data: Uint8Array): void {
    total += data.length;
    if (total > MAX_METADATA_BYTES) throw new Error('C2PA metadata size limit');
    stores.push(data);
  }
  try {
    if (ascii(bytes, 1, 4) === 'PNG') {
      const data = view(bytes);
      let p = 8;
      let count = 0;
      while (p + 12 <= bytes.length) {
        if (++count > 20000) throw new Error('PNG chunk limit');
        const length = data.getUint32(p),
          type = ascii(bytes, p + 4, p + 8);
        if (p + length + 12 > bytes.length)
          throw new Error('Truncated PNG chunk');
        if (type === 'caBX') add(bytes.subarray(p + 8, p + 8 + length));
        p += length + 12;
        if (type === 'IEND') break;
      }
    } else if (bytes[0] === 255 && bytes[1] === 216) {
      const packets = new Map<
        number,
        { sequence: number; parts: Uint8Array[]; size: number }
      >();
      let p = 2;
      let count = 0;
      while (p + 4 <= bytes.length) {
        if (++count > 20000 || bytes[p] !== 255)
          throw new Error('JPEG marker limit');
        while (bytes[p] === 255) p++;
        const marker = bytes[p++];
        if (marker === 0xda || marker === 0xd9) break;
        const length = view(bytes).getUint16(p);
        if (length < 2 || p + length > bytes.length)
          throw new Error('Truncated JPEG marker');
        const segment = bytes.subarray(p + 2, p + length);
        if (
          marker === 0xeb &&
          ascii(segment, 0, 2) === 'JP' &&
          segment.length >= 16
        ) {
          const header = view(segment),
            id = header.getUint16(2),
            sequence = header.getUint32(4);
          let packet = packets.get(id);
          if (!packet) {
            packet = { sequence: 0, parts: [], size: 0 };
            packets.set(id, packet);
          }
          if (sequence !== packet.sequence + 1)
            throw new Error('Missing JUMBF JPEG packet');
          // Subsequent APP11 packets repeat the eight-byte box header.
          const part = segment.subarray(sequence === 1 ? 8 : 16);
          packet.parts.push(part);
          packet.size += part.length;
          packet.sequence = sequence;
          if (packet.size > MAX_METADATA_BYTES)
            throw new Error('JUMBF JPEG size limit');
        }
        p += length;
      }
      for (const packet of packets.values()) add(join(packet.parts));
    } else if (
      ascii(bytes, 0, 4) === 'RIFF' &&
      ascii(bytes, 8, 12) === 'WEBP'
    ) {
      let p = 12;
      const end = Math.min(view(bytes).getUint32(4, true) + 8, bytes.length);
      while (p + 8 <= end) {
        const length = view(bytes).getUint32(p + 4, true);
        if (p + 8 + length > end) throw new Error('Truncated WebP chunk');
        if (ascii(bytes, p, p + 4) === 'C2PA')
          add(bytes.subarray(p + 8, p + 8 + length));
        p += 8 + length + (length % 2);
      }
    }
  } catch {
    warnings.push('c2pa-container');
  }
  for (const [i, store] of stores.entries()) {
    try {
      readStore(store, fields, warnings, i);
    } catch {
      warnings.push('jumbf-parse');
    }
  }
  return { fields, warnings: [...new Set(warnings)] };
}
