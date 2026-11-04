# Catalog imagery — Batch 004

This isolated batch delivers original Xenios BPC-157 10 mg website artwork, editable front and wrap/back-side label masters, a three-page supplier design proof, and a print-spec exception sheet for the exact catalog pair:

- Offering: `mo_af289f611c02b3fcef01`
- Source variant: `mov_ca3e45ae9712aee91430`
- Current Quick Order SKU: `GEN-GRP-0262`

The founder authorized website artwork under `KAN-59/10615` and `KAN-225/10616`. File-level facts and visual review passed under `KAN-31/10627` for source `f72de21651e4bc921c148e7290de79f1a4ea2ea4`. Exact runtime binding, customer alt text, the existing packaging-design disclosure, mounted paint, and release publication approval remain pending. Nothing in this batch is linked into runtime or public paths.

## State boundary

- Website artwork: file-level review accepted; runtime integration and mounted paint pending.
- Physical packaging: design only; not press ready, supplier approved, printed, or in use.
- Supplier outbound: no draft, queue, or send occurred.

The front artwork uses only verified static identity. The wrap proof preserves supplier-owned zones for variable data, storage, legal attribution, and documentation. It does not issue a lot, expiry/BUD, purity, certification, CAS identifier, COA link, or QR payload.

## Primary outputs

- `assets/bpc-157-10mg-website-render-v3-1024.webp` — website delivery candidate.
- `assets/bpc-157-10mg-website-render-v3.png` — full-resolution render master.
- `labels/bpc-157-10mg-front-artwork-v3.svg` — editable front artwork.
- `labels/bpc-157-10mg-wrap-proof-v3.svg` — editable wrap/back-side proof.
- `output/pdf/xenios-bpc-157-10mg-supplier-proof-v3.pdf` — three-page supplier design proof.
- `output/pdf/xenios-bpc-157-10mg-print-spec-exceptions-v1.pdf` — one-page physical-production exception sheet.
- `contact-sheet-v1.png` — 1800 × 1200 submission-state contact sheet retained at the reviewed source bytes.

`print-spec-exceptions.v1.json` is the machine-readable exception record. The PDFs are intentionally labeled not press ready. Supplier dimensions and production specifications must be confirmed before a press-ready export can exist.

## Verify

```text
node deliveries/catalog-imagery/2026-11-04-batch-004/verify-batch.mjs --write-receipt
node deliveries/catalog-imagery/2026-11-04-batch-004/verify-batch.mjs
```

The verifier pins the committed catalog and binding bytes, requires the exact pair and `GEN-GRP-0262`, checks every declared artifact hash/byte count/dimension or PDF page count, enforces the website/physical state split, binds the file-level review receipt, rejects invented variable-data values, and confirms this batch grants no runtime linkage, supplier send, or release publication approval.
