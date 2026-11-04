# Catalog imagery batch 001 r2

This is the exact successor requested by independent review in KAN-31/10607. It corrects the evidence and label-detail layer from source commit `dd375a91129e7c753a8938279417168577f62933`; it does not change the accepted private primary concept render.

The successor remains isolated from runtime and public media paths. It does not authorize publication or claim current delivered packaging.

## Review disposition

- Exact pair: `mo_af289f611c02b3fcef01` / `mov_ca3e45ae9712aee91430`
- Product: BPC-157 10 mg, lyophilized vial
- Media kind: `concept`
- Packaging state: `design`
- Private concept review: accepted on predecessor by KAN-31/10607
- Successor review: six referenced bytes accepted for private design and source-lead evidence by KAN-31/10612 at `e8705e0a34b0ab5bd357ccb24562dc89049aca1f`
- Independently approved exact production images: 0
- Publication-authorized assets: 0

## Corrections made

| Review request | Successor correction |
| --- | --- |
| Reconcile historical `R360-BPC157-10MG-VIAL` with the current Quick Order binding. | The label now displays `GEN-GRP-0262`, taken from the exact committed binding. `R360-BPC157-10MG-VIAL` is not displayed on the v2 label and remains only in internal evidence and the internal contact-sheet note as a historical commerce variant code. Neither code is represented as manufacturing traceability. |
| Pin portable catalog bytes. | The manifest and verifier pin committed blob `95fa8d928b3137e42f89cd168c30428c9078af6b` and raw SHA-256 `76b9bf6ffe908450d31e15900ee9aa1a5467068fd3dfecb2d28624a49c97c4d5`. A CRLF checkout is normalized before validation. |
| Keep the bottom-left note within its column. | The note is split into three bounded lines inside the left panel. |
| Keep the mockup traceability box inside the safe boundary. | The box was moved upward; its bottom edge is inside the dashed boundary. |
| Use exact child-gallery images for three NutriDyn records. | Annatto R271L → `r271l-Small-98707.png`; PRM Resolve R848 → `r848-Small-12877_1.png`; Stress Essentials R123L → `r123l-Small-10201.png`. |
| Correct GI Defend package basis. | R191 now records `75 g (2.65 oz) unflavored powder`. |
| Preserve the Magtein version hold. | R227 remains rights-pending and separately held for a current selected front/back label or manufacturer confirmation because conflicting label versions share its US code and UPC. |

All ten NutriDyn candidates still have `assetDownloaded: false` and `publicationAuthorized: false`. The three corrected URLs identify official child-gallery sources; they do not grant media rights.

## Active assets

| Role | Path | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| Accepted private primary concept | `../2026-11-04-batch-001/assets/bpc-157-10mg-vial-concept-v1-1024.webp` | 1024×1024 | 63,592 | `32aa4a616cb6b3954bd632c346456b1a732a3925c506efa4853b5a1f60b10baa` |
| Source render master | `../2026-11-04-batch-001/assets/bpc-157-10mg-vial-concept-v1.png` | 1254×1254 | 1,739,239 | `349f11c3e60a2daa3c39d68d34d6520bb71036066077751b526a77485c84cdc8` |
| Revised label detail | `assets/bpc-157-10mg-label-panel-concept-v2.webp` | 1600×900 | 126,234 | `5c2ae1ddac3acb3efb80a94d1ef248433d5a1b1fe2ead3e051515e04a9f9d3f9` |
| Revised label detail PNG | `assets/bpc-157-10mg-label-panel-concept-v2.png` | 1600×900 | 435,373 | `d797e5af2bf4c66a945bdc6bfb53c01e27d3afb2742c2337f708006f84c13bcd` |
| Editable label master v2 | `labels/bpc-157-10mg-concept-v2.svg` | 1600×900 | 6,241 | `7cd0eed36f1b0644aa314c2d4397ec4facd7436aa81f1b2af6e79d9c1f3796c4` |
| Successor contact sheet | `contact-sheet-v2.png` | 1800×1200 | 553,306 | `2f2906c12f4f71e0d54c2eb8bc90414353d86538b1858ee9178de3b8d51a1280` |

No new generative image call was made for r2. The predecessor's private concept render is reused by exact hash. The editable SVG was revised deterministically and rasterized to versioned PNG/WebP derivatives.

## Verification

Run:

```text
node deliveries/catalog-imagery/2026-11-04-batch-001-r2/verify-batch.mjs
```

The verifier checks:

- portable committed catalog and binding hashes;
- all 420 canonical offering/source-variant pairs;
- the displayed `GEN-GRP-0262` code against the exact binding;
- the historical R360 code remains separate;
- five active asset hashes, byte counts, dimensions and duplicate bytes;
- the successor contact sheet;
- the three exact NutriDyn child-gallery filenames;
- GI Defend 2.65 oz package basis;
- the Magtein current-label hold;
- all ten supplier images remain rights-pending, not downloaded and not publication-authorized.

The committed receipt is `verification-result.v2.json` and reports zero errors. It separately records six independently reviewed referenced bytes and zero independently approved exact production images.

## Remaining release blockers

- Supplier-approved proof and actual container/label dimensions.
- Dieline, bleed, safe area, material, adhesive, finish and winding/orientation.
- Approved supplier/manufacturer attribution and storage text.
- Real variable-data ownership for lot and expiry/BUD.
- Printed/in-use evidence after supplier proof approval.
- Supplier and release approval for any production/public use; KAN-31/10612 accepts the successor only for private design and source-lead evidence.
- Written current reseller/media rights and Product Control approval before any NutriDyn image is downloaded, transformed, uploaded, linked or published.
