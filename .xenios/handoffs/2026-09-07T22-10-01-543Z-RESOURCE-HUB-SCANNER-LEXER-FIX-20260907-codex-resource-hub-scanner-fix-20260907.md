# Resource Hub scanner correction: independent review candidate

Session: `codex-resource-hub-scanner-fix-20260907`.
Task: `RESOURCE-HUB-SCANNER-LEXER-FIX-20260907`.
Worktree: `C:/Users/sboad/projects/xenios-resource-hub-scanner-fix-20260907`.
Branch: `codex/resource-hub-scanner-fix-20260907`.
Base: `db0e5270afd0e943ae52bb0c84d5c786b92c78e7`.
Code candidate: `188ad3cc616c6c5d028cea4b2471a42aa88fe0d3`.
Candidate tree: `51785e92fa86bab24ce65a38320dac8f95b9d055`.

The root coordinator exclusively delegated two files: `server/research/resource-hub/service.ts` and `server/research/resource-hub/service.test.ts`. The separate `4a645a8` continuity commit proposes the exact task/session/lease only in this isolated checkout. No Fable, A, or B checkout or shared board was modified. The integrator should cherry-pick the code commit alone and reconcile continuity separately.

## Problem and correction

Independent inert probes reproduced accepted unexamined object streams through name-valued `obj`/`stream`, escaped delimiters, comment parentheses, and the 20,000-byte dictionary lookback. B independently identified a nested metadata Filter overriding the outer Filter. One lexer now preserves token kinds before decoding names; outer dictionary key/value parsing skips nested values and refuses ambiguous duplicate stream-control keys. Full object boundaries replace the truncating lookback. Raw content checks exclude stream bytes; plain and supported compressed object streams are checked separately, with incomplete syntax recorded per stream. Direct stream lengths protect binary content containing terminator text. Each inflation is clamped to the remaining aggregate budget.

The compatibility helper for stripping literals uses the same lexer. Ordinary image/font/page streams remain opaque data. Unsupported object-stream filters, decode parameters, corruption, lexical incompleteness, and exhausted budgets remain refused. No full PDF-parser or viewer-security certification is claimed; indirect stream lengths retain the bounded terminator fallback, and unrelated metadata/content formats were not audited.

## Executed verification

Pinned executable: `C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe` (verified v20.19.0).

Final command:

```text
node node_modules/vitest/vitest.mjs run server/research/resource-hub/service.test.ts --maxWorkers=1 --no-file-parallelism --no-cache --testTimeout=30000
```

Result: **80 passed, 0 failed**, one test file, 6.22 seconds. This includes all service behavior, original scanner regressions, each newly identified bypass with supported/unsupported/clean controls, nested/duplicate keys, direct stream-boundary behavior, per-stream incomplete syntax, and aggregate byte accounting using a tiny mock without large decompression.

The preceding full-file run had 78 assertions pass and one default-five-second timeout in the existing 20,001-stream test (5.669 seconds under host contention; transform/import approximately 22 seconds). It had no assertion failure. The final run uses an explicit 30-second limit.

`git diff --check` passed. No full suite, build, broad typecheck, browser, real-PDF mass scan, dependency install, database, or production action ran. An existing dependency tree is exposed by a worktree-local node_modules junction; no test cache was enabled.

## Handoff

The code candidate was pushed to its own remote branch. Root/B must independently validate the exact SHA; the author does not self-accept. No integration merge, deployment, migration, grant, message to an external person, or production mutation is authorized or performed by this lane. Source files are complete; local continuity changes are a proposal for the integrator, not a takeover of shared ownership.
