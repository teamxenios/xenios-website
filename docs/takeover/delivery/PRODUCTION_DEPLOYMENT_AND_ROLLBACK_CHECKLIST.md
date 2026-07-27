# Production Deployment and Rollback Checklist

## Before integration

- [ ] Verify `DELIVERY_IDENTITY.json` and both ZIP checksums.
- [ ] Verify the exact frozen base and delivered source head.
- [ ] Rebase/reconstruct only if current main advanced; renew exact-SHA QA afterward.
- [ ] Confirm no Care/clinical change and no prohibited head in ancestry.
- [ ] Confirm V3 source hashes against `V3_SOURCE_REGISTER.json`.
- [ ] Review every overlay file and migration checksum.
- [ ] Run full tests, typecheck, build, route uniqueness, diff check, and secret scan with Node 20.19.0/npm 10.8.2.

## Database preflight

- [ ] Capture managed migration history and baseline row counts.
- [ ] Confirm reservation migration identity already deployed before applying dependent migrations.
- [ ] Run admin-authority and persistent-cart migrations twice in disposable PostgreSQL 16.
- [ ] Run committed SQL/Node verifiers.
- [ ] Verify forced RLS, zero browser policies/grants, exact service privileges/RPCs, direct-DML denial, append-only audit, concurrency, and rollback zero.
- [ ] Verify PR #103 migration remains unapplied until this controlled step.

## Authority cutover

- [ ] Keep the legacy guard active.
- [ ] Resolve Samuel by verified existing `auth.users.id`, never email inference.
- [ ] Confirm the target is not a recovery session and no account/member/role row needs fabrication.
- [ ] Execute the accepted one-time assignment command once with an idempotency key.
- [ ] Verify exactly one active `super_admin` assignment and immutable audit record.
- [ ] Change mode to `dual`; smoke admin and member landing/switching.
- [ ] Change mode to `durable` only after continuity is proven.

## Commerce enablement

- [ ] Keep all preview-only V3 profiles nontransactional.
- [ ] Do not enable persistent-cart UI while the old writable cart remains live.
- [ ] Do not enable checkout until durable pending-order/RPC-only order work is accepted.
- [ ] Require a real assigned fulfillment owner for every buyable variant.
- [ ] Require approved price, inventory, exact-lot COA, media, shipping, legal, and payment gates.

## Merge and deploy

- [ ] Website 2 creates the exact integration commit and obtains Website 6 acceptance.
- [ ] Website 2 applies migrations in documented order and records exact identities.
- [ ] Merge only the accepted SHA.
- [ ] Record exact merge SHA, tree, parents, Render deployment ID, status, and deployed Git SHA.
- [ ] Run health/private-header/API method/browser-width smoke.
- [ ] Run authenticated read-only member/admin smoke with an existing authorized account.
- [ ] Confirm no production rows were fabricated and Care is still disabled.

## Rollback

- [ ] Prefer fix-forward for additive code-only defects when security/data integrity is intact.
- [ ] Disable new route/UI feature flags before reversing data structures.
- [ ] Return authority mode to `dual` or `legacy` before rolling back the authority schema.
- [ ] Disable persistent-cart writes before applying its rollback.
- [ ] Export only command/audit identities needed for evidence; never export member secrets or raw private data.
- [ ] Execute the exact reviewed rollback in reverse dependency order.
- [ ] Reverify grants, RLS, counts, health, private headers, navigation, and the prior deployed SHA.
- [ ] Record the rollback deployment ID and incident evidence.
