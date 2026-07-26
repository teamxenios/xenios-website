# Xenios Private Pre-Launch Shared Contract

Owner: Website 2
Status: LIVE; frozen and available for approved domain adoption
Branch: `integration/prelaunch-foundation`
Reviewed feature head: `df33ee19555c9301c530e513bcc29a6cdcec28bf`
Merged/deployed SHA: `3859e799abb9a7a307b13ca1e8a6a5d252abbc5e`
Render deployment: `dep-d9inc8vaqgkc7395fvr0`
Production migration: `canonical_prelaunch_foundation`

This is the one canonical contract domain sessions must consume after Website 2
freezes and releases it. It does not authorize a parallel preview application,
client-only access flags, public seed data, or domain-specific role systems.

## Roles

The only pre-launch roles are:

- `super_admin`
- `internal_team`
- `product_admin`
- `operations_admin`
- `clinical_admin`
- `approved_internal_reviewer`

Every protected request:

1. verifies the Supabase access token on the server;
2. rejects recovery-purpose sessions;
3. resolves a persisted, active, unexpired role;
4. validates any requested seed namespace against the canonical registry;
5. writes the access decision to append-only audit;
6. runs the protected handler only after the audit succeeds.

Query strings, local storage, hidden URLs, client state, and an unverified
header cannot grant access.

## Data origin

Every domain repository will consume one of:

- `real`
- `internal_seed`

An internal-seed context includes:

- `seedNamespace`
- `seedVersion`
- `resetGroup`
- `releaseEligible: false`

Website 2 created no seed namespace or operational seed record in this
production release. A later reviewed seed-reset unit may create them explicitly after
RLS, repository filtering, analytics exclusion, and external-action isolation
are proven for the affected domain.

## Provider mode

Canonical modes:

- `disabled`
- `capture`
- `live`

An `internal_seed` context can never resolve to `live`. If the configured mode
is `live`, the server returns `capture` for that context. Domain adapters must
therefore record an allowlisted action intent in the canonical capture store
instead of sending email, SMS, Telegram, payment, shipping, laboratory,
pharmacy, prescription, payout, or other external side effects.

The capture record stores an action type, provider label, idempotency key, and
SHA-256 payload digest. It does not store the sensitive payload itself.

## Launch state

Canonical states:

- `internal_build`
- `internal_review`
- `ready_for_real_data`
- `real_data_entered`
- `release_review`
- `public_enabled`
- `paused`
- `disabled`

Production contains only `internal_build` with provider mode `disabled`. It
contains no role or namespace, creates no browser mutation grant, and has no
public policy. Later
readiness/launch-switch work must validate blocking required inputs on the
server before permitting `public_enabled`.

## Routes

- `GET /api/internal/prelaunch/status`
  - requires a verified persisted pre-launch role;
  - optional `X-Xenios-Seed-Namespace` selects only an already registered active
    namespace;
  - returns role names, canonical data context, effective provider mode, and
    launch status;
  - returns no environment values or private operational data.
- `GET /api/admin/research/prelaunch/roles`
- `POST /api/admin/research/prelaunch/roles`
- `DELETE /api/admin/research/prelaunch/roles/:assignmentId`
  - reuse the current server-verified Supabase administrator boundary;
  - create/revoke auditable role assignments;
  - accept no email-based or browser-supplied authority shortcut.

## Migration

`supabase/research-prelaunch-foundation.sql` creates only:

- `research_prelaunch_settings`
- `research_prelaunch_role_assignments`
- `research_prelaunch_seed_namespaces`
- `research_prelaunch_access_audit`
- `research_prelaunch_external_action_capture`

All five tables use forced RLS and revoke `public`, `anon`, and `authenticated`.
Access audit and external-action capture reject update/delete through a
fixed-search-path trigger. The migration inserts only the canonical disabled
settings row; it inserts no role, seed namespace, user, product, inventory,
financial, partner, clinical, or other operational record.

## Domain adoption rule

Website 2 returned the accepted exact contract SHA to Websites 1, 3, 4, and 5.
Their focused follow-on branches may:

- use these exact roles and states;
- use `PrelaunchDataContext` in production repository queries;
- filter real and internal-seed records at the repository/database boundary;
- route external actions through disabled/capture/live adapters;
- add domain readiness rules and required inputs.

They must not modify this contract independently or seed production data before
Website 2 approves the domain isolation/reset proof. Website 6 verifies route
authorization, seed/real separation, provider capture, reset safety, mobile,
accessibility, and public fail-closed behavior.
