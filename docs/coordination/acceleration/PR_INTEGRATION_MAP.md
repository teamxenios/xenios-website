# PR Integration Map

## PR #46 — Care

- Open draft; focused foundation only.
- Fix active grant uniqueness, full page states, contrast, and separate visual language.
- Website 2 wires `App.tsx`/`server/index.ts`, applies migration, deploys with Care disabled.
- Recommended immediately after Assessment.

## PR #47 — Products and diagnostics

- Open ready branch but production integration incomplete.
- Website 3 corrects UI/source-contract ownership.
- Website 2 supplies canonical repositories, private Storage/RLS, bearer gateway prefixes, route/client wiring, and reviewed migration.
- Commerce remains gated.

## PR #48 — Operations, affiliates, professionals

- Open draft and not safe as one production migration.
- Sixteen partner client/server route gaps remain.
- Slice 3A operations/fulfillment, 3B affiliate/attribution/commissions, 3C professional accounts.
- Reuse canonical orders/lots/fulfillment/outbox/partner ledgers; no parallel in-memory production architecture.

Integration sequence: Assessment → Care → Products → Operations 3A → Affiliate 3B → Professional 3C.

