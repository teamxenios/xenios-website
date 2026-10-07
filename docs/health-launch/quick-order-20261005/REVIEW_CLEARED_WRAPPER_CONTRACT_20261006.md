# Reviewed wrapper contract and predecessor amendment

Current correction for original review `59940dcce778d18dcae605172a46f676b9933fcf`,
docs42 §5a and 45, at repair baseline `18bfbcda7b1def56e10ac1b9ffe424bc1034f3cb`.
The earlier fourteen-trigger census was incomplete: the source-derived set is
**nineteen (requests 8, events 7, outbox 4)**. This successor corrects the current
contract; the original `b75325a` contract and receipts remain historical evidence.
No hosted census or execution result is claimed. All 55 reference files are frozen
in `evidence/review-599-repair-bindings-20261007.json`.

The original source-only contract was recorded before wrapper SQL. Its baseline was
source `5fd2e4c74d31562281493013489bb41949979b88`, records
`1595b8df868a0bd3779ae84fb3da3226c9a75902`. Authority remains Samuel's bounded
approval `dc3329bb2cfb3b93d8d054c8bbc77a291df0e671` for packet
`1d4f2c3b3ff2fc0e1bc25495d3076d2bd9a76e99`; coordinator assignment at `f1fc0fa`.
The original reviewer's verdict `ca1c114a083793918b18d017b32509864ee4bcf6`,
documents 41–44, supplies the compatibility dependency only. Its source
acceptance limits, including all unrun tests, remain. No hosted state is asserted.

This document supersedes the historical contract descriptions in
S4_DECODER_CONTRACT_20261006.md, SHARED_INTEGRATION_SOURCE_20261006.md and
PERSISTENCE_PROPOSAL.md only where explicitly stated below. It changes no runtime,
decoder, canonical SQL, grant, migration, manifest or final protected acceptance.

## Closed canonical detail: 20 keys in, 23 keys out

The existing decoder's exact 23-key set is preserved. The unchanged
`research_assisted_order_admin_get(uuid)` supplies the canonical JSON built by
`research_assisted_order_admin_json(uuid)`. That JSON contains exactly these 20:

`requestId`, `publicReference`, `status`, `actorMemberId`, `fullLegalName`, `email`,
`mobilePhone`, `organizationName`, `shippingAddress`, `billingAddress`, `lines`,
`estimatedTotalCents`, `currency`, `generalNotes`, `agreements`,
`affiliateAttributionRef`, `timeline`, `documents`, `createdAt`, `updatedAt`.

For **every** present request, including genuine legacy, the new service-only
`research_health_quick_order_admin_detail(uuid)` wrapper appends exactly:

| Output | Existing canonical row authority |
| --- | --- |
| `source` | `research_assisted_order_requests.source`; require the existing `early_access_manual_order_bridge` value, never fabricate it |
| `declaredAffiliateCode` | `declared_affiliate_code`, preserving its actual nullable value |
| `declaredAffiliateCodeState` | `coalesce(declared_affiliate_code_state, 'not_provided')`; preserve every non-null stored state |

No key is removed from the decoder, no request receives invented declared code,
and the canonical 20-key producer is not replaced. Unexpected canonical keys or
missing keys refuse, so upstream drift cannot be hidden by a permissive merge.
The TypeScript 23-key shape must not be labelled the raw canonical SQL wire shape.
`affiliateAttributionRef` remains canonical trusted attribution; declared code and
submission review state establish no partner trust, commission or payment.

## Timestamps and immutable projection mapping

For future Quick Order commits, the server's `receivedAt` is an exact UTC ISO
millisecond instant. Canonical request `created_at`, submitted event `occurred_at`,
companion receipt time and intake `confirmedAt` must all equal that instant.
The commit body is **HELD / NOT IMPLEMENTED** in this slice.

Postgres JSON can render `2026-10-06T12:00:00+00:00`, `.123+00:00`, or additional
fractional digits. For Quick Order identity timestamps, the wrapper first requires
the stored instant to equal `date_trunc('milliseconds', instant)`, then renders
UTC with `YYYY-MM-DD"T"HH24:MI:SS.MS"Z"`. Zero-valued trailing microseconds are
lossless; nonzero sub-millisecond digits **refuse**, rather than silently rounding
or truncating evidence into apparent agreement. The three identity timestamps
must agree before rendering. Genuine legacy retains the canonical timestamp JSON
unchanged; its decoder branch does not require the Quick Order timestamp form.

Outbox observation timestamps and the observation clock are presentation fields,
not identity bindings. They may be truncated to milliseconds for the existing
closed decoder; that loses less than one millisecond and is explicitly not a
chronology, freshness, delivery or acknowledgment claim. Underlying timestamps
remain unchanged. Canonical timeline/updatedAt retain their existing semantics.

The immutable attribution snapshot is `attribution-v1`, not the 12-key intake.
The producer and wrapper bind this complete mapping:

| `quick-order-v1` field | Source / transformation |
| --- | --- |
| `schemaVersion` | literal `quick-order-v1`; validate snapshot version `attribution-v1` first |
| `source` | snapshot `source` from normalized input referral kind |
| `sourceDetail` | snapshot `sourceDetail`, already normalized; no truncation |
| `declaredCode` | snapshot `declaredAffiliateCode`, empty string to null; preserve full 1–64-character raw declared evidence |
| `affiliationKind` | snapshot `affiliation.kind` |
| `affiliationDetail` | snapshot `affiliation.detail` |
| `confirmedByCustomer` | snapshot true, derived from validated input `referral.confirmed` |
| `confirmedAt` | server snapshot `receivedAt`, identical to the bound identity timestamps |
| `requestAcknowledged` | normalized input `requestAcknowledged === true`; not invented from snapshot version |
| `reviewState` | snapshot `reviewState`: direct/no-code is `direct_no_referrer`, otherwise `captured_unmatched`; verify against source/code |
| `commissionState` | snapshot `not_authorized`; no subsequent commission inference |
| `estimate` | computed canonical line estimate `{knownSubtotalCents, estimateComplete, currency}`; omit only core's display-only `excludes` |

Every snapshot field is accounted for: its version is validated and translated;
its nested affiliation is flattened; receivedAt is renamed; all remaining fields
are preserved. Contact, actor/key, agreements and item identities/quantities stay
in the full normalized input hash and their canonical request/line/evidence
bindings, not in this admin declaration projection. Request/age/referral
acknowledgments are validated separately; they are not legal standing.
The legacy M75 declared-code representation is independently validated, may differ
from the raw declaration and may be null; never truncate the raw declaration to
fit M75. Trusted attribution uses its existing canonical reference separately.

Future SQL computes `line_estimate_cents = unit_price_cents * quantity` using
integer-safe arithmetic; request-pricing lines retain null prices. Persist each
line's positive Health classification decision with its authority/source version
in companion evidence, bound by product/variant and input hash. Existing canonical
line constraints remain unchanged. The current closed line/intake decoder has no
classification-display field: surfacing those new facts requires a separately
reviewed projection amendment before operational readback, not an extra wire key
silently added here. The governed revision supplies bands; Samuel's Health
100-versus-50 decision remains open. A canonical 23505 after the actor/key lock is
a conflict: no retry, fabricated receipt or partial success. These commit proofs
are held, not implemented by creating a companion table.

## Evidence joins, replay and cutover

Genuine legacy means the submitted-event marker is absent **and** companion
enrichment is absent, with explicit `submittedEvent: null` and `enrichment: null`.
Inspect the submitted event independently of the companion. A Quick Order marker,
companion, receipt or outbox obligation missing its peer is corruption and refuses.
Discovery counts/selects only `status = 'submitted'` events with the exact closed
`intakeKind`/`payloadHash` key set. A separate refusal recognizes a submitted
event carrying either marker key with a malformed/partial/extra-key shape, so it
cannot fall through as legacy. Closed markers still require their exact values
and consistent peers. Non-submitted status evidence containing either key is
ordinary canonical evidence and cannot mark a legacy request or block rollback.
Rollback retains/refuses both valid submitted markers and malformed submitted
marker candidates. An absent request alone returns null.
The wrapper's observation is always `observed`; never emit wire `stale`.
`stale` is only the existing post-update service overlay awaiting a fresh read,
unrelated to outbox processing-claim reclamation.

The service-only replay reader accepts the server-bound actor and key hash,
returns only matching safe receipt and payload hash, and mints no token. Current
authentication remains required outside SQL. Wrong actor/key yields no receipt;
same key with changed input is a held commit conflict rule, not reader authority.

All four paths depend on the wrapper: `adminDetail`; `updateStatus` through
`adminDetail`; `createDocumentUpload`; `completeDocumentUpload`. Their customer
read/upload completion and operator read/download paths must be included in
cutover qualification. Precision: `createDocumentDownload` itself currently uses
`getDocument`, audit and the signer, rather than calling `getAdmin`; do not label
it a fifth direct wrapper caller. No release-branch cutover until qualified wrapper
installation under separate action authority. Missing wrapper fails closed with
no legacy fallback. Synthetic test admission is not production Auth evidence.

Canonical source remains `early_access_manual_order_bridge`. Under the already
proposed source contract, Quick Order rows intentionally participate in the
existing canonical reference-plus-email status-recovery flow, subject to its
unchanged canonical owner binding. This records the consequence assessed in
doc42 S-F12; it grants no real intake, new recovery token or bypass.

## Predecessors and exact protection consequences

Historical `evidence/review-cleared-draft-bindings-20261006.json` binds all 46 original
references to current successor bytes plus the four omitted predecessors and
current S4/new-test sources (55 unique paths). Six original shared-patch targets
now have their actual `9118a82` successor hashes, including the UI amendment;
the S4 decoder includes its added RPC constant. The preapproval patch alone is
not the current source identity. All historical SQL remains unchanged.

The current repair uses `evidence/review-599-repair-bindings-20261007.json`:
the same 55 reference paths are pinned at `18bfbcd` and frozen during this repair,
including both previously strengthened readback/notification test files. The ten
SQL/verifier paths and three server composition tests are the only implementation
paths eligible to change. Historical binding bytes are preserved.

Added predecessor bindings:

- `supabase/migrations/20260930230541_research_assisted_order_quote_evidence_corrections.sql`
- `supabase/migrations/20261001024018_research_assisted_order_quote_history_immutability.sql`
- `supabase/research-notification-outbox.sql`
- `supabase/migrations/20260927203000_research_status_recovery.sql`

Future pre/post/reapply/rollback checks assert this exact non-internal trigger
inventory and enabled state, not just name presence. The review abbreviates names;
the actual migration sources below control. `O` means ordinary enabled and `A`
means ENABLE ALWAYS. This is source-derived, not a hosted catalog observation.

| Relation | Exact trigger | State |
| --- | --- | --- |
| `research_assisted_order_requests` | `research_assisted_order_paid_hold` | O |
| same | `hl12_observed_cancel` | O |
| same | `hl12_history_progression` | O |
| same | `aa_hl12_disposition_terminal` | O |
| same | `aaa_adp01_uncertainty` | A |
| same | `adp03_request_identity` | A |
| same | `adp03_evidence_truncate` | A |
| same | `adp03_evidence_immutable` | A |
| `research_assisted_order_events` | `research_assisted_order_events_append_only` | A |
| same | `research_assisted_order_paid_event_evidence` | A |
| same | `hl12_disposition_cancel_event` | O |
| same | `adp03_paid_event` | A |
| same | `adp03_evidence_truncate` | A |
| same | `adp03_evidence_immutable` | A |
| same | `hl12_disposition_no_truncate` | O |
| `research_notification_outbox` | `hl12_payment_effects_outbox_guard` | A |
| same | `hl12_payment_effects_outbox_truncate` | A |
| same | `hl12_disposition_effects_outbox` | O |
| same | `hl12_disposition_effects_truncate` | O |

`20261001085559` enables the request uncertainty guard ALWAYS; `20261001115512`
enables request identity, paid-event, append-only, paid-event-evidence and the two
payment-effects outbox guards ALWAYS. Its lines474–484 create both evidence
triggers ALWAYS on requests and events. `20261001062651` lines373–378 creates
the events no-truncate trigger ordinary; the later inherited ALWAYS promotion
names `observation_corrections`, not events. `20261001160730` fingerprints `tgenabled`
without overriding these states. Do not expand the review's shorthand into
nonexistent trigger names or replace these A states with O.

Also retain exact definitions/ACL/schema checks and the actual provider integrity
RPC before and after install, exact reapply and rollback. FK internal triggers
are excluded by the existing fence; compatibility is still unexecuted.
The companion FK nevertheless takes `ShareRowExclusiveLock` on canonical
requests during installation; dropping it during rollback takes
`AccessExclusiveLock` on canonical requests while removing internal RI triggers.
The candidate/rollback five-second lock timeout bounds the wait and aborts the
whole transaction on failure. Exclusion from the fingerprint is not absence of
locking effects. No lock behavior has been executed here.

Doc41 precision: the protection gate is expected to fail with three new HARD
mismatches (tracking, attribution, PWA), inherited static/GATE-01, the three Core
HARD pairs, and changed seams including App/index. A seam recut would also carry
inherited Access Hub/HL-12 changes. This is recorded reviewer evidence, not a gate
run here. The manifest and successor acceptance remain unchanged. Doc44 RB-F8's
recut recommendation is **not authority**; Samuel expressly excluded it.

Original G1 producer LF blob at `dc119280d881e8fd6066a6be9829e6b2a2fa4005`:
SHA256 `95b5ddf4f9603c07c0a4d1d2031fe242664e17d1063ec575471ee948db2be61d`,
4,209 bytes. Coordinator CRLF copy:
`f692c8970c2a11d0e65f60305d3bf89ba8b1bafb51ba62f9193b3ce2e08abcfc`,
4,309 bytes. Equal after LF normalization; no changed measurement. G1 is
consumed/refused/released, zero tests; no fresh slot or material host change.

## Candidate scope and explicit omissions

The renamed intake candidates use `20261005_research_health_quick_order_intake`
and verifier `research_health_quick_order_local.mjs`. The old A2
`research_assisted_order_quick_order_*` filenames never materialized and are
superseded. Currentness uses `20261006_research_health_quick_order_currentness`
and its named verifier. Only the exact ten paths in the new lease are assigned.
No migration file or manifest registration is added.

In this guardless slice, owner-scoped publish provides callable-surface revision
immutability only (owner DML can still change/delete revisions or reduce epochs)
but retains `held`; it cannot activate an authority. Revoke also holds. Read-current
must remain unavailable while writer guards/commit qualification are absent,
including if somebody manually sets an active head. No active authority seed,
role/credential creation, service-role self-publication or raw table grant.
No writer-guard function, trigger set, commit body or new runtime module is
authored. Those require the separately returned design amendment and the original
reviewer's disposition. Verifiers must visibly report the omitted atomic commit,
writer/concurrency/currentness and liveness proofs as HELD / NOT IMPLEMENTED,
never pass a whole-suite result by omitting them.

Both pending exact patches remain unapplied: provider-journal fixture `8396609b`
and static document headers `8392d243`. Existing shared runtime, decoder and UI
stay frozen. The two integration-test files are now frozen; only the ten
SQL/verifier files and three named server composition tests may change in the
review599 repair. See `HELD_5C_REVIEW_599_DELTA_20261007.md` and
`REVIEW_599_RESIDUAL_MATRIX_20261007.md` for the unresolved design and P3 findings.
The qualification window expired at 2026-10-06T21:43:37Z: G1 consumed/refused,
five unused groups expired, zero available. No fresh resource observation exists.

The Supabase skill was read. Current official [database function security](https://supabase.com/docs/guides/database/functions)
and [RLS/grants documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)
support explicit execute revocation, qualified safe search paths and separate
table-grant/RLS checks. The changelog endpoint was unavailable. Samuel's explicit
no-execution scope overrides query/advisor/migration defaults: none is run.
