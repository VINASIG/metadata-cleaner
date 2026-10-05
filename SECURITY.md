# Security reporting

Do not attach private files, identifying metadata or personal account details to public issues. Use the repository private security advisory feature for sensitive reports when available. Public reproductions should use synthetic files.

Files are processed in local browser memory by a worker. The application has no upload API, file persistence, telemetry or remote file loading. A static hosting provider receives normal page requests. A hash-based CSP allows local scripts/workers and blocks file connections, form submissions, objects and external scripts. Metadata values use textContent and embedded previews, scripts and links are not executed. Downloads require an explicit action.

Input is limited to 100 MiB, workers to 20 seconds, displayed fields to 5000 and strings to 8192 characters. Expanded image metadata and PDF XMP are bounded to 8 MiB, Office property XML to 2 MiB. A reset, replacement or page hide terminates the worker. These limits are resource safeguards, not a malware-scanning guarantee.

The cleaner verifies compressed image bytes and dimensions after surgery. It retains required color, orientation, animation and decoding structure, rejects recognized unsupported advanced containers, and fails without producing output when safety checks fail. Color profiles and visible pixel contents can retain identifying information. The reader only reports supported parser coverage; missing fields never prove absence. Current PDF properties do not exhaust old incremental revisions; Office properties do not exhaust document contents.

The production dependency audit is required in CI. Current build-only advisories and their disposition are recorded in docs/audits/DEPENDENCIES.md. Never use an audit force downgrade that breaks the pinned toolchain without review.
