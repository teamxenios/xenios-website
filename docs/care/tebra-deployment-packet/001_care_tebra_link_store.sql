-- Xenios Care to Tebra connector: the durable link store (CANDIDATE, NOT APPLIED).
--
-- WHY THIS FILE IS NOT IN supabase/migrations/
--
-- `supabase db push` applies everything under supabase/migrations. Placing an
-- unreviewed candidate there arms it to reach production on someone else's
-- unrelated push. It lives here until the release manager registers it in
-- docs/coordination/MIGRATION_DAG.json and moves it deliberately.
--
-- WHY THIS MIGRATION EXISTS
--
-- server/care/tebra-link-store.ts defines TebraLinkRowGateway, the durable port
-- behind the connector's mappings, cursors and run lease. Only an in-memory
-- implementation ships today, and an in-memory lease does not coordinate across
-- processes, so the poller cannot safely run on more than one instance until
-- these tables exist.
--
-- WHAT IT MAY AND MAY NOT DO
--
--   * Creates three tables and one function, all new, all prefixed care_tebra_.
--   * Writes no business row, settles nothing, releases nothing, moves no
--     payment state, and touches no existing table, constraint or routine.
--   * Grants nothing to anon or authenticated. RLS is enabled with no policy,
--     so only the service role reaches these tables. A link row is a routing
--     decision between a Xenios record and a chart in a practice system; no
--     browser-facing role has any reason to read or write one.
--
-- FAIL CLOSED
--
--   * Refuses to run if any of the three names already exists as something
--     other than the table this migration would create, rather than altering an
--     object it did not author.
--
-- RE-RUNNABLE: a second apply finds all three tables and the function already
-- in their canonical shape and does nothing.
--
-- PG16 and PG17: uses only standard DDL, pg_catalog lookups, and a plpgsql
-- function, all unchanged across both.

begin;

do $$
declare
  offending text;
begin
  -- Refuse if the name is taken by a view, matview, sequence, or foreign table.
  -- relkind is "char", not text, so the concatenation needs an explicit cast.
  -- Without it Postgres reports "operator is not unique" and the migration
  -- fails on apply rather than on review.
  select string_agg(c.relname || ' (' || c.relkind::text || ')', ', ')
    into offending
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'care_tebra_links',
      'care_tebra_sync_cursors',
      'care_tebra_sync_leases'
    )
    and c.relkind <> 'r';

  if offending is not null then
    raise exception
      'care_tebra migration refused: name already taken by a non-table object: %',
      offending;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Mappings. One row per Xenios record that has a counterpart in the practice.
-- ---------------------------------------------------------------------------
create table if not exists public.care_tebra_links (
  entity        text        not null,
  local_id      text        not null,
  external_id   text        not null,
  tebra_id      text        not null,
  linked_at     timestamptz not null,
  last_seen_at  timestamptz not null,
  constraint care_tebra_links_pkey primary key (entity, local_id),
  constraint care_tebra_links_entity_check check (entity in ('patient', 'appointment')),
  -- The external id is derived, so it is unique per entity by construction.
  -- Stating it here means a second row could never point one Xenios record at
  -- two charts, or two records at one chart, even if application code regressed.
  constraint care_tebra_links_external_id_key unique (entity, external_id),
  constraint care_tebra_links_external_id_shape check (
    external_id ~ '^xenios:(care_patient|care_appointment):[A-Za-z0-9][A-Za-z0-9._:-]{0,96}$'
  ),
  constraint care_tebra_links_seen_after_linked check (last_seen_at >= linked_at)
);

-- ---------------------------------------------------------------------------
-- Polling cursors. One row per entity; the window the next pass resumes from.
-- ---------------------------------------------------------------------------
create table if not exists public.care_tebra_sync_cursors (
  entity              text        not null,
  from_modified_at    timestamptz not null,
  to_modified_at      timestamptz not null,
  continuation_token  text,
  updated_at          timestamptz not null default now(),
  constraint care_tebra_sync_cursors_pkey primary key (entity),
  constraint care_tebra_sync_cursors_entity_check check (entity in ('patient', 'appointment')),
  constraint care_tebra_sync_cursors_window check (to_modified_at >= from_modified_at)
);

-- ---------------------------------------------------------------------------
-- The run lease. One row per lease key.
-- ---------------------------------------------------------------------------
create table if not exists public.care_tebra_sync_leases (
  lease_key   text        not null,
  owner       text        not null,
  expires_at  timestamptz not null,
  constraint care_tebra_sync_leases_pkey primary key (lease_key)
);

-- ---------------------------------------------------------------------------
-- Acquiring the lease, atomically.
--
-- This is a function rather than an application-side read then write because
-- those two statements can interleave: both workers read "expired", both write,
-- and both believe they hold it. One INSERT ... ON CONFLICT DO UPDATE ... WHERE
-- resolves under a single row lock, so exactly one caller wins.
--
-- Same-owner re-entry is permitted deliberately: that is how a long run renews
-- its own lease. Separating two triggers is done by giving them distinct owner
-- strings, not by forbidding renewal here.
-- ---------------------------------------------------------------------------
create or replace function public.care_tebra_try_acquire_lease(
  p_lease_key  text,
  p_owner      text,
  p_expires_at timestamptz,
  p_now        timestamptz
) returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with attempt as (
    insert into public.care_tebra_sync_leases as l (lease_key, owner, expires_at)
    values (p_lease_key, p_owner, p_expires_at)
    on conflict (lease_key) do update
      set owner = excluded.owner,
          expires_at = excluded.expires_at
      where l.expires_at <= p_now
         or l.owner = excluded.owner
    returning owner
  )
  select coalesce((select owner from attempt) = p_owner, false);
$$;

comment on function public.care_tebra_try_acquire_lease(text, text, timestamptz, timestamptz) is
  'Atomically acquires or renews a Tebra sync lease. True only when the caller holds it.';

-- ---------------------------------------------------------------------------
-- Service role only. No policy is created, so RLS denies every other role.
-- ---------------------------------------------------------------------------
alter table public.care_tebra_links          enable row level security;
alter table public.care_tebra_sync_cursors   enable row level security;
alter table public.care_tebra_sync_leases    enable row level security;

revoke all on public.care_tebra_links        from anon, authenticated;
revoke all on public.care_tebra_sync_cursors from anon, authenticated;
revoke all on public.care_tebra_sync_leases  from anon, authenticated;
revoke all on function public.care_tebra_try_acquire_lease(text, text, timestamptz, timestamptz)
  from anon, authenticated;

commit;
