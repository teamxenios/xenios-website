# Deterministic supplier fixture maintenance — local checkpoint

Task: `DETERMINISTIC-SUPPLIER-FIXTURE-MAINTENANCE-20260904`

Base: `83fe0a1d4e0825d9ddaa2ee1bf4f53a03898e419`

Scope is exactly two test files. Their real Product Control/founder-release/supplier
fixtures now seed and execute at the fixed valid instant
`2026-08-08T10:00:00.000Z` through the existing injected request clock. No
process-global fake clock, production source, route, supplier record or expiry was
changed.

Expiry coverage was strengthened. Each real mounted shelf/cart suite seeds once
while the recorded confirmation is valid, proves an offered item immediately
before expiry, then advances only the request clock. A newly issued session at the
boundary prevents session expiry from masking the supplier decision. Both exactly
at `RAW_PEPTIDES_EXPIRES_AT` and one millisecond later, the shelf withdraws price
and purchase authority and the cart returns `409 LINE_REFUSED / PRODUCT_HELD`
without a quote. Existing withdrawal, missing/malformed route, supplier-directory,
22-visible/18-purchasable/4-held and gate-two negative controls remain.

Focused verification across the two changed suites and their supplier availability
and confirmation companions: **4 files, 72/72 PASS** in 6.17 seconds with two
workers. `git diff --check` passed apart from Windows line-ending notices.

The live source `server/research/early-access/release/founder-supply-seed.ts`
remains byte-identical with SHA-256
`A76DE7AD2539142443B6D5D3DEA4C1A0E0352D95919234326A2C1E0C52792BAD`.
Its `RAW_PEPTIDES_EXPIRES_AT` remains `2026-09-03T23:30:00.000Z`.

Production mutated: **NO**. This is test determinism, not current supplier
availability, production activation or permission to sell.
