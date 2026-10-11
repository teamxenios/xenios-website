# Qualification supervisor two-file amendment (`3e5e2ed`): source review

**SOURCE ACCEPTED WITH LIMITS. EXECUTION ELIGIBILITY: NONE.**

The amendment implements your decision. The U-15 stage map is exact:
- **3** for parser-self-test, exit-zero, exit-one, deadline-kill, stdout-cap, stderr-cap and refusal-path;
- **4** for real-child-tree;
- **8** for vitest-baseline.

The map is keyed one-to-one by command ID (`qualification-supervisor.mjs:1300-1306`). The 60,000 ms started-helper
wall is asserted, and the old all-rows-three refusal is gone.

**What stayed unchanged.** No row value, wall, cap, attempt cap or aggregate changed, and no count was raised. No
compiler descendant escapes the outer Job (Add-Type at `:894` runs after the self-assignment at `:790`). The embedded
helper is byte-identical.

**What is preserved:**
- **Original started deadlines.** `run.deadline` is set once.
- **Completed commands.** They are never repeated.
- **Cleanup uncertainty.** Unproven cleanup stays held.

D68-4 (helper-start proof) and the D68-3 timing wording are met.

Source acceptance is not evidence that any native control works. G0 keeps its five holds, and every mode still
refuses. Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task `DOC67-SUPERVISOR-CORRECTION-DELTA-20261009` revision 2,
acknowledged at `12b0db1`. Controlling review: doc 68, with its correction at `36debe0`.

**Target:**
- **Source:** `3e5e2ed9faf30aa46f5a81047fa71d55e28bdb2e` (tree `7cde1fbc…`), compared with the accepted `25858ad`.
- **Records:** `71bdd9d0d9e828a7bbb16d03ab5f30f02d55d846`.
- **What changed:** only `docs/health-launch/quick-order-20261005/qualification-supervisor.mjs` (blob `f53b743`) and
  `evidence/qualification-manifest-20261008.json` (blob `72c3f09`).

**Method.** Three read-only lenses, each with an adversarial verifier, then a critic:
- stage accounting;
- the D68 corrections;
- scope and pin preservation.

**Disclosures.** Job Object, console-host, libuv and compiler behaviour is reasoned from documentation and source, NOT
RUN. Output is archived as `hl12/84_supervisor_amendment_findings.json`.

## 1. Limits that gate execution (P2, stage S3)

**SV-1. Console hosts are counted only in prose.** Enforcement is two kernel active-process limits:
- the outer Job at count minus one (`:787`);
- the inner subject Job at count minus two (`:1407`, `:853`).

There is no console-host term, and no receipt compares a full-tree count with the stage ceiling. With Node, the
helper and the subject, the 3-rows already reach 3. So any console host overflows them under your own rule; doc 74
N-2's consequence is still unwritten.

**Before execution:**
- State whether 3, 4 and 8 are concurrent or cumulative.
- Freeze the console-creation flags for each launch edge.
- Redo the arithmetic for every helper-launching G0 row.
- Prove the counts natively.

**SV-2. The compile phase has no hold or validation of its own.** Add-Type runs under each row's count-minus-one outer
Job: 2, 3 or 7. That is the existing compile bound (doc 72 D-2), not a hidden raise. But `bootstrapTotalBeforeSubject`
is recorded and never validated, and the compiler hold is only prose. **Before execution:**
- Give the compile phase its own hold.
- Validate the recorded total against a decided compile value.
- Route any compile limit above count minus one to you.

## 2. Fold into the next bounded amendment on the same two files (P3, S2; no limit changes)

**Fix first, before any execution relies on resume or G0 acceptance.** Both are regressions from `25858ad`. They fail
closed, and by the series' own precedent (doc 64 F-05, doc 68 D68-1/2) they are graded P3:
- **SV-3.** A still-valid pause becomes terminal when its resume is refused before the attempt record
  (`:2296-2307`). The check asks whether a new pause would fit, rather than whether the existing one is still
  resumable.
- **SV-4.** A transient budget-inspection failure turns a fully green group terminal, G0 included (`:2281-2286`).
  In `25858ad` it only filled future-admission data.

**Also:**
- **SV-5.** The compiler and console-host prose is inaccurate. "No compiler ceiling is selected" contradicts `:787`.
  Add the N=3 arithmetic.
- **SV-6.** D68-2 is incomplete. The attempt record still uses the old write path, so a failed write can strand the
  run behind an orphan `.pending` file.
- **SV-7.** The release-receipt fallback also releases the lock after commands have run. Restrict it, or disclose it.
- **SV-8.** Some forced refusals still claim to be restartable, and failure codes get overwritten. Keep the primary
  cause.
- **SV-9.** Outer-timer expiry now resolves at the command wall without waiting for close, and the helper's exit is not
  recorded. Map it, and optionally record the exit.
- **SV-10.** The TAP calibration's `capConflict` field no longer states its known four-process conflict.
- **SV-11.** Stale records prose: `controllingReview` still names doc 67, the doc 64 and 67 corrections are still
  marked pending, and some "in this ancestry" claims point at commits this tree does not descend from.

**Later:**
- **S3:** SV-12 (a proven no-spawn refusal in a started group is terminal and undisclosed); SV-13 (the
  start-failure semantics are not proven natively); SV-14 (the records omit doc 74's native-route state and its rebase
  obligation).
- **S4:** SV-15 (the stage map exists in four places and only the rows are checked); SV-16 (a stale exported
  self-test list).

**Rejected:**
- **SC-1's "hidden raise".** Count minus one is the existing compile bound.
- **SB-1 and SB-2 at P2.** Both are upheld at P3, as SV-3 and SV-4.
- **Two count claims.** They are refuted from the bytes.

## 3. What prevents execution

1. **G0_THREE_PROCESS_CONTRACT (HELD).** Needs an accepted standalone topology fixture, then a receipt with concurrent
   and cumulative full-tree counts, identities and cleanup at 3, 4 and 8, including console hosts, under frozen
   creation flags (SV-1).
2. **The compile phase.** Needs a native compile-topology receipt, a dedicated hold, and your decision on any compile
   limit above count minus one (SV-2).
3. **G0_ONE_MINUTE_ALL_WORK.** Needs a fit receipt with raw phase timestamps within the unchanged wall.
4. **The other three holds** (BOOTSTRAP_INTERRUPTION_PROOF, EXACT_INHERITED_HANDLE_ALLOWLIST and
   MEMORY_CAP_REFUSAL_DETECTION). Each needs its own accepted native proof vehicle and receipt.
5. **Helper-start refusal semantics.** Needs a native fixture for each accepted error code (SV-13).
6. **The admission and pause responder.** Needs a named, authorised responder measured against the 428 ms and 367 ms
   slices, or a record that pauses are not practically resumable.
7. **Fit and calibration.** G1 to G6 wall fit, the G7 allocation and the 40 calibration rows.

The native route (docs 72 and 74) stays a separate lane. It must rebase onto this successor.

## 4. Disposition

- **SOURCE ACCEPTED WITH LIMITS** for the two files at `3e5e2ed`.
- **SV-1 and SV-2** gate execution.
- **SV-3 and SV-4** must be folded in before execution relies on resume or G0 acceptance.
- **Execution eligibility: none.** Nothing here authorizes a supervisor run, a native build, a test run, a push or
  deployment.
