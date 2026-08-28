-- UNAPPLIED candidate postcheck. Run in the same disposable rehearsal after
-- the candidate; it makes privilege, RLS, immutability, and authority drift a
-- hard failure.

do $$
declare
  v_authority jsonb;
begin
  if to_regclass('public.research_assisted_order_audit_events_v1') is null then
    raise exception 'assisted-order audit postcheck: table absent';
  end if;
  if not exists (
    select 1
      from pg_class
     where oid = 'public.research_assisted_order_audit_events_v1'::regclass
       and relrowsecurity
       and relforcerowsecurity
  ) then
    raise exception 'assisted-order audit postcheck: forced RLS absent';
  end if;
  if has_table_privilege('anon', 'public.research_assisted_order_audit_events_v1', 'select')
     or has_table_privilege('anon', 'public.research_assisted_order_audit_events_v1', 'insert')
     or has_table_privilege('authenticated', 'public.research_assisted_order_audit_events_v1', 'select')
     or has_table_privilege('authenticated', 'public.research_assisted_order_audit_events_v1', 'insert')
     or has_table_privilege('service_role', 'public.research_assisted_order_audit_events_v1', 'select')
     or has_table_privilege('service_role', 'public.research_assisted_order_audit_events_v1', 'insert')
     or has_table_privilege('service_role', 'public.research_assisted_order_audit_events_v1', 'update')
     or has_table_privilege('service_role', 'public.research_assisted_order_audit_events_v1', 'delete')
     or has_table_privilege('service_role', 'public.research_assisted_order_audit_events_v1', 'truncate') then
    raise exception 'assisted-order audit postcheck: direct table privilege exists';
  end if;
  if exists (
       select 1
         from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = 'public.research_assisted_order_audit_authority()'::regprocedure
          and a.grantee = 0
          and a.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', 'public.research_assisted_order_audit_authority()', 'execute')
     or has_function_privilege('authenticated', 'public.research_assisted_order_audit_authority()', 'execute')
     or not has_function_privilege('service_role', 'public.research_assisted_order_audit_authority()', 'execute')
     or exists (
       select 1
         from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = 'public.research_assisted_order_audit_append(text,text,jsonb)'::regprocedure
          and a.grantee = 0
          and a.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', 'public.research_assisted_order_audit_append(text,text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.research_assisted_order_audit_append(text,text,jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.research_assisted_order_audit_append(text,text,jsonb)', 'execute') then
    raise exception 'assisted-order audit postcheck: RPC execute boundary invalid';
  end if;
  if has_function_privilege('service_role', 'public.research_assisted_order_audit_evidence_valid(text,jsonb)', 'execute')
     or has_function_privilege('service_role', 'public.research_assisted_order_audit_reject_mutation()', 'execute') then
    raise exception 'assisted-order audit postcheck: internal helper reachable';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.research_assisted_order_audit_events_v1'::regclass
       and tgname = 'research_assisted_order_audit_no_row_mutation'
       and tgenabled <> 'D'
       and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.research_assisted_order_audit_events_v1'::regclass
       and tgname = 'research_assisted_order_audit_no_truncate'
       and tgenabled <> 'D'
       and not tgisinternal
  ) then
    raise exception 'assisted-order audit postcheck: immutability trigger absent';
  end if;

  v_authority := public.research_assisted_order_audit_authority();
  if v_authority is distinct from jsonb_build_object(
    'schemaVersion', 'research_assisted_order_audit_v1',
    'attestation', 'research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694',
    'eventTypes', jsonb_build_array(
      'assisted_order.submitted',
      'assisted_order.status_changed',
      'assisted_order.document_upload_authorized',
      'assisted_order.document_upload_completion_authorized',
      'assisted_order.document_download_authorized'
    ),
    'actorTypes', jsonb_build_array('member', 'early_access_session', 'admin', 'system'),
    'evidencePolicy', 'bounded_allowlist_v1',
    'actorIdentityPolicy', 'hmac_sha256_alias_v1',
    'appendOnly', true
  ) then
    raise exception 'assisted-order audit postcheck: authority drift';
  end if;
end;
$$;
