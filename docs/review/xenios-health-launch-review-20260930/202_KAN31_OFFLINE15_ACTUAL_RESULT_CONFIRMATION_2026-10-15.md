# KAN-31 offline15 actual result: confirmation against Doc 201

**CONFIRMED: the evidence closes offline15 R1** (15 offline cases plus independent closure of 16 known identities)
**with no material gap.** The limits below are disclosed.

- **What it covers.** Syntax checks and synthetic or mock controls only.
- **What it does not.** No browser, TLS, provider, SQL, staging, setup or production credit, and no 2,048 MiB browser
  admission.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git objects,
hashes and evidence text; no new query or execution; no agents. Accepted source and docs 195 and 197–201 are not
reopened.
- **Timing.** Compared at 2026-10-15T22:32–22:32Z.
- **Jira.** Root relays.

Archive: `hl12/202_kan31_offline15_actual_result_confirmation.json`.

## 1. Identity

- **Evidence commit.** Core `e105902d` (tree `888f99a8`, parent `98ce20e1`), local only. It adds exactly four files
  under `correction-e33c12a-offline15-actual-20261015/`:

| File | Size | Hash |
|---|---|---|
| `EXECUTED_RESULT_AND_LIMITATIONS.json` | 9,972 B | `2f0b73f1…` |
| `NATIVE_EXECUTION_AND_CLOSURE.json` | 13,924 B | `f60f4c4e…` |
| `RAW_FILES_LOSSLESS.json` | 38,487 B | `059e5431…` |
| `RENDERED_CLOSURE_COMMAND.txt` | 7,457 B | `c83b3855…` |

  These match Root's Doc421 (3,473 B, `883ea678…`).
- **Clean tree.** The tc25 worktree is clean with long paths.

## 2. Against the Doc 201 conditions

1. **Invocation.** The parent command is 508 B and its hash matches. It is exactly:
   - `& '<pinned pwsh>' -NoProfile -NonInteractive -File '<parent path>' -AdmissionSha256 '8f7736fe…'`;
   - then `exit $LASTEXITCODE`, on the pinned outer shell with `login: false`.

   That is the full pinned path and the exact native exit. The tool exit is 0 and the outer output is empty, as
   expected for a parent that writes only files.
2. **Preflight.** At 22:27:34.407Z: `OFFLINE15_FRESH_PRECHECK_MATCH`, clean, 19 inputs verified, `98ce20e1`/`3cf2137a`,
   full history, output absent.
3. **Parent receipt.** `receipt.json` is 28,134 B, `63ecd01b…`.
   - Status `PRELIMINARY_OFFLINE_CHECKS_COMPLETE_REQUIRES_INDEPENDENT_CLOSURE`, with `failure` null and 0 stops.
   - The parent was created at 22:27:34.877Z, after the window start and well before the last start of 22:37:59.700Z.
     It ended at 22:27:39.815Z, after 4,573 ms.
   - LIGHT readings: 1,108 / 1,112 / 7,774 MiB, against the 512 MiB floor.
4. **The 15 cases**, all against the plan:
   - Every row's name and command equal the plan's case in order.
   - Every row shows `passed`, exit 0 and `hasExited`, with `terminatedOwnedHandle false`, meaning each case exited on
     its own, and no failure.
   - **Raw files.** All 32 files re-hash losslessly from their archived text.
   - **Stderr.** All 15 stderr files are 0 B and genuinely separate.
   - **Stdout:**
     - the Node version is exactly `v20.19.0`;
     - the 10 JS syntax checks print nothing;
     - the TypeScript parse reports 1 file, 0 errors and typecheck false;
     - the PowerShell parse reports 2 files and 0 errors;
     - the guard reports 28 passed, 0 failed and 0 provider calls;
     - the finalizer reports 9 controls, 0 provider calls and 0 authority records.
5. **Tuples.** Exactly 16, in order: the parent, then the 15 rows.
   - Each PID and creation string appears verbatim in the raw receipt text.
   - Executables are the pinned pwsh for the parent and the plan's `command[0]` for each row.
   - The tuple JSON is 2,294 B, SHA-256 `60b1a44e…`, recorded before the call, together with the receipt hash.
6. **Rendered closure.** It equals the template `802baa69` with exactly the three substitutions: the tuple JSON, its
   hash, and the stop `2026-10-15T22:43:44.700Z`. Its bytes and hash are `c83b3855…`, matching the bound command.
7. **Closure result.**
   - Native exit 0 at 22:28:19.979–22:28:21.882Z.
   - Two observations over the 16 unique PIDs at 22:28:20.971Z and 22:28:21.779Z, both `knownIdentitiesAbsent`, with
     `observed` empty and queries of 323 and 293 ms.
   - 1,715 ms in total, under 10 s, and before the window end.
   - No stops or retries. It claims no Git-helper proof and no global guarantee.
8. **Post-run checks.** At 22:29:21Z the 19 pins and the parent still match, and the source and history are clean.

## 3. Disclosed limits (not material)

- **Outer channel.** The outer channel is combined, but the case streams are separate and archived.
- **Not observed directly.** The operating system's argv was not observed, and there is no exact exit time; timing is
  bounded.
- **Git helpers.** Synchronous Git helpers are checked by the parent's `LASTEXITCODE`, not by PID proof.
- **Transport process.** The outer transport process is outside the 16 identities.
- **LIGHT only.** The roughly 1,108 MiB reading gives no browser admission.

## 4. Status

- **Offline controls.** These prerequisites for the browser path are now executed and closed. Source acceptance of the
  offline binding (Docs 196 and 197) stays as it was.
- **Still open:**
  - Samuel's concrete authority for secure input setup and the invoker;
  - Root's decision and authority records and the browser grant carrying `invocationActor`;
  - source7 custody;
  - staging-effects authority;
  - a fresh 2,048 MiB G0;
  - the Doc399 exact-query authority;
  - my final-result review.
- **Not live.** NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | offline15 R1 actual (Core e105902d / tree 888f99a8; 4 evidence files 2f0b73f1/f60f4c4e/059e5431/c83b3855; Root Doc421 883ea678) | reviewer 6abf1edf | CONFIRMED, offline15 CLOSED, no material gap: exact pinned -NoProfile -NonInteractive -File parent + exit $LASTEXITCODE, exit 0; preflight clean/19 pins/output absent; parent 22:27:34.877-22:27:39.815Z in window, failure null, LIGHT 1108/1112/7774 vs 512; 15/15 rows = plan order, exit 0, self-exited, 32 raw files re-hash, 15 stderr 0 B, node v20.19.0, 10 JS syntax silent, TS 1/0 no typecheck, PS 2/0, guard 28/0, finalizer 9; 16 tuples verbatim from raw receipt (sha 60b1a44e), rendered = template + 3 substitutions (c83b3855); closure exit 0, two empty observations, 1.7 s, before 22:43:44.700Z; post pins/source unchanged | limits: outer combined channel, no OS argv/exact exit UTC, no Git-helper/global claim, LIGHT not 2048 | browser path holds remain | doc 202.`

Not execution, admission, approval, push, deployment or production consent; not human approval.
