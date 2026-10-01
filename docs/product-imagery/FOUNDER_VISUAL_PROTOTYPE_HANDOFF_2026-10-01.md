# Xenios product imagery private founder prototype exact-SHA handoff

Branch: `codex/xenios-product-imagery-20260930`

Pushed source commit: `c0373b73ae5258618d35773a451eca3333339584`

Source tree: `3984cc9b7da15906114fc1adcfd02a485dc37d69`

This checkpoint completes the private founder visual prototype requested for the full reconciled catalog. It is not production-qualified, publication-approved, runtime-wired, deployed, or a source of catalog, price, Care, commerce, availability, or fulfillment authority.

## Delivered

- Structural low-fidelity wireframe.
- Polished founder preview with restrained near-black, taupe, ivory, purple, and teal design language.
- Home, Products, Featured, product detail, Research, Care, held, quote-only, binding-pending, Coming soon, status/account/support, and QA-grid views.
- Exact shared image identity between every card and its detail view.
- Exact catalog name and specification, truthful price-withheld state, pathway/status, and CTA on product cards.
- Search, category, and pathway controls over all 423 customer targets.
- A complete 423-target QA grid.
- Responsive evidence for desktop, tablet, 390px, and 320px surfaces.
- Superpower and Mito Health as intentional Coming soon panels only, without package, price, checkout, logo, or partnership claims.
- Existing Batch 0 assets preserved and reused only as private provisional studies. No Batch 0 asset was rerendered or published.
- A deterministic 25-item Batch 1 preparation manifest with render and publication authorization false.

## Exact accounting

| Measure | Result |
| --- | ---: |
| Reviewed source rows | 426 |
| Canonical variants | 424 |
| Customer targets after excluding `GRP-0364` shipping | 423 |
| Research | 173 |
| Care | 242 |
| Held | 1 |
| Quote only | 2 |
| Other binding pending | 5 |
| Provisional visual slots | 423 |
| Final exact-product assets | 0 |
| Exact-product renders missing | 423 |
| Batch 0 renders retained privately | 25 |
| Batch 0 approved/public/runtime-wired | 0 / 0 / 0 |
| Batch 1 prepared | 25 |
| Batch 1 render/publication authorization | false / false |

`docs/product-imagery/founder-preview/catalog-data.json` is the complete missing-render ledger: all 423 rows set `exactRenderMissing: true`. The corresponding QA grid and nine paged desktop captures make every canonical ID reviewable. No separate, narrower list should be mistaken for full coverage.

## Pinned source truth

- Frozen HL-11 runtime source: `4cba24af1d42ad59fe44856859cc1721846e6df5`
- Frozen HL-11 runtime tree: `6395273fc4370b7df713a2b72b019785f547d1fb`
- HL-11 test commit: `f634e8630b92818ea494aa96f5f68c921441455b`
- HL-11 qualification records: `c73da35cc223a2253ce8074948ed9ff063012748`
- Imagery per-asset review target: `184d820a2a20152649b67892ec0a5467857d5290`
- Media/commerce decoupling source: `f453d7e25ac3bdee4e42365d2b0b6a513b9e6da5`
- Media/commerce records tip: `b38db0ae2ee0c679ec2eeb31b324f6204669dfb7`

The imagery projection never reads changing working-tree catalog files. It reads the exact frozen core source through `git show` and verifies its exact tree before emitting data.

## Verification

- `node --test scripts/product-imagery/founder-preview.test.mjs`: 6 of 6 pass.
- `node --test scripts/product-imagery/product-imagery.test.mjs`: 12 of 12 pass.
- `node scripts/product-imagery/verify.mjs`: pass, 426 to 424 to 423, 25 Batch 0 rendered, 0 public.
- `node scripts/product-imagery/capture-founder-preview.mjs`: pass, 40 captures, 423 of 423 QA IDs, 0 broken images.
- Evidence hash check: 80 of 80 screenshot/text files match the SHA-256 values in the browser record.
- Browser checks: 0 horizontal-overflow findings, 0 severe console messages, 0 external-network boundary violations.
- Interaction evidence: `BAM15` search returns only quote-only `GRP-0244`; held-pathway filter returns only `GRP-0422`.
- `git diff --cached --check`: pass before the source commit.
- Independent read-only audit: no correctness or safety blocker after aligning render gates and adding interaction evidence.

## Primary artifacts

- `docs/product-imagery/FOUNDER_VISUAL_PROTOTYPE_2026-10-01.md`
- `docs/product-imagery/founder-preview/index.html`
- `docs/product-imagery/founder-preview/catalog-review.html`
- `docs/product-imagery/founder-preview/catalog-data.json`
- `docs/product-imagery/manifests/batch-001-prepared.json`
- `docs/product-imagery/evidence/founder-preview/founder-preview-browser-evidence.json`
- `scripts/product-imagery/build-founder-preview.mjs`
- `scripts/product-imagery/serve-founder-preview.mjs`
- `scripts/product-imagery/capture-founder-preview.mjs`
- `scripts/product-imagery/founder-preview.test.mjs`

Local preview:

```powershell
node scripts/product-imagery/serve-founder-preview.mjs 5178
```

Open `http://127.0.0.1:5178/founder-preview/index.html?view=home`.

The server binds only to `127.0.0.1`, exposes only `docs/product-imagery`, denies forms and external connections through CSP, and emits noindex/noarchive headers.

## Gate truth after final fetch

- Registered Claude reviewer branch: `e7b74feb04567cac16d5b8bd089a7ae1218721d2`. It contains zero references to imagery review target `184d820a2a20152649b67892ec0a5467857d5290`; no exact-SHA, per-asset decision has arrived.
- Core branch tip: `c23b979bcd60a0fb550c7be1ba3ef55988eb506b`. The frozen HL-11 task remains `qa` at handoff `c73da35cc223a2253ce8074948ed9ff063012748`, with no `acceptedSha`; independent acceptance is false.
- Media/commerce branch tip: `b38db0ae2ee0c679ec2eeb31b324f6204669dfb7`. Its task remains `qa` at source handoff `f453d7e25ac3bdee4e42365d2b0b6a513b9e6da5`, with no `acceptedSha`; integration acceptance has not arrived.
- No shared UI lease was claimed and no shared client, API, Product Control, payment, SQL, Render, Supabase, public asset, or production path was changed.

## Required next action

Keep the 25 Batch 0 candidates and this prototype private. Do not rerender Batch 0. Do not render Batch 1, publish images, or wire runtime imagery until all four gates clear:

1. Exact per-asset approval for the imagery target and asset SHAs.
2. Independent acceptance of the frozen HL-11 catalog candidate.
3. Acceptance of the media/commerce decoupling slice for integration.
4. An exact shared UI task/path lease.

After those gates clear, claim the smallest exact integration slice, preserve the canonical resolver and commerce-state boundary, and repeat provenance plus responsive browser review. Deployment, managed SQL, Render/Supabase writes, or any production mutation still require Samuel's current explicit approval.
