# Catalog detail correction `8f080a0` / `37f2d96`: bounded delta review against doc 56

**SOURCE ACCEPT WITH LIMITS.** The correction resolves doc 56 D-1 by the first route that doc 56 offered. It restores
the accepted route title "This product is not available." and flips its own two expectations to match. The unchanged
`product-subscribe.test.tsx`, a member of doc 35's accepted 17-file set, again holds at both assertions, including when
composed with Workstream C's four blobs. The copy claims doc 56 found untrue (D-2) are now narrowed and recorded as
held, not claimed fixed. The records now carry the full doc 35 holds and a literal before/after copy ledger. No P0, P1
or P2. Everything is NOT RUN.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Delivered through the coordinator-led queue (board task
`DOC56-CATALOG-CORRECTION-DELTA-20261008` r1, acknowledged at `7219ac3`). Method: one read-only lens and an adversarial
verifier, appropriate to a three-line source delta. The verifier upheld every lens finding and added two. The subject
was never executed. Lens output archived as `hl12/60_catalog_correction_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `8f080a08af06aa16e7aaf80add1a1b25e0cfae41`, tree `7ff4d6a5059466e716d9b81f66a696cf69bc53d3` ("fix: restore catalog detail route unavailable title"), parent `9c597b2` (records: lease reclaim) |
| Delta from `e0a7d47` | exactly `MemberProductDetailExperience.tsx` (title restored at line 162) and its test (lines 261 and 263 flipped); `0dbfaf5`, `9c597b2` and `37f2d96` are records-only and touch only this owner's registry rows |
| Records | `37f2d9648916b50fae2fd99b3c5ee46174893fae` |
| Lease | the four paths were re-leased to this owner at `9c597b2`, the commit before the source commit (D-9 resolved) |
| Hashes | blob ids and raw SHA-256 recompute equal to the correction's source bindings; the recorded working-file hashes cannot be reproduced from Git bytes and are disclaimed by the records |

## 2. What holds (hand-simulated, NOT RUN)

- **D-1 resolved.** `product-subscribe.test.tsx` line 117 (unavailable response) and line 183 (slug mismatch) render
  the restored title through `ProductPage`, and line 184's no-substitution check holds. Both still hold with
  Workstream C's `736bb2a` blobs composed in: the subscription form returns nothing while hidden, and the page's
  displayed state is the unavailable state. No test on either branch asserts the withdrawn title positively.
- **The flipped expectations discriminate.** Both would fail on `e0a7d47`, and the body assertion is unchanged.
- **D-2 held, not claimed fixed.** Claims (6) and (7) are withdrawn or narrowed. The three inherited strings ("Pricing
  shown after clinical review", the supplier-pending panel and "Price on request") are listed literally as held, with
  correct anchors.
- **D-9 complete.** The records carry:
  - a literal before/after copy ledger, matching the `756a906` to `e0a7d47` diff;
  - the 17-file and 36-file sets, with a 4-file overlap and a 49-file union, matching the start receipts at `38c7239`;
  - doc 35's holds in full.
- **Remaining doc 56 items carried open.** D-3 to D-8 and D-10 are recorded as open; none is claimed closed.

## 3. Findings (all P3, verified)

- **D56C-1. The title and body now contradict each other.** The pair reads "This product is not available." then
  "Approved product information could not be loaded. This does not confirm the product's availability." Neither
  predecessor rendered this pair, and it also shows for a definitive not-found and for denials. It belongs with D-5 and
  your copy decision.
- **D56C-2. The routing half of D-5 has no owner.** It cannot be fixed by copy inside these paths. Ticket it to the
  ProductPage and API owners: map `product_not_found` to the not-found state.
- **D56C-3. The held-copy record names no decision owner.** It should name Samuel, and it omits the carried
  product-education strings that doc 56 cited.
- **D56C-4. The working-file hashes are unverifiable.** The four recorded working-file hashes match no LF, CRLF or BOM
  variant of their blobs. The binding rests on the Git hashes, which recompute.
- **D56C-5. Record readability.** Several record lines run identifiers into adjacent words.
- **D56C-6. "Reclaimed before editing" is only provable as commit order.** Git shows commit order, not edit order.
  Reword the claim if convenient.

## 4. Disposition

- Subject: `8f080a08af06aa16e7aaf80add1a1b25e0cfae41` (tree `7ff4d6a5…`), records `37f2d96`.
- **SOURCE ACCEPT WITH LIMITS** as the doc 56 correction. Doc 56's blocking defect is resolved; no P0, P1 or P2.
- **What it unlocks:**
  - The four catalog and detail paths at `8f080a0` and Workstream C's four paths at `736bb2a` (doc 57) may be composed
    together onto the integration line.
  - Nothing is enabled for customers.
- **Before release qualification, under fresh authority, at the exact integrated tree:**
  - the four lane tests, the 17-file and 36-file sets, the Products and ProductPage route tests, the typecheck, the
    no-em-dash gate and the build;
  - browser, keyboard, focus and screen-reader qualification as doc 56 listed;
  - your copy decisions for the nontransactional lanes and the unavailable state;
  - every doc 35 hold.
