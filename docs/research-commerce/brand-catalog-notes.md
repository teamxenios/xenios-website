# Brand catalog build notes

Four brand catalogs, 911 rows, built into `shared/research/catalog/brand-catalog.ts`
with positioning copy in `shared/research/catalog/brand-copy.ts`.

Source: the master catalog workbook, sheet "Master Catalog", verified 2026-07-29. That
sheet is the authoritative union of the four per brand sheets (Momentous, Pure
Encapsulations, Life Extension, Superpower), which hold the same rows. Its columns are
Company, Product / Offering, Catalog Type, Classification, Variant / Size, Public
Price, Coverage Status, Source URL, Verified Date, and Notes. Every field in the module
is one of those columns. Nothing was inferred from a product name, and no brand site,
product page copy, or marketing claim was read into the build.

## Counts

### By brand

| Brand | Slug prefix | Rows | Coverage |
| --- | --- | --- | --- |
| Momentous | `mom-` | 76 | 69 live product pages, 7 official help catalog entries |
| Pure Encapsulations | `pe-` | 413 | exact snapshot of the official A-Z index |
| Life Extension | `le-` | 384 | exact snapshot of the official A-Z index |
| Superpower | `sp-` | 38 | current public offering |
| **Total** | | **911** | |

### By classification

| Classification | Rows | Where they sit |
| --- | --- | --- |
| `human_supplement` | 862 | Momentous 75, Pure Encapsulations 413, Life Extension 374 |
| `blood_testing_health_service` | 38 | Superpower, all of it |
| `food_beverage` | 4 | Life Extension: three coffees and one olive oil |
| `personal_care` | 4 | Life Extension: one toothpaste, three skin care items |
| `pet_supplement` | 2 | Life Extension: Cat Mix and Dog Mix |
| `topical_non_supplement` | 1 | Momentous: PR Lotion |

### By catalog type

`official_a_to_z_entry` 797, `individual_supplement` 31, `add_on_testing_panel` 27,
`stack_bundle` 25, `travel_variant` 8, `sports_nutrition` 7, `marketplace_category` 3,
`core_testing_panel` 2, `collection_service` 2, `flavor_variant` 2, `packet_variant` 1,
`size_bundle_variant` 1, `topical` 1, `regional_testing_panel` 1, `membership` 1,
`gift_product` 1, `partner_add_on` 1.

Momentous is the only brand the workbook breaks into product, variant, and stack types,
so a row count for Momentous is not a count of distinct formulas: the same formula can
appear under more than one presentation.

## Offer state: zero purchasable rows

Every one of the 911 rows resolves to `DISPLAY_ONLY`. That is derived, not declared.
Each row is handed to the existing `resolvePrivateLaneOfferMode` from
`offer-readiness.ts` with no approved member amount and no supplier item code, and the
resolver returns the weakest mode available. `buildProduct` additionally throws at
module load if any row ever resolved to a purchase mode, so a future data edit that
tried to make one of these sellable fails the build rather than reaching a member.

Readiness splits two ways:

- 873 product rows: `NEEDS_SUPPLIER_DOCUMENTATION`.
- 38 Superpower rows: `NOT_OFFERED`. They are not waiting on paperwork, they are
  waiting on a decision about whether they belong here at all.

`resellerAuthorization` is `not_evidenced` on all 911 rows. This is a deliberately
different literal from the supplement lane's `not_authorized`. `not_authorized`
describes a supplier we are in conversation with who has not authorized us yet. For
these four brands there is no agreement, no application, and no correspondence
anywhere in the workspace, so the honest statement is that nothing is evidenced, which
is a weaker claim and must not be read as a declined authorization. It is its own
literal type rather than the shared `ResellerAuthorizationState`, so it cannot be
mistaken for a step in that lane's negotiation.

## Missing data inventory

Absent for all 911 rows:

1. **Wholesale source cost.** The workbook states no supplier cost anywhere. This
   alone makes every row unsellable: there is no margin to price against.
2. **Supplier item code.** No row identifies the exact item that would be resold, so
   even a priced row could not say what would be delivered.
3. **Founder approved member amount.** No pricing decision row exists for any of these
   911 records. The peptide and supplement lanes each have a decision matrix; this
   source has none.
4. **Written reseller authorization.** Not evidenced for any of the four brands.
5. **Form factor, serving size, servings per container.** Not stated for any row.
6. **Ingredient and allergen panels.** Not stated for any row. This is why there is no
   per product copy: 911 product descriptions would have to be invented.
7. **Minimum advertised price policy.** Not stated. Several of these brands operate
   one, and it constrains what a storefront may show.
8. **Inventory model.** No confirmation of stocked or drop ship for any row.

Partially present:

- **Public price.** Only 3 of 911 rows carry any price text, and all three are
  Superpower. Only one of the three states a number: the annual membership at
  `$199/year`, stored as `publicPriceCents: 19900` with `publicPriceBasis: "per year"`
  so a surface cannot render a yearly fee as a one time amount. The other two are
  qualitative ("Additional fee", "Included / varies") and are stored as text with the
  amount left null and a named missing input. A brand's own public price is a fact
  about someone else's storefront; it is never treated as an approved member amount
  and it is never passed to the offer resolver.
- **Notes.** 35 rows carry the workbook's own note, kept as `sheetNote`. Ten are the
  Life Extension non supplement flags, 14 are Momentous naming and bundle caveats, and
  11 are Superpower scope caveats.

## Classification decisions

### Superpower is a service, not a product

The 38 Superpower rows are blood testing panels, an annual membership, blood
collection services, a gift product, a partner add on, and marketplace categories.
Several are unambiguously clinical: prostate screening (PSA), the GRAIL Galleri cancer
screen, celiac and gluten sensitivity, autoimmune screening, fertility planning, heavy
metals, and marketplace access to prescriptions.

They are not modelled as purchasable products in the research catalog. They carry their
own classification, `blood_testing_health_service`, sit at `DISPLAY_ONLY` with
readiness `NOT_OFFERED`, and each row names two extra missing inputs: a clinical
governance decision, and a named clinician accountable for ordering, interpreting, and
following up any panel.

**Routing a blood testing service through a research materials storefront is a Care and
clinical rail question, not a catalog question.** Nothing in this module decides it, and
nothing in this module should be read as a step toward deciding it. A test asserts no
Superpower record can reach any purchase mode, including when handed the most
favourable evidence the workbook could ever supply for it.

### The 11 rows that are not human supplements keep their real classification

One Momentous topical lotion, four Life Extension foods and beverages, four Life
Extension personal care items, and two Life Extension pet mixes. None is folded into
the human supplement count. `humanSupplementListing()` returns exactly the 862 rows
classified `human_supplement`, and a test asserts the two pet products are excluded
from it by code rather than by convention. Each of the 11 also carries a category
decision missing input, so nobody can quietly promote one into a supplement listing.

The visible consequence: Life Extension's human supplement total is 374, not 384. The
difference is stated in the brand copy rather than absorbed.

## Dash normalisation

House style forbids em and en dashes in `shared/research/catalog`, and the workbook
uses en dashes in three places:

1. Three Superpower product names ("Marketplace access - supplements", "- peptides",
   "- prescriptions"). Normalised to plain hyphens, and the affected rows are named in
   the exported `DASH_NORMALISED_SLUGS` so the edit is a recorded fact rather than a
   silent one.
2. The catalog type "Official A-Z Entry", 797 rows, stored as the key
   `official_a_to_z_entry`.
3. The coverage status "Exact official A-Z catalog snapshot", 797 rows, stored as the
   key `official_a_to_z_snapshot`.

Those characters, and only those characters, were changed. Every other character in
every product name is verbatim, including the registered trademark, trademark, bullet,
and accented characters several brands use inside their own names. Renaming those would
invent a product name that does not exist. Tests assert no stored string in any of the
911 records contains either dash, and that no file in the directory does either.

## What unlocks each brand for sale

The first four items below are common to all four brands and none of them is optional:

1. Written reseller or distributor authorization from the brand.
2. A supplier price list or invoice giving a wholesale source cost per item.
3. Supplier item codes identifying the exact items.
4. A founder approved member amount per item, recorded in the pricing decision matrix.

Then, per brand:

- **Momentous (76 rows).** The smallest and most tractable. Its rows already have live
  product page urls, so specification and label data is retrievable per item once a
  supply relationship exists. The variant and stack structure needs a decision about
  which presentations we carry, because carrying all of them means carrying the same
  formula several times. The single topical lotion needs its own review: it is not a
  supplement and should not ride in on a supplement authorization.
- **Pure Encapsulations (413 rows).** A professional line, so authorization is the
  first gate and probably a practitioner account rather than a reseller agreement. The
  A-Z snapshot gives names only, so a per item specification pass is needed for every
  row we intend to carry. Carrying 413 rows is almost certainly the wrong first move:
  the useful unlock is a selected subset with real data behind it.
- **Life Extension (384 rows).** Same shape as Pure Encapsulations, plus the category
  split. The 10 non supplement rows need their own handling: food, personal care, and
  pet products each sit under different rules from a dietary supplement, and the two
  pet products should not be in a human catalog at all.
- **Superpower (38 rows).** Not a supplier question. This is blocked on a clinical
  governance decision with a named clinician, and on whether xenios offers health
  services at all. Until that decision exists in writing these rows stay recorded and
  not offered. If the answer is ever yes, it goes through the Care rail and not through
  this catalog.

## Tests

`shared/research/catalog/brand-catalog.test.ts` (52 tests) and
`shared/research/catalog/brand-copy.test.ts` (19 tests).

The transcription check is a pinned SHA-256 per brand over the product names, and a
second per brand digest over the full row fingerprint (slug, name, catalog type,
classification, variant, price text, coverage status, url). Both were computed in a
separate pass over the workbook sheet rather than over the emitted module, so any later
hand edit to any field of any of the 911 rows fails the build. The source workbook is
not in the repository, so a test that read it would pass on one machine and fail
everywhere else; the digest is the portable equivalent.

On top of the digests, the rows that carry real decisions are transcribed in full: all
38 Superpower service rows with catalog type and price text, all 11 non human
supplement rows with their classification, every priced row, and the first and last
product name of each brand block so row order is pinned at both ends.
