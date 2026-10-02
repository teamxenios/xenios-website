# Founder UI decision packet

Purpose: let Samuel decide five production directions from a private prototype
that now uses the actual Core UI language.

This packet does not approve a design, image, catalog, price, Product Control
binding, runtime integration, publication, deployment, hosted write, managed
SQL change, or production mutation.

## Review these side by side

Primary full-page evidence:

- `docs/product-imagery/evidence/ui-convergence/corrected-preview/three-way-comparison-desktop-1440.png`
- `docs/product-imagery/evidence/ui-convergence/corrected-preview/three-way-comparison-mobile-390.png`
- `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-desktop-1440.png`
- `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-tablet-834.png`
- `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-mobile-390.png`
- `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-mobile-320.png`

All ten widths are present in the same evidence directory.

Current Core references used by the comparison include actual public renders
and exact-source synthetic member catalog, detail, account, order-history, and
order-detail renders at 1440 and 390:

- `docs/product-imagery/evidence/ui-convergence/core-reference/`
- `docs/product-imagery/evidence/ui-convergence/core-synthetic-c0e25c73/synthetic/captures/`
- `docs/product-imagery/evidence/ui-convergence/core-account-synthetic-c0e25c73/`

The synthetic member and account renders are `UI_PRESENTATION_ONLY`. The
account review document intentionally bypasses authentication and injects
repository-owned fixtures. None of these captures prove authentication, live
APIs, Product Control, pricing, availability, payment, or fulfillment.

The complete structured comparison is
`docs/product-imagery/UI_CONVERGENCE_THREE_WAY_MATRIX_2026-10-01.json` with 207
rows, including all 111 material mismatches.

## Decisions that require Samuel

### A. Header brand

- Current Core: mark plus `Xenios`.
- Proposed Health experience: mark plus `Xenios Health`.
- Decision needed: retain the global Core name or approve a Health-specific
  display name and its scope.

### B. Primary action system

- Current Core: dominant public Clarity uses black rectangular actions, but the
  assisted-order island still uses green pills.
- Proposed: black rectangular primary actions with outlined or underlined
  secondary actions everywhere in the Health experience.
- Decision needed: approve convergence and define whether any green-pill
  exception remains.

### C. Purple-to-teal use

- Current Core: flat purple is the active Clarity accent; teal exists as a token
  but no routed global gradient system is authoritative.
- Proposed: a thin divider, focus/highlight, or small emphasis only. No giant
  gradient headline and no image recoloring.
- Decision needed: approve the restrained accent and the surfaces where it may
  appear.

### D. Public product imagery

- Current Core: public Early Access and assisted-order product cards are
  text-only. Optional media exists on gated member surfaces.
- Proposed: public catalog and product detail may show an approved image, with a
  truthful no-image fallback when approval is absent.
- Decision needed: lift or scope the current public no-photography policy.

Evidence:

- `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-desktop-1440.png`
- `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-mobile-390.png`

The comparison includes Research, Care, held, quote-only, and
packaging-unverified states.

### E. Canonical media shape

- Current Core member media: optional 4:3 slot with `object-fit: contain`.
- Proposed future Product Control media: canonical square 1:1 slot with
  `object-fit: contain`, identical source pixels on card and detail, and no
  filter, vignette, tint, or hidden crop.
- Decision needed: retain 4:3, adopt 1:1, or define a separate approved mapping.

Evidence:

- `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-detail-comparison-desktop-1440.png`
- `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-detail-comparison-mobile-390.png`

## Items that do not require another visual-direction decision after A-E

If Samuel makes A-E explicit, the following are implementation and verification
work rather than new design choices. They still require exact task/path
ownership, Core integration acceptance, tests, and the normal production gate.

- Apply the chosen brand string only in the approved shell and route scope.
- Replace remaining legacy CTA instances with the approved button primitives.
- Add the approved accent token and enforce its limited usage in component tests.
- Define a single Product Control media DTO and approved/no-image state.
- Use one canonical media reference on card and detail.
- Enforce `object-fit: contain` and prohibit CSS image grading, vignette, and
  crop rules.
- Implement the selected aspect ratio and responsive slot dimensions.
- Add safe fallback behavior without selecting a lookalike or alternate product.
- Add accessibility copy, intrinsic dimensions, lazy loading, and layout-shift
  tests.
- Re-run responsive, console, network-boundary, and visual regression evidence.
- Normalize mechanical defects already recorded in Core, such as undefined
  `body-xs`, after the owning Core lane accepts the exact change.

## Still blocked after the five decisions

The founder choices alone do not authorize any of the following:

- Batch 1 rendering.
- Approval or publication of the six calibration studies.
- Reuse of a provisional calibration study as a final exact product image.
- Core runtime wiring.
- Catalog or Product Control acceptance.
- Price or availability release.
- Media-commerce integration.
- Deployment, hosted writes, managed SQL, or production mutation.

Before any of those steps, the corrected successor still needs the registered
Claude review, exact repository ownership, and the gate specific to that action.
