# Peptide artwork — CLAUDE-1 batch C1-002

This batch delivers Xenios website artwork and editable label masters for ten exact research-peptide variants. It is for review only: nothing here is linked into the runtime, and the founder has approved neither publication nor physical production.

| Variant | Offering | Source variant | Product code | Label facts |
|---|---|---|---|---|
| MOTS-c 10 mg | `mo_33b6b3e982b2dc5113bb` | `mov_72b54c1f1e71b4229c2a` | `GEN-GRP-0313` | KAN-59/10654 |
| GHK-Cu 50 mg | `mo_fb02f804912e868b0a10` | `mov_4522e672752616ff992d` | `GEN-GRP-0288` | KAN-59/10654 |
| GHK-Cu 100 mg | `mo_b06b77a95d5dd5bf8cd7` | `mov_35b19a790d7a247210c9` | `GEN-GRP-0287` | KAN-59/10654 |
| Tesamorelin 10 mg | `mo_5da1ee7942bcff333ef6` | `mov_b1fbc841c7fb09265cad` | `GEN-GRP-0347` | KAN-59/10681 |
| Sermorelin 5 mg | `mo_9c7083a0cfc2bfd2d525` | `mov_e737e2f494af1ea61435` | `GEN-GRP-0341` | KAN-59/10681 |
| Hexarelin 10 mg | `mo_5720466fd9388d2044ed` | `mov_e562b76120d36c6ebf2d` | `GEN-GRP-0300` | KAN-59/10681 |
| DSIP 10 mg | `mo_1c93e6c7c97d1e38167e` | `mov_0efd31ea72138e78d999` | `GEN-GRP-0278` | KAN-59/10687 |
| Semax 10 mg | `mo_42060e3ba6b7fa26b5a9` | `mov_bd3ee913aa6fedf2c743` | `GEN-GRP-0338` | KAN-59/10687 |
| Kisspeptin 10 mg | `mo_61e8c1f887725c9938ae` | `mov_823a1410e1831e6d845f` | `GEN-GRP-0308` | KAN-59/10687 |
| Oxytocin 5 mg | `mo_3ac83d28defd63915a71` | `mov_12b96a21ca34f80cdb6a` | `GEN-GRP-0320` | KAN-59/10687 |

The ids, Quick Order bindings and catalog facts are read from the release datasets. Those are `member-safe-master-offerings.generated.json` (sha256 `76b9bf6f…`) and `master-offering-bindings.generated.json` (`587595e6…`), both unchanged at release `19d10e04`.

All ten have the same catalog facts:
- family `research_peptides_materials`;
- subcategory `Lyophilized Vial`;
- state `request_access`.

The printed text comes from CLAUDE-2's verified label facts. Each record in `media-batch.v1.json` carries its source (Jira reference, file name and sha256) and the verified static text. `tools/variants.json` is the build input made from them.

**Name spelling.** MOTS-c is printed "MOTS-c", as in the verified label facts. The catalog display name is "MOTS-C", which differs only in case. The record declares this as `nameVariance`. Changing the catalog name is Root's decision; the artwork can be re-set either way.

## What is in the files

For each variant, the batch contains six deliverables:

- **`assets/<variant>-website-render-v1-1024.webp`** is the website primary. It is a complete vial render at 1024 × 1024.
- **`assets/<variant>-website-render-v1.png`** is the full-resolution render master, at 1254 × 1254.
- **`labels/<variant>-front-artwork-v1.svg`** is the editable front label master, at 1600 × 1000.
- **`assets/<variant>-front-artwork-v1.png` / `.webp`** is the legible label-detail image.
- **`labels/<variant>-wrap-proof-v1.svg`** is the editable full wrap proof: front panel, fixed-identity side panel with the product code, and back-panel proof notes.
- **`assets/<variant>-wrap-proof-v1.png` / `.webp`** is the wrap preview, at 2400 × 1200.

Batch-level files:
- `contact-sheet-v1.png` shows all ten variants, including 72 px and 120 px phone-thumbnail views.
- `media-batch.v1.json` holds the mapping, depicted facts, label-fact sources, review candidates (alt text and caption), and every file's bytes, sha256 and dimensions.
- Internal source evidence (workbook rows and selected-source references) is not in this repository, because the repository is public. It is in the private KAN-59 handoff.
- `tools/` holds the build, render, kerning and verification sources, the measured kern table, the build report and `variants.json`.

Website caption for every image: **"Packaging design shown. Current packaging may differ."**

## How the artwork was made

No generative image model was used, and all lettering is set from installed fonts. The method is the same as in batch C1-001.

### Vial renders

The base is the accepted Batch 004 BPC-157 10 mg v3 render (`KAN-31/10627`, sha256 `674868e8…`). The steps:

1. The name rows are refilled with clean label paper (columns 448–807): rows 567–671, or rows 567–742 when the amount changes too.
2. The new text is set in Segoe UI Bold, matched to the render: name 91.6 px, amount 63.2 px.
3. Every other pixel is byte-identical to the accepted render. `tools/verify_c1.py` checks this.

How each name and amount is set:

| Variant | Name on the render | Amount on the render |
|---|---|---|
| MOTS-c 10 mg | full size | unchanged "10 mg" |
| GHK-Cu 50 mg | full size | re-set to "50 mg" |
| GHK-Cu 100 mg | full size | re-set to "100 mg" |
| Tesamorelin 10 mg | 65.6 px, fitted to the gradient rule | unchanged |
| Sermorelin 5 mg | 72.6 px, fitted to the rule | re-set to "5 mg" |
| Hexarelin 10 mg | 83.8 px, fitted to the rule | unchanged |
| DSIP 10 mg | full size | unchanged |
| Semax 10 mg | full size | unchanged |
| Kisspeptin 10 mg | 77.6 px, fitted to the rule, raised 1 px for its descenders | unchanged |
| Oxytocin 5 mg | 88.2 px, fitted to the rule, raised 8 px for its descender | re-set to "5 mg" |

A reduced name is centred on the original name's cap band. The C1-001 rule that keeps a descender 9 px above the amount digits then raises Kisspeptin by 1 px and Oxytocin by 8 px. Reviewers should look at Oxytocin's spacing explicitly. A full-size name with a descender now stops the build for a layout review; no name in this batch is one.

### Label masters

The masters are the Batch 004 v3 front and wrap templates, transformed as Batch 008's `build-labels.mjs` does it, with the amount replaced throughout ("5 mg", "50 mg", "100 mg"). Every name fits at the template size (front 176 px, wrap front panel 146 px). The side-panel field label reads PRODUCT CODE, as in C1-001.

There is one change from C1-001. The wrap proof id is the exact product code, for example `GEN-GRP-0308-WRAP-v1`. Earlier batches used the template's code-and-amount form (`BPC157-10-WRAP-v3`, `IPAMORELIN-10-WRAP-v1`). For Kisspeptin 10 mg that form would print `KISSPEPTIN-10`, which is a fragment name its verified label facts forbid. The product code is the variant's exact identity and cannot spell a compound name.

### Previews

`tools/svg_label_render.py` draws the previews from the SVG masters:
- It uses Segoe UI faces, choosing the nearest weight with ties going to the heavier face.
- OpenType pair kerning is measured through WPF (`tools/wpf_kern.ps1`).

## Label facts

The artwork prints only these facts, each verified:
- the brand Xenios;
- the compound name;
- the amount and "N mg per vial";
- "Lyophilized vial";
- the research-use classification: "Research Use Only", "Nonclinical use only" and "For laboratory research use only.";
- the product code, on the wrap only.

It prints nothing on the do-not-print list:
- purity or assay;
- lot or expiry;
- storage temperature;
- salt form or molecular formula;
- excipients;
- supplier or manufacturer name;
- QR codes;
- dose, route or human-use text;
- supplier flyer claims.

Some compounds have their own extra terms, listed in each record's `extraDoNotPrintTerms` and checked by the verifier:
- Kisspeptin: never a fragment name such as "Kisspeptin-10".
- Oxytocin: no units, IU or USP, and no prescription-medicine name.
- Tesamorelin and Sermorelin: no approved-medicine names.
- DSIP and Semax: no benefit wording.

The supplier-owned areas on the wrap stay as blank proof notes.

## Print production still outstanding

The supplier must supply or confirm the following:
- the vial and closure specification;
- the approved dieline, seam, bleed and safe area;
- substrate, adhesive, finish, print process, colour profile and winding;
- storage copy, legal attribution, and lot and expiry/BUD;
- chemical form and excipients;
- any matched documentation destination.

The wraps are marked "SUPPLIER PROOF - NOT PRESS READY", and no supplier send has occurred. The editable masters use the template's font stack (Inter, then Segoe UI). Before a press export, the supplier proof should convert text to outlines in the chosen typeface.

## Verify

From the repository root:

```text
python -I -B -X utf8 deliveries/peptide-artwork-claude-1/2026-11-04-c1-batch-002/tools/verify_c1.py --catalog <member-safe-master-offerings.generated.json> --bindings <master-offering-bindings.generated.json> --recompute
```

The verifier checks:
- every declared file's bytes, hash and dimensions, plus the tool hashes;
- that every verified label fact is printed exactly as verified, with the product code on the wrap only;
- the exact text set of each front SVG, plus titles, descriptions and alt text;
- that the wrap proof id is the record's product code;
- the generic and per-compound do-not-print terms;
- that each render differs from the accepted Batch 004 render only inside its declared rows and columns, and that the amount rows changed when the amount is not 10 mg;
- the ids, names and bindings against the pinned datasets.

With `--recompute`, it also rebuilds every render and every label preview from the pinned tools and requires them to be pixel-identical. That proves each image shows exactly the name and amount its record declares. It needs Windows with Segoe UI and the accepted Batch 004 render, which a checkout of this branch contains.

A check it cannot run is reported as `SKIPPED`; it never counts as a pass. The supplier-name check needs `--extra-forbidden <file>`, a local list with one term per line. That list is never committed to this public repository.

To rebuild (Windows, Segoe UI installed, Pillow 12, PowerShell with WPF):

```text
python -I -B -X utf8 tools/build_c1.py kern  <batch-004 dir> <work dir> tools tools/variants.json
python -I -B -X utf8 tools/build_c1.py build <batch-004 dir> <this dir> tools tools/variants.json
python -I -B -X utf8 tools/write_manifest.py <this dir> <catalog json> <bindings json> tools/variants.json c1-002
```

## Review

Independent file-level review is requested on KAN-31, from a reviewer other than CLAUDE-1. The producer cannot be the reviewer. Rendered checks at 320, 390, 768 and 1280 px follow only after acceptance and runtime integration by Root.
