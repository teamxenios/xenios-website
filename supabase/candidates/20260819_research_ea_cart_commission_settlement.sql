-- Xenios Research Early Access: cart commission hold, atomic with settlement (Lane C).
-- Candidate only. FOUNDER-GATED: apply after review, then register in the
-- canonical migration DAG. Run the sibling precheck first and the sibling
-- postcheck after; both must report APPLY_READY / APPLIED_OK.
--
-- WHY THIS EXISTS. The cart settlement RPC (M60 core wrapped by the M62
-- hardened door) writes the settlement, the receipt, every child release, the
-- canonical transaction identity and the hardening row in one transaction —
-- and no commission of any kind, because the cart lane had no attribution when
-- it was built. Attribution now exists on the checkout record, and a
-- commission written OUTSIDE the settlement transaction could half-write:
-- money settled with the affiliate's hold lost, or a hold recorded against a
-- settlement that rolled back. This migration adds the one missing shape: a
-- cart-scoped commission event table and ONE new service RPC that calls the
-- EXISTING hardened settlement function and appends the commission event in
-- the same transaction. Both durable or neither.
--
-- WHY A NEW TABLE. public.research_early_access_commission_events (the
-- single-product ledger) foreign-keys order_number to
-- research_early_access_placements, and a cart checkout is not a placement.
-- Bending that FK would weaken the single lane's integrity to save one table.
-- The cart ledger carries the same vocabulary (state 'held' and nothing else:
-- there is NO payout state in this schema, structurally) and keys uniquely on
-- the checkout, the settlement AND the accrual id, so one checkout can never
-- accrue twice through any door.
--
-- WHAT THIS DELIBERATELY DOES NOT DO. It does not modify the deployed
-- settlement function, the M60 core, or any existing table. It does not grant
-- any table privilege. It creates no payout path. Dropping the function and
-- the table restores the previous behaviour exactly.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight. Fail closed on a database that is not the accepted schema.
-- ---------------------------------------------------------------------------

do $lane_c_commission_preflight$
declare
  v_table text;
begin
  foreach v_table in array array[
    'research_early_access_cart_checkouts',
    'research_early_access_cart_settlements'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception
        'Lane C commission requires the accepted cart schema; public.% is absent', v_table
        using errcode = '55000';
    end if;
  end loop;

  if to_regprocedure(
    'public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,boolean,boolean,timestamptz)'
  ) is null then
    raise exception
      'Lane C commission requires the M62 hardened settlement RPC; it is absent'
      using errcode = '55000';
  end if;
end;
$lane_c_commission_preflight$;

-- ---------------------------------------------------------------------------
-- The cart commission ledger. Append-only; one held event per checkout, ever.
-- ---------------------------------------------------------------------------

create table if not exists public.research_early_access_cart_commission_events (
  accrual_id text primary key
    check (accrual_id ~ '^early-access-commission-accrual:XEC-[A-Z0-9]{16,40}$'),
  cart_checkout_id uuid not null unique
    references public.research_early_access_cart_checkouts(id) on delete restrict,
  cart_settlement_id uuid not null unique
    references public.research_early_access_cart_settlements(id) on delete restrict,
  checkout_number text not null unique check (checkout_number ~ '^XEC-[A-Z0-9]{16,40}$'),
  affiliate_id text not null check (length(btrim(affiliate_id)) between 3 and 128),
  referral_code text not null check (length(btrim(referral_code)) between 3 and 64),
  state text not null
    constraint research_ea_cart_commission_state_vocabulary check (state in ('held')),
  hold_amount_cents bigint not null
    constraint research_ea_cart_commission_amount_positive check (hold_amount_cents >= 1),
  currency text not null
    constraint research_ea_cart_commission_currency check (currency = 'USD'),
  held_at timestamptz not null,
  -- The full server-side accrual: policy id and version, basis, rate, both
  -- affiliate handles, verification key. Never served to an affiliate surface.
  record jsonb not null check (jsonb_typeof(record) = 'object')
);

comment on table public.research_early_access_cart_commission_events is
  'Early Access CART commission holds, written only inside the settlement transaction. State vocabulary is held and nothing else: no payout state exists in this schema.';

create or replace function public.research_early_access_cart_commission_append_only()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  raise exception 'commission ledger %.% is append-only', tg_table_schema, tg_table_name
    using errcode = '55000';
end;
$$;

drop trigger if exists research_early_access_cart_commission_events_append_only
  on public.research_early_access_cart_commission_events;
create trigger research_early_access_cart_commission_events_append_only
  before update or delete on public.research_early_access_cart_commission_events
  for each row execute function public.research_early_access_cart_commission_append_only();

-- ---------------------------------------------------------------------------
-- The atomic door. Wraps the EXISTING hardened settlement RPC; adds only the
-- commission insert, in the same transaction.
-- ---------------------------------------------------------------------------

create or replace function public.research_early_access_commit_cart_settlement_with_commission(
  p_checkout_number text,
  p_external_transaction_id text,
  p_evidence_ref text,
  p_verified_amount_cents bigint,
  p_verified_currency text,
  p_actor_id text,
  p_confirmed_funds_received boolean,
  p_confirmed_amount_and_reference boolean,
  p_at timestamptz,
  p_commission jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_result jsonb;
  v_checkout public.research_early_access_cart_checkouts%rowtype;
  v_settlement public.research_early_access_cart_settlements%rowtype;
  v_held_at timestamptz;
begin
  -- THE COMMISSION IS VALIDATED BEFORE ANYTHING SETTLES. A malformed accrual
  -- refuses the whole call with nothing written; settling first and refusing
  -- after would be exactly the half-write this function exists to prevent.
  if p_commission is null
     or jsonb_typeof(p_commission) <> 'object'
     or (p_commission->>'accrualId') is distinct from
        ('early-access-commission-accrual:' || p_checkout_number)
     or (p_commission->>'orderReference') is distinct from p_checkout_number
     or coalesce(p_commission->>'basis','') <> 'subtotal_less_discount'
     or coalesce(p_commission->>'currency','') <> 'USD'
     or (p_commission->>'payout') is distinct from 'false'
     or coalesce(p_commission->>'commissionAmountCents','') !~ '^[0-9]{1,15}$'
     or coalesce(p_commission->>'commissionBasisCents','') !~ '^[0-9]{1,15}$'
     or (p_commission->>'commissionAmountCents')::bigint < 1
     or (p_commission->>'commissionAmountCents')::bigint
        > (p_commission->>'commissionBasisCents')::bigint
     or length(btrim(coalesce(p_commission->>'affiliateId',''))) not between 3 and 128
     or length(btrim(coalesce(p_commission->>'referralCode',''))) not between 3 and 64
  then
    return jsonb_build_object('committed',false,'reason','commission_invalid','settlement',null);
  end if;

  -- The sole hardened settlement door, unchanged, in THIS transaction. Every
  -- refusal it makes (already_settled, canonical duplicate, agreements,
  -- submission standing, amount) passes through verbatim with nothing written.
  v_result := public.research_early_access_commit_cart_settlement(
    p_checkout_number, p_external_transaction_id, p_evidence_ref,
    p_verified_amount_cents, p_verified_currency, p_actor_id,
    p_confirmed_funds_received, p_confirmed_amount_and_reference, p_at
  );
  if coalesce((v_result->>'committed')::boolean, false) is not true then
    return v_result;
  end if;

  select * into strict v_checkout from public.research_early_access_cart_checkouts
   where checkout_number = p_checkout_number;
  select * into strict v_settlement from public.research_early_access_cart_settlements
   where cart_checkout_id = v_checkout.id;

  -- Money time is database authority: the hold is held at the same instant
  -- the hardened door verified the payment.
  v_held_at := coalesce(
    nullif(v_result#>>'{settlement,paymentVerifiedAt}', '')::timestamptz,
    pg_catalog.clock_timestamp()
  );

  -- A plain insert, deliberately not ON CONFLICT: a genuine first settlement
  -- (the only path that reaches here) has no event yet, and if some future
  -- defect ever disagreed, aborting the WHOLE transaction — settlement
  -- included — is the correct outcome. Atomic-or-not-at-all.
  insert into public.research_early_access_cart_commission_events(
    accrual_id, cart_checkout_id, cart_settlement_id, checkout_number,
    affiliate_id, referral_code, state, hold_amount_cents, currency, held_at, record
  ) values (
    p_commission->>'accrualId', v_checkout.id, v_settlement.id, p_checkout_number,
    btrim(p_commission->>'affiliateId'), btrim(p_commission->>'referralCode'), 'held',
    (p_commission->>'commissionAmountCents')::bigint, 'USD', v_held_at, p_commission
  );

  return jsonb_set(
    v_result,
    '{commission}',
    jsonb_build_object('recorded', true, 'accrualId', p_commission->>'accrualId'),
    true
  );
end;
$$;

comment on function public.research_early_access_commit_cart_settlement_with_commission(
  text,text,text,bigint,text,text,boolean,boolean,timestamptz,jsonb
) is
  'Lane C: the M62 hardened cart settlement plus the commission hold, in one transaction. Both durable or neither; a malformed commission refuses before anything settles.';

-- ---------------------------------------------------------------------------
-- Boundary: forced RLS, zero table privileges, service_role executes the RPC.
-- ---------------------------------------------------------------------------

alter table public.research_early_access_cart_commission_events enable row level security;
alter table public.research_early_access_cart_commission_events force row level security;
revoke all on public.research_early_access_cart_commission_events
  from public, anon, authenticated, service_role;

revoke all on function public.research_early_access_cart_commission_append_only()
  from public, anon, authenticated, service_role;
revoke all on function public.research_early_access_commit_cart_settlement_with_commission(
  text,text,text,bigint,text,text,boolean,boolean,timestamptz,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.research_early_access_commit_cart_settlement_with_commission(
  text,text,text,bigint,text,text,boolean,boolean,timestamptz,jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- Post-condition. The migration proves its own boundary before committing.
-- ---------------------------------------------------------------------------

do $lane_c_commission_postcondition$
declare
  v_oid oid;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'research_early_access_commit_cart_settlement_with_commission'
    and p.pronargs = 10;
  if v_oid is null then
    raise exception 'Lane C post-condition: the atomic commission door was not created'
      using errcode = '55000';
  end if;
  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'Lane C post-condition: the atomic commission door must be SECURITY DEFINER'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from pg_proc p, aclexplode(p.proacl) acl
    where p.oid = v_oid and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'Lane C post-condition: PUBLIC may execute the atomic commission door'
      using errcode = '55000';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role')
     and not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'Lane C post-condition: service_role cannot execute the atomic commission door'
      using errcode = '55000';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role')
     and has_table_privilege(
       'service_role', 'public.research_early_access_cart_commission_events', 'SELECT'
     ) then
    raise exception
      'Lane C post-condition: service_role has direct SELECT on the commission ledger; the routine boundary is broken'
      using errcode = '55000';
  end if;
end;
$lane_c_commission_postcondition$;

commit;
