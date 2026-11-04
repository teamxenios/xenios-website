# Xenios BPC-157 packaging design · Batch 008

Two variant-specific packaging designs extend the reviewed Batch 004 visual system. Both are lyophilized vials for laboratory research use only. The stated milligrams are nominal content per vial.

| Nominal content | Offering ID | Source variant ID | Quick Order SKU |
| --- | --- | --- | --- |
| 5 mg per vial | mo_e4de11c77d16c4c3b83d | mov_09db3e866424b64994d3 | GEN-GRP-0264 |
| 15 mg per vial | mo_9a755fa72de0409cd937 | mov_257330ea83ecbfc45fae | GEN-GRP-0263 |

The artwork uses the verified static facts from KAN-6/10624 and the committed catalog and Product Control bindings. The 5 mg historical procurement box of ten is separate from its unresolved customer selling unit. Source identifiers, worksheet rows, hashes, and the prompts for the two built-in imagegen edits are in [internal-evidence.v1.json](internal-evidence.v1.json).

## Review handoff

- [Contact sheet](contact-sheet-v1.png) shows the render, front label, and wrap for each exact pair.
- [Media manifest](media-batch.v1.json) maps each pair to its separate 1024-pixel WebP, 1254-pixel PNG master, editable SVGs, previews, alt text, dimensions, and SHA-256 hashes. The two WebP roles per pair are the primary image and front-label detail. Use the existing disclosure “Packaging design shown. Current packaging may differ.”
- [Supplier design proofs](output/pdf/xenios-bpc-157-5mg-15mg-supplier-design-proofs-v1.pdf) and [print-spec exceptions](output/pdf/xenios-bpc-157-5mg-15mg-print-spec-exceptions-v1.pdf) are internal design handoff files. Editable wraps and their previews also stay in the supplier-review set.

Both website candidates await independent file-level review under KAN-31. After acceptance, Root owns exact-ID integration and mounted checks at 320, 390, 768, and 1280 pixels. The physical packaging state is design. A press file requires a supplier-approved vial and closure, measured dieline, seam, bleed and safe area, material and print specifications, legal attribution, approved storage, and supplier-issued traceability. Selected chemical form, excipients, and customer selling unit remain open for both variants.

## Verify

Run from the repository root using Python with Pillow and pypdf.

    python deliveries/catalog-imagery/2026-11-04-batch-008/verify-batch.py

Add `--content-handoff PATH` to independently check the original KAN-6 handoff bytes and artwork facts. Add `--write` when regenerating the contact sheet, manifest, evidence, and receipt from the authored assets. The label rebuild uses `build-labels.mjs` with Sharp. The PDF rebuild uses `create-proofs.py` with ReportLab and the authored PNG inputs.
