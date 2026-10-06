# Quick Order supplemental source scope (coordinator `1d4f2c3`): naming, fence, currentness and lock-protocol compatibility review

**COMPATIBLE FOR DRAFTING, WITH NAMED CONDITIONS. No P0.** By name, the proposed `research_health_quick_order_*`
objects cannot enter the ADP fence, and nothing in the packet breaks any seal that can be read from source. **SQL
drafting may proceed now** for the intake companion table, the replay reader, the currentness authority objects (head,
revisions, publish, revoke, read-current), the precheck, postcheck and rollback scripts and the disposable verifier,
carrying the drafting conditions in section 5. **The admin-detail wrapper may be drafted once the `detail` wire
contract is recorded**: the canonical SQL emits 20 keys and the pushed decoder closes over 23, a P1 that would fail
every operator read closed. **The writer-guard trigger set and the commit RPC body are HELD** until the packet records
the lock invariant and guard timing, the named standing authority, the epoch scope, the missing-head semantics, the
recipient source and the sessions shape-guard conflict. Nothing here is an approval; the hosted database was not
queried and its state is NOT PROVEN. Lens output archived as `hl12/42_supplemental_lens_findings.json`.

**What this review is.** Samuel answered "Approve this bounded source-only scope" at 2026-10-06T18:29:11Z to the
coordinator's exact question naming commit `1d4f2c3b3ff2fc0e1bc25495d3076d2bd9a76e99` (recorded at `dc3329b`). That
approval is source-only and makes **SQL drafting conditional on this reviewer's compatibility review**. It excludes
database execution, live intake, payment, notification sends, deployment, manifest changes and final protected
acceptance. This record is the compatibility review. It is a design gate for drafting, not acceptance of any code, and
it decides nothing Samuel has reserved (Health legal pair, classification, destination, band, provider, price).

Reviewer: this session, `claude-fable-5-1`, effort `xhigh` as reported. Method: full read of the packet at
`1d4f2c3` (`QUICK_ORDER_SUPPLEMENTAL_SCOPE_20261006.md`, `QUICK_ORDER_SUPPLEMENTAL_BASELINES_20261006.json`,
`QUICK_ORDER_SHARED_EDITS_PROPOSED_20261006.patch`), independent checks against the migrations and code at `ac36e60`,
and two read-only lenses with adversarial verifiers. No SQL was executed, no file applied, no worktree touched.

## 1. Packet identity (verified)

| Item | Value |
| --- | --- |
| Scope document | `docs/coordination/launch-coordination-20261005/QUICK_ORDER_SUPPLEMENTAL_SCOPE_20261006.md` at `1d4f2c3`, 397 lines |
| Baselines | `QUICK_ORDER_SUPPLEMENTAL_BASELINES_20261006.json`: 46 entries bound at `5ee44d5` and re-hashed at the mount successor `ac36e60` |
| Shared-edits patch | `QUICK_ORDER_SHARED_EDITS_PROPOSED_20261006.patch`, sha256-lf `b7427650d987954e12d88df1a118a646d3498aaab19a902e3ad562150ca0f15f`; touches `shared/research/assisted-order/contract.ts`, `server/research/assisted-order/supabase-repository.ts`, `server/research/assisted-order/service.ts`, `client/src/research/assisted-order/AdminAssistedOrderDetail.tsx`, `server/research/assisted-order/communications.ts` and the existing `client/src/research/assisted-order/AdminAssistedOrderSession.test.tsx`; `git apply --check` succeeds against the `ac36e60` blobs in a scratch repository; not applied anywhere |
| Approval record | `dc3329b`: question item id, exact answer, `recordedAt 2026-10-06T18:29:11.344Z`, scope commit and patch sha256 bound; status `USER_APPROVED_SOURCE_ONLY_SQL_COMPATIBILITY_REVIEW_PENDING` |

## 2. Independent compatibility checks (this reviewer)

| Check | Result |
| --- | --- |
| Proposed names versus the ADP fence | all proposed objects use the `research_health_quick_order_` prefix (`_intakes`, `_replay`, `_commit` reserved, `_admin_detail`, `_authority_head`, `_authority_revisions`, `_publish_revision`, `_revoke_revision`, `_guard_source_write`, `_read_current_authority`). The ADP-G1 fingerprint (`20261001160730…sql:16-31`) selects functions `research_assisted_order_%` and relations `research_assisted_order_%` or `research_notification_outbox`; ADP01, ADP02 and ADP03 select the same function prefix. None of the proposed names matches. **Compatible by name.** |
| Companion foreign key to `research_assisted_order_requests` | an FK constraint row belongs to the referencing relation (`conrelid` = companion), the referenced side gains only internal RI triggers, and G1 excludes `tgisinternal` triggers and keys constraints by `conrelid`. **Does not change the fenced fingerprint.** The packet states this as an inference; I agree with the reading of the fingerprint SQL, and the disposable verifier must still prove it by calling the provider integrity RPC before and after install. |
| Any other schema seal over the 23 guard-allowlisted relations | grep of every migration for fingerprint, seal, `obj_description` and schema-posture raises finds only the ADP family; the three other `55000` hits (`20260809130000` early-access hardening, `20260923181443` checkout commerce authority, `20260807200000` affiliate portal v2) are ordinary business raises, not schema seals. **No other seal would be broken by guard triggers on products, members, early-access, partner or inventory tables.** |
| Existing trigger censuses on those relations | the Referral V1 candidate installs and counts its own named triggers on `research_partners`, `research_members` and `research_attribution_touches`; inventory and cart scripts check named triggers. All are presence checks of named triggers, not exclusivity, so coexisting `research_health_quick_order_*` guards would not fail them. |
| Writer-guard blast radius and epoch churn | the design advances one global `writer_epoch` on every INSERT/UPDATE/DELETE/TRUNCATE across 23 relations and refuses any in-flight intake whose observed epoch changed. Two of those relations are high-traffic append or session tables: `research_attribution_touches` (written on referral touches by the partners store) and `research_private_early_access_sessions` (written at session exchange). Under normal traffic an intake's preflight window would see frequent epoch changes and be refused, and the intake's own session activity could bump the epoch. **Design concern, see findings.** |
| Source literal | kept at `early_access_manual_order_bridge`; the packet names the status-recovery consequence and adds an independent `intakeKind` marker in the submitted event's `evidence` JSON so a missing companion is treated as corruption, not legacy. Consistent with doc 36 QO-P2-10. |
| Doc 36 section 7 conditions as written in the contract | actor mapping and `quick-order-v1` idempotency namespace (QO-P2-13); re-resolved canonical lines, M75-sanitised declared code with the raw string kept in the companion, trusted attribution carried separately (QO-P2-11); outbox key, template, `pending`, null financial FKs, closed payload with no URL (QO-P2-12); standing refusal for unbound viewers (QO-P2-14); 46 predecessor bindings including the five later guard migrations and the ADP chain (QO-P2-15); Health legal bytes required and the research pair refused for Health (QO-P2-05); positive Health classification required (QO-P2-06); band 100-versus-50 left to Samuel. Per-condition statuses after the lenses are in section 4. |

## 3. Lens findings

Two lenses (SQL fence, currentness and lock protocol; shared edits, reader and tests), four agents, each finding
re-derived by an adversarial verifier from Git objects at `1d4f2c3`, `ac36e60`, `fd023e8` and `10208fe`. Verifier
tally: four P1 raised, three upheld (one with its mechanism corrected) and one refuted; every P2 and P3 upheld; the
verifiers added three findings of their own. Prefix `S` is the SQL lens, `E` the shared-edits lens, `M` a verifier
addition. Where the two lenses found the same thing, one row carries both ids.

| ID | Sev | Verifier | Finding | Smallest amendment |
| --- | --- | --- | --- | --- |
| S-F1 | **P1** | upheld, mechanism corrected | The lock protocol is unwritten where it matters. The lens's deadlock partner was refuted: `research_referral_v1_execute` serialises under `pg_advisory_xact_lock(9042026,1)` and each of its operations performs exactly one guarded write after all its row locks, the same rows-then-head order as the intake; approved-customer access, privacy cleanup and the product admin RPCs also pre-lock. What stands: the packet says only "statement-level guards" (scope :179-181). With `BEFORE … FOR EACH STATEMENT` guards, any plain single-statement UPDATE or DELETE on members, partners or links with no prior `FOR UPDATE` takes the head exclusive lock before its row lock, inverting the order against an intake that holds `FOR SHARE` on its own member row (via `bindingAt`, `20260904…:840`, which the packet's :199-204 omits) or on partner and link rows, and a cycle follows. The packet concedes no deadlock-freedom claim (:208). | Write the invariant into the packet: guards are `AFTER … FOR EACH STATEMENT`; "no writer performs a guarded write before locking rows an intake may share"; member rows join the intake's preflight-lock list (S-M3); the verifier exercises a writer competing on each side of the head boundary (:256-257). |
| S-F2 | P1 → **refuted**, residual P3 | The claim that the intake's reuse of the durable-binding helper writes `research_affiliate_customer_bindings` (and so upgrades its own shared lock and advances its own epoch) does not hold: the helper the packet names at :205 is the non-locking read projection family (`research_referral_v1_effective_binding_json` and siblings); the write path `bind` is a locking RPC the intake does not call; the intake's single-transaction insert list (request, lines, event, companion, receipt, outbox) touches no allowlisted relation. | Name the helper exactly and state that the intake performs no INSERT, UPDATE or DELETE on any allowlisted relation. |
| S-F3 / E-F5 | **P1** | upheld | The standing authority is still unnamed (doc 36 QO-P2-14): scope :95, :267-268 and :272 say "durable standing" generically. It is derivable read-only: `wiring.agreementGate` is `research_early_access_agreements_accepted` (`commerce-ports.ts:31`, wired at `server/index.ts:936`), defined at `20260804120000…:450-484` over `research_early_access_agreement_acceptances` keyed by customer reference, agreement kind and version (free text up to 64, so a Health pair can be recorded there), with the required pairs from `wiring.requiredAgreements` (`production-deps.ts:95-101`). The Quick Order production wiring at `ac36e60` still admits any member with the submit capability and no customer reference. | One paragraph naming that authority and the pair source, stating whether Health standing is the same durable acceptance keyed by the approved Health kind and version or a new object under the prefix, and restating that member viewers without a bound customer reference and session hash are refused. |
| E-F1 | **P1** | upheld; re-read by me | The pushed S4 decoder closes `detail` over 23 keys including `source`, `declaredAffiliateCode` and `declaredAffiliateCodeState`, and the closure runs before the legacy-null branch; the canonical `research_assisted_order_admin_json` (`bridge:489-510`) emits 20 keys and none of those three, and no later migration redefines it (M75 adds columns and parses submit input only). The TypeScript type carries the three fields only because `decodeAdminDetail` hard-codes `source` and defaults the declared pair (`supabase-repository.ts:197`, `:211-220`). A wrapper that passes the canonical JSON through verbatim is therefore refused for every row, legacy and Quick Order alike. At `9118a82` the readback test's fixture is the 23-key TypeScript shape, not the wire shape, so the authored tests do not detect this. | Record the choice before the wrapper is drafted: the wrapper appends the three keys from the row (with the `not_provided` default) for every request, or the decoder drops them and lets `decodeAdminDetail` default them; add a legacy fixture in the real 20-key shape to the readback test. |
| S-F4 | P2 | upheld | Writer-guard behaviour when the head row is absent or held is unspecified; "missing means held" is defined for the intake only; the design serialises every write on 23 relations, including `research_members` and `research_attribution_touches`, through one row's exclusive lock. | Specify: the guard is a no-op when no head row exists; a held head never blocks writers; the epoch advance is one cheap row update; the verifier records lock-wait evidence for the highest-frequency writers before any installation decision. |
| S-M2 | P2 | verifier addition; equals my section 2 concern | Epoch churn and liveness: per-sign-in session inserts (`exchange_nonce`, sessions source :511), per-landing referral touches (`20260904…:746`), inventory reservation, release and expiry writers (`20260727160000…` at six sites) and member activations (`20260905…:182`) each advance the global epoch, and an intake refuses whenever it moved between its read and its head lock. No bound on the refusal rate or on writer serialisation behind in-flight intakes is stated; the qualification list tests an epoch change, not liveness. | Scope the epoch to decision-relevant, publication-controlled writes or to per-family heads; record expected write rates for the heaviest guarded writers; add a liveness case before the verifier. |
| S-M1 | P2 | verifier addition | `supabase/research-private-early-access-sessions.sql` carries a shape guard (:119-224, raise at :201-209) that refuses **any** non-internal trigger on `research_private_early_access_sessions` and `_nonces`; its verify script repeats the check. Installing `guard_source_write` there makes that source unreapplyable and its verification fail. Not a runtime seal (no function censuses triggers; the server calls no such RPC), so P2. | Drop the sessions table from the trigger allowlist (revocation can be re-read under the head lock through `research_private_early_access_session_active`) or record an owner-approved amendment of that file. |
| S-F7 / E-M1 | P2 | upheld; found independently by both verifiers | The outbox contract omits the sources of two NOT NULL columns, `event_type` and `recipient`; the legacy admin obligation takes its recipient from application configuration (`RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL`), which SQL cannot read, and a recipient must never be browser-supplied. Dispatcher facts verified: an unknown template retries to `failed_permanent`, and the event key is the provider idempotency key, so the renderer branch must deploy before any row can dispatch. | Name the `event_type` literal and the recipient source (a validated RPC argument bound server-side to the configured address, or a database-side routing setting), the refusal or hold when it is absent, and add the case to the notifications test. |
| S-F6 | P2 | upheld, one correction | The baselines omit two migrations that install fingerprinted triggers on the fenced requests relation (`20260930230541…` `hl12_observed_cancel`, `20261001024018…` `hl12_history_progression`), the outbox table source (`supabase/research-notification-outbox.sql`) and the status-recovery source. Correction to the lens: that source is a registered **migration** at `fd023e8`, `supabase/migrations/20260927203000_research_status_recovery.sql` (sha256 `98cce457…`, byte-identical to the candidate), which makes the recovery consequence a firmer fact. The postcheck promises enumeration but no exact trigger-name and enabled-state assertion. | Bind the four files; assert the enumerated trigger set on requests, events and outbox (section 4, QO-P2-15) present and enabled after install, reapply and rollback, with the provider integrity RPC before and after. |
| S-F5 / E-F3 | P2 | upheld | The shared patch replaces the canonical admin reader unconditionally with the not-yet-existing wrapper and fails on error, with no wiring gate; `getAdmin` also backs `updateStatus` (via `adminDetail`), `createDocumentUpload` and `completeDocumentUpload`, so the customer document flow is cutover-dependent too and undisclosed. | List all four call sites as cutover-dependent; keep the applied patch on the builder branch; bind any merge toward a release candidate to the wrapper's qualified installation; cover the two document paths and `updateStatus` in the readback test with a legacy envelope and an absent wrapper. |
| E-F2 | P2 | upheld; **resolved at `9118a82`** | The patch imports `QUICK_ORDER_ADMIN_DETAIL_RPC`, which `10208fe` does not export (deliberately, per the S4 contract). The builder's `9118a82` adds the export (doc 44 section 2); the sidecar re-pin of the patch hash and S4 blob hashes is still due. | Re-pin in the coordinator sidecar. |
| E-F4 | P2 | upheld | `provider-journal-http.test.ts:213-226` fakes the admin reader by the old RPC name and throws on any other, over the real Supabase repository; it is the only such test; the packet's test scope does not list it. | Add it to the slice scope with a valid legacy envelope (doc 44 records the builder's proposed fixture patch, test-only, for Samuel). |
| S-F8 | P3 | upheld | The 100-versus-50 band is neither decided nor named as an open founder decision. | One sentence: the band is taken from the governed revision inside the lock, never from fixtures; the Health value remains Samuel's decision. |
| S-F9 | P3 | upheld | The retained A2 candidate and verifier file names carry the `research_assisted_order_` prefix while every object uses the new prefix. | Rename the files in the same packet delta. |
| S-F10 | P3 | upheld | A canonical unique violation (23505 on `idempotency_key_hash` or `public_reference`) surfacing after the companion lock is not stated. | After the companion lock, any canonical 23505 is a conflict: no retry, no receipt; verifier case. |
| S-F11 / E-F6 | P3 | upheld; **superseded at `9118a82`** | The patch hides the canonical affiliate block for Quick Order rows, so the operator sees the raw declared code but not the canonical M75 code and state. The coordinator-directed amendment `6f5d9013…` applied at `9118a82` restores the block (doc 44). | None further; the readback contract must still carry the three keys (E-F1) for the block to show real values. |
| S-F12 | P3 | upheld in substance, premise corrected | The status-recovery consequence is disclosed but not recorded as accepted; the source is a registered migration, unbound. | Record that Quick Order rows are intentionally recoverable through the canonical reference-plus-email flow under the canonical owner binding, identical to legacy rows, and bind the migration's hash. |
| S-F13 | P3 | upheld | Two drafter facts from doc 36 are implied, not written: `line_estimate_cents = unit_price_cents × quantity` computed in SQL (bridge CHECK :221-226) and per-line persistence of the classification decision with its source version. | Add both sentences to the frozen intake contract and surface them in the admin projection. |
| S-M3 | P3 | verifier addition | The member-path preflight locks a `research_members` row (`bindingAt`, `FOR SHARE`); the packet names only partner and link rows. | Include member rows in the invariant and the verifier case. |
| E-F7 | P3 | upheld | The new renderer branch throws on a malformed payload instead of returning null; the dispatcher treats the throw as retryable, so the row walks six attempts to `failed_permanent` and departs from the file's documented null contract. The UUID pattern lacks the case-insensitive flag (harmless: Postgres emits lower case). | Return null for a malformed payload; add the case asserting no send and no payload data in the error summary. |
| E-F8 | P3 | upheld | After a status update the service returns the detail without a `quickOrder` key when the pre-read enrichment was null, so a legacy row reads as explicit null from `getAdmin` but undefined from `updateStatus`. | Carry `current.quickOrder` through unchanged when it is null. |
| E-F9 | P3 | upheld, anchor corrected | The decoder refuses an upper-case expected request id while the service only trims, so a mixed-case admin URL that Postgres's uuid cast accepts today becomes a 500 after the patch, after one wasted RPC round trip (the RPC runs before the decode). | Lower-case the id in `getAdmin` before the call; add a mixed-case case. |
| E-F10 | P3 | upheld | The canonical Supabase repository now transitively imports the Health quick-order module directory (`core.mjs`); no cycle (that file has zero imports), but the dependency direction the mount and relocation reviews assumed is inverted. | Record the direction in the S4 handoff, or move the two vocabularies into the shared types module. |
| E-F11 | P3 | upheld | Two of the four named composition tests depend on boundaries named only in prose: root composition boots the protected `server/index.ts` as a child with a synthetic environment; the Vite document test calls the real `setupVite`, whose logger error path calls `process.exit(1)`. They are now authored at builder `5fd2e4c`, outside this record. | State the mocked boundary in each test header; label them composition-unit; no runtime seam change unless returned first as a delta. |
| E-M2 | P3 | verifier addition | If the wrapper ever emits a wire-level `stale` observation, the patch disables the status form with "Reload this page" as the only remedy, locking every transition for that request. | State in the wrapper contract that the RPC never emits `stale` (it is the service overlay after `updateStatus` only), or make initial-load stale a warning. |

Adversarial checks that came back clean, with anchors in the archived JSON: the `LIKE 'research_assisted_order_%'`
predicate differs from the new prefix at character 10 and no underscore wildcard can pull the new names in; ADP02's
trigger-name patterns `%adp0%` and `%hl12%` match no proposed name; ADP03's relation set equals G1's; the companion
foreign key is keyed by the companion and its RI triggers are internal; no proposed object, index, policy or grant
touches `research_notification_outbox` or any fenced relation; the HL12 outbox guards pass the proposed row; every
event-insert guard accepts a `submitted` event carrying the intake marker; the paid-hold trigger returns `NEW` for the
intake insert; the referral V1 self-check counts only its own trigger names; all 46 baseline hashes are equal at
`5ee44d5` and `ac36e60`; the patch is 18,546 bytes, no CR bytes, 13 hunks, 112 context and removed lines all equal to
the `ac36e60` blobs; the three active leases in `CODE_OWNERSHIP.json` at `1d4f2c3` cover none of the six shared paths;
the Quick Order production wiring is untouched (`productionReady: false`, `commit()` throws).

## 4. Per-condition status

Merged from both lenses and both verifiers; where they differed I record the stricter reading.

| Condition | Status | Basis |
| --- | --- | --- |
| QO-P2-05 legal pair | **PARTIAL** (design satisfied, implementation open) | Fail-closed refusal of the Research-use pair for Health is stated (scope :270-271) and `legal.ts` at `ac36e60` can emit only the published Research-use agreement; no Health pair is provisioned (:148-149). The Health document or registry adapter, its route and the refusal test named by doc 36 appear in neither the new-file list nor the test list; they remain an A2 dependency on Samuel's Health legal decision. |
| QO-P2-06 positive Health classification | **PARTIAL** | Required by scope :269; `catalog.ts` is still the negative filter and labels `qo-v1` non-transactional. Not stated: the fail-closed test that an unlisted family is not requestable, and per-line persistence of the decision with its source version (S-F13). |
| QO-P2-09 naming and fence | **SATISFIED** | Section 2 and the clean checks above; the verifier re-derived the fence predicate from the migration bytes and the prefix mismatch at character 10. Installation compatibility still needs the verifier's provider integrity RPC before and after. |
| QO-P2-10 source literal | **SATISFIED** | Kept, with the consequence disclosed and no status token minted; the recovery readers are a registered migration, so the consequence is firm; acceptance of it is not yet recorded (S-F12). |
| QO-P2-11 commit input | **SATISFIED** at design, P3 gaps | Complete canonical lines re-resolved in the transaction; raw code in the companion, M75 representation in the canonical column; estimate mapping; ports extension. Gaps: S-F8, S-F10, S-F13; the operator projection must show both codes (S-F11, now restored at `9118a82`). |
| QO-P2-12 outbox obligation | **SATISFIED** for the literal list, one P2 gap | Template, key, `pending`, null financial FKs, closed payload, fixed origin and in-transaction insert all as doc 36 required; HL12 guards pass the row. Gap: `event_type` and `recipient` sources (S-F7 / E-M1). |
| QO-P2-13 identity and idempotency | **SATISFIED**, one P3 | Actor mapping, disjoint `quick-order-v1` hash namespace, lock-then-replay, no token; the canonical 23505 branch is unstated (S-F10). |
| QO-P2-14 standing authority | **PARTIAL → P1** | Refusal of unbound viewers is stated; the acceptance authority and pair source are not named (S-F3 / E-F5), although derivable as recorded in section 3. The commit's standing guard cannot be drafted against an unnamed object. |
| QO-P2-15 predecessor anchors | **PARTIAL** | Bridge, M75 and nine later migrations bound (46 entries, all re-verified at `5ee44d5` and `ac36e60`). Missing: `20260930230541…`, `20261001024018…`, the outbox SQL and the status-recovery migration (S-F6); no exact trigger assertion. Full trigger set on the fenced relations at `fd023e8`, for the postcheck to assert: requests `research_assisted_order_paid_hold`, `hl12_observed_cancel`, `hl12_history_progression`, `aa_hl12_disposition_terminal`, `aaa_adp01_uncertainty`, `adp03_request_identity`; events `events_append_only`, `paid_event_evidence`, `hl12_disposition_cancel_event`, `adp03_paid_event`; outbox `hl12_payment_effects_outbox_guard` and `_truncate`, `hl12_disposition_effects_outbox` and `_truncate`. |
| Currentness authority is its own object | **PARTIAL** | It is (head with monotonic epoch, immutable revisions, owner-scoped publish and revoke, held by default, service role cannot self-approve), and `qo-v1` stays staleness detection only. Unresolved before guard or commit SQL: S-F1, S-F4, S-M1, S-M2, S-M3; file and configuration authorities are governed only by the publication protocol, a design claim the packet discloses as unenforceable in SQL. |
| Admin-detail wire contract | **OPEN → P1** | E-F1: 20 emitted keys versus 23 required; must be chosen before the wrapper is drafted. |
| Band 100 versus 50 | **HELD** | Samuel's decision; the packet correctly leaves it open (S-F8). |

## 5. Decision on SQL drafting

This is the compatibility review that Samuel's source-only approval made a precondition of SQL drafting. It permits
drafting on the builder branch only: no execution, no registration, no managed apply, no hosted mutation, nothing
Samuel has reserved.

**A. May be drafted now** (candidates under `supabase/candidates/`, file names under the `research_health_quick_order_`
prefix per S-F9), carrying these conditions into the drafts:

- `research_health_quick_order_intakes` with its indexes and policies; `research_health_quick_order_replay(text, text)`;
  `research_health_quick_order_authority_head`, `_authority_revisions`, `_publish_revision`, `_revoke_revision`,
  `_read_current_authority`; the precheck, postcheck and rollback scripts; the disposable verifier.
- Conditions: bind the four missing sources and assert the exact trigger set (S-F6, QO-P2-15 list); SQL-computed line
  estimates and per-line classification with source version (S-F13); canonical 23505 is a conflict (S-F10); the band
  comes from the governed revision, never fixtures (S-F8); record acceptance of the recovery consequence (S-F12); the
  verifier calls the provider integrity RPC before and after install, reapply and rollback (QO-P2-09).

**B. May be drafted once one amendment is recorded:** `research_health_quick_order_admin_detail(uuid)`, as a
service-only wrapper over the unchanged `research_assisted_order_admin_get`, after the packet records the `detail` wire
contract (E-F1: wrapper appends `source`, `declaredAffiliateCode` and `declaredAffiliateCodeState` for every row, or
the decoder drops them), states that the RPC never emits a `stale` observation (E-M2) and that genuine legacy rows
return explicit null enrichment with the submitted-event marker absent.

**C. HELD** until the packet records the amendments, then returned here as a delta before drafting:

- The writer-guard function and trigger set (`research_health_quick_order_guard_source_write` on the allowlisted
  relations): S-F1 (guard timing `AFTER … FOR EACH STATEMENT`, the written lock invariant, member rows in the preflight
  list, the two-sided verifier case), S-F4 (no-op without a head row; held never blocks writers), S-M1 (sessions table
  out of the allowlist or an owner-approved amendment of its shape guard), S-M2 (epoch scope and a liveness case, with
  expected write rates).
- The commit RPC body (`research_health_quick_order_commit`): S-F3 / E-F5 (named standing authority and pair source),
  S-F7 / E-M1 (`event_type` literal and recipient source with refusal when absent), S-F2 residual (the intake performs
  no write on any allowlisted relation, helper named exactly), plus everything in A that the commit writes.

**D. The shared patch** is source-approved and now applied at `9118a82` (doc 44). It must not travel toward any
release candidate until the wrapper is installed and qualified, because the cutover reaches four call sites including
the customer document flow (S-F5 / E-F3); `provider-journal-http.test.ts` must be in the slice scope (E-F4); the
readback test needs a fixture in the real 20-key wire shape (E-F1).

No P0. Three P1 amendments (S-F1, S-F3, E-F1) gate the held items; one P1 (S-F2) was refuted and is recorded as such.
Qualification of anything drafted under A or B needs its own reservation and host; this review executed nothing.

## 6. What remains outside this review

Samuel's reserved decisions (Health legal content, product and destination eligibility, band, price, provider,
commission, real intake); the supplemental implementation's own exact successor review when it exists; disposable
database proof (needs its own authorization and host); managed registration or apply; the activation slice. A naming
review cannot prove installation compatibility; only the verifier's provider-integrity RPC calls before and after
install, re-apply and rollback can.
