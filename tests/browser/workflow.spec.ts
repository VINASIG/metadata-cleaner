import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { startServer } from '../../scripts/serve.ts';
import { pngFixture } from '../fixtures.ts';
import { presentationPng } from '../presentation-fixtures.ts';
import { clean } from '../../src/lib/container.ts';
import { copy } from '../../src/lib/copy.ts';
import {
  inspectInterface,
  inspectControlSurfaces,
} from '../../.vinasig/standards/templates/web/interface.mjs';
import { inspectUiContract } from '../../.vinasig/standards/templates/web/ui-contract.mjs';

let app: Awaited<ReturnType<typeof startServer>>;
test.beforeAll(async () => {
  app = await startServer(path.resolve('dist'));
  await mkdir('output/ux-2026-10-08/after', { recursive: true });
});
test.afterAll(async () => {
  await app.close();
});

async function load(page: Page, buffer = pngFixture()): Promise<void> {
  await page.locator('#file').setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: Buffer.from(buffer),
  });
  await expect(page.locator('#process')).toBeEnabled();
}

async function guards(page: Page): Promise<void> {
  expect(await page.evaluate(inspectInterface)).toEqual([]);
  expect(await page.evaluate(inspectControlSurfaces)).toEqual([]);
  expect(
    await page.evaluate(inspectUiContract, {
      icons: [
        { selector: '#process', count: 1, label: 'span' },
        { selector: '#clear', count: 1, label: 'span' },
        { selector: '#download', count: 1, label: 'span' },
      ],
      errors: ['#filename'],
    }),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

async function actionFlow(page: Page): Promise<void> {
  await expect(page.locator('#workflow-actions')).toHaveCSS(
    'position',
    'static',
  );
  const initial = await page.evaluate(() => {
    const actions = document.querySelector('#workflow-actions');
    const selection = document.querySelector('#selection');
    if (!actions || !selection) throw new Error('Missing workflow section');
    return {
      actionsTop: actions.getBoundingClientRect().top + scrollY,
      selectionBottom: selection.getBoundingClientRect().bottom + scrollY,
      selectionFirst: Boolean(
        selection.compareDocumentPosition(actions) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    };
  });
  expect(initial.selectionFirst).toBe(true);
  expect(
    Math.round((initial.actionsTop - initial.selectionBottom) * 100) / 100,
  ).toBeGreaterThanOrEqual(24);
  await page.evaluate((top) => {
    scrollTo(0, top + 128);
  }, initial.actionsTop);
  const scrolled = await page.evaluate(() => {
    const actions = document.querySelector('#workflow-actions');
    if (!actions) throw new Error('Missing workflow actions');
    const top = actions.getBoundingClientRect().top;
    return { documentTop: top + scrollY, viewportTop: top, scroll: scrollY };
  });
  expect(scrolled.scroll).toBeGreaterThan(0);
  expect(scrolled.documentTop).toBeCloseTo(initial.actionsTop, 0);
  expect(scrolled.viewportTop).toBeLessThan(0);
  await page.evaluate(() => {
    scrollTo(0, 0);
  });
}

async function resultSpacing(page: Page): Promise<void> {
  const gaps = await page.evaluate(() => {
    const download = document.querySelector('#download');
    const overview = document.querySelector('.processed-overview');
    const details = document.querySelector('#verification');
    if (!download || !overview || !details)
      throw new Error('Missing output controls');
    const divider = details.getBoundingClientRect().top;
    return {
      download: divider - download.getBoundingClientRect().bottom,
      overview: divider - overview.getBoundingClientRect().bottom,
    };
  });
  expect(Math.round(gaps.download * 100) / 100).toBeGreaterThanOrEqual(16);
  expect(Math.round(gaps.overview * 100) / 100).toBeGreaterThanOrEqual(16);
}

for (const lang of ['vi', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`cleaner workflow priority, feedback and focus ${lang} ${theme}`, async ({
      page,
    }, info) => {
      const c = copy[lang];
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto(app.url + (lang === 'en' ? 'en/' : ''));
      await expect(page.locator('#workflow-actions')).toBeHidden();
      await load(page);
      await expect(page.locator('#selection-count')).toContainText('3');
      await expect(page.locator('#all')).toBeDisabled();
      await expect(page.locator('#none')).toBeEnabled();
      await expect(page.locator('#process')).toHaveAccessibleName(c.remove);
      await expect(page.locator('#file-label')).toHaveText(c.replaceFile);
      await expect(page.locator('#workflow-file-name')).toHaveText(
        'sample.png',
      );
      const colors = await page.evaluate(() => {
        const color = (selector: string): string => {
          const node = document.querySelector(selector);
          if (!node) throw new Error('Missing color control');
          return getComputedStyle(node).color;
        };
        return {
          clear: color('#clear'),
          error: color('#name-error'),
          report: color('#report'),
        };
      });
      expect(colors.clear).toBe(colors.error);
      expect(colors.clear).not.toBe(colors.report);
      for (const [width, height] of [
        [320, 800],
        [360, 800],
        [390, 844],
        [759, 900],
        [760, 900],
        [761, 900],
        [768, 1024],
        [1024, 768],
        [1440, 900],
      ] as const) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => {
          scrollTo(0, 0);
        });
        await guards(page);
        await actionFlow(page);
        if ([320, 390, 1440].includes(width))
          await page.screenshot({
            path: `output/ux-2026-10-08/after/${info.project.name}-${lang}-${theme}-${String(width)}-ready.png`,
          });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#none').click();
      await expect(page.locator('#process')).toHaveAccessibleName(c.createCopy);
      await expect(page.locator('#selection-state')).toHaveText(
        c.nothingSelected,
      );
      await expect(page.locator('#none')).toBeDisabled();
      await expect(page.locator('#all')).toBeEnabled();
      await page.screenshot({
        path: `output/ux-2026-10-08/after/${info.project.name}-${lang}-${theme}-none.png`,
      });
      await page.locator('#all').click();
      await page.locator('#process').click();
      await expect(page.locator('#download')).toBeEnabled();
      await expect(page.locator('#clean-result-title')).toBeFocused();
      await expect(page.locator('#process')).toHaveAccessibleName(
        c.processAgain,
      );
      await expect(page.locator('#process')).not.toHaveClass(/primary/);
      await guards(page);
      await expect(page.locator('#image-preview')).toBeVisible();
      const resultBounds = await page
        .locator('#clean-result-title')
        .boundingBox();
      const toolbarBounds = await page
        .locator('#workflow-actions')
        .boundingBox();
      expect(resultBounds?.y).toBeGreaterThan(
        (toolbarBounds?.y ?? 0) + (toolbarBounds?.height ?? 0),
      );
      expect(resultBounds?.y).toBeGreaterThanOrEqual(0);
      for (const [width, height] of [
        [320, 800],
        [390, 844],
        [759, 900],
        [760, 900],
        [761, 900],
        [1440, 900],
      ] as const) {
        await page.setViewportSize({ width, height });
        await resultSpacing(page);
        await guards(page);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#clean-result-title').focus();
      await page.keyboard.press('Tab');
      await expect(page.locator('#filename')).toBeFocused();
      await page.locator('#filename').fill('../invalid.png');
      await expect(page.locator('#name-error')).toBeVisible();
      await expect(page.locator('#filename')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expect(page.locator('#download')).toBeDisabled();
      await guards(page);
      await page.screenshot({
        path: `output/ux-2026-10-08/after/${info.project.name}-${lang}-${theme}-name-error.png`,
      });
      await page.locator('#filename').fill('ready.png');
      await expect(page.locator('#name-error')).toBeHidden();
      const downloadPending = page.waitForEvent('download');
      await page.locator('#download').click();
      expect((await downloadPending).suggestedFilename()).toBe('ready.png');
      await page.screenshot({
        path: `output/ux-2026-10-08/after/${info.project.name}-${lang}-${theme}-result.png`,
      });
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axe.violations).toEqual([]);
      await page.locator('#choices input').first().uncheck();
      await expect(page.locator('#download')).toBeDisabled();
      await expect(page.locator('#clean-result')).toBeHidden();
      await expect(page.locator('#process')).toHaveAccessibleName(c.remove);
      await load(page, clean(pngFixture()).bytes);
      await expect(page.locator('#selection')).toBeHidden();
      await expect(page.locator('#process')).toHaveAccessibleName(c.createCopy);
      await expect(page.locator('#selection-state')).toHaveText(c.noBlocks);
      await page.screenshot({
        path: `output/ux-2026-10-08/after/${info.project.name}-${lang}-${theme}-no-blocks.png`,
      });
      await page.locator('#process').click();
      await expect(page.locator('#download')).toBeEnabled();
      await load(page, presentationPng(true));
      await page.locator('#metadata-fields').scrollIntoViewIfNeeded();
      await page.locator('#search').focus();
      await guards(page);
      await page.setViewportSize({ width: 390, height: 500 });
      await actionFlow(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      await actionFlow(page);
      await guards(page);
      await page.locator('#process').scrollIntoViewIfNeeded();
      const enlargedIcon = await page.locator('#process svg').boundingBox();
      expect(enlargedIcon?.width).toBeCloseTo(20, 0);
      expect(enlargedIcon?.height).toBeCloseTo(20, 0);
      await page.screenshot({
        path: `output/ux-2026-10-08/after/${info.project.name}-${lang}-${theme}-200.png`,
      });
      await page.locator('#process').click();
      await expect(page.locator('#download')).toBeEnabled();
      await expect(page.locator('#image-preview')).toBeVisible();
      await resultSpacing(page);
      await guards(page);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
      await page.emulateMedia({ forcedColors: 'active' });
      await guards(page);
      await page.screenshot({
        path: `output/ux-2026-10-08/after/${info.project.name}-${lang}-${theme}-forced.png`,
      });
      await page.locator('#clear').click();
      await expect(page.locator('#file')).toBeFocused();
      await expect(page.locator('#workflow-actions')).toBeHidden();
      await expect(page.locator('#process')).toBeDisabled();
      await expect(page.locator('#file-label')).toHaveText(c.choose);
      await page.locator('#file').setInputFiles({
        name: 'broken.png',
        mimeType: 'image/png',
        buffer: Buffer.from('invalid'),
      });
      await expect(page.locator('#status')).toHaveAttribute(
        'data-state',
        'error',
      );
      await expect(page.locator('#workflow-actions')).toBeHidden();
      await expect(page.locator('#download')).toBeDisabled();
      await expect(page.locator('#dimension-fact')).toBeHidden();
      await expect(page.locator('#file-dimensions')).toHaveText('');
      await page.screenshot({
        path: `output/ux-2026-10-08/after/${info.project.name}-${lang}-${theme}-invalid.png`,
      });
    });
  }
}
