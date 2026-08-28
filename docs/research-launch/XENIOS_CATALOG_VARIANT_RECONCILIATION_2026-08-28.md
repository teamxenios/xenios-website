# Xenios catalog variant reconciliation, 426 → 424 → 420 (2026-08-28)

Helper: CATALOG (parallel Claude helper 01). Base Lead SHA
`77d3f69f3966e76bb733165ee9c7732ccc78730d`. Documentation only. **Nothing in
this report changes data, regenerates an artifact, seeds a runtime row, merges
an alias, releases a hold, or resolves a price.** Every absence below is
classified as human/manual reconciliation unless authoritative code at HEAD
proves otherwise, and none does.

## The ledger

| Count | What it is | Evidence at HEAD |
| --- | --- | --- |
| **426** | Source rows in the founder retail workbook (`MASTER CATALOG` sheet) | `docs/research-launch/XENIOS_RETAIL_ONLY_MASTER_CATALOG_426_VARIANTS.csv` (426 data rows, `Group ID` GRP-0001..GRP-0426); `config/research/master-catalog-reconciliation-20260821.json` → `sourceWorkbook.sourceRows: 426` |
| **424** | Canonical variants after the two reviewed duplicate collapses | `config/research/master-catalog-reconciliation-20260821.json` → `expected.canonicalVariants: 424`; asserted by `server/research/master-offerings/catalog-reconciliation.ts` (fail-loud applier) and `catalog-reconciliation.test.ts` |
| **420** | Variants in the committed member-safe runtime artifact | `server/research/master-offerings/data/master-offerings-audit.generated.json` → `memberSafeVariants: 420`, `memberSafeCanonicalProducts: 420`; `member-safe-master-offerings.generated.json` (`products: 420`, one variant each, re-counted by walking the file); `master-offering-bindings.generated.json` → 417 bound + 3 unbound = 420 |

Arithmetic: `426 − 2 = 424`; `424 − 420 = 4`. The two subtractions are
different kinds of fact and must not be swapped for each other:

- the **2** are reviewed founder decisions recorded as data (two workbook rows
  that describe one physical product each);
- the **4** are canonical variants the workbook lists and the runtime artifact
  does not carry at all.

The **3 unbound** runtime rows (BAM15 500 mcg, FedEx Standard Overnight,
Syringes & Alcohol Swabs) are a third, separate condition: they ARE in the 420
artifact (`mov_038386172c35c2ad8cca`, `mov_9b65ad5bb184691e19e0`,
`mov_512ed6b875c04eee4753`) and are simply not bound to a Product Control
price. They are not part of either subtraction and must never be counted as
"missing" to make a number match.

## The two reviewed duplicate collapses (426 → 424)

Both are recorded in `config/research/master-catalog-reconciliation-20260821.json`
(`merges[]`), decided by the founder on 2026-08-21. The applier
`applyCatalogReconciliation` refuses the build if either `keeps` or
`supersedes` row is absent from the workbook, so the collapse cannot silently
no-op.

| Merge id | Keeps | Supersedes | Canonical | Workbook rows |
| --- | --- | --- | --- | --- |
| `hexarelin-5mg` | **GRP-0426** (`HEXARELIN 5 mg`, RUO Research, $49.00 in the CSV) | **GRP-0402** (`Hexarelin (5mg)`, Supplier Catalog / Classification Pending, $62.50) | Hexarelin, `HEXARELIN 5 mg`, `research_peptides_materials`, recorded `retailPriceCents: 6250` | CSV lines 377 and 427 |
| `oxytocin-10mg` | **GRP-0425** (`OXYTOCIN 10 mg`, RUO Research, $59.00 in the CSV) | **GRP-0407** (`Oxytocin (10mg)`, Supplier Catalog / Classification Pending, $107.50) | Oxytocin, `OXYTOCIN 10 mg`, `research_peptides_materials`, recorded `retailPriceCents: 10750` | CSV lines 381 and 426 |

### Open conflict inside the collapses (not resolved here)

Three sources disagree about what these two canonical variants cost and which
Group ID names them. This helper selects none of them.

| Source | Hexarelin 5 mg | Oxytocin 10 mg |
| --- | --- | --- |
| Reviewed config (2026-08-21 founder price decision, `priceDecision`) | $62.50, keeps GRP-0426 | $107.50, keeps GRP-0425 |
| `RETAIL_RECONCILIATION_426_2026-08-20.md` (production read-back 2026-08-20) | $49.00 active (v2) on `GEN-GRP-0402` | $59.00 active (v2) on `GEN-GRP-0407` |
| Runtime bindings artifact at HEAD | binds `GEN-GRP-0402` → `mov_7c55d415a9574e9ebda7` (label `Hexarelin (5mg)`, state `approval_required`); GRP-0426 absent | binds `GEN-GRP-0407` → `mov_256cb0423eb6d2a77f65` (label `Oxytocin (10mg)`, state `approval_required`); GRP-0425 absent |

So at HEAD the runtime carries each collapsed pair under the **superseded**
provenance row's identity and display label, in `approval_required`, and the
config says the canonical row is the RUO row with the opposite price. The
config's own `$comment` says the 2026-08-21 decision deliberately *inverts*
production. Which price is right is a founder decision; which Group ID the
runtime should carry is a regeneration decision; both stay open. The client
renders whatever the server resolves and shows each variant under its own id
and label (`exact-variant-identity.test.tsx` holds that).

## The four canonical variants absent from the 420 runtime artifact (424 → 420)

Method: the runtime artifact carries no Group IDs (they are on the reader's
banned-key list), so each row was checked by walking every product/variant
label in `member-safe-master-offerings.generated.json` for the product name
and the strength, and by grepping the bindings artifact for the SKU
`GEN-<Group ID>`. All four: zero label matches at that strength, zero binding
matches.

| # | Group ID | Workbook row (CSV line) | Retail price in the book | What the runtime holds instead | Classification |
| --- | --- | --- | --- | --- | --- |
| 1 | **GRP-0421** | Retatrutide, `RETATRUTIDE 60 mg`, Lyophilized Vial, RUO Research, "Alternate strength / format" (line 422) | $249.00 | Retatrutide 5, 10, 15, 20, 30, 40, 50 mg (`mov_0db878384f6f3f42fc1a`, `mov_0c4a5438cc87ab9d85b6`, `mov_8f14c1dd839544567d53`, `mov_e86aa92d94c61d407578`, `mov_7bd700ce0704d66e614e`, `mov_0881f51f4947326bf1e0`, `mov_469cd274fcf41edf3d8e`), plus GLP-3 12/24 mg. **No 60 mg.** | **Human / manual.** Creating the variant is a Product Control catalog mutation and a workbook regeneration, not a price release. No code at HEAD derives it. |
| 2 | **GRP-0422** | CJC-1295 + Ipamorelin, `CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)`, RUO Research, "Supplier clarification required" (line 423) | $99.00 | `CJC-1295 (No DAC) 5 mg + IPAMORELIN 5 mg` (`mov_082a1d9c8a0d21e4a5c9`), `(No DAC) 10 mg + 10 mg` (`mov_420ac197458ecbcddb9a`), CJC-1295 With DAC alone 2/5/10 mg. **No "WITH DAC + Ipamorelin" row** (also confirmed in `BROWSER_PERF_PROOF_2026-08-21.md`). | **Human / manual, and additionally a recorded commerce hold.** `commerceHolds[0]` in the reviewed config: `visible: true, retailPriceShown: true, directPurchase: false, pathway: assisted_order` because the component split is unconfirmed and "nobody may invent it". `shared/research/master-offerings/formulation-hold.ts` refuses direct purchase on this specification wherever it appears. It is absent from the runtime, so today the hold has nothing to act on; if it is ever regenerated in, it must arrive held. |
| 3 | **GRP-0423** | MOTS-C, `MOTS-C 40 mg`, Lyophilized Vial, RUO Research, "Alternate strength / format" (line 424) | $129.00 | `MOTS-C 10 mg` (`mov_72b54c1f1e71b4229c2a`), clinical `10MG/ML (5ML)` and `2MG/ML (5ML)` (care pathway). **No 40 mg.** | **Human / manual.** Same as #1. The 10 mg and the clinical mg/mL rows are not substitutes and must not be aliased. |
| 4 | **GRP-0424** | Glutathione, `GLUTATHIONE 600 mg`, Lyophilized Vial, RUO Research, "Alternate strength / format" (line 425) | $69.00 | `GLUTATHIONE 500 mg` (`mov_77a80adce9e9cb1b93a0`), `1500 mg` (`mov_77837ac2575c8df8ac73`), clinical `200MG/ML` 10 mL / 30 mL (care pathway). **No 600 mg.** | **Human / manual.** Same as #1. 500 mg is not 600 mg. |

None of the four is derivable by code at HEAD: the runtime artifact was
generated on 2026-08-15 from workbook sha256
`1be4f6720675fc6b90c172d52c19d2fb9a8d53f5beab6592ca96c701119c791d`
(`master-offerings-manifest.generated.json`), which predates the 2026-08-16
workbook (`6478ad0d…`) that the reviewed reconciliation names and the
2026-08-19/20 retail book. In other words the 420 artifact is a snapshot of an
older workbook, and the 424 is a reviewed view of a newer one. The gap is an
artifact-generation event that has not happened, plus the founder decisions
above; it is not a bug in any adapter.

## Related rows that are NOT part of the four (recorded so nobody substitutes them)

| Group ID | Row | Where it is | Why it is not one of the four |
| --- | --- | --- | --- |
| GRP-0244 | BAM15 500 mcg, Price on request | In the 420 artifact (`mov_038386172c35c2ad8cca`, `request_access`); unbound | Present; unpriced. Blocker `10-EARLY-GATE-CATALOG-AUTHORITY-AND-RECONCILIATION.md` notes its unbound-reason text is swapped with FedEx in the bindings generator. |
| GRP-0364 | FedEx Standard Overnight, $37.50 | In the 420 artifact (`mov_9b65ad5bb184691e19e0`, `care_pathway`); unbound | Present; a shipping charge, not merchandise. `NON_MERCHANDISE_FAMILIES` refuses direct purchase on its family. Should not become a purchasable line (founder flag 2026-08-20). |
| GRP-0365 | Syringes & Alcohol Swabs, Price on request | In the 420 artifact (`mov_512ed6b875c04eee4753`, `care_pathway`); unbound | Present; unpriced. |

`docs/research/SETH_DEMAND_SITE_GAP_REPORT_2026-08-26.md` counts nine
"IN_REGISTRY_NOT_VISIBLE" rows by including these three plus the two
superseded provenance rows; that is a different question (visibility on a
demand site) from this ledger, and the two numbers are not in conflict.

## What the client does with this (and does not)

- Renders every variant the server sends under its own server id, label, state,
  price, and resolved action; never merges rows that look alike; never invents
  a strength (`client/src/research/master-offerings/exact-variant-identity.test.tsx`).
- Shows a purchase control only for a server `add_to_cart` on an
  `available_now` variant with a matching quantity capability and an injected
  cart; a purchase action on any other listing state renders no purchase
  affordance (`status-cta-matrix.test.tsx`).
- Makes no claim about stock, COA, or documentation beyond what the DTO can
  prove (`CatalogEvidenceNotice`).
- Does not, anywhere, read this report, the CSV, the config, or the bindings
  file. The numbers stay where they are until a human changes them.

## Decisions this report leaves with the founder / Lead

1. Whether to create canonical variants for GRP-0421, GRP-0423, GRP-0424
   (Product Control mutation + workbook regeneration), or leave them out.
2. Whether GRP-0422 is ever regenerated in; if so it must arrive under the
   recorded commerce hold with the split still unconfirmed.
3. Which Hexarelin 5 mg and Oxytocin 10 mg price is current (config $62.50 /
   $107.50 vs production $49.00 / $59.00), and which Group ID identity the
   regenerated runtime should carry for each.
4. When the runtime artifact is regenerated from the current workbook so the
   420 and the 424 describe the same source.
