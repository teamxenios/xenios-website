# Section 5C delta after original review599

**RECORDS ONLY — PROPOSED / UNACCEPTED / UNIMPLEMENTED.** This is the single
successor delta to `HELD_WRITER_COMMIT_DESIGN_AMENDMENT_20261006.md` at
`18bfbcda7b1def56e10ac1b9ffe424bc1034f3cb`. Original reviewer
`59940dcce778d18dcae605172a46f676b9933fcf`, doc46, identifies the open conditions.
Samuel's authority remains `dc3329bb2cfb3b93d8d054c8bbc77a291df0e671` for packet
`1d4f2c3b3ff2fc0e1bc25495d3076d2bd9a76e99`; review is not additional authority.
The predecessor document is retained byte-for-byte as historical design. This
delta supersedes its overclaims below. Its own exact LF hash is bound separately
in `evidence/held-5c-review-599-delta-binding-20261007.json` (no self-hash).

No guard function, trigger set, commit RPC, standing helper, recipient helper,
session helper, Health configuration or extra runtime module becomes eligible.
No execution, host measurement or hosted-state claim accompanies this document.

## Conditions retained at design only

Retain AFTER-statement timing, member preflight locks, two-sided concurrency
intent, canonical durable acceptance authority, customer reference and session
requirements for both viewer kinds, sessions/nonces outside the trigger set,
the existing submitted event type, server-only recipient provenance, nonwriting
attribution lookup, the 20-to-23-key wrapper contract, fresh database-time checks
after waits, and rollback/no retry on canonical 23505. These are design choices,
not authored bodies or evidence. Doc46's S-F4 absent/held distinction is accepted
only subject to its measurement condition; all other open conditions stay open.

## B-1: incompatible writer families and owner amendments

The former invariant covered only rows an intake might share. It does not prove
writer-versus-writer liveness. Proposed conservative replacement: **each writer
must acquire its complete ordered source/dependency row-lock set before its first
guarded write and acquire no additional row lock after that write**, including
locks reached through helpers, foreign keys and triggers. Transaction-held head
locks require a complete audit of all multi-statement and direct-DML paths.
This stronger invariant is not yet satisfied or accepted.

| Existing writer / exact source at baseline | Adverse source result | Required future owner amendment; no edit now |
| --- | --- | --- |
| `research_release_inventory_reservations(uuid,uuid,text[],timestamptz,text,text)`, `supabase/migrations/20260727160000_research_inventory_reservation_commands.sql:773`; reservation locks848, lot loop878, lot lock891, lot update924 | Locks one lot, updates it (a future guard takes the head), then locks another. Overlapping releases can deadlock through the head despite locally sorted lot IDs and without any intake. | Inventory owner must propose a new replacement candidate for this exact function that pre-acquires the entire ordered lot/reservation/advisory/helper dependency set before any guarded write, or an explicitly reviewed alternative protocol. No historical migration edit; inventory protection remains held, not silently removed. |
| `research_expire_inventory_reservations(uuid,uuid,text[],timestamptz,text,text)`, same migration1226; reservation locks1301, loop1332, lot lock1345, update1378 | Same incremental lock pattern. | Same inventory owner amendment, covering expiry-versus-release and partially overlapping lot sets. No publication-only substitute is claimed. |
| `research_referral_v1_privacy_begin`, `supabase/candidates/20260904_research_partner_referral_v1.sql:209–339` | Advisory `(9042026,1)`229, binding table SHARE ROW EXCLUSIVE232, member233/partner235 FOR UPDATE; link/touch IDs are collected without row locks. Transfer/binding/touch deletes321–329 precede link deletion331. A future guard can take the head before the later link row lock. | Referral owner must propose an amendment of this exact function that audits and prelocks the complete deletion graph before the first guarded delete, or another reviewed protocol. Include both binding generations, transfer/referral events, touches, links and idempotency dependencies. `privacy_begin`, not `privacy_finalize`, is the deleting function. |

These are unresolved owner-scoped design requests, not granted file leases or
instructions to edit those sources. Do not drop lots, bindings, transfers, partners,
links or touches merely to make the proposed trigger set installable.

Future cases must cover writer-before/intake-after and intake-before/writer-after,
overlapping-lot writer-versus-writer with no intake, and privacy_begin-versus-intake
plus other writers. Capture lock order, waits, timeout/deadlock, rollback and the
result of both transactions. No case is authored or executed in this slice.

## S-F4 and B-4: head transition, epoch scope and liveness

Absent head may mean a guard no-op; a held head must not reject a writer merely
because intake is held. A retained held-head epoch update still serializes writers
on the head until commit. Its wait must be bounded and measured; zero delay is
not claimed. Measurement must include **writer-versus-writer while held with no
intake**, including multi-lot release and privacy cleanup under its table lock,
and writer-versus-intake at observed normal and peak loads. Production write rates,
latency/refusal budgets and results remain UNKNOWN / NOT MEASURED. Synthetic rates
must be labelled synthetic. The original reviewer and operational owner must rule
on admissibility of a separately authorized disposable guard draft for measurement
before any such draft or experiment; this proposal grants neither.

Lazy first head creation leaves an in-flight writer across absent-to-first-publication
able to escape an epoch comparison. A future design must choose an install-seeded
head, a guarded first-publication transition, or fully bound fact identities and
prove that transition. None is selected as implemented or approved here.

The original 23 relations have the following current design disposition. **HELD**
means retained as a candidate dependency, with no authored predicate or enumerable
trigger membership. The table does not silently approve inclusion or exclusion.
Every held relation needs exact dependency keys/changed-column predicates and
INSERT/DELETE/TRUNCATE treatment, newly eligible identity handling and a writer
audit before a guard set is enumerated. One global head versus per-family heads
remains unresolved. Current `writer_epoch` is held publication metadata only.

| Exact relation | Current disposition and missing decision |
| --- | --- |
| `research_products` | HELD; product eligibility/classification projection and writer audit unresolved. |
| `research_product_variants` | HELD; selected-variant dependency keys and changed-column predicate unresolved. |
| `research_product_prices` | HELD; audience, bands and effectivity dependencies unresolved. |
| `research_product_media` | HELD conditional candidate; cosmetic versus decision input predicate unauthored. Not silently removed. |
| `research_product_content` | HELD conditional candidate; content versus decision input predicate unauthored. Not silently removed. |
| `research_required_inputs` | HELD; selected-publication readiness dependencies unresolved. |
| `research_domain_launch_controls` | HELD; domain/publication state dependency unresolved. |
| `research_inventory_lots` | HELD; release/expiry owner amendments above plus allocatability, quantity, recall and effectivity predicate required. |
| `research_lot_quality_documents` | HELD; selected-lot document validity/publication/withdrawal dependency unresolved. |
| `research_lot_quality_tests` | HELD; selected-lot test validity/publication/withdrawal dependency unresolved. |
| `research_members` | HELD; actor standing locks/fresh reads and all activation/billing writer ordering unresolved. |
| `research_early_access_customers` | HELD; canonical actor/customer identity projection and writer audit unresolved. |
| `research_early_access_session_bindings` | HELD; bound-identity changes and canonical writer lock ordering unresolved. |
| `research_early_access_agreement_acceptances` | HELD; approved Health pair and exact acceptance-row dependency unresolved. |
| `research_early_access_referral_grants` | HELD; Early Access canonical mapping and dependency unresolved. |
| `research_private_early_access_sessions` | OUT of trigger proposal due to existing shape guard; alternative raw-hash row lock/recheck below remains unaccepted/unmeasured. |
| `research_early_access_legal_bindings` | HELD; Health applicability/pair and binding predicate unresolved. |
| `research_early_access_shipping_regions` | HELD; destination eligibility/effectivity predicate unresolved. |
| `research_affiliate_customer_bindings` | HELD; privacy_begin owner amendment and current/temporal dependency unresolved. |
| `research_referral_binding_transfer_events` | HELD; privacy_begin deletion and temporal binding dependency unresolved. |
| `research_partners` | HELD; activation/revocation/cleanup dependencies and locks unresolved. |
| `research_partner_links` | HELD; privacy_begin owner amendment, link availability and expiry predicate unresolved. |
| `research_attribution_touches` | HELD conditional candidate; **not append-only** (privacy_begin deletes). Mutable eligibility versus historical reference predicate unresolved. |

`research_private_early_access_nonces` was not one of the 23 and stays OUT; no
trigger is proposed on it. Sessions/nonces shape checks forbid non-internal
triggers. No epoch choice currently proves unguarded mutable facts protected.

## B-2: Health legal configuration is absent and reserved

There is no existing owner-approved Health pair configuration path at baseline.
`server/research/early-access/persistence/production-deps.ts:212–222,336–348,499–505`
forces `requiredAgreements` to the published Research-use pair.
`server/research/health/quick-order/legal.ts:16–24` refuses any different pair.
`approvedHealthAgreementPairs` in Quick Order `production.ts:23` has no non-test
producer. Do not label those paths a working Health authority.

**Exact future scope proposal only, not approved:** a new server-only
`server/research/health/quick-order/health-agreement-config.ts` and adjacent
`health-agreement-config.test.ts`, with changes limited to the existing
`server/research/health/quick-order/production.ts`, `production.test.ts`, `ports.ts`
and `legal.ts` to bind an approved Health artifact/pair to the publication and
future commit argument. All six paths require a separate owner decision before
editing; the new pair producer is an absent proposal, not an existing module.
Any necessary root composition or commit-argument path would need an additional
explicit scope decision. Do not repurpose early-access `requiredAgreements`.

Samuel must choose the actual Health kind/version/content and applicability.
Only that approved, publication-bound pair could be passed to existing
`research_early_access_agreements_accepted(text,jsonb)` over canonical
`research_early_access_agreement_acceptances` (identity-persistence migration450).
Actual rows keyed by verified `(customer_ref, kind, version)` are required for
both viewer kinds. Missing configuration, mismatched publication/pair, Research-only
terms or absent durable acceptance refuse. No parallel acceptance store/helper.

## B-3: raw session identity, privilege and revocation ordering

Proposed future commit arguments carry server-only **raw stored `session_hash`**
(already H(sessionHandle)), canonical `owner_id` and access role after canonical
session resolution, alongside the verified customer reference. This is neither a
browser argument nor the viewer's `earlyAccessSessionHash`, which hashes the hash
again (`assisted-order/express.ts:140–145,163`; private-access-routes855–871;
session repository179–181). Never try to recover the raw hash from that double hash.

Owner provenance exists in adapter configuration: `RESEARCH_EARLY_ACCESS_OWNER_ID`
in early-access persistence `production-deps.ts:105` → adapter514–516 → repository
`sessionOwnerId`:420 → registration756. It is not the customer or Auth-member UUID.
Require exact stored owner/access-role equality; no default or inferred owner.

Proposed inline commit locking (no new helper): SECURITY DEFINER owned by the
sessions-table owner, fully qualified references and the sessions guard's safe
`search_path=pg_catalog` posture. The owner must satisfy the existing guard's
`rolsuper OR rolbypassrls` requirement. Ownership alone cannot bypass forced RLS;
FOR SHARE also requires UPDATE privilege. Sessions SQL264–297 forces RLS with
zero policies and revokes raw-table access, and its function-shape guard671 checks
these definer attributes. Verify hosted table existence, ownership and privileges
under separately authorized prechecks; none is established here. Immediately
refuse **NOT FOUND** after the exact row-lock selection; silent zero-row locking
must never pass. Retain the existing canonical authentication/authorization.

Take the session share lock before the head, recheck existing
`research_private_early_access_session_active(text,uuid,text)` after waits and
immediately before insertion using fresh database time. It is a read, not a
session exchange/expiry slide. If revocation wins first, refusal must follow the
wait. If intake holds the share lock first, the row UPDATE revocation waits and
that intake may precede it. This security ordering is **UNACCEPTED / UNMEASURED**.
An operationally approved numeric maximum hold deadline, statement/lock timeout,
whole-transaction rollback and two-sided revoke-before/revoke-after proof are
prerequisites; no numeric ceiling has been approved and none is invented here.
Remote Supabase Auth validation is not thereby made atomic in this transaction.

## B-5: exact helper calling posture

Proposed choice: the future owner-owned commit definer calls the existing
select-only `research_referral_v1_effective_binding_json(text)` for current
binding, or `research_referral_v1_binding_at_json(text,timestamptz)` where a
reviewed occurrence-time contract applies, only after canonical authorization
and the required member prelock. Verify that its owner actually has EXECUTE;
do not grant either helper to `service_role` (both are explicitly revoked at
Referral V1 candidate1086–1094). No helper body is added. The exact choice per
viewer/temporal semantics and all availability locks still need a call matrix.

Precision: dispatcher `bindingAt` locks the member840; dispatcher `getBinding`
also calls binding/partner availability and locks the partner. Guest touch
attribution locks partner then link. A definer context does not supply those locks
or replace canonical authorization. Use only server-derived `auth:<authUserId>`
where supported; unsupported Early Access mapping refuses and acquires no invented
attribution. No source-table write, bind, capture, transfer, exchange, acceptance
recording or activation may be used to manufacture intake eligibility.

## B-7 and B-8: prerequisites still held

Retain event type `assisted_order.submitted`, fixed Quick Order template/key,
closed reference-only payload and validated server-only `adminNotificationEmail`
from `RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL`. Missing/blank/malformed-recipient
coverage is absent from the frozen notification tests and remains due when the
commit argument is designed. No recipient validator or external send is added.

Currentness revision immutability is **callable-surface only**: owner DML can
change/delete revision rows or decrement epochs. Before any real current-authority
reader, require head-reference foreign keys for all three references, refusal
guards for revision UPDATE/DELETE/TRUNCATE, and epoch monotonicity. Those B-8 bodies
are future preconditions, not authored or eligible under this repair. No active
authority, commit or production behavior is enabled by this delta.
