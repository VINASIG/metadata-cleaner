import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { startServer } from '../../scripts/serve.ts';
import { mode } from '../../src/lib/site.ts';
import { provenancePng } from '../provenance-fixtures.ts';
import {
  inspectInterface,
  inspectControlSurfaces,
  inspectControlIndicators,
  inspectHeaderBrand,
} from '../../.vinasig/standards/templates/web/interface.mjs';
import { inspectSiteChrome } from '../../.vinasig/standards/templates/web/site-chrome.mjs';
import { capture } from './evidence.ts';
let app: Awaited<ReturnType<typeof startServer>>;
test.beforeAll(async () => {
  app = await startServer(path.resolve('dist'));
});
test.afterAll(async () => {
  await app.close();
});
for (const lang of ['vi', 'en'] as const)
  test(`populated provenance report, groups, raw values, history and reflow ${lang}`, async ({
    page,
  }, info) => {
    const requests: string[] = [],
      errors: string[] = [];
    page.on('request', (request) => {
      if (
        (!request.url().startsWith(app.url) &&
          !/^(blob:|data:)/.test(request.url())) ||
        request.method() !== 'GET'
      )
        requests.push(request.method() + ' ' + request.url());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(app.url + (lang === 'en' ? 'en/' : ''));
    await page.locator('#file').setInputFiles({
      name: 'Synthetic provenance image.png',
      mimeType: 'image/png',
      buffer: Buffer.from(provenancePng(true)),
    });
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#empty-result')).toBeHidden();
    await expect(page.locator('#origin-facts')).toContainText(
      'Fixture Creator',
    );
    await expect(page.locator('#credentials-note')).toContainText(
      lang === 'vi' ? 'chưa xác minh' : 'not verified',
    );
    await expect(page.locator('#protected')).not.toHaveAttribute('open', '');
    await page
      .locator('#metadata-groups button')
      .filter({ hasText: /C2PA.*\d/ })
      .click();
    await expect(page.locator('.metadata-group')).toHaveCount(1);
    await expect(page.locator('#metadata-fields')).toContainText(
      'Fixture Creator',
    );
    await page.locator('#search').fill('fixture-image-1');
    await expect(page.locator('.metadata-row')).toHaveCount(1);
    await page.locator('#search').fill('no-such-field');
    await expect(page.locator('.metadata-row')).toHaveCount(0);
    await expect(page.locator('#no-results')).toBeVisible();
    await page.locator('#search').fill('');
    await page
      .locator('#metadata-groups button')
      .filter({ hasText: /^(Tất cả|All) / })
      .click();
    await page.locator('#search').fill('ProtectedHeader.Algorithm');
    await expect(page.locator('.metadata-row')).toHaveCount(4);
    const detail = page.locator('.tag-details').first();
    await detail.locator('summary').click();
    await expect(detail).toContainText('-7');
    await page.locator('#search').fill('');
    await page.locator('#history summary').click();
    await expect(page.locator('#recorded-actions li')).toHaveCount(4);
    await expect(page.locator('#metadata-fields img')).toHaveCount(0);
    const pending = page.waitForEvent('download');
    await page.locator('#report').click();
    const reportPath = await (await pending).path();
    if (!reportPath) throw new Error('Missing metadata report');
    const reportText = await readFile(reportPath, 'utf8');
    expect(reportText).toContain('Fixture Creator');
    expect(reportText).toContain('fixture-image-1');
    expect(reportText).not.toContain('pngFile.');
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
        expect(await page.evaluate(inspectInterface)).toEqual([]);
        expect(await page.evaluate(inspectControlSurfaces)).toEqual([]);
        expect(await page.evaluate(inspectControlIndicators)).toEqual([]);
        expect(await page.evaluate(inspectHeaderBrand)).toEqual([]);
        expect(await page.evaluate(inspectSiteChrome)).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page
          .locator('#metadata-details > summary')
          .scrollIntoViewIfNeeded();
        await capture(
          page,
          info,
          `populated-${lang}-${dark ? 'dark' : 'light'}-${String(width)}`,
        );
        await page.locator('footer').scrollIntoViewIfNeeded();
        await capture(
          page,
          info,
          `populated-${lang}-${dark ? 'dark' : 'light'}-${String(width)}-footer`,
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
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await page.evaluate(inspectInterface)).toEqual([]);
    await page.locator('#metadata-details > summary').scrollIntoViewIfNeeded();
    await capture(page, info, `populated-${lang}-text-200`);
    if (mode === 'cleaner') {
      await page.locator('#process').click();
      await expect(page.locator('#download')).toBeEnabled();
      await expect(page.locator('#metadata-fields')).not.toContainText(
        'Fixture Creator',
      );
      await page.locator('#view-original').click();
      await expect(page.locator('#metadata-fields')).toContainText(
        'Fixture Creator',
      );
      await page.locator('#view-processed').click();
      await expect(page.locator('#metadata-fields')).not.toContainText(
        'Fixture Creator',
      );
    }
    await page.locator('#clear').click();
    await expect(page.locator('#result')).toBeHidden();
    await expect(page.locator('#source-figure')).toBeHidden();
    await expect(page.locator('#file')).toHaveValue('');
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
  });
