# Campaign-code reporting and request isolation — ASTRA-B qualification

Result: PASS for the bounded local client slice. Campaign intake remains server-disabled; this is not a campaign launch, approval, registration, attribution, or production qualification.

## Source binding and allocation

- Date: 2026-09-07.
- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`.
- Branch: `codex/xenios-seth-astra-b-20260905`.
- Code commit: `b54c1a543251ebaf41090c230bd10859a1ae5849`.
- Code tree: `efcbd4b356456a1319fed0b0cb47c08faab75f26`.
- Parent: `6a51368a28cea967d31c80e8402c36f7b2423865`.
- This subsequent document is evidence-only. The validation below binds the four code files at the pushed code commit.

Only five allocated paths:

1. `client/src/research/pages/partners/Campaigns.tsx`
2. `client/src/research/pages/partners/Campaigns.test.tsx`
3. `client/src/research/partner-crm/campaign-records.ts`
4. `client/src/research/partner-crm/campaign-records.test.ts`
5. `docs/reviews/astra-b/20260907/PARTNER_CAMPAIGN_REQUEST_QUALIFICATION.md`

Root confirmed exact allocation before edits. Read-only local active-lease scans returned `[]` at proposal and before commit (`ea115e`). No backend, shared runtime, adapter, Auth, tracking, package, registry, Fable Resource Hub, or production path changed.

## Source facts and implemented behavior

Read-only inspection of `server/research/partners/portal.ts` shows that `campaigns(partnerId)` groups campaign codes on the partner's issued links. The returned ID equals the exact campaign name/code. States are only `link issued` or `link revoked`; the `window` field is an issued-link date label or null, not a campaign schedule. There is no campaign approval workflow behind this projection. `server/research/partners/portal-routes.ts` returns unconditional HTTP 503 `capability_disabled` for the current campaign request route. Those files remain unchanged; these are local source facts, not live verification.

- Present the list as reported campaign codes carried by links, not registered/approved campaigns or performance reports. Neither an issued link nor its issue date establishes current link eligibility, content approval, campaign scheduling, or successful attribution.
- Accept only exact `{ok:true,campaigns}` and exact `id,name,window,status` rows. Require exact ID/name binding, unique bounded plain-text codes, the two source states, and a null or real `Link issued YYYY-MM-DD` label. Opaque codes preserve spaces, Unicode, punctuation, and case; they are rendered as text, never used as URLs. Extra identity/permission/performance data, malformed rows, duplicates, and invented workflow states fail closed as a complete response.
- Preserve null issue-date uncertainty and distinguish explicit empty rows from complete link history or request status. Remove inferred `To be scheduled`, `In review`, success-colored approval, launch, carried-over email, and attribution claims.
- Checking or signed-out accounts mount no private read or request draft. Credential-keyed workspace and existing generation-bound read hook prevent prior-account records, drafts, validation, or asynchronous outcomes from appearing after switches, logout, renewed credentials, re-entry, or unmount.
- Keep exact existing GET/POST adapters and `{name,timeframe,description}` trimmed required-field request payload. No new server contract, request intake, grant, tracking, or workflow. The UI plainly states that current request intake is unavailable.
- Synchronous latch blocks duplicate submits and refresh while a request is pending; all draft fields are frozen. Refresh synchronously revokes retained form callbacks. Every uncertain/nonaccepted outcome retains the draft and blocks resending within this view; read-only refresh does not release the lock. No automatic POST retry.
- For compatibility only, a synthetic accepted adapter result is described as an endpoint response without a receipt ID, not registration, approval, scheduling, attribution, persistence proof, or email delivery. It triggers a fresh read without optimistic rows and keeps the draft until the user explicitly starts another after a readable result. The real current route remains 503.
- Static `mailto:team@xeniostechnology.com?subject=Campaign%20request`, `/research/account`, and normal `/research/sign-in` navigation. No drafts, tokens, or private values in links or storage; no real messages.

## Exact validation

Combined command executed in the worktree via a Node `spawnSync` wrapper, parsing JSON in memory without output artifact files:

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/pages/partners/Campaigns.test.tsx client/src/research/partner-crm/campaign-records.test.ts client/src/research/pages/partners/Compliance.test.tsx client/src/research/adapters/partner.test.ts --maxWorkers=2 --reporter=json
```

Terminal `de4fca`: **311 passed, 0 failed, 4 files, exit 0**; wrapper wall duration **5956 ms**.

| Suite | Passed | JSON suite duration |
| --- | ---: | ---: |
| `pages/partners/Campaigns.test.tsx` | 55 | 1252.029 ms |
| `partner-crm/campaign-records.test.ts` | 143 | 26.165 ms |
| `pages/partners/Compliance.test.tsx` (unchanged regression) | 61 | 1455.775 ms |
| `adapters/partner.test.ts` (unchanged regression) | 52 | 540.371 ms |

New slice: **55 + 143 = 198**. Combined: **198 + 61 + 52 = 311**.

The new UI suite uses actual adapters and shared resource-hook code with synthetic tokens/drafts. A total fetch stub permits only the existing campaign-code GET and explicit campaign-request POST; the default POST fixture is the source's 503 denial. No external fallback. Assertions cover exact bearer/body/no-store calls, no read-triggered mutation or storage/URL write, reported link facts and absent intake, unknown/null/empty data, strict malformed/extra data and workflow-promotion refusal, HTTP denial/error and HTML/throw containment, escaped opaque codes, required drafts, duplicate and refresh-vs-submit guards, all-field freezing, uncertain result/no-resend behavior, synthetic response caveats without optimistic data, account-switch first-commit isolation, late A outcomes after B, logout/checking/unmount/A-null-A/refreshed tokens, overlapping reads, and StrictMode.

The independently authored 143-case pure suite also checks exact own fields, ID/name binding without normalization, code boundaries/controls/Unicode, duplicate and extra PII/permission/workflow/performance rejection, two states only, real issued dates including leap/century rules, null-vs-missing labels, frozen-input/nonaliasing/order, and exact trim-only required draft preparation. No new arbitrary draft length, URL, or timeframe policy was added to the existing request contract.

Focused no-emit TypeScript command (four roots plus imports):

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' -e 'const ts=require("typescript"); const config=ts.readConfigFile("tsconfig.json",ts.sys.readFile); const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,"."); const roots=["client/src/research/pages/partners/Campaigns.tsx","client/src/research/pages/partners/Campaigns.test.tsx","client/src/research/partner-crm/campaign-records.ts","client/src/research/partner-crm/campaign-records.test.ts"]; const program=ts.createProgram(roots,{...parsed.options,noEmit:true,incremental:false}); const diagnostics=ts.getPreEmitDiagnostics(program); process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:ts.sys.getCurrentDirectory,getNewLine:()=>"\n"})); process.stdout.write(JSON.stringify({roots,diagnostics:diagnostics.length})+"\n"); process.exitCode=diagnostics.length?1:0;'
```

Terminal `2cc220`: **0 diagnostics, exit 0**. Staged `git diff --check` passed, and code commit `b54c1a543251ebaf41090c230bd10859a1ae5849` contains only the four allocated code files (commit/push terminal evidence `fdadd1`).

## Limits and handoff

- Synthetic local Vitest/jsdom and focused TypeScript evidence only; no full build, browser viewport, live account, live request, attribution, or production verification. Coordinator retains integration/build/browser gates.
- The server's 503 request boundary remains unchanged. No campaign workflow/intake dependency was created or enabled. Link code reporting is not campaign activation, performance, request-history, or approval evidence.
- The unchanged submission adapter has no receipt ID or durable idempotency/provenance. All nonaccepted results are conservatively uncertain for retry purposes. Draft and resend latch are memory-only; navigation/full reload/credential change clears them. The UI warns not to leave to retry. This does not solve cross-session duplicate prevention.
- Reported code display is bounded at 200 characters and rejects controls; unexpected future/legacy source formats fail closed. A new scheduled/approved campaign DTO needs explicit review, not status reinterpretation.
- No production actions, migrations, deployment, flags, real-user reads, messages, purchases, payments, Auth/Supabase calls, backend/shared/adapter or Fable changes occurred.
