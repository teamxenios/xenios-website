# XENIOS Checkout RC P1 remediation handoff

- Base SHA: `20f069088e1793146f66e04116232b4f0a41de9b`
- Pushed remediation SHA: `9633233cebb8907c5b2244d2508883c6aa832630`
- Tree: `f82c67c210939a0bb4141643a93442921e1b7791`
- Branch: `codex/xenios-checkout-rc-p1-remediation-20260923`
- Origin exact SHA verified before this handoff.

## Outcome

The checkout production path now uses one SECURITY DEFINER atomic preparation RPC for request identity, digest binding, inventory reservation, canonical order, checkout execution, credit-trigger participation, and audit state. Split preparation remains available only to explicit in-memory tests. Cancellation and capture call the canonical release/finalize inventory RPCs inside their settlement transactions. Direct service-role mutation of checkout, credit, reservation, allocation, event, and inventory-lot authorities is denied and capability-attested.

Capability `durable_checkout_money_v2:20260923.1` attests the complete chain, exact normalized bodies, function attributes/owners/search paths, trigger timing/event/function/enabled state, constraints/indexes, RLS/forced-RLS, and least-privilege ACLs. The disposable PGlite chain passed exact preparation replay, conflict, rollback, and all recorded adversarial tamper probes. Stripe account identity remains an explicitly external hosted qualification.

Request authorization uses each request's awaited preflight result. Stripe webhook signature verification precedes managed readiness work. Disabled commerce returns retryable `capability_disabled` without claiming a durable receipt.

Commission SQL uses `extensions.digest`; its precheck requires `extensions.digest(bytea,text)`. Protected seam and route census records are current. The preview harness passed under full-suite load.

## Verification

- Submission: 55/55 passed.
- Focused: 73 files passed, 1 skipped; 2,761 tests passed, 4 skipped, 0 failed.
- Disposable SQL: PASS on PGlite 0.5.8, exact capability v2 and 22 named checks/tamper probes; no managed or independent-connection claim.
- `npm run check`: PASS.
- `npm run build`: PASS.
- Route uniqueness: 448 routes across 439 call sites, zero duplicates.
- Migration DAG: 36 nodes, canonical checksums accepted.
- Full suite: 964 files passed, 6 skipped; 18,008 tests passed, 85 skipped, 0 failed.

## External work intentionally not performed

No merge, deploy, managed migration, production mutation, Render setting/secret change, Stripe activation, commerce activation, Referral V1 activation, or commission activation occurred. Remaining external qualification: managed staging installation/postchecks, independent PostgreSQL connection contention proof, hosted Stripe test-mode journey and delivered refund webhook, Stripe account-identity readback, and exact founder production authorization.
