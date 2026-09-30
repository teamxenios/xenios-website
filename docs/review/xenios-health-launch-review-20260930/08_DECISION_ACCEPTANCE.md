# Acceptance checks for the 2026-09-30 founder decisions (for the Codex successor)

**Method:**
- Three read-only traces: variants, Superpower, and recorded restrictions.
- Each trace was adversarially verified by an independent skeptic: 103 claims confirmed and 14 corrected.
- Claude then re-checked the most consequential items at the cited lines, listed below.

**Subject:** application source identical to `c213707`, since the `93b0183` slice touches only `clarity/pages.tsx`.

**Decisions covered** (all in `05_FOUNDER_PRICE_CONFIRMATION_2026-09-30.md`):
- include every product row, including GRP-0421, GRP-0423 and GRP-0424;
- Hexarelin 6250 on GRP-0426 and Oxytocin 10750 on GRP-0425;
- the book display cents for the 17 rounding rows;
- Superpower and Mito Health as Coming soon.

## A. Re-verified by Claude (exact lines)

| # | Fact | Evidence | Consequence |
| --- | --- | --- | --- |
| A1 | The assisted-order card shows the price of **any bound, priced row, whatever its pathway**. | `server/research/assisted-order/production-catalog.ts:197` `unitPriceCents: priced && identity !== null ? price.amountCents : null` | Today the served "Hexarelin (5mg)" and "Oxytocin (10mg)" rows (GRP-0402/0407, bound) would show the last recorded live **$49.00 / $59.00** under Request Order, not the founder's $62.50 / $107.50. The hosted reprice is needed whether or not the catalog is regenerated. |
| A2 | **The Retatrutide price ladder is not monotonic**, and it is live as last recorded. | Ledger rows GRP-0323..0330 and GRP-0421. Book and last recorded live agree: 5 mg $175.00, 10 mg $64.50, 15 mg $89.50, 20 mg $159.00, 30 mg $112.00, 40 mg $189.00, 50 mg $1,075.00, 60 mg (new) $249.00. | 5 mg costs more than 10 to 40 mg. 30 mg costs less than 20 mg. 50 mg is about 4× the 60 mg price. These look like data-entry errors. **New finding HL-21 (P2): founder price check required before the 60 mg row or any reprice is published.** |
| A3 | The build hard-codes `master-catalog-reconciliation-20260821.json`. The runtime reads the **newest** `master-catalog-reconciliation-*.json`. | `scripts/research/build-master-offerings-from-catalog.ts:43`; `server/research/master-offerings/reviewed-holds.ts:56-68`, whose comment claims "matching the build" | Adding a dated reconciliation file (for example a 2026-09-30 decision file) changes runtime holds but not the build. One authority must be used for both. |
| A4 | The runtime formulation hold is keyed on **specification text**. | `reviewed-holds.ts:102-106` (`normalizeSpecification(hold.specification)`) | This conflicts with the founder's 2026-08-21 standing rule: "No commerce decision may depend on … specifications … or string matching" (`.xenios/FOUNDER_DECISION_2026-08-21_PRICE_AND_PRODUCTION_GO.md` §2). GRP-0422 must be held by structured id. |
| A5 | The bindings build requires dataset row count = intake row count (426). | `scripts/research/build-master-offering-bindings.ts:274-278`; it also pins exactly three expected-unbound rows and fails on unclaimed production units (verified by the skeptic at `:99-103`, `:377-386`) | A 424-row reconciled catalog cannot be bound by the current script. The merge (GRP-0402/0407 → GRP-0426/0425) needs an explicit supersession mapping, not index alignment. |
| A6 | The Superpower offer read is **member-only**. | `server/research/products-diagnostics/routes.ts:265` (`active` guard) | Anonymous and Early Access visitors cannot see a "Coming soon" Superpower listing from this endpoint. If the founder wants it visible to the public, the public offerings surface needs its own server-side read of a safe projection. |
| A7 | The default pending copy presupposes a partner. | `client/src/research/products-diagnostics/DiagnosticsExperience.tsx:91` `title="Partner offer not enabled"` | This contradicts "no agreement yet". Replace it with neutral Coming soon copy. |

## B. Verified by the skeptic pass (not independently re-run by Claude)

**Variants: how each row is created**
- Offering ids are deterministic and source-only: `mo_`/`mov_` sha256 of Group ID, family, product and specification
  (`normalize-catalog.ts:141-184`).
- Regeneration needs the private intake and `XENIOS_ALLOW_REVIEWED_CATALOG_OUTPUT=true`.
  - An intake whose sha matches the config (`6478ad0d…`) exists on this host, outside the repository.
  - Only its identity columns were read.
  - It yields 424 canonical rows: 418 keep today's ids, and 6 are new (GRP-0421 to GRP-0426).
- The binding and price for a new row are **hosted-only**:
  - Product Control variant, and product for GRP-0422, whose product does not exist yet;
  - price rows through `research_admin_create_product_price` → `research_admin_approve_product_price`.
- Retatrutide, MOTS-C and Glutathione research-use products already exist. Only new variants are needed for them.

**Interim state after regeneration, before any hosted change**
- A new unbound row renders **"Request pricing" / "Price on request"** and is requestable
  (`production-catalog.ts:178-214`; `action-policy.ts:89-96`).
- GRP-0426 and GRP-0425 get new ids, so they also go **unbound**. Hexarelin and Oxytocin 10 mg would drop from
  "$49 / $59" to "Price on request" until the hosted binding and price exist.
- A stale browser snapshot holding a synthetic identity is refused at submit (`production-catalog.ts:406-412`).

**Details to fix in regeneration and tests**
- GRP-0422's customer label keeps the internal "(split pending)" text. It must be cleaned once the hold is keyed by id.
- The generated `sourceRowCount` becomes 424, but `verify-master-offerings-dataset.ts` defaults to 420/420.
- `production-bindings.test.ts:111-119` pins five keys per binding.
- The order-intake-matrix tripwire counts must be re-pinned deliberately: 139 peptides, 111 candidate peptides and
  136 total candidates.
- The committed manifest records a host-specific absolute output path, which causes diff noise.

**Care pathway state for two non-product rows**
- GRP-0364 FedEx and GRP-0365 Syringes render "Explore Care" in the member lane because they are `care_pathway`
  (`action.ts:279-284`). That conflicts with "shipping line" and "Price on request".

**Retatrutide inventory**
- GRP-0410/0411 "Retatrutide / GLP-3" 12 mg and 24 mg are Classification Pending, not research-use, and are
  requestable today at $275 / $500.
- `priority-config.ts:36,51` associates Retatrutide with "Provider / Care" lanes on the account overview.

**Lifecycle gates**
- There is no lot, COA or verified-supplier gate in the assisted-order lifecycle.
  `supplier_processing` needs only a non-empty `supplierAssignmentId`, and `shipped` only a `trackingId`
  (`assisted-order/service.ts:203-214`).

**Superpower surfaces**
- The DB has a price CHECK (`>= 0`) and an interest-href CHECK, but no requirement of price, dates or agreement for
  `available`.
- Rows are not re-validated on read (`production-deps.ts:464-474`).
- Admin updates replace the nested interest and affiliate objects wholesale.
- A read failure returns "The update could not be saved" (`routes.ts:136-146,269-271`).
- `brand-catalog.ts` holds 38 display-only Superpower service rows with public price text ("$199/year" and others)
  dated 2026-07-29. They are unwired today.
- Tests that pin the current behaviour must change deliberately: `Website3Configuration.test.tsx`, which asserts an
  "available" offer with partner URLs, and `DiagnosticsExperience.test.tsx`.
- Mito Health is absent everywhere.

**Kris Launch A lane (founder awareness; not re-verified end to end by Claude)**
- It is a second 420-row surface from the older workbook, enabled in the production env-shape fixture
  (`production-env-shape.fixture.json:38`).
- It prices Retatrutide 5-50 mg to the `KRIS_VOLUME_PARTNER` profile. The overlay describes that partner as having
  telemedicine and 503A/503B pharmacy relationships.
- Whether a research-use product can reach a clinical channel this way is a Research-to-human-use question for the
  founder or counsel. It is listed as a risk, not a verified defect.

## C. Open founder questions raised by the trace

1. **Retatrutide ladder (HL-21):** confirm or correct 5 mg $175, 30 mg $112, 50 mg $1,075 and 60 mg $249 before
   publishing.
2. **Quantity tiers:** the price book gives 5+/10+ vial prices for the three new rows ($232/$212, $120/$110,
   $64/$59). Do tiers apply, or only unit prices?
3. **Affiliate eligibility:** the price book marks all 39 research-use rows "QUALIFIED RESEARCH B2B ONLY - PENDING
   WRITTEN APPROVAL" for affiliates. Should commission attach to these lines?
4. **Superpower / Mito Health audience:** Coming soon for members only (today's endpoint), or on the public site?

## D. Acceptance checks for the successor

Each must pass on exact SHA/tree.

1. **Catalog regeneration:**
   - The dataset is built from the reconciled source.
   - `workbookSourceRowCount` 426, canonical 424.
   - Every one of the 426 rows has a ledger disposition, including FedEx.
   - There are no duplicate variants for Hexarelin 5 mg or Oxytocin 10 mg.
2. **One reconciliation authority** for the build and the runtime (A3). There must be a test that a newer dated file
   cannot change runtime holds without the build.
3. **GRP-0422 held by structured id**, not specification text (A4). It is visible, request-only, and its label has
   no "(split pending)" text. Negative test: renaming the specification does not lift the hold.
4. **Bindings:**
   - The merge is expressed explicitly: superseded GRP-0402/0407 are not orphans, and the kept GRP-0426/0425 are not
     silently re-priced.
   - New rows are unbound until hosted creation.
   - Unbound means "Price on request", never $0.
5. **Interim truthfulness:** before the hosted release, GRP-0421, 0423, 0424, 0425 and 0426 render
   "Request pricing / Price on request". No stale $49 / $59 appears under the new identities.
6. **Retatrutide:** the 60 mg row is research-use only, carries its boundary copy, and gets no Care lane. It is not
   published at $249 until HL-21 is answered.
7. **Superpower / Mito Health Coming soon:**
   - The server refuses `available`, a price or an affiliate URL without a recorded agreement. Covers admin writes
     and rows read back from the DB.
   - Mito Health is added through the same structure.
   - Neutral copy: no "Partner offer not enabled", no invented description.
   - Not orderable, and not a dependency of the catalog or commerce path.
   - The test fixtures asserting "available" are updated.
8. **The Hexarelin and Oxytocin reprice** and every new variant are prepared as an exact Product Control release
   packet (create → approve, one active row per variant, read-back). They are **not executed** without separate
   authorization.
