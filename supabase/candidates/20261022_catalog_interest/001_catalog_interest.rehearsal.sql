-- Disposable PostgreSQL/Supabase rehearsal only. The final ROLLBACK is
-- mandatory. Apply 001_catalog_interest.sql first in the same disposable DB.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '5s';

delete from public.catalog_interest_consents
where lead_id in (
  select id from public.catalog_interest_leads
  where request_id in (
    '11111111-1111-4111-8111-111111111111'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid
  )
);
delete from public.catalog_interest_leads
where request_id in (
  '11111111-1111-4111-8111-111111111111'::uuid,
  '22222222-2222-4222-8222-222222222222'::uuid
);
delete from public.research_notification_outbox
where event_key like 'catalog-interest:11111111-1111-4111-8111-111111111111:%'
   or event_key like 'catalog-interest:22222222-2222-4222-8222-222222222222:%';

create temporary table catalog_interest_rehearsal_results (
  step text primary key,
  result jsonb not null
) on commit drop;

insert into catalog_interest_rehearsal_results(step, result)
select 'fresh', public.record_catalog_interest(
  '11111111-1111-4111-8111-111111111111'::uuid,
  encode(extensions.digest(
    'person@example.com' || E'\n0\ncatalog_delivery_notice_v1\ncatalog-2026-10-22',
    'sha256'
  ), 'hex'),
  'person@example.com', false,
  'catalog_delivery_notice_v1', null,
  'catalog-2026-10-22',
  'https://xeniostechnology.com/catalog/current.pdf',
  '2026-10-20T00:00:00Z'::timestamptz,
  '2099-11-20T00:00:00Z'::timestamptz,
  null, 'approved', 'catalog-team@xeniostechnology.com',
  'catalog-interest:11111111-1111-4111-8111-111111111111:customer',
  'catalog-interest:11111111-1111-4111-8111-111111111111:team',
  'catalog_interest_customer', 'catalog_interest_team'
);

do $$
declare
  v_result jsonb;
begin
  select result into v_result from catalog_interest_rehearsal_results where step = 'fresh';
  if v_result->>'ok' <> 'true' or v_result->>'replayed' <> 'false' then
    raise exception 'fresh submission did not return a new durable receipt: %', v_result;
  end if;
  if (select count(*) from public.catalog_interest_leads where request_id = '11111111-1111-4111-8111-111111111111') <> 1
     or (select count(*) from public.catalog_interest_consents c join public.catalog_interest_leads l on l.id = c.lead_id where l.request_id = '11111111-1111-4111-8111-111111111111') <> 1
     or (select count(*) from public.research_notification_outbox where event_key like 'catalog-interest:11111111-1111-4111-8111-111111111111:%') <> 2
  then
    raise exception 'fresh submission did not atomically create 1 lead, 1 consent, and 2 jobs';
  end if;
end
$$;

insert into catalog_interest_rehearsal_results(step, result)
select 'replay', public.record_catalog_interest(
  '11111111-1111-4111-8111-111111111111'::uuid,
  encode(extensions.digest(
    'person@example.com' || E'\n0\ncatalog_delivery_notice_v1\ncatalog-2026-10-22',
    'sha256'
  ), 'hex'),
  'person@example.com', false,
  'catalog_delivery_notice_v1', null,
  'catalog-2026-10-22',
  'https://xeniostechnology.com/catalog/current.pdf',
  '2026-10-20T00:00:00Z'::timestamptz,
  '2099-11-20T00:00:00Z'::timestamptz,
  null, 'approved', 'catalog-team@xeniostechnology.com',
  'catalog-interest:11111111-1111-4111-8111-111111111111:customer',
  'catalog-interest:11111111-1111-4111-8111-111111111111:team',
  'catalog_interest_customer', 'catalog_interest_team'
);

insert into catalog_interest_rehearsal_results(step, result)
select 'conflict', public.record_catalog_interest(
  '11111111-1111-4111-8111-111111111111'::uuid,
  repeat('0', 64),
  'changed@example.com', true,
  'catalog_delivery_notice_v1', 'catalog_marketing_opt_in_v1',
  'catalog-2026-10-22',
  'https://xeniostechnology.com/catalog/current.pdf',
  '2026-10-20T00:00:00Z'::timestamptz,
  '2099-11-20T00:00:00Z'::timestamptz,
  null, 'approved', 'catalog-team@xeniostechnology.com',
  'catalog-interest:11111111-1111-4111-8111-111111111111:customer',
  'catalog-interest:11111111-1111-4111-8111-111111111111:team',
  'catalog_interest_customer', 'catalog_interest_team'
);

insert into catalog_interest_rehearsal_results(step, result)
select 'conflict_old_fingerprint', public.record_catalog_interest(
  '11111111-1111-4111-8111-111111111111'::uuid,
  encode(extensions.digest(
    'person@example.com' || E'\n0\ncatalog_delivery_notice_v1\ncatalog-2026-10-22',
    'sha256'
  ), 'hex'),
  'changed@example.com', true,
  'catalog_delivery_notice_v1', 'catalog_marketing_opt_in_v1',
  'catalog-2026-10-22',
  'https://xeniostechnology.com/catalog/current.pdf',
  '2026-10-20T00:00:00Z'::timestamptz,
  '2099-11-20T00:00:00Z'::timestamptz,
  null, 'approved', 'catalog-team@xeniostechnology.com',
  'catalog-interest:11111111-1111-4111-8111-111111111111:customer',
  'catalog-interest:11111111-1111-4111-8111-111111111111:team',
  'catalog_interest_customer', 'catalog_interest_team'
);

do $$
declare
  v_fresh jsonb;
  v_replay jsonb;
  v_conflict jsonb;
  v_conflict_old_fingerprint jsonb;
begin
  select result into v_fresh from catalog_interest_rehearsal_results where step = 'fresh';
  select result into v_replay from catalog_interest_rehearsal_results where step = 'replay';
  select result into v_conflict from catalog_interest_rehearsal_results where step = 'conflict';
  select result into v_conflict_old_fingerprint from catalog_interest_rehearsal_results where step = 'conflict_old_fingerprint';
  if v_replay->>'replayed' <> 'true' or v_replay->>'receipt' <> v_fresh->>'receipt' then
    raise exception 'exact replay did not return the stored receipt';
  end if;
  if v_conflict <> jsonb_build_object('ok', false, 'code', 'request_conflict') then
    raise exception 'changed fingerprint did not conflict: %', v_conflict;
  end if;
  if v_conflict_old_fingerprint <> jsonb_build_object('ok', false, 'code', 'request_conflict') then
    raise exception 'changed body with a stale supplied fingerprint did not conflict: %', v_conflict_old_fingerprint;
  end if;
end
$$;

-- Pre-seed only the team event key. The function inserts its customer job
-- first; the team insert then fails unique, proving all prior function writes
-- roll back inside the caught PL/pgSQL subtransaction.
insert into public.research_notification_outbox (
  event_key, event_type, recipient, template_key, payload, status
) values (
  'catalog-interest:22222222-2222-4222-8222-222222222222:team',
  'catalog_interest_team', 'collision@example.com',
  'catalog_interest_team', '{}'::jsonb, 'cancelled'
);

do $$
begin
  begin
    perform public.record_catalog_interest(
      '22222222-2222-4222-8222-222222222222'::uuid,
      encode(extensions.digest(
        'rollback@example.com' || E'\n0\ncatalog_delivery_notice_v1\ncatalog-2026-10-22',
        'sha256'
      ), 'hex'),
      'rollback@example.com', false,
      'catalog_delivery_notice_v1', null,
      'catalog-2026-10-22',
      'https://xeniostechnology.com/catalog/current.pdf',
      '2026-10-20T00:00:00Z'::timestamptz,
      '2099-11-20T00:00:00Z'::timestamptz,
      null, 'approved', 'catalog-team@xeniostechnology.com',
      'catalog-interest:22222222-2222-4222-8222-222222222222:customer',
      'catalog-interest:22222222-2222-4222-8222-222222222222:team',
      'catalog_interest_customer', 'catalog_interest_team'
    );
    raise exception 'expected the second outbox insertion to fail';
  exception when unique_violation then
    null;
  end;

  if exists (select 1 from public.catalog_interest_leads where request_id = '22222222-2222-4222-8222-222222222222')
     or exists (select 1 from public.catalog_interest_consents c join public.catalog_interest_leads l on l.id = c.lead_id where l.request_id = '22222222-2222-4222-8222-222222222222')
     or exists (select 1 from public.research_notification_outbox where event_key = 'catalog-interest:22222222-2222-4222-8222-222222222222:customer')
  then
    raise exception 'second-job failure did not roll back the lead, consent, and customer job';
  end if;
end
$$;

rollback;
