# HL-12 ADP03 governed provider capture settlement

Status: source checkpoint pushed; comprehensive qualification in progress.
Not a final frozen candidate, independently accepted successor or release.
No managed action is authorized by this record.

Current source checkpoint: `2f0a975c1e051e7f23ccd3a9d5492431b8df1cdd`.
Tree: `55c15891b07be438a933d025a7381dd7f90a04e2`.
Test-only and release-control commits: pending. Do not borrow ADP02's results.

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
- Final composed SQL, affected checks, typecheck, build and aggregate: pending.
  No passing result is inferred.

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
Managed roles, grants, RLS, PostgREST, history, secrets, isolated outbox and
rollback still need separate exact target qualification and fresh authority.

Production/staging mutated: no. Deployment, real email, money, procurement,
clinical actions, account grants and price release: none.
