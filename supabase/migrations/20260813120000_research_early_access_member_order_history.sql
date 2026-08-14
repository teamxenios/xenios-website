-- Xenios Research Early Access member order history (M67).
--
-- WHY THIS MIGRATION EXISTS.
--
-- A signed-in member cannot see their own Early Access orders. Not because the
-- record is missing, and not because the join is missing, but because no
-- statement in this deployment is permitted to ask either question.
--
-- Two reads are needed, and neither exists:
--
--   1. memberId    -> the customer handles that member is bound to
--   2. handles     -> the placements recorded against them
--
-- For (1), M62 stores exactly the right row. public.research_early_access_legal_bindings
-- carries (member_id, customer_ref) and even indexes it member-id-first, in
-- research_ea_legal_binding_member_customer_uidx. But M62 also runs
--
--   revoke all on <every M62 table> from public, anon, authenticated, service_role
--
-- with forced row level security, and of the thirteen routines it grants, the
-- only bindings reader is research_early_access_legal_binding_for_customer(text),
-- which is keyed by a SINGLE handle and answers the FORWARD direction. Nothing
-- anywhere enumerates a member's handles. The index was built for a query no
-- role was allowed to issue.
--
-- For (2), the commerce persistence migration does the same thing to its own
-- tables: public.research_early_access_placements is revoked from service_role
-- as well, and every read of it goes through a routine. Those routines find a
-- placement by order number or by idempotency key, or list the ones awaiting
-- review. None of them finds a customer's own orders.
--
-- The consequence, before this migration: a customer who still held their order
-- number could read that one order, and a customer who did not could prove
-- exactly who they were and be shown nothing they had bought. Order history was
-- library code no production composition could drive.
--
-- NEITHER BOUNDARY IS WIDENED TO FIX THAT. No table gains a SELECT grant. This
-- migration adds TWO read-only routines behind the same security-definer
-- boundary every other Early Access read already uses, and grants EXECUTE on
-- them to service_role alone. That is the shape M64 took, for the same reason,
-- when the shipping SLA monitor needed a list read M62 had revoked.
--
-- WHAT THE ROUTINES MAY AND MAY NOT DO.
--
--   * Both are `stable`: they cannot insert, update or delete. Nothing here
--     creates a binding, places an order, moves a payment state, settles
--     anything, or records an event.
--   * The bindings routine returns HANDLES AND NOTHING ELSE. Not the member id
--     it was given back again, not provenance, not the attestor, not the
--     verification time. A caller that wants provenance already has the
--     forward routine for it, and this one exists to answer identity, not to
--     become a second description of a binding.
--   * The placements routine returns the SAME `record` column the existing
--     single-order routine returns, so the two cannot disagree about what an
--     order is. It adds no field and removes none; the application's own
--     customer projection decides what a customer actually sees, and it
--     deliberately drops supplier and attribution.
--
-- WHAT THEY DELIBERATELY DO NOT DECIDE.
--
-- Neither routine decides what may be SHOWN. The bindings routine says which
-- handles are this member's. The placements routine says which orders carry
-- the handles it was given. The application re-checks ownership against the
-- same handle set afterwards, and separately excludes weakly bound orders, so
-- a widened routine could not by itself widen what a member sees. Ownership
-- rules stated in two languages drift, and only one of them can be changed at
-- a time; the rule lives in the application, and this file stays a reader.
--
-- ON `bindingProvenance`. The placements routine does NOT filter it. The
-- exclusion of email-entry orders from a durable history is an application
-- rule with its own tests, and encoding it here as well would put one rule in
-- two places. The routine reports; the application decides.
--
-- ROLLBACK. Dropping both routines restores the previous behaviour exactly:
-- member order history stops answering, every other Early Access read is
-- unaffected, and no data is lost, because nothing here writes anything.

begin;

-- ---------------------------------------------------------------------------
-- Preflight. Fail closed on a database that is not the accepted schema, rather
-- than creating a routine over tables that are absent or shaped differently.
-- ---------------------------------------------------------------------------

do $m67_preflight$
declare
  v_table text;
begin
  foreach v_table in array array[
    'research_early_access_legal_bindings',
    'research_early_access_placements'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception
        'M67 requires the accepted Early Access schema; public.% is absent', v_table
        using errcode = '55000';
    end if;
  end loop;

  -- The exact columns each routine reads. Checked by name so a table that
  -- exists under a different shape cannot silently produce a routine that
  -- compiles and then answers nothing.
  if not exists (
    select 1
    from pg_attribute att
    join pg_class rel on rel.oid = att.attrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'research_early_access_legal_bindings'
      and att.attname in ('member_id', 'customer_ref', 'alias_refs')
      and att.attnum > 0
      and not att.attisdropped
    group by rel.oid
    having count(*) = 3
  ) then
    raise exception
      'M67 requires public.research_early_access_legal_bindings(member_id, customer_ref, alias_refs) from M62'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_attribute att
    join pg_class rel on rel.oid = att.attrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'research_early_access_placements'
      and att.attname in ('customer_ref', 'order_number', 'placed_at', 'record')
      and att.attnum > 0
      and not att.attisdropped
    group by rel.oid
    having count(*) = 4
  ) then
    raise exception
      'M67 requires public.research_early_access_placements(customer_ref, order_number, placed_at, record)'
      using errcode = '55000';
  end if;
end;
$m67_preflight$;

-- ---------------------------------------------------------------------------
-- Read one: the handles a member is bound to.
--
-- Returns the primary handle AND the alias handles, because the forward
-- routine already treats an alias as one of this customer's handles
-- (`customer_ref = p or p = any(alias_refs)`), and an order placed under an
-- alias is just as much theirs. Returning only the primary would silently drop
-- part of a history, which is the failure that is hardest to notice.
--
-- A member with no binding yields an empty array, never null and never a
-- broader answer.
-- ---------------------------------------------------------------------------

create or replace function public.research_early_access_legal_bindings_for_member(
  p_member_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(handle order by handle), '[]'::jsonb)
  from (
    select distinct handle
    from public.research_early_access_legal_bindings b
    cross join lateral (
      select b.customer_ref as handle
      union
      select unnest(b.alias_refs)
    ) as handles
    where b.member_id = p_member_id
  ) as distinct_handles
$$;

comment on function public.research_early_access_legal_bindings_for_member(uuid) is
  'Read-only: every Early Access customer handle a member is durably bound to, primary and aliases, sorted and de-duplicated. Writes nothing, decides no ownership, and returns no provenance, attestor, timestamp or member fact.';

-- ---------------------------------------------------------------------------
-- Read two: the placements recorded against a set of handles.
--
-- Deterministic: oldest first, order number breaking ties, so two reads over
-- an unchanged database return byte-identical lists. An empty or null handle
-- array returns an empty list rather than every order, which is the one
-- failure mode this routine must not have.
-- ---------------------------------------------------------------------------

create or replace function public.research_early_access_placements_for_customers(
  p_customer_refs text[]
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    jsonb_agg(p.record order by p.placed_at, p.order_number),
    '[]'::jsonb
  )
  from public.research_early_access_placements p
  where coalesce(cardinality(p_customer_refs), 0) > 0
    and p.customer_ref = any(p_customer_refs)
$$;

comment on function public.research_early_access_placements_for_customers(text[]) is
  'Read-only: the placements recorded against the given Early Access customer handles, oldest first. Returns the same durable record the single-order routine returns; an empty handle list returns an empty result, never every order.';

-- ---------------------------------------------------------------------------
-- Privileges. The same shape as every other Early Access routine: nothing for
-- the public roles, EXECUTE for service_role, and NO table grant anywhere.
-- ---------------------------------------------------------------------------

revoke all on function public.research_early_access_legal_bindings_for_member(uuid)
  from public, anon, authenticated;
grant execute on function public.research_early_access_legal_bindings_for_member(uuid)
  to service_role;

revoke all on function public.research_early_access_placements_for_customers(text[])
  from public, anon, authenticated;
grant execute on function public.research_early_access_placements_for_customers(text[])
  to service_role;

-- ---------------------------------------------------------------------------
-- Post-condition. The migration proves its own effect and its own boundary
-- before committing.
-- ---------------------------------------------------------------------------

do $m67_postcondition$
declare
  v_oid oid;
  v_provolatile "char";
  v_prosecdef boolean;
  v_role text;
  v_table text;
  -- Two PARALLEL 1-D arrays rather than one 2-D array.
  --
  -- A 2-D array here is a trap: slicing one row out of it stays two
  -- dimensional, so the first subscript reads NULL rather than the routine
  -- name, every lookup matches nothing, and the post-condition raises "was not
  -- created" about a routine that was in fact created perfectly well. The
  -- failure looks like a broken migration rather than a broken assertion,
  -- which is the worst way for a check to be wrong: it sends the reader
  -- hunting the routines instead of the check. Caught in rehearsal on
  -- PostgreSQL 16.
  v_names text[] := array[
    'research_early_access_legal_bindings_for_member',
    'research_early_access_placements_for_customers'
  ];
  v_argtypes text[] := array['pg_catalog.uuid', 'pg_catalog.text[]'];
  v_name text;
  v_index integer;
begin
  for v_index in 1 .. array_length(v_names, 1) loop
    v_name := v_names[v_index];

    select p.oid, p.provolatile, p.prosecdef
    into v_oid, v_provolatile, v_prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_name
      -- Matched on the argument TYPE, not on the rendered signature:
      -- pg_get_function_identity_arguments includes the parameter NAME, so a
      -- string comparison would silently miss.
      and p.pronargs = 1
      and p.proargtypes[0] = v_argtypes[v_index]::regtype;

    if v_oid is null then
      raise exception 'M67 post-condition: % was not created', v_name
        using errcode = '55000';
    end if;
    if v_provolatile <> 's' then
      raise exception 'M67 post-condition: % must be STABLE, found volatility %',
        v_name, v_provolatile using errcode = '55000';
    end if;
    if not v_prosecdef then
      raise exception 'M67 post-condition: % must be SECURITY DEFINER', v_name
        using errcode = '55000';
    end if;

    -- PUBLIC is a pseudo-role and has no pg_roles entry, so it is read straight
    -- off the ACL (grantee 0) rather than through has_function_privilege.
    if exists (
      select 1
      from pg_proc p, aclexplode(p.proacl) acl
      where p.oid = v_oid
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'M67 post-condition: PUBLIC may execute %', v_name
        using errcode = '55000';
    end if;

    foreach v_role in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = v_role)
         and has_function_privilege(v_role, v_oid, 'EXECUTE') then
        raise exception 'M67 post-condition: % may execute %', v_role, v_name
          using errcode = '55000';
      end if;
    end loop;

    if exists (select 1 from pg_roles where rolname = 'service_role')
       and not has_function_privilege('service_role', v_oid, 'EXECUTE') then
      raise exception 'M67 post-condition: service_role cannot execute %', v_name
        using errcode = '55000';
    end if;
  end loop;

  -- THE BOUNDARY M67 MUST NOT MOVE. If either table became directly readable,
  -- the routines would no longer be the only way in and this migration would
  -- have widened exactly what it exists to avoid widening.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach v_table in array array[
      'research_early_access_legal_bindings',
      'research_early_access_placements'
    ] loop
      if has_table_privilege('service_role', 'public.' || v_table, 'SELECT') then
        raise exception
          'M67 post-condition: service_role has direct SELECT on public.%, the revoke boundary is broken',
          v_table using errcode = '55000';
      end if;
    end loop;
  end if;
end;
$m67_postcondition$;

commit;
