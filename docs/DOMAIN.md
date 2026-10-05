# Domain and publication handoff

The owner authorized public repository creation, publication and domain/discovery account setup on 6 October 2026. The canonical host is configured in package.json and the static HTML. Deployment and live verification are in progress. Source, local builds and verified local previews are complete.

Use the existing GitHub Pages Actions host. Create the repository with a truthful English description, relevant topics and the repository README homepage. Read Repo details back. Configure Pages build_type workflow and the project custom domain before adding DNS. Once live HTTPS has been verified, change the Repo details homepage to the canonical website and read it back again.

The proposed Cloudflare record is CNAME, name clean, target vinasig.github.io, proxy DNS only, TTL Auto. The existing sibling tool records use that target and mode. No record for this host was observed in the current dashboard. Check the exact hostname again before an authorized save. Preserve unrelated records.

Locale URLs are https://clean.vinasig.io.vn/ and https://clean.vinasig.io.vn/en/. Static robots.txt allows crawlers and declares https://clean.vinasig.io.vn/sitemap.xml. The sitemap lists the two real locale routes. After deployment, verify HTTPS, the source-revision meta tag and footer, local assets/workers, robots, canonical/hreflang and parsed sitemap. Submit the exact sitemap to the existing sc-domain:vinasig.io.vn property only after live availability. Report submission, Google's fetch and indexing separately.

Account UI destinations are the owner's existing [Cloudflare DNS dashboard](https://dash.cloudflare.com/ff374997a8dad2386d1eb0fe8a06504b/vinasig.io.vn/dns/records) and [Search Console sitemap report](https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Avinasig.io.vn). Account observations do not grant authority to save settings or submit data.

Provider references checked on 6 October 2026: [GitHub Pages custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), [Cloudflare DNS records](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/), and [Google sitemap reports](https://support.google.com/webmasters/answer/7451001?hl=en).
