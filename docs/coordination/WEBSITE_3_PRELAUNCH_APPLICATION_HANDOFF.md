# Website 3 private pre-launch domain application

## Release unit

- Branch: `feature/website-3-prelaunch-context`
- Base/main SHA: `3859e799abb9a7a307b13ca1e8a6a5d252abbc5e`
- Canonical contract SHA: `df33ee19555c9301c530e513bcc29a6cdcec28bf`
- Shared contract: `docs/coordination/PRELAUNCH_SHARED_CONTRACT.md`
- Shared types: `shared/research/prelaunch.ts`

This is a focused Website 3 follow-on. It does not amend the frozen Train 1
heads and does not change the live public/member/admin Train 1 construction.

## Domain application

`server/research/products-diagnostics/prelaunch-application.ts` consumes the
canonical:

- `product_admin`, `internal_team`, and `approved_internal_reviewer` roles;
- `PrelaunchAccessStatus` and `PrelaunchDataContext`;
- `disabled`, `capture`, and `live` provider modes;
- canonical internal-seed-to-capture downgrade.

The repository boundary resolves a per-request operation:

- `read`
- `write`
- `external_action`

The approved internal reviewer is read-only. Operations and clinical roles do
not gain Website 3 repository access.

## Fail-closed isolation

No Website 3 seed namespace, origin columns, reset path, or domain isolation
migration is approved. An `internal_seed` context therefore fails before any
product or diagnostics repository is constructed.

This prevents accidental fallback into real:

- products and variants;
- lots and COAs;
- prices and inventory;
- metabolic interests;
- supplement and Superpower settings;
- biomarker records and private Storage;
- analytics, outbox, or external actions.

No seed record, namespace, role, migration, Storage object, or production row
is created by this release unit.

## Provider boundary

An external action fails before provider construction when the canonical mode
is `disabled`.

The canonical capture table remains Website 2-owned, and the frozen shared
contract does not yet export a capture writer. A `capture` action therefore
fails with `website3_capture_adapter_required` instead of falling through to a
live provider. Website 2 must inject its canonical capture adapter in the later
shared integration unit.

Only a real-data context with canonical provider mode `live` may construct a
Website 3 external-action dependency.

## Integration seam

Website 2 may call:

`buildWebsite3PrelaunchProductionDependencies(access, operation, env)`

only after its canonical server guard has produced the verified
`PrelaunchAccessStatus`. This branch does not register shared routes or alter
`server/index.ts`.

## Validation

- Focused pre-launch and production-dependency tests
- Complete `npm test`
- `npm run check`
- `npm run build`
- `git diff --check`

Exact final counts and head SHA are recorded in the PR and Command Center
handoff.

## Deferred shared contracts

Website 3 does not define required-input objects, readiness validators, launch
switches, seed namespaces, or seed promotion. Those remain blocked until
Website 2 freezes and hands off the separate canonical contracts.

PRODUCTION STATUS: NOT YET MERGED
