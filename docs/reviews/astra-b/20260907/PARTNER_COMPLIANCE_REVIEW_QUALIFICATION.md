# Partner content-review isolation — ASTRA-B qualification

Result: PASS for the bounded local client slice. This is not a production approval, content-use approval, or confirmation of real submissions or communications.

## Source binding and allocation

- Date: 2026-09-07.
- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`.
- Branch: `codex/xenios-seth-astra-b-20260905`.
- Code commit: `be1d15f2a08ec4554f14fee91b884e6b961c550b`.
- Code tree: `75681d37cbe62af23f6b0e026b88670f83cf548d`.
- Parent: `a01289d99f297cefe7dddf9c6f913f5b07d34bfd`.
- Code was pushed before this evidence-only document. Tests below bind the four code files at the code commit.

Only five allocated paths:

1. `client/src/research/pages/partners/Compliance.tsx`
2. `client/src/research/pages/partners/Compliance.test.tsx`
3. `client/src/research/partner-crm/compliance-review.ts`
4. `client/src/research/partner-crm/compliance-review.test.ts`
5. `docs/reviews/astra-b/20260907/PARTNER_COMPLIANCE_REVIEW_QUALIFICATION.md`

Root confirmed exact allocation before edits. The local read-only active-lease overlap scan returned `[]` before the proposal (`25efdf`) and before commit (`e2207c`). Canonical ownership is coordinated by root; no registry file was changed. No backend, adapter, shared runtime, Fable Resource Hub, package, or production paths were edited.

## Behavior and authority

- Preserve existing approved/prohibited policy arrays exactly. A source comparison against the parent, with CRLF normalized only, returned `policyArraysUnchanged:true`, exit 0 (`6338f8`). No policy rewriting or new content-use authority.
- Account checking and signed-out states render no private read, history, or draft. The private workspace is keyed to the credential; shared read guards and a separate submission lifecycle guard prevent cross-account/renewed-token/unmounted data or results from publishing.
- Require the exact existing `{ok:true,submissions}` read envelope and exact `id,title,submittedAt,status` rows. Reject duplicates, malformed/unknown state, unsafe/oversized IDs, control-containing/oversized titles, impossible dates, and extra identity/permission metadata as a whole response. Explicit null dates are unknown; missing dates are invalid. Empty arrays mean returned empty history, not complete history or content approval.
- Show only five source-reported wire statuses: submitted, approved, declined, expired, withdrawn. A reported approved state is not current permission to publish. The DTO lacks exact approved wording, disclosure, version, and current expiry; those are not fabricated or derived.
- Preserve the existing GET and POST adapters, bearer parameters, no-store behavior, and `{title,link,description}` POST body. Draft preparation matches existing route trim/length checks: title 200, link 500, description 5000; blank optional link becomes null. No auto-submit, extra endpoint, capability enablement, or new server write behavior.
- Synchronous request latch prevents same-event duplicate submits. Refresh cannot run during a pending submission, and starting refresh synchronously revokes retained form callbacks before the loading render.
- Unavailable, denied/error, and thrown submission outcomes preserve the draft and block resend for the current mounted view. Read-only history refresh remains possible without releasing the resend lock. No automatic POST retry or assertion that nothing reached storage.
- The unchanged legacy adapter exposes no receipt identifier. Its accepted result is presented only as an endpoint success response, not persistence proof, approval, or email delivery. The draft stays locked and retained while fresh server history is read; no optimistic history row is created. The user may explicitly start another blank draft after this responded state and a readable history result.
- Canonical account/sign-in navigation and a static `mailto:team@xeniostechnology.com?subject=Content%20review%20request` link. No draft, private identity, token, or content in navigation URLs or browser storage. Opaque draft links are POST data only: never followed, fetched, or rendered as navigation by this page.

Read-only source reconciliation: `server/research/partners/portal.ts` maps `preapproved` to wire `approved` and `rejected` to `declined`; `supabase/research-partners.sql` also permits `expired` and `withdrawn`. `server/research/partners/portal-routes.ts` supplies the existing submission gate and trim/length limits; success returns a message, not a receipt ID. These files were inspected but not changed or executed against a service.

## Source-bound validation

Exact combined command, executed in the worktree through a Node `spawnSync` wrapper that parsed JSON in memory without writing result files:

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/pages/partners/Compliance.test.tsx client/src/research/partner-crm/compliance-review.test.ts client/src/research/pages/partners/Organizations.test.tsx client/src/research/adapters/partner.test.ts --maxWorkers=2 --reporter=json
```

Final rerun `defa1c`: **247 passed, 0 failed, 4 files, exit 0**, wrapper wall duration **9566 ms**.

| Suite | Passed | JSON suite duration |
| --- | ---: | ---: |
| `pages/partners/Compliance.test.tsx` | 61 | 2564.697 ms |
| `partner-crm/compliance-review.test.ts` | 101 | 40.265 ms |
| `pages/partners/Organizations.test.tsx` (unchanged regression) | 33 | 1427.753 ms |
| `adapters/partner.test.ts` (unchanged regression) | 52 | 579.409 ms |

New slice: **61 + 101 = 162**. Combined: **162 + 33 + 52 = 247**.

The new UI suite exercises actual adapters and shared resource hooks with synthetic tokens/content and a total fetch stub allowing only the existing compliance GET and explicit POST. No external network fallback. It covers exact payloads; no storage/PII URL writes; policy presence; neutral reported state and unknown date; malformed/extra data; GET 401/403/404/501/503/500; HTML; thrown loaders; plain-text title rendering; bounded draft validation; same-render double submit and refresh-vs-submit; no optimistic row or email claim; retained draft after response; uncertain result locks across read-only refresh; stale A success/failure/unavailability after B; logout, checking, unmount, A-null-A, renewed credentials; overlapping reads; and StrictMode replay.

The independently authored 101-case pure suite additionally checks own fields, all five wire states, SQL state aliases, null-vs-missing dates, leap/century dates, ID/title bounds, extra private/permission fields, whole-response refusal, frozen input, nonaliasing projection, exact trim-first draft limits, and opaque-link preservation without a new URL policy.

Focused TypeScript command (four roots and imports, no artifacts):

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' -e 'const ts=require("typescript"); const config=ts.readConfigFile("tsconfig.json",ts.sys.readFile); const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,"."); const roots=["client/src/research/pages/partners/Compliance.tsx","client/src/research/pages/partners/Compliance.test.tsx","client/src/research/partner-crm/compliance-review.ts","client/src/research/partner-crm/compliance-review.test.ts"]; const program=ts.createProgram(roots,{...parsed.options,noEmit:true,incremental:false}); const diagnostics=ts.getPreEmitDiagnostics(program); process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:ts.sys.getCurrentDirectory,getNewLine:()=>"\n"})); process.stdout.write(JSON.stringify({roots,diagnostics:diagnostics.length})+"\n"); process.exitCode=diagnostics.length?1:0;'
```

Terminal `116ec2`: **0 diagnostics, exit 0**. An earlier test-fixture union typing diagnostic was corrected before the final combined rerun. Staged diff check passed; code commit `be1d15f2a08ec4554f14fee91b884e6b961c550b` includes only the four allocated code files (commit/push terminal evidence `711f73`).

## Limits and integration handoff

- Synthetic local Vitest/jsdom evidence only; not live account, server, browser-viewport, submission-delivery, content certification, or production evidence. Full integration/build/browser qualification remains with the coordinator.
- The submission adapter intentionally remains unchanged. It loses detailed machine result/provenance and has no durable receipt/idempotency key. Consequently every nonaccepted outcome is treated conservatively, and the UI cannot reconcile persistence or safely prove retry eligibility. No claim of durable idempotency.
- The resend lock and draft are memory-only. Navigation, full reload, credential change, or closing the page clears them; the UI warns against leaving to retry uncertain requests. They are not stored because they may contain sensitive draft content. This scope does not solve cross-session duplicate prevention.
- A reported approved history row does not include current expiry/version/disclosure/approved wording. No current-use permission, publishing, assignment, training certification, partner activation, payment, or customer access is inferred.
- Strict schema drift (including historical titles outside current display bounds) fails closed and needs explicit contract review; the page does not silently coerce or partially accept unknown records.
- Production remains untouched: no migrations, deployment, flags, real-user queries, submissions, messages, content approvals, purchases, or payment/provider actions.
