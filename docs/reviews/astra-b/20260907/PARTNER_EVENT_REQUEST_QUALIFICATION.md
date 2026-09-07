# Partner organization-event reporting and request qualification

Status: PASS for the bounded local client slice. No production action or event intake activation.

## Source identity and allocation

- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`
- Branch: `codex/xenios-seth-astra-b-20260905`
- Source parent: `68a25d2604e2ba7791d7cf85e6e8f5da48ee08a7`
- Controlling code commit: `631aa80acd84275c5576472d305e72c88b8e8f61`
- Code tree: `8c961f061bc75e9df174eb2aaeec86d080130ca1`
- Code commit pushed to the existing origin branch; terminal evidence `951ae9`.
- Root confirmed the exact five-path allocation before edits. The local active-lease overlap check returned `[]`; terminal evidence `400212`. The older local registry is supplementary, not a new ownership grant.

The code commit changes only:

1. `client/src/research/pages/partners/Events.tsx`
2. `client/src/research/pages/partners/Events.test.tsx`
3. `client/src/research/partner-crm/event-records.ts`
4. `client/src/research/partner-crm/event-records.test.ts`

This evidence document is the fifth allocated path and is committed separately. No backend, shared contracts, adapters, Auth, tracking, Fable Resource Hub, dependency, or coordination files changed.

## Qualified behavior

- The page uses the unchanged bearer GET and the existing resource hook. No organization selector or local permission inference is introduced. Account checking/sign-out hides records and drafts; a credential-keyed workspace clears all four draft fields and request state on account or token changes.
- Strict projection requires the exact current `ok/events` envelope and exact row fields, unique safe IDs, bounded nonblank names, required nullable real calendar dates, required literal-null location, and only `scheduled` / `not scheduled`. Extra identity, organization, permission, approval, or attendance data fails closed. Names remain escaped text. Invalid/unavailable input is not converted into an empty history.
- Source inspection of `server/research/partners/portal.ts` establishes that the existing projection selects/filter events through server-owned organization relationships. It has no venue or review column: location is null, and schedule state comes only from whether `startsAt` is null. A scheduled row can have an unreported date if source date formatting fails; a not-scheduled row cannot carry a date. The client does not promote any of these facts into registration, approval, attendance, occurrence, or organization management permission.
- The unchanged request endpoint in `server/research/partners/portal-routes.ts` returns 503 `capability_disabled`. The UI says intake is unavailable and retains the existing explicit-submit payload: four required trimmed fields (`name`, `date`, `location`, `description`). This slice does not enable intake or add a new request policy.
- Synchronous duplicate-submit and refresh guards, an unmount/generation guard, and a frozen draft prevent stale results from changing another account. Failures and uncertain results keep the draft and block resubmission in the current view, including after a read refresh. Thrown upstream messages are not exposed.
- A synthetic compatibility-only successful POST is presented as an endpoint response without a receipt ID, not registration, approval, schedule/venue confirmation, attendance, attribution, or email delivery. It refreshes reported facts without inserting an optimistic event. An explicit new-draft action clears the prior draft only after that response and a valid read.
- The three existing policy hard lines remain: no medical claims, no income claims, no recruitment. Support uses the static `team@xeniostechnology.com` mailto subject; drafts are not placed in URLs or storage. No communication is sent by these tests.

## Reproducible tests

All commands ran from the worktree above with Node v20.19.0 and Vitest 4.1.10. The combined command was executed through an in-memory `spawnSync` JSON reporter wrapper; no unallocated output files were written:

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/pages/partners/Events.test.tsx client/src/research/partner-crm/event-records.test.ts client/src/research/pages/partners/Campaigns.test.tsx client/src/research/adapters/partner.test.ts --maxWorkers=2 --reporter=json
```

Terminal evidence `8a0347`: **323 passed, 0 failed, exit 0**, wrapper wall time **6,302 ms**.

| Suite | Passed | Reporter suite duration |
| --- | ---: | ---: |
| `Events.test.tsx` (new) | 59 | 1,534.999 ms |
| `event-records.test.ts` (new) | 157 | 30.150 ms |
| `Campaigns.test.tsx` (unchanged regression) | 55 | 1,396.079 ms |
| `adapters/partner.test.ts` (unchanged regression) | 52 | 490.469 ms |

The new suites cover exact reads and request payloads, no implicit writes, no private URL/storage data, schema drift, null source facts, malformed/HTML/thrown responses, denied/unavailable status handling, duplicate submission, all four frozen draft fields, overlapping reads, same-event refresh invalidation, late request results, A-to-B/A-to-null/A-to-null-to-A changes, token refresh, checking, unmount, StrictMode replay, escaped text, no optimistic authority, and conservative empty/history messaging.

UI tests render the real page, adapter, and resource hook in jsdom with a synthetic core context and a total fetch replacement allowing only the existing event GET/POST paths. Unexpected requests throw; there is no network fallback. Pure tests include frozen input, nonaliasing, order preservation, all-or-nothing rejection, exact keys, and preservation of the four-field trim-only request contract. These prove local handling of server responses, not live server authorization or delivery.

Focused TypeScript command (four owned roots plus imported dependencies; no emit):

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' -e 'const ts=require("typescript"); const config=ts.readConfigFile("tsconfig.json",ts.sys.readFile); const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,"."); const roots=["client/src/research/pages/partners/Events.tsx","client/src/research/pages/partners/Events.test.tsx","client/src/research/partner-crm/event-records.ts","client/src/research/partner-crm/event-records.test.ts"]; const program=ts.createProgram(roots,{...parsed.options,noEmit:true,incremental:false}); const diagnostics=ts.getPreEmitDiagnostics(program); process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:ts.sys.getCurrentDirectory,getNewLine:()=>"\n"})); process.stdout.write(JSON.stringify({roots,diagnostics:diagnostics.length})+"\n"); process.exitCode=diagnostics.length?1:0;'
```

Terminal evidence `e02b0f`: **0 diagnostics, exit 0**, tool wall time 3.900 seconds. This was the same four-file source state sealed in code commit `631aa80acd84275c5576472d305e72c88b8e8f61`; terminal identifiers are not code commits. `git diff --check` and staged diff checks passed; the commit contained only the four allocated code/test paths.

## Limits and handoff

- This is local client qualification, not a live browser, full application build, deployed integration, complete organization history, or live Auth/authorization acceptance claim. Root owns integration and browser qualification.
- No production actions, migrations, flags, deployment, real users, provider actions, tracking events, approvals, payments, or messages occurred. The current server-disabled request route remains unchanged.
- Future server venue fields, review states, additional envelope fields, or changed source date/ID contracts will fail closed and need an explicit contract review; this client deliberately does not guess their meaning.
- Request locking is in-memory view protection, not durable idempotency or server cancellation. Leaving/reloading discards it; the visible warning says not to leave/reload to retry an uncertain request. No automated POST retry exists.
- Server organization filtering was inspected, not newly exercised against a live database. The client cannot establish or grant customer, partner, or organization permissions.
