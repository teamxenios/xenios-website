# Held writer and commit design delta for the original reviewer

**PROPOSED / NOT ACCEPTED / NOT IMPLEMENTED.** Return this document to the same
original reviewer as the doc42 section 5C delta. It authorizes no guard function,
trigger, commit body, runtime edit or execution. Currentness candidates remain
held and the production port still reports false and throws on commit.

The prior 23-relation/global-every-write proposal is withdrawn as an installation
design. The following is the smallest proposed replacement boundary. Its missing
measurements and unresolved writer audit remain explicit prerequisites; source
drafting of the allowed readers does not resolve them.

## Lock ordering and writer scope

1. Require READ COMMITTED. Resolve canonical authentication and server-bound
   actor identity; acquire the actor/key transaction lock. Exact replay precedes
   mutable eligibility evaluation. A changed payload conflicts without retry.
2. Before any head lock, record the applicable epoch and finish **all** canonical
   preflight row locks. Include the member row locked by Referral V1 `bindingAt`,
   relevant partner/link rows, and the exact bound private session row. Keep the
   existing canonical resolver and its authorization; no parallel attribution
   policy. The session's row lock is proposed below, not currently implemented.
3. Only after preflight, acquire the head share lock. Re-read the applicable
   active publication and decision facts in fresh statements; compare epochs.
   Any changed epoch refuses this attempt, with no internal preflight retry.
   After taking the head lock, acquire **no additional source-row locks**.
4. Proposed participating guards are **AFTER ... FOR EACH STATEMENT**, never
   BEFORE. The writer invariant is: every writer locks every source row that an
   intake may share **before its first guarded write**, and does not subsequently
   acquire such a row after obtaining the head lock. This covers multi-statement
   writers and direct DML as well as named RPCs. Merely changing BEFORE to AFTER
   does not prove the invariant for multi-statement transactions.
5. The writer audit must enumerate actual installed helper/FK/trigger lock
   acquisition and every multi-write path. Existing writer bodies cannot be
   amended under this slice. Any incompatible path blocks the future guard set;
   return its exact owner-scoped amendment instead of installing an inversion.
6. Immediately after waits and before canonical insertion, recheck database time
   against price/lot/touch/identity/session effectivity. Existing request, line,
   event, outbox and provider guard ordering remains unchanged. A canonical 23505
   after actor/key locking is a conflict: roll back, no receipt, no retry.

Absent head: a future source-write guard is a no-op. Held head: writers are never
refused merely because intake is held. If a cheap epoch update is retained while
held, its ordinary lock wait must be measured and bounded; “held never blocks
writers” is **not** a claim of zero PostgreSQL lock wait. It must not wait on a
long-running intake gate. An installation decision requires the original reviewer
to accept this distinction and the measured bound.

Two-sided qualification must stage a writer before the intake's head boundary
and another after it for each lock-bearing family, including member, partner,
link and private session. Record every lock, wait, timeout/deadlock outcome and
transaction rollback; do not replace these with a simplified Express fixture.

## Sessions and scoped epochs

Remove `research_private_early_access_sessions` from the proposed trigger
allowlist. Never add a trigger to it or `_nonces`: their existing shape guard
forbids non-internal triggers. Proposed intake preflight instead shares the exact
bound session row before the head lock, with owner/access-role equality, and
rechecks `research_private_early_access_session_active(text,uuid,text)` after
waiting and immediately before insertion. That existing read predicate neither
writes nor slides expiry. A row-level revocation would wait behind the held
session row, making the current intake precede that revocation; this lock-order
and effectivity proposal still requires reviewer disposition and concurrent proof.
No claim is made that a prior remote Supabase Auth check becomes atomic in SQL.

Also remove unconditional epoch advancement for append-only
`research_attribution_touches` and cosmetic product media/content writes.
Historical touch evidence used only as an immutable reference does not make
every landing a catalog invalidation. If future eligibility reads mutable touch
facts, its exact row/time dependency must be included and qualified before use.
The bound-identity path below performs no new guest touch capture.

Proposed epoch scope is **publication-controlled decision facts**, not all DML
on all customers or all products. Catalog/price/required-input/inventory/legal
changes advance the decision epoch only when affecting identities/columns named
by the selected publication; unrelated history, sign-ins and image-only writes
do not. Actor-specific member, standing and referral rows are protected by their
preflight locks and fresh canonical reads. The next design must enumerate the
exact dependency key/column projection and prove that inserts/deletes and a newly
eligible identity cannot bypass invalidation. An unlisted identity fails closed
under positive Health eligibility. The current candidate's `writer_epoch` is
only held-publication metadata; it is not evidence that this scoped protocol
already exists. No scope predicate or guard is authored in this slice.

Actual production write rates and lock-wait/refusal bounds are **UNKNOWN / NOT
MEASURED**. No host or database sample was permitted. Required future evidence:
rates for session exchange, referral touch/capture, member activation, inventory
reservation/release/expiry and product/legal publication; intake refusal rate,
writer latency and lock waits at the observed normal and peak loads. Synthetic
stress inputs must be reported as synthetic, not presented as measured rates.
The reviewer and operational owner must set the acceptable latency/refusal budget
from those measurements. Until then there is no liveness claim and activation
remains held; passing a correctness case cannot substitute for this evidence.

## Standing and canonical attribution

Use the existing durable acceptance authority
`research_early_access_agreements_accepted(text,jsonb)` over
`research_early_access_agreement_acceptances`, keyed by canonical customer
reference plus agreement kind/version. This is the authority wired by
`SupabaseEarlyAccessAgreementGate` in
`server/research/early-access/persistence/commerce-ports.ts`, and consumed through
`wiring.agreementGate` / `wiring.requiredAgreements` in assisted-order production.
Do not create a parallel acceptance table.

The required Health pair must come from the owner-approved, applicable Health
legal artifact bound by the publication, and must match the server's configured
required-pair identity. No actual Health kind/version/content is selected here.
Absent Health applicability, a Research-use-only pair, missing/mismatched
configuration or absent durable acceptance refuses. Both member and Early Access
viewers require a verified canonical customer reference and the actual bound
session hash; member submit capability alone is insufficient.

The exact non-writing durable-binding helper proposed for current binding is
`research_referral_v1_effective_binding_json(text)`, which selects the canonical
binding and latest transfer without performing a bind. Where occurrence-time
semantics are required, use the existing
`research_referral_v1_binding_at_json(text,timestamptz)` through the already
authorized canonical `bindingAt` path; retain its member authorization and
preflight share lock. Do not substitute a current binding for historical event
attribution. This helper choice must be pinned to the reviewed installed source
and caller's canonical account key (`auth:<authUserId>` where that contract
applies), not a customer-controlled string. Unsupported Early Access mapping
remains refused until its existing canonical path is bound explicitly.

The future intake performs **no INSERT, UPDATE, DELETE or TRUNCATE on any
source-write allowlisted relation**. It does not call `bind`, `capture`, transfer,
session exchange, agreement recording or activation to manufacture standing.
Declared code remains evidence; trusted binding, commission and partner status
continue to be separate canonical facts.

## Notification and complete-commit hold

Proposed NOT NULL outbox `event_type` is the existing
`assisted_order.submitted` literal. The distinct fixed template and event key
remain `research.assisted_order.quick_order.submitted.admin.v1` and
`assisted-order:<requestId>:quick-order-submitted:admin`. Channel is email;
initial status pending; financial/provider FKs are null; payload is the closed
three-key reference-only object. Exactly one obligation belongs in the same
transaction as the canonical request/lines/event/companion/receipt.

Recipient is a validated **server-only** argument bound by the future production
adapter to `RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL` / the existing
`adminNotificationEmail` dependency. It is not a browser field, request email,
referral value or SQL-inferred environment setting. Missing/blank/malformed
configuration refuses before committing anything; no default real recipient is
invented. SQL would check the argument's bounded email shape, but that does not
authenticate its configuration provenance; trust remains in the reviewed
server-only adapter and service-role boundary. This contract does not add a
notification send or a commit argument/body implementation.

The reference-only renderer must be independently qualified and deployed before
an obligation can dispatch. Existing malformed-payload retry behavior (doc44
RB-F10) is a separate frozen runtime correction; it is not silently changed by
the new SQL. Canonical no-payment/commission/source/recovery semantics and the
20-to-23-key wrapper contract remain as pushed at `b75325a`.

## Original-reviewer decision requested on this document

Disposition the lock invariant and remaining writer audit, session-lock proposal,
dependency-scoped epoch choice and required measurements, standing/Health pair
source, exact current-versus-historical binding helper and server recipient
source. Any incomplete design stays held. Acceptance of this document would be
only the next source-design gate; it would not grant SQL execution, install,
active publication, real intake, protected acceptance or production release.
