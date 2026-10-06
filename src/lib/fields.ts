export interface Entry {
  key: string;
  value: string;
  group?: string;
  raw?: string;
  source?: 'embedded' | 'derived';
  truncated?: boolean;
  tagId?: string | number;
  binaryBytes?: number;
}
export interface Metadata {
  format: string;
  fields: Entry[];
  scope: 'image' | 'pdf' | 'audio' | 'archive' | 'basic';
  warnings: string[];
  mime?: string;
  width?: number;
  height?: number;
}
export const MAX_FIELDS = 5000;
export const MAX_TEXT = 8192;
export function binaryValue(bytes: Uint8Array): string {
  const preview = Array.from(bytes.subarray(0, 256), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join(' ');
  return `${String(bytes.length)} bytes\n${preview}${bytes.length > 256 ? '\n…' : ''}`;
}
export function valueText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return binaryValue(value);
  if (value instanceof ArrayBuffer) return binaryValue(new Uint8Array(value));
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value === undefined) return '';
  return JSON.stringify(value, (_key: string, item: unknown) =>
    item instanceof Uint8Array ? binaryValue(item) : item,
  );
}
export function entry(key: string, value: unknown, raw?: unknown): Entry {
  const text = valueText(value);
  const original = raw === undefined ? undefined : valueText(raw);
  return {
    key: key.slice(0, 512),
    value: text.slice(0, MAX_TEXT),
    ...(value instanceof Uint8Array || value instanceof ArrayBuffer
      ? { binaryBytes: value.byteLength }
      : {}),
    ...(original !== undefined && original !== text
      ? { raw: original.slice(0, MAX_TEXT) }
      : {}),
    ...(key.length > 512 ||
    text.length > MAX_TEXT ||
    (original?.length ?? 0) > MAX_TEXT
      ? { truncated: true }
      : {}),
  };
}
export function flatten(
  value: unknown,
  prefix = '',
  out: Entry[] = [],
  depth = 0,
  imageTags = false,
): Entry[] {
  if (out.length >= MAX_FIELDS || value === undefined) return out;
  if (depth > 24) {
    out.push({ ...entry(prefix, '[Depth limit reached]'), truncated: true });
    return out;
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    value instanceof Date ||
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer
  ) {
    out.push(entry(prefix, value));
  } else if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      if (out.length >= MAX_FIELDS) break;
      flatten(item, `${prefix}[${String(i)}]`, out, depth + 1, imageTags);
    }
  } else {
    const record = value as Record<string, unknown>;
    // ExifReader tags are records, not three independent metadata fields.
    if (imageTags && 'value' in record && 'description' in record) {
      const description = record['description'];
      const id = record['id'];
      out.push({
        ...entry(prefix, description ?? record['value'], record['value']),
        ...(typeof id === 'string' || typeof id === 'number'
          ? { tagId: id }
          : {}),
      });
    } else {
      for (const [key, item] of Object.entries(record)) {
        if (imageTags && ['base64', '_raw'].includes(key)) continue;
        flatten(
          item,
          prefix ? `${prefix}.${key}` : key,
          out,
          depth + 1,
          imageTags,
        );
      }
    }
  }
  return out;
}
export function uniqueFields(fields: Entry[]): Entry[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const id = field.key + '\0' + field.value;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
