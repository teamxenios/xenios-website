# Label-card artwork: CLAUDE-1 label-card batch

This batch delivers Xenios website artwork for 10 research catalog variants whose form no source states. It is for review only: nothing here is linked into the runtime. The founder approved the label-card template in KAN-225/12172; publication and physical production are not approved.

| Variant | Offering | Source variant | Product code | Reviewed copy released |
|---|---|---|---|---|
| BDNF 10 mg | `mo_598b143f4ffe06294832` | `mov_554ae2758dbe92e4baa6` | `GEN-GRP-0392` | no |
| CJC-1295 With DAC 10 mg | `mo_6d14f0bbb3bdfe5f900e` | `mov_07317a1fe77fe228b793` | `GEN-GRP-0394` | no |
| Curcumin 600 mg | `mo_a8ad050608013cf7d4b4` | `mov_1f87878d1e95e525b15d` | `GEN-GRP-0396` | no |
| Follistatin 344 1 mg | `mo_761c9b0f8f19d9d2c3b5` | `mov_b96d05f393b7e3fb6a3f` | `GEN-GRP-0397` | no |
| Hexarelin 5 mg | `mo_2aaac3a06aa0dd6b2923` | `mov_7c55d415a9574e9ebda7` | `GEN-GRP-0402` | no |
| HGH 10 IU | `mo_230a06a5ed15405e65b2` | `mov_64db7bf766cd1d66694d` | `GEN-GRP-0403` | no |
| IGF-1 DES 1 mg | `mo_b223f1eabb29e09a69e9` | `mov_69a9f7466c5385ab9811` | `GEN-GRP-0404` | no |
| PE-22-28 10 mg | `mo_f6e814a2e3224bb6b53d` | `mov_0ba805e868711366428d` | `GEN-GRP-0408` | no |
| SS-31 15 mg | `mo_33c52b7e9611bf4e2527` | `mov_b67ab9e8cd671273f3c1` | `GEN-GRP-0414` | no |
| Survodutide 6 mg | `mo_4645a385049d13824a66` | `mov_32c1c33224d5fca42b1e` | `GEN-GRP-0415` | no |

The ids and product codes are read from the release datasets `member-safe-master-offerings.generated.json` (sha256 `76b9bf6f…`) and `master-offering-bindings.generated.json` (`587595e6…`).

## Why a label card and not a container

For every variant here the catalog subcategory is "Form not stated", the label facts state no form, and the released reviewed copy, where there is any, states a listed amount and no form. A drawing of a vial, a bottle or any other container would state a form that nothing gives. So the image is the label alone, flat, on a plain ground. It states no form and depicts no container, and it needs no packaging declaration for what it prints.

## What prints

From the label facts (KAN-59/12199): the brand Xenios, the product name and the amount. From the accepted label design, unchanged: "Research Use Only" and "Nonclinical use only". The caption above the repeated amount reads "Listed amount", which is the label the released reviewed copy uses for the same figure.

For BDNF 10 mg the catalog variant label reads "BDNF (Brain-derived neurotrophic factor) (10mg)": the label adds one bracketed text after the name; it is not printed. The printed name is the catalog display name, as the label facts give it.

For CJC-1295 With DAC 10 mg the catalog variant label reads "CJC-1295 - With DAC (10mg)": punctuation only. The printed name is the catalog display name, as the label facts give it.

For Follistatin 344 1 mg the catalog variant label reads "Follistatin 344 (95%) (1mg)": the label adds one bracketed text after the name; it is not printed. The printed name is the catalog display name, as the label facts give it.

Nothing else prints. There is no form line, no "per" basis, no product code, no purity, lot or expiry, no storage text, no supplier name and no dose, route or outcome wording. `tools/fn_verify.py` checks these on every printed string, title, description and alt text, together with the compound-specific terms in `tools/extra-terms.json`. A name of more than one word is also checked never to appear shortened.

## Files

For each variant:

- `assets/<variant>-label-card-v1-1024.webp` is the website primary, 1024 x 1024; `assets/<variant>-label-card-v1.png` is its lossless master.
- `labels/<variant>-label-design-v1.svg` is the editable label master (1600 x 1000); `assets/<variant>-label-design-v1.webp` and `.png` are its preview.

`media-batch.v1.json` holds the mapping, the printed lines, the label-fact source and every file's bytes, sha256 and dimensions. `tools/` holds the build, render and verification sources and the measured kern table.

Proposed alt text: "Xenios <name> <amount> label design" and "Front label artwork for Xenios <name> <amount>". The website caption for a label card is the integrator's choice; the existing caption speaks of a packaging design, and this image shows a label only.

## How the artwork was made

No generative image model was used, and all lettering is set from installed fonts. The label is the accepted Batch 004 front label master (`deliveries/catalog-imagery/2026-11-04-batch-004/labels/bpc-157-10mg-front-artwork-v3.svg`, accepted in KAN-31/10627) with the name and the amount replaced, the form line removed and the content caption changed to "Listed amount". The preview is drawn by `tools/svg_label_render.py` with pair kerning measured through WPF. The website image is that preview scaled to 880 px wide on a plain ground with a soft shadow.

## Verify

```text
python -I -B -X utf8 tools/fn_verify.py <this dir> --catalog <member-safe-master-offerings.generated.json> --bindings <master-offering-bindings.generated.json> --template <Batch 004 front label svg> --released-content <reviewed-public-content.json>
```

It checks every file's bytes, hash and dimensions, the tool hashes, the ids and the one binding, that the catalog says "Form not stated", that the released copy states the same listed amount and no form, the exact text of the label, the absence of form, container and do-not-print wording, and that the label preview and the card are pixel-identical to a rebuild. It needs Windows with Segoe UI. A batch built without a recorded approval of the template is a dry run and fails verification unless `--allow-dry-run` is passed; a dry run is never published.

## Review

Independent file-level review goes to KAN-31; the producer cannot be the reviewer. The label-card template was accepted in KAN-31/12179. This review covers each variant and the two kit changes named above: the declared name variance and the check that a name is never shortened. Root or the integrator integrates accepted artwork.
