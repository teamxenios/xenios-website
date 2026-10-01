# Xenios product imagery reviewer-correction exact-SHA handoff

Branch: `codex/xenios-product-imagery-20260930`

Pushed source commit: `5df310fd5e654cad9ee259101831a73cb887224d`

Source tree: `eff033abe28298c5c8d49e67352460f6613bd81c`

Reviewer source: `76607458e30a64746d227150ff1dbab3475dd64a`, including focused prototype review `023e9ec8899ded7f66f52ef3c21a799501d98084`.

This checkpoint applies the exact Claude imagery findings to the existing private founder prototype. It is not image approval, catalog acceptance, price release, runtime integration, publication, deployment, or production authorization.

## Delivered

- Preserved the frozen 426 reviewed source rows to 424 canonical variants to 423 customer-product targets.
- Preserved all 25 Batch 0 PNGs, receipts, hashes, and non-public location without rerendering.
- Replaced the rejected Care lounge for all 242 Care rows with the neutral identity study.
- Replaced fabricated supplement packaging for all 20 affected retail-supplement rows.
- Replaced the acetic-acid tincture visual for `GRP-0362`.
- Neutralized six lyophilized GHK-Cu rows rather than showing a false white-powder cue.
- Added a fail-closed build assertion proving that rejected jobs 06, 09, 16, 19, 21, and 24 cannot be selected into any product slot.
- Added a five-study global art-direction calibration plan with no botanicals and fixed palette, camera, scale, and lighting constraints. Every render and publication flag remains false.
- Kept all 25 Batch 1 inventory candidates preparation-only, with render and publication authorization false.

## Exact accounting

| Measure | Result |
| --- | ---: |
| Reviewed source rows | 426 |
| Canonical variants | 424 |
| Customer targets after shipping exclusion | 423 |
| Final exact-product assets | 0 |
| Provisional visual slots | 423 |
| Exact-product renders missing | 423 |
| Reviewer-directed neutral substitutions | 269 |
| Reviewed-rejected assets selected in product slots | 0 |
| Batch 0 originals retained privately | 25 |
| Batch 0 public/runtime-approved | 0 / 0 |
| Batch 1 inventory candidates | 25 |
| Calibration studies prepared | 5 |
| Batch 1/calibration render authorization | false / false |

`docs/product-imagery/founder-preview/catalog-data.json` remains the complete 423-row missing-render ledger. Every row has `exactRenderMissing: true`; no narrower candidate list replaces it.

## C2PA structural provenance

`docs/product-imagery/manifests/batch-000-c2pa-provenance.json` records all 25 embedded `caBX` manifests with:

- repository-byte SHA-256 equality to all 25 receipts;
- 25 unique instance IDs;
- embedded `ChatGPT` / `gpt-image` creation-agent claims;
- `OpenAI Media Service API`, C2PA 2.2.0, and trained-algorithmic media claims;
- embedded action times and RFC3161 token times;
- the exact 592529.415118 ms Job 19 local receipt gap.

The extractor is repository-contained and uses only Node built-ins. This is structural evidence, not cryptographic validation: COSE/RFC3161 signatures, certificate chains, revocation, assertion hashes, and asset binding remain unvalidated until a pinned official C2PA validator is available. The Job 19 gap is consistent with delayed tool delivery or local write, but provider logs would be required to prove that explanation.

## Responsive evidence

The regenerated browser record contains 43 captures and 86 hash-bound screenshot/text files:

- 423 of 423 QA canonical IDs covered;
- 0 broken images;
- 0 horizontal-overflow findings;
- 0 severe console messages;
- 0 external-network boundary violations;
- exact `BAM15` search and held-pathway interaction proofs;
- dedicated acetic-acid, GHK-Cu, and supplement correction detail captures;
- desktop, tablet, 390px, and 320px surfaces.

Representative correction evidence:

- `docs/product-imagery/evidence/founder-preview/review-fix-acetic-acid-detail-desktop-1440.png`
- `docs/product-imagery/evidence/founder-preview/review-fix-ghk-cu-detail-desktop-1440.png`
- `docs/product-imagery/evidence/founder-preview/review-fix-supplement-detail-desktop-1440.png`

Local preview:

```powershell
node scripts/product-imagery/serve-founder-preview.mjs 5178
```

Open `http://127.0.0.1:5178/founder-preview/index.html?view=home`.

## Verification

- `node --test scripts/product-imagery/founder-preview.test.mjs scripts/product-imagery/product-imagery.test.mjs`: 22 of 22 pass.
- `node scripts/product-imagery/verify.mjs`: pass, 426 to 424 to 423, 25 rendered, 0 public.
- `node scripts/product-imagery/extract-c2pa-provenance.mjs`: 25 of 25 embedded manifests structurally captured, 25 unique instance IDs, 0 publication approvals.
- Browser evidence: 43 captures, 423 of 423 QA IDs, 86 of 86 screenshot/text hashes verified.
- Independent read-only audit: pass after provenance terminology and self-contained extractor corrections.
- `git diff --cached --check`: pass before the source commit.
- Origin verified: branch tip equals `5df310fd5e654cad9ee259101831a73cb887224d`.

## Current external gates after final fetch

- Claude reviewer tip is `76607458e30a64746d227150ff1dbab3475dd64a`. Exact per-asset decisions exist, but no asset is public-approved and Batch 1 is explicitly not yet authorized.
- Core origin tip is `1af1d48d1e3fad340e0461ba2263559b1ea599b5`, tree `bf241608ca809a4defc45b568529688bc6e14250`; its two latest commits concern the separate LENS01 detection successor. Frozen HL-11 source remains `4cba24af1d42ad59fe44856859cc1721846e6df5`, tree `6395273fc4370b7df713a2b72b019785f547d1fb`; its task remains `qa` with no `acceptedSha`, and Claude marked promotion not ready.
- Media-commerce origin tip remains `b38db0ae2ee0c679ec2eeb31b324f6204669dfb7`. Its task remains `qa` with no `acceptedSha`; Claude's verdict is partial and MC-01 remains a pre-integration blocker.
- No shared runtime/UI lease was claimed. No client public, runtime, catalog-authority, price, payment, SQL, Render, Supabase, hosted, deployment, or production path changed.

## Required next action

Claude should review this exact source SHA as the focused successor to report 25, complete the full journey/mobile prototype review, and decide the global calibration direction. Do not render the calibration set or Batch 1, publish assets, or wire runtime imagery until the applicable exact review, catalog, media-commerce, and ownership gates clear. Any deployment, managed migration, hosted write, or production mutation still requires Samuel's current explicit authorization.
