# Affiliate QR and print export qualification

Status: PASS for the bounded source, focused tests, and scoped TypeScript check. Not production deployment approval or real-browser/physical-print acceptance.

## Exact source

- Implementation commit: `5981c3051150db0c62eb59d8c1bded910d5f5003`
- Implementation tree: `3387f73b65d95fc819413eddc2bf03eaec5418c0`
- Parent: `1e9e916333c3e6be5ba805faedd229279fa822ab`
- Branch: `codex/xenios-seth-astra-b-20260905`
- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`

Allocated implementation paths (nine):

1. `client/src/research/pages/partners/Links.tsx`
2. `client/src/research/pages/partners/Links.test.tsx`
3. `client/src/research/recommendation/qr-export.ts`
4. `client/src/research/recommendation/qr-export.test.ts`
5. `client/src/research/recommendation/RecommendationPrintCard.tsx`
6. `client/src/research/recommendation/RecommendationPrintCard.test.tsx`
7. `client/src/research/recommendation/recommendation-print.css`
8. `package.json`
9. `package-lock.json`

This qualification document is the tenth allocated path. Before editing, matching local recommendation/package tasks were `done` and both corresponding ownership leases were `released`; the coordinator explicitly allocated the current scope. No registry file was edited.

## Focused test evidence

Final tested source run: 2026-09-07 13:30:26 America/Chicago, terminal chunk `ff632b`, before the implementation commit.

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/pages/partners/Links.test.tsx client/src/research/recommendation/qr-export.test.ts client/src/research/recommendation/RecommendationPrintCard.test.tsx --maxWorkers=2
```

```text
RUN  v4.1.10 C:/Users/sboad/projects/xenios-seth-astra-b-20260905
Test Files  3 passed (3)
Tests       86 passed (86)
Start at    13:30:26
Duration    6.10s (transform 538ms, setup 0ms, import 1.42s, tests 2.15s, environment 5.27s)
Exit        0
```

Breakdown: Links 31 (including all 8 existing tests), QR utility 44, print card 11. The independent helper owned only the QR test file and decoded the actual generated SVG path after rasterizing it to RGBA using test-only jsQR. It found an empty `?`/`#` suffix acceptance edge case; the runtime guard was corrected and final decoding/refusal tests pass. The initial print CSS test used an unsuitable jsdom `import.meta.url` file scheme; its read path was corrected before this final run.

Focused TypeScript: terminal `abd9d3`, exit 0, `Focused TypeScript diagnostics: 0`. Used installed TypeScript 5.6.3, project compiler options and all six allocated TS/TSX source/test roots, with `noEmit: true, incremental: false`; imported dependencies were checked. Exact check body, passed to Node on stdin:

```javascript
const ts = require('typescript');
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const files = ['client/src/research/pages/partners/Links.tsx','client/src/research/pages/partners/Links.test.tsx','client/src/research/recommendation/qr-export.ts','client/src/research/recommendation/qr-export.test.ts','client/src/research/recommendation/RecommendationPrintCard.tsx','client/src/research/recommendation/RecommendationPrintCard.test.tsx'];
const program = ts.createProgram(files, {...parsed.options, noEmit:true, incremental:false});
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));
console.log('Focused TypeScript diagnostics: '+diagnostics.length);
process.exitCode = diagnostics.length ? 1 : 0;
```

`git diff --check` passed. No emitted type/build artifacts were committed.

## Safety and behavior established

- Encodes the exact existing same-origin opaque `RecommendationLink.url`; no alternate link format, URL normalization, referral attribution, discount, tracking identifier, or endpoint is introduced. SVG generation is local with a four-module white quiet zone. Independent decoding proves exact mixed-case/underscore/hyphen token preservation on synthetic HTTPS and browser origins.
- Only ready, nonrevoked, future-expiring links are eligible for export. Malformed dates, expired links, null/unsafe URLs, credentials, query/hash including empty suffixes, noncanonical normalization, and non-ready states fail closed. Canonical `partner_inactive` covers the client-visible suspended/inactive state; no new role inference is introduced.
- Every QR download, preview, and explicit print request re-reads the existing canonical list endpoint using the current bearer. Eligible must remain true and the same unique id/URL must still be ready. Newly revoked, expired, partner-inactive, unavailable, changed, duplicate, and malformed responses cannot create an artifact.
- Download happens only after explicit intent. The SVG Blob, local temporary anchor and object URL are cleaned up. The page says the browser controls saving; it does not claim successful filesystem persistence.
- Account switch, logout, token refresh, verification/checking, unmount, A-to-B-to-A, user refresh, and closing a pending print preview invalidate late exports. A second guard after the browser animation frame prevents a verified old-account print from firing after a principal change. Duplicate export attempts are synchronously latched.
- The selected print card includes the exact visible URL, relationship/possible-compensation disclosure, expiry, and no medical/income/access/commission guarantee. It contains no account identity or bearer. Print CSS excludes the application UI and controls only while a selected card exists. Modal focus/Escape and expiry removal are tested.
- Saved or printed copies cannot be recalled after logout/revocation; the UI explicitly says so. The recipient's existing server path still determines actual link availability. The explicit print button performs a fresh check; generic browser printing cannot establish a new server authorization check.

## Dependencies and integration limits

Added only exact-pinned `qrcode-generator` 2.0.4 (runtime, MIT) and `jsqr` 1.4.0 (test-only, Apache-2.0), with package integrity hashes in the lock. Both have no new transitive dependency entries. Maintainer sources: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) and [jsQR](https://github.com/cozmo/jsQR). Installation used `--ignore-scripts --no-audit --no-fund --include=dev`. Unrelated npm removal of existing optional-platform `libc` metadata was restored; final lock diff is exactly 15 additions, zero removals. Manifest diff is exactly two additions.

No backend, shared contract, adapter, tracking, pricing, organization/partner grant, Resource Hub, migration, flag, provider, or production file changed. No real user, message, purchase, or deployment action occurred.

This proof uses synthetic fetch, browser-save, and print mocks. It does not prove real-account authorization, physical QR scanning, OS download persistence, actual PDF rendering, responsive nine-width browser layout, or a production serving SHA. Browser/print rendering, full integration gates and production decisions remain with the integration coordinator.
