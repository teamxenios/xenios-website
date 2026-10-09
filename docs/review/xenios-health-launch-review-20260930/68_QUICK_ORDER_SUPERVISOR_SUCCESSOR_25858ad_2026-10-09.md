# Quick Order supervisor successor `25858ad` / `feaff6f`: bounded delta review against doc 67

**SOURCE ACCEPT WITH LIMITS. EXECUTION ELIGIBILITY: NONE.**

**Source.** Doc 67's two blocking defects are closed in the authored source:
- **U-01, the clock boundary.** Before any launch, the only deadline is the run's aggregate. A group's wall starts once,
  when Node observes the PowerShell helper process spawn, and is never reset or stretched afterwards. A clean refusal
  before any launch therefore lets a later start have a fresh, unchanged wall within the unchanged aggregate.
- **U-02, early refusals.** Every clean refusal (nothing launched, nothing consumed, cleanup proven, no fixture failure)
  is restartable after a material change, whatever its cause. Invalid approval still refuses every time. Uncertain
  cleanup or launch stays sticky and is never a fresh-start shortcut.

Nothing was weakened:
- no completed command can repeat;
- the nine-invocation cap is enforced;
- every numeric limit in the manifest is unchanged.

The adoption of the accepted verifier `935aaf1` matches doc 65 and its receipt. Ten minor limits remain. One concerns
what G0's one-minute limit now covers, and it needs your acknowledgment before any execution proposal.

**Execution.** Every mode is still refused, and section 4 lists the prerequisites. Everything is NOT RUN.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Board task `DOC67-SUPERVISOR-CORRECTION-DELTA-20261009` r1,
acknowledged at `169b1a3` at Samuel's direct request.

Method:
- three read-only lenses, each with an adversarial verifier: the clock boundary and preservation; refusal recovery and
  the carried items; verifier adoption, records and eligibility;
- a completeness check;
- my own read of the spawn, clock and restart-eligibility code.

Every verifier upheld every lens finding. Lens output archived as `hl12/68_supervisor_successor_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `25858ad94a649a9f7442562e6e0423636d2a3124`, tree `c5565bcdb0bf84b744de1cc0abb76c3867c8f165` ("Correct Doc67 unstarted group clocks and clean refusal recovery"), parent `866ed38` |
| Delta | exactly `qualification-supervisor.mjs` (sha256 `2a68b06c…`) and the manifest (sha256 `15f4ad97…`), recomputed equal to the source record; the embedded Windows helper is unchanged |
| Records | `feaff6f9c1d148199b68531e2db01d9f0accfba6`, records-only |
| Verifier | the database category now pins `935aaf1` (doc 65 at `e0888517`); its receipt `sql-currentness-source-receipt-doc63-20261008.json` (`24430f71…`) matches 66 of 66, and no other binding moved |
| Limits | a leaf-by-leaf diff of every numeric and boolean manifest field shows no change to any wall, ceiling, child wall, process row, wait limit, admission budget, attempt cap or aggregate |

## 2. What the clock boundary means (inspected, NOT RUN)

- **Where the wall starts.** It starts on Node's `spawn` event for the PowerShell helper (`supervisor:1367-1373`,
  `supervisor:1521-1543`). It does not start at the helper's own start receipt, at Job assignment, or when the subject
  thread resumes; the code says so. A launch-clock file records the helper's PID and the exact request, invocation and
  attempt.
- **If the helper fails to start.** On a synchronous throw, or an `error` before `spawn`, no clock starts and the group
  is not consumed. But the outcome is held as cleanup-uncertain, and the run lock stays held. That is safe, though
  over-cautious (D68-4).
- **If the helper started and then failed.** Once `spawn` fired, the wall is running and the group is consumed. Any
  later uncertainty, such as lost output or an unknown exit, keeps the lock and blocks both restart and resume.
- **Simulated restarts.** A refusal before launch, a restart five minutes later, then a launch: each restart fits its
  group's wall, for G0 both before and after its parser self-test, and for G1, G4 and G7. The binding limit is the
  140-minute aggregate. The manifest discloses that a complete G0-to-G7 plan with long gaps is not promised.

## 3. Findings (all P3, verified)

**Fold into the next bounded amendment, which U-15 already requires:**
- **D68-1. A terminal-stop regression.** A resume that restores a started pause and is then refused for exhausted time
  or cap is filed as a resume refusal, not a terminal group result. So the stop rule for later groups does not fire,
  and the labels contradict each other.
- **D68-2. A transient write failure strands a group.** A failure at the first durable writes can strand a clean group
  or the run. It fails closed, against the manifest's own rule that permanent refusal is reserved for uncertainty.
- **D68-4. A helper start failure is mislabelled.** It is recorded as a non-consuming refusal with misleading labels,
  while it holds the whole run.
- **D68-5. Refusal records still misstate some causes and restartability.** The cases include refusals forced by
  permanent prior evidence, recoded finalization errors and inspection failures.

**Acknowledge before any execution proposal:**
- **D68-3. What G0's one minute now means.** Before launch, an invocation is bounded by one group wall from its own
  start, within the aggregate. So G0's setup and parser self-test now run outside its 60-second started wall, and one
  G0 invocation can take up to about two minutes in total. This is the shape doc 67 prescribed, and the manifest
  discloses it. But several manifest fields still call the sub-allowances "ceilings" the code does not enforce, and
  the one-minute lift route still says all G0 work fits in 60 seconds. Either correct that prose and acknowledge the
  new reading, or tighten the before-launch bound with a clean, restartable refusal.

**Records and disclosure:**
- **D68-6. Some reads before launch are bounded only by the aggregate.** Dependency Git reads and the first handshake
  are not bounded by the invocation's own limit.
- **D68-7. Clock trust.** The wall starts a few milliseconds after the launch attempt, and every deadline uses the host
  wall clock, so a backward clock step could stretch one. Disclose the trusted-clock assumption.
- **D68-8. A restart-refused file is not chained.** The guard does not read it, which is benign.
- **D68-9. Eligibility prerequisites are understated.** A G0 retry runs with about 367 ms handshake slices, not the
  listed 428 ms. Any usable G1-to-G7 pause must be resumed within 30 to 75 seconds, and no one is named who could do
  that.
- **D68-10. Stale records text.** Old clock wording remains in the closure, pointers are circular between the README and
  the packet, and historical labels still say "pending" for `935aaf1`.

## 4. Execution eligibility (separate from source): none

Every mode is refused before the lock. The window-group holds refuse each group, and G0 also fails its three-process
assertion (rows of 3, 4 and 8). There is no prerequisite mode, and the database category has no route.

Remaining prerequisites, in order:
1. **Your G0 stage-count or scope decision,** plus a reviewed source amendment to the hard-coded three-process check
   (U-15). The same amendment should fold in D68-1, D68-2, D68-4 and D68-5.
2. **Your acknowledgment of the G0 one-minute reading (D68-3),** or a tighter bound.
3. **Standalone native proofs:** bootstrap interruption, the inherited-handle allowlist and memory-cap detection, plus a
   prerequisite authority vehicle.
4. **Pre-run fit and calibration evidence:** G0 all-work fit, G1 to G6 wall fit, the G7 wall allocation, Vitest failure
   serialisation, and the 40 calibration rows.
5. **A named responder** with authority and measured latency for the 428 ms and 367 ms admission slices, and a named
   path for resuming within the 30 to 75 second pause allowances. Otherwise, a record that pauses are not practically
   resumable.
6. **A fresh window** with its full chain: your decision, the coordinator's verification, my window comparison and
   source disposition naming eligible modes, observations, reservation and admission.

## 5. Disposition

- Subject: `25858ad94a649a9f7442562e6e0423636d2a3124` (tree `c5565bcd…`), records `feaff6f`.
- **SOURCE ACCEPT WITH LIMITS.** Doc 67's U-01 and U-02 are closed; no P0, P1 or P2 is sustained.
- **EXECUTION ELIGIBILITY: NONE.**
- **Smallest next concrete action:** two bounded questions for you:
  1. Your G0 stage-count or scope decision.
  2. Whether you accept the G0 one-minute reading in D68-3.

  Your answers gate the builder's next amendment on the same two files. That amendment would implement the stage-count
  change, fix D68-1, D68-2, D68-4 and D68-5, and correct the D68-3 and D68-10 prose. It would change no limit and run
  nothing. Saving customer requests remains a separate track, gated on the five operational inputs and the census.
