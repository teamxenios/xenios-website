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

`supabase/pack02-candidates/inspect_kris_identity_read_only.sql` is the prepared, read-only operator artifact. An authorized operator can run it against the authoritative Supabase project and review exact matches across Auth metadata, member rows, applications, and Early Access records. It deliberately does not create a user, invite, password, binding, or order. The exact operator decision and tested activation composition are documented in `docs/pack02-kris-account-activation-runbook.md` and implemented, unmounted, in `server/research/account-identity/buyer-activation.ts`.

1. If exactly one existing identity is proven, use the `existing_auth` path with its exact Supabase Auth UID, confirmed canonical email, and active canonical application.
2. If no Auth identity exists after the authoritative query, use the `new_secure_invite` path only with a founder-confirmed email and active canonical application. It rechecks absence and calls the sole Supabase secure-invitation boundary.
3. If multiple candidates are returned, stop for human identity disambiguation. Never guess from a name, organization, or email fragment.
4. Never use the legacy caller-credential claim endpoint for this operator activation, and never request, generate, log, or store a plaintext password.

## Buyer readiness independent of identity lookup

The unmounted Pack 02 account home composes the existing member catalog, cart, product-request, order-history, security, and password-recovery routes only when the authenticated subject also has an active personal member account. An organization membership alone does not unlock personal catalog or history. Roman Digital's dashboard remains limited to Roman Digital-owned orders, requests, invoices, payments, shipments, and tracking.

Recreation status, resolved. The rebase-or-recreate requirement existed because
the Pack 02 lane was built on a base that predated the other lanes. That has now
materially happened: Pack 02 `ca943a6` (adopted on its own lane's authority, with
`1597f22` a clean ancestor) is fused with the authoritative Q50, Buyer Commerce
`6f4c751`, Catalog `e858e893` and the six Pack 04 functional paths onto the common
base `ba9fa0ae`, at fusion candidate `2171dce`. There is no rebase or recreation left
to perform.

What remains is NOT a recreation gate and should not be recorded as one. The tag
`FINAL_EA_FAST_FOLLOW_BASE` still does not exist; it is cut ON this fused SHA as a
release step, so treating its absence as a blocker on the fusion inverts the
dependency. Independent acceptance of the fused candidate is also still
outstanding. Those two gates are named in the release sequence and are tracked
there.
