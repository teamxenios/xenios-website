# Website 5 — Research Commerce CSV Safety Handoff

Status: focused utility ready for bounded Website 6 review

## Release identity

- Authorized base: `6e4944674cfdfb33a8fd5685c031c7ac7c86fdb4`
- Branch: `feature/website-5-research-commerce-csv-safety`
- Frozen head: use the exact SHA recorded on the draft PR and in the Website 2/6 handoff; this file is part of that head.
- Release placement: future Research Commerce shared administration support; does not block Wave 1.

## Completed scope

- Added schema-driven UTF-8 CSV parsing and serialization.
- Added RFC 4180 quoting, embedded newline support, optional BOM handling, LF/CRLF parsing, and deterministic CRLF output.
- Added deterministic schema column order and configurable byte, row, and column limits.
- Added fail-closed validation for invalid UTF-8, control characters, malformed quoting/line endings, duplicate or missing headers, strict unexpected headers, inconsistent rows, and spreadsheet formula risk.
- Added formula-injection neutralization for every exported data cell and rejection of formula-risk schema headers.
- Added stable coordinate-only validation errors. Errors contain no raw cell, row, file content, decoder text, or provider error.
- Added bounded deterministic property-style round-trip coverage alongside focused malformed, Unicode, limit, formula-risk, and redaction regressions.

## Exact files

- `shared/research/admin-data-exchange.ts`
- `server/research/admin-data-exchange/csv.ts`
- `server/research/admin-data-exchange/csv.test.ts`
- `docs/coordination/WEBSITE_5_RESEARCH_COMMERCE_HANDOFF.md`
- `docs/coordination/WEBSITE_5_REMAINING_SCOPE.md`

## Boundaries preserved

- Pure route-free utility only.
- No UI, route, authentication, role, repository, provider, database, migration, RLS, Storage, seed, or production changes.
- No domain import or database writer.
- No package dependency changes.
- No Care file, branch, PR, or behavior changed.

## Validation

- Focused CSV tests: required before freeze.
- Full `npm test`: required before freeze.
- `npm run check`: required before freeze.
- `npm run build`: required before freeze.
- `git diff --check`: required before freeze.
- Scope check: only the exact allowlist above may differ from the authorized base.

## Integration request

Website 2 retains all wiring, integration, merge, deployment, and production authority. A future administrator workflow may import the shared contract and server utility only after its own authorization, domain validation, persistence, and audit design are independently reviewed. This unit must not be registered as a route or treated as authorization for any production write.

Website 6 review request: inspect only RFC 4180 behavior, Unicode/UTF-8 boundaries, limits, formula-injection safety, error redaction, deterministic output, and allowlist isolation.
