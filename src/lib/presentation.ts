import type { Entry } from './fields.ts';
export function groupOf(field: Entry): string {
  if (field.group) return field.group;
  const prefix = field.key.split('.')[0] ?? 'Metadata';
  if (['format', 'technical'].includes(prefix)) return 'Technical';
  if (['common', 'native'].includes(prefix)) return 'Media';
  return prefix.toUpperCase();
}
export function shortKey(key: string): string {
  if (/^(c2pa|jumbf)\./.test(key))
    return key
      .replace(/^(c2pa|jumbf)\.store\[\d+\]\.c2pa\./, '')
      .replace('.c2pa.assertions.', '.');
  return key.replace(/^[^.]+\./, '');
}
export function originFacts(fields: Entry[], lang: 'vi' | 'en'): Entry[] {
  const result: Entry[] = [];
  const seen = new Set<string>();
  function add(label: string, values: string[]): void {
    const value = [...new Set(values.filter(Boolean))].join('\n');
    if (value && !seen.has(label)) {
      result.push({ key: label, value });
      seen.add(label);
    }
  }
  function values(pattern: RegExp): string[] {
    return fields
      .filter((field) => pattern.test(field.key))
      .map((field) => field.value);
  }
  add(
    lang === 'vi' ? 'Phần mềm được ghi nhận' : 'Recorded software',
    fields
      .filter((field) =>
        /(softwareAgent\.name|claim_generator_info(\[\d+\])?\.name|claim_generator|\.Software|\.CreatorTool)$/.test(
          field.key,
        ),
      )
      .map((field) => {
        const version = field.key.endsWith('.name')
          ? fields.find(
              (candidate) =>
                candidate.key === field.key.slice(0, -5) + '.version',
            )?.value
          : undefined;
        return field.value + (version ? ' ' + version : '');
      }),
  );
  add(
    lang === 'vi' ? 'Loại nguồn được khai báo' : 'Declared source type',
    values(
      /(digitalSourceType|DigitalSourceType|ContainsAiGeneratedContent)$/,
    ).map((value) => {
      if (value.endsWith('/trainedAlgorithmicMedia'))
        return lang === 'vi' ? 'Ảnh được tạo bằng AI' : 'AI-generated image';
      if (value.endsWith('/compositeWithTrainedAlgorithmicMedia'))
        return lang === 'vi'
          ? 'Ảnh kết hợp nội dung được tạo bằng AI'
          : 'Composite with AI-generated content';
      return value;
    }),
  );
  add(
    lang === 'vi' ? 'Tiêu đề được nhúng' : 'Embedded title',
    values(/\.(dc:title|title|Title)$/),
  );
  add(
    lang === 'vi' ? 'Tác giả được ghi nhận' : 'Recorded author',
    values(/\.(Artist|Author|creator|Copyright)$/),
  );
  add(
    lang === 'vi' ? 'Thời điểm được ghi nhận' : 'Recorded dates',
    values(/(\.when|\.DateTimeOriginal|\.CreateDate|\.CreationDate)$/),
  );
  add(
    lang === 'vi' ? 'Thông tin camera' : 'Camera information',
    values(/\.(Make|Model|LensModel)$/),
  );
  add(
    lang === 'vi' ? 'Định danh trong metadata' : 'Identifiers in metadata',
    values(
      /\.(instanceID|InstanceID|DocumentID|SerialNumber|BodySerialNumber)$/,
    ).filter((_value, index) => index < 6),
  );
  return result;
}
export interface RecordedAction {
  key: string;
  action: string;
  when?: string;
  description?: string;
  software?: string;
}
export function recordedActions(fields: Entry[]): RecordedAction[] {
  return fields
    .filter((field) => /\.actions\[\d+\]\.action$/.test(field.key))
    .map((field) => {
      const prefix = field.key.slice(0, -7);
      const get = (suffix: string) =>
        fields.find((candidate) => candidate.key === prefix + suffix)?.value;
      const when = get('.when'),
        description = get('.description'),
        software = get('.softwareAgent.name');
      return {
        key: shortKey(prefix),
        action: field.value,
        ...(when ? { when } : {}),
        ...(description ? { description } : {}),
        ...(software ? { software } : {}),
      };
    });
}
export function summarizeBlocks(
  blocks: { name: string; reason: string; length: number; offset: number }[],
): {
  name: string;
  reason: string;
  bytes: number;
  count: number;
  offsets: number[];
}[] {
  const result = new Map<
    string,
    {
      name: string;
      reason: string;
      bytes: number;
      count: number;
      offsets: number[];
    }
  >();
  for (const block of blocks) {
    const key = block.name + '\0' + block.reason;
    const group = result.get(key) ?? {
      name: block.name,
      reason: block.reason,
      bytes: 0,
      count: 0,
      offsets: [],
    };
    group.bytes += block.length;
    group.count++;
    group.offsets.push(block.offset);
    result.set(key, group);
  }
  return [...result.values()];
}
