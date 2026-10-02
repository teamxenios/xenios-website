# Xenios private founder preview Core UI-convergence handoff

Branch: `codex/xenios-product-imagery-20260930`

Pushed source commit: `516328cfbe8f76c23f115744161be7ec150e6334`

Source tree: `769944ae3d057feec9923fea6bc4faf08c23a8c1`

Prior imagery checkpoint: `8b06da560978c8c4b1ce325da8813373bffbc845`

Frozen Core UI reference: `c0e25c73a0d789829ea213e2ee040c68e06f0a75`
at tree `1771d18bad91b89e95414bebb8b574dc32729687`

Claude UI-fidelity baseline: `ae5c410ab6e5c27df94c5bdc5b6533ab821b6d4c`
at tree `36dd5df64f5da1caf8a1212c89195caf870a907d`

This checkpoint delivers one private UI-fidelity and Core-convergence slice.
It does not approve a design, image, catalog, price, Product Control binding,
runtime integration, publication, deployment, hosted write, managed SQL change,
or production mutation.

## Delivered

- Rebuilt the private founder prototype around the dominant current Core public
  shell, type, spacing, containers, controls, cards, forms, footer, and
  responsive breakpoints.
- Preserved the actual current Core behavior beside every intentional proposal.
- Added the five founder decisions as `CURRENT CORE` versus
  `PROPOSED XENIOS HEALTH` comparisons.
- Added current no-image versus proposed image-enabled cards for Research,
  Care, held, quote-only, and packaging-unverified states.
- Added current 4:3 member media versus proposed square 1:1 media using the
  exact same source pixels.
- Removed preview-only image filtering, saturation, contrast grading,
  vignette, tint, and forced crop. Product media uses `object-fit: contain`.
- Added a safe no-image fallback that does not borrow a lookalike asset.
- Added actual public Core screenshots and exact-source synthetic member
  catalog/detail component captures at desktop and mobile.
- Recorded the 28 pre-existing Core inconsistency rows and five completeness
  addenda instead of silently choosing among conflicting Core patterns.
- Preserved all six calibration PNGs byte-for-byte and rendered no new image.
- Kept all 25 Batch 1 candidates at render and publication authorization false.
- Changed no Core runtime, public asset, server, shared authority, database,
  deployment, or production path.

## Founder decisions now represented faithfully

1. Header brand: `Xenios` versus `Xenios Health`.
2. Primary action language: current mixed treatment versus black rectangular
   primary with restrained secondary actions.
3. Purple-to-teal: current flat purple token versus restrained accent use.
4. Public product imagery: current text-only cards versus approved-image cards
   with a truthful fallback.
5. Canonical media shape: current optional 4:3 member slot versus proposed 1:1
   square slot.

All five remain unapproved and require Samuel's explicit decision.

## Work that can follow A-E without another visual-direction decision

After Samuel decides A-E, later implementation may mechanically apply the
chosen brand scope, CTA primitives, accent token boundaries, Product Control
media DTO, one card/detail media identity, contain-only presentation, safe
fallback, selected aspect ratio, intrinsic dimensions, accessibility copy, and
responsive regression tests. That later work still requires exact path
ownership, Core integration acceptance, and the normal production gate.

## Evidence

### Corrected private preview

- Browser receipt:
  `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-preview-browser-evidence.json`
- Full-page captures: 134.
- Required responsive matrix captures: 120.
- Required surfaces: 12.
- Widths: 1440, 1280, 1024, 834, 768, 430, 390, 375, 360, 320.
- Catalog QA coverage: 423 of 423 IDs.
- Broken images: 0.
- Horizontal overflow findings: 0.
- Severe browser console messages: 0.
- External network boundary violations: 0.

Representative founder evidence:

- `founder-decisions-desktop-1440.png`
- `founder-decisions-mobile-390.png`
- `product-card-comparison-desktop-1440.png`
- `product-card-comparison-mobile-390.png`
- `product-detail-comparison-desktop-1440.png`
- `product-detail-comparison-tablet-834.png`
- `product-detail-comparison-mobile-390.png`

All are under
`docs/product-imagery/evidence/ui-convergence/corrected-preview/`.

### Current Core evidence

- Public and prior synthetic references:
  `docs/product-imagery/evidence/ui-convergence/core-reference/`
- Exact-source member catalog/detail references:
  `docs/product-imagery/evidence/ui-convergence/core-synthetic-c0e25c73/`
- Bounded member receipt:
  `synthetic-catalog-detail-evidence.json`
- Sensitive-pattern scan: `CLEAN`, 0 findings, 0 unscannable artifacts.
- Manual review: four of four PNGs reviewed, with no real credentials or
  customer data observed.

The exact Core harness produced `AUTOMATED_PASS` for member catalog and detail
at 1440 and 390. Its larger 20-state run then timed out on the out-of-scope
account selector `#ms-email`. No full journey receipt is claimed. The retained
captures are explicitly `UI_PRESENTATION_ONLY`; they do not prove
authentication, routed member behavior, live adapters, Product Control,
pricing, availability, or commerce.

## Drift and inconsistency records

- UI drift matrix:
  `docs/product-imagery/UI_CONVERGENCE_DRIFT_MATRIX_2026-10-01.md`
- Core inconsistencies:
  `docs/product-imagery/CORE_UI_INCONSISTENCIES.md`
- Founder decision packet:
  `docs/product-imagery/FOUNDER_UI_DECISION_PACKET_2026-10-01.md`

## Verification on the pushed source

- 27 of 27 focused imagery and founder-preview tests pass.
- Imagery verifier passes with 426 reviewed source rows, 424 canonical rows,
  423 exposed customer rows, 25 preserved Batch 0 renders, and 0 public assets.
- Source em-dash gate passes: 1338 files scanned, 0 forbidden forms.
- `.xenios` validation passes.
- `git diff --check` passes.
- The six frozen calibration PNGs retain their recorded SHA-256 values.
- No Core runtime, public asset, server, shared authority, package-lock,
  migration, SQL, Render, Supabase, deployment, hosted, or production path is
  present in the source diff.

## Remaining gates

- Claude must narrow-review the exact source commit for Core fidelity,
  explicit current/proposed labeling, member/public representation,
  contain-only pixels, safe fallback, responsive fidelity, and suitability for
  founder decisions.
- Samuel must decide A-E explicitly.
- Batch 1 remains blocked.
- Calibration and Batch 0 assets remain private and non-public.
- Core runtime imagery remains blocked on Core acceptance,
  media-commerce integration acceptance, exact repository ownership, and the
  selected founder policy.
- Publication, deployment, hosted writes, managed SQL, and production mutation
  require Samuel's current explicit approval.

Stop after this handoff. Do not begin Batch 1, edit Core, publish, deploy, or
mutate production.
