# Member order-history isolation — ASTRA-B qualification

Status: PASS for this bounded local client slice. Not a production or full-release acceptance.

## Exact source

- Code commit: `5d5a069aada4e18b8b899227ae0b443d0e6a6f1c`
- Code tree: `3aa4a80f3d10cecb770d2ee59e8ebaf4a0d62482`
- Parent: `e9c7e5c381729757aad57d00d0133a75b870dce5`
- Branch: `codex/xenios-seth-astra-b-20260905`
- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`
- Qualification date: 2026-09-07.

The coordinator allocated exactly these five paths; only the first four are runtime/tests:

1. `client/src/research/pages/member/Orders.tsx`
2. `client/src/research/pages/member/Orders.test.tsx`
3. `client/src/research/member-orders/read.ts`
4. `client/src/research/member-orders/read.test.ts`
5. `docs/reviews/astra-b/20260907/MEMBER_ORDER_HISTORY_ISOLATION.md`

The local active ownership registry had no matching active path lease on the final check (`1f09db`). Coordinator allocation is the authority for this slice. No registry or coordination file was edited. An optional Node/minimatch ownership-check attempt failed because that dependency is absent; the read-only PowerShell wildcard scan then completed and returned `[]`. No dependency was installed.

## Behavior and boundaries

- Private reads do not start while the canonical member context is checking or has no member token. The token-keyed owner subtree clears old rows, errors, denials, and capability state in the new account's first commit.
- Latest-request generation and unmount guards ignore superseded reads, including refresh overlap, late denial, A-to-B, A-to-null-to-A, refreshed credentials, and StrictMode effect replay. Refresh clears former rows while the new server decision is pending; a denial cannot resurrect earlier successful rows on retry.
- The adapter and existing endpoints remain unchanged: only bearer `GET /api/research/orders` and `GET /api/research/capabilities`, no-store, same-origin, no request body, no identity/query parameters. No new mutations or permissions are introduced.
- The pure reader checks the frozen envelope, canonical order-state vocabulary, safe unique record IDs, parseable timestamp shape, nonnegative safe-integer money, and optional payment/record-kind/shipment-source fields. Malformed or duplicate records fail the whole response closed; invalid success never becomes an invented empty list. Unknown fields are excluded from the projection.
- A reported request remains a request; an absent legacy record kind is labeled unavailable, not inferred from an ID prefix. Absent or unavailable shipment provenance is labeled unavailable even when an array exists. Only an explicitly connected source can describe the returned shipment records. Tracking remains recorded text; no carrier URL is invented.
- Existing returned history remains readable when new product commerce is disabled. The legacy empty heading is retained for compatibility, with explicit source/complete-history/payment/shipment/eligibility qualifications. Empty, unavailable, error, unauthorized, and denial remain distinct. Upstream error/message text is not exposed.
- The existing manual-review presentation is preserved. No payment capture, shipment, delivery time, complete source coverage, direct-buy eligibility, admin role, or partner role is inferred.

## Source-bound test evidence

All tests below ran against the exact four-file working source subsequently committed as `5d5a069`; there were no intervening source edits. Node executable reported v20.19.0; Vitest was v4.1.10. Fetches and account tokens in tests are synthetic; there is no fallback network.

Final combined invocation (JSON output was captured and summarized in memory, not written to an unleased file):

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/pages/member/Orders.test.tsx client/src/research/member-orders/read.test.ts client/src/research/pages/member/cart-checkout.test.tsx --maxWorkers=2 --reporter=json
```

Terminal result `ee5ebb`: exit **0**, **154 passed**, **0 failed**, three test files, measured child wall time **4,496 ms**.

| Suite | Passed | Suite duration |
| --- | ---: | ---: |
| `member-orders/read.test.ts` | 91 | 26.230 ms |
| `pages/member/Orders.test.tsx` | 37 | 816.820 ms |
| `pages/member/cart-checkout.test.tsx` (unchanged compatibility suite) | 26 | 1,643.167 ms |
| Total | **154** | Parallel run; durations are not additive |

Earlier page/compatibility run `218903`: 2 files, 63/63, exit 0, Vitest duration 3.65 seconds. Independent helper parser run: 1 file, 91/91, exit 0, duration 402 ms. Final combined results above are controlling.

The page tests explicitly inspect the first committed render after an account/readiness change, exact adapter fetch arguments, signed-out suppression, older refresh/denial results, unmount, StrictMode replay, request-vs-order provenance, capability isolation, thrown loaders, malformed envelopes, and HTTP 401/403/404/503/500/HTML response handling. Parser tests independently cover every canonical lifecycle state, projection, legacy optional absence, invalid values, duplicate IDs, and shipment-source uncertainty.

## Focused TypeScript

Terminal result `abbb36`: exit **0**, `Focused TypeScript diagnostics: 0`. Exact program uses the repository tsconfig options with `noEmit: true` and `incremental: false`, and these four roots plus their imports:

```javascript
const ts = require("typescript");
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
const roots = [
  "client/src/research/pages/member/Orders.tsx",
  "client/src/research/pages/member/Orders.test.tsx",
  "client/src/research/member-orders/read.ts",
  "client/src/research/member-orders/read.test.ts",
];
const program = ts.createProgram(roots, { ...parsed.options, noEmit: true, incremental: false });
const diagnostics = ts.getPreEmitDiagnostics(program);
process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: f => f,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => "\n",
}));
process.stdout.write("Focused TypeScript diagnostics: " + diagnostics.length + "\n");
process.exitCode = diagnostics.length ? 1 : 0;
```

Executed in the listed worktree using the same Node v20.19.0 executable with `-e`. `git diff --check` passed before commit; exact-path staged commit contains only the four listed code/test files.

## Remaining qualification / production boundary

This is a jsdom/pure-function client qualification, not a live account, browser, database-ownership, checkout, payment, or fulfillment proof. Server authorization and canonical context remain the authority. Full integration typecheck/build and rendered browser acceptance remain coordinator gates. Client generation guards suppress stale publication; they do not claim to cancel transport in the unchanged adapter.

No server, adapter, shared contract, Fable Resource Hub, A-owned backend, admin, tracking, or package files changed. No production deployment, configuration/flag change, migration, data mutation, real communication, user operation, or purchase was performed.
