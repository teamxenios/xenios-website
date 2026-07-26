-- Website 3 Wave A: canonical Research Product Control Center.
-- Additive and idempotent. Website 2 owns reviewed production application.

create extension if not exists "pgcrypto";

alter table public.research_products
  add column if not exists canonical_name text,
  add column if not exists category text,
  add column if not exists product_classification text,
  add column if not exists admin_status text not null default 'draft',
  add column if not exists active_state boolean not null default true,
  add column if not exists visibility_state text not null default 'hidden',
  add column if not exists published_at timestamptz,
  add column if not exists published_by text,
  add column if not exists version integer not null default 1,
  add column if not exists created_by text,
  add column if not exists updated_by text;

update public.research_products
set canonical_name = display_name
where canonical_name is null;

alter table public.research_products
  alter column canonical_name set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_products_admin_status_check'
      and conrelid = 'public.research_products'::regclass
  ) then
    alter table public.research_products
      add constraint research_products_admin_status_check
      check (admin_status in ('draft','in_review','approved','published','archived'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_products_visibility_state_check'
      and conrelid = 'public.research_products'::regclass
  ) then
    alter table public.research_products
      add constraint research_products_visibility_state_check
      check (visibility_state in ('hidden','members_only','public'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_products_public_requires_published'
      and conrelid = 'public.research_products'::regclass
  ) then
    alter table public.research_products
      add constraint research_products_public_requires_published
      check (visibility_state <> 'public' or (admin_status = 'published' and active_state));
  end if;
end $$;

create table if not exists public.research_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.research_products(id) on delete cascade,
  sku text not null unique,
  catalog_number text,
  label text not null,
  strength text,
  size text,
  format text,
  presentation text,
  shipping_class text,
  member_eligible boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft','in_review','approved','archived')),
  active boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  version integer not null default 1 check (version > 0),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, id)
);
alter table public.research_product_variants
  alter column active set default false;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_product_variants_active_requires_approval'
      and conrelid = 'public.research_product_variants'::regclass
  ) then
    alter table public.research_product_variants
      add constraint research_product_variants_active_requires_approval
      check (not active or status = 'approved');
  end if;
end $$;

create or replace function public.research_product_variant_lifecycle_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.active and new.status <> 'approved' then
    raise exception 'only approved variants may be active';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.active then
      raise exception 'new variants must be inactive drafts';
    end if;
    return new;
  end if;
  if not (
    new.status = old.status
    or (old.status = 'draft' and new.status in ('in_review','archived'))
    or (old.status = 'in_review' and new.status in ('draft','approved','archived'))
    or (old.status = 'approved' and new.status = 'archived')
    or (old.status = 'archived' and new.status = 'draft')
  ) then
    raise exception 'invalid variant state transition: % -> %',
      old.status, new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists research_product_variants_lifecycle_guard
  on public.research_product_variants;
create trigger research_product_variants_lifecycle_guard
before insert or update on public.research_product_variants
for each row execute function public.research_product_variant_lifecycle_guard();

create index if not exists research_product_variants_product_sort_idx
  on public.research_product_variants(product_id, sort_order, created_at);

create table if not exists public.research_product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.research_products(id) on delete cascade,
  variant_id uuid not null references public.research_product_variants(id) on delete cascade,
  audience text not null
    check (audience in ('retail','member','professional','wholesale','compare_at')),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  effective_at timestamptz not null,
  expires_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','approved','active','expired','superseded')),
  approval_note text,
  version integer not null check (version > 0),
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > effective_at),
  unique (variant_id, audience, version)
);
create index if not exists research_product_prices_variant_history_idx
  on public.research_product_prices(variant_id, audience, version desc);
create unique index if not exists research_product_prices_one_active_idx
  on public.research_product_prices(variant_id, audience)
  where status = 'active';
create or replace function public.research_product_price_history_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'research product price history is append-only';
  end if;
  if new.id is distinct from old.id
     or new.product_id is distinct from old.product_id
     or new.variant_id is distinct from old.variant_id
     or new.audience is distinct from old.audience
     or new.amount_cents is distinct from old.amount_cents
     or new.currency is distinct from old.currency
     or new.effective_at is distinct from old.effective_at
     or new.expires_at is distinct from old.expires_at
     or new.approval_note is distinct from old.approval_note
     or new.version is distinct from old.version
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'research product price economic history is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists research_product_prices_history_immutable
  on public.research_product_prices;
create trigger research_product_prices_history_immutable
before update or delete on public.research_product_prices
for each row execute function public.research_product_price_history_immutable();


create table if not exists public.research_product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.research_products(id) on delete cascade,
  kind text not null check (kind in ('primary_image','gallery_image')),
  state text not null default 'pending_upload'
    check (state in ('pending_upload','uploaded','in_review','approved','rejected','archived')),
  storage_key text not null unique,
  filename text not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  alt_text text not null check (char_length(trim(alt_text)) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  approved_by text,
  approved_at timestamptz,
  rejection_reason text,
  version integer not null default 1 check (version > 0),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists research_product_media_product_order_idx
  on public.research_product_media(product_id, sort_order, created_at);
create unique index if not exists research_product_media_one_primary_idx
  on public.research_product_media(product_id)
  where kind = 'primary_image' and state = 'approved';

create table if not exists public.research_product_admin_audit (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.research_products(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('product','variant','price','media','content')),
  entity_id uuid,
  action text not null,
  actor text not null,
  detail text,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists research_product_admin_audit_product_time_idx
  on public.research_product_admin_audit(product_id, occurred_at desc);

alter table public.research_product_content
  add column if not exists metadata jsonb not null default '[]'::jsonb;

alter table public.research_product_content
  drop constraint if exists research_product_content_section_check;
alter table public.research_product_content
  add constraint research_product_content_section_check check (section in (
    'overview',
    'specifications',
    'certificate_of_analysis',
    'research_information',
    'storage_and_handling',
    'shipping_and_returns',
    'documentation',
    'related_products',
    'request_an_alternative',
    'shortDescription',
    'longDescription',
    'storageInformation',
    'handlingInformation',
    'shippingInformation',
    'returnInformation',
    'disclaimers',
    'citations',
    'reviewDate'
  )) not valid;
alter table public.research_product_content
  validate constraint research_product_content_section_check;

create or replace function public.research_product_admin_audit_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'research product admin audit is append-only';
end;
$$;

drop trigger if exists research_product_admin_audit_no_mutation
  on public.research_product_admin_audit;
create trigger research_product_admin_audit_no_mutation
  before update or delete on public.research_product_admin_audit
  for each row execute function public.research_product_admin_audit_append_only();

create or replace function public.research_admin_create_product(
  p_input jsonb,
  p_actor text,
  p_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  if nullif(trim(p_actor), '') is null then
    raise exception 'actor required';
  end if;
  insert into public.research_products (
    id, sku, slug, display_name, canonical_name, name_aliases, lane,
    category, product_classification, lane_decision, availability,
    commerce_approval, fulfillment_owner, guide_state,
    quality_document_state, storage_data_state, shipping_profile_state,
    subscription_eligible, admin_status, active_state, visibility_state,
    created_by, updated_by, created_at, updated_at
  ) values (
    v_id,
    upper(p_input->>'productCode'),
    lower(p_input->>'slug'),
    p_input->>'displayName',
    p_input->>'canonicalName',
    coalesce(array(select jsonb_array_elements_text(p_input->'aliases')), '{}'),
    p_input->>'lane',
    p_input->>'category',
    p_input->>'classification',
    case when p_input->>'lane' = 'non_product_program'
      then 'needs_samuel_decision' else 'decided' end,
    'documentation_review',
    'blocked_pending_written_approval',
    'not_assigned',
    'guide_in_development',
    'missing',
    'missing',
    'missing',
    false,
    'draft',
    true,
    'hidden',
    p_actor,
    p_actor,
    p_at,
    p_at
  );
  insert into public.research_product_admin_audit (
    product_id, entity_type, entity_id, action, actor, after_state, occurred_at
  ) values (
    v_id, 'product', v_id, 'created', p_actor,
    jsonb_build_object('status','draft','visibility','hidden'), p_at
  );
  return v_id;
end;
$$;

create or replace function public.research_admin_update_product(
  p_product_id uuid,
  p_input jsonb,
  p_actor text,
  p_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_before jsonb;
  v_key text;
begin
  select to_jsonb(p) into v_before
  from public.research_products p where id = p_product_id for update;
  if v_before is null then raise exception 'product not found'; end if;

  update public.research_products set
    display_name = case when p_input ? 'displayName' then p_input->>'displayName' else display_name end,
    canonical_name = case when p_input ? 'canonicalName' then p_input->>'canonicalName' else canonical_name end,
    name_aliases = case when p_input ? 'aliases'
      then coalesce(array(select jsonb_array_elements_text(p_input->'aliases')), '{}')
      else name_aliases end,
    lane = case when p_input ? 'lane' then p_input->>'lane' else lane end,
    category = case when p_input ? 'category' then p_input->>'category' else category end,
    product_classification = case when p_input ? 'classification'
      then p_input->>'classification' else product_classification end,
    active_state = case when p_input ? 'active'
      then (p_input->>'active')::boolean else active_state end,
    visibility_state = case when p_input ? 'visibility'
      then p_input->>'visibility' else visibility_state end,
    availability = case when p_input ? 'availability'
      then p_input->>'availability' else availability end,
    commerce_approval = case when p_input ? 'commerceApproval'
      then p_input->>'commerceApproval' else commerce_approval end,
    quality_document_state = case when p_input ? 'qualityDocumentState'
      then p_input->>'qualityDocumentState' else quality_document_state end,
    updated_by = p_actor,
    updated_at = p_at,
    version = version + 1
  where id = p_product_id;

  if p_input ? 'content' then
    for v_key in select jsonb_object_keys(p_input->'content')
    loop
      insert into public.research_product_content (
        product_id, section, state, body, metadata, updated_by, created_at, updated_at
      ) values (
        p_product_id,
        v_key,
        'draft',
        case when v_key = 'citations' then null else p_input->'content'->>v_key end,
        case when v_key = 'citations'
          then coalesce(p_input->'content'->v_key, '[]'::jsonb)
          else '[]'::jsonb end,
        p_actor,
        p_at,
        p_at
      )
      on conflict (product_id, section) do update set
        body = excluded.body,
        metadata = excluded.metadata,
        state = 'draft',
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
    end loop;
  end if;

  insert into public.research_product_admin_audit (
    product_id, entity_type, entity_id, action, actor,
    before_state, after_state, occurred_at
  )
  select p_product_id, 'product', p_product_id, 'updated', p_actor,
    v_before, to_jsonb(p), p_at
  from public.research_products p where id = p_product_id;
  return p_product_id;
end;
$$;

create or replace function public.research_admin_duplicate_product(
  p_product_id uuid,
  p_product_code text,
  p_slug text,
  p_display_name text,
  p_actor text,
  p_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_source public.research_products%rowtype;
  v_id uuid := gen_random_uuid();
begin
  select * into v_source from public.research_products
  where id = p_product_id;
  if not found then raise exception 'product not found'; end if;
  insert into public.research_products (
    id, sku, slug, display_name, canonical_name, name_aliases, lane,
    category, product_classification, lane_decision, availability,
    commerce_approval, fulfillment_owner, guide_state,
    quality_document_state, storage_data_state, shipping_profile_state,
    subscription_eligible, admin_status, active_state, visibility_state,
    created_by, updated_by, created_at, updated_at
  ) values (
    v_id, upper(p_product_code), lower(p_slug), p_display_name,
    v_source.canonical_name, v_source.name_aliases, v_source.lane,
    v_source.category, v_source.product_classification,
    v_source.lane_decision, 'documentation_review',
    'blocked_pending_written_approval', 'not_assigned',
    'guide_in_development', 'missing', 'missing', 'missing',
    false, 'draft', true, 'hidden', p_actor, p_actor, p_at, p_at
  );
  insert into public.research_product_content (
    product_id, section, state, heading, body, metadata, updated_by,
    created_at, updated_at
  )
  select v_id, section, 'draft', heading, body, metadata, p_actor, p_at, p_at
  from public.research_product_content where product_id = p_product_id;
  insert into public.research_product_admin_audit (
    product_id, entity_type, entity_id, action, actor, detail, occurred_at
  ) values (
    v_id, 'product', v_id, 'duplicated_as_draft', p_actor,
    'Source product ' || p_product_id::text || '; variants, prices, and media were not copied.',
    p_at
  );
  return v_id;
end;
$$;

create or replace function public.research_admin_transition_product(
  p_product_id uuid,
  p_status text,
  p_active boolean,
  p_visibility text,
  p_actor text,
  p_at timestamptz,
  p_detail text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_before jsonb;
begin
  select to_jsonb(p) into v_before
  from public.research_products p where id = p_product_id for update;
  if v_before is null then raise exception 'product not found'; end if;
  update public.research_products set
    admin_status = p_status,
    active_state = p_active,
    visibility_state = p_visibility,
    published_at = case when p_status = 'published' then p_at else published_at end,
    published_by = case when p_status = 'published' then p_actor else published_by end,
    updated_by = p_actor,
    updated_at = p_at,
    version = version + 1
  where id = p_product_id;
  insert into public.research_product_admin_audit (
    product_id, entity_type, entity_id, action, actor, detail,
    before_state, after_state, occurred_at
  )
  select p_product_id, 'product', p_product_id, p_status, p_actor, p_detail,
    v_before, to_jsonb(p), p_at
  from public.research_products p where id = p_product_id;
  return p_product_id;
end;
$$;

create or replace function public.research_admin_create_product_variant(
  p_product_id uuid,
  p_input jsonb,
  p_actor text,
  p_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_id uuid := gen_random_uuid();
begin
  perform 1 from public.research_products where id = p_product_id;
  if not found then raise exception 'product not found'; end if;
  insert into public.research_product_variants (
    id, product_id, sku, catalog_number, label, strength, size, format,
    presentation, shipping_class, member_eligible, sort_order,
    created_by, updated_by, created_at, updated_at
  ) values (
    v_id, p_product_id, upper(p_input->>'sku'), nullif(p_input->>'catalogNumber',''),
    p_input->>'label', nullif(p_input->>'strength',''), nullif(p_input->>'size',''),
    nullif(p_input->>'format',''), nullif(p_input->>'presentation',''),
    nullif(p_input->>'shippingClass',''),
    coalesce((p_input->>'memberEligible')::boolean, false),
    coalesce((p_input->>'sortOrder')::integer, 0),
    p_actor, p_actor, p_at, p_at
  );
  insert into public.research_product_admin_audit (
    product_id, entity_type, entity_id, action, actor, occurred_at
  ) values (p_product_id, 'variant', v_id, 'variant_created', p_actor, p_at);
  return p_product_id;
end;
$$;

create or replace function public.research_admin_update_product_variant(
  p_product_id uuid,
  p_variant_id uuid,
  p_input jsonb,
  p_actor text,
  p_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_before jsonb;
  v_before_status text;
  v_before_active boolean;
  v_target_status text;
  v_target_active boolean;
begin
  select to_jsonb(v), v.status, v.active
  into v_before, v_before_status, v_before_active
  from public.research_product_variants v
  where id = p_variant_id and product_id = p_product_id
  for update;
  if v_before is null then raise exception 'variant not found'; end if;

  v_target_status := case
    when p_input ? 'status' then p_input->>'status'
    else v_before_status
  end;
  v_target_active := case
    when p_input ? 'active' then (p_input->>'active')::boolean
    else v_before_active
  end;
  if v_target_active and v_target_status <> 'approved' then
    raise exception 'only approved variants may be active';
  end if;
  if not (
    v_target_status = v_before_status
    or (v_before_status = 'draft' and v_target_status in ('in_review','archived'))
    or (v_before_status = 'in_review' and v_target_status in ('draft','approved','archived'))
    or (v_before_status = 'approved' and v_target_status = 'archived')
    or (v_before_status = 'archived' and v_target_status = 'draft')
  ) then
    raise exception 'invalid variant state transition: % -> %',
      v_before_status, v_target_status;
  end if;

  update public.research_product_variants set
    sku = case when p_input ? 'sku' then upper(p_input->>'sku') else sku end,
    catalog_number = case when p_input ? 'catalogNumber' then nullif(p_input->>'catalogNumber','') else catalog_number end,
    label = case when p_input ? 'label' then p_input->>'label' else label end,
    strength = case when p_input ? 'strength' then nullif(p_input->>'strength','') else strength end,
    size = case when p_input ? 'size' then nullif(p_input->>'size','') else size end,
    format = case when p_input ? 'format' then nullif(p_input->>'format','') else format end,
    presentation = case when p_input ? 'presentation' then nullif(p_input->>'presentation','') else presentation end,
    shipping_class = case when p_input ? 'shippingClass' then nullif(p_input->>'shippingClass','') else shipping_class end,
    member_eligible = case when p_input ? 'memberEligible' then (p_input->>'memberEligible')::boolean else member_eligible end,
    sort_order = case when p_input ? 'sortOrder' then (p_input->>'sortOrder')::integer else sort_order end,
    status = v_target_status,
    active = v_target_active,
    version = version + 1,
    updated_by = p_actor,
    updated_at = p_at
  where id = p_variant_id and product_id = p_product_id;
  insert into public.research_product_admin_audit (
    product_id, entity_type, entity_id, action, actor, before_state, after_state, occurred_at
  )
  select p_product_id, 'variant', p_variant_id, 'variant_updated', p_actor,
    v_before, to_jsonb(v), p_at
  from public.research_product_variants v where id = p_variant_id;
  return p_product_id;
end;
$$;
create or replace function public.research_admin_create_product_price(
  p_product_id uuid,
  p_input jsonb,
  p_actor text,
  p_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_id uuid := gen_random_uuid();
  v_variant uuid := (p_input->>'variantId')::uuid;
  v_audience text := p_input->>'audience';
  v_version integer;
begin
  perform 1 from public.research_product_variants
  where id = v_variant and product_id = p_product_id
    and status = 'approved' and active;
  if not found then raise exception 'approved active variant not found'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_variant::text || ':' || v_audience, 0)
  );
  select coalesce(max(version), 0) + 1 into v_version
  from public.research_product_prices
  where variant_id = v_variant and audience = v_audience;
  insert into public.research_product_prices (
    id, product_id, variant_id, audience, amount_cents, currency,
    effective_at, expires_at, status, approval_note, version,
    created_by, created_at, updated_at
  ) values (
    v_id, p_product_id, v_variant, v_audience,
    (p_input->>'amountCents')::bigint, p_input->>'currency',
    (p_input->>'effectiveAt')::timestamptz,
    nullif(p_input->>'expiresAt','')::timestamptz,
    'draft', nullif(p_input->>'approvalNote',''), v_version,
    p_actor, p_at, p_at
  );
  insert into public.research_product_admin_audit (
    product_id, entity_type, entity_id, action, actor, occurred_at
  ) values (p_product_id, 'price', v_id, 'price_created', p_actor, p_at);
  return p_product_id;
end;
$$;

create or replace function public.research_admin_approve_product_price(
  p_product_id uuid,
  p_price_id uuid,
  p_actor text,
  p_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_price public.research_product_prices%rowtype;
begin
  select * into v_price from public.research_product_prices
  where id = p_price_id and product_id = p_product_id and status = 'draft'
  for update;
  if not found then raise exception 'draft price not found'; end if;
  perform 1 from public.research_product_variants
  where id = v_price.variant_id and product_id = p_product_id
    and status = 'approved' and active;
  if not found then raise exception 'approved active variant not found'; end if;
  if v_price.effective_at <= p_at then
    update public.research_product_prices
    set status = 'superseded', updated_at = p_at
    where variant_id = v_price.variant_id
      and audience = v_price.audience
      and status = 'active';
  end if;
  update public.research_product_prices
  set status = case when effective_at <= p_at then 'active' else 'approved' end,
      approved_by = p_actor,
      approved_at = p_at,
      updated_at = p_at
  where id = p_price_id;
  insert into public.research_product_admin_audit (
    product_id, entity_type, entity_id, action, actor, occurred_at
  ) values (p_product_id, 'price', p_price_id, 'price_approved', p_actor, p_at);
  return p_product_id;
end;
$$;

create or replace function public.research_admin_prepare_product_media(
  p_product_id uuid,
  p_input jsonb,
  p_actor text,
  p_at timestamptz
)
returns public.research_product_media
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_id uuid := gen_random_uuid();
  v_row public.research_product_media%rowtype;
  v_filename text;
begin
  perform 1 from public.research_products where id = p_product_id;
  if not found then raise exception 'product not found'; end if;
  v_filename := regexp_replace(p_input->>'filename', '[^A-Za-z0-9._-]', '_', 'g');
  insert into public.research_product_media (
    id, product_id, kind, storage_key, filename, content_type, size_bytes,
    alt_text, sort_order, created_by, updated_by, created_at, updated_at
  ) values (
    v_id, p_product_id, p_input->>'kind',
    p_product_id::text || '/' || v_id::text || '/' || v_filename,
    v_filename, p_input->>'contentType', (p_input->>'sizeBytes')::bigint,
    p_input->>'altText', coalesce((p_input->>'sortOrder')::integer, 0),
    p_actor, p_actor, p_at, p_at
  ) returning * into v_row;
  insert into public.research_product_admin_audit (
    product_id, entity_type, entity_id, action, actor, occurred_at
  ) values (p_product_id, 'media', v_id, 'media_upload_prepared', p_actor, p_at);
  return v_row;
end;
$$;

create or replace function public.research_admin_confirm_product_media(
  p_product_id uuid,
  p_media_id uuid,
  p_actor text,
  p_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.research_product_media
  set state = 'uploaded', updated_by = p_actor, updated_at = p_at, version = version + 1
  where id = p_media_id and product_id = p_product_id and state = 'pending_upload';
  if not found then raise exception 'pending media not found'; end if;
  insert into public.research_product_admin_audit (
    product_id, entity_type, entity_id, action, actor, occurred_at
  ) values (p_product_id, 'media', p_media_id, 'media_upload_confirmed', p_actor, p_at);
  return p_product_id;
end;
$$;

create or replace function public.research_admin_update_product_media(
  p_product_id uuid,
  p_media_id uuid,
  p_state text,
  p_alt_text text,
  p_sort_order integer,
  p_reason text,
  p_actor text,
  p_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_before_state text;
begin
  select state into v_before_state
  from public.research_product_media
  where id = p_media_id and product_id = p_product_id
  for update;
  if not found then raise exception 'media not found'; end if;

  if not (
    (v_before_state = 'pending_upload' and p_state = 'archived')
    or (v_before_state = 'uploaded' and p_state in ('in_review','archived'))
    or (v_before_state = 'in_review' and p_state in ('in_review','approved','rejected','archived'))
    or (v_before_state = 'rejected' and p_state in ('rejected','in_review','archived'))
    or (v_before_state = 'approved' and p_state in ('approved','archived'))
    or (v_before_state = 'archived' and p_state = 'archived')
  ) then
    raise exception 'invalid media state transition: % -> %',
      v_before_state, p_state;
  end if;
  update public.research_product_media set
    state = p_state,
    alt_text = p_alt_text,
    sort_order = p_sort_order,
    approved_by = case
      when p_state = 'approved' and v_before_state <> 'approved' then p_actor
      else approved_by
    end,
    approved_at = case
      when p_state = 'approved' and v_before_state <> 'approved' then p_at
      else approved_at
    end,
    rejection_reason = case when p_state = 'rejected' then p_reason else null end,
    updated_by = p_actor,
    updated_at = p_at,
    version = version + 1
  where id = p_media_id and product_id = p_product_id;
  if not found then raise exception 'media not found'; end if;
  insert into public.research_product_admin_audit (
    product_id, entity_type, entity_id, action, actor, detail, occurred_at
  ) values (
    p_product_id, 'media', p_media_id, 'media_' || p_state, p_actor,
    nullif(p_reason,''), p_at
  );
  return p_product_id;
end;
$$;

-- Legacy and new product tables are server-only. No browser table grant is
-- needed because member/admin reads go through server-authorized routes.
do $$
declare t text;
begin
  foreach t in array array[
    'research_products',
    'research_product_facts',
    'research_product_goals',
    'research_product_guide_links',
    'research_product_prohibited_claims',
    'research_product_open_questions',
    'research_supplement_candidates',
    'research_product_content',
    'research_product_variants',
    'research_product_prices',
    'research_product_media',
    'research_product_admin_audit'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

-- The five command-managed Product Control tables are readable by the server
-- role, but every mutation must pass through the reviewed SECURITY DEFINER
-- command functions below. The seven legacy support tables retain their
-- existing server-role DML grants for compatibility with current repositories.
revoke insert, update, delete on table
  public.research_products,
  public.research_product_variants,
  public.research_product_prices,
  public.research_product_media,
  public.research_product_admin_audit
from service_role;

revoke all on function public.research_product_admin_audit_append_only()
  from public, anon, authenticated;
revoke all on function public.research_product_price_history_immutable()
  from public, anon, authenticated;
revoke all on function public.research_product_variant_lifecycle_guard()
  from public, anon, authenticated;
revoke all on function public.research_admin_create_product(jsonb,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.research_admin_update_product(uuid,jsonb,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.research_admin_duplicate_product(uuid,text,text,text,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.research_admin_transition_product(uuid,text,boolean,text,text,timestamptz,text)
  from public, anon, authenticated;
revoke all on function public.research_admin_create_product_variant(uuid,jsonb,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.research_admin_update_product_variant(uuid,uuid,jsonb,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.research_admin_create_product_price(uuid,jsonb,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.research_admin_approve_product_price(uuid,uuid,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.research_admin_prepare_product_media(uuid,jsonb,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.research_admin_confirm_product_media(uuid,uuid,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.research_admin_update_product_media(uuid,uuid,text,text,integer,text,text,timestamptz)
  from public, anon, authenticated;

grant execute on function public.research_admin_create_product(jsonb,text,timestamptz)
  to service_role;
grant execute on function public.research_admin_update_product(uuid,jsonb,text,timestamptz)
  to service_role;
grant execute on function public.research_admin_duplicate_product(uuid,text,text,text,text,timestamptz)
  to service_role;
grant execute on function public.research_admin_transition_product(uuid,text,boolean,text,text,timestamptz,text)
  to service_role;
grant execute on function public.research_admin_create_product_variant(uuid,jsonb,text,timestamptz)
  to service_role;
grant execute on function public.research_admin_update_product_variant(uuid,uuid,jsonb,text,timestamptz)
  to service_role;
grant execute on function public.research_admin_create_product_price(uuid,jsonb,text,timestamptz)
  to service_role;
grant execute on function public.research_admin_approve_product_price(uuid,uuid,text,timestamptz)
  to service_role;
grant execute on function public.research_admin_prepare_product_media(uuid,jsonb,text,timestamptz)
  to service_role;
grant execute on function public.research_admin_confirm_product_media(uuid,uuid,text,timestamptz)
  to service_role;
grant execute on function public.research_admin_update_product_media(uuid,uuid,text,text,integer,text,text,timestamptz)
  to service_role;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'research-product-media-production',
  'research-product-media-production',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
