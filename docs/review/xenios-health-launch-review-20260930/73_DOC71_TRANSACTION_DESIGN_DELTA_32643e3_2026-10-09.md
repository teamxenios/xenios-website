# Transaction design delta (builder `32643e3`): review against doc 71

**REVISION REQUIRED: a narrow, records-only r2 of the three delta records. The protocol core is DESIGN COMPATIBLE.
No P0 or P1.**

The delta closes most of doc 71 in records:
- **C-4.** All four payment files are excluded.
- **C-5.** The commit host, signature and a fingerprint-bound gate are named.
- **C-26.** The trigger mechanics are legal PostgreSQL.
- **C-12 and doc 69 A-1.** The conformance rule is in place, and the order freezes the implemented code and all five
  approved inputs at one new S.
- **C-1's contract.** The strict reader, the activation tuple and the comparison are specified, including the doc 50
  HI-3 fix.

Four design-level P2s remain (CC-1 to CC-4). One is an availability consequence you have not been asked about. Two are
lock and isolation gaps that a records edit closes. The last is the builder's own open condition 1. There are 25 P3s.
The 17 paths are exact; whether they are sufficient is NOT PROVEN.

Nothing was executed. This review grants no source permission. The grant text in the delta is a DRAFT and is not
recorded anywhere as your approval.

Reviewer: this session, `claude-opus-5-5`. Board task `DOC71-TRANSACTION-DESIGN-DELTA-REVIEW-20261009` r1,
acknowledged at `e82a436`.

**Target.** Builder records `32643e3974f37a18ecb8768d97ec2fc0253248d3` (tree `c1ec92da…`), recomputed:

| Record | Blob | Raw SHA-256 |
| --- | --- | --- |
| `DOC71_TRANSACTION_DESIGN_DELTA_20261009.md` | `06b5380` | `72ec44ad…` |
| `evidence/doc71-transaction-design-delta-20261009.json` | `beb031d` | `9946b938…` |
| `evidence/doc71-transaction-design-bindings-20261009.json` | `8f927df` | `0bc0d65d…` |

- `32643e3` adds only those three files, and no `supabase/` or `server/` byte changes between `25858ad` and the
  builder handoff `45a30bd`.
- The coordinator request at `52bd180` pins the same blobs and keeps the builder's three conditions as retained
  conditions.

**Method.**
- **Three read-only lenses,** each with an adversarial verifier:
  - the authority reader, activation and guard;
  - locks, starvation and timeouts;
  - scope, commit host, slice and sequence.
- **A completeness critic,** which resolved lens disagreements and added CC-19.
- **My own checks.** I confirmed CC-1 to CC-3 against Git objects myself.
- **Disclosures.** One verifier created two helper files in this reviewer's scratch folder and deleted them. The critic
  ran one `node -e` JSON parse of my scratch copy of the delta JSON. No repository was written, and no repository code
  was executed.
- **PostgreSQL claims.** All are reasoned from documented behaviour, NOT RUN.

Lens output is archived as `hl12/73_doc71_design_delta_lens_findings.json`.

## 1. Closure against doc 71

| Doc 71 item | State |
| --- | --- |
| C-1, authority read and activation | **PARTIAL.** The contract is closed: a named private strict reader returning exactly `{state, revisionId, writerEpoch}`, called again after the head lock with byte-exact equality and no retry; each line's `authorityRevisionId` equals that revision; owner-only activation authored as source, never invoked, head stays held; a strictly larger epoch for any state or pointer change closes doc 50 HI-3. The liveness model is open (CC-1) |
| C-2, guard privilege model | **PARTIAL.** The privilege model is closed: a definer guard owned by the common owner, empty search path, static SQL, no execute grants, always enabled, raising 55000 when the head is not visible; the 12 IN owners join the single-owner set. The isolation element of doc 71's fix is missing (CC-3) |
| C-3, head starvation | **PARTIAL.** The fair gate is closed as reasoning: advisory key `(1380471107,1)`, intake's shared form immediately before its head share lock, the exclusive form before every head update lock, one global order. Revoke's new table locks reopen the bounded-revocation premise (CC-2). Writer order, the total timeout and gateless head writers stay open (CC-5 to CC-7) |
| C-4, payment files | **CLOSED.** Export-stability caveat in CC-27 |
| C-5, commit host and gate | **CLOSED.** `public.research_health_quick_order_commit(jsonb)` in the existing intake candidate, with the candidate's refusal replaced by a fingerprint-bound gate for the commit and guard names only. Residuals in CC-14 |
| C-26, trigger mechanics | **CLOSED.** Single-event AFTER STATEMENT triggers per relation with their own transition sets, UPDATE without a column list, and a BEFORE TRUNCATE refusal. Refusal is stricter than doc 71's "advance" and follows the doc 49 correction at `462cf79`. Hardening in CC-15 |
| C-12 and the doc 69 A-1 sequence | **CLOSED.** Two steps are only implicit (CC-28) |
| C-7, witness locks and inventory | **CLOSED** for the reported reservation cycle; remaining cycles fall under writer order (CC-5) |
| C-18 and C-19, literal barriers and protected root | **CLOSED.** The test-only injection condition is in CC-22 |
| C-6, C-8 to C-11, C-13 to C-17, C-20 to C-25 | **PARTIAL,** each with a named finding below. C-14 carries the P2 CC-4; the rest are P3 |

## 2. Design findings (P2, verified)

**CC-1. A single guarded write would stop Quick Order until someone re-activates it.**
- **What the delta proposes.** Activation binds one epoch. Every material guarded write advances the epoch and
  sets the head to held. The delta states this openly (`DOC71_DELTA.md:286-295`): saving cannot resume until a
  separately authorised new activation.
- **Why that goes beyond your scope.** Your approved scope `1d4f2c3` (step 3,
  `QUICK_ORDER_SUPPLEMENTAL_SCOPE_20261006.md:179-180`) has participating writes advance the writer epoch. That
  invalidates intakes already in flight. It does not stop every later save.
- **The consequence.** Under the delta, any in-scope lot receipt, COA, price, content or alias write holds Quick Order
  until a re-activation with external receipts. No decision records this.
- **Smallest fix.** Register "a material write holds the head until a separately authorised re-activation" as an
  explicit item under the existing decision 3, with that consequence stated. No new question is needed.
- **Alternative.** Split an activation generation, which the tuple binds, from a writer epoch. That is safe only
  together with share-locked parent reads in child classification (CC-29).

**CC-2. Revoke's new table locks make revocation fail under ordinary traffic.**
- **What the delta proposes.** Publish, revoke and activation take SHARE NOWAIT on all 12 IN relations
  (`:570-578`).
- **Why revoke gains nothing.** Revoke changes no scope input. At S it changes only the state, active revision,
  revoked revision, reason and epoch (`currentness.sql:543-545@25858ad`).
- **The consequence** (reasoned from documented lock conflicts, NOT RUN). SHARE conflicts with ROW EXCLUSIVE (ordinary
  DML) and SHARE UPDATE EXCLUSIVE (autovacuum). With NOWAIT, revocation would fail whenever any of 12 busy platform
  tables has open DML. That reopens the bounded-revocation premise C-3 rests on.
- **A second problem.** Publish and activation also hold their 12 SHARE locks while they wait for the exclusive gate,
  which stalls platform DML for the length of that wait.
- **Fix.**
  - Remove the table locks from revoke only.
  - Keep them on publish and activation, where they prevent a stale-parent race (CC-29). State them as a quiescence
    requirement and a refusal source.
  - Take the gate after them with a bounded wait.
  - Record the platform DML stall under decision 3.

**CC-3. The guard has no isolation rule.**
- **The gap.** Only the reader and the commit refuse anything other than READ COMMITTED (`:241-243`, `:464`).
- **The failure** (reasoned, NOT RUN). Under REPEATABLE READ or SERIALIZABLE, a writer whose snapshot predates a
  publish and activation can classify a newly in-scope row as OUT, take neither gate nor head, and commit inside an
  intake's window. That is a guard-level fail-open. Doc 71's C-2 fix asked for this case to be covered.
- **Fix.** Before classifying anything, the guard either raises 55000 unless `transaction_isolation` is
  `read committed` (the existing pattern at `intake.sql:341@25858ad`), or treats every non-READ COMMITTED writer as IN.
  Add REPEATABLE READ and SERIALIZABLE controls.

**CC-4. Builder condition 1: the scope binding.**
- **The gap** (`:673-683`). Decision inputs carry opaque product and variant identifier strings
  (`currentness.sql:251-255@25858ad`). There are no lot, document, domain or country sets, and no provenance for an old
  parent after a delete.
- **Why it matters.** The guard's selectors and the commit's are authored separately, so diverging mappings could
  classify an in-scope write as OUT. Under the fail-closed rule (`:588-590`), an unresolved selector also refuses every
  material platform write once any revision is published.
- **Fix.** Define one sealed, indexed, per-revision product, variant, lot, document, domain and country
  materialisation, built at publish and fingerprinted. The commit and the guard both use it. An unresolvable
  identifier then fails publication, not platform writers. Specify old-parent provenance and a cascaded-delete policy.
- **What it blocks.** Only the guard's published-scope branch. It does not block the reader, activation, commit, the
  gate core, or the held pre-publication branch.

## 3. Other findings (P3, verified)

**Writer order, timeouts and the gate**
- **CC-5. The writer census is missing.**
  - It is required by item 8 and is broader than the builder states.
  - It must include the lots identity trigger's blocking shared readiness locks.
  - Every inversion found ends in deadlock detection, so it fails closed.
- **CC-6. The timeout mechanism is unnamed.**
  - It is named only as a class.
  - The narrow in-slice option, a `lock_timeout` in the function settings, is rejected without a reason.
  - The relation `lock_timeout < deadlock_timeout` is missing, and gate holders have no hold bound.
- **CC-7. The publish and revoke amendments are unnamed.**
  - The body amendments for `publish_revision(jsonb,text)` and `revoke_revision(uuid,text)` are not named.
  - Nothing refuses a head update from a backend that does not hold the exclusive gate. This affects liveness only,
    because intake's head share lock preserves safety.
- **CC-18. Consider a try-lock at intake.** Intake's blocking shared-gate wait rarely helps. I decide this at r2.

**Guard hardening and cost**
- **CC-8. The platform blast radius is unregistered.** Any seal drift, or a new column on a core relation, blocks all
  writes to it. Material writes take the gate before any publication exists. TRUNCATE-based local seeds break.
- **CC-15. Hardening is incomplete.**
  - Fingerprint predicates for the guard and its 47 triggers.
  - Relkind, inheritance, rule and subscription checks.
  - Schema-qualified types under the empty search path.
  - Controls for MERGE, writable CTEs and COPY.
- **CC-16. The forge wording is too narrow.** The Markdown names only a malicious superuser. Any session acting as the
  owner can forge activation.
- **CC-17. An alias-free legal-binding INSERT bypasses the guard** even when its reference is another row's alias.
  Later lookups fail closed.
- **CC-29. The child-classification invariant is unrecorded.** Classifying child rows from unlocked parent reads is
  safe only because a parent change holds the head and activation requires quiescence.

**Inventories and tables**
- **CC-9. The ordered lock table is incomplete.** It needs:
  - a writer-counterpart column with "none" justifications;
  - row 9's lock mode;
  - the actor and key derivation;
  - JSON rows.
- **CC-10. The refusal taxonomy has no error mapping.** There is no per-class SQLSTATE or `InputError(status, code)`
  mapping. A definite refusal therefore still shows the customer "could not confirm".
- **CC-13. Two inventory rows are wrong.**
  - The request INSERT trigger `research_assisted_order_paid_hold` is missing (benign in effect).
  - Row 15b places revision and source-version fields on canonical lines, which carry neither.
- **CC-14. Four commit-gate details are missing.**
  - The gate as a conjunction of the existing checks.
  - The source of the expected currentness seal.
  - The commit's execute grantee.
  - Rollback of the intake family before currentness.

**Time and identity**
- **CC-11. Lot readiness depends on the session TimeZone.**
  - Readiness casts to a date, so the result depends on the session TimeZone.
  - The written timestamps are not enumerated as `decisionAt`.
  - The Node `receivedAt` is not stated to be ignored.
- **CC-12. The per-line source version includes `catalogVersion`.**
  - That is against doc 71's resolution, and no reason is given.
  - The cross-runtime control has no fixture source.
- **CC-19. Approved limits have no named carrier.** Without one, a compiled value would be policy in source, and a
  session value is forgeable.

**Scope and records**
- **CC-20. Lease 17093695 does not satisfy C-16.** It is idle and broad. The coordinator registry at `52bd180` holds no
  exact-path lease.
- **CC-21. Exclusions are given by category, not verbatim.**
  - `legal.ts`, `provider-journal-http.test.ts` and `express.ts` are not named.
  - The authorised-but-absent modules have no disposition.
- **CC-22. Session context and viewer conditions are unstated.**
  - No server-only session fields are defined.
  - The records do not state that `assisted-order/ports.ts` and `AssistedOrderViewer` stay unchanged.
  - The extension is not stated to be test-only.
- **CC-23. The notification recipient has no carrier.**
  - The intake requires a recipient that the commit arguments do not carry.
  - There is no grant condition keeping dispatch unchanged.
- **CC-24. Three records are unbound.** The two verifier binding constants and the intake source receipt are not bound
  or mapped to successors.
- **CC-25. The `8396609` note is on the wrong row.** It belongs on the readback row, tied to decision 6.
- **CC-26. Draft Part 2 re-covers Part 1.** It re-covers items that belong under Part 1 and "releases" the
  review-held commit. That blurs the boundary C-25 protects.
- **CC-27. Export stability is not conditioned.** The excluded `supabase-repository.ts` imports two exports from the
  in-slice `quick-order-repository.ts`. A grant condition must keep their names, signatures and behaviour.
- **CC-28. Two doc 69 steps are implicit.** The manifest re-pin to the real S, and the class-4 artifact construction
  step, need to be stated.

## 4. The builder's conditions and the 17 paths

| Builder condition | What it blocks |
| --- | --- |
| 1. Scope binding (CC-4) | Design and drafting of the guard's published-scope branch only |
| 2. Transaction-wide writer order (CC-5) | Guard implementation eligibility and qualification only. It fails closed |
| 3. Trusted total transaction timeout (CC-6) | Operational admission only, outside the 17 |

**The 17 paths are exact.**
- They equal doc 71's list.
- Each exists at `25858ad` with the blob, size and hash in the bindings, and each is unchanged through `45a30bd`.
- None is protected, payment, session, inventory or Health configuration.
- None is in the coordinator's active Phase Zero ownership rule.

**Sufficiency is NOT PROVEN.**
- A writer-order violator could need an extra path. None is shown today.
- The export, viewer, recipient and `legal.ts` dispositions are missing (CC-21 to CC-23, CC-27).

## 5. Smallest next builder assignment

**Who.** The same builder, session `codex-health-quick-order-20261005`, under its existing records ownership of
`docs/health-launch/quick-order-20261005/**`.

**What.** A records-only r2 of the three delta records, from `45a30bd` on base `25858ad`. It changes no
implementation, SQL, test, verifier, supervisor or manifest byte, and executes nothing.

**Required, to close the four P2s:**
1. **CC-1.** Register the hold-until-re-activation consequence under decision 3, or specify the split counters together
   with share-locked parent reads (CC-29).
2. **CC-2.**
   - Remove the table locks from revoke.
   - Keep them on publish and activation as a stated quiescence requirement and refusal source.
   - Bound the gate wait that follows them.
   - Record the DML stall.
3. **CC-3.** Add the guard isolation rule, with REPEATABLE READ and SERIALIZABLE controls.
4. **CC-4.**
   - Specify the single sealed per-revision scope materialisation, shared by the commit and the guard.
   - Make an unresolvable identifier fail publication.
   - Specify old-parent provenance and the cascaded-delete policy.

**Bundled, because they are records-only and needed before any grant text is final:**
5. **Named amendments.** The publish and revoke body amendments, the gate check on head writers (CC-7), and the
   47-trigger fingerprint predicate (CC-15).
6. **The writer table.** The writer-counterpart table, which is also the item-8 writer census (CC-5, CC-9).
7. **The records-accuracy batch:** CC-6, CC-8, CC-13, CC-16, CC-19 to CC-28.

**May travel as named conditions into the source successor** if not done in r2: CC-10, CC-11, CC-12, CC-17, CC-18,
and CC-15's type qualification.

**What happens next.** Return r2 to me for review. No source body may be drafted from this review. The doc 74 native
record and the two-file supervisor amendment remain independent of this work.

## 6. Prerequisites that remain

This review grants nothing.

**Source**
1. My acceptance of the r2 records delta. This doc is the transaction verdict the coordinator register shows as pending
   at `52bd180`.
2. Your class-3 source decision (existing decision 5). The delta's grant text is a DRAFT, not approval. When you
   decide, the text should read:
   - **Part 1 confirms, without re-issue,** what `dc3329b` and `1d4f2c3` already cover: the guard and its 12 IN
     triggers, the authority reader, and the commit body in the intake candidate.
   - **Part 2 covers only new scope:**
     - the intake-family gate, limited to the commit and guard names;
     - the commit host and signature;
     - the strict reader, the owner-only activation and the activations relation;
     - the publish and revoke amendments, and the publication and activation table locks;
     - any CC-4 scope-materialisation schema;
     - the census-order amendment;
     - generic fail-closed authoring.
   - **Exact paths:** the 17 plus the 4 named evidence records, with every exclusion named verbatim.
3. Only if the writer census shows a violator: one exact additional writer path and its owner decision. None is shown
   today.
4. Later and separate:
   - the `express.ts` session seam;
   - the protected root;
   - decision 6 (`8396609`) for readback acceptance;
   - all SQL, test, native, qualification, installation, activation, push and deployment authority.

**Stock and policy**
1. **Decision 2,** the stock predicate (any allocatable witness, or sufficient quantity), before the body.
2. **Decision 3,** operating budgets, with no numbers chosen here. It now also carries:
   - CC-1's hold-until-re-activation, or acceptance of the split design;
   - the publish and activation quiescence refusal budget, and the platform DML stall (CC-2);
   - the platform-writer blast radius and seal coupling (CC-8);
   - the total-timeout mechanism, from the deployment and connection owner. That means the PostgreSQL version for
     `transaction_timeout`, or a function-setting `lock_timeout` amendment;
   - `lock_timeout < deadlock_timeout`, and a writer-side hold bound;
   - first-lock-wins for each revocation path;
   - whether an app disable precedes revocation.
3. **Decision 4,** the class-4 values and the complete Health legal set including XR-LEGAL-14. These are needed for the
   real S, not for the disabled slice.

**Ownership**
1. **An exact-path exclusive lease.** It must cover the 17 paths and the 4 evidence records and be recorded in the
   coordinator registry. None exists at `52bd180`, and lease 17093695 is not sufficient.
2. **Confirmed path owners.** The coordinator confirms each path's current owner. Today only historical handoff-state
   globs cover them.
3. **The Phase Zero rule.** It needs a disposition only if `assisted-order/ports.ts`, `express.ts`, `service.ts` or
   `supabase-repository.ts` is added. None of the 17 is in it.
4. **The HL12 owners' acknowledgment,** only if their paths are touched. Whether the two assisted-order regression
   tests fall under HL12 ownership is NOT PROVEN; check before dispatch.
5. **Current records ownership.** The builder's ownership of `docs/health-launch/quick-order-20261005/**` must be
   current for r2.

## 7. Disposition

- **DESIGN: REVISION REQUIRED** on CC-1 to CC-4, through a records-only r2. The core is DESIGN COMPATIBLE. No P0 or P1.
- **Doc 71 closure:**
  - CLOSED: C-4, C-5, C-26 and C-12.
  - PARTIAL: C-1, C-2 and C-3.
  - The remaining P3s are named above.
- **What this enables under existing authority.** The builder may prepare r2 in records. The coordinator may record
  this verdict and the decision 3 additions. Nothing else follows.
- **What it does not do.** It grants no source permission and no execution. The grant text remains a DRAFT, and
  nothing here is recorded as your approval.
