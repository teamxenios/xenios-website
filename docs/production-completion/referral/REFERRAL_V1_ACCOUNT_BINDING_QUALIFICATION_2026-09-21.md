# Referral V1 first-valid account binding qualification — 2026-09-21

Status: locally implemented and rehearsed; not applied to any managed database,
not deployed, and not authorized for production activation.

## Qualified boundary

- A guest capture stores only the keyed visitor subject hash and canonical link/
  partner references. A later valid recommendation cannot replace the first valid
  touch; the caller receives `conflictPreserved` while the first evidence remains.
- A verified Research member binds at most once under
  `auth:<canonical Supabase Auth user UUID>`. A later device/touch cannot replace
  the winner and receives `conflictPreserved`. The original binding row is never
  updated, including after an admin transfer.
- An admin transfer is an append-only immutable event. The guarded server route
  supplies the verified admin subject and only accepts account Auth UUID, expected
  revision, target link UUID, a closed reason, a hashed authorization reference,
  and an idempotency key. SQL derives the target partner, assigns the effective
  instant, rechecks eligibility/self-referral, and compare-and-swaps the revision.
  Stale revisions and attempted backdating are refused.
- Admin lifecycle `bindings` is the effective/current revision; `touchId` and
  `boundAt` still identify the first immutable capture, and `transfers` provides
  the append-only chain. `correctionsSupported:false` means arbitrary/backdated
  mutation remains forbidden; the response separately declares
  `transfersSupported:true` and `transferPolicy:"future_only"`. No transfer UI or
  production activation is implied.
- Authorized admin projections omit the authorization-reference hash and actor.
  Browser/public surfaces never receive a partner UUID as an ownership choice,
  visitor hash, customer identity, commission/hold rate, or health fact.
- The rate-free Early Access seam accepts only a guard-verified Auth UUID. It
  derives the effective Referral V1 binding, owned canonical Early Access customer,
  and signed commission schedule on the server. The proposed writer input contains
  only opaque customer/binding provenance plus schedule program/version/hash; it
  has no rate or hold field and is not mounted to the predecessor rate-bearing
  writer.

## Exact reviewed candidate order

For a target where the read-only preflight proves Referral V1 is absent and the
canonical predecessor shapes match, the reviewed order is:

1. `20260904_research_partner_referral_v1_precheck.sql` — read-only inspection.
2. `20260904_research_partner_referral_v1.sql` — atomic foundational candidate,
   including first-valid binding and append-only transfer authority.
3. `20260904_research_partner_referral_v1_lineage.sql` — service-only account
   lineage read, if its optional canonical sources are part of the rollout.
4. `20260914_research_referral_v1_touch_attribution.sql` — exact guarded dispatcher
   extension for server-side anonymous-touch attribution.
5. `20260904_research_partner_referral_v1_postcheck.sql` plus the service-role
   authority probe — read-only verification.

This is candidate order, not permission to run it. If preflight finds any prior V1
object or dispatcher drift, stop. The foundational candidate deliberately refuses
in-place adoption of an unknown/partial V1 deployment.

## Local qualification evidence

All database work used synthetic records in newly initialized loopback-only,
task-owned PostgreSQL clusters. The portable runtime reported PostgreSQL 18.3
(Ubuntu 18.3-1). No database URL, managed Supabase project, external integration,
or production data was used.

- `npm run check`: passed (`tsc`).
- Focused Referral V1 TypeScript/runtime suite: 6 files, 143 tests passed.
- Foundational candidate disposable PostgreSQL suite: 1 file, 17 tests passed.
- Base + touch-attribution candidate disposable PostgreSQL suite: 1 file,
  12 tests passed.
- Total executed assertions in the non-overlapping focused suites above: 172
  passed, 0 failed, 0 skipped.

The database rehearsal covers concurrent first-valid capture/bind, explicit
conflict preservation, immutable initial rows, future-only transfer timing,
revision CAS, exact replay and conflicting replay, self-referral, target-link
derivation, safe admin projection, RLS/ACL/helper grants, immutable transfer
events, candidate replay refusal, and the exact touch-attribution installer seam.

## Remaining external blockers

1. Current action-specific exact-SHA authority is required before production
   precheck/apply/deploy/configuration. This qualification grants none.
2. The actual target schema/grants/owners must pass the read-only precheck, and
   the reviewed candidates must be registered in the canonical migration DAG.
3. Early Access activation remains blocked on a canonical Auth-to-owned-customer
   directory composition and a reviewed idempotent grant writer that accepts the
   rate-free schedule identity. The existing writer requires a caller-supplied
   `holdBasisPoints` value and must not be used as an adapter for this seam.
4. Signed partner-to-program bindings and the canonical schedule authority must
   be present for the binding effective instant; absence or ambiguity fails closed.
5. The service-role SQL entrypoint records an asserted admin subject but cannot
   independently prove an admin role. The canonical Supabase admin guard must
   remain mandatory at the HTTP boundary.
6. Feature flags/secrets, deployment smoke, target postchecks, rollback readiness,
   and load/abuse qualification remain production-owner work. Local correctness
   evidence is not live-environment evidence.
