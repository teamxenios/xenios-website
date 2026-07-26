# Website 4 Research Commerce Wave 2 handoff

## Frozen scope

- Branch: `feature/website-4-research-commerce-wave-2-inventory-lots`
- Base: `6e4944674cfdfb33a8fd5685c031c7ac7c86fdb4`
- Domain: Inventory, lots, and private exact-lot COA administration only
- Production mutation: none
- Website 3 product seam: PR #78, head `7817f4857e6429fec0051168ab9a2fc08847b8e4`
- Website 3 contract: `server/research/products-diagnostics/product-commerce-readiness.ts`

## Completed

- Canonical lot extensions on `research_inventory_lots`.
- Atomic, optimistic-concurrency inventory movements for receipt, reserve, release,
  adjust, quarantine, quarantine release, damage, and reconcile.
- Append-only inventory movement and lot-status histories.
- Exact quantity invariants and direct quantity-overwrite protection.
- Quarantined, blocked, expired, recalled, and unverified lots fail allocation closed.
- Private PDF-only COA upload references in `research-coa-production`.
- Exact product + variant + lot COA readiness binding.
- Explicit missing-test states; missing tests never pass.
- Reviewed COA confirmation, approval, publication, withdrawal, idempotency, and audit.
- Forced RLS and removal of browser-role grants on all seven affected tables.
- Service-role-only controlled writes with reviewed transition guards.
- Server-authorized route family, production repositories, client adapters, and Xenios UI.

## Website 2 wiring request

Register `registerInventoryLotAdminApi` from
`server/research/inventory-admin/routes.ts` with
`buildInventoryLotAdminProductionDependencies()` from
`server/research/inventory-admin/production.ts`.

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
- `POST /api/admin/research/lot-quality-documents/:documentId/confirm`
- `POST /api/admin/research/lot-quality-documents/:documentId/review`
- `POST /api/admin/research/lot-quality-documents/:documentId/file-access`

The route registry, shared navigation, `server/index.ts`, capability contracts,
migration ledger, and deployment manifests remain Website 2-owned and unchanged.

## Product boundary

Consume only `ProductCommerceReadinessReader` and
`ProductCommerceReadinessProjection` from Website 3's frozen server-only seam.
Website 4 remains authoritative for location, lot, quantity, inventory disposition,
COA operational state, and allocation readiness. Do not read Website 3 admin tables
directly and do not create another product model.

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

- Focused tests: 2 files, 9 tests passed.
- TypeScript check: passed.
- Disposable database: apply twice passed.
- Database proof covered movement arithmetic, version conflicts, idempotent replay,
  idempotency conflict, direct-write guards, append-only history, forced RLS/grants,
  exact-lot COA binding, missing-test failure, expiry/recall/quarantine gates,
  rollback, and zero residual rows.
- 1440px: rendered with existing Xenios tokens/components.
- 375px: `scrollWidth === clientWidth`, no clipped elements, minimum visible
  control height 52px.
- 320px: `scrollWidth === clientWidth`, no clipped elements, zero unlabeled form
  controls, minimum visible control height 52px.
- 200% reflow proxy at 720 CSS px: no clipped elements or horizontal overflow.
- Keyboard: lot selector receives visible native focus; forms use semantic labels,
  headings, and controls.

## Environment

- `RESEARCH_COA_BUCKET`: optional override; canonical default is
  `research-coa-production`.
- No secret values were printed or committed.
- No production data, Storage objects, migration, merge, or deployment was changed.

## Next exact action

Website 6 reviews this frozen head and disposable evidence. Website 2 then wires the
listed server/client routes, consumes the Website 3 readiness seam, keeps checkout
disabled until the legacy direct quantity path is removed, applies the reviewed
migration, merges, deploys, and live-smokes the authorized admin roles.

PRODUCTION STATUS: NOT YET MERGED
