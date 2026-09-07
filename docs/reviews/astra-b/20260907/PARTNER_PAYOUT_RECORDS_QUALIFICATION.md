# Partner payout records qualification — ASTRA-B

Result: PASS for this bounded local client slice, not production readiness or executed payouts.

## Source binding and scope

- Date: 2026-09-07.
- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`.
- Branch: `codex/xenios-seth-astra-b-20260905`.
- Code commit: `2f51b7063044e1fa673d07e4cac01b60c61bc6b0`.
- Code tree: `3296818989c0b659ba48436dd590b5edcd85e369`.
- Parent: `60c900ef9dc2a7047e417be2eda050cdc82ccddf`.
- This document is a subsequent evidence-only commit; the tests below bind the four code files at the code commit, not later runtime changes.

Exact allocated paths:

1. `client/src/research/pages/partners/Payouts.tsx`
2. `client/src/research/pages/partners/Payouts.test.tsx`
3. `client/src/research/partner-crm/payout-records.ts`
4. `client/src/research/partner-crm/payout-records.test.ts`
5. `docs/reviews/astra-b/20260907/PARTNER_PAYOUT_RECORDS_QUALIFICATION.md`

Root confirmed canonical allocation before edits. A local read-only active-lease overlap scan returned `[]` (terminal `47a5ba`). No backend, adapter, shared runtime, capability, registry, package, Fable Resource Hub, or production path changed.

## Implemented behavior

- Preserve `affiliate_payouts` capability gate. While account verification is pending, signed out, or capability is absent/disabled/unavailable, no private payout request runs. Only an explicitly enabled server capability mounts the existing payout reader.
- Method status and batch rows share the same authorized read boundary. Loading, denial, failure, malformed payloads, and refresh do not become "No payout method on file", completed setup, scheduled payouts, or empty history.
- Key the private capability/read subtree to the current credential and reuse existing principal/generation-bound hooks. A-to-B, A-to-null-to-A, verification, refreshed credentials, late capability results, overlapping reloads, StrictMode replay, and unmount cannot publish prior private records.
- Accept only the current exact `{ok:true,method,payouts}` DTO, with four source setup-label/boolean pairs; five batch statuses (`built`, `submitted`, `completed`, `failed`, `cancelled`); real YYYY-MM-DD dates; unique bounded safe IDs; nonnegative safe-integer cents; and safe provider labels. Reject malformed/unknown/extra identity-bearing data as a complete response rather than partially displaying it.
- Both setup and batch state are explicitly *reported*. No ready-for-payout, schedule, bank receipt, eligibility, tax approval, balance, complete-history, or zero-balance inference. Preserve exact cents with the previously qualified `formatCommissionCents` helper, including `Number.MAX_SAFE_INTEGER` as `$90,071,992,547,409.91`.
- Canonical navigation: `/research/account`, `/research/partners/commissions`, and normal `/research/sign-in`. No bank/tax forms, payout buttons, provider setup, customer grants, or paid-membership prerequisite.

Read-only source reconciliation: `server/research/partners/portal.ts` projects the four exact setup labels, `settled` batches as wire `completed`, and disabled providers as `No provider configured`. `server/research/commerce/persistence/commissions-store.ts` defines batch states `built|submitted|settled|failed|cancelled`. This slice does not reinterpret provider-specific payment states or change those sources.

## Tests and exact results

Command executed in the worktree, via a Node `spawnSync` wrapper that parsed Vitest JSON in memory (no result artifact or network fallback):

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/pages/partners/Payouts.test.tsx client/src/research/partner-crm/payout-records.test.ts client/src/research/pages/partners/Commissions.test.tsx client/src/research/partner-crm/commission-ledger.test.ts --maxWorkers=2 --reporter=json
```

Final rerun terminal `60473e`: **344 passed, 0 failed, 4 files, exit 0**, measured wrapper wall duration **3724 ms**.

| Suite | Passed | JSON suite duration |
| --- | ---: | ---: |
| `pages/partners/Payouts.test.tsx` | 63 | 887.204 ms |
| `partner-crm/payout-records.test.ts` | 111 | 20.077 ms |
| `pages/partners/Commissions.test.tsx` (unchanged regression) | 47 | 837.515 ms |
| `partner-crm/commission-ledger.test.ts` (unchanged regression) | 123 | 37.135 ms |

New slice: **63 + 111 = 174**. Combined regression: **174 + 47 + 123 = 344**.

UI tests use actual adapter, capability, and resource-hook code with synthetic tokens and fetch stubs allowing only the existing capability and payout read URLs. No external request can fall back to the network. Assertions cover exact bearer GET parameters, no mutation bodies, no forms, canonical links, capability errors, private state isolation, setup-label consistency, five reported states, cents, empty-vs-unavailable, malformed/PII rejection, HTTP 401/403/404/501/503/500, canonical partner denial, HTML, thrown readers, and safe read-only retry.

Independent helper authored and ran the 111-case parser suite; no concrete parser defect found. It additionally checks own-field requirements, leap/century dates, numeric/ID bounds, safe provider keys, extra fields at all three boundaries, duplicates, all-or-nothing refusal, frozen-input preservation, and nonaliasing projection.

An earlier type pass found two test-mock callable-type diagnostics; explicit request/mock typing corrected these in the allocated test file. The final test run above is after that correction.

Focused no-emit TypeScript command (four roots plus their imports):

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' -e 'const ts=require("typescript"); const config=ts.readConfigFile("tsconfig.json",ts.sys.readFile); const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,"."); const roots=["client/src/research/pages/partners/Payouts.tsx","client/src/research/pages/partners/Payouts.test.tsx","client/src/research/partner-crm/payout-records.ts","client/src/research/partner-crm/payout-records.test.ts"]; const program=ts.createProgram(roots,{...parsed.options,noEmit:true,incremental:false}); const diagnostics=ts.getPreEmitDiagnostics(program); process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:ts.sys.getCurrentDirectory,getNewLine:()=>"\n"})); process.stdout.write(JSON.stringify({roots,diagnostics:diagnostics.length})+"\n"); process.exitCode=diagnostics.length?1:0;'
```

Terminal `ae5aa9`: **0 diagnostics, exit 0**. Staged `git diff --check` also passed before code commit (terminal `930b22`); only the four allocated code paths were committed.

## Limits and integration handoff

- This is synthetic local Vitest/jsdom evidence, not live Supabase, provider, account, bank, mobile-browser, or production evidence. Full integration/build and browser qualification remain the coordinator's release gates.
- Server role and capability authority are unchanged. Existing same-token capability caching is unchanged; read authorization still belongs to the server. Client hiding is not a replacement for server authorization.
- Strict DTO/schema drift fails closed. Provider labels accept exact `No provider configured` or lowercase bounded provider keys (`[a-z][a-z0-9_-]{0,63}`); a future differently formatted valid provider label or new status needs explicit contract review and tests before rendering. No arbitrary provider metadata is displayed.
- No payout balances, execution eligibility, schedule, tax status beyond the source setup label, or bank receipts are available in this DTO. No new data source, provider action, or reconciliation is implied.
- No production actions, migrations, deployment, feature-flag changes, payments, messages, or real-user reads occurred. Production remains untouched.
