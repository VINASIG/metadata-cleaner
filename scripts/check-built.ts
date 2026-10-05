import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { FileSystemConfigLoader, HtmlValidate } from 'html-validate';
import { origin } from '../src/lib/site.ts';
import {
  digest,
  parseJson,
  record,
  text,
  readLocal,
  repositoryRoot,
  writeOutput,
} from './local.ts';
for (const [route, lang] of [
  ['', 'vi'],
  ['en/', 'en'],
] as const) {
  const html = await readFile('dist/' + route + 'index.html', 'utf8');
  const validation = await new HtmlValidate(
    new FileSystemConfigLoader(),
  ).validateString(html, 'dist/' + route + 'index.html');
  assert(
    validation.valid,
    JSON.stringify(
      validation.results.flatMap((r) => r.messages),
      null,
      2,
    ),
  );
  assert(
    html.includes(`<html lang="${lang}">`) &&
      html.includes(`href="${origin + route}"`),
  );
  assert(
    html.includes('WebApplication') && html.includes('UtilitiesApplication'),
  );
  assert(
    html.includes("connect-src 'none'") && html.includes("form-action 'none'"),
  );
  for (const match of html.matchAll(
    /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g,
  ))
    assert(
      html.includes(
        createHash('sha256')
          .update(match[1] ?? '')
          .digest('base64'),
      ),
    );
  assert((await readFile('dist/sitemap.xml', 'utf8')).includes(origin + route));
}
const manifest = record(
  parseJson(await readLocal(repositoryRoot, 'docs/asset-manifest.json')),
);
const assets = Object.entries(record(manifest['files']));
assert.equal(assets.length, 9);
for (const [file, expected] of assets) {
  const bytes = await readLocal(repositoryRoot, file);
  assert.equal(digest(bytes), text(expected));
  assert.deepEqual(
    await readLocal(repositoryRoot, 'dist/' + file.slice(7)),
    bytes,
  );
}
assert.deepEqual(
  await readFile('public/licenses/lucide.txt'),
  await readFile('node_modules/@lucide/astro/LICENSE'),
);
assert.equal(
  digest(await readFile('src/styles/site-chrome.css')),
  (await readFile('tests/site-chrome.sha256', 'utf8')).trim(),
  'Reviewed shared chrome CSS drifted',
);
await writeOutput(
  repositoryRoot,
  'output/checks/built.json',
  JSON.stringify(
    {
      status: 'PASS',
      routes: 2,
      preservedAssets: assets.length,
      csp: 'No file uploads, connections or form submissions',
    },
    null,
    2,
  ),
);
console.log('Built HTML, metadata, CSP and asset integrity passed.');
