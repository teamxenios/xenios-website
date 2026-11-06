-- SOURCE-ONLY, UNAPPLIED candidate. No policy rows or grants to people are created.
-- Requires exact installed-request/outbox preimages, separate migration review,
-- disposable rehearsal authorization and target-specific apply authority.
begin;
create table request_intent_private.notification_policy (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  recipients text[] not null check (cardinality(recipients) between 1 and 5),
  eligible_from timestamptz not null,
  eligible_until timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  approval_reference text,
  check (eligible_until is null or eligible_until > eligible_from),
  check (not enabled or (approved_by is not null and approved_at is not null
    and approval_reference is not null and length(btrim(approval_reference)) between 1 and 200))
);
alter table request_intent_private.notification_policy enable row level security;
alter table request_intent_private.notification_policy force row level security;
revoke all on request_intent_private.notification_policy from public, anon, authenticated, service_role;
-- No INSERT: absent policy means denied. Not a queue, no second delivery ledger.

create function request_intent_private.reconcile_notifications(p_recipients text[], p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare policy request_intent_private.notification_policy; item record;
  selected_count integer := 0; inserted_count integer := 0; changed integer; existing record;
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception using errcode='42501',message='request_intent_notification_backend_required';
  end if;
  select * into policy from request_intent_private.notification_policy where singleton for share;
  if not found or not policy.enabled or policy.approved_by is null or policy.approved_at is null
    or policy.approval_reference is null then
    raise exception using errcode='42501',message='request_intent_notification_not_approved';
  end if;
  if p_limit is null or p_limit not between 1 and 10 or p_recipients is null
    or cardinality(p_recipients) not between 1 and 5 or array_position(p_recipients,null) is not null
    or p_recipients is distinct from policy.recipients
    or p_recipients is distinct from (
      select array_agg(distinct recipient order by recipient) from unnest(p_recipients) recipient)
    or exists(select 1 from unnest(p_recipients) recipient
      where recipient <> lower(btrim(recipient)) or recipient !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9.-]+[.][a-z]{2,}$') then
    raise exception using errcode='22023',message='request_intent_notification_policy_invalid';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(18273645,91827364) then
    raise exception using errcode='55P03',message='request_intent_notification_busy';
  end if;
  -- No max-ID cursor or sliding lookback: a late commit with a lower sequence
  -- must remain eligible. Existing jobs of ANY state prevent implicit resend.
  for item in
    select distinct r.id, r.public_reference, r.created_at, targets.recipient,
      'request-intent-pending:v1:' || r.id::text || ':' ||
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(targets.recipient,'UTF8')),'hex') as event_key
    from request_intent_private.requests r
    join request_intent_private.access_events e on e.request_id=r.id and e.event_type='submitted'
    cross join unnest(policy.recipients) targets(recipient)
    where r.status='pending_review' and r.created_at >= policy.eligible_from
      and (policy.eligible_until is null or r.created_at < policy.eligible_until)
      and not exists(select 1 from public.research_notification_outbox o where o.event_key =
        'request-intent-pending:v1:' || r.id::text || ':' ||
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(targets.recipient,'UTF8')),'hex')
        and o.event_type='request_intent_pending_staff' and o.template_key='request_intent_pending_staff_v1'
        and o.recipient=targets.recipient and o.payload=jsonb_build_object('publicReference',r.public_reference)
        and o.application_id is null and o.member_id is null)
    order by r.created_at, r.id, targets.recipient limit p_limit
  loop
    selected_count := selected_count + 1;
    if (select count(*) from request_intent_private.access_events
      where request_id=item.id and event_type='submitted') <> 1 then
      raise exception using errcode='22023',message='request_intent_notification_source_invalid';
    end if;
    insert into public.research_notification_outbox(event_key,event_type,template_key,recipient,payload)
      values(item.event_key,'request_intent_pending_staff','request_intent_pending_staff_v1',
        item.recipient,jsonb_build_object('publicReference',item.public_reference))
      on conflict(event_key) do nothing;
    get diagnostics changed = row_count;
    inserted_count := inserted_count + changed;
    select * into strict existing from public.research_notification_outbox where event_key=item.event_key;
    if existing.event_type is distinct from 'request_intent_pending_staff'
      or existing.template_key is distinct from 'request_intent_pending_staff_v1'
      or existing.recipient is distinct from item.recipient
      or existing.payload is distinct from jsonb_build_object('publicReference',item.public_reference)
      or existing.application_id is not null or existing.member_id is not null then
      raise exception using errcode='22023',message='request_intent_notification_binding_invalid';
    end if;
  end loop;
  return jsonb_build_object('selected',selected_count,'inserted',inserted_count);
end;
$$;
revoke all on function request_intent_private.reconcile_notifications(text[],integer) from public, anon, authenticated, service_role;
grant execute on function request_intent_private.reconcile_notifications(text[],integer) to service_role;

create function public.request_intent_reconcile_notifications(p_recipients text[],p_limit integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select request_intent_private.reconcile_notifications(p_recipients,p_limit);
$$;
revoke all on function public.request_intent_reconcile_notifications(text[],integer) from public, anon, authenticated, service_role;
grant execute on function public.request_intent_reconcile_notifications(text[],integer) to service_role;
commit;
