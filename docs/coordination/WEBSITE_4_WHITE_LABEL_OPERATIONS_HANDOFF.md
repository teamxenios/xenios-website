# Website 4 â€” Affiliate White-Label Operations Handoff

## Release identity

- Owner: Website 4
- Lane: affiliate-white-label-operations
- Base: `c4085616c1cb88ea054993003647f6346aecea3a`
- Final head: resolve from the frozen draft PR
- Production mutation: none
- Migration: none

## Completed bounded source scope

- A partner-safe shared contract for organization approval, brand profiles, co-branded and backend-only modes, exact product/variant/SKU selections, quote review, packaging review, quality-document state, fulfillment preference, tracking, and support.
- A fail-closed server service that accepts member identity only from authenticated server context, revalidates exact variant readiness before selection and quote commands, preserves caller idempotency identity, and blocks supplier economics or internal-note fields from partner payloads.
- An unmounted route registrar for `/api/research/partner/organizations/white-label` and its application, brand, selection, quote, packaging-review, fulfillment, and support commands.
- A Xenios-styled `WhiteLabelWorkspace` designed for the existing Organizations portal. It does not create a second portal or navigation system.
- Focused tests for access denial, exact-variant mismatch and readiness failure, payload leakage, idempotency identity, route error handling, provider-action absence, keyboard landmarks, narrow reflow, and state completeness.

## Intentional fail-closed boundaries

- This candidate contains no direct database writes, service-role table mutation, provider adapter, SQL migration, payout action, label purchase, shipment dispatch, customer messaging, or production data.
- Affiliate commissions and white-label wholesale remain separate.
- The command port is an interface, not an in-memory production substitute. Mutations stay unavailable until Website 2 integrates a reviewed RPC-only, forced-RLS, audited, idempotent, concurrency-safe production implementation.
- Product eligibility requires the canonical server-authoritative product, variant, SKU, private-label approval, and quality-readiness projection. The client cannot assert readiness.

## Exact Website 2 wiring requests

1. Register `registerWhiteLabelPartnerRoutes` in the shared server composition only after the production command port and canonical variant authority are available.
2. Mount `WhiteLabelWorkspace` inside the existing `client/src/research/pages/partners/Organizations.tsx` surface; do not add a duplicate portal route.
3. Add capability/navigation integration only through the Website 2-owned control plane.
4. Add the candidate paths to canonical ownership before integration.
5. Keep every mutating control disabled or unavailable unless the registered server command and persistence boundary are live.

## Acceptance evidence

- Focused Vitest: 3 files, 17 tests passed.
- TypeScript compiler: passed.
- Production build: passed.
- Full Vitest: 4,839 passed and 1 skipped; the sole failure was an unrelated checked-in release-control snapshot test exceeding its hard-coded 15-second timeout, reproduced when run alone.
- Diff check: passed after normalized EOF cleanup.
- UI evidence: jsdom assertions cover initial, approved/populated, error, empty/unavailable messaging, landmarks, labeled controls, and 320px-safe class behavior. Browser screenshots require the authorized integration mount and are not claimed here.

## Production status

`NOT_YET_INTEGRATED` â€” bounded production-ready source seam only. Website 2 retains merge, persistence, migration, route registration, Render deployment, and live-smoke authority.
