-- Rollback for the Care to Tebra link store.
--
-- Safe because the connector is inert: nothing registers its routes and nothing
-- starts its scheduler, so no live path reads these tables. Dropping them
-- returns the database to exactly its pre-migration shape.
--
-- DESTRUCTIVE: this drops the mappings. Re-running the migration afterwards
-- creates empty tables, and the next sync re-links every record by looking it
-- up under its derived external id, so nothing is duplicated upstream. Take a
-- backup first anyway if any mapping has been written.

begin;

drop function if exists public.care_tebra_try_acquire_lease(text, text, timestamptz, timestamptz);
drop table if exists public.care_tebra_sync_leases;
drop table if exists public.care_tebra_sync_cursors;
drop table if exists public.care_tebra_links;

commit;
