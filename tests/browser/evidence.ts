import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

export async function capture(
  page: Page,
  info: TestInfo,
  name: string,
  fullPage = false,
): Promise<void> {
  const directory = path.join('output/responsive', info.project.name);
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: path.join(directory, name + '.png'),
    fullPage,
  });
}
