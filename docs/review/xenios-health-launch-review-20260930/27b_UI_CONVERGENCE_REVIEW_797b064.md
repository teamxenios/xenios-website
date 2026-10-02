# Claude bounded review: imagery UI-convergence successor `797b064` (three-way)

## Identity

- **Reviewed source:** `797b064d9c07012b95133e588222b2b2293ff341`, tree `e5108ca4e038e420b0effe680f7f815db05002a8`.
- **Records and handoff:** `8dcba8ff14ce553445bbb28ca430dabe667c73e0`, tree `7540634d5abbfb2fa56b7d9b8cb81abc3a822d79`.
- **Earlier successor, also reviewed:** `516328c` (tree `769944ae`), with handoff `a13b2ab`.
  - From `516328c` to `797b064`, the preview code change is additive: a `view=three-way` page and more images on the
    core-evidence page.
  - It also adds a 207-row three-way matrix and six synthetic account/order captures.
  - No other preview view changed, so the five-lens findings on `516328c` carry forward. Each was re-confirmed in
    source at `797b064`.
- **Scope:** only imagery and records paths changed; no Core, runtime, public-asset, SQL or production path.
- **Baseline:** Claude addendum `ae5c410` (27a).
- **Founder decisions:** A–E remain **unapproved proposals**. This review chooses none of them and records none as
  decided.

**Method:**
- **Independent browser probe.** Claude ran the exact source in headless Chrome at all 10 widths (1440, 1280, 1024,
  834, 768, 430, 390, 375, 360, 320).
  - 162 page loads at `797b064` and 132 at `516328c`, covering all 15 views plus 4 detail pages.
  - Measured per image: computed `filter`, `object-fit`, blend, opacity, clip, mask, parent overlay pseudo-elements,
    overflow and broken images.
  - Also measured header, h1 and button styles, plus CURRENT/PROPOSED label counts.
  - Raw data: `imagery/27b_probe_797b064.json` and `imagery/27b_probe_516328c.json`.
- **Five read-only lenses**, each with its own adversarial verifier: Core fidelity, A–E labelling, member/media,
  state/identity, and responsive/inconsistencies.
  - Result: 12 material and 30 minor claims, 37 upheld. 31 of the 37 were upheld at the severity claimed; 6 were
    downgraded.
  - Full findings: `imagery/27b_lens_findings_516328c.json`.
- **Claude's own checks:** catalog identity and calibration bytes, the three-way matrix fields, the decision-packet
  wording, and the account/order receipts.

## What is now right (verified)

- **Shell tokens.**
  - White page, with Inter Tight and JetBrains Mono self-hosted and loaded.
  - Core colour tokens and `container-x` widths and gutters at every Core breakpoint.
  - 69 px sticky header; desktop nav labels and order identical to Core.
  - 4 px black and outlined buttons (52/60/64 px); home h1 76 px/800.
  - No black gradient hero, orb, pill system or gradient headline remains.
- **Image pixels (PASS, every width).**
  - 0 `filter`, blend, opacity, clip, mask, inset shadow or overlay pseudo-elements on any of 602–612 product-image
    measurements.
  - `object-fit: contain` everywhere, in 1:1 or 4:3 ratio boxes, on a neutral background.
  - Card, detail and QA thumbnail use the same `row.image.src` for all 423 rows, and every src hashes to its
    `outputSha256`.
  - The 4:3 and 1:1 comparison uses the same file (`calibration-01-vial` `e04c2e59…`).
  - No lookalike substitution across product classes.
- **Identity (PASS).**
  - Counts hold: 426 reviewed, 424 canonical, 423 targets. All 423 rows are unique, with GRP-0364 excluded and
    `catalog-data.js` deep-equal to the JSON.
  - The QA grid covers 423/423.
  - Assets: 0 Batch 0 or rejected assets, and the six calibration PNGs are byte-identical (`e04c2e59` `e3681f63`
    `dd8510c7` `76c10c66` `36bc99f4` `77069db7`).
  - Authority: 0 public assets, and every authority flag is false. There are no numeric prices and no
    commerce/runtime wiring.
- **Responsive evidence (PASS).**
  - 134 full-page captures; the 120-capture matrix covers all 12 surfaces at all 10 widths.
  - Every PNG's SHA-256, size and dimensions equal the receipt.
  - Claude's probe independently finds 0 horizontal overflow and 0 broken images at every width.
- **Three-way matrix (PASS on authority).**
  - 207 rows map Claude's 196 plus the 11 critic rows to A Actual Core / B Old preview / C Proposed.
  - All 207 rows carry `approved: false`; `founderDecisionsAccepted`, `claudeSuccessorAccepted` and every other
    authority flag are false.
  - Dispositions are "candidate correction requires exact successor review" (149), "founder decision required"
    (25) and "document and route to Core, no unilateral fix" (33). Nothing claims a fix or an approval.
- **Synthetic member/account/order captures.**
  - Local, loopback only, built from Core source `c0e25c73` (tree `1771d18b`), using fixture identities (for
    example `test.customer@example.invalid`).
  - Labelled `UI_PRESENTATION_ONLY`, with explicit `provesAuthentication`, `provesPricingAvailabilityOrCommerce` and
    `provesProductControl` all false. The PII scan is clean.
  - They come from Core's dev-only review harnesses, not routed pages. That is acceptable as presentation evidence
    only.

## Verdict: UI FIDELITY **FAIL** (narrow)

This is a large improvement. The parallel design system is gone, and the image-pixel, identity and evidence
requirements pass. But six material drifts remain, and four of them sit on the baseline the founder decisions are
compared against.

### Remaining material drift (all present at `797b064`)

1. **The brand mark is invisible everywhere** (header at every width, footer, and both sides of decision A).
   - The PNG is white-on-transparent.
   - Core paints it through a CSS mask with `background-color: currentColor` (`index.css:226-235`). The preview uses
     a plain `<img>` (`index.html:28,71`; `preview.js:253`).
2. **The phone and tablet header is wrong.**
   - Core always shows Sign In, Start Care and Menu, and visually hides the brand name below 520 px
     (`Navbar.tsx:120-126`; `index.css:1459-1466`).
   - The preview hides Sign In at 700 px and below (`preview.css:1590-1592`) and Start Care below 375 px
     (`:1599-1602`), and shows the name.
   - The condensed nav starts at 1160 px instead of Core's 1024 px (`:1530`).
   - This is exactly where a "Xenios Health" string would or would not appear on phones.
3. **The "CURRENT CORE" product card is not Core** (decision D and the card comparisons).
   - `currentPolicyCard` (`preview.js:52-64`) is the proposed card with the image removed.
   - It uses preview vocabulary that Core doesn't have: "Research access" / "View product", "Formulation held" /
     "View hold details", "Quote only" / "Request a quote".
   - It drops the research-use notice.
   - It gives **held and binding-pending** items a primary action, which Core's `EarlyAccessProductCard` deliberately
     never renders.
4. **The packaging-unverified example is wrong.**
   - The row labelled packaging-unverified is GRP-0424, which is binding-pending (`preview.js:216`). The real
     packaging-unverified rows are GRP-0066/0068/0073/0079.
   - It has no image-enabled counterpart.
   - Its fallback contradicts the same row's detail and QA image.
5. **Decision E's "current 4:3" side is an unrendered reconstruction labelled "Observed".**
   - The rendered "member" captures come from `MasterOfferingCatalogSurface`/`MasterOfferingDetail`, through a
     dev-only harness. Those components have **no media slot**.
   - The real 4:3 contain slot (`MemberCatalogExperience`/`MemberProductDetailExperience`,
     `/research/member/products`) is never rendered.
   - The 423-slot Full catalog has no product images today, and the packet never says so.
6. **Home, Care and Account/Status use copy and structure written for the preview**, under eyebrows such as
   "Core-converged", "source-faithful shell" and "Current Core route families".
   - Core home h1 is "Care and research products, clearly separated."; Care has a tab nav, a status card, and
     "How Care works"; the account portal anatomy is different.
   - None of this is labelled PROPOSED.

### Minor (fix with the material items; none blocks a decision on its own)

- **Typography:** page h1 and section h2 are one tier below Core's public `display-l`/`display-m`, with retuned
  clamps.
- **Drift-matrix overclaims:** rows 25, 26, 31, 33 and 34 at `797b064` (header actions, footer, panel radius,
  "accent only on proposal examples", "Core-style responsive grid") are not true of the preview.
- **Decision packet framing:** B, C and D ask the founder to "approve…" or "lift or scope…" without an explicit
  keep-current option, while A and E offer retain or adopt.
- **Decision B sample:** the current green pill is an approximation (#385f44 at 52 px versus Core #183d2d at 44 px)
  and is captioned "Legacy" before any decision.
- **Accent bleed:** a purple-to-teal bar appears unlabelled on the baseline home hero (`preview.js:96`), which bleeds
  decision C.
- **Label chips:** media labels cover 15–22% of the image at 4:3 and on phones, more on the 4:3 side.
- **Held/quote detail:** shows an enabled-looking black "Prototype action only" button.
- **QA grid pathway:** 30 approval-required rows are shown as "Research access".
- **Products filter:** clearing it fails (`pageSize` is out of scope at `preview.js:162`).
- **Caption:** the Early Access capture caption claims product cards, but it shows the password gate.
- **Footer, spacing, grid and forms:** the footer is a preview utility footer; there are small section-spacing and
  four-column grid differences; status forms use the legacy `input-field` rather than `clarity-field`.

## Founder-decision readiness

| Decision | Faithfully represented | Why |
| --- | --- | --- |
| **A. Xenios vs Xenios Health** | **NO** | The mark is invisible on both sides, and the phone lockup (name hidden in Core) is misrepresented. |
| **B. Mixed CTA vs black rectangular primary** | **YES** (minor fixes) | Both treatments are visible in the real shell. Core's live green order buttons are visible in the actual-Core evidence. Fix the pill colour and size and the "Legacy" caption. |
| **C. Current accent vs restrained purple-to-teal** | **YES** (minor fix) | The current flat `--pulse` is faithful, and the proposed restrained divider/focus treatment is clear. Remove the unlabelled bar on the baseline home. |
| **D. Text-only vs image-enabled public cards** | **NO** | The "current" card is not Core's public card, and it shows an action on held items. The packaging-unverified pair is wrong. |
| **E. Current 4:3 vs proposed 1:1** | **NO** | The geometry (same pixels, 4:3 versus 1:1, both contain) is faithful. But the incumbent is a reconstruction labelled "Observed", and the main catalog's current state (no media) is not shown. |

**Suitable for Samuel's decisions:** B and C can be judged now. A, D and E should wait for the fixes below.

## Must-fix before A, D and E are decided (smallest set)

1. **Brand mark and header.**
   - Render the mark exactly as Core does: a `currentColor` mask.
   - Port Core's header rules exactly: Sign In, Start Care and Menu always present; name hidden below 520 px;
     condensed nav at 1024 px.
   - Re-capture decision A at every width, current against proposed, including phones.
2. **Current card.** Make the CURRENT CORE card in D (and the card comparisons) a faithful mirror of Core's public
   `EarlyAccessProductCard`:
   - Core's own labels;
   - **no action on held or binding-pending items**;
   - the research-use notice.

   Keep the business state identical between the no-image and image-enabled columns.
3. **Packaging-unverified pair.** Use a real packaging-unverified row (for example GRP-0066) for both the no-image and
   the image-enabled variant, consistent with its detail and QA row.
4. **Decision E.**
   - Label the current side per surface: "4:3 contain on `/research/member/products` only; the Full catalog shows no
     media".
   - Render `MemberCatalogExperience`/`MemberProductDetailExperience` with synthetic media present and absent, or
     mark the panel "source-only".
   - Stop calling the reconstruction "Observed".
5. **Preview-written pages.** Either mirror Core's Home, Care and Account copy and structure, or label those pages
   "preview-authored / PROPOSED". Remove "source-faithful" and "Core-converged" claims where they aren't true.

## Batch 1: **NOT READY**

Batch 1 remains blocked:
- A–E are undecided (D and E fix the target surface and slot);
- the report 27 framing gate is still outstanding;
- the label-policy and candidate-list corrections are still outstanding.

No publication, runtime, Product Control or Core-change authority is granted by this review.
