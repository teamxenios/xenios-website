# Master catalog reconciliation

Swapping in a new master offerings workbook should be a data replacement, not a
feature build. This is the command that makes it one.

`scripts/research/reconcile-master-catalog.ts` takes a new workbook (or an
already exported intake), compares it with the catalog that is live today, and
produces the change report and the id-continuity map that a swap needs before
anyone ships it.

It is dry run by default. It never touches production, never writes to a
database, and never creates a Product Control binding.

## The problem this exists to solve

Offering and variant ids are content hashes:

```
offering id = "mo_"  + sha256(canonicalKey).slice(0, 20)
variant  id = "mov_" + sha256(canonicalKey + "|" + normalizedVariantLabel).slice(0, 20)
canonicalKey = family + "|" + normalizedName            (most families)
             = family + "|" + brand + "|" + normalizedName   (supplements, diagnostics)
```

Verified against the real 1,236-row workbook: all 1,121 offering ids and all
1,181 variant ids match those formulas exactly
(`server/research/master-offerings/catalog-revision-real-workbook.test.ts`).

That means a rename issues a new id, silently. So does a variant-label edit, a
brand edit on a supplement, and a workbook category change that moves an
offering into a different family. Anything bound to the old id is orphaned and
nothing warns.

The deployed member-safe dataset cannot repair this. `canonicalKey` is on the
reader's banned-key list, it never appears in the generated file, and
`dataset-reader.ts` hardcodes it to the empty string on load. Both facts are
asserted by running the code, not by reading it. Reconciliation therefore runs
offline against `normalize.ts` output and never against the deployed artifact.

## The command

```bash
npx tsx scripts/research/reconcile-master-catalog.ts \
  --candidate-workbook /path/to/NEW_MASTER_WORKBOOK.xlsx \
  --current-intake .local/research/master-offerings/private-intake.json \
  --bindings .local/research/master-offerings/bindings.json \
  --pin-ids --retain-retired
```

Candidate, one required:

| Flag | Meaning |
| --- | --- |
| `--candidate-workbook <path.xlsx>` | Ingest through the existing python exporter first. No second parser. |
| `--candidate-intake <path.json>` | Use an intake that exporter already produced. |

Current, optional. Defaults to `.local/research/master-offerings/private-intake.json`,
then to the generated dataset beside it:

| Flag | Meaning |
| --- | --- |
| `--current-intake <path.json>` | Full fidelity. Renames can be confirmed and applied. |
| `--current-dataset <path.json>` | A generated member-safe artifact only. No source IDs, no canonical key, so a rename is reported for review and never applied. |

Options:

| Flag | Default | Meaning |
| --- | --- | --- |
| `--out <dir>` | `.local/research/master-offerings/reconcile` | Report directory. Must stay under `.local`. |
| `--bindings <path.json>` | none | Product Control identity bindings to check. |
| `--pin-ids` | off | Write certain previous ids back into the regenerated artifact. |
| `--retain-retired` | off | Carry retired offerings in as `unavailable` instead of dropping them. |
| `--skip-tests` | off | Do not run the focused catalog tests. |
| `--apply` | off | Promote the final artifact. Requires `--dataset-out`. |
| `--dataset-out <path>` | none | Where `--apply` writes. Never inferred from the environment. |
| `--acknowledge-review` | off | Allow `--apply` while review items or binding risks exist. |
| `--python <exe>` | auto | Interpreter for the exporter. |

## What it does, in order

1. **Ingest** through `scripts/research/export-master-offerings.py`.
2. **Normalize** through `server/research/master-offerings/normalize.ts`. Not forked.
3. **Deduplicate**: the normalizer's `duplicate_source_row` findings are surfaced per run, per revision.
4. **Compare** per offering and per variant.
5. **Preserve ids** where logical identity matches (below).
6. **Add** new offerings and variants.
7. **Retire** missing ones as a state, never a silent delete.
8. **Report Product Control state** so no binding is orphaned by the swap.
9. **Write the change report**, Markdown and JSON, plus the id-continuity map.
10. **Regenerate** the member-safe artifact with the existing builder, unchanged.
11. **Privacy scan** every artifact it emits.
12. **Run the focused catalog tests** and record the result.

## Logical identity

A pure content hash breaks on a rename. Logical identity is not a second hash,
because a second hash only moves the same problem to different fields. It is an
ordered ladder of evidence, and only rungs that are unambiguous by construction
may preserve an id without a human.

| Rung | Evidence | Confidence | Applied automatically |
| --- | --- | --- | --- |
| 1 | Canonical key identical. The id never moved. | certain | yes, trivially |
| 2 | Same family, same brand, identical set of workbook source IDs matched one to one, and the names are related. | certain | yes |
| 3 | Partial source-ID overlap, brand changed, family changed, alias still carries the old name, or names merely similar. | high or medium | never |

**Why the workbook source ID is the right key.** It is the operator's own
identifier for the product, so a preserved source ID over a changed name is the
operator saying "same product, new name". Measured on the real workbook: 1,233
of 1,236 rows carry one, and no source ID is shared by two different products.
The three that do not carry one are excluded from rung 2 rather than guessed at.

**Why the name is not the key.** Renaming is the event this exists to survive.

**Why the family is never crossed.** The family is derived from the workbook
category and it decides visibility: `provider_network` is admin-only by policy.
Carrying an id across a family change could walk a member-visible id into an
administrative hold. A family change is at most a proposal, at any confidence.

**Why the brand is not crossed on supplements and diagnostics.** The brand is
part of the canonical key for those families, and "Thorne Magnesium Glycinate"
and "Pure Encapsulations Magnesium Glycinate" are different products. A brand
edit under a preserved source ID is a supplier switch or a correction, and a
person decides which.

**Why one to one is required.** A source ID group that covers two offerings on
either side is a merge or a split. Both are refused, both are reported, and both
sides still appear as added and retired so nothing disappears quietly.

**Variants.** The variant id hashes the offering's canonical key too, so
renaming a product moves every variant id beneath it even when no label changed.
Inside a matched offering:

- identical normalized label is certain continuity;
- one residual label on each side is certain only when the labels are
  compatible, meaning the same quantities in units that do not contradict;
- otherwise the residuals are reported as a loss and a gain plus a proposal.

The compatibility rule is what stops "10 mg removed, 40 mg added" from being
read as "10 mg renamed to 40 mg". Quantities are compared as numbers, so
"60 capsules" and "60 vegetarian capsules" are the same size while "60" and
"120" are not, and units are compared separately so "5 mg" never matches "5 ml".

**Two hazards the ladder detects.**

- *Canonical key reassignment.* An offering keeps its id because the key hashes
  the same, while every workbook source ID beneath it changed. The id now points
  at what may be a different product. Reported, never merged away.
- *Split and merge.* A new offering that shares source IDs with an offering that
  survived, or a retired offering that shares them with one that survived. Both
  are proposals, never renames.

## The change report

Three files, all private to the operator. They carry workbook source IDs and
sheet rows on purpose, because those are the evidence, so they stay under
`.local` and they are not member-safe.

| File | What it is |
| --- | --- |
| `MASTER_CATALOG_RECONCILIATION_REPORT.md` | The human report. Leads with "Needs a human". |
| `master-catalog-reconciliation.json` | The same content, machine readable. |
| `master-catalog-id-continuity.json` | `applied` (certain only, old id to new id), `entries` (every continuity with evidence and confidence), and `review`. |

The Markdown report sections: needs a human, revisions compared, summary,
renamed with the id preserved, the review list, added, retired, variants gained
and lost, display state transitions, admin-only hold changes, canonical keys
reassigned, duplicate source rows, Product Control bindings, id pinning, retired
retention, checks, and what the command did not do.

## Retirement, and what happens to a bound offering

Retirement is a state, not a delete. An offering that leaves the workbook is
reported in `retired` with its ids, its variant ids, and its source IDs, and
with `--retain-retired` it is carried into the new artifact with every display
state set to `unavailable`, so its id and slug keep resolving and the surface
says "not currently offered" rather than "not found".

**A retired offering that is currently bound stays purchasable.** This is read
off the shipped code, not assumed: `resolveMasterOfferingAction` in `action.ts`
resolves `add_to_cart` from the Product Control binding and the resolved
`CartProductSelection` **before** it looks at the display state. So retiring an
offering in the catalog removes it from browse and detail, and does not revoke
purchase authority. Only Product Control can do that. Withdraw the binding or
the selection in Product Control first, then retire.

Binding outcomes the report emits per binding:

| Outcome | Meaning |
| --- | --- |
| `unchanged` | The variant id survives. The binding still resolves. |
| `id_moved_continuity_available` | The id moved and the report names the replacement. Repoint the binding, or regenerate with `--pin-ids`. |
| `offering_retired` | The whole offering left the workbook. |
| `variant_retired` | The offering survived, the variant did not. |
| `review_required` | Only a below-certain proposal connects it to anything new. |
| `unknown_to_current_catalog` | Already stale before this swap. |

There is **no production binding store in this tree**, only the read-only
interfaces in `product-control-adapter.ts` and `price-authority.ts`. So
"preserve Product Control state" today means emitting exactly this report, and
having the shape right for when a store exists. With no `--bindings` file the
report says plainly that nothing was checked rather than implying it was.

## Id pinning

`--pin-ids` writes previously issued ids back over the content-hash ids the
builder just produced, for certain continuity only. It is the only mechanism
that makes an existing binding survive a rename without editing the binding.

It is opt in because it makes the id stop equalling the hash of the canonical
key, which is the point and is also a real change to what the file means. It
refuses any pin that would duplicate an id already in the file, reports every
refusal, and the pinned artifact goes back through the reader before it is
allowed to exist.

## Privacy

Every artifact the command emits is scanned before it is written:

- banned keys and the required-false invariants are enforced by calling
  `loadMasterOfferingDataset`, the production reader, which owns both lists;
- the confidential provider and team identity sweep uses terms derived from the
  candidate intake, so a name that has just become confidential is caught;
- the header must agree with the body, and the existing
  `verify-master-offerings-dataset.ts` is then run against the final artifact
  with the counts this run produced.

The builder's own `assertPublicSafe` runs where it always did, inside
`build-master-offerings.ts`, which the command invokes as a subprocess. It could
not be imported: that module runs a complete build at import time.
`confidentialTermsFromMasterRows` in `catalog-revision-artifact.ts` mirrors that
script's private term derivation and is the one place to keep in step with it.

## Files

| File | Role |
| --- | --- |
| `scripts/research/reconcile-master-catalog.ts` | The command. |
| `server/research/master-offerings/catalog-revision.ts` | One workbook revision, in the form identity work can trust. |
| `server/research/master-offerings/logical-identity.ts` | The identity ladder and the id-continuity map. |
| `server/research/master-offerings/catalog-revision-diff.ts` | The change report structure and the binding-risk report. |
| `server/research/master-offerings/catalog-revision-report.ts` | The Markdown renderer. |
| `server/research/master-offerings/catalog-revision-artifact.ts` | Id pinning, retired retention, the privacy re-scan. |

Tests: `logical-identity.test.ts`, `catalog-revision-diff.test.ts`,
`catalog-revision-artifact.test.ts`, and
`catalog-revision-real-workbook.test.ts` (skips itself when the private intake
under `.local` is absent).

Not one existing file was modified.

## Reproducing the proof

```bash
python scripts/research/export-master-offerings.py \
  /path/to/XENIOS_MASTER_OFFERINGS_PRICING_2026-08-09_AUSTIN_BENCHMARK_UPDATED.xlsx
npx tsx scripts/research/build-master-offerings.ts \
  .local/research/master-offerings/private-intake.json
npx vitest run server/research/master-offerings
```

The workbook (sha256 `c6937431bcb64f628352016d5af16ea133add9a0a05b5947d5a0ac75d9e2d438`)
reproduces 1,236 source rows into 1,121 member-safe offerings, 1,181 variants,
11 admin-only holds, and 18 `available_now` variants. Any deviation is a bug to
investigate, not a snapshot to update.
