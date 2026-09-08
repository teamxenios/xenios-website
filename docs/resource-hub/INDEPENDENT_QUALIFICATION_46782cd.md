# Independent qualification of the integration candidate at 46782cd

Fable, 2026-09-07. Read-only verification of the integration owner's head. I
changed nothing in that tree; `git status` was clean for every measurement
reported here.

## Headline: the full suite is green, and the "remaining full-suite issue" was mine

| Run | Toolchain | Host | Result | Duration |
| --- | --- | --- | --- | --- |
| First | Node 24.14.1 (**wrong**) | audit fan-out running | 12 failed / 7 files | 1547.25s |
| Clean | Node 20.19.0 (**pinned**) | idle | **0 failed** — 917 files passed, 5 skipped; 15,997 tests passed, 59 skipped | 314.21s |

Reproduce:

```
git worktree add --detach <dir> 46782cd && cd <dir> && npm ci
C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe \
  ./node_modules/vitest/vitest.mjs run --reporter=dot
```

### How I nearly got this wrong

Every failure in the first run carried a timing signature — four
`Test timed out in 5000ms`, one `expected '' to contain 'Featured products'`
(an empty render), and two `[vitest-pool]: Failed to start forks worker`
timeouts. None was a product defect.

I then reproduced two failures across six files and traced them to
`client/src/research/kris-launch-a/access-presentation.test.tsx`, where
`ed91fe6` had given `60_000` to the two heaviest 420-card render tests but not
to the two at lines 171 and 229, which still used the 5,000 ms default and
take 3,184 ms and 2,735 ms alone. I patched those two and the six files went
green.

**Then the control refuted it.** With the patch reverted, the same six files
also passed 6/6 on a quiet host. The patch was never shown to be necessary, so
I dropped it. No timeout change is proposed. `ed91fe6` appears sufficient, and
lengthening a timeout that nothing has shown to be too short would have been
exactly the green-washing the founder forbade.

The lesson is about method, not about this file: a heavy run and an agent
fan-out on one host produce failures that look like defects. One heavy run at
a time, on the pinned runtime, or the evidence is worthless.

## Other gates, all on the pinned Node at 46782cd

| Gate | Result |
| --- | --- |
| `server/pgcrypto-qualification.test.ts` | 17/17 pass |
| pgcrypto guard vs. the real tree | pass — 200 SQL files, 2 pinned exemptions, no new public-qualified calls |
| `verify:migration-dag` | pass — 36 nodes, canonical checksums verified |
| `verify:route-uniqueness` | pass — 433 static Express registrations across 424 call sites |
| `test:release-diff-scan` | 8/8 pass |
| `verify:release-diff-scan` | **not runnable by me** — requires explicit production-base and candidate SHAs plus a PII names file held outside the repository |

## On the reported "static file-inventory failure"

That check belongs to `scripts/acceptance/verify-release-manifest.ts`. Per the
2026-08-28 record the inventory itself passes; what fails is the ownership
policy, which the verifier reads from a trusted base commit
(`docs/coordination/FILE_OWNERSHIP.json`, written for single-lane PRs) and
which cannot be satisfied by an integration RC. That is a release-manager
decision, not a code defect. No release manifest exists for this candidate
yet; the newest are dated 2026-08-29.

## Absorbed, and deliberately excluded

- The locked-gate admission landed: `/partner/resources` in the member session
  read paths at `server/research/index.ts:540`, with the signed download shape
  at 634 — the exact admission I measured and handed over.
- A's Downloads census (1,133 PDF occurrences, 905 unique hashes) supersedes my
  494-file one and independently reproduces the same refusal classes.
- My `strip-embedded-attachments.mjs` is **absent** from the candidate, which is
  correct: auxiliary document-cleanup tooling stays outside a frozen RC.

## What this does not establish

A green suite is not a released platform. Production apply, PostgreSQL 17.6
catalog parity, Supabase Storage HTTP behaviour, concurrent-session locking and
the authorized live observation all remain open, and all belong to the
integration owner under an exact-SHA authorization.
