import { join, pngChunk, view } from '../src/lib/binary.ts';
import { pngFixture } from './fixtures.ts';
type Value =
  | string
  | number
  | boolean
  | null
  | Uint8Array
  | Value[]
  | { [key: string]: Value };
function head(major: number, length: number): Uint8Array {
  if (length < 24) return new Uint8Array([major * 32 + length]);
  if (length < 256) return new Uint8Array([major * 32 + 24, length]);
  if (length < 65536) {
    const out = new Uint8Array(3);
    out[0] = major * 32 + 25;
    view(out).setUint16(1, length);
    return out;
  }
  const out = new Uint8Array(5);
  out[0] = major * 32 + 26;
  view(out).setUint32(1, length);
  return out;
}
export function cborFixture(value: Value): Uint8Array<ArrayBuffer> {
  if (value === null) return new Uint8Array([246]);
  if (typeof value === 'boolean') return new Uint8Array([value ? 245 : 244]);
  if (typeof value === 'number')
    return head(value < 0 ? 1 : 0, value < 0 ? -1 - value : value).slice();
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    return join([head(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) return join([head(2, value.length), value]);
  if (Array.isArray(value))
    return join([head(4, value.length), ...value.map(cborFixture)]);
  const pairs = Object.entries(value);
  return join([
    head(5, pairs.length),
    ...pairs.flatMap(([key, item]) => [cborFixture(key), cborFixture(item)]),
  ]);
}
export function boxFixture(
  type: string,
  data: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const box = new Uint8Array(data.length + 8);
  view(box).setUint32(0, box.length);
  box.set(new TextEncoder().encode(type), 4);
  box.set(data, 8);
  return box;
}
export function superbox(
  type: string,
  label: string,
  parts: Uint8Array[],
  salt = false,
): Uint8Array<ArrayBuffer> {
  const uuid = new Uint8Array([
    0, 0, 0, 0, 0, 17, 0, 16, 128, 0, 0, 170, 0, 56, 155, 113,
  ]);
  uuid.set(new TextEncoder().encode(type), 0);
  const descriptor = boxFixture(
    'jumd',
    join([
      uuid,
      new Uint8Array([salt ? 19 : 3]),
      new TextEncoder().encode(label + '\0'),
      ...(salt ? [boxFixture('c2sh', new Uint8Array(16))] : []),
    ]),
  );
  return boxFixture('jumb', join([descriptor, ...parts]));
}
export function provenanceStore(multiple = false): Uint8Array<ArrayBuffer> {
  function manifest(index: number): Uint8Array<ArrayBuffer> {
    return superbox('c2ma', 'urn:c2pa:fixture-' + String(index), [
      superbox('c2as', 'c2pa.assertions', [
        superbox(
          'cbor',
          'c2pa.actions.v2',
          [
            boxFixture(
              'cbor',
              cborFixture({
                actions: [
                  {
                    action: 'c2pa.created',
                    when: '2026-01-01T00:00:00Z',
                    softwareAgent: { name: 'Fixture Creator', version: '1.0' },
                    digitalSourceType:
                      'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
                  },
                  { action: 'c2pa.converted', description: 'Converted to PNG' },
                ],
                allActionsIncluded: false,
              }),
            ),
          ],
          true,
        ),
        superbox('json', 'fixture.custom', [
          boxFixture(
            'json',
            new TextEncoder().encode(
              JSON.stringify({
                author: 'Synthetic fixture',
                html: '<img src="https://example.invalid/private" onerror="alert(1)">',
              }),
            ),
          ),
        ]),
      ]),
      superbox('c2cl', 'c2pa.claim.v2', [
        boxFixture(
          'cbor',
          cborFixture({
            instanceID: 'fixture-image-' + String(index),
            claim_generator_info: {
              name: 'Fixture Service',
              specVersion: '2.2.0',
            },
            signature: 'self#jumbf=c2pa.signature',
            'dc:title': 'Fixture image',
          }),
        ),
      ]),
      superbox('c2cs', 'c2pa.signature', [
        boxFixture(
          'cbor',
          cborFixture([
            cborFixture({ '1': -7 }),
            { '1': -37, pad: new Uint8Array(3) },
            null,
            new Uint8Array([1, 2, 3]),
          ]),
        ),
      ]),
    ]);
  }
  return superbox('c2pa', 'c2pa', [
    manifest(0),
    ...(multiple ? [manifest(1)] : []),
  ]);
}
export function provenancePng(
  multiple = false,
  store = provenanceStore(multiple),
): Uint8Array<ArrayBuffer> {
  const source = pngFixture();
  return join([
    source.subarray(0, 33),
    pngChunk('caBX', store),
    source.subarray(33),
  ]);
}
