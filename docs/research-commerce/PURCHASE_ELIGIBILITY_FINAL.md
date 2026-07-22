# Purchase Eligibility (Final)

Evaluated against the existing eligibility rules in
`shared/research/catalog.ts` (`evaluatePurchaseEligibility`). Those rules were
NOT weakened. Each SKU is evaluated independently.

## Result

**Purchase-eligible SKUs: 0 of 15. Blocked SKUs: 15 of 15.**

This is the eligibility engine working as designed, not a failure of intake. The
signed master advanced the supplier facts, but eligibility requires more than
supplier-stated facts.

## Every requirement, reported separately

For all 15 SKUs (P001-P015), lane `research_material`:

| Requirement | State | Note |
| --- | --- | --- |
| Supplier identity | Provided (signed master) | Apex BioInnovations LLC; execution confirmation pending |
| Product identity (name) | Supplier-stated | supplier_reported, not member-displayable |
| Composition | Supplier-stated | supplier_reported |
| Strength | Supplier-stated (32 corrected) | supplier_reported |
| Format / size | Supplier-stated | supplier_reported |
| Member price | Supplier-stated | supplier_reported |
| Storage | Supplier-stated | supplier_reported |
| Shelf life (statement) | Supplier-stated | supplier_reported; stability study not on file |
| Reported inventory | Supplier-stated | not a live stock feed |
| Active lot | Referenced only | lot IDs stated; no lot record on file |
| COA | **NOT on file** | `referenced_not_found`; blocks commerce |
| Quality documentation | **Incomplete** | no COA/spec/storage file present |
| Recall status | Unestablished | `RECALL-CONTACT-v2` referenced, absent |
| Shipping profile | Supplier-stated | validation record not on file |
| Fulfillment provider | Apex Fulfillment (stated) | not operationally connected |
| Payment provider | Not configured | no processor; commerce flags false |
| Required agreements | Drafts only | counsel review pending (PR #30) |
| Feature flag | `false` | product commerce disabled |
| Admin release state | Not released | founder release pending |

## Block reasons (per SKU, from the eligibility engine)

Every SKU returns `purchasable: false` with at least:

- `unconfirmed_commerce_critical_facts` — the COA fact is not confirmed (and
  non-COA facts sit at `supplier_reported`, not the `confirmed` the engine
  requires for member display).
- `quality_documentation_incomplete` — `qualityDocumentState` is not `approved`
  (no COA on file).
- `commerce_capability_disabled` — `NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED` is
  false.
- `commerce_not_approved` — no written product-commerce approval, processor, or
  founder release.

No SKU is unlocked using another SKU's documents; each is evaluated on its own
facts and lots.

## What would move a SKU to eligible

All of, per SKU:

1. Its actual COA arrives through the secure channel and is matched (ID, SKU,
   lot, SHA-256, type, product/lot binding) and marked `verified`.
2. Its supplier specification, storage record, and shipping validation arrive
   and are matched, moving `qualityDocumentState` to `approved`.
3. Samuel (with counsel) promotes the supplier-reported facts to `confirmed`
   after confirming the signed master's execution.
4. A payment processor is configured and approved for the product category.
5. `NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED` is turned on and the SKU is
   admin-released.

Steps 1 and 2 depend on documents that are not yet present. Until they are, the
safe position holds on its own: the catalog is visible to active members with
provenance-gated facts, and nothing can be purchased.
