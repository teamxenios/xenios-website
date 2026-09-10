-- Read-only prerequisite check; no schema/history/data mutation.
do $$
declare v_table regclass := to_regclass('public.research_idempotency_keys');
begin
  if v_table is null or to_regclass('public.research_checkout_executions') is null then
    raise exception 'recovery_operation_prerequisite_missing';
  end if;
  if exists (
    select 1 from (values
      ('id','uuid'::regtype,true), ('scope','text'::regtype,true),
      ('key','text'::regtype,true), ('result','jsonb'::regtype,false),
      ('created_at','timestamptz'::regtype,true), ('settled_at','timestamptz'::regtype,false)
    ) expected(name,type_oid,required)
    left join pg_attribute actual on actual.attrelid = v_table
      and actual.attname = expected.name and actual.attnum > 0 and not actual.attisdropped
    where actual.attnum is null or actual.atttypid <> expected.type_oid
      or actual.attnotnull <> expected.required or actual.attgenerated <> '' or actual.attidentity <> ''
  ) then
    raise exception 'recovery_idempotency_columns_incompatible';
  end if;
  if not exists (select 1 from pg_attrdef d join pg_attribute a
      on a.attrelid = d.adrelid and a.attnum = d.adnum
      where d.adrelid = v_table and a.attname = 'id'
        and pg_get_expr(d.adbin,d.adrelid) in ('gen_random_uuid()','pg_catalog.gen_random_uuid()'))
      or not exists (select 1 from pg_attrdef d join pg_attribute a
        on a.attrelid = d.adrelid and a.attnum = d.adnum
        where d.adrelid = v_table and a.attname = 'created_at'
          and pg_get_expr(d.adbin,d.adrelid) in ('now()','pg_catalog.now()')) then
    raise exception 'recovery_idempotency_defaults_incompatible';
  end if;
  if not exists (select 1 from pg_class where oid = v_table and relrowsecurity) then
    raise exception 'recovery_idempotency_rls_required';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'research_idempotency_keys') then
    raise exception 'recovery_idempotency_policy_review_required';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = v_table and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (scope, key)') then
    raise exception 'recovery_idempotency_unique_key_required';
  end if;
  if to_regprocedure('public.research_checkout_executions_list_recoverable(timestamp with time zone,integer,timestamp with time zone,uuid)') is null then
    raise exception 'recovery_discovery_prerequisite_missing';
  end if;
  if to_regprocedure('public.research_checkout_recovery_operation(text,uuid,bigint,jsonb)') is not null then
    raise exception 'recovery_operation_already_installed_stop';
  end if;
  if exists (select 1 from public.research_idempotency_keys
      where scope in ('checkout_recovery_control_v1','checkout_recovery_outcome_v1')) then
    raise exception 'recovery_namespace_not_empty_review_required';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role' and rolbypassrls)
      or not exists (select 1 from pg_roles where rolname = 'anon')
      or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'recovery_role_prerequisite_missing';
  end if;
end;
$$;
