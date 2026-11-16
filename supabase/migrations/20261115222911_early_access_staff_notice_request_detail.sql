begin;
set local lock_timeout = '5s';

-- Full request staff notices. The choice between the short alert and the full
-- request email is made once, when the job is queued, and stored as the job's
-- template. A retry therefore always sends the same body under the same
-- idempotency key, whatever the running build or its settings.
--
-- Requests created on or after p_detail_since are queued with the full
-- template. Earlier requests keep the existing short template. The existing
-- two-argument reconciliation is unchanged.
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
  on conflict (event_key) do nothing;
  get diagnostics enqueued = row_count;
  return enqueued;
end;
$$;

create or replace function public.request_intent_enqueue_staff_notices(
  p_since timestamptz, p_recipients text[], p_detail_since timestamptz
)
returns integer language sql security invoker set search_path = '' as $$
  select request_intent_private.enqueue_staff_notices(p_since, p_recipients, p_detail_since);
$$;

-- The worker renders a full notice from the request as submitted. This read
-- is backend-only and answers only for a request whose job was queued with the
-- full template, so it cannot serve as a general request reader. It names
-- every field it returns. It never returns agreements, owner or attempt
-- hashes, optional context, catalog internals or audit rows. It writes
-- nothing, so no staff_read or queue_list event comes from the worker.
create or replace function request_intent_private.staff_notice_address(value jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(value) = 'object' then jsonb_strip_nulls(jsonb_build_object(
    'line1', value->'line1',
    'line2', value->'line2',
    'city', value->'city',
    'region', value->'region',
    'postalCode', value->'postalCode',
    'countryCode', value->'countryCode'
  )) end;
$$;

create or replace function request_intent_private.staff_notice_detail(p_event_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  stored request_intent_private.requests;
begin
  if current_setting('role', true) is distinct from 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'staff_notice_backend_only';
  end if;
  if p_event_key is null
    or p_event_key !~ '^ea-request-submitted-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'invalid_staff_notice_event';
  end if;
  if not exists (
    select 1 from public.research_notification_outbox o
    where o.event_key = p_event_key
      and o.event_type = 'ea_request_submitted_staff_full_v1'
      and o.template_key = 'ea_request_submitted_staff_full_v1'
  ) then
    return null;
  end if;
  select * into stored from request_intent_private.requests r
  where r.id = substr(p_event_key, length('ea-request-submitted-') + 1)::uuid;
  if not found then return null; end if;

  return jsonb_build_object(
    'reference', stored.public_reference,
    'submittedAt', stored.created_at,
    'contact', jsonb_strip_nulls(jsonb_build_object(
      'fullLegalName', stored.contact->'fullLegalName',
      'email', stored.contact->'email',
      'mobilePhone', stored.contact->'mobilePhone',
      'organizationName', stored.contact->'organizationName',
      'shippingAddress', request_intent_private.staff_notice_address(stored.contact->'shippingAddress'),
      'billingSameAsShipping', stored.contact->'billingSameAsShipping',
      'billingAddress', case when stored.contact->'billingSameAsShipping' = 'true'::jsonb then null
        else request_intent_private.staff_notice_address(stored.contact->'billingAddress') end
    )),
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'productName', entry.line->'productName',
        'specification', entry.line->'specification',
        'variantId', entry.line->'variantId',
        'quantity', entry.line->'quantity'
      ) order by entry.position), '[]'::jsonb)
      from jsonb_array_elements(stored.lines) with ordinality as entry(line, position)
    )
  );
end;
$$;

create or replace function public.request_intent_staff_notice_detail(p_event_key text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select request_intent_private.staff_notice_detail(p_event_key);
$$;

revoke all on function request_intent_private.staff_notice_address(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function request_intent_private.enqueue_staff_notices(timestamptz, text[], timestamptz),
  public.request_intent_enqueue_staff_notices(timestamptz, text[], timestamptz),
  request_intent_private.staff_notice_detail(text),
  public.request_intent_staff_notice_detail(text)
  from public, anon, authenticated, service_role;
grant execute on function request_intent_private.enqueue_staff_notices(timestamptz, text[], timestamptz),
  public.request_intent_enqueue_staff_notices(timestamptz, text[], timestamptz),
  request_intent_private.staff_notice_detail(text),
  public.request_intent_staff_notice_detail(text)
  to service_role;
commit;
