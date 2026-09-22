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
- Authenticated assisted-order attribution is account-first and cross-device: the
  route resolves the verified viewer once, passes only the canonical Auth UUID,
  and the server reads `bindingAt({ actorAuthUserId, occurredAt })`. It never
  falls back to, or lets a conflicting cookie replace, the first-valid account
  winner. Guests alone use the sealed touch cookie as provisional attribution.
- A claimed binding no longer inherits later link expiry, revocation, or partner
  suspension. Those are admission or earning rules, not mutable ownership rules:
  `bindingAt` projects the immutable revision effective at the requested instant.
  Self-referral was refused when the initial binding or future-only transfer was
  committed. The candidate preflight refuses orphan member/Auth baselines; database
  triggers lock and validate each new partner identity edge, validate a first Auth
  claim against `auth.users`, and make the established edge immutable (including
  re-key/delete/truncate bypasses) so that proof cannot be invalidated by remapping.
  Authority checks bind those triggers to their exact table/event/column topology
  and fingerprint the evidence, identity, privacy-begin, privacy-finalize, and
  deferred-work guard bodies.
  Downstream commission schedule/partner-state authority decides
  earning eligibility at the same economic-event occurrence; current state can
  never erase an earlier owner during exact replay.
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
  takes an explicit server event occurrence, derives the as-of Referral V1
  revision at that same instant, then resolves the owned canonical Early Access
  customer and signed commission schedule for that occurrence. The proposed
  writer input contains only opaque customer/binding/event provenance plus schedule
  program/version/hash; it has no rate or hold field and is not mounted to the
  predecessor rate-bearing writer.
- Exact idempotent issue, revoke, and transfer replays are resolved from guarded
  durable facts before mutable account/partner eligibility. A closed account can
  retry a committed request, while a changed fingerprint conflicts and a new
  mutation remains ineligible.
- Verified privacy deletion is fail-closed and transaction-scoped. A reviewed
  BYPASSRLS owner prepares the exact member's Referral V1 row IDs, deletes the
  exact partner/member identities, and finalizes in the same transaction. A
  deferred trigger rolls back an unfinished flow; browser/service roles cannot
  execute the helpers or read their work/audit tables. Directional selection
  preserves unrelated partners' links and visitors, while the exact claimed
  customer touch is removed. An exact canonical legacy binding whose account or
  partner is the deletion subject is removed through its own labeled work set;
  unrelated legacy bindings remain. Other legacy referral rows block identity
  deletion until handled through their existing owner path.
  A relation lock and canonical identity recheck serialize future legacy writers
  across deletion. If the subject acted as admin on an unrelated transfer, the
  helper refuses rather than destroying that customer's lineage; counsel-approved
  redaction/preservation guidance remains an external prerequisite for that case.
  The resulting cleanup event is only a Referral/identity-slice audit and never
  claims that the full privacy-policy deletion or Auth deletion completed.

## Exact reviewed candidate order

For a target where the read-only preflight proves Referral V1 is absent and the
canonical predecessor shapes match, the reviewed order is:

1. `20260904_research_partner_referral_v1_precheck.sql` — read-only inspection.
2. `20260904_research_partner_referral_v1.sql` — atomic foundational candidate,
   including first-valid binding and append-only transfer authority.
3. `20260904_research_partner_referral_v1_lineage.sql` — service-only account
   lineage read, if its optional canonical sources are part of the rollout.
4. `20260914_research_referral_v1_touch_attribution.sql` — exact guarded dispatcher
   extension for server-side guest-touch attribution and authenticated self-check.
5. `20260904_research_partner_referral_v1_postcheck.sql` plus the service-role
   authority probe — read-only verification of both transfer and touch operations.

The base alone advertises only
`gen2_referral_v1_transfer_base_20260921`. Application readiness requires the
complete `gen2_referral_v1_transfer_touch_20260921` capability, which the authority
returns only when the exact three-argument touch helper and guarded dispatcher
operation are present. A base-only/downgraded database therefore fails closed.

This is candidate order, not permission to run it. If preflight finds any prior V1
object or dispatcher drift, stop. The foundational candidate deliberately refuses
in-place adoption of an unknown/partial V1 deployment.

## Local qualification evidence

All database work used synthetic records in newly initialized loopback-only,
task-owned PostgreSQL clusters. The portable runtime reported PostgreSQL 18.3
(Ubuntu 18.3-1). No database URL, managed Supabase project, external integration,
or production data was used.

- `npx tsc --noEmit`: passed.
- Focused Referral V1 plus assisted-order caller/runtime suite: 11 files,
  216 tests passed.
- Full base → lineage → touch disposable PostgreSQL chain and read-only final
  postcheck: 2 files, 42 tests passed.
- Total executed assertions in the non-overlapping focused suites above: 258
  passed, 0 failed, 0 skipped.

The database rehearsal covers concurrent first-valid capture/bind, explicit
conflict preservation, immutable initial rows, future-only transfer timing,
revision CAS, exact replay and conflicting replay, self-referral, target-link
derivation, safe admin projection, RLS/ACL/helper grants, immutable transfer
events, pre/post-transfer as-of projection, post-claim link expiry/revocation,
later-suspension historical replay, malformed baseline identity refusal, locked
partner-insert/member-delete serialization, canonical null-to-first-Auth claim,
exact identity-trigger/body drift, immutable partner/member/Auth identity,
same-transaction privacy cleanup/finalization, unfinished-flow rollback,
  unrelated-link/touch and unrelated-legacy-row preservation, exact subject-bound
  legacy binding cleanup, concurrent legacy-writer
serialization, unrelated admin-actor refusal,
authenticated cross-device/conflicting-cookie behavior, base-only readiness
refusal, candidate replay refusal, and the exact touch-attribution installer seam.
It also creates caller-controlled `pg_temp` shadows of catalog relations as
`service_role`; fully qualified `pg_catalog` authority/guard lookups still return
the reviewed capability and deny direct V1 mutation.

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
   be deployed and populated for each event occurrence; absence or ambiguity
   fails closed. Local commission authority code is not managed-state evidence.
5. The service-role SQL entrypoint records an asserted admin subject but cannot
   independently prove an admin role. The canonical Supabase admin guard must
   remain mandatory at the HTTP boundary.
6. Feature flags/secrets, deployment smoke, target postchecks, rollback readiness,
   and load/abuse qualification remain production-owner work. Local correctness
   evidence is not live-environment evidence.
7. Counsel must approve whether and how to redact or preserve an unrelated
   customer's immutable transfer/idempotency audit when the deleting person was
   its admin actor. The candidate refuses this exceptional case and invents no
   retention rule.
