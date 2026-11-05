# Peptide artwork — CLAUDE-1 batch C1-006

This batch delivers Xenios website artwork and editable label masters for 17 exact research-peptide variants. It is for review only: nothing here is linked into the runtime, and the founder has approved neither publication nor physical production.

| Variant | Offering | Source variant | Product code | Label facts |
|---|---|---|---|---|
| Retatrutide 20 mg | `mo_90d6189c4ecf3875647e` | `mov_e86aa92d94c61d407578` | `GEN-GRP-0325` | KAN-59/10906 |
| Retatrutide 40 mg | `mo_f9cf15e9c10861844ce4` | `mov_0881f51f4947326bf1e0` | `GEN-GRP-0327` | KAN-59/10906 |
| Retatrutide 50 mg | `mo_cf224f8d2efb906334c0` | `mov_469cd274fcf41edf3d8e` | `GEN-GRP-0328` | KAN-59/10906 |
| SS-31 50 mg | `mo_f729b05046ef91543822` | `mov_0d82ac64c7e39678212c` | `GEN-GRP-0344` | KAN-59/10906 |
| Tirzepatide 5 mg | `mo_226c15232adfd35b3288` | `mov_8615d2aea357b8241ba3` | `GEN-GRP-0360` | KAN-59/10906 |
| Tirzepatide 10 mg | `mo_17fe8edfd59d6a97260b` | `mov_bb52e1ff1819c70d9db1` | `GEN-GRP-0354` | KAN-59/10906 |
| Tirzepatide 15 mg | `mo_c79fda8d9b5122d37137` | `mov_c46129d04e61dd2a9722` | `GEN-GRP-0355` | KAN-59/10906 |
| Tirzepatide 20 mg | `mo_e28684442b78867c14ae` | `mov_02ca369a8834ebeb0b3b` | `GEN-GRP-0356` | KAN-59/10906 |
| Tirzepatide 30 mg | `mo_330de196b6297a7096d2` | `mov_c6f57f9b117d418065ff` | `GEN-GRP-0357` | KAN-59/10906 |
| Tirzepatide 40 mg | `mo_8f14a0f8f4f86e07fda8` | `mov_20d811a3df0894211cbc` | `GEN-GRP-0358` | KAN-59/10906 |
| Cagrilintide 5 mg | `mo_4a4dd3014ea4cd85cb6e` | `mov_19de1d73a1a3844c0190` | `GEN-GRP-0275` | KAN-59/10959 |
| Cagrilintide 10 mg | `mo_918fe6760c731934168d` | `mov_bc725d0ad2a12e1ee57c` | `GEN-GRP-0274` | KAN-59/10959 |
| Liraglutide 10 mg | `mo_987ced2746afaa80e326` | `mov_3e5e9840aea10ca2137e` | `GEN-GRP-0310` | KAN-59/10959 |
| Liraglutide 20 mg | `mo_2fd34c733360f34e7a63` | `mov_a75d9a7c5bfa0dec5ece` | `GEN-GRP-0311` | KAN-59/10959 |
| Semaglutide 5 mg | `mo_36fbcc90a698a8e7ada6` | `mov_3ff3d97173e8a1f7645b` | `GEN-GRP-0336` | KAN-59/10959 |
| Semaglutide 10 mg | `mo_a1d452a070c24e5f0033` | `mov_0f9bee8bdfc89ec9c2d3` | `GEN-GRP-0333` | KAN-59/10959 |
| Semaglutide 15 mg | `mo_4e47d44fd3982b0b5e61` | `mov_7b331364b57f9fdd335a` | `GEN-GRP-0334` | KAN-59/10959 |

The ids, Quick Order bindings and catalog facts are read from the release datasets. Those are `member-safe-master-offerings.generated.json` (sha256 `76b9bf6f…`) and `master-offering-bindings.generated.json` (`587595e6…`). Both are unchanged from release `19d10e04` through the live release `b600f9d8`.

All 17 have the same catalog facts:
- family `research_peptides_materials`;
- subcategory `Lyophilized Vial`;
- state `request_access`.

The printed text comes from CLAUDE-2's verified label facts for research batches 05r2 and 06 (both KAN-59/10906) and 08 (KAN-59/10959). Each record in `media-batch.v1.json` carries its source (Jira reference, file name and sha256) and the verified static text. `tools/variants.json` is the build input made from them. Retatrutide 20, 40 and 50 mg and SS-31 50 mg take their facts from batch 05r2, the form-neutral revision CLAUDE-2 published after KAN-31/10870 held them. The later batch 05r4 revises copy for other Retatrutide rows only and carries the original batch 05 label-facts file unchanged, so it does not revise these four.

These label facts are form-neutral. Each states the product name, the amount in mg, the product code and the research classification, and no form. CLAUDE-2 held vial and per-vial wording on them because the selected source states no dosage form (KAN-31/10870). The vial and the per-vial amount basis printed here rest on the founder's packaging declaration (KAN-225/11259, 2026-11-05): on research peptide artwork the vial is Xenios's white-label packaging choice, not a statement about the selected source. In each record, `labelFacts` keeps `formNeutral: true` and CLAUDE-2's hold note, and `formBasis` cites the declaration. The manifest carries `packagingDeclaration` and lists KAN-225/11259 under `authority`. `labelFacts` stays the source of each product's name, amount, product code and classification.

One printed name follows the verified label facts where the catalog display name differs only in case: SS-31 (catalog `Ss-31`). Each record's `nameVariance` records it; the dataset wording is Root's decision.

Drawn before: Retatrutide at 10, 15 and 30 mg in C1-004. Here it keeps that name setting (Retatrutide at 70.2 px on row 648), and only the amount line differs.

Not in this batch: the other rows claimed alongside these in KAN-59/11292 were delivered as batch C1-005. Retatrutide 5 mg stays held on its compound crosswalk, and Pinealon 10 mg waits for its label facts to be posted.

## Correction, 2026-11-05 (KAN-31/11384)

Independent file review of the first commit (`5f1bbaba`, manifest sha256 `437798e0…`) passed every file, asset and catalog join. It found one defect: the manifest's top-level `labelFactSources` omitted `research-batch-05r2.label-facts.json` (sha256 `4ef1eed9…`), which the records for Retatrutide 20, 40 and 50 mg and SS-31 50 mg cite. `write_manifest.py` keyed that index by Jira reference alone. Batches 05r2 and 06 were both posted in KAN-59/10906, so the batch 06 entry replaced the batch 05r2 entry.

This successor is metadata only:
- the index is keyed by reference, file and sha256, and lists all three label-facts files;
- `write_manifest.py` stops unless the index equals the distinct label-fact pins of the records;
- `verify_c1.py` checks that the index has no duplicate entry, equals the distinct record pins, and gives one digest per file;
- the manifest records the change under `corrections`.

Every record, render, label master, preview and the contact sheet has the same bytes as in `5f1bbaba`.

## What is in the files

For each variant, the batch contains six deliverables:

- **`assets/<variant>-website-render-v1-1024.webp`** is the website primary. It is a complete vial render at 1024 × 1024.
- **`assets/<variant>-website-render-v1.png`** is the full-resolution render master, at 1254 × 1254.
- **`labels/<variant>-front-artwork-v1.svg`** is the editable front label master, at 1600 × 1000.
- **`assets/<variant>-front-artwork-v1.png` / `.webp`** is the legible label-detail image.
- **`labels/<variant>-wrap-proof-v1.svg`** is the editable full wrap proof: front panel, fixed-identity side panel with the product code, and back-panel proof notes.
- **`assets/<variant>-wrap-proof-v1.png` / `.webp`** is the wrap preview, at 2400 × 1200.

Batch-level files:
- `contact-sheet-v1.png` shows all 17 variants, including 72 px and 120 px phone-thumbnail views.
- `media-batch.v1.json` holds the mapping, depicted facts, label-fact sources, review candidates (alt text and caption), and every file's bytes, sha256 and dimensions.
- Internal source evidence is not in this repository, because the repository is public. It is in the private KAN-59 handoff.
- `tools/` holds the build, render, kerning and verification sources, the measured kern table, the build report and `variants.json`.

Website caption for every image: **"Packaging design shown. Current packaging may differ."**

## How the artwork was made

No generative image model was used, and all lettering is set from installed fonts. The method is the same as in batch C1-005 (commit `7e494aa5`). `build_c1.py`, `xr_compose.py`, `svg_label_render.py`, `wpf_kern.ps1` and `c1_variants.py` are byte-identical to C1-005's copies, including the do-not-print terms for this batch's compounds that `c1_variants.py` gained there. `write_manifest.py` and `verify_c1.py` differ from C1-005's copies only by the label-fact index correction above. `variants.json`, the kern table and the build report are this batch's own.

### Vial renders

The base is the accepted Batch 004 BPC-157 10 mg v3 render (`KAN-31/10627`, sha256 `674868e8…`). The steps:

1. The name rows are refilled with clean label paper (columns 448–807): rows 567–671, or rows 567–742 when the amount changes too.
2. The new text is set in Segoe UI Bold, matched to the render: name 91.6 px, amount 63.2 px.
3. Every other pixel is byte-identical to the accepted render. `tools/verify_c1.py` checks this.

How each name and amount is set:

| Variant | Name on the render | Amount on the render |
|---|---|---|
| Retatrutide 20 mg | 70.2 px, fitted to the rule, baseline row 648, centred on the original cap band | re-set to "20 mg" at 63.2 px |
| Retatrutide 40 mg | 70.2 px, fitted to the rule, baseline row 648, centred on the original cap band | re-set to "40 mg" at 63.2 px |
| Retatrutide 50 mg | 70.2 px, fitted to the rule, baseline row 648, centred on the original cap band | re-set to "50 mg" at 63.2 px |
| SS-31 50 mg | full size, 91.6 px, on the original baseline (row 657) | re-set to "50 mg" at 63.2 px |
| Tirzepatide 5 mg | 69.8 px, fitted to the rule, baseline row 648, centred on the original cap band | re-set to "5 mg" at 63.2 px |
| Tirzepatide 10 mg | 69.8 px, fitted to the rule, baseline row 648, centred on the original cap band | unchanged "10 mg" |
| Tirzepatide 15 mg | 69.8 px, fitted to the rule, baseline row 648, centred on the original cap band | re-set to "15 mg" at 63.2 px |
| Tirzepatide 20 mg | 69.8 px, fitted to the rule, baseline row 648, centred on the original cap band | re-set to "20 mg" at 63.2 px |
| Tirzepatide 30 mg | 69.8 px, fitted to the rule, baseline row 648, centred on the original cap band | re-set to "30 mg" at 63.2 px |
| Tirzepatide 40 mg | 69.8 px, fitted to the rule, baseline row 648, centred on the original cap band | re-set to "40 mg" at 63.2 px |
| Cagrilintide 5 mg | 68.0 px, fitted to the rule, baseline row 648, centred on the original cap band | re-set to "5 mg" at 63.2 px |
| Cagrilintide 10 mg | 68.0 px, fitted to the rule, baseline row 648, centred on the original cap band | unchanged "10 mg" |
| Liraglutide 10 mg | 74.0 px, fitted to the rule, baseline row 650, centred on the original cap band | unchanged "10 mg" |
| Liraglutide 20 mg | 74.0 px, fitted to the rule, baseline row 650, centred on the original cap band | re-set to "20 mg" at 63.2 px |
| Semaglutide 5 mg | 62.6 px, fitted to the rule, baseline row 646, centred on the original cap band | re-set to "5 mg" at 63.2 px |
| Semaglutide 10 mg | 62.6 px, fitted to the rule, baseline row 646, centred on the original cap band | unchanged "10 mg" |
| Semaglutide 15 mg | 62.6 px, fitted to the rule, baseline row 646, centred on the original cap band | re-set to "15 mg" at 63.2 px |

A name that fits at 91.6 px is set at full size on the original baseline. A reduced name is fitted to the gradient rule and centred on the original name's cap band, then raised if needed so a descender stays 9 px above the amount digits. No reduced name needed raising. A name that would fall below 70% size and contains a space is stacked on two lines, with the amount scaled by the same factor, but only when stacking sets the name larger than one line does (a condition added in C1-005). Semaglutide falls below 70% on one line (62.6 px), but it has no space to break at, so it stays on one line. No name in this batch is stacked. A full-size name with a descender would stop the build for a layout review; no name in this batch is one.

The build report in `tools/` shows every value.

### Label masters

The masters are the Batch 004 v3 front and wrap templates, transformed as Batch 008's `build-labels.mjs` does it, with the amount replaced throughout. Every name fits at the template size (front 176 px, wrap front panel 146 px). The side-panel field label reads PRODUCT CODE.

As in C1-002 to C1-005, the wrap proof id and the manifest's `artworkVersion` are the exact product code, for example `GEN-GRP-0325-WRAP-v1` and `GEN-GRP-0325-WEB-SUPPLIER-v1`.

### Previews

`tools/svg_label_render.py` draws the previews from the SVG masters:
- It uses Segoe UI faces, choosing the nearest weight with ties going to the heavier face.
- OpenType pair kerning is measured through WPF (`tools/wpf_kern.ps1`).

## Label facts

The artwork prints only these. From the verified label facts:
- the brand Xenios;
- the compound name;
- the amount, "N mg";
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

Each compound's extra terms from its label facts are listed in the record's `extraDoNotPrintTerms`, and the verifier checks them on every printed string. They cover developer codes, company names, the nonproprietary and brand names of approved medicines and the conditions those medicines are approved for, the semaglutide combination product on the Cagrilintide records, and benefit wording.

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
python -I -B -X utf8 deliveries/peptide-artwork-claude-1/2026-11-05-c1-batch-006/tools/verify_c1.py --catalog <member-safe-master-offerings.generated.json> --bindings <master-offering-bindings.generated.json> --recompute
```

The verifier checks:
- every declared file's bytes, hash and dimensions, plus the tool hashes;
- that every verified label fact is printed exactly as verified, with the product code on the wrap only;
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
python -I -B -X utf8 tools/write_manifest.py <this dir> <catalog json> <bindings json> tools/variants.json c1-006
```

## Review

Independent file-level review goes to KAN-31; the producer cannot be the reviewer. The label facts are provisional until each facts batch's copy is accepted, which is CLAUDE-2's condition, so Root integrates only rows whose artwork and facts are both accepted. Rendered checks at 320, 390, 768 and 1280 px follow only after acceptance and runtime integration by Root.
