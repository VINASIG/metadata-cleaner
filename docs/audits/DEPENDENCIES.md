# Dependency review, 6 October 2026

The application uses a locked Node 24.21.0 / npm 12.2.0 toolchain. Direct dependencies and relevant primary references are recorded in RESEARCH.md and TOOLCHAIN.md. Package integrity is pinned in package-lock.json. Browser parsers operate on bytes in workers; remote file loading and telemetry are absent.

The production npm audit passes with no advisories. The full development audit currently reports seven high findings through the braces chain in Stylelint and stylelint-config-standard. This is a build-only lint path, not browser code or a file-upload service. npm's suggested force remedy downgrades to incompatible historical Stylelint/config versions. It has not been applied. Runtime audit is mandatory in CI; dependency updates and the development findings remain visible and require review. This record does not claim the whole dependency graph is vulnerability-free.

The existing shared Playwright Firefox cache on the development host was incomplete, missing its mozglue assembly. A fresh project-local pinned Firefox download runs correctly. Local browser evidence uses that isolated cache without modifying other projects' caches. CI installs all three pinned engines and does not exclude Firefox.

Literal licenses from the pinned production package graph are distributed under public/licenses/third-party, with exact package versions and source locations in INDEX.txt. Original notices retain their own grants. The list conservatively includes build-side production packages as well as browser dependencies; inclusion does not imply every package is shipped in JavaScript. Direct parser licenses are also accessible beside NOTICE.txt.

Local Lighthouse SEO reports score 92 because its robots.txt fetch is blocked by the page's connect-src none CSP. The report explicitly records a CSP violation. The page CSP is retained: it blocks file-related network connections. Static robots.txt and the XML sitemap are validated independently through HTTP and built-output checks. A local Lighthouse fetch failure is not evidence that a crawler cannot fetch the static robots file.
