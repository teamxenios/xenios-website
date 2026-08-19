-- Xenios Research Early Access: cart checkouts on the member order history (Lane C).
-- Candidate only. FOUNDER-GATED: apply after review, then register in the
-- canonical migration DAG. Run the sibling precheck first and the sibling
-- postcheck after.
--
-- WHY THIS EXISTS. M67 (20260813120000) made single-product placements
-- readable for the member who owns them, through two read-only security-
-- definer routines. Cart checkouts — the canonical launch order — remained
-- invisible for the identical reason placements once were: the rows exist,
-- the M62 legal binding holds the join, and no statement in the deployment is
-- permitted to ask it. This migration is the cart half of that read, in
-- exactly M67's shape: ONE additional read-only routine behind the same
-- security-definer boundary, EXECUTE for service_role alone, and no table
-- gaining any grant anywhere.
--
-- WHAT THE ROUTINE MAY AND MAY NOT DO.
--
--   * `stable`: it cannot insert, update or delete. Nothing here places an
--     order, moves a payment state, or settles anything.
--   * It returns the SAME `record` column the cart checkout routines already
--     return, so two reads cannot disagree about what a checkout is, PLUS the
--     row facts the application's history rule needs: the payment state, the
--     placement instant, the disposition, and — new to this routine — the
--     PROVENANCE of the M62 legal binding standing behind the checkout's
--     customer handle (`established_by`: verified_link or admin_attested).
--     A handle with no legal binding reports null provenance, and the
--     application excludes it, because a missing answer must never read as a
--     verified one.
--
-- WHAT IT DELIBERATELY DOES NOT DECIDE. Nothing about what may be SHOWN. The
-- routine reports rows for the handles it was given; the application re-checks
-- ownership against the same handle set, drops superseded and weakly bound
-- rows, and refuses to render money it cannot prove. The rule lives in
-- server/research/early-access/orders/cart-order-history.ts with its own
-- tests; this file stays a reader.
--
-- ROLLBACK. Dropping the routine restores the previous behaviour exactly:
-- cart checkouts vanish from member history, nothing else changes, no data is
-- touched.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight. The exact relations and columns this routine reads.
-- ---------------------------------------------------------------------------

do $lane_c_history_preflight$
begin
  if to_regclass('public.research_early_access_cart_checkouts') is null then
    raise exception
      'Lane C history requires public.research_early_access_cart_checkouts'
      using errcode = '55000';
  end if;
  if not exists (
    select 1
    from pg_attribute att
    join pg_class rel on rel.oid = att.attrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'research_early_access_cart_checkouts'
      and att.attname in ('checkout_number', 'customer_ref', 'payment_state',
                          'placed_at', 'record', 'disposition')
      and att.attnum > 0
      and not att.attisdropped
    group by rel.oid
    having count(*) = 6
  ) then
    raise exception
      'Lane C history requires cart_checkouts(checkout_number, customer_ref, payment_state, placed_at, record, disposition)'
      using errcode = '55000';
  end if;
  if to_regclass('public.research_early_access_legal_bindings') is null then
    raise exception
      'Lane C history requires the M62 legal bindings table'
      using errcode = '55000';
  end if;
end;
$lane_c_history_preflight$;

-- ---------------------------------------------------------------------------
-- The read. Deterministic: oldest first, checkout number breaking ties. An
-- empty or null handle array returns an empty list rather than every order,
-- which is the one failure mode this routine must not have.
-- ---------------------------------------------------------------------------

create or replace function public.research_early_access_cart_checkouts_for_customers(
  p_customer_refs text[]
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'checkoutNumber', c.checkout_number,
        'customerRef', c.customer_ref,
        'paymentState', c.payment_state,
        'placedAt', c.placed_at,
        'disposition', c.disposition,
        'bindingProvenance', b.established_by,
        'record', c.record
      )
      order by c.placed_at, c.checkout_number
    ),
    '[]'::jsonb
  )
  from public.research_early_access_cart_checkouts c
  left join lateral (
    -- The M62 binding standing behind this checkout's handle, primary or
    -- alias. Deterministic when more than one row could match: the most
    -- recently verified binding speaks.
    select lb.established_by
    from public.research_early_access_legal_bindings lb
    where lb.customer_ref = c.customer_ref
       or c.customer_ref = any(lb.alias_refs)
    order by lb.verified_at desc, lb.customer_ref
    limit 1
  ) b on true
  where coalesce(cardinality(p_customer_refs), 0) > 0
    and c.customer_ref = any(p_customer_refs)
$$;

comment on function public.research_early_access_cart_checkouts_for_customers(text[]) is
  'Read-only: the cart checkouts recorded against the given Early Access customer handles, oldest first, each with the provenance of the M62 legal binding behind its handle (null when none). An empty handle list returns an empty result, never every order. Decides nothing about display; the application owns that rule.';

-- ---------------------------------------------------------------------------
-- Privileges. Nothing for the public roles, EXECUTE for service_role, no
-- table grant anywhere.
-- ---------------------------------------------------------------------------

revoke all on function public.research_early_access_cart_checkouts_for_customers(text[])
  from public, anon, authenticated;
grant execute on function public.research_early_access_cart_checkouts_for_customers(text[])
  to service_role;

-- ---------------------------------------------------------------------------
-- Post-condition.
-- ---------------------------------------------------------------------------

do $lane_c_history_postcondition$
declare
  v_oid oid;
  v_provolatile "char";
  v_prosecdef boolean;
  v_role text;
begin
  select p.oid, p.provolatile, p.prosecdef
  into v_oid, v_provolatile, v_prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'research_early_access_cart_checkouts_for_customers'
    and p.pronargs = 1
    and p.proargtypes[0] = 'pg_catalog.text[]'::regtype;

  if v_oid is null then
    raise exception 'Lane C post-condition: the cart history routine was not created'
      using errcode = '55000';
  end if;
  if v_provolatile <> 's' then
    raise exception 'Lane C post-condition: the cart history routine must be STABLE, found %',
      v_provolatile using errcode = '55000';
  end if;
  if not v_prosecdef then
    raise exception 'Lane C post-condition: the cart history routine must be SECURITY DEFINER'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from pg_proc p, aclexplode(p.proacl) acl
    where p.oid = v_oid and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'Lane C post-condition: PUBLIC may execute the cart history routine'
      using errcode = '55000';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role)
       and has_function_privilege(v_role, v_oid, 'EXECUTE') then
      raise exception 'Lane C post-condition: % may execute the cart history routine', v_role
        using errcode = '55000';
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role')
     and not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'Lane C post-condition: service_role cannot execute the cart history routine'
      using errcode = '55000';
  end if;
end;
$lane_c_history_postcondition$;

commit;
