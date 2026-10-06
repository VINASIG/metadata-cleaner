import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { startServer } from '../../scripts/serve.ts';
import { mode } from '../../src/lib/site.ts';
import {
  presentationPng,
  finalField,
  longField,
} from '../presentation-fixtures.ts';
import { capture } from './evidence.ts';
import {
  inspectInterface,
  inspectControlSurfaces,
  inspectControlIndicators,
  inspectHeaderBrand,
} from '../../.vinasig/standards/templates/web/interface.mjs';
import { inspectSiteChrome } from '../../.vinasig/standards/templates/web/site-chrome.mjs';

let app: Awaited<ReturnType<typeof startServer>>;
const appMode: string = mode;
test.beforeAll(async () => {
  app = await startServer(path.resolve('dist'));
});
test.afterAll(async () => {
  await app.close();
});

async function load(page: Page, rich: boolean): Promise<void> {
  await page.locator('#file').setInputFiles({
    name: 'Synthetic café 東京 ' + 'long-name-'.repeat(12) + '.png',
    mimeType: 'image/png',
    buffer: Buffer.from(presentationPng(rich)),
  });
  await expect(page.locator('#field-count')).toContainText(/\d/);
}

async function guards(page: Page): Promise<void> {
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
}

for (const lang of ['vi', 'en'] as const) {
  test(`metadata family navigation and complete paginated report ${lang}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(app.url + (lang === 'en' ? 'en/' : ''));
    const family = page.locator('.metadata-tools');
    await expect(family.locator('li')).toHaveCount(3);
    await expect(family.locator('[aria-current=page]')).toHaveCount(1);
    await expect(family.locator('a')).toHaveCount(2);
    const destinations = await family
      .locator('a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    expect(
      destinations.every((url) =>
        url?.endsWith(lang === 'en' ? '/en/' : '.io.vn/'),
      ),
    ).toBe(true);
    await family.scrollIntoViewIfNeeded();
    await guards(page);
    await capture(page, info, `family-${lang}`);
    await load(page, true);
    const top = page.locator('[data-metadata-pages]').first();
    await expect(top).toBeVisible();
    const seen: string[] = [];
    do {
      const keys = await page.locator('.tag-key').allTextContents();
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.length).toBeLessThanOrEqual(25);
      seen.push(...keys);
      const next = top.locator('[data-page-action=next]');
      if (!(await next.isEnabled())) break;
      await next.click();
    } while (seen.length < 5000);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.filter((key) => key.includes('Field'))).toHaveLength(512);
    await expect(top.locator('[data-page-action=last]')).toBeDisabled();
    await top.locator('[data-page-action=first]').click();
    await expect(top.locator('[data-page-action=first]')).toBeDisabled();
    await top.locator('[data-page-action=next]').press('Enter');
    await expect(top.locator('[data-page-number]')).toContainText(/2/);
    await top.locator('[data-page-action=last]').click();
    await expect(top.locator('[data-page-action=next]')).toBeDisabled();
    await page.locator('#search').fill(finalField);
    await expect(page.locator('.metadata-row')).toHaveCount(1);
    await expect(page.locator('#metadata-fields')).toContainText(finalField);
    await expect(top).toBeHidden();
    const pending = page.waitForEvent('download');
    await page.locator('#report').click();
    const report = await pending;
    const reportPath = await report.path();
    if (!reportPath) throw new Error('Missing full report');
    const reportText = await readFile(reportPath, 'utf8');
    expect(reportText).toContain(finalField);
    expect(reportText).toContain('Field0000');
    expect(reportText).toContain('Field0511');
    await page.locator('#search').fill('absent-field-result');
    await expect(page.locator('#no-results')).toBeVisible();
    await expect(page.locator('.metadata-row')).toHaveCount(0);
    await page.locator('#search').fill('');
    await page
      .locator('#metadata-groups button')
      .filter({ hasText: /XMP/ })
      .click();
    await expect(top.locator('[data-page-number]')).toContainText(/1/);
    await expect(page.locator('.metadata-group')).toHaveCount(1);
    await page.locator('#clear').click();
    await expect(top).toBeHidden();
    await load(page, false);
    expect(await page.locator('.metadata-row').count()).toBeGreaterThan(0);
    expect(await page.locator('.metadata-row').count()).toBeLessThan(25);
    await expect(top).toBeHidden();
    if (appMode === 'editor') {
      const bounds = await page.evaluate(() => {
        const edit = document
          .querySelector('.edit-panel')
          ?.getBoundingClientRect();
        const inspect = document
          .querySelector('.inspect-panel')
          ?.getBoundingClientRect();
        return edit && inspect
          ? { editBottom: edit.bottom, inspectTop: inspect.top }
          : null;
      });
      expect(bounds?.inspectTop).toBeGreaterThan(bounds?.editBottom ?? 0);
    }
    await page.locator('#metadata-fields').scrollIntoViewIfNeeded();
    await capture(page, info, `sparse-${lang}`);
    for (const destination of destinations) {
      if (!destination) throw new Error('Missing companion destination');
      await page.route(destination, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<h1>Companion metadata tool</h1>',
        }),
      );
      await page.goto(app.url + (lang === 'en' ? 'en/' : ''));
      await page.locator(`.metadata-tool-card[href="${destination}"]`).click();
      await expect(page).toHaveURL(destination);
      await expect(page.locator('h1')).toHaveText('Companion metadata tool');
    }
    expect(errors).toEqual([]);
  });

  test(`responsive rich and sparse metadata, long values and related tools ${lang}`, async ({
    page,
  }, info) => {
    await page.goto(app.url + (lang === 'en' ? 'en/' : ''));
    for (const rich of [true, false]) {
      await load(page, rich);
      if (rich) {
        await page
          .locator('.metadata-row')
          .filter({ hasText: longField })
          .locator('summary')
          .click();
      }
      for (const dark of [false, true]) {
        if (
          (await page.locator('html').getAttribute('data-theme')) !==
          (dark ? 'dark' : 'light')
        )
          await page.locator('[data-theme-toggle]').click();
        for (const width of [
          320, 360, 390, 759, 760, 761, 768, 919, 920, 921, 991, 992, 993, 1024,
          1280, 1440,
        ]) {
          await page.setViewportSize({ width, height: 900 });
          await guards(page);
          await page.locator('#metadata-fields').scrollIntoViewIfNeeded();
          if ([320, 768, 1440].includes(width))
            await capture(
              page,
              info,
              `fields-${lang}-${rich ? 'rich' : 'sparse'}-${dark ? 'dark' : 'light'}-${String(width)}`,
            );
          await page.locator('.metadata-tools').scrollIntoViewIfNeeded();
          if ([320, 768, 1440].includes(width))
            await capture(
              page,
              info,
              `tools-${lang}-${rich ? 'rich' : 'sparse'}-${dark ? 'dark' : 'light'}-${String(width)}`,
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
      await page.locator('.metadata-tools').scrollIntoViewIfNeeded();
      await capture(
        page,
        info,
        `tools-${lang}-${rich ? 'rich' : 'sparse'}-200`,
      );
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
      await page.emulateMedia({ forcedColors: 'active' });
      await guards(page);
      await capture(
        page,
        info,
        `tools-${lang}-${rich ? 'rich' : 'sparse'}-forced`,
      );
      await page.emulateMedia({ forcedColors: 'none' });
    }
  });
}
