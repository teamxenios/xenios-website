# Peptide media review assets

This directory is an internal, non-public review surface for exact peptide media.
Nothing here is under `public/` or `client/public/`, and nothing is registered with
Product Control. An asset in this directory is not approved, purchasable, or linked.

## Truth state

- Source workbook SHA-256: `df317a28374c9e194f3379a2b276c8533016dc84aa906af9d48b49db46bf53d5`
- 86 exact rows have an intentional state in `variant-media-plan.ts`.
- 0 rows enter the factory approved; 18 are unavailable and 68 are held for exact
  rendering/approval.
- AI created only the two blank, text-free neutral container bases.
- Product name, strength, presentation, SKU, provenance, and hold copy are written
  deterministically by `render-svg.ts`.
- The same scalable transparent SVG is suitable for catalog, detail, and cart review.
- Raw Peptides proofs are internal and cannot be approved without rights evidence.

## Generated base prompts

Both prompts used built-in image generation and a flat `#00ff00` chroma-key background.
The first requested one opaque matte-white blank vial with a neutral charcoal cap; the
second requested one opaque matte-white blank capsule bottle with a charcoal ribbed cap.
Both required centered full-container framing, generous padding, no glass or reflection,
no shadow or floor plane, no text, labels, logos, numbers, marks, props, or watermark.
The installed chroma-key helper produced the transparent PNGs with soft matte and despill.

## Rebuild the three review proofs

```powershell
npx tsx scripts/generate-peptide-image-review.mts
```

Use `--force` only when intentionally regenerating the checked-in proofs. The script
refuses accidental overwrite by default.
