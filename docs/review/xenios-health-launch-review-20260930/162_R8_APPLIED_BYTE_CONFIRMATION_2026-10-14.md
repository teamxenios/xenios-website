# R8 applied-byte confirmation

**CONFIRMED.** Core `b28942eb` applies exactly the five files of the R8 proposal that Doc 160 confirmed, byte for
byte, under Samuel's actual five-path grant. Nothing else changed.

The source dispositions in Doc 160 and Doc 161 stay closed and unchanged. This is source identity only. It is not a
controls run, qualification or execution authority.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git blobs,
hashes and records. No source review was repeated, nothing was run, no vectors were evaluated and no agents were
used. Archive: `hl12/162_r8_applied_byte_confirmation.json`.

## 1. Human grant

Root's verbatim record `DOC187_ACTUAL_HUMAN_R8_EXACT_FIVE_PATH_SOURCE_APPROVAL_20261014.txt` (1,875 B) says:
"I APPROVE THE EXACT CORRECTED R8 FIVE-FILE SOURCE EXCEPTION."

- **What it names.** Decision `DOC180_CORRECTED_R8_EXACT_FIVE_PATH_SOURCE_EXCEPTION_DECISION_READY_20261014.json`,
  identity `8a360515…`, and proposal `9e1ddbc0`. It approves "only the five exact canonical paths and after-images"
  as source application only.
- **What it excludes.** Queries, tests, new execution windows, credentials, production, payments, pushes and
  deployment.
- **Payload.** The decision's payload identity recomputes exactly to
  `8a36051545d3f5068e23d236101165d501e7efdc995a48a5d929c26814c8b8b4`.
- **Provenance.** Root records the grant as a direct user message in the coordinator chat.

## 2. Applied bytes

- **Commit.** `b28942eb` (tree `cf719c27`), sole parent `14bdf5a4`. It makes exactly five modifications, all under
  `docs/`. No client, server, shared, package, script or application path changed. The application `8e85daa` (tree
  `25507c2f`) is untouched.

| Canonical file | Bytes | SHA-256 | Blob |
|---|---|---|---|
| `verify-proving-closure.ps1` | 14,620 | `a153292c…` | `1e6be1b8` |
| `execute-admitted-synthetic-proving.ps1` | 35,636 | `aaf3f093…` | `529a0aca` |
| `SOURCE_MANIFEST.json` | 46,451 | `e4cf6425…` | `19ec711b` |
| `invoke-proving-with-observer-gate.ps1` | 25,874 | `daa0d1ed…` | `119de678` |
| `capture-proving-caller.ps1` | 17,331 | `476f648f…` | `e9ff91b3` |

- **Match to the proposal.** Each applied blob is the same Git blob as its `PROPOSED` file at `9e1ddbc0`.
- **Before-states.** Each one at `14bdf5a4` equals the canonical bytes at R7 `1911873d`.
- **Worktree and copies.** Core's worktree bytes equal the blobs. Root's frozen copies in
  `DOC188_APPLIED_R8_EXACT_FIVE_SOURCE_FROZEN_20261014/` are identical.
- **After application.** Core's next commit `b68019a7` adds only `APPLICATION_RECEIPT.json`. None of the five files
  changed after application.

## 3. What this enables, and the remaining gap

**Enabled.** The canonical closure is now the R8 bytes the pure 24-control fixture pins: 14,620 B `a153292c…`. The
fixture is unchanged at `5118b193…`, so the Doc 161 contract can now produce a meaningful result.

**The remaining gap is execution authority for that one run.** Root's records hold no scope binding, window,
admission or slot for it yet. Before the call, all of these are still required:

1. Root's section 6 scope binding for this one pure-unit run.
2. A finite window and an exclusive slot.
3. Fresh absence checks on both output paths. Both are absent now.
4. Pre-call hashes for the fixture, the applied closure and `pwsh.exe`.
5. Core's fresh readiness, then one call under Doc 161's acceptance rules.
6. My review of the actual result.

The fresh 32-case counter run with its own window, ticket, comparison and admission comes after that.

**Unchanged.**
- Ticket `790af2ce` stays consumed and FAILED. Its 93 files are preserved and not reused.
- The application `8e85daa` and completed qualification are unchanged.
- The security and payment holds stay open.
- No expected output is a pass.

Not execution consent, not human approval and not test credit.
