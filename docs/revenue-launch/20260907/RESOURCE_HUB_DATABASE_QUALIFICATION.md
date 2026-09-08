# Resource Hub database qualification - 2026-09-07

**LOCAL SQL QUALIFICATION PASSED; RESOURCE HUB REMAINS UNAPPLIED AND WITHOUT A NEW GO.** The current migration and checker procedures have 154 passing rehearsal checks on PostgreSQL 17.5 and 154 on PostgreSQL 18.3. A's actual updated production precheck also passed read-only. These results are not production apply/postcheck receipts or complete release qualification; B accepted the final procedures at 46782cd; see [independent acceptance](RESOURCE_HUB_CHECK_PROCEDURE_ACCEPTANCE.md).

## Current SQL identity

A committed the owner-RLS correction at `6c77c5663071715f8fe47038f57100c16c430246`. It adds `FORCE ROW LEVEL SECURITY` to all three Resource Hub tables in both the candidate and promoted migration; the immediate postcheck now requires `relforcerowsecurity`. Promotion/registration does not mean application to production.

The migration bytes are unchanged by checker-procedure commit `46782cd4f0f73975c021c3a605492aa022c7d4dc`, tree `6e7965d91ba4a01e416bcc1a7485b0cde80acf27`. Both precheck and postcheck now set transaction-local `row_security=off`, require the checking role to be SUPERUSER or BYPASSRLS, and record those role flags and the setting in their result. This refuses potentially filtered counts; it grants no privilege or persistent RLS bypass.

All companion paths use the prefix `supabase/candidates/20260906120000_research_resource_library`.

| File | Current LF SHA-256 |
| --- | --- |
| Candidate `.sql` | `e55f965fbc942b4de6ec7b74b2bc28b8d7eff8dd6530f50c9876d3137e8dd722` |
| `.precheck.sql` | `742bce5729a0b4c2db848fbf32658efe0b286c5b910730fd6bfc9182c1ea6fab` |
| `.postcheck.sql` | `7c7ef33b7091cc1946077070ca6587491b299c5101ca05b4b70dcf95ff379550` |

The rehearsal script `scripts/revenue-launch/rehearse-resource-library.mjs` has LF SHA-256 `feb4cfec17643f3cc11213fca54fee95c17ceee1bb656d7cc6ab29c08cca166e`.

The earlier ACL correction remains: explicit client/PUBLIC table revocation; service SELECT/INSERT/UPDATE on library and versions; service SELECT/INSERT only on deliveries; explicit service publish/withdraw EXECUTE; no direct client/service execution of the immutable trigger helper. The current correction adds owner RLS enforcement without replacing those permissions, RPC bodies, or history-preserving recovery instructions.

## Current rehearsal receipts

| Engine | Result | Observation | Receipt |
| --- | --- | --- | --- |
| PostgreSQL 17.5, local WASM/PGlite | 154 PASS | `2026-09-07T23:38:59.858Z` | [PG17 checker-visibility receipt](resource-hub-checker-visibility-pg17.json) |
| PostgreSQL 18.3 / PGlite 0.5.8 | 154 PASS | `2026-09-07T23:39:06.242Z` | [PG18 checker-visibility receipt](resource-hub-checker-visibility-pg18.json) |

Both receipts match all three current SQL hashes above. They predate the procedure commit and bind the tested SQL bytes, not an assertion that the entire 46782cd application tree was tested.

`scripts/revenue-launch/rehearse-resource-library.mjs` runs two isolated in-memory profiles: minimal default permissions and broad Supabase-style default grants. The existing 132 checks cover first-install prechecks, exact postchecks, client denials, service operations, immutable version identity, publish/withdraw, atomic failure rollback, append-only delivery privileges, and negative controls. The 18 added checks verify, across both profiles and all three tables:

- Removing FORCE RLS is detected by the postcheck.
- A non-superuser, non-BYPASSRLS table owner cannot read seeded rows.
- The service role can still read those preserved rows.

All 150 prior case names remain in the current receipts. Four additional negative checks reject a non-bypass precheck executor and a non-bypass table owner attempting postchecks with hidden seeded rows, once in each profile. Existing checks and their assertions were retained.

No production database URL, real identities, uploaded objects, or production mutations are involved. The pinned invocation remains:

```powershell
& C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe `
  scripts/revenue-launch/rehearse-resource-library.mjs `
  C:/Users/sboad/.codex/tmp/xenios-resource-pg17-qualification-20260907/node_modules/@electric-sql/pglite/dist/index.js
```

The PostgreSQL 18 installation used earlier is under `C:/Users/sboad/.codex/tmp/xenios-revenue-pglite-20260905/`. These commands document reproduction; this report update ran no tests.

## Superseded evidence and release-gate disposition

The former candidate hash `6859a8d3b156f99b2f3f205de12e6fe84e3f484e186950543895801352f48633` and postcheck hash `08bbde3025b691390b3d94f9fbd4e761e63b4c1808fc07261d635753edcc3be5` had 132 passing checks on each engine. That evidence is historical and does not qualify the FORCE RLS change. The [original PG17 receipt](resource-hub-pg17-rehearsal.json) is preserved. The earlier Fable candidate also needed explicit ACLs because creator default privileges did not reliably provide the intended service/client permissions.

The subsequent FORCE RLS [PG17](resource-hub-force-rls-pg17-rehearsal.json) and [PG18](resource-hub-force-rls-pg18-rehearsal.json) receipts retain their original **150** counts, candidate `e55f965f...`, precheck `12535e95ef818c0623fa9c442b5428bcfac4d105232372224f8db0f301615630`, and postcheck `d9b2fc439b54a6d5a6edac5a833b0466ebe605f5626858406d413c2113507e69`. They are superseded for current checker-procedure qualification. No historical 132/150 artifact is overwritten or relabeled as a 154-check run. B accepted migration 6c77c56; B also accepted the final 46782cd procedures without a remaining objection.

The first combined full suite on `33436c5fba078c8511dcc06749e5820995bee023` finished non-green: 15,995 tests passed, 59 skipped, and 2 failed across 922 files, in 1,276.31 seconds. A identified one failure as the pgcrypto audit's 5-second timeout and the other as the missing FORCE RLS requirement. After the owner-RLS fix, the two affected test files passed 23/23 with their original timeouts and assertions. This targeted result does not turn the original full suite green. The migration-DAG correction is committed at `01ea702a62388970a14cdfa498a095dcf32007de`; release-control tests passed 51 with one intentional skip. Its replacement full-suite run was interrupted for the checker-procedure fix. The fresh final suite started at 2026-09-07T23:41:49.677254Z on 46782cd after B accepted the procedure. It is RUNNING, not yet a passing result.

## Actual production evidence

The separate Universal Account and Partner Access release is already deployed at `ff3c496245739233b71e46f9e5d6e26af9d57017`, Render deploy `dep-dafcm567bikc7382rhng`, service `srv-d8s9vej7uimc7384dfcg`. Its two approved migrations are applied. This Resource Hub candidate is not covered by that prior authorization.

A's own supported, authenticated Supabase connection to `yvzeduaxbwgcwllhywff` executed the updated full precheck at `2026-09-07T23:40:28.257398Z`: **PASS**, PostgreSQL 17.6, executor `postgres`, SUPERUSER **false**, BYPASSRLS **true**, transaction-local `row_security=off`, zero Storage client policies and zero Hub buckets. The [actual A precheck receipt](resource-hub-checker-visibility-production-precheck.json) binds source 46782cd and precheck hash `742bce57...`. Transaction setup and DO assertions ran unchanged; only informational result projections were combined so the connector returned the result and role evidence together. The transaction ended with ROLLBACK and no data mutation.

The [23:00 historical precheck](resource-hub-production-readonly-precheck.json) and A's 23:28:22Z read-only observation of both account/partner migration history rows and absent Hub objects remain earlier evidence. Render remained on the same live ff3 deploy. This documentation worker did not repeat production queries.

The **current** precheck must still be rerun immediately before any newly authorized apply. It deliberately refuses a checker without complete row visibility, pre-existing Hub objects/bucket, or unreviewed applicable Storage policies. An uncertain operation requires actual-state reconciliation, not blind retry or migration-history repair.

## Remaining boundaries

The current hashes have passed the local checks. They have not been applied to production, and there is no production postcheck for them. PostgreSQL 17.5/18.3 rehearsal does not prove exact production 17.6 post-install behavior, concurrent-session locking, or enabled PostgREST/Storage HTTP and private-byte delivery. The local Storage metadata is synthetic. Database and Storage writes are not one cross-service transaction; preserve any orphaned private objects or audit history for separately authorized recovery.

The final release still requires independent review of the current changes, final exact-SHA/tree gates, fresh authorization naming this migration and its flags, bound prechecks, atomic apply and immediate postchecks, and permitted smoke/observation. Keep `RESEARCH_RESOURCE_HUB_ENABLED` absent/false. Follow the companion `.rollback.md`; additional database recovery is separately gated. No real content upload, account approval, partner activation, notification, payment, or shipment is included.

See [combined release qualification](RESOURCE_HUB_RELEASE_QUALIFICATION.md) for the full-suite, browser, PDF, secret/PII, and endpoint-comparison status. Completed [PDF compatibility](RESOURCE_HUB_PDF_COMPATIBILITY.md) is a separate file-format measurement and does not establish Storage or database readiness.
