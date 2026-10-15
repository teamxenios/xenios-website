# KAN-31 offline binding: own-path correction, changed bytes only

**CONFIRMED: the Doc 196 finding is resolved.**

- **Overall verdict.** The offline execution binding (`79c27226`, as corrected by `db03e216`) is PASS at source scope.
- **What this is not.** Not a parse, qualification, ticket or execution.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only; no agents. Doc 195 and the accepted browser, `e33`, CI-66, I3 and Q1 are not reopened.
- **Not in scope.** The separate human staging-input source (`f744aae`/`db182046`).
- **Timing.** Reviewed at 2026-10-15T22:01–22:02Z.
- **Jira.** Root relays.

Archive: `hl12/197_kan31_offline_binding_own_path_correction.json`.

## Check

- **Commit.** Core `db03e216` (tree `40136602`, parent `db182046`). Against its parent it changes exactly two paths:
  - `execute-admitted-offline-controls.UNAPPLIED.ps1`, 27,053 B, `6488fba2…`;
  - `BINDING_IDENTITIES_SOURCE_ONLY.json`, 1,621 B, `d48ff663…`.
- **Same two paths against `79c27226`.** The binding directory differs in only those two paths; the plan is unchanged
  (`205cbe0d…`).
- **Parent diff.** It is exactly line 59:
  `if($qualTicket.parentPin.path.Replace('\','/').ToLowerInvariant() -cne $PSCommandPath.Replace('\','/').ToLowerInvariant()){throw 'PARENT_SOURCE_PIN_REQUIRED'}`.
  - This is the correction Doc 196 specified, matching line 60's normalization.
  - The size grows by exactly the 72 inserted characters.
  - No other line changed.
- **Identity diff.** Only the parent's `bytes` and `sha256` fields change: 26,981 → 27,053 B, `e50adf1f` → `6488fba2`.
- **Unchanged.** The plan, commands, result contracts, R7 region, bounds and controls.
- **Failure behavior.** A missing `parentPin.path` still fails closed. The method call on null throws before any child
  runs, and `Get-QualPin` would refuse anyway.

## Outstanding, retained

- **Before the runner is used.**
  - The bounded parse and qualification of the corrected parent (`6488fba2`), plus the no-dispatch reading that both
    slash forms of the same path are accepted.
  - Independent parent and child PID plus creation-time closure.
  - Root's actual one-use ticket at the fixed path, with the new parent hash and its raw SHA bound externally. The old
    ticket and hash are not transferred.
  - Owner readiness, an exclusive light slot, the clean records HEAD and tree, and all 19 pins current.
- **Non-zero exit.** Any non-zero parent exit is a failure, whatever the receipt says (Doc 196 limit 1).
- **Browser holds unchanged.**
  - Secure input setup and startup authority. Samuel's acceptance of local input custody is not setup or startup.
  - Source7 runtime custody, staging-effects authority, a fresh 2,048 MiB admission, and Doc399 exact-query
    authority.
- **Not live.** NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | Core db03e216 / tree 40136602 (Doc196 correction; parent 6488fba2) | reviewer 6abf1edf | CONFIRMED: line 59 now normalizes both parentPin.path and $PSCommandPath (Replace('\','/').ToLowerInvariant()), only change besides identity bytes/hash; plan 205cbe0d and all else unchanged. Offline binding (79c27226+db03e216) PASS at source scope | still needs parse/qualification, independent closure, new-hash actual ticket, current pins, exclusive slot | doc 197.`

Not execution, admission, approval, push, deployment or production consent; not human approval; not test credit.
