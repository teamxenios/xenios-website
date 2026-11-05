# Peptide artwork — CLAUDE-1 batch C1-008

This batch delivers Xenios website artwork and editable label masters for 2 exact research-peptide variants. It is for review only: nothing here is linked into the runtime, and the founder has approved neither publication nor physical production.

| Variant | Offering | Source variant | Product code | Label facts |
|---|---|---|---|---|
| HCG 10,000 IU | `mo_adf1037eceb9904e7d07` | `mov_e218a4fead30388a55ff` | `GEN-GRP-0298` | KAN-59/11584 |
| HCG 5000 IU | `mo_4223bdd3e6880240fc4a` | `mov_b5c50d1bb9d8ad998062` | `GEN-GRP-0299` | KAN-59/11584 |

The ids, Quick Order bindings and catalog facts are read from the release datasets. Those are `member-safe-master-offerings.generated.json` (sha256 `76b9bf6f…`) and `master-offering-bindings.generated.json` (`587595e6…`). Both are unchanged from release `19d10e04` through the live release `485885e3`.

Catalog facts:
- family `research_peptides_materials`;
- subcategory `Lyophilized Vial`;
- state `request_access`.

The printed text comes from the label facts adopted from Session 3's KAN-59/11393 proposals (KAN-59/11584). CLAUDE-2 adopted them in that comment, digest-checking the proposal file first and keeping its verified static text byte for byte (`LABEL_FACTS_ADOPTED_11393_2026-11-05.json`, sha256 `8d08fd00…`). The amounts passed source review in KAN-31/11285. The record in `media-batch.v1.json` carries its source (Jira reference, file name and sha256) and the verified static text. `tools/variants.json` is the build input made from it.

These label facts are form-neutral. They state the product name, the amount with its unit, the product code and the research classification, and no form. They hold vial and per-vial wording because the selected source states no dosage form. The vial and the per-vial amount basis printed here rest on the founder's packaging declaration (KAN-225/11259, 2026-11-05): on research peptide artwork the vial is Xenios's white-label packaging choice, not a statement about the selected source. The adopted facts carry the hold and the do-not-print terms, and say that the design form follows that declaration. In the record, `labelFacts` keeps `formNeutral: true` and the hold note, and `formBasis` cites the declaration. The manifest carries `packagingDeclaration` and lists KAN-225/11259 under `authority`. `labelFacts` stays the source of the product's name, amount, product code and classification.

Not in this batch:
- LL-37 5 mg (GEN-GRP-0312) has adopted facts in the same file. They print `LL-37`, while the catalog names the listing `Ll-37 (Cap-18)` (display name) and `LL-37 CAP-18 5 mg` (variant label). The tools accept only a variance in case, so that row waits for a declared-variance change, which goes to review as batch C1-010 (KAN-59/11618).
- The blends have label facts per component (KAN-59/11584). The first 14 follow as batch C1-009 (KAN-59/11623), under Root's layout in KAN-59/11404.
- The other rows listed in KAN-59/11381 wait for their label facts. Retatrutide 5 mg stays held on its compound crosswalk, and GEN-GRP-0337 on its malformed catalog label.

## What is in the files

For each variant, the batch contains six deliverables:

- **`assets/<variant>-website-render-v1-1024.webp`** is the website primary. It is a complete vial render at 1024 × 1024.
- **`assets/<variant>-website-render-v1.png`** is the full-resolution render master, at 1254 × 1254.
- **`labels/<variant>-front-artwork-v1.svg`** is the editable front label master, at 1600 × 1000.
- **`assets/<variant>-front-artwork-v1.png` / `.webp`** is the legible label-detail image.
- **`labels/<variant>-wrap-proof-v1.svg`** is the editable full wrap proof: front panel, fixed-identity side panel with the product code, and back-panel proof notes.
- **`assets/<variant>-wrap-proof-v1.png` / `.webp`** is the wrap preview, at 2400 × 1200.

Batch-level files:
- `contact-sheet-v1.png` shows each variant, including 72 px and 120 px phone-thumbnail views.
- `media-batch.v1.json` holds the mapping, depicted facts, label-fact sources, review candidates (alt text and caption), and every file's bytes, sha256 and dimensions.
- Internal source evidence is not in this repository, because the repository is public. It is in the private KAN-59 handoff.
- `tools/` holds the build, render, kerning and verification sources, the measured kern table, the build report and `variants.json`.

Website caption for every image: **"Packaging design shown. Current packaging may differ."**

## How the artwork was made

No generative image model was used, and all lettering is set from installed fonts. The method is the same as in batch C1-007 (commit `21963459`). This is the first batch with amounts in IU. Each amount prints as the facts give it, "10,000 IU" and "5000 IU", and no mass unit is printed anywhere.

The tools changed since C1-007 in two ways, neither of which alters an image in an earlier batch:
- **Alt text.** It follows KAN-59/11405, as accepted for the live registry in KAN-59/11511: "Xenios {name} {amount} packaging design" for the render and "Front label artwork for Xenios {name} {amount}" for the label detail, with no form or container wording. `write_manifest.py` writes it. `verify_c1.py` binds each website role to it and fails form wording. `verify_c1.py` also counts ng, pg, nanogram and picogram as mass units an IU record must not print. KAN-31/11570 accepted these changes.
- **Blend layout.** `build_c1.py` and `xr_compose.py` carry Root's Option B layout for blend names (KAN-59/11404). This batch has no blend. With these copies, every label master, name fit and layout of C1-001 to C1-007 is unchanged (753 of 753 compared), and C1-006 and C1-007 rebuild byte for byte.

`svg_label_render.py` and `wpf_kern.ps1` are byte-identical to C1-007's copies. `c1_variants.py` gains the reference of the adopted facts and HCG's do-not-print terms. `write_manifest.py` gains this batch's claim reference and `changesFromC1007`. `variants.json`, the kern table and the build report are this batch's own.

### Vial renders

The base is the accepted Batch 004 BPC-157 10 mg v3 render (`KAN-31/10627`, sha256 `674868e8…`). The steps:

1. The name rows are refilled with clean label paper (columns 448–807): rows 567–671, or rows 567–742 when the amount changes too.
2. The new text is set in Segoe UI Bold, matched to the render: name 91.6 px, amount 63.2 px.
3. Every other pixel is byte-identical to the accepted render. `tools/verify_c1.py` checks this.

How each name and amount is set:

| Variant | Name on the render | Amount on the render |
|---|---|---|
| HCG 10,000 IU | full size, 91.6 px, on the original baseline (row 657) | re-set to "10,000 IU" at 63.2 px |
| HCG 5000 IU | full size, 91.6 px, on the original baseline (row 657) | re-set to "5000 IU" at 63.2 px |

A name that fits at 91.6 px is set at full size on the original baseline. A reduced name is fitted to the gradient rule and centred on the original name's cap band, then raised if needed so a descender stays 9 px above the amount digits. No reduced name needed raising. A name that would fall below 70% size and contains a space is stacked on two lines, with the amount scaled by the same factor, but only when stacking sets the name larger than one line does (a condition added in C1-005). No name in this batch is stacked. A full-size name with a descender would stop the build for a layout review; no name in this batch is one.

The build report in `tools/` shows every value.

### Label masters

The masters are the Batch 004 v3 front and wrap templates, transformed as Batch 008's `build-labels.mjs` does it, with the amount and its unit replaced throughout. Every name fits at the template size (front 176 px, wrap front panel 146 px). The side-panel field label reads PRODUCT CODE.

As in C1-002 to C1-007, the wrap proof id and the manifest's `artworkVersion` are the exact product code, for example `GEN-GRP-0298-WRAP-v1` and `GEN-GRP-0298-WEB-SUPPLIER-v1`.

### Previews

`tools/svg_label_render.py` draws the previews from the SVG masters:
- It uses Segoe UI faces, choosing the nearest weight with ties going to the heavier face.
- OpenType pair kerning is measured through WPF (`tools/wpf_kern.ps1`).

## Label facts

The artwork prints only these. From the verified label facts:
- the brand Xenios;
- the compound name;
- the amount with its unit, as the facts give it;
- the classification "For laboratory research use only.";
- the product code, on the wrap only.

From the accepted Batch 004 template, unchanged: "Research Use Only" and "Nonclinical use only", the research and nonclinical wording that KAN-59/11405 asks research-only variants to carry. The C1-001 to C1-006 READMEs listed these two lines with the label facts, but none of CLAUDE-2's label-facts files carries them. Every manifest from C1-002 on records all three lines in each record's `classificationOnArtwork`.

Under the packaging declaration (KAN-225/11259):
- "Lyophilized vial";
- the per-vial amount basis: the amount, then "per vial".

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

Each compound's extra terms from its label facts are listed in the record's `extraDoNotPrintTerms`, and the verifier checks them on every printed string. For HCG they cover recombinant or urinary origin and clinical, pregnancy and fertility wording. Mass units are barred separately: for an amount in IU the verifier fails any printed mass unit, because the facts forbid a mass equivalent. A term matches only where no letter follows it, so the list carries each form of a word.

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
python -I -B -X utf8 deliveries/peptide-artwork-claude-1/2026-11-05-c1-batch-008/tools/verify_c1.py --catalog <member-safe-master-offerings.generated.json> --bindings <master-offering-bindings.generated.json> --recompute
```

The verifier checks:
- every declared file's bytes, hash and dimensions, plus the tool hashes;
- that every verified label fact is printed exactly as verified, with the product code on the wrap only;
- that each record's amount is the amount of its label facts, with its unit, is printed with "per vial" on the labels, and agrees with the variant name and `nominalAmountPerVialMg`, which is the integer for an amount in mg and null for any other unit;
- for an amount not in mg, that no printed string or alt text states a mass unit;
- that the top-level label-fact index lists exactly the records' label-fact files, by reference, file and sha256;
- that the declared vial and per-vial basis are printed, and that each record's form basis cites the manifest's packaging declaration, which is listed under `authority`;
- the exact text set of each front SVG, plus titles, descriptions and alt text;
- that the wrap proof id and `artworkVersion` are the record's product code;
- the generic and per-compound do-not-print terms;
- that each render differs from the accepted Batch 004 render only inside its declared rows and columns, and that the amount rows changed when the amount is not 10 mg;
- the ids, names and bindings against the pinned datasets.

With `--recompute`, it also rebuilds every render and every label preview from the pinned tools and requires them to be pixel-identical. That proves each image shows exactly the name and amount its record declares. It needs Windows with Segoe UI and the accepted Batch 004 render, which a checkout of this branch contains.

Every text file is committed with LF line ends. A Windows checkout with `core.autocrlf` rewrites them to CRLF, so the verifier folds CRLF back to LF before hashing them, release datasets included, and prints a NOTE naming them. PNG and WebP files are hashed as they are.

A check it cannot run is reported as `SKIPPED`; it never counts as a pass. The supplier-name check needs `--extra-forbidden <file>`, a local list with one term per line. That list is never committed to this public repository.

To rebuild (Windows, Segoe UI installed, Pillow 12, PowerShell with WPF):

```text
python -I -B -X utf8 tools/build_c1.py kern  <batch-004 dir> <work dir> tools tools/variants.json
python -I -B -X utf8 tools/build_c1.py build <batch-004 dir> <this dir> tools tools/variants.json
python -I -B -X utf8 tools/write_manifest.py <this dir> <catalog json> <bindings json> tools/variants.json c1-008
```

`wpf_kern.ps1` writes the kern table with CRLF line ends. The committed table has LF, and both the manifest and the verifier hash it with CRLF folded to LF.

## Review

Independent file-level review goes to KAN-31; the producer cannot be the reviewer. Root integrates accepted artwork. Neither HCG row has reviewed copy yet, and whether a row needs it before release is Root's decision. Rendered checks at 320, 390, 768 and 1280 px follow only after acceptance and runtime integration by Root.
