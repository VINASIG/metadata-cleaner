import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { startServer } from '../../scripts/serve.ts';
import {
  inspectInterface,
  inspectControlSurfaces,
  inspectControlIndicators,
  inspectHeaderBrand,
} from '../../.vinasig/standards/templates/web/interface.mjs';
import { inspectSiteChrome } from '../../.vinasig/standards/templates/web/site-chrome.mjs';
import { inspect, clean } from '../../src/lib/container.ts';
import { join, view } from '../../src/lib/binary.ts';
import { jpegSegment } from '../../src/lib/exif.ts';
import {
  pngFixture,
  gifFixture,
  exifFixture,
  privateText,
} from '../fixtures.ts';
import { capture } from './evidence.ts';

let app: Awaited<ReturnType<typeof startServer>>;
test.beforeAll(async () => {
  app = await startServer(path.resolve('dist'));
  await mkdir('output/responsive', { recursive: true });
});
test.afterAll(async () => {
  await app.close();
});
async function guards(page: Page): Promise<void> {
  expect(await page.evaluate(inspectInterface)).toEqual([]);
  expect(await page.evaluate(inspectControlSurfaces)).toEqual([]);
  expect(await page.evaluate(inspectControlIndicators)).toEqual([]);
  expect(await page.evaluate(inspectHeaderBrand)).toEqual([]);
  expect(await page.evaluate(inspectSiteChrome)).toEqual([]);
  expect(await page.locator('header[data-site-header]').count()).toBe(1);
  expect(await page.locator('footer[data-site-footer]').count()).toBe(1);
  expect(await page.locator('input[type=file]').count()).toBe(1);
  expect(await page.locator('summary').count()).toBeGreaterThan(0);
}
test('real PNG metadata removal, byte savings, choices, hashes and download', async ({
  page,
}, info) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  const requests: string[] = [];
  page.on('request', (r) => {
    if (
      !r.url().startsWith(app.url) &&
      !r.url().startsWith('blob:') &&
      !r.url().startsWith('data:')
    )
      requests.push(r.url());
  });
  await page.goto(app.url);
  await expect(page.locator('#file')).toBeEnabled();
  const input = pngFixture();
  await page.locator('#file').setInputFiles({
    name: 'private-location.png',
    mimeType: 'image/png',
    buffer: Buffer.from(input),
  });
  await expect(page.locator('#process')).toBeEnabled();
  await expect(page.locator('#choices input')).toHaveCount(3);
  await expect(page.locator('#metadata-fields')).toContainText(privateText);
  for (const checkbox of await page.locator('#choices input').all())
    await expect(checkbox).toBeChecked();
  await guards(page);
  await page.locator('#process').click();
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#metadata-fields')).not.toContainText(privateText);
  await expect(page.locator('#filename')).toHaveValue('image.png');
  const hashes = await page.locator('#hashes dd').allTextContents();
  expect(hashes).toHaveLength(2);
  expect(hashes[0]).toBe(hashes[1]);
  const reportPending = page.waitForEvent('download');
  await page.locator('#report').click();
  const report = await reportPending;
  const reportPath = await report.path();
  if (!reportPath) throw new Error('Missing JSON report');
  const reportText = await readFile(reportPath, 'utf8');
  expect(reportText).not.toContain(privateText);
  expect(reportText).toContain('"removed"');
  expect(reportText).toContain('"beforeHash"');
  expect(reportText).toContain('"afterHash"');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('image.png');
  const downloaded = await download.path();
  expect(downloaded).not.toBeNull();
  if (!downloaded) throw new Error('Missing download');
  expect(new Uint8Array(await readFile(downloaded))).toEqual(
    clean(input).bytes,
  );
  await page.locator('#filename').fill('../private.png');
  await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#filename').fill('ready.png');
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('#none').click();
  await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#process').click();
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#metadata-fields')).toContainText(privateText);
  await page.locator('#all').click();
  await page.locator('#process').click();
  await expect(page.locator('#download')).toBeEnabled();
  await capture(page, info, 'cleaner-result', true);
  await page.locator('#clear').click();
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#file')).toHaveValue('');
  expect(failures).toEqual([]);
  expect(requests).toEqual([]);
});
test('actual JPEG and WebP decode pixels remain identical after metadata surgery', async ({
  page,
}) => {
  for (const mime of ['image/jpeg', 'image/webp'] as const) {
    await page.goto(app.url);
    const encoded = await page.evaluate((type) => {
      const canvas = document.createElement('canvas');
      canvas.width = 12;
      canvas.height = 8;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.fillStyle = '#72add7';
      ctx.fillRect(0, 0, 12, 8);
      ctx.fillStyle = '#f28b55';
      ctx.fillRect(2, 2, 5, 3);
      return canvas.toDataURL(type, 0.9).split(',')[1];
    }, mime);
    expect(encoded).toBeTruthy();
    const original = new Uint8Array(Buffer.from(encoded ?? '', 'base64'));
    expect(inspect(original).format).toBe(
      mime === 'image/jpeg' ? 'JPEG' : 'WebP',
    );
    const tagged =
      mime === 'image/jpeg'
        ? join([
            original.subarray(0, 2),
            jpegSegment(0xfe, new TextEncoder().encode(privateText)),
            jpegSegment(
              0xe1,
              join([new TextEncoder().encode('Exif\0\0'), exifFixture()]),
            ),
            original.subarray(2),
          ])
        : taggedWebp(original);
    const processed = clean(tagged);
    expect(processed.saved).toBeGreaterThan(0);
    expect(inspect(processed.bytes).compressed).toEqual(
      inspect(tagged).compressed,
    );
    const pixels = await page.evaluate(
      async ({ before, after, type }) => {
        async function decode(data: number[]): Promise<number[]> {
          const bitmap = await createImageBitmap(
            new Blob([new Uint8Array(data)], { type }),
          );
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas unavailable');
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          return Array.from(
            ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          );
        }
        return { before: await decode(before), after: await decode(after) };
      },
      {
        before: Array.from(tagged),
        after: Array.from(processed.bytes),
        type: mime,
      },
    );
    expect(pixels.after).toEqual(pixels.before);
    await page.locator('#file').setInputFiles({
      name: 'image.' + (mime === 'image/jpeg' ? 'jpg' : 'webp'),
      mimeType: mime,
      buffer: Buffer.from(tagged),
    });
    await expect(page.locator('#process')).toBeEnabled();
    await page.locator('#process').click();
    await expect(page.locator('#download')).toBeEnabled();
  }
});
function taggedWebp(original: Uint8Array): Uint8Array<ArrayBuffer> {
  const exif = exifFixture();
  const exifChunk = new Uint8Array(8 + exif.length + (exif.length % 2));
  exifChunk.set(new TextEncoder().encode('EXIF'));
  view(exifChunk).setUint32(4, exif.length, true);
  exifChunk.set(exif, 8);
  const existing = inspect(original).blocks.find((b) => b.name === 'VP8X');
  const base = original.slice();
  let bytes: Uint8Array<ArrayBuffer>;
  if (existing) {
    base[existing.offset + 8] = (base[existing.offset + 8] ?? 0) | 8;
    bytes = join([base, exifChunk]);
  } else {
    const header = new Uint8Array(18);
    header.set(new TextEncoder().encode('VP8X'));
    view(header).setUint32(4, 10, true);
    header[8] = 8;
    header[12] = 11;
    header[15] = 7;
    bytes = join([base.subarray(0, 12), header, base.subarray(12), exifChunk]);
  }
  view(bytes).setUint32(4, bytes.length - 8, true);
  return join([bytes, new TextEncoder().encode(privateText)]);
}
test('PNG and GIF decode pixels remain identical after metadata removal', async ({
  page,
}) => {
  await page.goto(app.url);
  for (const input of [pngFixture(), gifFixture()]) {
    const output = clean(input);
    const pixels = await page.evaluate(
      async ({ before, after }) => {
        async function decode(bytes: number[]) {
          const bitmap = await createImageBitmap(
            new Blob([new Uint8Array(bytes)]),
          );
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas unavailable');
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          return Array.from(
            context.getImageData(0, 0, canvas.width, canvas.height).data,
          );
        }
        return { before: await decode(before), after: await decode(after) };
      },
      { before: Array.from(input), after: Array.from(output.bytes) },
    );
    expect(pixels.after).toEqual(pixels.before);
  }
});
test('malformed files, stale work and resetting never offer a stale download', async ({
  page,
}) => {
  await page.goto(app.url);
  await page.locator('#file').setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#file').setInputFiles({
    name: 'ok.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngFixture()),
  });
  await page.locator('#clear').click();
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#file').setInputFiles({
    name: 'ok.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngFixture()),
  });
  await expect(page.locator('#process')).toBeEnabled();
  await page.locator('#process').click();
  await page.locator('#clear').click();
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('#result')).toBeHidden();
});
for (const lang of ['vi', 'en'] as const) {
  test(`responsive chrome, copy, controls and accessibility ${lang}`, async ({
    page,
  }, info) => {
    await page.goto(app.url + (lang === 'en' ? 'en/' : ''));
    for (const dark of [false, true]) {
      if (dark) await page.locator('[data-theme-toggle]').click();
      for (const [width, height] of [
        [320, 800],
        [360, 800],
        [390, 844],
        [759, 1024],
        [760, 1024],
        [761, 1024],
        [768, 1024],
        [1024, 768],
        [1280, 900],
        [1440, 900],
      ]) {
        await page.setViewportSize({
          width: width ?? 320,
          height: height ?? 800,
        });
        await guards(page);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.locator('footer').scrollIntoViewIfNeeded();
        await capture(
          page,
          info,
          `${lang}-${dark ? 'dark' : 'light'}-${String(width)}-footer`,
        );
        await page.locator('h1').scrollIntoViewIfNeeded();
        await capture(
          page,
          info,
          `${lang}-${dark ? 'dark' : 'light'}-${String(width)}`,
        );
      }
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axe.violations).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await guards(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await capture(page, info, `${lang}-text-200`, true);
  });
  test(`initial HTML remains meaningful without JavaScript ${lang}`, async ({
    browser,
  }, info) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 320, height: 800 },
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await page.goto(app.url + (lang === 'en' ? 'en/' : ''));
    await expect(page.locator('#file')).toBeDisabled();
    await guards(page);
    expect(
      await page
        .locator('[data-brand-logo] img')
        .evaluate(
          (img) =>
            img instanceof HTMLImageElement &&
            img.currentSrc.endsWith('reversed.svg'),
        ),
    ).toBe(true);
    await capture(page, info, `${lang}-no-script`, true);
    await context.close();
  });
}
test('keyboard choices and forced colors preserve native semantics', async ({
  page,
}, info) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(app.url);
  await page.locator('#file').setInputFiles({
    name: 'safe.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngFixture()),
  });
  await expect(page.locator('#process')).toBeEnabled();
  const first = page.locator('#choices input').first();
  await first.focus();
  await first.press('Space');
  await expect(first).not.toBeChecked();
  await first.press('Space');
  await expect(first).toBeChecked();
  await page.locator('#metadata-details summary').focus();
  await page.locator('#metadata-details summary').press('Enter');
  await expect(page.locator('#metadata-details')).not.toHaveAttribute(
    'open',
    '',
  );
  await capture(page, info, 'forced-colors', true);
});
