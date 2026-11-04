# KPV 500 mcg capsule bottle artwork · Batch 014

This batch delivers an exact research capsule bottle packaging design for offering `mo_b2ebb969d48a20f9e680`, source variant `mov_fe292b5f03527ec13e5e` and Quick Order SKU `GEN-GRP-0249`. The reviewed static facts support the listed 500 mcg strength and the research capsule form. The catalog brand field is empty. The Xenios mark identifies the proposed packaging design. Current bottle count, strength basis, selling unit and manufacturing details remain open. KPV’s overview has partial source acceptance. It is separate from the static artwork scope. [Accepted static facts](https://xeniostechnology.atlassian.net/browse/KAN-31?focusedCommentId=10641) · [Copy disposition](https://xeniostechnology.atlassian.net/browse/KAN-31?focusedCommentId=10750) · [Artwork authority](https://xeniostechnology.atlassian.net/browse/KAN-59?focusedCommentId=10615)

## Delivery

- The [primary WebP](assets/kpv-500mcg-website-render-v1-1024.webp) shows the full bottle. The [detail WebP](assets/kpv-500mcg-front-artwork-v1.webp) shows the flat front. The [exact-ID manifest](media-batch.v1.json) pins both files and the packaging-design disclosure.
- The [editable SVG wrap](labels/kpv-500mcg-wrap-proof-v1.svg) uses the accepted 5-Amino-1MQ design with the exact compound, listed strength and side-panel product code. The proof header and production fields sit outside the detail crop. Container dimensions, dieline, closure, materials, print settings, attribution, storage and traceability require supplier confirmation. [Accepted design](https://xeniostechnology.atlassian.net/browse/KAN-31?focusedCommentId=10756)
- The primary uses a Lanczos resize from 1254 px to 1024 px and WebP quality 89. The detail uses the 1000 × 850 front panel at x 100 and y 150, rendered with Sharp 0.35.3 at WebP quality 92.

## Review handoff

Codex imagery owns this isolated batch on `codex/catalog-imagery-20261104`. Independent QA checks the two WebPs and editable proof against their exact pins. Root owns later integration and rendered checks at 320, 390, 768 and 1280 px. Physical packaging is at design stage.

Run the committed-blob mapping verifier from the repo root with Python and Pillow.

```text
python deliveries/catalog-imagery/reviews/verify-peptide-website-candidates.py --candidate <artwork-commit> --release 19d10e0495aed917b3d1fcf2844109e5e1cc6915 --batch deliveries/catalog-imagery/2026-11-04-batch-014
```

## Render recipe

Built-in imagegen reference edit, receipt `exec-7880b4a1-1245-4683-8343-b4bda45744cf`. The accepted Batch 012 source render was the edit target.

```text
Use case: precise-object-edit. Image 1 is the accepted Xenios research capsule bottle packaging design and is the edit target. Make the exact KPV variant, preserving the capsule bottle silhouette, metallic cap and violet-to-blue strip, label structure, camera, scale, framing, white background, light and shadow. Change only the large product name from “5-Amino-1MQ” to the exact three uppercase letters “KPV” and the listed strength from “50 mg” to exactly “500 mcg”. Preserve alignment, navy name and violet amount. Keep the label lines “XENIOS”, “LISTED STRENGTH”, “RESEARCH CAPSULES”, “RESEARCH USE ONLY”, and “NONCLINICAL USE ONLY” verbatim. Keep the entire bottle visible in a square frame. This is a capsule bottle artwork mockup. No vial, no capsule count, no amount per capsule, no dosage, no added text, lot, expiry, claim, manufacturer or certification.
```
