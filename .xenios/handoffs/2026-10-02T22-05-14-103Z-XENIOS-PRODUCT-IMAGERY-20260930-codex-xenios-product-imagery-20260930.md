# Final founder-preview UI fidelity correction

## Status

The one bounded founder-preview correction is complete and ready for handoff.
All five founder decisions are now faithfully judgeable, but all five remain
unapproved. No founder choice is recorded or inferred.

Stop after this handoff. Do not begin Batch 1, render product images, edit Core,
wire runtime imagery, publish, deploy, contact Claude automatically, perform a
hosted write, apply managed SQL, or mutate production.

## Exact source

- Branch: `codex/xenios-product-imagery-20260930`
- Corrected source commit: `de515435965a641192d28a3246fd4b58eecf5f5b`
- Corrected source tree: `ea056ad57f4b84a5db89b480519d25c1a8dfc81d`
- Pushed to origin: yes
- Reviewed source: `797b064d9c07012b95133e588222b2b2293ff341`
- Reviewed source tree: `e5108ca4e038e420b0effe680f7f815db05002a8`
- Reviewed records commit: `8dcba8ff14ce553445bbb28ca430dabe667c73e0`
- Claude review: `893e32c93031705ebbe94531a0d9a8110967fb16`
- Claude review tree: `e5053ca2de75082e8161acbd1f2136e014c2a58c`
- Prior verdict addressed: `FAIL_NARROW`

The browser receipt independently pins the corrected source commit and tree.

## Corrections completed

1. The Xenios mark is a visible `currentColor` CSS mask, matching the Core
   treatment. Decision A shows the same mark for Current Core and Proposed
   Xenios Health without inventing a logo.
2. The header now keeps the mark, Sign In, and Start Care visible at all ten
   widths. The name hides below 520px, condensed navigation occupies
   1024-1279px, full navigation begins at 1280px, and Menu remains below 1280px.
3. The Current Core card uses the source-verified `EarlyAccessProductCard`
   anatomy: mono category and specification, Core title weight and leading,
   6px body gap, 16px padding, responsive full-width black actions where
   allowed, and no action or quantity control for held, quote-only, or
   binding-pending states. Proposed cards preserve the exact same non-image
   content and add only one media slot.
4. The packaging-unverified comparison uses authoritative witness `GRP-0073`,
   not binding-pending `GRP-0424`. Its proposed side uses the reviewer-directed
   neutral calibration-06 asset, SHA-256
   `77069db7b8324baf4780b37c585926a92b432e2fef24cbcdf019d38782cd7d8b`.
   No package form or third-party packaging is fabricated.
5. Decision E separates public Core no-image behavior, optional signed-in
   member 4:3 contain behavior, and proposed 1:1 contain behavior. The member
   panel is labelled `SOURCE-VERIFIED` and `NOT LIVE/OBSERVED RENDER`. The 4:3
   and 1:1 studies use the same URL, file, SHA, and source pixels.
6. Home, Care, and account/status copy is labelled as preview-authored Proposed
   Xenios Health material. Actual Core remains a separate captured or
   exact-source synthetic evidence column.
7. Decision B preserves the exact Current Core assisted-order sample:
   `#183d2d`, 44px, pill radius, and Inter Tight 750. It is not called Legacy.
8. The purple-to-teal treatment appears only inside the unapproved proposed C
   column. No ordinary Core-reference surface inherits it.

## A-E judgeability

| Decision | Judgeable | Approval state | Evidence boundary |
| --- | --- | --- | --- |
| A. Header brand | Yes | `approved: false` | Visible Core mask and exact responsive name treatment versus labelled Health name proposal |
| B. Primary action language | Yes | `approved: false` | Exact Current Core assisted-order sample versus labelled black rectangular proposal |
| C. Purple-to-teal accent | Yes | `approved: false` | Flat Current Core treatment versus isolated proposed gradient rule |
| D. Public product imagery | Yes | `approved: false` | Exact text-only Core card content versus the same card plus one proposed media slot |
| E. Canonical media shape | Yes | `approved: false` | Public no-image, source-only member 4:3, and proposed 1:1 are separately labelled |

No source file says selected, decided, or approved for A-E.

## Browser evidence

Machine-readable receipt:

`docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-preview-browser-evidence.json`

Receipt SHA-256:

`b253cd40e17fa81c132068310a31a7cd03c7956cec2324946f4a83b8fafdcbac`

Results:

- 144 full-page captures.
- 130 responsive-matrix captures.
- 13 responsive surfaces.
- Widths: 1440, 1280, 1024, 834, 768, 430, 390, 375, 360, and 320.
- 423 of 423 catalog IDs covered.
- 10 A-E decision captures.
- 10 exact card-comparison captures.
- 20 geometry-comparison captures.
- 10 full A/B/C triptych captures.
- 0 broken images.
- 0 horizontal overflows.
- 0 severe console messages.
- 0 failed local responses.
- 0 network-boundary violations.
- 0 truncated screenshots.
- 0 unstable layouts.

Key screenshots:

- `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-desktop-1440.png`
  - SHA-256 `8346bbff8ac5ba00f6c5bf18c8d8431e581d01d0f10acc3e134a90cb119c1891`
- `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-mobile-320.png`
- `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-desktop-1440.png`
  - SHA-256 `b61257e8222a7e7350f8bf758e6c09d36ea712fdcffc1c76eaef88e2d8986845`
- `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-mobile-390.png`
- `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-detail-comparison-desktop-1440.png`
  - SHA-256 `8f146a7f8b558abbccdb6a87e90eba83adbd7caba0521f63c6035d1384d1a83e`
- `docs/product-imagery/evidence/ui-convergence/corrected-preview/three-way-comparison-desktop-1440.png`
  - SHA-256 `a261190d52683e607a9f8eea50de46082958b69a7e4a53bdbf441b19357d64f3`
- `docs/product-imagery/evidence/ui-convergence/corrected-preview/three-way-comparison-mobile-390.png`

Responsive header evidence is present on every responsive capture. The ten
`home-*` captures provide the most direct header sequence. Home, Care, and
account/status captures provide the direct proposed-copy evidence.

The decisive desktop and mobile A-E, card, geometry, and triptych frames were
also inspected visually after the automated assertions passed.

## Verification

- `node scripts/product-imagery/capture-founder-preview.mjs`: pass, 144 captures,
  423/423 QA IDs, zero broken images.
- `node --test scripts/product-imagery/founder-preview.test.mjs`: 19/19 pass.
- `node --test scripts/product-imagery/*.test.mjs`: 31/31 pass.
- `node scripts/product-imagery/verify.mjs`: pass, 426 reviewed rows, 424
  canonical variants, 423 customer targets, 25 preserved private Batch 0
  renders, and zero public assets.
- `node scripts/agentic/xenios-os.mjs validate`: pass.
- `npm run verify:no-em-dash`: 1,338 source files scanned, zero violations.
- `git diff --check`: pass.

## Preserved boundaries

- 426 reviewed source rows, 424 canonical variants, and 423 customer targets
  remain intact.
- All 423 targets remain represented with `object-fit: contain`, identical
  card/detail/QA source identity, and no filter, saturation, vignette, tint, or
  forced crop.
- Rejected Batch 0 assets remain absent from selected slots.
- The 25 Batch 0 originals and six calibration files were not rerendered.
- Batch 1 remains render and publication unauthorized.
- No prices, public assets, Core edits, runtime wiring, or commerce authority
  were introduced.
- No Claude request or message was sent.
- No publication, deployment, hosted write, managed SQL, or production
  mutation occurred.

Wait for Samuel.
