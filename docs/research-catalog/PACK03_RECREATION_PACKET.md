# Pack 03 recreation packet

This lane is `REBASE_OR_RECREATE_REQUIRED`. It is built on the frozen Catalog Foundation,
which is a sibling of the accepted Early Access candidate, so every result it has recorded
is pre-freeze evidence that expires the moment `FINAL_EA_FAST_FOLLOW_BASE` exists.

This packet exists so recreation is mechanical rather than remembered.

## Identity

```text
Lane            BUYER-A, catalog display, search and pricing
Branch          lane/pack03-full-catalog-search-pricing
Worktree        C:\xenios-wt\pack03-catalog
Base            851d4b05af86ad46d780df267bbd9337d0dafa39  (Catalog Foundation)
Remote          origin/lane/pack03-full-catalog-search-pricing
```

The authoritative changed-file list and the current output SHA live in `HANDOFF.json` at
the worktree root, and a copy is published to
`research-expansion-control/collected/handoffs/pack03-catalog.HANDOFF.json`. Read the
handoff for the list; do not retype it here, because two copies of a file list is one copy
too many.

## Order, and the one rule that matters

```text
1. FINAL_EA_FAST_FOLLOW_BASE exists.
2. Recreate the Catalog Foundation on it.
3. Recreate this lane on the recreated foundation.
```

**Never cherry-pick this lane directly onto the quantity sibling.** The integration
collision audit states the rule for this exact pack: recreate the foundation first, then
recreate pack 03. Skipping step 2 puts catalog code onto a base that never had the
foundation, and the failure is a confusing type error rather than an obvious one.

## Recreating

The lane touches only files under paths it owns, so recreation is a clean replay:

```bash
git worktree add -b lane/pack03-full-catalog-search-pricing-r2 <path> <recreated-foundation-sha>
cd <path>
git checkout <old-output-sha> -- \
  shared/research/master-offerings \
  server/research/master-offerings \
  client/src/research/master-offerings \
  scripts/research/verify-master-offerings-dataset.ts \
  docs/research-catalog
```

Then reconcile the four foundation files this lane edited rather than created, because the
recreated foundation may have moved underneath them:

```text
shared/research/master-offerings/contract.ts      additive fields and one new action kind
server/research/master-offerings/action.ts        capabilities parameter and the manual purchase branch
server/research/master-offerings/customer-projection.ts   price threading
server/research/master-offerings/search.ts        matchMasterOfferings split, and the memoized haystack
server/research/master-offerings/service.ts       price authority, select, priceList
server/research/master-offerings/routes.ts        the price-list handler
server/research/master-offerings/visibility-policy.ts     the manual purchase flag
server/research/master-offerings/product-request-adapter.ts   the early_access_purchase intent
client/src/research/master-offerings/integration-packet.ts    price-list URL and URL state helpers
```

Everything else in the lane is new and replays cleanly.

## Proving the recreation

Run all four. The first three must pass; the fourth must find nothing.

```bash
npx tsc --noEmit
npx vitest run server/research/master-offerings client/src/research/master-offerings --testTimeout=30000
node script/build.mjs
grep -rl "catalog-display/v2" dist/public/assets dist/index.cjs
```

Expected: clean typecheck, the lane suite green at the count recorded in the handoff, a
clean build, and **no grep match**, because the lane is unmounted and must not reach the
bundle.

Then re-run the whole repository suite. On a slow Windows host it needs
`--testTimeout=30000`; three unrelated filesystem-scan files time out at the default five
seconds under parallel load and pass in isolation.

## What breaks on purpose when it is mounted

`server/research/master-offerings/catalog-boundaries.test.ts` asserts that **nothing
outside the lane imports the lane**. It is the tripwire that keeps an unmounted surface
unmounted, and it will fail the moment the composition root imports the catalog.

That is intended. Update it in the same commit that mounts, so mounting is a decision
somebody made rather than something that happened.

## Contract changes other lanes must recompile against

Additive, but not optional:

```text
MasterOfferingCardView      + variants, + priceSummary   (both required)
MasterOfferingVariantView   + price                      (required)
MasterOfferingAction        + request_early_access_purchase
MasterOfferingCatalogErrorCode + master_offerings_export_too_large
```

A consumer that only merges will compile against the old shape and then fail at runtime on
a missing field. Recompile.

## Evidence that expires at recreation

Everything. The pre-freeze QA result, the performance numbers, the whole-repository suite,
and the build. None of it survives the base change, and none of it may be reused to
satisfy final acceptance. Re-run, then re-record.
