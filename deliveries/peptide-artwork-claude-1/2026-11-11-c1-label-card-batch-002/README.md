# Label-card artwork for blend rows: CLAUDE-1 label-card batch

This batch delivers Xenios website artwork for 4 research catalog blend variants whose form no source states. It is for review only: nothing here is linked into the runtime. The founder approved the label-card template in KAN-225/12172; publication and physical production are not approved.

| Variant | Offering | Source variant | Product code |
|---|---|---|---|
| GLOW (GHK-Cu + BPC-157 + TB-500) 27/5/10 mg | `mo_69c6615ef3e615e76088` | `mov_5e74aacac728cfcbd11f` | `GEN-GRP-0399` |
| Tesamorelin + Ipamorelin 10/5 mg | `mo_86fc6ac5138a0a0ddd54` | `mov_287c60ca423250ef75d6` | `GEN-GRP-0388` |
| Tesamorelin + Ipamorelin 5/5 mg | `mo_b36a2992242d2a55c145` | `mov_dc26bcbba0510c5bb57b` | `GEN-GRP-0389` |
| Thymosin Alpha-1 + Thymulin 10/6.4 mg | `mo_d1a47413d4b8e58bfd52` | `mov_2a06e3a4fa8fb02b64cf` | `GEN-GRP-0417` |

## What prints, and why there is no container

For every variant the catalog subcategory is "Form not stated" and the label facts (KAN-59/11972) state no form, so the image is the label alone, flat, on a plain ground. It prints the brand Xenios, the product name from the label facts, the listed amounts, "Research Use Only" and "Nonclinical use only". The name is set as on the accepted vial blends: the exact name, broken only after " + ". The amount is the components' amounts in the order of the name, joined by "/", with their one unit; the caption above its repeat reads "Listed amount". Nothing is said about the combination: no "blend", "ratio" or "combined" wording, no product code, no form line and no "per" basis.

Rows whose components are stated in different units are not in this batch. For Thymosin Alpha-1 + Thymulin 10/6.4 mg the catalog variant label writes the components as one run of text, so the assignment of each amount to its component rests on the label-facts record and cannot be cross-checked against that label; the card prints the amounts in the order that label gives them.

## Files

For each variant: `assets/<variant>-label-card-v1-1024.webp` (website primary, 1024 x 1024) and its lossless `.png` master; `labels/<variant>-label-design-v1.svg` (editable label master, 1600 x 1000) with its `.webp` and `.png` preview. `media-batch.v1.json` holds the mapping, printed lines, label-fact source and every file's bytes, sha256 and dimensions. `tools/` holds the build, render and verification sources and the measured kern table.

No generative image model was used; all lettering is set from installed fonts.

## Verify

```text
python -I -B -X utf8 tools/fn_blend.py verify <this dir> --catalog <member-safe-master-offerings.generated.json> --bindings <master-offering-bindings.generated.json> --template <Batch 004 front label svg> --released-content <reviewed-public-content.json> [--label-facts <the label-facts json>]
```

With `--label-facts` it also checks each record against the label-facts file itself. It needs Windows with Segoe UI.

## Review

Independent file-level review goes to KAN-31; the producer cannot be the reviewer. Root or the integrator integrates accepted artwork.
