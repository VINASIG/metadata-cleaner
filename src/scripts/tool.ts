import { copy } from '../lib/copy.ts';
import { mode } from '../lib/site.ts';
import { MAX_FILE_BYTES } from '../lib/container.ts';
import type { Response, Request, Summary } from '../lib/messages.ts';
import type { Entry, Metadata } from '../lib/metadata.ts';

const lang = document.documentElement.lang === 'en' ? 'en' : 'vi';
const c = copy[lang];
function element<T extends HTMLElement = HTMLElement>(
  selector: string,
  type?: new () => T,
): T {
  const found = document.querySelector<T>(selector);
  if (!found || (type && !(found instanceof type)))
    throw new Error(`Missing control ${selector}`);
  return found;
}
const fileInput = element('#file', HTMLInputElement);
const status = element('#status', HTMLParagraphElement);
const clear = element('#clear', HTMLButtonElement);
const result = element('#result', HTMLDivElement);
const search = element('#search', HTMLInputElement);
const processButton = document.querySelector<HTMLButtonElement>('#process');
const download = document.querySelector<HTMLButtonElement>('#download');
const filename = document.querySelector<HTMLInputElement>('#filename');
let file: File | null = null;
let summary: Summary | null = null;
let metadata: Metadata | null = null;
let output: ArrayBuffer | null = null;
let worker: Worker | null = null;
let revision = 0;
let timeout: ReturnType<typeof setTimeout> | null = null;
let previewUrl: string | null = null;
let reportData: Response | null = null;
function show(selector: string, value: boolean): void {
  const node = document.querySelector<HTMLElement>(selector);
  if (node) node.hidden = !value;
}
function setStatus(message: string, error = false): void {
  status.textContent = message;
  status.dataset['state'] = error ? 'error' : 'ready';
}
function size(bytes: number): string {
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(bytes)} bytes`;
}
function facts(selector: string, entries: Entry[]): void {
  const dl = element(selector, HTMLDListElement);
  dl.replaceChildren();
  for (const entry of entries) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = entry.key;
    dd.textContent = entry.value;
    dl.append(dt, dd);
  }
}
function stop(): void {
  worker?.terminate();
  worker = null;
  if (timeout !== null) clearTimeout(timeout);
  timeout = null;
}
function clearOutput(): void {
  output = null;
  reportData = null;
  if (download) download.disabled = true;
  show('#clean-result', false);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  const image = document.querySelector<HTMLImageElement>('#image-preview');
  if (image) {
    image.removeAttribute('src');
    image.hidden = true;
  }
}
function reset(): void {
  revision++;
  stop();
  clearOutput();
  file = null;
  summary = null;
  metadata = null;
  fileInput.value = '';
  search.value = '';
  clear.disabled = true;
  show('#selection', false);
  show('#file-info', false);
  show('#result', false);
  show('#empty-result', true);
  show('#protected', false);
  element('#metadata-fields').replaceChildren();
  setStatus(c.statusEmpty);
}
function selected(): string[] {
  return [
    ...document.querySelectorAll<HTMLInputElement>('#choices input:checked'),
  ].map((input) => input.value);
}
function renderChoices(value: Summary): void {
  if (mode !== 'cleaner') return;
  const choices = element('#choices', HTMLFieldSetElement);
  choices.querySelectorAll('label').forEach((node) => {
    node.remove();
  });
  const removable = value.blocks.filter((b) => b.reason === 'metadata');
  show('#no-blocks', removable.length === 0);
  for (const b of removable) {
    const label = document.createElement('label');
    label.className = 'block-choice';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = b.id;
    input.checked = true;
    input.setAttribute('aria-label', `${c.removeBlock} ${b.name}`);
    const span = document.createElement('span');
    span.dataset['userContent'] = '';
    span.textContent = b.name;
    const note = document.createElement('small');
    note.textContent = `${size(b.length)}${b.replacement ? ' - ' + c.minimal : ''}`;
    span.append(note);
    label.append(input, span);
    choices.append(label);
    input.addEventListener('change', () => {
      revision++;
      stop();
      clearOutput();
      if (processButton) processButton.disabled = false;
    });
  }
  show('#selection', true);
  if (processButton) processButton.disabled = false;
}
function renderProtected(value: Summary): void {
  facts(
    '#protected-list',
    value.blocks
      .filter((b) => b.reason !== 'metadata')
      .map((b) => ({
        key: b.name,
        value: `${c.reason[b.reason]} - ${size(b.length)}`,
      })),
  );
  show('#protected', true);
}
function renderFields(): void {
  if (!metadata) return;
  const needle = search.value.toLocaleLowerCase(lang);
  const fields = metadata.fields.filter((entry) =>
    (entry.key + ' ' + entry.value).toLocaleLowerCase(lang).includes(needle),
  );
  facts('#metadata-fields', fields);
  element('#field-count').textContent = `${String(fields.length)} ${c.fields}`;
}
function renderMetadata(value: Metadata): void {
  metadata = value;
  renderFields();
  const scopes =
    lang === 'vi'
      ? {
          image:
            'Các trường ảnh do ExifReader hỗ trợ. EXIF, IPTC, XMP, ICC và cấu trúc ảnh tùy định dạng.',
          pdf: 'Thông tin tài liệu PDF hiện tại và XMP. Không kiểm tra tất cả phiên bản lịch sử.',
          audio: 'Thông tin codec và thẻ âm thanh do music-metadata hỗ trợ.',
          archive:
            'Danh mục ZIP và các thuộc tính Office được hỗ trợ. Không đọc toàn bộ nội dung.',
          basic:
            'Chỉ thông tin cơ bản và dấu nhận dạng. Chưa đọc metadata chuyên biệt của định dạng này.',
        }
      : {
          image:
            'Image tags supported by ExifReader. EXIF, IPTC, XMP, ICC and image structure depend on the format.',
          pdf: 'Current PDF document properties and XMP. Historical revisions are not fully inspected.',
          audio: 'Codec details and media tags supported by music-metadata.',
          archive:
            'ZIP directory and supported Office properties. File contents are not fully inspected.',
          basic:
            'Basic information and signature only. Specialized metadata is not inspected for this format.',
        };
  element('#coverage').textContent = scopes[value.scope];
  element('#limits').textContent =
    c.faqReaderText +
    (value.warnings.length > 0
      ? lang === 'vi'
        ? ' Một số dữ liệu chưa được đọc đầy đủ.'
        : ' Some data could not be fully read.'
      : '');
  result.hidden = false;
  show('#empty-result', false);
}
function extension(value: Summary): string {
  return { JPEG: 'jpg', PNG: 'png', WebP: 'webp', GIF: 'gif' }[value.format];
}
function updateName(): boolean {
  if (!filename || !summary || !download) return false;
  const name = filename.value.trim();
  const valid =
    name.length > 0 &&
    name.length <= 120 &&
    !/[\\/<>:"|?*]/.test(name) &&
    !Array.from(name).some((char) => char.charCodeAt(0) < 32) &&
    name.toLowerCase().endsWith('.' + extension(summary)) &&
    !/[. ]$/.test(name);
  filename.setAttribute('aria-invalid', String(!valid));
  download.disabled = !valid || !output;
  return valid;
}
function blobDownload(bytes: ArrayBuffer, name: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30000);
}
async function run(operation: 'inspect' | 'clean'): Promise<void> {
  if (!file) return;
  const current = ++revision;
  stop();
  clearOutput();
  if (processButton) processButton.disabled = true;
  setStatus(operation === 'inspect' ? c.loading : c.working);
  try {
    const buffer = await file.arrayBuffer();
    if (current !== revision) return;
    worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    });
    timeout = setTimeout(() => {
      if (current !== revision) return;
      revision++;
      stop();
      setStatus(c.errors.timeout, true);
      if (processButton) processButton.disabled = false;
    }, 20000);
    worker.onerror = () => {
      if (current !== revision) return;
      stop();
      setStatus(c.errors.failed, true);
      if (processButton) processButton.disabled = false;
    };
    worker.onmessage = (event: MessageEvent<Response>): void => {
      if (current !== revision) return;
      stop();
      const response = event.data;
      if (!response.ok) {
        setStatus(c.errors[response.error], true);
        if (processButton) processButton.disabled = false;
        return;
      }
      renderMetadata(response.metadata);
      reportData = response;
      if (operation === 'inspect') {
        summary = response.summary;
        if (mode === 'cleaner' && !summary) {
          show('#result', false);
          show('#empty-result', true);
          setStatus(c.errors.unsupported, true);
          return;
        }
        if (summary) {
          renderChoices(summary);
          renderProtected(summary);
        }
        setStatus(mode === 'cleaner' ? c.ready : c.readerReady);
      } else if (response.output && summary && file) {
        output = response.output;
        show('#clean-result', true);
        if (response.summary) renderProtected(response.summary);
        facts('#sizes', [
          { key: c.original, value: size(file.size) },
          { key: c.cleaned, value: size(output.byteLength) },
          {
            key: c.saved,
            value: `${size(response.saved ?? 0)} - ${(((response.saved ?? 0) * 100) / file.size).toFixed(2)}%`,
          },
        ]);
        facts('#hashes', [
          { key: c.originalHash, value: response.beforeHash ?? '' },
          { key: c.outputHash, value: response.afterHash ?? '' },
        ]);
        if (filename) {
          filename.value = 'image.' + extension(summary);
          updateName();
        }
        element('#kept-choice').textContent =
          selected().length <
          summary.blocks.filter((b) => b.reason === 'metadata').length
            ? c.choiceKept +
              ' ' +
              summary.blocks
                .filter(
                  (b) => b.reason === 'metadata' && !selected().includes(b.id),
                )
                .map((b) => b.name)
                .join(', ')
            : '';
        const image = element('#image-preview', HTMLImageElement);
        show('#preview-unavailable', summary.width * summary.height > 40000000);
        if (summary.width * summary.height <= 40000000) {
          previewUrl = URL.createObjectURL(
            new Blob([output], { type: summary.mime }),
          );
          image.onload = () => {
            if (current === revision) image.hidden = false;
          };
          image.onerror = () => {
            show('#preview-unavailable', true);
          };
          image.src = previewUrl;
        }
        setStatus(c.done);
        if (processButton) processButton.disabled = false;
      }
    };
    const request: Request = {
      operation,
      bytes: buffer,
      name: file.name,
      mime: file.type,
      lang,
      ...(operation === 'clean' ? { remove: selected() } : {}),
    };
    worker.postMessage(request, [buffer]);
  } catch {
    if (current === revision) {
      stop();
      setStatus(c.errors.failed, true);
      if (processButton) processButton.disabled = false;
    }
  }
}
function choose(files: FileList | File[]): void {
  const offered = Array.from(files);
  reset();
  if (offered.length !== 1) {
    setStatus(c.errors.multiple, true);
    return;
  }
  const chosen = offered[0];
  if (!chosen) return;
  if (chosen.size > MAX_FILE_BYTES) {
    setStatus(c.errors.large, true);
    return;
  }
  file = chosen;
  clear.disabled = false;
  facts('#file-facts', [
    { key: c.fileName, value: file.name },
    { key: c.fileSize, value: size(file.size) },
    { key: c.fileType, value: file.type || 'Unknown' },
    {
      key: c.modified,
      value: new Date(file.lastModified).toLocaleString(lang),
    },
  ]);
  show('#file-info', true);
  void run('inspect');
}
fileInput.addEventListener('change', () => {
  if (fileInput.files) choose(fileInput.files);
});
fileInput.disabled = false;
clear.addEventListener('click', reset);
processButton?.addEventListener('click', () => {
  void run('clean');
});
filename?.addEventListener('input', updateName);
download?.addEventListener('click', () => {
  if (output && summary && filename && updateName())
    blobDownload(output, filename.value.trim(), summary.mime);
});
search.addEventListener('input', renderFields);
element('#report', HTMLButtonElement).addEventListener('click', () => {
  if (!reportData) return;
  const json = JSON.stringify(
    {
      tool: mode,
      scope: metadata?.scope,
      format: metadata?.format,
      fields: metadata?.fields,
      warnings: metadata?.warnings,
      kept: reportData.ok ? reportData.summary?.blocks : [],
      removed: reportData.ok ? reportData.removed : [],
      saved: reportData.ok ? reportData.saved : undefined,
      beforeHash: reportData.ok ? reportData.beforeHash : undefined,
      afterHash: reportData.ok ? reportData.afterHash : undefined,
      limits: c.faqReaderText,
    },
    null,
    2,
  );
  const buffer = new TextEncoder().encode(json).buffer;
  blobDownload(buffer, 'metadata-report.json', 'application/json');
});
for (const [id, checked] of [
  ['all', true],
  ['none', false],
] as const) {
  document
    .querySelector<HTMLButtonElement>('#' + id)
    ?.addEventListener('click', () => {
      revision++;
      stop();
      clearOutput();
      for (const input of document.querySelectorAll<HTMLInputElement>(
        '#choices input',
      ))
        input.checked = checked;
      if (processButton) processButton.disabled = false;
    });
}
const dropzone = element('#dropzone', HTMLDivElement);
dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.dataset['active'] = 'true';
});
dropzone.addEventListener('dragleave', () => {
  dropzone.dataset['active'] = 'false';
});
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.dataset['active'] = 'false';
  if (event.dataTransfer) choose(event.dataTransfer.files);
});
document.addEventListener('paste', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.type !== 'file')
    return;
  const files = [...(event.clipboardData?.files ?? [])];
  if (files.length) {
    event.preventDefault();
    choose(files);
  }
});
window.addEventListener('pagehide', reset);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) reset();
});
