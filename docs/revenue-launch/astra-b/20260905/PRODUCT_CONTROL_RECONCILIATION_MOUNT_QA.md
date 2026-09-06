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
- Products Admin + reconciliation adapter/panel tests: **45/45 PASS**
- TypeScript `tsc --noEmit`: **PASS**
- `git diff --check`: **PASS**

The additional integration assertion covers an `AVAILABLE` projection: a
formulation `PENDING` fact and missing supplier/identity evidence render as
their server-supplied states, while the mounted controls contain no approve,
activate, or purchase action. It is recorded in commit
`0ebb6d76cdb5d974b5c283c5ec43330a18bb343e` (tree
`90ca0c59b2ada13af79bdfd231d73338552333db`).

The server projection and route remain ASTRA-A's authority. This client slice
does not claim that source facts, supplier confirmations, prices, or products
are approved or purchasable, and it performs no production mutation.

## Browser evidence boundary

After integration, a fresh synthetic production-shape run was attempted against
exact head `cd5500fe903e601fc967e536b08d2458e4304df9` using the pinned Node
`v20.19.0` and npm `10.8.2` toolchain. The required clean preview build stopped
before browser startup because its mandatory `npm ci --no-audit --no-fund`
could not unlink the locked native module
`node_modules/bufferutil/prebuilds/win32-x64/bufferutil.node` (`EPERM`, Windows
error `-4048`). No browser capture or journey pass is claimed; this remains an
environment/toolchain blocker, not product evidence. No production endpoint was
contacted and no mutation occurred.
