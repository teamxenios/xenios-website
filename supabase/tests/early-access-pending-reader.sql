-- Run after the Care and mixed-request schemas and pending-reader migration in a disposable DB.
begin;
do $$ begin
  if current_database() <> 'request_intent_disposable' then
    raise exception 'disposable request-intent database required';
  end if;
end; $$;

insert into auth.users(id) values ('eac00000-0000-4000-8000-000000000001');
insert into public.care_role_assignments (user_id, role, granted_by)
values ('eac00000-0000-4000-8000-000000000001', 'request_intent_reader', 'eac00000-0000-4000-8000-000000000001');
insert into public.care_access_audit (actor_user_id, permission, outcome) values
  ('eac00000-0000-4000-8000-000000000001', 'request_intent:read_pending', 'allowed');
insert into public.care_capabilities (capability_key, state, approved_by, approved_at)
values ('request_intent_pending_read', 'enabled', 'eac00000-0000-4000-8000-000000000001', now())
on conflict (capability_key) do update set state = excluded.state, approved_by = excluded.approved_by, approved_at = excluded.approved_at;

set local role service_role;
do $$
declare actor uuid := 'eac00000-0000-4000-8000-000000000001'; missing uuid := gen_random_uuid();
begin
  if public.request_intent_operator_list(actor, 1)->>'pageSize' is distinct from '25'
    or public.request_intent_operator_get(missing, actor, false) is not null then
    raise exception 'active operator queue contract failed';
  end if;
  begin perform public.request_intent_staff_get(missing, actor); raise exception 'legacy issuer read accepted queue operator';
  exception when insufficient_privilege then null; end;
  begin perform public.request_intent_operator_list(missing, 1); raise exception 'ordinary user accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', missing::text, true);
  begin perform public.request_intent_operator_get(missing, actor, false); raise exception 'mismatched subject accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', '', true);
end; $$;

reset role;
update public.care_capabilities set state = 'disabled' where capability_key = 'request_intent_pending_read';
set local role service_role;
do $$ begin
  perform public.request_intent_operator_list('eac00000-0000-4000-8000-000000000001', 1);
  raise exception 'disabled capability accepted';
exception when insufficient_privilege then null; end; $$;
reset role;
update public.care_capabilities set state = 'enabled' where capability_key = 'request_intent_pending_read';
update public.care_role_assignments set revoked_at = now() where user_id = 'eac00000-0000-4000-8000-000000000001';
set local role service_role;
do $$ begin
  perform public.request_intent_operator_get(gen_random_uuid(), 'eac00000-0000-4000-8000-000000000001', false);
  raise exception 'revoked reader accepted';
exception when insufficient_privilege then null; end; $$;
reset role;
do $$
declare role_name text;
begin
  foreach role_name in array array['authenticated','anon'] loop
    if has_function_privilege(role_name, 'public.request_intent_operator_get(uuid,uuid,boolean)', 'execute')
      or has_function_privilege(role_name, 'public.request_intent_operator_list(uuid,integer)', 'execute') then
      raise exception 'browser role has direct RPC privilege';
    end if;
  end loop;
end; $$;
rollback;
