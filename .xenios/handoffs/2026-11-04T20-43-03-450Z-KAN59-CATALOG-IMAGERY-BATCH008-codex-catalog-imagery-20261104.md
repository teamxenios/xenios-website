# KAN-59 Batch 008 handoff for Root and KAN-31

Session: codex-catalog-imagery-20261104
Branch: codex/catalog-imagery-20261104
Artwork candidate: 87d241fb30eaabae6df41971597024d8add1cd33
Candidate tree: 3d66cb985ed0bd3ebadcecd2f81e08464545fa6e
Delivery: deliveries/catalog-imagery/2026-11-04-batch-008/
Scope authority: KAN-59/10615 and KAN-225/10616
Content evidence: KAN-6/10624

| Variant | Offering ID | Source variant ID | Quick Order SKU |
| --- | --- | --- | --- |
| BPC-157 5 mg per vial | mo_e4de11c77d16c4c3b83d | mov_09db3e866424b64994d3 | GEN-GRP-0264 |
| BPC-157 15 mg per vial | mo_9a755fa72de0409cd937 | mov_257330ea83ecbfc45fae | GEN-GRP-0263 |

Both are lyophilized vial designs for laboratory research use only. The batch includes two matched website renders, four editable label masters, label previews, an exact-ID contact sheet, and two supplier design PDFs. The independent spot-check and batch verifier pass with 2 exact pairs, 17 artifacts and 5 PDF pages. The formal KAN-31 verdict is pending for this candidate.

| Website candidate | SHA-256 |
| --- | --- |
| 5 mg primary | ffddb32bbf26d5ae8cc6a5a3cd43dcf7e6c50c3f7dd40162aaad6fdd4f7dc424 |
| 5 mg front detail | 4c2f3e01ccf963d17ab3ec938bc38ee302dbd730827a02fb560a9737653630a5 |
| 15 mg primary | 99c33810b01811e4e6d42f039315ef2655956379d9be1efa7f6b021b29d6d2ac |
| 15 mg front detail | abdc61d2e7b4a13acb4727f3fab4f0ca9482ff1d70b3e7d60ae84a23224b9194 |

Run `python deliveries/catalog-imagery/2026-11-04-batch-008/verify-batch.py` with Pillow and pypdf. After KAN-31 accepts the files, Root can consume `websiteReviewCandidates` from the exact-ID manifest and verify painted customer surfaces at 320, 390, 768 and 1280 px. Apply “Packaging design shown. Current packaging may differ.” to the website candidates. Keep wrap and supplier PDFs in the supplier-review set.

The physical state is design. Supplier approval and actual container, dieline, material, print and traceability specifications are open. Selected chemical form, excipients, approved storage, legal attribution and customer selling unit remain open. Batch 006's ten official NutriDyn images retain their held source-lead disposition.
