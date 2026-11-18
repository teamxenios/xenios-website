begin;
set local lock_timeout = '5s';

-- Provider delivery receipts for request customer notices. Nothing here sends
-- mail or changes a notice job: it records what the provider reported, once
-- per signed provider event, and attaches it to a notice only by the provider
-- message id the outbox stored for that notice's job.
--
-- A receipt stores the signed event id, the provider message id, the delivery
-- kind and a digest of the exact signed bytes. It never stores an address, a
-- header, a subject or bounce text. Being delivered to the receiving server is
-- not being read: nothing here records or implies that anyone opened a notice.
--
-- A receipt can arrive before the worker has recorded the provider's id for
-- the send. It is kept unmatched and is attached later by the reconcile
-- function, never by a subject, a sender or an address.
--
-- The receipt table refers to workflow_notice_intents, so any future retention
-- or erasure procedure deletes a notice's receipts before the notice itself.
create table if not exists request_intent_private.workflow_notice_receipts (
  provider_event_id text primary key check (provider_event_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  provider_message_id uuid not null,
  kind text not null check (kind in ('accepted', 'delivered', 'bounced')),
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default clock_timestamp(),
  notice_event_id uuid references request_intent_private.workflow_notice_intents(event_id),
  matched_at timestamptz,
  check ((notice_event_id is null) = (matched_at is null))
);
create index if not exists workflow_notice_receipts_message
  on request_intent_private.workflow_notice_receipts (provider_message_id);
create index if not exists workflow_notice_receipts_notice
  on request_intent_private.workflow_notice_receipts (notice_event_id) where notice_event_id is not null;
alter table request_intent_private.workflow_notice_receipts enable row level security;
alter table request_intent_private.workflow_notice_receipts force row level security;
revoke all on table request_intent_private.workflow_notice_receipts from public, anon, authenticated, service_role;

-- Attaches every unmatched receipt for one provider message id to the one
-- customer notice whose outbox job stored that id. No job, or more than one,
-- leaves the receipts unmatched. Returns how many receipts it attached.
create or replace function request_intent_private.match_customer_notice_receipts(p_provider_message_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  candidates integer;
  notice uuid;
  attached integer;
begin
  if p_provider_message_id is null then
    return 0;
  end if;
  select count(*), min(i.event_id::text)::uuid into candidates, notice
  from public.research_notification_outbox o
  join request_intent_private.workflow_notice_intents i
    on o.event_key = 'ea-request-customer-' || i.event_id::text
  where lower(btrim(o.provider_message_id)) = p_provider_message_id::text
    and o.event_type = o.template_key
    and o.template_key in ('ea_request_received_queued_customer_v1', 'ea_request_reviewing_customer_v1');
  if candidates <> 1 then
    return 0;
  end if;
  update request_intent_private.workflow_notice_receipts r
  set notice_event_id = notice, matched_at = clock_timestamp()
  where r.provider_message_id = p_provider_message_id and r.notice_event_id is null;
  get diagnostics attached = row_count;
  return attached;
end;
$$;

-- Records one signed provider event. The same event id with the same facts is
-- a replay and records nothing new; with any other fact it is refused. The
-- result is 'matched' when the receipt belongs to a customer notice, or
-- 'unmatched' when no notice job has stored that provider id (yet).
create or replace function request_intent_private.customer_notice_receipt_record(
  p_provider_event_id text, p_provider_message_id uuid, p_kind text, p_digest text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  existing request_intent_private.workflow_notice_receipts;
begin
  if current_setting('role', true) is distinct from 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'customer_notice_backend_only';
  end if;
  if p_provider_event_id is null or p_provider_event_id !~ '^[A-Za-z0-9_.:-]{1,128}$'
    or p_provider_message_id is null
    or p_kind is null or p_kind not in ('accepted', 'delivered', 'bounced')
    or p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_customer_notice_receipt';
  end if;
  insert into request_intent_private.workflow_notice_receipts (provider_event_id, provider_message_id, kind, digest)
  values (p_provider_event_id, p_provider_message_id, p_kind, p_digest)
  on conflict (provider_event_id) do nothing;
  -- A fresh snapshot after the INSERT under READ COMMITTED: a concurrent
  -- recording of the same event is either seen here or has rolled back.
  select * into existing from request_intent_private.workflow_notice_receipts r
  where r.provider_event_id = p_provider_event_id;
  if not found or existing.provider_message_id <> p_provider_message_id
    or existing.kind <> p_kind or existing.digest <> p_digest then
    raise exception using errcode = '23505', message = 'customer_notice_receipt_identity_conflict';
  end if;
  perform request_intent_private.match_customer_notice_receipts(p_provider_message_id);
  return case when exists (
    select 1 from request_intent_private.workflow_notice_receipts r
    where r.provider_event_id = p_provider_event_id and r.notice_event_id is not null
  ) then 'matched' else 'unmatched' end;
end;
$$;

create or replace function public.request_intent_customer_notice_receipt_record(
  p_provider_event_id text, p_provider_message_id uuid, p_kind text, p_digest text)
returns text language sql security invoker set search_path = '' as $$
  select request_intent_private.customer_notice_receipt_record(p_provider_event_id, p_provider_message_id, p_kind, p_digest);
$$;

-- For the worker, after it has recorded a send's provider id: attaches any
-- receipt that arrived first. Returns how many receipts it attached.
create or replace function request_intent_private.customer_notice_receipts_reconcile(p_provider_message_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) is distinct from 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'customer_notice_backend_only';
  end if;
  if p_provider_message_id is null then
    raise exception using errcode = '22023', message = 'invalid_customer_notice_receipt';
  end if;
  return request_intent_private.match_customer_notice_receipts(p_provider_message_id);
end;
$$;

create or replace function public.request_intent_customer_notice_receipts_reconcile(p_provider_message_id uuid)
returns integer language sql security invoker set search_path = '' as $$
  select request_intent_private.customer_notice_receipts_reconcile(p_provider_message_id);
$$;

-- The provider's report for one notice, for a definer projection, in fixed
-- words: none, provider_accepted, delivered, bounced or conflicting (both a
-- delivery and a bounce were reported). 'unavailable' when the event has no
-- notice under that request. Delivered means the receiving server accepted
-- it; it does not mean the customer read it.
create or replace function request_intent_private.customer_notice_receipt_evidence(p_request_id uuid, p_event_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  delivered boolean;
  bounced boolean;
  accepted boolean;
begin
  if p_request_id is null or p_event_id is null or not exists (
    select 1 from request_intent_private.workflow_notice_intents i
    where i.event_id = p_event_id and i.request_id = p_request_id
  ) then
    return 'unavailable';
  end if;
  select coalesce(bool_or(r.kind = 'delivered'), false), coalesce(bool_or(r.kind = 'bounced'), false),
    coalesce(bool_or(r.kind = 'accepted'), false)
  into delivered, bounced, accepted
  from request_intent_private.workflow_notice_receipts r
  where r.notice_event_id = p_event_id;
  if delivered and bounced then return 'conflicting'; end if;
  if bounced then return 'bounced'; end if;
  if delivered then return 'delivered'; end if;
  if accepted then return 'provider_accepted'; end if;
  return 'none';
end;
$$;

-- Unmatched receipts are reports about mail that is not a customer notice, or
-- about a notice whose send was never recorded. They carry no personal data;
-- this removes those older than the given time, which must be at least a day
-- ago. Scheduling it is an operator decision, not part of this migration.
create or replace function request_intent_private.purge_unmatched_customer_notice_receipts(p_received_before timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  removed integer;
begin
  if p_received_before is null or p_received_before > clock_timestamp() - interval '1 day' then
    raise exception using errcode = '22023', message = 'invalid_customer_notice_receipt_purge';
  end if;
  delete from request_intent_private.workflow_notice_receipts r
  where r.notice_event_id is null and r.received_at < p_received_before;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function request_intent_private.match_customer_notice_receipts(uuid),
  request_intent_private.customer_notice_receipt_record(text, uuid, text, text),
  public.request_intent_customer_notice_receipt_record(text, uuid, text, text),
  request_intent_private.customer_notice_receipts_reconcile(uuid),
  public.request_intent_customer_notice_receipts_reconcile(uuid),
  request_intent_private.customer_notice_receipt_evidence(uuid, uuid),
  request_intent_private.purge_unmatched_customer_notice_receipts(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function request_intent_private.customer_notice_receipt_record(text, uuid, text, text),
  public.request_intent_customer_notice_receipt_record(text, uuid, text, text),
  request_intent_private.customer_notice_receipts_reconcile(uuid),
  public.request_intent_customer_notice_receipts_reconcile(uuid)
  to service_role;
commit;
