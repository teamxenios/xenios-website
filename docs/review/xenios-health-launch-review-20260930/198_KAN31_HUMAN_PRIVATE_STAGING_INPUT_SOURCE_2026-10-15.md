# KAN-31 human-operated one-time staging input: source review

**PASS, source only, with no material defect.**

- **What it is ready for.** The script is technically suitable to be named in a later concrete human setup and invoker
  decision.
- **What this is not.** Not setup, invocation, credential or startup authority. Hash pins are not human authorization.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only. No parser, prompts, credentials, provider, SQL, probes, browser, configuration or startup action; no
agents. Doc 195 and 197, `e33`, CI-66, I3 and Q1 are not reopened.
- **Timing.** Reviewed at 2026-10-15T22:04–22:10Z.
- **Jira.** Root relays.

Archive: `hl12/198_kan31_human_private_staging_input_source.json`.

## 1. Identity

- **Commit.** Core `db182046` (tree `d6ddf114`, parent `f744aaed`). Four additive files:

| File | Size | Hash |
|---|---|---|
| `human-private-staging-input-once.UNAPPLIED.ps1` | 15,127 B | `d3e2fd97…` |
| `SETUP_DECISION_FIELD_CONTRACT_SOURCE_ONLY.json` | 6,233 B | `e4c45fc3…` |
| `SOURCE_REVIEW_AND_CONCRETE_DECISION_HANDOFF.md` | 10,373 B | `8126e169…` |
| `SOURCE_IDENTITIES_AND_APPROVAL_SCOPE.json` (self-excluded) | 3,334 B | `8ef4e88a…` |

## 2. Findings (source only)

### Console and actor

- **Requirements.** `ConsoleHost`, an interactive session with no redirected stdin, stdout or stderr, and the pinned
  `pwsh` main module. AI tools, which redirect standard I/O, are refused.
- **Path checks.** `snippetPin` must equal `$PSCommandPath` after `GetFullPath`, slash and lowercase normalization,
  consistent with the Doc 196 lesson.

### Authority binding and its limits

- **The decision record.** It must sit under Root's public records and match its hash. It must carry:
  - the setup schema, `approved`, and Root's thread;
  - `invocationActorChangeApproved`, the actor `HUMAN_LOCAL_LAUNCH_CUSTODIAN`, one attempt and 0 retries;
  - the private-console acknowledgment and capacity-recipient approval;
  - the mechanism reference and operator reference.
- **Authority records.** The human approval, staging-effects approval and offline-qualification records must also sit
  under Root's records and match their hashes. Their contents are not parsed, so Root must anchor them.
- **The browser grant.** It must be exactly `…/coordinator-admission.json`, approved, for `e33c12a9`/`ab4415f0`, with
  `totalBudgetMs` 5,730,000 and `minFreeMemoryMiB` 2,048. It must also bind:
  - `realStaging.binding.secureMechanismVerified`, with `secureMechanismReference` equal to the decision's mechanism
    reference;
  - `invocationActor` mode `HUMAN_LOCAL_LAUNCH_CUSTODIAN`, with the custodian reference equal to the operator.

### Recipients and lifetime, disclosed

- **The recipient list.** It must equal exactly `HUMAN_OPERATOR`, `G0`, `CAPACITY`, `NODE_LAUNCHER`, `SUPERVISOR`,
  `OWNED_APP_SUBTREE`.
- **Accuracy.** That matches the frozen chain:
  - the entry's capacity child inherits the entry's environment;
  - the launcher reads the names, deletes them and forwards them only to the supervisor;
  - the supervisor forwards them to the owned app, whose guard refuses `child_process`.
- **What is not claimed.** The script states that no runtime proof excludes the browser.
- **Sequence.** The acknowledgment phrase comes before any prompt, and the attempt record is consumed before the masked
  prompts.

### Secret handling

- **Prompts.** Two masked `Read-Host -AsSecureString` prompts, with lengths of 1–8,192 and 32–8,192 characters, and no
  NUL, CR or LF.
- **Conversion.** Each is converted through a BSTR that is zero-freed, then placed only into the child's explicitly
  cleared `ProcessStartInfo.Environment`. The environment is cleared and the SecureStrings disposed immediately after
  `Start()`, and again in `finally`.
- **Disclosed limit.** The managed plaintext copy cannot be zeroed.
- **Never written.** No secret goes to argv, files, receipts, exception text or the AI or parent environment. Receipts
  are non-secret and capped at 64 KiB.

### Compatibility with the frozen G0 and policy

- **Pins.** Before the prompts, and again after them, the script checks the policy (`81fe0fd6`), the binaries, the G0
  entry (`3ede090e`), capacity (`5ae7e36a`), the launcher (`94a02e3f`) and the grant.
- **Inputs.** Non-secret inputs are whitelisted to the policy's names minus the two secrets. `requiredValues` and the
  staging URL, site URL and owner UUID are enforced.
- **Child invocation.** The child is exactly
  `pwsh -NoProfile -NonInteractive -File …/invoke-browser-g0-and-run.UNAPPLIED.ps1 -GrantSha256 <grant>`, matching the
  frozen entry's parameter and fixed grant path.
- **Environment.** OS paths and private scratch directories, plus the inputs. No `NODE_OPTIONS`, `NODE_PATH`,
  `NODE_EXTRA_CA_CERTS` or nonce, so the launcher's gate passes. The launcher builds its own `safeEnv`.
- **No incompatibility.** The launcher checks specific grant fields, not an exact key set, so the extra
  `invocationActor` is tolerated. Nothing in the launcher or supervisor ties execution to Core's transport.
- **Window.** Checked before the acknowledgment, after it, after the prompts and before start, with the same arithmetic
  as the entry: `notBefore` ≤ now ≤ `latestStart`, and now + 5,760,000 ms ≤ `reservedUntil`. A late launch is refused
  even if a prompt sat open.
- **Bounds unchanged.** The 2,048 MiB floor and the 5,730,000 ms launcher bound are not touched.

### Failure and closure

- **Fresh attempt.** One attempt, with a fresh `operatorScratchRoot` (no reparse points, outside the browser scratch).
- **Waiting.** The script waits only on its own Process object, until it exits or `reservedUntil`. It never kills
  anything. A non-zero exit gives `G0_CHAIN_FAILED`, and an unknown closure gives
  `RESERVATION_HELD_UNCONFIRMED_G0_CLOSURE`, with an instruction to keep the console open and report the PID and
  creation time.
- **Interrupts.** The child is created with `CreateNoWindow`, so console Ctrl+C does not reach it, consistent with the
  rule against new stops.
- **After `Start()`.** An exception after `Start()` still records the unknown closure in `finally`.

## 3. Non-blocking notes

1. **Lost diagnostics.** The G0 chain's stdout and stderr are not captured; they go to the hidden child console.
   Throw-path refusals, such as entry line 41, would leave only the exit code and the files the entry already
   persists. Consider redirecting to bounded non-secret files in `operatorScratchRoot`.
2. **No prompt timeout.** `Read-Host` has none. The repeated window checks prevent a late launch, but the human should
   expect a cancelled attempt if a prompt is left open.
3. **Runtime claims are static.** Recipient exclusion for Chromium and metadata is static analysis only, as stated.
4. **Hash binding only.** Hash binding of the three authority records proves their bytes, not a human's identity.

## 4. Remaining execution and permission conditions

1. **Setup and invoker authority.** Samuel's explicit, concrete authority for setup and for the human invoker. His
   accepted local input custody (`call_858264bc…`) is neither.
2. **Root's records.** Root's actual decision record instance, and the human approval, staging-effects approval and
   offline-qualification records. The last requires the Doc 197 runner's actual parse, qualification and offline-control
   receipts with independent closure.
3. **The grant.** The browser grant carrying `invocationActor` and the `realStaging` binding.
4. **Materialization.** Passive materialization of the scratch program copies with current pins, plus source7 custody
   and pins.
5. **At run time.** A fresh 2,048 MiB G0 and an exclusive slot.
6. **After the run.** Independent closure, the separate Doc399 exact-query authority, then my final-result review.

Q1 and I3 tickets are consumed. Staff, security, payment, the manifest and live verification stay OPEN. NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | Core db182046 / tree d6ddf114 (human private staging input source; script d3e2fd97) | reviewer 6abf1edf | PASS (source only): private ConsoleHost/pinned pwsh gate, Root-record decision + authority pins (hash only), exact recipient list matching frozen chain, masked input -> explicit cleared child env only, no secret in argv/files/receipts, pins + window (same arithmetic as G0 entry; 2048 MiB, 5730000/5760000 ms unchanged) before and after prompts, exact G0 entry argv, launcher-gate-compatible env, no kill; unknown closure holds reservation. Notes: child stdout/stderr not captured; Read-Host has no timeout; exclusion is static | still requires Samuel's concrete setup + invoker authority (custody acceptance is not that), Root decision/authority records, offline-qualification receipts, grant with invocationActor, materialization/pins, source7, fresh 2048 G0, Doc399 authority | doc 198.`

Not setup, invocation, credential, execution, push, deployment or production consent; not human approval.
