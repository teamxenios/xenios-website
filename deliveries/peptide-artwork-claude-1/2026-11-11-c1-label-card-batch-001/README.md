# Label-card artwork: CLAUDE-1 label-card batch

This batch delivers Xenios website artwork for 6 research catalog variants whose form no source states. It is for review only: nothing here is linked into the runtime. The founder approved the label-card template in KAN-225/12172; publication and physical production are not approved.

| Variant | Offering | Source variant | Product code | Reviewed copy released |
|---|---|---|---|---|
| Gonadorelin 10 mg | `mo_2fb4e0f567f434b55b20` | `mov_9a217007a7fb93111200` | `GEN-GRP-0400` | yes |
| PT-141 5 mg | `mo_f4298f80cc7aa9f1046a` | `mov_dc6c3bf9bc23dd55adc1` | `GEN-GRP-0409` | yes |
| GHK-Cu 75 mg | `mo_d1a6493665b6ba628c2a` | `mov_361af70608afc9c98ec0` | `GEN-GRP-0398` | yes |
| BPC-157 20 mg | `mo_4c07e82051ba4c95297b` | `mov_451f34fca5c1a293b145` | `GEN-GRP-0393` | no |
| Semax 30 mg | `mo_f35e748aed26af26e9e4` | `mov_8bec8068d30d6f928040` | `GEN-GRP-0413` | yes |
| Oxytocin 10 mg | `mo_1dd0658eb7bf15f91900` | `mov_256cb0423eb6d2a77f65` | `GEN-GRP-0407` | no |

The ids and product codes are read from the release datasets `member-safe-master-offerings.generated.json` (sha256 `76b9bf6f…`) and `master-offering-bindings.generated.json` (`587595e6…`).

## Why a label card and not a container

For every variant here the catalog subcategory is "Form not stated", the label facts state no form, and the released reviewed copy, where there is any, states a listed amount and no form. A drawing of a vial, a bottle or any other container would state a form that nothing gives. So the image is the label alone, flat, on a plain ground. It states no form and depicts no container, and it needs no packaging declaration for what it prints.

## What prints

From the label facts (KAN-59/10980; KAN-59/11091 as corrected by LABEL_FACTS_FORM_HOLD_CORRECTION_2026-11-05; KAN-59/11136): the brand Xenios, the product name and the amount. From the accepted label design, unchanged: "Research Use Only" and "Nonclinical use only". The caption above the repeated amount reads "Listed amount", which is the label the released reviewed copy uses for the same figure.

Nothing else prints. There is no form line, no "per" basis, no product code, no purity, lot or expiry, no storage text, no supplier name and no dose, route or outcome wording. `tools/fn_verify.py` checks these on every printed string, title, description and alt text, together with the compound-specific terms in `tools/extra-terms.json`.

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

Independent file-level review goes to KAN-31; the producer cannot be the reviewer. The label-card template is new, so the review covers the template as well as each variant. Root integrates accepted artwork.
