# HL-12 ADP03 governed provider capture settlement

Status: source checkpoint pushed; comprehensive qualification in progress.
Not a final frozen candidate, independently accepted successor or release.
No managed action is authorized by this record.

Current source checkpoint: `2f0a975c1e051e7f23ccd3a9d5492431b8df1cdd`.
Tree: `55c15891b07be438a933d025a7381dd7f90a04e2`.
Final test checkpoint: `c3ab4bdf100fc70765928bfa13c24de5358f0a08` (cumulative
test-only commits `1bb6ca0`, `2259a2e`, `c3ab4bd`).
Pending-source control checkpoint: `2d966b59d0af14e5f4d06571d9caa673fcb0c8b5`;
`applyTwiceVerified` remains false until current complete proof. Final controls
and qualification remain pending. Do not borrow ADP02's results.

## Continuity

- Same branch: `codex/xenios-health-launch-implementation-20260930`.
- Base records: `4ad4bcfe8129b4069b79f3cce91773c894395c51`.
- ADP02 runtime: `27463d764ba01219c67081a3548ffdc3ff7d2b40`.
- ADP02 tree: `467c8556390ff9274a4adda5826eed7ab9603b23`.
- ADP02 final records: `9aa4700f8329f1b22736bd4bd8c3aefc788b0f8d`.
- ADP02 independent handoff: `4ad4bcfe8129b4069b79f3cce91773c894395c51`.
- Task: `HEALTH-HL12-ADP03-GOVERNED-CAPTURE-SETTLEMENT-20261001`.
- CLI-created new source migration:
  `supabase/migrations/20261001115512_research_assisted_order_quote_provider_settlement.sql`.

The ADP02 aggregate remains 19,149 passed, one failed, 85 skipped, exit 1,
no timeout. The strict protection assertion reports two unchanged baseline
mismatches. Its passing local SQL and preflight are separate evidence. That
aggregate does not qualify this unfinished successor. Earlier failures and
skips remain in the ADP02 receipt and are not rewritten here.

## Intended narrow contract

An explicit, server-confirmed admin command names one existing request and
authenticated journal record. The command body is empty. The browser cannot
supply an amount, currency, payment reference, actor grant or verified flag.
A separate source/account/mode-scoped policy and settlement grant are required;
reservation, execution, generic admin and manual-verifier grants do not suffice.

Fresh settlement must bind one full capture to the current accepted immutable
quote and the exact durable ADP02 payment identity. It must reject unsupported,
ambiguous, unbound, stale and adverse facts. It must atomically write canonical
observation, evidence claim, verification, paid event and held canonical outbox
obligation. The capture link is lineage, not a second payment ledger. Partial
graphs must fail at commit. No historic paid label becomes verified by adoption.

F4 recovery keeps its actual admin attribution. The financial transaction leaves
the held obligation; a subsequent atomic completion binds the canonical audit
receipt and releases that obligation. A failed completion must not erase the
financial record or invent that the original transaction never happened.
Recovery must survive actor revocation, process restart and audit-key rotation.
This preserves F4's audit-before-notification-dispatch policy, not a new
audit-before-fulfillment policy. While audit completion is pending, a complete
verified financial graph can remain eligible for the existing separately gated
supplier progression. The payment notification must remain held until its
canonical audit completes. HTTP 503 can mean committed verification with
follow-up pending, never proof that no financial transition happened.

Historical verification and current fulfillment eligibility are different.
The existing customer financial projection stays exactly
`{hasObservation, paymentVerified}`. Later uncertainty must block progression
without rewriting historical verification. An old immutable receipt never
grants present eligibility. Existing supplier and fulfillment checks remain.

Capability parsers support exact old held schema and exact new evidence-scoped
schema revisions, with no optional security fields or permissive fallbacks.
Settlement itself requires only the new authority. Operational source remains
unconditionally null in startup. The flag alone cannot activate card payments.
No provider SDK, credentials, webhook, operational grant or real money is added.

Rollback after actual provider activity requires a new-schema-compatible build
that retains late-event ingress and effects recovery while disabling create and
settlement. Arbitrary older code may fail closed yet stop durable receipt of
late facts. Do not replay older function bodies, down-migrate, delete facts,
clear holds or amend protection baselines as rollback.

## In-progress evidence

- `adp03-effects-repository-initial`: Node 20.19.0/npm 10.8.2, real dataset reader,
  one worker, no file parallelism; 98 tests passed in two files, exit 0,
  1.02 seconds test time. Tested uncommitted source at records `fe54138`.
  This covers strict old/new F4 authority pairs and the controlled fulfillment
  conflict projection, not effective SQL or provider authenticity.
  Log SHA-256:
  `cd090d1218346303da2620dfb5d9e3e97985083a1b84da1c04c7c27a5e74c64d`.
- `adp03-service-unit-run1`: 339 passed, 19 failed, exit 1. New expectations
  omitted the explicit undefined argument in authority RPC mock calls. The
  failed run is retained, not relabeled. Log SHA-256
  `6b25568ac129209f764940f09771b0492cc5ae4e755f5aaec64404831ed27ddf`.
- `adp03-service-unit-run2`: corrected expectations, 358 passed in three files,
  exit 0, 1.36 seconds. Log SHA-256
  `159230969c2280e7757c38395a371c98f934a5e258deb877e14da5c1a2f47192`.
- `adp03-http-initial`: 23 passed, exit 0, 2.14 seconds; mounted protocol
  with synthetic admission, not hosted JWT/SQL qualification. Log SHA-256
  `93a56143679023be5dea3a3a763b330912bde38940fb03076481679860d010be`.
- `adp03-typecheck-initial`: passed, exit 0, 76.909 seconds. This diagnostic
  briefly overlapped the HTTP test above; it is not a serial final preflight.
  All these diagnostics tested uncommitted source and retain dirty-state receipts.
- `adp03-install-smoke1`: disposable PostgreSQL 17.11, exact no-network container
  cleanup confirmed; install/reapply, capability versions, actual full synthetic
  capture, replay, eligibility and populated reapply passed. SQL SHA-256
  `d419da94f92a086b94f4f8c17cefa2077da3a8f315490005c7c086b2282151cf`;
  proof 16.794 seconds, wrapper 17.311 seconds, exit 0. Log SHA-256
  `21ecbdb70ea6bf595a47ed3c3878ca622a4166dc19a3d9a3459c7aa633559989`.
  This smoke is not the comprehensive adversarial/HTTP proof.
  The subsequent source checkpoint adds inspected replica-mode immutability
  hardening. Its migration SHA-256 is
  `1470740bf17a0fbb9a2eeaffe9173712861a17da15d52b5492ca1f28e2c91e6f`;
  it is not the same SQL tested by smoke1. The difference was found by inspection,
  not a claimed reproduced exploit or failing diagnostic run.
- `adp03-sql-local-run1`: failed, exit 1, 104.360 seconds. The wrong-event
  fixture selected a private journal table inside a service-role command and
  received the correct ACL denial (42501), before its intended settlement
  refusal. The fixture now uses the append RPC's returned journal ID within
  the same rolled-back transaction. Runtime and permissions were not changed.
  Two SQL groups completed before failure. Exact disposable cleanup confirmed.
  Log SHA-256:
  `f15976e89cd64cdd9df03c6b9c95480f6fc2c9581a5ec4bfda8e3714f8c5f8ab`.
- `adp03-sql-static-run1`: eight source-contract tests passed, exit 0,
  0.292 seconds test time. This is not effective PostgreSQL evidence.
  Log SHA-256:
  `8531cb8e01aa20c994c2ca99a725d5e646b2e261ad0e132fadb57ae4493b7338`.
- `adp03-sql-local-run2`: failed, exit 1, 188.638 seconds. Eight SQL groups
  and all 11 mounted HTTP groups (154 SQL calls) completed before an incorrect
  fixture assertion: the established manual-verification receipt state is
  `paid`, not ADP03's `verified`. That expectation was corrected without
  changing runtime. Cleanup confirmed. Log SHA-256:
  `74b65f76d659a57014c1933d564478d64d42170c94b3544dd1575da1bd4f267b`.
  A separately inspected reverse-arbitration fixture now uses SQL
  `IS DISTINCT FROM` so a null error detail cannot pass its expected refusal.
  This latter fixture was not reached in run2; it was an inspection correction,
  not a reproduced runtime failure. Run3 is a separate diagnostic.
- Final composed SQL, affected checks, typecheck, build and aggregate: pending.
  No passing result is inferred.

`adp03-sql-local-run3` failed, exit 1, 224.027 seconds. Thirteen SQL groups
and 11 HTTP groups / 154 SQL calls completed before the bare link-only insertion
test received the deferred foreign-key refusal (23503) rather than its expected
custom completeness refusal. It was rejected, not committed. The test will
explicitly force the named completeness constraint, instead of depending on
internal deferred-trigger order. No source change. Exact cleanup confirmed.
Log SHA-256 `2bb0c36a7c219d836254af58e314e0a0f692482e7dc769a7375dd4e5e82ab001`.

Additional-races-only diagnostics are separate from comprehensive proof:

- `adp03-races-smoke1`: failed, exit 1, 78.643 seconds. The cancellation
  contention fixture expected the original bridge's 40001, but the effective
  successor correctly refused with P0001 / `ASSISTED_ORDER_STALE_STATUS`.
  Its expectation was corrected, not runtime. Cleanup confirmed; log SHA-256
  `ff673523654f9ee2f533d0fcd5daac5b86de85b14ed47992b5d0a25b99b763c1`.
- `adp03-races-smoke2`: passed, four groups, 12 actual lock waits, 14 refusals,
  five rollback boundaries; exit 0, 111.849 seconds proof / 112.451 wrapper.
  Exact no-network PostgreSQL 17.11 container removed. Log SHA-256
  `3a5988e1eaa8a48915c9f7dcb3da5f3315d6aab7b1ec4d4e841c15384e4dc6f5`.
  This privately invoked the committed additional-races module only; it does
  not qualify the whole main proof, nor does it replace its failed earlier runs.

Peer inspection found no additional concrete authority defect; it is not
independent Claude acceptance. Proof limits remain explicit: synthetic admin
admission and normalized capture facts; local service-role SQL, not managed
PostgREST/JWT or processor authentication; real lock waits observed through
`wait_event_type = Lock`, without exact blocker/lock-target telemetry. Reverse
financial contention cases acquire the parent lock around an already-denied
competitor; they are not two admissible financial winners. Provider verification
F4 is composed with real SQL/audit recovery; ordinary supplier-progression
notification/audit sinks are synthetic no-ops. Partial-graph tests are synthetic
privileged staged writes plus actual transactional rollback, not an interruption
inside a live provider call.

## Unchanged external and release holds

The real independent manual evidence source and grant workflow remain F1's
operational dependency. Provider authentication, actual replay guarantees,
processor/bank choice and activation are not proven by synthetic tests.
Void/refund/dispute and historical reconciliation remain separate engineering.
Price holds, catalog identity and imagery review remain unchanged. No current
Claude acceptance or new P0/P1/P2 census is claimed.

The protection manifest is not edited. New startup bytes need independent
review and any exact owner amendment; an older approval is not reusable.
Canonical Git blob hash pairs at source `2f0a975` are:

| Protected seam | Pinned baseline | Current source |
| --- | --- | --- |
| `server/index.ts` | `1d6594d6389e2ac67d9af85213854e05387899dfe0102fa577e447565e68c315` | `ba5800e604482af4f1ca56b08c43abd3d1207473a6e213ab99c22113471a4521` |
| `server/research/index.ts` | `b8db03cf7b51b2bd225e4f96c9cf3762f97188a7babcaf89591815c226263070` | `5b9f683b183a095e258908e0e0086888c71b7666b0e384367b1bfde0c4124188` |

The raw CRLF checkout hash for `server/index.ts` is different from its canonical
Git blob hash. Do not substitute the wrapper's raw-byte hash for this reviewed
baseline pair. No owner amendment is implied by recording it.

Managed roles, grants, RLS, PostgREST, history, secrets, isolated outbox and
rollback still need separate exact target qualification and fresh authority.

Production/staging mutated: no. Deployment, real email, money, procurement,
clinical actions, account grants and price release: none.
