# Website 5 — Wave 3 Product Control CSV Mapping Handoff

Status: focused route-free utility preparing for bounded Website 6 review

## Release identity

- Authorized base: `f4de7f371177beaa2f4de7eb2e7b6a88d7378a19`
- Branch: `feature/website-5-wave3-product-control-csv-mapping`
- Frozen head: use the exact SHA recorded on the draft PR and Website 2/6 handoff; this document is part of that head.
- Release placement: Wave 3 Product Control administration support.

## Completed scope

- Added deterministic strict CSV schemas for product, variant, effective-dated price, and private-media metadata drafts.
- Built the schemas on the accepted live CSV kernel, preserving its UTF-8, BOM, RFC 4180, CRLF, formula-injection, limit, malformed-file, and redacted-error boundaries.
- Added pure parse and validation mappings to canonical Product Control draft inputs.
- Requires explicit UUIDs, product codes, slugs, aliases, SKUs, booleans, sort order, audience, currency, effective dates, media metadata, and private storage-key references. No business value or default is invented.
- Added exact product-to-variant relationship validation for complete bundles and caller-supplied canonical binding contexts.
- Added deterministic redacted export projections that exclude lifecycle, publication, approval, actor, audit, signed-URL, and provider fields.
- Added bounded generated round-trip coverage for all four profiles plus semantic, relationship, Unicode, BOM, formula, limit, redaction, and private storage-reference regressions.

## Output boundary

Every parsed item is a `*_draft` or `media_metadata_draft` command object only.

This unit:

- does not call a route or RPC;
- does not read or write a database;
- does not publish, approve, activate, upload, create, or mutate a record;
- does not expose media bytes, signed URLs, or public URLs;
- does not imply that any imported fact is verified;
- does not authorize a future caller to persist the output.

## Exact files

- `shared/research/admin-data-exchange/product-control-csv.ts`
- `server/research/admin-data-exchange/product-control-csv.ts`
- `server/research/admin-data-exchange/product-control-csv.test.ts`
- `docs/coordination/WEBSITE_5_RESEARCH_COMMERCE_HANDOFF.md`
- `docs/coordination/WEBSITE_5_REMAINING_SCOPE.md`

## Validation

- Focused Product Control CSV tests: required before freeze.
- Bounded generated-property cases: included in the focused test file.
- Full `npm test`: required before freeze.
- `npm run check`: required before freeze.
- `npm run build`: required before freeze.
- `git diff --check`: required before freeze.
- Exact allowlist comparison against the authorized base: required before freeze.
- GitHub build/test/typecheck: required for the exact pushed head.

## Review request

Website 6 should review only:

- deterministic schema and mapping correctness;
- exact identifier and product/variant binding preservation;
- effective-date and enum validation;
- storage-key reference-only behavior;
- formula, UTF-8, BOM, row/column/byte limit inheritance;
- redaction of error metadata and exports;
- absence of routes, persistence, lifecycle mutation, provider execution, and non-allowlisted files.

Website 2 retains all wiring, integration, merge, deployment, and production authority.
