# Research inventory reservation command rollback

## Release identity

- Exact integration/production base:
  `57533983e4c11e6549e6e8bf9d94f50cd46005af`
- Exact PR #92 source base:
  `ef158672ce9ec3524f8bb64841b285a76e37a54b`
- Website 6-accepted PR #92 domain source:
  `d9107eb69355513ab89c82b6ff48c2bfe6174895`
- Accepted source and managed migration canonical Git-blob SHA-256:
  `4dbb183f367e6dcd847cba3048a37f132ab4cc559791c2719baf7e05c42767f7`
- Managed migration candidate:
  `20260727160000_research_inventory_reservation_commands.sql`
- Integration, merge, deployed, Render, and managed-application identities are
  recorded only after Website 6 accepts the exact integration candidate.

## Routine recovery

The migration is additive and idempotent. If application is interrupted,
re-run only the exact reviewed managed migration, then run the read-only
`supabase/verify-research-inventory-reservation-commands.sql` verifier. Do not
edit the migration, relax grants, or create a parallel reservation model.

If the application release regresses, restore the exact pre-release Render
deployment while retaining the inert additive schema and append-only
reservation history. Checkout remains disabled, and no route invokes the
reservation port in this release.

## Production invariants

- The migration creates no product, variant, lot, COA, reservation,
  allocation, movement, event, cart, order, payment, role, provider, or Care
  record.
- All three reservation tables force RLS, have zero policies and browser
  grants, and expose only SELECT to `service_role`.
- Only the four reviewed fixed-search-path command RPCs are executable by
  `service_role`; helper and trigger functions remain ungranted.
- Reserve, release, finalize, and expire remain atomic, versioned, idempotent,
  timestamp-bound, and serialized with Product Control and exact-lot readiness.
- Care remains disabled, isolated, and absent from ordinary navigation.
- Never invoke a mutating reservation RPC merely to test production.

## Destructive rollback

Dropping reservation objects is not a routine rollback. It requires an
explicit destructive-data decision, verified exports, exact count evidence,
and separate review. Never use `CASCADE`. Until that authority exists, retain
the schema and roll back only application deployment.
