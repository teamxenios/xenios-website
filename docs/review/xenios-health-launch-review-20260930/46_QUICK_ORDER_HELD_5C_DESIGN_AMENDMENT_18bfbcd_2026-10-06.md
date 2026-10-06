# Quick Order held section 5C design amendment (`HELD_WRITER_COMMIT_DESIGN_AMENDMENT_20261006.md` at `18bfbcd`): disposition (packet part B)

**HELD REMAINS. No body becomes eligible for drafting.** The amendment (sha256 `2cff1b08a39d3d024fdd547980e6ff5069915d16516b3a8febc991d736c44ed2`,
10,719 bytes, 166 lines at `18bfbcd`; not hash-bound in any builder record until now) answers every doc 42 section 5C
condition in text and is honestly labelled PROPOSED / NOT ACCEPTED / NOT IMPLEMENTED. **Closed at design:** guard
timing `AFTER … FOR EACH STATEMENT`; member rows in the preflight (S-M3); the two-sided verifier case; the standing
authority named and verified (`research_early_access_agreements_accepted(text,jsonb)`); bound session hash and
canonical customer reference for both viewer kinds; sessions and nonces out of the trigger allowlist; the
`assisted_order.submitted` event type and the server-only recipient argument (S-F7 / E-M1); the exact non-writing
binding helpers and the no-write rule (S-F2 residual); the wire contract (E-F1); the effectivity recheck and the
canonical 23505 rule. **Open, or newly opened:** the lock invariant is written but is insufficient for writer-versus-
writer liveness and is falsified under the amendment's own preflight set by two known writer bodies (B-1, P1); no
server configuration can hold a Health required pair at `7d027e4`, so the standing guard still cannot be drafted
(B-2, P1); the session-row share lock is a new element keyed on the wrong hash and silent under forced row security
(B-3, P2); the epoch scope leaves three relations under an unauthored predicate, so the trigger set cannot be
enumerated (B-4, P2); S-F4 is accepted as design only with the measurement condition in section 3. Nothing here
authorises installation, execution, activation, intake, payment, notification or deployment, and nothing is Samuel's
approval.

**What this review is.** Doc 42 section 5C held the writer-guard function and trigger set and the commit RPC body
until the packet recorded named amendments. The builder returned
`docs/health-launch/quick-order-20261005/HELD_WRITER_COMMIT_DESIGN_AMENDMENT_20261006.md` (166 lines, at
`18bfbcd`), marked PROPOSED / NOT ACCEPTED / NOT IMPLEMENTED, and the coordinator asked for a separate disposition:
which conditions remain open, and whether any narrowly identified body becomes eligible for drafting under the
existing source-only approval. This is a design gate, not acceptance of code, and it authorises no installation,
execution, activation, intake, payment, notification or deployment. Method: full read of the amendment, independent
source checks of every object it names, one read-only lens with an adversarial verifier.

## 1. What the amendment proposes (inspected source)

- **Lock ordering (§1-6).** Read committed; actor and key transaction lock first; exact replay before eligibility;
  all canonical preflight row locks (member row via Referral V1 `bindingAt`, partner and link rows, the exact bound
  private session row) before the head share lock; fresh re-read and epoch comparison after the head lock with no
  internal retry; no further source-row lock after the head lock; participating guards `AFTER … FOR EACH STATEMENT`,
  never `BEFORE`; the writer invariant "every writer locks every source row an intake may share before its first
  guarded write and acquires no such row after the head lock"; an installed writer audit that enumerates helper, FK
  and trigger lock acquisition and every multi-write path, with any incompatible path blocking the guard set and
  returning as an owner-scoped amendment rather than installing an inversion; a database-time recheck of
  effectivity before insertion; a canonical 23505 after the actor and key lock is a conflict with no receipt and no
  retry.
- **Absent and held head.** Absent head: the guard is a no-op. Held head: writers are never refused; a retained
  cheap epoch update's lock wait must be measured and bounded, and "held never blocks writers" is explicitly not a
  zero-lock-wait claim.
- **Sessions.** `research_private_early_access_sessions` and `_nonces` leave the trigger allowlist; the intake
  instead shares the exact bound session row before the head lock and rechecks
  `research_private_early_access_session_active(text,uuid,text)` after waiting and before insertion; the stated
  consequence is that a row-level revocation waits behind the held session row.
- **Scoped epochs.** Unconditional epoch advancement is withdrawn for append-only `research_attribution_touches` and
  cosmetic product media writes; the epoch covers "publication-controlled decision facts" named by the selected
  publication; the exact dependency key and column projection, the installed writer audit and production write
  rates remain unresolved and are declared UNKNOWN / NOT MEASURED.
- **Standing.** `research_early_access_agreements_accepted(text,jsonb)` over
  `research_early_access_agreement_acceptances`, the authority behind `SupabaseEarlyAccessAgreementGate`, consumed
  through `wiring.agreementGate` and `wiring.requiredAgreements`; no parallel acceptance table; the Health pair comes
  from the owner-approved Health legal artifact bound by the publication and must match the server's configured
  required pair; both member and Early Access viewers need a verified canonical customer reference and the bound
  session hash.
- **Binding helpers.** `research_referral_v1_effective_binding_json(text)` for the current binding and
  `research_referral_v1_binding_at_json(text,timestamptz)` through the authorised `bindingAt` path for occurrence
  time; the intake performs no INSERT, UPDATE, DELETE or TRUNCATE on any allowlisted relation and calls no bind,
  capture, transfer, session exchange, agreement recording or activation.
- **Notification.** `event_type` is the existing `assisted_order.submitted` literal; the recipient is a validated
  server-only argument bound by the production adapter to `RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL` (the existing
  `adminNotificationEmail` dependency); missing or malformed configuration refuses before anything commits.

## 2. Independent source checks (this reviewer)

| Named object | Found at `7d027e4` |
| --- | --- |
| `research_early_access_agreements_accepted` | `supabase/migrations/20260804120000_research_early_access_identity_persistence.sql:450` |
| `research_private_early_access_session_active(text,uuid,text)` | `supabase/research-private-early-access-sessions.sql:539` (revoked from public at `:600`) |
| `research_referral_v1_effective_binding_json(text)` | `supabase/candidates/20260904_research_partner_referral_v1.sql:583` |
| `research_referral_v1_binding_at_json(text,timestamptz)` | same file `:602` |
| Legacy `event_type` for submission obligations | `server/research/assisted-order/service.ts:657` (admin) and `:672` (customer): `assisted_order.submitted` |
| Outbox columns `event_type`, `recipient` NOT NULL | `supabase/research-notification-outbox.sql:12-14` |

## 3. Per-condition disposition

Lens and verifier output is archived in `hl12/45_sql_draft_lens_findings.json` (lens `held-design-5c`); every lens
finding was upheld, two with anchor corrections adopted below. Where the verifier was stricter than the lens, the
stricter reading is recorded.

| Condition (doc 42) | Disposition | Basis |
| --- | --- | --- |
| S-F1 guard timing | **CLOSED AT DESIGN** | Amendment :27-28: `AFTER … FOR EACH STATEMENT`, never `BEFORE`. No trigger exists; the intake precheck refuses if one did. |
| S-F1 written lock invariant | **OPEN (P1, B-1)** | Written at :28-32, but (a) it is scoped to rows "an intake may share", so it cannot exclude writer-versus-writer deadlock through the head exclusive lock: the inventory release and expiry commands (`20260727160000…:884-891` then `:924`; `:1341-1345` then `:1378`) lock one lot `FOR UPDATE`, update the lots table (which would take the head lock), then lock the next lot in the loop, so two releases over partially overlapping lot sets can cycle even though no intake locks lot rows; the sentence "This covers multi-statement writers" (:30) is an overclaim. (b) Under the amendment's own preflight set (:20 partner and link rows) it is falsified by `research_referral_v1_privacy_begin` (`20260904…:209-339`): it pre-locks only the member (:233) and partner (:235) rows, gathers link and touch ids without row locks (:238-241, :272-301), and then deletes transfer events, bindings, touches and links (:321-331); after its first guarded delete it holds the head lock and acquires link rows an intake may hold `FOR SHARE`. The writer audit (:33-36) and the measured waits (:43-47, :86-94) are open by the amendment's own words, and its first results are already adverse read-only. |
| S-F1 member rows (S-M3) | **CLOSED AT DESIGN** | :19-20 and :49-51; `bindingAt` locks `research_members FOR SHARE` (`20260904…:840`). Precision: the member-path canonical attribution reaches only the member row; partner and link `FOR SHARE` arise through `research_referral_v1_availability` (:549-561) on the guest touch and capture paths, so the exact canonical calls per viewer kind must be enumerated, because the deadlock analysis depends on them. |
| S-F1 two-sided verifier case | **CLOSED AT DESIGN** | :49-52; no case authored (the intake verifier is a reader verifier). |
| S-F3 authority named | **CLOSED AT DESIGN** | `research_early_access_agreements_accepted` at `20260804120000…:450-484` (security definer, fails closed on an empty or malformed list, exact `(customer_ref, kind, version)` existence); table `:140-156` (kind and version free text 1 to 64, so a Health pair can be recorded); gate class `commerce-ports.ts:53-70` calling that RPC (`:31`); wired `server/index.ts:935-936`; consumed `production-deps.ts:94-118`. |
| S-F3 pair source and refusal matrix | **OPEN (P1, B-2)** | The matrix (:107-113) is complete as text, but "the server's configured required-pair identity" has no Health-capable path at `7d027e4`: `requiredAgreements` is set only when it equals exactly the published Research-use pair (early-access `production-deps.ts:212-222`, `:336-348`, `:499-505`); `legal.ts:16-24` refuses any pair not equal to that Research pair; `approvedHealthAgreementPairs` (`production.ts:23`) has no non-test producer. The configuration the amendment requires agreement with can today only be the pair it says must refuse. Fails closed; a drafting blocker, not an unsafe design. The pair's content remains Samuel's reserved decision. |
| S-F3 session hash and customer reference for both viewer kinds | **CLOSED AT DESIGN** | :111-113; matches `production-deps.ts:104-118` and `express.ts:117-148`. What reaches SQL atomically is not claimed (:65). |
| S-F4 missing and held head | **ACCEPTED AS DESIGN, MEASUREMENT CONDITION** | Absent head: no-op. Held head: writers never refused; the retained epoch update's lock wait is "not a claim of zero lock wait" and must be measured and bounded (:42-47). I accept that distinction. Condition: the measurement must cover writer-versus-writer serialisation with no intake present (while held, every guarded writer serialises on one row until commit, including privacy cleanup under its table lock and multi-lot release) as well as writers against in-flight intakes, at observed normal and peak rates on a separately authorised disposable host, and it needs a drafted guard, so admissibility of a disposable-host draft measurement must be ruled on before any drafting clearance. P3: "absent head is a no-op" combined with lazy head creation inside `publish_revision` (`:209`) lets a writer in flight across the first publication escape the epoch; seed the head at install or bind fact identities. |
| S-M1 sessions out of the allowlist | **CLOSED AT DESIGN** | :56-58; shape guard `research-private-early-access-sessions.sql:201-209` raises on any non-internal trigger on sessions or nonces. Doc 42's first option. |
| S-M1 session-row share lock and recheck | **NEW ELEMENT, OPEN (P2, B-3)** | `research_private_early_access_session_active(text,uuid,text)` exists (`:539-568`, security definer, one `exists` select, no DML, no expiry slide; the repository's touch returns unsupported). Gaps: the viewer's `earlyAccessSessionHash` is `sha256(sessionId)` where `sessionId` is already the stored `session_hash` (`express.ts:140-145`, `private-access-routes.ts:855-871`, repository `:179-181`), so the design as implied keys on a double hash; `owner_id` is adapter configuration, unspecified; the table revokes all privileges from every role, forces row security with zero policies (`:264-297`), and `SELECT … FOR SHARE` needs UPDATE privilege, so only an owner-owned security-definer function can take it; under forced row security a definer without `BYPASSRLS` sees zero rows, so the lock would silently lock nothing and the design must refuse on NOT FOUND; the file header says UNMOUNTED / UNAPPLIED (:3) and hosted existence is NOT PROVEN. The stated consequence that a row-level revocation waits behind the held session row is coherent (revocation is one UPDATE, `:588-593`) but is a security-ordering decision I do not accept without a bounded hold time and a two-sided case. |
| S-M2 epoch scope and liveness | **OPEN (P2, B-4)** | Scope stated (:74-78); touches and media made conditional (:67-72) while scope `1d4f2c3` still lists them (`:221`, `:227`) and no predicate is authored (:84); `writer_epoch` in the currentness candidate is publication metadata only (advanced at `:221-223` and `:238-240`), as the amendment says. Touches are not "append-only" (:67-68): `privacy_begin` deletes them (`:329`). Before any guard set: the per-relation projection and predicate, the choice between one head and per-family heads, the revised allowlist, the audit result, a liveness case, and measured or explicitly synthetic rates. |
| S-F7 / E-M1 event type and recipient | **CLOSED AT DESIGN; test due (P3, B-7)** | `assisted_order.submitted` equals the legacy admin obligation (`service.ts:657`); the outbox has no CHECK on `event_type` or `recipient`; recipient as a validated server-only argument bound by the future adapter to `RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL` (`production-deps.ts:40-41`, `:217-218`), refusing when missing, stricter than legacy (a null recipient today fails inside `Promise.allSettled` via `server/research/outbox.ts:88-107`). The missing, blank or malformed recipient case is absent from the retained notifications test. |
| S-F2 residual | **CLOSED AT DESIGN; posture note (P3, B-5)** | `research_referral_v1_effective_binding_json(text)` (`:583-598`) and `_binding_at_json(text,timestamptz)` (`:602-620`) are security definer, select-only; the `auth:` key is built server-side (`:842`) and enforced by CHECK (`:156`); the intake performs no write on any allowlisted relation. Both helpers have EXECUTE revoked from `service_role` (`:1086-1094`), so the commit can call them directly only as an owner-owned definer function, or route current binding through `research_referral_v1_execute`, which takes the member `FOR SHARE` already listed; the amendment must say which. |
| E-F1 wire contract | **CLOSED** | Kept as pushed at `b75325a` (:156-157). |
| Effectivity recheck and canonical 23505 | **CLOSED AT DESIGN** | :37-40 equal doc 42 S-F10; no 23505 handling exists in the intake candidate, consistent with the hold. |
| Unsupported Early Access mapping refused | **CONSISTENT; consequence recorded** | The referral V1 account key is `auth:`-only (CHECK `:156`, preflight `:80-83`); Early Access viewers carry no auth user id; the Early Access referral authority is a separate object. Fail-closed; the product consequence is that Early Access viewers get no trusted referral attribution through this path until that mapping is bound. |
| New elements needing their own conditions | **RECORDED** | The session share lock (above); dependency-scoped epochs (projection and head cardinality); the recipient argument (provenance, shape, refusal, test); "no internal preflight retry" on an epoch change (:25); the resolution rule when a writer is incompatible (:35-36): drop the relation from the guard set or return an owner-scoped writer amendment, to be stated per writer. |

## 4. Eligibility of narrowly identified bodies

None is eligible under the existing source-only approval `dc3329b`; the default is not eligible where any dependency
is unresolved, and no blanket clearance is given.

| Body | Eligible | Unresolved dependency |
| --- | --- | --- |
| (i) `research_health_quick_order_guard_source_write` function body | **No** | Writer audit with adverse read-only results (B-1); S-M2 projection and predicate unauthored; allowlist not final; S-F4 measurement plan and admissibility ruling. |
| (ii) its trigger set on the reduced allowlist | **No** | Allowlist not final (sessions out; touches and media conditional without a predicate; `research_inventory_lots` and the referral privacy relations host writers incompatible with the protocol as written). |
| (iii) `research_health_quick_order_commit` body | **No** | S-F3 Health pair configuration path (B-2); S-M1 session-lock mechanics (B-3); S-F1 protocol acceptance; recipient argument contract and test; plus everything the commit writes under doc 42 §5A conditions and doc 45's inventory correction. The amendment itself adds no commit argument or body (:150-151). |
| (iv) read-only standing helper over the named acceptance authority | **No** | Not among the object names enumerated in packet `1d4f2c3`, so outside `dc3329b`; its required-pair argument has no defined provenance until the Health configuration path exists; the authority is already callable by the server. |
| (v) standalone recipient validator | **No** | Not an enumerated name; the recipient-as-argument design is new; a bounded-shape check belongs inline in the commit when that is cleared. |
| (vi) session-row lock and recheck helper | **No** | New element outside §5A, 5B and 5C; hash identity, `owner_id`, definer and `BYPASSRLS` posture, NOT FOUND assertion and revocation ordering undispositioned; hosted sessions table NOT PROVEN. |

## 5. Findings on the amendment itself

| ID | Sev | Finding (verified) | Smallest correction |
| --- | --- | --- | --- |
| B-1 | **P1** | The writer invariant (:28-32) is insufficient for writer-versus-writer liveness and is falsified under the amendment's own preflight set by two known writers (inventory release and expiry loops; `research_referral_v1_privacy_begin`), and the amendment neither names them nor states the consequence. Verifier corrections adopted: the deleting function is `privacy_begin` (`:209-339`), not `privacy_finalize`; the inventory case is writer-versus-writer and does not literally breach the invariant's wording, which is why the wording is the defect. | Record in the delta that `research_inventory_lots` and the referral privacy-cleanup relations are incompatible with the invariant as written; either remove them from the guard set (and state how lot and attribution decision facts are then protected, for example by the publication epoch alone) or return owner-scoped writer amendments; restate the invariant as "no writer acquires any row lock after its first guarded write" or do not hold the head lock to transaction end; add overlapping-lot release and `privacy_begin`-versus-intake cases to the two-sided verifier. |
| B-2 | **P1** | The Health pair must match "the server's configured required-pair identity" (:107-109), but no server configuration can hold a Health pair at `7d027e4`; the only configured pair is forced to equal the Research-use pair the same paragraph refuses. Fails closed. | Name the distinct, owner-approved configuration path for the Health pair and the code path that publishes it to the commit; state that it is separate from the early-access required-agreements setting; record that acceptance rows keyed by that pair are the only acceptable standing. |
| B-3 | P2 | The session-row share-lock proposal omits the hash identity (double hash as implied), the `owner_id` provenance, and the privilege and ownership posture needed to lock the row; under forced row security a definer without `BYPASSRLS` locks nothing silently. | Specify: the commit receives the raw `session_hash` and `owner_id` as server-only arguments; the intake function is security definer owned by the sessions owner with the same search path posture; refuse on NOT FOUND; hosted existence of the table is a precheck fact; add revoke-before and revoke-after cases with a measured hold time. |
| B-4 | P2 | "Remove unconditional epoch advancement" for touches and media or content leaves those relations in the guard set under a predicate the amendment says is not authored, so the trigger set cannot be enumerated; touches are not append-only. | State per relation whether it is out of the guard set or guarded under a named predicate, and author the predicate as part of the S-M2 projection before any trigger set is enumerated. |
| B-5 | P3 | Helper choice pinned by name but not by grant posture (EXECUTE revoked from `service_role`). | Record the definer calling context, or route current binding through `research_referral_v1_execute`. |
| B-6 | P3 | No record binds the amendment's hash; it is referenced by name only in the handoff, the README and the status record. | Bound here: sha256 `2cff1b08…`, 10,719 bytes, 166 lines, LF; the builder should bind it alongside the SQL source receipts. |
| B-7 | P3 | The recipient refusal is stricter than legacy and not yet covered by the retained notifications test. | Add the missing, blank and malformed recipient cases when the commit argument is designed. |
| B-8 | P3 (from doc 45 A2-F1) | The currentness head's three revision references have no foreign key and revision rows are mutable under owner DML; "immutable revisions" holds only through the callable surface (disclosed in the candidate). | Carry as §5C preconditions for any reader of the authority: foreign keys from the head references to `revision_id`, refusal triggers on UPDATE, DELETE and TRUNCATE of revisions, and an epoch-monotonicity guard; qualify every record statement of immutability. |

Discrepancies between records and bytes, recorded: the verifier note in the doc 42 lens JSON that "the server calls no
private-early-access authority RPC" was wrong at `ac36e60` as a source statement (corrected in doc 42 §5a); the lens
anchor `production.ts:93-94` for a recipient binding is the commit throw, and the amendment correctly says "future
adapter"; the sessions source header says UNMOUNTED / UNAPPLIED while rollback notes and a Supabase repository for it
exist, so which is true of the hosted database is NOT PROVEN.

## 6. Disposition B

- Subject: `HELD_WRITER_COMMIT_DESIGN_AMENDMENT_20261006.md` at `18bfbcd`, sha256 `2cff1b08…`.
- **HELD REMAINS.** Closed at design: S-F1 timing, S-M3, the two-sided case, S-F3 authority naming and viewer
  requirements, sessions out of the allowlist, S-F7 / E-M1, S-F2 residual, E-F1, the effectivity recheck and 23505
  rule. Accepted as design with a measurement condition: S-F4. Open: S-F1 invariant and writer audit (P1), S-F3 Health
  pair configuration path (P1), S-M1 session-lock mechanics (P2), S-M2 epoch projection, allowlist and liveness (P2),
  B-8 reader preconditions.
- **No body becomes eligible for drafting** under `dc3329b`; section 4 gives the reason per body.
- Acceptance of a corrected delta would be only the next source-design gate; it would not grant SQL execution,
  installation, active publication, real intake, protected acceptance or production release.
- Smallest next action for the builder: return one delta that names the two incompatible writer families and the
  resolution rule per writer, names the Health pair configuration path, specifies the session-lock mechanics (raw hash,
  owner id, definer ownership, NOT FOUND refusal, hold-time bound), states per relation the epoch disposition, and binds
  its own hash. Nothing to run.
