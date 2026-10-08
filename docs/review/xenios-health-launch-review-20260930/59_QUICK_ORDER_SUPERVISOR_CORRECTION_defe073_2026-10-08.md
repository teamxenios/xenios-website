# Quick Order supervisor correction `defe073` / `8d101ed`: bounded delta review against doc 55

**SOURCE: REVISION REQUIRED.** The correction fixes most of doc 55 in source, including two of its three blocking
defects, without weakening an assertion, whitelisting a failure or raising a cap. CR-01 is closed: every command
environment now passes the rule, and a G0 check proves it. CR-02 is closed: the five names decode to real line breaks,
and all thirty rows of both tables re-render byte-equal.

But the third blocking defect, CR-03, was turned into a hold instead of being fixed. Every window must include G0, and
G0 has seven child commands, which the new hold refuses. So the supervisor cannot run any mode, preparation included.
A second new rule makes four more groups unable to fit in time, even once that hold lifts. Nothing can be consumed by
a miss any more, but nothing can be qualified either. Everything is NOT RUN; this review authorises no execution,
window, reservation or observation.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Delivered through the coordinator-led queue (board task
`DOC55-SUPERVISOR-REPAIR-DELTA-20261008` r1, acknowledged at `7219ac3`).

Method:
- three read-only lenses, each with an adversarial verifier: P1 closure and new defects; P2 items, holds, memory and
  approval; records, closure and invariance;
- a completeness check over all 31 doc 55 items;
- my own confirmation of the blocking defect and the time-fit arithmetic in the source.

Verifiers refuted two lens findings as framed and lowered others; the dispositions below are final. Lens output
archived as `hl12/59_supervisor_correction_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `defe0733ab419859c1ff42b031c2e9a0e8236891`, tree `278c69234f86eae990c8ccfbbe9dd0a6f9bada23` ("fix(quick-order): repair Doc55 supervisor bindings and explicit holds"), parent `0d417a9` |
| Delta from `1e808ba` | exactly `qualification-supervisor.mjs` and `evidence/qualification-manifest-20261008.json`; caps and command arguments are byte-identical to `1e808ba` |
| Records | `8d101ed8a0a83f4a0159154f27161272bd1b4126`; `b133cd6` is a later records-only commit about a denied handoff delivery, and nothing here acts on it |
| Invariance | the currentness and decision-input files, the `2d2d958` receipt and every path outside the two files are unchanged; the 30 target pins, the HTTP snapshots, historical evidence and other owners' registry rows match; no record claims execution or acceptance |

## 2. What is corrected (inspected, NOT RUN)

| Doc 55 item | State |
| --- | --- |
| CR-01 environment rule | **Closed.** All 26 command environments carry only `NODE_ENV` and `NODE_OPTIONS`. The supervisor sets the report path itself, and a G0 self-test checks every environment against the rule. |
| CR-02 line-break names | **Closed.** The ten affected rows now decode to U+000A and U+000D, re-rendered against the test sources and pinned Vitest. The other sixteen backslash names also match. The rendering rule is recorded. |
| CR-03 consumption after the first command | **Not corrected; converted to a hold** (section 3) |
| CR-04 snapshot `.git` trust | **Closed.** |
| CR-05 Vitest cause calibration; CR-06 inventories and fit; CR-25 memory cap | **Honest holds**, enforced before any lock, attempt or marker. All forty predicted causes are now marked as needing calibration. |
| CR-07 approval timing | **Closed.** Decision, coordinator verification and reviewer comparison may precede the window. This opened a P3 on the policy observation (CC-05). |
| CR-08 lift routes | **Partial (CC-06).** |
| CR-09 red-cause precision | **Partial, disclosed.** |
| CR-10 to CR-18, CR-20 to CR-24, CR-26, CR-29, CR-30 | **Closed.** CR-29 re-pins the database currentness category to `e90d464` and its receipt, as doc 55 asked. |
| CR-19 lock release | **Closed as asked**, with an adjacent regression (CC-03) |
| CR-27 policy allowlist | **Closed**, with a P3 residual |
| CR-28 dependency totals | **Closed** as a disclosed limit |
| CR-31 closure wording | **Closed**, with precision notes |

## 3. Blocking defect (P1, verified)

| ID | Defect | Smallest correction |
| --- | --- | --- |
| CC-01 | CR-03 is now a hold, not a fix. A new gate (`supervisor:1312-1317`) refuses any group with more than one child command: G0 has 7, G1 4, G4 3 and G7 6. The window rule (`supervisor:176-181`) forces G0 into every window, and every window group is checked before any lock. So every invocation is refused, preparation included, and nothing is written. Doc 55 asked for a paused continuation that resumes at the next unexecuted command, or an explicit qualification of the attempt rule for your approval. Neither exists, so accepting this source would accept a supervisor that cannot qualify any group. | Implement the paused continuation in source. It must resume at the next unexecuted command under the same group attempt, carry the prior receipt digests and the original deadlines, keep cleanup uncertainty sticky, and never repeat a command. Alternatively, split the multi-child groups into reviewed single-command stages under unchanged caps. In either case, state the attempt arithmetic (CC-04). Re-hash. |

## 4. Other findings (verified)

**P2, fix before any execution decision:**
- **CC-02. Four groups can never fit their own time check.** The new time check (`supervisor:1038-1043`) refuses when
  the group's remaining time is below the command's full ceiling. G2, G3, G5 and G6 each have one command whose
  ceiling equals the group wall (600,000, 900,000, 600,000 and 600,000 ms). The group clock starts before control
  hashing and inventories, so the check can never pass, and G7, which needs G6, can never start. Each try also spends
  one of the nine run-wide attempts. The lift route describes an unproven fit, not an impossible one.

  The verifiers rated this P3 because it is unreachable today. I rate it P2, because it must be fixed before any
  execution decision. Refuse statically before the attempt, and restate the lift route as lower command ceilings
  inside unchanged group walls, or as a separate wall decision.

**P3:**
- **CC-03. Regression: a refused re-invocation keeps the lock.** Re-invoking a group that an earlier invocation
  consumed now records false evidence uncertainty and keeps the run lock, so every later group refuses. Archive only a
  marker this invocation wrote.
- **CC-04. The CR-03 lift route omits the attempt arithmetic.** A full G0 to G7 run spends eight of nine attempts on
  first invocations, so under the current per-invocation rule a complete run tolerates one pause in total. State it,
  and name which option keeps a complete run feasible.
- **CC-05. The policy observation lost its freshness bound.** Moving it before verification dropped the bound, and its
  scope rows are a curated subset with no precedence computed.
- **CC-06. Lift routes are generic.** Nine routes name action classes but no concrete vehicle, arguments, inputs, caps
  or order, and the command line has no calibration mode.
- **CC-07. Unreadable approval text.** Hold reasons and lift routes that the approval scope binds are space-stripped,
  and you must be able to read what you approve.
- **CC-08. A memory hold applies to the wrong groups.** It applies to G1 to G7, whose jobs have no memory limit.
- **CC-09. Hyphens defeat the exact-literal check.** The decision-literal check treats a hyphen as a word boundary, so
  `qo-g0-a1-retry` satisfies run id `qo-g0-a1`, and "G1-G7 held" satisfies G1 and G7.
- **CC-10. G0 acceptance time is unbudgeted.** My committed G0 acceptance must land inside the same 140-minute
  aggregate, with at most about 29 minutes left after all group walls.

## 5. Execution path: none

No proposal is supportable, and none would be even if this source were accepted:
- **G0, G1, G4 and G7:** the hold gate refuses them.
- **Every window:** must include G0, so preparation and every other group are refused too.
- **G2, G3, G5 and G6:** the time check can never pass for them, and G7 needs G6.
- **The manifest:** nine prerequisites stay held, with no vehicle to lift them.

Once CC-01 and CC-02 are fixed, the first proposal still could not be G0 itself. Its own holds (three-process,
one-minute, bootstrap, handle and memory) each need a separately reviewed vehicle first. Each such action needs your
actual decision, coordinator records and my comparison.

## 6. Disposition

- Subject: `defe0733ab419859c1ff42b031c2e9a0e8236891` (tree `278c6923…`), records `8d101ed`.
- **SOURCE: REVISION REQUIRED** on CC-01. Records pass. No P0.
- **What does not change:**
  - Docs 53 and 58: doc 58 has since accepted `2d2d958`, so the next successor should re-pin the database category to
    `2d2d958` and its receipt.
  - The expired window stays expired. Automation stays paused.
- **Smallest next action for the same builder:** one successor on the same two files plus refreshed records.
  - Fix CC-01 and CC-02, and the CC-03 guard.
  - State the CC-04 arithmetic.
  - Fix CC-05 and CC-09, and budget CC-10.
  - Give each hold a concrete vehicle and order in readable text (CC-06 to CC-08).
  - Then return the exact successor here.
