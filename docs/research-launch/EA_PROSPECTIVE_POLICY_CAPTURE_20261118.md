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

`request_policy_snapshots` holds one request UUID, an immutable publication/bundle
FK pair and a DB capture timestamp. The existing immutable request remains the source of
actual agreement acceptance, contact, selections and submitted_at. All three private
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

The genesis bundle must match the settings' environment and policy-label
fields. These fields retain the original activation binding, while subsequent
version choices are authoritative in append-only `policy_capture_publications`.
Genesis selection requires a finite cutoff no earlier than bundle creation.
The original binding cannot be swapped/reset through settings updates, and the
existing workflow setting-pin trigger remains intact. An explicit initial
selection creates one genesis publication atomically; source DDL selects none.

The private, custodian-only `publish_policy_capture_bundle` function now supports
prospective rotation. It locks the same settings row, checks an expected previous
publication and appends a new UUID/revision/bundle/effective boundary. A table
trigger enforces the chain and timing rules even for ordinary direct
custodian INSERTs. Rotations require the same environment, next revision/parent,
strictly increasing effective time no earlier than actual recording or bundle
creation, and no same-bundle no-op. Genesis uses the existing pinned cutoff
atomically with its initial selection, including the DB transaction-start
semantics described below. Recorded time is DB-owned. Publications deny UPDATE, DELETE
and TRUNCATE, enforce RLS/FORCE and grant no application-role access. There is no
new public configuration RPC or browser-selected override.

Retry of a committed publication UUID with the exact original tuple returns
that original publication, even after its effective boundary or disablement.
Conflicting reuse or competing stale parents fail rather than append another
interpretation. The on/off flag remains independent; disabling capture does not
remove the publication history and is not a legal-version remedy.

The capture helper locks settings FOR SHARE and, only when capture is enabled,
performs enabled backend checks. Explicit off remains inert. It validates the
genesis binding, selects the latest publication whose effective time is no later
than the DB submission time, locks its immutable bundle and verifies the saved
request's exact agreement/notice pairs before inserting the snapshot.
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
and snapshot after rotation or disablement; it creates no new notice. A new
submission using obsolete versions after the new boundary is refused. It is
never relabeled as acceptance of the newer documents. A genuinely new visitor
submission accepting the new terms/privacy pairs has a valid path through the
new published bundle. Root must stage that prospective publication with the
actual canonical legal-version release; this source does not publish documents.

This is still a fresh/reapply SQL candidate, not a migration for an installed
8140 predecessor. It explicitly refuses an old snapshot schema without a
publication column rather than backfilling invented history. No managed 8140
installation is claimed here; any such upgrade needs Root's reviewed migration.

Turning capture off is not a complete product rollback while published copy
promises otherwise. Root must coordinate intake/readiness/displayed copy and
the existing workflow/sender cutoffs in any later activation packet. No
production.ts/UI readiness integration is included in this bounded slice.

## Authored PostgreSQL coverage

Seven `pg16It` cases use the established createDurableJourneyFixture, real
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
5. A new bundle with new actually submitted legal pairs keeps new intake working
   after its prospective boundary. Old requests/acceptance/snapshots/notice keys
   and first-attempt body digests stay unchanged; old-version new submissions
   are refused without partial rows. A later synthetic persisted unknown send
   outcome preserves the committed request and truthful unknown projection;
   this is not actual provider/network/inbox evidence.
6. A transaction begun before a rotation boundary retains the matching old
   publication even when insertion/commit follows the boundary; a new transaction
   accepting the new notice version binds to the new publication.
7. Competing publication attempts serialize; stale parents, past boundaries,
   conflicting operation identities, mutation and unauthorized role access fail.
   Exact publication retries survive disablement; no new publication is appended
   while disabled.

Historical source `8140fcc53affc71c07b7f1042f6a3677fd6822ce` passed all six hosted
jobs in run `44375653247`, including its four owned-PG cases. That receipt remains
historical. The rotation successor's seven cases are authored and unrun locally;
they require their own hosted qualification and independent review. This author has not run tests,
typecheck, build, installation, Docker/PG, a browser, an application/worker,
database query, provider or send. Source/static review alone cannot qualify SQL
behavior. Root owns the heavy slot, exact-source execution, independent review,
hosted PG registration, migration generation/manifest and eventual integration.
The existing pg16It opt-in/CI behavior is preserved; a local skip is not a pass.

After allocation, the focused path is:

```text
npm run test -- server/research/assisted-order/request-intent/policy-capture.pg.test.ts
```

Use pinned Node/toolchain, require all seven real PG cases to execute, capture
complete output/process cleanup and exact source SHA, then qualify composed
workflow/notice regressions under Root's separate allocation. No migration file
or timestamp has been invented. Applying this candidate, seeding approved
records, choosing a cutoff or enabling any runtime feature requires Root's
separate reviewed deployment work.
