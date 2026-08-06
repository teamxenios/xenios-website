# CODEX-PEP-DATA handoff

## Identity and scope

- Worktree: `C:\Users\sboad\.codex\worktrees\87f8\xenios-website`
- Branch: `codex/pep-data-product-control-20260802`
- Base: `824631ae64f627a3ddc6f150145ffbcaec92d6f1`
- Source workbook SHA-256: `df317a28374c9e194f3379a2b276c8533016dc84aa906af9d48b49db46bf53d5`
- Sanitized dataset SHA-256: `61ce0fdaa1a2417b5478aed879202a80c1c5c41e4c2d4cc2cc5e5d5ac9bd5944`
- Sprint-pack SHA-256 supplied by the release manager: `6b9426ebd0681f4e3d80ac2d58067df7a8e4d4ce41b23fc647f83abf8446ae50`

This release unit reads the exact `04 Peptides & Research` sheet and builds local, review-only Product Control candidate artifacts. It does not edit Product Control core code or schema, connect to a database, approve a price, import a row, enable checkout, invoke a provider, or mutate production.

## Truthful result

The source contains 61 canonical products and 86 exact variants. All 86 variant IDs and SKUs are unique, all critical identity fields are populated, and no canonical mapping conflict was found. The workbook still authorizes zero checkout rows.

| State | Variants |
|---|---:|
| Request Access | 52 |
| Pending Documentation | 15 |
| Held | 1 |
| Care Only | 2 |
| Unavailable | 16 |
| Checkout eligible | 0 |

Seventy-six rows have a planned selling-price candidate and ten intentionally price-less unavailable rows do not. Every generated price remains `draft`, has no effective date, requires independent approval, and carries no activation authority. Every generated product and variant remains inactive and hidden; every variant is in draft review state and is explicitly non-checkout.

Each reconciliation row contains exact blocker codes rather than a generic hold. The aggregate blockers preserve source-supported dispute, documentation, COA, inventory, lot, expiration, testing, fulfillment, shipping, cold-chain, image, supplier-fill, and price-approval gaps.

## Outputs

- `peptide-reconciliation.csv` and `peptide-reconciliation.json`: one sanitized row per exact variant with identity, planned customer price (when present), truthful state, and blocker codes.
- `product-control-import-candidate.json`: 61 hidden draft products, 86 inactive draft variants, and 76 unapproved price drafts. Its policy explicitly sets database apply and production mutation to false.
- `rejected-rows.json`: structurally rejected source rows; the bound workbook has zero.
- `state-counts.json`: state, action, price, and blocker reconciliation totals.

Supplier identities, supplier product codes, wholesale economics/status, activation prose, source notes, source sheets/rows, and private image-owner/source fields are excluded by construction. A focused forbidden-field/value scan found no leakage in the committed artifacts.

## Operation and idempotency

Read-only dry-run:

```powershell
python scripts/peptide_product_control.py `
  --workbook "<local verified workbook>" `
  --expected-sha256 df317a28374c9e194f3379a2b276c8533016dc84aa906af9d48b49db46bf53d5 `
  --mode dry-run
```

Local artifact apply only:

```powershell
python scripts/peptide_product_control.py `
  --workbook "<local verified workbook>" `
  --expected-sha256 df317a28374c9e194f3379a2b276c8533016dc84aa906af9d48b49db46bf53d5 `
  --mode apply `
  --output-dir docs/coordination/peptide-data
```

Dry-run performs zero writes. Apply atomically replaces only the five declared artifacts whose bytes differ. An immediate second apply reported zero changed files and all five unchanged.

## Validation

- Focused/adversarial standard-library tests: 7/7 passed.
- Duplicate SKU and variant ID rejection: passed.
- Blank critical identity rejection: passed.
- Conflicting canonical mapping rejection: passed.
- Source SHA mismatch rejection: passed.
- `$0`/zero planned-price rejection and price-less unavailable handling: passed.
- Private supplier/wholesale/source-note non-leakage: passed.
- Byte-idempotent second apply: passed.
- Bound real-workbook dry-run: passed with zero writes.

## Protected integration request

No protected seam is needed for this release unit. A later database execution step would require a separate release-manager lease and independent review to:

1. reconcile the source product/variant keys to real Product Control UUIDs;
2. decide create-versus-update behavior against current database state;
3. establish approved effective dates and independently approve any price;
4. re-evaluate all identity, inventory, lot, documentation, media, processor, reservation, and fulfillment gates; and
5. retain a fail-closed result for every unresolved SKU.

There is no configuration-queue row for this unit. No credential or secret is required for dry-run or local artifact apply.
