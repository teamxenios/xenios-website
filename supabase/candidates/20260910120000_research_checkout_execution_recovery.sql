-- CANDIDATE MIGRATION (not applied; not part of any release until named in an
-- exact-SHA request and rehearsed on an authorized project).
--
-- A DISTINCT candidate. It does NOT touch 20260909150000_research_checkout_executions,
-- which is frozen for its own rehearsal and whose authorization explicitly
-- excludes additional migrations. This one must be reviewed and approved on its
-- own terms, after that one is installed.
--
-- It adds exactly ONE read: discovery for the bounded recovery sweep
-- (server/research/commerce/checkout-recovery-sweep.ts). Until this exists,
-- nothing can find a checkout execution that stopped and was never returned to,
-- so an order stays pending, its inventory holds stay held, and an
-- authorization can stand at the provider until it expires.
--
-- It creates no table, changes no row, and grants nothing new beyond EXECUTE on
-- the one function to service_role. It is STABLE and takes no lock beyond the
-- read. The sweep's decisions and every write it causes go through the existing
-- transition functions, so all money rules already reviewed there still apply
-- unchanged; this cannot introduce a new one.

create or replace function public.research_checkout_executions_list_recoverable(
  p_before timestamptz,
  p_limit integer default 25
) returns setof public.research_checkout_executions
language sql
stable
as $$
  select *
    from public.research_checkout_executions
   where updated_at < p_before
     -- Terminal work is never returned. `cancelled` IS returned while its local
     -- settlement has not completed, because that is the case where an order is
     -- still pending and holds are still held after the provider released.
     and (
       phase in ('reserved','authorizing','action_required','authorized','capturing',
                 'captured','cancelling','reconciliation_required')
       or (phase = 'cancelled' and settled_at is null)
     )
   -- Oldest first, so a backlog drains in the order it accumulated and no row
   -- can be starved by newer ones.
   order by updated_at asc
   -- Bounded here as well as in the caller: a sweep can never ask the database
   -- for an unbounded scan, whatever it passes.
   limit greatest(1, least(coalesce(p_limit, 25), 200));
$$;

revoke all on function public.research_checkout_executions_list_recoverable(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.research_checkout_executions_list_recoverable(timestamptz, integer)
  to service_role;

-- The sweep's discovery order is (updated_at) over a phase subset. Without this
-- the read is a sequential scan that grows with every completed order, which is
-- the shape that turns a small recurring job into a production incident.
create index if not exists research_checkout_executions_recoverable_idx
  on public.research_checkout_executions (updated_at)
  where phase <> 'committed';
