# Catalog sort, category filter, and facet counts

Lane: `lane/catalog-sort-facets`, branched from `d7984eb`.

This extends the full catalog v2 query surface with server-side sorting, a
category filter, and facet counts. It changes no privacy behavior, creates no
purchasability, and touches no composition root, dataset loader, price
authority, or migration.

Everything below was developed and measured against the real generated catalog:
1,121 member-safe offerings, 1,181 member-safe variants, 11 admin-only holds.

## Contract additions

In `shared/research/master-offerings/contract.ts`:

| Addition | Shape |
| --- | --- |
| `MASTER_OFFERING_SORTS` | `["relevance", "name_asc", "name_desc", "availability"]` |
| `MasterOfferingSort` | the union of those four |
| `MASTER_OFFERING_SORT_LABELS` | display copy per sort |
| `DEFAULT_MASTER_OFFERING_SORT` | `"relevance"` |
| `isMasterOfferingSort(value)` | runtime membership guard, same style as `isMasterOfferingFamily` |
| `MASTER_OFFERING_CATEGORY_SLUG_PATTERN` | `/^[a-z0-9][a-z0-9-]{0,63}$/` |
| `MASTER_OFFERING_MAX_CATEGORY_FILTERS` | `24` |
| `isMasterOfferingCategorySlug(value)` | runtime shape guard |
| `MasterOfferingFacetBucket<TValue>` | `{ value, label, count }` |
| `MasterOfferingCatalogFacets` | `{ families, states, categories }` |
| `EMPTY_MASTER_OFFERING_FACETS` | for a caller that must build an empty page |

`MasterOfferingCatalogQuery` gains two optional keys:

```ts
categories?: readonly string[];   // category slugs, as published by the facet
sort?: MasterOfferingSort;        // omitted means DEFAULT_MASTER_OFFERING_SORT
```

`MasterOfferingCatalogPage` gains two required fields:

```ts
sort: MasterOfferingSort;             // the sort actually applied, echoed back
facets: MasterOfferingCatalogFacets;  // counts for the whole match set
```

Both are required rather than optional. A list response without counts is a
half-answer, and an optional field on a response is a field that rots. The cost
is four constructor sites, all fixed in this lane.

Wire keys, added to the closed allowlist in `routes.ts`:

- `GET /api/research/catalog-display/v2/catalog` now accepts `sort` and
  `categories` alongside `q`, `families`, `states`, `page`, `pageSize`.
- `GET /api/research/catalog-display/v2/price-list` accepts `categories` but not
  `sort`. An export is an artifact people save and diff, so two exports of the
  same filter must have the same row order. A display preference has no business
  changing a document's shape.
- Any key outside those sets is still a `400 master_offerings_invalid_request`.

## The sort vocabulary, and why the default is `relevance`

| Value | Ordering |
| --- | --- |
| `relevance` | search score descending, then the tie breaker |
| `name_asc` | display name ascending, then the tie breaker |
| `name_desc` | the exact reverse of `name_asc`, tie breaker included |
| `availability` | `MASTER_OFFERING_DISPLAY_STATE_RANK` ascending (strongest state first), then the tie breaker |

It is a closed set of intents, not a column name. A free-text sort key would let
a caller name a field the surface never meant to order by and would tie the wire
contract to the shape of the server model.

**Default: `relevance`.** With a query it ranks by the existing scorer, which is
what a member who typed something expects. With no query every score is equal,
so it collapses exactly onto the tie breaker, which is the ordering the catalog
already shipped. That is the whole reason it is the default: introducing a sort
control must not silently reorder the catalog for every caller who never asked
for one. The proof is that all 170 pre-existing tests in this module passed
unchanged, and `real-catalog-sort-facets.test.ts` asserts the default ordering
equals the pre-lane `displayName|slug` ordering over the real 1,121.

### The tie breaker, which is the paging contract

Every sort ends with `` `${displayName}|${slug}|${id}` ``, ascending (descending
for `name_desc`, so the two name sorts are mirror images).

Both `slug` and `id` are unique per offering, so this key is a **total order**:
no two offerings ever compare equal, so no sort can leave two offerings in an
order that depends on how the reader happened to arrange the input. That is
exactly the property that stops page 2 from repeating or skipping what page 1
showed. The leading `displayName|slug` is byte for byte what the catalog already
ordered by; the trailing `id` is a no-op while slugs are unique and a guarantee
if one ever is not.

### `newest` is deliberately absent

Nothing in the member-safe dataset carries a per-offering timestamp. The
offering keys are `aliases, brand, canonicalName, category, copyState,
displayName, displayState, family, id, slug, stateExplanation, subcategory,
variants`. The only date in the file is the file-level `generatedAt`, and
`sheetRow` is on `MASTER_OFFERINGS_DATASET_BANNED_KEYS`, so even source order is
unavailable to the reader by design. Shipping a `newest` control before the data
exists would ship a control that silently returns some other order. Adding it
later needs a per-offering `firstListedAt` written by the builder, which is the
dataset lane's call, not this one's.

## The category filter decision

**Decision: the wire value is a slug derived from the workbook category by the
repository's existing `slugify`, validated by a bounded shape guard, and
resolved against the categories actually present in the member-safe catalog. It
is neither a raw string nor a hardcoded enum.**

The real data drove this. The 11 categories present:

| Slug | Label | Offerings |
| --- | --- | --- |
| `ai-tracking-education` | AI, Tracking & Education | 24 |
| `bloodwork-testing` | Bloodwork & Testing | 42 |
| `care-telemedicine` | Care & Telemedicine | 11 |
| `competitor-expansion-candidate` | Competitor Expansion Candidate | 32 |
| `memberships-programs` | Memberships & Programs | 20 |
| `peptides-research` | Peptides & Research | 76 |
| `quantum-regenerative` | Quantum & Regenerative | 8 |
| `research-supplies` | Research Supplies | 1 |
| `shipping-fulfillment` | Shipping & Fulfillment | 7 |
| `supplements` | Supplements | 893 |
| `white-label-partners` | White Label & Partners | 7 |

Category is a genuine cross-cut of family, not a duplicate of it, so the filter
earns its place: `Peptides & Research` spans `blends`, `clinician_guided_care`,
`laboratory_supplies`, and `research_vials`; `Competitor Expansion Candidate`
spans the same four. Four of the twelve families carry more than one category.

### Why not the raw string

`AI, Tracking & Education` contains a comma, and the comma is the separator the
existing multi-value list parser splits on. A raw category filter is not merely
a looser security posture here, it is unencodable in the shape the surface
already uses for `families` and `states`.

### Why not a hardcoded closed enum

Two reasons.

1. **The raw strings are not approved member-facing copy.** One of them is
   `Competitor Expansion Candidate`, an internal planning label. Freezing the 11
   into `contract.ts` would enshrine unapproved copy in a file whose own header
   says a customer surface may import it.
2. **The vocabulary is data-owned, not contract-owned.** Families and display
   states are declared by the contract, so a membership guard is correct for
   them. Categories come from a workbook that changes without a contract
   release. A hardcoded list would let the server render a facet chip and then
   answer a `400` when the member clicks it. A server that rejects a value it
   just published is self-inconsistent, and that failure lands on a real member
   on a real chip.

### The security posture of the shape guard

The guard is `^[a-z0-9][a-z0-9-]{0,63}$`, capped at 24 values per request. A
malformed token is a `400`, exactly like a malformed family. A well-formed but
unrecognized slug matches nothing and returns an empty page, which is truthful:
the vocabulary can legitimately go stale under a client.

What the bound buys, stated plainly:

1. **The value never reaches a query language.** It is compared with `===`
   against a precomputed slug held in a `Map` and a `Set`, never used as an
   object key, a path, a regular expression, or a database predicate. There is
   no injection surface to widen.
2. **Shape, length, and count are all bounded.** No control characters, no
   newlines, no whitespace, no unicode, at most 64 characters, at most 24
   values. That closes the log-injection and unbounded-retention shapes that an
   open string parameter would carry. Families and states need no count cap
   because a closed vocabulary is self-limiting; the category list is only shape
   checked, so it gets an explicit ceiling.
3. **It enumerates nothing private.** The slug space is derived from member-safe
   offerings only. A probe for a hold's category returns the same empty page as
   any other unknown slug, and no hold is in the dataset to begin with.
4. **The server publishes the vocabulary it accepts.** The category facet lists
   every category in the member-safe catalog on every response, so a client
   never guesses, and a test asserts every published slug passes the guard.

Two different workbook labels could in principle slug identically. Behavior is
defined rather than discovered: they fold into one bucket, the count is exact
because the filter uses the same slug and selects both together, and the label
settles on the lexicographically first so the response never depends on catalog
order. No collision exists in the current catalog.

## Facet counts

Every list response now carries counts for the current query **minus that
facet's own selection**, which is the standard behavior: with
`families=supplements` selected, the family counts still answer "how many would
I get if I switched to diagnostics", while the state and category counts stay
scoped to supplements. The text query is not a facet: an offering the member's
own words exclude is not an alternative reachable by changing one filter, so it
counts nowhere.

Closed vocabularies publish every member including the zero counts, so a filter
row does not reshuffle as a member types. Families come in declaration order,
states in display-state rank order (strongest first, the same rank the
`availability` sort uses), categories alphabetically by label.

Real catalog, no filters, all three groups sum to 1,121:

- families: `supplements` 893, `research_vials` 70, `diagnostics` 42,
  `clinician_guided_care` 30, `education_and_tracking` 24, `programs` 20,
  `blends` 17, `quantum` 8, `shipping_and_fulfillment` 7,
  `white_label_and_partners` 7, `laboratory_supplies` 3, `provider_network` 0
- states: `planned` 939, `care_pathway` 78, `request_access` 74,
  `available_now` 16, `approval_required` 13, `temporarily_unavailable` 1,
  `available_this_week` 0, `coming_soon` 0, `unavailable` 0
- categories: the table above

`provider_network` reading 0 is the privacy result, not a coincidence: every
provider-network offering is an admin hold.

### Cost: one traversal, no extra scan per facet

The naive shape is one filtered scan per facet plus one for the result set, so
four scans and four scorings of the catalog. This does it in one.

The insight is that the four predicates are independent. For each offering,
compute "matches the text query", "matches the family filter", "matches the
state filter", "matches the category filter" once, then fan them out:

- counts toward the family facet if it matches q, states, and categories
- counts toward the state facet if it matches q, families, and categories
- counts toward the category facet if it matches q, families, and states
- is in the result set if it matches all four

The text score, which is the expensive part, is computed once per offering and
reused by all three counters and the result set.

Measured on the real 1,121, 50 runs per case, tsx on Windows:

| Case | Facets on | Facets off | Naive per-facet |
| --- | --- | --- | --- |
| no query | 0.46ms | 0.54ms | 4.15ms |
| family filter | 0.51ms | 0.30ms | 2.21ms |
| text query `vitamin` | 1.27ms | 1.05ms | 5.26ms |
| text plus filters | 1.37ms | 1.22ms | 3.60ms |
| sort `availability` | 0.66ms | 0.73ms | 3.12ms |
| sort `name_asc` | 0.35ms | 0.36ms | 3.00ms |
| category filter | 0.14ms | 0.12ms | 1.13ms |

Facets are free to within measurement noise, and 3 to 8 times cheaper than the
naive shape. The one honest overhead is the narrow-filter case: with
`families=supplements` the search alone scores only the 893 supplements, while
the faceted pass must consider all 1,121, because an offering excluded by the
family filter still needs its q-match to count toward the family facet. That is
+0.21ms and it is inherent to correct facet counts, not to this implementation.

The tests assert the traversal count is exactly 1 rather than asserting a
wall-clock budget, following this module's own recorded lesson that a timing
threshold tight enough to catch the regression is also tight enough to fail on a
busy machine.

A side check in the measurement harness ran the naive four-scan implementation
against the single pass on every case and confirmed bucket-for-bucket agreement.

## Privacy

Facet counts cannot reveal an admin-only hold.

- The generated dataset contains no hold: the builder drops every admin-only
  offering and every admin-only variant, which is why `provider_network` counts
  0 while 11 holds exist upstream.
- The counting pass refuses `visibility !== "member"` again before it touches
  any counter, so a hold that somehow reached the reader still counts nowhere.
- `real-catalog-sort-facets.test.ts` injects 11 hold-shaped offerings into the
  real catalog and asserts all three facet groups still sum to 1,121, the hold's
  category slug never appears in the vocabulary, `provider_network` still counts
  0, filtering by the hold's own family or category returns nothing, and no sort
  surfaces a hold. A probe cannot distinguish "held" from "does not exist".

## Verification

`npx tsc --noEmit`: clean.

`npx vitest run server/research/master-offerings`: **26 files, 210 passed, 1
skipped**, up from 24 files and 170 passed. The one skip is a deliberate marker
that fires only when the generated dataset is absent, so nobody reads a green
run as proof the real catalog was exercised.

The four client files this lane touched
(`full-catalog`, `accessibility`, `catalog-surface`, `catalogApi`) were run
separately: 33 passed.

New tests:

- `server/research/master-offerings/sort-facets.test.ts`: the closed sort
  vocabulary, the default equalling the shipped order, the name-sort mirror, the
  availability rank, paging stability under every sort including the
  colliding-display-name case, category slugging and filtering, slug collision
  behavior, all three facet semantics, hold exclusion, single traversal, and the
  parser (unknown key still 400, malformed sort and malformed category slug
  refused, category count cap, `sort` refused on the export).
- `server/research/master-offerings/real-catalog-sort-facets.test.ts`: the same
  properties against the real generated catalog. Pages the entire catalog under
  all four sorts at page sizes 24 and 100 and asserts the union is exactly 1,121
  distinct ids with zero duplicates and zero omissions; repeats it for a
  filtered and searched subset at page size 7; asserts every published category
  slug is one the parser accepts; asserts every facet bucket's count equals what
  filtering by that bucket actually returns; and runs the injected-hold privacy
  proof.
- `catalog-completeness.test.ts` gains the same page-every-sort-exactly-once
  proof and a facet-sum proof over the synthetic 1,121-shaped catalog, so the
  property is covered at scale on a machine without the generated dataset.

To regenerate the dataset the real-catalog suite needs:

```
python scripts/research/export-master-offerings.py <workbook>.xlsx
npx tsx scripts/research/build-master-offerings.ts \
  .local/research/master-offerings/private-intake.json
```

## Not done, and why

- **No UI.** `FullCatalogPage` and `MasterOfferingCatalogControls` render no sort
  control, category chips, or counts. The client URL builders in
  `integration-packet.ts` were extended additively so the new keys can be
  expressed and round-tripped through the browser query string, because
  otherwise the server capability would be unreachable, but rendering is a
  separate lane.
- **No reader change.** Nothing about the dataset loader or the reader interface
  was touched. See "For the dataset lane" below.
- **No count cap on `families` or `states`.** A caller can send a very long list
  of duplicate valid family values today and it is accepted. That is
  pre-existing, harmless because a closed vocabulary is self-limiting after
  deduplication, and out of this lane. Noted rather than changed.

## One pre-existing flake observed

`catalog-boundaries.test.ts > is not imported by any client file` reads every
`.ts` and `.tsx` under `client/src`, `server`, and `shared`: 1,378 files and
about 5.5MB. On this machine it takes 5 to 9 seconds against vitest's default
5,000ms timeout, so it passes only while the operating system's file cache is
warm. It failed twice under parallel load during this lane and passed ten
consecutive times afterwards, including with this lane's two new test files
removed and restored, so it is a pre-existing timing fragility rather than
something this lane caused. Twenty-seven kilobytes of new test source cannot
move a 5.5MB scan.

It is worth a `testTimeout` on that test, or caching the walk across the whole
suite instead of per file. Not changed here, since lowering or raising a gate is
not this lane's call.

## For the dataset lane

Two requests, neither made here:

1. **A per-offering recency field**, for example `firstListedAt`, written by
   `build-master-offerings.ts` into the generated dataset. Without one, `newest`
   cannot be honest. `sheetRow` is banned from the file, so this needs a new
   member-safe field rather than an unban.
2. **A committed member-safe dataset fixture, or a checked-in category
   vocabulary snapshot**, so the real-catalog suite runs in CI instead of
   skipping. Today the only always-running scale coverage is the synthetic
   1,121-shaped catalog.

## Could not determine

- **Whether `Competitor Expansion Candidate` should be member-visible.** It is
  an internal planning label already shipping as a card field and already
  searchable, so this lane changed nothing about it. But a facet promotes it
  from a small line on a card to a filter chip with a count of 32 next to
  `Supplements`. That is a copy and merchandising decision for whoever owns
  member-facing copy, and it is the strongest argument that the raw workbook
  strings should not be frozen into the shared contract.
- **Whether the category facet should hide zero-count categories.** It currently
  publishes all 11 always, which keeps the chip row stable and makes the
  response the authoritative source of the vocabulary. If the UI would rather
  hide empties, that is a client filter over the same data and needs no server
  change.
