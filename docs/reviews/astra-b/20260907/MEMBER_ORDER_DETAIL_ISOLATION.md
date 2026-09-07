# Member order-detail and issue-report isolation — ASTRA-B qualification

Status: PASS for this bounded local client slice. This is not production or whole-release acceptance.

## Exact source and ownership

- Final code commit: `d0e7759399be9016ec7d0e4ab3755342e3142b16`
- Final code tree: `4f20d9212a8f504ad5378be3be31ce6a61e424d2`
- Implementation parent: `de158f287d8ed157e185ba89ebd80f7d087af7f0` (tree `612896534adb953e5aa70fd511dccd3c70f5a362`)
- Slice base: `0b45a03c75a49d9e171fbed3ecfcb611f8f0f7f8`
- Branch: `codex/xenios-seth-astra-b-20260905`
- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`
- Qualification date: 2026-09-07.

The coordinator allocated exactly five paths:

1. `client/src/research/pages/member/OrderDetail.tsx`
2. `client/src/research/pages/member/OrderDetail.test.tsx`
3. `client/src/research/member-orders/detail.ts`
4. `client/src/research/member-orders/detail.test.ts`
5. `docs/reviews/astra-b/20260907/MEMBER_ORDER_DETAIL_ISOLATION.md`

Only the first four paths changed across the two code commits. Local active-lease wildcard scans before implementation and sealing found no matching active lease; the final check returned `[]` in terminal `bc8454`. The matching broad strategic task is unowned and ready. The local registry is not a claim of fresh remote coordination; root's explicit exact-path allocation is controlling. No ownership/session/task registry was changed.

## Implemented boundaries

- Safe one-pass route decoding rejects malformed encoding, nested paths, query/fragment content, unsafe identifiers, and double-encoded remnants without issuing a request. The returned detail must match the exact requested canonical order ID.
- A token-and-order-keyed owner subtree hides former private titles, rows, claims, drafts, and submission outcomes on account, route, readiness, or credential transitions. Checking and signed-out contexts do not initiate private reads.
- Order and supplementary-claims reads use generation/unmount guards. Superseded successes or denials cannot overwrite current results. Reload clears old claims; late initial claims cannot overwrite the newer post-submit read. Thrown loaders have safe unavailable/error presentation.
- Detail validation reuses the previously qualified summary reader without editing it. Required detail lines, unique SKUs, quantities, money, and optional provenance are checked. Claim lists validate the frozen reason/state/resolution vocabulary, unique IDs, timestamps, exact target order and its recorded SKUs, then project only canonical fields. An invalid list is unavailable, never invented empty history.
- The existing issue-report POST retains its exact adapter and payload: `{ orderId, sku, reason, detail, evidenceRefs: [] }`. It is only called after explicit form submission with valid current line/reason/detail inputs. A synchronous held ref prevents duplicate submissions before React state updates.
- An `ok` POST response only confirms a report when its validated claim binds to the submitted order, SKU, and reason. The UI reports the returned status rather than promising review, refund, replacement, shipment, or payment execution. A successful reply triggers the existing read-only claims reload; it does not optimistically insert an invented history row.
- Unavailable, failed, malformed-success, or thrown submit outcomes remain uncertain. The draft stays in memory, the send button and same-page record refresh are held, and there is no automatic retry. Copy does not claim the report was not sent. An authoritative access refusal displays safe denial copy without report success.
- Legacy missing record kind remains unknown; requests are labeled requests. Shipment completeness requires an explicitly connected source. Shipment status is rendered as reported neutral text, not promoted through the order lifecycle. Shipping remains the single recorded total, never multiplied across split shipments.
- Support links use static `mailto:team@xeniostechnology.com`; order IDs/drafts are not appended to mailto query parameters. No token, draft, or private response is written to storage or logs by this slice.
- Independent pre-seal review found the inherited `claimNote` helper promoted resolved refund/replacement claims into execution assertions, and embedded the old support email for information-requested claims. The owned page no longer calls that helper: resolution badges explicitly say reported, and neutral history notes disclaim execution. Six additional page regressions cover resolved/approved refund/replacement and information-requested states. The unleased helper is unchanged.

## Exact focused test evidence

Node: `C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe` (v20.19.0). Vitest: v4.1.10. The final run below tested the exact four-file working source subsequently committed as `d0e7759`, with no intervening source edits. All request handlers and account fixtures are synthetic; there is no fallback network or real report submission.

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/pages/member/OrderDetail.test.tsx client/src/research/member-orders/detail.test.ts client/src/research/pages/member/Orders.test.tsx client/src/research/member-orders/read.test.ts client/src/research/pages/member/cart-checkout.test.tsx --maxWorkers=2 --reporter=json
```

JSON stdout was captured and summarized in memory, not written to another file. Terminal `e3e3fe`: exit **0**, **358 passed**, **0 failed**, **5 test files**, measured child wall time **6,520 ms**.

| Suite | Passed | Suite duration |
| --- | ---: | ---: |
| `member-orders/detail.test.ts` | 138 | 49.087 ms |
| `pages/member/OrderDetail.test.tsx` | 66 | 1,812.589 ms |
| `member-orders/read.test.ts` (unchanged regression) | 91 | 29.047 ms |
| `pages/member/Orders.test.tsx` (unchanged regression) | 37 | 439.920 ms |
| `pages/member/cart-checkout.test.tsx` (unchanged regression) | 26 | 1,465.205 ms |
| Total | **358** | Parallel run; durations are not additive |

Earlier targeted run `2ff45f`: new detail suites only before the six claim-note regressions, **198/198**, 2 files, exit 0, Vitest duration 3.45 seconds. Earlier combined run `7759e9`: **352/352**, exit 0, wall 6,272 ms. Independent helper parser-only run: **138/138**, 1 file, exit 0, duration 422 ms. The final combined **358/358** run is controlling.

The page suite covers exact bearer GET/POST arguments, no mutations on read, first-commit privacy, checking/logout, A-to-B and A-to-null-to-A, same-account route and token changes, stale order/claim/POST outcomes, unmount, StrictMode, duplicate submission, pending/uncertain refresh holding, exact response binding, malformed/denied/unavailable/throw paths, split shipping totals, request provenance, and static support links. The pure suite independently checks route input, canonical projection, exact request binding, line/money constraints, every claim vocabulary value, null resolution, list filtering, duplicate rejection, and incomplete successful responses.

## Focused TypeScript and diff

Final terminal `414b6f`: exit **0**, `Focused TypeScript diagnostics: 0`. Executed with the same Node binary using `-e` in the listed worktree:

```javascript
const ts = require("typescript");
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
const roots = [
  "client/src/research/pages/member/OrderDetail.tsx",
  "client/src/research/pages/member/OrderDetail.test.tsx",
  "client/src/research/member-orders/detail.ts",
  "client/src/research/member-orders/detail.test.ts",
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

`git diff --check` passed before staging; the two code commits together change only the four allocated runtime/test files.

## Limitations and release boundary

This is local pure-function/jsdom qualification, not a rendered-browser, real-account, database-ownership, claim-delivery, refund, payment, or fulfillment proof. Server authorization and canonical context remain authoritative. Full integration typecheck/build and browser acceptance remain coordinator gates.

The unchanged claim API has no client-exposed idempotency key. The in-memory latch prevents duplicate/automatic submission and holds same-page refresh; it cannot cancel an already accepted server request or preserve uncertainty across a browser reload, navigation away, or new session. Copy explicitly tells the user not to resend or reload before support confirms the outcome. No durable server idempotency, delivery guarantee, or transport cancellation is claimed.

No adapter, endpoint, payload schema, server, shared contract, Fable Resource Hub, A-owned backend, admin, tracking, package, or production configuration changed. No deployment, migration, flag change, real user action, report, communication, purchase, refund, or other production mutation was performed.
