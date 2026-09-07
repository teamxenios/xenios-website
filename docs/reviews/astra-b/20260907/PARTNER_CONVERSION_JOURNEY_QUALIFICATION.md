# Aggregate partner conversion reporting — ASTRA-B qualification

Status: PASS for this bounded local client slice, not whole-release or production acceptance.

## Source and exact allocation

- Code commit: `42709ebbc295ef3c87c390cc10ba20ada1e5dbfc`
- Code tree: `7797f90e11845a22135dc936c1360eb332ab65e8`
- Parent: `2523d2d138e85e91db3dbb2747d991fe5923ed3e`
- Branch: `codex/xenios-seth-astra-b-20260905`
- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`
- Qualification date: 2026-09-07.

Only these five coordinator-allocated paths changed; the first four comprise the code commit:

1. `client/src/research/pages/partners/Conversions.tsx`
2. `client/src/research/pages/partners/Conversions.test.tsx`
3. `client/src/research/partner-crm/conversion-aggregate.ts`
4. `client/src/research/partner-crm/conversion-aggregate.test.ts`
5. `docs/reviews/astra-b/20260907/PARTNER_CONVERSION_JOURNEY_QUALIFICATION.md`

Before writing, the local ownership scan found no active matching lease. Only the unowned ready affiliate-production and strategic tasks matched broader paths. The final local active-lease wildcard scan also returned `[]` (`564f8b`). Root explicitly confirmed the five-path allocation; this is not a claim that the old local registry alone proves current remote ownership. No coordination records were edited.

## Implemented behavior

- The only data operation remains the existing bearer `GET /api/research/partner/conversions`, with no-store, same-origin credentials, no query parameters, and no body. The adapter, route, backend, and shared hook are unchanged.
- Checking and signed-out contexts issue no reporting request. A token-keyed owner subtree plus the existing principal-bound resource hook clears previous counts and outcomes on account/readiness changes. Latest-request/unmount protection is exercised for overlapping refreshes, late denial/success, logout, A-to-null-to-A, token refresh, and StrictMode replay.
- The aggregate reader requires exactly the existing `ok:true`/`rows` envelope and permitted row fields. It accepts only exact month buckets and nonnegative safe-integer counts. Duplicate months, coercible strings, malformed records, and extra identity/contact/permission fields fail the whole response closed.
- No totals, percentages, unique-person counts, purchase counts, commission amounts, or role grants are computed. Server row order is preserved and inputs are not mutated. Projection carries only period, recorded activations, and optional historical renewals.
- Null or absent historical renewals display **Not reported**, distinct from a legitimate recorded zero and without promising future data. Invalid success is an error, missing/unavailable data is unavailable, and a valid empty list is qualified as returned rows rather than complete history or zero unique customers.
- Coded partner denials retain canonical presentation and explicitly distinguish reporting access from customer approval. Raw upstream messages and malformed identity data are not rendered. Historical activation/renewal fields do not imply a paid-membership requirement.
- Read-only refresh and canonical account/referral-link navigation make the reporting journey usable without adding grants, customer lists, tracking, exports, filters, backend actions, or new endpoints.

Read-only source inspection found the existing server route delegates to `service.conversions(partner.partnerId)` after the partner boundary, and the service emits monthly event counts with unknown renewals as null (`server/research/partners/portal-routes.ts` and `portal.ts`). This source observation is not a live authentication or database-isolation test.

## Exact test evidence

Runtime: `C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe` (v20.19.0); Vitest v4.1.10. The final combined run tested the exact four-file working source subsequently committed as `42709eb`; no source edits intervened. Tests use synthetic tokens and stubbed fetch; there is no fallback network.

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/pages/partners/Conversions.test.tsx client/src/research/partner-crm/conversion-aggregate.test.ts client/src/research/pages/partners/Leads.test.tsx client/src/research/partner-crm/lead-aggregate.test.ts --maxWorkers=2 --reporter=json
```

JSON output was captured and summarized in memory. Terminal `e69571`: exit **0**, **167 passed**, **0 failed**, **4 files**, measured child wall time **3,884 ms**.

| Suite | Passed | Suite duration |
| --- | ---: | ---: |
| `partner-crm/conversion-aggregate.test.ts` | 79 | 12.121 ms |
| `pages/partners/Conversions.test.tsx` | 33 | 520.351 ms |
| `partner-crm/lead-aggregate.test.ts` (unchanged regression) | 36 | 13.264 ms |
| `pages/partners/Leads.test.tsx` (unchanged regression) | 19 | 257.285 ms |
| Total | **167** | Parallel run; durations are not additive |

Earlier page-only run `5129b2`: **33/33**, 1 file, exit 0, Vitest duration 3.16 seconds. Independent helper parser-only run: **79/79**, 1 file, exit 0, duration 333 ms. The combined run above is controlling.

## Focused TypeScript and diff

Terminal `99732f`: exit **0**, `Focused TypeScript diagnostics: 0`. Executed using the same Node binary with `-e` in the listed worktree:

```javascript
const ts = require("typescript");
const c = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const p = ts.parseJsonConfigFileContent(c.config, ts.sys, ".");
const roots = [
  "client/src/research/pages/partners/Conversions.tsx",
  "client/src/research/pages/partners/Conversions.test.tsx",
  "client/src/research/partner-crm/conversion-aggregate.ts",
  "client/src/research/partner-crm/conversion-aggregate.test.ts",
];
const program = ts.createProgram(roots, { ...p.options, noEmit: true, incremental: false });
const d = ts.getPreEmitDiagnostics(program);
process.stdout.write(ts.formatDiagnosticsWithColorAndContext(d, {
  getCanonicalFileName: f => f,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => "\n",
}));
process.stdout.write("Focused TypeScript diagnostics: " + d.length + "\n");
process.exitCode = d.length ? 1 : 0;
```

`git diff --check` passed before exact-path staging. The four-file code commit changed no other paths.

## Limits / production boundary

This evidence covers pure parsing and jsdom client behavior. It does not establish live partner/customer authorization, actual conversions, production data coverage, or browser layout acceptance. Server authority remains controlling; full integration build/typecheck and rendered-browser qualification remain coordinator gates. The hook ignores stale responses; this slice does not claim transport cancellation.

No backend, shared contract, adapter, resource hook, Fable Resource Hub, A-owned runtime, package, or production settings were changed. No migrations, deployments, flags, real users, permissions, prices, purchases, payouts, communications, or production mutations were performed.
