# Xenios Checkout RC — Second Independent Review Handoff

## Identity and scope

- Reviewed SHA: `6b74f24dab81f895b053047650fb3e5560a8e4b7`
- Reviewed tree: `73a36be2e4359c3a95830c8940469bdae978115b`
- Corrected source SHA: `23d4869df8370341fc5ec8e9963f020b6103faa3`
- Corrected source tree: `c8d7584fa79024c8951dccae87fe6d4fdb25c1aa`
- Branch: `codex/xenios-checkout-rc-second-review-20260923`
- Origin: exact source SHA verified before this handoff.
- Scope: local source remediation, tests, documentation, and Git push only. No Supabase, Render, Stripe, managed migration, feature flag, provider, customer communication, deployment, or production mutation occurred.

## Findings closed

- Atomic checkout preparation now validates and aggregates exact SKU/quantity multisets across order lines and inventory requests before reservation. Direct SKU and quantity mismatch controls return `checkout_prepare_inventory_binding_mismatch` with zero order and zero execution rows; committed idempotent replay remains ahead of fresh-create validation.
- Capability V2 now fails closed across the reviewed catalog manifest: owners/RLS, critical columns, function bodies and attributes, trigger shapes, constraints, indexes, and relation/function ACLs. All 18 isolated drift probes returned NULL, and rollback restored the exact `durable_checkout_money_v2:20260923.1` token.
- Verified-but-disabled fulfillment now returns retryable `capability_disabled` rather than a durable 2xx; later enabled redelivery applies without an earlier state mutation.
- Managed-pgcrypto qualification now uses `extensions.digest`; persistent-cart public-qualified calls were removed, exact current bytes apply twice in PGlite, and only the two checksum-pinned immutable historical calls remain.
- The release-control-plane test now attests the changed persistent-cart migration at its own source SHA while retaining the historical shared source for the other four protected pending migrations.
- A fresh independent exact-line review classified 112/112 generic detector hits as synthetic local tests/previews/harnesses across 26 paths; the strict registry consumes only those exact hashes and multiplicities and fails closed on any file drift or new finding.

## Verification

- Submission gate: 55/55 passed.
- Focused matrix: 65/65 files passed; 2,494 tests passed; 4 skipped; 0 failed.
- Full serial suite on substantive source `24f7600ebd4398a25b82977acba61bab76e865ee`: 970/970 files and 3,577/3,577 suites passed; 18,009 passed, 85 skipped/pending, 0 failed; report SHA-256 `55cb2a9f98ec91e2a1f8692985bb877b946cfe35c5b7a92243da116a9f49ff23`.
- Typecheck: PASS under Node 20.19.0.
- Production build: PASS under Node 20.19.0; 2,303 client modules plus server bundle.
- Refund/capability SQL rehearsal: PASS, 44 named checks including 18/18 independent catalog drift probes.
- Credit/cancellation reservation SQL rehearsal: PASS, 57/57 checks with 29 scenarios and 8 negative controls.
- Commission SQL rehearsal: PASS, 23 checks; economics source bytes unchanged from the reviewed SHA; `public.digest` absent in the managed-shape rehearsal.
- Persistent cart: exact-current PGlite 0.5.8 / PostgreSQL 18.3 apply-twice plus checked-in verifier PASS; 4 forced-RLS tables and 5 hardened command functions.
- Route uniqueness: PASS, 448 registrations across 439 call sites.
- Migration DAG: PASS, 36 nodes and canonical checksums.
- Core-site protection: PASS, 44 changed paths classified (20 Research/Care, 16 infrastructure, 8 tests) and 28 protected hashes verified.
- Site record: PASS, 220 routes and 15 capabilities; source `8b9b8256719e1896c893d075b5ab99b9f036befd`, recorded production `c545a70eb694d990842ad1259df4f0786dab92c9`.
- Pgcrypto acceptance: PASS, 223 SQL files, one pinned immutable historical exemption, zero new public-qualified calls.
- Preview evidence harness: PASS, 19/19.
- Strict release diff scan: PASS over 164,633 added lines / 660 files from `ff3c496245739233b71e46f9e5d6e26af9d57017`; 112 raw generic findings, 112 exact reviewed fixtures, 0 unresolved secrets, 0 secret findings, 0 PII findings. Mechanism tests 35/35 passed. Approved private V3 input remained external and matched SHA-256 `27fb9d7052867808f8cee5f3147fa34855fad0d893a6a14508b9212198ce4fbb`.

## Residual blockers and next work

- Run exact-current managed non-production Supabase prechecks, install, postchecks, and rehearsals for the complete checkout/refund chain under explicit staging authorization.
- Run true independent-connection PostgreSQL contention proof and the exact-current stock PostgreSQL 16 persistent-cart verifier; the local Docker daemon was unavailable, so the current proof is PGlite/PG18.3 only.
- Complete Stripe test-mode same-account key readback, hosted 3DS/restart/fault/reconciliation, durable claim/refund exact replay, and Stripe-delivered refund webhook journeys. No Stripe credential or endpoint was configured by this session.
- Commission remains candidate-only and unmounted: managed install, canonical fact source/route, UUID-reference join, partner bindings, and payout activation remain outstanding.
- Catalog authority records 0 direct-buy, 124 assisted-order, 242 Care-required, and 147 unavailable rows. Native checkout must remain dark until a nonempty price/inventory/supplier/fulfillment/documentation-qualified subset exists.
- Capability V2 is strong but is not byte-for-byte catalog identity across PostgreSQL versions; managed target-version proof remains required.
- No merge, deployment, production migration, environment/flag change, provider activation, or production smoke is authorized or complete. Production needs current exact-SHA approval, prechecks, postchecks, rollback, and smoke.

## Disposition

`READY FOR STAGING: YES` means ready only for explicitly authorized non-production qualification. It does not mean production-ready. Leave acceptance to an independent reviewer; do not self-accept this changed SHA.
