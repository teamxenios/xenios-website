# Website 3 handoff: products, diagnostics, and member commerce

## 1. Session

Website 3 — Products, Diagnostics & Member Commerce.

## 2. Branch

`feature/website-3-products-diagnostics`

## 3. Worktree

`C:\Users\sboad\projects\wt-website-3-products-diagnostics`

## 4. Base

`origin/main` at `a486b889503a8f9d42f86c4666e808af6c5e852c`.

## 5. Head

The release candidate is tracked in PR #47. Use the PR head SHA as the frozen
Website 3 integration SHA after this production-directive amendment is pushed.

## 6. Domain

Product master, product families, catalog presentation, exact-lot certificates,
supplement placeholders, clinician-guided metabolic pathway interest,
product-request integration, demand aggregation, Superpower Diagnostics,
Biomarker Center, neutral storage accessories, Support Center, and product /
diagnostics email intents.

## 7. Delivery status

Domain implementation is complete, pushed, and ready for review. It is not yet
merged or deployed. Shared route registration, shared UI route registration,
production migrations, and production provider construction remain
coordinator-owned integration work. Website 2 is the sole final merge and
Render deployment coordinator; Website 3 remains responsible for review fixes
and live verification after Website 2 releases the integration.

## 8. Checkpoint commits

- `716645c` — normalized product master foundations
- `77d7e2e` — truthful catalog and exact-lot COA experience
- `da1ed6b` — supplement and metabolic pathway experiences
- `0a002c3` — product-request integration and demand aggregation
- `69f4ac0` — diagnostics, biomarker, and member communications
- Wave 6 — isolated route registration, integration manifest, validation, and handoff

## 9. Intended files delivered

- `server/research/products-diagnostics/**`
- `client/src/research/products-diagnostics/**`
- `docs/coordination/WEBSITE_3_HANDOFF.md`
- `docs/coordination/WEBSITE_3_INTEGRATION_MANIFEST.json`

No Website 2-owned application wiring, research wiring, shared capability /
member-platform types, legal documents, or production migration artifacts were
edited.

## 10. Server registration

Import `registerProductsDiagnosticsApi` from
`server/research/products-diagnostics/index.ts`. Register it after the existing
member platform and commerce routes with the merged guards:

```ts
registerProductsDiagnosticsApi(app, website3Dependencies, {
  requireActiveMember,
  requireAdmin: requireSupabaseAdmin,
});
```

Do not define new authentication. `website3Dependencies` must be constructed
from the existing authoritative catalog and production persistence/providers:

1. Adapt `server/research/products-data.ts` with the existing
   `adaptLegacyCatalog`.
2. Pass the adapted `CatalogProduct[]` to `buildProductMaster`.
3. Construct `ExactLotCertificateService` with persisted variant, lot, and
   certificate rows, a private signed-read provider, and an audit recorder.
4. Construct `MetabolicInterestService` with a Supabase-backed
   `MetabolicInterestStore`.
5. Hydrate `MetabolicPathwayRepository` and `SuperpowerOfferRepository` from
   the admin configuration tables listed below. Persist every admin update
   before returning success; the included in-memory repositories are
   deterministic development/test providers, not production persistence.
6. Construct `BiomarkerService` with a Supabase-backed `BiomarkerStore` and
   private signed-upload provider.

## 11. Routes exported

Member routes, all behind `requireActiveMember`:

- `GET /api/research/product-platform`
- `POST /api/research/products/:sku/certificates/access`
- `GET /api/research/metabolic-pathways`
- `POST /api/research/metabolic-interest`
- `GET /api/research/diagnostics/superpower`
- `GET /api/research/diagnostics/biomarker`
- `POST /api/research/diagnostics/biomarker/report-upload`

Admin routes, all behind `requireSupabaseAdmin`:

- `GET /api/admin/research/metabolic-pathways`
- `PUT /api/admin/research/metabolic-pathways/:pathwayId`
- `GET /api/admin/research/superpower-offer`
- `PUT /api/admin/research/superpower-offer`

Existing product, commerce, cart, order, subscription, product-request, and
demand-analytics routes remain authoritative and must not be duplicated.

## 12. Client registration

Import the presentation exports from
`client/src/research/products-diagnostics/index.ts`.

Coordinator-owned route work:

1. Adapt `GET /api/research/product-platform` plus the existing
   `GET /api/research/products` DTO into `ProductCardView`, then render
   `ProductCatalogExperience` at the existing
   `/research/member/products` route.
2. Keep the existing product-detail commerce behavior authoritative. Add the
   nine-section `ProductDetailExperience` presentation and exact-lot
   certificate action without weakening the server `purchasable` decision.
3. Add a member-only diagnostics page that renders
   `DiagnosticsMemberHome`.
4. Add the pending care and supplement sections using
   `PendingMetabolicCare` and `SupplementComingSoon`.
5. Reuse the existing product-request form and routes. Entry links must carry
   the `source` query parameter defined by `productRequestHref`.
6. Add `StorageAndOrganization` and `SupportCenter` to the existing member
   product/support surfaces. Do not add primary-navigation Coming Soon tabs.

## 13. Product master

The master is normalized into separate product, variant, lot, certificate,
media, content, and commerce collections. It is derived from the existing
`CatalogProduct` source, so it does not create a second catalog. Unconfirmed
legacy facts never become member facts or prices.

## 14. Certificates

Certificate access requires active membership, exact SKU, and exact lot code.
The service audits before minting a five-minute signed read URL and fails closed
for missing, pending, withdrawn, disabled, or unavailable states. Public copy
states that purity does not establish sterility, safety, potency, or human
suitability.

## 15. Pending metabolic pathways

All three supplied cards are present with exact initial names, statuses, copy,
and actions. `GLP-3 placeholder` exists only in
`internalSearchAliases`; public DTOs and UI omit it. The interest list collects
only member id (from auth), current state, general goal category, preferred
contact, interest date, and attribution source. It is not a clinical intake.

## 16. Diagnostics and privacy

Superpower is Coming Soon and has no affiliate URL until the admin explicitly
enables an HTTPS offer. Biomarker files require consent and private signed
upload. The member DTO omits storage keys and contains no interpretation field.
Bloodwork is explicitly separate from and cannot validate Research products.

## 17. Product requests and demand

Website 3 adapts its exact form vocabulary into the existing product-request
service. The existing private storage, safe URL validation, upload confirmation,
idempotency, event history, emails, and admin queue remain authoritative.
Submitted URLs are never fetched. Member demand summaries use an explicit
allowlist and expose no requester ids or sources.

## 18. Communications

Ten idempotent intent types are exported from `communications.ts`:
order confirmation, shipment, delivery inspection, documentation available,
product-request confirmation/update, supplement launch, Superpower launch,
metabolic pathway launch, and biomarker reminder.

Sender: `Xenios Research <research@xeniostechnology.com>`

Reply-To: `research@xeniostechnology.com`

Wire these keys into the existing durable outbox dispatcher. Payloads are
allowlisted; extra sensitive fields are discarded.

## 19. Production data requirements

Website 2 / the release coordinator owns production migrations. Create and
review migrations for:

- `research_product_lots`: variant id, lot code, release state, received /
  expiry dates; unique `(variant_id, lot_code)`.
- `research_product_certificates`: exact lot id, document state, private
  storage key, verification state, reviewed date.
- `research_certificate_access_audit`: member id, certificate id, lot id,
  outcome, reason, timestamp; append-only.
- `research_metabolic_pathways`: pathway id, public fields, internal aliases,
  action links, updated actor/time.
- `research_metabolic_interests`: member id, pathway id, state, general goal,
  contact method, interest date, attribution, idempotency key; unique
  `(member_id, idempotency_key)`.
- `research_superpower_offers`: offer fields, affiliate enabled/url,
  effective/verification dates, updated actor/time.
- `research_biomarker_records`: member id, state, partner reference, private
  report key/filename, consent version/time, updated time; unique member id.
- `research_product_content`: product id, section, state, heading/body,
  updated actor/time; unique `(product_id, section)`.

Apply member ownership RLS to interest and biomarker records, admin-only policy
to configuration rows, and service-role-only access to storage keys and audit
rows. Do not expose either storage bucket publicly.

## 20. Environment and provider requirements

- Private COA bucket, suggested logical name `RESEARCH_COA_BUCKET`
- Private biomarker report bucket, suggested logical name
  `RESEARCH_BIOMARKER_REPORTS_BUCKET`
- Existing `RESEARCH_PRODUCT_REQUESTS_BUCKET`
- Existing Supabase service-role server configuration
- Existing Resend configuration with the sender/reply-to values above

No affiliate code or provider secret belongs in the repository. Affiliate URLs
are admin data and stay null until enabled.

## 21. Validation

- Focused Website 3 and reused-system suites: green.
- Complete repository suite split into four equivalent Vitest batches because
  the single `npm test` process exceeded the execution ceiling twice:
  142 test files, 2,936 tests, all passed.
- `npm run check`: passed.
- `npm run build`: passed.
- Production build retains the repository's existing large-chunk warning; no
  new build failure.

## 22. Visual, keyboard, mobile, and accessibility review

The components use semantic headings, landmarks, lists, labels, native inputs /
selects / buttons, `aria-live`, `aria-pressed`, `aria-current`, visible focus
through the existing design system, horizontal filter overflow, `min-w-0`, and
single-column defaults that reflow at 320 px.

An isolated local preview was created for desktop and 320 px screenshots, but
the in-app browser could not attach its webview after the documented recovery
steps. No screenshot is claimed. The temporary preview harness was removed.
The release/QA lane should capture desktop and 320 px screenshots after shared
route integration.

## 23. Risks, blockers, and release rule

- Do not merge until durable pathway/offer/interest/biomarker persistence and
  private storage providers are wired through reviewed production migrations.
- Do not enable product commerce, Superpower affiliate access, or biomarker
  uploads from client state.
- Do not publish the internal GLP-3 alias.
- The universal production directive supersedes the former no-deploy
  instruction. Completed and approved Website 3 work must reach the production
  Render service and live Xenios website.
- Website 2 alone controls final merge sequencing and Render deployment.
  Website 3 must not independently merge or trigger a competing deployment.
- Website 2 must run the integrated browser matrix after applying shared route,
  provider, and migration work. Website 3 must then verify its affected live
  routes, role restrictions, persistence, mobile behavior, accessibility, and
  relevant production logs before reporting `LIVE`.
