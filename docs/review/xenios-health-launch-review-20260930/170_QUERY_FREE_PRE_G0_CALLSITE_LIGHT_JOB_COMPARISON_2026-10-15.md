# Query-free pre-G0 callsite test: light-job comparison

**SUFFICIENT for the one admitted light job, with no material defect. The fixture faithfully reproduces the failed
callsite's context and pre-G0 expressions, and calls no memory read, R7 code, compiler or build. This is not
admission or invocation, and not a build, test, capacity or qualification result.**

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git objects and
text. Nothing parsed or run, no agents. Docs 163–169 were not re-reviewed.
- **Delivery.** Root's typed delivery failed: Doc 235 says this window was minimized, and nothing was sent. I took the
  packet under Samuel's overnight reviewer brief, which covers pending coordinator comparisons.
- **Timing.** Reviewed at 2026-10-15T02:39–02:46Z, inside the light-job window.

Archive: `hl12/170_query_free_pre_g0_callsite_light_job_comparison.json`.

## 1. What happened in the first slot (Doc 233, `04bbca9`/`f3fae99`; Core `fabf816`)

- **Outcome.**
  - G0 ran once. It took 493 ms, with native exit 1, 610 B of stdout and empty stderr.
  - The failure was `G0_PREFLIGHT_OPERATION_FAILED`, and both `resource` and `phaseDiagnostic` were null.
  - Process age at serialization was 353 ms.
  - There were zero build, install, application-compiler, test and browser calls. The ticket was consumed, with no
    retry.
- **No memory claim.** Root correctly records no low-memory claim and no proved cause.
- **Window.** The Doc 226 build window's last start (02:41:44.528Z) has passed, so that slot is over.
- **What the evidence says, from source.** A null `phaseDiagnostic` with a generic token means the exception was caught
  by the new callsite's own catch, not tokenized by the R7 functions. Valid JSON on stdout with empty stderr means the
  script did reach that `try`.

## 2. The light-job packet (Doc 234, `2395533`)

| Record | Bytes | SHA-256 |
|---|---|---|
| prompt | 2,914 | `1bccafa2…` (equals Doc 235's undelivered packet) |
| comparison-ready record | 4,689 | `35fc57f8…` |
| fixture | 2,995 | `f60aa1ff…` (equals Core `8e6723d` copy, tree `16a70b3b`) |
| proposal | 9,355 | `2ff889ac…` |

- **Native entry.** It recomputes to `5a2f5f87…`. It runs one call to the pinned pwsh with `-NoProfile`,
  `-NonInteractive` and `-File`, passing the fixture and `-StopAtUtc '2026-10-15T02:53:44.528Z'`, and exits with
  `$LASTEXITCODE`.

## 3. Fidelity and scope: accepted

- **Same context.** The fixture keeps the adapter's exact `param([Parameter(Mandatory=$true)][string]$StopAtUtc)`,
  which makes it an advanced script. It also keeps `$ErrorActionPreference='Stop'` and `Set-StrictMode -Version
  Latest`, under the same pinned pwsh `-File` invocation and the same argument.
- **Same lines.** Each of these is a byte-identical line of adapter `4630d6b0…`:
  - the four setup lines;
  - the five pre-G0 expressions: the argument and format check, the deadline parse, the 30-second window check, the
    self runtime path, and the pinned-runtime comparison.
- **Additions.** Only stage markers, plus the exception's CLR type and `ErrorCategory`. There are no messages, stacks or
  environment values. Output is closed JSON capped at 8,192 B, and process age is checked twice.
- **Omissions.** No `Get-XeniosResourceAdmission`, `Add-Type`, `Get-CimInstance`, R7 definitions, Node, npm, build,
  browser, credentials or persistent changes. Leaving out the R7 top-level definitions doesn't change how the parameter
  binding or StrictMode behaves for the copied expressions.

## 4. Authority, window and capture: sufficient for this light job

- **Authority.** Doc 223's run and debug instruction covers one minimal diagnostic. This is not a new framework, and
  not a reuse of the consumed ticket.
- **Window.** Root's separate light-job window runs from 02:33:35.813Z to 02:53:44.528Z, with the last start at
  02:53:14.528Z. That matches the fixture's own 30-second check against the fixed stop input. There is no extension or
  retry.
- **Capture.** The existing managed exec session, running pinned pwsh 7 with login false, must record:
  - the native exit code;
  - UTC before and after, and the tool's wall time;
  - complete stdout and stderr.

  The fixture enforces a lifetime under 30 s and the output cap itself. A late, incomplete or unknown capture is not a
  qualified diagnostic.
- **Owner.** The owner runs it under the docs lease, which is appropriate because it executes no application code.
  Application phase A `abb400e5` is unchanged.
- **Still required.** Core's fresh acknowledgment, Root's exclusive admission and the pin checks.

## 5. Likely outcome and the smallest correction, a hypothesis from source only

- **The likely cause.** The fixture's first guarded expression reads `$args`.
  - A `[Parameter()]` attribute makes the script advanced, and advanced scripts don't populate `$args`.
  - Under `Set-StrictMode -Version Latest`, reading an unset variable throws.
  - The callsite's generic catch would then report `G0_PREFLIGHT_OPERATION_FAILED` within milliseconds, before any
    resource read.

  That matches every observed field.
- **What would confirm it.** The fixture should report stage `ARGUMENT_AND_FORMAT_CHECK`, with
  `System.Management.Automation.RuntimeException` and category `InvalidOperation`.
  - A plain `throw` of a token reports `OperationStopped` instead.
  - The fixed stop input is well-formed, so the format branch cannot be the trigger.
- **If confirmed, the smallest correction.** Remove `$args.Count -ne 0 -or` from the adapter's callsite. Advanced
  parameter binding already rejects unbound extra arguments before the script body runs.
  - That is a one-expression adapter successor, needing a narrow original comparison.
  - It then needs a fresh G0 and build admission, because the Doc 226 slot is over.
  - Nothing else in the runner, pins or entry needs to change.
- **If all five expressions pass,** the failure lies in the R7 call area. Don't widen this job. Prepare the next
  smallest stage test separately.
- **Optional, not blocking.** Also capturing `FullyQualifiedErrorId`, for example `VariableIsUndefined`, would make the
  category unambiguous without exposing data.

## 6. Unchanged

- **No outcome yet.** Build, tests, typecheck, browser, persistence and deployment have not run.
- **Database.** Root reports the disposable database bootstrap as unmet.
- **Security.** Samuel saved a replacement key in Render, but runtime verification, migration of other consumers, old-key
  revocation and closure are all unconfirmed, so the exposure condition stays OPEN. Privileged staff reads stay HELD.
- **Other holds.** Custody is unchanged: phase A active, return PENDING. R8 and Docs 160–169 stay closed, failed run
  `790af2ce` and ticket `404727c5` stay FAILED, and the payment and security holds stay open.

Not execution, admission, push, deployment or production consent; not human approval; not test, capacity or
qualification credit.
