# Addendum to report 27: founder preview UI fidelity against the actual core UI

## Why this addendum

Report 27 passed the corrected founder prototype at `8b06da5` for **truth and safety**:
- 423 slots;
- no rejected Batch 0 assets;
- prices withheld;
- no fake states.

It did not compare the prototype's **UI** with the real Xenios site. The coordinator observed that the preview had
drifted into a separate website design. This addendum tests that claim with evidence.

## Identity and evidence

**A. Actual core reference.** Claude captured it at runtime `c0e25c73` (records `8549011`).
- **Build:** a production build (`script/build.mjs`) served by `node dist/index.cjs` on `127.0.0.1` only.
- **Configuration:** signed out, `RESEARCH_PUBLIC=true`, and synthetic loopback-only Supabase configuration (an
  unreachable `127.0.0.1:9`). No real data and no credentials.
- **Captures:** headless Chrome, full page, at 1440 px (13 routes) and 390 px (9 routes). Files are in
  `imagery/27a_core_reference/`, with SHA-256 values and computed styles in `core-capture-receipt.json`.
- **Real product cards.** These came from the same production client, served through the real `researchPageGate` and
  `serveStatic`.
  - The catalog was a **synthetic** six-row fixture with no prices. Codex's HL01 launcher uses the same pattern, but
    Claude wrote this one independently.
  - Files: `core-synthetic-catalog-order-request-cards-*.png` and the matching receipt.
  - The assisted-order bridge is disabled in this configuration, so the plain `order-request` capture shows the
    unavailable state.

**B. Founder preview.** The imagery lane's own committed screenshots at `8b06da5`
(`docs/product-imagery/evidence/founder-preview/`) and its source (`docs/product-imagery/founder-preview/`).

**Method:**
- Five read-only lenses: chrome/layout, typography/tokens, catalog/cards, page surfaces, and copy/navigation truth.
- Each lens had its own adversarial verifier, and a completeness critic then checked the result against the founder's
  checklist.
- **Results:** 196 rows plus 11 added by the critic.
  - The verifiers upheld every row; two were reclassified.
  - 108 rows are material drift, 35 minor drift, 25 allowed exploration, and 28 core-internal inconsistencies.
  - The full matrix is in `imagery/27a_ui_drift_matrix.json`.
- **Side-by-side images:** `imagery/27a_side_by_side/`, A on the left and B on the right.
- Claude independently checked the decisive rows in source: ADD-01, ADD-02, ADD-11/CC-39 and TYP-09.

## Verdict

**UI fidelity: FAIL.** The founder preview is a parallel design system, not the Xenios UI with imagery inserted.
Approving it now would not tell Samuel what production will look like.

**Report 27's prototype verdict is amended.** The "PASS for private founder review" stands for truth and safety only.
It is **not** a basis for UI, layout or design decisions.

The coordinator's UI FIDELITY CORRECTION is supported by the evidence. Sending it is Samuel's decision. Suggested
additions are below.

## Material drift (representative; full list in the matrix)

| Area | Actual core (A) | Founder preview (B) | Row ids |
| --- | --- | --- | --- |
| Wordmark | V-mark plus "Xenios" (`Navbar.tsx:109-112`) | Gradient orb plus "XENIOS HEALTH", tracked uppercase | CH-01, CN-01 |
| Primary nav | For Individuals ⌄, For Practices ⌄, Partners, How It Works, Quality, About, Careers; left-aligned | Home, Featured, Products, Care, Status & account, QA grid; centred | CH-02, CN-02 |
| Header actions | "Sign In" link plus a "Start Care" 4 px square black button, with Menu below 1280 px | One "Explore catalog" pill and no Sign In | CH-03 |
| Header surface | Sticky, white at 94% with blur, 68 px | Cream, not sticky, 78 px | CH-04 |
| Mobile nav | One 68 px row (mark, Sign In, Start Care, Menu) and a right-side drawer | No menu; a second scrolling row; about 146 px of chrome | CH-05 |
| Page background | White, alternating with #F4F4F5 bands | Cream (245,241,233) with dark taupe full-bleed bands | CH-08, TYP-03 |
| Hero | White, solid-ink Inter Tight 800 at 76 px (32 px mobile), "Start Care" plus "Explore Products" | Black hero band, 106 px headline with **purple-to-teal gradient text** | CH-10, TYP-05/06/09, PS-01 |
| Font | Inter Tight via `@fontsource`, weights 500–900 | Inter is not loaded, so it falls back to Helvetica/Arial | TYP-01, ADD-04 |
| Buttons | 4 px radius, ink fill; 44 px target floor | 999 px pills, 42 px tall | TYP-14, ADD-05 |
| Cards | Text-first cards with 4/18 px radius and a light rule | 22–32 px radius, dark image-led tiles, soft shadows | TYP-16, CC-24 |
| Product-card anatomy | Family label, title, spec/format/basis/price facts grid, status pill, "Product details" disclosure, then CTA ("Add to order request" / "Continue through Care" / "Request pricing") | Image tile, provisional badge, canonical-ID pills, pathway, price state, CTA | CC-02…CC-15, CN-18 |
| Filters | Search, Family, Action, "Clear filters", results count and a "Your request" rail | Search, Category, Pathway and a count pill; no rail | CC-19…CC-22 |
| Product detail | No public PDP: `/products/:slug` is "not listed". Gated member detail anatomies exist (`MemberProductDetailExperience`, `FullCatalogProductRoute`, `catalog-display/ProductDetail`) | An invented public PDP with a sticky image, a "Visual class/state" facts table, a dark action panel and a "Continue exploring" shelf | PS-12…16, ADD-03 |
| Status/account | `/status` clarity form and timeline, `/sign-in`, `/support` | Invented status/account/support composition | PS-22…27, CH-18 |
| Footer | Clarity footer with groups and copyright | Different footer that links to preview-only views | CH-06, CN-05 |
| Copy and routes | Home headline "Care and research products, clearly separated."; Featured, QA grid and "Status & account" do not exist as production navigation | "A calmer way to navigate research and care.", plus preview-only routes in site navigation | CN-06…08, CN-02/04 |

## Imagery findings that change the imagery plan

Each was verified in source by Claude.

- **ADD-11 / CC-39: core imagery policy is undecided.**
  - The public research card, `EarlyAccessProductCard.tsx:197-203`, records: *"no product photography is used at
    all, because a wrong image on a research product is worse than none"*.
  - The assisted-order card has no image element.
  - Only gated member surfaces render Product Control media (`MemberCatalogExperience.tsx:116-130`).
  - It is therefore undecided which production surfaces carry product imagery. This is a **founder or core-lane
    decision**, and it must come before any imagery approval is production-meaningful.
- **ADD-02: slot geometry mismatch.**
  - Core's only existing product-media slot is **4:3, `object-fit: contain`**, with a rule below and a "not available"
    fallback.
  - The calibration lock and the preview use **1:1** renders in a **1/0.88 cover** slot.
  - Under core's slot, a square dark-studio render letterboxes inside a white card. The founder also never sees the
    no-image state that production shows by default.
- **ADD-01: preview-only image grading.**
  - Card images get `filter: saturate(0.82) contrast(0.98)` plus an inset vignette (`preview.css:470-483`), which
    production does not apply.
  - The detail `<img width=1254 height=1254>` attributes override `aspect-ratio`. The result is a tall centre slice
    that nobody chose (`preview.js:206`).
  - So the grade and crop being approved are not the production pixels.
- **CORE-05: the accent is not in core.** The purple-to-teal accent is not a token in the core clarity system: core
  uses a flat `--pulse` only. Dead gradient tokens remain in `index.css`. Where the accent lives (photographs only, or
  also UI tokens) is a core-lane or founder decision.

**Effect on report 27.** Batch 1 stays **NOT READY**, with a fourth smallest correction:

4. Before rendering Batch 1, Samuel or the core lane decides which surfaces carry product imagery and the canonical
   media slot (ratio and fit), and the framing gate (correction 1) is stated in that geometry. The calibration studies'
   art direction stays locked; only their canvas or crop may need to follow the slot.

## Allowed exploration to keep

Hero imagery placement and crop:
- the image beside the core hero copy, not the black band around it.

Imagery inside the core card anatomy:
- per-state imagery for held, quote and Care.

Catalog density and rhythm:
- as long as the result fits a layout core can actually build.

Merchandising:
- a Featured shelf, labelled as a proposed new core section;
- coming-soon panels.

The palette:
- near-black, taupe, ivory and purple-to-teal, carried **inside the photographs**.

Non-public scaffolding:
- the prototype bar, provisional flags, the QA grid and the calibration sheet;
- these belong in a review switcher, not the site nav or footer.

## Core-internal inconsistencies

The core lane, or Samuel, decides these. The preview should mirror the clarity system and flag them, not pick an
answer itself.

1. **Brand name and wordmark.** "Xenios" versus "Xenios Health", plus several lockups and titles (one page title is
   "Private document, xenios").
2. **Assisted-order catalog styling.** It is a separate token island: green ink, a sage accent, 999 px pill buttons,
   12–22 px radii, and gutters that ignore `container-x`.
3. **Card styles.**
   - Radius: 4 px `.card`, 18 px clarity/order cards and a 22 px panel.
   - Three product-card anatomies.
   - Three or more gated detail anatomies.
4. **Labels and wording.** No canonical state-badge style, mismatched status and action labels, raw family codes such
   as `RESEARCH_PEPTIDES_MATERIALS` shown to customers, and price wording that differs between surfaces.
5. **Navigation.** Research pages show two navigation rows, and core has three different sub-nav patterns.
6. **Forms and focus.** Three form-control systems and four focus-ring treatments.
7. **Status timelines.** Two status-timeline patterns.
8. **Font weights.**
   - Declared 650/750/850 render as 700/800/900.
   - The footer brand name is hidden below 520 px by a header rule.
   - `body-xs` is undefined.
9. **Imagery.** The imagery policy (ADD-11) and the accent token (CORE-05) above.

## Suggested additions to the coordinator's UI FIDELITY CORRECTION

These are for Samuel to consider; the correction itself is his to send.

1. **Reference A must include the gated member surfaces.** Capture member catalog and member detail with a synthetic
   member fixture, because there is no public PDP.
2. **Remove preview-only image CSS.** Drop the `filter` and vignette, and render card, detail and QA grid from
   identical pixels, so what is approved is the production pixels.
3. **Mirror the clarity system.** Where core is internally inconsistent (list above), mirror the clarity system and
   flag the item. Do not choose a winner in the preview.
4. **Show the no-image state.** Include at least one no-image card and detail per state, because that is what
   production renders today.
5. **Capture completely.**
   - Full-page mobile captures.
   - Captures at 1024 and 1280 px, where core's header and grids change.
   - The core mobile drawer, which Claude evidenced only in source.

The role split stands:
- Core Codex owns the website UI.
- Imagery Codex inserts and evaluates imagery inside it.
- Claude checks the two have not drifted apart.

## Limits

- **Signed-out only.** Gated member surfaces were evidenced in source, not captured.
- **Synthetic catalog.** The product cards come from a six-row fixture with no prices. Core cards with prices were not
  rendered.
- **Install toast.** Core captures include the PWA "Add xenios to your home screen" toast, a runtime overlay, not
  drift.
- **Not captured for core:** the mobile drawer and the 834/1024/1280 px layouts (source only).
- **Preview screenshots are the lane's own committed captures.** Several are first-viewport only.
- **Dev-mode CSP.** Dev mode blanks `/care`, because Care's strict CSP blocks Vite's inline preamble. That is why the
  production build was used; it is not a production defect.
- **Cleanup.**
  - The local servers were stopped.
  - The ignored `dist/` was rebuilt in the detached review worktree, which otherwise stays clean.
  - No repository source was edited.
