# Quick Order supervisor correction `f98c416` / `6c3a883`: bounded delta review against doc 59

**SOURCE: REVISION REQUIRED.** The correction makes real progress:
- **CC-01's mechanism is in source.** The gate that refused every multi-command group is gone. A pause binds the exact
  receipts so far, the same attempt and the original deadlines. A resume starts only at the next unexecuted command,
  never repeats or skips one, and cleanup uncertainty stays sticky.
- **CC-02 is closed.** Group walls are unchanged, thirteen command ceilings are only lowered, every group and the
  140-minute aggregate fit exactly, and G7 is reachable.
- **CC-03 and CC-04 are closed.** The lock regression is fixed, and the attempt arithmetic (eight first invocations plus
  one pause, against nine) is stated and enforced without resetting anything.

But the new pause logic recreates doc 55's CR-03 case. If G0's first child command misses its admission, nothing has
launched, yet a pause is recorded. That pause blocks a fresh start, and it can never be resumed within G0's
one-minute wall. So G0, and with it the window, is lost with nothing launched.

The four-process topology against the three-process G0 cap stays an honest hold: no cap is raised and no process is
omitted. No mode is runnable. Everything is NOT RUN.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Board task `DOC59-SUPERVISOR-CORRECTION-DELTA-20261008` r1,
acknowledged at `1fb30a7`.

Method:
- three read-only lenses, each with an adversarial verifier: continuation, timing and lock; P3 items, holds and
  vehicles; records, invariance and readiness;
- a completeness check;
- my own confirmation of the blocking defect in the source.

Every verifier upheld every lens finding. Lens output archived as `hl12/64_supervisor_correction_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `f98c41617f7216353b316510cca6c615f3c79a87`, tree `e64f3989d426fcb99776ec0e8330360fdd7595cb` ("fix(quick-order): implement bounded Doc59 supervisor continuation"), parent `276226f` (records of the verifier correction `7a62e64`, accepted in doc 63) |
| Delta | exactly `qualification-supervisor.mjs` (sha256 `8dec3860…`) and the manifest (sha256 `00eb8955…`), both recomputed equal to the producer's claims; every other path unchanged |
| Records | `6c3a883b706211a60502b3adeec0d57726495c70`, records-only: packet, closure, bindings, prerequisite vehicles, preservation and source receipt; runnable modes recorded as none |

## 2. Blocking defect (P1, verified)

| ID | Defect | Smallest correction |
| --- | --- | --- |
| F-01 | **A zero-launch admission miss strands G0.** G0 first runs its in-process parser self-test, which persists a receipt (`supervisor:1620-1632`). If the first child command then misses its admission handshake, the pause condition (`supervisor:1696-1697`) still holds: nothing has launched and the next index equals the receipts so far. So a pause is written, pinned to the original deadline. The fresh-start guard (`supervisor:1528-1533`) then refuses a restart, because an in-process receipt exists. A resume must still have every unfinished command ceiling plus finalization left (`supervisor:1570-1573`), about 49 of G0's 60 seconds, and the handshake miss alone can take up to 30. So G0 can never be resumed or restarted, and the window is lost with no child launched. This is doc 55 CR-03's named case, and a regression from `defe073`. Other groups strand the same way unless resumed within 90 to 225 seconds. | **Never pause with zero child launches.** Record a refusal before any launch as a non-consuming record that binds the in-process receipts and lets them be skipped, so a material-change restart can follow. Never write a pause that the resume check cannot pass. Re-hash. |

## 3. Other findings (verified)

**P2, fix before any execution decision:**
- **F-02. A G0 pause after a later handshake timeout cannot be resumed.** The wait can be 30 seconds against a 3-second
  allocation, with a fixed deadline. Bound each G0 wait so the unfinished ceilings and a resume allowance still fit
  inside the unchanged 60 seconds, or declare G0 pauses terminal in the manifest and closure. Do not raise the wall or
  any cap.
- **F-03. Stale admissions before launch are terminal.** The freshness rechecks just before launch (`supervisor:1272`,
  `supervisor:1276`) throw plain errors, so an admission that goes stale before launch ends the group instead of
  pausing it. Code them as non-consuming, because nothing has launched.
- **F-04. The freshness rule squeezes my comparison into five minutes.** The CC-05 rule forces the policy observation,
  the coordinator verification and my window comparison into at most 300 seconds before the window opens. That partly
  reopens CR-07, and it is impractical while my session needs a human message to wake. Bind the policy observation as
  separate bytes at opening, outside the verification and comparison chain.

**P3, may travel as limits:**
- **F-05. A refused resume ends a valid pause.** If the resume is refused after the pause is read but before its
  attempt record, a terminal result is written.
- **F-06. Resume exclusivity is keyed on the file path, not its digest.** A retained hard link gives a second accepted
  path. Receipts carry no attempt id. G7 artifacts are not bound to their inventory.
- **F-07. The resume fit check reserves too little.** It omits the inventories and handshake that follow it.
- **F-08. One failed group ends the rest.** A terminal group now refuses every remaining group, including independent
  ones. The rule is undisclosed.
- **F-09. A fresh start ignores earlier attempt records.** It checks only markers, so if the marker and pause are lost
  from the purgeable Temp root, completed commands could repeat.
- **F-10. CC-07 is incomplete.** Approval-bound prose is still space-stripped in many places.
- **F-11. A stale G1 note.** One G1 note still lists memory proofs, which CC-08 removed, and omits the Node 20 TAP
  gate.
- **F-12 to F-15, F-17 and F-18. Prerequisite vehicles.** Lift criteria for the fit hold are undecided and circular.
  The vehicles reuse group authority that refuses held groups. The memory vehicle names a native fixture the Node-only
  route refuses. The order proposes a separately authorised G1-to-G7 sequence that the supervisor cannot bind. The
  record lists a three-process rewrite first, although it looks infeasible within the two-file grant. And the plan does
  not total its approvals: at least ten separately authorised actions, each with owner, coordinator and reviewer acts,
  before preparation and G0.
- **F-16. G0's non-command time omits its main cost.** Its 9 seconds omit about 18 full inventory passes and seven
  handshakes.
- **F-19. One policy scope is unchecked.** The observed Process-scope policy is unconstrained, although the helper
  always runs with it undefined.
- **F-20. The three-process cap lives only in the hold.** It should also be asserted on the G0 rows.
- **F-21. Missing G0 fixtures.** The decision-token and policy-observation checks have no G0 fixtures, and an extra
  preparation token is not refused.
- **F-22. One packet line names no receipt.** Its "66 bindings unchanged" should name both receipts and their match
  counts.

## 4. Execution path: none

- **Every window must include G0,** and all groups, preparation and resume are refused by held prerequisites.
- **The G0 process count is unresolved.** The real child tree has four live processes and the Vitest baseline step
  eight, against G0's cap of three. A source rewrite to three looks infeasible inside the current grant (F-17). Only
  your explicit decision on the stage counts or the scope can resolve this. Raising the cap or omitting a process is
  not a fix.
- **No prerequisite vehicle exists.** The supervisor has no mode for running one.
- **F-04 would block** any approval chain whose comparison does not fit five minutes.

## 5. Disposition

- Subject: `f98c41617f7216353b316510cca6c615f3c79a87` (tree `e64f3989…`), records `6c3a883`.
- **SOURCE: REVISION REQUIRED** on F-01. Records pass. No P0.
- **For snapshot S:** this supervisor is not accepted, so any snapshot that includes it must be labelled "proposed
  snapshot, review pending". The customer source (doc 62) and the currentness source (doc 63) are accepted with limits.
- **Smallest next action for the same builder:** one bounded successor on the same two files.
  - F-01: no zero-launch pause; record a non-consuming refusal instead.
  - F-02 and F-03: pausable and feasible handshake timing within the unchanged walls.
  - F-04: separate the policy observation from the approval chain.
  - Fold in the P3 items it touches.

  The process-count question is yours, and it is separate from this source fix.
