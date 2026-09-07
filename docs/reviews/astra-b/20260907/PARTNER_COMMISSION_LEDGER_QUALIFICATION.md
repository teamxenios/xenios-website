# Partner commission-ledger qualification — ASTRA-B

Status: PASS for the bounded local client slice; not production or whole-release acceptance.

## Exact source and scope

- Code commit: `c6c9a79582a0599866da6fc7ab095b131ddeaffa`
- Code tree: `d7d46f3977db914941dce8707991c2d69ee6df79`
- Parent: `b5adba612103bd8f25dbf077c134838a36b6987e`
- Branch: `codex/xenios-seth-astra-b-20260905`
- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`
- Qualification date: 2026-09-07.

Root allocated exactly six paths:

1. `client/src/research/pages/partners/Commissions.tsx`
2. `client/src/research/pages/partners/Commissions.test.tsx`
3. `client/src/research/partner-crm/commission-ledger.ts`
4. `client/src/research/partner-crm/commission-ledger.test.ts`
5. `client/src/research/adapters/partner.test.ts` — only one existing applicant-persona unavailable-copy expectation changed.
6. `docs/reviews/astra-b/20260907/PARTNER_COMMISSION_LEDGER_QUALIFICATION.md`

The five code/test paths are in the code commit. The adapter test retains its existing no-fabricated-ledger and no-money assertions. Adapter runtime is unchanged. Local active-lease scans across all six paths found no match; the final scan returned `[]` (`fb0f56`). Only broad unowned ready tasks matched before allocation. Root's explicit allocation is controlling; the old local registry alone is not asserted to prove fresh remote ownership. No coordination records were edited.

## Implemented boundary

- The existing bearer `GET /api/research/partner/commissions` remains the only data operation, with no-store, same-origin, no identity/query parameters, and no body. No payout or commission mutation was added.
- The existing server read model is dependency-ready in source: it scopes to the resolved partner and emits `AFFILIATE_COMMISSION`, canonical commission states, signed cents, and two static non-identifying descriptions. The client now validates that exact contract rather than discarding ledger identity. This is source inspection, not proof of live authorization or data.
- The pure projection requires exact envelope/entry fields, unique bounded identifiers, real calendar dates, canonical states, and safe signed integer amounts. Both accepted descriptions are the existing server's static descriptions. Missing/wrong/mixed ledger types, arbitrary descriptions, extra identity/contact fields, malformed dates or amounts, and duplicates fail the entire response closed. Wholesale entries are never folded into, silently filtered from, or netted against affiliate entries.
- Signed amounts remain separate records. No totals, balance, income estimate, commission eligibility, payout queue, payment date, bank receipt, or role grant is calculated. State badges are explicitly reported states; neutral guidance distinguishes ledger state from underlying payment, refund, reversal cause, and payout execution evidence.
- A checking or signed-out context issues no private request. The token-keyed owner subtree and unchanged principal-bound resource hook suppress old rows/outcomes across account switches, logout, A-to-null-to-A, token refresh, readiness changes, overlapping refreshes, unmount, and StrictMode replay.
- Unavailable, denied, unauthorized, invalid-success, and valid-empty states remain distinct. Missing data is not zero money or a complete empty ledger. Error/denial presentation does not echo upstream private messages. Historical commissions do not imply a paid-membership prerequisite for customer access.
- Only read-only refresh and canonical account/payout-record navigation were added. The vocabulary and navigation do not authorize another role or initiate a payout.

## Exact amount-formatting correction

A read-only probe (`e17ac5`) showed the inherited general formatter's floating-point `cents / 100` path rendered `9007199254740991` as `$90,071,992,547,409.90`, losing a cent; the negative bound likewise lost a cent. The owned ledger helper now formats integer quotient/remainder with BigInt, preserving `$90,071,992,547,409.91` and its negative counterpart. It also preserves ordinary signed/zero amounts and refuses non-safe integers. The general core formatter was not edited.

Seventeen pure formatter regressions and two page-level safe-bound regressions cover this correction. Formatting does not change or net the underlying ledger amounts.

## Source-bound focused test evidence

Node executable: `C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe` (v20.19.0); Vitest v4.1.10. The final run tested the exact five-file working source subsequently committed as `c6c9a79`, with no intervening source edits. Tokens and API responses are synthetic; there is no fallback network or real financial action.

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/pages/partners/Commissions.test.tsx client/src/research/partner-crm/commission-ledger.test.ts client/src/research/adapters/partner.test.ts --maxWorkers=2 --reporter=json
```

JSON stdout was captured and summarized in memory. Terminal `36f269`: exit **0**, **222 passed**, **0 failed**, **3 files**, measured child wall time **4,392 ms**.

| Suite | Passed | Suite duration |
| --- | ---: | ---: |
| `partner-crm/commission-ledger.test.ts` | 123 | 50.042 ms |
| `pages/partners/Commissions.test.tsx` | 47 | 1,033.926 ms |
| `adapters/partner.test.ts` | 52 | 613.844 ms |
| Total | **222** | Parallel run; durations are not additive |

Earlier page/adapter run `0f3ea3`: **97/97**, two files, exit 0, Vitest duration 3.17 seconds, before the two new formatter boundary cases. Independent helper final parser/formatter run: **123/123**, one file, exit 0, duration 485 ms. The combined run above is controlling.

The tests cover exact existing read arguments, no mutation controls, ledger separation, signed amounts and exact cents, canonical states without execution claims, first-commit account privacy, stale responses, checking/logout, same-account credential changes, unknown/empty distinctions, malformed and identity-bearing input, HTTP refusals, HTML success, thrown loaders, and the existing adapter/persona regressions.

## Focused TypeScript and diff

Terminal `a710a5`: exit **0**, `Focused TypeScript diagnostics: 0`. Executed in the listed worktree with the same Node binary and `-e`:

```javascript
const ts = require("typescript");
const c = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const p = ts.parseJsonConfigFileContent(c.config, ts.sys, ".");
const roots = [
  "client/src/research/pages/partners/Commissions.tsx",
  "client/src/research/pages/partners/Commissions.test.tsx",
  "client/src/research/partner-crm/commission-ledger.ts",
  "client/src/research/partner-crm/commission-ledger.test.ts",
  "client/src/research/adapters/partner.test.ts",
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

`git diff --check` passed before exact-path staging. The existing adapter-test diff is exactly one assertion replacement, retaining all other tests and negative assertions.

## Limits / production boundary

This is pure-function/jsdom client qualification. It is not a real partner login, live ledger, actual payout, bank/provider receipt, database-ownership, or rendered-browser proof. Server authority remains controlling. Full integration build/typecheck and browser acceptance remain coordinator gates. Stale publication is suppressed; transport cancellation is not claimed.

No adapter runtime, backend, shared contract, resource hook, general core formatter, Fable Resource Hub, A-owned runtime, package, or production settings changed. No migrations, flags, deployments, permissions, prices, real users, purchases, payouts, communications, or production mutations were performed.
