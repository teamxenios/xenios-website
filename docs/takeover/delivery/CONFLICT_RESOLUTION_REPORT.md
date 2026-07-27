# Conflict-Resolution Report

## Sources reconciled

- Frozen `origin/main`: `64cceb82f72170004525d5c78dc49ea7b77fdf6b`
- PR #103 frozen source: `97ee1895763ea9c243de7365f224660d83773966`
- 119 captured worktrees from the verified takeover snapshot
- Five V3 master artifacts listed in `docs/takeover/V3_SOURCE_REGISTER.json`

## Resolutions

### PR #103

PR #103 was reconstructed as an exact source unit before any integration edits. Its migration remains unapplied. The resulting persistent-cart domain was then mounted behind a new server API seam.

### Website 1 durable authority

Website 1's preserved authority work was retained rather than discarded. The overlapping `server/research/index.ts` edits were reconciled manually:

- preserved the existing Research route order and private-header behavior;
- preserved required shared-password bypasses for reviewed auth/admin endpoints;
- mounted durable authority routes without weakening the legacy guard;
- retained the two-phase `legacy` → `dual` → `durable` cutover;
- removed member authority inference by email outside the explicit legacy cutover boundary.

The authority migration was moved to `20260727190000_research_admin_authority.sql` so it follows the frozen-base reservation migration and precedes persistent cart.

### Catalog authority

The member catalog already used Product Control, while commerce still imported the legacy catalog. Production composition now consumes a Product Control-first source. The 49 V3 profiles are preview-only fallbacks and cannot authorize a transaction.

### Cart and reservation

Persistent-cart records now carry server-produced product, variant, SKU, approved price, canonical readiness, inventory evaluation, display name, and fulfillment-owner snapshots. Checkout now calls the atomic reservation port instead of the legacy direct lot decrement.

### V3 truth hierarchy

The five master artifacts were parsed into supplier-independent records. Blank supplier, price, SKU, inventory, COA, media, shipping, and approval fields remain blank/pending. Northline reference URLs were retained only as internal source references and are not exposed as supplier claims.

### Legacy PR #48 operations

The old operations packet was reviewed but not imported. Its SQL grants broad service-role `SELECT/INSERT/UPDATE/DELETE` on operations tables, and its repositories perform direct DML. Importing it would weaken the current RPC-only standard. This is an intentional safety exclusion, not an overlooked module.

### Care and clinical

No Care or clinical feature was added, enabled, seeded, or linked. Dormant inherited source was not treated as launch scope.

## Unresolved conflicts requiring later bounded work

- Old cart UI/API versus the new persistent-cart API.
- Durable pending order before reservation/payment.
- RPC-only order mutation and audit.
- Safe current-base rebuild of fulfillment/Mitch/affiliate/professional-account modules.
- Product Control command to assign a verified fulfillment owner.
