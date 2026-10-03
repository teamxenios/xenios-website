# Final Care card fidelity correction

Date: 2026-10-03

Status: PASS - one bounded Decision D correction completed

## Exact inputs

- Prior imagery handoff: `ab4f832e8bda7d1e64e4e97c2f22cbfe6a68f164`
- Reviewed underlying source: `de515435965a641192d28a3246fd4b58eecf5f5b`
- Reviewed source tree: `ea056ad57f4b84a5db89b480519d25c1a8dfc81d`
- Claude final narrow review: `22ed742052c95688926a5c11ef3faff379673d45`
- Claude review tree: `7f0336dd7feb8576d3b3134022dcda4db5909ae4`

## Exact corrected source

- Source commit: `e9ebc7b7df44a8921dd4b64100590da51310ba9a`
- Source tree: `e9a7a5c5697bc9cdf85a69dd5b6fdb0f483f8fca`
- Browser evidence commit: `55f7340d4e70d60156bb3919d07e2cdce47ac044`
- Browser evidence tree: `be6b80c8d84b9116f67624efe95184174480aa60`
- Browser receipt SHA-256: `472fa7cf6da2f9ecf91f24c098e15c90fcdba520653b959f7f665c2985f5fce5`

## Only material UI change

The founder preview no longer maps Care rows to the Research
`AVAILABILITY_CONFIRMATION_REQUIRED` card state. Care rows now use the actual
Core assisted-order presentation:

- `provider_request` workflow
- `Care pathway` badge
- `Ask the Care team about pricing`
- provider-review notice
- `Continue through Care` linking to `/care`
- no Research quantity control
- no Research Bundle copy
- no Research-style `Request availability` CTA

The comparison states explicitly: `Core does not render Care products through
this Research product-card surface`.

The same dispatch is used for Current Core and Proposed. Proposed adds only the
existing private contain-only media slot. Its pathway, copy, CTA authority,
price state, and commerce behavior are byte-for-byte equal to the Current Core
card body.

No non-Care card state or founder decision changed. No Core source, canonical
founder decision, product-image asset, Batch 1 state, publication state,
runtime integration, deployment state, hosted system, or production system was
modified.

## Exact Care witnesses

- `GRP-0001` remains Care, uses `provider_request`, and is compared through the
  assisted-order Care presentation.
- `GRP-0073` remains Care plus `packaging_unverified`. Its proposed column keeps
  the reviewer-directed neutral calibration-06 media and does not gain Research
  commerce behavior.

For both witnesses and both columns, browser evidence records:

- quantity controls: `0`
- Research Bundle occurrences: `0`
- Request availability occurrences: `0`
- CTA: `Continue through Care`
- CTA href: `/care`
- current/proposed content match: `true`

## Ten-width screenshot matrix

| Width | Product-card / Care comparison | Founder decisions |
| ---: | --- | --- |
| 1440 | `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-desktop-1440.png` | `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-desktop-1440.png` |
| 1280 | `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-desktop-1280.png` | `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-desktop-1280.png` |
| 1024 | `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-tablet-1024.png` | `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-tablet-1024.png` |
| 834 | `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-tablet-834.png` | `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-tablet-834.png` |
| 768 | `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-tablet-768.png` | `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-tablet-768.png` |
| 430 | `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-mobile-430.png` | `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-mobile-430.png` |
| 390 | `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-mobile-390.png` | `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-mobile-390.png` |
| 375 | `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-mobile-375.png` | `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-mobile-375.png` |
| 360 | `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-mobile-360.png` | `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-mobile-360.png` |
| 320 | `docs/product-imagery/evidence/ui-convergence/corrected-preview/product-card-comparison-mobile-320.png` | `docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-decisions-mobile-320.png` |

Machine-readable receipt:

`docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-preview-browser-evidence.json`

The complete run contains 144 captures, 130 responsive-matrix captures, all ten
requested widths, 423/423 QA identities, zero broken images, zero severe console
messages, zero failed responses, zero boundary violations, zero truncated
screenshots, zero unstable layouts, and zero horizontal-overflow assertions.

## Regression results

- `node --test <all scripts/product-imagery/*.test.mjs>`: PASS, 32/32
- `node scripts/product-imagery/verify.mjs`: PASS
  - 426 reviewed source rows
  - 424 canonical rows
  - 423 target-exposed rows
  - 25/25 Batch 0 rendered and preserved
  - 0 public assets
- `npm run verify:no-em-dash`: PASS, 1338 source files, 0 violations
- `node scripts/agentic/xenios-os.mjs validate`: PASS
- `git diff --check`: PASS

Closed-area checks remained green for the visible Core mark, responsive header,
Decision B CTA comparison, Decision C accent containment, packaging-unverified
identity, Decision E labels, Current Core versus Proposed copy separation,
identical media source pixels, contain-only product media, broken-image count,
and horizontal overflow.

## Authority boundary

A-E remain `approved: false`. This correction grants no founder approval and no
image, catalog, price, Product Control, commerce, integration, publication,
deployment, managed SQL, hosted-write, or production authority. Batch 1 remains
blocked. No Claude request was sent.
