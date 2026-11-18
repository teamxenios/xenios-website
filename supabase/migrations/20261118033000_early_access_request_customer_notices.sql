begin;
set local lock_timeout = '5s';

-- Customer notices for the request workflow. The workflow records each
-- business event in its own transaction and calls enqueue_workflow_notice in
-- that same transaction, so a notice is recorded if and only if its event
-- commits. Nothing here sends mail: the existing outbox worker does, and only
-- when its own switch is on.
--
-- One notice per event. The outbox key is ea-request-customer-<event id>, so a
-- replayed event, a second worker or a new template revision can never produce
-- a second message. The job stores the request reference and the event's
-- time, kind, revision and environment. It does not store the customer's address: the worker
-- reads that from the saved request when it sends.
create table if not exists request_intent_private.workflow_notice_intents (
  event_id uuid primary key,
  request_id uuid not null references request_intent_private.requests(id),
  kind text not null check (kind in ('request_received_queued', 'request_reviewing')),
  revision bigint not null check (revision >= 0),
  environment text not null check (environment ~ '^[a-z][a-z0-9_-]{2,63}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (request_id, revision)
);
alter table request_intent_private.workflow_notice_intents enable row level security;
revoke all on table request_intent_private.workflow_notice_intents from public, anon, authenticated, service_role;

-- Called by the workflow's own definer functions, inside their transaction.
-- A failure here fails that transaction, so an enabled workflow can never
-- commit an event whose notice was not recorded.
create or replace function request_intent_private.enqueue_workflow_notice(
  p_request_id uuid, p_event_id uuid, p_kind text, p_revision bigint, p_environment text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  stored request_intent_private.requests;
  existing request_intent_private.workflow_notice_intents;
  template text;
begin
  if p_request_id is null or p_event_id is null or p_kind is null or p_revision is null or p_revision < 0
    or p_environment is null or p_environment !~ '^[a-z][a-z0-9_-]{2,63}$' then
    raise exception using errcode = '22023', message = 'invalid_workflow_notice';
  end if;
  template := case p_kind
    when 'request_received_queued' then 'ea_request_received_queued_customer_v1'
    when 'request_reviewing' then 'ea_request_reviewing_customer_v1'
  end;
  if template is null then
    raise exception using errcode = '22023', message = 'unsupported_workflow_notice_kind';
  end if;
  select * into stored from request_intent_private.requests where id = p_request_id;
  if not found then
    raise exception using errcode = '23503', message = 'workflow_notice_request_missing';
  end if;

  insert into request_intent_private.workflow_notice_intents (event_id, request_id, kind, revision, environment)
  values (p_event_id, p_request_id, p_kind, p_revision, p_environment)
  on conflict (event_id) do nothing;
  select * into strict existing from request_intent_private.workflow_notice_intents where event_id = p_event_id;
  -- The same event may be recorded again. The same id with other facts may not.
  if existing.request_id <> p_request_id or existing.kind <> p_kind
    or existing.revision <> p_revision or existing.environment <> p_environment then
    raise exception using errcode = '23505', message = 'workflow_notice_identity_conflict';
  end if;

  insert into public.research_notification_outbox (event_key, event_type, template_key, recipient, payload)
  values ('ea-request-customer-' || p_event_id::text, template, template, 'customer:' || stored.public_reference,
    jsonb_build_object(
      'reference', stored.public_reference,
      'eventAt', case when p_kind = 'request_received_queued' then stored.created_at else clock_timestamp() end,
      'kind', p_kind,
      'revision', p_revision,
      'environment', p_environment
    ))
  on conflict (event_key) do nothing;
end;
$$;

-- The transport fact for one event, for the workflow's projection. It returns
-- one of seven fixed words and never an address, an item or a provider error.
create or replace function request_intent_private.workflow_customer_notice(p_request_id uuid, p_event_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  job_id uuid;
  job_status text;
  job_error text;
begin
  if p_request_id is null or p_event_id is null or not exists (
    select 1 from request_intent_private.workflow_notice_intents i
    where i.event_id = p_event_id and i.request_id = p_request_id
  ) then
    return 'unavailable';
  end if;
  select o.id, o.status, o.last_error_summary into job_id, job_status, job_error
  from public.research_notification_outbox o
  where o.event_key = 'ea-request-customer-' || p_event_id::text;
  if not found then return 'unavailable'; end if;
  if job_status = 'delivered' then return 'delivered_to_server'; end if;
  if job_status = 'sent' then return 'provider_accepted'; end if;
  if job_status in ('pending', 'processing', 'failed_retryable') then return 'pending'; end if;
  if job_status = 'cancelled' then return 'suppressed'; end if;
  -- A job that stopped after a send whose result was never confirmed may have
  -- been delivered. That is unknown, not failed.
  if exists (
    select 1 from public.research_notification_attempts a
    where a.outbox_id = job_id and a.outcome = 'failed'
      and (a.error_summary = 'Customer notice send had no confirmed result.'
        or a.error_summary like '%stale processing%')
  ) then
    return 'delivery_unknown';
  end if;
  if coalesce(job_error, '') like 'Not sent:%' then return 'suppressed'; end if;
  return 'failed';
end;
$$;

-- What the worker needs to send one notice: the address to send to, and
-- whether a later event for the same request has replaced this one. This read
-- is backend-only and answers only for an event that has a customer notice
-- job, so it cannot serve as a general contact reader. It writes nothing.
create or replace function request_intent_private.customer_notice_delivery(p_event_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  intent request_intent_private.workflow_notice_intents;
  address text;
begin
  if current_setting('role', true) is distinct from 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'customer_notice_backend_only';
  end if;
  if p_event_key is null
    or p_event_key !~ '^ea-request-customer-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'invalid_customer_notice_event';
  end if;
  select * into intent from request_intent_private.workflow_notice_intents i
  where i.event_id = substr(p_event_key, length('ea-request-customer-') + 1)::uuid;
  if not found or not exists (
    select 1 from public.research_notification_outbox o
    where o.event_key = p_event_key
      and o.event_type = o.template_key
      and o.template_key in ('ea_request_received_queued_customer_v1', 'ea_request_reviewing_customer_v1')
  ) then
    return null;
  end if;
  select lower(btrim(r.contact->>'email')) into address
  from request_intent_private.requests r where r.id = intent.request_id;
  return jsonb_build_object(
    'address', address,
    'superseded', exists (
      select 1 from request_intent_private.workflow_notice_intents later
      where later.request_id = intent.request_id and later.revision > intent.revision
    )
  );
end;
$$;

create or replace function public.request_intent_customer_notice_delivery(p_event_key text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select request_intent_private.customer_notice_delivery(p_event_key);
$$;

-- The two workflow functions are callable only from the workflow's definer
-- functions. The worker's read is for the backend role alone.
revoke all on function request_intent_private.enqueue_workflow_notice(uuid, uuid, text, bigint, text),
  request_intent_private.workflow_customer_notice(uuid, uuid),
  request_intent_private.customer_notice_delivery(text),
  public.request_intent_customer_notice_delivery(text)
  from public, anon, authenticated, service_role;
grant execute on function request_intent_private.customer_notice_delivery(text),
  public.request_intent_customer_notice_delivery(text)
  to service_role;
commit;
