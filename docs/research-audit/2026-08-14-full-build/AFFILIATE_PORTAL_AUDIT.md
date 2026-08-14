# Affiliate and partner portal forensic audit

## Audit coordinates

- **Candidate code basis:** `f3cb2088d36c87561ec58455ccf126341fc9789a`
- **Known live production:** `ROMAN_RELEASE_0_4` at `8c8ce358263a041f13fb270d7034164a66a04896`
- **Audit date:** 2026-08-14
- **Evidence boundary:** static route, composition, guard, persistence, migration-ledger, and test inspection; no authenticated production smoke or live database probe.

## Executive verdict

**P0 — substantial portal code exists, but the candidate does not expose a complete production-reachable partner journey.** The SPA mounts 17 partner pages. General commerce mounts four partner endpoints. An earlier Research review wall still challenges an ordinary bearer-only member on those endpoints unless the browser also has legacy review access or the broad public override is enabled. Sixteen more tenant-scoped portal endpoints exist in a separate module that explicitly remains unregistered.

The implementation contains good tenant-scope and privacy design, but activation is split across incomplete versions and overlapping referral/affiliate architectures. Do not add another affiliate service, ledger, or role model. First choose one canonical contract, reconcile wall admission and feature flags, and prove the persistence/migration path.

## Route inventory

### Client

`client/src/research/lib/routes.ts:73-90` defines 17 partner routes, lazy imports are in `client/src/research/section.tsx:131-148`, and the SPA mounts them at `client/src/research/section.tsx:323-340`. The typed adapter declares 19 API paths and its unavailable responses intentionally render “being prepared” states.

These routes use the generic loader rather than the member wrapper. That is not an authorization vulnerability by itself because the server must authorize every request, but it makes the first-load experience dependent on the API/wall interaction and does not provide a coherent role-aware portal entry.

### Mounted server endpoints

`server/index.ts:417-421` mounts the commerce API. Its currently mounted partner surface is:

| Method | Path | Candidate behavior |
|---|---|---|
| GET | `/api/research/partner/me` | Member-guarded partner resolution |
| GET | `/api/research/partner/dashboard` | Member-guarded aggregate dashboard |
| POST | `/api/research/partner/apply` | Member-guarded application intake |
| GET | `/api/research/partner/links` | Member-guarded link read |

The handlers in `server/research/commerce/routes.ts:570-627` resolve the partner from guard-attached member identity rather than accepting a caller-supplied partner ID. Production composition becomes stateful only when general commerce is explicitly enabled and its database configuration is present.

### Mounted-but-blocked seam

The Research review wall's bearer allowlist omits `/partner/*` (`server/research/index.ts:382-396`), and its downstream bypass only admits enumerated member-session paths or selected route families (`server/research/index.ts:621-628`). `server/research/member-session-wall.test.ts:391-407` explicitly proves that a bearer token on `/api/research/partner/me` still receives the wall challenge.

Therefore, “registered in Express” is not equivalent to reachable by a newly signed-in partner. The fix must be an exact, reviewed wall admission tied to the canonical member/partner guard—not a broad bypass.

## Complete portal module is prepared but unmounted

`server/research/partners/portal-routes.ts:1-25` says production registration is pending. It enumerates 16 guarded routes at lines 63-80 and uses member identity only from guard context. Its organization/campaign/event request writes are deliberately disabled with `503 capability_disabled`; approved assets and session history are also not durably implemented.

Static isolation in this module is strong:

- partner records are resolved from member identity;
- organization IDs are reduced to owner/representative relations;
- database results are re-filtered to that allowlist;
- event reads first resolve the partner's allowed organizations;
- DTOs expose explicit aggregate/member-safe fields.

Those properties make the module a useful convergence candidate, not a live feature.

## Persistence and operations

The mounted commerce composition has partner/link stores and append-only commission aggregates. However:

- full partner lifecycle and organization repositories remain in-memory because their persisted schemas are not reconciled;
- admin partner review is routed but the production dependency intentionally refuses reviews;
- no durable approved-asset library, session history, or campaign/event/organization request intake is present;
- the application path has no durable outbox/retry/ops-notification proof.

The client application sends `audience` and `channels`, but the mounted server parser retains only role, legal name, and contact email. The UI therefore implies data collection that the current handler drops.

Migration 44 and 59 are recorded as not applied in the repository's migration ledger. This is release evidence, not proof of the live database state; the integrator must inspect the actual Supabase history before activation.

## Flag gap

Affiliate-system and portal flags are defined in `server/research/affiliates/v2/feature-flags.ts`, but the mounted commerce partner routes and prepared partner portal do not have a proven production consumer of that canonical gate. A naïve mount based only on Supabase configuration would be unsafe.

The existing unenforced-flag tripwire scans the affiliate-v2 subtree, so it cannot catch ungated routes in `server/research/partners` or the general commerce module. Activation needs one composition-root gate that combines:

1. canonical member identity;
2. affiliate-system enabled;
3. portal enabled;
4. commerce/database readiness where stateful behavior is required;
5. server-resolved partner status/tenant scope.

## Duplicate architecture register

At least five overlapping systems exist:

| Family | Current role |
|---|---|
| Member referrals | Member-owned referral identity, attribution, and rewards |
| Commerce partners | Partner records, links, dashboard, and commission aggregates |
| Professional affiliate operations | Separate production service code without candidate production composition |
| Affiliate v2 | Policy, flags, and founder-controlled draft economics, largely test/policy scoped |
| Private Early Access referral/commission | Cohort-specific referral capture and held commission behavior |

The Early Access referral field also has no non-test client import on this candidate. Founder-controlled schedule values remain draft/inactive, which is the correct safe state. Historical referral, commission, and payout records must be preserved through any convergence.

## Security and privacy verdict

Positive static evidence:

- mounted handlers derive partner identity from the guarded member;
- prepared portal routes do not accept caller-selected tenant identity;
- organization/event queries are scoped and re-filtered;
- aggregate DTOs avoid unnecessary underlying member/order disclosure;
- forged partner ID behavior is covered by route tests.

Unproven or blocked:

- fresh-browser SPA → wall → member auth → partner resolver;
- flag-off/flag-on behavior across both route families;
- real production-schema compatibility;
- live cross-tenant denial and payout-write denial;
- durable lifecycle notification/retry.

## P0 remediation

1. **Choose one canonical affiliate architecture.** Publish the authoritative partner identity, application lifecycle, link/attribution, commission ledger, payout, and organization relationship contracts. Adapt or retire the other families; do not create a sixth.
2. **Reconcile the prepared portal rather than reimplementing it.** Mount only the selected endpoints behind exact Research-wall admission and the existing canonical member guard.
3. **Enforce one activation gate.** Require explicit affiliate-system + portal flags and the relevant persistence readiness. Expand the unenforced-flag test to cover partner and commerce route modules.
4. **Make apply truthful and durable.** Either persist `audience`/`channels` or remove them from the form; add lifecycle review storage, durable notification/outbox behavior, idempotent retry, and visible delivery/review states.
5. **Reconcile schemas before migrations.** Compare the live database with migration 44/59 and every competing partner/affiliate table before applying anything.
6. **Prove isolation end to end.** Add an authenticated production-shaped integration suite and a fresh-browser smoke covering flags off/on, wrong tenant, inactive partner, review denial, commission mutation denial, and sign-out/re-entry.

## P1 completion

- Implement durable campaign/event/organization request intake or retain explicit disabled copy.
- Add approved assets and session history only after their privacy/retention contract is approved.
- Connect attribution and commission computation only after the founder-controlled schedule is active and versioned.
- Remove dead adapters and the unused Early Access referral field only after durable history and rollback compatibility are protected.
- Expose one role-aware gateway entry that resolves the signed-in user's server-side roles instead of granting partner access from a client-selected portal.

## Release gate

The affiliate portal may be called production-ready only after one real partner can sign in from a clean browser, enter through the role launcher, load tenant-scoped data, submit an application/request with durable operator visibility, and fail every cross-tenant or disabled-economics attempt on the deployed SHA.
