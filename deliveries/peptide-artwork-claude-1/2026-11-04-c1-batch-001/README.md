# Peptide artwork — CLAUDE-1 batch C1-001

This batch delivers Xenios website artwork and editable label masters for four exact research-peptide variants. It is for review only: nothing here is linked into the runtime, and the founder has approved neither publication nor physical production.

| Variant | Offering | Source variant | Product code |
|---|---|---|---|
| Ipamorelin 10 mg | `mo_e9e1c849f7549246cb89` | `mov_80aaef9ddc11edab6c89` | `GEN-GRP-0302` |
| KPV 10 mg | `mo_bb39fc388cb58003b1f8` | `mov_15eddad2da8035493bd6` | `GEN-GRP-0306` |
| Selank 10 mg | `mo_d045624d6f5d00d2cda2` | `mov_99e4c4e045d188c3026f` | `GEN-GRP-0331` |
| Thymosin Alpha-1 10 mg | `mo_f23a8023a45df853f6e1` | `mov_ba80c9a61870131db0cf` | `GEN-GRP-0350` |

The ids, Quick Order bindings and catalog facts are read from the release datasets. Those are `member-safe-master-offerings.generated.json` (sha256 `76b9bf6f…`) and `master-offering-bindings.generated.json` (`587595e6…`), both unchanged at release `19d10e04`.

All four have the same catalog facts:
- family `research_peptides_materials`;
- subcategory `Lyophilized Vial`;
- state `request_access`.

## What is in the files

For each variant, the batch contains six deliverables:

- **`assets/<variant>-website-render-v1-1024.webp`** is the website primary. It is a complete vial render at 1024 × 1024.
- **`assets/<variant>-website-render-v1.png`** is the full-resolution render master, at 1254 × 1254.
- **`labels/<variant>-front-artwork-v1.svg`** is the editable front label master, at 1600 × 1000.
- **`assets/<variant>-front-artwork-v1.png` / `.webp`** is the legible label-detail image.
- **`labels/<variant>-wrap-proof-v1.svg`** is the editable full wrap proof: front panel, fixed-identity side panel with the product code, and back-panel proof notes.
- **`assets/<variant>-wrap-proof-v1.png` / `.webp`** is the wrap preview, at 2400 × 1200.

Batch-level files:
- `contact-sheet-v1.png` shows all four variants, including 72 px and 120 px phone-thumbnail views.
- `media-batch.v1.json` holds the mapping, depicted facts, review candidates (alt text and caption), and every file's bytes, sha256 and dimensions.
- Internal source evidence (workbook rows and selected-source references) is not in this repository, because the repository is public. It is summarized in the private KAN-59 handoff.
- `tools/` holds the build, render, kerning and verification sources, plus the measured kern table.

Website caption for every image: **"Packaging design shown. Current packaging may differ."**

## How the artwork was made

No generative image model was used, and all lettering is set from installed fonts.

### Vial renders

The base is the accepted Batch 004 BPC-157 10 mg v3 render (`KAN-31/10627`, sha256 `674868e8…`). The steps:

1. The name rows are refilled with clean label paper (columns 448–807): rows 567–671, or rows 567–742 when the amount moves too.
2. The new name is set in Segoe UI Bold, matched to the render: name 91.6 px, amount 63.2 px.
3. Every other pixel is byte-identical to the accepted render. `tools/verify_c1.py` checks this.

How each name is set:

| Variant | Setting |
|---|---|
| KPV, Selank | Full size, on the exact BPC-157 rows |
| Ipamorelin | 73.8 px, so it fits the gradient rule |
| Thymosin Alpha-1 | Name on two lines at 57.7 px, "10 mg" scaled by the same factor to 39.8 px |

Thymosin Alpha-1 would fit on one line only at 43.6 px, which is smaller than the amount. Stacking keeps the name visually above the dose. This is the one layout change in the batch; reviewers should judge it explicitly.

### Label masters

The masters are the Batch 004 v3 front and wrap templates, transformed exactly as Batch 008's `build-labels.mjs` does it. My Python port, run on BPC-157 5 mg, reproduces Batch 008's SVGs byte for byte apart from one wording change (below).

On top of that transformation:
- **Compound name.** On the front label master, Thymosin Alpha-1 is fitted to the rule at 160.5 px (template 176). On the wrap's front panel it is 101 px (template 146), centred on the template's cap band.
- **Field label PRODUCT CODE.** It replaces QUICK ORDER SKU, so the label uses the "Product code GEN-GRP-xxxx" wording from the Session 3 facts (`KAN-6/10624`) and CLAUDE-2's label facts (`KAN-59/10654`).

### Previews

`tools/svg_label_render.py` draws the previews from the SVG masters:
- It uses Segoe UI faces, choosing the nearest weight with ties going to the heavier face.
- OpenType pair kerning is measured through WPF (`tools/wpf_kern.ps1`).

Against the accepted Batch 004 previews, the mean absolute difference is 0.80 (front) and 1.61 (wrap) of 255.

Batch 008's previews resolve weight 800 (XENIOS, RESEARCH USE ONLY) to Segoe UI Bold. These previews follow the accepted Batch 004 previews, which use Segoe UI Black.

## Label facts

The artwork prints only these facts, each verified:
- the brand Xenios;
- the compound name;
- "10 mg" and "10 mg per vial";
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
python -I -X utf8 deliveries/peptide-artwork-claude-1/2026-11-04-c1-batch-001/tools/verify_c1.py --catalog <member-safe-master-offerings.generated.json> --bindings <master-offering-bindings.generated.json>
```

The verifier checks:
- every declared file's bytes, hash and dimensions, plus the tool hashes;
- the exact text set of each SVG against its record;
- the do-not-print terms;
- that each render differs from the accepted Batch 004 render only inside its declared rows and columns;
- the ids and bindings against the pinned datasets.

A check it cannot run is reported as `SKIPPED`; it never counts as a pass.

The supplier-name check needs `--extra-forbidden <file>`, a local list with one term per line. That list is never committed to this public repository.

To rebuild (Windows, Segoe UI installed, Pillow 12, PowerShell with WPF):

```text
python -I -X utf8 tools/build_c1.py kern  <batch-004 dir> <work dir> tools
python -I -X utf8 tools/build_c1.py build <batch-004 dir> <this dir> tools
python -I -X utf8 tools/write_manifest.py <this dir> <catalog json> <bindings json>
```

## Review

Independent file-level review is requested on KAN-31. The producer cannot be the reviewer. Rendered checks at 320, 390, 768 and 1280 px follow only after acceptance and runtime integration by Root.
