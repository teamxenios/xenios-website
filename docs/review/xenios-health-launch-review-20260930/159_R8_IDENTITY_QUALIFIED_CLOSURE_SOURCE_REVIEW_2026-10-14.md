# R8 identity-qualified closure: source review

**ONE NARROW CORRECTION REQUIRED. Everything else is compatible with Doc 158.**

Core `e280d5e1` implements six of the seven Doc 158 rules as written. Its dependent pins are exact.

**The correction.** The closure demands a readable, drive-rooted executable path from every observed row before it
classifies that row.
- A row that is only a reused process ID, with a different creation time, then fails as `CLOSURE_IDENTITY_UNKNOWN`
  whenever Windows hides that process's path. That happens for processes running as SYSTEM or as another user.
- That brings back a false failure from ID reuse, the very class R8 exists to remove.
- It cannot pass anything falsely. It is the smallest fix that keeps R8 from failing the same way again.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git blobs,
diffs and hashes. Nothing parsed, run, queried or imported. No agents. Archive:
`hl12/159_r8_identity_qualified_closure_source_review.json`.

## 1. Binding and scope

- **Commit.** Core `e280d5e1` (tree `4a69ffd5`, parent `bfb007e6`) adds exactly 11 files in
  `identity-qualified-closure-r8-unapplied-proposal/`. No other path changes.
- **Hashes.** The bindings are 11,542 B `b001548f…`, the patch 27,213 B `a1a6fd46…` and the controls 6,110 B
  `07e1d089…`. Root's mirror is byte-identical for all 11 files.
- **Five targets.** All five canonical targets are unchanged since R7 `1911873d`. Each proposed after-image differs
  only as follows:

| File | Before | After | Change |
|---|---|---|---|
| `verify-proving-closure.ps1` | 7,081 | 14,324 `e7ed1c46…` | Identity helpers, gate binding, row retention, new root |
| `execute-admitted-synthetic-proving.ps1` | 35,636 | 35,636 `aaf3f093…` | Output root literal only |
| `SOURCE_MANIFEST.json` | 46,371 | 46,451 `b9f40a33…` | Two closure-template entries, the supervisor and closure pins, two output roots; cases unchanged |
| `invoke-proving-with-observer-gate.ps1` | 25,737 | 25,874 `511b669a…` | New manifest hash and exact cap of 46,451; new root; passes the captured gate hash; requires the closure record to echo it |
| `capture-proving-caller.ps1` | 17,331 | 17,331 `a1e13aec…` | New root; pins the caller at 25,874 B `511b669a…` |

- **Output root.** `ql-doc171-r8-synthetic-proving-20261014` does not exist yet. The other 13 R7 canonical files and
  all case contracts are untouched.

## 2. The seven Doc 158 rules

1. **Identity, not ID. Met, with the correction below.** A row counts as known only when its ID matches and its
   creation time is within 10,000 ticks, which is 1 ms inclusive. A matching identity with a different executable
   refuses as a mismatch.
2. **Self. Met.** The closure's own ID, start time and `$PSHOME\pwsh.exe` are excluded only when the ID and creation
   time both match, and a wrong executable refuses. A self ID with a different creation time is not exempt.
3. **Missing identity fails closed. Met for known identities.** Missing or invalid IDs, creation times or executables
   in the parent, CMD, observer, case or worker records refuse. Creation strings must have seven fractional digits,
   and dates before 1970 or of unspecified kind refuse.
4. **Observer bound by the gate. Met.** The new mandatory `-ObserverGateSha256` must equal the hash of the caller's
   gate file before it is read. The closure checks the gate's status, group, admission hash, observer ID, exit 0, EOF
   and stdout hash. It rehashes the gate after the quiets. The caller passes its own captured gate hash and requires
   the closure record to repeat it.
5. **Scheme worker. Met.** A row whose parent is the runner counts as a live worker only if it was created within the
   runner's recorded lifetime, plus or minus 1 ms. Otherwise it is recorded as a reused parent ID. A missing runner
   exit time refuses.
6. **Retained rows. Met.** Each quiet keeps every raw row's ID, parent ID, creation time and executable, plus each
   classification. A refusal writes one `CLOSURE_IDENTITY_REFUSAL` JSON line with the earlier quiets and the failing
   snapshot.
7. **Unchanged limits. Met.** The two quiets, the 500 ms spacing, the 1 s query timeout, the 10 s closure limit, the
   post-pins, the outer-success checks and the case checks are unchanged.

## 3. Required correction

In `Q-ClassifyObservedIdentity`:
- read and validate the row's ID, parent ID and creation time first;
- decide self, known, worker-child or reuse from those values;
- require a valid, matching executable only for rows whose ID and creation time match the closure itself or a known
  identity;
- for a reused-ID or reused-parent row, record the executable if one is present, but neither require it nor
  validate its format.

A missing or invalid creation time must still refuse for every row.

Add vectors in the same controls file:
- a reused ID with no executable, which is not present;
- a reused ID with a non-drive path such as `\SystemRoot\System32\smss.exe`, which is not present;
- a creation time supplied as a `Local`-kind `DateTime`, the shape Get-CimInstance returns, at and just past the
  1 ms boundary.

Keep every existing vector, including the one where an exact identity with no executable fails, and update the count
literal.

The fix touches the same five paths and the controls file, with the usual cascade of pins. I will review the
re-frozen proposal as a narrow diff.

## 4. Observations, not corrections

- **Real CIM data is not exercised.** The vectors are pure and never see real CIM data. If Get-CimInstance ever
  returned an unspecified-kind `CreationDate`, every observed row, including the closure itself, would refuse. That
  would be a closed failure, not a pass, and the refusal record would show it. My understanding is that it returns
  `Local`. Only a real run settles it.
- **Stream cap.** Retained rows count against the caller's existing 16 KiB closure stream cap. A handful of benign
  reuse rows fits. Many would fail closed, not pass.
- **Dynamic code in the controls.** The controls dot-source the exact helper block after pinning the whole closure
  file by size and hash. That is acceptable as a pinned, pure-function control. It is still dynamic code, so it
  stays pinned to the exact closure bytes.

## 5. Held prerequisites, after the correction

1. Core re-freezes the corrected, unapplied proposal, and I give a narrow review.
2. Samuel grants a new exact five-path protected exception.
3. The same owner takes custody and applies it, and I confirm the applied bytes.
4. The corrected controls actually run as a local section 6 source check, and the result is recorded.
5. Root freezes a fresh, independently authorized window and ticket with the new gate argument in the closure
   template, the new raw pins and the R8 output root, and I compare them.
6. Core acknowledges, Root admits, and Core gives final readiness.
7. One fresh run of all 32 cases is made.

**Unchanged.**
- R7 ticket `790af2ce` stays consumed and FAILED with no group credit, and its outputs are not reused.
- Root's operational release under Doc 158 stands.
- The application `8e85daa` is unchanged.
- Scheme, controls, diff, browser, manifest, security (hold open, no remediation confirmed), provider and live checks
  stay separate.

Not execution consent, not human approval and not test credit.
