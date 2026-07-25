-- Xenios Research product-request system.
--
-- Requests are demand signals only. Nothing in this migration creates or
-- changes products, orders, inventory, prices, commerce flags, approvals, or
-- availability. Browser clients receive no direct table policy. All access is
-- through the server's service-role client after member/admin authorization.

create extension if not exists pgcrypto;

create table if not exists public.research_product_demand_candidates (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null,
  category text not null check (
    category in (
      'research_vial', 'blend', 'supplement', 'laboratory_supply',
      'program', 'quantum', 'other'
    )
  ),
  display_name text not null,
  normalized_brands text[] not null default '{}'::text[],
  observed_domains text[] not null default '{}'::text[],
  known_synonyms text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name, category)
);

alter table public.research_product_demand_candidates
  add column if not exists normalized_brands text[] not null default '{}'::text[],
  add column if not exists observed_domains text[] not null default '{}'::text[],
  add column if not exists known_synonyms text[] not null default '{}'::text[];

create table if not exists public.research_product_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  member_id uuid not null references public.research_members(id) on delete restrict,
  idempotency_key text not null,
  product_name text not null,
  category text not null check (
    category in (
      'research_vial', 'blend', 'supplement', 'laboratory_supply',
      'program', 'quantum', 'other'
    )
  ),
  description text not null,
  brand text,
  product_url text,
  desired_presentation text,
  desired_quantity text,
  expected_purchase_frequency text check (
    expected_purchase_frequency is null or expected_purchase_frequency in (
      'one_time', 'occasionally', 'monthly', 'not_sure'
    )
  ),
  interest_timing text check (
    interest_timing is null or interest_timing in (
      'asap', 'within_30_days', 'within_90_days', 'future_interest', 'researching'
    )
  ),
  additional_notes text,
  contact_consent boolean not null default false,
  status text not null default 'submitted' check (
    status in (
      'submitted', 'under_review', 'more_information_requested',
      'accepted_for_diligence', 'planned', 'added_to_catalog',
      'currently_unavailable', 'not_moving_forward', 'closed', 'withdrawn'
    )
  ),
  member_visible_update text,
  assigned_owner text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  internal_notes text,
  quality_review_status text,
  claims_review_status text,
  payment_processor_review_status text,
  legal_review_status text,
  commercial_model_status text,
  candidate_id uuid references public.research_product_demand_candidates(id) on delete set null,
  linked_product_ref text,
  attribution_source text,
  attribution_code text,
  version integer not null default 1 check (version > 0),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, idempotency_key)
);

create table if not exists public.research_product_request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.research_product_requests(id) on delete restrict,
  uploader_member_id uuid not null references public.research_members(id) on delete restrict,
  storage_path text not null unique,
  original_filename text not null,
  content_type text not null check (
    content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text,
  state text not null default 'pending' check (state in ('pending', 'confirmed', 'removed')),
  uploaded_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_product_request_storage_cleanup (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null unique references public.research_product_request_files(id) on delete restrict,
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'deleted')),
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_product_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.research_product_requests(id) on delete restrict,
  actor_type text not null check (actor_type in ('member', 'admin', 'system')),
  actor_ref text,
  event_type text not null,
  dedupe_key text not null,
  previous_status text,
  next_status text,
  member_visible_message text,
  internal_detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (request_id, dedupe_key)
);

create or replace function public.research_reject_product_request_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'research_product_request_events is append-only';
end;
$$;

drop trigger if exists research_product_request_events_append_only
  on public.research_product_request_events;
create trigger research_product_request_events_append_only
before update or delete on public.research_product_request_events
for each row execute function public.research_reject_product_request_event_mutation();

create index if not exists research_product_requests_member_created_idx
  on public.research_product_requests(member_id, created_at desc);
create index if not exists research_product_requests_queue_idx
  on public.research_product_requests(status, priority, created_at desc);
create index if not exists research_product_requests_candidate_idx
  on public.research_product_requests(candidate_id);
create index if not exists research_product_request_files_request_idx
  on public.research_product_request_files(request_id, created_at);
create index if not exists research_product_request_events_request_idx
  on public.research_product_request_events(request_id, created_at);
create index if not exists research_product_request_storage_cleanup_pending_idx
  on public.research_product_request_storage_cleanup(status, created_at);

alter table public.research_product_demand_candidates enable row level security;
alter table public.research_product_requests enable row level security;
alter table public.research_product_request_files enable row level security;
alter table public.research_product_request_storage_cleanup enable row level security;
alter table public.research_product_request_events enable row level security;

-- Private bucket only. Access is granted with short-lived signed URLs after a
-- server-side ownership/permission check. There is intentionally no public
-- storage.objects policy for this bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'research-product-requests',
  'research-product-requests',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Atomic, idempotent creation: candidate aggregation, the request, and its
-- first append-only event either land together or not at all.
create or replace function public.research_create_product_request(
  p_request_id uuid,
  p_reference text,
  p_member_id uuid,
  p_idempotency_key text,
  p_product_name text,
  p_normalized_name text,
  p_normalized_brand text,
  p_link_domain text,
  p_category text,
  p_description text,
  p_brand text,
  p_product_url text,
  p_desired_presentation text,
  p_desired_quantity text,
  p_expected_purchase_frequency text,
  p_interest_timing text,
  p_additional_notes text,
  p_contact_consent boolean,
  p_attribution_source text,
  p_attribution_code text,
  p_member_email text,
  p_member_first_name text,
  p_now timestamptz
)
returns public.research_product_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.research_product_demand_candidates;
  v_request public.research_product_requests;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_member_id::text || ':' || p_idempotency_key, 0)
  );
  select * into v_request
  from public.research_product_requests
  where member_id = p_member_id and idempotency_key = p_idempotency_key;
  if found then
    return v_request;
  end if;

  insert into public.research_product_demand_candidates (
    normalized_name, category, display_name, normalized_brands,
    observed_domains, created_at, updated_at
  )
  values (
    p_normalized_name,
    p_category,
    p_product_name,
    case when p_normalized_brand is null then '{}'::text[] else array[p_normalized_brand] end,
    case when p_link_domain is null then '{}'::text[] else array[p_link_domain] end,
    p_now,
    p_now
  )
  on conflict (normalized_name, category) do update
    set
      normalized_brands = case
        when p_normalized_brand is null
          or p_normalized_brand = any(public.research_product_demand_candidates.normalized_brands)
          then public.research_product_demand_candidates.normalized_brands
        else array_append(public.research_product_demand_candidates.normalized_brands, p_normalized_brand)
      end,
      observed_domains = case
        when p_link_domain is null
          or p_link_domain = any(public.research_product_demand_candidates.observed_domains)
          then public.research_product_demand_candidates.observed_domains
        else array_append(public.research_product_demand_candidates.observed_domains, p_link_domain)
      end,
      updated_at = excluded.updated_at
  returning * into v_candidate;

  insert into public.research_product_requests (
    id, reference, member_id, idempotency_key, product_name, category,
    description, brand, product_url, desired_presentation, desired_quantity,
    expected_purchase_frequency, interest_timing, additional_notes,
    contact_consent, candidate_id, attribution_source, attribution_code,
    created_at, updated_at
  )
  values (
    p_request_id, p_reference, p_member_id, p_idempotency_key, p_product_name,
    p_category, p_description, p_brand, p_product_url, p_desired_presentation,
    p_desired_quantity, p_expected_purchase_frequency, p_interest_timing,
    p_additional_notes, p_contact_consent, v_candidate.id,
    p_attribution_source, p_attribution_code, p_now, p_now
  )
  on conflict (member_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning * into v_request;

  insert into public.research_product_request_events (
    request_id, actor_type, actor_ref, event_type, dedupe_key,
    next_status, member_visible_message, created_at
  )
  values (
    v_request.id, 'member', p_member_id::text, 'submitted', 'submitted',
    'submitted', 'Request received.', p_now
  )
  on conflict (request_id, dedupe_key) do nothing;

  insert into public.research_notification_outbox (
    event_key, member_id, event_type, channel, recipient, template_key,
    payload, status, next_attempt_at, created_at, updated_at
  ) values (
    'product-request-received:' || v_request.id::text,
    p_member_id,
    'product_request_received',
    'email',
    p_member_email,
    'member_product_request_received',
    jsonb_build_object(
      'firstName', p_member_first_name,
      'reference', v_request.reference,
      'productName', v_request.product_name,
      'status', v_request.status
    ),
    'pending',
    p_now,
    p_now,
    p_now
  )
  on conflict (event_key) do nothing;

  return v_request;
end;
$$;

create or replace function public.research_confirm_product_request_file(
  p_file_id uuid,
  p_request_id uuid,
  p_member_id uuid,
  p_now timestamptz
)
returns public.research_product_request_files
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.research_product_request_files;
  v_request_status text;
begin
  select status into v_request_status
  from public.research_product_requests
  where id = p_request_id and member_id = p_member_id
  for update;
  if not found or v_request_status in ('closed', 'withdrawn') then
    raise exception 'state_conflict';
  end if;

  select * into v_file
  from public.research_product_request_files
  where id = p_file_id
    and request_id = p_request_id
    and uploader_member_id = p_member_id
  for update;
  if not found then
    raise exception 'state_conflict';
  end if;
  if v_file.state = 'confirmed' then
    return v_file;
  end if;
  if v_file.state <> 'pending' then
    raise exception 'state_conflict';
  end if;

  update public.research_product_request_files
  set state = 'confirmed', uploaded_at = p_now, updated_at = p_now
  where id = p_file_id
  returning * into v_file;

  insert into public.research_product_request_events (
    request_id, actor_type, actor_ref, event_type, dedupe_key,
    member_visible_message, created_at
  ) values (
    p_request_id, 'member', p_member_id::text, 'attachment_added',
    'attachment-added:' || p_file_id::text, v_file.original_filename || ' added.', p_now
  )
  on conflict (request_id, dedupe_key) do nothing;
  return v_file;
end;
$$;

create or replace function public.research_reserve_product_request_file(
  p_file_id uuid,
  p_request_id uuid,
  p_member_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_content_type text,
  p_size_bytes integer,
  p_now timestamptz
)
returns public.research_product_request_files
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_status text;
  v_file public.research_product_request_files;
begin
  perform pg_advisory_xact_lock(hashtextextended('product-request-upload:' || p_member_id::text, 0));

  select status into v_request_status
  from public.research_product_requests
  where id = p_request_id and member_id = p_member_id
  for update;
  if not found or v_request_status in ('closed', 'withdrawn') then
    raise exception 'state_conflict';
  end if;

  insert into public.research_product_request_storage_cleanup (
    file_id, storage_path, status, created_at, updated_at
  )
  select id, storage_path, 'pending', p_now, p_now
  from public.research_product_request_files
  where uploader_member_id = p_member_id
    and state = 'pending'
    and created_at < p_now - interval '24 hours'
  on conflict (file_id) do nothing;

  update public.research_product_request_files
  set state = 'removed', removed_at = p_now, updated_at = p_now
  where uploader_member_id = p_member_id
    and state = 'pending'
    and created_at < p_now - interval '24 hours';

  if (
    select count(*)
    from public.research_product_request_files
    where request_id = p_request_id and state <> 'removed'
  ) >= 5 then
    raise exception 'attachment_limit';
  end if;

  if (
    select count(*)
    from public.research_product_request_files
    where uploader_member_id = p_member_id
      and created_at >= p_now - interval '1 hour'
  ) >= 10 then
    raise exception 'upload_rate_limited';
  end if;

  insert into public.research_product_request_files (
    id, request_id, uploader_member_id, storage_path, original_filename,
    content_type, size_bytes, state, created_at, updated_at
  ) values (
    p_file_id, p_request_id, p_member_id, p_storage_path, p_original_filename,
    p_content_type, p_size_bytes, 'pending', p_now, p_now
  )
  returning * into v_file;
  return v_file;
end;
$$;

create or replace function public.research_remove_product_request_file(
  p_file_id uuid,
  p_request_id uuid,
  p_member_id uuid,
  p_now timestamptz
)
returns public.research_product_request_files
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.research_product_request_files;
begin
  select * into v_file
  from public.research_product_request_files
  where id = p_file_id
    and request_id = p_request_id
    and uploader_member_id = p_member_id
  for update;
  if not found then
    raise exception 'state_conflict';
  end if;
  if v_file.state = 'removed' then
    insert into public.research_product_request_storage_cleanup (
      file_id, storage_path, status, created_at, updated_at
    ) values (
      v_file.id, v_file.storage_path, 'pending', p_now, p_now
    )
    on conflict (file_id) do nothing;
    return v_file;
  end if;

  update public.research_product_request_files
  set state = 'removed', removed_at = p_now, updated_at = p_now
  where id = p_file_id
  returning * into v_file;

  insert into public.research_product_request_storage_cleanup (
    file_id, storage_path, status, created_at, updated_at
  ) values (
    v_file.id, v_file.storage_path, 'pending', p_now, p_now
  )
  on conflict (file_id) do nothing;

  insert into public.research_product_request_events (
    request_id, actor_type, actor_ref, event_type, dedupe_key,
    member_visible_message, created_at
  ) values (
    p_request_id, 'member', p_member_id::text, 'attachment_removed',
    'attachment-removed:' || p_file_id::text, v_file.original_filename || ' removed.', p_now
  )
  on conflict (request_id, dedupe_key) do nothing;
  return v_file;
end;
$$;

create or replace function public.research_queue_abandoned_product_request_files(
  p_now timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with abandoned as (
    select id, storage_path
    from public.research_product_request_files
    where state = 'pending'
      and created_at < p_now - interval '24 hours'
    for update skip locked
  ),
  queued as (
    insert into public.research_product_request_storage_cleanup (
      file_id, storage_path, status, created_at, updated_at
    )
    select id, storage_path, 'pending', p_now, p_now
    from abandoned
    on conflict (file_id) do nothing
    returning file_id
  )
  update public.research_product_request_files file
  set state = 'removed', removed_at = p_now, updated_at = p_now
  where file.id in (select id from abandoned);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.research_withdraw_product_request(
  p_request_id uuid,
  p_member_id uuid,
  p_expected_version integer,
  p_now timestamptz
)
returns public.research_product_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous text;
  v_request public.research_product_requests;
begin
  select status into v_previous
  from public.research_product_requests
  where id = p_request_id and member_id = p_member_id and version = p_expected_version
  for update;

  if not found then
    raise exception 'state_conflict';
  end if;
  if v_previous in ('added_to_catalog', 'closed', 'withdrawn') then
    raise exception 'state_conflict';
  end if;

  update public.research_product_requests
  set status = 'withdrawn', withdrawn_at = p_now, updated_at = p_now, version = version + 1
  where id = p_request_id
  returning * into v_request;

  insert into public.research_product_request_events (
    request_id, actor_type, actor_ref, event_type, dedupe_key,
    previous_status, next_status, member_visible_message, created_at
  )
  values (
    v_request.id, 'member', p_member_id::text, 'member_withdrawn',
    'withdrawn:' || v_request.version::text, v_previous, 'withdrawn',
    'Request withdrawn.', p_now
  );
  return v_request;
end;
$$;

create or replace function public.research_add_product_request_message(
  p_request_id uuid,
  p_member_id uuid,
  p_expected_version integer,
  p_message text,
  p_now timestamptz
)
returns public.research_product_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.research_product_requests;
begin
  select * into v_request
  from public.research_product_requests
  where id = p_request_id and member_id = p_member_id and version = p_expected_version
  for update;
  if not found or v_request.status in ('closed', 'withdrawn') then
    raise exception 'state_conflict';
  end if;

  update public.research_product_requests
  set updated_at = p_now, version = version + 1
  where id = p_request_id
  returning * into v_request;

  insert into public.research_product_request_events (
    request_id, actor_type, actor_ref, event_type, dedupe_key,
    member_visible_message, created_at
  ) values (
    v_request.id, 'member', p_member_id::text, 'member_message_added',
    'member-message:' || v_request.version::text, p_message, p_now
  );
  return v_request;
end;
$$;

create or replace function public.research_admin_update_product_request(
  p_request_id uuid,
  p_expected_version integer,
  p_admin_ref text,
  p_status text,
  p_priority text,
  p_assigned_owner text,
  p_member_visible_update text,
  p_internal_note text,
  p_linked_product_ref text,
  p_candidate_id uuid,
  p_now timestamptz
)
returns public.research_product_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.research_product_requests;
  v_request public.research_product_requests;
begin
  select * into v_before
  from public.research_product_requests
  where id = p_request_id and version = p_expected_version
  for update;
  if not found then
    raise exception 'state_conflict';
  end if;

  update public.research_product_requests
  set
    status = coalesce(p_status, status),
    priority = coalesce(p_priority, priority),
    assigned_owner = p_assigned_owner,
    member_visible_update = coalesce(p_member_visible_update, member_visible_update),
    internal_notes = case
      when p_internal_note is null then internal_notes
      when internal_notes is null or internal_notes = '' then p_internal_note
      else internal_notes || E'\n' || p_internal_note
    end,
    linked_product_ref = p_linked_product_ref,
    candidate_id = p_candidate_id,
    updated_at = p_now,
    version = version + 1
  where id = p_request_id
  returning * into v_request;

  if p_status is not null and p_status is distinct from v_before.status then
    insert into public.research_product_request_events (
      request_id, actor_type, actor_ref, event_type, dedupe_key,
      previous_status, next_status, member_visible_message, created_at
    ) values (
      v_request.id, 'admin', p_admin_ref, 'status_changed',
      'status:' || v_request.version::text, v_before.status, v_request.status,
      p_member_visible_update, p_now
    );
  end if;
  if p_priority is not null and p_priority is distinct from v_before.priority then
    insert into public.research_product_request_events (
      request_id, actor_type, actor_ref, event_type, dedupe_key,
      internal_detail, created_at
    ) values (
      v_request.id, 'admin', p_admin_ref, 'priority_changed',
      'priority:' || v_request.version::text,
      jsonb_build_object('previous', v_before.priority, 'next', v_request.priority), p_now
    );
  end if;
  if p_assigned_owner is distinct from v_before.assigned_owner then
    insert into public.research_product_request_events (
      request_id, actor_type, actor_ref, event_type, dedupe_key,
      internal_detail, created_at
    ) values (
      v_request.id, 'admin', p_admin_ref, 'owner_changed',
      'owner:' || v_request.version::text, '{}'::jsonb, p_now
    );
  end if;
  if p_internal_note is not null then
    insert into public.research_product_request_events (
      request_id, actor_type, actor_ref, event_type, dedupe_key,
      internal_detail, created_at
    ) values (
      v_request.id, 'admin', p_admin_ref, 'internal_note_added',
      'note:' || v_request.version::text, jsonb_build_object('note', p_internal_note), p_now
    );
  end if;
  if p_member_visible_update is not null
     and p_member_visible_update is distinct from v_before.member_visible_update and (
    p_status is null or p_status is not distinct from v_before.status
  ) then
    insert into public.research_product_request_events (
      request_id, actor_type, actor_ref, event_type, dedupe_key,
      member_visible_message, created_at
    ) values (
      v_request.id, 'admin', p_admin_ref, 'member_update_added',
      'member-update:' || v_request.version::text, p_member_visible_update, p_now
    );
  end if;
  if p_linked_product_ref is distinct from v_before.linked_product_ref then
    insert into public.research_product_request_events (
      request_id, actor_type, actor_ref, event_type, dedupe_key, created_at
    ) values (
      v_request.id, 'admin', p_admin_ref, 'product_linked',
      'product:' || v_request.version::text, p_now
    );
  end if;
  if p_candidate_id is distinct from v_before.candidate_id then
    insert into public.research_product_request_events (
      request_id, actor_type, actor_ref, event_type, dedupe_key,
      internal_detail, created_at
    ) values (
      v_request.id, 'admin', p_admin_ref, 'candidate_linked',
      'candidate:' || v_request.version::text,
      jsonb_build_object('candidateId', p_candidate_id), p_now
    );
  end if;

  if (p_member_visible_update is not null
      and p_member_visible_update is distinct from v_before.member_visible_update)
     or (p_status is not null and p_status is distinct from v_before.status) then
    insert into public.research_notification_outbox (
      event_key, member_id, event_type, channel, recipient, template_key,
      payload, status, next_attempt_at, created_at, updated_at
    )
    select
      'product-request-updated:' || v_request.id::text || ':' || v_request.version::text,
      v_request.member_id,
      'product_request_member_update',
      'email',
      member.email,
      'member_product_request_updated',
      jsonb_build_object(
        'firstName', member.first_name,
        'reference', v_request.reference,
        'productName', v_request.product_name,
        'status', v_request.status
      ),
      'pending',
      p_now,
      p_now,
      p_now
    from public.research_members member
    where member.id = v_request.member_id
    on conflict (event_key) do nothing;
  end if;

  return v_request;
end;
$$;

revoke all on function public.research_create_product_request(
  uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, boolean, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.research_withdraw_product_request(
  uuid, uuid, integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.research_add_product_request_message(
  uuid, uuid, integer, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.research_confirm_product_request_file(
  uuid, uuid, uuid, timestamptz
) from public, anon, authenticated;
revoke all on function public.research_reserve_product_request_file(
  uuid, uuid, uuid, text, text, text, integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.research_remove_product_request_file(
  uuid, uuid, uuid, timestamptz
) from public, anon, authenticated;
revoke all on function public.research_queue_abandoned_product_request_files(
  timestamptz
) from public, anon, authenticated;
revoke all on function public.research_admin_update_product_request(
  uuid, integer, text, text, text, text, text, text, text, uuid, timestamptz
) from public, anon, authenticated;

grant execute on function public.research_create_product_request(
  uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, boolean, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.research_withdraw_product_request(
  uuid, uuid, integer, timestamptz
) to service_role;
grant execute on function public.research_add_product_request_message(
  uuid, uuid, integer, text, timestamptz
) to service_role;
grant execute on function public.research_confirm_product_request_file(
  uuid, uuid, uuid, timestamptz
) to service_role;
grant execute on function public.research_reserve_product_request_file(
  uuid, uuid, uuid, text, text, text, integer, timestamptz
) to service_role;
grant execute on function public.research_remove_product_request_file(
  uuid, uuid, uuid, timestamptz
) to service_role;
grant execute on function public.research_queue_abandoned_product_request_files(
  timestamptz
) to service_role;
grant execute on function public.research_admin_update_product_request(
  uuid, integer, text, text, text, text, text, text, text, uuid, timestamptz
) to service_role;
