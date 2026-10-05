# Toolchain selection

Official npm registry metadata was checked on 6 October 2026. Direct versions are exact and the resolved graph is locked. Astro 7.3.5 and @lucide/astro 1.52.0 match the current compatible sibling applications. ExifReader 4.46.0 supplies image metadata decoding under MPL-2.0. Node 24.21.0 and npm 12.2.0 are pinned. The existing portable local runtime is reused without global installation.

TypeScript 7.0.2 is latest but exceeds typescript-eslint 8.71.1's documented range below 6.1. TypeScript 6.0.3 is the current compatible selection. Node types 24.19.1 match the runtime major. Other source, browser, HTML and CSS tooling matches the checked registry versions in package.json. No incompatible peer override or automatic audit downgrade is used.

Strictest Astro checking, typed strict ESLint, Stylelint, generated HTML validation, Prettier, algorithm invariants and cross-engine browser flows are required. Runtime audits and development-only advisories are reported separately. Lighthouse uses three comparable mobile and desktop measurements per language. Laboratory budgets are LCP at most 2500 ms, CLS at most 0.1 and TBT at most 200 ms. Field performance and physical devices remain separate observations.
