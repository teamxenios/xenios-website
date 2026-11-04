# BPC-157 500 mcg capsule bottle artwork · Batch 013

This batch delivers the Xenios packaging design for BPC-157 research capsules at exact offering `mo_7ba89975fb62ceb33b7b`, source variant `mov_753d3f94385adf791d1e` and Quick Order SKU `GEN-GRP-0245`. The reviewed static facts support the listed 500 mcg strength and research capsule form. The Xenios mark identifies the proposed design. The catalog brand is empty. The current bottle count, amount basis, selling unit and manufacturing details remain open. [Accepted static facts](https://xeniostechnology.atlassian.net/browse/KAN-31?focusedCommentId=10641) · [Partial copy review](https://xeniostechnology.atlassian.net/browse/KAN-31?focusedCommentId=10750) · [Artwork authority](https://xeniostechnology.atlassian.net/browse/KAN-59?focusedCommentId=10615)

## Delivery

- The [primary WebP](assets/bpc-157-500mcg-website-render-v1-1024.webp) shows the full bottle. The [detail WebP](assets/bpc-157-500mcg-front-artwork-v1.webp) shows the flat front. Both carry the packaging-design disclosure in the [exact-ID manifest](media-batch.v1.json).
- The [editable SVG wrap](labels/bpc-157-500mcg-wrap-proof-v1.svg) uses the accepted 5-Amino-1MQ capsule design with BPC-157 identity and the exact side-panel product code. The proof header and production fields are outside the detail crop. Container dimensions, dieline, closure, materials, print settings, attribution, storage and traceability require supplier confirmation. [Accepted capsule template](https://xeniostechnology.atlassian.net/browse/KAN-31?focusedCommentId=10756)
- The primary uses a Lanczos resize from the 1254 px master to a 1024 px square WebP at quality 89. The flat front uses the SVG view at x 100 and y 150, 1000 × 850, rendered with Sharp 0.35.3 at WebP quality 92.

## Review handoff

Codex imagery owns the batch on `codex/catalog-imagery-20261104`. Independent QA checks the primary, flat front and editable proof against the exact catalog and artwork pins. Root owns later integration and rendered checks at 320, 390, 768 and 1280 px. Physical packaging is at design stage.

Run the committed-blob mapping verifier from the repo root with Python and Pillow.

```text
python deliveries/catalog-imagery/reviews/verify-peptide-website-candidates.py --candidate <artwork-commit> --release 19d10e0495aed917b3d1fcf2844109e5e1cc6915 --batch deliveries/catalog-imagery/2026-11-04-batch-013
```

## Render recipe

Built-in imagegen reference edit, receipt `exec-b38367bc-9a3a-4062-a5af-c1f778ee81fc`. The Batch 012 5-Amino-1MQ source render was the edit target.

```text
Use case: precise-object-edit. Image 1 is the accepted Xenios research capsule bottle packaging design and is the edit target. Make an exact product variant, preserving the bottle silhouette, metallic cap and violet-to-blue strip, label structure, camera, scale, framing, white background, light and shadow. Change only the large product name from “5-Amino-1MQ” to exactly “BPC-157” and change the listed strength from “50 mg” to exactly “500 mcg” using the same alignment, navy name and violet amount. Keep the label lines “XENIOS”, “LISTED STRENGTH”, “RESEARCH CAPSULES”, “RESEARCH USE ONLY”, and “NONCLINICAL USE ONLY” verbatim. Keep the entire bottle in the square frame. This is a capsule bottle artwork mockup. No vial, no capsule count, no amount per capsule, no dosage, no added text, lot, expiry, claim, manufacturer or certification.
```
