# Partner security-session reporting — ASTRA-B qualification

Result: PASS for this bounded local read-only client slice, not a live security assessment or complete authentication-session inventory.

## Source binding and allocated paths

- Date: 2026-09-07.
- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`.
- Branch: `codex/xenios-seth-astra-b-20260905`.
- Code commit: `a7dda14436c12e7d6ae17407cf3359c87fdda896`.
- Code tree: `e6e929eb0bb02c6097953211c8cfcd13b1ea7515`.
- Parent: `01dd8a35d127ab43915568bcfd2a159879386a57`.
- This evidence-only document follows the pushed code commit. The checks below bind the four code files in that commit.

Exact five-path allocation:

1. `client/src/research/pages/partners/Security.tsx`
2. `client/src/research/pages/partners/Security.test.tsx`
3. `client/src/research/partner-crm/security-sessions.ts`
4. `client/src/research/partner-crm/security-sessions.test.ts`
5. `docs/reviews/astra-b/20260907/PARTNER_SECURITY_SESSIONS_QUALIFICATION.md`

Root confirmed allocation before edits. Local active-lease overlap scans returned `[]` at proposal (`13e4ce`) and before commit (`6a9f98`). Canonical ownership remains with root; no registry, backend, adapter, shared runtime, Auth, package, or Fable path was changed.

## Current source facts and behavior

Read-only source inspection: `server/research/partners/portal.ts` defines `SessionsPayload` with exact `id,startedAt,device,approximateLocation,current` fields. Its session projection maps those reported facts without supplying source completeness or current browser authentication proof. `server/research/partners/portal-production.ts` explicitly returns `[]` from `sessionsFor` because no partner-session history source is configured in that implementation. These are local source facts, not verified live configuration or live session records.

- Preserve the existing `getPartnerSecuritySessions` adapter/GET endpoint. No new endpoint, Auth call, session query, sign-out, password reset, lock, or revocation operation.
- While account checking or signed out, no private reader mounts. The private subtree is keyed to the credential and uses the established principal/generation-bound shared hook. Old account results, refreshed credentials, overlapping refresh, logout, re-entry, unmount, and StrictMode cannot publish a stale device/location/current marker.
- Require exact own envelope and row fields, unique bounded safe IDs, zoned valid timestamps, nullable-but-required bounded text labels, and a real boolean current flag. Reject extra identity/token/permission fields, malformed/missing values, unsafe coercions, and duplicate IDs as a complete response.
- Labels and current marker remain explicitly reported. The page does not infer actual current authentication, device ownership, session validity, account safety, or successful remote sign-out. Null device/location remain unknown, not invented observations.
- Exact empty results state the source may be unavailable or incomplete; they are not evidence of no sign-ins, no other sessions, or account safety. Errors, denial, HTML, missing fields, and malformed results do not become empty history.
- Preserve all five existing basic security guidance entries exactly. A source comparison against the parent with only CRLF normalization returned `securityGuidanceUnchanged:true`, exit 0 (`6a9f98`). Remove the unsupported support-lock promise; static team contact now explicitly does not lock an account, change a password, or revoke sessions.
- Canonical `/research/account` and normal `/research/sign-in` navigation; static `mailto:team@xeniostechnology.com?subject=Account%20security%20concern`. No tokens, row IDs, device/location data, or drafts are placed in links or storage. Returned labels render as text, not executable markup or navigation.

## Tests and exact evidence

Combined command executed in the worktree through a Node `spawnSync` wrapper, parsing JSON in memory and writing no result artifact:

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/pages/partners/Security.test.tsx client/src/research/partner-crm/security-sessions.test.ts client/src/research/pages/partners/shared.test.tsx client/src/research/adapters/partner.test.ts --maxWorkers=2 --reporter=json
```

Terminal `a80e64`: **239 passed, 0 failed, 4 files, exit 0**, wrapper wall duration **5289 ms**.

| Suite | Passed | JSON suite duration |
| --- | ---: | ---: |
| `pages/partners/Security.test.tsx` | 42 | 731.018 ms |
| `partner-crm/security-sessions.test.ts` | 116 | 32.130 ms |
| `pages/partners/shared.test.tsx` (unchanged regression) | 29 | 169.482 ms |
| `adapters/partner.test.ts` (unchanged regression) | 52 | 619.789 ms |

New slice: **42 + 116 = 158**; combined: **158 + 29 + 52 = 239**.

The new UI suite uses actual partner adapter/resource-hook code with synthetic credentials and records. Its total fetch stub accepts only the existing session-report GET; no external fallback, Auth operation, or real record was used. It asserts exact bearer/no-store parameters, no mutation/UI form or storage writes, no identifier/token markup or private links, source-reported markers, null/empty truth, unchanged basic guidance, safe support copy, HTTP 401/403/404/501/503/500, canonical denial, strict malformed/extra-data refusal, HTML/throws, escaped label text, account-switch first-commit hiding, late prior-principal results, logout, A-null-A, checking/refreshed credential, latest overlapping refresh, failed-refresh retry, unmount, and StrictMode.

The independently authored 116-case parser suite also verifies own fields, boolean noncoercion, independently nullable labels, zoned timestamp/calendar/time/offset validity, ID/label bounds, duplicate and extra secret/identity/permission rejection, all-or-nothing behavior, frozen-input preservation, nonaliasing, and source order. Multiple reported current flags are preserved without selecting or inferring the actual current browser session.

Focused no-emit TypeScript (four roots plus imports):

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' -e 'const ts=require("typescript"); const config=ts.readConfigFile("tsconfig.json",ts.sys.readFile); const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,"."); const roots=["client/src/research/pages/partners/Security.tsx","client/src/research/pages/partners/Security.test.tsx","client/src/research/partner-crm/security-sessions.ts","client/src/research/partner-crm/security-sessions.test.ts"]; const program=ts.createProgram(roots,{...parsed.options,noEmit:true,incremental:false}); const diagnostics=ts.getPreEmitDiagnostics(program); process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:ts.sys.getCurrentDirectory,getNewLine:()=>"\n"})); process.stdout.write(JSON.stringify({roots,diagnostics:diagnostics.length})+"\n"); process.exitCode=diagnostics.length?1:0;'
```

Terminal `0f66a0`: **0 diagnostics, exit 0**. Staged `git diff --check` passed, and the code commit contains exactly the four allocated code files (commit/push terminal evidence `985f3e`).

## Remaining boundaries

- Local synthetic Vitest/jsdom and focused TypeScript evidence only. No full build, browser viewport, live account, Supabase/Auth/provider, or production verification claimed. Integration/full-build/browser gates remain with the coordinator.
- The source's empty result lacks a completeness/source-ready signal. This client cannot distinguish a truly empty history from the explicitly absent production source; it states that limitation rather than creating a new source or treating emptiness as safety.
- The strict timestamp display contract accepts a zoned `YYYY-MM-DDTHH:mm:ss` string with optional one-to-three fractional digits and `Z` or numeric offset, preserving it verbatim. New formats, greater precision, new fields, or labels beyond display bounds require explicit contract review and otherwise fail closed.
- A displayed row is not evidence of a live session, trustworthy device/location attribution, or revocation. Client data isolation does not replace existing server authorization.
- No production actions, migrations, deployments, flags, real-user reads, Auth/Supabase calls, sign-outs, password changes, account locks, messages, payments, or provider changes occurred.
