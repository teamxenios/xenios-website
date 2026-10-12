# Transaction composition revision 3 (`69d9e32` / `fa1286a`): bounded delta against doc 83

**Your three questions, answered:**
1. **Corrected transaction composition: CORRECTIONS REQUIRED.** The only correction is one authored verifier control
   (R3C-1, P2) plus records items. The transaction source itself (the intake SQL family, adapter, handler, production,
   ports, integration and client paths) is **ACCEPTED WITH NAMED LIMITS** at these bytes. Revision 4 must leave it
   byte-identical except where listed in section 4.
2. **Currentness receipt: CONFIRMED as a faithful binding.** I recomputed all 102 pins in both receipts myself; there
   are zero mismatches. The accepted currentness source, its definition and all required baseline dependencies are
   bound. It is a whole-delta rebind, though, not an add-rows amendment, so it is not yet final (section 2).
3. **Intake seal: NOT YET.** It may be finalized straight after revision 4's records rebind, with no further review
   beyond my pin re-confirmation. Section 3 gives the exact sequence and conditions.

**Result.** TC-1 through TC-11 are corrected, except that TC-3 is PARTIAL (only its required control cannot pass). No
P0 or P1. No regression or new fail-open path was found in the revision 3 changes. Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task `QUICK-ORDER-DISABLED-INTEGRATION-SOURCE-REVIEW-20261011`
revision 3, acknowledged at `c3e7337`. Samuel later pasted the coordinator's direct submission, which confirms the same
target. Controlling review: doc 83 (`16d2731`). The reviewed history is preserved: `121d098`/`dcf8963` and doc 83 stand
as written.

**Target:**
- **Source:** `69d9e32a5df899985b2877e06e1a778060a021f9` (tree `ac6eb499…`).
- **Records:** `fa1286a8a37b9b2cbc7127dfef0f5527f100a1c1`. The receipts bind source checkpoint `a044293` (tree
  `f80dc744`, which I confirmed).
- **What the source commits change:** `5c59cf4` and `69d9e32` touch only scoped paths, within the 21 paths plus the
  TC-10 restoration.
- **What else is in the range:** `121d098..69d9e32` also carries the separately authorized supervisor pair
  (`6766d51`, `3e5e2ed`, `f633a77`). That pair is outside this review (doc 88). Its omission from the records is a
  disclosure gap (R3C-4), not a scope breach.
- **Currentness SQL:** byte-identical to doc 81/82.

**Method.** Three read-only lenses, each with an adversarial verifier, then a completeness critic:
- the builder SQL and verifier;
- the integrator, client and adapter;
- the records and receipts.

**What I checked myself:**
- TC-1, in the bytes.
- Every receipt pin, recomputed.
- The R3C-1 callee.
- The TC-10 authority record on the board.

**Disclosures.** Behaviour is reasoned, NOT RUN. The definition digests (`10e9e2e3`, `8b631a83`) were not recomputed;
a wrong value fails closed. Output is archived as `hl12/87_composition_r3_delta_findings.json`.

## 1. Doc 83 items

| Item | Result | Evidence |
| --- | --- | --- |
| **TC-1 (P1)** | **CORRECTED** | `intake.sql:861` stores `pg_catalog.encode(extensions.digest(pg_catalog.convert_to(context->>'rawStoredSessionHash','UTF8'),'sha256'),'hex')`. That equals the canonical viewer hash, `sha256(sessionId,'utf8')` in hex (`express.ts:101-114`, `:179-181`, `:200-202`). `extensions.digest` is in the EXECUTE callee check. `events.actor_id` is intentionally distinct (comment at `:873-874`). The control (`mjs:1009-1019`) asserts that the Early Access viewer finds its own row and that no request stores a raw key. That control depends on the candidate `customer_status` wrapper (R3C-4) |
| TC-2 | CORRECTED | The blanket refusal is gone. Precheck and postcheck run the install's exact currentness gate before the absent/present branch, and accept exactly five intake signatures. Both sequences are authored (`mjs:1349-1350`). Execution is still masked by TC-21 |
| **TC-3** | **PARTIAL** | All intake-owned SQL is qualified; only the grammar keywords `numeric`, `boolean` and `integer` remain. The digest is rebound. But the required shadow-domain negatives cannot pass (R3C-1) |
| TC-4 | CORRECTED | Distinct closed markers: INVALID_INPUT, CATALOG_CHANGED, TERMS_CHANGED and UNAVAILABLE under 55000; RETRYABLE under 55P03; IDEMPOTENCY_CONFLICT under 23505. The adapter (`quick-order-repository.ts:313-333`) maps them per doc 83 §2, only after a confirmed abort; unknown or misplaced markers give OUTCOME_UNCERTAIN. The page releases the key for 422 and both 409s. Identity, session and snapshot lookups now use FOUND or count checks. The remaining `STRICT` sites are reachable only through an integrity breach. The price-race claim is refuted: the guard's exclusive gate lock conflicts with the intake's shared try-lock (`currentness.sql:1369`, `intake.sql:698`) |
| TC-5 | CORRECTED | A deterministic actor race with a `pg_locks` witness, shared-only and queued-writer try-lock controls, and reentrant counts, replay and retry (`mjs:1114-1183`) |
| TC-6 | CORRECTED | Exact readback against the payload, including the outbox recipient (`mjs:1020-1068`), plus eight more relation snapshots |
| TC-7 | CORRECTED | 24 negatives and 15 setting cases, each with a positive twin. Recovery is covered under `lock_timeout='0'` and without set role. An unknown session gives INVALID_INPUT |
| TC-8 | CORRECTED | A valid-stamp disabled-factory control: no armed attempt, `privateContextFor` never invoked, and the commit refuses with the exact message (`QuickOrderApp.composition.test.tsx:732-800`). The zero sentinel is commented (`production-deps.ts:137-139`) and proven to refuse, which meets the doc 83 ruling |
| TC-9 | CORRECTED | On token expiry the credential is suspended and the key and attempt are kept. They are cleared only on sign-out, password recovery, a different user or unmount (`App.tsx:91-127`, which I read). Controls are at `:498-628`. The data-retention limit is undisclosed (R3C-5) |
| TC-10 | CORRECTED | `AdminAssistedOrderSession.test.tsx` is restored byte-identical to the accepted `25858ad` blob `951e3630` (+120/−0). **Authority:** the board record `TC10_ACTUAL_DELEGATED_CONTROL_DISPOSITION_20261011.json` (`02cb909`) selected restoration plus a route-control disposition under your ordinary nonprotected-test delegation, with lease `f57c582d`. **Route:** `App.routes.test.ts` is unchanged (`7acd744a`), its disposition is in all four records, and the replacement control is at composition test `:827-839`. The board record names the wrong blob for the route file (R3C-6) |
| TC-11 | CORRECTED | All five baseline files are pinned in both receipts (section 2). The intake dependency is re-sealed to the amended receipt as NON_FINAL. The handoff claim is superseded in the correction map |
| TC-12 to TC-16 | CORRECTED | TC-15 is corrected within the builder's scope; the coordinator-state half is NOT PROVEN (R3C-6) |
| TC-17 | PARTIAL (carried) | The notification and protected `root-composition.test.ts` assertions are carried |
| TC-18 | Not corrected; **ruling: carry** | `session()` still admits actor forms the SQL later refuses (case-insensitive UUIDs, any `earlyAccessCustomerRef`), and recovery then returns 503. It fails closed, and canonical issuance does not produce those forms. I rule it a P3 limit carried to S3. One shared actor derivation remains the preferred fix at the next touch of `production.ts` |
| TC-19 | CORRECTED | The authority provenance is bound. The lease gap is R3C-4 |
| TC-20 to TC-28 | Carried | S3: TC-20 to TC-25 (**TC-25:** `App.tsx` blob `b5cc8edc` needs its protected-change disposition before integration or qualification). TC-26 has a records disposition. S4: TC-27 and TC-28 |

## 2. Currentness receipt confirmation (TC-11)

**What changed** (`git diff dcf8963..fa1286a8`):
- The receipt went from blob `25931c42` (100,942 B, FINAL) to `1cbdb0d8` (209,031 B). Its raw SHA-256,
  `04518cab0eea13dc73a31a3f64db5e44c8878dda80df2422870ce071c795fd49`, is one I computed myself.
- Its header was rebased from `264e6af`/`75911334` to `a044293`/`f80dc744`.
- `sourceAcceptance` went to PENDING/null.
- 16 rows were added (the five TC-11 baseline rows plus 11 composition rows), 12 non-currentness rows were rewritten to
  revision 3 bytes, and 74 are unchanged.
- No commit after `dcf8963` touches any currentness file.

**What I verified:**
- **All 102 pins match in both receipts.** For each receipt I recomputed every `sha256lf` pin against its `sourceCommit`
  (`a044293`) bytes: zero mismatches. The two receipts have the same path set and identical pins.
- **The accepted currentness source is bound unchanged.** The five currentness pins equal the doc 81/82 accepted
  values: `d44974d1…`, `91ab412b…`, `78534251…`, `8de55983…` and verifier `6c47b308…`. The definition `8b631a83…` is
  unchanged.
- **The baseline dependencies are present.** These are the bridge disposable bootstrap and the four quote migrations
  (`quote_payment_guard`, `quote_access_finance_bound`, `quote_audit_store`, `quote_history_reissue`), alongside the
  existing cart bootstrap row.
- **The intake receipt** (blob `7a09060c`, 221,027 B, raw `1fd4e56b…`) binds the currentness dependency to `1cbdb0d8` /
  `04518cab…` / 209,031 B, with definition `8b631a83…` and accepted source `264e6af` / `29ccf64`. Its status is
  `PENDING_ORIGINAL_AMENDED_RECEIPT_BYTE_CONFIRMATION`.

**Conclusion.** The records-only successor faithfully binds the accepted currentness source and every required baseline
dependency. Its non-currentness rows are identity bindings only, not acceptance (doc 82 YV-1). The change is records-only
for code, but it is a whole-delta rebind rather than an add-rows amendment. `1cbdb0d8` therefore cannot itself be the
executable receipt, because the accepted verifier requires `SOURCE_ACCEPT_WITH_LIMITS` (`:2077`).

**The finalization successor** may differ from it only in two respects:
- `sourceAcceptance.{status, reviewCommit}`, set to `SOURCE_ACCEPT_WITH_LIMITS` / `29ccf64` (doc 82), plus one label
  noting that this doc 87 confirmed the binding;
- any pin rows that revision 4 legitimately changes (section 3).

It must stay under the verifier's 262,144 B cap; 53,113 B remain.

## 3. Intake seal

**Not yet.** These are the conditions, in their cheapest order:

1. **Revision 4 changes two files that both receipts pin:** the intake verifier (R3C-1) and the composition test (doc
   90's DC-1). Finalizing now would only have to be redone.
2. **After the revision 4 records rebind:**
   - **My pin re-confirmation:** a byte check, not a review. I recompute every pin and confirm that the five currentness
     pins and `8b631a83` are unchanged.
   - **Then, with no further review:** the currentness receipt finalization successor (section 2), then the intake's
     currentness dependency seal set to FINAL against that blob and `8b631a83`. Doc 82 already permits both steps; this
     record confirms the bytes they bind.
3. **The intake's own source seal stays NON_FINAL** until the composition is accepted after revision 4.
4. **TC-21 (S3).** Binding the descriptor will change the currentness definition and force a re-seal then.

Receipt confirmation is not acceptance of the whole transaction. Source acceptance is not qualification or readiness to
activate.

## 4. Corrections

**R3C-1 (P2, S2; owner: builder `01a10d78`). The TC-3 shadow-domain controls can't pass, because canonical callees
resolve shadowed types.**

The three negatives at `mjs:1070-1105` each assert that exactly one marker NOTICE appears. Their call graphs reach
canonical functions that resolve unqualified type names, and when `pg_temp` is not listed in `search_path`, PostgreSQL
searches it first for types:
- **Admin and replay** (`intake.sql:178`, `:296`) reach `admin_get` → `admin_json` → `documents_json`. In
  `bridge:457-478`, which I read, that function is `LANGUAGE sql` with `SET search_path = public`, so it is not inlined,
  and it evaluates `'[]'::jsonb`.
- **Commit** reaches the same path through its final replay. It also reaches `research_domain_readiness` (`v_keys
  jsonb`, `'[]'::jsonb`), and through the lot helper, a `::date` cast.

The correction map's "zero additional marker notices" (`:12296`) and "three type names" (`:11927`, while four domains
are created) overstate what holds.

**Where this comes from.** Doc 83 required these negatives without noting the canonical callees, so part of the defect
is my specification. The intake code itself is clean. The exposure predates this work: it already exists in canonical
SECURITY DEFINER functions that `service_role` can call directly, and the intake adds no new reach.

**Ruling: use option (b), the carve-out.**
- Re-author the three controls to attribute each marker NOTICE to its innermost frame through the captured CONTEXT.
- Assert that no marker comes from an intake-owned frame (the five intake functions and their DO blocks), against an
  explicit allowlist of canonical frames.
- Cover every non-keyword type name the intake uses, or record the coverage limit accurately.
- Correct the map.
- Carry the canonical CS-2-class exposure as a named item for the canonical owner. The affected functions are
  `admin_get`, `admin_json`, `documents_json`, `research_domain_readiness`, `research_lot_is_allocatable`,
  `research_lot_quality_ready`, and the trigger functions on the five write targets.

Do not silently relax the assertion. Option (a), qualifying the canonical callees, needs separate canonical authority
and is not required for this acceptance.

**Fold into the same revision 4 (P3):**
- **R3C-2 (builder, records).** Enumerate the receipt delta in the current reconciliation block. Record the
  finalization constraint from section 2, and correct the "only added rows" wording.
- **R3C-3 (builder; fold in, since the verifier changes anyway).** The intake verifier checks the dependency receipt's
  identity and `sourceTree` for format only. Add a `git show` comparison of the receipt blob, hash and length, and a
  `rev-parse` tree check, each with one-value negatives. Otherwise record both as unenforced.
- **R3C-4 (builder, records):**
  - Relabel the TC-1 control as a "candidate `customer_status` wrapper over canonical M71" and disclose its coupling.
  - Disclose the supervisor pair in the frozen range.
  - Add leases `ddc54431` and `f57c582d`.
  - Make the revision numbering monotonic; it currently runs 3, then 2.
  - Cite doc 83 TC-8 for the zero-sentinel ruling.
  - Add named limits for:
    - the integrity-only `STRICT` sites;
    - the decoder-to-canonical-CHECK parity assumption;
    - configuration mismatch surfacing as a 422.

    **Ruling on the 422:** a binding not owned by the configured owner is an eligibility refusal under doc 83 §2. A
    server-wide misconfiguration is an operator matter for TC-28's S4 operator signal.
- **R3C-5 (integrator `01a0e098`; optional):**
  - Label the route control as a source-text contract.
  - Add page controls showing that 409 `catalog_changed` and `terms_changed` release the key, and that 409/422 in the
    unknown state keep it.
  - Add the TC-9 named limit: same-account personal data stays in page memory after token expiry until sign-out,
    recovery, an account change or unmount.

**Resolve with revision 4: doc 90's DC-1 (integrator, with a coordinator record).** The composition test pins the old
ProductPage blobs, which D56C2 changes. Since revision 4 rebinds the receipts anyway, resolve it there, so receipts are
confirmed and finalized once.
- **Recommended:** remove the two ProductPage identity rows from the composition test, keeping the other six, with a
  records disposition naming doc 90 as the governing review for those paths. This works in both trees and needs no
  merge.
- **Alternative:** re-pin the rows to `3df04f38…`/`ad27b8ee…`. Do this only if revision 4 is assembled on a tree that
  contains D56C2; otherwise the test fails in the composition's own tree.

**Coordinator: R3C-6 (P3).** Record an erratum in the TC-10 authority record: the App.routes.test.ts blob is
`7acd744a`; `80265859` is the composition test. Also align the TC-15 coordination state.

**Supervisor workstream: R3C-7 (P3, S3).** The in-tree qualification manifest still pins the superseded route contract
and the old receipts. Rebind it when qualification opens.

**Rejected:**
- The price race (refuted).
- The destination-region and quantity half of R1-2, which preflight already maps.
- R2-1's unreachable checks.
- R2-3 (the namespace spy is the documented pattern).

## 5. Next steps (nothing here authorizes tests, SQL, installation, a push or deployment)

1. **Builder:** revision 4 covering R3C-1 (b), R3C-2, R3C-3 and R3C-4. No SQL, adapter or client change.
2. **Integrator:** the DC-1 rows in the composition test (the recommended form), plus the optional R3C-5 fold-ins.
3. **Both:** rebind the pins in both receipts and register revision 4 for a bounded delta check limited to the above. I
   will turn it around as a narrow check plus the pin re-confirmation.
4. **Then:** the currentness receipt finalization successor and the intake dependency seal FINAL (section 3).
5. **You or the coordinator:** the TC-25 protected-change disposition for `App.tsx` `b5cc8edc`, before integration or
   qualification.
6. **Qualification (S3):** separately approved, on the current transaction. That covers a durable save, same-key
   concurrency and recovery, conflict refusal, rollback, authorized readback and unauthorized denial, with TC-21's
   descriptor binding and re-seal.
