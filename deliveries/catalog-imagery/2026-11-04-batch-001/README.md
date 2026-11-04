# Catalog imagery batch 001

This is an isolated review delivery for release baseline `5926c2faf1e3ed2a7dbc82822fd6c3a8c93b694b`. It does not modify runtime components, canonical catalog identity, prices, eligibility, request routing, or public media paths.

## Outcome

| Measure | Count | State |
| --- | ---: | --- |
| Canonical offering/source-variant pairs checked | 420 | exact dataset SHA pinned |
| New exact-ID Xenios concepts | 1 | pending independent review |
| Independently reviewed exact assets | 0 | no completion claimed |
| Publication-authorized assets | 0 | no runtime import authorized |
| Official NutriDyn image-source candidates | 10 | rights pending; no image bytes downloaded |
| Individual service/supply dispositions | 2 | FedEx service; syringes physical supply |

The new concept is bound only to:

- Offering: `mo_af289f611c02b3fcef01`
- Source variant: `mov_ca3e45ae9712aee91430`
- Product: BPC-157
- Variant: BPC-157 10 mg
- Form: lyophilized vial
- Catalog SKU: `R360-BPC157-10MG-VIAL` (catalog identity only; not a lot or manufacturing traceability code)
- Media kind: `concept`
- Packaging state: `design`
- Artwork version: `BPC157-10-CPT-v1`

## Assets

| Role | Path | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| Optimized primary concept | `assets/bpc-157-10mg-vial-concept-v1-1024.webp` | 1024×1024 | 63,592 | `32aa4a616cb6b3954bd632c346456b1a732a3925c506efa4853b5a1f60b10baa` |
| Source render master | `assets/bpc-157-10mg-vial-concept-v1.png` | 1254×1254 | 1,739,239 | `349f11c3e60a2daa3c39d68d34d6520bb71036066077751b526a77485c84cdc8` |
| Optimized label detail | `assets/bpc-157-10mg-label-panel-concept-v1-r3.webp` | 1600×900 | 129,390 | `9db888803a9b26427e977f3161332fe7a73007a210a70698b675cee793d69b24` |
| Label detail PNG | `assets/bpc-157-10mg-label-panel-concept-v1-r3.png` | 1600×900 | 434,125 | `15545f406451d2817c789d9f7d34f7f38706a20e9e3d8963004c17b17a09a5e5` |
| Editable label master | `labels/bpc-157-10mg-concept-v1.svg` | 1600×900 | 6,133 | `30c873c5cc06a593503aa8373c2e4c884af39aadbdde3a2cf5b7866db584cf2c` |
| ID-labeled contact sheet | `contact-sheet.png` | 1800×1200 | 555,457 | `f377f7c228742916d53b57bf620a4fe7d3a8ffa87bd5916cdf23604e85c39c87` |

Alt text and exact machine-readable mappings are in `media-batch.v1.json`. Evidence, source candidates, rights states, review states, and unresolved gaps are in `internal-evidence.v1.json`.

## Label truth boundary

Verified static fields included in the label system:

- Xenios
- BPC-157
- 10 mg
- Lyophilized vial
- Total content 10 mg
- Research Use Only
- Nonclinical use only
- Catalog SKU `R360-BPC157-10MG-VIAL`, explicitly treated as catalog identity

The detail master visibly marks the following as pending instead of inventing them:

- supplier/manufacturer attribution
- supplier-approved storage text
- matching documentation or COA destination
- physical vial and cap specification
- label dimensions, dieline, bleed, material, adhesive and finish
- supplier proof approval and printed/in-use evidence

`DEMO-LOT` and `SAMPLE-ONLY` appear only inside the clearly marked concept detail master. They are not present in the optimized primary image and must never be imported as production traceability data.

## Printer handoff exceptions

This is not press-ready artwork. Before a printer file can be produced, obtain and approve:

1. Actual container circumference, printable height and cap/seal geometry.
2. Supplier dieline, trim, bleed, safe area and winding/orientation requirements.
3. Substrate, adhesive, opacity, laminate/varnish and finish specification.
4. Approved supplier/manufacturer/distributor text and any required warnings.
5. Approved storage text and an authoritative current product code policy.
6. Variable-data field ownership for real lot and expiry/BUD values.
7. Supplier proof approval, followed separately by printed/in-use evidence.

No QR, barcode, CAS number, purity, assay, certification, ingredient list, direction, real-looking lot, real expiry/BUD, or storage instruction was invented.

## NutriDyn source candidates

Ten exact offering/source-variant pairs from the content lane are recorded with their official NutriDyn product pages, official Open Graph package-image URLs, supplier item codes, and expected packs. Every one remains `OFFICIAL_SOURCE_RIGHTS_PENDING`, `assetDownloaded: false`, and `publicationAuthorized: false`.

This follows the repository media-rights rule: a public official product page establishes a source candidate, not a republishing grant. Root should not hotlink or import these images until the exact package is independently verified and a complete current reseller/media permission record is on file.

`Melentes` remains unresolved. No supplier identity was substituted.

## Services and supplies

- `mo_003b0c272099eeb1f114` / `mov_9b65ad5bb184691e19e0` — FedEx Standard Overnight is a service. It requires an original service presentation and trademark review, not a physical-product photo.
- `mo_a7a7e307d58f24affb42` / `mov_512ed6b875c04eee4753` — Syringes & Alcohol Swabs is a physical supply. Exact imagery is blocked on manufacturer/model, syringe gauge and volume, package counts, exact package basis, official photo, and rights evidence.

## Verification

Run from the repository root:

```text
node deliveries/catalog-imagery/2026-11-04-batch-001/verify-batch.mjs
```

The verifier checks canonical pair membership, uniqueness, file existence, byte counts, hashes, decode-level dimensions, duplicate bytes, allowed media/packaging states, delivery-tree quarantine, pending-rights supplier dispositions, and the contact sheet. The committed receipt is `verification-result.json` and currently reports zero errors.

Independent QA still needs to inspect the exact bytes and decide whether the BPC concept can advance. Even if accepted visually, its packaging state remains `design` until a supplier proof is approved; it must not be described as packaging currently delivered.

## Image-generation record

Tool mode: built-in image generation, reference-guided concept generation. References were the existing release BPC concept packshot and this batch's deterministic label-panel PNG. The generated original remains in the Codex generated-image store; this batch retains a copied source master plus an optimized derivative.

Final generation prompt:

> Use case: private product-packaging concept for review, not a production claim. Create one premium photorealistic square product packshot of a complete small clear glass research vial, using Image 1 only as the existing Xenios concept's container and lighting reference and Image 2 as the exact approved concept-label hierarchy and truth boundary. Show the entire cap, vial shoulder, label, glass base, and soft contact shadow with generous margin; never crop any part. Clean pearl-gray studio background, realistic transparent glass, restrained reflections, brushed silver aluminum cap, subtle purple-to-blue security band, coherent scale, straight vertical geometry, no visible powder or invented fill. Apply a crisp original Xenios white-label design with deterministic prominent text: XENIOS; BPC-157; 10 mg; LYOPHILIZED VIAL; RESEARCH USE ONLY; NONCLINICAL USE ONLY. Include a small but legible red CONCEPT — NOT FOR PRODUCTION marker on the label. Do not show any real-looking lot, expiry, BUD, purity, assay, certification, QR code, CAS number, barcode, ingredients, directions, storage instruction, manufacturer, distributor, product code, or documentation claim. Do not add medical imagery, needles, hands, props, clinical claims, or extra containers. This is a design-state concept only, not supplier-proof-approved and not printed/in-use.
