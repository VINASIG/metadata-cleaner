# VINASIG Metadata Cleaner

Remove optional metadata from JPEG, PNG, WebP and GIF in the browser without re-encoding image data. Choose complete metadata blocks, preserve required display information and see the exact number of bytes removed. The original file is never overwritten or uploaded. Supported compressed image payloads are compared byte for byte before offering a download.

The planned canonical site is https://clean.vinasig.io.vn/, with Vietnamese at root and English at /en/. The separate [Metadata Reader](https://github.com/VINASIG/metadata-reader) inspects additional file formats. Deployment state is recorded in the publication audit. A configured URL does not imply live availability.

Read [product behavior and limits](docs/PRODUCT.md) and [primary format sources](docs/RESEARCH.md). Required color profiles can contain descriptions, and visible/pixel-level identifying information remains. This tool does not promise absolute anonymity or a fixed reduction in size. Unsupported advanced images are rejected rather than re-encoded.

Use Node 24.21.0 and npm 12.2.0. Install the locked dependencies, then run npm run check, npm test, npm run build, npm run test:browser and npm run test:performance. npm run dev starts a development server. npm run preview serves the checked static output. Browser tests require the pinned Playwright browsers. Files and evidence are kept out of Git under output/.

The reviewed [VINASIG Agent Standards](docs/STANDARDS.md), shared website chrome and byte-preserved original brand assets are adopted. Software is AGPL-3.0-or-later, authored prose CC-BY-SA-4.0, fonts OFL-1.1 and marks follow the separate [brand policy](BRAND_POLICY.md). See [license scopes](LICENSES.md). Users' files and generated outputs retain their own rights.
