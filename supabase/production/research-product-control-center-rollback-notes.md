# Product Control Center rollback and recovery

## Release identity

- Accepted domain source: `dd58ccf1fa7919f78838a60aaf66cdee48b73993`
- Pre-release production code: `ac324cb12f16da9322ff224e78c08210d039c7b2`
- Pre-release Render deployment: `dep-d9j4fckvikkc73d88b70`
- Migration: `20260726143000_research_product_control_center`
- Managed production migration:
  `20260726214102 research_product_control_center`
- Required privilege convergence:
  `20260726214500_research_product_control_center_privilege_hardening.sql`
- Canonical raw Git-blob SHA-256:
  `b1589eb24405d4700206d25541b647479afee34c2cd05422da70df2179876203`
- Integration, merge, and deployed identities are recorded in the release
  handoff after Website 6 accepts the exact integration candidate.

## Routine recovery

The migration is additive and idempotent. If application is interrupted,
re-run the exact reviewed migration with `ON_ERROR_STOP=1`, then run
`supabase/verify-research-product-control-center.sql`. Do not edit the
migration or relax its grants to work around a partial apply.

If the deployed application regresses, roll Render back to the exact
pre-release deployment above. Leave the additive schema in place: browser
roles have no table or RPC grants, five command-managed tables are
service-role SELECT-only, and no startup path creates a product, variant,
price, media, audit, or required-input row.

The initial managed apply encountered no DDL error and created no domain row,
but production verification found inherited/default service-role
`TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges. Do not deploy the
application until the reviewed hardening migration has removed those three
privilege types from all 12 Product Control tables and the verifier reports
exactly 33 service table privileges.

## Production invariants

- Public commerce remains fail-closed behind canonical per-product
  required-input readiness and launch controls.
- The migration creates no product, price, inventory, lot, COA, order, seed,
  role, or launch-control record.
- Care remains disabled, isolated, and absent from ordinary navigation.
- The private product-media bucket stays non-public.
- Never invoke a mutating Product Control RPC merely to test production.

## Destructive rollback

Dropping Product Control objects is not a routine rollback. It requires an
explicit destructive-data decision, a verified export/recovery plan, exact
row-count evidence, and separate review. Never use `CASCADE`; it can remove
pre-existing catalog dependencies. Until that authority exists, retain the
inert schema and roll back only the application deployment.
