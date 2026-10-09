# Transaction design records r2 (builder `39203461`): review against doc 73

**DESIGN COMPATIBLE WITH CONDITIONS. No design revision is required. No P0, P1 or P2 remains.**

All four of doc 73's P2s are closed in the records (CC-1 to CC-4). CC-1's closure depends on your decision 3: r2
registers "a material write holds Quick Order until a separate re-activation" as an unresolved decision-3 choice and
says the design returns for revision if you decline it.

Twenty P3s remain:
- **Four (R2-1 to R2-4) must be corrected in the records before your decision-5 and decision-3 texts are final.** They
  fix the accuracy of the draft grant text and the decision-3 register. They need a byte check from me, not another
  design review.
- **Sixteen (R2-5 to R2-20) travel as named conditions into the source successor,** alongside doc 73's six permitted
  carries.

I also make two design rulings that doc 73 left to me: the intake takes the shared gate as a try-lock (CC-18), and a
definite retryable refusal maps to the existing "temporarily unavailable" response with the key kept (CC-10).

This review grants nothing. It is not your approval of any source, stock or operating decision, and it is not an
exclusive lease. The grant text remains a DRAFT. r2 stays frozen, LOCAL ONLY and NOT RUN. Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task `DOC71-TRANSACTION-DESIGN-DELTA-REVIEW-20261009` **revision 2**,
registered at coordinator `a1beaf9`, acknowledged at `5d8d729`.

**Target**, recomputed from Git:

| Record at `39203461eaed6ee6284a0d7a597feb9c74c9a39a` (tree `dad34b25…`) | Blob | Raw SHA-256 |
| --- | --- | --- |
| `DOC71_TRANSACTION_DESIGN_DELTA_20261009.md` | `cc4ad17` | `4e8a23b6…` |
| `evidence/doc71-transaction-design-delta-20261009.json` | `0b5b1f9` | `a065a04e…` |
| `evidence/doc71-transaction-design-bindings-20261009.json` | `8d7eaf2` | `ae929902…` |

- **Handoff.** The handoff `301d9b08` changes only `.xenios/` continuity files.
- **Scope of the change.** `39203461` changes only the three records, and no `supabase/`, `server/`, `client/` or
  `shared/` byte differs from `25858ad`.

**Method.**
- **Four read-only lenses,** each with an adversarial verifier:
  - authority, activation and isolation;
  - locks, gate and writers;
  - scope, fingerprint and guard cost;
  - records, scope and grant.
- **A completeness critic,** which resolved the disagreements.
- **My own checks** against Git:
  - the publish and revoke function names (R2-1);
  - your scope's "not a second catalog or legal registry" statement (R2-3);
  - the revocation pointer at S0 (R2-5);
  - the decision-3 entry and the conflicting refusal lines (R2-4).

**Disclosures.**
- **Commands.** Every agent listed its deviations: shell builtins (`cd`, `echo`, variables, loops), text utilities
  run on file paths rather than over pipes, and one `2>/dev/null` and one `2>&1` stderr redirect.
- **Documentation lookups.** Two lenses used ToolSearch to load WebFetch, then read six PostgreSQL documentation pages.
- **What did not happen.** No file was created, modified or deleted; I re-checked the scratch folder, `AppData\Local`
  and the review worktree. No interpreter, SQL, database, MCP tool or repository write was used.
- **PostgreSQL claims.** All are reasoned from documentation, NOT RUN.

Lens output is archived as `hl12/75_doc73_r2_records_lens_findings.json`.

## 1. Doc 73's findings in r2

| State | CC items |
| --- | --- |
| **CLOSED in records** | CC-1 (conditional on decision 3), CC-2 to CC-6, CC-8, CC-9, CC-12 to CC-14, CC-16, CC-19 to CC-29 |
| **PARTIAL** | CC-7 (wrong function names, R2-1; no authored controls, R2-14) and CC-15 (the PostgreSQL version pin was dropped, R2-17) |
| **CARRIED as doc 73 allowed** | CC-10, CC-11, CC-17 and CC-18, plus CC-12's fixture and CC-15's type qualification |

**Doc 71:**
- CLOSED in records: C-1 to C-7, C-9, C-10, C-12 and C-15 to C-26. C-1 is conditional on decision 3; C-3 rests on
  reasoning, NOT RUN.
- PARTIAL: C-8 and C-13, through the permitted carries; C-11, because r2's own new refusal sources are not registered
  (R2-4); and C-14, where only the measured cost remains, under decision 3 and qualification.

**How the four P2s closed:**

**CC-1, the hold on every material write.**
- **Registration.** It is now an explicit UNRESOLVED decision-3 item (`R2_DELTA.md:196`, `:334-339`;
  `R2_DELTA.json` decision3). The platform consequence is stated.
- **No consent inferred.** r2 says your earlier advance-epoch approval does not cover the hold, and selects no split
  counters.
- **The dependency.** The CC-29 invariant is recorded: declining the hold requires FOR SHARE parent classification and
  a new writer-order proof (`:704`).
- **The condition.** If you decline it in decision 3, the design returns for revision.

**CC-2, revocation.**
- **Revoke.** It takes no table locks (`:659`, `:666`).
- **Publish and activation.** They keep the 12 SHARE NOWAIT locks as a stated quiescence requirement and refusal
  source.
- **Waits and stalls.** Gate and head waits are bounded by an approved lock timeout, and absent values refuse. The
  platform DML stall is recorded.

**CC-3, isolation.**
- **The rule.** The guard raises 55000 for any writer not at READ COMMITTED, before any classification, including on
  bypass paths (`:643-649`). This is the existing pattern at `intake.sql:341@25858ad`.
- **Controls.** REPEATABLE READ and SERIALIZABLE controls are named.

**CC-4, the scope binding.**
- **The materialisation.** One sealed, indexed, per-revision scope materialisation built at publish (`:685-690`).
- **One resolver.** It is shared by the commit and the guard (`:692-694`).
- **Failure location.** An unresolved identifier fails publication, not platform writers.
- **Remaining elements.** OLD-parent provenance from the sealed rows, a cascaded-delete policy, and detection of new
  descendants (`:696-702`).

## 2. Corrections before your decision texts (P3, verified, not carried)

**R2-1. The publish and revoke amendments name functions that do not exist.**
- **The error.** r2 names `research_health_quick_order_currentness_publish_revision` and
  `..._currentness_revoke_revision` (`:658-659`; JSON namedAmendments).
- **The real objects.** At S0 they are `public.research_health_quick_order_publish_revision(jsonb,text)` and
  `public.research_health_quick_order_revoke_revision(uuid,text)` (`currentness.sql:498`, `:531@25858ad`), pinned by
  exact name in the fingerprint (`:53-54`). r2's own slice row uses the correct names.
- **The fix.** Correct both names. State one lock order for publish and activation, or say order is immaterial
  because every acquisition is NOWAIT.

**R2-2. Part 2 omits one new amendment.**
- **The gap.** The head-trigger gate check amends the existing, fingerprinted
  `research_health_quick_order_currentness_monotonic_epoch()` (`currentness.sql:385@25858ad`; `R2_DELTA.md:661`). It
  is neither flagged as Part 2 new scope nor given a Part 1 basis.
- **Stale tags.** Two per-path "Part2 private context" tags carried over from r1.
- **The fix.** Add the amendment to Part 2 as new scope, and relabel the two tags.

**R2-3. The scope-input carrier departs from your approved scope without saying so.**
- **What it stores.** The new carrier keeps the raw bytes of all five artifacts, Health legal and reconciliation
  included, and publish parses them (`:679-683`).
- **What it reverses.**
  - Your scope `1d4f2c3` says the currentness relations "are not a second catalog or legal registry" and that file
    authority is a separate set (`QUICK_ORDER_SUPPLEMENTAL_SCOPE_20261006.md:133-134`, `:244-251`).
  - The S0 header says "normalized decision-input metadata only" (`currentness.sql:4`).
  - The S0 validator comment says "SQL does not read or approve those artifacts" (`:126`).
- **What is missing.** Health legal and reconciliation contents have no stated role, and there is no size bound.
- **Why P3, not P2.** The carrier is listed as Part 2 new scope, so you would be asked about it, and any divergence
  fails closed. What is missing is the plain statement that it reverses your earlier boundary.
- **The fix.** Either narrow the carrier to the artifacts the materialisation actually reads, with closed field paths
  and SHA-256 checks; or keep all five and disclose the departure as an explicit Part 2 item. In both cases, bound the
  size.

**R2-4. r2's own new consequences are missing from the decision-3 register.** The decision-3 row (`:196`) and the JSON
entry leave out or understate:
- **(a) Isolation refusal reach.** The guard's non-READ COMMITTED refusal applies to every guarded statement,
  including out-of-scope, equal-projection, quantity-only and zero-row statements.
- **(b) Missing writer limits.** A missing or invalid writer limits profile refuses every material platform write
  (also before any publication) and refuses revoke. `:393-394` says missing values affect only "new saves and
  activation", which contradicts `:421-425`.
- **(c) Cascades and closure changes.** The cascade refusal, and the fact that any new or deleted in-scope lot or COA
  document needs a new revision, decision text, publication and receipts before saving resumes. JSON says only that it
  "can require" this.
- **(d) A foreign gate holder.** Revocation assumes no foreign holder of the gate key.

No value is chosen anywhere. **The fix:** add (a) to (d) to the decision-3 text, make `:393-394` agree with
`:421-425`, and add the writer-profile refusal to the event matrix and guard checks. The coordinator may reconcile the
same list into its existing decision-3 row, which `RECOVERY_DECISIONS_20261007.md` at `707cc99` does not yet carry,
without asking new questions.

## 3. Named conditions for the source successor (P3, verified, carried)

**Activation, timeouts and the gate**
- **R2-5. A revoked revision is still activatable.** Revoke leaves `last_published_revision_id` unchanged
  (`currentness.sql:543-545@25858ad`), and activation never tests for revocation.
  - **Required in source:** activation refuses a revoked revision and keeps an immutable revocation history, unless you
    register that choice otherwise.
  - **Also:** reword `:705-706`, which the S0 head CHECK makes unsatisfiable as written.
- **R2-6. Zero timeouts are no longer refused (a regression from r1).** Restore "absent, zero, too-large or
  unrecognized refuses" for each effective timer, and compare `lock_timeout < deadlock_timeout` only between positive
  values.
- **R2-7. Two timeout relations are unstated.**
  - `lock_timeout < deadlock_timeout` must bind the intake profile.
  - Add the relation that the revoke, publish and activation gate-wait bound is at least the intake total-hold bound,
    or register that revocation may refuse under intake load.
- **R2-14. The gate amendments lack controls, and one claim overstates.**
  - Name the gateless-head-UPDATE, lock-predicate, open-DML revoke, NOWAIT-refusal and exception-discipline controls
    in the verifier row.
  - "Never accept a session-level gate" cannot be detected. Reword it to "excluded by the sealed bodies".

**Guard, scope and fingerprint**
- **R2-9. The isolation controls are incomplete.**
  - Bind them to the verifier row.
  - Add READ UNCOMMITTED, and add out-of-scope, equal-projection and zero-row cases.
  - Reword the rollback claim: an uncaught 55000 aborts the transaction.
- **R2-15. The child-classification rules disagree in three places.**
  - State one rule per child relation.
  - A visible parent with null or out-of-scope identity resolves OUT.
  - Choose a hold rather than a refusal for unresolvable cascades, or register the refusal.
- **R2-16. Several contracts are imprecise.**
  - Enumerate the resolver's operations.
  - Name the BEFORE INSERT refusal that applies once a header exists.
  - Pin one lot and document derivation.
  - Name the intake check of the scope header, and the cheap check's seal comparator.
- **R2-17. Pin the qualified PostgreSQL version** in every phase's integrity check. This was dropped from doc 73's
  CC-15 fix.

**Limits, time and identity**
- **R2-10. The limits carrier is incomplete.** Name where the expected configuration digest is read at runtime, and
  define the writer profile independently of an authority revision. Add a structured JSON mirror.
- **R2-11. Timestamps depend on session settings.** Every preimage timestamp needs one fixed UTC rendering at
  millisecond precision. Enumerate the columns written with `decisionAt`.
- **R2-8. The CC-10 mapping.** It is ruled in section 4.

**Writers, records and exclusions**
- **R2-12. The writer census is incomplete.** Add:
  - `service_role` direct writes on product content;
  - default privileges;
  - the DO-batch initializer;
  - a non-writer lock-participant class: the persistent-cart blocking SHARE table locks and member FOR UPDATE, and
    fulfillment lot FOR UPDATE.

  Each cycle found fails closed.
- **R2-13. Order the seal and bindings records.**
  - Choose one reading of the intake seal (embedded or external) and order currentness acceptance, then its receipt,
    then the intake seal and receipt.
  - Keep the shared bindings record free of successor digests.
- **R2-18. Three labels overstate.**
  - The "Approved" recipient carrier.
  - The per-path `existingLease`.
  - "Now refreshed", which is true only at `301d9b08`.
- **R2-19. Name the dispatch paths and the type importers.**
  - Name `communications.ts`, `outbox.ts` and `research-notification-outbox.sql` verbatim.
  - Add `core.d.mts` and `handler.d.mts`.
  - Add an export-stability condition for Quick Order `ports.ts` types.
- **R2-20. Remove the stale intermediate `workingRaw` hashes** from the bindings' r1 section.

**Doc 73's six permitted carries continue as named conditions:** CC-10, CC-11, CC-12's fixture, CC-15's type
qualification, CC-17 and CC-18.

## 4. Reviewer rulings

These are design rulings by the original reviewer, not your approval, and they choose no operating value.

**CC-18: adopt the try-lock.**
- **The change.** The commit takes the shared gate with
  `pg_catalog.pg_try_advisory_xact_lock_shared(integer,integer)`. A false result refuses as
  DEFINITE_REFUSAL_RETRYABLE, with the key kept and no retry inside the body. Exclusive paths keep their bounded
  waits.
- **Why** (reasoned from documented behaviour and the lock manager, NOT RUN):
  - Under the single-epoch model, any committing exclusive holder invalidates a waiting intake anyway.
  - The blocking wait was the intake's only way into gate cycles, including the R2-12 cart and fulfillment cases.
  - A fresh request behind a queued writer is still refused, so the anti-bypass property holds.
- **The cost.** Refusals in windows where the exclusive holder later aborts. They count against your decision-3
  refusal budget.
- **Required controls.**
  - A queued writer plus a fresh intake: refused.
  - An exclusive holder present: refused.
  - Only shared holders: granted.
  - An abort window: refused and retryable.
  - A reentrant request never counts as admission.
- **Placement.** This stays inside the 17 paths.

**CC-10 and R2-8: a definite retryable refusal maps to the existing 503 `temporarily_unavailable`, with the key kept.**
- **Why.** The unchanged page clears the attempt only on 409 or 422 and treats every other status as "could not
  confirm" with the same key. A same-key retry after a confirmed abort is therefore safe: replay finds no saved request
  and the retry proceeds. The "could not confirm" wording is imprecise but safe.
- **A correction to doc 73.** This supersedes the CC-10 wording "reserve 503 for genuinely uncertain outcomes", which
  conflicted with doc 71 C-8 and the unchanged page. Any page or handler change would be new scope.

**Publish and activation table locks.** Keeping all 12 relations, as doc 73 asked, stands. Narrowing them is not
required.

**R2-1 to R2-4.** The same builder corrects them in a records-only errata, which I check byte for byte against this
doc. In parallel, the coordinator may reconcile the R2-4 items into its decision-3 row. The decision-5 grant text must
not be put to you until R2-1 to R2-3 are corrected.

## 5. Smallest next builder assignment

**Who.** The same builder, session `codex-health-quick-order-20261005`, under its current records ownership.

**What.** A records-only errata to the three records, from `39203461` on `25858ad`, limited to:
1. **R2-1:** the correct S0 publish and revoke names, and one stated lock order.
2. **R2-2:** the head-trigger gate-check amendment added to Part 2, and the two tags relabelled.
3. **R2-3:** narrow or disclose the scope-input carrier, with a size bound.
4. **R2-4:** complete the decision-3 items, fix `:393-394`, and add the writer-profile refusal to the event matrix and
   guard checks.
5. **Optional:** the R2-18 and R2-20 wording.

It changes no implementation, SQL, test, verifier, supervisor, manifest or schedule byte, and executes nothing. It does
not reopen the design. I return a byte check, not a new review.

**What can start now, without waiting for the errata:** presenting decisions 2, 3 and 4 to you. The errata gates only
the final decision-5 text.

## 6. Prerequisites that remain

**Source**
1. My byte check of the R2-1 to R2-4 errata.
2. Your class-3 source decision (existing decision 5). The grant text is a DRAFT.
   - **Part 1 confirms, without re-issue,** the `dc3329b`/`1d4f2c3` drafting: the guard and its 12 IN triggers, the
     authority reader and the commit body.
   - **Part 2 covers only new scope:**
     - the intake-family gate, limited to the commit and guard names;
     - the commit host and signature;
     - the strict reader;
     - owner-only activation and its relation;
     - the publish and revoke amendments under their correct names;
     - the head-trigger gate check;
     - the publication and activation table locks;
     - the scope-input carrier as narrowed or disclosed, the sealed materialisation and the shared resolver;
     - census-order conformance;
     - generic fail-closed authoring.
   - **Exact paths:** the 17 plus the 4 evidence records, with every exclusion named verbatim.
3. Only if the writer census shows a violator: one exact additional writer path and its owner decision. None is shown
   today.
4. Later and separate:
   - the `express.ts` session seam;
   - the protected root;
   - decision 6 (`8396609`) for readback acceptance;
   - all SQL, test, native, qualification, installation, activation, push and deployment authority.

**Stock and policy** (no values chosen here)
1. **Decision 2,** the stock predicate (any allocatable witness, or sufficient quantity), before any body.
2. **Decision 3,** operating budgets. Accepting or declining the CC-1 hold decides whether this design stands. The
   register must also carry:
   - the publish and activation quiescence refusal and the platform DML stall;
   - the pre-publication global hold;
   - seal coupling and the platform-writer blast radius;
   - the TRUNCATE seed refusal;
   - the R2-4 items: the isolation refusal reach, missing writer limits refusing platform writes and revoke, the
     cascade refusal, closure changes needing a new publication, and the foreign gate holder;
   - the intake and writer wait, hold and refusal budgets, including try-lock refusals;
   - the timeout relations (R2-6, R2-7) and the total-transaction mechanism from the deployment and connection owner;
   - first-lock-wins for each revocation path;
   - whether an app disable precedes revocation.
3. **Decision 4,** the class-4 values and the complete Health legal set including XR-LEGAL-14, plus the limits
   carrier values, the TimeZone profile, and the operator-recipient value and its approval. These are needed for the
   real S, not for the disabled slice.

**Ownership**
1. **An exact-path exclusive lease** for the 17 source paths plus the 4 evidence paths, recorded in the coordinator
   registry. None exists at `707cc99`, and lease 17093695 now covers records only.
2. **Confirmed path owners.** The coordinator confirms each path's current owner.
3. **The Phase Zero rule** needs a disposition only if `assisted-order/ports.ts`, `express.ts`, `service.ts`,
   `supabase-repository.ts`, `communications.ts` or `outbox.ts` is added. None of the 17 is in it.
4. **The HL12 owners' acknowledgment,** only if their paths are touched. Whether the two assisted-order regression
   tests fall under HL12 is NOT PROVEN; check before dispatch.

## 7. Disposition

- **DESIGN COMPATIBLE WITH CONDITIONS.** No P0, P1 or P2. All four doc 73 P2s are closed in records, CC-1 conditional
  on decision 3.
- **What it enables under existing authority.**
  - The builder may prepare the R2-1 to R2-4 errata.
  - The coordinator may reconcile decision 3 from this list and present decisions 2, 3 and 4 together without new
    questions.
  - Once the errata passes my byte check, the coordinator may present decision 5 with the corrected Part 1 and Part 2
    text.
- **What it does not do.** It grants no source permission, stock or operating decision, lease, execution or
  deployment. The grant text remains a DRAFT. The 16 carried P3s and doc 73's six carries become acceptance criteria
  for the implemented source.
