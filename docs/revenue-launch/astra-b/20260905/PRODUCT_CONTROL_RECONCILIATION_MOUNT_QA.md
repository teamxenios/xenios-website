# Product Control source-reconciliation mount QA — 2026-09-05

## Scope

ASTRA-B mounted the existing read-only reconciliation adapter in the Products
Admin surface behind an explicit **Review source reconciliation** control. The
surface calls the server-owned
`/api/admin/research/products/revenue-launch/reconciliation` route only after
the operator opens it. An `AVAILABLE` response is rendered by the existing
`ReconciliationReviewContent` component; unavailable, denied, malformed, or
partial responses remain explicit and never become an empty successful review.

The panel displays source mappings, formulation exceptions, independent fact
states, and immutable lineage only. It has no approve, activate, publish,
price, purchase, fulfillment, or evidence-editing action. Product Control's
existing product and price reads remain unchanged when the review is closed.

## Changed paths

- `client/src/research/pages/adminx/ProductsAdmin.tsx`
- `client/src/research/pages/adminx/ProductsAdmin.test.tsx`

## Evidence

- Commit: `4c85065cc7be8dab369222a163b80ba8ab7318c1`
- Commit tree: `eba326426db3f491b4f7b3e94d00378789a2043e`
- Products Admin + reconciliation adapter/panel tests: **44/44 PASS**
- TypeScript `tsc --noEmit`: **PASS**
- `git diff --check`: **PASS**

The server projection and route remain ASTRA-A's authority. This client slice
does not claim that source facts, supplier confirmations, prices, or products
are approved or purchasable, and it performs no production mutation.
