# R6 application: twelve-path hash confirmation and standing-scope comparison

**CONFIRMED. Core `240de0df` applies exactly the twelve files Doc 149 confirmed, byte for byte, and nothing else.**
Root's standing-scope determination for the one counter-proving group is **COMPATIBLE**. I found no uncovered
action and no missing founder decision for that group.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only Git, hash and
text comparison; nothing compiled, parsed, probed or run. No agents. Archive:
`hl12/150_r6_applied_twelve_path_hash_and_standing_scope.json`.

## 1. Applied bytes

- **Commit.** `240de0df` (tree `bff718a1`), sole parent `3bb19a31`. Its diff against the parent is exactly twelve
  modifications, and the path set equals the twelve targets of the approved payload `ef986236…`.
- **Bytes.** Each applied blob has the same Git blob ID as its frozen `.proposed` counterpart at `3bb19a31`. Each
  also equals the size and SHA-256 Doc 149 confirmed and my own raw R6 extract. Core's worktree bytes equal the blobs.

| Applied file | Bytes | SHA-256 |
|---|---|---|
| `execute-admitted-finalization-controls-proposed.ps1` | 24,763 | `31bd76fa…` |
| `counter-synthetic-case.ps1` | 11,154 | `2659ba56…` |
| `SYNTHETIC_PROVING_SOURCE_REQUIREMENTS.json` | 6,094 | `3bbb02dc…` |
| controls `PINNED_INPUTS_SOURCE_ONLY.json` | 3,093 | `befd8b2e…` |
| `ASSEMBLED_SOURCE_HANDOFF.json` | 7,907 | `a6e56e56…` |
| `execute-admitted-synthetic-proving.ps1` | 29,819 | `f0290d15…` |
| `SOURCE_MANIFEST.json` | 34,182 | `93a557cf…` |
| `execute-admitted-exact-diff-check-r3.ps1` | 25,537 | `d26eac22…` |
| diff `PINNED_INPUTS_SOURCE_ONLY.json` | 1,881 | `2af16af7…` |
| diff `PROPOSAL.json` | 5,016 | `343ad577…` |
| `invoke-proving-with-observer-gate.ps1` | 25,487 | `3b1dfdee…` |
| `capture-proving-caller.ps1` | 17,208 | `d042053b…` |

- **Scope.** Against canonical base `5ee7f88`, the only differences are these twelve files and the R5 and R6
  proposal directories, so the proposals and their history are preserved. The eight preserved dependencies are
  byte-identical at `5ee7f88` and `240de0df`, as Root's record states.
- **After application.** Core's next commit `37b15b7` adds only `DOC150_R6_CANONICAL_APPLICATION_RECEIPT_20261014.json`.
  None of the twelve files changed after application, and Core's worktree is clean at `37b15b7`.
- **Approval binding.** The governing decision record is unchanged at 22,035 B `062969bb…`. Root's application
  verification record agrees with every size, hash and blob above.
- **Application candidate.** `240de0df` changes nothing outside the twelve tooling files. The candidate `8e85daa`
  (tree `25507c2f`) is a separate commit, and its branch still points at it.

## 2. Standing-scope comparison

- **Authority text.** The founder file is 14,993 B `20041ef0…`. Its section 6 sentence matches Root's quotation word
  for word. Root recorded the file on 2026-10-12 as Samuel's actual pasted request.
- **What section 6 covers.** It grants applicable local and synthetic tests and build for independently qualified
  increments. Its exclusions are production schema, data or role changes, new payment destinations or providers,
  money movement, higher spending limits and unreviewed Quick Order activation. None of them applies to the counter
  group.
- **Same class as before.** Root's own Doc 129 record already applied section 6 to the counter and scheme groups under
  these limits. R6 swaps one local, read-only memory query inside the same G0 slot for another, an in-process compiled
  call to `GetPerformanceInfo`. It adds no network, provider, credential, customer, production or browser action.
- **No revocation, no new grant.** The Doc 150 source approval only permits editing the twelve protected files. It
  neither grants nor revokes runtime scope. The consumed Doc 146 diagnostic and clock approvals contribute nothing.
- **Limits match the source.** Every number in Root's scope record equals the applied constants:

| Bound | Scope record | Applied source |
|---|---|---|
| Executor outer, capture | 210,000 / 185,000 ms | caller limit + 30,000 / + 5,000 |
| Caller | 180,000 ms | executor counter limit |
| Supervisor aggregate, work | 120,000 / 90,000 ms | counter constants |
| CMD | 125,000 ms | aggregate + 5,000 |
| Observer | 135,000 ms | frozen observer, unchanged since Doc 129 |
| Child, closure | 5,000 / 10,000 ms | unchanged |
| OS query | under 1 s | CIM timeout 1 s, fails at 1,000 ms |
| Native read | under 2 s | fails at 2,000 ms, inside the 30 s fence |
| Floor, window | 512 MiB, 20 min | unchanged |

- **Uncovered action.** None.
- **What this comparison does not cover.** It covers one counter group only. The scheme group, the controls, the diff
  check and the browser each need their own comparison, and the browser keeps its separate gates. This doc creates
  no window, ticket, slot or consent. Before any invocation, Root freezes an actual window and ticket and I compare
  them. Core also gives fresh custody, and Root issues the exclusive slot and fresh output paths.

## 3. Unchanged

Timing fit is still unproved. The counter's 2 s guards say nothing about the diff runner's 1 s, the controls parent,
the browser's 2,048 MiB admission, the journey or the deployment. Payment and security holds are unchanged.

Not execution consent, not human approval, and not test credit.
