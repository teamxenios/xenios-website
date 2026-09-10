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
  p_limit integer default 25,
  -- The cursor. Without it a pass reads the same oldest batch every time, so a
  -- handful of escalated rows at the head of the queue hide everything behind
  -- them. Both parts are required together; half a cursor RAISES.
  p_after_updated_at timestamptz default null,
  p_after_id uuid default null
) returns setof public.research_checkout_executions
-- plpgsql rather than sql, for the cursor guard below: pure SQL cannot raise.
-- The trade-off is that this can no longer be inlined into a calling query.
-- That costs nothing here, because every caller does `select * from fn(...)`
-- and nothing else, and the body's own plan still uses the partial index. If a
-- plan on real data ever says otherwise, the guard is what to reconsider, not
-- the ordering or the bound.
language plpgsql
stable
as $$
begin
  -- Half a cursor is a corrupt checkpoint, not "start again". Ignoring it
  -- silently returns page one for ever: the caller advances its own position,
  -- asks for the next page, and is handed page one again.
  if (p_after_updated_at is null) <> (p_after_id is null) then
    raise exception 'research_checkout_executions_list_recoverable: the page cursor is incomplete; supply both p_after_updated_at and p_after_id, or neither';
  end if;
  return query
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
     -- Strictly after the caller's position, in the same total order the index
     -- and the in-memory reference use. Row-value comparison so equal
     -- timestamps still page deterministically.
     and (
       p_after_updated_at is null
       or (updated_at, id) > (p_after_updated_at, p_after_id)
     )
   -- Oldest first, then by id, so the order is total: a backlog drains in the
   -- order it accumulated and no row can be starved by newer ones.
   order by updated_at asc, id asc
   -- Bounded here as well as in the caller: a sweep can never ask the database
   -- for an unbounded scan, whatever it passes.
   limit greatest(1, least(coalesce(p_limit, 25), 200));
end;
$$;

revoke all on function public.research_checkout_executions_list_recoverable(timestamptz, integer, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.research_checkout_executions_list_recoverable(timestamptz, integer, timestamptz, uuid)
  to service_role;

-- The sweep's discovery order is (updated_at) over a phase subset. Without this
-- the read is a sequential scan that grows with every completed order, which is
-- the shape that turns a small recurring job into a production incident.
-- (updated_at, id) matches the ORDER BY and the cursor comparison exactly, so
-- paging stays an index scan rather than a sort over a growing table.
-- The predicate matches the function's own filter EXACTLY. An index that only
-- excluded `committed` would still carry every settled cancellation for ever,
-- and a fresh cycle starts with no cursor and scans from the head, so its first
-- page would read and discard the whole history of abandoned checkouts. Scan
-- cost must track the live backlog, not lifetime volume.
create index if not exists research_checkout_executions_recoverable_idx
  on public.research_checkout_executions (updated_at, id)
  where phase <> 'committed' and (phase <> 'cancelled' or settled_at is null);
