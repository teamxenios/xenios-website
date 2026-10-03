# Claude final narrow review: imagery successor `de51543`

## Identity

- **Source:** `de515435965a641192d28a3246fd4b58eecf5f5b`, tree `ea056ad57f4b84a5db89b480519d25c1a8dfc81d`.
- **Evidence commit:** `e30cbe1c3db1cd2508857963e5463a3dd67d6ef3` (tree `699b345b`). Relative to the source it adds only
  evidence files and `FINAL_FOUNDER_PREVIEW_UI_FIDELITY_2026-10-02.md`.
- **Handoff:** `ab4f832e8bda7d1e64e4e97c2f22cbfe6a68f164` (tree `4bdf8ec8`); `.xenios` records only.
- **Lineage:** `797b064` → `e3c1a06` → `ecd9f69` → `de51543` → `e30cbe1` → `ab4f832`.
- **Prior findings:** `893e32c` (27b).
- **Scope:** no path outside `docs/product-imagery`, `scripts/product-imagery` or `.xenios` changed.
- **Founder decisions:** A–E remain unapproved proposals. Nothing here selects, records or recommends them.

**Method:**
- **Independent browser probe** of the exact checkout at all 10 widths: 170 page loads covering 14 views, the QA
  grid, and GRP-0066 and GRP-0422 detail pages. Raw data: `imagery/27c_probe_de51543.json`.
- **Three re-test lenses,** each with an adversarial verifier. All 6 verifier judgements agreed with the lenses'
  open/closed status; one tightened item 6 from CLOSED to OPEN-MINOR. Results: `imagery/27c_retest_de51543.json`.
- **Claude's own checks in source:**
  - catalog identity, comparing `catalog-data.json` between `797b064` and `de51543`;
  - calibration bytes;
  - gradient placement;
  - Core's storefront availability rules.

## Re-test of the six material findings

| # | Finding | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Xenios mark visibility and Core treatment | **CLOSED** | `.wordmark-mark` now matches Core declaration for declaration (`currentColor` mask of the byte-identical PNG, 34×15). Probe: the mark shows at every width, `rgb(14,14,14)`. The header mark region pixel-matches Core at 1440 and 390. The footer and both decision-A columns show it. |
| 2 | Mobile/tablet header and Core breakpoints | **CLOSED** | Probe at every width: ≥1280 full nav, Sign In and Start Care, no Menu. 1024 condensed four links, Sign In, Start Care and Menu. 768 and 834 Sign In, Start Care and Menu. <520 name visually hidden (1×1), with Sign In, Start Care and Menu always shown. Header 69 px everywhere. |
| 3 | CURRENT CORE `EarlyAccessProductCard`, including restrictive states | **OPEN, material, narrow** | See below. |
| 4 | Real packaging-unverified pair | **CLOSED** | GRP-0073 (HCG Pregnyl), one of the four real rows, is shown both without and with an image. GRP-0066/0068/0073/0079 now use the neutral unverified study, consistently across card, detail and QA. Its CTA inherits item 3. |
| 5 | Decision E: public none / member 4:3 / proposed 1:1 | **CLOSED** (minor wording left) | The current side is labelled source-verified per surface rather than "Observed". The public catalog shows no slot; member 4:3 contain is source-verified; proposed is 1:1 contain with the same pixels. |
| 6 | Core versus proposed copy on Home, Care, Account/Status | **CLOSED** (minor wording left) | Home, Care and Account are labelled "PROPOSED XENIOS HEALTH · PRIVATE PREVIEW" / "preview-authored, not Actual Core". Probe: 0 occurrences of "source-faithful" or "Core-converged". |

### The remaining material item: Care rows on the CURRENT CORE card

- **Restrictive states now pass.** Held, quote-only and pending render "Temporarily unavailable" with no quantity
  control and no action. That matches Core's `sellable` gate.
- **Care rows are wrong.** `coreCardPresentation` (`preview.js:64-74`) maps every Care row (242 of 423) to
  `AVAILABILITY_CONFIRMATION_REQUIRED`. Under the CURRENT CORE label that renders:
  - a research quantity stepper;
  - the Research Bundle quantity copy;
  - a black "Request availability" action.

  It sits directly under the row's own text "Not available for direct purchase."
- **Core never renders a Care row this way:**
  - `AVAILABILITY_CONFIRMATION_REQUIRED` exists only for founder-released research units whose sole gap is
    fulfillment (`storefront-view.ts:42-46, 317-323`).
  - Care/503A rows are provider-pathway by family.
  - Core's real Care card treatment is `AssistedOrderPage.tsx:232-244`: a provider-review notice and "Continue through
    Care", with no quantity control. It is visible in Claude's actual-Core capture
    `core-synthetic-catalog-order-request-cards-desktop-1440.png`.
- **Scope of the damage:**
  - It affects two of the six decision-D pairs (Care GRP-0001 and packaging-unverified GRP-0073) at all 10 widths.
  - The decision packet claims "exact action behavior".
  - The defect is identical on both sides of each pair, so it does not bias the image choice itself. But it labels
    an action Core doesn't render as CURRENT CORE. That is the same defect class as before.

**Smallest fix.** In `coreCardPresentation`, render Core's actual Care treatment:
- no stepper and no research action;
- Core's provider-review notice;
- "Continue through Care".

Alternatively, show Care rows outside the `EarlyAccessProductCard` comparison, labelled "Core does not render Care
rows in this card". Then update `founder-preview.test.mjs:569-578` and re-capture the cards view at all 10 widths.

## Minor items (non-blocking)

- **B.** The CURRENT CORE panel is Core's exact order button (#183d2d, 44 px, pill, 750) with CURRENT CORE wording,
  and the packet describes Core as mixed. Core's dominant black `.btn-primary` is not also shown in the current panel.
- **C.** **Closed.** The only gradient anywhere is one `.accent-rule` inside the PROPOSED half of decision C, once per
  width. The baseline home uses a flat `core-rule`.
- **A.** Below 520 px both names are visually hidden, which is truthful to Core. The proposed caption could say so.
- **Navigation.** The disclosure chevrons on For Individuals and For Practices are missing at 1024 px and wider; the
  item set and breakpoints are exact.
- **Packet D** still reads "lift or scope" without an explicit keep-current option. B, C and E now offer keep and
  adopt options.
- **E.** The Full catalog's no-media state is stated on the three-way page but not in the E panel itself, which does
  not say "only".
- **Account/Status.** The lead points to a status triptych that the three-way page does not contain.
- **Card typography.** The no-price line is ink at weight 500 (Core uses ink-mute), and `mono-label` is 600 (Core is
  500).
- **Labels.** The held, quote and pending page card pairs carry no CURRENT/PROPOSED labels.
- **Three-way page.** The column "B · CURRENT / OLD PREVIEW" would read better as "OLD PREVIEW".

## Preserved findings (re-verified)

- **Identity.**
  - 426 reviewed, 424 canonical, 423 targets; 423 unique rows, GRP-0364 excluded, QA grid 423/423.
  - `catalog-data.json` row changes since `797b064` are only Core `stateExplanation` text (423 rows) and the four
    packaging-unverified image reassignments.
- **Image pixels.**
  - 650 product-image measurements, all `contain` at 1:1 or 4:3.
  - 0 filters, blend, opacity, clip or overlay pseudo-elements, and 0 broken images.
  - Card, detail and QA thumbnail use identical sources, with no lookalike substitution.
- **Assets.** No rejected or Batch 0 asset. The six calibration PNGs are byte-identical (`e04c2e59` `e3681f63`
  `dd8510c7` `76c10c66` `36bc99f4` `77069db7`).
- **Synthetic evidence.** Member, account and order captures are local, made-up data, labelled `UI_PRESENTATION_ONLY`.
- **Authority.** Every authority and founder-approval flag is false. There is no pricing, publication, runtime wiring or
  commerce authority. The Research Bundle quantity copy is Core's verbatim text (`EarlyAccessProductCard.test.tsx:164`).
- **Ten-width evidence.** It is complete across 1440, 1280, 1024, 834, 768, 430, 390, 375, 360 and 320.
  - Receipt hashes and dimensions match the files.
  - Claude's probe independently finds 0 horizontal overflow and 0 broken images at every width.

## Verdict

| Item | Result |
| --- | --- |
| UI fidelity | **FAIL**: one narrow material item (Care rows on the CURRENT CORE card) |
| Prototype suitable for founder decisions | **NO for D** until the Care fix; A, B, C and E can be judged now |
| A | **YES** |
| B | **YES** (minor) |
| C | **YES** |
| D | **NO** (Care and packaging-unverified current cards show an action Core never renders) |
| E | **YES** (minor wording) |
| Batch 1 | **NOT READY** |
