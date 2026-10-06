import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readMetadata, flatten } from '../src/lib/metadata.ts';
import { clean } from '../src/lib/container.ts';
import { decodeCbor } from '../src/lib/cbor.ts';
import { readContentCredentials } from '../src/lib/jumbf.ts';
import {
  originFacts,
  recordedActions,
  summarizeBlocks,
} from '../src/lib/presentation.ts';
import { uniqueFields } from '../src/lib/fields.ts';
import { jpegSegment } from '../src/lib/exif.ts';
import { join, view } from '../src/lib/binary.ts';
import { jpegFixture, pngFixture } from './fixtures.ts';
import {
  cborFixture,
  provenancePng,
  provenanceStore,
  superbox,
  boxFixture,
} from './provenance-fixtures.ts';

await test('C2PA PNG exposes creation, time, software, identifiers, salts and both signature header contexts', async () => {
  const bytes = provenancePng(true),
    before = bytes.slice();
  const result = await readMetadata(bytes);
  assert.deepEqual(result.warnings, []);
  assert(result.fields.some((field) => field.value === 'Fixture Creator'));
  assert(
    result.fields.some(
      (field) =>
        field.key.endsWith('.when') && field.value === '2026-01-01T00:00:00Z',
    ),
  );
  assert(
    result.fields.some(
      (field) => field.key.endsWith('.Salt') && field.value === '0'.repeat(32),
    ),
  );
  assert(
    result.fields.some(
      (field) =>
        field.key.endsWith('.ProtectedHeader.Algorithm') &&
        field.value === 'ES256' &&
        field.raw === '-7',
    ),
  );
  assert(
    result.fields.some(
      (field) =>
        field.key.endsWith('.UnprotectedHeader.Algorithm') &&
        field.value === 'PS256',
    ),
  );
  const actions = recordedActions(result.fields);
  assert.equal(actions.length, 4);
  assert.notEqual(actions[0]?.key, actions[2]?.key);
  assert.equal(actions[0]?.software, 'Fixture Creator');
  assert(result.fields.some((field) => field.value.includes('<img src=')));
  assert.deepEqual(bytes, before);
  const output = clean(bytes);
  assert.deepEqual(output.before.compressed, output.after.compressed);
  assert(!Buffer.from(output.bytes).includes('Fixture Creator'));
  const after = await readMetadata(output.bytes);
  assert(!after.fields.some((field) => field.group === 'C2PA'));
});
await test('generic JUMBF data is visible without claiming Content Credentials', async () => {
  const store = superbox('json', 'custom.data', [
    boxFixture('json', new TextEncoder().encode('{"author":"Fixture author"}')),
  ]);
  const result = await readMetadata(provenancePng(false, store));
  assert.deepEqual(result.warnings, []);
  assert(result.fields.some((field) => field.value === 'Fixture author'));
  assert(!result.fields.some((field) => field.group === 'C2PA'));
});
await test('PNG aliases and tag bookkeeping never produce duplicate result rows', async () => {
  const result = await readMetadata(pngFixture());
  assert.equal(
    result.fields.filter((field) => field.key === 'png.Image Width').length,
    1,
  );
  assert(!result.fields.some((field) => /^png(File|Text)\./.test(field.key)));
  assert.deepEqual(
    flatten(
      { PixelXDimension: { id: 40962, value: 1264, description: 1264 } },
      '',
      [],
      0,
      true,
    ),
    [{ key: 'PixelXDimension', value: '1264', tagId: 40962 }],
  );
  assert.equal(flatten({ value: 'A', description: 'B', image: 'C' }).length, 3);
  const entries = [
    { key: 'xmp.Creator', value: 'One' },
    { key: 'xmp.Creator', value: 'One' },
    { key: 'exif.Creator', value: 'One' },
    { key: 'xmp.Creator', value: 'Two' },
  ];
  assert.equal(uniqueFields(entries).length, 3);
  assert.equal(uniqueFields(result.fields).length, result.fields.length);
});
await test('fingerprints cover the selected byte view rather than the backing buffer', async () => {
  const png = pngFixture(),
    backing = join([new Uint8Array(10), png, new Uint8Array(20)]);
  const result = await readMetadata(backing.subarray(10, 10 + png.length));
  assert.equal(
    result.fields.find((field) => field.key === 'technical.SHA-256')?.value,
    createHash('sha256').update(png).digest('hex'),
  );
  assert.equal(
    result.fields.find((field) => field.key === 'technical.SHA-512')?.value,
    createHash('sha512').update(png).digest('hex'),
  );
});
await test('malformed CBOR and JUMBF leave basic image tags available with explicit partial warnings', async () => {
  const bad = provenanceStore();
  view(bad).setUint32(0, bad.length + 1);
  const result = await readMetadata(provenancePng(false, bad));
  assert(result.warnings.includes('jumbf-parse'));
  assert(result.fields.some((field) => field.key === 'png.Image Width'));
  const compressed = await readMetadata(
    provenancePng(
      false,
      superbox('c2cm', 'compressed', [
        boxFixture('brob', new Uint8Array([1, 2, 3])),
      ]),
    ),
  );
  assert(compressed.warnings.includes('jumbf-compressed'));
  assert(compressed.fields.some((field) => field.binaryBytes === 3));
  for (const value of [
    new Uint8Array([0x9f, 1]),
    new Uint8Array([0xa2, 0x61, 97, 1, 0x61, 97, 2]),
    new Uint8Array([0x1b, 255, 255, 255, 255, 255, 255, 255, 255]),
    new Uint8Array([0x58, 200]),
  ])
    assert.throws(() => decodeCbor(value));
  let nested = new Uint8Array([0]);
  for (let i = 0; i < 34; i++) nested = join([new Uint8Array([0x81]), nested]);
  assert.throws(() => decodeCbor(nested));
  assert.deepEqual(decodeCbor(new Uint8Array([0x9f, 1, 0x61, 97, 0xff])), [
    1,
    'a',
  ]);
  assert.deepEqual(
    decodeCbor(
      cborFixture({ false: false, null: null, bytes: new Uint8Array([1, 2]) }),
    ),
    { false: false, null: null, bytes: new Uint8Array([1, 2]) },
  );
});
await test('APP11 packet assembly reads C2PA and detects missing continuation packets', () => {
  const store = provenanceStore(),
    split = Math.floor(store.length / 2);
  function packet(sequence: number, data: Uint8Array): Uint8Array {
    const head = new Uint8Array([74, 80, 0, 1, 0, 0, 0, 0]);
    view(head).setUint32(4, sequence);
    return jpegSegment(0xeb, join([head, data]));
  }
  const source = jpegFixture();
  const first = packet(1, store.subarray(0, split));
  const second = packet(2, join([store.subarray(0, 8), store.subarray(split)]));
  const result = readContentCredentials(
    join([source.subarray(0, 2), first, second, source.subarray(2)]),
  );
  assert.deepEqual(result.warnings, []);
  assert(result.fields.some((field) => field.value === 'Fixture Creator'));
  const missing = readContentCredentials(
    join([source.subarray(0, 2), second, source.subarray(2)]),
  );
  assert(missing.warnings.includes('c2pa-container'));
});
await test('AI content flags remain distinct from declared source types and preserve original values', () => {
  const fields = [
    { key: 'xmp.ContainsAiGeneratedContent', value: 'Yes' },
    {
      key: 'xmp.DigitalSourceType',
      value:
        'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
    },
    {
      key: 'c2pa.manifest[1].digitalSourceType',
      value: 'http://cv.iptc.org/newscodes/digitalsourcetype/composite',
    },
  ];
  const before = structuredClone(fields);
  for (const [lang, sourceLabel, sourceValue, flagLabel, flagValue] of [
    [
      'vi',
      'Loại nguồn được khai báo',
      'Ảnh kết hợp nội dung được tạo bằng AI\nẢnh ghép',
      'Nội dung AI được khai báo',
      'Có nội dung được tạo bằng AI',
    ],
    [
      'en',
      'Declared source type',
      'Composite with AI-generated content\nComposite image',
      'Declared AI content',
      'Contains AI-generated content',
    ],
  ] as const) {
    const facts = originFacts(fields, lang);
    assert.equal(
      facts.find((field) => field.key === sourceLabel)?.value,
      sourceValue,
    );
    assert.equal(
      facts.find((field) => field.key === flagLabel)?.value,
      flagValue,
    );
    assert(!facts.some((field) => field.value === 'Yes'));
  }
  assert.deepEqual(fields, before);
});
await test('hundreds of repeated image chunks are summarized without losing counts or offsets', () => {
  const blocks = Array.from({ length: 1000 }, (_item, i) => ({
    name: 'IDAT',
    reason: 'pixels',
    length: 100,
    offset: i * 100,
  }));
  const groups = summarizeBlocks(blocks);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.count, 1000);
  assert.equal(groups[0].bytes, 100000);
  assert.equal(groups[0].offsets.at(-1), 99900);
});
