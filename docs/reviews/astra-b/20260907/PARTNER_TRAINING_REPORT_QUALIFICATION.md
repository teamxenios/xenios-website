# Partner training-record reporting qualification

Status: PASS for the bounded local reporting slice. No production or training/certification actions.

## Controlling source and scope

- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`
- Branch: `codex/xenios-seth-astra-b-20260905`
- Parent: `33df0a658f16c39d7e71822698242c5a20de8034`
- Code commit: `4d2bf985e8c513f4bb669393df0ad897201d821b`
- Code tree: `e65b7b32cb9353e6a640b0bafb486f63d06892ef`
- Code commit pushed to the existing origin branch; terminal evidence `916892`.

Root confirmed the exact five-path allocation before edits. Local active-lease overlap returned `[]` (`e5e6d3`); the older local registry supplements root's explicit allocation and does not grant new ownership.

The code commit changes only:

1. `client/src/research/pages/partners/Training.tsx`
2. `client/src/research/pages/partners/Training.test.tsx`
3. `client/src/research/partner-crm/training-records.ts`
4. `client/src/research/partner-crm/training-records.test.ts`

This separately committed evidence document is the fifth allocated path. No backend, shared, adapter, Auth, Resource Hub, tracking, dependency, or coordination paths changed.

## Qualified semantics and isolation

- The unchanged server projection in `server/research/partners/portal.ts:440` reports required modules, stored completion and nullable formatted completion dates, and the independent boolean `partner.certifiedAt !== null`. It does not supply a certification date, expiry, requirements version, activation decision, or access grant. The unchanged route remains an authenticated partner GET.
- The new parser accepts only the exact own `ok/modules/certified` envelope and exact row fields; booleans are never truthiness-coerced. It requires unique bounded safe IDs, bounded nonblank title/summary text, literal `required: true` as emitted by the current source, and required nullable real calendar dates. `completed: false` requires a null date; `completed: true` can have a null date because source formatting can be unknown. Unknown/private/permission/lifecycle fields invalidate the entire report rather than leaking partial data.
- Certification remains independent of completion: all modules completed with `certified: false`, or incomplete/empty modules with `certified: true`, retain the reported marker. No module-key hardcoding, completion scoring, permission inference, local activation, or current-validity claims were added.
- Rendering labels completion and certification as reported facts, identifies missing dates as unreported, and uses neutral badges. The page no longer turns missing rows into unpublished modules, missing flags into "Not started", or a stored certification marker into proof of current requirements. Explicit empty records remain distinct from a complete history or no published modules.
- A checking/token-keyed private workspace, together with the existing resource hook, hides old records and certification when the account/token changes. Latest-read generation handling ignores older success/denial/malformed results, sign-out, checking, token refresh, unmount, and StrictMode restarts. Denials preserve canonical server-code presentation; errors do not display raw upstream content.
- The exact existing bearer GET is the only request. Refresh remains a read; no completion, certification, agreement, activation, Auth, or permission controls exist. Row identifiers/tokens do not enter markup, URLs, or storage. Source text remains escaped, not executable content or navigation.
- Canonical account, ordinary sign-in, and existing partner support navigation were added. The static curriculum array and its policy wording are unchanged, independently compared with the parent after CRLF normalization (`e5e6d3`: `curriculumArrayUnchanged: true`). The existing identity/tax/payout/agreement review statement remains, without claiming an individual account has met those requirements.

## Verification

Commands ran from the worktree above using Node v20.19.0 and Vitest 4.1.10. The combined command was executed through an in-memory `spawnSync` JSON reporter wrapper; no unallocated report files were written:

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/pages/partners/Training.test.tsx client/src/research/partner-crm/training-records.test.ts client/src/research/pages/partners/Security.test.tsx client/src/research/adapters/partner.test.ts --maxWorkers=2 --reporter=json
```

Terminal `eaab71` (launched in `bb1b3a`): **307 passed, 0 failed, exit 0**, wrapper wall time **10,278 ms**.

| Suite | Passed | Reporter suite duration |
| --- | ---: | ---: |
| `Training.test.tsx` (expanded) | 58 | 1,922.929 ms |
| `training-records.test.ts` (new) | 155 | 100.265 ms |
| `Security.test.tsx` (unchanged regression) | 42 | 1,553.538 ms |
| `adapters/partner.test.ts` (unchanged regression) | 52 | 744.432 ms |

The expanded UI suite replaces the earlier two heavily mocked copy tests while preserving their no-paid-membership policy coverage. It renders the real page, adapter, shell, UI boundary, and resource hook with only the core session context mocked. The total fetch replacement accepts only the existing training GET and throws for unexpected requests; there is no network fallback. Synthetic account values are not real Auth sessions. Tests cover exact request shape, schema/HTTP/HTML/thrown failures, escaped source labels, independent certification/completion, no mutation controls, no storage, A-to-B/A-to-null/A-to-null-to-A, checking/refreshed tokens, overlapping reads in both success/denial orders, unavailable retry, unmount, and StrictMode. Pure tests cover exact own fields, strict booleans, nullable dates, label/ID boundaries, extra private/authority data, independent flags, frozen input, nonaliasing, order preservation, and all-or-nothing rejection.

Focused TypeScript command (four owned roots plus imported dependencies, no emit):

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' -e 'const ts=require("typescript"); const config=ts.readConfigFile("tsconfig.json",ts.sys.readFile); const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,"."); const roots=["client/src/research/pages/partners/Training.tsx","client/src/research/pages/partners/Training.test.tsx","client/src/research/partner-crm/training-records.ts","client/src/research/partner-crm/training-records.test.ts"]; const program=ts.createProgram(roots,{...parsed.options,noEmit:true,incremental:false}); const diagnostics=ts.getPreEmitDiagnostics(program); process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:ts.sys.getCurrentDirectory,getNewLine:()=>"\n"})); process.stdout.write(JSON.stringify({roots,diagnostics:diagnostics.length})+"\n"); process.exitCode=diagnostics.length?1:0;'
```

Terminal `8d292b` (launched in `ef4902`): **0 diagnostics, exit 0**. Working and staged `git diff --check` passed. Tests and typecheck bind to the exact four-file source state sealed in `4d2bf985e8c513f4bb669393df0ad897201d821b`; terminal identifiers are not commit hashes.

## Limits and integration handoff

- This is local source/jsdom/focused-TypeScript qualification, not a full application build, live browser, real sign-in/account-switch, live server authorization, or deployed acceptance claim. Root owns integration/build/browser qualification. No production actions, migrations, flags, deployment, real users, messages, provider actions, payments, Auth/Supabase calls, or Resource Hub changes occurred.
- Existing backend module copy at `server/research/partners/portal.ts:305` still uses the legacy `xenios_membership` title/summary about membership costs. This pre-existing backend policy-copy mismatch was reported to root for the backend owner; it was not changed, locally relabeled, or presented as fixed in this client-only slice. The updated public curriculum still explicitly states no paid membership prerequisite for customer access.
- Future optional modules, new lifecycle/permission fields, different date formats, or changed label limits will fail closed pending explicit contract review. The current required-module list is preserved; new safe module IDs are accepted without inventing a client-owned curriculum list.
- The existing source's completion lookup and certification validity/version semantics are not altered. The report intentionally does not certify freshness, complete-history coverage, entitlement, or readiness from those limited facts.
