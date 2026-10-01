# XENIOS HEALTH PRODUCT IMAGERY PARALLEL WORKSTREAM
## Codex Mega Prompt v2
Prepared for Samuel Boadu
Date: 2026-09-30

Purpose: Launch a second Codex thread dedicated to product imagery while the primary Xenios Health Codex thread continues the release-critical site, catalog, payment, account, and production work.

## 0. CURRENT COORDINATION STATE

You are opening a new isolated parallel workstream for Xenios Health product imagery.

This is a real production workstream, not a brainstorm.

You are NOT replacing the existing Xenios Health implementation thread.

The primary Codex Health thread remains responsible for the core release path, including:
- HL-12 amount-bound payment verification
- HL-11 catalog reconciliation
- exact product detail completion
- public journey defects
- accounts, status, partner, supplier, and admin release behavior
- final production candidate
- release branch integration
- production promotion

The existing Claude reviewer remains the independent reviewer.

The image workstream must coordinate with both.

Current observed primary Health branch:
`codex/xenios-health-launch-implementation-20260930`

Newest records tip observed:
`a07e537286017ace08f60ef85eb8ade305c7ef2a`

The underlying current application source recorded by that handoff is:
`f318859262812b8fc1fcb6d2c8e697d86a209349`
tree:
`d97f11fbb206de04f1a578fcb4a09f56f03ae167`

Important:
The primary Health thread is still actively changing release-critical files. Do not take ownership of its payment, SQL, order, pricing, account, or release seams.

The current HL-12 source is a fail-closed temporary hold, not completion. Do not interfere with it.

The image lane must remain isolated enough that it can advance in parallel without destabilizing the core launch.


## 0.1 LATEST CLAUDE REVIEW COORDINATION UPDATE

Claude has already published the image-layer review bar and a fleet note pointing this lane to it.

Latest reviewer records observed after the image audit:
- reviewer branch: `claude/xenios-health-launch-review-20260930`
- review tip observed: `eaf7a4edf9dded6435d505ff2385c8b766b25924`
- review tree observed: `bb41a472724a468de107c0bcb86e8d48e82d55dc`

Before implementing, read:
`docs/review/xenios-health-launch-review-20260930/13_IMAGE_LAYER_ACCEPTANCE.md`

Treat that file as the independent acceptance bar for this lane.

Two corrections from Claude are already incorporated into this v3 prompt:
1. Use a permitted asset root such as `client/public/research/products/`, not the protected `client/public/products/` path.
2. Do not automatically brand alt text as `Xenios ...` for third-party-marked or packaging-unverified products.

There is currently no pushed `codex/xenios-product-imagery-20260930` branch as of the latest coordination check. If your worktree/chat setup already created a local branch or isolated worktree, reconcile it before creating another one.

## 1. PRIMARY OBJECTIVE

Build the Xenios product imagery system end to end so that every exposed product surface can display a correct image or a safe truthful fallback.

The final system must support:
- full catalog-scale image coverage
- exact product-to-image mapping
- reusable image manifests
- consistent visual taxonomy
- batch rendering
- safe fallbacks
- truthful state treatment
- product-card imagery
- product-detail imagery
- featured-product imagery
- search/filter result imagery where applicable
- accessibility
- cache/version behavior
- asset replacement without brittle client edits

This must be built as a system.

Do not solve this as hundreds of manually hardcoded image paths.

## 2. NEW CLAUDE FINDINGS THAT CONTROL THIS WORKSTREAM

Claude independently audited the current product-image surfaces and found several important constraints.

### 2.1 Existing explicit no-product-photography policy

The current source contains an explicit policy that effectively says a wrong product image is worse than none.

The Early Access card test currently asserts zero product image elements.

Samuel has now changed product direction:
people browsing products need images.

Therefore:
- the old no-photo behavior must be deliberately superseded
- do not silently delete the old test without replacing its safety purpose
- replace "no images" with "correct image or safe fallback"
- preserve the original policy's core safety concern: wrong imagery must never be shown for a product

The replacement test must prove:
- correct identity mapping
- no cross-product leakage
- missing asset fallback
- truthfully neutral fallback for unknown forms
- no misleading held/Care/quote-only presentation

### 2.2 Featured and All Products use different product record families

Claude found that Featured and All Products can derive from different record sets.

Current risk:
- older `PEX-*` / `R360-*` records can appear on Featured
- current canonical product rows use `GEN-GRP-*`

This means naive ID-based image mapping can cause the SAME product to display different images across one page.

Required correction:
- create one canonical image identity mapping
- use canonical stable product/variant/group identity, not whichever UI record happens to be present
- explicitly map legacy/featured identities to canonical identities
- include regression tests proving a product's Featured and All Products representation resolve to the same image identity

Do not create separate image truth for Featured.

### 2.3 Images currently gate commerce in the member lane

Claude found a member-area commerce rule where missing or unapproved media can block cart behavior.

This is not acceptable as the general launch model.

Image readiness and commerce eligibility must remain separate concepts.

A product can be commerce-eligible even if it is temporarily using a safe fallback visual.

Required:
- do not make generated image approval a new payment/product authority
- preserve legitimate product/media approval requirements only where they are explicitly product truth
- avoid an image-pipeline failure making a supported product impossible to order
- if current member logic couples media readiness to cart readiness, isolate and review that coupling carefully
- coordinate any shared behavior change with the primary Health thread before touching commerce-owned files

Images improve presentation.
They do not authorize or deauthorize products.

### 2.4 The proposed nine image types are not enough

Claude counted real source forms and found categories outside the initial visual taxonomy.

Known additional classes include:
- topical creams
- topical gels
- topical serums
- troches
- solutions
- injectable solutions
- listed unit
- dissolving tablet / ODT
- supplement retail units

There are also 29 rows where the form is not stated.

The image taxonomy must therefore expand.

Do not force unknown rows into vial or bottle classes.

### 2.5 Form-not-stated rows require neutral imagery

29 classification-pending rows have no stated form.

Showing a vial, bottle, capsule jar, injection container, or spray would invent product presentation.

Required fallback class:
`neutral_product_identity`

This image should:
- avoid implying a dosage form
- avoid implying packaging
- avoid implying clinical use
- remain visually polished
- communicate that it is a product listing, not a physical-package photograph

This also matters for other ambiguous rows.

### 2.6 Trademarked and potentially third-party packaged products need special handling

Claude identified names such as:
- Pregnyl
- Kyzatrex
- ZOFRAN
- Versabase
- Magtein
- UltraBiotic
- Collagen Renew / Dynamic Multi

The source may not establish who manufactures or packages every one of these items.

Do not generate a fake Xenios-labelled package when real-world third-party packaging may be involved.

Create an explicit visual state such as:
`packaging_unverified`

For these:
- use neutral form imagery where the form is actually known
- do not copy trademarks into fabricated packaging artwork unless appropriate usage is established
- do not imply Xenios manufactures or packages the product
- keep actual-package replacement possible later

### 2.7 Held blend restrictions

The CJC-1295 with DAC + Ipamorelin row remains under a formulation hold.

Do not render an invented component split on the label.

Do not infer:
- component milligrams
- concentration
- vial labeling
- formulation detail

It may use a neutral held-blend visual with only the approved public identity.

### 2.8 Superpower and Mito Health

Superpower and Mito Health are Coming soon only.

No agreement currently establishes:
- partner logo use
- official packaging use
- affiliate relationship
- API integration
- availability

Do not use:
- partner logos
- product packaging
- fake co-branding
- "Diagnostics partner"
- "Available"
- price
- transaction imagery

Use a neutral text-led Coming soon offering visual.

### 2.9 Coming soon and held are different

Do not visually use "Coming soon" as a generic replacement for held.

Different states:
- Coming soon = intended future offering
- Held = item exists in scope but a present dependency prevents an ordering path
- Quote only = customer amount requires review
- Care only = provider pathway
- Available/request order = supported current pathway

The image layer must preserve these distinctions.

### 2.10 Service-worker and image URL caching

Claude found that images can remain cached until the site version changes.

Generated asset URLs therefore need stable content-version behavior.

Preferred:
- content-hashed filenames
- or immutable versioned URLs
- manifest revisioning

Do not rely on replacing image bytes under the same URL and expecting every client to refresh immediately.

### 2.11 Missing image paths may return HTML instead of an image 404

A missing public file can resolve to the application shell depending on route handling.

Therefore:
- image load failure needs a real onError fallback path
- manifest validation alone is not sufficient
- browser behavior must be tested against genuinely missing files
- ensure fallback does not recurse

### 2.12 Signed storage links expire

Claude observed five-minute signed storage behavior on one current path.

Do not use short-lived signed URLs as the default public product image architecture.

Public catalog assets should prefer:
- versioned public static assets
- durable public CDN/object URLs
- or another stable permitted delivery mechanism

Do not create catalog pages that break after a signed URL expires.

## 3. AUTHORITY AND OWNERSHIP RULES

### 3.1 Product identity authority

The image layer consumes canonical product identity.

It does not create its own product catalog.

Use existing product authority for:
- canonical Group ID
- canonical product ID
- canonical variant ID
- name
- form
- strength
- state
- Research/Care classification
- availability/disposition

Do not duplicate pricing, clinical, fulfillment, or ordering truth.

### 3.2 Primary thread owns release-critical seams

Avoid editing unless explicitly coordinated:
- payment services
- payment SQL
- order status transitions
- pricing authority
- Product Control authority
- account authorization
- supplier release
- production config
- release branch integration

### 3.3 Image thread owns

Prefer ownership of:
- `docs/product-imagery/**`
- `scripts/product-imagery/**`
- `client/public/research/products/**` for public generated/fallback product assets unless repository ownership says otherwise
- image manifests
- image mapping adapters
- asset metadata
- generated prompt packets
- fallback images
- generated public image assets
- image-specific tests
- bounded image presentation utilities

Shared product-card/detail components can be touched carefully if needed, but coordinate if the primary thread is editing them.


### 3.4 Protected asset path correction

Claude verified that `client/public/products/` is protected under the current repository policy.

Do NOT create or place the new image system under that path unless the repository's owning review process explicitly reassigns it.

Preferred public asset root for this workstream:
`client/public/research/products/`

Suggested structure:
- `client/public/research/products/generated/`
- `client/public/research/products/fallbacks/`
- `client/public/research/products/coming-soon/`
- `client/public/research/products/neutral/`

If the repo already has a more appropriate permitted path, use that after recording the ownership reason.

Do not weaken or rewrite the protection manifest merely to make asset placement easier.

## 4. BRANCH

Create or use an isolated branch similar to:
`codex/xenios-product-imagery-20260930`

Before creating:
- search for an existing image branch
- inspect ownership
- inspect dirty state
- inspect current branch ancestry
- do not duplicate an already-running image thread

Record:
- branch
- worktree
- base SHA
- base tree
- session/task identity
- owned paths
- first real operation

## 5. IMAGE CONTRACT

Create a reusable image contract that supports:
- canonical identity
- legacy aliases
- slug
- display name
- image status
- visual state
- image type
- primary image
- fallback image
- gallery
- alt text
- prompt key/version
- asset fingerprint/version
- packaging authority
- form authority
- notes

The contract must support legacy-to-canonical mapping.

## 6. VISUAL TAXONOMY

Create a practical taxonomy that covers source reality.

Recommended starting classes:
- peptide_lyophilized_vial
- liquid_vial
- injectable_solution_vial
- solution_bottle
- nasal_spray
- oral_liquid
- capsule_bottle
- tablet_bottle
- odt_bottle
- troche_container
- cream_tube_or_pump
- gel_tube_or_pump
- serum_dropper_or_pump
- supplement_bottle_generic
- supplement_tub_generic
- supplement_retail_unit_neutral
- packaging_unverified
- accessory_pack
- syringe_supply_pack
- shipping_service
- coming_soon_offering
- neutral_product_identity
- held_product
- held_blend
- care_pathway_neutral
- quote_only_neutral

## 7. COVERAGE LEDGER

Build a machine-readable coverage ledger for the full intended catalog.

Required fields:
- canonical identity
- source identity
- legacy aliases
- product name
- form
- strength
- channel
- visualState
- imageType
- imageStatus
- primary asset
- fallback asset
- render priority
- packaging authority
- form authority
- prompt status
- generated asset status
- review status
- notes

Explicitly classify:
- all form-not-stated rows
- trademarked/potential third-party rows
- held blend row
- quote-only rows
- Care rows
- shipping/service rows
- Coming soon offerings

No silent omissions.

## 8. RENDER PROMPT SYSTEM

Create prompt templates by image type.

Use a consistent Xenios visual language:
- premium
- restrained
- clean
- neutral
- studio lighting
- centered product
- consistent crop
- consistent background
- realistic materials
- no fantasy medicine aesthetic
- no unapproved certification marks
- no regulatory claims
- no medical outcome claims

Do not fabricate readable fine print.

Prefer minimal labels.

If exact package/label authority is unknown:
- use generic abstract identity
- or neutral unbranded container
- or form-free product visual

Do not hallucinate actual packaging.

## 9. GENERATED ASSET NAMING

Use stable predictable content-hashed assets.

Requirements:
- asset change creates a new URL
- manifest points to exact immutable asset
- old browser cache cannot silently keep stale mismatched product art
- record asset hash/fingerprint in the manifest

## 10. FALLBACK SYSTEM

There must never be:
- broken image icon
- empty image panel
- app HTML rendered as an image
- infinite fallback loop
- wrong product image substituted from another product

Create safe fallback classes for:
- vial
- bottle
- oral_solid
- topical
- spray
- supplement
- accessory
- neutral_product_identity
- care_pathway
- held
- quote_only
- shipping
- coming_soon

Test actual missing files.

## 11. COMMERCE DECOUPLING

Image readiness must not become a replacement product authority.

A commerce-eligible item should be able to use a safe fallback image while retaining its legitimate ordering pathway.

Do not let image approval automatically define commerce eligibility.

If current member cart behavior is coupled to media approval:
- document the seam
- do not casually remove a safety check
- coordinate a narrow change with the main Health thread
- provide an acceptance test proving commerce still uses product/price/order authority

## 12. FEATURED VS ALL PRODUCTS IDENTITY CONSISTENCY

Create explicit tests proving:
- Featured legacy record resolves to canonical image key
- All Products canonical record resolves to the same image key
- product detail resolves to the same image key
- search result resolves to the same image key

No duplicate image systems.

## 13. UI INTEGRATION

Where safe, integrate imagery into:
- catalog cards
- Featured cards
- All Products cards
- search/filter results
- product detail
- relevant product summaries

Requirements:
- stable aspect ratio
- responsive layout
- 320 px safe
- 390 px safe
- 768 px safe
- desktop safe
- lazy loading where appropriate
- no cumulative layout jump from unknown dimensions
- correct alt text
- state badge/copy remains readable
- image must not overpower product name or purchasing state

## 14. ACCESSIBILITY

Alt text must:
- identify the product truthfully
- avoid claims
- avoid invented form
- contain no em dash
- avoid redundant "image of" language where possible
- remain useful for neutral fallbacks

Do not use an exact container term if form is not stated.

## 15. THIRD-PARTY / TRADEMARKED PRODUCT POLICY

Until actual package authority is known:
- do not generate branded third-party packaging
- do not generate fake Xenios packaging that implies Xenios is the manufacturer
- use neutral generic visual treatment
- mark packaging authority as third-party possible or unverified

Create a review list for all such rows.

## 16. COMING SOON POLICY

Superpower and Mito Health:
- names only
- Coming soon
- no logo unless permission exists
- no packaging
- no price
- no checkout
- no affiliate link
- no partnership claim
- no "Diagnostics partner"

Use a text-led neutral premium Coming soon treatment.

## 17. HELD AND QUOTE-ONLY POLICY

Held:
- exact product identity may be visible
- image may be neutral/product-specific
- do not show Coming soon unless that is the actual state
- do not imply orderability
- preserve hold reason/next step from main authority

Quote only:
- image still present
- no $0
- no invented numeric amount
- image does not imply immediate checkout

Care:
- image may be visible
- Research presentation must not imply direct purchase
- Care price policy remains owned by product/Care authority

## 18. RENDERER ARCHITECTURE

Design the pipeline so the renderer is pluggable.

Possible backends:
- OpenAI image generation
- Higgsfield API
- another approved image platform

Create a renderer-neutral render queue.

Do not commit secrets or API keys.

## 19. BATCH STRATEGY

Do not render the entire catalog before validating style.

Batch 0:
- one representative item per major image class
- verify style, crop, background, label policy

Batch 1:
- homepage Featured products
- first catalog page
- demo/sales walkthrough products
- direct-order high-visibility items

Batch 2:
- remaining Research/request-order rows

Batch 3:
- Care rows
- quote-only
- held
- ambiguous forms
- third-party/unverified packaging

Batch 4:
- Coming soon offering visuals

Each batch must preserve deterministic mapping.

## 20. TESTS

Add tests for:

Manifest:
- every exposed product resolves image record
- every image record resolves canonical identity
- no duplicate canonical mappings
- no legacy alias maps to two canonical keys
- no shipping row maps to ordinary product visual
- no form-not-stated row maps to form-specific image without authority

UI:
- card shows primary image
- detail shows same image identity
- Featured and All Products resolve same identity
- missing asset falls back
- fallback failure does not loop
- alt text exists
- held image state remains held
- Care state remains Care
- quote-only remains quote-only
- Coming soon remains nontransactable

Browser:
- valid image
- missing file
- wrong content type
- slow image
- 320 px
- 390 px
- desktop

Cache/version:
- new asset fingerprint creates new URL
- manifest version changes appropriately
- stale asset does not remain the only reference after regeneration

## 21. SOURCE GATES

Run:
- focused tests
- image manifest validation
- typecheck
- build if UI/source touched
- no-em-dash source/build gates for generated alt/UI strings
- route/product mapping regression tests as relevant

Do not run heavyweight full suite in competition with the main Health thread without coordinating first.

## 22. HANDOFF TO PRIMARY HEALTH THREAD

At every coherent checkpoint provide:
- branch
- exact source SHA/tree
- files owned
- files touched outside imagery scope
- manifest location
- coverage ledger location
- render queue location
- generated asset paths
- fallback policy
- UI integration status
- known conflicts
- what the primary Health thread should consume
- what the primary Health thread should NOT duplicate
- tests actually run
- remaining image gaps

If a core-owned file needs a change:
- write an exact integration request
- do not race-edit it unless ownership has been coordinated

## 23. CLAUDE REVIEW HANDOFF

Prepare review material so Claude can verify:
1. no wrong-image mapping
2. Featured/All Products consistency
3. no commerce eligibility coupled incorrectly to image readiness
4. form-not-stated rows stay form-neutral
5. third-party/trademark packaging is not fabricated
6. held blend does not invent component split
7. Superpower/Mito have no unauthorized logo/partnership packaging
8. no Coming soon misuse for held rows
9. fallback works on real missing/non-image response
10. signed URLs are not used as fragile public defaults
11. cache/versioning is deterministic
12. alt text is accurate and no-em-dash compliant
13. every exposed product gets correct image or safe fallback

## 24. FIRST CHECKPOINT REQUIRED

Return this before doing a giant render run:
1. branch/worktree
2. base SHA/tree
3. current ownership
4. complete product-image surface inventory
5. image contract proposal
6. canonical/legacy identity mapping strategy
7. expanded image taxonomy based on actual catalog forms
8. packaging/trademark exception list
9. neutral fallback strategy
10. asset/versioning strategy
11. proposed file structure
12. first 10 representative render prompts
13. first render batch plan
14. UI integration seam list
15. test plan
16. conflicts with the primary Health thread
17. exact next implementation slice

Then implement.

Do not stop at planning after that checkpoint unless a true ownership conflict requires coordination.

## 25. DO NOT

Do not:
- deploy
- merge to production
- alter Render configuration
- apply managed migrations
- touch real payments
- send real customer email
- make supplier purchases
- invent product forms
- invent packaging
- invent clinical claims
- invent certifications
- invent partner relationships
- invent stock
- invent component splits
- make image readiness a new commerce authority
- create a competing product catalog
- create separate image mappings for Featured and All Products
- use short-lived signed URLs as default public assets
- overwrite same image URL and assume cache invalidation
- leave missing image behavior to browser defaults

## 26. DEFINITION OF DONE

The image layer is launch-ready when:
- every exposed product surface resolves to an image record
- every exposed product shows a correct asset or safe fallback
- legacy and canonical identities converge to one image identity
- Featured and All Products cannot disagree visually
- product detail matches card imagery
- unknown forms use form-neutral visuals
- third-party packaging is not fabricated
- held/Care/quote-only/Coming soon states remain truthful
- missing files recover safely
- public image URLs are stable
- asset replacement is versioned/content-hashed
- images do not govern payment eligibility
- alt text is meaningful
- mobile layouts remain stable
- tests cover mapping/fallback/truthfulness
- Claude independently reviews the exact successor
- primary Health thread has a clean integration handoff

This workstream should materially improve the launch without slowing the payment/catalog production path.
