# Catalog imagery coverage ledger — Batch 003

This isolated batch accounts for every exact offering/source-variant pair in release baseline `5926c2faf1e3ed2a7dbc82822fd6c3a8c93b694b`. It prevents private concepts, generic icons, rights-pending URLs or unreviewed service art from being mistaken for final exact product imagery.

The generated ledger is `coverage-ledger.v1.json`. It is internal completion evidence, not a runtime media manifest and not publication authority.

## Accounting rule

Only independently approved exact production product assets count complete. A private design concept may be useful and independently reviewed without becoming a photograph or verified render of current delivered packaging.

## Current exact denominator

- Canonical offering/source-variant pairs: 420
- Physical-product pairs requiring exact physical imagery: 419
- Private reviewed design concepts: 1
- Official exact-source candidates still held for rights: 10
- Original service presentations prepared but still awaiting independent review: 1
- Physical supplies blocked on exact SKU/package identity: 1
- Remaining exact pairs without an approved product-specific source: 407
- Final reviewed exact production product assets: 0
- Publication-authorized assets: 0

Every row names its exact external inputs. The unresolved group is not hidden or dropped from the denominator.

## Rebuild and verify

```text
node deliveries/catalog-imagery/2026-11-04-batch-003/build-ledger.mjs
node deliveries/catalog-imagery/2026-11-04-batch-003/verify-ledger.mjs --write-receipt
node deliveries/catalog-imagery/2026-11-04-batch-003/verify-ledger.mjs
```

The verifier pins committed catalog and binding bytes, requires all 420 pairs exactly once, checks every attached prepared-asset hash and byte count, preserves the intentional FedEx unbound/service disposition, preserves the physical-supply requirement, validates status totals and rejects manufactured completion/publication authority.
