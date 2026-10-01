# Xenios Health private founder visual prototype

Date: 2026-10-01

Status: complete private prototype for founder review. It is not production-qualified, publication-approved, runtime-wired, deployed, or a source of commerce, price, Care, availability, or fulfillment truth.

## Outcome

The prototype gives the full reconciled customer catalog a concrete visual system without crossing any production boundary. It includes a structural wireframe, a polished founder-facing preview, shared card/detail image identity, complete search and pathway filtering, special-state treatments, a 423-target QA grid, and responsive browser evidence.

The build is pinned to the frozen core HL-11 candidate:

- Source commit: `4cba24af1d42ad59fe44856859cc1721846e6df5`
- Source tree: `6395273fc4370b7df713a2b72b019785f547d1fb`
- Test commit: `f634e8630b92818ea494aa96f5f68c921441455b`
- Qualification records: `c73da35cc223a2253ce8074948ed9ff063012748`
- Imagery review target: `184d820a2a20152649b67892ec0a5467857d5290`
- Media/commerce candidate: `b38db0ae2ee0c679ec2eeb31b324f6204669dfb7`

These pins are evidence inputs only. The HL-11 candidate remains `FAILED_NOT_RELEASE_READY` with independent acceptance false. The media/commerce candidate is not accepted for integration. The imagery review target does not yet have named exact-SHA, per-asset approval.

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

The 25 Batch 0 assets were reused as private, provisional presentation studies only. None was rerendered, copied into a public tree, or granted product-specific truth. Care, held, quote-only, and binding-pending rows use state-neutral provisional studies. All customer-facing numeric prices remain withheld because this lane has no price-release authority.

## Review surfaces

- Home: founder-level visual direction, Featured, Care, Coming soon, authority boundary, and the Batch 0 contact sheet.
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

The automated pass produced 40 screenshots. Chromium 149 reported:

- 423 of 423 QA canonical IDs covered
- 0 broken images
- 0 horizontal-overflow findings
- 0 severe console messages
- 0 external-network boundary violations
- Search interaction: `BAM15` reduced the catalog to the exact quote-only `GRP-0244` row
- Pathway interaction: `held` reduced the catalog to the exact held `GRP-0422` row

Representative evidence:

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
- `evidence/founder-preview/care-mobile-390-390.png`
- `evidence/founder-preview/held-detail-desktop-1440.png`
- `evidence/founder-preview/quote-detail-desktop-1440.png`
- `evidence/founder-preview/coming-soon-desktop-1440.png`
- `evidence/founder-preview/status-account-support-mobile-390-390.png`
- `evidence/founder-preview/catalog-review-desktop-page-01-1440.png` through `page-09`
- `evidence/founder-preview/wireframe-desktop-1440.png`

The machine-readable capture record is `evidence/founder-preview/founder-preview-browser-evidence.json`. Matching text snapshots are retained beside each PNG.

## Batch 1 preparation

`manifests/batch-001-prepared.json` contains 25 deterministic candidates and explicitly sets both render and publication authorization to false. It contains the 22 current canonical owners of legacy Featured identities plus three class-diversity candidates:

- `GRP-0243` - 5-Amino-1MQ
- `GRP-0362` - Acetic Acid 0.6%
- `GRP-0366` - Annatto Pro 125

This manifest is planning input only. It contains no ready renderer prompt and must not be used until the existing Batch 0 exact-SHA asset review, HL-11 independent acceptance, media/commerce integration acceptance, and exact repository ownership gates all clear.

## Run and reproduce locally

Build the catalog projection and prepared Batch 1 manifest:

```powershell
node scripts/product-imagery/build-founder-preview.mjs
```

Start the loopback-only preview:

```powershell
node scripts/product-imagery/serve-founder-preview.mjs 5178
```

Then open `http://127.0.0.1:5178/founder-preview/index.html?view=home`.

Run focused checks and regenerate responsive evidence:

```powershell
node --test scripts/product-imagery/founder-preview.test.mjs
node scripts/product-imagery/capture-founder-preview.mjs
```

The server exposes only `docs/product-imagery`, binds only to `127.0.0.1`, denies forms and external connections through CSP, and emits noindex/noarchive headers.

## Runtime dependencies and gates

Future integration depends on shared owners, not on this prototype:

1. Named per-asset review against the exact imagery target and each exact asset SHA.
2. Independent acceptance of the frozen HL-11 catalog candidate.
3. Acceptance of the media/commerce decoupling slice.
4. A coordinated shared UI lease for one canonical resolver and one resilient image component.
5. Founder authorization for any publication, deployment, managed SQL, Supabase write, Render write, or production mutation.

Until those gates clear, the preview stays private and informational. Its CSS, markup, search behavior, and visual layout are not runtime authority, and its provisional image assignments must not be copied into production.
