# V3 master import, dry run

This is a dry run. Nothing in this report was written to any production
table, no price in it is approved, and no offer in it is published. It is
the output of `importV3Master` over the source workbook, rendered by
`buildV3DryRunReport`, so every number below is derived and none is typed
by hand.

- Source file: `XENIOS_RESEARCH_COMPLETE_MASTER_2026-08-01_V3.xlsx`
- Source sha256: `e2f7a8e1a59fbda8e01af1fc090112b8b51cc20bf30a890bab53c1d38dbc7f47`
- Generated: 2026-08-01
- Importer: `server/research/v3-import/import.ts`
- Contract: `shared/research/v3-import.ts`
- Regenerate: `npx tsx scripts/v3-import-dry-run.mts <workbook.json>`

## Row counts

| Measure | Rows |
| --- | ---: |
| Source rows read (sheet 21 Full Offer Index, below the header) | 1106 |
| Accepted as source records | 1103 |
| Rejected | 3 |
| Price book rows with no offer index row | 73 |

## Rejections by reason

| Reason | Rows |
| --- | ---: |
| missing_offer_id | 3 |
| missing_product_name | 0 |
| unknown_category | 0 |
| missing_variant_identity | 0 |
| ambiguous_variant_identity | 0 |
| variant_identity_conflict | 0 |
| no_price_book_row | 0 |
| duplicate_identity | 0 |
| unparsable_amount | 0 |

## Accepted rows by category

| Category | Rows |
| --- | ---: |
| AI & Tracking | 12 |
| Bloodwork & Testing | 42 |
| Care & Telemedicine | 12 |
| Education & Video | 12 |
| Membership & Programs | 10 |
| Peptides & Research | 86 |
| Programs & Services | 10 |
| Provider & Performance Network | 7 |
| Quantum & Regenerative | 8 |
| Shipping & Fulfillment | 7 |
| Supplements | 890 |
| White Label & Partners | 7 |

## Readiness state distribution

The resolved state is the most blocking condition. Every state in the
vocabulary is listed, including the ones no row reaches today.

| Readiness state | Rows |
| --- | ---: |
| active_public | 0 |
| member_only | 0 |
| qualified_research | 0 |
| request_access | 100 |
| care_only | 7 |
| clinical_provider_pathway | 60 |
| pending_supplier | 879 |
| pending_price | 21 |
| pending_documentation | 0 |
| pending_image | 0 |
| held | 18 |
| unavailable | 18 |
| archived | 0 |

## Blocking conditions

A row can carry several of these at once. This counts every unmet
condition, not only the one that decided the state, so a gap further down
the chain is visible before the gap above it clears.

| Blocking condition | Rows |
| --- | ---: |
| archived | 0 |
| marked_unavailable | 18 |
| marked_held | 2 |
| variant_strength_disputed | 12 |
| variant_identity_unstated | 803 |
| variant_label_contested | 65 |
| under_review | 4 |
| access_state_unrecognized | 0 |
| care_pathway_only | 7 |
| clinical_provider_pathway_only | 60 |
| access_request_required | 103 |
| wholesale_cost_pending | 994 |
| customer_price_not_approved | 1103 |
| coa_missing | 1103 |
| lot_documentation_missing | 1103 |
| product_image_missing | 1103 |

## Price and evidence readiness

| Measure | Rows |
| --- | ---: |
| In a state where an approved price may be displayed | 0 |
| Carrying an approved customer price | 0 |
| Wholesale cost sourced | 109 |
| Wholesale cost pending | 994 |
| Blocked on a disputed variant strength | 12 |
| Naming one exact variant | 235 |
| Resolved to an exact variant SKU | 71 |
| Carrying an approved product image | 0 |
| Carrying an attached COA | 0 |

## Unrecognized access values

None. Every access value in the workbook is in the classification table.

## What this run says

- 1103 of 1106 source rows imported as source records. 3 were refused.
- 0 rows are in a state where a customer price may be displayed, and 0 carry an approved customer price. An import cannot raise either number, because approval is a separate and explicit act.
- 109 rows have a sourced wholesale cost and 994 do not. Unknown wholesale remains pending, and no cost is estimated or back-solved from a sell price.
- 12 rows are blocked because the repository already records a contested variant strength for that exact unit. None of them can reach an active state.
- 235 rows name one exact variant, and 71 resolve to an exact variant SKU.
- 0 rows carry an attached COA and 0 carry an approved product image. Missing evidence stays missing.

The import contract is complete and the offers remain held. That is the
intended result. The release authority can run this again the moment
Product Control has evidence to attach, and nothing activates until it
does.
