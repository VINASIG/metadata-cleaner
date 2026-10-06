import { entry } from './fields.ts';
import type { Entry } from './fields.ts';
interface DerNode {
  tag: number;
  start: number;
  end: number;
  children: DerNode[];
}
function der(bytes: Uint8Array): DerNode {
  let count = 0;
  function node(offset: number, limit: number, depth: number): DerNode {
    if (++count > 2048 || depth > 20 || offset + 2 > limit)
      throw new Error('Certificate structure limit');
    const tag = bytes[offset++] ?? 0;
    if ((tag & 31) === 31) throw new Error('Unsupported certificate tag');
    const size = bytes[offset++] ?? 0;
    let length = size;
    if (size & 128) {
      const octets = size & 127;
      if (!octets || octets > 4 || offset + octets > limit)
        throw new Error('Certificate length limit');
      length = 0;
      for (let i = 0; i < octets; i++)
        length = length * 256 + (bytes[offset++] ?? 0);
    }
    const end = offset + length;
    if (end > limit) throw new Error('Truncated certificate');
    const children: DerNode[] = [];
    if (tag & 32) {
      let p = offset;
      while (p < end) {
        const child = node(p, end, depth + 1);
        children.push(child);
        p = child.end;
      }
    }
    return { tag, start: offset, end, children };
  }
  const result = node(0, bytes.length, 0);
  if (result.end !== bytes.length)
    throw new Error('Certificate trailing bytes');
  return result;
}
function oid(bytes: Uint8Array): string {
  const values: number[] = [];
  let value = 0;
  for (const byte of bytes) {
    value = value * 128 + (byte & 127);
    if (!Number.isSafeInteger(value)) throw new Error('Certificate OID limit');
    if (!(byte & 128)) {
      values.push(value);
      value = 0;
    }
  }
  const first = values.shift();
  if (first === undefined) return '';
  return [
    first < 40 ? 0 : first < 80 ? 1 : 2,
    first < 80 ? first % 40 : first - 80,
    ...values,
  ].join('.');
}
export function certificateFields(bytes: Uint8Array, prefix: string): Entry[] {
  const root = der(bytes);
  const tbs = root.children[0];
  if (root.tag !== 48 || tbs?.tag !== 48)
    throw new Error('Invalid certificate');
  const shift = tbs.children[0]?.tag === 160 ? 1 : 0;
  const serial = tbs.children[shift];
  const issuer = tbs.children[shift + 2];
  const validity = tbs.children[shift + 3];
  const subject = tbs.children[shift + 4];
  if (
    serial?.tag !== 2 ||
    issuer?.tag !== 48 ||
    validity?.tag !== 48 ||
    subject?.tag !== 48
  )
    throw new Error('Invalid certificate fields');
  const fields = [
    entry(
      prefix + '.SerialNumber',
      Array.from(bytes.subarray(serial.start, serial.end), (x) =>
        x.toString(16).padStart(2, '0'),
      ).join(''),
    ),
  ];
  const names: Record<string, string> = {
    '2.5.4.3': 'CommonName',
    '2.5.4.6': 'Country',
    '2.5.4.7': 'Locality',
    '2.5.4.8': 'State',
    '2.5.4.10': 'Organization',
    '2.5.4.11': 'OrganizationalUnit',
    '1.2.840.113549.1.9.1': 'Email',
  };
  for (const [name, dn] of [
    ['Issuer', issuer],
    ['Subject', subject],
  ] as const) {
    for (const set of dn.children)
      for (const pair of set.children) {
        const type = pair.children[0],
          value = pair.children[1];
        if (type?.tag !== 6 || !value) continue;
        const id = oid(bytes.subarray(type.start, type.end));
        const text = new TextDecoder(
          value.tag === 30
            ? 'utf-16be'
            : value.tag === 12
              ? 'utf-8'
              : 'windows-1252',
        ).decode(bytes.subarray(value.start, value.end));
        fields.push(entry(`${prefix}.${name}.${names[id] ?? id}`, text));
      }
  }
  for (const [i, date] of validity.children.entries()) {
    if (date.tag === 23 || date.tag === 24) {
      const raw = new TextDecoder().decode(
        bytes.subarray(date.start, date.end),
      );
      const standard =
        date.tag === 23 && /^\d{12}Z$/.test(raw)
          ? (Number(raw.slice(0, 2)) >= 50 ? '19' : '20') + raw
          : raw;
      const iso = /^\d{14}Z$/.test(standard)
        ? `${standard.slice(0, 4)}-${standard.slice(4, 6)}-${standard.slice(6, 8)}T${standard.slice(8, 10)}:${standard.slice(10, 12)}:${standard.slice(12, 14)}Z`
        : raw;
      fields.push(
        entry(prefix + (i === 0 ? '.NotBefore' : '.NotAfter'), iso, raw),
      );
    }
  }
  return fields;
}
