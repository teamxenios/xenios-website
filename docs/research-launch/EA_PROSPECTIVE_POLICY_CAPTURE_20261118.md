# Prospective request policy capture prerequisite

Task `EA-PROSPECTIVE-POLICY-CAPTURE-20261118`.
Existing source owner: `codex-factory-assurance-v01-20261118`.
Base: `1eeb8f32b79490de901252d4de7ec4f8e90a6faa` (Root candidate #513).
Scope: exactly this document, the new SQL candidate and its new owned-PG test.

## Authority

Samuel already approved the two scoped policies in KAN-149/13461, linked by
KAN-225/13462. The approved Root document hash is
`3ee9afedecfb03dfa01cc9d0bdfe046e26b554bae61cc3b31d7dcfa91a1cc52b`.
Its historical proposed banner remains part of the approved bytes. This source
does not ask for approval again or insert those records into a database.

This is design A only: an immutable prospective policy-capture prerequisite.
It is not policy activation, a registered/applied migration, new customer copy,
legal acceptance by itself, a mail-route eligibility decision, a closure or
conversion clock, a purge/eraser, or proof of live configuration. Existing
qualified planner #507 and terminal-clock #510 are not changed or duplicated.

## Private records and server selection

`supabase/candidates/request_intent_policy_capture.sql` depends on the canonical
request candidate plus workflow87. It creates no new public RPC or projection.

`policy_bundles` holds the two policy IDs/versions, record references and exact
document hashes, a shared approval reference/time, the required canonical legal
version pairs, and the customer notice's own agreement pair/document hash. All
are supplied later by the authorized database custodian. Structural validation
does not authenticate these references or prove that the customer saw matching
copy. Root must verify real approval and published-document provenance before
binding anything. No synthetic fixture record is an approved company record.

The notice pair must be one of the bundle's required legal pairs. This reuses
existing agreement acceptance; it does not add a browser policy selector or an
invented checkbox for an internal business policy. Required pairs are bounded,
unique by kind and exclude the literal internal form-acknowledgment prefix.
Customer agreements must match exactly after excluding only that literal
prefix, including rejecting duplicate or extra canonical pairs. The source does
not use SQL LIKE wildcards to recognize that prefix.

`request_policy_snapshots` holds one request UUID, one immutable bundle FK and
a DB capture timestamp. The existing immutable request remains the source of
actual agreement acceptance, contact, selections and submitted_at. Both new
tables use RLS/FORCE, no direct application/service-role privileges and denied
UPDATE/DELETE/TRUNCATE. There is no cascade that erases existing audit history.
No raw contact, product or medical payload is duplicated into the new tables.

## Cutoff, locks and atomicity

The candidate adds only `policy_capture_enabled` (default false) and
`policy_capture_bundle_id` (default null) to existing workflow_settings. It
reuses workflow87's pinned `environment` and `start_at`; there is no competing
cutoff clock. Capture may be enabled independently of workflow/email switches.
The schema selects no bundle and writes no configuration, approval, cutoff,
role assignment or legacy snapshot.

A selected bundle must match the settings' environment and current policy-label
fields. Those existing label fields bind the actual record references, while
the immutable bundle separately holds the policy's version. Selection requires
a finite cutoff no earlier than bundle creation. Once selected, the bundle,
environment, cutoff and label binding cannot be swapped/reset through ordinary
settings updates. The existing original setting-pin trigger remains intact.
The on/off flag may change; any future policy-version transition needs a new
reviewed prospective procedure. This source does not implement rotation.

The helper locks the singleton settings and selected bundle FOR SHARE, verifies
the saved request's exact agreement/notice binding and inserts the snapshot.
Missing settings, a bad binding or a clock preceding the DB submission time
fails closed. It performs no lookup from browser data, task narrative or an
environment variable. Its execution is private to the existing initializer.

The existing AFTER INSERT workflow initializer is replaced in the candidate
only, adding one helper call before its current disabled-workflow early return.
All original workflow/event/notice behavior after that call remains unchanged.
Only a winning request INSERT invokes it. A request failure, policy mismatch or
later workflow/notice failure rolls back request, capture, audit and events in
the same transaction. No BEFORE INSERT capture runs on a losing conflict, and
no later UPDATE tries to modify the immutable request.

The prospective comparison uses the existing DB-generated requests.created_at,
not the proposed createdAt in RPC input. A transaction that began before the
cutoff remains legacy even if its INSERT/commit happens afterward, consistent
with the existing workflow boundary. Capture time is separate. Existing
requests are never backfilled. Same-attempt replay returns the original receipt
and snapshot even after the feature is disabled; conflict retries cannot
capture a newly selected interpretation or create another notice.

Turning capture off is not a complete product rollback while published copy
promises otherwise. Root must coordinate intake/readiness/displayed copy and
the existing workflow/sender cutoffs in any later activation packet. No
production.ts/UI readiness integration is included in this bounded slice.

## Authored PostgreSQL coverage

Four `pg16It` cases use the established createDurableJourneyFixture, real
canonical create/replay RPC/repository, real workflow87 and notice88, and owned
PG16 only. They accept no host URL or managed database. All bundle, approval,
settings, contact and identities in the tests are explicitly synthetic and
exist only inside the disposable fixture when Root runs it.

1. Default-off installation/reapplication seeds nothing, preserves existing
   requests/settings and never captures legacy replay. New capture also works
   while the workflow/mail flag stays off.
2. Six real insert contenders produce one request/capture/event/notice; lost
   committed reply recovery and reapplication preserve identity/time. Real SQL
   checks exercise pins, RLS/ACL, private helper execution, immutable new records
   and unchanged request/access/workflow audit protections.
3. Unbound notice versions, wrong environment/record reference, missing notice,
   wrong/duplicate/extra agreements and attempted caller policy selection fail
   closed. A fixture-only trigger after the real notice88 intent INSERT proves
   downstream failure rolls the entire canonical transaction back.
4. Persistent owned-PG transactions exercise both settings-versus-insert lock
   orderings, require observed pg_stat_activity lock contention and verify the
   DB submission boundary. The fixture login is ephemeral and confined to that
   owned PG; no host credential is read. Cleanup awaits transactions, pending
   work and pools before removing the fixture.

These are authored tests, not passing receipts. This author has not run tests,
typecheck, build, installation, Docker/PG, a browser, an application/worker,
database query, provider or send. Source/static review alone cannot qualify SQL
behavior. Root owns the heavy slot, exact-source execution, independent review,
hosted PG registration, migration generation/manifest and eventual integration.
The existing pg16It opt-in/CI behavior is preserved; a local skip is not a pass.

After allocation, the focused path is:

```text
npm run test -- server/research/assisted-order/request-intent/policy-capture.pg.test.ts
```

Use pinned Node/toolchain, require all four real PG cases to execute, capture
complete output/process cleanup and exact source SHA, then qualify composed
workflow/notice regressions under Root's separate allocation. No migration file
or timestamp has been invented. Applying this candidate, seeding approved
records, choosing a cutoff or enabling any runtime feature requires Root's
separate reviewed deployment work.
