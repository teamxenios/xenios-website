# Roman Digital existing-auth organization binding

Status: ready as an unapplied, dependent Pack 02 candidate. This lane did not deploy SQL, create or modify a Supabase Auth user, set or request a password, mount account routes, or bind production data.

## Authoritative identity

- Pack 02 base output: `85d3536e489d55041c84ff274181e379c7526732`
- Organization: `Roman Digital`
- Organization id: `e26bc7de-86df-4e70-8e82-964e3671d71c`
- Existing Supabase Auth UID: `20ec822d-8123-4088-ac05-9c8f4b2da784`
- Canonical login email: `info@romanhealthcollective.com`
- Superseded email: `k@romandigital.io`
- Roles: `organization_owner`, `business_buyer`
- Initial credential policy: `password_change_required = true`

The existing Supabase Auth record is the only credential authority. The candidate refuses to proceed unless that exact UID exists, has a confirmed email, and its normalized email exactly matches the canonical address. It never accepts, reads, returns, logs, stores, or creates a password.

The supplied identity is authoritative for the Roman Digital organization binding only. No available evidence identifies that Auth user as Kris, so this lane does not infer or record that association.

## Candidate artifacts

Apply only after the Pack 02 schema candidate in an isolated review database:

1. `supabase/pack02-candidates/20260812_roman_digital_existing_auth_binding.sql`
2. `supabase/pack02-candidates/verify_roman_digital_existing_auth_binding.sql`

The binding candidate updates the existing Roman Digital profile email, revokes the obsolete placeholder/invitations, invokes the audited Pack 02 binding function with the exact existing UID, retains the password-change-required gate, and appends an idempotent `organization_identity_superseded` audit event.

## Order and history isolation

- Canonical commerce orders remain in `research_orders`; organization ownership is immutable metadata keyed by `research_orders.id`.
- Early Access history becomes organization-visible only through the existing verified `customerRef` claim/binding rule.
- Request-again records remain organization-scoped intents and never create or copy an order.
- Dashboard authorization resolves the active organization membership before reading any order, invoice, payment, tracking, or request projection.
- A personal member row does not authorize organization history, and an unrelated organization membership cannot authorize Roman Digital history.
- Quantities 1 through 50 are ordinary. Pack 02 accepts and displays 21 and 50, rejects a superseded quantity-only manual-review projection, and preserves real non-quantity review reasons.

## Promotion gates

The Pack 02 composition/recreation gate is discharged by `PACK02_DEPLOYMENT_GATE_RESOLVED.json` against actual fusion base `3ec17ef4e42b8f49643b0168dfd762d982999513`; no fictional or future tag is a prerequisite for this candidate. The separate database promotion gate remains: promote both SQL candidates through the reviewed migration DAG, rehearse applying them twice in an isolated database containing the exact Auth fixture, run both verification scripts, review service-role grants and RLS, and independently inspect the immutable binding events. Production application and route mounting remain outside this lane.
