# KAN-31 helper PATHEXT diagnosis and correction: changed bytes and actual evidence

**CONFIRMED: no gap in the correction or its evidence.**

- **The correction.** `human-private-staging-input-once.PATHEXT_FIXED.ps1` (15,241 B, `869a8639…`) differs from the
  Doc 205 helper (`bd5b273a…`) **only** by one 30-byte insertion,
  `PATHEXT='.COM;.EXE;.BAT;.CMD';`, placed after `PATH` and before `HOME` in the explicit child environment.
- **The diagnosis.** It is a controlled one-variable comparison: R1 reproduced the null native exit and R2 cured it.

**One specific missing gate exists before any new human attempt.** The consumed Doc442 G0 outputs still occupy the
frozen G0 entry's fixed output paths, so a new attempt would refuse `G0_OUTPUT_ALREADY_EXISTS`. Section 3 covers this.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git objects,
hashes, my own byte diffs, and a directory listing of the public scratch folder; no execution; no agents. Accepted
application source and earlier reviews are preserved.
- **Timing.** Compared at 2026-10-16T01:12–01:11Z.
- **Jira.** Root relays.

Archive: `hl12/206_kan31_helper_pathext_diagnosis_and_fix.json`.

## 0. Second reviewer correction to Doc 198

Doc 198 found the helper's child environment "launcher-gate-compatible". That was too narrow.

- **What I missed.** The child environment omits `PATHEXT`. Inside the frozen G0 entry, the native call `& '<pwsh>' …`
  that captures capacity then returns a null exit with no output, so G0 refuses before Node, the app or staging egress.
- **What I had in front of me.** The launcher's own `safeEnv` includes `PATHEXT`, which I noted at the time, but I did
  not check what the G0 entry and capacity hop themselves need.
- **What still stands.** Doc 198's other semantic findings stand, and Doc 204's parser correction stands.

## 1. Identity

- **Commits.** Core tc25 runs from `37e1c55f` to `9d5574d2`, and the worktree is clean with long paths:
  - `91db710`: R1 literal (5,842 B, `06c9aa45`) and two public markers (84 B each);
  - `0f4a6c3`: R1 actual failure, 2,825 B;
  - `cd0c451`: R2 literal (5,872 B, `bed0d839`);
  - `f3dd566`: R2 actual pass, 2,796 B;
  - `415401b4` (tree `d1e8ae42`): the fixed helper and the static literal (2,506 B, `954abda4`);
  - `9d5574d`: static result, 1,909 B.
- **Root records.** Doc443, the failure, was committed at 01:03Z. Each pre-run admission was committed **before** its
  call:
  - Doc444 at 01:05:21Z, before the call at 01:05:38Z;
  - Doc445 at 01:06:48Z, before 01:06:58Z;
  - Doc446 at 01:08:11Z, before 01:08:27Z.

  This resolves the Doc 205 records observation for these calls.

## 2. Evidence

- **Doc443, the failed attempt.**
  - The acknowledgment and both masked inputs succeeded.
  - G0 PID 109128 closed with exit 1. The outer receipt shows `nativeExit null`, 0 stdout, 0 stderr, 238 ms and
    `qualificationStarted false`.
  - The operator receipt (1,223 B, `79484c99`) shows `G0_CHAIN_FAILED`.
  - Root makes no claim about a remote database.
- **R1** (`170ba6`, inside the Doc444 window, tool exit 1, one attempt).
  - The literal reproduces the helper's explicit cleared environment keys and the G0 entry's call form: nested pinned
    pwsh with `-File marker` and `2>` to a file.
  - Both markers returned a null `LASTEXITCODE` and empty stdout.
  - This is preserved as a failure, not a pass.
- **R2** (`698bb2`, inside the Doc445 window, exit 0). My byte diff R1→R2 shows **only**:
  - two one-character output-root changes, `r1` → `r2`;
  - the 30-byte `PATHEXT` insertion.

  Both markers matched: exits 0 and 1, the expected stdout, 0 stderr, and the fixture closed and drained. The failure
  disappears with `PATHEXT` alone.
- **The fix.** My byte diff `bd5b273a` → `869a8639` is a single insertion of exactly
  `PATHEXT='.COM;.EXE;.BAT;.CMD';`, the same value as R2 and as the launcher's `safeEnv`. Nothing else changed: no
  guard, recipient, limit, prompt or user or machine setting.
- **Static check** (`2e102d`, inside the Doc446 window, exit 0, 0.42 s): parse errors 0, `exactInsertions 1`,
  `allOtherBytesUnchanged true`, `helperInvocations 0`.
- **Limits, disclosed.**
  - Nested marker processes were not independently inventoried.
  - There is no global family closure, the budgets are cooperative, and the outer channel was combined.
  - The full G0, launcher, browser and staging path is still **untested**. Later hops may still fail in ways that do
    not involve `PATHEXT`.

## 3. Specific missing gate: consumed outputs at fixed paths

A directory listing of `C:/Users/sboad/.codex/tmp/e33-managed-browser-proposal-20261015/` shows four consumed files
still in place:

- `g0-managed-browser-result.json`, 0 B;
- `g0-managed-browser-stderr.txt`, 0 B;
- `g0-managed-browser-outer.json`, 329 B;
- the consumed `coordinator-admission.json`, 7,964 B. Its size equals Doc442's grant record.

These collide with the frozen G0 entry `3ede090e`:

- **Refusal.** It throws `G0_OUTPUT_ALREADY_EXISTS` if the result or stderr file exists, before it runs anything.
- **Silent overwrite.** It overwrites the outer file without checking.
- **Fixed grant path.** It reads the grant only from the fixed `coordinator-admission.json`, which the helper also
  requires.

Before any new attempt, Root therefore needs explicit, authorized custody handling:

1. **Archive.** Record the four consumed files' bytes and hashes in the records. The grant bytes are already in Doc442.
   Copy them to an archive path.
2. **Remove and replace.** Then remove them from the fixed paths and write the new grant there. This is a mutation of
   consumed evidence, so it needs its own approval.
3. **Fresh scratch.** Choose a new, fresh `operatorScratchRoot`. `e33-private-human-input-once-r1-20261015` is consumed.

Without these steps, the corrected helper's next attempt would fail at the G0 entry. The outer evidence from the last
attempt would also be lost.

## 4. Other remaining conditions

- **New decision.** A new decision record with `snippetPin` set to the fixed helper's path and `869a8639`.
- **New authority.** Samuel's new, concrete approval, readiness, admission and window, a new exact command, and a new
  grant.
- **Run time.** A fresh 2,048 MiB G0.
- **No reuse.** No reuse of the Doc442 decision, grant or attempt.
- **Separately controlled.** Staging scope and the deferred populated Doc399 query.
- **Afterwards.** My final-result review.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | helper PATHEXT diagnosis + fix (Core 37e1c55f..9d5574d2; fixed helper 869a8639 at 415401b4; Doc443-447) | reviewer 6abf1edf | CONFIRMED, no gap in correction/evidence: R1 170ba6 (helper env keys + G0 call form) reproduced null exit/empty output; R2 698bb2 differs from R1 only by r1->r2 output root + PATHEXT and passed both markers; fixed helper = bd5b273a + exactly one 30-byte PATHEXT insertion (my byte diff), no guard/recipient/limit change; static 2e102d: 0 errors, 1 insertion, other bytes unchanged. Admissions Doc444-446 committed before each call. REVIEWER CORRECTION: Doc 198 env-compatibility claim missed PATHEXT. SPECIFIC MISSING GATE: consumed g0-managed-browser-result.json/-stderr.txt/-outer.json and coordinator-admission.json still at frozen fixed paths, so the next attempt would refuse G0_OUTPUT_ALREADY_EXISTS (and overwrite outer); needs authorized archive (hashes to records) and removal, new grant, fresh operatorScratchRoot | plus new decision pinning 869a8639, Samuel's new approval/window/command, fresh 2048 G0; full G0/browser/staging untested | doc 206.`

Not execution, setup, invocation, approval, push, deployment or production consent; not human approval.
