# Submission packet, disposition C: transaction design and source scope (`SNAPSHOT-S-CENSUS-PACKET-REVIEW-20261009` r1)

**DESIGN: REVISION REQUIRED.** The protocol core is compatible as design with the held 5C design (doc 49), its
correction (doc 51) and the 24 carry-forwards, your scope `1d4f2c3`, the currentness contract at S, and the accepted
application. That core is:
- an actor-and-key lock, then replay before any changeable gate;
- source row locks first, and the authority head last;
- statement-level guards with a scoped writer epoch;
- a single-owner definer commit with five atomic writes and no legacy submit;
- `persisted: true` only after commit;
- readback only for operators with read-all rights;
- referral and affiliation kept as declarations, never paid, fulfilled, reserved or trusted attribution.

But five design gaps block drafting the bodies and writing an exact grant (C-1 to C-5). The packet's count of "28
primary plus 5 conditional paths" is not a grant. Nothing was executed, and this review grants no source permission.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Board task acknowledged at `b39905f`.

Method:
- two read-only lenses, each with an adversarial verifier: the call and lock design; the path inventory and authority;
- a completeness check, which resolved lens disagreements and added one finding (C-26).

The C-3 starvation finding is derived from PostgreSQL's row-locking semantics and has not been run. Artifacts: the
decision packet (`.md` `145d0d22…`, `.json` `c8bb1979…`, `d007162`), the review request (`19ed1a4`), the scope
`1d4f2c3` and the approval `dc3329b`. Source was read at S `25858ad` and the accepted `3e82154`. Lens output archived
as `hl12/71_packet_C_transaction_lens_findings.json`.

## 1. Design gaps (P2, verified)

| ID | Gap | Smallest correction |
| --- | --- | --- |
| C-1 | **No save can succeed as designed.** The commit's current-authority read and activation are unnamed. At S, the reader always returns "unavailable", and publish and revoke always force the head to held. If the commit instead trusted the head's state, owner writes within the same epoch could forge it (doc 50 HI-3). | After taking the head last, make one fresh call to a named private reader returning exactly `{state: 'active', revisionId, writerEpoch}`, and refuse unless it equals the values recorded before the preflight. The line-level `authorityRevisionId` equals that revision. Author an owner-only activation function as source only; it is never invoked, and the head stays held. |
| C-2 | **The guard's privilege model is missing.** Every role is revoked from the head, and non-owner grants are refused, so a guard running as the invoker cannot lock or advance the head for other writers. The old "absent head: no-op" rule predates the seeded head and would fail open. | Make the guard a definer function owned by the common owner, with an empty search path, no execute grants, its own fingerprint and its triggers always enabled. When the head is not visible it raises an error, never a no-op. Add the 12 IN relations' owners to the single-owner set. |
| C-3 | **The head row can starve writers.** Overlapping intake share locks on the single head row can block publish, revoke, the guard and activation indefinitely, because PostgreSQL grants a new share lock without waiting while only share lockers hold the row. That breaks the bounded-wait premise behind first-lock-wins revocation. | Put a fair gate before the head: the intake takes a shared advisory transaction lock immediately before its head share lock, and publish, revoke, activation and the guard take the exclusive form before their update locks, in one global order. Otherwise, record the unbounded wait as your decision. |
| C-4 | **Payment files are swept in without need.** The adapter group includes `supabase-repository.ts`, `service.ts` and their tests. They carry financial authority, and the readback they would serve already exists. | Exclude all four from the grant. |
| C-5 | **The commit's host file and gate are unnamed,** so no exact-path grant can be written. The intake candidate currently refuses both the commit and the guard. | The grant chooses one: the commit inside the intake candidate with an amended, fingerprint-bound gate, or a named new candidate family with its own gate. |

## 2. Other findings (all P3, verified)

- **C-6. No ordered lock table.** The packet says an exact lock, call and privilege specification is in its JSON, but
  the JSON holds only generic lists. Add one ordered table.
- **C-7. A possible deadlock with inventory.** A multi-variant intake share-locks witness lots in UUID order, while a
  multi-SKU reservation locks per SKU. Use skip-locked or no-wait witness locks with a time recheck, and include
  inventory paths only after your stock decision.
- **C-8. Definite refusals look unconfirmed.** There is no refusal taxonomy, so a definite refusal currently shows the
  customer "unconfirmed". Map error classes in the Quick Order adapter.
- **C-9 and C-13. The timeout and time source are unnamed.** Name the intake timeout mechanism, which conflicts with
  the pinned function settings, and use one database time for all timestamps.
- **C-10. The call and owner inventory is incomplete.** List every function and trigger reached, with its owner.
- **C-11. Operating decisions are folded together.** They are folded into one class instead of being registered
  separately (below).
- **C-12. No rule replaces census-first.** Reversing census-before-body needs a conformance rule: any implemented
  reader outside the accepted projections returns the work to design review, and the census is never widened to fit
  the code.
- **C-14 and C-26. The guard mechanics are unspecified.** Name the guard's scope source and its cost. Statement-level
  "unchanged projection takes no head" needs transition tables. PostgreSQL forbids those on multi-event, column-list
  and TRUNCATE triggers, and upsert fires both insert and update triggers. Specify the triggers per relation.
- **C-15. One identity rule is undefined.** What the companion's per-line source version binds.
- **C-16 and C-17. Ownership and scope wording.** Record an exact-path exclusive lease. The grant must list exact
  paths, never counts.
- **C-18. The remaining barriers must stay literal.** `productionReady: false`, `enabled: false` and the unmounted
  factory stay literal, and tests assert them.
- **C-19 and C-20. Wiring and session context.** Protected root wiring and the session seam are not needed for the
  disabled slice. The server-only session context is mandatory for any real save and is the next named item.
- **C-21 to C-25. Records and authority.** The Health agreement config pair waits on your legal input. The
  notification test and an enqueue-only condition are needed. New evidence bindings and receipts must be named. The
  four provider-hold test cases depend on your `8396609` decision. Do not re-issue the drafting `dc3329b` already
  covers.

## 3. Scope (verified)

**Already authorised by Git records, not by this review:**
- **`dc3329b` covers most drafting.** Your answer of `dc3329b` to `1d4f2c3` covers the currentness modules and SQL
  drafts, including the guard and the authority reader. It also covers the dependent commit draft, the Quick Order
  ports, catalog, legal and production changes, and the readback, notification and composition tests.
- **Review holds that drafting.** Doc 51 and the coordinator scope record hold the guard set, the commit body, the
  session seam and the commit candidate.
- **21 of the 28 primary paths fall within that scope.** These are not authorised:
  - the Health agreement config pair;
  - the two payment tests;
  - `express.ts` and its new test;
  - `server/index.ts` (protected);
  - all 5 conditional inventory paths.

**Smallest disabled slice for save once, recover the reference, authorised readback (17 existing paths):**
- **SQL (10):** the intake candidate, its precheck, postcheck and rollback, and its verifier; the currentness
  candidate, its precheck, postcheck and rollback, and its verifier.
- **TypeScript (7):** `quick-order-repository.ts` and its test, `production.ts` and its test, the Quick Order
  `ports.ts`, `quick-order-admin-readback.test.ts` and `quick-order-notifications.test.ts`.

Save is proven only through a synthetic private context. A real session-bound save needs the `express.ts` seam next.
The slice excludes the payment files, `express.ts`, `server/index.ts`, the inventory paths and the Health config pair.

## 4. Disposition

- **DESIGN: REVISION REQUIRED** on C-1 to C-5. The core is compatible. No P0 or P1.
- **What it enables under existing authority:** the coordinator and the same builder can prepare a successor design
  delta in records closing C-1 to C-5 and C-26, for my review. No source body may be drafted from this review.
- **Proposed grant text for your later decision (not an approval):** a two-part class-3 grant to the same builder on
  base `25858ad`, effective only after I accept the successor design delta and an exact-path lease is recorded.
  - **Part 1 confirms** the drafting `dc3329b` already covers.
  - **Part 2 adds:** the census-order amendment with the C-12 conformance rule; the intake-family compatibility
    amendment limited to the commit and guard; the chosen commit host and gate (C-5); an owner-only activation function
    and strict-epoch reader authored as source only; and generic fail-closed authoring with no operational values.
  - **Exact paths:** the 17 above plus named evidence records.
  - **Conditions:** the barriers stay literal; protected wiring, payment, inventory, migrations and the manifest stay
    unchanged; the outbox is enqueue-only; and there is no SQL, test, installation, push or deployment.

## 5. Consolidated outstanding decisions (docs 69 to 72)

These reference the existing register (`RECOVERY_DECISIONS_20261007.md`) and the existing G0 questions; none is new.

| # | Decision | Unlocks | Doc |
| --- | --- | --- | --- |
| 1 | Your two G0 decisions: stage-specific process counts (with compilation counted and held until measured), and the 60-second wall from the observed helper spawn | the builder's two-file supervisor amendment | 68, 72 |
| 2 | The stock predicate: one allocatable witness, or sufficient quantity | the commit's lock footprint, and whether any inventory path is needed | 71 |
| 3 | Operating budgets: intake lock and hold limits, writer lock timeouts, the refusal budget, first-lock-wins per revocation path, and whether an app disable precedes revocation | guard and commit source reading fail-closed settings | 71 |
| 4 | Class 4 values with legal authority: offers (at most 23 family-eligible rows without a source change), both quantity bands (at most 100 under current source), audience subset, regions, effectivity, and the complete Health legal set including XR-LEGAL-14; and confirming referral and commission stay out | the configuration and Health legal artifacts, and the real S | 70 |
| 5 | The class-3 source grant (section 4), after the successor design delta is accepted | the 17-path disabled slice | 71 |
| 6 | `8396609`: apply it exactly, or accept the four named reds | readback acceptance | 71 |
| 7 | Whether the native route proceeds, and on what conditions | a conditional native source decision | 72 |

**The next builder steps.** Two can run in parallel:
- **The two-file supervisor amendment,** after decision 1.
- **A design-delta record closing C-1 to C-5 and C-26,** for my review. It needs no decision first.

The 17-path disabled implementation follows, after decision 2, decision 5 and an exact lease. The complete census at
an S holding the implemented code and the five approved inputs follows that (doc 69 A-1).
