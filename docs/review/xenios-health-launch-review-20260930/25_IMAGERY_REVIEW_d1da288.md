# Claude independent review: product imagery `d1da288` (Batch 0 at `184d820`) and media-commerce decoupling `b38db0a`

## Identity

- **Fetched:** once, 2026-10-01 ~09:40 CT.
- **Imagery branch** `codex/xenios-product-imagery-20260930`:
  - **Tip:** `d1da2882f282f588609406f98d79f75993848be0`, tree `e60285b588be734dbbdc74a1f4b87d4116303e6e`.
  - **Batch 0 render commit:** `184d820`. Pixels and manifests are identical at `d1da288`.
  - **v3 rebuild:** `b449a46`.
  - **HL-11 accounting:** `8ec70f2`, then `d1da288`.
  - **Merge base with core:** `49234f8`. Outside its own paths the branch is byte-identical to that ancestor, so no
    runtime file changed.
- **Media-commerce branch** `codex/xenios-media-commerce-decoupling-20261001`:
  - **Tip:** `b38db0ae2ee0c679ec2eeb31b324f6204669dfb7`, tree `28b26619…`.
  - **Runtime:** `f453d7e`.
  - **Merge base:** `67d75c9`. It is **not merged** into core, and its only overlap with core is `.xenios` records.
- **The founder visual prototype** landed during this review (`c0373b7`). A focused check is in the addendum.

**Method:**
- Claude extracted all 37 committed images, verified their bytes, and viewed the contact sheet and the key renders.
- Three read-only lenses: Batch 0 per-asset, coverage/identity/truth, and media-commerce. Each A or B claim had an
  adversarial skeptic. Results are in `hl12/8f24082_lens_findings.json`, lenses `img-*`.
- Categories: **A** must fix before public publication; **B** should fix before launch; **C** polish or later.

## Verified facts

**Publication safety:**
- `client/public/research/products/` holds only `.gitattributes`.
- The ten pre-v3 WebPs are under `docs/product-imagery/evidence/pre-v3-nonapprovable/`, and the 25 Batch 0 PNGs under
  `…/batch0-render-candidates/`. All carry `publicPath: null`.
- **0** runtime references in `client/src`, `server`, `shared`, `client/public`, `client/index.html` or `config`.

**Integrity:**
- **25/25** recorded output SHA-256 values equal the committed bytes, and all 37 images match their filename hash.
- All 25 compiled renderer prompts re-hash to their recorded `rendererPromptSha256`.

**Coverage and identity:**
- Coverage has **424 rows**: invariants 426 → 424, 2 superseded, 0 approved, 0 public, 0 price or business-state
  fields.
- All 424 coverage `mov_` keys equal core `8f24082`'s 424 variant ids. The 423 customer target excludes the FedEx
  shipping row.
- Hexarelin 5 mg = **GRP-0426** and Oxytocin 10 mg = **GRP-0425**; GRP-0402/0407 are forward aliases only. There
  are 22 Featured aliases and 0 superseded owners.

## Prior findings

| Id | Status |
| --- | --- |
| IMG-01 | **CLOSED** |
| IMG-ID-01 | **CLOSED** |
| IMG-ID-02 | **CLOSED** for coverage. The pinned reconciliation blob differs from core's (see IMG-INT-01). |
| IMG-ID-03 / TRUTH-05 | **PARTIAL.** The hand-copied journey class is gone, and state is caller-supplied, beating any exact asset. But no adapter maps core pathways to the presentation states yet (IMG-INT-02, P3). |
| IMG-ID-04 | **CLOSED.** Hashes are LF and blob-based, and eol=lf is set. |
| IMG-ID-05 | **OPEN (P3).** Three exact-media authorities. |
| TRUTH-03 | **CLOSED.** 25 sanitized, class-only payloads, validated. |
| TRUTH-04 | **PARTIAL (P3).** Care-only classes still have renders, and the integrator doc omits the state branch. |
| TRUTH-06 | **PARTIAL.** Supplements are now classified by data, but render 16 fabricates packaging. |
| TRUTH-07 | **OPEN (P2).** Core `DiagnosticsExperience.tsx:69` still says "Diagnostics partner". The page also has "Partner access", an affiliate CTA and a price row. There is no Mito Health card and no imagery handoff for it. |
| INFRA-02 | **OPEN (P3).** No gate runs the imagery validators. |
| INFRA-03 | **CLOSED** |
| INFRA-04 | **PARTIAL (P3).** `content/` is not scanned, and `client/public` is checked by exact hash only. |

## Batch 0 decision

**Usable only inside the PRIVATE founder prototype, and only where marked acceptable. Nothing is approved for public
publication.**

| Decision | Assets |
| --- | --- |
| **Acceptable for the private prototype** | 01 lyophilized vial, 02 liquid vial, 03 injectable vial, 05 nasal spray, 07 capsule bottle, 10 troche box, 11 cream pump, 12 gel tube†, 14 supplement bottle†, 15 supplement tub†, 23 quote-only, 25 shipping‡ |
| **Needs change** | 04 solution bottle (cosmetic toner, serves claim-bearing names), 08 tablet bottle (identical to 07/14), 13 serum pump (specific package for a named serum), 17 accessory pack (invents two vials†), 18 syringe supply (food-pouch vocabulary; should take the held visual), 20 neutral identity, 22 held (same grammar as 20 and 24) |
| **Reject** | **16** supplement retail unit and **19** packaging unverified (**A**: both fabricate a retail carton and jar for marked third-party and Rx rows, such as Pregnyl, a vial kit, and Kyzatrex, capsules). **06** oral liquid (B: an amber oral tincture bottle assigned to a Research reconstitution diluent). **21** Care (B: a furnished in-person consultation lounge implies a physical clinic). **24** coming soon (B: a lidded canister is a packaging cue for Superpower/Mito service offerings, not the text-led treatment). **09** ODT (C: drawn as a cosmetic cream jar). |

† These classes have **zero coverage rows**, so the lane's own gate can never approve them.
‡ The shipping row is excluded from customer exposure.

## Global art direction: settle before Batch 1 (B, confirmed)

1. **Palette and props (B0-ART-PALETTE, IMG-B0-03, B0-ART-01).** The set locks a deep-green accent, warm-white
   seamless backgrounds, travertine, and live botanicals: 22 of 25 frames have leaves or plants. Your direction is a
   near-black/taupe hero, an organic metallic/liquid language, ivory surfaces and a restrained purple-to-teal accent;
   the site tokens already encode black plus purple→blue→teal. Botanicals also imply a natural or plant origin for
   synthetic peptides and 503A Rx compounds.
2. **Consistency (B0-ART-CONSIST).** Subject height ranges from about 35% to about 70%. Camera height and gobo
   lighting vary. One frame is an interior and one is a sculpture. The set reads as clean-beauty stock, not premium
   research.
3. **Class collapse (B0-CLASS-COLLAPSE).** These classes collapse into each other: 02≈03, 07≈08≈14, 09≈15, 11≈13,
   16≈19 and 20≈22≈24. The taxonomy adds little visual information, and Rx tablets look like supplements.
4. **Hard-coded appearance (IMG-B0-02 / B0-TRUTH-COLOR).** Class subjects specify a "white lyophilized cake" for 112
   rows, including the blue GHK-Cu rows, and a "colorless liquid" for colored injectables.
5. **Provenance (B0-PROV-01, P3).** Every PNG embeds a signed **C2PA** manifest naming ChatGPT/gpt-image, signed by
   OpenAI. The receipts record the model as `not_exposed_by_tool`. Capture the C2PA claim (generator, instance id,
   timestamps) before any approval, because a WebP derivative strips it. Job 19's receipt time is about 10 minutes
   after its signed creation time; explain that.

**Recommendation.** Before Batch 1, render a small calibration set of five or six images:
- one vial;
- one bottle;
- one topical;
- one Care treatment;
- one held/coming-soon state treatment.

Use your palette, a fixed camera, fixed scale and lighting, and no botanicals. Lock it, then batch.

## Media-commerce decoupling (`b38db0a`): PARTIAL

**PASS (MC-11):**
- `selectCartProduct` no longer reads media;
- every non-image gate is preserved (price, commerce inputs, domain readiness, audience);
- unknown inputs fail closed;
- workflow mode, pathway, quote, payment, fulfillment and Early Access eligibility were already image-independent.

**MC-01 (B, P2, confirmed).** The claim is overstated:
- a **failed Product Control media read**, or a concurrent media edit, still decides product existence and catalog
  inclusion;
- the media table is read inside the same `Promise.all` as the products, and any error throws;
- `detailSnapshotToken` includes media and drops the product on a mismatch;
- this applies to the member catalog and to the shared reader used by Early Access and pricing.

Fix: read media best-effort, take it out of the stability token, and add tests.

**P3s (downgraded):**
- **MC-02:** the SQL candidate is unregistered, and its `20261001060000` timestamp sorts inside the HL-12 chain.
- **MC-03:** the TypeScript and SQL halves must deploy together.
- **MC-04:** Product Control media is shown unconditionally, entrenching a second display authority.
- **MC-05:** the persistent-cart SQL does not check activation or reviewed holds; it is pre-existing, and the cart is
  not routed.
- **MC-06 to MC-10:** governance-function forking, readiness count drift, stale proofs, customer-facing admin copy,
  and a global binding-key limit.

## Integration readiness

- **IMG-INT-01 (B, P2, confirmed).** The imagery tooling cannot regenerate against core `8f24082`.
  `buildIdentityCrosswalk` throws "Missing historical Product Control binding for GRP-0402", because core moved
  0402/0407 into `supersededBindings`. `verify.mjs` and the test hard-code 420/419, and the reconciliation input is
  pinned to an older blob.
- **P3:**
  - IMG-INT-02: no adapter maps core pathways to presentation states;
  - IMG-INT-03: the precedence tests are vacuous;
  - IMG-INT-04: the planned `/research/products/...png` prefix sits inside the SPA `/research/products/:slug`
    namespace, so a missing image returns 200 HTML;
  - IMG-P3-01: the 400 KB total budget would empty the registry, and the verifier admits PNG only;
  - IMG-P3-02: stale docs;
  - IMG-P3-05: the alt-text guard omits claim terms.

## Imagery disposition

| Item | Disposition |
| --- | --- |
| Batch 0 | **Private-prototype use only, per the asset table.** Reject 06, 09, 16, 19, 21 and 24 for any use beyond internal comparison. |
| Batch 1 | **Not yet.** Lock global art direction first with a five- or six-image calibration set (palette, props, scale, camera, state treatments, truthful class subjects). Then prepare Batch 1. |
| Media-commerce decoupling | **PARTIAL.** Fix MC-01 before merging; sequence the TypeScript and SQL halves. |
| Founder visual prototype | **Pushed during the review (`c0373b7`).** Focused check PASS on safety and data truth. Replace the untruthful #21/#16/#06 uses; see the addendum. |
| **Publication blockers** | A-class assets 16 and 19; zero approved assets; IMG-INT-01; MC-01; no runtime state adapter (IMG-INT-02); TRUTH-07 in core; C2PA provenance capture; your approval. |

## Addendum: private founder prototype (`c0373b7`, handoff `d7a53ab`, review dispatch `e13ca4b`)

This landed during the review. It got a focused check (structure, data truth and screenshots), not a full journey
review.

- **Structure and publication safety: PASS.**
  - It is a static preview under `docs/product-imagery/founder-preview/`, with its own build, serve and capture
    scripts under `scripts/product-imagery/`.
  - `git diff d1da288..e13ca4b` touches nothing outside `docs/`, `scripts/product-imagery/` and `.xenios/`, so the
    public tree is untouched.
  - The build record says `publicTreeTouched:false` and `deploymentAuthorized:false`.
  - Images are served from `docs/` by the preview's own server.
- **Data truth: PASS.**
  - 423 customer targets, from 426 → 424 → 423.
  - **No prices**: every row shows an honest withheld state ("Care pricing withheld", "Pricing not released").
  - Pathways: Care 242, Research 173, quote-only 2 (BAM15 and Syringes), held 1 (GRP-0422, held visual), and binding
    pending 5 (GRP-0421 and 0423–0426).
  - Superpower and Mito Health are intentional non-image "Coming soon" panels: no price, checkout, logo or
    partnership claim.
  - A persistent "PRIVATE FOUNDER PROTOTYPE" banner. Every card is labelled "Provisional class/state visual".
- **Visual direction: largely on brief.**
  - A near-black hero with an iridescent purple-to-teal liquid form, ivory surfaces and crisp black type.
  - The screenshots show the **product imagery clashing** with that UI: green botanicals and spa props against the
    purple-to-teal brand system. This visibly confirms GA-1.
- **Fix in the prototype now (truth rule: "Batch 0 only where truthful"):**
  - **All 242 Care rows use #21** (the in-person lounge, rejected B). It dominates the catalog and the Featured
    shelf.
  - **All 20 retail supplement units use #16**, which fabricates a carton plus jar (rejected **A**) and covers
    Magtein, UltraBiotic and others.
  - The acetic-acid diluent uses **#06**, the amber tincture bottle (rejected B).
  - Swap these for the neutral identity or state panels until truthful renders exist.
  - The lyophilized-vial render shows white powder for the blue GHK-Cu rows.
- **Verdict:** useful for founder design review now. Fix the three substitutions above, then lock the art direction
  before Batch 1. **The full journey and mobile review of the prototype is the next imagery review item.**
