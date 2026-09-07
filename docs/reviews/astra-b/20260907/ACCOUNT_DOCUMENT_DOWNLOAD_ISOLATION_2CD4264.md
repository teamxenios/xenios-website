# Account document download isolation — source-bound focused evidence

Recorded by ASTRA-B on 2026-09-07. This is a local implementation/test handoff, not production or full-release qualification.

## Exact source

- Implementation commit: `2cd42647c80fd4d8d0adefb1decd1d7ed8c835de`
- Implementation tree: `89f70fa0374d969123499c001e38d07f310cae33`
- Parent: `8a31343b902fa62243736bb318c3d37192008344`
- Branch: `codex/xenios-seth-astra-b-20260905`
- Repository: `https://github.com/teamxenios/xenios-website.git`
- Working directory: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`

The focused run below completed against the seven-file working-tree change subsequently committed as `2cd42647c80fd4d8d0adefb1decd1d7ed8c835de`. No source edits occurred between the passing run and that commit. Git diff checks passed; the implementation was pushed and `git ls-remote` matched its full SHA. The worktree was clean at handoff and again before this documentation-only follow-up. This record transcribes the observed terminal output; it is not a newly rerun test report or an independently generated machine attestation.

## Executed command and observed result

PowerShell, with the working directory above:

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/account/AccountDocuments.test.tsx client/src/research/account-portal/api.test.ts client/src/research/account-portal/views/support-documents.test.tsx --maxWorkers=2
```

Observed output from Vitest `v4.1.10`:

```text
Test Files  3 passed (3)
     Tests  42 passed (42)
  Start at  13:05:19
  Duration  17.77s (transform 659ms, setup 0ms, import 1.82s, tests 562ms, environment 31.32s)
```

Process exit code: **0**. Execution session: `21442`; completion output chunk: `8c3228`. The displayed start time is the runner's local time; no additional timezone claim is inferred from its output. Parallel environment timings need not sum to elapsed duration.

The three executed suites were:

1. `client/src/research/account/AccountDocuments.test.tsx`
2. `client/src/research/account-portal/api.test.ts`
3. `client/src/research/account-portal/views/support-documents.test.tsx`

## Scope and behavioral coverage

Exactly seven allocated files changed in the implementation commit (401 insertions, 13 deletions):

- `client/src/research/account/AccountDocuments.tsx`
- `client/src/research/account/AccountDocuments.test.tsx`
- `client/src/research/account-portal/api.ts`
- `client/src/research/account-portal/api.test.ts`
- `client/src/research/account-portal/useDocumentDownload.ts`
- `client/src/research/account-portal/views/DocumentsView.tsx`
- `client/src/research/account-portal/views/support-documents.test.tsx`

The implementation binds document reads/save side effects to the verified bearer and mounted route, aborts old work on token changes/unmount, discards late completions even when transport ignores cancellation, deduplicates clicks, and cleans up object URLs. A token refresh deliberately cancels the old download rather than inferring that the refreshed token has unchanged authority. Distinct document requests can proceed independently; a newer same-path attempt supersedes its predecessor. The adapter refuses redirects and preserves existing safe-path validation and normal bearer GET behavior. Display copy describes historical billing records without a paid-membership prerequisite.

Tests use synthetic Customer A, Partner A, Partner B, and Organization A personas as labels only, not client-side role grants. They cover current-account success, exact bearer/no mutation payload, sign-out, account switching, A-to-B-to-A, stale callbacks/errors, pending body completion after unmount, refresh cancellation, same-path supersession, distinct-path concurrency, unsafe paths, denials/errors, redirect refusal, object-URL cleanup, cancellation copy, and duplicate clicks. The route tests mock account context/shell and synthetic API responses; they do not establish real Auth, live ownership, rendered production logout, or production document delivery.

No Resource Hub, A-owned backend, shared role authority, coordination registry, database, or production paths were changed. No migrations, flags, deployments, real users, payments, emails, or messages were performed. Only the three focused suites and diff checks were run for this slice; full typecheck, build, browser qualification, and combined-runtime release gates remain outside this evidence. This follow-up adds only this handoff document and does not rerun or alter the implementation.
