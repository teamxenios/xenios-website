# Catalog imagery Batch 011

This batch stages the original NutriDyn front image for the US Hydrate Blue Raspberry 180 g canister. The catalog pair is `mo_a4cfc5396d714f879944` / `mov_d6a8b2cd129bda39d8fa` and the Quick Order SKU is `GEN-GRP-0372`. NutriDyn's manufacturer code is `R982`.

- NutriDyn's US product page resolves size option `813` (30 serving canister) and flavor option `919` (Blue Raspberry) to the single gallery product `2039`. Its full gallery rendition and the original image both decode to the same 420 × 420 RGBA pixels. The delivered original preserves its 79,554 bytes. [Official product page](https://nutridyn.com/dynamic-hydrate) · [Original PNG](https://nutridyn.com/media/catalog/product/r/9/r982-Small-76816.png)
- Manufacturer sheet ND432 rev. 9/24 page 1 shows the same front artwork, including Blue Raspberry, the 30-serving mark and 6.35 oz (180 g). Page 2 identifies its Supplement Facts as Blue Raspberry, with 30 servings of 6 g and magnesium bisglycinate chelate. This ties the visible front to the current US sheet while leaving the physical label revision ID and lot unspecified. The PNG depicts the front only. [Manufacturer sheet](https://nutridyn.com/media/productsattachment/Hydrate_SS_ND432_NEW.pdf)
- Batch 009 recorded the selected-label formula conflict. The Hydrate content lane subsequently reported that the selected US R982 label and current US sheet agree on the magnesium form. The separate copy review was pending at image staging. [Content evidence](https://xeniostechnology.atlassian.net/browse/KAN-6?focusedCommentId=10702) · [Copy review](https://xeniostechnology.atlassian.net/browse/KAN-31?focusedCommentId=10705)

Website image use is authorized by the founder. This batch awaits independent KAN-31 image review of the exact bytes and package crosswalk. Root owns integration and release verification. The candidate is an isolated static file. [Imagery authority](https://xeniostechnology.atlassian.net/browse/KAN-59?focusedCommentId=10615) · [Release handoff authority](https://xeniostechnology.atlassian.net/browse/KAN-225?focusedCommentId=10616)

Run from the repo root with Python and Pillow installed.

```text
python deliveries/catalog-imagery/2026-11-04-batch-011/verify-batch.py
```

The verifier checks the pinned catalog and binding blobs, the unique Hydrate pair and Quick Order SKU, and the delivered PNG's source hash, file size, dimensions, and decoded pixels. Manufacturer links and gallery metadata are recorded for independent source review.
