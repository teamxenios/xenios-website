# Source lineage and refreshed exact joins

The generated source input now resolves all 44 declared files from the complete
package. Workbook verification is imported from the actual Git blob at ancestor
`fc3f579f60c1375f34b7b7f31e9d14960f38269e`, bound to the current workbook,
package/checksum manifests, launch JSON and both CSV byte hashes. The original
observation and proof hash are retained; this import does not claim a fresh run
of all 8,758 workbook comparisons. Without an explicit valid evidence commit,
the validator continues to report workbook cells unverified.

Each of the 39 Phase A and 68 Phase B source rows now has its exact JSON pointer
and a SHA-256 of the complete original row. Serialization is Python JSON with
sorted keys, compact separators, Unicode UTF-8 and nonfinite numbers refused.
The digest includes undisplayed fields and notes without copying those fields
into the generated configuration or browser code. A changed source row changes
the digest; a property-order-only change does not.

Canonical reconciliation refuses duplicate/missing product, variant and price
IDs before building lookup maps, and rejects incomplete/duplicate Phase A IDs.
The fresh read at `2026-09-05T18:03:20.102167+00:00` still has 236 products,
439 variants and 452 prices. All 34 historical joins match exact product,
variant, parent and SKU again. Five mappings and six formulation assumptions
remain unresolved. The mapped units still lack presentation, shipping class,
commerce approval and approved product documentation. The source workbook
blocker is now correctly absent; approval and release blockers remain.

`canonical-reconciliation-v2.json` is the new observation, preserving the old
`canonical-reconciliation.json` as history. The bulk supplier RPC returned 404
on this read, so supplier status is unverified at this observation. The prior
per-unit successful empty reads at 04:41 remain separately dated evidence and
must not be silently relabeled fresh. No supplier facts were invented.

Render remains on `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`, deploy
`dep-dad08h740ujc73aprfcg`, auto-deploy off. The source reader does not read
migration history; its default `migrationLedgerVerified: false` is outside that
reader's scope and does not supersede the linked CLI ledger at 17:41.

Ten focused Python tests pass, including changed workbook proof, complete-row
digests, duplicate canonical IDs and the original source integrity controls.
All source rows remain unapproved and inactive. Next is the protected runtime
review projection, with independent canonical fact states, and the remaining
quantity/import/activation release work. This is not an RC or production GO.
