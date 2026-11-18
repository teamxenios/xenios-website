# Real-reader form-search coverage integration

Task: `EA-FORM-SEARCH-TEST-INTEGRATION-20261118`.
Test-custody owner: `codex-factory-assurance-v01-20261118`.
Source base: `48a2e5b8b87fbb944919522675abc264f76b5f01` (C2 transitional #506).
Preserved original source: `3fe8fcd06de3e95c39820e37ab459d10bda00616`.

## Result and boundary

The entire four-case real generated-catalog describe block from the original
source is restored in
`server/research/master-offerings/request-intent-form-search.test.ts`.
Its helpers, real dataset path, viewer fixture and assertions are unchanged.
Only the file-level relative imports are adapted for the new location.

The actual rule in `master-offerings/catalog-boundaries.test.ts` recognizes
`/(^|\/)master-offerings\//` as the ingestion lane. Files outside that lane may
not statically import its reader/service modules, apart from the existing exact
`server/index.ts` composition-root exception. The new test lives inside the
lane and uses ordinary static imports of `./dataset-reader` and `./service`.
No dynamic/disguised imports, boundary/allowlist/configuration changes or new
runtime door are introduced.

`assisted-order/request-intent/catalog.test.ts` remains byte-for-byte unchanged
from the transitional base. All 21 current cases, including both file-based
dataset checks and every synthetic projection/form/sort/ranking check, remain.
The runtime `catalog.ts`, dataset, reviewed holds, aliases, category rules,
service and generated reader remain C2-owned and unchanged. Original C2
branches/worktrees are preserved.

## Coverage preserved from the real path

The new test composes `GeneratedMasterOfferingCatalogReader` over the actual
`member-safe-master-offerings.generated.json` through the real
`MasterOfferingCatalogService` and `createRequestIntentCatalog`. The viewer is
an explicit synthetic Early Access fixture; it does not establish a live guest
session, policy acceptance or authorization.

The four original cases preserve:

1. Every printed form belongs to the searched or never-searched vocabulary;
   every searchable form is actually printed by the generated catalog.
2. Form-held rows expose no searchable form; every topical-view row keeps a
   topical form, with nonempty populations required.
3. The request projection contains exactly 420 rows. Every search uses the
   original five-page walk at page size 100, verifies unique variant identity,
   checks held-row matches against their own name/specification/aliases, and
   records any missed printed form. All 11 original search words remain:
   `vial`, `liquid`, `capsules`, `topical`, `cream`, `serum`, `injectable`,
   `solution`, `tablet`, `troche`, `nasal spray`. Both leak/miss lists must be
   empty, and `lyophilized` must find no rows.
4. `topical` finds all topical-view variants; a `vial` search with the clinical
   family filter returns a nonempty result entirely in that family; `zzqx`
   returns no rows.

These are four restored real-path cases plus 21 existing cases, for 25 cases
across the two form/catalog files. The 11 words are loop iterations within an
original case, not 11 separately registered test results.

## Qualification

This checkpoint is source/static work only. No local tests, build, typecheck,
browser, live customer/clinical action, production action or deployment was
performed. Static source comparison checks the restored block against the
original Git blob and the existing catalog test against the exact base.
Independent review and exact-source runtime qualification remain pending.

After Root allocates the shared test slot, the focused verification should
include both files and the unchanged boundary rule:

```text
npm run test -- server/research/assisted-order/request-intent/catalog.test.ts server/research/master-offerings/request-intent-form-search.test.ts server/research/master-offerings/catalog-boundaries.test.ts
```

Use the pinned repository toolchain and exact pushed source. A source count or
comparison does not claim that any of these cases passed. The exact-SHA
handoff and static receipt are held privately by the task owner for Root.
