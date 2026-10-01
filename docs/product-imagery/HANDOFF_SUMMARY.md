# Product imagery v3 Batch 0 exact-SHA handoff

Branch: `codex/xenios-product-imagery-20260930`

Pushed review target: `184d820a2a20152649b67892ec0a5467857d5290`

Review-target tree: `7743b87b312df84b396880b9159413b8144afba0`

Reconciled primary base: `49234f8a2dd804845245a18056a73904b320158a`

Primary-base tree: `36e1db47986916c3a96c82324ba43fbcec6e7861`

Founder v3 specification SHA-256: `e37a13d7b99ac1f2416e00e29a92df3e7677ce7c92bce9dbf019de83d08b8b5c`

This is a pushed source-and-evidence checkpoint for exact-SHA review. It is not a deployment, public-asset approval, runtime integration, catalog mutation, or commerce authority.

## Exact outcome

| Measure | Result |
| --- | ---: |
| Reviewed workbook rows | 426 |
| Canonical variants after the two reviewed merges | 424 |
| Customer-exposed target after excluding GRP-0364 shipping | 423 |
| Imagery-branch baseline canonical / exposed | 420 / 419 |
| Observed core HL-11 candidate canonical / customer | 424 / 423 |
| Observed core new canonical identities left unbound | 6 |
| Care rows in the reviewed target | 242 |
| Structured formulation holds | 1 (`GRP-0422`) |
| Price-on-request rows | 2 |
| Catalog coming-soon rows | 0 |
| Separate coming-soon offerings intended | 2 (`Superpower`, `Mito Health`) |
| Sanitized Batch 0 jobs | 25 |
| Rendered and receipt-bound | 25 |
| Pending / missing | 0 / 0 |
| Independently approved / public / runtime-wired | 0 / 0 / 0 |
| Rendered source bytes | 37,900,363 |
| Quarantined pre-v3 WebPs | 10 |

The 424/423 target is materialized in the observed core HL-11 candidate at source commit `4cba24af1d42ad59fe44856859cc1721846e6df5` (tree `6395273fc4370b7df713a2b72b019785f547d1fb`) with final qualification records at `c73da35cc223a2253ce8074948ed9ff063012748`. This imagery branch still contains the 420/419 baseline, and the core candidate is not deployed, independently accepted, or an approval of price or pixels. The image layer records that distinction and does not change catalog, price, action, Care, hold, workflow, cart, or fulfillment state.

## Corrected identity and authority

- Oxytocin is owned by `GRP-0425` / `mov_c26ef47dfbbe46f7e090`; `GRP-0407` and its old Product Control identity are forward-only aliases.
- Hexarelin is owned by `GRP-0426` / `mov_3c8ca424d78153fd931a`; `GRP-0402` and its old Product Control identity are forward-only aliases.
- Canonical, current Product Control, historical forward, and legacy Featured identities converge through one presentation crosswalk or fail closed.
- The coverage ledger contains identity and presentation-class facts only. Runtime presentation state is an explicit external input to the pure resolver.
- Restrictive Care, held, quote-only, and coming-soon visuals take precedence only when that state is supplied by the owning runtime authority.
- Unknown form remains neutral. `Topical Gel / Serum` is explicitly `packaging_unverified`, not guessed as a tube, pump, or dropper.

## Quarantine correction

The ten pre-v3 WebPs were removed from `client/public/research/products/fallbacks/` and retained only under:

`docs/product-imagery/evidence/pre-v3-nonapprovable/`

They are permanently nonapprovable. Exact-hash scans cover the quarantined WebPs, their ten known original PNG hashes, all 25 Batch 0 outputs, the contact sheet, and the browser screenshot across the entire public tree. The current public product-image inventory is empty.

## Sanitized renderer packet

The only active render packet is the 25-item generic Batch 0 class packet. Renderer input contains no canonical product name, third-party mark, ingredient, strength, quantity, price, label, claim, certification, people, administration, or purchase cue. Fixture identity and truthful alt text are physically separated into provenance and never sent to the renderer.

The 25 rendered classes are:

1. `peptide_lyophilized_vial`
2. `liquid_vial`
3. `injectable_solution_vial`
4. `solution_container_neutral`
5. `nasal_spray`
6. `oral_liquid_neutral`
7. `capsule_bottle`
8. `tablet_bottle`
9. `odt_container`
10. `troche_container`
11. `cream_tube_or_pump`
12. `gel_tube_or_pump`
13. `serum_dropper_or_pump`
14. `supplement_bottle_generic`
15. `supplement_tub_generic`
16. `supplement_retail_unit_neutral`
17. `accessory_pack`
18. `syringe_supply_pack_neutral`
19. `packaging_unverified`
20. `neutral_product_identity`
21. `care_pathway_neutral`
22. `held_neutral`
23. `quote_only_neutral`
24. `coming_soon_offering`
25. `shipping_service`

Exact filenames, output SHA-256 values, receipt SHA-256 values, byte sizes, observed generation times, and prompt/payload/contract bindings are in `docs/product-imagery/evidence/batch0-render-receipts.json` and `docs/product-imagery/manifests/batch-000-assets.json`.

## Renderer and durable provenance

- Provider: OpenAI
- Interface: built-in imagegen
- Model: `not_exposed_by_tool`
- Request ID: `not_exposed_by_tool`
- One distinct generation call per asset: yes
- Output format and dimensions: 25 PNG files, each 1254 by 1254
- Immutable naming: output SHA-256 prefix in every retained filename
- Publication status: `not_authorized_pending_independent_review`

Each receipt binds the final evidence path to the founder-spec hash, sanitized renderer-prompt hash, renderer-payload hash, combined render-contract hash, source image identifier, observed UTC timestamp, exact output SHA-256, and byte size.

## Visual and browser evidence

- Contact sheet: `docs/product-imagery/evidence/batch0-contact-sheet-sha256-02bcd3fa1fb3.png`
- Contact-sheet SHA-256: `02bcd3fa1fb39e51db0f34cd8e29c469686c208969a0b05bbbf75bca85315f3d`
- Contact-sheet layout: 1200 by 1200, 5 by 5, 25 of 25 assets
- Browser review page: `docs/product-imagery/evidence/batch0-browser-review.html`
- Browser evidence record: `docs/product-imagery/evidence/batch0-browser-review.json`
- Browser screenshot: `docs/product-imagery/evidence/batch0-browser-review-full-sha256-7910254c2a8d.png`
- Browser-screenshot SHA-256: `7910254c2a8dfc4d58384a1f0c60c6094490be40823ed2c7322d28cdebae7e8e`
- Browser result: Google Chrome 154 loaded and decoded 25 of 25 at natural size 1254 by 1254, with zero decode failures

Initial visual inspection found no visible text, logos, certifications, people, or third-party brand marks. That inspection is evidence only and does not replace named independent approval.

## Publication and resolver safety

The future promotion gate requires a content-hashed PNG, strict byte and decoded-pixel budgets, a source receipt/output/class match, rights review, and a content-hashed JSON approval record whose parsed approver, UTC time, decision, exact asset SHA, scope, manifest key, image class, and source hashes all match the registry entry. Metadata alone cannot make an asset trusted.

The pure resolver is covered by tests but is not mounted in runtime code. With zero approved public assets it intentionally returns no image. Missing, invalid, ambiguous, unapproved, or broken media cannot change commerce behavior.

## Verification completed on the review target

- `node scripts/product-imagery/build.mjs`: pass; 424 canonical, 423 target-exposed, 25 rendered, 0 pending
- `node --test scripts/product-imagery/product-imagery.test.mjs`: pass, 12 of 12
- `node scripts/product-imagery/verify.mjs`: pass; 10 quarantined, 25 of 25 rendered, 0 public
- `git diff --check` and staged diff check: pass
- independent read-only code audit: no remaining P0, P1, or release-blocking P2 finding
- production and hosted state: untouched

## Exact reviewer request

The existing independent reviewer session `claude-health-launch-review-20260930`, operating on branch `claude/xenios-health-launch-review-20260930`, should review pushed SHA `184d820a2a20152649b67892ec0a5467857d5290` against `f4f899a7:docs/review/xenios-health-launch-review-20260930/13_IMAGE_LAYER_ACCEPTANCE.md`.

The first message used the branch-like but unregistered recipient `claude-xenios-health-launch-review-20260930`. Corrected durable dispatch `25f3b5aa-12b7-4869-a387-15a7aab13634`, pushed in coordination commit `d7747d4d9dce97b8f389b6128f64f0beafe1e84a`, supersedes it and is addressed to the registered session. At this checkpoint, the reviewer branch still predates the request and contains no finding or approval for `184d820`.

Review must cover the exact 25 output hashes, mapping/identity convergence, generic prompt separation, form and packaging truthfulness, held/Care/quote/coming-soon treatment, deterministic versioning, browser evidence, alt-text policy, and the absence of any commerce-state coupling. Approval must be recorded per exact asset SHA; a branch-level review must not automatically publish pixels.

## Runtime integration status and blockers

No card, detail, Featured, search/filter, catalog, API, shared component, Product Control, payment, SQL, Render, Supabase, or production file was changed. Runtime integration is deliberately blocked by:

1. named Claude review of the exact pushed successor and exact candidate hashes;
2. independent acceptance of the frozen core HL-11 candidate and preservation of its six intentionally unbound new identities without invented Product Control or price authority;
3. acceptance for integration of the separately leased core change removing any media-readiness dependency from commerce;
4. a coordinated shared UI lease for one canonical resolver and one resilient image component; and
5. explicit founder authorization for every future production mutation.

The primary Health thread should consume the identity crosswalk, coverage ledger, exact receipts, and approved-asset gate. It should not rebuild a second image mapping, select Featured imagery independently, publish Batch 0 evidence, or make media readiness govern commerce.

## Next batch

Currently authorized render count: **0** until exact-SHA Batch 0 review is returned.

Proposed Batch 1 size after approval: **25 exact-product candidates**, selected from homepage Featured, the first catalog page, demo/sales walkthrough products, and direct-order high-visibility rows. The selection must be regenerated from the then-current 424-row authority, exclude the shipping service, preserve neutral handling for unknown or unverified packaging, and remain non-public until each exact SHA is independently approved.

Files touched outside imagery scope are limited to the task's `.xenios` session, task, ownership, message, and exact-SHA handoff records. No shared application source was edited.
