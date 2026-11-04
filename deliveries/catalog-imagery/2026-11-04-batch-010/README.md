# Dihexa 10 mg vial artwork · Batch 010

Batch 010 supplies a website packaging design and editable supplier label files for one exact research-only vial. The label uses the listed nominal amount of 10 mg per vial.

| Exact offering ID | Source variant ID | Quick Order SKU |
| --- | --- | --- |
| mo_8a3829642d06ad3ca7c4 | mov_3f59629a005b238f4faa | GEN-GRP-0280 |

The committed catalog and bindings at release baseline `19d10e0495aed917b3d1fcf2844109e5e1cc6915` identify the research-materials vial. The static text is Xenios, Dihexa, nominal 10 mg per vial, lyophilized vial and laboratory research use only. The product code appears on the wrap. The separate Dihexa capsule records and held scientific description are outside this batch. [Static facts](https://xeniostechnology.atlassian.net/browse/KAN-59?focusedCommentId=10654) · [Copy scope](https://xeniostechnology.atlassian.net/browse/KAN-59?focusedCommentId=10681) · [Independent static-fact review](https://xeniostechnology.atlassian.net/browse/KAN-31?focusedCommentId=10668)

## Handoff

- **Owner and branch** Codex imagery on `codex/catalog-imagery-20261104`.
- **Website** The [manifest](media-batch.v1.json) pins the full-vial PNG master, 1024 px primary WebP, front-detail WebP, dimensions, hashes, exact Quick Order joins, and alt text. Both candidates use “Packaging design shown. Current packaging may differ.”
- **Supplier design** Editable front and wrap SVGs with matching PNG previews. The wrap is marked “SUPPLIER PROOF - NOT PRESS READY” and has reserved traceability, storage, attribution and documentation areas. Actual container and closure, measured dieline, seam, bleed, material, adhesive, color and finish, winding, legal label copy, and supplier-issued traceability remain pending.
- **Verification** The [contact sheet](contact-sheet-v1.png) collects the exact variant's full render, readable front and wrap. The local verifier checks the catalog pins, exact binding, eight artifacts and their text or image dimensions. The [receipt](verification-result.v1.json) records the result.
- **Review and next owner** Independent QA on KAN-31 reviews the exact primary/detail bytes and editable labels. Root owns any later integration and painted checks at 320, 390, 768 and 1280 px. The current state is packaging design with file-level review pending.

## Reproduce the checks

Run from the repository root with Python and Pillow. The trusted release commit must be present locally.

    python deliveries/catalog-imagery/2026-11-04-batch-010/build-evidence.py

Use the existing [Git-blob mapping check](../reviews/verify-peptide-website-candidates.py) with the exact artwork commit, the release baseline above and batch path `deliveries/catalog-imagery/2026-11-04-batch-010`. The renderer uses the accepted family reference. The editable label templates follow Batch 008 and are rebuilt with `build-labels.mjs` and Sharp.

## Render source

Built-in imagegen reference edit, receipt `exec-006790e3-5b28-45b9-b541-2496d85ccff3`. Reference is the accepted Batch 004 website PNG. The 1024 px WebP is a Lanczos resize from the imagegen PNG master.

> Use case: product-mockup. Asset: variant-specific Xenios Quick Order website packaging design. Image 1 is the edit target and reference for the accepted vial family layout. Replace only "BPC-157" in the big product name line with exactly "Dihexa" (D-i-h-e-x-a) in the same bold navy type. Preserve the exact remaining label lines: "XENIOS", "10 mg", "LYOPHILIZED VIAL", "RESEARCH USE ONLY", "NONCLINICAL USE ONLY". Keep the clear glass and full vial framing, brushed silver closure, centered metallic purple-to-blue strip, matte pearl label, fine gradient rule, white backdrop and soft shadow. Square. Entire closure, label, and glass base visible. No additional words, lot, expiry, QR code, claims, visible powder or liquid, or extra objects.
