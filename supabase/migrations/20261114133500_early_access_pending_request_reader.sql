-- Adds queue-only authority to the existing identity and audit registries.
-- Grants no human assignment, enables no capability and changes no issuer RPC.
begin;

-- Preserve the installed constraints (including any separately approved values)
-- and extend each by exactly one literal. Name the replacement for replay.
do $migration$
declare
  item record;
  prior_expression text;
begin
  for item in select * from (values
    ('care_role_assignments'::name, 'role'::name,
      'care_role_assignments_role_check'::name, 'ea_pending_reader_role_check'::name, 'request_intent_reader'),
    ('care_access_audit'::name, 'permission'::name,
      'care_access_audit_permission_check'::name, 'ea_pending_reader_permission_check'::name, 'request_intent:read_pending')
  ) as changes(table_name, column_name, prior_name, replacement_name, added_value)
  loop
    if exists (select 1 from pg_catalog.pg_constraint
      where conrelid = format('public.%I', item.table_name)::regclass
        and conname = item.replacement_name and contype = 'c' and convalidated) then
      continue;
    end if;
    select pg_catalog.pg_get_expr(conbin, conrelid) into strict prior_expression
      from pg_catalog.pg_constraint
      where conrelid = format('public.%I', item.table_name)::regclass
        and conname = item.prior_name and contype = 'c' and convalidated;
    execute format('alter table public.%I drop constraint %I, add constraint %I check ((%s) or %I = %L)',
      item.table_name, item.prior_name, item.replacement_name, prior_expression,
      item.column_name, item.added_value);
  end loop;
end;
$migration$;

create or replace function request_intent_private.require_queue_reader(p_actor_user_id uuid)
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if current_setting('role', true) is distinct from 'service_role'
    or (auth.uid() is not null and auth.uid() is distinct from p_actor_user_id)
    or p_actor_user_id is null
    or not exists (select 1 from public.care_role_assignments
      where user_id = p_actor_user_id and role = 'request_intent_reader' and revoked_at is null)
    or not exists (select 1 from public.care_capabilities
      where capability_key = 'request_intent_pending_read' and state = 'enabled'
        and approved_by is not null and approved_at is not null) then
    raise exception using errcode = '42501', message = 'request_intent_private_review_required';
  end if;
end;
$$;
revoke all on function request_intent_private.require_queue_reader(uuid) from public, anon, authenticated, service_role;

create or replace function request_intent_private.operator_get(
  p_request_id uuid, p_actor_user_id uuid, p_include_context boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  stored request_intent_private.requests;
  detail jsonb;
  optional_detail jsonb;
begin
  perform request_intent_private.require_queue_reader(p_actor_user_id);
  select * into stored from request_intent_private.requests
    where id = p_request_id and status = 'pending_review';
  if not found then return null; end if;
  detail := request_intent_private.receipt(stored) || jsonb_build_object(
    'contact', stored.contact, 'agreements', stored.agreements, 'lines', stored.lines);
  if p_include_context then
    select jsonb_strip_nulls(jsonb_build_object('goal', goal, 'referralCode', referral_code))
      into optional_detail from request_intent_private.optional_context where request_id = p_request_id;
    if optional_detail is not null then
      detail := detail || jsonb_build_object('optionalIntake', optional_detail);
    end if;
  end if;
  insert into request_intent_private.access_events(request_id, event_type, actor_user_id)
    values (stored.id, 'staff_read', p_actor_user_id);
  return detail;
end;
$$;

create or replace function request_intent_private.operator_list(p_actor_user_id uuid, p_page integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  stored request_intent_private.requests;
  entries jsonb := '[]'::jsonb;
  total_count bigint;
begin
  perform request_intent_private.require_queue_reader(p_actor_user_id);
  if p_page is null or p_page not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'request_intent_invalid_page';
  end if;
  select count(*) into total_count from request_intent_private.requests where status = 'pending_review';
  for stored in select * from request_intent_private.requests where status = 'pending_review'
    order by created_at desc, id desc limit 25 offset (p_page-1)*25 loop
    entries := entries || jsonb_build_array(request_intent_private.receipt(stored)
      || jsonb_build_object('lineCount', jsonb_array_length(stored.lines)));
    insert into request_intent_private.access_events(request_id, event_type, actor_user_id)
      values (stored.id, 'queue_list', p_actor_user_id);
  end loop;
  return jsonb_build_object('items', entries, 'total', total_count, 'page', p_page, 'pageSize', 25);
end;
$$;

create or replace function public.request_intent_operator_get(p_request_id uuid, p_actor_user_id uuid, p_include_context boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select request_intent_private.operator_get(p_request_id, p_actor_user_id, p_include_context);
$$;
create or replace function public.request_intent_operator_list(p_actor_user_id uuid, p_page integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select request_intent_private.operator_list(p_actor_user_id, p_page);
$$;

revoke all on function request_intent_private.operator_get(uuid,uuid,boolean), request_intent_private.operator_list(uuid,integer),
  public.request_intent_operator_get(uuid,uuid,boolean), public.request_intent_operator_list(uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function request_intent_private.operator_get(uuid,uuid,boolean), request_intent_private.operator_list(uuid,integer),
  public.request_intent_operator_get(uuid,uuid,boolean), public.request_intent_operator_list(uuid,integer)
  to service_role;
commit;
