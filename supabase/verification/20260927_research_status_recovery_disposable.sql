\set ON_ERROR_STOP on

insert into public.research_assisted_order_requests(
  id, public_reference, idempotency_key_hash, request_fingerprint,
  early_access_session_hash, normalized_email, full_legal_name, mobile_phone,
  shipping_address, billing_address, age_confirmed, source, created_at, updated_at
) values (
  '11111111-1111-4111-8111-111111111111', 'XRR-20260927-ABCDEF1234',
  repeat('1', 64), repeat('2', 64), repeat('b', 64), 'owner@example.invalid',
  'Synthetic Fixture', '0000000000',
  '{"line1":"1 Test Way","city":"Test","region":"IL","postalCode":"00000","countryCode":"US"}'::jsonb,
  '{"line1":"1 Test Way","city":"Test","region":"IL","postalCode":"00000","countryCode":"US"}'::jsonb,
  true, 'early_access_manual_order_bridge',
  '2026-09-27T20:00:00Z', '2026-09-27T20:00:00Z'
);

insert into public.research_assisted_order_events(request_id, status, actor_type, customer_message, occurred_at)
values ('11111111-1111-4111-8111-111111111111', 'submitted', 'system', 'Your request was received.', '2026-09-27T20:00:00Z');

do $acl$
declare
  v_table text;
  v_function text;
begin
  foreach v_table in array array['research_status_recovery_tokens', 'research_status_recovery_sessions'] loop
    if pg_catalog.has_table_privilege('anon', 'public.' || v_table, 'select,insert,update,delete')
       or pg_catalog.has_table_privilege('authenticated', 'public.' || v_table, 'select,insert,update,delete')
       or pg_catalog.has_table_privilege('service_role', 'public.' || v_table, 'select,insert,update,delete') then
      raise exception 'direct table privilege exists on %', v_table;
    end if;
  end loop;
  foreach v_function in array array[
    'research_status_recovery_match(text,text)',
    'research_status_recovery_prepare_delivery(text,uuid,uuid,text,text,timestamptz,timestamptz,text)',
    'research_status_recovery_exchange(text,text,timestamptz,timestamptz)',
    'research_status_recovery_status(text,timestamptz)',
    'research_status_recovery_end(text,timestamptz)'
  ] loop
    if pg_catalog.has_function_privilege('anon', 'public.' || v_function, 'execute')
       or pg_catalog.has_function_privilege('authenticated', 'public.' || v_function, 'execute')
       or not pg_catalog.has_function_privilege('service_role', 'public.' || v_function, 'execute') then
      raise exception 'function ACL mismatch on %', v_function;
    end if;
  end loop;
end
$acl$;

set role service_role;

do $behaviour$
declare
  v_json jsonb;
  v_first_id text;
  v_second_id text;
begin
  v_json := public.research_status_recovery_match('XRR-20260927-ABCDEF1234', 'owner@example.invalid');
  if v_json ->> 'canonicalEmail' <> 'owner@example.invalid' then raise exception 'canonical match failed'; end if;
  if public.research_status_recovery_match('XRR-20260927-ABCDEF1234', 'alternate@example.invalid') is not null then raise exception 'wrong email matched'; end if;
  if public.research_status_recovery_match('XRR-20260927-0000000000', 'owner@example.invalid') is not null then raise exception 'unknown reference matched'; end if;

  v_json := public.research_status_recovery_prepare_delivery(
    'assisted_order', '11111111-1111-4111-8111-111111111111', null,
    repeat('a', 64), repeat('c', 64),
    '2026-09-27T20:00:00Z', '2026-09-27T20:30:00Z', 'public_status_recovery'
  );
  v_first_id := v_json ->> 'tokenRecordId';
  if v_json ->> 'canonicalEmail' <> 'owner@example.invalid' then raise exception 'delivery recipient mismatch'; end if;
  v_json := public.research_status_recovery_prepare_delivery(
    'assisted_order', '11111111-1111-4111-8111-111111111111', null,
    repeat('a', 64), repeat('c', 64),
    '2026-09-27T20:00:01Z', '2026-09-27T20:30:00Z', 'public_status_recovery'
  );
  if v_json ->> 'tokenRecordId' <> v_first_id then raise exception 'idempotent retry changed token row'; end if;

  if public.research_status_recovery_exchange(repeat('0', 64), repeat('e', 64), '2026-09-27T20:01:00Z', '2026-09-28T20:01:00Z') then raise exception 'wrong token exchanged'; end if;
  if not public.research_status_recovery_exchange(repeat('c', 64), repeat('e', 64), '2026-09-27T20:01:00Z', '2026-09-28T20:01:00Z') then raise exception 'valid token refused'; end if;
  if public.research_status_recovery_exchange(repeat('c', 64), repeat('f', 64), '2026-09-27T20:01:01Z', '2026-09-28T20:01:01Z') then raise exception 'consumed token replayed'; end if;
  v_json := public.research_status_recovery_status(repeat('e', 64), '2026-09-27T20:02:00Z');
  if v_json ->> 'publicReference' <> 'XRR-20260927-ABCDEF1234'
     or v_json ->> 'status' <> 'submitted'
     or jsonb_array_length(v_json -> 'timeline') <> 1 then raise exception 'status projection mismatch'; end if;
  if public.research_status_recovery_status(repeat('e', 64), '2026-09-28T20:01:01Z') is not null then raise exception 'expired session remained valid'; end if;

  v_json := public.research_status_recovery_prepare_delivery(
    'assisted_order', '11111111-1111-4111-8111-111111111111', null,
    repeat('b', 64), repeat('1', 64),
    '2026-09-27T20:05:00Z', '2026-09-27T20:35:00Z', 'public_status_recovery'
  );
  v_second_id := v_json ->> 'tokenRecordId';
  if v_second_id = v_first_id then raise exception 'new request reused old row'; end if;
  v_json := public.research_status_recovery_prepare_delivery(
    'assisted_order', '11111111-1111-4111-8111-111111111111', null,
    repeat('d', 64), repeat('2', 64),
    '2026-09-27T20:06:00Z', '2026-09-27T20:36:00Z', 'public_status_recovery'
  );
  if public.research_status_recovery_exchange(repeat('1', 64), repeat('3', 64), '2026-09-27T20:07:00Z', '2026-09-28T20:07:00Z') then raise exception 'replaced token remained valid'; end if;
  if not public.research_status_recovery_end(repeat('e', 64), '2026-09-27T20:08:00Z') then raise exception 'session end failed'; end if;
  if public.research_status_recovery_status(repeat('e', 64), '2026-09-27T20:09:00Z') is not null then raise exception 'revoked session remained valid'; end if;
end
$behaviour$;

reset role;

do $storage$
begin
  if (select count(*) from public.research_status_recovery_tokens) <> 3 then raise exception 'unexpected token row count'; end if;
  if exists (
    select 1 from public.research_status_recovery_tokens
    where token_digest !~ '^[0-9a-f]{64}$' or subject_owner_binding <> 'early_access:' || repeat('b', 64)
  ) then raise exception 'digest or owner binding mismatch'; end if;
  if (select count(*) from public.research_status_recovery_sessions) <> 1 then raise exception 'unexpected session row count'; end if;
end
$storage$;

select 'PASS_STATUS_RECOVERY_DISPOSABLE_BEHAVIOUR' as result;
