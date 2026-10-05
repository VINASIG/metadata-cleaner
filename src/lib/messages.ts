import type { Block, Format } from './container.ts';
import type { Metadata } from './metadata.ts';
export interface Summary {
  format: Format;
  mime: string;
  width: number;
  height: number;
  blocks: Block[];
}
export interface Request {
  operation: 'inspect' | 'clean';
  bytes: ArrayBuffer;
  remove?: string[];
  name: string;
  mime: string;
  lang: 'vi' | 'en';
}
export type Response =
  | {
      ok: false;
      error:
        'unsupported' | 'invalid' | 'large' | 'unsafe' | 'timeout' | 'failed';
    }
  | {
      ok: true;
      metadata: Metadata;
      summary: Summary | null;
      output?: ArrayBuffer;
      saved?: number;
      beforeHash?: string;
      afterHash?: string;
      removed?: string[];
    };
