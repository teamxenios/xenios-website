# Website 4 Research Commerce Wave 2 handoff

## Frozen scope

- Branch: `feature/website-4-research-commerce-wave-2-inventory-lots`
- Base: `bf1815c6754e04fd95325b25996ff441dc92fe43`
- Supersedes prohibited heads: `cbf9f0fb1ef69949a3c94aa252417981a6b5940d`,
  `bdafa110fbca67f018b5cb91b227f7ffd49c8663`,
  `b1a17c8c9bc581089b85047fbb3b7e21513c98d1`,
  `f646708d45d4a6e4e7acf4e2653e44746baef184`, and
  `0f6937f0d2e67dea8a0067dd8786378cca9095be`
- Domain: Inventory, lots, and private exact-lot COA administration only
- Production mutation: none
- Product seam: canonical Product Control is present on the exact accepted
  production base `bf1815c6754e04fd95325b25996ff441dc92fe43`.
- Website 3 contract: `server/research/products-diagnostics/product-commerce-readiness.ts`

## Completed

- Canonical lot extensions on `research_inventory_lots`.
- Atomic RPC-only lot creation starts quarantined with zero quantity buckets,
  version 1, exact Product Control binding, one immutable created event, and
  lock-serialized idempotent replay. Direct service-role lot INSERT is revoked.
- Atomic, optimistic-concurrency inventory movements for receipt, reserve, release,
  adjust, quarantine, quarantine release, damage, and reconcile.
- Append-only inventory movement and lot-status histories.
- Exact quantity invariants and direct quantity-overwrite protection.
- Quarantined, blocked, expired, recalled, and unverified lots fail allocation closed.
- Private PDF-only COA upload references in `research-coa-production`.
- Exact product + variant + lot COA readiness binding.
- Explicit missing-test states; missing tests never pass.
- Reviewed COA confirmation, approval, publication, withdrawal, idempotency, and audit.
- Rejected, withdrawn, and superseded COA documents are terminal for in-place
  confirmation, review, approval, rejection, publication, and withdrawal after
  the original command replay check. Their document version/state, lot state,
  tests, and audit/event cardinality remain unchanged after rejected commands.
- Atomic replayable upload preparation persists one document and private object
  identity; rejected or withdrawn reports are replaced through an audited,
  versioned supersession path that preserves prior metadata and events.
- The client preserves the normalized upload fingerprint, preparation and
  confirmation idempotency keys, original prepared version, document/storage
  identity, and object-upload posture across grant, PUT, and confirmation
  failures. A lost confirmation response replays the original version/key and
  cannot duplicate the upload or confirmation event.
- The recovery envelope is written to same-tab session storage before each
  external boundary and restored with strict metadata-fingerprint validation
  after reload/remount. It never stores the bearer token or signed upload URL,
  and is removed only after confirmed success or audited cancellation.
- Metadata changes first retire an unconfirmed preparation through a dedicated
  actor- and metadata-bound, lock-serialized, audited cancellation RPC. The
  abandoned object reference and history remain immutable; only then can a new
  metadata-bound preparation become the sole active report.
- Forced RLS and removal of browser-role grants on all seven affected tables.
- Service-role-only controlled writes with reviewed transition guards.
- Server-authorized route family, production repositories, client adapters, and Xenios UI.
- Exact canonical product + variant + SKU readiness validation through the accepted
  server-only Product Control reader; absent, mismatched, draft, or inactive
  projections fail release and allocation closed.
- Confirmed/published report and private-object metadata are immutable outside the
  versioned audited command; quality-test rows use the same command-only boundary.
- Every applicable failed or missing quality test blocks approval and readiness.
- Movement, disposition, and quality commands serialize and recheck idempotency under lock.
- Private file access records actor, purpose, document version, and immutable audit
  before a signed URL can be issued.

## Website 2 wiring request

Register `registerInventoryLotAdminApi` from
`server/research/inventory-admin/routes.ts` with
`buildInventoryLotAdminProductionDependencies(productReadiness)` from
`server/research/inventory-admin/production.ts`. The injected reader must be the
canonical main `ProductCommerceReadinessReader`; do not query Product Control
admin tables directly. Compose the post-Product-Control SQL implementation of
  `research_inventory_product_variant_ready` binding already present in this
candidate; do not substitute a parallel product model.

Guards:

- read: `super_admin`, `operations_admin`, `product_admin`,
  `approved_internal_reviewer`
- inventory mutation and private upload preparation/confirmation:
  `super_admin`, `operations_admin`
- quality review, publication, withdrawal, and private file access:
  `super_admin`, `product_admin`, `approved_internal_reviewer`

Register these client pages without changing their implementation:

- `/admin/research/inventory/lots` â†’ `InventoryLotsAdmin`
- `/admin/research/inventory/coas` â†’ `LotCoasAdmin`

Required server routes:

- `GET|POST /api/admin/research/inventory/lots`
- `GET /api/admin/research/inventory/movements`
- `POST /api/admin/research/inventory/lots/:lotId/movements`
- `POST /api/admin/research/inventory/lots/:lotId/disposition`
- `GET /api/admin/research/lot-quality-documents`
- `POST /api/admin/research/lot-quality-documents/upload`
- `POST /api/admin/research/lot-quality-documents/upload/cancel`
- `POST /api/admin/research/lot-quality-documents/:documentId/confirm`
- `POST /api/admin/research/lot-quality-documents/:documentId/review`
- `POST /api/admin/research/lot-quality-documents/:documentId/file-access`

The route registry, shared navigation, `server/index.ts`, capability contracts,
migration ledger, and deployment manifests remain Website 2-owned and unchanged.

## Product boundary

Consume only the canonical `ProductCommerceReadinessReader` and
`ProductCommerceReadinessProjection` from Website 3's server-only seam.
Website 4 remains authoritative for location, lot, quantity, inventory disposition,
COA operational state, and allocation readiness. The repository performs an exact
product ID + variant ID + SKU + approved/active comparison before release or
allocation. If the accepted reader or integration bridge is unavailable, both the
repository and SQL command path fail closed. Do not read Website 3 admin tables
directly, copy Product Control files, or create another product model.

## Migration and rollback

- Candidate: `supabase/research-inventory-lot-coa-admin.sql`
- Disposable bootstrap:
  `supabase/verification/research-inventory-lot-coa-disposable-bootstrap.sql`
- Verification:
  `supabase/verification/research-inventory-lot-coa-admin.verify.sql`
- Apply order: after the canonical product/variant Wave 1 migration and before any
  order/fulfillment capability is enabled.
- Apply twice: passed in disposable PostgreSQL 16.
- Transactional behavior proof: passed; zero residual business rows after rollback.
- Production application: Website 2 only.
- Before application, Website 2 must either upgrade the legacy
  `server/research/commerce/persistence/inventory-store.ts`
  direct quantity path to the versioned movement RPC or keep checkout disabled.
  The migration intentionally revokes direct lot-count updates.
- After production data exists, rollback the application release while preserving
  the additive schema and append-only audit records. Do not drop history tables.

## Validation evidence

- Focused tests: 6 files, 51 tests passed.
- Full tests: 203 files, 3,657 tests passed with two workers.
- TypeScript check: passed.
- Production build: passed.
- Machine-readable release manifest:
  `docs/coordination/WEBSITE_4_WAVE_2_RELEASE_MANIFEST.json`.
- Disposable database: apply twice passed.
- Database proof covered exact product/variant/SKU rejection; movement arithmetic;
  concurrent replay for lot creation, upload preparation, movement, disposition,
  and quality commands; idempotency conflicts; direct
  published-metadata and test-mutation rejection; all-test fail-closed semantics;
  rejected/withdrawn/superseded terminal no-mutation semantics; positive audited
  replacement through a new document; resumable upload identity after
  post-commit grant and confirmation-response failures; no renewed write grant
  after the object is confirmed; actor/metadata/version
  bound cancellation and concurrent replay before changed-metadata replacement;
  immutable actor/purpose access audit before signing; append-only history; forced
  RLS/grants; expiry/recall/quarantine gates; rollback; and zero residual rows.
- Exact disposable privilege snapshot: 8 forced-RLS tables, 0 browser table
  grants, 8 service-role SELECT privileges, 11 reviewed RPC execute privileges,
  and no service-role command-table DML.
- 1440px: no clipped elements; one main landmark and one page heading; all nine
  quality fieldsets render; minimum visible control height 60px.
- 375px: `scrollWidth === clientWidth` (360px scrollbar-adjusted), no clipped or
  internally scrollable elements, minimum visible control height 52px.
- 320px: `scrollWidth === clientWidth` (305px scrollbar-adjusted), no clipped
  elements, no internal horizontal scrollers, zero unlabeled controls, minimum
  visible control height 44px.
- 200% reflow proxy at 720 CSS px: `scrollWidth === clientWidth`, no clipping,
  and minimum visible control height 56px.
- Keyboard: the labeled lot selector receives the existing visible purple focus
  border; forms preserve semantic headings, fieldsets, labels, and controls.
- Browser/component retry proof: remount after committed preparation restores the
  original preparation key; remount after successful PUT/lost confirmation
  restores the original version/key and skips a second PUT. The persisted
  envelope contains neither token nor signed URL. Changed metadata invokes
  audited cancellation before a new preparation. Success clears the envelope,
  resets the form, and announces status through the live region. The previously
  accepted responsive lane remains unchanged and free of horizontal overflow at
  320 CSS px.

## Environment

- `RESEARCH_COA_BUCKET`: optional override; canonical default is
  `research-coa-production`.
- No secret values were printed or committed.
- No production data, Storage objects, migration, merge, or deployment was changed.

## Next exact action

Website 6 reviews this corrected frozen head and adversarial evidence. Website 2 then wires the
listed server/client routes, consumes the Website 3 readiness seam, keeps checkout
disabled until the legacy direct quantity path is removed, applies the reviewed
migration, merges, deploys, and live-smokes the authorized admin roles.

PRODUCTION STATUS: NOT YET MERGED
