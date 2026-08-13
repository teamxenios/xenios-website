# Pack 02 Kris identity audit

Status: **authoritative identity not found in the available local evidence**.

This is not a finding that Kris has no Xenios account. The current worktree has no Supabase URL, anon key, or service-role credential, so the production Auth roster and production account rows were not queried. No production system was mutated.

## Evidence inspected

- Current Pack 02 tree and Git history for `Kris`, including member records, organization membership, business-buyer bindings, Early Access identity, invitations, aliases, and seed/admin artifacts.
- Supabase schema and seed artifacts for `auth.users`, `research_members`, `research_applications`, `research_early_access_customers`, Pack 02 organization users, invitations, and binding events.
- Local environment names and `.env*` files for an available Supabase read credential. Only `.env.example` exists and no Supabase environment variable is set.

The only local Pack 02 name match is a synthetic `Kris Lopez` unit-test fixture in `server/research/account-identity/service.test.ts`. It has no authoritative email or Auth UID and must never be promoted, inferred, or treated as Kris's identity. The founder-supplied Roman Digital UID and email identify the Roman Digital binding; nothing in the supplied evidence proves that user is Kris, so Pack 02 does not make that association.

No canonical account-alias table exists in the inspected base. Pack 02's verified `customerRef` claim and auditable organization binding are the supported identity-link mechanisms; a parallel alias or identity system must not be introduced.

## Safe resolution path

`supabase/pack02-candidates/inspect_kris_identity_read_only.sql` is the prepared, read-only operator artifact. An authorized operator can run it against the authoritative Supabase project and review exact matches across Auth metadata, member rows, applications, and Early Access records. It deliberately does not create a user, invite, password, binding, or order.

1. If exactly one existing identity is proven, reuse its exact Supabase Auth UID and verified canonical email through Pack 02.
2. If no existing identity is proven after the authoritative query, use the existing secure member claim or Pack 02 organization invitation/activation flow with a founder-confirmed email.
3. If multiple candidates are returned, stop for human identity disambiguation. Never guess from a name, organization, or email fragment.
4. Never request, generate, log, or store a plaintext password.

## Buyer readiness independent of identity lookup

The unmounted Pack 02 account home composes the existing member catalog, cart, product-request, order-history, security, and password-recovery routes only when the authenticated subject also has an active personal member account. An organization membership alone does not unlock personal catalog or history. Roman Digital's dashboard remains limited to Roman Digital-owned orders, requests, invoices, payments, shipments, and tracking.

This artifact remains `REBASE_OR_RECREATE_REQUIRED` until `FINAL_EA_FAST_FOLLOW_BASE` exists.
