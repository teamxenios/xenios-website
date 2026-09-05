# Canonical quantity price write checkpoint

This is an intermediate local implementation slice, not the revenue launch RC.
The migration-history evidence at pushed `d21782752283e6a474b5f77d37140e662961335e`
closed the missing-history startup gate. ASTRA-B independently recomputed its
hashes, all 35 Git-blob checksums and full LOCAL/REMOTE counts with no blocking
discrepancy in that scope. Remote SQL/object parity remains unverified.

`CreateAdminPriceInput` now accepts an optional immutable `quantityTiers` ladder
using the existing `PriceQuantityTier` contract. Server normalization clones and
freezes the complete ladder before awaiting product reads. Malformed, inverted,
unsafe or inconsistent ladders refuse before persistence. Approval re-reads and
validates the stored economic record as well as its canonical strength gate.
Omitted/empty ladders preserve scalar draft behavior, including legacy zero
drafts; zero is still not a customer price.

Tier writes use `research_admin_create_tiered_product_price`, a capability-specific
RPC that delegates to the existing Product Control create function. On an older
schema this RPC is absent, so no scalar price is silently created by dropping
the new JSON field. There is no fallback after failure. The canonical admin route,
trusted actor, no-store response, required idempotency key and price authority
remain in place. This slice does not certify restart-safe batch idempotency;
the existing generic idempotency store's crash window needs the later import
transaction design.

The unapplied candidate adds `quantity_tiers` to `research_product_prices`, a
strict database constraint and economic immutability protection. It retains
canonical version allocation, audit and approval, and creates no parallel price
book. It contains no product/price import or activation. The precheck/postcheck
SQL and rollback notes are candidates for later exact review, not authority to
run against production. Existing applied migration bytes are unchanged.

Validation: 164 focused tests passed with one existing skip across 13 files,
including quantity resolution/cart snapshots, Product Control integration and
strength guards. TypeScript `tsc --noEmit` passed under Node 20.19.0. Additional
malformed repository-input cases are checked in the final focused run. The
offline SQL rehearsal passed 37 checks including the actual postcheck script,
ACL denials, atomic failed writes, version allocation, audit, immutable economic
fields, existing scalar preservation and superseding without history loss.

The SQL engine is PostgreSQL 18.3 via PGlite 0.5.8 installed outside the repository.
The rehearsal uses exact checksum-pinned canonical price/audit/RPC SQL and minimal
parent fixtures. It does not establish production schema/RLS parity, multi-session
concurrency or authenticated production integration. Docker was installed but
its local daemon was unavailable. No production database was used for rehearsal.
See `quantity-tier-sql-rehearsal.json` for the candidate hash and scope.

Next: Early Access quantity/version propagation and immutable release binding;
source verification artifact refresh; canonical import/review/scheduling and
activation with transactional retry protection; B client/readiness integration;
full release and browser gates. Mapping, formulation, supplier and release
decisions remain explicit, and no production mutation or GO has occurred.
