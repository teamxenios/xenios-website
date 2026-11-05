# Peptide artwork — CLAUDE-1 batch C1-004

This batch delivers Xenios website artwork and editable label masters for three exact research-peptide variants. It is for review only: nothing here is linked into the runtime, and the founder has approved neither publication nor physical production.

| Variant | Offering | Source variant | Product code | Label facts |
|---|---|---|---|---|
| Retatrutide 10 mg | `mo_f7fecc82508964efe3aa` | `mov_0c4a5438cc87ab9d85b6` | `GEN-GRP-0323` | KAN-59/10855 |
| Retatrutide 15 mg | `mo_e230262ae1c41d2d7e18` | `mov_8f14c1dd839544567d53` | `GEN-GRP-0324` | KAN-59/10855 |
| Retatrutide 30 mg | `mo_f293ba683340fcd926d9` | `mov_7bd700ce0704d66e614e` | `GEN-GRP-0326` | KAN-59/10855 |

The ids, Quick Order bindings and catalog facts are read from the release datasets. Those are `member-safe-master-offerings.generated.json` (sha256 `76b9bf6f…`) and `master-offering-bindings.generated.json` (`587595e6…`), both unchanged at release `19d10e04`.

All three have the same catalog facts:
- family `research_peptides_materials`;
- subcategory `Lyophilized Vial`;
- state `request_access`.

The printed text comes from CLAUDE-2's verified label facts for research batch 05. Each record in `media-batch.v1.json` carries its source (Jira reference, file name and sha256) and the verified static text. `tools/variants.json` is the build input made from them. The vial and the per-vial amount basis rest on the founder's packaging declaration (KAN-225/11259, 2026-11-05): on research peptide artwork the vial is Xenios's white-label packaging choice, not a statement about the selected source. Each record's `formBasis` and the manifest's `packagingDeclaration` cite it; `labelFacts` stays the source of each product's name, amount, product code and classification.

## Correction, 2026-11-05 (KAN-59/11283)

Independent file review of the first commit (`42308151`, manifest sha256 `e53c7c27…`) found that the manifest did not record the packaging declaration, although this README and the commit message cited it, so its records attributed the vial and per-vial fields to KAN-59/10855 alone. This successor is metadata only. It adds `formBasis` to each record and `packagingDeclaration` to the manifest, lists KAN-225/11259 under `authority`, and records the change under `corrections`. `tools/variants.json` now carries the declaration per record, and `c1_variants.py`, `write_manifest.py` and `verify_c1.py` carry and check a declaration on form-bearing facts as well as form-neutral ones. No render, label master, preview or contact sheet changed; every image file has the same bytes and hash as before.

Label-fact batch 05 covers eight vials. Five were held for source confirmation of form and amount basis (KAN-31/10870) and are not in this batch: Retatrutide 5, 20, 40 and 50 mg, and SS-31 50 mg. Under the declaration, Retatrutide 20, 40 and 50 mg and SS-31 50 mg can follow in a later batch; Retatrutide 5 mg stays held on its compound crosswalk.

Retatrutide has no sibling drawn before this batch. The three strengths share one name setting; only the amount differs.

## What is in the files

For each variant, the batch contains six deliverables:

- **`assets/<variant>-website-render-v1-1024.webp`** is the website primary. It is a complete vial render at 1024 × 1024.
- **`assets/<variant>-website-render-v1.png`** is the full-resolution render master, at 1254 × 1254.
- **`labels/<variant>-front-artwork-v1.svg`** is the editable front label master, at 1600 × 1000.
- **`assets/<variant>-front-artwork-v1.png` / `.webp`** is the legible label-detail image.
- **`labels/<variant>-wrap-proof-v1.svg`** is the editable full wrap proof: front panel, fixed-identity side panel with the product code, and back-panel proof notes.
- **`assets/<variant>-wrap-proof-v1.png` / `.webp`** is the wrap preview, at 2400 × 1200.

Batch-level files:
- `contact-sheet-v1.png` shows all three variants, including 72 px and 120 px phone-thumbnail views.
- `media-batch.v1.json` holds the mapping, depicted facts, label-fact sources, review candidates (alt text and caption), and every file's bytes, sha256 and dimensions.
- Internal source evidence is not in this repository, because the repository is public. It is in the private KAN-59 handoff.
- `tools/` holds the build, render, kerning and verification sources, the measured kern table, the build report and `variants.json`.

Website caption for every image: **"Packaging design shown. Current packaging may differ."**

## How the artwork was made

No generative image model was used, and all lettering is set from installed fonts. The method and tools are the same as in batch C1-003. `build_c1.py`, `xr_compose.py`, `svg_label_render.py` and `wpf_kern.ps1` are byte-identical to C1-003's copies (commit `c5b93b3a`). `c1_variants.py` adds the batch 05 label-fact reference and the per-compound do-not-print terms for both batch 05 compounds. `write_manifest.py` takes the date in the batch path and id from the batch folder name. Since the correction above, `c1_variants.py`, `write_manifest.py` and `verify_c1.py` also carry and check the packaging declaration, and `c1_variants.py` holds the references and terms of the later label-fact batches; none of these changes touches how an image is made.

### Vial renders

The base is the accepted Batch 004 BPC-157 10 mg v3 render (`KAN-31/10627`, sha256 `674868e8…`). The steps:

1. The name rows are refilled with clean label paper (columns 448–807): rows 567–671, or rows 567–742 when the amount changes too.
2. The new text is set in Segoe UI Bold, matched to the render: name 91.6 px, amount 63.2 px.
3. Every other pixel is byte-identical to the accepted render. `tools/verify_c1.py` checks this.

How each name and amount is set:

| Variant | Name on the render | Amount on the render |
|---|---|---|
| Retatrutide 10 mg | 70.2 px, fitted to the gradient rule and centred on the original name's cap band | unchanged "10 mg" |
| Retatrutide 15 mg | 70.2 px, as above | re-set to "15 mg" |
| Retatrutide 30 mg | 70.2 px, as above | re-set to "30 mg" |

A reduced name is centred on the original name's cap band, then raised if needed so a descender stays 9 px above the amount digits. "Retatrutide" has no descender, so it is not raised. A name that would fall below 70% size and contains a space is stacked on two lines; this name is not one.

All three renders use the same name run (70.2 px, baseline row 648). The build report in `tools/` shows the values.

### Label masters

The masters are the Batch 004 v3 front and wrap templates, transformed as Batch 008's `build-labels.mjs` does it, with the amount replaced throughout ("15 mg", "30 mg"). The name fits at the template size (front 176 px, wrap front panel 146 px). The side-panel field label reads PRODUCT CODE.

As in C1-002 and C1-003, the wrap proof id and the manifest's `artworkVersion` are the exact product code, for example `GEN-GRP-0323-WRAP-v1` and `GEN-GRP-0323-WEB-SUPPLIER-v1`.

### Previews

`tools/svg_label_render.py` draws the previews from the SVG masters:
- It uses Segoe UI faces, choosing the nearest weight with ties going to the heavier face.
- OpenType pair kerning is measured through WPF (`tools/wpf_kern.ps1`).

## Label facts

The artwork prints only these. From the verified label facts:
- the brand Xenios;
- the compound name;
- the amount;
- the research-use classification: "Research Use Only", "Nonclinical use only" and "For laboratory research use only.";
- the product code, on the wrap only.

Under the packaging declaration (KAN-225/11259):
- "Lyophilized vial";
- the per-vial amount basis, "N mg per vial".

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

Retatrutide has its own extra terms, listed in each record's `extraDoNotPrintTerms` and checked by the verifier on every printed string: no developer code or company name, and no weight, appetite, glycemic, metabolic, liver or clinical-trial wording.

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
python -I -B -X utf8 deliveries/peptide-artwork-claude-1/2026-11-05-c1-batch-004/tools/verify_c1.py --catalog <member-safe-master-offerings.generated.json> --bindings <master-offering-bindings.generated.json> --recompute
```

The verifier checks:
- every declared file's bytes, hash and dimensions, plus the tool hashes;
- that every verified label fact is printed exactly as verified, with the product code on the wrap only;
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
python -I -B -X utf8 tools/write_manifest.py <this dir> <catalog json> <bindings json> tools/variants.json c1-004
```

## Review

Independent file-level review of the first commit is recorded in KAN-59/11283, which asked for the manifest correction above; a bounded recheck of this successor goes to the same reviewer, not CLAUDE-1. The producer cannot be the reviewer. Rendered checks at 320, 390, 768 and 1280 px follow only after acceptance and runtime integration by Root.
