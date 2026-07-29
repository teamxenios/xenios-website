\set ON_ERROR_STOP on

do $verify$
declare v_table text; v_grants integer; v_rpcs integer;
begin
  foreach v_table in array array[
    'research_affiliate_partners','research_affiliate_links',
    'research_affiliate_attribution_events','research_affiliate_commission_events',
    'research_affiliate_statements','research_affiliate_statement_items',
    'research_professional_accounts',
    'research_operations_crm_accounts','research_lawrence_configurations',
    'research_commercial_events'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = v_table
         and c.relrowsecurity and c.relforcerowsecurity
    ) then raise exception 'RLS is not forced on %', v_table; end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_table)
       or has_table_privilege('anon', 'public.' || v_table, 'select')
       or has_table_privilege('authenticated', 'public.' || v_table, 'select') then
      raise exception 'browser exposure remains on %', v_table;
    end if;
  end loop;
  select count(*) into v_grants from information_schema.role_table_grants
   where grantee = 'service_role' and table_schema = 'public'
     and table_name in (
       'research_affiliate_partners','research_affiliate_links',
       'research_affiliate_attribution_events','research_affiliate_commission_events',
       'research_affiliate_statements','research_affiliate_statement_items',
       'research_professional_accounts',
       'research_operations_crm_accounts','research_lawrence_configurations',
       'research_commercial_events'
     );
  if v_grants <> 10 then raise exception 'expected 10 SELECT-only grants, found %', v_grants; end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where grantee = 'service_role' and table_schema = 'public'
       and table_name in (
         'research_affiliate_partners','research_affiliate_links',
         'research_affiliate_attribution_events','research_affiliate_commission_events',
         'research_affiliate_statements','research_affiliate_statement_items',
         'research_professional_accounts',
         'research_operations_crm_accounts','research_lawrence_configurations',
         'research_commercial_events'
       ) and privilege_type <> 'SELECT'
  ) then raise exception 'service role retains commercial DML'; end if;
  select count(*) into v_rpcs from (
    values
      ('public.research_affiliate_configure_partner(uuid,uuid,text,text,text,text,text,bigint,text,timestamp with time zone)'),
      ('public.research_affiliate_create_link(uuid,uuid,text,text,text,bigint,text,timestamp with time zone)'),
      ('public.research_affiliate_record_attribution(uuid,uuid,uuid,uuid,text,timestamp with time zone)'),
      ('public.research_affiliate_record_commission(uuid,uuid,uuid,text,text,text,text,text,timestamp with time zone)'),
      ('public.research_affiliate_publish_statement(uuid,uuid,date,date,text,uuid,text,timestamp with time zone)'),
      ('public.research_operations_configure_professional(uuid,uuid,text,text,text,text,bigint,text,timestamp with time zone)'),
      ('public.research_operations_configure_lawrence(uuid,uuid,text,integer,integer,bigint,text,jsonb,bigint,bigint,text,bigint,text,timestamp with time zone)'),
      ('public.research_operations_command_center()')
  ) command(signature)
  where has_function_privilege('service_role', signature, 'execute');
  if v_rpcs <> 8 then raise exception 'expected 8 reviewed RPCs, found %', v_rpcs; end if;
  if not exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and indexname = 'research_lawrence_one_current_idx'
       and indexdef like '%UNIQUE INDEX%'
       and indexdef like '%WHERE (state <> ''superseded''::text)%'
  ) then
    raise exception 'Lawrence one-current uniqueness is unavailable';
  end if;
end;
$verify$;

-- Two-session Lawrence edit and payout replay proof. This block commits only
-- disposable verifier rows, then removes them and proves zero residual state.
create extension if not exists dblink;

begin;
insert into auth.users(id, email) values
  ('80000000-0000-4000-8000-000000000021', 'commercial-race@example.invalid');
insert into public.research_prelaunch_role_assignments(
  auth_user_id, role, assigned_by, reason, granted_at
) values (
  '80000000-0000-4000-8000-000000000021',
  'operations_admin', 'verifier', 'Commercial concurrency proof',
  '2026-07-28T15:00:00.000Z'
);
select (
  public.research_affiliate_configure_partner(
    '80000000-0000-4000-8000-000000000021', null, 'RACE_PARTNER',
    'Race partner', 'active', 'Verified disclosure', 'AGREEMENT-RACE-V1',
    0, 'affiliate:race:partner', '2026-07-28T15:01:00.000Z'
  )->>'recordId'
)::uuid as race_partner_id \gset
select set_config('xenios.verify.race_partner_id', :'race_partner_id', false);
select (
  public.research_operations_configure_lawrence(
    '80000000-0000-4000-8000-000000000021', :'race_partner_id',
    'AGREEMENT-RACE-V1', 30, 0, 0, 'USD',
    jsonb_build_array(
      jsonb_build_object('thresholdCents', 0, 'rateBasisPoints', 1000)
    ),
    null, null, 'active', 0, 'lawrence:race:v1',
    '2026-07-28T15:02:00.000Z'
  )->>'recordId'
)::uuid as race_lawrence_one_id \gset
commit;

create or replace function public.research_verify_try_lawrence_edit(
  p_partner_id uuid,
  p_agreement_version text,
  p_rate_basis_points integer,
  p_idempotency_key text
)
returns text
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform public.research_operations_configure_lawrence(
    '80000000-0000-4000-8000-000000000021',
    p_partner_id,
    p_agreement_version,
    30, 0, 0, 'USD',
    jsonb_build_array(
      jsonb_build_object(
        'thresholdCents', 0,
        'rateBasisPoints', p_rate_basis_points
      )
    ),
    null, null, 'active', 1, p_idempotency_key,
    '2026-07-28T15:03:00.000Z'
  );
  return 'committed';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

create temporary table research_verify_concurrency_results (
  lane text primary key,
  result text not null
);

select dblink_connect('lawrence_edit_one', 'dbname=' || current_database());
select dblink_connect('lawrence_edit_two', 'dbname=' || current_database());
select dblink_exec('lawrence_edit_one', 'begin');
select dblink_send_query(
  'lawrence_edit_one',
  format(
    'select public.research_verify_try_lawrence_edit(%L::uuid,%L,%s,%L)',
    :'race_partner_id', 'AGREEMENT-RACE-V2A', 1100, 'lawrence:race:v2a'
  )
);
insert into research_verify_concurrency_results(lane, result)
select 'lawrence_one', result
from dblink_get_result('lawrence_edit_one') as response(result text);
select * from dblink_get_result('lawrence_edit_one') as response(result text);
select dblink_send_query(
  'lawrence_edit_two',
  format(
    'select public.research_verify_try_lawrence_edit(%L::uuid,%L,%s,%L)',
    :'race_partner_id', 'AGREEMENT-RACE-V2B', 1200, 'lawrence:race:v2b'
  )
);
select pg_sleep(0.1);
do $verify$
begin
  if dblink_is_busy('lawrence_edit_two') <> 1 then
    raise exception 'concurrent Lawrence edit did not serialize';
  end if;
end;
$verify$;
select dblink_exec('lawrence_edit_one', 'commit');
insert into research_verify_concurrency_results(lane, result)
select 'lawrence_two', result
from dblink_get_result('lawrence_edit_two') as response(result text);
select * from dblink_get_result('lawrence_edit_two') as response(result text);
select dblink_disconnect('lawrence_edit_one');
select dblink_disconnect('lawrence_edit_two');

do $verify$
declare v_replay text;
begin
  if (select result from research_verify_concurrency_results
       where lane = 'lawrence_one') <> 'committed'
     or (select result from research_verify_concurrency_results
          where lane = 'lawrence_two') not like '%version conflict%'
     or (select count(*) from public.research_lawrence_configurations
          where partner_id = current_setting('xenios.verify.race_partner_id', true)::uuid) <> 2
     or (select count(*) from public.research_lawrence_configurations
          where partner_id = current_setting('xenios.verify.race_partner_id', true)::uuid
            and state <> 'superseded' and version = 2) <> 1 then
    raise exception 'concurrent Lawrence edit violated one-current versioning';
  end if;
  v_replay := public.research_verify_try_lawrence_edit(
    current_setting('xenios.verify.race_partner_id', true)::uuid,
    'AGREEMENT-RACE-V2A', 1100, 'lawrence:race:v2a'
  );
  if v_replay <> 'committed'
     or (select count(*) from public.research_lawrence_configurations
          where partner_id = current_setting('xenios.verify.race_partner_id', true)::uuid) <> 2 then
    raise exception 'concurrent Lawrence winner did not replay exactly';
  end if;
end;
$verify$;

drop function public.research_verify_try_lawrence_edit(uuid,text,integer,text);

select (
  public.research_affiliate_create_link(
    '80000000-0000-4000-8000-000000000021', :'race_partner_id',
    'RACE_LINK', '/research', 'race', 0, 'affiliate:race:link',
    '2026-07-28T15:04:00.000Z'
  )->>'recordId'
)::uuid as race_link_id \gset
insert into public.research_commerce_paid_order_economics_fixture(
  order_id, affiliate_link_id, state, captured_cents,
  refunded_cents, currency, version
) values (
  '80000000-0000-4000-8000-000000000022', :'race_link_id', 'paid',
  10000, 0, 'USD', 1
);
select (
  public.research_affiliate_record_attribution(
    '80000000-0000-4000-8000-000000000021', :'race_partner_id', :'race_link_id',
    '80000000-0000-4000-8000-000000000022',
    'affiliate:race:attribution', '2026-07-28T15:05:00.000Z'
  )->>'recordId'
)::uuid as race_attribution_id \gset
select public.research_affiliate_record_commission(
  '80000000-0000-4000-8000-000000000021', :'race_partner_id', :'race_attribution_id',
  'accrue', null, null, null, 'affiliate:race:accrue',
  '2026-07-28T15:06:00.000Z'
);
select public.research_affiliate_record_commission(
  '80000000-0000-4000-8000-000000000021', :'race_partner_id', :'race_attribution_id',
  'approve', null, null, null, 'affiliate:race:approve',
  '2026-07-28T15:07:00.000Z'
);
select public.research_affiliate_record_commission(
  '80000000-0000-4000-8000-000000000021', :'race_partner_id', :'race_attribution_id',
  'make_payable', null, null, null, 'affiliate:race:payable',
  '2026-07-28T15:08:00.000Z'
);

create function public.research_verify_fail_paid_audit()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.action = 'commission_mark_paid' then
    raise exception 'injected payout audit failure';
  end if;
  return new;
end;
$$;
create trigger research_verify_fail_paid_audit
before insert on public.research_commercial_events
for each row execute function public.research_verify_fail_paid_audit();
select set_config('xenios.verify.race_partner_id', :'race_partner_id', false);
select set_config('xenios.verify.race_attribution_id', :'race_attribution_id', false);
do $verify$
begin
  begin
    perform public.research_affiliate_record_commission(
      '80000000-0000-4000-8000-000000000021',
      current_setting('xenios.verify.race_partner_id')::uuid,
      current_setting('xenios.verify.race_attribution_id')::uuid,
      'mark_paid', null, 'verified_payout_ledger', 'PAYOUT-CRASH-001',
      'affiliate:race:paid:crash', '2026-07-28T15:09:00.000Z'
    );
    raise exception 'payout audit crash unexpectedly committed';
  exception when others then
    if sqlerrm = 'payout audit crash unexpectedly committed' then raise; end if;
  end;
  if exists (
    select 1 from public.research_affiliate_commission_events
     where attribution_event_id = current_setting('xenios.verify.race_attribution_id')::uuid
       and action = 'mark_paid'
  ) then
    raise exception 'payout audit crash left partial paid evidence';
  end if;
end;
$verify$;
drop trigger research_verify_fail_paid_audit on public.research_commercial_events;
drop function public.research_verify_fail_paid_audit();

truncate table research_verify_concurrency_results;
select dblink_connect('payout_one', 'dbname=' || current_database());
select dblink_connect('payout_two', 'dbname=' || current_database());
select dblink_send_query(
  'payout_one',
  format(
    'select public.research_affiliate_record_commission(%L::uuid,%L::uuid,%L::uuid,%L,null,%L,%L,%L,%L::timestamptz)',
    '80000000-0000-4000-8000-000000000021', :'race_partner_id',
    :'race_attribution_id', 'mark_paid', 'verified_payout_ledger',
    'PAYOUT-CONCURRENT-001', 'affiliate:race:paid', '2026-07-28T15:09:00.000Z'
  )
);
select dblink_send_query(
  'payout_two',
  format(
    'select public.research_affiliate_record_commission(%L::uuid,%L::uuid,%L::uuid,%L,null,%L,%L,%L,%L::timestamptz)',
    '80000000-0000-4000-8000-000000000021', :'race_partner_id',
    :'race_attribution_id', 'mark_paid', 'verified_payout_ledger',
    'PAYOUT-CONCURRENT-001', 'affiliate:race:paid', '2026-07-28T15:09:00.000Z'
  )
);
insert into research_verify_concurrency_results(lane, result)
select 'payout_one', result::text
from dblink_get_result('payout_one') as response(result jsonb);
select * from dblink_get_result('payout_one') as response(result jsonb);
insert into research_verify_concurrency_results(lane, result)
select 'payout_two', result::text
from dblink_get_result('payout_two') as response(result jsonb);
select * from dblink_get_result('payout_two') as response(result jsonb);
select dblink_disconnect('payout_one');
select dblink_disconnect('payout_two');

do $verify$
begin
  if (select count(*) from public.research_affiliate_commission_events
       where attribution_event_id = current_setting('xenios.verify.race_attribution_id')::uuid
         and action = 'mark_paid') <> 1
     or (select count(*) from research_verify_concurrency_results
          where result::jsonb->>'idempotentReplay' = 'true') <> 1
     or (select count(*) from research_verify_concurrency_results
          where result::jsonb->>'idempotentReplay' = 'false') <> 1 then
    raise exception 'concurrent payout evidence did not replay exactly once';
  end if;
end;
$verify$;

truncate table
  public.research_affiliate_statement_items,
  public.research_affiliate_statements,
  public.research_affiliate_commission_events,
  public.research_affiliate_attribution_events,
  public.research_affiliate_links,
  public.research_lawrence_configurations,
  public.research_affiliate_partners,
  public.research_professional_accounts,
  public.research_operations_crm_accounts,
  public.research_commercial_events
cascade;
delete from public.research_commerce_paid_order_economics_fixture
 where order_id = '80000000-0000-4000-8000-000000000022';
delete from public.research_prelaunch_role_assignments
 where auth_user_id = '80000000-0000-4000-8000-000000000021';
delete from auth.users
 where id = '80000000-0000-4000-8000-000000000021';

do $verify$
declare v_count bigint;
begin
  select sum(row_count) into v_count from (
    select count(*) row_count from public.research_affiliate_partners
    union all select count(*) from public.research_affiliate_links
    union all select count(*) from public.research_affiliate_attribution_events
    union all select count(*) from public.research_affiliate_commission_events
    union all select count(*) from public.research_affiliate_statements
    union all select count(*) from public.research_affiliate_statement_items
    union all select count(*) from public.research_professional_accounts
    union all select count(*) from public.research_operations_crm_accounts
    union all select count(*) from public.research_lawrence_configurations
    union all select count(*) from public.research_commercial_events
  ) rows;
  if v_count <> 0 then
    raise exception 'commercial concurrency cleanup left % residual rows', v_count;
  end if;
end;
$verify$;

set role service_role;
do $verify$
begin
  begin
    insert into public.research_affiliate_partners(
      partner_code, display_name, state, version, created_by, created_at, updated_by, updated_at
    ) values (
      'BYPASS', 'Bypass', 'under_review', 1, gen_random_uuid(), now(), gen_random_uuid(), now()
    );
    raise exception 'direct service affiliate DML unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$verify$;
reset role;

begin;
insert into auth.users(id, email) values
  ('80000000-0000-4000-8000-000000000001', 'commercial@example.invalid'),
  ('80000000-0000-4000-8000-000000000002', 'other@example.invalid');
insert into public.research_prelaunch_role_assignments(
  auth_user_id, role, assigned_by, reason, granted_at
) values
  ('80000000-0000-4000-8000-000000000001','operations_admin','verifier','Commercial proof','2026-07-28T14:00:00.000Z'),
  ('80000000-0000-4000-8000-000000000002','operations_admin','verifier','Actor isolation proof','2026-07-28T14:00:00.000Z');

select (
  public.research_affiliate_configure_partner(
    '80000000-0000-4000-8000-000000000001', null, 'LAWRENCE',
    'Lawrence partner', 'active', 'Verified affiliate disclosure',
    'AGREEMENT-LAWRENCE-V1', 0, 'affiliate:partner:1',
    '2026-07-28T14:01:00.000Z'
  )->>'recordId'
)::uuid as partner_id \gset

select (
  public.research_affiliate_create_link(
    '80000000-0000-4000-8000-000000000001', :'partner_id',
    'LAWRENCE_MAIN', '/research', 'launch', 0, 'affiliate:link:1',
    '2026-07-28T14:02:00.000Z'
  )->>'recordId'
)::uuid as link_id \gset

select (
  public.research_operations_configure_lawrence(
  '80000000-0000-4000-8000-000000000001', :'partner_id',
  'AGREEMENT-LAWRENCE-V1', 30, 15, 5000, 'USD',
  jsonb_build_array(
    jsonb_build_object('thresholdCents', 0, 'rateBasisPoints', 1000),
    jsonb_build_object('thresholdCents', 100000, 'rateBasisPoints', 1250)
  ),
  2500, null, 'active', 0, 'lawrence:config:1',
  '2026-07-28T14:03:00.000Z'
  )->>'recordId'
)::uuid as lawrence_config_id \gset

insert into public.research_commerce_paid_order_economics_fixture(
  order_id, affiliate_link_id, state, captured_cents,
  refunded_cents, currency, version
) values (
  '80000000-0000-4000-8000-000000000010', :'link_id', 'paid',
  10000, 0, 'USD', 1
), (
  '80000000-0000-4000-8000-000000000011', :'link_id', 'paid',
  40000, 0, 'USD', 1
);

select (
  public.research_affiliate_record_attribution(
    '80000000-0000-4000-8000-000000000001', :'partner_id', :'link_id',
    '80000000-0000-4000-8000-000000000010',
    'affiliate:attribution:1', '2026-07-28T14:04:00.000Z'
  )->>'recordId'
)::uuid as attribution_id \gset

select set_config('xenios.verify.partner_id', :'partner_id', false);
select set_config('xenios.verify.attribution_id', :'attribution_id', false);

select public.research_affiliate_record_commission(
  '80000000-0000-4000-8000-000000000001', :'partner_id', :'attribution_id',
  'accrue', null, null, null, 'affiliate:commission:accrue:1',
  '2026-07-28T14:05:00.000Z'
);
select public.research_affiliate_record_commission(
  '80000000-0000-4000-8000-000000000001', :'partner_id', :'attribution_id',
  'approve', null, null, null, 'affiliate:commission:approve:1',
  '2026-07-28T14:06:00.000Z'
);

do $verify$
begin
  begin
    perform public.research_affiliate_record_commission(
      '80000000-0000-4000-8000-000000000001',
      current_setting('xenios.verify.partner_id')::uuid,
      current_setting('xenios.verify.attribution_id')::uuid,
      'make_payable', null, null, null, 'affiliate:commission:payable:early',
      '2026-07-28T14:07:00.000Z'
    );
    raise exception 'commission advanced before its configured hold';
  exception when others then
    if sqlerrm = 'commission advanced before its configured hold' then raise; end if;
  end;
  begin
    perform public.research_affiliate_record_commission(
      '80000000-0000-4000-8000-000000000001',
      current_setting('xenios.verify.partner_id')::uuid,
      current_setting('xenios.verify.attribution_id')::uuid,
      'make_payable', null, null, null, 'affiliate:commission:payable:below-threshold',
      '2026-08-13T14:07:00.000Z'
    );
    raise exception 'commission advanced below its configured threshold';
  exception when others then
    if sqlerrm = 'commission advanced below its configured threshold' then raise; end if;
  end;
end;
$verify$;

select (
  public.research_affiliate_record_attribution(
    '80000000-0000-4000-8000-000000000001', :'partner_id', :'link_id',
    '80000000-0000-4000-8000-000000000011',
    'affiliate:attribution:2', '2026-07-28T14:10:00.000Z'
  )->>'recordId'
)::uuid as attribution_two_id \gset

select public.research_affiliate_record_commission(
  '80000000-0000-4000-8000-000000000001', :'partner_id', :'attribution_two_id',
  'accrue', null, null, null, 'affiliate:commission:accrue:2',
  '2026-07-28T14:11:00.000Z'
);
select public.research_affiliate_record_commission(
  '80000000-0000-4000-8000-000000000001', :'partner_id', :'attribution_two_id',
  'approve', null, null, null, 'affiliate:commission:approve:2',
  '2026-07-28T14:12:00.000Z'
);
select public.research_affiliate_record_commission(
  '80000000-0000-4000-8000-000000000001', :'partner_id', :'attribution_id',
  'make_payable', null, null, null, 'affiliate:commission:payable:1',
  '2026-08-13T14:07:00.000Z'
);
select public.research_affiliate_record_commission(
  '80000000-0000-4000-8000-000000000001', :'partner_id', :'attribution_two_id',
  'make_payable', null, null, null, 'affiliate:commission:payable:2',
  '2026-08-13T14:08:00.000Z'
);

do $verify$
begin
  begin
    perform public.research_affiliate_record_commission(
      '80000000-0000-4000-8000-000000000001',
      current_setting('xenios.verify.partner_id')::uuid,
      current_setting('xenios.verify.attribution_id')::uuid,
      'mark_paid', null, null, null, 'affiliate:commission:paid:no-evidence',
      '2026-08-13T14:09:00.000Z'
    );
    raise exception 'paid commission advanced without payout evidence';
  exception when others then
    if sqlerrm = 'paid commission advanced without payout evidence' then raise; end if;
  end;
end;
$verify$;

select public.research_affiliate_record_commission(
  '80000000-0000-4000-8000-000000000001', :'partner_id', :'attribution_id',
  'mark_paid', null, 'verified_payout_ledger', 'PAYOUT-EVIDENCE-001',
  'affiliate:commission:paid:1', '2026-08-13T14:09:00.000Z'
);

select (
  public.research_affiliate_publish_statement(
    '80000000-0000-4000-8000-000000000001', :'partner_id',
    '2026-07-01', '2026-07-31', 'USD', null,
    'affiliate:statement:1', '2026-08-31T23:59:00.000Z'
  )->>'recordId'
)::uuid as statement_id \gset

select (
  public.research_affiliate_publish_statement(
    '80000000-0000-4000-8000-000000000001', :'partner_id',
    '2026-08-01', '2026-08-31', 'USD', null,
    'affiliate:statement:august', '2026-08-31T23:59:20.000Z'
  )->>'recordId'
)::uuid as august_statement_id \gset

update public.research_commerce_paid_order_economics_fixture
   set state = 'refunded',
       refunded_cents = captured_cents,
       version = version + 1
 where order_id = '80000000-0000-4000-8000-000000000010';

select public.research_affiliate_record_commission(
  '80000000-0000-4000-8000-000000000001', :'partner_id', :'attribution_id',
  'reverse', 'Verified paid-order refund', null, null,
  'affiliate:commission:reverse:1', '2026-09-01T00:00:00.000Z'
);

select (
  public.research_affiliate_publish_statement(
    '80000000-0000-4000-8000-000000000001', :'partner_id',
    '2026-07-01', '2026-07-31', 'USD', :'statement_id',
    'affiliate:statement:2', '2026-09-01T00:01:00.000Z'
  )->>'recordId'
)::uuid as replacement_statement_id \gset

select public.research_operations_configure_professional(
  '80000000-0000-4000-8000-000000000001', null,
  'Verified Professional LLC', 'wholesale', 'active', 'AGREEMENT-PRO-V1',
  0, 'professional:account:1', '2026-07-28T14:08:00.000Z'
);

select (
  public.research_operations_configure_lawrence(
    '80000000-0000-4000-8000-000000000001', :'partner_id',
    'AGREEMENT-LAWRENCE-V2', 30, 15, 5000, 'USD',
    jsonb_build_array(
      jsonb_build_object('thresholdCents', 0, 'rateBasisPoints', 1100),
      jsonb_build_object('thresholdCents', 100000, 'rateBasisPoints', 1300)
    ),
    2500, null, 'active', 1, 'lawrence:config:2',
    '2026-07-28T14:09:00.000Z'
  )->>'recordId'
)::uuid as lawrence_config_two_id \gset

create function public.research_verify_fail_lawrence_v3()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.version = 3 then
    raise exception 'injected Lawrence insert failure';
  end if;
  return new;
end;
$$;

create trigger research_verify_fail_lawrence_v3
before insert on public.research_lawrence_configurations
for each row execute function public.research_verify_fail_lawrence_v3();

do $verify$
declare v_event_count bigint;
begin
  select count(*) into v_event_count
    from public.research_commercial_events;
  begin
    perform public.research_operations_configure_lawrence(
      '80000000-0000-4000-8000-000000000001',
      current_setting('xenios.verify.partner_id')::uuid,
      'AGREEMENT-LAWRENCE-V3', 30, 15, 5000, 'USD',
      jsonb_build_array(
        jsonb_build_object('thresholdCents', 0, 'rateBasisPoints', 1200)
      ),
      2500, null, 'active', 2, 'lawrence:config:crash',
      '2026-09-01T00:02:00.000Z'
    );
    raise exception 'injected Lawrence crash unexpectedly committed';
  exception when others then
    if sqlerrm = 'injected Lawrence crash unexpectedly committed' then raise; end if;
  end;
  if (select count(*) from public.research_lawrence_configurations) <> 2
     or (select count(*) from public.research_lawrence_configurations
          where state <> 'superseded' and version = 2) <> 1
     or (select count(*) from public.research_commercial_events) <> v_event_count then
    raise exception 'Lawrence insert crash did not roll back atomically';
  end if;
end;
$verify$;

drop trigger research_verify_fail_lawrence_v3
  on public.research_lawrence_configurations;
drop function public.research_verify_fail_lawrence_v3();

select set_config('xenios.verify.statement_id', :'statement_id', false);
select set_config(
  'xenios.verify.replacement_statement_id',
  :'replacement_statement_id',
  false
);
select set_config(
  'xenios.verify.august_statement_id',
  :'august_statement_id',
  false
);
select set_config(
  'xenios.verify.lawrence_config_id',
  :'lawrence_config_id',
  false
);

do $verify$
declare v_summary jsonb; v_replay jsonb;
begin
  v_summary := public.research_operations_command_center();
  if v_summary->>'currency' <> 'USD'
     or (v_summary->>'payableCommissionCents')::bigint <> 4000 then
    raise exception 'command center financial summary is not event-derived';
  end if;
  if (select count(*) from public.research_affiliate_statements) <> 3
     or (select state from public.research_affiliate_statements
          where id = current_setting('xenios.verify.statement_id')::uuid) <> 'superseded'
     or (select state from public.research_affiliate_statements
          where id = current_setting('xenios.verify.replacement_statement_id')::uuid) <> 'issued'
     or (select version from public.research_affiliate_statements
          where id = current_setting('xenios.verify.replacement_statement_id')::uuid) <> 2
     or (select count(*) from public.research_affiliate_statement_items
          where statement_id = current_setting('xenios.verify.statement_id')::uuid) <> 2
     or (select count(*) from public.research_affiliate_statement_items
          where statement_id = current_setting('xenios.verify.replacement_statement_id')::uuid) <> 2
     or (select count(*) from public.research_affiliate_statement_items
          where statement_id = current_setting('xenios.verify.august_statement_id')::uuid) <> 0
     or (select reversal_cents from public.research_affiliate_statements
          where id = current_setting('xenios.verify.replacement_statement_id')::uuid) <> 1000
     or (select payable_cents from public.research_affiliate_statements
          where id = current_setting('xenios.verify.replacement_statement_id')::uuid) <> 4000 then
    raise exception 'statement exact inclusion or supersession failed: %',
      jsonb_build_object(
        'statementCount', (select count(*) from public.research_affiliate_statements),
        'originalState', (select state from public.research_affiliate_statements
          where id = current_setting('xenios.verify.statement_id')::uuid),
        'replacementState', (select state from public.research_affiliate_statements
          where id = current_setting('xenios.verify.replacement_statement_id')::uuid),
        'replacementVersion', (select version from public.research_affiliate_statements
          where id = current_setting('xenios.verify.replacement_statement_id')::uuid),
        'originalItems', (select count(*) from public.research_affiliate_statement_items
          where statement_id = current_setting('xenios.verify.statement_id')::uuid),
        'replacementItems', (select count(*) from public.research_affiliate_statement_items
          where statement_id = current_setting('xenios.verify.replacement_statement_id')::uuid),
        'augustItems', (select count(*) from public.research_affiliate_statement_items
          where statement_id = current_setting('xenios.verify.august_statement_id')::uuid),
        'replacementReversal', (select reversal_cents from public.research_affiliate_statements
          where id = current_setting('xenios.verify.replacement_statement_id')::uuid),
        'replacementPayable', (select payable_cents from public.research_affiliate_statements
          where id = current_setting('xenios.verify.replacement_statement_id')::uuid)
      );
  end if;
  if (select count(*) from public.research_lawrence_configurations
       where partner_id = current_setting('xenios.verify.partner_id')::uuid) <> 2
     or (select count(*) from public.research_lawrence_configurations
          where partner_id = current_setting('xenios.verify.partner_id')::uuid
            and state <> 'superseded') <> 1
     or (select state from public.research_lawrence_configurations
          where id = current_setting('xenios.verify.lawrence_config_id')::uuid) <> 'superseded'
     or (select agreement_version from public.research_lawrence_configurations
          where id = current_setting('xenios.verify.lawrence_config_id')::uuid) <> 'AGREEMENT-LAWRENCE-V1'
     or (select prior_configuration_id from public.research_lawrence_configurations
          where version = 2) <> current_setting('xenios.verify.lawrence_config_id')::uuid then
    raise exception 'Lawrence immutable version history failed';
  end if;
  v_replay := public.research_operations_configure_lawrence(
    '80000000-0000-4000-8000-000000000001',
    current_setting('xenios.verify.partner_id')::uuid,
    'AGREEMENT-LAWRENCE-V2', 30, 15, 5000, 'USD',
    jsonb_build_array(
      jsonb_build_object('thresholdCents', 0, 'rateBasisPoints', 1100),
      jsonb_build_object('thresholdCents', 100000, 'rateBasisPoints', 1300)
    ),
    2500, null, 'active', 1, 'lawrence:config:2',
    '2026-07-28T14:09:00.000Z'
  );
  if v_replay->>'idempotentReplay' <> 'true'
     or (select count(*) from public.research_lawrence_configurations
          where partner_id = current_setting('xenios.verify.partner_id')::uuid) <> 2 then
    raise exception 'Lawrence configuration replay was not stable';
  end if;
  if not exists (
    select 1
      from public.research_affiliate_commission_events
     where attribution_event_id = current_setting('xenios.verify.attribution_id')::uuid
       and action = 'mark_paid'
       and payout_provider = 'verified_payout_ledger'
       and payout_reference = 'PAYOUT-EVIDENCE-001'
  ) then
    raise exception 'immutable payout evidence was not retained';
  end if;
  v_replay := public.research_affiliate_configure_partner(
    '80000000-0000-4000-8000-000000000001', null, 'LAWRENCE',
    'Lawrence partner', 'active', 'Verified affiliate disclosure',
    'AGREEMENT-LAWRENCE-V1', 0, 'affiliate:partner:1',
    '2026-07-28T14:01:00.000Z'
  );
  if v_replay->>'idempotentReplay' <> 'true' then raise exception 'partner replay failed'; end if;
  begin
    perform public.research_affiliate_configure_partner(
      '80000000-0000-4000-8000-000000000002', null, 'LAWRENCE',
      'Lawrence partner', 'active', 'Verified affiliate disclosure',
      'AGREEMENT-LAWRENCE-V1', 0, 'affiliate:partner:1',
      '2026-07-28T14:01:00.000Z'
    );
    raise exception 'cross-actor commercial replay unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'cross-actor commercial replay unexpectedly succeeded' then raise; end if;
  end;
  begin
    update public.research_affiliate_commission_events set amount_cents = 999999;
    raise exception 'commission event mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'commission event mutation unexpectedly succeeded' then raise; end if;
  end;
  begin
    update public.research_lawrence_configurations set agreement_version = 'MUTATED';
    raise exception 'Lawrence version mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'Lawrence version mutation unexpectedly succeeded' then raise; end if;
  end;
  begin
    update public.research_affiliate_statements
       set state = 'superseded'
     where id = current_setting('xenios.verify.replacement_statement_id')::uuid;
    raise exception 'statement supersession bypass unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'statement supersession bypass unexpectedly succeeded' then raise; end if;
  end;
  if exists (
    select 1 from public.research_affiliate_attribution_events
     where to_jsonb(research_affiliate_attribution_events)::text ~* '(email|member_id|address|name)'
  ) then raise exception 'affiliate attribution contains customer PII fields'; end if;
end;
$verify$;

rollback;

do $verify$
declare v_count bigint;
begin
  select sum(row_count) into v_count from (
    select count(*) row_count from public.research_affiliate_partners
    union all select count(*) from public.research_affiliate_links
    union all select count(*) from public.research_affiliate_attribution_events
    union all select count(*) from public.research_affiliate_commission_events
    union all select count(*) from public.research_affiliate_statements
    union all select count(*) from public.research_affiliate_statement_items
    union all select count(*) from public.research_professional_accounts
    union all select count(*) from public.research_operations_crm_accounts
    union all select count(*) from public.research_lawrence_configurations
    union all select count(*) from public.research_commercial_events
  ) rows;
  if v_count <> 0 then raise exception 'commercial rollback left % residual rows', v_count; end if;
end;
$verify$;
