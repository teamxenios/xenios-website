# ASTRA-B reconciliation adapter QA — 2026-09-05

## Pushed slice

- Branch: `codex/xenios-seth-astra-b-20260905`
- Commit: `eca3fd6c6c564854cb48e0ad74e65f8b41d31069`
- Tree: `0cb4211265e79065bf097c784c4e9d789e969099`

## What changed

`client/src/research/revenue-launch/reconciliation-review.ts` now provides the
read-only adapter for the shared reconciliation contract. It calls the pinned
`/api/admin/research/products/revenue-launch/reconciliation` route, preserves
honest API boundary failures, and validates the complete server projection
before the UI receives it. Validation rejects duplicate source rows, missing
or invalid SHA-256 lineage, impossible coverage, malformed identities, invalid
timestamps, unknown evidence states/reasons, and state/evidence combinations
that the shared contract does not permit.

`ReconciliationReviewPanel.test.tsx` verifies that the presentation renders
server-supplied `UNKNOWN`, `PENDING`, and `CONFIRMED` states without promoting
them to approval or purchase authority. The adapter additionally enforces
projected-time evidence ordering/expiry, exact product-link allowlisting, and
fact-kind/authority binding. It contains no action controls.

## Evidence

- Adapter validator tests: **11/11 passed**; panel plus adapter tests:
  **10/10 passed**.
- Product Control price review + Products Admin regression tests plus this
  slice: **102/102 passed**.
- TypeScript `tsc --noEmit`: **PASS**.
- Production build (`npm run build`): **PASS** (existing dynamic-import and
  large-chunk warnings only).
- `git diff --check`: **PASS**.

This is a client read/validation slice only. It does not add an endpoint,
change server authority, approve a formulation, confirm a supplier, activate a
price, publish a product, alter production configuration, or perform any
communication, payment, fulfillment, migration, or deployment.

ASTRA-A must integrate the adapter only with the canonical server route and
retain the existing source-of-record and exact-SHA release gates.
