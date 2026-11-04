# 5-Amino-1MQ capsule bottle artwork · Batch 012

This batch delivers an exact 5-Amino-1MQ research capsule bottle design for offering `mo_c600e7eb1c9f5fd03c80` and source variant `mov_2183aa9edb06f34ef3af`, Quick Order SKU `GEN-GRP-0243`. The catalog and accepted static facts support research capsules and a listed strength of 50 mg. The catalog brand field is empty. The Xenios mark identifies the proposed packaging design. The source records a historical 60-capsule bottle. The current count, selling unit, strength basis, container and manufacturing details remain open. [Static facts review](https://xeniostechnology.atlassian.net/browse/KAN-31?focusedCommentId=10641) · [Reviewed successor](https://xeniostechnology.atlassian.net/browse/KAN-31?focusedCommentId=10656) · [Artwork authority](https://xeniostechnology.atlassian.net/browse/KAN-59?focusedCommentId=10615)

## Delivery

- The [primary WebP](assets/5-amino-1mq-50mg-website-render-v1-1024.webp) shows the full bottle. The [detail WebP](assets/5-amino-1mq-50mg-front-artwork-v1.webp) shows only the front panel. The [manifest](media-batch.v1.json) pins both to the exact pair and the caption “Packaging design shown. Current packaging may differ.”
- The [editable SVG proof](labels/5-amino-1mq-50mg-wrap-proof-v1.svg) includes front, side and back panels. The product code is on the side. The proof header and production fields stay outside the website detail. Supplier confirmation is required for the container, dieline, dimensions, closure, material, substrate, print settings, attribution, storage and traceability.
- The front preview is a 1000 × 850 crop at x 100 and y 150 of the SVG using Sharp 0.35.3 with WebP quality 92. The primary uses a Lanczos resize from the generated 1254 px master to 1024 px and WebP quality 89.

## Review handoff

Codex imagery owns this isolated batch on `codex/catalog-imagery-20261104`. Independent QA checks the two website images and the wrap against the exact source pins. Root owns any later integration and rendered checks at 320, 390, 768 and 1280 px. The physical state is packaging design.

Run the committed-blob mapping verifier from the repository root with Python and Pillow and substitute the full artwork commit SHA.

```text
python deliveries/catalog-imagery/reviews/verify-peptide-website-candidates.py --candidate <artwork-commit> --release 19d10e0495aed917b3d1fcf2844109e5e1cc6915 --batch deliveries/catalog-imagery/2026-11-04-batch-012
```

## Render recipe

Built-in imagegen, receipt `exec-2b19004f-2649-4ef7-80ec-943f349c4fc8`. The accepted Batch 004 vial image served as a visual style reference.

```text
Use case: product-mockup. Asset: square Xenios Early Access catalog packaging-design render for the exact 5-Amino-1MQ 50 mg research capsules variant. Image 1 is a STYLE REFERENCE for the Xenios visual family only. Create a NEW wide-neck cylindrical research-capsule BOTTLE with a full-width brushed silver screw cap, opaque pearl-white container and pale pearl label. The silhouette must unmistakably be a capsule bottle, with broad body, short wide neck and slightly rounded shoulders. Use the reference's centered frontal camera, premium neutral white background, softly diffused light, subtle ground shadow, restrained navy typography, fine violet-to-cyan rule and a narrow metallic violet-to-blue strip over the cap and shoulder. Frame the full closure and base with clean margins. Label text top to bottom, verbatim: "XENIOS", "5-Amino-1MQ" (spell 5 hyphen A m i n o hyphen 1 M Q), "LISTED STRENGTH", "50 mg", "RESEARCH CAPSULES", "RESEARCH USE ONLY", "NONCLINICAL USE ONLY". Set 5-Amino-1MQ as the largest line and make the cap, identity, strength and research band legible. All letters sharp and horizontally aligned. Keep navy and violet emphasis and the dark research banner from the style reference. Keep it a professionally lit design mockup. No vial, no visible capsules, no bottle count, no per-capsule or dose wording, no claims, no extra label text, no lot, expiry, barcode, certification, manufacturer or scene props.
```
