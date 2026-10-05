# Consolidated acceptance chain for the accepted-source integration (2026-10-05)

## Why this record exists

After doc 32 (`d9998563`), four narrow reviews ran in **forks of this review session** (`forkedFrom
6abf1edf-2b16-476e-8305-23b9a0014e06`, Claude Fable 5.1). Their verdicts were preserved verbatim by the coordination
lane on `codex/xenios-launch-coordination-20261005` (tip `96e4d36b93ec80479dece9ea5e6fc12262619229`), not on this
branch. This record binds them into one acceptance chain, re-verifies the facts an integration review depends on, and
fixes the checklist for the integration successor. It adds no new acceptance of its own except the spot-checks noted.

**Canonical base for every lane:** `3eaa017fcbd28989c65ffc4bb439a554aa1f3f59` (runtime `c0e25c73`).

## 1. Accepted inputs (exact)

| Lane | Source SHA / tree | Tests and evidence (successor commits) | Verdict and session | Artifact at `96e4d36` (sha256) |
| --- | --- | --- | --- | --- |
| Core A/B/C + IC-2 | `c93bf5a2c1e2b50c5b40c65f0149033ad84658a0` / `fd729bca811b8e91ec13a31d9d3985472087579a` | tests `2a791be…` (IC-2 regression test), records `b0e818f` | SOURCE-LEVEL ACCEPT, fork `cc511440` | `CLAUDE_CORE_IC2_ACCEPTANCE.txt` `5728fdc6…bdcdba` |
| Partner sign-in return | `94e89be7c959087edfde4ebddf2f50fa5e02cc36` / `23b3284a5cfc667b5cdc0e35643f07e71c333268` | tests `806c58a8…`, evidence `9b8adebd…`, handoff `3f044f4` | SOURCE-LEVEL ACCEPT (static + receipts, no rerun), fork `04b9c0f3` | `CLAUDE_PARTNER_RETURN_ACCEPTANCE.txt` `ccaa8ac3…b104a2` |
| MC-01 | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` / `f5953b8e148196c4ea71839cdd40a4e06b5f9fd1` | tests in source; handoff `0b86108` | ACCEPT at source level with release preconditions, this session (doc 32) | doc 32 |
| D/E foundation | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` / `0258be61bf4761ee9911cda1c0d042b6cd183aa3` | records `c3ea135` | SOURCE ACCEPT; IC-3 PASS; one P2 (DE-R1), fork `d8d31048` | `CLAUDE_DE_ACCEPTANCE.txt` `5ea90856…a40a1a65` |
| D/E DE-R1 correction (supersedes foundation as integration input) | `e6a8171b5b2d4ad78930c214997532e16601a48e` / `72023b56e21b0f8b5c9643d110def78c0a6b6e7b` | records `db9516d` | ACCEPT; DE-R1 CLOSED; no P0/P1/P2, fork `478774d3` | `CLAUDE_DE_R1_ACCEPTANCE.txt` `5546145a…896d249` |
| Product-subscription intent | `7806fb5939a69189e085739fad8cc832cfab201a` / `10d7d2534f155f5fccdeb7c3c15bfc450d379c5d` | tests/evidence `03b72f8…`, handoff `1fe97f5` | SOURCE ACCEPT at a disabled purchase boundary, conditional, fork `f66b6b88` | `CLAUDE_SUBSCRIPTION_ACCEPTANCE.txt` `100af517…6d8e860` |
| **Finance** | `dfd8b9b` | — | **NOT an integration input.** Accepted only as an unregistered SQL candidate (doc 32). | doc 32 |

Lineage facts: `7806fb5` and `94e89be` both descend from `c93bf5a`; `e6a8171` descends from `ed9bb9b`; none of the four
new sources contains the finance attribution candidate.

## 2. Spot-checks performed for this record (this session, read-only)

- Core IC-2: runtime delta `70cd421→c93bf5a` is exactly one declaration,
  `.xenios-order-page--customer .xenios-order-timeline li { border-left-color: var(--rule); }`. The three protected
  files hash to the doc-32 "new" values at `c93bf5a`; the manifest is unchanged.
- Partner: runtime delta `b0e818f→94e89be` is two literal hrefs in `clarity/pages.tsx` (`/sign-in?returnTo=
  %2Fresearch%2Fpartners%2Fdashboard`). The hint is consumed only through `safeResearchReturnTo`, a closed allowlist
  that already contains `/research/partners/dashboard` and rejects external origins, `//`, encoded path bytes, dot
  segments and fragments.
- D/E: `supabase/candidates/20261005_research_product_media_descriptor.sql` appears in no ledger, DAG or release-control
  map at `e6a8171`.
- Tests: `assisted-order-premium.test.tsx` differs between `c93bf5a` (source) and `94e89be` (carries the `2a791be`
  IC-2 test). The integrator must compose the test successors, not only the source SHAs.

## 3. Holds carried into integration (none may be silently resolved)

- **Protected hash pairs** (Navbar `e37a5b94…→6cdfbb0f…`, Footer `25da700f…→420b45dc…`, index.css
  `70d3302a…→b475a8ee…`): Samuel's explicit approval still pending; **manifest must remain unchanged** in the
  integration successor.
- **GATE-01 / Access Hub:** Samuel's disposition pending; `static.ts` and the three seams remain mismatched.
- **MC-01 runtime precondition:** persistent-cart predecessor closure → reviewed MC-01 candidate → non-image
  `product_content` manifest re-approval → separate launch transition. Until then the primary image still gates
  commerce in SQL, and the admin copy overstates current behaviour.
- **D/E:** candidate SQL unregistered and unapplied; browser, delivered-bytes/hash, canonical reader/writer, Product
  Control ingestion and database qualification all still open; fallback-first only.
- **Subscription:** all six real-buying blockers OPEN; PS-R1 (exact-SHA Vitest receipt for the 17 focused files) must
  be produced at the **integrated** SHA; PS-R2 (typed server payment refs) and PS-R3 (single test-only switch) are
  release holds; the persistence seam stays test-only; effective quantity cap 50 enforced while the 100-vs-50 policy
  stays unresolved.
- **Finance:** F1, refund/void/dispute, ADP-G2/G3/G4, LENS-01 adoption, controlled races, and the failed aggregate
  remain OPEN; no provider or finance capability may be enabled.
- **Qualification still outstanding across Core slices:** clean-checkout aggregate (ABC-R3), native 200% zoom,
  keyboard traversal, forced-colors.

## 4. Integration-review checklist (what the next review will execute)

1. **Identity:** exact integration SHA/tree/handoff; linear ancestry from `3eaa017`; integration branch
   `codex/accepted-source-integration-20261005`.
2. **Composition:** per-file diff of the integration tree against the union of the accepted source **and test**
   trees; any file outside that union, any dropped hunk, any imported `.xenios` lane history or `evidence/` directory
   as runtime, and any finance runtime/provider/payment code is a defect.
3. **Protected bytes:** `sha256-lf` of Navbar/Footer/index.css must equal the doc-32 "new" values; the manifest,
   `static.ts`, `App.tsx`, `server/index.ts`, `server/research/index.ts` byte-identical to `3eaa017`.
4. **Behavioural invariants:** `BRAND.publicName === "Xenios"`; `healthDisplayName` used only by Navbar/Footer; IC-1
   (admin computed styles vs base), IC-2 (customer timeline `rgba(14,14,14,0.1)`), IC-3 (fallback copy, no
   `role="img"`, notice outside pixels); DE-R1 (`enforceSigningLifetime:false` only in `ProductMedia`, timer capped at
   300 s); partner `returnTo` literal and allowlist unchanged; subscription `ProductPage` passes `product={null}`,
   quantity 1–50, `51`/`100` refused, no SKU/priceVersion literal, no payment call.
5. **SQL:** `supabase/migrations`, `MIGRATIONS.md`, `MIGRATION_DAG.json` and the release-control pending map unchanged;
   candidates present but unregistered.
6. **Evidence:** integrator receipts for the 17-file subscription set, combined changed-path suites, TypeScript and
   build at the exact integrated SHA; anything deferred for host pressure reported as DEFERRED, never PASS. Claude
   re-executes what the host permits.
7. **Return:** the exact fields requested by the coordinator (ACCEPT/REJECT, PASS/FAIL per area, P0–P2, completed vs
   deferred evidence, remaining founder decisions and hosted-authority blockers, release-qualification readiness).
   Never PRODUCTION READY.
