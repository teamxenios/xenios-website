# First mixed-source literal build: authority, window and caller comparison

**TECHNICALLY SUFFICIENT for the one admitted first slot, with no material defect in the entry, the G0 adapter or the
runner. One pre-invocation condition is not recorded in Doc 226: the exec transport must let the combined step finish
without killing or abandoning it.**

- **Not admission.** This is not invocation, admission or a capacity pass.
- **Nothing run.** Neither G0 nor the build has run. The historical R7 reading (about 1,403 MiB) would not meet the new
  1,536 MiB floor, so a refusal is a realistic outcome.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git objects and
text. Nothing parsed or run, no tests, no agents. Accepted source and applied bytes (Docs 163–168) were not
re-reviewed. Reviewed at 2026-10-15T02:10–02:16Z, inside the window. Archive:
`hl12/169_first_mixed_literal_build_authority_and_caller_comparison.json`.

## 1. Authority and window

- **Human instruction.** Doc 223 (`5abe801`, 2,760 B, `717731d1…`) is the recorded human text.
  - Item 3 directs: "Run the actual application tests, typecheck, build and synthetic browser journey."
  - Root records it as copied from the conversation, with a native message ID. I can't verify the human beyond that
    record.
  - The Root 218 paraphrase is not used as authority.
- **Admission.** Doc 226 (18,956 B, `96a23c3b…`) binds Doc 223 by hash, with these terms:
  - one finite window, 02:08:44.528Z to 02:53:44.528Z, with the last build start at 02:41:44.528Z;
  - selected by Root as operational job admission, not claimed as a separately human-approved window;
  - no extension, retry or reuse of an old ticket.

  Its status is conditional: original comparison PENDING, execution NOT_RUN.
- **Custody.** The owner is the same Core session under phase A lease `abb400e5`, with the return PENDING. That fits
  Doc 167 step 4, qualification under custody.
- **Exclusions.** This slot runs no tests, typecheck, browser, SQL, database, security, credential, push or deploy
  work. Shared npm, OS and Git settings stay untouched.

## 2. Build runner and pins (`fae61045`)

- **Runner.** The new runner (39,598 B, `baaf43b1…`) equals Root's frozen copy.
  - It differs from the archived passing runner (`literal-build-r2-pass`, 39,577 B, `bed37e9b…`) in exactly four
    constants, each unique: the scratch path, the candidate, the tree and the action label.
  - Reversing those four recovers the old runner byte for byte.
  - Bounds, helpers, cleanup and the Render command are unchanged: 480 s work plus 240 s cleanup, a 720 s cooperative
    cap, a 1,536 MiB heap, 20 MiB logs, and
    `npm install -g npm@10.8.2 && npm ci … && node script/build.mjs` into a private prefix.
- **Pins.** The pins (5,853 B, `ce9ccf79…`) equal Root's frozen copy.
  - There are 28 entries: 19 shared pins unchanged, and 9 moved to the new scratch path.
  - Apart from the move, the only change is the runner's own pin (`baaf43b1…`). The eight source pins keep their old
    hashes; those files are unchanged between `3dd3d96` and `47f49adf`.
- **Runner self-checks.** At startup the runner refuses unless all of the following hold:
  - the pinned Node `v20.19.0`, with no `NODE_OPTIONS` and no exec arguments;
  - the exact runner path;
  - the pins file hash and schema, all 28 pins rehashed before a deadline, and the mandatory pin set;
  - no `node_modules` or `dist` folder, no `.env` files and no ancestor `node_modules/.bin`;
  - registry-only lockfile entries;
  - an isolated Git config;
  - the checkout's actual HEAD equal to `47f49adf`, its tree equal to `a2a8e79d`, and empty `git status` (line 275);
  - its own launch time plus 720 s no later than the stop time.

## 3. G0 adapter (`91af15f8`)

- **Identity.** The adapter (15,941 B, `4630d6b0…`, blob `39ef1fef`) equals Root's frozen copy.
- **Accepted slice.** It contains, once and byte for byte, the accepted R7 slice: 12,131 B, `e11e657d…`. That slice is
  lines 156–337 of `execute-admitted-synthetic-proving.ps1` at `1911873d` (35,636 B, `78fdd4e4…`).
  - Its seven functions are unchanged, including the embedded 512 MiB floor.
  - The other 3,810 bytes are only a `param` block, strict mode, and the new callsite.
- **Callsite.**
  - It requires an exact UTC stop time with at least 30 s left, and the pinned pwsh path.
  - It calls `Get-XeniosResourceAdmission 2000` exactly once. That function returns an ordered dictionary keyed
    `osFreeMiB`, `availableMiB` and `commitMiB`.
  - It computes three booleans, each requiring at least 1,536 MiB, and refuses if any is false.
  - It checks process age under 30 s both before and after serializing.
  - It emits one closed JSON record capped at 8,192 B. The exit code is 0 only when there was no failure.

## 4. The combined native entry (Doc 226, `bd6c386b…`, recomputed)

1. **Output check.** It refuses if earlier G0 output files exist.
2. **G0 call.** It makes one call to the pinned pwsh with the adapter and `-StopAtUtc '2026-10-15T02:53:44.528Z'`.
   Stderr goes to a file, timing uses a `Stopwatch` plus UTC before and after, and the exit code comes from
   `$LASTEXITCODE`.
3. **Outer refusal.** It refuses, writes `g0-outer.json` and exits 1 on any of: exit not 0, 30,000 ms or more, stdout
   over 8,192 B, or any stderr.
4. **Closed result.** It parses the JSON, which throws if malformed. It then requires the kind, candidate `47f49adf`,
   tree `a2a8e79d`, status `THRESHOLDS_SATISFIED_REQUIRES_OUTER_CONFIRMATION`, a floor of 1,536 and all three booleans.
5. **Timing.** It requires the observation to be under 30 s old, and `now + 720 s ≤ stop`, which means starting no
   later than 02:41:44.528Z.
6. **Build call.** It records acceptance, then calls the pinned Node runner with the pins, the pins hash and the same
   stop time, and exits with the runner's code.

**The prepared steps run in this order.** The scratch folder is created only if absent. The detached checkout of
`47f49adf` uses `core.autocrlf=false` and long paths, at creation only. Then come the runner and pins copies, and then
this single entry. Every refusal or throw stops before the build. Nothing retries, and nothing kills a process.

## 5. Required before invocation

These are actual conditions. This review does not satisfy them.

1. **Owner readiness.** The same Core session gives a fresh FINAL READY, holds the exclusive heavy slot, and has no
   competing job. The scratch folder is still absent.
2. **Preparation.** The four preparation commands run, and their postconditions hold. The runner re-checks the pins,
   HEAD, tree, cleanliness and injection at startup.
3. **Transport duration.** This one is not recorded in Doc 226.
   - The combined step can last about 752 s: G0 under 30 s, plus Node startup, plus 720 s.
   - The exec transport must wait at least that long, with margin, and must not kill or detach the shell.
   - If it did, the runner's owned cleanup and receipt could be cut off. Confirm and set this before invocation.
4. **Host.** Run the entry under pwsh 7.x, so the documented stderr-redirect behavior applies. Under Windows PowerShell
   5.1, stderr output would throw, which still refuses but leaves less evidence.
5. **Last start.** The build check must pass by 02:41:44.528Z. After that, the slot lapses with no extension.

## 6. Not material, recorded for later revisions

- **Freshness check.** It parses `observedAt` after `ConvertFrom-Json` has converted it to a date, and the outcome
  depends on the date's kind and the machine culture. A parse error refuses. The 30 s wall-time bound on the same call
  already guarantees freshness.
- **Refusal evidence.** The throw refusals (steps 4–5) don't write `g0-outer.json`, so their only evidence is the
  transport output.
- **Worktree registration.** The detached checkout registers a worktree in the shared repository's metadata. The owner
  should record it and remove or prune it after the slot.
- **Stray output.** Any extra stdout from the adapter makes the JSON unparseable, which refuses.
- **Last-moment start.** A start right at the last moment can pass the entry check and then be refused by the runner's
  own launch-time check. That fails closed.

## 7. What this is not

- **Not a pass.** It is not a capacity, G0, build or qualification pass. Current memory has not been read.
- **Not consent.** It is not admission or invocation.
- **No security change.** Samuel's security handoff stays unresolved, no credentials are retrieved, and the staff-read
  scope stays HELD.
- **Unchanged.** Custody is unchanged: phase A active, return PENDING. R8 and Docs 160–168 stay closed, failed run
  `790af2ce` stays FAILED, and the payment and security holds stay open.

Not execution, push, deployment or production consent; not human approval; not test or capacity credit.
