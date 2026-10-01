# HL-12 ADP03 governed provider capture settlement

Status: implementation in progress. Not a frozen candidate, independently
accepted successor or release. No managed action is authorized by this record.

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
- Effective local SQL, composed HTTP/SQL, final focused checks, typecheck,
  build and aggregate: pending. No passing result is inferred.

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
