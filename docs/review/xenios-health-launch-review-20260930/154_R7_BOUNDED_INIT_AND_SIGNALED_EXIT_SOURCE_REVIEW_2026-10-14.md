# R7 bounded initialization and signaled exit: source review

**SOURCE-COMPATIBLE with the Doc 152 method A. No source correction is required.** Core `2ce4992e` implements the
selected direction and the required exit-time fix. Three limitations are recorded below:

- the post-gate time arithmetic for the scheme group, the controls parent and the diff runner;
- a missing lower bound on child lifetimes;
- the dynamic obligations only real runs can meet.

This is source compatibility only. It is not measured timing, process closure, counter or browser qualification,
security disposition or deployment.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git blobs,
text diffs and hashes. Nothing parsed, compiled, queried or run. No agents. Archive:
`hl12/154_r7_bounded_init_and_signaled_exit_source_review.json`.

## 0. Correction to Doc 153's transport statement

Doc 153 said its packet reached me by Samuel's paste and that Computer Use stayed paused. That was stale.

- Root's `DOC158_ACTUAL_HUMAN_RESUME_ORIGINAL_REVIEWER_TRANSPORT_20261014.json` records Samuel reversing the pause,
  observed at 17:49:59Z.
- Root's `DOC158_ACTUAL_SINGLE_FROZEN_DOC154_REVIEW_PACKET_DELIVERY_20261014.json` records one Computer Use delivery
  at 17:53:33Z.
- A delivered message looks the same to me whether it was typed or pasted. My attribution was an inference from
  the latest pause record.

Doc 153's payload, action, scope and lapsed-window verdict are unchanged.

## 1. Binding

- **Commit.** Core `2ce4992e` (tree `21686b3e`, parent `5d63daca`) adds exactly 19 files in
  `native-resource-gate-r7-bounded-init-and-signaled-exit-proposal/`. That is 13 complete `.proposed` after-images,
  `.gitattributes` `* -text` and five records.
- **Records.** Bindings are 22,563 B `09e78def…`, the patch 176,185 B `39d2696a…`, the checks 11,600 B `fd64c826…` and
  the handoff 2,319 B `826be09e…`.
- **Packet.** The embedded R7 packet is byte-identical to Root's frozen 3,680 B `9a89e3a1…`.
- **Canonical files.** All 13 canonical files are unchanged at `5d63daca`, `2ce4992e` and `240de0df`.

## 2. Method A conditions from Doc 152

1. **Phases. Met.** One shared gate times the cold `Add-Type` compile and the size and offset assertions first, with
   no API call. The R7 type throws if `Read` runs before `Initialize`. Then it runs the fresh OS query, under 1,000 ms,
   and then the `K32GetPerformanceInfo` call with validation and floors. The read budget is 2,000 ms in the supervisor
   and controls parent and 1,000 ms in the diff runner.
2. **Initialization bound not presented as measured. Met.** The manifest says `measuredFit false` and keeps the R6
   interval of at least 2,000 ms and less than 4,930.45 ms as the only measurement.
3. **Fence and per-runner arithmetic. Met for the gate, not for the bodies.**
   - The gate's entry predicate is process age plus 5,000, plus 1,000, plus the read budget, under 30,000 ms. Each
     phase rechecks the remaining fence before starting.
   - The post-gate arithmetic is not shown. Section 3 supplies it.
   - Every limit still fails closed, so no source change is needed.
4. **Truthful semantics. Met.** The manifest and diff proposal mark `KEEP_EXISTING_COMBINED_BUDGETS` and Doc 149's
   combined wording as superseded for future runs only. The receipt fields are renamed explicitly, and historical R6
   evidence is not rewritten.
5. **Diagnosability. Met.**
   - Failure is checked before lateness in every phase. That is the same check as the R6 line 262, but in the opposite
     order.
   - Every gate refusal writes one closed `G0_REFUSAL` JSON line. It holds the phase, the kind, the token, three
     start flags, three durations and three budgets, with no resource values, stack or environment.
   - Boundary refusals after the gate carry the durations too.
6. **Signaled exit. Met.** The caller's exit read and the executor's caller-exit read now wait on `WaitForExit(0)`,
   which is true only once the handle is signaled. Both stay inside their existing deadlines, and the caller's loop
   fails as `PROCESS_SIGNAL_DEADLINE`.
7. **Fixtures and pins. Met.** The original 25 cases keep their names and order, and seven are added.
   - The validator (41 lines), the phase gate (70 lines) and the adapter (73 lines) are byte-identical in every file
     that carries them.
   - The manifest grows to 46,371 B `c389a415…`. The caller pins that hash with an exact 46,371 cap. The executor
     pins the caller at 25,737 B `7e65bdca…`.
   - The unchanged pins match disk: `pwsh.exe`, `node.exe`, the observer and the scheme inputs.
8. **No additions. Met.** No new launcher, observer, cache, prewarm or persisted assembly. The closure change is one
   literal output-root path. The diff runner's existing competing-work check moved inside the gate's refusal handler
   unchanged.

## 3. Remaining-time arithmetic, per runner

| Runner | What bounds the body | Effect of a gate of up to 8 s, or 7 s for diff |
|---|---|---|
| Supervisor, counter | 120 s aggregate from process start | The gate must end by 30 s, leaving the body at least 85 s |
| Supervisor, scheme | 30 s aggregate from process start | The gate must end by 25 s. The work window is 25 s minus the gate's end, below the 20 s work budget once the gate ends after 5 s |
| Controls parent | Its 30 s clock starts after the gate | Lifetime can reach startup plus gate plus 30 s, so its stated lifetime under 30 s is checked only afterwards |
| Diff runner | Its 30 s clock starts after the gate | Same: its stated whole-process lifetime under 30 s is checked only afterwards |

None of these can pass silently. The scheme group fails through its aggregate check. The controls parent and the
diff runner fail at the external lifetime check. A run whose body uses most of its budget after a slow gate is a
foreseeable failure. Each of these runs must prove its own fit.

## 4. What the 32 cases prove, and what they do not

**Proven when the cases run:**
- the phase order, enforced by call counts;
- lateness in real time for the OS and read phases;
- failure beating lateness in real time for those phases;
- initialization failure;
- the closed refusal record's keys, numbers and start flags;
- the original validator and floor logic.

**Arithmetic only.** The four classifiers call the shared threshold function with supplied numbers. They are
labelled `timingMeasured false` and prove only the comparison and the failure precedence at 5,000 ms and 1,000 ms.

**Only real runs can prove:**
- the real cold initialization's success and duration;
- the real OS and native read times;
- an initialization-late refusal measured end to end;
- the diff runner's 1,000 ms read;
- each runner's post-gate fit;
- the signaled-exit waits under real termination;
- the refusal line reaching the preserved stream files.

## 5. Identities

- **Output root.** All outputs move to `C:/Users/sboad/.codex/tmp/ql-doc154-r7-synthetic-proving-20261014`, which does
  not exist now.
- **Ticket path.** It is unchanged. A fresh ticket will replace the held copy of consumed `c73c8827`, which is already
  archived byte-identically in Root's Doc 153 archive.
- **New ticket fields.** The supervisor, controls and diff tickets must now carry `initBudgetMs` 5,000 and
  `osBudgetMs` 1,000.

## 6. Observation, not a required correction

The supervisor and the controls parent read each case child's exit time after end-of-stream on both pipes and
`HasExited`. They check only `lifetime < 5000` or `<= 5000`, with no finite or non-negative check.

- In practice, end-of-stream on the child's own pipes follows the exit time being set. So the R6 race is unlikely
  at these sites.
- The code does not enforce that ordering.
- When I review evidence, I will treat any non-finite or negative child lifetime as a failure.

## 7. Unchanged

- Canonical application stays held for Samuel's exact 13-path exception, which is still a draft.
- R6 stays FAILED, with 0 of 25 cases and the invalid caller record.
- The caller `46104` reservation stays held, because its postcheck window expired without running.
- No window or ticket is requested.
- Payment and security holds are unchanged.

Not execution consent, not human approval and not test credit.
