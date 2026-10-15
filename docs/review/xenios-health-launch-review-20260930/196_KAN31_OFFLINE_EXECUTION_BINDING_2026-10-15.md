# KAN-31 offline execution binding: new delta only

**CHANGES REQUIRED: one minimal correction.**

- **The issue.** It is a one-line operability defect in the new parent's own-path check. It would likely refuse a
  correctly prepared one-use ticket before any child runs.
- **Everything else.** The closed command scope, the exceptional cleanup, the bounds and the result contracts conform.
- **What this is not.** Not a ticket, a parse or a qualification.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only. No parser, import, compiler, controls, native memory, process query, SQL or browser action; no agents.
The accepted browser (`674f4ade`+`51962b33`), `e33`, CI-66, I3 and Q1 are not reopened.
- **Packet.** Delivered in chat.
- **Timing.** Reviewed at 2026-10-15T21:49–21:54Z.
- **Jira.** Root relays.

Archive: `hl12/196_kan31_offline_execution_binding.json`.

## 1. Identity

- **Commit.** Core `79c27226` (tree `08f7b563`, parent `51962b33`, local only). Four additive files; the accepted
  subtree is unchanged.
- **Files.**

| File | Size | Hash |
|---|---|---|
| `OFFLINE_COMMAND_BINDING_SOURCE_ONLY.json` | 19,910 B | `205cbe0d…` |
| `execute-admitted-offline-controls.UNAPPLIED.ps1` | 26,981 B | `e50adf1f…` |
| `OFFLINE_BINDING_HANDOFF_SOURCE_ONLY.md` | 10,617 B | `b24767cd…` |
| `BINDING_IDENTITIES_SOURCE_ONLY.json` (self-excluded) | 1,621 B | `f0a6d70e…` |

- **Base parent.** It is committed in Root's Doc106 pass archive (`285a50c`) and equals the declared 8,861 B,
  `1bf5b4ad…`. It has no own-path or `MainModule` check and no R7 region; both are new here.

## 2. Earliest material defect, with the smallest correction

- **Where.** `execute-admitted-offline-controls.UNAPPLIED.ps1`, line 59:
  `if($qualTicket.parentPin.path -cne $PSCommandPath){throw 'PARENT_SOURCE_PIN_REQUIRED'}`.
- **The problem.** This is a case-sensitive string comparison with no separator normalization.
  - Every pin in this fleet, including the handoff's planned `-File` argument, uses forward-slash paths.
  - On Windows, `$PSCommandPath` is normally the resolved backslash form.
  - So a correctly prepared ticket would throw at line 59. That is after the ticket is consumed by invocation but
    before any child runs, so the single-use attempt would be wasted.
  - Line 60 already normalizes its runtime path (`.Replace('\','/').ToLowerInvariant()`); line 59 does not.
- **Correction.** Compare normalized forms, as line 60 does:
  `$qualTicket.parentPin.path.Replace('\','/').ToLowerInvariant() -cne $PSCommandPath.Replace('\','/').ToLowerInvariant()`.
  Optionally resolve both with `[IO.Path]::GetFullPath` first. `Get-QualPin` already hash-pins the file itself.
- **What changes.** Only the parent's bytes and its identity record. The ticket's `parentPin` hash must be the new one.
- **Proving check, offline only.** A parse plus a no-dispatch reading that the comparison accepts forward-slash and
  backslash spellings of the same path, and refuses a different path.
- **Alternative, not preferred.** Root writes `parentPin.path` in the exact runtime `$PSCommandPath` form, but that
  form is unverified here.

## 3. Verified conformity of the rest (source only)

- **Closed scope.**
  - Exactly 15 serial cases: `node --version`; ten `node --max-old-space-size=128 --check`; a TypeScript parse; a
    PowerShell parse; the guard companion; the finalizer companion.
  - Every executable and every path in every argument is among the 19 pinned inputs. These include `typescript.js`
    5.6.3, its `package.json`, the Doc399 template read by the finalizer companion, and the companion import targets.
  - The ten `--check` targets are exactly the ten `.mjs`/`.cjs` afterimages.
- **The parse literals.**
  - TypeScript: `ts.version === '5.6.3'`, then `createSourceFile` on `harness.UNAPPLIED.ts` and `parseDiagnostics`
    only. It prints `{status:'TYPESCRIPT_PARSE_ONLY',files:1,errors,typecheck:false}` and exits 1 on any error.
  - PowerShell: `Parser.ParseFile` on the two frozen scripts only, with no dot-sourcing. It prints
    `{status:'POWERSHELL_PARSE_ONLY',files:2,errors}`.
- **Result contracts.**
  - Empty stderr is required.
  - `--check` must print nothing, and the version line must be exactly `v20.19.0`.
  - Each other case must print one JSON line with exact fields. The guard companion prints `browserQualification`
    and `nativeTlsCompatibilityProved`; the finalizer companion prints its five fields.
  - Any other kind is refused.
- **Exceptional cleanup.** This is Root's correction to the earlier draft.
  - Every successful `Start()` reaches `finally`.
  - Identity (PID and `StartTime`) is captured from the fresh owned handle, with no attach by PID and no live
    `MainModule` requirement.
  - Stream tasks are started, and the wait is bounded by 14 s.
  - The drain is bounded by the smallest of the remaining 15 s, the 300 s parent age and the window end, and it
    happens before `GetResult`.
  - On any failure, the primary failure, phase and type are recorded and rethrown.
  - In `finally`, only the same Process object is killed, and only inside the window; closure is waited for at most
    1 s. Readers are disposed, and the process object is disposed only after closure is confirmed.
  - Any forced, uncertain or failed closure sets `passed = false`, and the run stops at the first failure.
- **R7 region.** The 181 lines between the markers are text-identical to `947bba10` and to the reviewed browser
  capacity copy. Its embedded light floor of 512 MiB on all three readings, the cold-init, OS and read budgets of
  5 s / 1 s / 2 s, and the 30 s age gate are used unchanged. This does not admit the browser.
- **Bounds.**
  - The window is at most 20 minutes, with `lastStart` = end − 345 s.
  - Parent age is capped at 300 s, and 225 s are reserved after G0 (15 × 15 s).
  - Each child must finish in under 15 s. Output is capped at 1 MiB per file and 1 MiB in total; it is collected and
    then checked, not hard-capped while streaming, as disclosed.
  - No retry and no parallelism.
- **Ticket and environment.**
  - The ticket binds the mode, one attempt, 0 retries, the exclusive window, the stop rule (fresh owned handle only),
    the owner, the plan hash, the output path and the source commit.
  - Pre and post checks cover the records HEAD and tree, full history, a clean tree and all pins.
  - The scoped competing-job check plus the resource owner's attestation are required.
  - Each child's environment is cleared to OS paths and private home and temp directories, with telemetry opt-outs.
    No `NODE_OPTIONS`, staging inputs or credentials.
- **Best status.** `PRELIMINARY_OFFLINE_CHECKS_COMPLETE_REQUIRES_INDEPENDENT_CLOSURE`. It never self-accepts.

## 4. Limits and remaining prerequisites

1. **Exit and receipt can disagree.** A late `Qual-Budget` after the receipt is written (line 339) can exit non-zero
   while the receipt reads complete. Root must treat any non-zero parent exit as failure.
2. **Still to happen.** The bounded parse and qualification of this new parent; independent parent and child PID plus
   creation-time closure; Root's actual ticket at the fixed path with its raw SHA bound externally; owner readiness;
   an exclusive light slot; the clean records HEAD and tree; all 19 pins current.
3. **Not covered.** The parse cases cover syntax only, and the companions are synthetic or mocked. No browser, TLS,
   staging, Doc399 or credential credit.
4. **Browser holds unchanged.** The secure input mechanism and custodian, source7 runtime custody, staging-effects
   authority, a fresh 2,048 MiB browser admission and Doc399 exact-query authority. NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | Core 79c27226 / tree 08f7b563 (offline execution binding: plan 205cbe0d, parent e50adf1f) | reviewer 6abf1edf | CHANGES REQUIRED (minimal): parent line 59 compares ticket parentPin.path to $PSCommandPath case-sensitively without separator normalization (line 60 normalizes); forward-slash pins would refuse after ticket consumption. Fix: normalize both sides like line 60 (Replace('\','/').ToLowerInvariant()); re-pin parent. Rest conforms: 15 closed cases, all paths in 19 pins, parse-only TS/PS literals, exact result contracts, owned-handle finally cleanup with bounded wait/drain/1s closure, R7 region identical to 947bba10 (512 MiB light floor, not browser admission), 300s/20min/1MiB bounds | still needs parse/qualification, independent closure, actual ticket | doc 196.`

Not execution, admission, approval, push, deployment or production consent; not human approval; not test credit.
