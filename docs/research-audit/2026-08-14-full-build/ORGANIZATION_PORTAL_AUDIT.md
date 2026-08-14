# Organization portal forensic audit

## Audit coordinates

- **Candidate code basis:** `f3cb2088d36c87561ec58455ccf126341fc9789a`
- **Known live production:** `ROMAN_RELEASE_0_4` at `8c8ce358263a041f13fb270d7034164a66a04896`
- **Audit date:** 2026-08-14
- **Evidence boundary:** static source, route, schema, and test inspection; no authenticated live request or database probe.

## Executive verdict

**P0 — the account-identity server surface is mounted and strongly scoped, but the candidate is not an operable organization portal.** Its client components are not mounted by the audited SPA router, and its production store expects a Pack02 buyer-organization shape that conflicts with the documented production `research_organizations` table used by partner reporting.

The candidate fails closed when those queries do not match, which is safer than leaking or corrupting data. The Pack02 candidate migration is explicitly recorded as unsafe to apply to the existing table and must not be run as written. The platform needs one reconciled organization domain model—or distinct table names where buyer organizations and partner-reporting organizations are semantically different—before the portal is exposed.

## Client reachability

The following portal components exist under `client/src/research/account/`:

- `AccountHome.tsx`
- `AccountSignIn.tsx`
- `OrganizationDashboard.tsx`
- `OrganizationInvitation.tsx`
- `ClaimOrderHistory.tsx`
- `InitialPasswordChange.tsx`
- `api.ts`

The adapter obtains the Supabase browser session and sends the bearer token to nine endpoint helpers. The dashboard presents profile, orders/invoices/tracking, request-again, users, and invitations.

However, the audited candidate has no account route constants, imports, or mounts in `client/src/research/lib/routes.ts` or `client/src/research/section.tsx`. `/research/account/*` is therefore orphaned in this code basis. Uncommitted work in another session is not candidate or live evidence and was deliberately excluded from this audit lane.

## Mounted server surface

`server/index.ts:273-274` registers the Research API and then `registerProductionAccountIdentityApi`. `server/research/account-identity/routes.ts:68-104` mounts nine endpoints covering:

1. account context;
2. claim request;
3. claim confirmation;
4. password-change completion;
5. invitation acceptance;
6. organization dashboard;
7. organization profile update;
8. user invitation;
9. request-again from organization order history.

The earlier Research wall admits only exact method/path combinations and validates canonical UUID-shaped organization identifiers. That admission grants no role or organization authority; every handler must still verify and scope the caller.

## Authorization and tenant isolation

Static authorization is well designed:

- Supabase bearer verification is required;
- recovery-purpose JWTs are rejected;
- verified email is required;
- organization membership is resolved by exact user/organization and active status;
- dashboard projections reject foreign orders/requests;
- profile and invitation actions require owner/admin;
- invitation acceptance requires verified-email match and atomic token-hash consumption;
- request-again requires owner/admin/buyer plus an eligible organization-owned order;
- store queries first establish organization/order ownership before related line/shipment reads.

This is strong source-level evidence, not a live isolation proof.

## P0 schema incompatibility

The documented production bundle defines a partner-reporting table:

`research_organizations(id, name, owner_partner_id, state, created_at)`

The Pack02 candidate instead defines a buyer-organization table under the same name, with fields such as:

`slug, legal_name, display_name, status, purchasing_email`

The release evidence explicitly warns that Pack02 touches a structurally different production table and **must never be applied as written**. Yet `server/research/account-identity/production-store.ts` selects the Pack02-shaped columns. Against the documented production shape, those operations fail and the routes return redacted 503 responses.

This is not a missing-column patch. It is a domain collision:

| Existing domain | Meaning |
|---|---|
| Partner-reporting organization | An organization related to a partner/representative and partner events |
| B2B buyer organization | A purchasing tenant with members, invitations, profile, orders, and request-again |

If these concepts have different ownership, lifecycle, and data-retention rules, they should use distinct canonical tables linked by an explicit relationship—not competing shapes under `research_organizations`.

## Password-change blocker

The production password-evidence dependency in `server/research/account-identity/production-mount.ts` currently returns `null`. A seeded membership with `passwordChangeRequired` therefore cannot prove completion and clear its service gate. This is a hard account lock, not a cosmetic missing page.

Do not work around it with a client flag or by accepting a password-change callback at face value. Evidence must be derived from the canonical Supabase Auth event/session/security state or the requirement must be removed from the seed contract until that proof exists.

## Invitation operations gap

Invitation delivery uses immediate Resend delivery with derived idempotency and deliberately does not persist raw token URLs. The privacy choice is sound, but there is no durable retry/outbox. The dashboard ignores `deliveryAccepted` and reports creation even if the invitation was stored but mail was not accepted.

Operationally, “invitation record created” and “invitation delivered” are different states. The portal must expose that distinction without logging or storing the raw token.

## Tests and proof limits

Good static/unit evidence includes:

- verified-email and recovery-token rejection;
- one-time claim/invitation behavior;
- cross-organization attack denial;
- foreign projection rejection;
- role gates and request-again ownership;
- exact production route mounting;
- Research-wall exactness and lookalike rejection.

Missing evidence includes:

- router reachability in the audited candidate;
- integration against the documented production table shape;
- actual Supabase migration/schema state;
- successful password-change evidence;
- invite-delivery failure/retry behavior;
- live organization smoke with two tenants.

## P0 remediation

1. **Keep the portal fail-closed.** Do not present it as operable and do not apply `20260812_research_account_organizations.sql` as written.
2. **Choose the canonical organization model.** Decide whether partner-reporting and B2B buyer organizations are one aggregate or linked domains. Prefer distinct buyer-organization tables if their semantics differ.
3. **Create an additive reviewed migration.** Preserve every existing partner-organization row and relationship, provide explicit backfill/constraints/RLS/RPC changes, and verify against a production-shaped database.
4. **Map the repository to the reconciled schema.** Remove assumptions about the forbidden Pack02 table shape; keep every query tenant-scoped.
5. **Resolve password-change proof.** Supply server-verifiable canonical evidence or stop requiring it for seeded memberships. Never trust a client assertion.
6. **Mount the client and gateway entry only with backend readiness.** Add exact account routes, role-aware launcher behavior, recovery/error states, sign-out/re-entry, and no client-selected authority.
7. **Add production-shaped end-to-end tests.** Use two organizations to cover cross-tenant reads/writes, invitation email mismatch, delivery failure/retry, request-again ownership, role revocation, and inactive membership.

## P1 completion

- Add a durable, retriable invitation outbox without persisting raw claim URLs.
- Make the UI show created, delivery-pending, delivery-failed, resent, accepted, expired, and revoked states truthfully.
- Provide safe invitation resend and account recovery.
- Reconcile organization requests in the partner portal with the buyer-account domain under one identity and role vocabulary.
- Add audit/admin views for membership, invitation, claim, profile, and request-again events with redacted payloads.

## Release gate

The organization portal may be called production-ready only after the real schema is reconciled, the candidate client routes are mounted, password-change-required users can complete the gate, invitations have truthful delivery state, and a live two-tenant smoke proves that every foreign organization read/write fails on the deployed SHA.
