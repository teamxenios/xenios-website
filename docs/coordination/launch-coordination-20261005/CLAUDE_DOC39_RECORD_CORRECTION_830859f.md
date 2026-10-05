# Records correction for doc 38, and verification of the builder's records-only successor `5ee44d5`

Records only. The source verdict is unchanged: **SOURCE ACCEPT WITH LIMITS** for the six-file HTTP delta at
`fd023e8c03baa2326baf707c944bcd25dce7f453` (tree `46de8f772bb04c20eb09d9b8d3fbfacc44d9dd4e`); **QO-P2-03 and QO-P2-04
PARTIAL, closed at source**, authored regressions **NOT RUN**. No test, probe or any other process was executed for this
record; no source review was reopened; no lane was contacted. Reviewer: this session, `claude-fable-5-1`, effort
`xhigh` as reported by the environment.

## 1. The coordinator's five prepared corrections, reconciled against the retained artifacts

The coordinator prepared `CLAUDE_DOC38_RECORD_CORRECTIONS.txt` and `CLAUDE_DOC38_COORDINATOR_DISPOSITION.json` (its
branch, `cf85df9`..`b5b3e6c`). Each point was checked against the bytes on this branch at `78cd7e6`, not against the
coordinator's wording.

| # | Coordinator point | What the retained artifact supports | Action taken |
| --- | --- | --- | --- |
| 1 | 61 single targets, 12 pairs, 23 odd inputs, not 66 singles | **Supported.** `hl12/38_claude-qo-classifier-probe-fd023e8.out` holds 61 single-target rows (33 owned-malformed, 6 owned-valid, 22 unrelated), 12 pair rows and 23 odd-input rows; the `cases` array in the archived `.mjs` has 61 elements. The "66" in doc 38 and in the `78cd7e6` commit message was my miscount. | Doc 38 sections 3 corrected to 61 with the per-kind split; revision note added; script and output left byte-identical. No rerun. |
| 2 | Retain the missing execution-wrapper and scratch-binding provenance, the observational-only semantics, and that the host counter covers singles only; the unreserved below-20 GiB probe is not qualification | **Supported.** The output header carries the source SHA, the `paths.mjs` sha256-lf and the pinned Node version, and nothing else: no argv, cwd, scratch path, start or end time, exit, signal, stderr or resource sample; the executed scratch copy of `paths.mjs` is not archived beside the script; the script logs without assertions or failure exits; the foreign-host loop iterates `cases` only. | Limits written into doc 38 section 3 verbatim to those facts. No retrospective wrapper manufactured. |
| 3 | The retrospective `c807f19` receipt must distinguish Node 999 MiB from first-Vitest 933 MiB and verbose-Vitest 1,206 MiB; the first Vitest raw log remains missing | **Supported.** The receipt's per-run fields already carried 999 (Node start), 933 (Node end and first Vitest start), 1,421, 1,206 and 1,326 correctly; the `hostRule` summary sentence wrongly cited "999 and 1206" for the Vitest rule. The first Vitest run's output was summary-only and was not archived; the verbose rerun log is. | `hostRule` corrected to 933 and 1,206 with shortfalls 603 and 330 MiB; a `revision` field added stating the receipt is retrospective, from in-session tool output, with no contemporaneous wrapper or tool-output identifiers. No other field changed. |
| 4 | Section 6 must say one filtered `handler.test.mjs` per red/green snapshot per the immutable builder plan at `1b3bb16`; do not repeat the two-file set; red is mandatory | **Supported.** `evidence/http-regression-plan-fd023e8.json` at `1b3bb16` proposes, per snapshot, `node --test` on exactly one file (`tests/handler.test.mjs`) with a seven-group name pattern, then Vitest on the single containment file with a two-case filter; red on the `f1e467f` runtime is a full snapshot, not optional. Doc 38 section 6 had said "Node two-file set". | Section 6 rewritten to one filtered handler file per snapshot, red and green both mandatory, red to fail for the intended defect. |
| 5 | Qualify blanket "nothing previously contained is released" claims by the F1 single-slash-scheme exception; its llhttp delivery is unproved; no sink or leak claimed; no new source slice | **Supported.** Section 5 F1 already disclosed the exception; section 4 and my chat summary repeated the claim without it; the `78cd7e6` commit message too. | Section 4 qualified; revision note covers the commit message and the chat statement. F1 stays P3 and batched, no slice. |

No prepared correction was unsupported. One coordinator phrase deserves a precision note rather than adoption: the
disposition says the probe archive "has no adjacent executed `paths.mjs`"; that is true, and the header's sha256-lf
`89c017ec…fc88` equals the blob at `fd023e8`, so the binding exists but only as a hash statement in a reviewer-written
header, which is why it is listed as a limit.

## 2. The builder's records-only successor `5ee44d5` (verified, not re-reviewed)

| Check | Result |
| --- | --- |
| Identity | `5ee44d53e55774fd8a29ea009dac16da2ed907ef`, tree `d7171c75e363e86ef0ddcae88cde4a0d750bc8eb`, parent `1b3bb16` |
| Runtime and invariants | `diff --stat fd023e8 5ee44d5` over `client/`, `server/`, `shared/`, `supabase/`, `scripts/`, `package*.json`, `vitest.config.ts`, `tsconfig.json` is empty; `MOUNT_PROPOSAL.patch`, `evidence/`, `history/`, `PERSISTENCE_PROPOSAL.md` untouched |
| Changed paths | `APPROVAL_MATRIX.md` plus the five own continuity entries (task, lease, session, registry, handoff) |
| QO-R-02 GATE-01 provenance | **CLOSED.** The paragraph now names App.tsx pin `3b3b808b…` → current `1bc59371…` at `0d22757` (Access Hub / HL-17) and server/index.ts pin `1d6594d6…` → current `ba5800e6…` leaving its pin at `3562c03` then `cb9b8d6`, `5809b72`, `27463d7`, `2f0a975` (HL-12 financial and provider chain). These equal the hashes and commits I derived independently in doc 38. The sequencing conclusion is preserved. The same correction applies to the wording in my docs 29, 36 and 37; doc 38 section 5 records it and those older records are left as written. |
| QO-R-04 PWA wording | **CLOSED.** The sentence now lists the `normalizeCarePath` refusal, encoded structural characters `%2e`, `%2f`, `%3f`, `%5c`, `%23`, Research, recommendation, Care, exact `/health`, recovery and recovery-error hashes and the sensitive roots, matching `client/src/pwa/PwaLifecycle.tsx:28-60` at `fd023e8`; the conclusion that plain `/health/quick-order` stays eligible and that `PwaLifecycle.tsx` needs its own protected scope is retained; no seventh file is added to the mount patch. |
| Still open at P3 | QO-R-03 (documentation sentence; optional `/`-boundary tightening in a future source slice), QO-R-06 (historical sentence in `RELOCATION.md`), QO-R-07 (A2 holds listed by reference; the coordinator records that the narrower scope came from Samuel's direct request, whose text it archived at `b7301fc`), F1, F3, F4 (handled at test time). |

## 3. What this record does not do

It does not change the verdict, the closure statuses, the bounds or any hold. It claims no new execution. It does not
treat the coordinator's wording as proof of anything; each point above cites the artifact that supports it. A1, A2, the
PWA protected scope, GATE-01, the Core hash pairs, managed SQL and all intake, purchase and release holds are unchanged.

## 4. Next

Receipt verification of the targeted red/green runs when the coordinator grants a reservation and the builder pushes
exact evidence: source and test blob bindings, actual commands, red failing for the intended defect, green passing on
`fd023e8`, handler and containment coverage. QO-P2-03 and QO-P2-04 can then close within that tested boundary only; a
miniature Express composition does not prove the real protected mount, the reverse proxy, the database or live intake.
If receipts are missing or insufficient, the qualification stays OPEN and only the missing evidence will be named.
