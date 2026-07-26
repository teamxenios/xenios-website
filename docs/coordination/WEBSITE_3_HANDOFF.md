# Website 3 handoff: products, diagnostics, and member commerce

## 1. Session

Website 3 — Products, Diagnostics & Member Commerce.

## 2. Branch

`feature/website-3-products-diagnostics`

## 3. Worktree

`C:\Users\sboad\projects\wt-website-3-products-diagnostics`

## 4. Base

`origin/main` at `48cb57250c1ec54fe8714e59fa1071a9eb27f867`.

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

Domain-local implementation and the original-scope reconciliation are complete
on this branch. The candidate is not yet merged or deployed. Shared route
registration, capabilities/navigation, production migrations, and production
provider construction remain coordinator-owned integration work. Website 2 is
the sole final merge and Render deployment coordinator; Website 3 remains
responsible for review fixes, Release Train 4 product application after Website
1 freezes the trust contracts, and live verification after Website 2 releases
the integration.

## 8. Checkpoint commits

- `3a7fe44` — normalized product master foundations
- `630a532` — truthful catalog and exact-lot COA experience
- `a7c9871` — supplement and metabolic pathway experiences
- `8bd068e` — product-request integration and demand aggregation
- `748205c` — diagnostics, biomarker, and member communications
- `b1889ee` / `5e9c6fd` — integration handoff and production authorization
- `a617e88` — production-integrity review corrections
- Final Website 3 completion commit — existing-shell/UI-kit refactor,
  shared request-source contract, state regressions, and complete evidence

## 9. Intended files delivered

- `server/research/products-diagnostics/**`
- `client/src/research/products-diagnostics/**`
- `shared/research/product-request-sources.ts`
- `docs/coordination/WEBSITE_3_HANDOFF.md`
- `docs/coordination/WEBSITE_3_INTEGRATION_MANIFEST.json`
- `docs/coordination/WEBSITE_3_REMAINING_SCOPE.md`

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
2. Pass the adapted `CatalogProduct[]` and the existing canonical
   `CatalogService.listProducts()` readiness DTOs to `buildProductMaster`.
   Website 3 never derives `purchasable` from catalog approval or price alone.
3. Construct `ExactLotCertificateService` with persisted variant, lot, and
   certificate rows, a private signed-read provider, and an audit recorder.
4. Construct `MetabolicInterestService` with a Supabase-backed
   `MetabolicInterestStore`.
5. Hydrate `MetabolicPathwayRepository`, `SupplementPlaceholderRepository`,
   and `SuperpowerOfferRepository` from the admin configuration tables listed
   below. Persist every admin update before returning success; the included
   in-memory defaults are deterministic development/test providers, not
   production persistence.
6. Construct `BiomarkerService` with a Supabase-backed `BiomarkerStore` and
   private signed-upload provider. The provider must verify the private object
   before the confirmation route transitions a record to `report_uploaded`.
7. Implement pathway, supplement, and Superpower repository mutations as
   awaited durable writes. Persistence failure must reject and must never
   produce a 200 response.

## 11. Routes exported

Member routes, all behind `requireActiveMember`:

- `GET /api/research/product-platform`
- `POST /api/research/products/:sku/certificates/access`
- `GET /api/research/metabolic-pathways`
- `POST /api/research/metabolic-interest`
- `GET /api/research/diagnostics/superpower`
- `GET /api/research/diagnostics/biomarker`
- `POST /api/research/diagnostics/biomarker/report-upload`
- `POST /api/research/diagnostics/biomarker/report-upload/confirm`

Admin routes, all behind `requireSupabaseAdmin`:

- `GET /api/admin/research/metabolic-pathways`
- `PUT /api/admin/research/metabolic-pathways/:pathwayId`
- `GET /api/admin/research/superpower-offer`
- `PUT /api/admin/research/superpower-offer`
- `GET /api/admin/research/supplement-placeholders`
- `PUT /api/admin/research/supplement-placeholders/:category`

Existing product, commerce, cart, order, subscription, product-request, and
demand-analytics routes remain authoritative and must not be duplicated.

## 12. Client registration

Import the presentation exports from
`client/src/research/products-diagnostics/index.ts`.

Coordinator-owned route work:

1. Adapt `GET /api/research/product-platform` plus the existing
   `GET /api/research/products` DTO into `ProductCardView`, then render
   `ProductCatalogExperience` at the existing `/research/member/products`
   route. Preserve family filtering, search, and the published-facts
   comparison.
2. Keep the existing product-detail commerce behavior authoritative. Add the
   nine-section `ProductDetailExperience` presentation and exact-lot
   certificate action without weakening the server `purchasable` decision.
3. Add a member-only diagnostics page that renders
   `DiagnosticsMemberHome`.
4. Add the pending care and supplement sections using
   `PendingMetabolicCare` and `SupplementComingSoon`.
5. Reuse the existing product-request form and routes. Entry links must carry
   the `source` query parameter defined by `productRequestHref`.
6. Add `StorageAndOrganization`, `SupportCenter`, and
   `ResearchEducationCenter` to the existing member product/support/education
   surfaces. Do not add primary-navigation Coming Soon tabs.

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
enables an HTTPS offer. Its admin record includes a safe interest action,
partner/offer state, last-reviewed date, and verified-price date. Biomarker
files require consent and private signed upload. The member DTO omits storage
keys and contains no interpretation field. The trainer-safe projection contains
only status, follow-up need, and update time. Bloodwork is explicitly separate
from and cannot validate Research products.

## 17. Product requests and demand

Website 3 adapts its exact form vocabulary into the existing product-request
service. The existing private storage, safe URL validation, upload confirmation,
idempotency, event history, emails, and admin queue remain authoritative.
Submitted URLs are never fetched. Member demand summaries use an explicit
allowlist and expose no requester ids or sources.

The member UI and server adapter import one browser-safe Website 3 source
contract from `shared/research/product-request-sources.ts`. Every rendered source is in the
server-accepted `PRODUCT_REQUEST_ENTRY_POINTS` vocabulary.

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

Website 2 / the release coordinator owns production migrations. Inspect and
reuse canonical schema rather than creating parallel product-lot tables.
Create or extend reviewed migrations for:

- canonical `research_inventory_lots`: exact variant/product lot, release and
  availability state, received/expiry dates, unique canonical lot identity.
- canonical `research_lot_quality_documents`: exact lot, document state,
  private storage key, verification state, reviewed date.
- `research_certificate_access_audit`: member id, certificate id, lot id,
  outcome, reason, timestamp; append-only.
- `research_supplement_placeholders`: category, public copy, private channel
  configuration, launch-interest action, updated actor/time.
- `research_metabolic_pathways`: pathway id, public fields, internal aliases,
  action links, updated actor/time.
- `research_metabolic_interests`: member id, pathway id, state, general goal,
  contact method, interest date, attribution, idempotency key; unique
  `(member_id, idempotency_key)`.
- `research_superpower_offers`: offer/partner state, affiliate enabled/url,
  interest state/action, effective/verification/reviewed dates, updated
  actor/time.
- `research_biomarker_records`: member id, state, partner reference, private
  report key/filename, consent version/time, updated time; unique member id.
- `research_biomarker_uploads`: upload id, member id, pending state, private
  storage key, filename, content type, expected size, consent version/time,
  expiry, created time; unique upload id. Confirmation must verify object
  existence and metadata, then atomically update the member record and consume
  the pending upload.
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

- Focused Website 3 suites: 12 files, 76 tests, all passed.
- Complete `npm test`: 147 test files, 3,173 tests, all passed.
- `npm run check`: passed.
- `npm run build`: passed with the repository's existing large-chunk warning.

## 22. Visual, keyboard, mobile, and accessibility review

The components use semantic headings, landmarks, lists, labels, native inputs /
selects / buttons, `aria-live`, `aria-pressed`, `aria-current`, visible focus
through the existing design system, horizontal filter overflow, `min-w-0`, and
single-column defaults that reflow at 320 px.

The corrected head was rendered through the in-app browser using the real
Website 3 React component and repository styles. Evidence is committed under
`docs/coordination/evidence/`:

- `website3-catalog-desktop-1440.png`
- `website3-catalog-mobile-375.png`
- `website3-catalog-mobile-320.png`
- `website3-catalog-keyboard-focus-320.png`
- `website3-catalog-empty-375.png`
- `website3-catalog-unavailable-375.png`
- `website3-catalog-error-375.png`
- `website3-diagnostics-desktop-1440.png`
- `website3-diagnostics-biomarker-form-1440.png`
- `website3-care-form-desktop-1440.png`
- `WEBSITE_3_UI_EVIDENCE.md`

The desktop, 375 px, and 320 px document widths matched their scroll widths, so
no page-level horizontal overflow was present. The product-family row retains
an intentional horizontal scroller. The DOM accessibility tree exposed
semantic headings, a named searchbox, pressed-state buttons, and descriptive
links; the focused searchbox displayed a visible focus border. Website 2 /
Website 6 must repeat the matrix, including 200% zoom, after shared route
integration and on the live site.

## 23. Risks, blockers, and release rule

- Do not merge until durable pathway/supplement/offer/interest/biomarker
  persistence and private storage providers are wired through reviewed
  production migrations.
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

The exact original-scope classification, owner, acceptance test, and release
train for each item is in `docs/coordination/WEBSITE_3_REMAINING_SCOPE.md`.

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS

PRODUCTION STATUS: NOT YET MERGED
