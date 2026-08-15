# Xenios platform decisions

## D-001 — One canonical identity
Supabase Auth remains the credential authority. Roles and portal access are server-derived. No separate affiliate, organization, supplier, or Care password database.

## D-002 — One canonical product/variant authority
Product Control and master offerings remain the catalog authority. Persona surfaces receive projections, not copied catalogs.

## D-003 — Visibility is not purchase permission
Provider, classification-pending, held, out-of-stock, and price-pending products can remain visible with truthful actions. They never gain direct commerce merely by being visible.

## D-004 — Organization table collision
The unsent Pack 02 account table is renamed to `public.research_account_organizations`. The existing partner-system `public.research_organizations` remains untouched.

## D-005 — Supplier anti-poaching
Suppliers see only assigned order references, assigned lines, minimum shipping destination, handling/lot/COA requirements, and Xenios relay contact. They do not receive buyer commercial identity, affiliate attribution, customer price, or Xenios margin.

## D-006 — Payment gates downstream effects
Supplier release, payable affiliate commission, and fulfillment notifications require verified payment or an explicitly authorized zero-payment workflow.

## D-007 — Care stays separate from RUO
Provider-only clinical products route through Care. RUO materials remain research-use only.

## D-008 — Progressive releases
A coherent, verified slice ships before the entire future platform is complete. Every release is SHA-pinned, rollbackable, and smoke-tested.
