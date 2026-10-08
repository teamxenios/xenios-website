# Quick Order qualification supervisor and manifest `90f4ebd` / `6d0fe86`: bounded source review against doc 49 section 4

**SOURCE: REVISION REQUIRED.** The records are clean and the design is sound in its safety posture, but six defects
would make the supervisor produce false evidence or consume a group with nothing wrong, so no group is ready for an
execution decision.

The safety posture holds:
- nothing runs at import;
- a run needs explicit window, reservation, admission and group records bound to the manifest's hash;
- child processes run inside a Windows Job Object, created suspended, assigned before resume, killed on close, with no
  breakaway;
- spawning uses argument arrays with no shell, and the environment is an allowlist that refuses credential-like keys;
- the code contains no deletion, network or PID-kill paths;
- ambiguous cleanup keeps the slot held;
- the protection gate replaces `verify-release-manifest.ts`, and G8, G9 and the database category are deferred.

Every manifest pin, both receipts and both records recompute equal. The six blocking defects are a predeclared
failure list that cannot match how Vitest renders the names, duplicate rendered titles, invisible skipped and todo
cases, two G7 commands that cannot start correctly, and a per-command admission rule that consumes the group on
timing alone. Everything is NOT RUN; the window is expired; this review authorises no execution, reservation or probe.
Lens output archived as `hl12/52_supervisor_lens_findings.json`.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Delivered through the coordinator-led queue under Samuel's
direct instruction of 2026-10-08 (acknowledged at `d02ceda`). Method: identity from the coordinator board and the
builder handoff, a read of the supervisor's control code by me, two read-only lenses (supervisor script; manifest and
records) with adversarial verifiers. The subject was never executed or imported.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `90f4ebd1dcccc5a2ba7c85b4cb9310285120fec8`, tree `d6f8dd85dac35f277377b3f19b1f3877de6aac33` ("feat(quick-order): author bounded qualification supervisor and plan", 2026-10-08 09:40:31 -0500), parent `30085a6` (records of the head-integrity source accepted in doc 50) |
| Delta | exactly `docs/health-launch/quick-order-20261005/qualification-supervisor.mjs` (718 lines, sha256 `d85b5a04…`) and `docs/health-launch/quick-order-20261005/evidence/qualification-manifest-20261008.json` (1,826 lines, sha256-lf `dc166dc6…`); no runtime, test, SQL or protected path changed |
| Records | `6d0fe8655b799bb7e2fd64e508d6f148e4c2f552` (handoff, `evidence/doc49-qualification-source-90f4ebd.json`, `evidence/doc49-two-task-records-20261008.json`), records-only; the builder checkout is clean and has nothing after it |
| Identity sources | coordinator board `quickOrder.latestProgress.supervisorSource` and the builder handoff at `6d0fe86`; both local; the remote builder branch is still `1631323` |
| Bindings | the manifest binds the supervisor's own hash (`d85b5a04…`, equal), the pinned Node executable (`6e3a3978…`), the accepted source `f581b6b` and its records `30085a6`; all 44 target and snapshot pins, both patches by Git blob, the HTTP plan (`51991abd…`) and both database receipts (intake at `3e82154`, currentness at `f581b6b`) recompute equal; both new paths fall inside the builder's lease |

## 2. Blocking defects (P1, verified)

| ID | Defect | Smallest correction |
| --- | --- | --- |
| SV-1 | 20 of the 21 predeclared failure names are raw `it.each` template text. Pinned Vitest 4.1.10 renders each `$key` through `objDisplay`, which single-quotes strings and truncates values to 37 characters plus an ellipsis, and the supervisor compares names exactly. So G3 (4 provider-journal names) and G4 (16 static and Vite names) are refused even when exactly the predicted cases fail, and G6 and G7 can never start. Only the root case (a plain `it`) matches. | Replace the names with the rendered forms (quoted values, 37-character truncation with U+2026, describe prefix kept), pin `@vitest/runner` and `@vitest/utils` in the manifest, re-hash. |
| SV-2 | G3 is refused even with corrected names: `quick-order-repository.test.ts` renders duplicate titles (99 "refuses missing required $label" cases collapse to 95 names under truncation; "refuses mismatched binding $path" repeats two paths), and the supervisor refuses any repeated file and name identity. | Key rows by file plus location or index (for example from Vitest's JSON reporter), or compare multisets with bound per-name counts. |
| SV-3 | Skipped and todo cases are invisible: the verbose parser's symbol class cannot match Vitest 4.1.10's skip and todo symbols, and G2 to G5 bind no case inventory, only target files and expected failures. A suite-level `afterAll` failure (the root composition test asserts cleanup inside `afterAll`) can then be accepted as GREEN or as "exact predeclared red only". | Parse the skip and todo symbols; parse Vitest's final totals line and require the parsed totals to equal it, with skipped and todo zero or predeclared; bind an exact case count or expected-pass list per G2 to G5 command. |
| SV-4 | Both G7 em-dash commands run `scripts/acceptance/verify-no-em-dash.mjs` with plain Node 20.19, but the script imports a `.ts` module (`:8`) and the repository runs it through `tsx`; the pinned binary has no type stripping, so the first G7 command fails at import and, because an unexpected verdict stops the group, the build never runs. | Add `--import tsx` to both em-dash argv, as the route-uniqueness command already has; re-hash. |
| SV-5 | The G7 build runs with `NODE_ENV=test`, so Vite 7.3.5 keeps it, `isProduction` is false, `process.env.NODE_ENV` is defined as `test` and React's development bundle is selected: the G7 artefacts would describe something other than the production build, false evidence for G7 and any later G9. | Omit `NODE_ENV` or set `production` for the build and the built em-dash check; pin the Vite version; re-hash. |
| SV-6 | Every heavy command after a group's first (and every G7 command) re-reads the admission file and requires an observation no older than 30 seconds, but nothing signals when a command is about to start, and the manifest forbids a sampling loop. A stale or missing observation throws after the single-attempt group marker is written, so the group is consumed, contradicting the manifest's own `resourceRefusalConsumesGroup: false` and doc 49 Q-3. It hits G0's Vitest baseline, G1's three commands (the one mandatory HTTP attempt), G4's two and all of G7. | Either admit each group once and drop per-command re-observation, or add an explicit request-and-wait handshake bounded in the manifest, writing a non-consuming refusal receipt on a miss. |

## 3. Other findings (verified)

**P2, fix before an execution decision:**
- git is not pinned. It is spawned by name with its working directory set to the snapshot the subjects can write to,
  outside the Job Object, and its output is the source-identity evidence; a planted `git.exe` in the snapshot would run
  first. Pin it by path and hash and run it from outside the snapshot with `-C`. The lens rated this P1; the verifier
  lowered it, and I agree, because a planted binary requires a subject to write one.
- The child environment can carry both `Path` and `PATH`. The PATH lookup is case-sensitive while Windows uses `Path`,
  and Windows PowerShell's `ConvertFrom-Json` rejects case-variant duplicate keys, which would abort every helper.
  Normalise keys to upper case.
- The helper runs through `powershell -File` with no execution-policy handling; the Windows client default blocks
  script files. Record the effective policy as a pre-window fact, or declare a process-scoped bypass in the manifest
  and the approval text, never a machine change.
- Untracked and ignored drift is not refused (porcelain status recorded but not compared), generated fixtures are not
  re-hashed per command, and `node_modules` is pinned by six files only.
- No Job memory limit is set, so the doc 49 G0 bound and the group floors are admission floors only, not caps.
- Nothing makes a run exclusive: G2 to G5 can start concurrently under one run id. Add a run-level lock file.
- G0 has no node-tap fixture, so the TAP parser is first exercised inside G1's single attempt.
- Authority is a format check on self-written JSON; receipts do not bind the window digest or approval text; the
  preparation export skips the self-hash and several window checks. Add a `--prepare` mode with the full checks and
  bind those digests.
- A stream-drain timeout is overwritten to `cleanupProven: true` by the helper's `finally` block. Make the unresolved
  state sticky.
- `Add-Type` without `-IgnoreWarnings`, over interop structs that are the classic CS0649 pattern, risks failing every
  command at compile time (untested). Add a pragma or flag and prove compilation outside any group.
- G7 runs a verdict-only command first, so a source em-dash failure blocks artefact production, against the Q-1 split.
  Reorder: build, built em-dash, then the verdict commands.
- G1 and later require `bootstrapAccepted`, but G0 defines no executable bootstrap-interruption case. Define it, or
  name the separate acceptance step.
- The G0 bootstrap active-process limit of 2 must hold the helper and the compiler tree; `csc.exe` commonly spawns
  `cvtres.exe`, so every trivial case may fail.

**P3:** the refusal self-test passes on any exception; names are compared without the file; the 4 MiB cap aborts
rather than truncates (disclosed); receipt digests incomplete and writes not atomic; handle inheritance; no
die-on-unhandled-exception flag; documentation imprecision; LF-dependent self-hash under `core.autocrlf=true`; G0
timing and the full-repository inventories (6,069 files, about 212 MB, hashed before and after each group) are
unbudgeted; G0 departs from doc 49's 512 MiB and three-process bounds (disclosed, needs explicit approval text); the
140-minute aggregate is not enforced; the G7 group wall (25 minutes) is below its command ceilings (40); the database
completion markers are unnamed; a named RED failure is accepted regardless of cause; the protection gate is accepted on
any `RESULT: FAIL` without binding the expected violating paths; G5 boots the production root on `0.0.0.0` without a
disclosure; evidence under `%LOCALAPPDATA%\Temp` can be purged by host cleanup; the CLI's synchronous refusal path and
symlink invocation edge cases.

## 4. Readiness by group (on current source)

| Group | State |
| --- | --- |
| G0 | closest; needs SV-6 (or the Vitest baseline not re-admitted), the environment-case fix, the helper preconditions recorded, a defined bootstrap step, and explicit approval of the higher caps and `Add-Type` |
| G1 | blocked by SV-6, G0 acceptance and the bootstrap step; its name sets are exact and the RED import graph is closed |
| G2, G5 | single-command and otherwise consistent; gated on G0 and G1; SV-3 applies |
| G3 | blocked by SV-1 and SV-2 |
| G4 | blocked by SV-1 and SV-6 |
| G6 | blocked behind G3 and G4 |
| G7 | blocked by SV-4, SV-5, SV-6 and the command order |
| G8, G9, database category | deferred; Docker, image and completion-marker facts NOT PROVEN |

## 5. Disposition

- Subject: `90f4ebd1dcccc5a2ba7c85b4cb9310285120fec8` (tree `d6f8dd85…`), records `6d0fe86`.
- **SOURCE: REVISION REQUIRED** on SV-1 to SV-6. The records pass. No P0.
- **What this does not change:** the head-integrity acceptance (doc 50) and the 5C design disposition (doc 51) stand.
  The expired window stays expired. No execution, reservation or resource probe is authorised.
- **Smallest next action for the same builder:** one successor on these two files only, fixing SV-1 to SV-6 and the
  P2 list, with the manifest re-hashed and the source record refreshed; the builder holds the lease, and the work is
  inside the qualification-preparation assignment doc 49 section 5 named. Then return the exact successor here.
