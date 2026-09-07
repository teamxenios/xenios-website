# Partner onboarding source-report qualification

Status: PASS for the bounded local reporting slice. No production, identity, agreement, activation, or payout actions.

## Exact source and allocation

- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`
- Branch: `codex/xenios-seth-astra-b-20260905`
- Parent: `58f3fd5bbe814d9c5c3a546221f06dfeba019ff4`
- Code commit: `c3ae0ea80541865442f2f7f1e8b3487b6524d34e`
- Code tree: `164d3fdecbaf46f71d1eb58df5ad7893bd372540`
- Code commit pushed to the existing origin branch; terminal evidence `a71283`.

Root confirmed these five paths before edits. The older local active-lease check returned `[]` (`3275c9`); it supplements root's explicit allocation, not new ownership authority.

1. `client/src/research/pages/partners/Onboarding.tsx`
2. `client/src/research/pages/partners/Onboarding.test.tsx`
3. `client/src/research/partner-crm/onboarding-records.ts`
4. `client/src/research/partner-crm/onboarding-records.test.ts`
5. `docs/reviews/astra-b/20260907/PARTNER_ONBOARDING_REPORT_QUALIFICATION.md`

The code commit changes the first four paths only; this document is a separate evidence commit. No backend, shared, adapters, Auth, Resource Hub, dependency, tracking, or coordination files changed.

## Source semantics and implemented behavior

- Read-only inspection of `server/research/partners/portal.ts:415` confirms that onboarding projects identity state (`verified`, `not_started`, or `pending`) and an agreement list from server-owned requirements. Acknowledgement matches each key and exact version; it is not a client-side rollup or inference. The source does not return payout or tax status, a signed document, review receipt, or activation decision.
- The strict parser requires exact own envelope, verification, and agreement fields; bounded safe unique IDs and version strings; nonblank bounded titles; and actual boolean acknowledgement values. Unknown states, missing values, extra identity/permission/payout fields, duplicates across versions, and coercible flags fail the entire report closed. Version spelling is preserved without adding a second `v` prefix or changing keys.
- The required bounded free-form identity detail is validated but deliberately excluded from the projected report and DOM. The existing source detail can describe a queued review or no required action without returning a review receipt. The UI instead shows a neutral reported identity marker and explains that it does not prove a queue entry or no required action. It does not replace the source marker with a guessed workflow state.
- Agreement acknowledgements are labeled as reported for the listed version. False does not become a pending acceptance workflow, and true does not become current partner eligibility, a signed document, or completion of all onboarding requirements. Exact empty records are not represented as proof that no agreements exist or none were presented.
- Checking/sign-out hides the private workspace. Token-keyed lifecycle and the existing resource/capability hooks keep prior account data and enabled handoff state out of another account's render. Generation guards preserve the newest read and ignore old success/denial responses, logout, A-null-A, refreshed tokens, unmount, and StrictMode replay. Canonical denial codes retain their existing presentation; raw upstream errors are not exposed.
- The only sources remain the existing bearer onboarding GET and capability read. No payout record, provider, tax, identity, agreement acceptance, or activation request is added. The `affiliate_payouts` capability boundary is retained. Within a valid onboarding report, an enabled gate offers the existing payout-record route while explicitly stating that payout/tax status is not supplied or verified here. The prior hardcoded `Setup pending` badge is removed. Missing, disabled, malformed, denied, or failed capability evidence keeps this handoff closed.
- The four static `STEPS` entries are unchanged, including identity, agreement, certification, payout/tax prerequisites and no customer-access fee. A parent-vs-worktree comparison after CRLF normalization returned `stepsArrayUnchanged: true` (`3275c9`). Canonical account, ordinary sign-in, training, and partner-support navigation do not grant permissions.

## Source-bound verification

Commands ran from the worktree above with Node v20.19.0 and Vitest 4.1.10. The combined command was executed through an in-memory `spawnSync` JSON reporter wrapper without unallocated report files:

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/pages/partners/Onboarding.test.tsx client/src/research/partner-crm/onboarding-records.test.ts client/src/research/pages/partners/Payouts.test.tsx client/src/research/adapters/partner.test.ts --maxWorkers=2 --reporter=json
```

Terminal `1ba86a`: **358 passed, 0 failed, exit 0**, wrapper wall time **8,371 ms**.

| Suite | Passed | Reporter suite duration |
| --- | ---: | ---: |
| `Onboarding.test.tsx` (expanded) | 67 | 2,444.283 ms |
| `onboarding-records.test.ts` (new) | 176 | 78.220 ms |
| `Payouts.test.tsx` (unchanged regression) | 63 | 1,947.037 ms |
| `adapters/partner.test.ts` (unchanged regression) | 52 | 546.248 ms |

The expanded UI suite replaces the prior two heavily mocked copy tests while preserving their policy/no-fee assertions. It renders the real page, shell, kit, adapter, resource hook, capability hook and cache with only the core session context mocked. A total synthetic fetch replacement permits only the two existing reads and throws on unexpected paths/methods; no network fallback exists. It tests exact bearer request shapes, no mutation controls/storage/private URL state, all identity states, discarded source detail, strict schema/HTTP/HTML/thrown failures, version-specific acknowledgement refresh, empty history semantics, escaped labels, preserved payout gate/unknown status, and account/capability/read races. Pure tests cover exact own fields, strict booleans, bounds, state independence, explicit empties, no hardcoded keys, free-form detail discard, frozen input/nested copies/order, extras, duplicates and all-or-nothing rejection.

Focused TypeScript command (four owned roots and imported dependencies, no emit):

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' -e 'const ts=require("typescript"); const config=ts.readConfigFile("tsconfig.json",ts.sys.readFile); const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,"."); const roots=["client/src/research/pages/partners/Onboarding.tsx","client/src/research/pages/partners/Onboarding.test.tsx","client/src/research/partner-crm/onboarding-records.ts","client/src/research/partner-crm/onboarding-records.test.ts"]; const program=ts.createProgram(roots,{...parsed.options,noEmit:true,incremental:false}); const diagnostics=ts.getPreEmitDiagnostics(program); process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:ts.sys.getCurrentDirectory,getNewLine:()=>"\n"})); process.stdout.write(JSON.stringify({roots,diagnostics:diagnostics.length})+"\n"); process.exitCode=diagnostics.length?1:0;'
```

Terminal `38a91b`: **0 diagnostics, exit 0**, tool wall time 7.100 seconds. Working and staged diff checks passed. Tests and typecheck bind to code commit `c3ae0ea80541865442f2f7f1e8b3487b6524d34e`; terminal identifiers are not code commits.

## Limits

- This is local source/jsdom/focused-TypeScript qualification, not a full application build, live browser, real Auth account switch, live server authorization, or deployed acceptance claim. Root owns integration/build/browser qualification.
- Server ownership and key/version matching were inspected, not newly exercised against a database. Current identity-review, signed-agreement, certification, tax, payout, or activation completion is not verified. Payout navigation remains a reporting handoff, not provider setup or proof of payment eligibility.
- Existing capability cache semantics and route guards are unchanged. Static partner subnavigation remains; the newly qualified payout handoff within this report is capability-gated. No local link itself grants server access.
- Future additional identity states, version formats, fields, or labels outside the reviewed limits fail closed and require explicit contract review. No unreported workflow facts are invented from those changes.
- No production actions, migrations, flags, deployments, real-user operations, Auth/Supabase calls, payments, messages, tracking events, or Resource Hub changes occurred.
