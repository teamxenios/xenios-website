# Peptide artwork — CLAUDE-1 batch C1-003

This batch delivers Xenios website artwork and editable label masters for five exact research-peptide variants. It is for review only: nothing here is linked into the runtime, and the founder has approved neither publication nor physical production.

| Variant | Offering | Source variant | Product code | Label facts |
|---|---|---|---|---|
| Ipamorelin 5 mg | `mo_b2300ccf4ffd64e20ca2` | `mov_cd50ffa15bc031572636` | `GEN-GRP-0303` | KAN-59/10667 |
| Thymosin Alpha-1 5 mg | `mo_8fd0e604ab7719eded45` | `mov_cacbbed2b1431c073e72` | `GEN-GRP-0351` | KAN-59/10667 |
| Tesamorelin 5 mg | `mo_941e1192f6c03d88cb43` | `mov_52fd0b8a213ee19e40e8` | `GEN-GRP-0348` | KAN-59/10681 |
| Sermorelin 10 mg | `mo_005347c6204a94d3f7e2` | `mov_6a43249c424441bf28bb` | `GEN-GRP-0340` | KAN-59/10681 |
| Oxytocin 2 mg | `mo_b785d68e84643da31a20` | `mov_cf7635f44beb5898b8fe` | `GEN-GRP-0319` | KAN-59/10687 |

The ids, Quick Order bindings and catalog facts are read from the release datasets. Those are `member-safe-master-offerings.generated.json` (sha256 `76b9bf6f…`) and `master-offering-bindings.generated.json` (`587595e6…`), both unchanged at release `19d10e04`.

All five have the same catalog facts:
- family `research_peptides_materials`;
- subcategory `Lyophilized Vial`;
- state `request_access`.

The printed text comes from CLAUDE-2's verified label facts. Each record in `media-batch.v1.json` carries its source (Jira reference, file name and sha256) and the verified static text. `tools/variants.json` is the build input made from them.

These five are siblings of variants already drawn:
- Ipamorelin 10 mg and Thymosin Alpha-1 10 mg are in batch C1-001.
- Tesamorelin 10 mg, Sermorelin 5 mg and Oxytocin 5 mg are in batch C1-002.

Each name here is set exactly as on its sibling. Only the amount differs.

## What is in the files

For each variant, the batch contains six deliverables:

- **`assets/<variant>-website-render-v1-1024.webp`** is the website primary. It is a complete vial render at 1024 × 1024.
- **`assets/<variant>-website-render-v1.png`** is the full-resolution render master, at 1254 × 1254.
- **`labels/<variant>-front-artwork-v1.svg`** is the editable front label master, at 1600 × 1000.
- **`assets/<variant>-front-artwork-v1.png` / `.webp`** is the legible label-detail image.
- **`labels/<variant>-wrap-proof-v1.svg`** is the editable full wrap proof: front panel, fixed-identity side panel with the product code, and back-panel proof notes.
- **`assets/<variant>-wrap-proof-v1.png` / `.webp`** is the wrap preview, at 2400 × 1200.

Batch-level files:
- `contact-sheet-v1.png` shows all five variants, including 72 px and 120 px phone-thumbnail views.
- `media-batch.v1.json` holds the mapping, depicted facts, label-fact sources, review candidates (alt text and caption), and every file's bytes, sha256 and dimensions.
- Internal source evidence is not in this repository, because the repository is public. It is in the private KAN-59 handoff.
- `tools/` holds the build, render, kerning and verification sources, the measured kern table, the build report and `variants.json`.

Website caption for every image: **"Packaging design shown. Current packaging may differ."**

## How the artwork was made

No generative image model was used, and all lettering is set from installed fonts. The method and tools are the same as in batch C1-002. Every tool except `write_manifest.py` is byte-identical to C1-002's copy as corrected in KAN-31/10737.

### Vial renders

The base is the accepted Batch 004 BPC-157 10 mg v3 render (`KAN-31/10627`, sha256 `674868e8…`). The steps:

1. The name rows are refilled with clean label paper (columns 448–807): rows 567–671, or rows 567–742 when the amount changes too.
2. The new text is set in Segoe UI Bold, matched to the render: name 91.6 px, amount 63.2 px.
3. Every other pixel is byte-identical to the accepted render. `tools/verify_c1.py` checks this.

How each name and amount is set:

| Variant | Name on the render | Amount on the render |
|---|---|---|
| Ipamorelin 5 mg | 73.8 px, fitted to the gradient rule | re-set to "5 mg" |
| Thymosin Alpha-1 5 mg | stacked on two lines ("Thymosin" / "Alpha-1") at 57.7 px | "5 mg" at 39.8 px, inside the stack |
| Tesamorelin 5 mg | 65.6 px, fitted to the rule | re-set to "5 mg" |
| Sermorelin 10 mg | 72.6 px, fitted to the rule | unchanged "10 mg" |
| Oxytocin 2 mg | 88.2 px, fitted to the rule, raised 8 px for its descender | re-set to "2 mg" |

A reduced name is centred on the original name's cap band, then raised if needed so a descender stays 9 px above the amount digits. A name that would fall below 70% size and contains a space is stacked on two lines, with the amount scaled by the same factor.

Each name's render run, front size and wrap size are identical to its sibling's in C1-001 or C1-002. The build reports in each batch's `tools/` show the same values. Reviewers should look at Oxytocin's spacing explicitly, as in C1-002.

### Label masters

The masters are the Batch 004 v3 front and wrap templates, transformed as Batch 008's `build-labels.mjs` does it, with the amount replaced throughout ("2 mg", "5 mg"). Four names fit at the template size (front 176 px, wrap front panel 146 px). Thymosin Alpha-1 is fitted to 160.5 px on the front and 101 px on the wrap front panel, as on its C1-001 sibling. The side-panel field label reads PRODUCT CODE.

As in C1-002, the wrap proof id and the manifest's `artworkVersion` are the exact product code, for example `GEN-GRP-0303-WRAP-v1` and `GEN-GRP-0303-WEB-SUPPLIER-v1`. The template's code-and-amount form can spell a fragment name that label facts forbid (`KISSPEPTIN-10` in C1-002).

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
- Oxytocin: no units, IU or USP, and no prescription-medicine name or the listed wording.
- Tesamorelin and Sermorelin: no approved-medicine names.

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
python -I -B -X utf8 deliveries/peptide-artwork-claude-1/2026-11-04-c1-batch-003/tools/verify_c1.py --catalog <member-safe-master-offerings.generated.json> --bindings <master-offering-bindings.generated.json> --recompute
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
python -I -B -X utf8 tools/write_manifest.py <this dir> <catalog json> <bindings json> tools/variants.json c1-003
```

## Review

Independent file-level review is requested on KAN-31, from a reviewer other than CLAUDE-1. The producer cannot be the reviewer. Rendered checks at 320, 390, 768 and 1280 px follow only after acceptance and runtime integration by Root.

## Correction, 2026-11-04

Codex imagery passed the visual review of commit `b189bc92` (KAN-31/10775) and asked for the Windows checkout fix made for C1-002. This commit makes it:
- `tools/verify_c1.py`, `tools/build_c1.py` and `tools/write_manifest.py` now hash text files as committed, with LF line ends, so a checkout with `core.autocrlf` verifies, release dataset joins included. Four tool files had been committed with CRLF line ends (`build_c1.py`, `xr_compose.py`, `wpf_kern.ps1` and `kern-table.segoe-ui.json`). A Windows checkout leaves those untouched and converts the LF ones, which is why five tool hashes failed. They are now LF like every other text file; only their line ends changed.
- As in C1-002, `artworkVersion` is now the exact product code for every record, and the verifier checks it.

Every image, label master and the contact sheet is byte-identical to `b189bc92`, including the ten website WebPs and the five wraps. The manifest records the change in `corrections`.
