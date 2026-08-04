-- Read-only catalog verification for the PENDING Private Early Access session
-- durability migration. It reads metadata and aggregate counts only.

begin transaction read only;

do $verify$
declare
  v_table_count integer;
  v_function_count integer;
  v_prefixed_function_count integer;
  v_policy_count integer;
  v_role_grant_count integer;
  v_direct_trigger_count integer;
  v_role text;
  v_table text;
  v_column text;
  v_privilege text;
  v_signature text;
  v_table_owner oid;
  v_service_role oid := pg_catalog.to_regrole('service_role');
  v_session_constraints text[];
  v_nonce_constraints text[];
  v_index_definitions text[];
  v_has_maintain boolean := pg_catalog.current_setting('server_version_num')::integer >= 170000;
begin
  select pg_catalog.count(*)::integer into v_table_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relpersistence = 'p'
    and c.relname in (
      'research_private_early_access_sessions',
      'research_private_early_access_nonces'
    )
    and c.relrowsecurity and c.relforcerowsecurity;
  if v_table_count <> 2 then
    raise exception 'private early access verification: exact forced-RLS tables missing';
  end if;

  select pg_catalog.count(*)::integer into v_policy_count
  from pg_catalog.pg_policy p
  where p.polrelid in (
    'public.research_private_early_access_sessions'::regclass,
    'public.research_private_early_access_nonces'::regclass
  );
  if v_policy_count <> 0 then
    raise exception 'private early access verification: unexpected_policy_count=%', v_policy_count;
  end if;

  select pg_catalog.count(*)::integer into v_direct_trigger_count
  from pg_catalog.pg_trigger t
  where t.tgrelid in (
    'public.research_private_early_access_sessions'::regclass,
    'public.research_private_early_access_nonces'::regclass
  ) and not t.tgisinternal;
  if v_direct_trigger_count <> 0 then
    raise exception 'private early access verification: unexpected trigger count=%', v_direct_trigger_count;
  end if;

  select pg_catalog.array_agg(
    c.conname || '|' || c.contype::text || '|' || c.convalidated::text || '|'
      || pg_catalog.pg_get_constraintdef(c.oid, true)
    order by c.conname
  ) into v_session_constraints
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.research_private_early_access_sessions'::regclass;
  if v_session_constraints is distinct from array[
    'research_private_early_access_sessions_expiry_exact|c|true|CHECK (expires_at = (issued_at + ''00:15:00''::interval))',
    'research_private_early_access_sessions_hash_format|c|true|CHECK (session_hash ~ ''^[a-f0-9]{64}$''::text)',
    'research_private_early_access_sessions_pkey|p|true|PRIMARY KEY (session_hash)',
    'research_private_early_access_sessions_revocation_order|c|true|CHECK (revoked_at IS NULL OR revoked_at >= issued_at)',
    'research_private_early_access_sessions_role_exact|c|true|CHECK (access_role = ''private_early_access_member''::text)'
  ]::text[] then
    raise exception 'private early access verification: sessions constraint definitions mismatch';
  end if;

  select pg_catalog.array_agg(
    c.conname || '|' || c.contype::text || '|' || c.convalidated::text || '|'
      || pg_catalog.pg_get_constraintdef(c.oid, true)
    order by c.conname
  ) into v_nonce_constraints
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.research_private_early_access_nonces'::regclass;
  if v_nonce_constraints is distinct from array[
    'research_private_early_access_nonces_consumption_order|c|true|CHECK (consumed_at IS NULL OR consumed_at >= issued_at AND consumed_at < expires_at)',
    'research_private_early_access_nonces_exchange_fk|f|true|FOREIGN KEY (exchanged_session_hash) REFERENCES research_private_early_access_sessions(session_hash) ON UPDATE RESTRICT ON DELETE RESTRICT',
    'research_private_early_access_nonces_exchange_hash_format|c|true|CHECK (exchanged_session_hash IS NULL OR exchanged_session_hash ~ ''^[a-f0-9]{64}$''::text)',
    'research_private_early_access_nonces_exchange_state|c|true|CHECK ((consumed_at IS NULL) = (exchanged_session_hash IS NULL))',
    'research_private_early_access_nonces_exchange_unique|u|true|UNIQUE (exchanged_session_hash)',
    'research_private_early_access_nonces_expiry_exact|c|true|CHECK (expires_at = (issued_at + ''00:05:00''::interval))',
    'research_private_early_access_nonces_hash_format|c|true|CHECK (nonce_hash ~ ''^[a-f0-9]{64}$''::text)',
    'research_private_early_access_nonces_pkey|p|true|PRIMARY KEY (nonce_hash)',
    'research_private_early_access_nonces_role_exact|c|true|CHECK (access_role = ''private_early_access_member''::text)'
  ]::text[] then
    raise exception 'private early access verification: nonce constraint definitions mismatch';
  end if;

  select pg_catalog.array_agg(
    c.relname || '|' || i.indisvalid::text || '|' || i.indisready::text || '|'
      || i.indislive::text || '|' || i.indisunique::text || '|'
      || pg_catalog.pg_get_indexdef(c.oid)
    order by c.relname
  ) into v_index_definitions
  from pg_catalog.pg_class c
  join pg_catalog.pg_index i on i.indexrelid = c.oid
  where i.indrelid in (
    'public.research_private_early_access_sessions'::regclass,
    'public.research_private_early_access_nonces'::regclass
  );
  if v_index_definitions is distinct from array[
    'research_private_early_access_nonces_exchange_unique|true|true|true|true|CREATE UNIQUE INDEX research_private_early_access_nonces_exchange_unique ON public.research_private_early_access_nonces USING btree (exchanged_session_hash)',
    'research_private_early_access_nonces_pkey|true|true|true|true|CREATE UNIQUE INDEX research_private_early_access_nonces_pkey ON public.research_private_early_access_nonces USING btree (nonce_hash)',
    'research_private_early_access_nonces_unconsumed_idx|true|true|true|false|CREATE INDEX research_private_early_access_nonces_unconsumed_idx ON public.research_private_early_access_nonces USING btree (owner_id, expires_at) WHERE (consumed_at IS NULL)',
    'research_private_early_access_sessions_owner_active_idx|true|true|true|false|CREATE INDEX research_private_early_access_sessions_owner_active_idx ON public.research_private_early_access_sessions USING btree (owner_id, expires_at) WHERE (revoked_at IS NULL)',
    'research_private_early_access_sessions_pkey|true|true|true|true|CREATE UNIQUE INDEX research_private_early_access_sessions_pkey ON public.research_private_early_access_sessions USING btree (session_hash)'
  ]::text[] then
    raise exception 'private early access verification: index definitions mismatch';
  end if;

  select pg_catalog.count(*)::integer into v_role_grant_count
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.table_name in (
      'research_private_early_access_sessions',
      'research_private_early_access_nonces'
    )
    and g.grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');
  if v_role_grant_count <> 0 then
    raise exception 'private early access verification: forbidden role_table_grants=%', v_role_grant_count;
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) a
    where c.oid in (
      'public.research_private_early_access_sessions'::regclass,
      'public.research_private_early_access_nonces'::regclass
    )
  ) <> (case when v_has_maintain then 16 else 14 end) or exists (
    select 1
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) a
    where c.oid in (
      'public.research_private_early_access_sessions'::regclass,
      'public.research_private_early_access_nonces'::regclass
    )
      and (
        a.grantee <> c.relowner
        or a.grantor <> c.relowner
        or (
          a.privilege_type not in (
            'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
          )
          and not (v_has_maintain and a.privilege_type = 'MAINTAIN')
        )
        or a.is_grantable
      )
  ) then
    raise exception 'private early access verification: table ACL allowlist violation';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid in (
      'public.research_private_early_access_sessions'::regclass,
      'public.research_private_early_access_nonces'::regclass
    )
      and a.attnum > 0
      and not a.attisdropped
      and a.attacl is not null
  ) then
    raise exception 'private early access verification: column ACL entries are forbidden';
  end if;

  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if pg_catalog.to_regrole(v_role) is not null then
      foreach v_table in array array[
        'public.research_private_early_access_sessions',
        'public.research_private_early_access_nonces'
      ] loop
        foreach v_privilege in array array[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
        ] loop
          if pg_catalog.has_table_privilege(v_role, v_table, v_privilege) then
            raise exception 'private early access verification: effective table privilege %:%:%',
              v_role, v_table, v_privilege;
          end if;
        end loop;

        if v_has_maintain and pg_catalog.has_table_privilege(v_role, v_table, 'MAINTAIN') then
          raise exception 'private early access verification: effective table privilege %:%:MAINTAIN',
            v_role, v_table;
        end if;


        for v_column in
          select a.attname
          from pg_catalog.pg_attribute a
          where a.attrelid = v_table::regclass
            and a.attnum > 0
            and not a.attisdropped
        loop
          foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
            if pg_catalog.has_column_privilege(v_role, v_table, v_column, v_privilege) then
              raise exception 'private early access verification: effective column privilege %:%:%:%',
                v_role, v_table, v_column, v_privilege;
            end if;
          end loop;
        end loop;
      end loop;
    end if;
  end loop;

  select c.relowner into v_table_owner
  from pg_catalog.pg_class c
  where c.oid = 'public.research_private_early_access_sessions'::regclass;

  select pg_catalog.count(*)::integer into v_prefixed_function_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like 'research_private_early_access_%';
  if v_prefixed_function_count <> 4 then
    raise exception 'private early access verification: unexpected prefixed RPC count=%', v_prefixed_function_count;
  end if;

  select pg_catalog.count(*)::integer into v_function_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where n.nspname = 'public'
    and p.proname in (
      'research_private_early_access_issue_nonce',
      'research_private_early_access_exchange_nonce',
      'research_private_early_access_session_active',
      'research_private_early_access_revoke_session'
    )
    and p.prosecdef
    and p.proconfig = array['search_path=pg_catalog']::text[]
    and p.proowner = v_table_owner
    and (r.rolsuper or r.rolbypassrls);
  if v_function_count <> 4 then
    raise exception 'private early access verification: exact security_definer functions missing';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) a
    where n.nspname = 'public'
      and p.proname in (
        'research_private_early_access_issue_nonce',
        'research_private_early_access_exchange_nonce',
        'research_private_early_access_session_active',
        'research_private_early_access_revoke_session'
      )
  ) <> (case when v_service_role is null then 4 else 8 end)
  or exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) a
    where n.nspname = 'public'
      and p.proname in (
        'research_private_early_access_issue_nonce',
        'research_private_early_access_exchange_nonce',
        'research_private_early_access_session_active',
        'research_private_early_access_revoke_session'
      )
      and (
        (a.grantee <> p.proowner and (v_service_role is null or a.grantee <> v_service_role))
        or a.grantor <> p.proowner
        or a.privilege_type <> 'EXECUTE'
        or a.is_grantable
      )
  ) then
    raise exception 'private early access verification: function ACL allowlist violation';
  end if;

  if pg_catalog.to_regprocedure('public.research_private_early_access_issue_nonce(text,uuid,text)') is null
     or pg_catalog.to_regprocedure('public.research_private_early_access_exchange_nonce(text,text,uuid,text)') is null
     or pg_catalog.to_regprocedure('public.research_private_early_access_session_active(text,uuid,text)') is null
     or pg_catalog.to_regprocedure('public.research_private_early_access_revoke_session(text,uuid,text)') is null then
    raise exception 'private early access verification: exact function signature mismatch';
  end if;

  if pg_catalog.to_regrole('service_role') is not null and (
    not pg_catalog.has_function_privilege('service_role', 'public.research_private_early_access_issue_nonce(text,uuid,text)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.research_private_early_access_exchange_nonce(text,text,uuid,text)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.research_private_early_access_session_active(text,uuid,text)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.research_private_early_access_revoke_session(text,uuid,text)', 'EXECUTE')
  ) then
    raise exception 'private early access verification: service_role narrow execute missing';
  end if;

  foreach v_role in array array['anon', 'authenticated'] loop
    if pg_catalog.to_regrole(v_role) is not null then
      foreach v_signature in array array[
        'public.research_private_early_access_issue_nonce(text,uuid,text)',
        'public.research_private_early_access_exchange_nonce(text,text,uuid,text)',
        'public.research_private_early_access_session_active(text,uuid,text)',
        'public.research_private_early_access_revoke_session(text,uuid,text)'
      ] loop
        if pg_catalog.has_function_privilege(v_role, v_signature, 'EXECUTE') then
          raise exception 'private early access verification: forbidden browser RPC execute %:%',
            v_role, v_signature;
        end if;
      end loop;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) a
    where n.nspname = 'public'
      and p.proname in (
        'research_private_early_access_issue_nonce',
        'research_private_early_access_exchange_nonce',
        'research_private_early_access_session_active',
        'research_private_early_access_revoke_session'
      )
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'private early access verification: PUBLIC execute must be absent';
  end if;
end
$verify$;

select
  c.relname,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  pg_catalog.pg_get_userbyid(c.relowner) as owner_name
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'research_private_early_access_sessions',
    'research_private_early_access_nonces'
  )
order by c.relname;

select
  p.proname,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proconfig,
  pg_catalog.pg_get_userbyid(p.proowner) as owner_name
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'research_private_early_access_issue_nonce',
    'research_private_early_access_exchange_nonce',
    'research_private_early_access_session_active',
    'research_private_early_access_revoke_session'
  )
order by p.proname;

select
  (select pg_catalog.count(*) from public.research_private_early_access_sessions) as session_row_count,
  (select pg_catalog.count(*) from public.research_private_early_access_nonces) as nonce_row_count,
  (select pg_catalog.count(*) from public.research_private_early_access_nonces where consumed_at is null) as unconsumed_nonce_count;

commit;
