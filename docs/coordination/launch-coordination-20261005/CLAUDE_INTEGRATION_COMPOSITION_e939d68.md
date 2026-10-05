# Integration candidate `756a906`: source-level composition review (part 1 of 2)

**Status:** source-level checks complete; **verdict withheld** until the integrator's evidence packet is pushed and
verified (part 2). Reviewer: this session, `claude-fable-5-1`, effort `xhigh` (reported as actually set; not `max`).

## Identity

- **Integration source:** `756a906877dbc174b7e228a259d2faa9c3af48ca`, tree `787432948d9464880df1dcfc5dff58eec7d889aa`,
  branch `codex/accepted-source-integration-20261005` (tip at review time; no later commit).
- **Lineage:** `3eaa017` (canonical base) → `66fda5c` (lease records only) → `756a906` (one composition commit).
  None of the accepted lane commits is an ancestor; composition was done by re-applying bytes, so identity was proven
  file-by-file below.
- **Acceptance chain referenced:** doc 33 (`42d8b6d`).

## VERIFY 1: composition identity (PASS at source level)

Method: for every runtime, test and SQL path (excluding `.xenios/` and `docs/`), compare the `756a906` blob with the
blobs at the accepted lane heads that include their tests: Core `2a791be`, partner `806c58a`, MC-01 `ed9bb9b`,
D/E `e6a8171`, subscription `03b72f8`. Script and output: `hl12/34_compose-check.mjs.txt`, `hl12/34_compose-check.out`.

| Result | Count | Detail |
| --- | --- | --- |
| Union of lane-changed files | 65 | |
| Byte-identical to the single lane that changed them | 55 | includes all protected files, MC-01 SQL candidate, D/E descriptor candidate, partner `pages.tsx`, subscription runtime |
| Changed by both MC-01 and D/E, taken in the D/E form | 8 | correct: D/E descends from and supersedes MC-01 for these files |
| Hand-merged, bytes in no lane | 1 | `client/src/research/assisted-order/AssistedOrderPage.tsx`: verified to equal Core's customer-root class change **plus** D/E's `ProductMedia` import and slot, and nothing else (two-way diff against both lanes) |
| Test strengthened beyond the lane | 1 | `client/src/research/adapters/product-subscription-create.test.ts`: `it("…403…")` → `it.each([400, 403])`. Test-only, strict superset, closes subscription PS-R5. Must be declared in the handoff. |
| Dropped accepted changes | 0 | |
| Files changed outside any lane | 0 | runtime; records changed only under `.xenios/` |
| Lane histories / evidence dirs imported as runtime | none | |
| Finance runtime, provider or payment code | none | attribution candidate absent; `finance-sprint-20261003/` absent |

## VERIFY 2: Core (PASS at source level)

- `sha256-lf` at `756a906`: Navbar `6cdfbb0f…`, Footer `420b45dc…`, index.css `b475a8ee…`, equal to the pending
  approval pairs.
- Byte-identical to base: `CORE_SITE_PROTECTION_MANIFEST.json`, `server/static.ts`, `client/src/App.tsx`,
  `server/index.ts`, `server/research/index.ts`, `package.json`, `package-lock.json`.
- `brand.ts`, IC-2 stylesheet, partner `pages.tsx` and the subscription `ProductPage` are the accepted lane bytes, so
  the fork-session findings (public "Xenios Health", `publicName` unchanged, IC-1, IC-2, `returnTo` allowlist,
  `product={null}`, quantity 1–50) carry over without re-audit.

## VERIFY 3: MC-01 / D-E holds (PASS at source level)

- `supabase/migrations`, `MIGRATIONS.md`, `MIGRATION_DAG.json`, release-control map: identical to base.
- Candidates added: `20261003_research_media_commerce_decoupling.{sql,rollback.md}`,
  `20261005_research_product_media_descriptor.sql`, all unregistered and unapplied.
- MC-01 runtime precondition (persistent-cart predecessor → candidate → non-image manifest re-approval → launch
  transition) is **carried, not resolved**.

## VERIFY 4 and 6: subscription boundary and owner holds (carried)

Subscription runtime bytes are the accepted lane's; the six buying blockers remain OPEN. Still blocked and untouched by
this candidate: protected-hash founder approval, manifest re-cut, GATE-01/Access Hub, live SKU/price, payment
finality, managed SQL apply, partner activation, production promotion.

## Pending for part 2 (evidence)

When the integrator pushes its packet, verify and, host permitting, re-execute the decisive gaps:
1. the 17-file subscription focused set at exactly `756a906` (PS-R1);
2. combined changed-path suites, TypeScript and build at `756a906`;
3. the bounded synthetic browser smoke;
4. declaration of the PS-R5 test change;
5. anything deferred for host pressure reported as DEFERRED, never PASS.

Only then: ACCEPTED-SOURCE COMPOSITION ACCEPT/REJECT and release-qualification readiness. Never PRODUCTION READY.

## Quick Order (not yet reviewable)

Package located at `C:\Users\sboad\Downloads\Xenios_Quick_Order_Handoff_2026-10-05\quick-order` (v0.1.0). No
`codex/xenios-health-quick-order-20261005` branch exists on origin. Review starts only when the coordinator supplies
exact source/tree/test/evidence/handoff identities.
