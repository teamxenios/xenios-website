# Catalog Foundation Handoff

## Staging identity

```text
Repository: teamxenios/xenios-website
Base: d4cf8d10599ca183df06a4f1968775888a4150c8
Branch: feat/research-full-master-catalog-foundation
Worktree: C:\xenios-wt\research-expansion
```

This commit stages only the isolated full-catalog foundation. It does not mount
routes, create Product Control bindings, modify Early Access, add migrations, or
mutate production.

## Package and workbook verification

```text
Package SHA256SUMS entries checked: 36
Package checksum mismatches: 0
Artifact manifest entries checked: 35
Artifact manifest size/hash mismatches: 0
Workbook SHA-256: c6937431bcb64f628352016d5af16ea133add9a0a05b5947d5a0ac75d9e2d438
Workbook rows parsed: 1,236
Early Access rows parsed: 22
```

The workbook was parsed locally into the ignored `.local` boundary. Two
independent builds produced equivalent timestamp-stripped member-safe payloads,
and the rebuilt payload matches the package payload.

## Independently verified catalog result

```text
Member-safe canonical offerings: 1,121
Member-safe variants: 1,181
Admin-only holds: 11
Available-now variants: 18
Candidate delta rows: 231
Candidate delta concepts: 185
Likely new concepts: 154
Unresolved overlap concepts: 31
```

All 31 overlaps remain `reconcile_variant_or_source`; none was auto-merged.
Generated member-safe runtime data was not committed because the package policy
requires existing-registry reconciliation before adopting it as a runtime
catalog. Rebuilt data remains ignored under `.local`.

## Authority and privacy evidence

- Planning price and display state cannot produce `add_to_cart`.
- `add_to_cart` requires an exact planning-variant binding and matching existing
  `CartProductSelection`.
- Removing the binding removes `add_to_cart` while preserving member detail and
  its truthful fallback action.
- The member-safe payload contains no supplier, wholesale-cost, planning-price,
  margin, source-reference, canonical-key, binding, or `purchasable` keys.
- Confidential provider identity matches in member-safe output: 0.
- Admin-only hold IDs present in the member catalog: 0 of 11.
- Product Control bindings created: 0.

## Verification gates

```text
Python workbook export: PASS
Private exporter output-path refusal: PASS
TypeScript builder output-path refusal: PASS
Deterministic dataset build: PASS
Privacy scan: PASS
Provider identity scan: PASS
Regulatory hold scan: PASS
Strict isolated TypeScript 5.6.3 compile: PASS
Focused Vitest: PASS (6 files, 27 tests)
Repository npm run check: PASS
```

One integration-only compatibility adjustment was made to the candidate
normalizer: `Map.values()` is materialized with `Array.from` so it passes this
repository's TypeScript configuration without changing normalization output.

## Added files

```text
scripts/research/build-master-offerings.ts
scripts/research/export-master-offerings.py
server/research/master-offerings/action.test.ts
server/research/master-offerings/action.ts
server/research/master-offerings/customer-projection.test.ts
server/research/master-offerings/customer-projection.ts
server/research/master-offerings/index.ts
server/research/master-offerings/model.ts
server/research/master-offerings/normalize.test.ts
server/research/master-offerings/normalize.ts
server/research/master-offerings/reconciliation.test.ts
server/research/master-offerings/reconciliation.ts
server/research/master-offerings/search.test.ts
server/research/master-offerings/search.ts
server/research/master-offerings/service.test.ts
server/research/master-offerings/service.ts
server/research/master-offerings/test-fixtures.ts
shared/research/master-offerings/contract.ts
shared/research/master-offerings/index.ts
shared/CATALOG_FOUNDATION_HANDOFF.md
```

`PATCH/README.md` was not copied because it maps to the accepted repository-root
`README.md`. The collision was compared and left untouched. Files overwritten: 0.

## Deferred integration

Route mounting, client integration, Product Control bindings, database changes,
and all Early Access transaction surfaces remain deferred. Rebase is required
after the quantity-20 candidate is accepted.
