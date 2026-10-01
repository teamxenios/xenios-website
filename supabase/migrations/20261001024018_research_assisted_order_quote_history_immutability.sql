-- Source-only HIST-PROG / SQL-06 successor; predecessor 20260930234614.
-- No managed apply, historical verification backfill, legacy disposition,
-- repricing, refund, no-funds resolution, provider activation or notification.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if pg_catalog.to_regprocedure('public.research_assisted_order_financial_state(uuid)') is null
     or pg_catalog.to_regprocedure('public.research_assisted_order_provider_payment_hold_guard()') is null
     or not exists (select 1 from pg_catalog.pg_trigger
       where tgrelid = 'public.research_assisted_order_payment_observations'::regclass
         and tgname = 'hl12_provider_observation_hold' and tgenabled <> 'D')
     or not exists (select 1 from pg_catalog.pg_trigger
       where tgrelid = 'public.research_assisted_order_payment_verifications'::regclass
         and tgname = 'hl12_provider_verification_hold' and tgenabled <> 'D') then
    raise exception 'History and quote guard requires the provider-hold predecessor'
      using errcode = '55000', detail = 'ASSISTED_ORDER_HISTORY_GUARD_PREDECESSOR_REQUIRED';
  end if;
  -- Existing historical rows are preserved and held, never silently repaired.
  if exists (select 1 from public.research_assisted_order_payment_verifications where method = 'provider') then
    raise exception 'Existing provider verifications require explicit reconciliation'
      using errcode = '55000', detail = 'ASSISTED_ORDER_PROVIDER_VERIFICATIONS_RECONCILIATION_REQUIRED';
  end if;
end
$preflight$;

-- This guard is additive: the original paid, observed-cancellation and provider
-- holds remain installed. A later status is not proof that payment was real.
create or replace function public.research_assisted_order_history_progression_guard()
returns trigger language plpgsql set search_path = '' as $guard$
begin
  if new.status is distinct from old.status
     and (old.status in ('paid', 'supplier_processing', 'shipped', 'delivered', 'closed')
       or exists (select 1 from public.research_assisted_order_events
         where request_id = old.id and status = 'paid'))
     and coalesce((public.research_assisted_order_financial_state(old.id)
       ->> 'paymentVerified')::boolean, false) is not true then
    raise exception 'Historical payment requires actual verified financial evidence before progression'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_HISTORICAL_PAID_UNRESOLVED';
  end if;
  return new;
end
$guard$;
revoke all on function public.research_assisted_order_history_progression_guard()
  from public, anon, authenticated, service_role;
drop trigger if exists hl12_history_progression on public.research_assisted_order_requests;
create trigger hl12_history_progression before update of status on public.research_assisted_order_requests
for each row execute function public.research_assisted_order_history_progression_guard();

-- Quote versions are snapshots, not editable price records. Repricing issues
-- a new version via quote_issue; this does not add accepted-quote withdrawal.
create or replace function public.research_assisted_order_quote_snapshot_guard()
returns trigger language plpgsql set search_path = '' as $guard$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'Quote snapshots cannot be deleted or truncated'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_IMMUTABLE';
  end if;
  if to_jsonb(new) is not distinct from to_jsonb(old) then return new; end if;
  if old.state <> 'issued'
     or new.state not in ('accepted', 'superseded')
     or (to_jsonb(new) - array['state','accepted_at','acceptance_id'])
       is distinct from (to_jsonb(old) - array['state','accepted_at','acceptance_id'])
     or (new.state = 'superseded' and (new.accepted_at is not null or new.acceptance_id is not null))
     or (new.state = 'accepted' and (new.accepted_at is null or new.acceptance_id is null)) then
    raise exception 'Quote economics, identity and line snapshots are immutable'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_IMMUTABLE';
  end if;
  -- Canonical RPCs acquire the request lock before updating the quote. This
  -- backstop also refuses a stale predecessor accepting a terminal request.
  if new.state = 'accepted' and (
    not exists (select 1 from public.research_assisted_order_requests
      where id = new.request_id and status in (
        'reviewing', 'waiting_on_customer', 'identity_received',
        'agreements_pending', 'agreements_complete', 'payment_pending', 'payment_review'
      ))
    or exists (select 1 from public.research_assisted_order_events
      where request_id = new.request_id and status = 'paid')
  ) then
    raise exception 'The request is not open for quote acceptance'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_ACCEPTANCE_CLOSED';
  end if;
  return new;
end
$guard$;
revoke all on function public.research_assisted_order_quote_snapshot_guard()
  from public, anon, authenticated, service_role;
drop trigger if exists hl12_quote_snapshot_immutable on public.research_assisted_order_quotes;
create trigger hl12_quote_snapshot_immutable before update or delete on public.research_assisted_order_quotes
for each row execute function public.research_assisted_order_quote_snapshot_guard();
drop trigger if exists hl12_quote_snapshot_no_truncate on public.research_assisted_order_quotes;
create trigger hl12_quote_snapshot_no_truncate before truncate on public.research_assisted_order_quotes
for each statement execute function public.research_assisted_order_quote_snapshot_guard();

create or replace function public.research_assisted_order_quote_accept(
  p_quote_id uuid,
  p_version integer,
  p_expected_total_cents bigint,
  p_member_id uuid default null,
  p_early_access_session_hash text default null,
  p_status_token_hash text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $accept$
declare
  v_request public.research_assisted_order_requests%rowtype;
  v_quote public.research_assisted_order_quotes%rowtype;
  v_request_id uuid;
  v_authorized boolean;
begin
  select request_id into v_request_id from public.research_assisted_order_quotes
  where id = p_quote_id;
  if not found then return null; end if;
  select * into v_request from public.research_assisted_order_requests
  where id = v_request_id for update;
  select * into v_quote from public.research_assisted_order_quotes
  where id = p_quote_id for update;

  v_authorized :=
    (p_member_id is not null and v_request.actor_member_id = p_member_id)
    or (p_early_access_session_hash is not null
        and v_request.early_access_session_hash = p_early_access_session_hash)
    or exists (select 1 from public.research_assisted_order_access_tokens t
      where t.request_id = v_request.id and t.token_hash = p_status_token_hash
        and t.revoked_at is null and t.expires_at > now());
  if not coalesce(v_authorized, false) then return null; end if;
  if v_request.status in ('cancelled', 'closed')
     or ((v_request.status in ('paid', 'supplier_processing', 'shipped', 'delivered')
          or exists (select 1 from public.research_assisted_order_events
            where request_id = v_request.id and status = 'paid'))
         and coalesce((public.research_assisted_order_financial_state(v_request.id)
           ->> 'paymentVerified')::boolean, false) is not true) then
    raise exception 'The request is not open for quote acceptance'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_ACCEPTANCE_CLOSED';
  end if;
  if v_quote.version is distinct from p_version or v_quote.total_cents is distinct from p_expected_total_cents
     or v_quote.currency <> 'USD' then
    raise exception 'Quote changed; refresh before accepting'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_STALE';
  end if;
  if v_quote.state = 'accepted' then
    return pg_catalog.jsonb_build_object(
      'quoteId', v_quote.id, 'version', v_quote.version,
      'totalCents', v_quote.total_cents, 'currency', v_quote.currency,
      'acceptanceId', v_quote.acceptance_id, 'acceptedAt', v_quote.accepted_at,
      'replayed', true);
  end if;
  -- An exact accepted replay above is a read of an existing receipt only.
  -- New acceptance must still be in a pre-payment workflow without paid history.
  if v_request.status not in (
    'reviewing', 'waiting_on_customer', 'identity_received',
    'agreements_pending', 'agreements_complete', 'payment_pending', 'payment_review'
  ) or exists (select 1 from public.research_assisted_order_events
    where request_id = v_request.id and status = 'paid') then
    raise exception 'The request is not open for quote acceptance'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_ACCEPTANCE_CLOSED';
  end if;
  if v_quote.state <> 'issued' or v_quote.valid_until <= now()
     or exists (select 1 from public.research_assisted_order_quotes q
                where q.request_id = v_request.id and q.version > v_quote.version) then
    raise exception 'Quote is no longer available'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_STALE';
  end if;
  update public.research_assisted_order_quotes
  set state = 'accepted', accepted_at = now(), acceptance_id = gen_random_uuid()
  where id = p_quote_id returning * into v_quote;
  return pg_catalog.jsonb_build_object(
    'quoteId', v_quote.id, 'version', v_quote.version,
    'totalCents', v_quote.total_cents, 'currency', v_quote.currency,
    'acceptanceId', v_quote.acceptance_id, 'acceptedAt', v_quote.accepted_at,
    'replayed', false);
end
$accept$;

revoke all on function public.research_assisted_order_quote_accept(uuid,integer,bigint,uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.research_assisted_order_quote_accept(uuid,integer,bigint,uuid,text,text)
  to service_role;
-- Restate the effective boundary; do not edit or replay predecessor files.
revoke all on function public.research_assisted_order_payment_verify(uuid,uuid)
  from public, anon, authenticated, service_role;

do $postcondition$
declare v_role text;
declare v_signature text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_signature in array array[
      'public.research_assisted_order_history_progression_guard()',
      'public.research_assisted_order_quote_snapshot_guard()',
      'public.research_assisted_order_payment_verify(uuid,uuid)'
    ] loop
      if has_function_privilege(v_role, v_signature, 'EXECUTE') then
        raise exception 'Internal financial function ACL failed' using errcode = '55000';
      end if;
    end loop;
    foreach v_signature in array array[
      'public.research_assisted_order_quote_accept(uuid,integer,bigint,uuid,text,text)',
      'public.research_assisted_order_payment_verify_bound(uuid,uuid,uuid)'
    ] loop
      if has_function_privilege(v_role, v_signature, 'EXECUTE') is distinct from (v_role = 'service_role') then
        raise exception 'Bound financial RPC ACL failed' using errcode = '55000';
      end if;
    end loop;
    if has_table_privilege(v_role, 'public.research_assisted_order_quotes', 'UPDATE')
       or has_table_privilege(v_role, 'public.research_assisted_order_quotes', 'DELETE')
       or has_table_privilege(v_role, 'public.research_assisted_order_quotes', 'TRUNCATE') then
      raise exception 'Direct quote mutation ACL failed' using errcode = '55000';
    end if;
  end loop;
end
$postcondition$;
commit;
