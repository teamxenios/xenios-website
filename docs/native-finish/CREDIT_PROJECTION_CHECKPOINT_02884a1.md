# Credit projection correction — bounded successor

Application: `02884a1b4fcb561452879853123f07374a18bc14`.
Tree: `7b702f5752a992c154c0af579a1262b4943e8e09`.
Previous integration and its actual full-suite result remain in
`INTEGRATED_CHECKPOINT_2578d9c.md`; historical runs are not relabelled.

The two-file runtime/test correction refuses missing, malformed, nonnumeric or
unsafe integer ledger amounts; unknown/missing record projections; mismatched
member/entry identity; absent list payloads; invalid evaluation clocks; and lossy
intermediate balance sums. Canonical approved-state and pending-chain semantics
are unchanged. Negative balances still clamp only in the member DTO. New durable
expiring-credit writes still refuse. No ledger history or production data changed.

## Actual verification

- Regression run before correction: 35 passed, 19 failed.
- Focused corrected ledger/submission/checkout: 134 passed, zero failed/skipped.
- Entire commerce directory on exact committed successor: 48 suites, 1,283 passed,
  zero failed, three skipped.
- Typecheck and production build: exit 0 with the pinned toolchain. Existing
  build chunk warnings retained.
- Strict scan from ff3c496 to this exact successor: exit 0; 80,365 added lines in
  440 files; 105 raw/independently classified synthetic matches, zero unresolved
  secret matches and zero bounded V3 name-list matches. Input and scanner unchanged.
- Independent source acceptance by `/root/product_review_filters` at
  `2026-09-10T20:04:02.903Z`; no authorship, edits, tests or remote effects by reviewer.

Exact reviewed LF hashes:

- `store-credit-store.ts`: `8cf4aee481e89c864b4150fa2a0733e0fb95399c0d5e2dd3d2bb1af1a9cd82d6`.
- `store-credit-store.test.ts`: `ae24cf875608e7bff32e5beeb4fdfa41c03822d96a8d29f0ec241450226d6749`.
- Two-file diff above 4a8aed9: `980001bc5f1cdca0e83c234ecfde0d50b2423344a43e760e39d9e13b0b6e0cbf`.

Local evidence is outside Git at
`C:/Users/sboad/projects/xenios-native-finish-evidence-20260910/`:

| File | SHA-256 |
| --- | --- |
| credit-projection-before.json | 49e69ad6ab64885eacfea9cff7e235b613c185a4550abf703cb5322604fb9d9c |
| credit-projection-after.json | 724ac545c0ea3ce913f1abadae5f60456eb4754f429b29a6b423a8c961b8a886 |
| commerce-credit-projection.json | dbcac3fea41e5640f998b3e215b9b006e057eeea275e76cfdebbd38e4d93518c |

## Limits and immediate continuation

This is not atomic credit reservation, complete ledger aggregation, expiry-aware
allocation, credit refund, or production qualification. Intermediate sums beyond
safe integer capacity deliberately refuse even if the eventual net would fit.
Existing Date.parse permissiveness remains. The previous whole-platform suite
is retained with its failures and isolated resolutions; no clean whole-platform
run is claimed for this runtime successor.

Next owner: the sole native integration session. Implement member-serialized,
execution-bound credit reservation before provider authorization, then atomically
consume/release only the matching hold through capture/cancellation. Preserve
unknown outcomes and all canonical ledger history; no second balance authority.
Use a candidate migration and local tests, not an unauthorized remote write.

Staging database-backed reads still time out despite ACTIVE_HEALTHY status.
Do not restore/reset, infer schema parity, or fall back to production. Managed
qualification, explicit test credentials/fixtures/effects, and exact production
authorization remain separate prerequisites. No notification or payment occurred.
