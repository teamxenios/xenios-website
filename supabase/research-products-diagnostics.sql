-- Website 3 production persistence: products, diagnostics, and truthful
-- pending pathways. Apply only after research-catalog.sql and
-- research-inventory-lots.sql. Additive and idempotent.
--
-- Canonical reuse:
--   research_products
--   research_inventory_lots
--   research_lot_quality_documents
--
-- No parallel product or lot table is created.

create extension if not exists pgcrypto;

alter table public.research_lot_quality_documents
  add column if not exists document_state text not null default 'pending'
    check (document_state in ('pending', 'available', 'withdrawn'));
alter table public.research_lot_quality_documents
  add column if not exists verification_state text not null default 'pending'
    check (verification_state in ('pending', 'document_on_file', 'withdrawn'));
alter table public.research_lot_quality_documents
  add column if not exists private_storage_key text;
alter table public.research_lot_quality_documents
  add column if not exists reviewed_at timestamptz;

create table if not exists public.research_certificate_access_audit (
  id uuid primary key,
  member_id uuid not null references public.research_members(id),
  certificate_id uuid not null references public.research_lot_quality_documents(id),
  lot_id uuid not null references public.research_inventory_lots(id),
  outcome text not null check (outcome in ('attempted', 'granted', 'denied')),
  reason text not null check (char_length(reason) between 1 and 120),
  accessed_at timestamptz not null
);
create index if not exists research_certificate_access_member_time_idx
  on public.research_certificate_access_audit (member_id, accessed_at desc);
create index if not exists research_certificate_access_lot_time_idx
  on public.research_certificate_access_audit (lot_id, accessed_at desc);

create table if not exists public.research_metabolic_pathways (
  pathway_id text primary key check (pathway_id in (
    'glp_1_pathway',
    'glp_2_pathway',
    'next_generation_multi_agonist'
  )),
  public_name text not null check (char_length(public_name) between 1 and 160),
  internal_search_aliases text[] not null default '{}',
  public_status text not null check (char_length(public_status) between 1 and 160),
  public_copy text not null check (char_length(public_copy) between 1 and 2000),
  actions jsonb not null check (jsonb_typeof(actions) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.research_metabolic_pathways (
  pathway_id,
  public_name,
  internal_search_aliases,
  public_status,
  public_copy,
  actions
)
values
  (
    'glp_1_pathway',
    'GLP-1 Pathway',
    '{}',
    'Pending clinician launch',
    'Clinician-guided metabolic evaluation and treatment options are being prepared through the separate Xenios Care pathway.',
    '{"joinInterestHref":"/research/member/metabolic-interest?pathway=glp_1_pathway","exploreCareHref":"/care","askQuestionHref":"/research/member/questions?topic=metabolic-care"}'
  ),
  (
    'glp_2_pathway',
    'GLP-2 Pathway',
    '{}',
    'Pending clinician definition',
    'This pathway remains under clinical and product-definition review. Details will publish only after the medical team confirms the intended service, eligibility, product, and follow-up model.',
    '{"joinInterestHref":"/research/member/metabolic-interest?pathway=glp_2_pathway","exploreCareHref":"/care","askQuestionHref":"/research/member/questions?topic=metabolic-care"}'
  ),
  (
    'next_generation_multi_agonist',
    'Next-Generation Multi-Agonist Pathway',
    array['GLP-3 placeholder'],
    'Pending clinician and regulatory review',
    'Next-generation multi-receptor metabolic pathways are being evaluated. Availability, eligibility, product selection, and timing will depend on clinician review and the status of the underlying therapy.',
    '{"joinInterestHref":"/research/member/metabolic-interest?pathway=next_generation_multi_agonist","exploreCareHref":"/care","askQuestionHref":"/research/member/questions?topic=metabolic-care"}'
  )
on conflict (pathway_id) do nothing;

create table if not exists public.research_metabolic_interests (
  id uuid primary key,
  member_id uuid not null references public.research_members(id),
  pathway_id text not null references public.research_metabolic_pathways(pathway_id),
  current_state text not null check (current_state in (
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
    'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
  )),
  general_goal_category text not null check (general_goal_category in (
    'general_metabolic_health',
    'weight_management_interest',
    'care_pathway_updates',
    'other_general_goal'
  )),
  preferred_contact text not null check (preferred_contact in ('email', 'phone', 'text')),
  interest_date date not null check (interest_date <= current_date),
  attribution_source text not null check (char_length(attribution_source) between 1 and 120),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (member_id, idempotency_key)
);
create index if not exists research_metabolic_interests_pathway_time_idx
  on public.research_metabolic_interests (pathway_id, created_at desc);

create table if not exists public.research_supplement_placeholders (
  placeholder_id text primary key,
  category text not null unique check (category in (
    'foundational',
    'performance',
    'longevity',
    'specialty'
  )),
  label text not null check (char_length(label) between 1 and 160),
  status text not null default 'coming_soon' check (status = 'coming_soon'),
  description text not null check (char_length(description) between 1 and 2000),
  channel_metadata jsonb not null check (
    jsonb_typeof(channel_metadata) = 'object'
    and channel_metadata ?& array[
      'affiliate',
      'wholesale',
      'professional_dispensary',
      'partner_fulfilled',
      'private_label'
    ]
  ),
  launch_interest_href text not null check (
    launch_interest_href like '/research/%'
  ),
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.research_supplement_placeholders (
  placeholder_id,
  category,
  label,
  description,
  channel_metadata,
  launch_interest_href
)
values
  (
    'supplement_placeholder_foundational',
    'foundational',
    'Foundational supplements',
    'Foundational supplement candidates are being reviewed for formula clarity, sourcing, documentation, and channel approval.',
    '{"affiliate":{"configured":false,"partnerReference":null,"publicUrl":null},"wholesale":{"configured":false,"partnerReference":null,"publicUrl":null},"professional_dispensary":{"configured":false,"partnerReference":null,"publicUrl":null},"partner_fulfilled":{"configured":false,"partnerReference":null,"publicUrl":null},"private_label":{"configured":false,"partnerReference":null,"publicUrl":null}}',
    '/research/member/product-requests/new?source=supplements'
  ),
  (
    'supplement_placeholder_performance',
    'performance',
    'Performance supplements',
    'Performance supplement candidates will publish only after product, quality, claims, and commercial review.',
    '{"affiliate":{"configured":false,"partnerReference":null,"publicUrl":null},"wholesale":{"configured":false,"partnerReference":null,"publicUrl":null},"professional_dispensary":{"configured":false,"partnerReference":null,"publicUrl":null},"partner_fulfilled":{"configured":false,"partnerReference":null,"publicUrl":null},"private_label":{"configured":false,"partnerReference":null,"publicUrl":null}}',
    '/research/member/product-requests/new?source=supplements'
  ),
  (
    'supplement_placeholder_longevity',
    'longevity',
    'Longevity supplements',
    'Longevity supplement candidates remain in content and product review; no benefit claim or serving guidance is published.',
    '{"affiliate":{"configured":false,"partnerReference":null,"publicUrl":null},"wholesale":{"configured":false,"partnerReference":null,"publicUrl":null},"professional_dispensary":{"configured":false,"partnerReference":null,"publicUrl":null},"partner_fulfilled":{"configured":false,"partnerReference":null,"publicUrl":null},"private_label":{"configured":false,"partnerReference":null,"publicUrl":null}}',
    '/research/member/product-requests/new?source=supplements'
  ),
  (
    'supplement_placeholder_specialty',
    'specialty',
    'Specialty supplements',
    'Specialty supplement candidates require category-specific documentation and professional-channel review before launch.',
    '{"affiliate":{"configured":false,"partnerReference":null,"publicUrl":null},"wholesale":{"configured":false,"partnerReference":null,"publicUrl":null},"professional_dispensary":{"configured":false,"partnerReference":null,"publicUrl":null},"partner_fulfilled":{"configured":false,"partnerReference":null,"publicUrl":null},"private_label":{"configured":false,"partnerReference":null,"publicUrl":null}}',
    '/research/member/product-requests/new?source=supplements'
  )
on conflict (category) do nothing;

create table if not exists public.research_superpower_offers (
  offer_id text primary key,
  label text not null,
  summary text not null,
  status text not null check (status in ('coming_soon', 'available', 'paused', 'unavailable')),
  availability text not null,
  collection_method text,
  price_cents integer check (price_cents is null or price_cents >= 0),
  price_effective_date date,
  last_verification_date date,
  last_reviewed_date date,
  verified_price_date date,
  disclosure text not null,
  interest_enabled boolean not null default false,
  interest_href text,
  affiliate_enabled boolean not null default false,
  affiliate_url text,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint research_superpower_interest_href_check check (
    interest_enabled = false
    or (
      interest_href is not null
      and interest_href like '/research/%'
    )
  ),
  check (
    affiliate_enabled = false
    or (
      status = 'available'
      and affiliate_url is not null
      and affiliate_url ~ '^https://'
    )
  )
);

alter table public.research_superpower_offers
  add column if not exists last_reviewed_date date;
alter table public.research_superpower_offers
  add column if not exists verified_price_date date;
alter table public.research_superpower_offers
  add column if not exists interest_enabled boolean not null default false;
alter table public.research_superpower_offers
  add column if not exists interest_href text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'research_superpower_interest_href_check'
      and conrelid = 'public.research_superpower_offers'::regclass
  ) then
    alter table public.research_superpower_offers
      add constraint research_superpower_interest_href_check check (
        interest_enabled = false
        or (
          interest_href is not null
          and interest_href like '/research/%'
        )
      );
  end if;
end;
$$;

insert into public.research_superpower_offers (
  offer_id,
  label,
  summary,
  status,
  availability,
  disclosure,
  interest_enabled,
  interest_href,
  affiliate_enabled
)
values (
  'superpower_diagnostics',
  'Superpower Diagnostics',
  'A member diagnostics experience is being prepared with transparent offer, collection, availability, and verification details.',
  'coming_soon',
  'Not currently enabled',
  'If an affiliate relationship is enabled later, Xenios may receive compensation. No affiliate link is active today.',
  true,
  '/research/member/product-requests/new?source=diagnostics',
  false
)
on conflict (offer_id) do nothing;

create table if not exists public.research_biomarker_records (
  id uuid primary key,
  member_id uuid not null unique references public.research_members(id),
  state text not null default 'not_started' check (state in (
    'not_started',
    'coming_soon',
    'test_ordered',
    'collection_scheduled',
    'results_pending',
    'results_available_through_partner',
    'report_uploaded',
    'review_requested',
    'qualified_review_complete',
    'follow_up_due',
    'closed'
  )),
  partner_reference text,
  report_storage_key text,
  report_filename text,
  consent_version text,
  consented_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    state <> 'report_uploaded'
    or (
      report_storage_key is not null
      and report_filename is not null
      and consent_version is not null
      and consented_at is not null
    )
  )
);

create table if not exists public.research_biomarker_uploads (
  upload_id uuid primary key,
  member_id uuid not null references public.research_members(id),
  state text not null default 'pending' check (state = 'pending'),
  storage_key text not null unique,
  filename text not null check (char_length(filename) between 1 and 180),
  content_type text not null check (content_type in (
    'application/pdf',
    'image/jpeg',
    'image/png'
  )),
  expected_size_bytes integer not null check (
    expected_size_bytes > 0
    and expected_size_bytes <= 15728640
  ),
  consent_version text not null check (char_length(consent_version) between 1 and 120),
  consented_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists research_biomarker_upload_member_expiry_idx
  on public.research_biomarker_uploads (member_id, expires_at);

create table if not exists public.research_product_content (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.research_products(id) on delete cascade,
  section text not null check (section in (
    'overview',
    'specifications',
    'certificate_of_analysis',
    'research_information',
    'storage_and_handling',
    'shipping_and_returns',
    'documentation',
    'related_products',
    'request_an_alternative'
  )),
  state text not null default 'draft' check (state in ('draft', 'in_review', 'published', 'withdrawn')),
  heading text,
  body text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, section)
);

create or replace function public.research_certificate_audit_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'research certificate access audit is append-only';
end;
$$;

revoke all on function public.research_certificate_audit_append_only()
  from public, anon, authenticated;

drop trigger if exists research_certificate_audit_no_update
  on public.research_certificate_access_audit;
create trigger research_certificate_audit_no_update
  before update or delete on public.research_certificate_access_audit
  for each row execute function public.research_certificate_audit_append_only();

create or replace function public.research_confirm_biomarker_upload(
  p_upload_id uuid,
  p_member_id uuid,
  p_record_id uuid,
  p_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  pending public.research_biomarker_uploads%rowtype;
  current_state text;
begin
  select *
    into pending
    from public.research_biomarker_uploads
   where upload_id = p_upload_id
     and member_id = p_member_id
     and state = 'pending'
     and expires_at > p_updated_at
   for update;

  if not found then
    return false;
  end if;

  select state
    into current_state
    from public.research_biomarker_records
   where member_id = p_member_id
   for update;

  if found and current_state not in (
    'not_started',
    'results_pending',
    'results_available_through_partner'
  ) then
    return false;
  end if;

  insert into public.research_biomarker_records (
    id,
    member_id,
    state,
    report_storage_key,
    report_filename,
    consent_version,
    consented_at,
    updated_at
  )
  values (
    p_record_id,
    p_member_id,
    'report_uploaded',
    pending.storage_key,
    pending.filename,
    pending.consent_version,
    pending.consented_at,
    p_updated_at
  )
  on conflict (member_id) do update set
    state = excluded.state,
    report_storage_key = excluded.report_storage_key,
    report_filename = excluded.report_filename,
    consent_version = excluded.consent_version,
    consented_at = excluded.consented_at,
    updated_at = excluded.updated_at;

  delete from public.research_biomarker_uploads
   where upload_id = p_upload_id
     and member_id = p_member_id;

  return true;
end;
$$;

revoke all on function public.research_confirm_biomarker_upload(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.research_confirm_biomarker_upload(uuid, uuid, uuid, timestamptz)
  to service_role;

alter table public.research_certificate_access_audit enable row level security;
alter table public.research_metabolic_pathways enable row level security;
alter table public.research_metabolic_interests enable row level security;
alter table public.research_supplement_placeholders enable row level security;
alter table public.research_superpower_offers enable row level security;
alter table public.research_biomarker_records enable row level security;
alter table public.research_biomarker_uploads enable row level security;
alter table public.research_product_content enable row level security;
alter table public.research_certificate_access_audit force row level security;
alter table public.research_metabolic_pathways force row level security;
alter table public.research_metabolic_interests force row level security;
alter table public.research_supplement_placeholders force row level security;
alter table public.research_superpower_offers force row level security;
alter table public.research_biomarker_records force row level security;
alter table public.research_biomarker_uploads force row level security;
alter table public.research_product_content force row level security;

revoke all on table public.research_certificate_access_audit
  from public, anon, authenticated;
revoke all on table public.research_metabolic_pathways
  from public, anon, authenticated;
revoke all on table public.research_metabolic_interests
  from public, anon, authenticated;
revoke all on table public.research_supplement_placeholders
  from public, anon, authenticated;
revoke all on table public.research_superpower_offers
  from public, anon, authenticated;
revoke all on table public.research_biomarker_records
  from public, anon, authenticated;
revoke all on table public.research_biomarker_uploads
  from public, anon, authenticated;
revoke all on table public.research_product_content
  from public, anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'research-coa-production',
    'research-coa-production',
    false,
    20971520,
    array['application/pdf']
  ),
  (
    'research-biomarker-reports-production',
    'research-biomarker-reports-production',
    false,
    15728640,
    array['application/pdf', 'image/jpeg', 'image/png']
  )
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
