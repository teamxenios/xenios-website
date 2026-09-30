# Product image contract v3

## Purpose and authority boundary

The image layer answers one presentation question: what visual may a surface show for one canonical offering variant without making a false claim?

It grants no authority over product existence, availability, price, workflow, action, cart eligibility, Care routing, payment, inventory, fulfillment, release, or Product Control approval. An image, missing image, failed image, fallback, review state, or approval record must never change any of those decisions.

The current member commerce path still treats approved Product Control primary media as a readiness input in both application code and persistent-cart SQL. That is a known acceptance failure outside this owned lane. Runtime imagery must not be wired until a separately leased, tested, and registered no-image-gating change removes that dependency. No migration may be applied without Samuel's current explicit approval.

## V3 status

Schema version 3 implements the independent acceptance bar at `f4f899a7:docs/review/xenios-health-launch-review-20260930/13_IMAGE_LAYER_ACCEPTANCE.md`.

The founder v3 prompt is not present. The ten generated files are preserved as pre-v3 review candidates with `reviewStatus=provisional`, `reviewRecord.disposition=unreviewed`, `approvalEligibility=blocked_permanent_rerender_under_v3_required`, `runtimeWiringEligibility=blocked`, and `deploymentEligibility=blocked`. Their original PNGs are hashed local artifacts but are not durable repository evidence. These exact bytes can never be approved; they may serve only as quarantined review references and must be removed or replaced by a v3 rerender before deployment. No further rendering may start until the founder prompt is attached and reconciled.

Because the candidate bytes are deliberately stored in the requested `client/public/research/products/` source namespace, any web build containing this branch could expose their URLs without UI wiring. This branch and every commit containing the candidates is therefore non-deployable until the files are removed or replaced by v3 rerenders with durable evidence, named approval, and all publication gates satisfied. The repository contract is a release block, not runtime authorization.

## Canonical identity

The manifest key is always `offeringVariantId`, the committed `mov_*` key from `member-safe-master-offerings.generated.json`. Each coverage row also records:

- `mo_*` offering identity
- member-safe display name and variant label
- source form and resolved visual form
- family, category, source display state, and image journey class
- nullable Product Control product UUID, variant UUID, and `GEN-GRP-*` SKU
- zero or more Featured legacy identities
- runtime customer exposure, derived from the shipping-fee exclusion in `service.ts`

Product Control product UUID alone is not sufficient. The 420-row source has 417 bindings and three unbound rows. BAM15 and Syringes & Alcohol Swabs remain exposed; FedEx Standard Overnight is excluded as a fulfillment fee. The ledger therefore accounts for 420 source rows and 419 exposed rows.

### Featured and canonical convergence

`product-image-identity-crosswalk.json` gives every canonical row exactly one `mov_*` manifest key. It joins the 22 legacy Featured PEX or PEP plus R360 identities from `catalog-live-identity-closure-20260922.json` to the same canonical Product Control UUIDs, GEN-GRP SKU, candidate asset ID, href, alt text, dimensions, and illustrative notice used by the all-products row.

The closure file is evidence only. It cannot merge, deactivate, price, route, or authorize a product. Product-level lookup is forbidden because three legacy products have multiple variants. Resolution must use the exact variant UUID or exact PEX/PEP plus R360 pair. When a caller supplies more than one canonical, Product Control, legacy UUID, or PEX/R360 identity, every supplied identity must converge on the same `mov_*`; any unknown, incomplete, or conflicting unit fails closed. A missing or invalid alias fails to a truthful visual fallback and never removes the catalog row.

## Image state and coverage state

The existing exact-media vocabulary remains `approved | pending | none`. Every current ledger row has `imageState=none`; there are zero approved exact assets.

`coverageStatus` is a separate source-work accounting field, not an image approval field:

| Coverage status | Meaning |
| --- | --- |
| `final` | Exact, rights-supported, named-approved media. No row qualifies. |
| `provisional` | Exact candidate exists but evidence or approval is incomplete. |
| `fallback` | A deliberately non-exact form, pathway, service, or form-neutral candidate is assigned. |
| `pending` | No suitable candidate exists. A UI must use an intentional non-broken state. |

A fallback can never set exact `imageState` to `approved` or satisfy Product Control primary-media review.

## Visual form resolution

Form selection uses committed data, never name parsing.

1. Start with the canonical row's exact `subcategory`.
2. Apply only a reviewed kept-identity decision recorded in `master-catalog-reconciliation-20260821.json` and the 426-row source summary.
3. Select a generic form candidate or a form-neutral candidate.
4. Apply a safer non-product journey candidate for Care, held, quote, or service states when needed.

The 420-row artifact contains 29 rows whose source form is `Form not stated`. Founder-reviewed reconciliation establishes two identity exceptions: GRP-0425 is the kept Oxytocin 10 mg lyophilized vial identity, and GRP-0426 is the kept Hexarelin 5 mg lyophilized vial identity. Their GRP-0407 and GRP-0402 rows remain provenance only. The other 27 unknown-form rows must show no product, vial, bottle, tablet, spray, topical vessel, package, or dosage-form clue.

Visual QA found that the current generic vial candidate visibly contains clear liquid. It is therefore restricted to generic liquid-vial contexts and is never selected for a lyophilized vial. All resolved lyophilized-vial rows, including the two kept identities, use the form-neutral candidate until the founder v3 prompt yields a reviewed dry or content-neutral vial visual.

Forms without a trustworthy matching candidate, including generic `Liquid` or `Solution`, troche, ODT, tablet, listed unit, included supply, injectable solution container, and supplement unit packaging, resolve to the form-neutral candidate. A liquid dosage form alone does not establish an amber child-resistant bottle. This avoids inventing a container or package merely because a dosage form is known.

## Journey classes

The ledger keeps these presentation-only classes distinct:

- `care`
- `held`
- `quote_required`
- `request_access`
- `coming`
- `shipping_service`
- `unavailable`
- `catalog_visible`

Held is not Coming soon. Syringes & Alcohol Swabs resolves as held and uses a non-product pending visual. Care uses an empty consultation scene. Quote uses an abstract review checkpoint. The excluded FedEx row is a service, never merchandise. Status text and badges must still come from current runtime authority, not from pixels or this ledger.

## Truthfulness and third-party rules

No visual, prompt, alt text, or illustrative notice may add:

- lot, expiry, COA, purity, certification, pharmaceutical-grade, clinical-result, before-and-after, US-sourcing, or pharmacy claims
- price, discount, stock, availability, cart, checkout, accepted quote, or purchase state
- fill volume, concentration, unit count, dosage, administration, outcome, or efficacy not supported by exact evidence
- a supplier, partner, carrier, or brand logo without documented rights and exact identity evidence

Claim-bearing names such as hair restoration, anti-aging, or libido products receive only form art. Their canonical catalog identity may appear in alt text, but the literal scene description may not amplify it into an outcome claim. HCG Pregnyl, Kyzatrex, ZOFRAN, Versabase, Magtein, UltraBiotic, and any similar marked item may use only generic form or form-neutral art until real rights-cleared packaging exists. Superpower or Mito Health may not receive partner logos or fabricated packaging.

The current CJC-1295 With DAC row is held and form-neutral. The absent GRP-0422 combination is not fabricated into this 420-row ledger. If it later enters the canonical source, its component split must remain unstated until confirmed.

## Provenance, rights, and approval

Every candidate records:

- exact bytes, filename, public path, full SHA-256, byte size, dimensions, and MIME implied by extension
- generator attribution, manifest generation time, and an honest `unknown` pixel-generation event time when no durable event record exists
- source PNG artifact reference, full SHA-256, dimensions, byte size, and observational filesystem times
- WebP encoding time, exact transformation recipe, and byte-identical lineage verification
- exact prompt used
- source type and derived provenance tag
- identity scope
- rights status and ownership claim
- illustrative notice
- review disposition, reviewer, timestamp, and evidence reference
- separate approval, runtime-wiring, and deployment eligibility axes

The current source type is `ai_generated_candidate`; provenance is `generated_catalog_fallback_candidate`; rights are `publication_rights_review_pending`; ownership is `none_until_review`. Opaque local `exec-*` filenames are evidence references, not claimed ImageGen run IDs. Recorded filesystem times are explicitly observational and mutable; hashes establish the source-to-WebP chain. Because the originals are not repository-durable, the chain documents how these review bytes were made but cannot qualify them for approval. A future v3 rerender must preserve durable source evidence and then obtain a reviewer, time, exact checksum, identity scope, rights evidence, and prompt contract.

## Alt text and illustrative notice

The ledger creates row-specific recommended alt text. It starts with the canonical product display identity, describes only the literal generic form or non-product scene, and ends with `Illustrative.` The validator scans the descriptive suffix after punctuation normalization so variants such as `expiration`, `certified`, `clinical-results`, `before/after`, and `US-sourced` cannot evade the claim gate. A canonical source name does not authorize the description to add or amplify a claim.

The UI must also present `Illustrative fallback. Exact product packaging is not shown.` where the purchase terms' illustrative-image rule applies. If a complete adjacent text identity makes the image decorative, an accessibility review may choose `alt=""`, but that choice must be tested on the actual surface.

## Paths, URLs, names, and budgets

Candidate assets may exist only under:

`client/public/research/products/fallbacks/`

Customer URLs may exist only under:

`/research/products/fallbacks/`

Exact approved assets, if later added, use the sibling `exact/` namespace. Never use `client/public/products/`, an arbitrary host, a percent-encoded path, traversal, a query, a fragment, a token, or a short-lived signed storage URL as the public default.

Every filename is immutable and content addressed. Fallback names include a semantic name, version, and first 12 SHA-256 characters. Future exact names follow:

`xenios-{offeringVariantId}-primary-v{n}-{sha12}.webp`

Never overwrite. Increment the version, calculate the new checksum, keep the old review record, and update a runtime manifest only after approval. The budget is 120 KiB per 1024 by 1024 WebP and 400 KiB total for this fallback batch.

## Runtime fallback chain

After the prerequisites and named approvals are complete, one resolver and one component should implement:

1. approved exact `mov_*` asset
2. approved generic category or form fallback
3. form-neutral non-image panel

The component accepts a resolver descriptor, never an arbitrary href. It reserves dimensions, uses same-origin content-hashed URLs, and handles errors. A first image failure swaps to the approved fallback; a second failure removes the `<img>` and shows the intentional panel. Missing files, missing manifest entries, unknown identities, slow loads, and expired legacy URLs must not show a broken icon or drop a product.

## Publication gate

Publication requires all of the following:

1. founder v3 prompt attached and reconciled
2. exact identity or explicitly approved generic role
3. bytes match path, SHA-256, byte size, format, and dimensions
4. truthful alt text and illustrative notice
5. structured provenance and rights evidence
6. no forbidden claim or metadata
7. named reviewer, UTC review time, and evidence reference
8. no-image-gating application and SQL prerequisite complete
9. one canonical resolver with PEX/R360 and GEN-GRP parity
10. real `onError` recovery and browser proof that `naturalWidth > 0`

No current candidate passes this gate.
