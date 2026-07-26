# Website 4 integration request

Website 4 owns operations, fulfillment, affiliate reporting, CRM, notifications, and professional-account workflows. Website 2 remains the sole owner of shared application wiring, merge order, production migrations, and Render deployment.

## Required sequence

1. Apply the canonical commerce migrations 20–26 in ledger order.
2. Confirm checkout/hold persists the exact order-to-lot reservation in `research_lot_allocations`.
3. Run `supabase/research-operations-affiliates.sql`.
4. Run `supabase/research-operations-affiliates-verification.sql`.
5. Register the production authorization guards and durable dependencies.
6. Register authenticated client/server routes.
7. Run integrated tests and role-based production smoke tests.

Website 4 fails closed when canonical commerce dependencies or exact allocations are missing. Do not replace the dependency checks with parallel operations order, lot, affiliate, commission, or notification tables.

## Server wiring

Import:

- `registerOperationsApi` from `server/research/operations/routes.ts`;
- `createProductionOperationsDependencies` from `server/research/operations/production-deps.ts`;
- `createProductionOperationsGuards` from `server/research/operations/production-guards.ts`.

Provide the existing verified Supabase authentication seam and Website 2 admin guard. The production builders:

- verify Supabase access tokens and reject recovery sessions;
- resolve logistics roles from `research_operations_staff_roles`;
- resolve affiliate identity through member → canonical partner ownership;
- enforce active member ownership for tracking;
- use canonical partner, attribution, commission, payout, fulfillment, lot-allocation, and notification records;
- call service-role RPCs for atomic fulfillment and professional-account mutations.

Never accept actor identity, authorization role, attribution winner, commission amount, lot allocation, or shipment state from an untrusted request field or header.

## Client wiring

Import the operations page barrel from `client/src/research/pages/operations/index.ts`, then add authenticated routes:

- `/admin/research/operations` → `OperationsCommandCenter`;
- `/operations/mitch` → `MitchPortal`;
- `/research/affiliate` → `AffiliatePortal`;
- `/research/professional-accounts` → `ProfessionalAccounts`;
- the existing member order surface → the owner-scoped tracking response.

Do not place these private portals in public navigation. The transport adapter remains client-only; the server is the authorization boundary.

## Environment names

- `SUPABASE_URL` — required by the existing server Supabase client.
- `SUPABASE_SERVICE_ROLE_KEY` — required server-side; never expose to the browser.
- `SUPABASE_ANON_KEY` — required for server-side access-token verification.
- `RESEARCH_AFFILIATE_BASE_URL` — optional; defaults to `https://xeniostechnology.com/r`.

Configure carrier, payout, email, Telegram, and SMS provider credentials only when the relevant production adapter is approved. Missing external providers must remain truthfully unavailable or retryable.

## Production acceptance

Before merge:

- run focused Website 4 tests;
- run `npm test`;
- run `npm run check`;
- run `npm run build`;
- run the disposable migration dry run and read-only verification;
- inspect the supplied desktop/mobile/state screenshots.

After Render reaches Live:

- confirm deployment ID and deployed Git SHA;
- verify `/api/health`;
- test all four routes with their authorized roles;
- verify a fulfillment transition and refresh persistence;
- verify member tracking ownership and affiliate privacy restrictions;
- sign out/sign in and recheck role denial;
- inspect Render and Supabase logs;
- record production database and smoke evidence in the Command Center.
