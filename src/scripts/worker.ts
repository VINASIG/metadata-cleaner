import { inspect, clean, MAX_FILE_BYTES } from '../lib/container.ts';
import { join, MetadataError } from '../lib/binary.ts';
import { readMetadata } from '../lib/metadata.ts';
import { mode } from '../lib/site.ts';
import type { Request, Response, Summary } from '../lib/messages.ts';
import type { Inspection } from '../lib/container.ts';

interface WorkerScope {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Response, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;
function summarize(value: Inspection): Summary {
  return {
    format: value.format,
    mime: value.mime,
    width: value.width,
    height: value.height,
    blocks: value.blocks.map((b) => ({
      id: b.id,
      name: b.name,
      offset: b.offset,
      length: b.length,
      reason: b.reason,
      ...(b.replacement
        ? { replacement: new Uint8Array(b.replacement.length) }
        : {}),
    })),
  };
}
async function hash(parts: Uint8Array[]): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', join(parts)))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
scope.onmessage = (event: MessageEvent<Request>): void => {
  void (async () => {
    try {
      const request = event.data;
      const bytes = new Uint8Array(request.bytes);
      if (bytes.length > MAX_FILE_BYTES) throw new MetadataError('large');
      let response: Response;
      if (request.operation === 'clean') {
        const result = clean(bytes, request.remove);
        let metadata;
        try {
          metadata = await readMetadata(result.bytes);
        } catch {
          metadata = {
            format: result.after.format,
            fields: [],
            scope: 'image' as const,
            warnings: ['parse'],
          };
        }
        response = {
          ok: true,
          metadata,
          summary: summarize(result.after),
          output: result.bytes.buffer,
          saved: result.saved,
          beforeHash: await hash(result.before.compressed),
          afterHash: await hash(result.after.compressed),
          removed: result.removed,
        };
      } else {
        let summary: Summary | null = null;
        try {
          summary = summarize(inspect(bytes));
        } catch (error) {
          if (!(error instanceof MetadataError) || mode === 'cleaner')
            throw error;
        }
        const metadata = await readMetadata(bytes);
        response = { ok: true, summary, metadata };
      }
      scope.postMessage(response, response.output ? [response.output] : []);
    } catch (error) {
      scope.postMessage({
        ok: false,
        error: error instanceof MetadataError ? error.code : 'failed',
      } satisfies Response);
    }
  })();
};
