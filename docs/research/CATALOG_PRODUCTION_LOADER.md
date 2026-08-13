# Catalog v2 production loader and indexed reads

Base: `d7984eb1cf80dea1da1eeacebe701227a8dd61ba`. Branch `lane/catalog-hot-swap`.
Production untouched.

This is the spine of the catalog blitz: the part that makes a future master
catalog a data replacement rather than a feature build. Sort, facets, pricing
performance, client URL state and the reconciliation command are sibling lanes.

## The defect this fixes

`createMasterOfferingCatalogReaderFromEnv` read one environment variable and
returned `null` when it was unset. Unset meant 503. The only working
configuration was an absolute path typed by hand, and the only file that path
ever pointed at lived under `.local`, which is gitignored and therefore absent
from the git clone the deploy builds from.

So the catalog could not be served in production at all, and the one setup that
did work was a path on a laptop. Render runs native node with no persistent
disk, so nothing written at runtime survives, and the build has no step that
produces or copies a dataset.

## The fix

A committed artifact with a stable repo-relative path.

```text
server/research/master-offerings/data/member-safe-master-offerings.generated.json
```

962,214 bytes, 1,121 offerings, 1,181 variants, generated from workbook sha256
`c6937431...d438` and verified through the repository's own verifier.

Resolution order, in `server/research/master-offerings/dataset-location.ts`:

1. `XENIOS_MASTER_OFFERINGS_DATASET` when set. An operator override always wins,
   so a deployment can point at a secret file or a mounted volume with no code
   change.
2. The committed artifact, found relative to the working directory, walking at
   most three parents.
3. Nothing, which stays 503 `master_offerings_unavailable`. "We cannot reach the
   catalog" and "there is nothing to sell" remain different answers.

Two decisions worth stating, because both could have gone the other way.

**The override is not probed for existence.** An operator who names a path and
gets it wrong sees the failure against the path they chose. Falling back to the
committed artifact would let a typo serve a different dataset while the operator
believed their override was live.

**The anchor is the working directory, not `__dirname`.** The server is bundled
by esbuild into one `dist/index.cjs`, so a path resolved from this module's own
directory means one thing in development and another after bundling. Both
`npm run dev` and `npm run start` run from the project root, so the working
directory is the one location that means the same thing in both.

## Indexed reads

`detail(slug)` used to call `readCatalog()` and scan all 1,121 offerings. The
load was already cached per file mtime, so the cost was not re-parsing, it was a
linear scan per detail request.

- `LoadedMasterOfferingDataset` now carries a `bySlug` index built once per load.
- `GeneratedMasterOfferingCatalogReader.readBySlug(slug)` is an O(1) lookup.
- `MasterOfferingCatalogReader.readBySlug` is OPTIONAL, so every existing reader
  including the in-memory one the tests use stays valid, and `detail` falls back
  to the scan it always did.

The index keeps the scan's two properties rather than only its result: member
visibility only, and an ambiguous slug resolves to nothing rather than to the
first match. The loader already refuses a dataset with duplicate slugs, so a
collision means the two guards disagree, and the safe reading of that is no
product. Both behaviors are asserted.

## Variant-specific detail

`MasterOfferingCatalogService.variant(slug, variantId)` returns one variant.

`detail` resolves commerce and price for every variant of an offering, because a
detail page shows them all. A caller that wants one variant, such as a
variant-scoped deep link or a cart handoff re-check, should not pay for the
others: an offering with five variants costs five binding reads and five price
resolutions to answer about one. Measured in the test: one variant asked for,
one commerce resolution, one price resolution, zero catalog scans.

The authority is unchanged. Same commerce resolver, same price authority, so it
can no more invent an Add to Cart than the detail path can. Asserted.

## Tests changed, and why the change is not a weakening

Two existing tests asserted "absent rather than empty when the environment
configures nothing" and "unavailable, never empty, when no dataset is
configured". With a committed artifact present, nothing configured no longer
means nothing available, which is the entire point of the change.

Both tests now inject a probe that reports the artifact absent, so they still
prove exactly what they claim: when there is genuinely no dataset anywhere, the
answer is unavailable and never empty. This also makes them hermetic. Before,
they would have passed or failed depending on what happened to exist in the
worktree.

`MasterOfferingCompositionInput` gained `datasetProbe` and `cwd`, supplied only
by tests, for the same reason.

## The one irreversible decision

Committing the artifact puts 962 KB of the member-safe catalog into git history
permanently. It is safe by construction rather than by promise: the builder
whitelists 13 fields per offering rather than redacting, the reader re-checks 28
banned keys and seven required-false invariants on every load, and the verifier
checks it again. My own scan found no supplier, cost, margin, source SKU or
internal note anywhere in it.

What it is not is public-safe in the business sense. 939 of the 1,121 rows are
`planned`, meaning things Xenios does not sell yet, so the file is a commercial
roadmap and git history cannot be un-published without a rewrite.

The repository's standing policy was to hold the member-safe payload out until
reconciliation was done. This lane supersedes that on an explicit instruction to
remove the `.local` and laptop-path dependency. If the founder would rather not
commit it, the same loader serves a Render secret file with no code change: set
`XENIOS_MASTER_OFFERINGS_DATASET=/etc/secrets/member-safe-master-offerings.generated.json`
and delete the committed file. Note Render caps combined secret files per service
at 1 MB and this file is 91.8 percent of that, so that path needs minification
and will not survive catalog growth.

## Verification

```text
npx tsc                                        exit 0
npx vitest run server/research/master-offerings  25 files, 183 tests, all passed
repo verifier against the committed artifact     PASS 1121 / 1181
```

No Docker. No whole repository suite. No production mutation. No migration.
