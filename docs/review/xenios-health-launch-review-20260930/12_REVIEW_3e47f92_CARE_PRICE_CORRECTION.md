# Claude independent review: Codex successor `3e47f92` (correction of the `c9d638a` failure)

## Identity

- **Subject:** `3e47f92974d90c2a5d16903b0f72ef844519e131`, tree `4ceec05e1d9f8b17e6b4141cfe9a069752aaa229`. The
  parent is `afb3aed`.
- **Runtime paths:**
  - `server/research/master-offerings/service.ts`
  - `server/research/master-offerings/service.test.ts`
  - `server/research/master-offerings/early-access-catalog-coverage.test.ts`
- `package.json` and `package-lock.json` are unchanged.
- **Reviewed:** 2026-09-30 13:57-14:02 CT. Checks worktree detached at `3e47f92`, private Node v20.19.0.
- **Execution:** single-worker (`--maxWorkers=1 --no-file-parallelism`) to share the host with Codex.

## Scoped dispositions, kept separate

| Slice | Subject | Disposition |
| --- | --- | --- |
| HL-01 public entry | `93b0183` | PASS for the slice. HL-01 overall PARTIAL (`07_REVIEW_93b0183_HL01_SLICE.md`). |
| Shipping exclusion | `10d23aa` | PASS (`09_REVIEW_10d23aa_SHIPPING_EXCLUSION.md`) |
| Care price projection | `c9d638a` | **FAIL**: red whole-catalog test (`10_REVIEW_c9d638a_CARE_PRICE.md`). This historical verdict stands. |
| Care price correction | **`3e47f92`** | **PASS**, this report |

## Acceptance against the `c9d638a` findings

| Required | Evidence at `3e47f92` | Result |
| --- | --- | --- |
| Product Control price authority intact | The new `walkAuthorityPrices()` pages the real catalog through `MasterOfferingCatalogService.select` and asserts **417 priced, of which 242 Care, and 2 on request**. | PASS |
| Research projection hides Care prices | The whole-catalog walk asserts 242 `provider_request` rows with `unitPriceCents === null && priceVersion === null`, 175 Research-priced rows, and 2 quote-only rows (BAM15, Syringes). | PASS |
| Coverage deliberately updated, not weakened | The composition comment names the delta (417 authority = 175 Research + 242 Care withheld). The old "Care priced" expectation is inverted, not deleted. The total invariant becomes `175 + 242 + 2 = 419`. Other assertions are unchanged: no zero or negative price, founder-named rows, full-page reach, no procurement leakage, and the production price-set digest. | PASS |
| FedEx exclusion by stable identity | `service.ts`: `offering.id !== "mo_003b0c272099eeb1f114"`. Claude verified this id is FedEx Standard Overnight (GRP-0364) in the committed dataset. `service.test.ts` proves that a FedEx row with renamed family and subcategory stays excluded, and that a real product labelled "Shipping Service" stays visible. | PASS |
| Real catalog walk runs | `early-access-catalog-coverage.test.ts` ran 13 of 13 on the committed 420-row dataset. It **throws**, rather than skips, if the dataset is missing. There is no `skipIf`, `runIf` or env gate in the file. | PASS |
| Non-Care price fingerprint parity | "re-resolves EVERY row at submit time to exactly what the catalog showed" passed. | PASS |
| Care submit denial | `assisted-order/service.test.ts:314` "REFUSES a Care item at submit" passed. | PASS |
| Mutation check | The old `c9d638a` `service.ts` fails 1 of 3 in `service.test.ts` (the renamed-FedEx case). Restored clean afterwards. | PASS |

## Tests and checks run by Claude

- **Affected suites:**
  - `server/research/master-offerings`
  - `server/research/assisted-order`
  - `shared/research/assisted-order`
  - `client/src/research/assisted-order`

  **Result: 68 files passed and 1 skipped. 810 tests passed and 13 skipped**, in 151 s.
- **The skipped file** is `catalog-revision-real-workbook.test.ts`. It is gated on the private intake
  (`describeWithIntake`) and is unchanged since `c213707`. This skip predates the successor and is recorded, not
  new.
- **Typecheck:** `tsc` exit 0.
- **Not run on this successor:** build and the em-dash gates (no copy changed), the full suite, and a browser
  journey (no UI change).

## Remaining notes

- **The FedEx id is tied to the current dataset.** It is derived from a hash of the GRP-0364 row, so HL-11
  regeneration keeps it only if that row's Group ID, family, product and specification do not change. The coverage
  test would catch a change, because the source-row assertion looks the row up by this id.
- **Care prices on member surfaces.** Whether Care prices may appear in the member price-list export or member catalog
  is still unrecorded (see `10_…`). This is not a launch blocker for the Research storefront.
