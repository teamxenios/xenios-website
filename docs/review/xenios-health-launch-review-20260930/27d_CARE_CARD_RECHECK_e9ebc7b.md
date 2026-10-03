# Claude microscopic recheck: Care-card fidelity, imagery successor `e9ebc7b`

## Identity

- **Source:** `e9ebc7b7df44a8921dd4b64100590da51310ba9a`, tree `e9a7a5c5697bc9cdf85a69dd5b6fdb0f483f8fca`.
- **Evidence commit:** `55f7340d4e70d60156bb3919d07e2cdce47ac044` (tree `be6b80c8`).
  - Recaptured evidence.
  - It also edits `build-record.json`, but only reviewer-pin metadata.
- **Handoff:** `b3a60d2906c5e44eacd7f2150ec2c3c95dacc380` (tree `ec484854`). Records plus the correction note.
- **Lineage:** `ab4f832` → `790f1fc` → `3c83219` → `e9ebc7b` → `55f7340` → `6981b90` → `b3a60d2`.
- **Prior review:** `22ed742` (27c).
- **Source change since `de51543`:**
  - `preview.js`: the Care card branch and comparison copy.
  - `preview.css`: additive `.core-care-*` rules only.
  - The build, capture and test scripts.
  - Nothing outside imagery paths changed.
  - `catalog-data.json` and the calibration PNGs are byte-unchanged.
- **Founder decisions:** A–E remain unapproved; none is chosen here.

**Method.** Two independent browser probes of the exact checkout at all ten widths:
- **Care-specific:** 70 page loads covering cards, decisions, Care, products, featured, and the GRP-0001 and GRP-0073
  detail pages.
- **Regression:** 170 page loads.
- **Cross-check:** against Core `AssistedOrderPage.tsx:226-246` and `assisted-order.css:42`.
- **Raw data:** `imagery/27d_probe_care_e9ebc7b.json` and `imagery/27d_probe_regress_e9ebc7b.json`.

## Decision D: Care-card fidelity

| Check | Result |
| --- | --- |
| 1. GRP-0001 remains Care | Yes. `pathway care`, "Care pathway". |
| 2. GRP-0073 remains Care and packaging-unverified | Yes. `pathway care`; it is `representativeCanonicalIds.packagingUnverified` and uses the neutral unverified study. |
| 3. CURRENT CORE Care no longer uses research UI | Yes. `data-card-surface="assisted-order-care"`, `PROVIDER_REVIEW_REQUIRED`, `workflowMode provider_request`. |
| 4. No research quantity stepper | 0 across 60 target instances (both rows × current/proposed × pages × ten widths) and all 190 Care cards on every page. |
| 5. No Research Bundle copy | 0. |
| 6. No "Request availability" or "Select" | 0. |
| 7. provider_request / Care pathway preserved | Yes. |
| 8. Care copy and `/care` CTA match Core | The notice is verbatim Core: "This product requires provider review through Xenios Care and cannot be added to a research order request." "Continue through Care" links to `/care`. The button matches `.xenios-order-button`: #183d2d, pill radius, weight 750, 44 px minimum. |
| 9. Image-enabled Care cards change imagery only | Current and proposed text is identical at every width once the media chip is excluded, and the CTA is identical. |
| 10. Imagery changes no commerce state, pathway or authority | Yes. Same pathway, availability and action, and every authority flag is false. |

Detail pages for GRP-0001 and GRP-0073 show no stepper, no bundle copy and no "Request availability". They carry
the Core Care notice and a "Continue through Care" action.

**Minor, non-blocking.** Core's assisted-order Care card also shows:
- the raw family code eyebrow, which is a recorded Core inconsistency;
- a Basis fact;
- a Product details disclosure.

The preview shows a readable category and the Specification, Format and Price facts only. This affects neither the
pathway nor the image decision.

## Responsive and regression smoke

- **All ten widths:** 0 horizontal overflow and 0 broken images on both probes.
- **Product images:** 370 Care-probe and 650 regression-probe measurements, all `contain`, with 0 filter, blend,
  opacity, clip or overlay.
- **A, no regression:** the mark is visible through its `currentColor` mask at every width; the name is hidden below
  520 px; Sign In, Start Care and Menu follow Core's breakpoints.
- **B, no regression:** the decision-B code is unchanged.
- **C, no regression:** the only gradient is the PROPOSED `.accent-rule` on the decisions page, once per width.
- **E, no regression:** the decision-E code is unchanged.
- **Catalog:** 426, 424 and 423, with 423/423 rows. Source pixels are unchanged.
- **Approval flags:** the matrix has 0 approved rows, and all authority flags (including `founderDecisionsAccepted`)
  are false.

## Verdict

| Item | Result |
| --- | --- |
| Decision D faithfully represented | **YES** |
| A / B / C / E regression | **NO / NO / NO / NO** |
| UI fidelity, final | **PASS** |
| Prototype suitable for founder decisions | **YES** |
| A / B / C / D / E faithfully represented | **YES / YES / YES / YES / YES** |
| Batch 1 | **NOT READY** |
| Remaining must-fix before A–E | None |

**Why Batch 1 stays NOT READY.** It is no longer a UI-fidelity issue. Two things must happen first:
1. A–E must be decided. D and E set the target surfaces and the media slot.
2. Report 27's Batch 1 corrections must be applied:
   - the framing gate, re-rendering 03, 04 and 05;
   - the label policy;
   - the candidate list (#25 removed, #24 shown as a diluent vial, GHK-Cu opaque).

Earlier minors are carried, not re-reviewed: disclosure chevrons, packet D's "lift or scope" wording, and the
decision-B black button not shown in the current panel.
