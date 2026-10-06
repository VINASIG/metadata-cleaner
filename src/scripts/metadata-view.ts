import { copy } from '../lib/copy.ts';
import { groupOf, shortKey } from '../lib/presentation.ts';
import type { Entry } from '../lib/fields.ts';
type Language = 'vi' | 'en';
export function createMetadataView(lang: Language): {
  render: (fields: Entry[]) => void;
  reset: () => void;
} {
  const c = copy[lang];
  const container = document.querySelector('#metadata-fields');
  const groups = document.querySelector('#metadata-groups');
  const count = document.querySelector('#field-count');
  const empty = document.querySelector<HTMLElement>('#no-results');
  const search = document.querySelector<HTMLInputElement>('#search');
  if (!container || !groups || !count || !empty || !search)
    throw new Error('Missing metadata view');
  let fields: Entry[] = [];
  let active = 'All';
  let page = 0;
  let pages = 1;
  const pageSize = 25;
  const pagers = document.querySelectorAll<HTMLElement>(
    '[data-metadata-pages]',
  );
  const groupNames: Record<string, string> = {
    All: c.allGroups,
    Technical: c.technical,
    FILE: c.fileProperties,
    PDF: c.documentProperties,
    Media: c.mediaProperties,
    ZIP: c.archiveProperties,
    THUMBNAIL: c.thumbnailProperties,
    C2PA: lang === 'vi' ? 'Nguồn gốc C2PA' : 'C2PA origin',
    JUMBF: lang === 'vi' ? 'Cấu trúc JUMBF' : 'JUMBF structure',
    EXIF: lang === 'vi' ? 'Thẻ EXIF' : 'EXIF tags',
    XMP: lang === 'vi' ? 'Thẻ XMP' : 'XMP tags',
    IPTC: lang === 'vi' ? 'Thẻ IPTC' : 'IPTC tags',
    ICC: lang === 'vi' ? 'Hồ sơ màu ICC' : 'ICC color profile',
    PNG: lang === 'vi' ? 'Cấu trúc PNG' : 'PNG structure',
    JFIF: lang === 'vi' ? 'Thông tin JFIF' : 'JFIF information',
    RIFF: lang === 'vi' ? 'Cấu trúc RIFF' : 'RIFF structure',
  };
  const order = [
    'C2PA',
    'XMP',
    'EXIF',
    'IPTC',
    'ICC',
    'PDF',
    'Media',
    'PNG',
    'RIFF',
    'JFIF',
    'FILE',
    'ZIP',
    'Technical',
    'JUMBF',
  ];
  const labels: Record<string, [string, string]> = {
    'Image Width': ['Chiều rộng ảnh', 'Image width'],
    ImageWidth: ['Chiều rộng ảnh', 'Image width'],
    'Image Height': ['Chiều cao ảnh', 'Image height'],
    ImageHeight: ['Chiều cao ảnh', 'Image height'],
    'Bit Depth': ['Độ sâu bit', 'Bit depth'],
    'Color Type': ['Kiểu màu', 'Color type'],
    'Bits Per Sample': ['Số bit mỗi mẫu', 'Bits per sample'],
    'Color Components': ['Thành phần màu', 'Color components'],
    FileType: ['Định dạng ảnh', 'Image format'],
    Orientation: ['Hướng hiển thị', 'Orientation'],
    DigitalSourceType: ['Loại nguồn được khai báo', 'Declared source type'],
    digitalSourceType: ['Loại nguồn được khai báo', 'Declared source type'],
    ContainsAiGeneratedContent: [
      'Khai báo nội dung được tạo bằng AI',
      'AI content declaration',
    ],
    Ads: [
      'Thông tin tài liệu và tài khoản được nhúng',
      'Embedded document and account data',
    ],
    title: ['Tiêu đề', 'Title'],
    'dc:title': ['Tiêu đề', 'Title'],
    action: ['Thao tác được ghi nhận', 'Recorded action'],
    when: ['Thời điểm được ghi nhận', 'Recorded time'],
    name: ['Tên được ghi nhận', 'Recorded name'],
    version: ['Phiên bản được ghi nhận', 'Recorded version'],
    description: ['Mô tả được ghi nhận', 'Recorded description'],
    instanceID: ['Định danh phiên bản ảnh', 'Image instance identifier'],
    FileSize: ['Dung lượng theo byte', 'Size in bytes'],
    ImageSize: ['Kích thước ảnh', 'Image dimensions'],
    Megapixels: ['Số triệu pixel', 'Megapixels'],
    HeaderHex: ['64 byte đầu ở dạng hex', 'First 64 bytes in hex'],
    HeaderText: ['64 byte đầu ở dạng văn bản', 'First 64 bytes as text'],
    Salt: ['Giá trị salt được nhúng', 'Embedded salt'],
    Algorithm: [
      'Thuật toán chữ ký được khai báo',
      'Declared signature algorithm',
    ],
    SerialNumber: ['Số sê-ri', 'Serial number'],
    CommonName: ['Tên chứng thư', 'Certificate name'],
    Organization: ['Tổ chức', 'Organization'],
    Country: ['Quốc gia', 'Country'],
    NotBefore: ['Bắt đầu hiệu lực được ghi nhận', 'Recorded validity start'],
    NotAfter: ['Kết thúc hiệu lực được ghi nhận', 'Recorded validity end'],
  };
  const groupLabel = (name: string) =>
    groupNames[name] ?? (lang === 'vi' ? 'Nhóm ' : 'Group ') + name;
  function draw(): void {
    if (!container || !groups || !count || !empty || !search) return;
    const needle = search.value.trim().toLocaleLowerCase(lang);
    const matches = fields.filter(
      (field) =>
        (active === 'All' || groupOf(field) === active) &&
        (field.key + ' ' + field.value + ' ' + (field.raw ?? ''))
          .toLocaleLowerCase(lang)
          .includes(needle),
    );
    const available = [...new Set(fields.map(groupOf))].sort((a, b) => {
      const rank = (name: string) =>
        order.indexOf(name) < 0 ? order.length : order.indexOf(name);
      return rank(a) - rank(b);
    });
    groups.replaceChildren();
    for (const name of ['All', ...available]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'group-button';
      button.setAttribute('aria-pressed', String(active === name));
      button.textContent =
        groupLabel(name) +
        ' ' +
        String(
          name === 'All'
            ? fields.length
            : fields.filter((field) => groupOf(field) === name).length,
        );
      button.addEventListener('click', () => {
        active = name;
        page = 0;
        draw();
        // Rebuilding filters must not lose keyboard focus.
        for (const candidate of groups.querySelectorAll<HTMLButtonElement>(
          'button',
        ))
          if (candidate.getAttribute('aria-pressed') === 'true')
            candidate.focus({ preventScroll: true });
      });
      groups.append(button);
    }
    count.textContent =
      lang === 'vi'
        ? `${String(matches.length)} trường phù hợp trong ${String(fields.length)} trường`
        : `${String(matches.length)} matching fields of ${String(fields.length)} total`;
    pages = Math.max(1, Math.ceil(matches.length / pageSize));
    page = Math.min(page, pages - 1);
    const ordered = available.flatMap((name) =>
      matches.filter((field) => groupOf(field) === name),
    );
    const visible = ordered.slice(page * pageSize, (page + 1) * pageSize);
    for (const pager of pagers) {
      pager.hidden = pages === 1;
      const range = pager.querySelector('[data-page-range]');
      const number = pager.querySelector('[data-page-number]');
      if (range)
        range.textContent =
          lang === 'vi'
            ? `Trường ${String(page * pageSize + 1)} đến ${String(page * pageSize + visible.length)} trong ${String(matches.length)} trường phù hợp`
            : `Fields ${String(page * pageSize + 1)} to ${String(page * pageSize + visible.length)} of ${String(matches.length)} matches`;
      if (number)
        number.textContent =
          lang === 'vi'
            ? `Trang ${String(page + 1)} trong ${String(pages)}`
            : `Page ${String(page + 1)} of ${String(pages)}`;
      for (const button of pager.querySelectorAll<HTMLButtonElement>(
        '[data-page-action]',
      )) {
        const action = button.dataset['pageAction'];
        button.disabled =
          action === 'first' || action === 'previous'
            ? page === 0
            : page === pages - 1;
      }
    }
    container.replaceChildren();
    empty.hidden = matches.length > 0;
    for (const name of available) {
      const rows = visible.filter((field) => groupOf(field) === name);
      if (!rows.length) continue;
      const section = document.createElement('section');
      section.className = 'metadata-group';
      const heading = document.createElement('h3');
      heading.textContent = groupLabel(name);
      section.append(heading);
      const dl = document.createElement('dl');
      dl.className = 'metadata-table';
      for (const field of rows) {
        const row = document.createElement('div');
        row.className = 'metadata-row';
        const dt = document.createElement('dt'),
          dd = document.createElement('dd');
        const short = shortKey(field.key),
          last = short.split('.').at(-1) ?? short;
        const pair = labels[last];
        const title = document.createElement('span');
        title.className = 'tag-label';
        title.textContent =
          pair?.[lang === 'vi' ? 0 : 1] ??
          last.replace(/([a-z])([A-Z])/g, '$1 $2');
        if (!pair) title.dataset['userContent'] = '';
        const key = document.createElement('code');
        key.className = 'tag-key';
        key.dataset['userContent'] = '';
        key.textContent = short;
        dt.append(title, key);
        const value = document.createElement('p');
        value.className = 'tag-value';
        value.dataset['userContent'] = '';
        value.textContent =
          field.binaryBytes !== undefined
            ? `${c.binaryData} - ${new Intl.NumberFormat(lang).format(field.binaryBytes)} bytes`
            : field.value.length > 320
              ? field.value.slice(0, 320) + '…'
              : field.value;
        dd.append(value);
        const details = document.createElement('details');
        details.className = 'tag-details';
        const summary = document.createElement('summary');
        summary.textContent = c.tagDetails;
        const fullKey = document.createElement('code');
        fullKey.dataset['userContent'] = '';
        fullKey.textContent = field.key;
        const fullValue = document.createElement('pre');
        fullValue.dataset['userContent'] = '';
        fullValue.textContent = field.value;
        details.append(summary, fullKey, fullValue);
        if (field.tagId !== undefined) {
          const id = document.createElement('code');
          id.dataset['userContent'] = '';
          id.textContent = 'Tag ID ' + String(field.tagId);
          details.append(id);
        }
        if (field.raw !== undefined) {
          const label = document.createElement('p');
          label.textContent = c.raw;
          const raw = document.createElement('pre');
          raw.dataset['userContent'] = '';
          raw.textContent = field.raw;
          details.append(label, raw);
        }
        if (field.truncated) {
          const note = document.createElement('p');
          note.textContent = c.truncated;
          details.append(note);
        }
        if (field.source === 'derived') {
          const note = document.createElement('p');
          note.className = 'supporting';
          note.textContent = c.computed;
          details.append(note);
        }
        dd.append(details);
        row.append(dt, dd);
        dl.append(row);
      }
      section.append(dl);
      container.append(section);
    }
  }
  search.addEventListener('input', () => {
    page = 0;
    draw();
  });
  for (const pager of pagers)
    for (const button of pager.querySelectorAll<HTMLButtonElement>(
      '[data-page-action]',
    ))
      button.addEventListener('click', () => {
        const action = button.dataset['pageAction'];
        page =
          action === 'first'
            ? 0
            : action === 'previous'
              ? Math.max(0, page - 1)
              : action === 'last'
                ? pages - 1
                : Math.min(pages - 1, page + 1);
        draw();
        // Page changes return to the persistent upper controls, including by keyboard.
        const target = pagers[0]?.querySelector<HTMLButtonElement>(
          `[data-page-action="${button.disabled ? (page === 0 ? 'next' : 'previous') : (action ?? 'next')}"]`,
        );
        target?.focus({ preventScroll: true });
        pagers[0]?.scrollIntoView({ block: 'start' });
      });
  return {
    render(value) {
      fields = value;
      page = 0;
      if (
        active !== 'All' &&
        !fields.some((field) => groupOf(field) === active)
      )
        active = 'All';
      draw();
    },
    reset() {
      fields = [];
      active = 'All';
      page = 0;
      pages = 1;
      search.value = '';
      container.replaceChildren();
      groups.replaceChildren();
      count.textContent = '';
      empty.hidden = true;
      for (const pager of pagers) pager.hidden = true;
    },
  };
}
