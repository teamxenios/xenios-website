# Quick Order supervisor repair `cc584f9` / `866ed38`: bounded delta review against doc 64

**SOURCE: REVISION REQUIRED. EXECUTION ELIGIBILITY: NONE.**

**Source.** The repair closes most of doc 64:
- **F-01, first half.** No pause is written with zero child launches; a non-consuming refusal is written instead.
- **F-02.** A G0 interruption after launch is declared terminal, and the handshake waits are bounded to 3 seconds in
  total.
- **F-03 to F-06, F-09 and F-19 to F-22.** Corrected.
- **F-07 and F-08.** Corrected, with limits.
- **F-10, F-11 and F-15 to F-18.** Corrected in records and prose.

Nothing was weakened: no wall, ceiling, cap, process row or wait limit changed. The verifier pin stays on the accepted
`7a62e64`, with `935aaf1` listed only as pending.

But the restart that replaces the zero-launch pause almost never fits in time, so F-01 is still open in practice. A new
rule also strands a group permanently after any ordinary early refusal.

**Execution.** Twelve controls are authored and none is proven working. Every mode is refused before the lock.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Board task `DOC64-SUPERVISOR-REPAIR-DELTA-20261009` r1,
acknowledged at `ab1d43f`.

Method:
- three read-only lenses, each with an adversarial verifier: zero-launch handling and timing; opening policy, holds and
  prose; records and eligibility;
- a completeness check;
- my own confirmation of both blocking defects in the source and the manifest budgets.

Every verifier upheld every lens finding; one raised a P3 to P1. Lens output archived as
`hl12/67_supervisor_repair_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `cc584f971d1342acf05a9dd43f97916e38f8072c`, tree `a52060a6922888e952cf0e5a3de5ea4c12e636e9` ("Fix bounded Doc64 supervisor refusal continuation and opening policy"), parent `a828501` (records of `935aaf1`, accepted in doc 65) |
| Delta | exactly `qualification-supervisor.mjs` (sha256 `a827a2c4…`) and the manifest (sha256 `dcea1a24…`), recomputed equal to the source record; each group gains only a handshake budget and a continuation policy |
| Records | `866ed38f0f6007d7a87dfc90628c99b3f42afe4a`, records-only; everything outside the two files is unchanged |

## 2. Blocking defects (P1, verified)

| ID | Defect | Smallest correction |
| --- | --- | --- |
| U-01 | **The zero-launch restart cannot fit.** A clean refusal before any launch now permits a restart, but the restart restores the first invocation's deadline (`supervisor:1722`). In every group the command ceilings plus setup, admission and finalization add up to exactly the group wall: G0 is 51,000 + 3,000 + 3,000 + 3,000 = 60,000 ms, and G1 to G7 likewise. The time check (`supervisor:1127-1131`) charges the restart a fresh setup allowance against the old deadline, so it passes only if the restart starts within the completed in-process ceilings plus the handshake time already spent. In practice: for G1 to G7, never; for G0 before its parser self-test, never; for G0 after it, within about 5.4 seconds. The records still say the refusal is restartable. G0, and with it the window, can still be lost with nothing launched. | Do not start the group clock before its first child launches. A material-change restart after a clean zero-launch refusal gets a fresh, unchanged group wall, bounded by the aggregate and the window. Keep the completed in-process prefix, the nine-invocation cap and the aggregate. Change no wall or cap. |
| U-02 | **An ordinary early refusal strands a group.** The fresh-start guard (`supervisor:1676`) requires every earlier non-consuming record to be restartable. But a plain, uncoded refusal is recorded as not restartable (`supervisor:1904-1906`). So the first such refusal of a group blocks every later fresh start of it permanently, with nothing launched. Normal paths reach this: invoking G1 before G0's acceptance record exists, a mistaken G0 resume, or a transient read error. The earlier version `f98c416` allowed these restarts. | Let every clean refusal with no launch, no consumption and proven cleanup be restartable under the material-change binding, whatever its code. Reserve permanent refusal for cleanup uncertainty, consumption or fixture failure. |

## 3. Other findings (verified)

**P2, an execution-eligibility gap rather than a source defect:**
- **U-03. G0's handshakes need a 428 ms responder that does not exist.** G0's 3-second admission budget gives each of
  its seven child handshakes about 428 ms. Each needs a separately authorised fresh coordinator observation, but no
  responder, authority or measured latency is named. A miss before the first launch strands G0 (U-01), and a later miss
  ends G0 and the window. Before any execution proposal, name the responder and its measured latency, or record that
  G0 cannot run under this budget. Do not raise any budget.

**P3, may travel as limits:**
- **U-04. Refusal records misstate restartability and cause.** Several paths keep "restartable" after their time or
  budget is gone, or relabel the cause.
- **U-05. Pauses ignore the invocation cap.** The pause check ignores the nine-invocation budget, so a later pause can
  be published that can never resume.
- **U-06. A last-child timeout ends the group.** When one child remains and little handshake budget is left, a timeout
  ends the group instead of pausing it.
- **U-07. No pause-to-resume allowance.** Nothing declares how long a resume may take to start after its pause.
- **U-08. A forged refusal record can stretch the wall.** It is accepted with unanchored clocks and could extend a
  group wall to the aggregate. Forgery is within the disclosed trusted-local limit.
- **U-09. Approval-bound prose overstates bindings.** Several manifest and packet statements describe bindings the
  F-04 source does not make.
- **U-10. The "one-shot" policy observation is not enforced.**
- **U-11. Four policy checks lack negative fixtures.** They are row order, a mismatched declared policy, an observation
  after approval, and a missing or duplicated label.
- **U-12. A bound digest points outside the source tree.** The manifest binds a record digest whose record exists only
  in `866ed38`.
- **U-13. Stale closure anchors.** The closure's carried anchors are line numbers from `f98c416`.
- **U-14. A miscounted prose-correction record.** It claims 109 base corrections; one is an in-delta self-correction.
- **U-15. Your stage-count decision alone cannot unlock G0.** The three-process assertion on G0's rows is
  unconditional, and the manifest's override slot is never read. So after your decision, a further reviewed source
  edit is still needed. This is undisclosed.
- **U-16. One README line misreads.** It reads as if the successor authors none of its corrections.

## 4. Execution eligibility (separate from source)

- **No mode is eligible.** Preparation and G0 to G7 are refused by window-group holds, and G0 also by its three-process
  row assertion. Resume is refused by the same holds. The prerequisite option does not exist, and the database category
  has no route.
- **Twelve authored controls, zero proven working.**
- **Still required before any proposal:**
  - a corrected and accepted supervisor;
  - your G0 stage-count or scope decision, plus the further source edit U-15 describes;
  - standalone native-proof source and a prerequisite authority vehicle;
  - pre-run fit and calibration evidence;
  - a responder proven against the 428 ms slices;
  - a fresh window with its full approval chain, reservation and admission.

## 5. Disposition

- Subject: `cc584f971d1342acf05a9dd43f97916e38f8072c` (tree `a52060a6…`), records `866ed38`.
- **SOURCE: REVISION REQUIRED** on U-01 and U-02. Records pass. No P0.
- **EXECUTION ELIGIBILITY: NONE.**
- **What does not change:**
  - Docs 62, 63 and 65 stand.
  - The verifier pin on `7a62e64` is correct. A later successor may re-pin to `935aaf1` explicitly, with its receipt.
  - The two blockers stay separate. Running qualification is blocked as section 4 lists. Saving customer requests needs
    the five operational inputs, an accepted census, §5C authority and the durable transaction, none of which this
    source touches.
- **Smallest next action for the same builder:** one bounded successor on the same two files.
  - Fix U-01 and U-02 together.
  - Fold in U-04 to U-08 where touched.
  - Disclose U-03 and U-15.
  - Change no wall, ceiling, cap, process row, wait limit, attempt cap or aggregate.
