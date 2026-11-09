# Peptide artwork — CLAUDE-1 batch C1-011

This batch delivers Xenios website artwork and editable label masters for 2 exact research-peptide blend variants. It is for review only: nothing here is linked into the runtime, and the founder has approved neither publication nor physical production.

| Variant | Offering | Source variant | Product code | Label facts |
|---|---|---|---|---|
| CJC-1295 (No DAC) + Ipamorelin 10/10 mg | `mo_8023384ab099bc55fa93` | `mov_420ac197458ecbcddb9a` | `GEN-GRP-0268` | KAN-59/11972 |
| CJC-1295 (No DAC) + Ipamorelin 5/5 mg | `mo_ec5dad7fec0e0750fdbc` | `mov_082a1d9c8a0d21e4a5c9` | `GEN-GRP-0269` | KAN-59/11972 |

The ids, Quick Order bindings and catalog facts are read from the release datasets. Those are `member-safe-master-offerings.generated.json` (sha256 `76b9bf6f…`) and `master-offering-bindings.generated.json` (`587595e6…`). Both are byte-identical to the datasets of the live release `ad52179f` (blob ids checked on 2026-11-09).

Catalog facts:
- family `research_peptides_materials`;
- subcategory `Lyophilized Vial`;
- state `request_access`.

The printed text comes from the label facts per blend, from CLAUDE-2, with the CJC-1295 (No DAC) component name settled (KAN-59/11972) (`BLEND_LABEL_FACTS_CJC_SPELLING_2026-11-08.json`, sha256 `4656bcff…`). Each record gives the blend's exact product name, each component's name and amount in name order, the product code and the classification. CLAUDE-2 took the component amounts from their own content records, which their verifier holds to the public text. KAN-59/11972 settled the component names: they must reconstruct the row's own variant label exactly, so the first component is `CJC-1295 (No DAC)`, as this row's label spells it, and not `CJC-1295 NO DAC`, as the compound's own catalog row spells it. That file supersedes `BLEND_LABEL_FACTS_2026-11-05.json` (`943cfe54…`) and changes only these two records. The record in `media-batch.v1.json` carries its source (Jira reference, file name and sha256) and the verified static text. `tools/variants.json` is the build input made from it.

These label facts are form-neutral. They state the product name, the components with their amounts, the product code and the research classification, and no form. They hold vial and per-vial wording because the selected source states no dosage form. The vial and the per-vial amount basis printed here rest on the founder's packaging declaration (KAN-225/11259, 2026-11-05): on research peptide artwork the vial is Xenios's white-label packaging choice, not a statement about the selected source. The facts carry the hold and the do-not-print terms. In the record, `labelFacts` keeps `formNeutral: true` and the hold note, and `formBasis` cites the declaration. The manifest carries `packagingDeclaration` and lists KAN-225/11259 under `authority`. `labelFacts` stays the source of the product's name, components and their amounts, product code and classification.

Not in this batch:
- The other 21 blends in the same facts file. Fourteen are batch C1-009 (commit `5b9e48cd`, KAN-31/11968). GEN-GRP-0246 is a capsule, outside this vial template. GEN-GRP-0388, 0389, 0390, 0391, 0399 and 0417 have the catalog form "Form not stated" and the state `approval_required`, not Request Access.
- The single-compound CJC-1295 rows, GEN-GRP-0270 to 0273, have no label facts. KAN-59/11972 keeps a compound-identity question open for them (whether a no-DAC variant is CJC-1295 at all); it does not hold this blend's printed name.

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

No generative image model was used, and all lettering is set from installed fonts. The method is the same as in batch C1-009 (commit `5b9e48cd`), the first batch of blends, which is in review in KAN-31/11968. Every name takes Root's Option B (KAN-59/11404):
- the exact product name, broken only after " + ";
- on whichever set of lines gives the largest scale; a tie keeps fewer lines, then the more even line widths;
- every name line and the amount scaled together and centred between the rule and the form line;
- the amount is the components' amounts in name order, joined by "/", with their one unit ("10/10 mg", "5/5 mg").

Each component must sit in its own name segment, in order, so the amounts read in the order of the printed name. A blend has no single mass, so `nominalAmountPerVialMg` is null.

`build_c1.py`, `xr_compose.py`, `svg_label_render.py`, `wpf_kern.ps1` and `verify_c1.py` are byte-identical to C1-009's copies. The verifier is the one accepted in KAN-31/11570. `xr_compose.py` carries C1-009's two fixes to the blend layout, which go to review with C1-009:
- It stopped at the first line set that could not fit the name band (in C1-009, the unbroken GLOW and KLOW names), instead of trying the others. It now skips such a set, records it in the build report as `unfitLineSets`, and fails only when no line set fits.
- A stack must now keep every pixel it touches, faint anti-aliasing included, inside the erased rows. The rows next to them are the clean rows the erase interpolates from, and must stay identical to the accepted render. The descenders of Cagrilintide + Semaglutide had reached one row past them, which the verifier caught; in C1-009 that pair is set slightly smaller.

`c1_variants.py` gains only the reference of the corrected blend facts (KAN-59/11972). `write_manifest.py` gains this batch's claim reference (KAN-59/11975) and `changesFromC1009`. `variants.json`, the kern table and the build report are this batch's own.

### Vial renders

The base is the accepted Batch 004 BPC-157 10 mg v3 render (`KAN-31/10627`, sha256 `674868e8…`). The steps:

1. The name rows are refilled with clean label paper (columns 448–807): rows 567–671, or rows 567–742 when the amount changes too.
2. The new text is set in Segoe UI Bold, matched to the render: name 91.6 px, amount 63.2 px.
3. Every other pixel is byte-identical to the accepted render. `tools/verify_c1.py` checks this.

How each name and amount is set:

| Variant | Name on the render | Amount on the render |
|---|---|---|
| CJC-1295 (No DAC) + Ipamorelin 10/10 mg | two lines, "CJC-1295 (No DAC) +" over "Ipamorelin", at 36.18 px (scale 0.395) | re-set to "10/10 mg" at 24.96 px under the name |
| CJC-1295 (No DAC) + Ipamorelin 5/5 mg | two lines, "CJC-1295 (No DAC) +" over "Ipamorelin", at 36.18 px (scale 0.395) | re-set to "5/5 mg" at 24.96 px under the name |

Every name here is a blend, so the Option B rule above sets it, and the single-name rules of earlier batches (full size, fitted, raised or stacked) do not apply. The build report's `blendCandidates` lists every line set considered for each name, with its scale.

The build report in `tools/` shows every value.

### Label masters

The masters are the Batch 004 v3 front and wrap templates, transformed as Batch 008's `build-labels.mjs` does it, with the amount and its unit replaced throughout. On the front and the wrap front panel, a blend name takes the larger of the one-line fit and the exact name broken only after " + ". On the front (template size 176 px), one name is fitted to the available width: CJC-1295 (No DAC) + Ipamorelin at 102 px. On the wrap front panel (template size 146 px), one name is fitted to the available width: CJC-1295 (No DAC) + Ipamorelin at 85.5 px. The side-panel field label reads PRODUCT CODE.

As in C1-002 to C1-007, the wrap proof id and the manifest's `artworkVersion` are the exact product code, for example `GEN-GRP-0268-WRAP-v1` and `GEN-GRP-0268-WEB-SUPPLIER-v1`.

### Previews

`tools/svg_label_render.py` draws the previews from the SVG masters:
- It uses Segoe UI faces, choosing the nearest weight with ties going to the heavier face.
- OpenType pair kerning is measured through WPF (`tools/wpf_kern.ps1`).

## Label facts

The artwork prints only these. From the verified label facts:
- the brand Xenios;
- the blend's product name;
- the components' amounts in name order, joined by "/", with their unit;
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

Each compound's extra terms from its label facts are listed in the record's `extraDoNotPrintTerms`, and the verifier checks them on every printed string. For a blend they are every component's terms, except a term inside another component's printed name, plus the facts' bar on combination, synergy and ratio wording. A term matches only where no letter follows it, so the list carries each form of a word.

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
python -I -B -X utf8 deliveries/peptide-artwork-claude-1/2026-11-09-c1-batch-011/tools/verify_c1.py --catalog <member-safe-master-offerings.generated.json> --bindings <master-offering-bindings.generated.json> --recompute
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
python -I -B -X utf8 tools/write_manifest.py <this dir> <catalog json> <bindings json> tools/variants.json c1-011
```

`wpf_kern.ps1` writes the kern table with CRLF line ends. The committed table has LF, and both the manifest and the verifier hash it with CRLF folded to LF.

## Review

Independent file-level review goes to KAN-31; the producer cannot be the reviewer. Root integrates accepted artwork. Whether a row needs accepted copy before release is Root's decision. Rendered checks at 320, 390, 768 and 1280 px follow only after acceptance and runtime integration by Root.
