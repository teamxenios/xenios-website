\set ON_ERROR_STOP on

-- Disposable PostgreSQL-only dependency shell for the candidate rehearsal.
-- Synthetic rows only. This file is never an environment migration.

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$roles$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text not null unique
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table if not exists public.research_members (
  id uuid primary key,
  auth_user_id uuid not null unique references auth.users (id),
  email text not null unique,
  status text not null check (status in ('pending_activation', 'active', 'paused', 'closed'))
);

create table if not exists public.research_prelaunch_role_assignments (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in (
    'super_admin', 'internal_team', 'product_admin', 'operations_admin',
    'clinical_admin', 'approved_internal_reviewer'
  )),
  assigned_by text not null,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,
  revocation_reason text
);

create unique index if not exists research_prelaunch_role_assignments_active_unique
  on public.research_prelaunch_role_assignments (auth_user_id, role)
  where revoked_at is null;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'active-admin@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'non-admin@example.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'revoked-admin@example.invalid'),
  ('44444444-4444-4444-8444-444444444444', 'expired-admin@example.invalid'),
  ('55555555-5555-4555-8555-555555555555', 'member@example.invalid')
on conflict (id) do nothing;

insert into public.research_members (id, auth_user_id, email, status) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '55555555-5555-4555-8555-555555555555',
  'member@example.invalid',
  'active'
) on conflict (id) do nothing;

insert into public.research_prelaunch_role_assignments (
  auth_user_id, role, assigned_by, reason, granted_at, expires_at,
  revoked_at, revoked_by, revocation_reason
) values
  (
    '11111111-1111-4111-8111-111111111111', 'super_admin',
    'disposable-harness', 'active synthetic administrator', now() - interval '1 day', null,
    null, null, null
  ),
  (
    '22222222-2222-4222-8222-222222222222', 'internal_team',
    'disposable-harness', 'synthetic non administrator', now() - interval '1 day', null,
    null, null, null
  ),
  (
    '33333333-3333-4333-8333-333333333333', 'super_admin',
    'disposable-harness', 'synthetic revoked administrator', now() - interval '2 days', null,
    now() - interval '1 day', 'disposable-harness', 'synthetic revocation'
  ),
  (
    '44444444-4444-4444-8444-444444444444', 'super_admin',
    'disposable-harness', 'synthetic expired administrator', now() - interval '2 days', now() - interval '1 day',
    null, null, null
  )
on conflict do nothing;

create schema if not exists rehearsal;

create or replace function rehearsal.expect_failure(
  p_label text,
  p_command text,
  p_message_pattern text default null
)
returns void
language plpgsql
as $$
declare
  did_fail boolean := false;
  failure_message text;
begin
  begin
    execute p_command;
  exception when others then
    did_fail := true;
    get stacked diagnostics failure_message = message_text;
  end;

  if not did_fail then
    raise exception 'FAIL %: attack unexpectedly succeeded: %', p_label, p_command;
  end if;
  if p_message_pattern is not null and failure_message not like p_message_pattern then
    raise exception 'FAIL %: wrong refusal. expected pattern %, got %',
      p_label, p_message_pattern, failure_message;
  end if;
  raise notice 'PASS %: refused (%).', p_label, failure_message;
end;
$$;

create or replace function rehearsal.assert_true(p_label text, p_value boolean)
returns void
language plpgsql
as $$
begin
  if p_value is distinct from true then
    raise exception 'FAIL %: assertion was not true', p_label;
  end if;
  raise notice 'PASS %.', p_label;
end;
$$;

grant usage on schema rehearsal to public;
grant execute on function rehearsal.expect_failure(text, text, text) to public;
grant execute on function rehearsal.assert_true(text, boolean) to public;

-- The historical narrative is data, not a comment convention. Load the map
-- from the read-only candidate mount so the executable suite and its claimed
-- 18 + 12 denominator cannot drift apart.
create table rehearsal.attack_map (
  historical_id text primary key,
  suite text not null check (suite in ('v1', 'v2')),
  historical_expected text not null,
  constructibility text not null,
  current_disposition text not null,
  counted_in_18_plus_12 boolean not null,
  executable_ids text[] not null check (cardinality(executable_ids) >= 1)
);

insert into rehearsal.attack_map (
  historical_id,
  suite,
  historical_expected,
  constructibility,
  current_disposition,
  counted_in_18_plus_12,
  executable_ids
)
select
  attack ->> 'historicalId',
  attack ->> 'suite',
  attack ->> 'historicalExpected',
  attack ->> 'constructibility',
  attack ->> 'currentDisposition',
  (attack ->> 'countedIn18Plus12')::boolean,
  array(select jsonb_array_elements_text(attack -> 'executableIds'))
from jsonb_array_elements(
  (pg_read_file(
    '/candidate/20260826_research_client_accounts_blitz.attack-map.json'
  )::jsonb) -> 'attacks'
) mapped(attack);

do $validate_attack_map$
begin
  if (select count(*) from rehearsal.attack_map) <> 31 then
    raise exception 'attack map must contain 31 historical rows (18 v1 + 12 v2 + V2-7), got %',
      (select count(*) from rehearsal.attack_map);
  end if;
  if (select count(*) from rehearsal.attack_map
       where suite = 'v1' and counted_in_18_plus_12) <> 18 then
    raise exception 'attack map v1 counted denominator is not exactly 18';
  end if;
  if (select count(*) from rehearsal.attack_map
       where suite = 'v2' and counted_in_18_plus_12) <> 12 then
    raise exception 'attack map v2 counted denominator is not exactly 12';
  end if;
  if (select counted_in_18_plus_12 from rehearsal.attack_map
       where historical_id = 'V2-7') is distinct from false then
    raise exception 'V2-7 must remain an additional, uncounted historical positive';
  end if;
  if exists (
    select executable_id
    from rehearsal.attack_map m,
      lateral unnest(m.executable_ids) executable(executable_id)
    group by executable_id
    having count(*) <> 1
  ) then
    raise exception 'attack map contains duplicate executable IDs';
  end if;
end
$validate_attack_map$;

create table rehearsal.attack_results (
  pass_number integer not null check (pass_number in (1, 2)),
  suite text not null check (suite in ('v1', 'v2')),
  historical_id text not null references rehearsal.attack_map (historical_id),
  executable_id text not null,
  disposition text not null check (disposition in ('refused', 'asserted')),
  actual_sqlstate text,
  actual_message text not null,
  recorded_at timestamptz not null default statement_timestamp(),
  primary key (pass_number, executable_id)
);

create table rehearsal.pass_results (
  pass_number integer not null check (pass_number in (1, 2)),
  phase text not null,
  status text not null check (status in ('pass')),
  detail jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default statement_timestamp(),
  primary key (pass_number, phase)
);

create table rehearsal.narrative_fixtures (
  pass_number integer not null check (pass_number in (1, 2)),
  fixture_key text not null,
  staging_id text not null,
  invitation_id uuid not null,
  primary key (pass_number, fixture_key)
);

create or replace function rehearsal.record_attack_result(
  p_pass_number integer,
  p_suite text,
  p_historical_id text,
  p_executable_id text,
  p_disposition text,
  p_actual_sqlstate text,
  p_actual_message text
)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1
    from rehearsal.attack_map m
    where m.historical_id = p_historical_id
      and m.suite = p_suite
      and p_executable_id = any(m.executable_ids)
  ) then
    raise exception 'unmapped narrative execution % / % / %',
      p_suite, p_historical_id, p_executable_id;
  end if;

  insert into rehearsal.attack_results (
    pass_number,
    suite,
    historical_id,
    executable_id,
    disposition,
    actual_sqlstate,
    actual_message
  ) values (
    p_pass_number,
    p_suite,
    p_historical_id,
    p_executable_id,
    p_disposition,
    p_actual_sqlstate,
    p_actual_message
  );
end;
$$;

create or replace function rehearsal.expect_refusal_record(
  p_pass_number integer,
  p_suite text,
  p_historical_id text,
  p_executable_id text,
  p_command text,
  p_expected_sqlstate text,
  p_expected_message text,
  p_match_mode text default 'exact'
)
returns void
language plpgsql
as $$
declare
  did_fail boolean := false;
  failure_sqlstate text;
  failure_message text;
begin
  begin
    execute p_command;
  exception when others then
    did_fail := true;
    get stacked diagnostics
      failure_sqlstate = returned_sqlstate,
      failure_message = message_text;
  end;

  if not did_fail then
    raise exception 'FAIL %: narrative attack unexpectedly succeeded: %',
      p_executable_id, p_command;
  end if;
  if failure_sqlstate is distinct from p_expected_sqlstate then
    raise exception 'FAIL %: expected SQLSTATE %, got % (%)',
      p_executable_id, p_expected_sqlstate, failure_sqlstate, failure_message;
  end if;
  if p_match_mode = 'exact' and failure_message is distinct from p_expected_message then
    raise exception 'FAIL %: expected exact refusal %, got %',
      p_executable_id, p_expected_message, failure_message;
  elsif p_match_mode = 'like' and failure_message not like p_expected_message then
    raise exception 'FAIL %: expected refusal pattern %, got %',
      p_executable_id, p_expected_message, failure_message;
  elsif p_match_mode not in ('exact', 'like') then
    raise exception 'FAIL %: unsupported message match mode %',
      p_executable_id, p_match_mode;
  end if;

  perform rehearsal.record_attack_result(
    p_pass_number,
    p_suite,
    p_historical_id,
    p_executable_id,
    'refused',
    failure_sqlstate,
    failure_message
  );
  raise notice 'PASS %: refused with SQLSTATE % (%).',
    p_executable_id, failure_sqlstate, failure_message;
end;
$$;

create or replace function rehearsal.assert_attack_record(
  p_pass_number integer,
  p_suite text,
  p_historical_id text,
  p_executable_id text,
  p_value boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_value is distinct from true then
    raise exception 'FAIL %: %', p_executable_id, p_message;
  end if;
  perform rehearsal.record_attack_result(
    p_pass_number,
    p_suite,
    p_historical_id,
    p_executable_id,
    'asserted',
    null,
    p_message
  );
  raise notice 'PASS %: %.', p_executable_id, p_message;
end;
$$;

create or replace function rehearsal.record_phase(
  p_pass_number integer,
  p_phase text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language sql
as $$
  insert into rehearsal.pass_results (
    pass_number, phase, status, detail
  ) values (
    p_pass_number, p_phase, 'pass', p_detail
  );
$$;

create or replace function rehearsal.assert_attack_coverage(p_pass_number integer)
returns void
language plpgsql
as $$
declare
  missing_id text;
  extra_id text;
begin
  select expected.executable_id
    into missing_id
  from (
    select m.suite, m.historical_id, executable_id
    from rehearsal.attack_map m,
      lateral unnest(m.executable_ids) executable(executable_id)
  ) expected
  left join rehearsal.attack_results actual
    on actual.pass_number = p_pass_number
   and actual.executable_id = expected.executable_id
   and actual.historical_id = expected.historical_id
   and actual.suite = expected.suite
  where actual.executable_id is null
  order by expected.executable_id
  limit 1;

  if missing_id is not null then
    raise exception 'pass % is missing mapped narrative execution %',
      p_pass_number, missing_id;
  end if;

  select actual.executable_id
    into extra_id
  from rehearsal.attack_results actual
  left join (
    select m.suite, m.historical_id, executable_id
    from rehearsal.attack_map m,
      lateral unnest(m.executable_ids) executable(executable_id)
  ) expected
    on expected.executable_id = actual.executable_id
   and expected.historical_id = actual.historical_id
   and expected.suite = actual.suite
  where actual.pass_number = p_pass_number
    and expected.executable_id is null
  order by actual.executable_id
  limit 1;

  if extra_id is not null then
    raise exception 'pass % contains unmapped narrative execution %',
      p_pass_number, extra_id;
  end if;

  if (select count(*) from rehearsal.attack_results
      where pass_number = p_pass_number) <>
     (select sum(cardinality(executable_ids)) from rehearsal.attack_map) then
    raise exception 'pass % narrative result cardinality is incomplete', p_pass_number;
  end if;
end;
$$;

grant select on rehearsal.attack_map to public;
grant select, insert on rehearsal.attack_results to public;
grant select, insert, delete on rehearsal.narrative_fixtures to public;
grant select, insert on rehearsal.pass_results to public;
grant execute on function rehearsal.record_attack_result(
  integer, text, text, text, text, text, text
) to public;
grant execute on function rehearsal.expect_refusal_record(
  integer, text, text, text, text, text, text, text
) to public;
grant execute on function rehearsal.assert_attack_record(
  integer, text, text, text, boolean, text
) to public;
grant execute on function rehearsal.record_phase(integer, text, jsonb) to public;
grant execute on function rehearsal.assert_attack_coverage(integer) to public;

-- Normalized public-catalog and data inventories make the first apply a
-- concrete delta. The second apply must reproduce that exact logical delta,
-- an in-place refusal must change neither catalog nor data, and each rollback
-- must restore the exact baseline.
create table rehearsal.public_catalog_inventory (
  capture_label text not null,
  object_kind text not null,
  object_identity text not null,
  definition text not null,
  primary key (capture_label, object_kind, object_identity)
);

create table rehearsal.public_data_inventory (
  capture_label text not null,
  object_kind text not null,
  object_identity text not null,
  row_count bigint not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  primary key (capture_label, object_kind, object_identity)
);

create table rehearsal.first_apply_delta (
  object_kind text not null,
  object_identity text not null,
  definition text not null,
  primary key (object_kind, object_identity)
);

create or replace function rehearsal.normalize_catalog_definition(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(replace(coalesce(p_value, ''), E'\r\n', E'\n'), '[[:space:]]+', ' ', 'g');
$$;

create or replace function rehearsal.normalized_acl(
  p_acl aclitem[],
  p_object_type "char",
  p_owner oid
)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'grantor', grantor_role.rolname,
        'grantee', case when exploded.grantee = 0 then 'PUBLIC' else grantee_role.rolname end,
        'privilege', exploded.privilege_type,
        'grantable', exploded.is_grantable
      )
      order by
        case when exploded.grantee = 0 then 'PUBLIC' else grantee_role.rolname end,
        exploded.privilege_type,
        exploded.is_grantable
    ),
    '[]'::jsonb
  )
  from aclexplode(coalesce(p_acl, acldefault(p_object_type, p_owner))) exploded
  left join pg_roles grantor_role on grantor_role.oid = exploded.grantor
  left join pg_roles grantee_role on grantee_role.oid = exploded.grantee;
$$;

create or replace function rehearsal.capture_public_catalog(p_capture_label text)
returns void
language plpgsql
as $$
begin
  delete from rehearsal.public_catalog_inventory
   where capture_label = p_capture_label;

  insert into rehearsal.public_catalog_inventory
    (capture_label, object_kind, object_identity, definition)
  select
    p_capture_label,
    'table',
    format('%I.%I', n.nspname, c.relname),
    jsonb_build_object(
      'owner', owner_role.rolname,
      'persistence', c.relpersistence,
      'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity,
      'acl', rehearsal.normalized_acl(c.relacl, 'r'::"char", c.relowner),
      'comment', obj_description(c.oid, 'pg_class')
    )::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_roles owner_role on owner_role.oid = c.relowner
  where n.nspname = 'public'
    and c.relkind in ('r', 'p');

  insert into rehearsal.public_catalog_inventory
    (capture_label, object_kind, object_identity, definition)
  select
    p_capture_label,
    'column',
    format('%I.%I.%I', n.nspname, c.relname, a.attname),
    jsonb_build_object(
      'position', a.attnum,
      'type', format_type(a.atttypid, a.atttypmod),
      'not_null', a.attnotnull,
      'default', pg_get_expr(d.adbin, d.adrelid),
      'identity', a.attidentity,
      'generated', a.attgenerated,
      'collation', case when a.attcollation = 0 then null else a.attcollation::regcollation::text end,
      'comment', col_description(c.oid, a.attnum)
    )::text
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and a.attnum > 0
    and not a.attisdropped;

  insert into rehearsal.public_catalog_inventory
    (capture_label, object_kind, object_identity, definition)
  select
    p_capture_label,
    'function',
    format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
    jsonb_build_object(
      'definition', rehearsal.normalize_catalog_definition(pg_get_functiondef(p.oid)),
      'owner', owner_role.rolname,
      'security_definer', p.prosecdef,
      'volatility', p.provolatile,
      'parallel', p.proparallel,
      'acl', rehearsal.normalized_acl(p.proacl, 'f'::"char", p.proowner),
      'comment', obj_description(p.oid, 'pg_proc')
    )::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_roles owner_role on owner_role.oid = p.proowner
  where n.nspname = 'public';

  insert into rehearsal.public_catalog_inventory
    (capture_label, object_kind, object_identity, definition)
  select
    p_capture_label,
    'trigger',
    format('%I.%I.%I', n.nspname, c.relname, t.tgname),
    jsonb_build_object(
      'enabled', t.tgenabled,
      'definition', rehearsal.normalize_catalog_definition(pg_get_triggerdef(t.oid, true))
    )::text
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal;

  insert into rehearsal.public_catalog_inventory
    (capture_label, object_kind, object_identity, definition)
  select
    p_capture_label,
    'sequence',
    format('%I.%I', n.nspname, c.relname),
    jsonb_build_object(
      'owner', owner_role.rolname,
      'type', format_type(s.seqtypid, null),
      'start', s.seqstart,
      'increment', s.seqincrement,
      'minimum', s.seqmin,
      'maximum', s.seqmax,
      'cache', s.seqcache,
      'cycle', s.seqcycle,
      'owned_by', owned.owned_by,
      'acl', rehearsal.normalized_acl(c.relacl, 'S'::"char", c.relowner)
    )::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_sequence s on s.seqrelid = c.oid
  join pg_roles owner_role on owner_role.oid = c.relowner
  left join lateral (
    select format('%I.%I.%I', tn.nspname, tc.relname, a.attname) as owned_by
    from pg_depend d
    join pg_class tc on tc.oid = d.refobjid
    join pg_namespace tn on tn.oid = tc.relnamespace
    join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
    where d.classid = 'pg_class'::regclass
      and d.objid = c.oid
      and d.refclassid = 'pg_class'::regclass
      and d.deptype in ('a', 'i')
    order by d.deptype
    limit 1
  ) owned on true
  where n.nspname = 'public'
    and c.relkind = 'S';

  insert into rehearsal.public_catalog_inventory
    (capture_label, object_kind, object_identity, definition)
  select
    p_capture_label,
    'index',
    format('%I.%I', n.nspname, index_class.relname),
    jsonb_build_object(
      'table', format('%I.%I', table_namespace.nspname, table_class.relname),
      'definition', rehearsal.normalize_catalog_definition(pg_get_indexdef(i.indexrelid)),
      'unique', i.indisunique,
      'primary', i.indisprimary,
      'valid', i.indisvalid,
      'ready', i.indisready,
      'live', i.indislive
    )::text
  from pg_index i
  join pg_class index_class on index_class.oid = i.indexrelid
  join pg_namespace n on n.oid = index_class.relnamespace
  join pg_class table_class on table_class.oid = i.indrelid
  join pg_namespace table_namespace on table_namespace.oid = table_class.relnamespace
  where n.nspname = 'public';

  insert into rehearsal.public_catalog_inventory
    (capture_label, object_kind, object_identity, definition)
  select
    p_capture_label,
    'constraint',
    format('%I.%I.%I', n.nspname, c.relname, con.conname),
    jsonb_build_object(
      'type', con.contype,
      'definition', rehearsal.normalize_catalog_definition(pg_get_constraintdef(con.oid, true)),
      'validated', con.convalidated,
      'deferrable', con.condeferrable,
      'initially_deferred', con.condeferred
    )::text
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public';

  insert into rehearsal.public_catalog_inventory
    (capture_label, object_kind, object_identity, definition)
  select
    p_capture_label,
    'row_type',
    format('%I.%I', n.nspname, t.typname),
    jsonb_build_object(
      'relation', format('%I.%I', n.nspname, c.relname),
      'relation_kind', c.relkind,
      'owner', owner_role.rolname
    )::text
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  join pg_class c on c.oid = t.typrelid
  join pg_roles owner_role on owner_role.oid = t.typowner
  where n.nspname = 'public'
    and t.typtype = 'c'
    and c.relkind in ('r', 'p', 'v', 'm', 'f');

  insert into rehearsal.public_catalog_inventory
    (capture_label, object_kind, object_identity, definition)
  select
    p_capture_label,
    'policy',
    format('%I.%I.%I', n.nspname, c.relname, policy.polname),
    jsonb_build_object(
      'command', policy.polcmd,
      'permissive', policy.polpermissive,
      'roles', (
        select coalesce(array_agg(
          case when policy_role.role_oid = 0 then 'PUBLIC' else role_name.rolname end
          order by case when policy_role.role_oid = 0 then 'PUBLIC' else role_name.rolname end
        ), '{}'::text[])
        from unnest(policy.polroles) as policy_role(role_oid)
        left join pg_roles role_name on role_name.oid = policy_role.role_oid
      ),
      'using', rehearsal.normalize_catalog_definition(pg_get_expr(policy.polqual, policy.polrelid)),
      'check', rehearsal.normalize_catalog_definition(pg_get_expr(policy.polwithcheck, policy.polrelid))
    )::text
  from pg_policy policy
  join pg_class c on c.oid = policy.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public';
end;
$$;

create or replace function rehearsal.capture_public_data(p_capture_label text)
returns void
language plpgsql
as $$
declare
  relation_row record;
  captured_count bigint;
  captured_hash text;
begin
  delete from rehearsal.public_data_inventory
   where capture_label = p_capture_label;

  for relation_row in
    select n.nspname, c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
    order by c.relname
  loop
    execute format(
      $capture_table$
        select
          count(*)::bigint,
          encode(sha256(convert_to(
            coalesce(
              jsonb_agg(to_jsonb(captured_row) order by to_jsonb(captured_row)::text),
              '[]'::jsonb
            )::text,
            'UTF8'
          )), 'hex')
        from %I.%I captured_row
      $capture_table$,
      relation_row.nspname,
      relation_row.relname
    ) into captured_count, captured_hash;

    insert into rehearsal.public_data_inventory (
      capture_label, object_kind, object_identity, row_count, content_sha256
    ) values (
      p_capture_label,
      'table_data',
      format('%I.%I', relation_row.nspname, relation_row.relname),
      captured_count,
      captured_hash
    );
  end loop;

  for relation_row in
    select n.nspname, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
    order by c.relname
  loop
    execute format(
      $capture_sequence$
        select
          1::bigint,
          encode(sha256(convert_to(
            jsonb_build_object(
              'last_value', last_value,
              'is_called', is_called
            )::text,
            'UTF8'
          )), 'hex')
        from %I.%I
      $capture_sequence$,
      relation_row.nspname,
      relation_row.relname
    ) into captured_count, captured_hash;

    insert into rehearsal.public_data_inventory (
      capture_label, object_kind, object_identity, row_count, content_sha256
    ) values (
      p_capture_label,
      'sequence_data',
      format('%I.%I', relation_row.nspname, relation_row.relname),
      captured_count,
      captured_hash
    );
  end loop;
end;
$$;

create or replace function rehearsal.capture_public_state(p_capture_label text)
returns void
language plpgsql
as $$
begin
  perform rehearsal.capture_public_catalog(p_capture_label);
  perform rehearsal.capture_public_data(p_capture_label);
end;
$$;

create or replace function rehearsal.assert_public_state_equal(
  p_expected_label text,
  p_actual_label text
)
returns void
language plpgsql
as $$
declare
  mismatch text;
begin
  select format('%s %s', object_kind, object_identity)
    into mismatch
  from (
    (
      select object_kind, object_identity, definition
      from rehearsal.public_catalog_inventory
      where capture_label = p_expected_label
      except
      select object_kind, object_identity, definition
      from rehearsal.public_catalog_inventory
      where capture_label = p_actual_label
    )
    union all
    (
      select object_kind, object_identity, definition
      from rehearsal.public_catalog_inventory
      where capture_label = p_actual_label
      except
      select object_kind, object_identity, definition
      from rehearsal.public_catalog_inventory
      where capture_label = p_expected_label
    )
  ) difference
  order by object_kind, object_identity
  limit 1;

  if mismatch is not null then
    raise exception 'public catalog snapshots % and % differ at %',
      p_expected_label, p_actual_label, mismatch;
  end if;

  select format('%s %s', object_kind, object_identity)
    into mismatch
  from (
    (
      select object_kind, object_identity, row_count, content_sha256
      from rehearsal.public_data_inventory
      where capture_label = p_expected_label
      except
      select object_kind, object_identity, row_count, content_sha256
      from rehearsal.public_data_inventory
      where capture_label = p_actual_label
    )
    union all
    (
      select object_kind, object_identity, row_count, content_sha256
      from rehearsal.public_data_inventory
      where capture_label = p_actual_label
      except
      select object_kind, object_identity, row_count, content_sha256
      from rehearsal.public_data_inventory
      where capture_label = p_expected_label
    )
  ) difference
  order by object_kind, object_identity
  limit 1;

  if mismatch is not null then
    raise exception 'public data snapshots % and % differ at %',
      p_expected_label, p_actual_label, mismatch;
  end if;
end;
$$;

-- Deliberately hostile platform defaults. The candidate must remove every
-- inherited grant from its own tables, sequences, and routines before commit.
alter default privileges for role postgres in schema public
  grant all privileges on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

select rehearsal.capture_public_state('baseline');
