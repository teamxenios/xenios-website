# Option B: Product Control initializer, build brief

Written so this can be resumed cold. Everything below is verified, not assumed.

## The blocker, stated once

Production `research_products`, `research_product_variants` and
`research_product_prices` are **completely empty** (0 / 0 / 0). The Early Access
catalogue reads Product Control for its product list, so the storefront projects
zero units. Every other layer is verified working.

Migration `20260726143000_research_product_control_center.sql` creates the schema
and the write RPCs. It seeds no catalogue data, by design. Products are created
through the governed Product Control admin API and never have been in production.

## What is already correct in production, do not redo

| Fact | State |
| --- | --- |
| Migration 47 | applied 2026-08-02, immutable, untouched |
| Migration 57 | applied and closed, registry 78 rows |
| Strength disputes | 12 total, 3 inside Early Access |
| Founder releases | 21, visible to the app through its own store |
| Supplier confirmations | 22 |
| Durable session store | MOUNTED |
| `RESEARCH_EARLY_ACCESS_OWNER_ID` | `00000000-0000-4000-8000-000000000001` |
| Deployed SHA | `7d174b9b7c6c9baa6851621ff500cfcf02e9fedf` |
| Auto-Deploy | OFF (must stay off) |
| Password unlock | works |

## The governed write surface (requirement 27 is satisfiable)

`SupabaseProductAdminRepository` in
`server/research/products-diagnostics/product-admin-production.ts`:

| Method | RPC |
| --- | --- |
| `create(input, actor, at)` | `research_admin_create_product` |
| `setLifecycle(...)` | `research_admin_transition_product` |
| `createVariant(...)` | `research_admin_create_product_variant` |
| `updateVariant(...)` | `research_admin_update_product_variant` |
| `createPrice(...)` | `research_admin_create_product_price` |
| `approvePrice(...)` | (price approval RPC) |

A two-step shape is unavoidable: `research_admin_create_product` hardcodes
`availability = 'documentation_review'` and
`commerce_approval = 'blocked_pending_written_approval'`, and the table defaults
are `admin_status = 'draft'` and `visibility_state = 'hidden'`. So each product
must be created and then transitioned via `setLifecycle`.

## Column facts, confirmed against information_schema

- `research_products`: identity is `sku` (uppercased product code, e.g. `PEX-012`)
  and `slug`. Publication is `admin_status`, `visibility_state`, `active_state`
  (boolean, default **true**). There is **no** `product_code` and no `active`
  column. `commerce_approval` defaults to `blocked_pending_written_approval`.
- `research_product_variants`: `sku`, `strength`, `presentation`, `label`,
  `member_eligible` (default false), `status` (default `draft`), `active`
  (boolean, default **false**), `sort_order`.
- `research_product_prices`: `audience`, `amount_cents`, `currency`,
  `effective_at`, `expires_at`, `status` (default `draft`), `approved_by`,
  `approved_at`.
- All three are TABLEs, no views.

## The join that must work

`earlyAccessRowKey` is `productId::variantId`. Release rows already in production
use e.g. `PEX-012::R360-AOD9604-5MG-VIAL`. The create RPC sets
`sku = upper(p_input->>'productCode')`, so products must be created with
product codes `PEX-012` etc. and variants with `sku = R360-...`, or the
catalogue will project rows that no release matches and the storefront stays at
zero.

## The approved subset

19 products / 22 variants, selected from the canonical source
(`canonicalReviewProducts()`, which holds the full 48 / 78). The exact 22 SKUs
and the 21 release keys with prices are in
`docs/early-access-release/evidence/DRY_RUN_RELEASE_AND_SUPPLY.txt`.

Opening set to preserve: 19 products, 22 visible, 18 purchasable, 4 held
(Tesamorelin 10 mg, NAD+ 500 mg, MOTS-C 10 mg on strength disputes;
Cagrilintide 10 mg on `NO_FOUNDER_RELEASE`). NAD+ 1000 mg AVAILABLE at $100.75.

## Build shape, same model as the two shipped initializers

`scripts/initialize-product-control.ts`, mirroring
`scripts/initialize-founder-releases.ts`:

1. Refuse when `RESEARCH_EARLY_ACCESS_ENABLED` is `true`.
2. Dry run by default; `--execute` required.
3. Derive the 19/22 subset from the canonical source; assert exact identities.
4. Read production first; refuse partial or conflicting state.
5. `ALREADY_INITIALIZED` when all rows exist.
6. Create product, transition lifecycle, create variants, create and approve
   prices, all through the repository.
7. Read every row back and verify field equality.
8. Actor, timestamp, reason, source recorded.

Tests belong under `server/`, not `scripts/` (vitest does not collect `scripts/`).

## Open question for the founder

`commerce_approval` defaults to `blocked_pending_written_approval`. Requirement
10 says to set it only to a value already authorized. The founder release ledger
authorizes the SALE of 21 units; whether that constitutes the "written approval"
this column names is a founder call, not an engineering one. Ask before setting
it to anything other than the default.
