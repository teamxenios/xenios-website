# Catalog imagery coverage ledger — Batch 007

This internal delivery reconciles the current imagery evidence for every exact offering/source-variant pair in release baseline 5926c2faf1e3ed2a7dbc82822fd6c3a8c93b694b. It supersedes the stale status accounting in Batch 003 without changing runtime media, canonical identities, prices, eligibility, request routing, or publication state.

coverage-ledger.v2.json is completion evidence, not a runtime media manifest and not publication authority.

## Exact accounting

| Disposition | Pairs |
| --- | ---: |
| File-level accepted exact product assets | 10 |
| Current-label-version holds or non-exact source leads | 11 |
| Internal-only accepted service presentations | 1 |
| Physical supplies blocked on exact SKU/package identity | 1 |
| No approved product-specific source | 397 |
| **Canonical total** | **420** |

The ten file-level accepted exact product assets are the Batch 004 BPC-157 10 mg website render and nine exact official NutriDyn product/package exports from Batch 005. These are not fully ready: this delivery branch has zero runtime-linked, mounted, publication-authorized, production-served-verified, or fully ready pairs.

The eleven held files are not counted as accepted exact assets:

- Batch 005 R227 Magtein remains held for its current selected-label-version conflict.
- All ten Batch 006 official exports remain non-exact source leads because their product code, package, flavor, formula, ingredient, or revision conflicts are unresolved.

FedEx Standard Overnight remains a nonphysical service. KAN-31/10623 accepted the exact Batch 002 bytes only as an internal service presentation; the Batch 002 receipt itself still correctly reports zero independently reviewed assets. Trademark/legal review, Root integration, and release approval remain pending. Syringes & Alcohol Swabs remains a physical supply requiring its exact manufacturer, model, gauge, volume, counts, and package image.

## Evidence lineage

The ledger pins the source commits, reviewed trees where applicable, metadata successors, review references, byte counts, and SHA-256 values for the Batch 002–006 manifests/evidence/receipts it uses:

- Batch 002 source dd71617ec04ec231646296a3ae0eafcf62cffee5; internal-only service review KAN-31/10623.
- Batch 003 source 5588d312ff52d5bffa00b81fb1779161a5e5aa09; denominator/disposition review KAN-31/10623.
- Batch 004 reviewed source f72de21651e4bc921c148e7290de79f1a4ea2ea4, metadata successor cc981957235e018930ac1b43f87bd9d11daef512; file-level review KAN-31/10627.
- Batch 005 reviewed source 8eda87dba4098d656c45651294138f62d8972673, metadata successor c68b8ad7f161b6bdc1a8fa4b67d3398a6268b1ed; nine-pass/one-hold review KAN-31/10631.
- Batch 006 source 6bb6e16ddc144ec100f5cf8062d52c7f4a5e3357; ten source leads explicitly held as not exact.

All five predecessor receipts are green. Batch 007 also verifies every attached accepted/held file against its declared bytes and SHA-256.

## Rebuild and verify

    node deliveries/catalog-imagery/2026-11-04-batch-007/build-ledger.mjs
    node deliveries/catalog-imagery/2026-11-04-batch-007/verify-ledger.mjs --write-receipt
    node deliveries/catalog-imagery/2026-11-04-batch-007/verify-ledger.mjs

The verifier requires all 420 canonical pairs exactly once, checks the complete catalog and binding byte pins, verifies that the 23 overlay pairs are unique and canonical, enforces the seven mutually exclusive status totals, preserves every pair-specific remaining gap, validates all predecessor pins/receipts and attached asset bytes, and rejects manufactured runtime, mounted, publication, production, or readiness claims.
