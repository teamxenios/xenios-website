# Claude independent review: Codex slice `c9d638a` (Care prices out of the Research catalog, HL-13)

## Identity

- **Subject:** `c9d638ae36b5a85bebc1be5c0864685a92da764a`, tree `2a95fad11ef229e6d0c6e397a5d70ca82b0b0e35`, on
  `codex/xenios-health-launch-implementation-20260930`.
- **Records tip:** `afb3aedfd31f91107e91260c652bfc5669a01633`.
- **Runtime paths changed:**
  - `shared/research/assisted-order/action-policy.ts` and its test
  - `client/src/research/assisted-order/AssistedOrderPage.tsx` and its test
- `package.json` and `package-lock.json` are unchanged.
- **Reviewed:** 2026-09-30 12:38-12:58 CT. Checks worktree detached at `c9d638a`, private Node v20.19.0.

## What changed

- The Research catalog projection sets `unitPriceCents` and `priceVersion` to `null` whenever
  `workflowMode === "provider_request"`.
- The card shows "Ask the Care team about pricing" instead of an amount.

## Checks run by Claude

| Check | Result |
| --- | --- |
| `shared/research/assisted-order`, `client/src/research/assisted-order`, `server/research/assisted-order`, `server/research/master-offerings` | **66 passed, 1 FAILED, 1 skipped** (68 files). Tests: **3 failed**, 766 passed, 13 skipped. |
| The failing file: `server/research/master-offerings/early-access-catalog-coverage.test.ts`, which walks the **real committed 420-row dataset** through the Early Access viewer | **3 FAILED**, deterministic count assertions rather than a timeout. |
| Mutation check: the old `action-policy.ts` and `AssistedOrderPage.tsx` against the slice's new tests | 3 of 49 fail, as they should. Restored clean afterwards. |
| `tsc` | exit 0 |

The three coverage failures are:
- `:267` "prices every bound row and leaves exactly the unbound ones on request": expected 417 priced, got 175.
- `:307` "keeps a price and an ordering pathway as SEPARATE decisions": `expected false to be true`.
- `:336` "matches that measured composition when actually walked": expected `{priced: 417, unpriced: 2}`, got
  `{priced: 175, unpriced: 244}`.

## Disposition

**FAIL (P2, release gate): the slice leaves a red test in the tree.** Its behaviour change is the intended HL-13
correction: the 242 Care rows no longer show a retail price on the Research card, and the slice's own tests pin it.
But it contradicts an existing whole-catalog invariant that nobody updated. Codex's slice record lists focused runs
of the policy, page and production-catalog files plus service and release-control tests. It does not list this
coverage file, so the full suite at `c9d638a` cannot pass.

## Required correction (smallest)

1. Decide deliberately which layer carries "price and pathway are separate decisions":
   - **Price authority:** still resolves the Care row's Product Control price, for Care's own use.
   - **Research catalog projection:** now hides that price for `provider_request` rows.

   Update `early-access-catalog-coverage.test.ts` to assert exactly that:
   - The authority layer: 417 bound rows priced.
   - The projection layer: Care rows have `unitPriceCents === null` and show "Ask the Care team about pricing".
   - The re-measured composition, from the actual walk at `c9d638a`: priced 175, unpriced 244. That is 242 Care rows
     plus BAM15 and Syringes.
   - Name the delta in the test comment rather than silently re-pinning numbers.
2. Re-run the whole `server/research/master-offerings` directory, and the full suite before integration.

## Notes

- **Other surfaces.** Care retail prices are still exposed on other customer surfaces:
  - the member master-offerings price-list export includes every priced row with purchase path "Explore the care
    pathway" (`server/research/master-offerings/price-list-export.ts:99-106`);
  - probably the member catalog cards as well.

  Whether Care prices may appear to signed-in members is a founder policy question. HL-13 was scoped to the Research
  request catalog. Record the decision so that surfaces stay consistent.
- **Submit.** Submit-time re-resolution for Care rows is unaffected. Care rows are refused at submit
  (`assisted-order/service.ts:445-452`). The fingerprint parity for priced non-Care rows still holds, since the
  coverage test's re-resolution case passed.
