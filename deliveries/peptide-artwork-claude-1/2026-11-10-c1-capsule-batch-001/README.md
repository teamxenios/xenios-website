# Research capsule artwork: CLAUDE-1 capsule batch

This batch delivers Xenios website artwork and editable label masters for 1 exact research-capsule variant. It is for review only: nothing here is linked into the runtime, and the founder has approved neither publication nor physical production.

| Variant | Offering | Source variant | Product code | Label facts |
|---|---|---|---|---|
| Tesofensine 500 mcg | `mo_a6f7f071ed946577ce56` | `mov_9e34d0c1acde46249621` | `GEN-GRP-0254` | KAN-59/12091 |

The ids and product codes are read from the release datasets `member-safe-master-offerings.generated.json` (sha256 `76b9bf6f…`) and `master-offering-bindings.generated.json` (`587595e6…`).

## What prints, and on what basis

From the label facts (KAN-59/12091, `LABEL_FACTS_CAPSULE_0254_2026-11-10r2.json`, sha256 `7f46e8a6…`): the brand Xenios, the product name, the caption "Listed strength", the amount, the classification line and, on the wrap only, the product code.

From the accepted capsule design, unchanged: "Research Use Only" and "Nonclinical use only".

The words "Research capsules" and the listed strength repeat the reviewed copy already released for this exact variant (release `ad52179f`, `reviewed-public-content.json`: Form "Research capsules"). They are not a new source statement. The capsule bottle is the Xenios packaging design already released for 10 research-capsule variants; the accepted capsule batches 012 to 015 record KAN-59/10615 and KAN-225/10616 as their authority. No separate packaging declaration for research capsules exists. **Whether this basis is enough for this variant is a question for the reviewer**, and `media-batch.v1.json` records it under `formBasis`.

Nothing else prints. In particular there is no capsule count, no per-capsule amount, no purity, lot or expiry, no storage text, no supplier name and no dose, route or outcome wording. The full do-not-print list is in the cited label-facts record; `tools/cap_verify.py` checks its mechanical patterns on every printed string and alt text.

## Files

For each variant:

- `assets/<variant>-website-render-v1-1024.webp` is the website primary, a complete bottle render at 1024 x 1024; `assets/<variant>-website-render-v1.png` is its lossless master.
- `labels/<variant>-front-artwork-v1.svg` is the editable front label master (1000 x 850); `assets/<variant>-front-artwork-v1.webp` and `.png` are its preview.
- `labels/<variant>-wrap-proof-v1.svg` is the editable wrap proof (front panel, product-details panel with the product code, proof notes); `assets/<variant>-wrap-proof-v1.webp` and `.png` are its preview (2400 x 1200).

`media-batch.v1.json` holds the mapping, the depicted facts, the label-fact source and every file's bytes, sha256 and dimensions. `tools/` holds the build, render and verification sources and the measured kern table.

Website caption for every image: **"Packaging design shown. Current packaging may differ."**

## How the artwork was made

No generative image model was used, and all lettering is set from installed fonts.

- **Bottle render.** The base is the accepted capsule render of catalog-imagery Batch 012 (`deliveries/catalog-imagery/2026-11-04-batch-012/assets/5-amino-1mq-50mg-website-render-v1-1024.webp`, commit `0ab9ebc1`, accepted in KAN-31/10756). Only the name rows and the listed-strength rows are erased, refilled from the clean label paper above and below, and re-set in Segoe UI Bold. Every other pixel equals the decoded base; the verifier checks this.
- **Front label and wrap.** They are the accepted Batch 012 capsule label with only the name, listed strength, product code and proof id replaced. Previews are drawn by `tools/svg_label_render.py` with pair kerning measured through WPF. Weights below 850 take Segoe UI Bold and 900 takes Black, as the accepted capsule previews resolved them.

One difference from the ten capsule renders already live: their lettering was drawn by an image model and is not a font. Lettering set from Segoe UI Bold reads slightly lighter and less condensed beside them. Whether that is acceptable is a review decision.

## Verify

```text
python -I -B -X utf8 tools/cap_verify.py <this dir> --catalog <member-safe-master-offerings.generated.json> --bindings <master-offering-bindings.generated.json> --base <Batch 012 render webp> --template <Batch 012 wrap svg> --released-content <reviewed-public-content.json> --released-media <reviewed-public-media.json>
```

It checks every file's bytes, hash and dimensions, the tool hashes, the ids and the one binding, the exact text of the front label, that the product code prints once on the wrap and nowhere else, the do-not-print patterns, and that the render, the front preview and the wrap preview are pixel-identical to a rebuild. It needs Windows with Segoe UI. The two released files are the ones at the release named in the manifest; the verifier checks their digests, that the released copy for each variant states the form and the listed strength, and the number of released capsule designs.

## Still outstanding for physical production

Bottle and closure specification, dieline, seam, bleed, stock and finish; capsule count and selling unit; storage copy, lot and expiry; chemical form and excipients. The wrap is marked "PACKAGING DESIGN PROOF - NOT PRESS READY", and nothing has been sent to a supplier.

## Review

Independent file-level review goes to KAN-31; the producer cannot be the reviewer. Root integrates accepted artwork.
