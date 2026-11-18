# Xenios full vision, private Early Access sharing and icons

This isolated source candidate follows the November 18 Complete Build Handoff
ZIP, SHA256 `77c3d57f4a355209ef40b2c5c6fbf8905f13ac39277eee7c515aa95b94e2c3b0`.
All31 listed checksums were verified before use. It extends Root's integration
`e7fb20a28788879f1d85232b954f23a03ba5d0d2`; it has no live deployment effect.

The homepage leads with “A more connected future for health.” Tensa Health is
“Proactive, personalized health.” Current entry remains “Early Access: peptides
& supplements.” Infinity is software for proactive health and wellness providers
and stays explicitly “In development.” Qualified care, diagnostics, nutrition,
movement, coaching and support remain the planned broader experience. Existing
Early Access category destinations, entry requirements, request terminology,
availability/clinical/research boundaries and founding-group waitlist remain.

`shared/research/social-metadata.ts` contains two constant identities. Homepage
raw HTML, the static template and the client head agree on Tensa Health &
Infinity, its development status and its dedicated1200x630 PNG. Only the exact
registered private `/earlyaccess` document receives the second constant share
identity and PNG. Neither identity accepts a URL, query, token, actor, product
selection or referral input. The private route remains noindex/nofollow/noarchive,
without a search canonical, hreflang, schema or HTTP canonical Link. Other
private/unknown routes retain their existing suppression. Public share metadata
does not grant catalog access or change sitemap, tracking or admission policy.

Client navigation to Early Access removes inherited JSON-LD and canonical
authority, and returning home restores the distinct homepage identity. The
production static server serves actual share PNG bytes and the real three-size
ICO with the appropriate MIME. It retains the prior PNG fallback when a build
does not contain the ICO, including evidence snapshots under a hidden path.
HTML keeps one canonical PNG favicon declaration to preserve the previous
browser convergence fix. PWA id, start URL, scope, registration, caching and
update logic are unchanged. The maskable icon now uses its separate safe-area
export. Asset authorship and exact hashes are in the adjacent provenance record.

Protection exceptions are exact files and pinned bytes; no directory allowance,
route, auth, permission, price, catalog, request, provider or payment behavior is
added. ICO hashing now uses binary bytes, as PNG and WOFF2 already do.

Qualification authored: raw-HTTP constant identities and private query exclusion;
unchanged other-private/near-miss rejection; client home/entry navigation and
schema cleanup; real PNG and ICO dimensions, bytes and GET/HEAD MIME; PWA scope
and separate maskable asset; homepage copy/category/landmark preservation; core
protection negative controls. Hosted execution and independent source review
must be recorded against the committed candidate. Authored assertions and image
inspection are not browser, Messages/WhatsApp cache or deployed-runtime proof.

Release remains subject to Samuel's current exact-action approval: no PR merge,
staging or production deployment, managed config/data/role or provider action
is authorized by this source document. Existing production and staging receipts
remain separate from this unshipped candidate.
