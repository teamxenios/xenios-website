# Kris Launch A: expired inventory hold sweeper

## Scope

Accelerator Task H only. This lane does not deploy, mutate production, change
catalog pricing, or create another inventory/order store.

Base: `lane/kris-launch-a` at `5462673`.

## What changed

- Added a service-role-only PostgreSQL drain that claims no more than 100
  `held` reservations whose `expires_at` is at or before the supplied clock.
- Claims use `FOR UPDATE SKIP LOCKED`, so concurrent workers do not process the
  same hold.
- Each claimed member batch is passed through the existing
  `research_expire_inventory_reservations` command. That command remains the
  sole authority for inventory release, quarantine fallback, movement audit,
  terminal status, and replay semantics.
- The claim, lot release, movement records, reservation transitions, and
  result are one database transaction. An exception or worker disconnect rolls
  the drain back; a retry can claim the rows again.
- Added a strict server adapter and an execute-only operator command.

## Migration

Apply after:

`supabase/migrations/20260727160000_research_inventory_reservation_commands.sql`

New migration:

`supabase/migrations/20260813160000_research_inventory_reservation_sweeper.sql`

The release owner must add it to the frozen release manifest/migration DAG.
This accelerator lane did not apply it to production.

## Operator drain

Required environment:

- Standard server-side Supabase service-role configuration
- `INVENTORY_SWEEPER_ACTOR_ID`, a canonical operator UUID

Dry run, no writes:

```powershell
npx tsx scripts/research/drain-expired-inventory-reservations.ts
```

Execute one bounded batch:

```powershell
npx tsx scripts/research/drain-expired-inventory-reservations.ts --execute --limit=50
```

Run repeatedly until `claimedCount` is `0`. A scheduler may invoke the same
command with a fresh process; the script creates a unique audited run key.

## Evidence

- `17` focused inventory reservation tests passed.
- `npm run check` passed.
- `npm run build` passed.
- PostgreSQL 16 disposable verification applied the canonical inventory
  foundation, canonical reservation commands, and the new migration with
  `ON_ERROR_STOP=1`; the new function was present afterward.
- `git diff --check` passed.

## Release boundary

The function is intentionally not exposed to browser roles or member routes.
Only `service_role` receives execute permission. There is no automatic card
capture or checkout behavior change in this lane.
