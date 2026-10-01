# Xenios Health private founder visual prototype

Date: 2026-10-01

Status: reviewer-corrected private prototype with a founder-authorized six-study calibration rendered for named Claude direction review. It is not production-qualified, publication-approved, runtime-wired, deployed, or a source of commerce, price, Care, availability, or fulfillment truth.

## Outcome

The prototype gives the full reconciled customer catalog a concrete visual system without crossing any production boundary. It includes a structural wireframe, a polished founder-facing preview, shared card/detail image identity, complete search and pathway filtering, special-state treatments, a 423-target QA grid, and responsive browser evidence.

The build is pinned to the frozen core HL-11 candidate:

- Source commit: `4cba24af1d42ad59fe44856859cc1721846e6df5`
- Source tree: `6395273fc4370b7df713a2b72b019785f547d1fb`
- Test commit: `f634e8630b92818ea494aa96f5f68c921441455b`
- Qualification records: `c73da35cc223a2253ce8074948ed9ff063012748`
- Imagery review target: `184d820a2a20152649b67892ec0a5467857d5290`
- Claude reviewer tip: `76607458e30a64746d227150ff1dbab3475dd64a`
- Focused prototype review: `023e9ec8899ded7f66f52ef3c21a799501d98084`
- Media/commerce candidate: `b38db0ae2ee0c679ec2eeb31b324f6204669dfb7`

These pins are evidence inputs only. The HL-11 candidate remains `FAILED_NOT_RELEASE_READY` with independent acceptance false. The media/commerce candidate is not accepted for integration. Claude supplied exact-SHA, per-asset decisions, but did not approve any image for publication or authorize Batch 1 rendering.

## Catalog and visual accounting

| Measure | Result |
| --- | ---: |
| Reviewed workbook source rows | 426 |
| Canonical variants | 424 |
| Customer targets after excluding shipping `GRP-0364` | 423 |
| Research pathway targets | 173 |
| Care pathway targets | 242 |
| Structured held target | 1 |
| Quote-only targets | 2 |
| Other binding-pending targets | 5 |
| Deliberate visual slots | 423 |
| Final exact-product assets | 0 |
| Provisional visual slots | 423 |
| Fallback-only slots | 0 |
| Exact-product renders still missing | 423 |
| Existing Batch 0 class renders preserved privately | 25 |
| Batch 0 assets independently approved | 0 |
| Reviewer-directed neutral substitutions | 269 |
| Reviewed-rejected assets selected in product slots | 0 |
| Private calibration studies rendered | 6 |
| Calibration-backed prototype slots | 423 |
| Batch 0 assets selected into prototype slots | 0 |
| Calibration / Batch 1 / publication approvals | 0 / 0 / 0 |

The 25 Batch 0 assets remain private, provisional presentation studies only. None was rerendered, copied into a public tree, or granted product-specific truth, and none is selected into a current prototype slot. Under Samuel's explicit private-internal calibration authorization, six new studies were generated from one fixed visual contract: vial, bottle, topical, Care state, held/quote-only state, and unknown/unverified-packaging state. The prototype uses those studies for all 423 slots. All 242 Care rows, all 20 supplement-retail rows, the acetic-acid diluent, and six lyophilized GHK-Cu rows use truth-safe calibration states. Rows without a matching calibrated form use the neutral unverified-identity state rather than an older green/botanical Batch 0 fallback. The build rejects any attempted selection of Batch 0 jobs 06, 09, 16, 19, 21, or 24. Held, quote-only, and binding-pending states remain restrictive. All customer-facing numeric prices remain withheld because this lane has no price-release authority.

## Claude review disposition

Claude's exact-SHA review passed the prototype's structure, publication safety, and data truth. It accepted 12 Batch 0 studies for private-prototype use, requested changes to seven, and rejected six. The prototype now implements every immediately actionable truth correction without creating new pixels:

- removed the rejected physical-clinic lounge from all Care rows;
- removed fabricated supplement retail packaging from all 20 affected rows;
- removed the tincture bottle from acetic acid;
- neutralized lyophilized GHK-Cu rows rather than displaying a false white-powder cue;
- proves in tests and generated accounting that no reviewed-rejected asset is selected.

This is a response to review, not an approval. Claude still needs to complete the full journey and mobile review of the corrected prototype and return an exact-SHA decision for the six-study calibration. Batch 1 remains blocked until that named global direction decision is recorded.

## C2PA provenance capture

`manifests/batch-000-c2pa-provenance.json` now records the embedded C2PA structure for all 25 source PNGs. Every file contains one `caBX` manifest; all 25 repository bytes match their receipt SHA-256; all 25 instance IDs are unique; and the embedded creation action identifies `ChatGPT` / `gpt-image`, `OpenAI Media Service API`, C2PA 2.2.0, and trained-algorithmic media. RFC3161 token timestamps are captured separately from local receipt observations.

Job 19's embedded creation claim precedes the local receipt observation by about 592.5 seconds. That is consistent with delayed tool delivery or local file write of an already-manifested render, but cannot be proven without provider logs or cryptographic validation. The receipt clock is explicitly observational and is not used as generation-order or signature-validity evidence.

This pass structurally decoded the embedded claims and re-bound them to the repository bytes. It did not cryptographically validate COSE/RFC3161 signatures, certificates, revocation, assertion hashes, or asset binding because a pinned official C2PA validator is not present. The manifest preserves that limitation; authoritative approval still requires a pinned official `c2patool` pass.

The same repository-contained structural decoder was applied to the six calibration PNGs. All six contain one `caBX` manifest, all six repository-byte hashes match their receipts, and all six instance IDs are unique. Embedded generator claims identify `ChatGPT` / `gpt-image` and `OpenAI Media Service API`. This remains structural provenance only: it is not cryptographic validation, rights clearance, Product Control approval, publication approval, or runtime authority.

## Review surfaces

- Home: founder-level visual direction, Featured, Care, Coming soon, authority boundary, and the current six-study calibration sheet; Batch 0 remains preserved evidence rather than the lead direction.
- Products: all 423 targets with exact catalog name/specification, truthful price state, pathway/status, CTA, search, and filters.
- Featured: legacy Featured identities resolved to their current canonical owners.
- Product detail: the exact same image identity as its source card, with explicit provisional status.
- Research and Care: separate customer journeys without claiming price or clinical eligibility.
- Held, quote-only, and binding-pending: restrictive states visually outrank ordinary product treatment.
- Coming soon: Superpower and Mito Health only, with no package, price, or checkout claims.
- Status, account, and support: visual journey prototypes only.
- QA grid: all 423 canonical IDs, captured across nine desktop pages plus tablet and mobile checks.
- Wireframe: low-fidelity information architecture independent of the polished skin.

## Browser evidence

The automated pass produced 45 screenshots. Chromium 149 reported:

- 423 of 423 QA canonical IDs covered
- 0 broken images
- 0 horizontal-overflow findings
- 0 severe console messages
- 0 external-network boundary violations
- Search interaction: `BAM15` reduced the catalog to the exact quote-only `GRP-0244` row
- Pathway interaction: `held` reduced the catalog to the exact held `GRP-0422` row

Representative evidence:

- `evidence/founder-preview/calibration-contact-sheet-desktop-1440.png`
- `evidence/founder-preview/calibration-contact-sheet-mobile-390-390.png`
- `evidence/founder-preview/home-desktop-1440.png`
- `evidence/founder-preview/home-tablet-834.png`
- `evidence/founder-preview/home-mobile-390-390.png`
- `evidence/founder-preview/home-mobile-320-320.png`
- `evidence/founder-preview/products-desktop-1440.png`
- `evidence/founder-preview/products-search-bam15-desktop-1440.png`
- `evidence/founder-preview/products-pathway-held-desktop-1440.png`
- `evidence/founder-preview/products-mobile-390-390.png`
- `evidence/founder-preview/featured-desktop-1440.png`
- `evidence/founder-preview/research-detail-desktop-1440.png`
- `evidence/founder-preview/research-detail-mobile-320-320.png`
- `evidence/founder-preview/review-fix-acetic-acid-detail-desktop-1440.png`
- `evidence/founder-preview/review-fix-ghk-cu-detail-desktop-1440.png`
- `evidence/founder-preview/review-fix-supplement-detail-desktop-1440.png`
- `evidence/founder-preview/care-mobile-390-390.png`
- `evidence/founder-preview/held-detail-desktop-1440.png`
- `evidence/founder-preview/quote-detail-desktop-1440.png`
- `evidence/founder-preview/coming-soon-desktop-1440.png`
- `evidence/founder-preview/status-account-support-mobile-390-390.png`
- `evidence/founder-preview/catalog-review-desktop-page-01-1440.png` through `page-09`
- `evidence/founder-preview/wireframe-desktop-1440.png`

The machine-readable capture record is `evidence/founder-preview/founder-preview-browser-evidence.json`. Matching text snapshots are retained beside each PNG.

## Batch 1 preparation

`manifests/batch-001-prepared.json` contains 25 deterministic inventory candidates and explicitly sets both render and publication authorization to false. It contains the 22 current canonical owners of legacy Featured identities plus three class-diversity candidates:

- `GRP-0243` - 5-Amino-1MQ
- `GRP-0362` - Acetic Acid 0.6%
- `GRP-0366` - Annatto Pro 125

This manifest is planning input only. It contains no Batch 1 renderer prompt. The six-image global art-direction calibration has now been rendered under explicit private-internal authority, but it remains unapproved and cannot authorize Batch 1. HL-11 independent acceptance, media/commerce integration acceptance, and exact repository ownership gates must also clear.

`prompts/global-art-direction-calibration-v1.json` freezes the exact six renderer prompts and shared visual lock. `manifests/global-art-direction-calibration.json` binds the six outputs to exact SHA-256 values, and `manifests/global-art-direction-calibration-prepared.json` records the rendered-private-review-pending state. Private prototype use is authorized; calibration approval, Batch 1 mass rendering, publication, Product Control approval, and runtime integration all remain false.

## Run and reproduce locally

Build the catalog projection and prepared Batch 1 manifest:

```powershell
node scripts/product-imagery/build-calibration-evidence.mjs
node scripts/product-imagery/build-founder-preview.mjs
```

Start the loopback-only preview:

```powershell
node scripts/product-imagery/serve-founder-preview.mjs 5178
```

Then open `http://127.0.0.1:5178/founder-preview/index.html?view=home`.

Run focused checks and regenerate responsive evidence:

```powershell
node scripts/product-imagery/extract-c2pa-provenance.mjs
node --test scripts/product-imagery/founder-preview.test.mjs
node scripts/product-imagery/capture-founder-preview.mjs
```

The server exposes only `docs/product-imagery`, binds only to `127.0.0.1`, denies forms and external connections through CSP, and emits noindex/noarchive headers.

## Runtime dependencies and gates

Future integration depends on shared owners, not on this prototype:

1. Claude acceptance of the reviewer-directed prototype corrections and completion of the full journey/mobile review.
2. Claude's exact-SHA approval or correction decision for the rendered six-study global art-direction calibration before any Batch 1 rendering.
3. Independent acceptance of the frozen HL-11 catalog candidate.
4. Acceptance of the media/commerce decoupling slice after its MC-01 failure-mode correction.
5. A coordinated shared UI lease for one canonical resolver and one resilient image component.
6. Founder authorization for any publication, deployment, managed SQL, Supabase write, Render write, or production mutation.

Until those gates clear, the preview stays private and informational. Its CSS, markup, search behavior, and visual layout are not runtime authority, and its provisional image assignments must not be copied into production.
