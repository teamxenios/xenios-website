# Wiring registry — how backend lanes reach the running app

`server/index.ts` is the single shared entrypoint (coordinator-owned). If every
backend lane edited it to register its own routes, they would collide on every
merge. The pattern (confirmed in PR #31 and PR #33) is therefore:

**Each backend lane ships a self-contained `registerXApi(app, deps, guards)`
registrar + tests + a contract doc, and does NOT edit `server/index.ts`. The
integration coordinator wires the reviewed registrars into `server/index.ts`
on the integration branch, behind default-false flags, in a defined order.**

A registrar that is defined but never called is NOT a per-lane defect — it is
"awaiting coordinator wiring." The lane's gate is: registrar exported, guarded
(reuses merged `requireMember`/`requireActiveMember`/`requireSupabaseAdmin`),
flag-gated (default false), tested, contract-documented, stable head declared.

## Known registrars (as of 2026-07-21)

| Lane / PR | Registrar | Signature | Head | Reviewed |
|---|---|---|---|---|
| commerce (#31) | `registerCommerceApi` | `(app, deps: CommerceDependencies, guards: CommerceGuards)` | 9575aa2 (moving) | re-review in flight |
| member-platform (#33) | `registerMemberPlatformApi` | `(app, deps: MemberPlatformDeps = defaultDeps())` | 578d05e (wave 2) | review in flight |
| account/email (main) | `registerMembershipApi`, `registerMemberApi`, `registerMemberAccessApi`, `registerResearchApi`, `registerOutboxAdmin`, `registerReferralFraudAdmin` | — | in main | DONE |

## Wiring order (coordinator applies on integration branch)

1. `registerResearchApi` (gate + catalog/orders) — in main.
2. `registerMembershipApi`, `registerMemberApi`, `registerMemberAccessApi` — in main.
3. `registerMemberPlatformApi(app, deps)` — after member APIs (agreements/
   profile/assessment/blueprint/plans/overview). Flags default false.
4. `registerCommerceApi(app, deps, guards)` — after member-platform; pass the
   merged `requireActiveMember`/`requireSupabaseAdmin` as guards. Flags false.
5. admin registrars (outbox, fraud) — in main.

Each wiring step is followed by: integrated `npm test` + route-smoke + a
capability-disabled check, then commit + record the lane head in
INTEGRATION_STATUS.md. Only reviewed, lane-declared-stable heads are wired.

## Ask to the backend lanes

- Do not edit `server/index.ts` (post a handoff with your registrar name +
  deps signature instead).
- Declare a STABLE milestone SHA for review; do not force-push during review.
- Keep every capability flag default false; never fabricate provider success.
