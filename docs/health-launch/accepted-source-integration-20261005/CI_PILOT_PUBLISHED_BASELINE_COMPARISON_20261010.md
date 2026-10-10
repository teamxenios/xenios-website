# Published-baseline comparison for the three-file Quick Order CI pilot

## Conclusion

**SUITABLE TO RECOMMEND, WITH THE LIMITS BELOW. NOT SELECTED OR APPROVED.**

The already-published baseline A, `1631323d7cf60f145141e0f82586e64ef7c7d637`, is a reasonable exact receipt target for the proposed three-file synthetic application pilot. The selected tests, manually inspected declared runtime/type import graph, declaration companion, static/inline fixtures, pinned potential data input, root aliases/configuration, package manifest and complete lockfile are byte-identical to original CI candidate B, `2d291d028ebf3664ead7d2df0b7212fed7a45348`. This is materially stronger than test-file equality alone.

There are **71 equal inspected file inputs**, including 62 graph/config nodes and nine supplementary configuration/data files. Six separately bound later qualification/SQL-related files differ; none is referenced by the inspected selected-test graph or draft pilot commands. All source subtrees listed below are equal as an independent cross-check.

This recommends an option to the coordinator and original reviewer. It does **not** select A, approve its use, qualify its SQL, approve a procedure/workflow/landing/run, or carry a future A receipt to B, the disabled transaction successor, or the customer source. Original reviewer acceptance of the changed receipt identity is still required. A's publication is the supplied proposal/review context; this pass made no fresh remote visibility check.

**EXECUTION: NOT RUN.** No modules imported, parsers/compilers/tests run, dependencies installed or inspected from node_modules, database/hosted calls, SQL execution, source changes, workflow edits, push, PR, deploy, email or credentials/environment-value inspection. Both schedules remain unchanged.

## Identity, authority and ownership

| Item | Exact identity |
| --- | --- |
| Baseline A | `1631323d7cf60f145141e0f82586e64ef7c7d637` |
| A tree | `796f15c908739b05e597d24bf6e9a6b2e2c541c5` |
| Original CI candidate B | `2d291d028ebf3664ead7d2df0b7212fed7a45348` |
| B tree | `be16220c280e8f9535aea8d90b99065056fa93e2` |
| Local records starting HEAD | `29297c31fa0357ba186620e7e51425d5ce19badd` |
| Local branch | `codex/accepted-source-integration-20261005` |
| Assignment | `1df99a1fb628e63dd389bf3a3bca60c0acc7d339:docs/coordination/launch-coordination-20261005/CI_PUBLISHED_BASELINE_COMPARISON_ASSIGNMENT_20261010.json`, revision 1 |
| Direct authority | Same commit's `TWO_TRACKS_DIRECT_SUBMISSION_CI_R2_PROVENANCE_20261010.json`; actual human message `01a126cf-7594-77d0-b7fa-9a48b9e9fed5`, turn `01a126cf-7034-7090-828e-eb758c894460`, coordinator chat `01a103a8-5684-7272-89e5-3c42eefcd593` |
| Direct attachment | `46883794-d87a-4717-9926-a4a84d544668/Pasted text.txt`, 16970 bytes, SHA-256 `7062dbfac867da2e49c3bacaef131a1f45c1e7586540316ff1e7df1ffc13f7a1`; read and matched to actual user message |
| Proposal inspected | `4cdfce823550714d7abac01dc2f7372086a4e3ea:docs/coordination/launch-coordination-20261005/CI_PILOT_PROPOSAL_20261009.{md,json}`, intermediate revision 2, not a final workflow |
| Original review | `1642d876de498a500dbfa68ed395628383d50f81:docs/review/xenios-health-launch-review-20260930/77_CI_PILOT_PROPOSAL_91deaaa_2026-10-10.md` |
| Same steward session | `codex-accepted-source-integration-20261005`; actual model/effort `NOT_EXPOSED` |
| New narrow records lease | `a150b9b5-7985-488c-9d52-e0667422e564`, claimed 2026-10-10T17:33:42Z |
| Customer source freeze | `cad2c4d1b1dd4ead798b032e6abf8b55e1c2f055`, tree `e90de4206f9698f00bc1ee8a9905978db8c960ce`, unchanged |

Current local active foreign lease `bf834f90-14a8-4e7a-abb9-f12913cd262c` names five separate .xenios state/decision files; this task claims none. Prior stewardship lease/finding and source-custody lease remain unchanged. No new worker, reviewer or session was created; no message sent to Claude. Only this record and own task/records-lease/session/handoff continuity are writable. Publication is **LOCAL_ONLY**, explicitly overriding the standing push convention for this assignment.

## Method and limits of static resolution

Read exact committed text with Git, inspected import declarations, re-exports, type queries, mock declarations, data-loading and configuration cues, and manually inspected the relevant mock/composition and file-reader bodies. A textual regular-expression walk aided inventory; it is **not a TypeScript parser and is not proof of a complete executable graph**. A separate full-text cue scan covered every discovered node for import/require, process/environment, file loading, dynamic loading and source-path references. Manually added the `core.d.mts` companion missed by ordinary import traversal.

Relative paths were resolved against the importing file, with exact case-sensitive tree membership; `@shared/` resolves to `shared/` using both root configs. All observed literal local module edges resolve. No local `require()` or runtime computed import was observed in the selected application graph. Type-query `import(...)` in service and product-admin is a type edge, not a runtime dynamic import. The Vite application config's conditional cartographer import is separately recorded.

Raw hashes use **Git blob stdout bytes**, streamed into SHA-256 without newline normalization; size is exact committed byte length. Equal Git blob IDs and raw SHA-256 values were compared for A and B. These are not hashes of installed packages or Windows checkout line endings. The tree-level cross-check is independent of the textual traversal.

| Entire subtree | Git tree, identical at A and B |
| --- | --- |
| server | `9e98c90805f86d973efa6e279fb3c6e52df78f0f` |
| shared | `128fa9f030ffc410431a05e78bcd5a570a0caf37` |
| client | `9c5940f8437635cd6f6f010d939cef740a10f9c5` |
| config | `61eb19d14f1896d2c7a575d18099d8bb08dbb9c9` |
| scripts | `1cb4fd20bbccc1467263f632007e27ac7c25b660` |
| .github | `f6a19b71a2ad231c6c1915b74cfe69ab00210aae` |

The 31 commits/83 changed paths across A..B do not change those subtrees. The supervisor is under **docs/health-launch/quick-order-20261005/**, not scripts/. Its location does not make it non-executable; it is explicitly excluded and hashed below.

## What the selected tests actually declare

- `production.test.ts`: inline synthetic viewer/config/catalog/CSRF/agreement fixture, five declared cases. `vi.mock("../../rate-limit", ...)` substitutes the limiter and request IP; no importActual fallback. Production port factory remains not production-ready and refuses commit. No database-backed token/session proof.
- `quick-order-repository.test.ts`: inline synthetic canonical detail, envelope, companion, receipt, obligation and observation fixtures, including generated negative cases. It tests the real decoder, not installed SQL.
- `quick-order-admin-readback.test.ts`: real repository class, decoders, service, descriptors and Express adapter, but injected RPC, viewer/admission, clock/IDs, audit/outbox and signing fakes. Creates a synthetic Express app for Supertest. Includes GET admin detail, PATCH status and POST upload-URL paths. The synthetic upload URL is a value, not a real upload. No full-server bootstrap or real Auth/DB/notification proof.

No external fixture-file read is declared by these three tests. Test totals are **not measured**; parameterized cases were not counted as executed tests.

The declared runtime subset (R below) contains `SupabaseAssistedOrderRepository`, but that class takes an injected RPC interface and does not import the Supabase SDK. The actual limiter source (M) imports `server/supabase.ts`; this is retained in the comparison even though the test replaces it. That unmocked branch contains lazy client construction and environment readers. Never describe the entire textual graph as having no Supabase edge.

The runtime-imported `audit-store.ts` has an authority resolver accepting `input.env` and an injected RPC. Its declaration is not a call: the inspected synthetic composition supplies a fake audit sink and does not invoke that authority resolver. No actual environment values were inspected.

The wider type-inclusive graph reaches catalog authority and its pinned reconciliation reader. That reader is not a selected-test runtime dependency: entry is through explicit type imports. Its potential file `config/research/master-catalog-reconciliation-20260821.json` is nevertheless bound below. At runtime the reader can search the working directory and up to three parents; exact checkout cwd/isolation must be frozen before execution. No claim is made about untracked parent files.

## Complete resolved local inventory and edges

Reach labels: **R** = declared selected-test runtime reach (including test roots); **T** = reached only after crossing a type-only/declaration edge; **M** = original mocked limiter branch; **C** = root configuration comparison. An R edge listed within a T/M node does not upgrade that node to selected-test runtime reach. Edge labels: R runtime import/re-export, T type import/query or declaration companion, M mocked runtime import, D conditional dynamic import. Bare package/builtin endpoints are listed literally; they are not resolved installed paths.

62 nodes: 20 R, 38 T, 2 M, 2 C.

| ID | Reach | Resolved repository path |
| --- | --- | --- |
| N01 | R | `server/research/health/quick-order/production.test.ts` |
| N02 | R | `server/research/assisted-order/quick-order-repository.test.ts` |
| N03 | R | `server/research/assisted-order/quick-order-admin-readback.test.ts` |
| N04 | C | `vitest.config.ts` |
| N05 | C | `vite.config.ts` |
| N06 | T | `server/research/assisted-order/ports.ts` |
| N07 | R | `server/research/health/quick-order/production.ts` |
| N08 | R | `server/research/health/quick-order/legal.ts` |
| N09 | R | `shared/research/assisted-order/form.ts` |
| N10 | R | `server/research/policies-data.ts` |
| N11 | R | `shared/research/assisted-order/contract.ts` |
| N12 | R | `server/research/assisted-order/quick-order-repository.ts` |
| N13 | R | `server/research/assisted-order/express.ts` |
| N14 | R | `server/research/assisted-order/http.ts` |
| N15 | R | `server/research/assisted-order/service.ts` |
| N16 | R | `server/research/assisted-order/supabase-repository.ts` |
| N17 | R | `server/research/partners/declared-affiliate-code.ts` |
| N18 | M | `server/research/rate-limit.ts` |
| N19 | T | `server/research/health/quick-order/catalog.ts` |
| N20 | T | `server/research/health/quick-order/ports.ts` |
| N21 | T | `shared/research/assisted-order/quick-order.ts` |
| N22 | R | `server/research/health/quick-order/core.mjs` |
| N23 | T | `server/research/assisted-order/finance.ts` |
| N24 | T | `server/research/assisted-order/payment-effects.ts` |
| N25 | T | `server/research/assisted-order/financial-disposition.ts` |
| N26 | R | `server/research/assisted-order/disposition-effects.ts` |
| N27 | T | `server/research/assisted-order/payment/provider-journal.ts` |
| N28 | T | `server/research/assisted-order/payment/provider-execution.ts` |
| N29 | T | `server/research/assisted-order/payment/provider-settlement.ts` |
| N30 | R | `shared/research/early-access/customer-pathway.ts` |
| N31 | R | `shared/research/assisted-order/action-policy.ts` |
| N32 | M | `server/supabase.ts` |
| N33 | T | `shared/research/master-offerings/contract.ts` |
| N34 | T | `shared/research/master-offerings/pathway-authority.ts` |
| N35 | T | `server/research/assisted-order/production-catalog.ts` |
| N36 | T | `server/research/assisted-order/defaults.ts` |
| N37 | R | `server/research/assisted-order/audit-store.ts` |
| N38 | R | `shared/research/assisted-order/financial-disposition.ts` |
| N39 | T | `shared/research/capability.ts` |
| N40 | T | `server/research/assisted-order/payment/provider-adapter.ts` |
| N41 | T | `shared/research/master-offerings/pricing-contract.ts` |
| N42 | T | `shared/research/master-offerings/presentation-contract.ts` |
| N43 | T | `shared/research/master-offerings/formulation-hold.ts` |
| N44 | T | `shared/research/early-access-quantity.ts` |
| N45 | T | `server/research/master-offerings/model.ts` |
| N46 | T | `server/research/master-offerings/reviewed-holds.ts` |
| N47 | T | `shared/research/pricing.ts` |
| N48 | T | `server/research/commerce/cart-product-selection.ts` |
| N49 | T | `server/research/master-offerings/reconciliation-authority.ts` |
| N50 | T | `shared/research/product-admin.ts` |
| N51 | T | `shared/research/cart-product-selection.ts` |
| N52 | T | `shared/research/required-inputs.ts` |
| N53 | T | `server/research/product-activation/authority-repository.ts` |
| N54 | T | `shared/research/product-activation/contract.ts` |
| N55 | T | `server/research/products-diagnostics/product-control-price-resolver.ts` |
| N56 | T | `server/research/master-offerings/catalog-reconciliation.ts` |
| N57 | T | `shared/research/catalog.ts` |
| N58 | T | `shared/research/price-quantity-tiers.ts` |
| N59 | T | `shared/research/prelaunch.ts` |
| N60 | T | `server/research/products-diagnostics/variant-strength-dispute.ts` |
| N61 | T | `shared/research/catalog/peptide-catalog.ts` |
| N62 | T | `server/research/health/quick-order/core.d.mts` |

| From | Declared outgoing edges (local IDs resolve above) |
| --- | --- |
| N01 | R: `vitest`; T: `express`; T: N06; R: N07; R: N08; R: N09; R: N10 |
| N02 | R: `vitest`; R: N11; R: N12 |
| N03 | R: `express`; R: `supertest`; R: `vitest`; R: N11; R: N13; R: N14; T: N06; R: N12; R: N15; R: N16 |
| N04 | R: `vitest/config`; R: `path` |
| N05 | R: `vite`; R: `@vitejs/plugin-react`; R: `@tailwindcss/vite`; R: `path`; R: `@replit/vite-plugin-runtime-error-modal`; D: `@replit/vite-plugin-cartographer` |
| N06 | T: N17; T: N11 |
| N07 | R: `node:crypto`; T: `node:http`; T: `express`; T: N15; T: N06; T: N13; M: N18; R: N08; T: N19; T: N20 |
| N08 | R: N09; R: N10; T: N11; T: N20 |
| N09 | None observed |
| N10 | R: `node:crypto` |
| N11 | T: N21 |
| N12 | R: N11; T: N21; R: N22 |
| N13 | R: `node:crypto`; T: `express`; T: N14; T: N06 |
| N14 | R: N11; R: N15; T: N06; T: N23; T: N24; T: N25; R: N26; T: N27; T: N28; T: N29 |
| N15 | R: N30; R: N11; R: N31; R: N17; R: N09; T: N06; T: N11 |
| N16 | T: N11; T: N06; R: N15; R: N12 |
| N17 | None observed |
| N18 | R: N32 |
| N19 | R: `node:crypto`; T: N11; R: N33; R: N34; T: N06; T: N35 |
| N20 | T: `node:http`; T: N06; T: N19 |
| N21 | T: N11 |
| N22 | T: N62 |
| N23 | R: N11; R: N36; T: N06; R: N15; T: N16 |
| N24 | R: N37; R: N15; T: N16; R: N11 |
| N25 | R: `node:crypto`; R: `zod`; T: N38; R: N11; T: N06; R: N15; T: N16 |
| N26 | R: N37; R: N38; T: N16 |
| N27 | R: `node:crypto`; R: `zod`; T: N39; R: N11; T: N06; R: N15; T: N16; T: N40 |
| N28 | R: `node:crypto`; R: `zod`; T: N39; R: N11; T: N06; R: N15; T: N16; T: N40 |
| N29 | R: `zod`; R: N11; T: N06; R: N15; T: N16 |
| N30 | T: N11 |
| N31 | T: N11 |
| N32 | R: `@supabase/supabase-js`; R: `ws` |
| N33 | T: N41; R: N42 |
| N34 | T: N33; R: N43 |
| N35 | T: N11; R: N11; R: N31; R: N44; T: N06; T: N45; R: N46; T: N41; R: N33; R: N34 |
| N36 | R: `node:crypto`; T: N06 |
| N37 | R: `node:crypto`; R: N11; T: N06; T: N16 |
| N38 | None observed |
| N39 | None observed |
| N40 | R: `node:crypto`; T: N39 |
| N41 | T: N47 |
| N42 | None observed |
| N43 | None observed |
| N44 | None observed |
| N45 | T: N33; T: N48 |
| N46 | R: `node:path`; R: N49 |
| N47 | None observed |
| N48 | R: N50; T: N51; R: N51; T: N52; R: N53; T: N54; R: N55 |
| N49 | R: `node:crypto`; R: `node:fs`; R: `node:path`; T: N56 |
| N50 | T: N57; T: N58; T: N58 |
| N51 | T: N50; T: N52 |
| N52 | T: N59 |
| N53 | R: `node:crypto`; T: N54 |
| N54 | None observed |
| N55 | T: N50; R: N58; R: N51; R: N47; R: N60 |
| N56 | None observed |
| N57 | None observed |
| N58 | None observed |
| N59 | None observed |
| N60 | R: N61 |
| N61 | None observed |
| N62 | T: N20 |

No local alias edge remains unresolved. The `export *` from master-offerings/contract to presentation-contract is included. The declaration companion is explicitly a type edge. `new URL(href)` in presentation-contract parses a supplied URL; it is not a source loader.

## Exact equal blob and raw-byte bindings

For every row below **A blob = B blob, A raw SHA-256 = B raw SHA-256, and A bytes = B bytes**. This table includes every resolved local graph path plus the nine supplementary inputs; equality is stated once to avoid suggesting two separately different values.

| Path | A = B Git blob | A = B bytes | A = B raw SHA-256 |
| --- | --- | ---: | --- |
| `server/research/health/quick-order/production.test.ts` | `548d8b3fad4fb19680037ec32be0222fb2a18c4e` | 4808 | `34df7a7eb621ad7dfb26e0f94de51402e72dc0a4c311d67a0c321ad90660759f` |
| `server/research/assisted-order/quick-order-repository.test.ts` | `c9e52f8ae39bbbecf7e4f66bbd3368df3bfae631` | 33535 | `78aceede0a53a03cc7da4588be2cb4882b8a94b2767f00dbdb8b78b41d9c053a` |
| `server/research/assisted-order/quick-order-admin-readback.test.ts` | `bc8dc0c5ea65e74361a39742f3541a00b51ef7c9` | 30417 | `10b11bb8702381b8ac5a49ec717b0bcd62c2d56b84221e05e745a8c333c852f0` |
| `vitest.config.ts` | `242428c09e76d16da672e70e48bb885f90c71026` | 1713 | `24bdf9b67ddd363895a55879c07c779c5a367c399ea2fef1d17300f32382a5d0` |
| `vite.config.ts` | `aec779da413354fc7b4c7ff8bbe3ae74ed78a8b7` | 1316 | `08f76e7d682a54b03c04ee003675891a605d53b0d422f1132e6354860a15b924` |
| `server/research/assisted-order/ports.ts` | `3dd8dafef4b208c64d189e947e2f55a653052d7d` | 14257 | `cab0fe8e1cd398d4e59c18da09780d2ab6bed3115e17821be187df69b610a6ed` |
| `server/research/health/quick-order/production.ts` | `09b68c077d1dd37ce71d299709dd776c70169094` | 5602 | `d3cc0bffa4a0a3dce0963a422c5c58a3fb0a5142c455d2891f295204eb1a2b32` |
| `server/research/health/quick-order/legal.ts` | `41d8db389c61579b9c57ec6422abab7543c16579` | 1729 | `f8f36c9c9e2756426aea9bf97d67fb23e7111ef93617d45696a5127cb714967e` |
| `shared/research/assisted-order/form.ts` | `50dc8cdb925de3f722c9f2add9e6c220fc8d4d65` | 3526 | `7b612ff1779558346335b9e0bece063d443a8530fafbd5420fd67942a40ee695` |
| `server/research/policies-data.ts` | `acb789fe12d425105e0ed1d5c12c73bc54256e82` | 12668 | `ab92549448cb44447e4ad10f61b187328637d8f5cbf2bb7b6c22dd0dd26099bc` |
| `shared/research/assisted-order/contract.ts` | `6d865f3d71ed1ea8bf8957a092e7faa3cc10fd2c` | 22210 | `1a9eed498adf0144b84d0e52afe9b9e0c250847749289ad295561aec7581ef34` |
| `server/research/assisted-order/quick-order-repository.ts` | `fb6272f4ca01d72ef0e83414386903fd31039fb0` | 13458 | `034b92f07a20c6990d7b2cbd9760cd51119cad46b9dec6a217cab4a869d6c7fb` |
| `server/research/assisted-order/express.ts` | `29215125e54d10e7c4c10c5afe73261e50e0c4ec` | 10641 | `0e0f93fe85f9c2a532c305be24ed08ceb1834806fcece33c78d8ba6d6dcc04ac` |
| `server/research/assisted-order/http.ts` | `edf31c70e49a7e20c44d65e6d74cdad5535daeee` | 19058 | `6053138b2db68def7bd437d19eb5d755a6c996342a2c5b2cc4440ae1529d6ee0` |
| `server/research/assisted-order/service.ts` | `4d8d2f1d2f196a37f0c42c2e18373849f7ecd11a` | 48464 | `57ea0b0202f0648aa9324ca6f1f24c5dedb1a761d1d4d85a80fda21e8ebacc67` |
| `server/research/assisted-order/supabase-repository.ts` | `8da0f773db6ef4f6dbca145b67232731b8fcf693` | 23131 | `274493e5b0618222b919adf6ab4d7613b04f58247ed79c5a7d29ab9076772e53` |
| `server/research/partners/declared-affiliate-code.ts` | `ddcacd63ccedbe932ab51fe7c2c5ce7861109dd8` | 4223 | `45c6959125186a5a29d534746af896dac54537f8d68b42a5b24eb02fd4e5f5ae` |
| `server/research/rate-limit.ts` | `216bf282d17bda33f725229ea71baf1bbc7ad80a` | 3815 | `a660c4a33a2d1cb8bfcc6ba859ade7ce789fd72c98646595fe9ed5f0c0fd180a` |
| `server/research/health/quick-order/catalog.ts` | `eae50d0e0c6519d95e4d4740a6be6545a4b3bf5a` | 11381 | `43458fb0279f1298aca4582053bf98163910b85ccbb7169cec2d690879a20037` |
| `server/research/health/quick-order/ports.ts` | `0f5b5fc9028906d6c1da678a96a79a0f7f5fd73f` | 3971 | `8da9b4327bac927a4f57685fcee6d40c968c3ccca3dcd546f74f8e6bb5da2e14` |
| `shared/research/assisted-order/quick-order.ts` | `550bdcdb9e1aa681e87872d5f26ebb1e8cc5b615` | 1991 | `3d2fbc4b79a37f253d81291eee691dcba4d7c941b9ae95555ced49c703a095f2` |
| `server/research/health/quick-order/core.mjs` | `c0f3cbe232147094cc32bf72734b1121be8b87a2` | 14548 | `7e43b08c8d2d28cbfd713ad586a2859da2ee5790d277edf76ae9275439469a35` |
| `server/research/assisted-order/finance.ts` | `fcd149c1d4ce17cd74b62829f3df0a3a19d75112` | 12290 | `90f8e3e09f033e41677650b51ebe41e3360b190b91327dde6fc849fcb81e065a` |
| `server/research/assisted-order/payment-effects.ts` | `c80b64904530a6ec84ed9248ece30cc7b44de727` | 10496 | `22d1f7bb459c12023a3a67b89dca4c074dfd588d0cb53df3bf3027ceebc78ad6` |
| `server/research/assisted-order/financial-disposition.ts` | `207003b719640ed96486453c8cc205b88e33fb3b` | 9954 | `47d7d13a6eccf10056f39f79aad30226fa24e1dd03e0b8fe53309a517faf4507` |
| `server/research/assisted-order/disposition-effects.ts` | `df652365b119da774e8dab673338f392cf507a66` | 10169 | `3f2a805d417b7c119e877bea0497ca521033d7aa8f655002ec1135e14f3b0f09` |
| `server/research/assisted-order/payment/provider-journal.ts` | `a941c26bf20b0ea2164cc39d2c2807e977d78b22` | 15041 | `6014c88f64b58aa744b65175305db38494210e759348bdd83f1eb4fd3fede359` |
| `server/research/assisted-order/payment/provider-execution.ts` | `5a149794407bd72fff54ff96bc5028a4e0d47a51` | 22834 | `dc2d782b06c5f5e510a9bca564139a340aaca707563124ec75edd817c3a7b430` |
| `server/research/assisted-order/payment/provider-settlement.ts` | `6505680caeebd086ce797d8c60b06aee7c2566fe` | 6729 | `6780c0be5a8547fbe059b765b5049e3fa9e50eb0c9d2aaeba2493f9592e9a433` |
| `shared/research/early-access/customer-pathway.ts` | `96ae0079f7263de715b6ad875ddd0665a5ab4ce2` | 8901 | `97fcb90adc4278831dc1e750c26be22efc467115ee2e347298f8cf003c4c08f9` |
| `shared/research/assisted-order/action-policy.ts` | `24166b229473c6cef04a4dab4bfb1a7193a3f65b` | 5935 | `7064917c42ed6080d61f30a91fdfd401ee23ad1fbd2389c9456df5fa0edd50e4` |
| `server/supabase.ts` | `23abbc867d21745c42ed2b5b581522aefb11deec` | 3450 | `62cbdd23232ebecd0827fef7f478d30b25f905902548701165edee028de11bfb` |
| `shared/research/master-offerings/contract.ts` | `ff95e3048b6b3f2133431e176c7c4a307e036244` | 14327 | `c30333183fd3e7edc1293ebd6e02a064c5222065bb05bb08cfee0c3c9f8d204c` |
| `shared/research/master-offerings/pathway-authority.ts` | `44713ae92039be33515fa87f9c8ad66dbf174dcf` | 9807 | `d8d57c5d6011fa3be4c814389d3602a542772213cdde881d69206dbf56d589de` |
| `server/research/assisted-order/production-catalog.ts` | `82f5d2c1d7c1c7d90b2fa798cad7b8c484a7867d` | 21610 | `d13240f48cc8755c7cc9a72942453f4824e778b63690d973c75002bb41d97aa3` |
| `server/research/assisted-order/defaults.ts` | `11f7e2e328f249ffa5d0621b45febd6e06b9e398` | 1598 | `ed3acc236911fefeaf2a9e8f5f0512facc5aa428be8b89e61b26691eba16d6c3` |
| `server/research/assisted-order/audit-store.ts` | `2cde5b4e2303466df3f8c713802b6814b2672c4b` | 20250 | `fb2f096baabc9439b814d1391dcf6134cf4bf296583355cdce66e65e851c8e51` |
| `shared/research/assisted-order/financial-disposition.ts` | `0b9a5d000feba8a295e33f14e761103c1942c02c` | 758 | `30eb32d0f95befbaf76582969b59b994a49f77546da7658fe2c8f69a1d3398b3` |
| `shared/research/capability.ts` | `07690a1c03b44c3e500a8cf2753f2cf97a44c07c` | 3970 | `f1dd79ab74315885f553b348989c364f41c1ebb0c52a05cdb870140b07449b43` |
| `server/research/assisted-order/payment/provider-adapter.ts` | `0981a0e01c3ef632ea542ab5af90364db25de34a` | 12376 | `fb0e46888044bce222ae98c35e31cb34a411a652b801744effcac06c5113d0cf` |
| `shared/research/master-offerings/pricing-contract.ts` | `f4534273e3d5647f2641da61eb9a1e9ee317fc9c` | 7231 | `08ffbe948442ddb90b08198d82988f5d00825790a9f77de82cd622ab1c146916` |
| `shared/research/master-offerings/presentation-contract.ts` | `98e8ccfffb23f997fd847c4f7a007fedf0e46d46` | 12917 | `1559c1c08f0e1f15f53e844d6af33b0264de5633b8d06ffdb098949859309468` |
| `shared/research/master-offerings/formulation-hold.ts` | `c5c95e8cac1d24d6b81fbfba4f084bc83f68ce1f` | 5150 | `c5b11b2f468a77b0da111f7228ff27fa3c15e72f66c2dc15f4e864007dd9bbc5` |
| `shared/research/early-access-quantity.ts` | `45845cfeb7caf0691e1ae28e941c9eca411d36ef` | 7384 | `873ace18b4b0a55ec137ae02ff0210e9980ea30dbc79e6d6d0bbc9e2fb55e7ea` |
| `server/research/master-offerings/model.ts` | `5ea7be4b2c1894c2005a798a659d0cb7e8c3118b` | 4779 | `795ea9992fd1c7e1b4fe1579affa912bc0c09c82ad415826078934268c4a8def` |
| `server/research/master-offerings/reviewed-holds.ts` | `b89fb4773b511c5b51641bdbe5f5b50169167b62` | 4034 | `6b53a51cb4a37e8564e588270b27b1dbaafe6dbe111d72f53ea9ae0ab06615ae` |
| `shared/research/pricing.ts` | `363bae76023beb1e1ba44ae9bc4c75173c2c0589` | 9873 | `2cba9d6d149176453b750878e341a3c5e2073fb4489fb4b0316abab2e6a4047e` |
| `server/research/commerce/cart-product-selection.ts` | `4610902b52599c3a1483f99c48b90b9ccfe8e267` | 11480 | `af5804dd01b6e0c108fff7b24e160b6ae5c2189d42169ae9d2087a015971bda0` |
| `server/research/master-offerings/reconciliation-authority.ts` | `ef147a44bf9bf3697f1cabab7eba52c30cc72285` | 5986 | `dfb8a7756a2c7ab344d06c02490a45dab2d324c47d32445f48a863bcc197c429` |
| `shared/research/product-admin.ts` | `fcf43dedf0b2ecc95e10d16137ddb74502a3ff10` | 7500 | `a7e51177996bc53d46639a41795bcfad3913a54d1428bced33b1ffb7dbb97eb0` |
| `shared/research/cart-product-selection.ts` | `7faa44245a5832ee5a13ea43f947021e0ed35d6f` | 4256 | `f2b04d521db59d854f30652c396bb8343dd414dbdd63679867e42f6f07c13cfc` |
| `shared/research/required-inputs.ts` | `c41228860cd4ae02309278601901224b309890d1` | 4083 | `42e3afadc8e85adbe4d0721ba3f5dfe7f7175437337ae92143ec884f77770538` |
| `server/research/product-activation/authority-repository.ts` | `b14eda69f5a1fef3aec76c1980be25fa69f31ba2` | 10598 | `6c2cd49686f32c176d33548b8a412ea7669b1a523e6b34ed8d9f0dfc1ad668cf` |
| `shared/research/product-activation/contract.ts` | `f1e10dafe0ce10d886b7d1b6a0d6e73de0e7e639` | 13106 | `8c6a5cbef22d0cf62b5611076496e2ffff75d9ab37cd207d8901a16d6d4a378d` |
| `server/research/products-diagnostics/product-control-price-resolver.ts` | `b6cfee7dd58957c4f4267b7738f030e744cc2167` | 11540 | `9c7e2007c155b0c87d15e1d2d76b19846dad43276ee74865ed795cf995578712` |
| `server/research/master-offerings/catalog-reconciliation.ts` | `e57c50cf53a000d551f2969aeea30c170a16664b` | 7758 | `7dc44e3cf7b4b674963dae1fe1193681aff5bd04b35b7bf969e7b0fef9a11628` |
| `shared/research/catalog.ts` | `9efee7e0668c58de2dedf3ec9c0642061096025f` | 13784 | `2335db782984824cde855f802c06e9b556a97e504159ab7ff23ed52f53d29db0` |
| `shared/research/price-quantity-tiers.ts` | `c06c102f4562fc2e8449fffc9b8cfc63366b9dc8` | 3002 | `1cfb7ca8656acb35fcdae7e244acb7eb32977ff42e7610e54a2d963649a3efe3` |
| `shared/research/prelaunch.ts` | `93a945dac796c9f342d9b8cce821b5bec061f96e` | 2804 | `83f237d569a7016116388b7754946b17692e0daaf01640bd50fa5227248efd54` |
| `server/research/products-diagnostics/variant-strength-dispute.ts` | `6ee48ac30904c3aa24d54b0cab9018c0fe529853` | 9916 | `ca92be3c692a20510955972eb18eed0f8cc4ebd2c4ec7ac371735772fb973673` |
| `shared/research/catalog/peptide-catalog.ts` | `34a29d16387d1be762db05b6424f3de01fd0c49e` | 84563 | `fe134c5441b829aca69872351d278fcf02ccf69a8950f2721e92b6f6f2bb6f89` |
| `server/research/health/quick-order/core.d.mts` | `ce893fb5ec3ed7a00608e8596765ef497412c3c8` | 1285 | `d3bca2af4ef290f37db356480cdf4b1f610a17e331910ecb7a2a4f7102f30998` |
| `tsconfig.json` | `cb406c8a0f64787c157f1ff61c52f791b4b2a5ae` | 752 | `5f41f98d5eabcc089474b21db34688585bc16038985663514e5fef780a8a6792` |
| `package.json` | `36e8fbc63aa1b81eff8a64622c8de28937bbb6c7` | 6010 | `89d5d2160381ea23967d56fcf666643d51dbb779fc652d82181bd2379a53828b` |
| `package-lock.json` | `912f4f85e9a078ed97ed2b67ce8d1de09490eb29` | 262653 | `d25eb6b816b616cfa1dc7b1769c14971b944e5385bfae9be41e75d1cf5e64f74` |
| `.npmrc` | `b81dbffb90baca44ae88df37b6c87b7350f12b6a` | 40 | `7ea70c911324c4d4a0044bf0f12e3cf8b3e92a922ca4b34c20423a57e5616501` |
| `postcss.config.js` | `2e7af2b7f1a6f391da1631d93968a9d487ba977d` | 80 | `190c877db466995bf1482f4a16abd06e04a89ede3119341e2a86ff96e1737b27` |
| `e2e/vitest.config.ts` | `cfed132960be02bfec35a28ef95413c70dd2f163` | 679 | `c96165371503cf99c754ef0565918c0ebe8299ae182ed80338a5eff6ee567c7a` |
| `scripts/evidence/vitest.config.mjs` | `59bb6255a2d2812e66910b78ae188d12c17bc260` | 741 | `ea095d8ed94f6ecc83d31f850ff62e45d9b6b2f1deb7f42abfbb5bb921a4afe3` |
| `.github/workflows/checks.yml` | `7a2c2c5870c47bbadf716f8f55f96da656700cfb` | 1439 | `0568d5693e2ada99a06e31e5fb3f640b1601a4827cb9d58081f9e8799e19f7a8` |
| `config/research/master-catalog-reconciliation-20260821.json` | `35371f6b9db5cc98ab37818e073a80b4d1095dbb` | 5815 | `d63eade14720c36547fe07b17f954000cc704094a376f246352757af33597976` |

## Configuration, packages and runner inputs

Root `vitest.config.ts` uses node environment, automatic JSX, an empty inline PostCSS plugin list, the three server/shared/client include patterns, and @shared/@ aliases. It declares no setupFiles, globalSetup, projects or explicit pool. The draft command uses a positional single-file selector and no --config; a future frozen wrapper must pin repository-root cwd and ensure this intended root config is the one loaded. Selecting e2e/evidence config, invoking from another cwd, or adding CLI/environment overrides would be a different input. Their separate configs are compared for completeness but not selected by the draft. No vitest workspace/project config or local __mocks__ path was found in the committed tree inventory.

`vite.config.ts` is the separate application config, not explicitly merged by the root Vitest config. It contains conditional `import("@replit/vite-plugin-cartographer")` based on NODE_ENV/REPL_ID names, and @assets in addition to the shared aliases. Values were not read. If the later wrapper selected the application config, its plugin graph would need separate resolution/qualification. `postcss.config.js` is identical but the root test config explicitly supplies its own empty PostCSS plugin list.

`tsconfig.json` has no extends; bundler module resolution, ESNext/ES2022, node and vite/client types, @/@shared paths. It excludes **/*.test.ts from tsc. This comparison does not promise a typecheck or prove all erased-type semantics of the installed transformer.

`package.json` is ESM and declares Node20.19.0/npm10.8.2; test is vitest run, check is tsc. No root install/preinstall/postinstall script is declared. The pilot invokes Vitest directly, not npm test/build or the release gates. `.npmrc` is identical (production=false, fund=false, audit=false).

The whole lockfile is identical, version3, **672 non-root package entries, 411 without an integrity field**, independently recounted from committed JSON. Relevant locked versions: Vitest4.1.10, Vite7.3.5, esbuild0.25.12, TypeScript5.6.3, Express5.2.1, Supertest7.2.2; type/mocked branches include zod3.25.76, supabase-js2.108.2 and ws8.21.0. Type declarations include @types/node20.19.43, @types/express5.0.6, @types/supertest7.2.1, @types/ws8.18.1. These are **declared**, not installed versions. Vitest/Supertest/@types-supertest entries carry integrity; the other listed entries do not. esbuild is marked hasInstallScript. No install was attempted and --ignore-scripts feasibility remains unproven.

Bare external endpoints: vitest, vitest/config, express, supertest; type/mocked branches also zod, @supabase/supabase-js, ws; config comparison adds vite, @vitejs/plugin-react, @tailwindcss/vite, @replit/vite-plugin-runtime-error-modal, and conditional @replit/vite-plugin-cartographer. Builtins include node:crypto, node:http, path/node:path, node:fs; supplementary config adds node:url. Complete transitive package resolution is bound only by the equal lockfile, not by inspection of installed sources. Native/optional platform dependencies, downloads, module export selection and installed bytes remain **UNKNOWN**.

### Proposed command identity, not executable approval

Intermediate proposal revision2 retains these three **DRAFT_ORCHESTRATOR_ONLY_NOT_FINAL** argv forms. They were read, never run:

```text
node --max-old-space-size=1024 node_modules/vitest/vitest.mjs run server/research/health/quick-order/production.test.ts --pool=forks --maxWorkers=1 --no-file-parallelism --cache=false --reporter=json --outputFile=.ci-pilot/out/production.json
node --max-old-space-size=1024 node_modules/vitest/vitest.mjs run server/research/assisted-order/quick-order-repository.test.ts --pool=forks --maxWorkers=1 --no-file-parallelism --cache=false --reporter=json --outputFile=.ci-pilot/out/repository.json
node --max-old-space-size=1024 node_modules/vitest/vitest.mjs run server/research/assisted-order/quick-order-admin-readback.test.ts --pool=forks --maxWorkers=1 --no-file-parallelism --cache=false --reporter=json --outputFile=.ci-pilot/out/admin-readback.json
```

The only proposed target change is **A SHA/tree instead of B SHA/tree** in checkout assertions and receipt/procedure identity. File selectors, expected blobs/hashes and lockfile need no change. This record does not modify the proposal or workflow.

The final wrapper is absent. Intermediate proposed inputs remain Node20.19.0/npm10.8.2, linux/amd64, ubuntu-24.04, image `node@sha256:e44d951c16cd042012215a3473d69d3364e62ffcebf7e7acccf44163e0385327`, checkout action `11d5960a326750d5838078e36cf38b85af677262`, upload action `ea165f8d65b6e75b540449e92b4886f43607fa02`. These pins were not downloaded or executed.

The proposed setup is npm ci --ignore-scripts --no-audit --no-fund, no fallback. One container/worker, network-none tests, no published ports, non-root user, read-only root/source, writable dependency/output/Vite-temp mounts and bounded tmpfs. Supertest's ephemeral listener is still an execution action requiring approval. No credentials or Docker socket. Setup egress is bounded by construction only, not demonstrated allowlisting.

Resource proposals remain 1CPU,2GiB memory/swap ceilings,64 process/thread limit,128MiB tmpfs,180s per test plus5s termination grace,30-minute job,20MiB artifacts/7-day retention. 1024MiB outer heap does **not** prove worker heap. The direct submission recommends NODE_OPTIONS propagation; that is a recommendation, not this steward choosing/finalizing an option or observing a worker. Disk/RAM admission, writable paths/user/HOME/cache, remaining335s overhead, output ceilings, limit-hit classification, CI/allowOnly guards, exact workflow bytes/ref, named dispatcher, UTC window and attempt-consumption mechanism all remain final-authoring/approval conditions under Doc77.

Both A and B contain candidate `checks.yml` blob `7a2c2c5870c47bbadf716f8f55f96da656700cfb`, with four ordinary jobs. Do not confuse it with reviewed main blob `b070777a5e49076162e38fd7c389cd55f727eddc` and its three jobs. This comparison does not approve either a checks-file edit or the recommended separate manual-only workflow. Choosing A may remove the newer source-transfer step, not workflow landing, automatic-run/consumer inventory, reviewer comparison or actual execution authority.

## Changed qualification/SQL inputs explicitly excluded

A..B has 83 changed paths; 77 are other .xenios/docs records, including the Windows qualification manifest and historical receipts. The remaining six material qualification/SQL paths are listed here (the executable supervisor lives under docs). None is a declared import, fixture read or command input of the three selected tests. This is **not** a review accepting their changes or declaring them globally interchangeable.

| Path | A blob / bytes / raw SHA-256 | B blob / bytes / raw SHA-256 |
| --- | --- | --- |
| `docs/health-launch/quick-order-20261005/qualification-supervisor.mjs` | ABSENT | `a9ba8356442218bd7206beb0e5973632c9a581a1` / 188286 / `2a68b06c7cb120a8a31231f0153e9759a067a48c48f058f2e1c93073960411f9` |
| `supabase/candidates/20261006_research_health_quick_order_currentness.postcheck.sql` | `6f9ea68981e3c1aca269e2d9c076dab91dc9dafd` / 9056 / `0c2d28d57e270f6deeaf9bbf617734ec93103abf5028760c8023fe313c5c6d1a` | `02453231f4a974b4c8f76f47e47927489c3fc5d9` / 10665 / `367f6873a23456453c7fc55cd29b97fe595728ecf94e230ecce0f9d75f7d4ff9` |
| `supabase/candidates/20261006_research_health_quick_order_currentness.precheck.sql` | `9fd11baf3273c158307040b683ba78dd4d76de3a` / 8960 / `a3cbf36f4fa0ee120f4ac4c7fb45f2158ad9d25c8fda652423a04cd7c94c82d4` | `ff6cc8916b7968cf1e142971a043bf38b4b41f87` / 10569 / `09429fd5db0001e67f5d30248e345c260606b8d16e06f52e8db3b74dc2b3b3dd` |
| `supabase/candidates/20261006_research_health_quick_order_currentness.rollback.md` | `90efb4757cfa43e298e74bed88d5ffff1ab4a74c` / 8869 / `7037c6991cef713b3bb3cb8593bbd6718b6656173f269864101461745d162d09` | `a026071930bb274e4c58df8c9216f28eb390a52e` / 14926 / `474483e86340692ab59d4fbe7f02295d62f43d343a3c1ff3c7bf2c5364b6a827` |
| `supabase/candidates/20261006_research_health_quick_order_currentness.sql` | `fab74a8f5575211a0f7debb1348d9d8ac9289aa3` / 21525 / `dc1c1deed6640fb68d3e202bbb1e73c45a0cd7450e669b6a6669032959ceff1e` | `15d63f91a6e46007d6fa151eb405149b79fa4b5f` / 45229 / `819cbcf4b03d4e7fc86e458e6c02e207b2b11c90390e826e83e648cf0d79ba85` |
| `supabase/verification/research_health_quick_order_currentness_local.mjs` | `30f554a6fe9e9a22487a7ece01853a91c0531246` / 25524 / `0fc2f78524e7239b6bd092865d19a627a003f9d7dca6044bf101318d4e1b7e31` | `f7cf66c399c1f9a84fde6f86b080fc0dd73ffe2a` / 86492 / `e7703ecec1406c77faf9aad92ecbadd7eb42902f230a6fc693a4901ff76c2d9d` |

The SQL currentness changes, verifier changes and absent-at-A Windows supervisor prevent treating the **entire revisions** as equivalent. They also prevent relabeling A as the implemented transaction, accepting A's SQL from a pilot pass, or closing any Windows G0/G1/G3 group.

## Evidence limits and next decision

- Declared-source/config equality is established for the bounded inspected inventory. Installed package graph, compiler resolution, fork heap, actual container/runner, real resource use, test success and hosted behavior are **not observed**.
- Literal extraction cannot prove all possible runtime resolution. External package/plugin internals are uninspected; mocked code is only presumed replaced according to the declared test contract until an authorized run confirms it. The type-inclusive data reader and conditional application plugin remain explicitly bounded exceptions.
- No environment values, .env contents, credentials, installed node_modules or application/SQL parser were read/executed. No actual Node/npm version command was run. No synthetic GET/PATCH/POST was sent.
- Static metadata commands are Git show/rev-parse/ls-tree/diff/rev-list, PowerShell text/JSON inspection and .NET raw-byte SHA-256. Metadata-only composition/object-name errors were corrected; they are not failed test runs. No previous test/timeout result is relabeled.
- The earlier stewardship finding at29297c3 and connection profile9c4a9b5 are frozen and not part of this correction. Their enforcement requirements and original technical acceptance remain separate.
- If A is accepted and selected later, the procedure amendment, exact checkout assertions and each receipt must explicitly name A and its tree. No silent target substitution. All three exact files must independently meet the approved per-file rule: exit0, exactly intended file, >0 cases, zero failed/pending/skipped/todo/unhandled, known admission/cleanup and all approved isolation/resource/output conditions. No PASS claim exists here.
- Coordinator collects this local record for the original reviewer's **narrow receipt-target suitability acceptance**. The steward does not message or replace that reviewer. User selection, final workflow authoring/lease, reviewer comparison, landing authority and named/windowed one-attempt execution remain separate.

**Disposition: RECOMMEND PUBLISHED A FOR THE LIMITED PILOT, SUBJECT TO ORIGINAL REVIEWER ACCEPTANCE AND EXPLICIT SELECTION. EXECUTION NOT RUN. NO PUSH.**
