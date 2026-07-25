# Website 4 integration request

Website 4 owns the operations, fulfillment, affiliates, CRM, notifications, and professional-account domain modules. It intentionally does not edit the shared application, server, research, or member-platform wiring owned by the release manager and Website 2.

## Server wiring

Import `registerOperationsApi` from `server/research/operations/routes.ts` in the shared server composition root and provide:

- the existing authenticated actor and member guards;
- an admin guard that derives identity and role from the verified server session;
- durable repositories backed by `supabase/research-operations-affiliates.sql`;
- carrier-label, payout-provider, email, Telegram, SMS, and in-app provider adapters as configured;
- the single notification outbox worker with a lease-safe scheduler.

Never accept actor identity, authorization role, commission amounts, attribution winners, or shipment state directly from an untrusted request body or header.

## Client wiring

Import the operations page barrel from `client/src/research/pages/operations/index.ts` so the shared stylesheet is loaded, then add authenticated routes for:

- `/admin/research/operations` → `OperationsCommandCenter`;
- `/operations/mitch` → `MitchPortal`;
- `/research/affiliate` → `AffiliatePortal`;
- `/research/professional-accounts` → `ProfessionalAccounts`;
- the existing member order page → the owner-scoped tracking response.

The adapter in `client/src/research/adapters/operations.ts` is intentionally transport-only. Server responses remain the authorization boundary.

## Database composition

Compose the additive SQL in `supabase/research-operations-affiliates.sql` into the release-manager-owned production migration sequence. Apply it only after reviewing table-name overlap with Website 2. The file includes role-sensitive RLS, append-only inventory/commission/audit ledgers, transition constraints, idempotency keys, and restricted mutation grants.

## Required configuration

- Reuse the existing signed-link secret policy when constructing `AffiliateService`.
- Configure carrier and payout provider credentials only in server-side deployment secrets.
- Omit unavailable notification providers; the outbox records `provider_unavailable` and retries without leaking customer or clinical data.

## Acceptance after integration

Run `npm test`, `npm run check`, and `npm run build`; exercise one admin queue link, one Mitch fulfillment transition, one owner-scoped tracking request, one affiliate attribution event, and one professional-account application against the integrated authentication and persistence adapters.
