-- Source-only HL-12 successor. Do not apply to managed staging or production
-- without a separate exact-SHA migration authorization and preflight.
-- Customer quote projection is owner-bound and omits private pricing basis.
create or replace function public.research_assisted_order_quote_get(
  p_public_reference text,
  p_member_id uuid default null,
  p_early_access_session_hash text default null,
  p_status_token_hash text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $quote_get$
declare
  v_request public.research_assisted_order_requests%rowtype;
  v_quote public.research_assisted_order_quotes%rowtype;
  v_authorized boolean;
begin
  select * into v_request from public.research_assisted_order_requests
  where public_reference = p_public_reference;
  if not found then return null; end if;
  v_authorized :=
    (p_member_id is not null and v_request.actor_member_id = p_member_id)
    or (p_early_access_session_hash is not null
        and v_request.early_access_session_hash = p_early_access_session_hash)
    or exists (select 1 from public.research_assisted_order_access_tokens t
      where t.request_id = v_request.id and t.token_hash = p_status_token_hash
        and t.revoked_at is null and t.expires_at > now());
  if not coalesce(v_authorized, false) then return null; end if;
  select * into v_quote from public.research_assisted_order_quotes
  where request_id = v_request.id order by version desc limit 1;
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object(
    'requestId', v_request.id,
    'publicReference', v_request.public_reference,
    'quoteId', v_quote.id,
    'version', v_quote.version,
    'state', case when v_quote.state = 'issued' and v_quote.valid_until <= now()
                  then 'expired' else v_quote.state end,
    'lines', v_quote.lines,
    'totalCents', v_quote.total_cents,
    'currency', v_quote.currency,
    'validUntil', v_quote.valid_until,
    'customerNote', v_quote.customer_note,
    'acceptanceId', v_quote.acceptance_id,
    'acceptedAt', v_quote.accepted_at
  );
end
$quote_get$;

revoke all on function public.research_assisted_order_quote_get(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.research_assisted_order_quote_get(text, uuid, text, text)
  to service_role;

-- Bind the HTTP request path to the immutable observation before the atomic
-- verification RPC can change status. An unrelated path returns no existence
-- detail and performs no write. The unbound service-role grant is removed.
create or replace function public.research_assisted_order_payment_verify_bound(
  p_request_id uuid,
  p_observation_id uuid,
  p_verifier_auth_user_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $bound$
declare
  v_request_id uuid;
begin
  select request_id into v_request_id
  from public.research_assisted_order_payment_observations
  where id = p_observation_id;
  if not found or v_request_id <> p_request_id then return null; end if;
  return public.research_assisted_order_payment_verify(
    p_observation_id, p_verifier_auth_user_id);
end
$bound$;

revoke all on function public.research_assisted_order_payment_verify(uuid, uuid)
  from service_role;
revoke all on function public.research_assisted_order_payment_verify_bound(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.research_assisted_order_payment_verify_bound(uuid, uuid, uuid)
  to service_role;

do $postcondition$
begin
  if has_function_privilege('anon',
      'public.research_assisted_order_quote_get(text,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated',
      'public.research_assisted_order_payment_verify_bound(uuid,uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role',
      'public.research_assisted_order_quote_get(text,uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role',
      'public.research_assisted_order_payment_verify_bound(uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('service_role',
      'public.research_assisted_order_payment_verify(uuid,uuid)', 'EXECUTE') then
    raise exception 'HL-12 quote access or bound verification ACL failed';
  end if;
end
$postcondition$;
