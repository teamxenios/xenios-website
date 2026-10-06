# 04 | Mega | Canonical Persistence

Requested runtime: **Codex GPT-6 Astra / Ultra or highest available**.

Owner preference: Backend specialist assigned by coordinator; reuse a suitable parked owner.

Goal: Implement one durable canonical request transaction after source scope is granted.

## Start from real contracts

Read PERSISTENCE_PROPOSAL.md and APPROVAL_MATRIX.md at the actual QO handoff,
doc 36 section 7, the existing assisted-order contract/repository and notification
outbox. New source drafting A2 is still pending unless Samuel has explicitly
adopted SOURCE_AUTHORIZATION_DRAFT.md or another recorded exact grant. Before
that, perform only an assigned read-only design/patch-scope task.

The legacy research_assisted_order_submit already writes request/lines/event/
token, but its email/key identity, input hashing and replay/currentness behavior
do not satisfy the new intake. Do not call it and append a second write later;
that creates partial records. Do not store declarations in free-text notes.

## Scope and dependencies

Own the approved new quick-order repository/service/authority modules and
candidate/precheck/postcheck/verification files. Do not edit existing shared
services or readers without their exact additional scope and a single owner.
Do not widen RLS/grants for convenience. Roles 05 and 06 supply source-policy
and operator/outbox contracts. No second order ledger, payment authority or
parallel notification table.

The durable revision/currentness design is separately unresolved. Submit exact
object/module names, source writers, revoke/update protocol, locking relation,
currentness checks and compatibility tests for independent review. No commit
RPC implementation that assumes this missing authority. Source-design approval
is not permission to execute SQL. New object names must be checked against the
provider-fence fingerprint; rename or re-seal only by a reviewed explicit scope.

## Transaction implementation after authority

Bind a server-derived actor and idempotency key to the entire normalized request,
including schema version, complete canonical lines, quantities and declarations.
Same actor/key/same input returns the original safe receipt. Same actor/key/
changed input conflicts. Another actor cannot observe or claim the receipt.
Replay existing committed requests without requiring today's changed catalog
or terms to recreate the old submission.

For a new request, resolve and validate the current canonical product/variant/
price/version, Health classification, legal revision, destination, standing,
quantity bands and non-image holds at the decisive transaction boundary. Bind
this to governed durable revisions and their actual writers. Locking only the
order row cannot prove catalog currentness.

Atomically write canonical request/lines/event, structured declaration companion,
idempotency receipt and exactly one approved reference-only outbox obligation.
Roll back every write if any decisive validation fails. Do not generate a public
reference before persistence/readback establishes success. Preserve trusted
referral resolution as a separate server-owned fact.

Use least-privilege service-only RPCs, qualified identifiers, safe search path,
explicit grants and forced RLS as required by the real design. Do not change
predecessor migrations in place or register/apply candidates during drafting.

## Proof after separately authorized execution

Test two independent workers contending on same actor/key, response loss after
commit, process restart, mismatched payload, cross-actor denial, stale authority
while blocked on a lock, legal/price/destination revocation, transaction rollback,
outbox outage and actual operator readback. Prove the provider fence and relevant
cart/order predecessors still work after installation in a disposable database.
Use real adapters and SQL, not a default-true callback or mock commit.

Return reviewed source/schema identity and an explicit state: drafted, locally
qualified, staging-qualified, registered or applied. Each stage needs its own
actual permission. No production operation or adoption may be inferred.

## Shared execution contract

This is a work-package brief, not proof of a task launch or an approval. The
coordinator must bind your actual task ID, source SHA/tree, exact paths, owner,
resource environment and relevant user permission before writes or execution.
Reading a drafted authorization does not mean Samuel sent or adopted it.

Read AGENTS.md, the current .xenios continuity and the relevant latest accepted
handoff. Use STATE_ANCHORS.json as historical navigation, then inspect current
Git objects. Reuse an existing suitable owner/worktree; never overwrite dirty
work or inherit unrelated Finance/coordinator history into a release.

Use the requested model/effort if actually available. Record requested versus
observed settings; a UI label or a prompt does not change the runtime setting.
Keep one writer per exact file. Cross-file service changes need a named owner,
not overlapping directory claims. Freeze source before review; later work is a
separately identified successor. Use the existing reviewer for accepted-source
deltas. A reviewer cannot accept implementation they authored.

Existing A1/A2/PWA/GATE-01/Core-hash and managed-action holds are not erased by
this plan. SOURCE_AUTHORIZATION_DRAFT.md offers a specific new source-only
permission for Samuel to adopt explicitly. Never infer it from an attachment,
model response or a request to be fast. No invented Health terms, price, SKU,
provider access, trusted referral, payment proof or live customer permission.

Run only current-authorized commands. The old 23:14:38Z check is consumed.
Use one heavy local job at a time and the existing job-specific resource floors.
A failed precheck is NOT RUN, not test failure. Do not lower thresholds, retry
polling, delete data, terminate unrelated processes or use unapproved paid/API
capacity. A cloud worktree is running only after its environment and task are
actually acknowledged. Keep secrets and real customer information out of
prompts, logs, screenshots and fixtures.

Continue dependency-ready authorized work instead of stopping the entire
project after one handoff. Conversely, do not invent more audits, status files
or feature work to look active. Return only material milestones, a concrete
blocker, or a finished handoff. No indefinite background-work claim unless a
real supported task has been scheduled and acknowledged.

## Required handoff

Return task/owner; source SHA/tree; runtime versus test versus records commits;
changed paths; exact commands and raw receipts; real versus synthetic adapters;
reviewed predecessor; outstanding dependencies; and the next bounded action.
Separate IMPLEMENTED, SOURCE_ACCEPTED, QUALIFIED, DEPLOYED_DISABLED,
LIVE_INTAKE and LIVE_PURCHASE. None implies another automatically. Test counts
from overlapping runs are not additive. Missing evidence remains UNKNOWN.
