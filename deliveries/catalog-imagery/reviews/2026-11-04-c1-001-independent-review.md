# C1-001 independent artwork review

Reviewed 2026-11-04 by Codex imagery, independently of CLAUDE-1.

- Candidate commit: `a7f43426ec3270c3f25270b4a37bf1633a2bbeb1`
- Candidate tree: `258ad3f560aee6a0844b592602b9f8345e27c16a`
- Committed manifest SHA-256: `3adfb80ce82762f4b74a634b727a495f1a7764794ceadb6e004d69258e7835f8`
- Author delivery: [KAN-59/10695](https://xeniostechnology.atlassian.net/browse/KAN-59?focusedCommentId=10695)
- Review request: [KAN-31/10696](https://xeniostechnology.atlassian.net/browse/KAN-31?focusedCommentId=10696)

## Disposition

The four primary WebPs, four front-detail WebPs and four design wraps pass independent file-level visual and identity checks. The delivery handoff needs a provenance correction and portable verification before it is ready for Root integration. The current candidate remains at packaging design stage.

| Exact variant | Offering ID | Source variant ID | Product code |
| --- | --- | --- | --- |
| Ipamorelin 10 mg | mo_e9e1c849f7549246cb89 | mov_80aaef9ddc11edab6c89 | GEN-GRP-0302 |
| KPV 10 mg | mo_bb39fc388cb58003b1f8 | mov_15eddad2da8035493bd6 | GEN-GRP-0306 |
| Selank 10 mg | mo_d045624d6f5d00d2cda2 | mov_99e4c4e045d188c3026f | GEN-GRP-0331 |
| Thymosin Alpha-1 10 mg | mo_f23a8023a45df853f6e1 | mov_ba80c9a61870131db0cf | GEN-GRP-0350 |

## Evidence

- Read the exact committed blobs. All 32 variant artifacts and the contact sheet match the declared byte counts, SHA-256 hashes and dimensions. The 24 rasters decode, the eight SVGs parse, and all eight website roles bind to their corresponding WebPs and the packaging-design disclosure.
- Verified the four offering, source variant, Quick Order product, Quick Order variant and SKU joins against the pinned 420-pair catalog and bindings. Both local static label-fact file hashes matched the cited Jira handoffs. Amounts are nominal 10 mg per vial. All four are research-use lyophilized vial designs, and the product code appears on the wrap only.
- Compared the four PNG masters pixel by pixel with the accepted Batch 004 source. The changed areas are contained in the declared name or name-and-amount regions. Inspected the four actual primary WebPs at full size, the actual front-detail and wrap WebPs, and the 72/120 px contact-sheet previews. The complete vial stays in frame and the exact name and amount read at detail scale. The long Thymosin Alpha-1 name fits cleanly in two lines. The narrower Ipamorelin setting remains clear. The compact card still needs adjacent product identity text at thumbnail scale.
- The wrap's PRODUCT CODE wording matches the verified label facts. The Batch 004 preview weight is suitable here. The visual difference from Batch 008 is minor and does not require reopening those accepted bytes.
- The supplied verifier on an LF export with the private forbidden-term input returned 154 passed, zero failed, zero skipped. The scan found no supplier or unsupported label text in the SVGs. Reviewed the delivered text files for workbook rows, private paths and embedded supplier evidence.

## Corrections for CLAUDE-1

1. Add [KAN-59/10667](https://xeniostechnology.atlassian.net/browse/KAN-59?focusedCommentId=10667) and SHA-256 `186a9673b12ac3931ca5f455f7c722ad7c56b574ff618f35936c198663cccccf` to the manifest lineage for Ipamorelin, Selank and Thymosin Alpha-1. Retain [KAN-59/10654](https://xeniostechnology.atlassian.net/browse/KAN-59?focusedCommentId=10654) for KPV. The author handoff already gives the missing citation.
2. Make verification reproducible from a standard Windows checkout. With `core.autocrlf=true`, the same commit produced eight SVG byte/hash failures, two Python tool hash failures and skipped the catalog/binding check. With an LF export all of those checks pass. Pin delivery text to LF or define canonical LF bytes for text pins, and compare the shared catalog/binding files as canonical committed bytes. Preserve exact binary byte checks. Document any remaining optional private check separately from required inputs.

Resume on an exact successor with the two corrections, a clean Windows verification run and the same eight website WebP hashes. A metadata-only successor can reuse this visual review after byte comparison. Root owns mounted checks and the release decision. Supplier confirmation and press specifications remain separate.

## Reusable website mapping check

Run [verify-peptide-website-candidates.py](verify-peptide-website-candidates.py) from the repository root with Python and Pillow. Fetch the named artwork and trusted release commit objects if they are absent locally. The command reads committed bytes directly from Git and works with either Windows checkout line-ending setting.

    python deliveries/catalog-imagery/reviews/verify-peptide-website-candidates.py --candidate a7f43426ec3270c3f25270b4a37bf1633a2bbeb1 --release 19d10e0495aed917b3d1fcf2844109e5e1cc6915 --batch deliveries/peptide-artwork-claude-1/2026-11-04-c1-batch-001

For the next CLAUDE-1 batch, substitute its exact candidate commit, independently known release baseline and delivery path. Record the resulting manifest SHA-256, variant count and WebP count in the existing review.

The C1-001 run checked 4 variant pairs and 8 website WebPs against 420 canonical release pairs. A negative control replaced Ipamorelin's website primary pointer and digest with KPV's valid values while leaving both artifact lists and binaries intact. The author verifier passed that input. The new check rejected it at GEN-GRP-0302.

The check covers the catalog and Quick Order joins, the primary and detail roles, exact WebP bytes, decode, dimensions, alt-text presence and packaging disclosure. Human review establishes what each image depicts, checks alt-text accuracy and wrap/proof lineage, and records whether previously reviewed artwork hashes changed. Mounted and live results require separate evidence.
