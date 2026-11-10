# Peptide artwork — CLAUDE-1 batch C1-012

This batch delivers Xenios website artwork and editable label masters for 4 exact research-peptide variants. It is for review only: nothing here is linked into the runtime, and the founder has approved neither publication nor physical production.

| Variant | Offering | Source variant | Product code | Label facts |
|---|---|---|---|---|
| Epithalon 10 mg | `mo_9c3a4dd1b38f6b9ebc54` | `mov_9421188f57af62413a4c` | `GEN-GRP-0282` | KAN-59/12084 |
| Epithalon 50 mg | `mo_c0b32b7549d7539af51e` | `mov_c4e5006693c890563310` | `GEN-GRP-0286` | KAN-59/12084 |
| GHRP-6 5 mg | `mo_f8e8d69d2068c9bb2de1` | `mov_556cf3eb15555573aa54` | `GEN-GRP-0293` | KAN-59/12084 |
| SS-31 10 mg | `mo_e7bb199ac249b82eb17b` | `mov_dd89c37657eb69bce04f` | `GEN-GRP-0343` | KAN-59/12084 |

The ids, Quick Order bindings and catalog facts are read from the release datasets. Those are `member-safe-master-offerings.generated.json` (sha256 `76b9bf6f…`) and `master-offering-bindings.generated.json` (`587595e6…`). Both are byte-identical to the datasets of the live release `ad52179f` (blob ids checked on 2026-11-10).

Catalog facts:
- family `research_peptides_materials`;
- subcategory `Lyophilized Vial`;
- state `request_access`.

The printed text comes from the label facts adopted from CLAUDE-1's KAN-59/11984 proposals (KAN-59/12084) (`LABEL_FACTS_ADOPTED_C1012_2026-11-10.json`, sha256 `fdaec2a4…`). Every compound in this batch already has accepted label facts and accepted artwork at another strength. CLAUDE-1 proposed seven records in KAN-59/11984 by copying each compound's product name, classification and do-not-print terms unchanged from that accepted record, and taking the amount from the pinned variant label, which must read exactly the name in capitals followed by the amount in mg. CLAUDE-2 adopted the four in this batch in KAN-59/12084, after checking each row against its selected source. The record in `media-batch.v1.json` carries its source (Jira reference, file name and sha256) and the verified static text. `tools/variants.json` is the build input made from it.

These label facts are form-neutral. They state the product name, the amount with its unit, the product code and the research classification, and no form. They hold vial and per-vial wording because the selected source states no dosage form. The vial and the per-vial amount basis printed here rest on the founder's packaging declaration (KAN-225/11259, 2026-11-05): on research peptide artwork the vial is Xenios's white-label packaging choice, not a statement about the selected source. The facts carry the hold and the do-not-print terms. In the record, `labelFacts` keeps `formNeutral: true` and the hold note, and `formBasis` cites the declaration. The manifest carries `packagingDeclaration` and lists KAN-225/11259 under `authority`. `labelFacts` stays the source of the product's name, amount, product code and classification.

One printed name follows the verified label facts where the catalog display name differs only in case: SS-31 (catalog `Ss-31`). Each record's `nameVariance` records it; the dataset wording is Root's decision.

Drawn before: GHRP-6 at 10 mg in C1-005; Epithalon at 20, 30 and 35 mg in C1-005; SS-31 at 50 mg in C1-006. Here they keep that name setting (GHRP-6 and SS-31 at full size, 91.6 px on row 657; Epithalon at 84.8 px on row 648), and only the amount line differs.

Not in this batch:
- Semaglutide 20 mg (GEN-GRP-0335) and Tirzepatide 50 and 60 mg (0359 and 0361) were proposed with these four and not adopted. They wait on a catalog decision about which compound each row supplies.
- TB-500 (GEN-GRP-0345 and 0346), IGF-1 LR3 (0301), MGF (0316), Snap-8 (0342) and Thymalin (0349) have no accepted single-compound label facts to copy from, so nothing was proposed for them.
- The single-compound CJC-1295 rows, GEN-GRP-0270 to 0273, stay on the compound-identity question in KAN-59/11972.
- GEN-GRP-0337 waits on its malformed catalog label.

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

No generative image model was used, and all lettering is set from installed fonts. The method is the same as in batch C1-011 (commit `ca3d512d`, in review in KAN-31/11980). Every name here is a single compound, so the single-name rules set it, not the blend rule (Option B, KAN-59/11404).

`build_c1.py`, `xr_compose.py`, `svg_label_render.py`, `wpf_kern.ps1` and `verify_c1.py` are byte-identical to C1-011's copies, which are C1-009's. The verifier is the one accepted in KAN-31/11570. `c1_variants.py` gains only the reference of the adopted label facts (KAN-59/12084). `write_manifest.py` gains this batch's claim reference (KAN-59/12085) and `changesFromC1011`. `variants.json`, the kern table and the build report are this batch's own.

### Vial renders

The base is the accepted Batch 004 BPC-157 10 mg v3 render (`KAN-31/10627`, sha256 `674868e8…`). The steps:

1. The name rows are refilled with clean label paper (columns 448–807): rows 567–671, or rows 567–742 when the amount changes too.
2. The new text is set in Segoe UI Bold, matched to the render: name 91.6 px, amount 63.2 px.
3. Every other pixel is byte-identical to the accepted render. `tools/verify_c1.py` checks this.

How each name and amount is set:

| Variant | Name on the render | Amount on the render |
|---|---|---|
| Epithalon 10 mg | 84.8 px, fitted to the rule, baseline row 648, raised 6 px so its descender stays 9 px above the amount | unchanged "10 mg" |
| Epithalon 50 mg | 84.8 px, fitted to the rule, baseline row 648, raised 6 px so its descender stays 9 px above the amount | re-set to "50 mg" at 63.2 px |
| GHRP-6 5 mg | full size, 91.6 px, on the original baseline (row 657) | re-set to "5 mg" at 63.2 px |
| SS-31 10 mg | full size, 91.6 px, on the original baseline (row 657) | unchanged "10 mg" |

A name that fits at 91.6 px is set at full size on the original baseline. A reduced name is fitted to the gradient rule and centred on the original name's cap band, then raised if needed so a descender stays 9 px above the amount digits. Epithalon is raised for a descender. A name that would fall below 70% size and contains a space is stacked on two lines, with the amount scaled by the same factor, but only when stacking sets the name larger than one line does (a condition added in C1-005). No name in this batch is stacked. A full-size name with a descender would stop the build for a layout review; no name in this batch is one.

The build report in `tools/` shows every value.

### Label masters

The masters are the Batch 004 v3 front and wrap templates, transformed as Batch 008's `build-labels.mjs` does it, with the amount and its unit replaced throughout. Every name fits at the template size (front 176 px, wrap front panel 146 px). The side-panel field label reads PRODUCT CODE.

As in C1-002 to C1-011, the wrap proof id and the manifest's `artworkVersion` are the exact product code, for example `GEN-GRP-0282-WRAP-v1` and `GEN-GRP-0282-WEB-SUPPLIER-v1`.

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

Each compound's extra terms from its label facts are listed in the record's `extraDoNotPrintTerms`, and the verifier checks them on every printed string. For each compound they are the terms of its accepted record at the other strength, unchanged, plus the KAN-31/10870 bar on vial and per-vial wording. A term matches only where no letter follows it, so the list carries each form of a word.

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
python -I -B -X utf8 deliveries/peptide-artwork-claude-1/2026-11-10-c1-batch-012/tools/verify_c1.py --catalog <member-safe-master-offerings.generated.json> --bindings <master-offering-bindings.generated.json> --recompute
```

The verifier checks:
- every declared file's bytes, hash and dimensions, plus the tool hashes;
- that every verified label fact is printed exactly as verified, with the product code on the wrap only;
- that each record's amount is the amount of its label facts, with its unit, is printed with "per vial" on the labels, and agrees with the variant name and `nominalAmountPerVialMg`, which is the integer for an amount in mg and null for any other unit or for a blend;
- for a blend, that the components are the name segments in order and the printed amount is their amounts joined in that order;
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
python -I -B -X utf8 tools/write_manifest.py <this dir> <catalog json> <bindings json> tools/variants.json c1-012
```

`wpf_kern.ps1` writes the kern table with CRLF line ends. The committed table has LF, and both the manifest and the verifier hash it with CRLF folded to LF.

## Review

Independent file-level review goes to KAN-31; the producer cannot be the reviewer. Root integrates accepted artwork. Whether a row needs accepted copy before release is Root's decision. Rendered checks at 320, 390, 768 and 1280 px follow only after acceptance and runtime integration by Root.
