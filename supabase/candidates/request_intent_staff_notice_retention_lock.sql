-- SOURCE CANDIDATE ONLY. Requires BOTH historical staff-notice migrations.
-- Preserve their ABI, envelopes, template choice, backend checks and batch cap.
-- Lock the source parent until enqueue commits: retention FOR UPDATE then either
-- sees the committed job, or enqueue waits and skips a committed deleted parent.
-- No worker, payload deletion, configuration or scheduler is activated here.
begin;
set local lock_timeout='5s';
do $$ begin
  if to_regprocedure('request_intent_private.enqueue_staff_notices(timestamptz,text[])') is null
    or to_regprocedure('request_intent_private.enqueue_staff_notices(timestamptz,text[],timestamptz)') is null then
    raise exception using errcode='55000',message='staff_notice_retention_prerequisites_missing';
  end if;
end $$;

create or replace function request_intent_private.enqueue_staff_notices(p_since timestamptz, p_recipients text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  enqueued integer;
begin
  if current_setting('role', true) is distinct from 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'staff_notice_backend_only';
  end if;
  if p_since is null or not isfinite(p_since) or cardinality(p_recipients) is distinct from 2
    or p_recipients[1] is null or p_recipients[2] is null or p_recipients[1] = p_recipients[2]
    or exists (
      select 1 from unnest(p_recipients) as address
      where length(address) > 254 or address !~ '^[a-z0-9._+%-]+@[a-z0-9-]+([.][a-z0-9-]+)+$'
    ) then
    raise exception using errcode = '22023', message = 'invalid_staff_notice_configuration';
  end if;

  insert into public.research_notification_outbox (event_key, event_type, template_key, recipient, payload)
  select 'ea-request-submitted-' || r.id::text, 'ea_request_submitted_staff_v1',
    'ea_request_submitted_staff_v1', p_recipients[1],
    jsonb_build_object(
      'reference', r.public_reference,
      'submittedAt', r.created_at,
      'itemCount', jsonb_array_length(r.lines),
      'recipients', to_jsonb(p_recipients)
    )
  from request_intent_private.requests r
  where r.created_at >= p_since
    and not exists (
      select 1 from public.research_notification_outbox o
      where o.event_key = 'ea-request-submitted-' || r.id::text
    )
  order by r.created_at, r.id
  limit 100
  for key share of r
  on conflict (event_key) do nothing;
  get diagnostics enqueued = row_count;
  return enqueued;
end;
$$;

create or replace function request_intent_private.enqueue_staff_notices(
  p_since timestamptz, p_recipients text[], p_detail_since timestamptz
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  enqueued integer;
begin
  if current_setting('role', true) is distinct from 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'staff_notice_backend_only';
  end if;
  if p_since is null or not isfinite(p_since)
    or p_detail_since is null or not isfinite(p_detail_since)
    or cardinality(p_recipients) is distinct from 2
    or p_recipients[1] is null or p_recipients[2] is null or p_recipients[1] = p_recipients[2]
    or exists (
      select 1 from unnest(p_recipients) as address
      where length(address) > 254 or address !~ '^[a-z0-9._+%-]+@[a-z0-9-]+([.][a-z0-9-]+)+$'
    ) then
    raise exception using errcode = '22023', message = 'invalid_staff_notice_configuration';
  end if;

  insert into public.research_notification_outbox (event_key, event_type, template_key, recipient, payload)
  select 'ea-request-submitted-' || r.id::text, chosen.template, chosen.template, p_recipients[1],
    jsonb_build_object(
      'reference', r.public_reference,
      'submittedAt', r.created_at,
      'itemCount', jsonb_array_length(r.lines),
      'recipients', to_jsonb(p_recipients)
    )
  from request_intent_private.requests r
  cross join lateral (select case when r.created_at >= p_detail_since
    then 'ea_request_submitted_staff_full_v1' else 'ea_request_submitted_staff_v1' end as template) chosen
  where r.created_at >= p_since
    and not exists (
      select 1 from public.research_notification_outbox o
      where o.event_key = 'ea-request-submitted-' || r.id::text
    )
  order by r.created_at, r.id
  limit 100
  for key share of r
  on conflict (event_key) do nothing;
  get diagnostics enqueued = row_count;
  return enqueued;
end;
$$;

revoke all on function request_intent_private.enqueue_staff_notices(timestamptz,text[]),
  request_intent_private.enqueue_staff_notices(timestamptz,text[],timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function request_intent_private.enqueue_staff_notices(timestamptz,text[]),
  request_intent_private.enqueue_staff_notices(timestamptz,text[],timestamptz) to service_role;
commit;