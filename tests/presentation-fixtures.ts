import { deflateSync } from 'node:zlib';
import { join, pngChunk, view } from '../src/lib/binary.ts';

export const finalField = 'MANY_FIELDS_FINAL_TAG';
export const longField = 'LongMetadataValue';

export function presentationPng(rich = false): Uint8Array<ArrayBuffer> {
  const width = 32;
  const height = 24;
  const header = new Uint8Array(13);
  view(header).setUint32(0, width);
  view(header).setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const pixels = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      pixels.set([x * 7, y * 10, 128, 255], y * (width * 4 + 1) + 1 + x * 4);
  const chunks = [pngChunk('IHDR', header)];
  if (rich) {
    const properties = Array.from({ length: 512 }, (_, index) => {
      const name = 'Field' + String(index).padStart(4, '0');
      const value =
        index === 511 ? finalField : 'Synthetic value ' + String(index);
      return `<test:${name}>${value}</test:${name}>`;
    }).join('');
    const text = 'Long metadata café 東京 🌃 '.repeat(100);
    const xml = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:test="https://example.invalid/metadata/"><test:${longField}>${text}</test:${longField}>${properties}</rdf:Description></rdf:RDF></x:xmpmeta>`;
    chunks.push(
      pngChunk(
        'iTXt',
        join([
          new TextEncoder().encode('XML:com.adobe.xmp'),
          new Uint8Array(5),
          new TextEncoder().encode(xml),
        ]),
      ),
    );
  }
  chunks.push(
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', new Uint8Array()),
  );
  return join([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}
