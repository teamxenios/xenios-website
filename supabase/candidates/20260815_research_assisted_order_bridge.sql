-- Xenios Research assisted-order intake bridge.
-- Candidate only. Register in the canonical migration DAG after review.
-- This migration creates no public/anon execution path.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create extension if not exists pgcrypto;

create table if not exists public.research_assisted_order_requests (
  id uuid primary key,
  public_reference text not null unique,
  idempotency_key_hash text not null unique,
  request_fingerprint text not null,
  actor_member_id uuid,
  early_access_session_hash text,
  normalized_email text not null,
  full_legal_name text not null,
  mobile_phone text not null,
  organization_name text,
  shipping_address jsonb not null,
  billing_address jsonb not null,
  age_confirmed boolean not null,
  agreements jsonb not null default '[]'::jsonb,
  general_notes text,
  affiliate_attribution_ref text,
  estimated_total_cents bigint,
  currency text not null default 'USD',
  status text not null default 'submitted',
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_assisted_order_requests_reference_chk
    check (public_reference ~ '^XRR-[0-9]{8}-[A-F0-9]{10}$'),
  constraint research_assisted_order_requests_email_chk
    check (normalized_email = lower(btrim(normalized_email)) and position('@' in normalized_email) > 1),
  constraint research_assisted_order_requests_identity_chk
    check (actor_member_id is not null or early_access_session_hash is not null),
  constraint research_assisted_order_requests_age_chk
    check (age_confirmed is true),
  constraint research_assisted_order_requests_currency_chk
    check (currency = 'USD'),
  constraint research_assisted_order_requests_total_chk
    check (estimated_total_cents is null or estimated_total_cents > 0),
  constraint research_assisted_order_requests_source_chk
    check (source = 'early_access_manual_order_bridge'),
  constraint research_assisted_order_requests_status_chk
    check (status in (
      'submitted',
      'reviewing',
      'waiting_on_customer',
      'identity_requested',
      'identity_received',
      'agreements_pending',
      'agreements_complete',
      'payment_pending',
      'payment_review',
      'paid',
      'supplier_processing',
      'shipped',
      'delivered',
      'closed',
      'cancelled'
    )),
  constraint research_assisted_order_requests_shipping_shape_chk
    check (
      jsonb_typeof(shipping_address) = 'object'
      and shipping_address ? 'line1'
      and shipping_address ? 'city'
      and shipping_address ? 'region'
      and shipping_address ? 'postalCode'
      and shipping_address ? 'countryCode'
    ),
  constraint research_assisted_order_requests_billing_shape_chk
    check (
      jsonb_typeof(billing_address) = 'object'
      and billing_address ? 'line1'
      and billing_address ? 'city'
      and billing_address ? 'region'
      and billing_address ? 'postalCode'
      and billing_address ? 'countryCode'
    ),
  constraint research_assisted_order_requests_agreements_shape_chk
    check (jsonb_typeof(agreements) = 'array')
);

create index if not exists research_assisted_order_requests_member_idx
  on public.research_assisted_order_requests (actor_member_id, created_at desc)
  where actor_member_id is not null;

create index if not exists research_assisted_order_requests_session_idx
  on public.research_assisted_order_requests (early_access_session_hash, created_at desc)
  where early_access_session_hash is not null;

create index if not exists research_assisted_order_requests_status_idx
  on public.research_assisted_order_requests (status, created_at desc);

create index if not exists research_assisted_order_requests_email_idx
  on public.research_assisted_order_requests (normalized_email, created_at desc);

create table if not exists public.research_assisted_order_lines (
  id uuid primary key,
  request_id uuid not null references public.research_assisted_order_requests(id) on delete restrict,
  product_id text not null,
  variant_id text not null,
  product_name text not null,
  specification text,
  format text,
  pack_basis text,
  quantity integer not null,
  minimum_quantity integer not null,
  maximum_quantity integer,
  quantity_increment integer not null,
  workflow_mode text not null,
  customer_action_label text not null,
  unit_price_cents bigint,
  line_estimate_cents bigint,
  currency text not null default 'USD',
  catalog_version text not null,
  price_version text,
  access_notice text,
  research_use_only boolean not null default false,
  authoritative_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint research_assisted_order_lines_identity_uq
    unique (request_id, product_id, variant_id),
  constraint research_assisted_order_lines_quantity_chk
    check (
      quantity >= minimum_quantity
      and quantity_increment >= 1
      and ((quantity - minimum_quantity) % quantity_increment) = 0
      and (maximum_quantity is null or quantity <= maximum_quantity)
    ),
  constraint research_assisted_order_lines_price_chk
    check (unit_price_cents is null or unit_price_cents > 0),
  constraint research_assisted_order_lines_estimate_chk
    check (
      (unit_price_cents is null and line_estimate_cents is null)
      or
      (unit_price_cents is not null and line_estimate_cents = unit_price_cents * quantity)
    ),
  constraint research_assisted_order_lines_currency_chk
    check (currency = 'USD'),
  constraint research_assisted_order_lines_mode_chk
    check (workflow_mode in (
      'direct_order_request',
      'provider_request',
      'request_pricing',
      'request_activation',
      'availability_review'
    )),
  constraint research_assisted_order_lines_price_pending_chk
    check (workflow_mode <> 'request_pricing' or unit_price_cents is null)
);

create index if not exists research_assisted_order_lines_request_idx
  on public.research_assisted_order_lines (request_id, created_at);

create table if not exists public.research_assisted_order_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.research_assisted_order_requests(id) on delete restrict,
  status text not null,
  actor_type text not null,
  actor_id text,
  customer_message text,
  internal_note text,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint research_assisted_order_events_status_chk
    check (status in (
      'submitted',
      'reviewing',
      'waiting_on_customer',
      'identity_requested',
      'identity_received',
      'agreements_pending',
      'agreements_complete',
      'payment_pending',
      'payment_review',
      'paid',
      'supplier_processing',
      'shipped',
      'delivered',
      'closed',
      'cancelled'
    )),
  constraint research_assisted_order_events_actor_chk
    check (actor_type in ('member', 'early_access_session', 'admin', 'system')),
  constraint research_assisted_order_events_evidence_chk
    check (jsonb_typeof(evidence) = 'object')
);

create index if not exists research_assisted_order_events_request_idx
  on public.research_assisted_order_events (request_id, occurred_at);

create table if not exists public.research_assisted_order_access_tokens (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.research_assisted_order_requests(id) on delete restrict,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  constraint research_assisted_order_access_tokens_expiry_chk
    check (expires_at > created_at)
);

create index if not exists research_assisted_order_access_tokens_request_idx
  on public.research_assisted_order_access_tokens (request_id, created_at desc);

create table if not exists public.research_assisted_order_documents (
  id uuid primary key,
  request_id uuid not null references public.research_assisted_order_requests(id) on delete restrict,
  object_path text not null unique,
  document_type text not null,
  side text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  status text not null default 'upload_pending',
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  retention_expires_at timestamptz not null,
  constraint research_assisted_order_documents_type_chk
    check (document_type in ('government_id', 'business_document', 'other')),
  constraint research_assisted_order_documents_side_chk
    check (side in ('front', 'back', 'single')),
  constraint research_assisted_order_documents_mime_chk
    check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  constraint research_assisted_order_documents_size_chk
    check (size_bytes between 1 and 15728640),
  constraint research_assisted_order_documents_status_chk
    check (status in (
      'upload_pending',
      'uploaded',
      'scan_pending',
      'accepted',
      'rejected',
      'expired',
      'deleted'
    )),
  constraint research_assisted_order_documents_retention_chk
    check (retention_expires_at > created_at)
);

create index if not exists research_assisted_order_documents_request_idx
  on public.research_assisted_order_documents (request_id, created_at);

alter table public.research_assisted_order_requests enable row level security;
alter table public.research_assisted_order_lines enable row level security;
alter table public.research_assisted_order_events enable row level security;
alter table public.research_assisted_order_access_tokens enable row level security;
alter table public.research_assisted_order_documents enable row level security;

revoke all on public.research_assisted_order_requests from public, anon, authenticated;
revoke all on public.research_assisted_order_lines from public, anon, authenticated;
revoke all on public.research_assisted_order_events from public, anon, authenticated;
revoke all on public.research_assisted_order_access_tokens from public, anon, authenticated;
revoke all on public.research_assisted_order_documents from public, anon, authenticated;

grant select, insert, update on public.research_assisted_order_requests to service_role;
grant select, insert on public.research_assisted_order_lines to service_role;
grant select, insert on public.research_assisted_order_events to service_role;
grant select, insert, update on public.research_assisted_order_access_tokens to service_role;
grant select, insert, update on public.research_assisted_order_documents to service_role;

create or replace function public.research_assisted_order_line_json(p_line public.research_assisted_order_lines)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'lineId', p_line.id,
    'productId', p_line.product_id,
    'variantId', p_line.variant_id,
    'productName', p_line.product_name,
    'specification', p_line.specification,
    'format', p_line.format,
    'packBasis', p_line.pack_basis,
    'quantity', p_line.quantity,
    'minimumQuantity', p_line.minimum_quantity,
    'maximumQuantity', p_line.maximum_quantity,
    'quantityIncrement', p_line.quantity_increment,
    'workflowMode', p_line.workflow_mode,
    'customerActionLabel', p_line.customer_action_label,
    'unitPriceCents', p_line.unit_price_cents,
    'lineEstimateCents', p_line.line_estimate_cents,
    'currency', p_line.currency,
    'catalogVersion', p_line.catalog_version,
    'priceVersion', p_line.price_version,
    'accessNotice', p_line.access_notice,
    'researchUseOnly', p_line.research_use_only
  );
$$;

create or replace function public.research_assisted_order_lines_json(p_request_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(public.research_assisted_order_line_json(line_row) order by line_row.created_at, line_row.id),
    '[]'::jsonb
  )
  from public.research_assisted_order_lines line_row
  where line_row.request_id = p_request_id;
$$;

create or replace function public.research_assisted_order_timeline_json(p_request_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'status', event_row.status,
        'occurredAt', event_row.occurred_at,
        'customerMessage', event_row.customer_message
      )
      order by event_row.occurred_at, event_row.id
    ),
    '[]'::jsonb
  )
  from public.research_assisted_order_events event_row
  where event_row.request_id = p_request_id;
$$;

create or replace function public.research_assisted_order_documents_json(p_request_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'documentId', document_row.id,
        'documentType', document_row.document_type,
        'side', document_row.side,
        'fileName', document_row.file_name,
        'status', document_row.status,
        'uploadedAt', document_row.uploaded_at
      )
      order by document_row.created_at, document_row.id
    ),
    '[]'::jsonb
  )
  from public.research_assisted_order_documents document_row
  where document_row.request_id = p_request_id
    and document_row.status <> 'deleted';
$$;

create or replace function public.research_assisted_order_admin_json(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'requestId', request_row.id,
    'publicReference', request_row.public_reference,
    'status', request_row.status,
    'actorMemberId', request_row.actor_member_id,
    'fullLegalName', request_row.full_legal_name,
    'email', request_row.normalized_email,
    'mobilePhone', request_row.mobile_phone,
    'organizationName', request_row.organization_name,
    'shippingAddress', request_row.shipping_address,
    'billingAddress', request_row.billing_address,
    'lines', public.research_assisted_order_lines_json(request_row.id),
    'estimatedTotalCents', request_row.estimated_total_cents,
    'currency', request_row.currency,
    'generalNotes', request_row.general_notes,
    'agreements', request_row.agreements,
    'affiliateAttributionRef', request_row.affiliate_attribution_ref,
    'timeline', public.research_assisted_order_timeline_json(request_row.id),
    'documents', public.research_assisted_order_documents_json(request_row.id),
    'createdAt', request_row.created_at,
    'updatedAt', request_row.updated_at
  )
  from public.research_assisted_order_requests request_row
  where request_row.id = p_request_id;
$$;

create or replace function public.research_assisted_order_submit(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid := (p_request ->> 'requestId')::uuid;
  v_existing public.research_assisted_order_requests%rowtype;
  v_line jsonb;
  v_line_count integer;
  v_inserted boolean := false;
begin
  if jsonb_typeof(p_request) <> 'object' then
    raise exception using errcode = '22023', message = 'assisted order payload must be an object';
  end if;
  if jsonb_typeof(p_request -> 'lines') <> 'array' then
    raise exception using errcode = '22023', message = 'assisted order lines must be an array';
  end if;
  v_line_count := jsonb_array_length(p_request -> 'lines');
  if v_line_count < 1 or v_line_count > 200 then
    raise exception using errcode = '22023', message = 'assisted order line count is invalid';
  end if;

  insert into public.research_assisted_order_requests (
    id,
    public_reference,
    idempotency_key_hash,
    request_fingerprint,
    actor_member_id,
    early_access_session_hash,
    normalized_email,
    full_legal_name,
    mobile_phone,
    organization_name,
    shipping_address,
    billing_address,
    age_confirmed,
    agreements,
    general_notes,
    affiliate_attribution_ref,
    estimated_total_cents,
    currency,
    source,
    status,
    created_at,
    updated_at
  ) values (
    v_request_id,
    p_request ->> 'publicReference',
    p_request ->> 'idempotencyKeyHash',
    p_request ->> 'requestFingerprint',
    nullif(p_request ->> 'actorMemberId', '')::uuid,
    nullif(p_request ->> 'earlyAccessSessionHash', ''),
    lower(btrim(p_request ->> 'normalizedEmail')),
    btrim(p_request ->> 'fullLegalName'),
    btrim(p_request ->> 'mobilePhone'),
    nullif(btrim(p_request ->> 'organizationName'), ''),
    p_request -> 'shippingAddress',
    p_request -> 'billingAddress',
    coalesce((p_request ->> 'ageConfirmed')::boolean, false),
    coalesce(p_request -> 'agreements', '[]'::jsonb),
    nullif(btrim(p_request ->> 'generalNotes'), ''),
    nullif(btrim(p_request ->> 'affiliateAttributionRef'), ''),
    nullif(p_request ->> 'estimatedTotalCents', '')::bigint,
    coalesce(p_request ->> 'currency', 'USD'),
    p_request ->> 'source',
    'submitted',
    coalesce((p_request ->> 'createdAt')::timestamptz, now()),
    coalesce((p_request ->> 'createdAt')::timestamptz, now())
  )
  on conflict (idempotency_key_hash) do nothing;

  get diagnostics v_line_count = row_count;
  v_inserted := v_line_count = 1;

  if v_inserted then
    for v_line in select * from jsonb_array_elements(p_request -> 'lines') loop
      insert into public.research_assisted_order_lines (
        id,
        request_id,
        product_id,
        variant_id,
        product_name,
        specification,
        format,
        pack_basis,
        quantity,
        minimum_quantity,
        maximum_quantity,
        quantity_increment,
        workflow_mode,
        customer_action_label,
        unit_price_cents,
        line_estimate_cents,
        currency,
        catalog_version,
        price_version,
        access_notice,
        research_use_only,
        authoritative_fingerprint,
        created_at
      ) values (
        (v_line ->> 'lineId')::uuid,
        v_request_id,
        v_line ->> 'productId',
        v_line ->> 'variantId',
        v_line ->> 'productName',
        nullif(v_line ->> 'specification', ''),
        nullif(v_line ->> 'format', ''),
        nullif(v_line ->> 'packBasis', ''),
        (v_line ->> 'quantity')::integer,
        (v_line ->> 'minimumQuantity')::integer,
        nullif(v_line ->> 'maximumQuantity', '')::integer,
        (v_line ->> 'quantityIncrement')::integer,
        v_line ->> 'workflowMode',
        v_line ->> 'customerActionLabel',
        nullif(v_line ->> 'unitPriceCents', '')::bigint,
        nullif(v_line ->> 'lineEstimateCents', '')::bigint,
        coalesce(v_line ->> 'currency', 'USD'),
        v_line ->> 'catalogVersion',
        nullif(v_line ->> 'priceVersion', ''),
        nullif(v_line ->> 'accessNotice', ''),
        coalesce((v_line ->> 'researchUseOnly')::boolean, false),
        v_line ->> 'authoritativeFingerprint',
        coalesce((p_request ->> 'createdAt')::timestamptz, now())
      );
    end loop;

    insert into public.research_assisted_order_events (
      request_id,
      status,
      actor_type,
      actor_id,
      customer_message,
      evidence,
      occurred_at
    ) values (
      v_request_id,
      'submitted',
      case when p_request ->> 'actorMemberId' is not null then 'member' else 'early_access_session' end,
      coalesce(p_request ->> 'actorMemberId', p_request ->> 'earlyAccessSessionHash'),
      'Your request has been received.',
      jsonb_build_object(
        'requestFingerprint', p_request ->> 'requestFingerprint',
        'lineCount', jsonb_array_length(p_request -> 'lines')
      ),
      coalesce((p_request ->> 'createdAt')::timestamptz, now())
    );
  else
    select * into strict v_existing
    from public.research_assisted_order_requests
    where idempotency_key_hash = p_request ->> 'idempotencyKeyHash'
    for update;

    if v_existing.request_fingerprint <> p_request ->> 'requestFingerprint' then
      raise exception using errcode = '23505', message = 'assisted order idempotency conflict';
    end if;
    v_request_id := v_existing.id;
  end if;

  insert into public.research_assisted_order_access_tokens (
    request_id,
    token_hash,
    created_at,
    expires_at
  ) values (
    v_request_id,
    p_request ->> 'statusTokenHash',
    now(),
    now() + interval '30 days'
  )
  on conflict (token_hash) do nothing;

  select * into strict v_existing
  from public.research_assisted_order_requests
  where id = v_request_id;

  return jsonb_build_object(
    'requestFingerprint', v_existing.request_fingerprint,
    'statusTokenHash', p_request ->> 'statusTokenHash',
    'receipt', jsonb_build_object(
      'requestId', v_existing.id,
      'publicReference', v_existing.public_reference,
      'createdAt', v_existing.created_at,
      'estimatedTotalCents', v_existing.estimated_total_cents,
      'lines', public.research_assisted_order_lines_json(v_existing.id)
    )
  );
end;
$$;

create or replace function public.research_assisted_order_status(
  p_public_reference text,
  p_member_id uuid default null,
  p_early_access_session_hash text default null,
  p_status_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.research_assisted_order_requests%rowtype;
  v_authorized boolean := false;
begin
  select * into v_request
  from public.research_assisted_order_requests
  where public_reference = p_public_reference;

  if not found then
    return null;
  end if;

  v_authorized :=
    (p_member_id is not null and v_request.actor_member_id = p_member_id)
    or
    (p_early_access_session_hash is not null and v_request.early_access_session_hash = p_early_access_session_hash)
    or
    exists (
      select 1
      from public.research_assisted_order_access_tokens token_row
      where token_row.request_id = v_request.id
        and token_row.token_hash = p_status_token_hash
        and token_row.revoked_at is null
        and token_row.expires_at > now()
    );

  if not v_authorized then
    return null;
  end if;

  return jsonb_build_object(
    'requestId', v_request.id,
    'publicReference', v_request.public_reference,
    'status', v_request.status,
    'createdAt', v_request.created_at,
    'updatedAt', v_request.updated_at,
    'estimatedTotalCents', v_request.estimated_total_cents,
    'lines', public.research_assisted_order_lines_json(v_request.id),
    'timeline', public.research_assisted_order_timeline_json(v_request.id),
    'documents', public.research_assisted_order_documents_json(v_request.id),
    'actionRequired', case v_request.status
      when 'waiting_on_customer' then 'Additional information is required.'
      when 'identity_requested' then 'Securely upload the requested identity documents.'
      when 'agreements_pending' then 'Review and complete the required agreements.'
      when 'payment_pending' then 'Follow the payment instructions provided by Xenios.'
      else null
    end
  );
end;
$$;

create or replace function public.research_assisted_order_admin_get(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.research_assisted_order_admin_json(p_request_id);
$$;

create or replace function public.research_assisted_order_admin_list(
  p_status text default null,
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_offset integer;
  v_total integer;
  v_items jsonb;
begin
  if p_page < 1 or p_page_size < 1 or p_page_size > 100 then
    raise exception using errcode = '22023', message = 'invalid pagination';
  end if;
  v_offset := (p_page - 1) * p_page_size;

  select count(*) into v_total
  from public.research_assisted_order_requests request_row
  where (p_status is null or request_row.status = p_status)
    and (
      p_search is null
      or request_row.public_reference ilike '%' || p_search || '%'
      or request_row.full_legal_name ilike '%' || p_search || '%'
      or request_row.normalized_email ilike '%' || p_search || '%'
      or coalesce(request_row.organization_name, '') ilike '%' || p_search || '%'
    );

  select coalesce(jsonb_agg(item order by item ->> 'createdAt' desc), '[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'requestId', request_row.id,
      'publicReference', request_row.public_reference,
      'status', request_row.status,
      'fullLegalName', request_row.full_legal_name,
      'email', request_row.normalized_email,
      'mobilePhone', request_row.mobile_phone,
      'organizationName', request_row.organization_name,
      'lineCount', count(line_row.id),
      'totalQuantity', coalesce(sum(line_row.quantity), 0),
      'estimatedTotalCents', request_row.estimated_total_cents,
      'workflowModes', coalesce(jsonb_agg(distinct line_row.workflow_mode) filter (where line_row.workflow_mode is not null), '[]'::jsonb),
      'identityDocumentStatus', (
        select document_row.status
        from public.research_assisted_order_documents document_row
        where document_row.request_id = request_row.id
          and document_row.document_type = 'government_id'
        order by document_row.created_at desc
        limit 1
      ),
      'createdAt', request_row.created_at,
      'updatedAt', request_row.updated_at
    ) as item
    from public.research_assisted_order_requests request_row
    left join public.research_assisted_order_lines line_row
      on line_row.request_id = request_row.id
    where (p_status is null or request_row.status = p_status)
      and (
        p_search is null
        or request_row.public_reference ilike '%' || p_search || '%'
        or request_row.full_legal_name ilike '%' || p_search || '%'
        or request_row.normalized_email ilike '%' || p_search || '%'
        or coalesce(request_row.organization_name, '') ilike '%' || p_search || '%'
      )
    group by request_row.id
    order by request_row.created_at desc
    limit p_page_size offset v_offset
  ) rows_for_page;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', p_page,
    'pageSize', p_page_size
  );
end;
$$;

create or replace function public.research_assisted_order_set_status(
  p_request_id uuid,
  p_expected_status text,
  p_new_status text,
  p_actor_id text,
  p_actor_type text,
  p_customer_message text default null,
  p_internal_note text default null,
  p_evidence jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.research_assisted_order_requests
  set status = p_new_status,
      updated_at = p_occurred_at
  where id = p_request_id
    and status = p_expected_status;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception using errcode = '40001', message = 'assisted order status changed concurrently';
  end if;

  insert into public.research_assisted_order_events (
    request_id,
    status,
    actor_type,
    actor_id,
    customer_message,
    internal_note,
    evidence,
    occurred_at
  ) values (
    p_request_id,
    p_new_status,
    p_actor_type,
    p_actor_id,
    nullif(btrim(p_customer_message), ''),
    nullif(btrim(p_internal_note), ''),
    coalesce(p_evidence, '{}'::jsonb),
    p_occurred_at
  );

  return public.research_assisted_order_admin_json(p_request_id);
end;
$$;

create or replace function public.research_assisted_order_document_create(p_document jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.research_assisted_order_documents (
    id,
    request_id,
    object_path,
    document_type,
    side,
    file_name,
    mime_type,
    size_bytes,
    status,
    created_at,
    retention_expires_at
  ) values (
    (p_document ->> 'documentId')::uuid,
    (p_document ->> 'requestId')::uuid,
    p_document ->> 'objectPath',
    p_document ->> 'documentType',
    p_document ->> 'side',
    p_document ->> 'fileName',
    p_document ->> 'mimeType',
    (p_document ->> 'sizeBytes')::bigint,
    p_document ->> 'status',
    (p_document ->> 'createdAt')::timestamptz,
    (p_document ->> 'retentionExpiresAt')::timestamptz
  );
end;
$$;

create or replace function public.research_assisted_order_document_complete(
  p_request_id uuid,
  p_document_id uuid,
  p_object_path text,
  p_uploaded_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.research_assisted_order_documents%rowtype;
begin
  update public.research_assisted_order_documents
  set status = 'uploaded',
      uploaded_at = p_uploaded_at
  where id = p_document_id
    and request_id = p_request_id
    and object_path = p_object_path
    and status = 'upload_pending'
  returning * into v_document;

  if not found then
    raise exception using errcode = '40001', message = 'document upload state changed or was not found';
  end if;

  return jsonb_build_object(
    'documentId', v_document.id,
    'documentType', v_document.document_type,
    'side', v_document.side,
    'fileName', v_document.file_name,
    'status', v_document.status,
    'uploadedAt', v_document.uploaded_at
  );
end;
$$;

create or replace function public.research_assisted_order_document_get(
  p_request_id uuid,
  p_document_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'documentId', document_row.id,
    'requestId', document_row.request_id,
    'objectPath', document_row.object_path,
    'documentType', document_row.document_type,
    'side', document_row.side,
    'fileName', document_row.file_name,
    'mimeType', document_row.mime_type,
    'sizeBytes', document_row.size_bytes,
    'status', document_row.status,
    'createdAt', document_row.created_at,
    'retentionExpiresAt', document_row.retention_expires_at
  )
  from public.research_assisted_order_documents document_row
  where document_row.request_id = p_request_id
    and document_row.id = p_document_id;
$$;

revoke all on function public.research_assisted_order_line_json(public.research_assisted_order_lines) from public, anon, authenticated;
revoke all on function public.research_assisted_order_lines_json(uuid) from public, anon, authenticated;
revoke all on function public.research_assisted_order_timeline_json(uuid) from public, anon, authenticated;
revoke all on function public.research_assisted_order_documents_json(uuid) from public, anon, authenticated;
revoke all on function public.research_assisted_order_admin_json(uuid) from public, anon, authenticated;
revoke all on function public.research_assisted_order_submit(jsonb) from public, anon, authenticated;
revoke all on function public.research_assisted_order_status(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.research_assisted_order_admin_get(uuid) from public, anon, authenticated;
revoke all on function public.research_assisted_order_admin_list(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.research_assisted_order_set_status(uuid, text, text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.research_assisted_order_document_create(jsonb) from public, anon, authenticated;
revoke all on function public.research_assisted_order_document_complete(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.research_assisted_order_document_get(uuid, uuid) from public, anon, authenticated;

grant execute on function public.research_assisted_order_submit(jsonb) to service_role;
grant execute on function public.research_assisted_order_status(text, uuid, text, text) to service_role;
grant execute on function public.research_assisted_order_admin_get(uuid) to service_role;
grant execute on function public.research_assisted_order_admin_list(text, text, integer, integer) to service_role;
grant execute on function public.research_assisted_order_set_status(uuid, text, text, text, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.research_assisted_order_document_create(jsonb) to service_role;
grant execute on function public.research_assisted_order_document_complete(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.research_assisted_order_document_get(uuid, uuid) to service_role;

-- The bucket remains private. Server-generated signed URLs are the only client path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'research-assisted-order-documents',
  'research-assisted-order-documents',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;
