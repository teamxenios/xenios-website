-- Forward migration: session lifetime 15 minutes -> 240 minutes.
--
-- The original migration pinned every session to exactly fifteen minutes, both
-- in the exchange function and in a CHECK constraint on the table. The decided
-- Early Access session lifetime is 240 minutes (bounds 15..480), so a
-- deployment running the original schema refuses the mint the application asks
-- for: the cookie would outlive the row, and unlock fails closed on a CORRECT
-- password. This reconciles the two.
--
-- Apply ONLY to a database that already has the fifteen-minute version. A fresh
-- database gets 240 minutes from research-private-early-access-sessions.sql and
-- does not need this file.
--
-- WHAT IS DELIBERATELY NOT CHANGED: the lifetime stays EXACT and stays owned by
-- the database. It is not a parameter, so no caller, and nobody who reaches the
-- function, can mint a longer-lived session than the constraint permits. Making
-- it a function argument would have been the easy change and would have handed
-- session lifetime to the caller.

begin;

-- Existing rows were written under the old constraint and would violate the new
-- one. They are short-lived by definition (fifteen minutes), and a session that
-- outlives its schema is not worth preserving, so they are cleared rather than
-- rewritten: a customer signs in again, and no row is silently relabelled with a
-- lifetime it was never issued under.
--
-- ORDER MATTERS. A consumed grant carries a foreign key to the session it was
-- exchanged for, so deleting sessions first raises
-- research_private_early_access_nonces_exchange_fk and rolls the whole upgrade
-- back. The grants go first; they are five-minute values and outlive nothing.
delete from public.research_private_early_access_nonces;
delete from public.research_private_early_access_sessions;

alter table public.research_private_early_access_sessions
  drop constraint if exists research_private_early_access_sessions_expiry_exact;

alter table public.research_private_early_access_sessions
  add constraint research_private_early_access_sessions_expiry_exact
  check (expires_at = issued_at + interval '240 minutes');

-- The exchange function authors the expiry, so it must agree with the
-- constraint or every mint fails.
do $$
declare
  v_source text;
begin
  select pg_catalog.pg_get_functiondef(p.oid)
    into v_source
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'research_private_early_access_exchange_nonce';

  if v_source is null then
    raise exception 'exchange function is missing; apply the base migration first';
  end if;

  -- strpos, not position(x in y): the latter is syntax rather than a callable
  -- function, so it cannot be schema-qualified and errors here.
  if pg_catalog.strpos(v_source, 'interval ''15 minutes''') = 0 then
    raise notice 'exchange function does not use the 15-minute lifetime; nothing to rewrite';
  else
    execute pg_catalog.replace(
      v_source,
      'v_expiry := v_now + interval ''15 minutes'';',
      'v_expiry := v_now + interval ''240 minutes'';'
    );
  end if;
end
$$;

-- Refuse to commit unless the two now agree, so a partial upgrade cannot ship.
do $$
declare
  v_ok boolean;
begin
  select pg_catalog.strpos(pg_catalog.pg_get_functiondef(p.oid), 'interval ''240 minutes''') > 0
    into v_ok
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'research_private_early_access_exchange_nonce';

  if v_ok is not true then
    raise exception 'exchange function still does not author a 240-minute expiry';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    where t.relname = 'research_private_early_access_sessions'
      and c.conname = 'research_private_early_access_sessions_expiry_exact'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%04:00:00%'
  ) then
    raise exception 'expiry constraint is not the 240-minute form';
  end if;
end
$$;

commit;
