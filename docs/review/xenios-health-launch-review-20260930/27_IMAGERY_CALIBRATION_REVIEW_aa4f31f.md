# Claude independent review: imagery calibration `aa4f31f` and corrected founder prototype `8b06da5`

## Identity

- **Calibration source:** `aa4f31f9b650e68a7c7c2c749f00417d20607665`, tree `354ddc3aff94de3307dfd09df03dde87066799ea`.
- **Handoff tip:** `8b06da560978c8c4b1ce325da8813373bffbc845`, tree `0d6d346558ab2714aa54adffbdab5b1494c48db8`.
  - `8b06da5` changes only `.xenios` records.
  - From `2100636` to `8b06da5`, the only non-record, non-doc changes are under `scripts/product-imagery/`.
- **Renders checked:** the six calibration PNGs and the contact sheet (`017cffad…`) were extracted from `aa4f31f`. All
  are 1254×1254, and every byte hash equals its filename hash and its committed receipt.

**Method:**
- Claude viewed all six renders at full resolution, plus the contact sheet.
- Claude measured framing with a PIL edge-mask bounding box and the floor/wall transition in the left background
  column. Results are below and in `imagery/27_calibration_framing.json`.
- Claude read prototype `catalog-data.json` at `8b06da5` and checked every row programmatically.
- Claude viewed the products, Care and catalog-review screenshots committed at `aa4f31f`.

## Framing measurements

| Study | Subject height (% of canvas) | Top margin (px) | Floor/wall line (px, left) | Result |
| --- | ---: | ---: | ---: | --- |
| 01 vial | 65 | 204 | 653 | Reference |
| 02 bottle | 68 | 224 | 721 | Reference |
| 03 topical | **78** | 124 | **807** | Over scale; lower camera |
| 04 Care state | 67 (79 wide) | 113 | **480** | Markedly steeper camera |
| 05 restrictive | **85** | 106 | 724 | Over scale; crop crowded |
| 06 unverified | 74 | 122 | 859 (soft) | Within tolerance |

The frozen lock says the subject occupies about 68% of canvas height under a fixed 20° camera. Claude's tolerance is
61–75% height, with a horizon consistent with 01/02. The framing results above are measured. The material, palette and
truth judgements in the next section are visual.

## Per-study decisions

| Study | Decision | Basis |
| --- | --- | --- |
| **01 lyophilized vial** | **ACCEPTABLE** | On palette. Brushed-metal cap with a faint purple-to-teal rim, and a blank matte-ivory label. Smoked glass hides the contents, so it shows no white-powder or colour claim. No text, logo or claim. Framing is on lock. |
| **02 capsule/tablet bottle** | **ACCEPTABLE** | Matte graphite form with a blank ivory label. The accent is restrained, barely visible on the shoulder. No invented branding or count. Framing is on lock. |
| **03 topical** | **NEEDS CHANGE** | Truth-safe: blank label, generic flip-cap tube, no botanicals. However, at 78% height with a lower camera it reads about 20% larger than 01/02 in the grid. Re-render at the 01/02 framing. |
| **04 Care state** | **NEEDS CHANGE** | **Concept accepted.** Two graphite arches joined by a brushed bridge with the accent edge is an abstract pathway. It has no clinic, room, people, cross or medical cue. However, the camera is clearly higher than the other five: the tops of the objects are visible and the horizon sits at about 480 px versus 650–720 px. This tile backs **242 of 423** prototype slots, so it must match the shared camera. |
| **05 held / quote-only** | **NEEDS CHANGE** | **Concept accepted.** A framed slab with a banded ivory seal reads "held" without a padlock, warning sign or invented product. However, at 85% height the base nearly touches the crop. Re-render at about 68%. It serves both held and quote-only states, so the UI state label stays mandatory; the prototype already shows it. |
| **06 unknown / unverified packaging** | **ACCEPTABLE** | An abstract disc, ivory quadrant and brushed arc. It shows no container, carton, jar, dropper or third-party trade dress, so it does not imply any packaging. Graphite stone with metal, and no greenery, reads as design object rather than spa. |

## Global verdict: **ART DIRECTION LOCKED**

The visual language is now on brief and truth-safe. This answers report 25's GA-1/GA-2:
- palette: near-black, deep taupe and warm graphite;
- material: restrained brushed metal with ivory highlights;
- accent: a subtle purple-to-teal edge;
- lighting: warm upper-left key, controlled down-right shadow;
- minimal props;
- labels: blank, with no text, logo, dosage or claim;
- states: Care, restrictive and unverified as abstract sculptural vocabulary;
- **absent:** leaves, botanicals, spa, clinic, laboratory, people, crosses, third-party marks, prices or availability.

Lock fidelity is incomplete: three of six studies miss the fixed camera or scale. That is an execution correction, not
a change of direction (see Batch 1 below). The visual lock is a review decision only. It grants **no** publication,
runtime, Product Control or exact-asset approval.

## Corrected founder prototype at `8b06da5`

| Check | Result |
| --- | --- |
| Rejected Batch 0 assets selected | **0.** Every one of 423 rows uses a `calibration-0x` asset, and `batch0VisualSlots=0`. |
| All 423 slots present | **Yes.** 423 rows and 423 unique `canonicalId`s; GRP-0364 (shipping) excluded; 0 rows missing src or hash; 0 fallback-only. |
| Published publicly | **No.** `client/public/research/products/` holds only `.gitattributes`. There are 0 references to calibration or Batch 0 assets in `client`, `server`, `shared`, `package.json` or `vite.config.*`. Authority flags: `runtime`, `publication`, `commerce`, `pricing` and `deployment` are all `false`. |
| Fake prices | **None.** Price strings are only: Care pricing withheld (242), Price omitted from static preview (173), Price on request (2), Pricing not released (6). No numeric or `$` value appears in any pathway object. |
| Fake pathway states | **None.** Care 242, Research 173, quote 2, held 1, pending 5. This matches the HL-11 accounting. Held, quote and pending rows are unbound, with CTAs "View hold details", "Request a quote" and "Request availability review". None is orderable. |
| Broken slots | **None** in the data. The lane reports 0 broken images across 45 captures; this was not re-executed by Claude. |
| Care physical-clinic image | **None.** All 242 Care rows use the 04 abstract state. |
| Invented supplement packaging | **None.** All 20 supplement-retail rows use 06 (unverified). The 15 own-line research capsule rows use the blank 02 bottle form. |
| Tincture for the diluent | **None.** GRP-0362 Acetic Acid 0.6% uses 06. |
| GHK-Cu as white powder | **None.** The six lyophilized GHK-Cu rows use 06. GHK-Cu capsule (0248) uses the 02 bottle, GHK-Cu topical (0387) the 03 tube, and Care GHK-Cu rows the 04 state. No row shows contents. |
| UI labelling | Every card carries a "Provisional class visual" or "Provisional state visual" badge, and the banner reads "Provisional imagery – no publication or transaction authority". |

**Prototype verdict: PASS for private founder review.** It is truthful and safe as a private prototype. It is not
publication, runtime or Product Control evidence.

## Batch 1: **NOT READY**

These are the smallest global corrections. The first three are rendering and planning work in the imagery lane only.

1. **Framing gate:**
   - Re-render 03, 04 and 05 to the 01/02 framing: about 68% subject height and the same 20° camera, so the floor/wall
     line falls in the 01/02 band.
   - Add a measured framing check to the render receipts (subject-height %, margins and horizon band) as an acceptance
     condition for every Batch 1 output.
   - This is required because the generator demonstrably drifts.
2. **Label policy before rendering the 22 lyophilized-vial jobs.**
   - Under the blank-label lock, the 22 vial jobs (#1–#22) would be near-identical to `calibration-01` and add no
     product identity.
   - Decide one of two options: (a) reuse the class render and drop those jobs, or (b) render one blank master and
     **composite** the verified name and strength deterministically. Never let the generator write label text.
   - Either way, Batch 1 outputs stay class visuals unless supplier packaging is verified.
3. **Two candidate corrections:**
   - **#25 Annatto Pro 125 (GRP-0366):** a third-party retail unit. Rendering it would invent third-party packaging, so
     remove it from Batch 1 and keep 06.
   - **#24 Acetic Acid 0.6% (GRP-0362)**, class `oral_liquid_neutral`: render only as a sealed sterile-diluent vial form,
     never a dropper, tincture or oral bottle, or keep 06.
   - **GHK-Cu #6/#7** must keep opaque, contents-hidden glass.

Corrections 1–3 do not need new core work. **Batch 1 rendering authorization is Samuel's decision.** Claude's verdict
is only that the batch is not ready to render as currently planned.

## Publication blockers (unchanged by this review)

Nothing here approves publication. Before any image goes public, these remain:
- an exact-asset or class-visual policy decision for each product;
- independent per-asset approval;
- provenance: an official C2PA validator pass, since the repository decoder is structural only;
- HL-11 independent acceptance and a bound `acceptedSha`;
- MC-01 media-commerce integration acceptance;
- a shared-UI ownership lease;
- Product Control runtime binding;
- Samuel's explicit publication approval.
