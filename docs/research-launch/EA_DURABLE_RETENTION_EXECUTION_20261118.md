# Durable retention execution — source candidate, 2026-11-18

Owner: `codex-ea-customer-notice-concurrency-20261118`.
Task: `EA-DURABLE-RETENTION-EXECUTION-20261118`.
Base: `29d4d23294ec741a03ed9329ff9356e959ea6b7f`.

This increment contains an actual single-request PostgreSQL erasure transaction,
a strict backend adapter, and owned-PG16 tests. It is not installed or scheduled.
No managed database, customer row, provider, mail, credential, or configuration
was changed. Existing immutable guards and canonical create/find RPCs are not
edited. The temporary two-hour entry store is not read or modified.

## Approved policy binding

The business approval already exists: `KAN-149/13461` approves the scoped
root-review2 document SHA256
`3ee9afedecfb03dfa01cc9d0bdfe046e26b554bae61cc3b31d7dcfa91a1cc52b`.
The retention record is `EA-DURABLE-RETENTION-1.0`, version `1.0`,
`KAN-149/13456`. This increment does not ask for policy approval again.

Execution obtains the policy exclusively from the immutable per-request
snapshot, publication and bundle, verifies the exact references/hash and
environment, and rejects missing/legacy snapshots. Approval does not supply a
publication cutoff, canonical lifecycle facts, production bindings or activation.
Both publication effective time and recorded time must precede the request;
publishing a historical cutoff later cannot authorize old request erasure.

The first supported class is an ordinary RUO `research_peptides_materials` /
`request_pricing`, definitively unconverted request with
known open/closed lifecycle, no conversion, no clinical or financial records,
known absence of holds/extensions, and no workflow, notice, quote, order,
support, mail, provider or other dependent record. It requires a complete locked
mapping even when there are no such records. The transaction also rejects new
unknown foreign keys into all three erased tables, changed canonical FK shapes
or cascade actions, and caps access-event erasure at 1,000 rows.
Other dependency classes require a separately reviewed implementation.

The deadline is the earlier of original submission plus 180 elapsed UTC days
and real closure plus 90 elapsed UTC days. Known-open requests use only the
submission cap. The database clock is used after locks. Queue/review state,
quotes, views, comments and mail do not establish conversion or restart clocks.

## Finite Root integration dependencies

The existing store has no authoritative closure/order/conversion/hold mapping.
Its request, access-event and policy-snapshot guards reject deletion. Deleting
the request would also remove current create/find deduplication and the parent
of minimal evidence. These are real dependencies, not missing policy approval.

The candidate deliberately does not install either of these fixed functions:

1. `request_intent_private.retention_authority_lock_v1(uuid) returns jsonb`.
   Root's canonical implementation must lock the real lifecycle, order,
   classification, hold, extension and dependency writers **before** the engine
   locks the request. All competing creation/conversion/hold/closure writers
   must follow that same lock order. A request row lock alone does not lock
   non-FK quote, support, outbox or external references. Return exactly:

   ```json
   {"schemaVersion":1,"requestId":"<uuid>","classification":"unconverted",
    "lifecycle":"open","closedAt":null,"conversionKnown":true,
    "converted":false,"clinical":false,"financial":false,"hold":"none",
    "extension":"none","dependenciesKnown":true,
    "dependencyContract":"unconverted-no-dependent-records-v1","writersLocked":true}
   ```

   A closed record instead supplies `lifecycle: "closed"` and the actual
   RFC3339 closure instant. Missing, extra, unknown or ineligible facts refuse
   deletion. An external function must derive these from canonical records;
   caller JSON, a staff assertion or queued/reviewing status is insufficient.

2. `request_intent_private.retention_prepare_erasure_v1(uuid,uuid) returns jsonb`.
   In the same transaction, Root must preserve authentic policy provenance,
   minimal due staff-access/delivery evidence under its approved actual schedule,
   and durable replay suppression honored by canonical create **and** find.
   The suppression lifetime, minimal identifiers and residual/backup handling
   need a reviewed mapping; this candidate invents no tombstone retention term.
   Pending or uncertain outbox/provider states are outside this first class.
   Return exactly after those writes have succeeded:

   ```json
   {"schemaVersion":1,"requestId":"<uuid>","executionId":"<uuid>",
    "accessEvidencePreserved":true,"policyProvenancePreserved":true,
    "replaySuppressed":true}
   ```

   An incomplete receipt raises an error, rolling back preparation and deletion.
   The trusted function's assertions require independent review of its real
   writes and consumers; receipt flags alone are not evidence of implementation.

Root must separately change the shared immutable guard to permit **DELETE
only** on `requests`, `access_events`, and `request_policy_snapshots` when
`retention_delete_authorized(TG_RELID, OLD-request-uuid)` succeeds. UPDATE,
TRUNCATE, other tables, other requests and direct deletions remain denied. The
helper checks a private execution ticket bound to transaction ID and backend
PID. It grants no general bypass and does not trust a session GUC. Existing
guard/trigger source remains unchanged in this increment.

The disabled private settings row must eventually bind independently reviewed
SHA256 values of `pg_get_functiondef` for both fixed functions, the guard, and
all three existing private replay consumers:
`create_or_replay(text,text,text,jsonb)`, `find_attempt(text,text)`, and
`create_with_context(text,text,text,jsonb,jsonb)`. Missing or changed consumers
refuse execution. The approved bindings must identify implementations that
actually honor suppression; copying the current unsuppressed definitions' hashes
is not qualification. Root owns those canonical changes. The private authority
and all replay writers must share the same owner/attempt serialization boundary
before taking the parent lock, so suppression creation cannot race resubmission.
The engine checks those exact definitions and enabled trigger attachments on
each call, requiring one guard on each erased table rather than three in total.
A changed or missing definition blocks. These hashes detect drift;
they do not replace source review or protect against a malicious database owner.
Root binding/schema changes must first disable execution and lock the settings
row; a function-definition digest is not a general DDL serialization mechanism.
No operator enablement instructions or scheduler are supplied here.
The source candidate refuses an installed predecessor settings schema without
the replay-binding columns. Any real predecessor needs a separately reviewed
migration; this fresh/reapply candidate does not invent an applied upgrade.

Both existing staff-notice migrations are a known non-FK dependency. A job keyed
`ea-request-submitted-<request UUID>` **always blocks this first class**:
`pending`, `processing`, `failed_retryable`, `sent`, `delivered`,
`failed_permanent`, and `cancelled`. Terminal jobs are left intact under their
separate evidence/payload schedule; this executor neither deletes them nor
declares their retention satisfied. Root authority must lock the real staff
notice reconciliation/worker boundary as part of its complete graph mapping.
No outbox worker or provider runs in this increment.

The eligible application class is presently empty: pre-capture requests have no
snapshot, workflow-enabled captures have excluded workflow/notice records, and
the first eligible workflow-off captures cannot reach their approved 90–180 day
deadlines immediately. Installing the optional-context cascading FK also
refuses this first graph, even if its table is empty. Neither business approval
nor this source increment makes current application requests eligible.

## Transaction and failure contract

One explicit backend call takes only request UUID and execution UUID. It
performs no scan or batch. It is granted only to `service_role`, rejects an
authenticated user subject, and is default-off. Both new private tables force
RLS, with all direct application-role privileges revoked. The private helpers
are not executable by application roles.

Qualified isolation is PostgreSQL 16 Read Committed. The function is VOLATILE;
after the canonical authority lock, `FOR UPDATE` serializes parent access and
blocks new FK children. The Root authority must separately serialize every
non-FK writer. Configuration and policy rows are locked for the transaction.
Actual preparation, three bounded DELETEs, and ticket removal share one caller
transaction. SQL, permission, serialization and transport failures are not
retried or reclassified as success. A lost response needs reconciliation; the
adapter cannot infer whether the server committed. No execution-log retention
schedule or automatic reconciliation process is invented in this increment.

The candidate refuses unknown FKs, but catalog checks alone cannot discover
arbitrary UUID/text references or provider copies. That is why complete canonical
mapping is a required Root seam and not replaced by a successful FK scan.

PostgreSQL references: [explicit locking](https://www.postgresql.org/docs/16/explicit-locking.html),
[Read Committed](https://www.postgresql.org/docs/16/transaction-iso.html),
[built-in SHA256](https://www.postgresql.org/docs/16/functions-binarystring.html).

## Qualification and remaining work

`execution.test.ts` checks identity-only calls, rejected caller authority,
receipt identity/deadline/count validation, explicit refusals, and no retry.
`execution.pg.test.ts` loads the actual canonical store, workflow, customer
notices, **both staff-notice migrations**, policy capture and this SQL into the
existing owned PG16 fixture. It checks
default-off/privacy, missing bindings, canonical immutable-trigger rollback,
definition drift, unknown/converted/held/clinical/financial/legacy records,
unsupported graphs, actual deadline-limited DELETEs, minimal fixture evidence,
empty tickets, and independent concurrent backend connections observed waiting
on the authoritative writer lock through `pg_blocking_pids`.

### C3 review delta — KAN-225/13534, B1–B3 and N1

The original `46d7db75` source and successful hosted run `44396796312` remain
historical evidence. This successor requires its own hosted qualification and
independent C3 delta review; original success is not transferred to changed SQL.

Twenty separately reported PG executions now include:

| Review | Actual acceptance behavior exercised |
| --- | --- |
| B1 | Restore each unmodified canonical create/find/context definition against the suppression-honoring fixture bindings: execution refuses. After erasure, invoke all three actual public RPCs with original hashes and a fresh proposed request UUID: all refuse, no personal row or new snapshot/request is recreated. |
| B2 | Queue through the real full staff-notice RPC, then test all seven actual outbox statuses separately. Erasure refuses; canonical request/evidence/preparation counts and the entire outbox row stay unchanged. |
| B3 | A historical revision2 publication with unchanged approved retention fields erases once and preserves its exact bundle/publication identity. Separate rotated wrong-hash, wrong-version, recorded-after-request and effective-after-request cases refuse. |
| B3 | Incomplete preparation raises 55000 and rolls back all preparatory writes. A separate case retries the same execution UUID after that failure and erases once. |
| B3 / N1 | More than 1,000 events refuses. Detached snapshot guard plus a duplicate request guard refuses despite three total guards. A future activation time returns not_active. |

The optional-context **function definitions** are extracted unchanged from their
canonical source into the owned fixture; its unsupported cascading table is not
installed for the positive class. Fixture consumers wrap clones of the actual
canonical bodies, take the shared synthetic attempt lock, and consult the
fixture suppression record before delegating. Public RPCs remain the actual
canonical wrappers. This tests both function binding and consumers; it does not
claim the real canonical bodies already honor suppression, or qualify optional
context erasure. Fixtures are never operational bindings.

Positive erasure uses conspicuously named **fixture-only** authority/evidence/
suppression tables and a DELETE-only guard hook in the disposable database.
Historical fixture data is loaded after exact canonical table DDL and before
initial installation of canonical guards; no history trigger is disabled or
replaced. The complete canonical candidate is then installed before execution.
These fixture rows are not a company publication or policy backfill.
No fixture seam is an application implementation. The tests prove actual SQL
DML and rollback under the proposed contract; they cannot qualify the absent
canonical mappings, real create/find suppression, provider/backup retention or
production erasure. The unchanged canonical guard failure is tested first.

No local compiler, Docker, browser or test process was run on the constrained
host. Hosted checks must report actual results for the pushed SHA. Root/C3 must
independently review this source and the finite shared seams; the author cannot
self-approve them. Scheduler and execution stay disabled until separately owned
bindings, owned-PG qualification and operational controls are complete.
