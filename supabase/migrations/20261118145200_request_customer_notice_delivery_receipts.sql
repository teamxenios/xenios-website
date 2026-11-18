begin;
set local lock_timeout = '5s';

-- Provider delivery receipts for request customer notices. Nothing here sends
-- mail or changes a notice job: it records what the provider reported, once
-- per signed provider event.
--
-- A receipt stores the signed event id, the provider message id, the delivery
-- kind and a digest of the exact signed bytes. It never stores an address, a
-- header, a subject or bounce text. Being delivered to the receiving server is
-- not being read: nothing here records or implies that anyone opened a notice.
--
-- A receipt is not attached to a notice when it is written. The provider can
-- report a send before the worker has stored the provider's id for it, and
-- the two writes can commit in either order. So a receipt is joined to a
-- notice only when the evidence is read, through the provider message id that
-- the notice's own outbox job stored, never through a subject, a sender or an
-- address. Whichever write commits last, the next read sees both, and no
-- reconcile step, retry or second report is needed.
create table if not exists request_intent_private.workflow_notice_receipts (
  provider_event_id text primary key check (provider_event_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  provider_message_id uuid not null,
  kind text not null check (kind in ('accepted', 'delivered', 'bounced')),
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default clock_timestamp()
);
create index if not exists workflow_notice_receipts_message
  on request_intent_private.workflow_notice_receipts (provider_message_id);
alter table request_intent_private.workflow_notice_receipts enable row level security;
alter table request_intent_private.workflow_notice_receipts force row level security;
revoke all on table request_intent_private.workflow_notice_receipts from public, anon, authenticated, service_role;

-- Records one signed provider event. The first recording answers 'recorded'.
-- The same event id with the same facts is a replay: it records nothing new
-- and answers 'replayed'. The same id with any other fact is refused.
create or replace function request_intent_private.customer_notice_receipt_record(
  p_provider_event_id text, p_provider_message_id uuid, p_kind text, p_digest text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  existing request_intent_private.workflow_notice_receipts;
  inserted text;
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
  on conflict (provider_event_id) do nothing
  returning provider_event_id into inserted;
  if inserted is not null then
    return 'recorded';
  end if;
  -- A fresh snapshot after the INSERT under READ COMMITTED: a concurrent
  -- recording of the same event is either seen here or has rolled back.
  select * into existing from request_intent_private.workflow_notice_receipts r
  where r.provider_event_id = p_provider_event_id;
  if not found or existing.provider_message_id <> p_provider_message_id
    or existing.kind <> p_kind or existing.digest <> p_digest then
    raise exception using errcode = '23505', message = 'customer_notice_receipt_identity_conflict';
  end if;
  return 'replayed';
end;
$$;

create or replace function public.request_intent_customer_notice_receipt_record(
  p_provider_event_id text, p_provider_message_id uuid, p_kind text, p_digest text)
returns text language sql security invoker set search_path = '' as $$
  select request_intent_private.customer_notice_receipt_record(p_provider_event_id, p_provider_message_id, p_kind, p_digest);
$$;

-- The provider's report for one notice, for a definer projection, in fixed
-- words:
--   none               no report yet, or no provider id stored for the send yet;
--   provider_accepted  the provider accepted the send;
--   delivered          the receiving server accepted it (not: the customer read it);
--   bounced            the provider reported a bounce;
--   conflicting        both a delivery and a bounce were reported;
--   unavailable        the event has no notice under that request, or its
--                      stored provider id is malformed or shared by another job.
-- The join uses the provider id stored on that notice's own customer-notice
-- outbox job, read now, so it sees every write committed before this read.
create or replace function request_intent_private.customer_notice_receipt_evidence(p_request_id uuid, p_event_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  stored_id text;
  message_id uuid;
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
  select lower(btrim(o.provider_message_id)) into stored_id
  from public.research_notification_outbox o
  where o.event_key = 'ea-request-customer-' || p_event_id::text
    and o.event_type = o.template_key
    and o.template_key in ('ea_request_received_queued_customer_v1', 'ea_request_reviewing_customer_v1');
  if not found then
    return 'unavailable';
  end if;
  if stored_id is null or stored_id = '' then
    return 'none';
  end if;
  if stored_id !~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    return 'unavailable';
  end if;
  -- One provider message belongs to one job. If any other outbox job carries
  -- the same id, the reports cannot be attributed to this notice.
  if (select count(*) from public.research_notification_outbox o
      where lower(btrim(o.provider_message_id)) = stored_id) <> 1 then
    return 'unavailable';
  end if;
  message_id := stored_id::uuid;
  select coalesce(bool_or(r.kind = 'delivered'), false), coalesce(bool_or(r.kind = 'bounced'), false),
    coalesce(bool_or(r.kind = 'accepted'), false)
  into delivered, bounced, accepted
  from request_intent_private.workflow_notice_receipts r
  where r.provider_message_id = message_id;
  if delivered and bounced then return 'conflicting'; end if;
  if bounced then return 'bounced'; end if;
  if delivered then return 'delivered'; end if;
  if accepted then return 'provider_accepted'; end if;
  return 'none';
end;
$$;

-- Unmatched receipts are reports about mail that is not a customer notice
-- (the provider reports every send on the account), or about a notice whose
-- send id was never stored. They carry no personal data. This removes those
-- received before the given time, which must be at least a day ago, so a
-- report that arrived before its send id was stored is kept long enough for
-- the send to be recorded. Scheduling it is an operator decision, not part of
-- this migration.
create or replace function request_intent_private.purge_unmatched_customer_notice_receipts(p_received_before timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  removed integer;
begin
  if p_received_before is null or p_received_before > clock_timestamp() - interval '1 day' then
    raise exception using errcode = '22023', message = 'invalid_customer_notice_receipt_purge';
  end if;
  delete from request_intent_private.workflow_notice_receipts r
  where r.received_at < p_received_before
    and not exists (
      select 1 from public.research_notification_outbox o
      where lower(btrim(o.provider_message_id)) = r.provider_message_id::text
        and o.event_type = o.template_key
        and o.template_key in ('ea_request_received_queued_customer_v1', 'ea_request_reviewing_customer_v1')
    );
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function request_intent_private.customer_notice_receipt_record(text, uuid, text, text),
  public.request_intent_customer_notice_receipt_record(text, uuid, text, text),
  request_intent_private.customer_notice_receipt_evidence(uuid, uuid),
  request_intent_private.purge_unmatched_customer_notice_receipts(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function request_intent_private.customer_notice_receipt_record(text, uuid, text, text),
  public.request_intent_customer_notice_receipt_record(text, uuid, text, text)
  to service_role;
commit;
