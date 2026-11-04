# C1-002 independent artwork review

Reviewed 2026-11-04 by Codex imagery, independently of CLAUDE-1.

- Candidate commit `e3e61ba2b6169fd7a20dc5152019232badee143a`
- Candidate tree `2c512d0702bb3adf07f53c44ea7c1da9c8ac30f8`
- Committed manifest SHA-256 `721e64d97c943225e63258fff70910561047fc6939dc8ea01f3069aab5a72546`
- [Author handoff on KAN-59](https://xeniostechnology.atlassian.net/browse/KAN-59?focusedCommentId=10722)
- [Review request on KAN-31](https://xeniostechnology.atlassian.net/browse/KAN-31?focusedCommentId=10723)

## Disposition

The 20 website WebPs pass exact variant joins and visual review. The author verifier needs portable text hashing, and the Kisspeptin artwork version needs a code-based identifier before the delivery advances to Root. The ten wrap proofs remain at packaging design stage pending supplier specifications and approval.

## Website evidence

- The committed-blob verifier checked 10 variant pairs and 20 website WebPs against the 420 catalog and Quick Order pairs at release `19d10e0495aed917b3d1fcf2844109e5e1cc6915`. Each pair has its own primary and front-detail bytes, expected role, dimensions and packaging design disclosure.
- Inspected all ten complete vial WebPs, close crops, front details and wrap WebPs. Each shows its expected name and strength. Tesamorelin and Kisspeptin fit inside the label rule. MOTS-c preserves the lowercase `c` across the vial, front and wrap. The manifest declares the catalog display's case variation.
- The Oxytocin primary and PNG master have clear spacing above the name and below its descender. On the 1254 px master, the gradient rule ends at row 563, the title occupies rows 582–667 and the strength begins at row 676. The title spans columns 458–800 within the gradient rule's 453–800 range.
- The ten wrap WebPs and corresponding SVG masters use the exact product code in both the side-panel field and the `GEN-GRP-NNNN-WRAP-v1` proof ID. The code-based ID avoids the compound name restriction on the Kisspeptin proof.
- All three static label-fact source hashes match the cited handoffs. Checked the ten label records against the 20 committed SVGs. The approved product codes occur on the wrap only, and traceability fields remain blank in the design proofs. The supplier identity scan found no identity exposure in the delivery text or image metadata.
- The author verifier passed on an LF export. A separate recompute reproduced the vial masters and flat label preview pixels. With `core.autocrlf=true` filters applied, it returned 441 passes, 25 failures and 2 skips. The failures were 20 SVG byte/hash pins and five tool hashes. The release JSON hashes also drifted, so the verifier skipped its catalog and bindings check. The second skip was the optional recompute.

## Reproduce the website checks

Run the [committed-blob verifier](verify-peptide-website-candidates.py) from the repository root with Python and Pillow.

    python deliveries/catalog-imagery/reviews/verify-peptide-website-candidates.py --candidate e3e61ba2b6169fd7a20dc5152019232badee143a --release 19d10e0495aed917b3d1fcf2844109e5e1cc6915 --batch deliveries/peptide-artwork-claude-1/2026-11-04-c1-batch-002

## Handoff to CLAUDE-1

1. Normalize text pins to canonical committed LF bytes or declare LF attributes for the hashed text inputs. Keep exact binary checks and apply the same canonical text policy to the two release dataset pins.
2. Replace the Kisspeptin `artworkVersion` with a code-based identifier such as `GEN-GRP-0308-WEB-SUPPLIER-v1` in the manifest and generator. The current identifier includes the compound fragment name excluded by the verified facts. Its rendered wrap proof already uses the correct product code.
3. Run the author verifier from a standard Windows checkout and return the exact successor with the result. The accepted visual checks carry forward after comparing the 20 website WebP hashes and the wrap hashes. Root owns runtime mounting and release verification after the successor clears review.
