# Public deployment observations, 6 October 2026

The owner approved two separate public projects, GitHub publication, custom domains, DNS, Search Console, repository details and website/profile synchronization. This audit records observed results for the first deployment. Later commits must still pass their own CI and expose the expected source-revision metadata before a new delivery claim.

## Repository and deployment

VINASIG/metadata-cleaner is public on main. Its verified signed source revision is d1256d2415cebe5d2d8ee38641f8c0142a2dba10. [CI and deployment run 37389754143](https://github.com/VINASIG/metadata-cleaner/actions/runs/37389754143) completed successfully, including source, unit, build, three-engine browser, shared-chrome and applicable performance checks on the configured Ubuntu/Windows matrix.

Repo details were set immediately after creation and read back. The initial homepage pointed to the repository README until the canonical HTTPS site was verified. The current homepage is https://clean.vinasig.io.vn/. The English description states local metadata removal without re-encoding and compressed-data verification. Topics are astro, browser-tools, exif, gif, image-tools, jpeg, metadata, png, privacy, vinasig and webp.

Pages uses workflow deployment, cname clean.vinasig.io.vn, an approved certificate and enforced HTTPS. Cloudflare contains the verified DNS-only CNAME clean pointing to vinasig.github.io with TTL Auto. Local, public resolver and dashboard observations agree.

## Live browser verification

The root, /en/, robots.txt and sitemap.xml return HTTPS 200 at the canonical host. Both HTML routes expose source revision d1256d2415cebe5d2d8ee38641f8c0142a2dba10. Robots declares the exact sitemap, whose parsed URLs are the root and /en/ routes. Canonical, hreflang, language, shared brand/header/footer and control inspection pass for both locales and themes at 320 and 1440 CSS pixels.

A synthetic PNG with identifying metadata was processed through the deployed worker. All removable blocks were selected by default. The identifying canary disappeared, compressed payload SHA-256 stayed unchanged and downloaded bytes matched the pure metadata-surgery result. Generic naming, report output and payload verification passed. No external file-processing requests or JavaScript errors were observed. These are integration checks on synthetic files, not a proof of anonymity for arbitrary images. The broader JPEG/PNG/WebP/GIF pixel-equality and malformed-file tests passed in CI.

The real Chrome page was visually reviewed. The original VINASIG header logo was activated and reached https://vinasig.io.vn/. Live screenshots and detailed JSON reports remain in ignored output/publication directories. Personal files were not used.

## Discovery and standards

The exact sitemap was submitted under the existing sc-domain:vinasig.io.vn property. The first sitemap fetch failed. Google live URL inspection at 07:01 local time then reported crawl allowed Yes and page fetch Successful. The same sitemap was resubmitted once after that result. The sitemap report now shows Success, read on 6 October 2026, with two discovered pages. Indexing and ranking are not established by submission or discovery.

Agent Standards commit bc72ee25ac18e7847eb2c7f8cdd8a57e3164e92e is pushed with successful source/installer and web-fixture CI. CORE-009 now requires immediate description, homepage and topics setup plus readback for every new repository, including private and source-only projects. The reviewed snapshot used here is recorded in .vinasig/provenance.json.

The main website inventory update is pushed at VINASIG/vinasig commit 6952a38419c47fe68773ab32d176b7749b798f47. Its own final CI and live validation are post-commit evidence. Both organization profile languages are pushed at VINASIG/.github commit 0ca5171eac525281a615935ebc78c44cb22609ba. The actual public English profile and rendered Vietnamese counterpart were opened and verified with the correct tool/source destinations.

Production field metrics, physical-device or screen-reader certification and exhaustive independent security review are NOT_RUN. Implementation limits remain those in PRODUCT.md. Private dashboard captures and account context are excluded from source publication.
