import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clean, inspect } from '../src/lib/container.ts';
import {
  ascii,
  join,
  pngChunk,
  view,
  MetadataError,
} from '../src/lib/binary.ts';
import { displayExif, jpegSegment } from '../src/lib/exif.ts';
import {
  pngFixture,
  jpegFixture,
  webpFixture,
  gifFixture,
  privateText,
} from './fixtures.ts';
for (const [format, fixture] of [
  ['PNG', pngFixture],
  ['JPEG', jpegFixture],
  ['WebP', webpFixture],
  ['GIF', gifFixture],
] as const) {
  await test(`${format} removes private blocks and trailing bytes with unchanged payloads`, () => {
    const input = fixture();
    const backup = input.slice();
    const output = clean(input);
    assert.equal(output.after.format, format);
    assert(output.saved > 0);
    assert.deepEqual(input, backup);
    assert(!Buffer.from(output.bytes).includes(privateText));
    assert.deepEqual(output.before.compressed, output.after.compressed);
    const second = clean(output.bytes);
    assert.equal(second.saved, 0);
    assert.deepEqual(second.bytes, output.bytes);
  });
  await test(`${format} empty selection retains original byte content`, () => {
    const input = fixture();
    const output = clean(input, []);
    assert.deepEqual(output.bytes, input);
    assert.equal(output.saved, 0);
  });
  await test(`${format} rejects truncation rather than returning a partial output`, () => {
    const input = fixture();
    const end =
      inspect(input).blocks.find((b) => b.name === 'Trailing data')?.offset ??
      input.length;
    assert.throws(() => clean(input.subarray(0, end - 2)));
  });
}
await test('EXIF is rebuilt from display-only tags and retains orientation', () => {
  const output = clean(jpegFixture());
  const b = output.after.blocks.find((x) => x.name === 'Minimal display EXIF');
  assert(b);
  assert.equal(
    displayExif(output.bytes.subarray(b.offset + 4, b.offset + b.length))
      .orientation,
    6,
  );
  assert.equal(b.reason, 'display');
  assert(b.length < 50);
});
await test('invalid selections cannot delete compressed data or decoder structures', () => {
  const image = pngFixture();
  const parsed = inspect(image);
  const pixel = parsed.blocks.find((b) => b.reason === 'pixels');
  assert(pixel);
  assert.throws(() => clean(image, [pixel.id]));
  assert.throws(() => clean(image, ['missing']));
});
await test('PNG CRC failures and unknown critical chunks fail safely', () => {
  const input = pngFixture();
  const corrupt = input.slice();
  corrupt[25] = (corrupt[25] ?? 0) ^ 1;
  assert.throws(() => clean(corrupt));
  const blocks = inspect(input).blocks;
  const position = blocks.find((b) => b.name === 'IDAT')?.offset;
  assert(position);
  assert.throws(() =>
    clean(
      join([
        input.subarray(0, position),
        pngChunk('ABCD', new Uint8Array()),
        input.subarray(position),
      ]),
    ),
  );
});
await test('PNG color and transparency information is preserved', () => {
  const input = pngFixture();
  const position = inspect(input).blocks.find((b) => b.name === 'IDAT')?.offset;
  assert(position);
  const gamma = new Uint8Array(4);
  view(gamma).setUint32(0, 45455);
  const colored = join([
    input.subarray(0, position),
    pngChunk('gAMA', gamma),
    input.subarray(position),
  ]);
  const output = clean(colored);
  const gammaBlock = output.after.blocks.find((b) => b.name === 'gAMA');
  assert(gammaBlock);
  assert.equal(gammaBlock.reason, 'color');
});
await test('WebP clears XMP flag but keeps minimal orientation EXIF flag', () => {
  const output = clean(webpFixture());
  assert.equal((output.bytes[20] ?? 0) & 12, 8);
  assert.equal(view(output.bytes).getUint32(4, true), output.bytes.length - 8);
});
await test('unsupported image formats are not converted', () => {
  assert.throws(() => clean(new TextEncoder().encode('this is not an image')));
  assert.throws(() => clean(new Uint8Array([73, 73, 42, 0, 8, 0, 0, 0])));
});
await test('JPEG rejects gain-map XMP beyond the prefix and appended image content', () => {
  const source = jpegFixture();
  const xmp = jpegSegment(
    0xe1,
    new TextEncoder().encode(' '.repeat(700) + 'hdrgm:Version="1.0"'),
  );
  assert.throws(
    () => clean(join([source.subarray(0, 2), xmp, source.subarray(2)])),
    (error: unknown) =>
      error instanceof MetadataError && error.code === 'unsafe',
  );
  const end = inspect(source).blocks.find(
    (b) => b.name === 'Trailing data',
  )?.offset;
  assert(end);
  assert.throws(
    () => clean(join([source.subarray(0, end), source])),
    (error: unknown) =>
      error instanceof MetadataError && error.code === 'unsafe',
  );
});
await test('metadata output does not contain the private canary', () => {
  for (const fixture of [pngFixture, jpegFixture, webpFixture, gifFixture])
    assert(!ascii(clean(fixture()).bytes, 0, 256).includes(privateText));
});
