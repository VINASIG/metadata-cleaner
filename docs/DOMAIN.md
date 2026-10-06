# Domain and publication

The owner authorized public repository creation, publication and domain/discovery account setup on 6 October 2026. The canonical site at https://clean.vinasig.io.vn/ is live over HTTPS. Both locale pages, robots and sitemap return HTTP 200. Read the dated observations in [the publication audit](audits/PUBLICATION.md).

GitHub Pages uses build_type workflow and the project custom domain. The domain was claimed in Pages before adding DNS. Its certificate is approved and https_enforced is true. The public repository has a reviewed English description and relevant topics. Its initial README homepage was changed to the verified canonical website after HTTPS became available. All Repo details were read back after saving.

The saved Cloudflare record is CNAME, name clean, target vinasig.github.io, proxy DNS only, TTL Auto. The exact record was verified in the dashboard and public DNS. Preserve this GitHub Pages binding and unrelated records when maintaining the zone.

Locale URLs are https://clean.vinasig.io.vn/ and https://clean.vinasig.io.vn/en/. Static robots.txt allows crawlers and declares https://clean.vinasig.io.vn/sitemap.xml. The parsed sitemap lists exactly those two routes. The exact sitemap was submitted to the existing sc-domain:vinasig.io.vn property after live availability. Google's live URL inspection fetched it successfully, and the sitemap report shows Success with two discovered pages. Submission and processing do not establish indexing.

Account UI destinations are the owner's existing [Cloudflare DNS dashboard](https://dash.cloudflare.com/ff374997a8dad2386d1eb0fe8a06504b/vinasig.io.vn/dns/records) and [Search Console sitemap report](https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Avinasig.io.vn). Future account writes still require applicable task authorization.

Provider references checked on 6 October 2026: [GitHub Pages custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), [Cloudflare DNS records](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/), and [Google sitemap reports](https://support.google.com/webmasters/answer/7451001?hl=en).
