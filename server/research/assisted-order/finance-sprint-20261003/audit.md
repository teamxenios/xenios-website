# Six read-only finance audits

Audit baseline: `3eaa017fcbd28989c65ffc4bb439a554aa1f3f59`, inherited runtime
`c0e25c73a0d789829ea213e2ee040c68e06f0a75`. These are source findings, not new
executed tests or independent Claude acceptance. Three subagents completed the
six requested topics in two waves before source implementation.

## F1: independent manual evidence and provisioning

`server/index.ts` supplies a null manual evidence authority. `finance.ts`
refuses both observation and verification when it is absent. Its authority
interface returns only a verified observation time; exact matching and genuine
source authentication are obligations of the missing adapter. Existing SQL
grants and immutable evidence claims enforce consistency, not authenticity of a
bank fact. Test fixture grants are not operational provisioning.

F1 remains OPEN. A pure receipt validator would not close it. A meaningful next
source slice needs empty/default-off source-scoped admission and grants,
immutable independently sourced receipts, exact observation binding, replay and
revocation rules, and a no-apply provisioning plan. Founder inputs are the real
source/workflow, finality semantics and scoped provisioning/revocation procedure.
No credentials, bank details or raw evidence belong in the corpus.

## Refund, void, dispute and chargeback

The mounted financial disposition only supports a positively evidenced
`never_received` cancellation. M90 prohibits using it after paid history or
verification. ADP journal refund/dispute events are durable observations marked
unsupported; M94 holds current fulfillment after they change the graph.

The dormant `payment/service.ts` refund method must not be mounted as a shortcut:
it turns a partial refund terminal and treats subsequent refunds as replay. The
separate commerce refund candidate targets another authority and Stripe IDs.

The next bounded source slice is confirmed provider-refund accounting derived
from an existing settlement and authenticated journal adjustment. It needs a
separate scoped grant/policy, source/payment/adjustment deduplication, serialized
aggregate limits, a captured/refunded/remaining-balance projection, and immutable
original verification/outbox preservation. Refund initiation, manual refunds,
voids and dispute resolution remain distinct. No fulfillment release should be
inferred from accounting alone.

## ADP-G1: exact risk attribution

M91 resolves event targets through claimed attempt metadata. A later event for
an already bound provider payment can therefore remain `unknown_attempt` if
metadata is missing. M94 correctly narrows the hold to its source, but unrelated
orders using that source still inherit it.

The current candidate uses a preexisting write-once payment binding and its
durable bound create result to derive risk attribution. Original event bytes
and classification remain unchanged. Attributed risk still holds its exact
target. Missing/conflicting session, source, lineage or chronology does not
establish attribution. No caller-selected request or money amount is authority.

A second trap requires coverage: a later fully populated event otherwise sees
the original null-target row and becomes `payment_identity_conflict`, spreading
source quarantine again. Any effective-target lookup must recognize only a
validated attribution receipt while retaining the target hold. Truly early
events before binding remain unresolved. This is PARTIAL G1, not all quarantine
resolution or settlement reconciliation.

## ADP-G2: retirement and replacement

Attempts are immutable, held, and unique per request. Reserve replays the same
attempt; lease expiry only permits same-key retry inside its original guarantee.
Expiry does not prove absence of provider effects.

A safe next slice can retire an unused reservation with no durable dispatch
claim or associated evidence. Replacement then requires coordinated active
attempt selection, reserve idempotency, create admission, uncertainty and graph
changes. Dropping request uniqueness alone is unsafe because settlement assumes
one attempt. G2 remains OPEN.

## ADP-G3/G4: recovery and later facts

A transport timeout followed by the exact bound response for the same issued
claim retains both facts. Current settlement rejects every historical non-bound
result indefinitely. A separate immutable recovery receipt could acknowledge
only that exact `transport_uncertain` result after validating the later binding.
`invalid_response` is not interchangeable: current normalization discards identity
for terminal readback states, so it may conceal consequential financial facts.

Successful readback after settlement also changes the full stored graph and
removes current fulfillment eligibility. The original settlement cannot simply
be overwritten. A narrow future acknowledgment may cover exact-bound late
pending/authorized facts whose authenticated occurrence predates the capture,
with exact scope/session/quote/economics and no adjustment. Captures, refunds,
disputes, failures, cancellations, unknowns and conflicts need separate rules.
New unacknowledged evidence must restore the hold. G3/G4 remain OPEN for complete
lifecycle support; their current conservative containment is preserved.

## LENS-01: preservation and rollout

The corrected pre80 census includes paid notices, reserved verification keys,
malformed envelopes and every delivery state. Unchanged M88 directly checks the
original outbox, so an additive sidecar alone cannot clear its refusal. Creating
the binding column to enter a different branch would be a predicate bypass.

A preservation-only candidate can snapshot immutable metadata/fingerprints for
the canonical outbox rows and delivery attempts, guard them from claim/retry/
change/deletion, refuse active processing claims, and preserve the preflight
NO_GO. It is not a second queue or financial verification. A separately reviewed
installation successor must later use those receipts. Application requires an
exact target/inventory, founder preservation disposition, worker/writer shutdown
scope and exact managed authority. Detection remains PARTIAL; adoption is OPEN.

## SQL, idempotency and race discipline

M94's canonical file SHA256 is
`91a20f681038a5e845137feb6556c4041b1645f6b2c8f9122bc7c9e85280f477`.
Its installer-definition digest, used by a successor seal, is separately
`5302be3131cca3dc97bc9d9a9bb40b0f8addab975aaa76c9b74b68343921d349`.
They must not be confused. Preserve predecessor function OIDs, exact graph/ACL
validation, forced RLS, private helpers, append-only facts and atomic resealing.

Financial operations lock request before the provider fence. An attribution
target is first derived from immutable witnesses, then locked and revalidated
after fence acquisition. Do not lock another request after the fence. Require
READ COMMITTED and refuse stale stronger-isolation snapshots.

Race proof must hold a transaction until the peer is observed waiting on its
actual backend PID via `pg_blocking_pids`, then release explicitly. A fixed sleep
or elapsed duration is not proof of a race. Existing proof files are preserved.
The shared local host is currently unqualified; timing-sensitive final evidence
must await a quiet host or a separately provisioned isolated machine.
