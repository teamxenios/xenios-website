
-- BEGIN COMPONENT: fresh-target preimage
-- Fresh-target contract for Root-selected staging project srcphrgnxreqyirkitxd only.
-- The operator still binds the target, history, credential and writer window externally.
-- One compatible file is submitted through the existing CLI transaction+history path.
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
DO $foundation_preimage$
DECLARE failures integer;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 OR current_setting('server_version_num')::integer NOT IN (170006,170011)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT rolsuper AND rolbypassrls AND rolinherit)
 THEN RAISE EXCEPTION 'foundation_installer_or_pg_preimage_mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
   WHERE e.extname='pgcrypto' AND e.extversion='1.3' AND n.nspname='extensions')
 OR to_regprocedure('auth.uid()') IS NULL
 OR (SELECT p.prorettype FROM pg_proc p WHERE p.oid=to_regprocedure('auth.uid()'))<>'uuid'::regtype
 THEN RAISE EXCEPTION 'foundation_extension_or_auth_preimage_mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['research_catalog_approval_by_id','research_catalog_approval_events','research_catalog_approval_lookup','research_catalog_approval_one_creation','research_catalog_approval_owner_events','research_catalog_approval_owner_events_sequence_seq','research_catalog_approval_owner_lookup','research_catalog_publication_heads','research_catalog_publication_history','research_catalog_publication_operations','research_catalog_publication_published_revisions','research_catalog_publication_revisions','research_product_admin_audit','research_product_admin_audit_product_time_idx','research_product_content','research_product_facts','research_product_facts_product_idx','research_product_facts_unconfirmed_idx','research_product_goals','research_product_guide_links','research_product_media','research_product_media_one_primary_idx','research_product_media_product_order_idx','research_product_open_questions','research_product_open_questions_open_idx','research_product_prices','research_product_prices_one_active_idx','research_product_prices_variant_history_idx','research_product_prohibited_claims','research_product_prohibited_claims_product_idx','research_product_variants','research_product_variants_product_sort_idx','research_products','research_products_availability_idx','research_products_lane_idx','research_supplement_candidates','research_supplement_candidates_state_idx']::text[]) AS x(name) WHERE to_regclass('public.'||x.name) IS NOT NULL)
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
   AND (p.proname=ANY(ARRAY['research_product_variant_lifecycle_guard','research_product_price_history_immutable','research_product_admin_audit_append_only','research_admin_create_product','research_admin_update_product','research_admin_duplicate_product','research_admin_transition_product','research_admin_create_product_variant','research_admin_update_product_variant','research_admin_create_product_price','research_admin_approve_product_price','research_admin_prepare_product_media','research_admin_confirm_product_media','research_admin_update_product_media','research_catalog_publication_key','research_catalog_publication_hash','research_catalog_publication_backend_only','research_catalog_publication_append_only','research_catalog_publication_source','research_catalog_publication_replay','research_catalog_publication_revision','research_catalog_publication_current','research_catalog_publication_seal','research_catalog_publication_transition','research_catalog_record_approval_owner','research_catalog_approval_owner','research_catalog_approval_replay','research_catalog_approval_for_source','research_catalog_approval_state','research_catalog_approval_decide','research_catalog_publication_seal_verified','research_catalog_publication_transition_verified','research_catalog_publication_admin_state']::text[])
     OR p.proname LIKE 'research_catalog_publication_%' OR p.proname LIKE 'research_catalog_approval_%'))
 THEN RAISE EXCEPTION 'foundation_target_not_empty_or_name_collision'; END IF;
 IF to_regclass('storage.buckets') IS NULL THEN RAISE EXCEPTION 'foundation_storage_catalog_required'; END IF;
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='research-product-media-production')
 OR NOT has_table_privilege(current_user,'storage.buckets','INSERT')
 OR NOT has_table_privilege(current_user,'storage.buckets','UPDATE')
 THEN RAISE EXCEPTION 'foundation_bucket_preimage_or_privilege_mismatch'; END IF;
 WITH expected(kind,grantee,privilege) AS (VALUES ('r','postgres','SELECT'),
('r','postgres','INSERT'),
('r','postgres','UPDATE'),
('r','postgres','DELETE'),
('r','postgres','TRUNCATE'),
('r','postgres','REFERENCES'),
('r','postgres','TRIGGER'),
('r','postgres','MAINTAIN'),
('r','anon','SELECT'),
('r','anon','INSERT'),
('r','anon','UPDATE'),
('r','anon','DELETE'),
('r','anon','TRUNCATE'),
('r','anon','REFERENCES'),
('r','anon','TRIGGER'),
('r','anon','MAINTAIN'),
('r','authenticated','SELECT'),
('r','authenticated','INSERT'),
('r','authenticated','UPDATE'),
('r','authenticated','DELETE'),
('r','authenticated','TRUNCATE'),
('r','authenticated','REFERENCES'),
('r','authenticated','TRIGGER'),
('r','authenticated','MAINTAIN'),
('r','service_role','SELECT'),
('r','service_role','INSERT'),
('r','service_role','UPDATE'),
('r','service_role','DELETE'),
('r','service_role','TRUNCATE'),
('r','service_role','REFERENCES'),
('r','service_role','TRIGGER'),
('r','service_role','MAINTAIN'),
('f','postgres','EXECUTE'),
('f','anon','EXECUTE'),
('f','authenticated','EXECUTE'),
('f','service_role','EXECUTE'),
('S','postgres','SELECT'),
('S','postgres','UPDATE'),
('S','postgres','USAGE'),
('S','anon','SELECT'),
('S','anon','UPDATE'),
('S','anon','USAGE'),
('S','authenticated','SELECT'),
('S','authenticated','UPDATE'),
('S','authenticated','USAGE'),
('S','service_role','SELECT'),
('S','service_role','UPDATE'),
('S','service_role','USAGE')), actual AS (
 SELECT d.defaclobjtype::text AS kind, CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END AS grantee,
 a.privilege_type AS privilege,a.is_grantable,pg_get_userbyid(a.grantor)::text AS grantor
 FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
 CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE n.nspname='public' AND d.defaclrole=current_user::regrole
 AND d.defaclobjtype IN ('r','f','S'))
 SELECT count(*) INTO failures FROM expected e FULL JOIN actual a
 ON (a.kind,a.grantee,a.privilege)=(e.kind,e.grantee,e.privilege)
 WHERE e.kind IS NULL OR a.kind IS NULL OR a.is_grantable OR a.grantor<>'postgres';
 IF failures<>0 THEN RAISE EXCEPTION 'foundation_observed_default_acl_preimage_mismatch'; END IF;
END;
$foundation_preimage$;


-- BEGIN COMPONENT: exact research catalog
-- xenios research catalog (Website 3, G6). DRAFT, NOT RUN as of 2026-07-21.
-- Run once in the Supabase SQL Editor. Safe to re-run. RLS enabled, no public
-- policies; server-only access, matching every other research table.
--
-- Persists: shared/research/catalog.ts (CatalogProduct, ProvenancedFact, lanes,
-- availability, LaneDecisionState, SupplementCandidate) and
-- server/research/catalog/legacy-adapter.ts.
--
-- THE CENTRAL RULE OF THIS FILE: a supplier fact never stands alone. Each carries
-- its own confirmation state and source, because 32 facts across the 15 SKUs are
-- unconfirmed and 13 are disputed. Unconfirmed data must be structurally
-- distinguishable from confirmed data at rest, not only in application code.

create extension if not exists "pgcrypto";

create table if not exists public.research_products (
  id                     uuid primary key default gen_random_uuid(),
  sku                    text not null unique,
  slug                   text not null unique,
  display_name           text not null,

  lane                   text not null
                           check (lane in ('supplement','research_material','quantum',
                                           'future_clinical','non_product_program')),
  -- A held-open lane is a pending founder decision. It blocks purchase on its own so
  -- the placeholder cannot ship as a quiet default.
  lane_decision          text not null default 'decided'
                           check (lane_decision in ('decided','needs_samuel_decision')),

  availability           text not null default 'documentation_review'
                           check (availability in ('in_stock','low_stock','out_of_stock','waitlist',
                                                   'documentation_review','commerce_review',
                                                   'temporarily_unavailable','coming_soon')),
  commerce_approval      text not null default 'blocked_pending_written_approval'
                           check (commerce_approval in ('approved','blocked_pending_written_approval',
                                                        'blocked_by_lane','blocked_by_documentation')),
  fulfillment_owner      text not null default 'not_assigned'
                           check (fulfillment_owner in ('mitch','xenios','not_assigned')),

  guide_state            text not null default 'guide_in_development'
                           check (guide_state in ('guide_published','guide_updated','guide_in_review',
                                                  'guide_in_development','guide_coming_soon')),
  quality_document_state text not null default 'missing'
                           check (quality_document_state in ('approved','pending','missing','expired')),
  storage_data_state     text not null default 'missing'
                           check (storage_data_state in ('approved','pending','missing','expired')),
  shipping_profile_state text not null default 'missing'
                           check (shipping_profile_state in ('approved','pending','missing','expired')),

  subscription_eligible  boolean not null default false,
  -- Alternate spellings kept searchable. epitalon and epithalon both appear in the
  -- literature and no canonical scientific label has been chosen.
  name_aliases           text[] not null default '{}',
  last_reviewed          date,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists research_products_lane_idx on public.research_products (lane);
create index if not exists research_products_availability_idx on public.research_products (availability);

-- One row per supplier fact, so confirmation state cannot be separated from the value.
create table if not exists public.research_product_facts (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.research_products (id) on delete cascade,
  fact_key       text not null
                   check (fact_key in ('composition','strength','format','price_cents',
                                       'shelf_life','storage','coa','purity','sterility')),
  -- Text for every fact, including price, so an unconfirmed value is never coerced
  -- into a number a surface might render as money.
  fact_value     text,
  confirmation   text not null default 'not_confirmed'
                   check (confirmation in ('confirmed','supplier_reported',
                                           'unverified_legacy','not_confirmed')),
  source_kind    text not null default 'none'
                   check (source_kind in ('supplier_document','coa','legacy_catalog_file',
                                          'founder_statement','none')),
  source_ref     text,
  -- Set when two sources disagree. A conflict blocks member display outright,
  -- independently of confirmation state. KLOW composition is the live example.
  conflict_note  text,
  recorded_at    timestamptz not null default now(),

  -- A confirmed fact must have a value and a real source. This is the constraint that
  -- makes "confirmed" mean something at rest rather than only in the service layer.
  constraint research_product_facts_confirmed_needs_proof
    check (confirmation <> 'confirmed'
           or (fact_value is not null and source_kind in ('supplier_document','coa'))),
  constraint research_product_facts_unique_per_product unique (product_id, fact_key)
);
create index if not exists research_product_facts_product_idx on public.research_product_facts (product_id);
create index if not exists research_product_facts_unconfirmed_idx
  on public.research_product_facts (confirmation) where confirmation <> 'confirmed';

create table if not exists public.research_product_goals (
  product_id uuid not null references public.research_products (id) on delete cascade,
  goal_key   text not null
               check (goal_key in ('get_leaner','build_muscle','recover_faster','sleep_better',
                                   'think_sharper','feel_more_energized','age_better','look_better',
                                   'gut_and_immune_health','intimacy_and_vitality','everyday_health')),
  primary key (product_id, goal_key)
);

create table if not exists public.research_product_guide_links (
  product_id uuid not null references public.research_products (id) on delete cascade,
  guide_slug text not null,
  primary key (product_id, guide_slug)
);

create table if not exists public.research_product_prohibited_claims (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.research_products (id) on delete cascade,
  claim_text text not null,
  reason     text not null
);
create index if not exists research_product_prohibited_claims_product_idx
  on public.research_product_prohibited_claims (product_id);

create table if not exists public.research_product_open_questions (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.research_products (id) on delete cascade,
  question     text not null,
  resolved_at  timestamptz,
  resolved_by  text,
  created_at   timestamptz not null default now()
);
create index if not exists research_product_open_questions_open_idx
  on public.research_product_open_questions (product_id) where resolved_at is null;

-- Supplement candidates. Nothing here is sellable: xenios holds no written reseller
-- authorization from any brand, so the default is NOT AUTHORIZED on every row.
create table if not exists public.research_supplement_candidates (
  id                     uuid primary key default gen_random_uuid(),
  brand                  text not null,
  exact_name             text not null,
  official_url           text,
  category               text not null,
  foundation_role        text not null default 'specialty'
                           check (foundation_role in ('core','conditional','specialty')),
  athlete_testing_relevant boolean not null default false,
  reseller_authorization text not null default 'not_authorized'
                           check (reseller_authorization in ('not_authorized','requested',
                                                             'authorized_in_writing')),
  commercial_state       text not null default 'candidate'
                           check (commercial_state in ('candidate','authorization_pending',
                                                       'approved','rejected','unavailable')),
  inventory_model        text not null default 'not_confirmed'
                           check (inventory_model in ('not_confirmed','stocked','drop_ship')),
  subscription_eligible  boolean not null default false,
  duplicate_nutrient_flags text[] not null default '{}',
  interaction_review_flags text[] not null default '{}',
  last_verified          date,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- Approval requires written authorization. Enforced here so no code path can mark a
  -- candidate sellable without it.
  constraint research_supplement_candidates_approved_needs_authorization
    check (commercial_state <> 'approved' or reseller_authorization = 'authorized_in_writing'),
  constraint research_supplement_candidates_unique_name unique (brand, exact_name)
);
create index if not exists research_supplement_candidates_state_idx
  on public.research_supplement_candidates (commercial_state);

alter table public.research_products                    enable row level security;
alter table public.research_product_facts               enable row level security;
alter table public.research_product_goals               enable row level security;
alter table public.research_product_guide_links         enable row level security;
alter table public.research_product_prohibited_claims   enable row level security;
alter table public.research_product_open_questions      enable row level security;
alter table public.research_supplement_candidates       enable row level security;


-- BEGIN COMPONENT: exact content table fragment
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


-- BEGIN COMPONENT: exact canonical Product Control
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


-- BEGIN COMPONENT: exact canonical privilege hardening
-- Production grant convergence for the Research Product Control Center.
-- Idempotent and row-preserving. Website 2 owns reviewed application.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
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
    execute format(
      'revoke truncate, references, trigger on table public.%I from service_role',
      table_name
    );
  end loop;
end
$$;


-- BEGIN COMPONENT: narrow PG17 MAINTAIN revoke
-- PG17 observed arwdDxtm defaults: retain the canonical 33-right service boundary.
-- No default ACL, role membership, unrelated relation or raw source file changes.
REVOKE MAINTAIN ON TABLE public.research_products,public.research_product_facts,public.research_product_goals,public.research_product_guide_links,public.research_product_prohibited_claims,public.research_product_open_questions,public.research_supplement_candidates,public.research_product_content,public.research_product_variants,public.research_product_prices,public.research_product_media,public.research_product_admin_audit FROM service_role;


-- BEGIN COMPONENT: publication base outer tokens removed
-- PRIVATE UNAPPLIED CANDIDATE, PostgreSQL17. Native qualification is UNRUN.
-- Installation/ACL/platform compatibility requires Root selection and review.
-- No product/content/media/price row is created, edited or auto-approved here.

create function public.research_catalog_publication_key(p jsonb)
returns text language plpgsql immutable set search_path=pg_catalog as $$
begin
  if p is null or jsonb_typeof(p) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p)) <> 4
     or not (p ?& array['offeringId','offeringVariantId','productId','variantId'])
     or coalesce(p->>'offeringId','') !~ '^mo_[0-9a-f]{1,97}$'
     or coalesce(p->>'offeringVariantId','') !~ '^mov_[0-9a-f]{1,96}$'
     or coalesce(p->>'productId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p->>'variantId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or p->>'productId' = '00000000-0000-0000-0000-000000000000'
     or p->>'variantId' = '00000000-0000-0000-0000-000000000000' then
    raise exception 'publication_invalid_identity';
  end if;
  return (p->>'offeringId')||'|'||(p->>'offeringVariantId')||'|'||(p->>'productId')||'|'||(p->>'variantId');
end; $$;

create function public.research_catalog_publication_hash(p jsonb)
returns text language sql immutable strict set search_path=pg_catalog
as $$ select encode(sha256(convert_to(p::text,'UTF8')),'hex') $$;

-- Same backend-only boundary used by the existing canonical account RPC:
-- service role must not accidentally carry an end-user subject/session.
create function public.research_catalog_publication_backend_only()
returns void language plpgsql stable set search_path=pg_catalog as $$
begin
  if current_setting('role',true) is distinct from 'service_role' or auth.uid() is not null then
    raise exception using errcode='42501',message='publication_backend_only';
  end if;
end; $$;

create table public.research_catalog_publication_revisions (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null,
  identity jsonb not null,
  product_id uuid not null references public.research_products(id),
  variant_id uuid not null,
  snapshot jsonb not null,
  evidence jsonb not null,
  created_by text not null check(length(created_by) between 1 and 320),
  created_at timestamptz not null default now(),
  foreign key(product_id,variant_id) references public.research_product_variants(product_id,id),
  check(identity_key=public.research_catalog_publication_key(identity)),
  check(product_id::text=identity->>'productId' and variant_id::text=identity->>'variantId'),
  check(jsonb_typeof(snapshot)='object' and jsonb_typeof(evidence)='object')
);
create table public.research_catalog_publication_heads (
  identity_key text primary key,
  identity jsonb not null,
  generation bigint not null default 0 check(generation between 0 and 9007199254740991),
  current_revision uuid references public.research_catalog_publication_revisions(id),
  updated_at timestamptz not null default now(),
  check(identity_key=public.research_catalog_publication_key(identity))
);
create table public.research_catalog_publication_operations (
  actor text not null check(length(actor) between 1 and 320),
  operation_key text not null check(length(operation_key) between 1 and 200),
  intent jsonb not null,
  intent_sha256 text not null check(intent_sha256 ~ '^[0-9a-f]{64}$'),
  identity_key text not null,
  operation text not null check(operation in ('seal','publish','withdraw','rollback')),
  receipt jsonb not null,
  accepted_at timestamptz not null default now(),
  primary key(actor,operation_key)
);
create index research_catalog_publication_history
  on public.research_catalog_publication_operations(identity_key,accepted_at);

create function public.research_catalog_publication_append_only()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'publication_history_immutable'; end; $$;
create trigger research_catalog_publication_revisions_immutable before update or delete
  on public.research_catalog_publication_revisions for each row
  execute function public.research_catalog_publication_append_only();
create trigger research_catalog_publication_operations_immutable before update or delete
  on public.research_catalog_publication_operations for each row
  execute function public.research_catalog_publication_append_only();

-- Existing canonical rows, not a second product/content/media authority. Draft
-- copy is NOT approved by this read: the server must resolve actual approval
-- evidence for this exact source hash before the separate seal command.
create function public.research_catalog_publication_source(p_identity jsonb,p_media_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.research_products%rowtype; v public.research_product_variants%rowtype;
        m public.research_product_media%rowtype; c jsonb; result jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  perform public.research_catalog_publication_key(p_identity);
  select * into p from public.research_products where id=(p_identity->>'productId')::uuid;
  select * into v from public.research_product_variants where id=(p_identity->>'variantId')::uuid and product_id=p.id;
  select * into m from public.research_product_media where id=p_media_id and product_id=p.id;
  if p.id is null or v.id is null or m.id is null or not p.active_state
     or p.admin_status <> 'published' or p.visibility_state <> 'public'
     or not v.active or v.status <> 'approved' or m.state <> 'approved'
     or nullif(trim(m.approved_by),'') is null or m.approved_at is null then
    raise exception 'publication_source_unavailable';
  end if;
  select jsonb_strip_nulls(jsonb_build_object(
    'summary',max(body) filter(where section='shortDescription'),
    'overview',coalesce(max(body) filter(where section='overview'),max(body) filter(where section='longDescription')),
    'storage',max(body) filter(where section='storageInformation'))) into c
  from public.research_product_content where product_id=p.id;
  if coalesce(length(c->>'summary'),0) not between 1 and 20000
     or coalesce(length(c->>'overview'),0) not between 1 and 20000
     or coalesce(length(c->>'storage'),0)>20000 then raise exception 'publication_content_unavailable'; end if;
  result:=jsonb_build_object('identity',p_identity,'productVersion',p.version,'variantVersion',v.version,
    'content',c,'contentSha256',public.research_catalog_publication_hash(c),
    'media',jsonb_build_object('id',m.id,'version',m.version,'contentType',m.content_type,
      'sizeBytes',m.size_bytes,'altText',m.alt_text,
      'storageIdentitySha256',encode(sha256(convert_to(m.storage_key,'UTF8')),'hex')));
  return result||jsonb_build_object('sourceSha256',public.research_catalog_publication_hash(result));
end; $$;

create function public.research_catalog_publication_replay(p_actor text,p_key text,p_intent jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare old public.research_catalog_publication_operations%rowtype;
begin
  perform public.research_catalog_publication_backend_only();
  select * into old from public.research_catalog_publication_operations where actor=p_actor and operation_key=p_key;
  if not found then return null; end if;
  if old.intent is distinct from p_intent or old.intent_sha256<>public.research_catalog_publication_hash(p_intent) then
    raise exception 'publication_idempotency_conflict';
  end if;
  return old.receipt||jsonb_build_object('replayed',true);
end; $$;

create function public.research_catalog_publication_revision(p_identity jsonb,p_revision_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform public.research_catalog_publication_backend_only();
 return (select jsonb_build_object('id',r.id,'identity',r.identity,'snapshot',r.snapshot,'evidence',r.evidence)
   from public.research_catalog_publication_revisions r
   where r.id=p_revision_id and r.identity_key=public.research_catalog_publication_key(p_identity));
end;
$$;

create function public.research_catalog_publication_current(p_identity jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare h public.research_catalog_publication_heads%rowtype; r jsonb; m public.research_product_media%rowtype;
begin
  perform public.research_catalog_publication_backend_only();
  select * into h from public.research_catalog_publication_heads where identity_key=public.research_catalog_publication_key(p_identity);
  if not found then return jsonb_build_object('generation',0,'revision',null); end if;
  if h.current_revision is null then return jsonb_build_object('generation',h.generation,'revision',null); end if;
  r:=public.research_catalog_publication_revision(p_identity,h.current_revision);
  -- Ordinary draft copy edits do not rewrite or invalidate the selected
  -- immutable published copy. Structural identity/media changes do refuse.
  if r is null or not exists(select 1 from public.research_products p join public.research_product_variants v on v.product_id=p.id
    where p.id=(p_identity->>'productId')::uuid and v.id=(p_identity->>'variantId')::uuid
      and p.active_state and p.admin_status='published' and p.visibility_state='public'
      and v.active and v.status='approved' and v.version=(r#>>'{snapshot,variantVersion}')::integer) then
    return jsonb_build_object('generation',h.generation,'revision',null);
  end if;
  select * into m from public.research_product_media where id=(r#>>'{snapshot,media,id}')::uuid
    and product_id=(p_identity->>'productId')::uuid;
  if m.id is null or m.state<>'approved' or nullif(trim(m.approved_by),'') is null or m.approved_at is null
     or m.version<>(r#>>'{snapshot,media,version}')::integer
     or encode(sha256(convert_to(m.storage_key,'UTF8')),'hex')<>r#>>'{snapshot,media,storageIdentitySha256}' then
    return jsonb_build_object('generation',h.generation,'revision',null);
  end if;
  return jsonb_build_object('generation',h.generation,'revision',r);
end; $$;

create function public.research_catalog_publication_seal(p_actor text,p_key text,p_intent jsonb,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare subject_identity jsonb:=p_intent->'identity'; k text; h public.research_catalog_publication_heads%rowtype;
        s jsonb; replay jsonb; rev uuid:=gen_random_uuid(); receipt jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  k:=public.research_catalog_publication_key(subject_identity);
  if p_actor is null or length(trim(p_actor)) not between 1 and 320 or p_key is null
     or length(trim(p_key)) not between 1 and 200 or p_intent->>'operation' is distinct from 'seal'
     or jsonb_typeof(p_intent->'expectedGeneration') is distinct from 'number'
     or coalesce(p_intent->>'expectedGeneration','') !~ '^(0|[1-9][0-9]{0,15})$'
     or (p_intent->>'expectedGeneration')::numeric>9007199254740991 then
    raise exception 'publication_invalid_command'; end if;
  -- Actor/key lock precedes the exact head lock in BOTH command functions.
  perform pg_advisory_xact_lock(hashtextextended(p_actor||':'||p_key,0));
  replay:=public.research_catalog_publication_replay(p_actor,p_key,p_intent);if replay is not null then return replay; end if;
  insert into public.research_catalog_publication_heads(identity_key,identity) values(k,subject_identity) on conflict do nothing;
  select * into h from public.research_catalog_publication_heads where identity_key=k for update;
  if h.generation<>(p_intent->>'expectedGeneration')::bigint then raise exception 'publication_generation_conflict'; end if;
  -- Lock canonical mutation rows before building/validating the source again.
  perform 1 from public.research_products p where p.id=(subject_identity->>'productId')::uuid for update;
  perform 1 from public.research_product_variants v where v.id=(subject_identity->>'variantId')::uuid and v.product_id=(subject_identity->>'productId')::uuid for update;
  perform 1 from public.research_product_content c where c.product_id=(subject_identity->>'productId')::uuid order by c.section for update;
  perform 1 from public.research_product_media m where m.id=(p_intent->>'mediaId')::uuid and m.product_id=(subject_identity->>'productId')::uuid for update;
  s:=public.research_catalog_publication_source(subject_identity,(p_intent->>'mediaId')::uuid);
  if s->>'sourceSha256' is distinct from p_intent->>'sourceSha256' then raise exception 'publication_source_version_conflict'; end if;
  if p_evidence->'identity' is distinct from subject_identity or p_evidence->>'sourceSha256' is distinct from s->>'sourceSha256'
     or p_evidence->>'contentSha256' is distinct from s->>'contentSha256'
     or p_evidence->>'mediaId' is distinct from s#>>'{media,id}'
     or p_evidence->>'mediaVersion' is distinct from s#>>'{media,version}'
     or p_evidence->>'state' is distinct from 'approved' or p_evidence->>'usage' is distinct from 'public_catalog_display'
     or coalesce(p_evidence->>'contentApprovalSha256','') !~ '^[0-9a-f]{64}$'
     or coalesce(p_evidence->>'rightsApprovalSha256','') !~ '^[0-9a-f]{64}$'
     or coalesce(p_evidence->>'mediaSha256','') !~ '^[0-9a-f]{64}$'
     or coalesce((p_evidence->>'width')::integer,0) not between 1 and 20000
     or coalesce((p_evidence->>'height')::integer,0) not between 1 and 20000
     or coalesce(p_evidence->>'representation','') not in ('proposed_carton','proposed_vial','catalog_reference')
     or jsonb_typeof(p_evidence->'packagingDesign') is distinct from 'boolean'
     or not(p_evidence ? 'expiresAt')
     or (p_evidence->>'expiresAt' is not null and (p_evidence->>'expiresAt')::timestamptz<=now()) then
    raise exception 'publication_approval_required'; end if;
  insert into public.research_catalog_publication_revisions(id,identity_key,identity,product_id,variant_id,snapshot,evidence,created_by)
    values(rev,k,subject_identity,(subject_identity->>'productId')::uuid,(subject_identity->>'variantId')::uuid,s,p_evidence,p_actor);
  receipt:=jsonb_build_object('operation','seal','revisionId',rev,'generation',h.generation,'identity',subject_identity,'replayed',false);
  insert into public.research_product_admin_audit(product_id,entity_type,entity_id,action,actor,detail,after_state)
    values((subject_identity->>'productId')::uuid,'content',rev,'catalog_revision_sealed',p_actor,'Immutable exact-variant revision; approval/rights evidence is retained.',receipt);
  insert into public.research_catalog_publication_operations(actor,operation_key,intent,intent_sha256,identity_key,operation,receipt)
    values(p_actor,p_key,p_intent,public.research_catalog_publication_hash(p_intent),k,'seal',receipt);
  return receipt;
end; $$;

create function public.research_catalog_publication_transition(p_actor text,p_key text,p_intent jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare subject_identity jsonb:=p_intent->'identity'; k text; h public.research_catalog_publication_heads%rowtype;
        target uuid; op text:=p_intent->>'operation'; replay jsonb; receipt jsonb; old_revision uuid;
begin
  perform public.research_catalog_publication_backend_only();
  k:=public.research_catalog_publication_key(subject_identity);
  if p_actor is null or length(trim(p_actor)) not between 1 and 320 or p_key is null
     or length(trim(p_key)) not between 1 and 200 or op is null or op not in ('publish','withdraw','rollback')
     or jsonb_typeof(p_intent->'expectedGeneration') is distinct from 'number'
     or coalesce(p_intent->>'expectedGeneration','') !~ '^(0|[1-9][0-9]{0,15})$'
     or (p_intent->>'expectedGeneration')::numeric>9007199254740991 then
    raise exception 'publication_invalid_command'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor||':'||p_key,0));
  replay:=public.research_catalog_publication_replay(p_actor,p_key,p_intent);if replay is not null then return replay; end if;
  select * into h from public.research_catalog_publication_heads where identity_key=k for update;
  if not found then raise exception 'publication_not_found'; end if;
  if h.generation<>(p_intent->>'expectedGeneration')::bigint then raise exception 'publication_generation_conflict'; end if;
  if op in ('withdraw','rollback') and coalesce(length(trim(p_intent->>'reason')),0) not between 1 and 1000 then raise exception 'publication_reason_required'; end if;
  old_revision:=h.current_revision;
  if op='withdraw' then
    if old_revision is null then raise exception 'publication_not_published'; end if;
    target:=null;
  else
    target:=(p_intent->>'revisionId')::uuid;
    if public.research_catalog_publication_revision(subject_identity,target) is null then raise exception 'publication_revision_mismatch'; end if;
    if target is not distinct from old_revision then raise exception 'publication_already_current'; end if;
    if op='rollback' and not exists(select 1 from public.research_catalog_publication_operations o
      where o.identity_key=k and o.operation in ('publish','rollback') and o.receipt->>'revisionId'=target::text) then
      raise exception 'publication_not_previously_published'; end if;
  end if;
  update public.research_catalog_publication_heads set current_revision=target,generation=generation+1,updated_at=now() where identity_key=k returning * into h;
  -- Re-read current canonical product/variant/media gates before accepting a
  -- selection. The application must ALSO revalidate real current review rights.
  if target is not null and public.research_catalog_publication_current(subject_identity)->'revision'='null'::jsonb then
    raise exception 'publication_source_unavailable'; end if;
  receipt:=jsonb_build_object('operation',op,'revisionId',target,'generation',h.generation,'identity',subject_identity,'replayed',false);
  insert into public.research_product_admin_audit(product_id,entity_type,entity_id,action,actor,detail,before_state,after_state)
    values((subject_identity->>'productId')::uuid,'content',target,'catalog_'||op,p_actor,p_intent->>'reason',jsonb_build_object('revisionId',old_revision,'generation',h.generation-1),receipt);
  insert into public.research_catalog_publication_operations(actor,operation_key,intent,intent_sha256,identity_key,operation,receipt)
    values(p_actor,p_key,p_intent,public.research_catalog_publication_hash(p_intent),k,op,receipt);
  return receipt;
end; $$;

alter table public.research_catalog_publication_revisions enable row level security;
alter table public.research_catalog_publication_revisions force row level security;
alter table public.research_catalog_publication_heads enable row level security;
alter table public.research_catalog_publication_heads force row level security;
alter table public.research_catalog_publication_operations enable row level security;
alter table public.research_catalog_publication_operations force row level security;
revoke all on table public.research_catalog_publication_revisions,public.research_catalog_publication_heads,
  public.research_catalog_publication_operations from public,anon,authenticated,service_role;
-- No direct table grant. Six server-only RPCs are the explicit storage boundary.
revoke all on function public.research_catalog_publication_key(jsonb),public.research_catalog_publication_hash(jsonb),
  public.research_catalog_publication_backend_only(),public.research_catalog_publication_append_only(),public.research_catalog_publication_source(jsonb,uuid),
  public.research_catalog_publication_replay(text,text,jsonb),public.research_catalog_publication_revision(jsonb,uuid),
  public.research_catalog_publication_current(jsonb),public.research_catalog_publication_seal(text,text,jsonb,jsonb),
  public.research_catalog_publication_transition(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_publication_source(jsonb,uuid),
  public.research_catalog_publication_replay(text,text,jsonb),public.research_catalog_publication_revision(jsonb,uuid),
  public.research_catalog_publication_current(jsonb),public.research_catalog_publication_seal(text,text,jsonb,jsonb),
  public.research_catalog_publication_transition(text,text,jsonb) to service_role;


-- BEGIN COMPONENT: approval extension outer tokens removed
-- PRIVATE UNAPPLIED EXTENSION. Requires the frozen publication base candidate.
-- No owner, pilot, approval, product or media is seeded by this file.

-- Only the database-owner installation channel can record a verified owner.
-- The application service role has neither table DML nor execute on its issuer.
-- Zero capability rows is the installed default; this file grants nobody rights.
create table public.research_catalog_approval_owner_events (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  capability_id uuid not null,
  identity_key text not null,
  identity jsonb not null,
  actor text not null check(actor=trim(actor) and length(actor) between 1 and 320),
  decision text not null check(decision in ('grant','revoke')),
  expires_at timestamptz,
  authority_reference text not null check(length(trim(authority_reference)) between 1 and 512),
  recorded_at timestamptz not null default now(),
  check(identity_key=public.research_catalog_publication_key(identity)),
  check(decision<>'grant' or (expires_at is not null and isfinite(expires_at)))
);
create index research_catalog_approval_owner_lookup on public.research_catalog_approval_owner_events(identity_key,actor,sequence desc);
create trigger research_catalog_approval_owner_immutable before update or delete on public.research_catalog_approval_owner_events
for each row execute function public.research_catalog_publication_append_only();

create table public.research_catalog_approval_events (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null,
  identity jsonb not null,
  version bigint not null check(version between 1 and 9007199254740991),
  approval_id uuid not null,
  decision text not null check(decision in ('approved','revoked')),
  actor text not null,
  operation_key text not null,
  intent jsonb not null,
  intent_sha256 text not null,
  owner_event_id uuid not null references public.research_catalog_approval_owner_events(id),
  evidence jsonb,
  receipt jsonb not null,
  recorded_at timestamptz not null default now(),
  unique(identity_key,version),unique(actor,operation_key),
  check(identity_key=public.research_catalog_publication_key(identity)),
  check(intent_sha256 ~ '^[a-f0-9]{64}$'),
  check((decision='approved')=(evidence is not null))
);
create index research_catalog_approval_lookup on public.research_catalog_approval_events(identity_key,version desc);
create index research_catalog_approval_by_id on public.research_catalog_approval_events(approval_id,version desc);
create unique index research_catalog_approval_one_creation on public.research_catalog_approval_events(approval_id) where decision='approved';
create trigger research_catalog_approval_immutable before update or delete on public.research_catalog_approval_events
for each row execute function public.research_catalog_publication_append_only();
create index research_catalog_publication_published_revisions
  on public.research_catalog_publication_operations(identity_key,(receipt->>'revisionId')) where operation in ('publish','rollback');

create function public.research_catalog_record_approval_owner(p_identity jsonb,p_actor text,p_capability_id uuid,p_decision text,p_expires_at timestamptz,p_authority_reference text)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare k text:=public.research_catalog_publication_key(p_identity); last_event public.research_catalog_approval_owner_events%rowtype; event_id uuid;
begin
  -- SECURITY INVOKER, no service-role execute grant. The actual privileged
  -- Root installer must verify the named owner/pilot/evidence out of band.
  if current_setting('role',true) in ('service_role','anon','authenticated') then raise exception using errcode='42501',message='approval_owner_installer_only'; end if;
  if p_actor is null or p_actor<>trim(p_actor) or length(p_actor) not between 1 and 320 or p_capability_id is null
    or p_decision is null or p_decision not in ('grant','revoke') or p_authority_reference is null or length(trim(p_authority_reference)) not between 1 and 512 then raise exception 'publication_invalid_command'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-approval-owner:'||k,0));
  select * into last_event from public.research_catalog_approval_owner_events where identity_key=k and actor=p_actor order by sequence desc limit 1;
  if p_decision='grant' and (p_expires_at is null or not isfinite(p_expires_at) or p_expires_at<=now()) then raise exception 'publication_invalid_command'; end if;
  if p_decision='revoke' and (last_event.id is null or last_event.decision<>'grant' or last_event.capability_id<>p_capability_id) then raise exception 'publication_approval_owner_required'; end if;
  insert into public.research_catalog_approval_owner_events(capability_id,identity_key,identity,actor,decision,expires_at,authority_reference)
    values(p_capability_id,k,p_identity,p_actor,p_decision,p_expires_at,p_authority_reference) returning id into event_id;
  return event_id;
end; $$;
revoke all on function public.research_catalog_record_approval_owner(jsonb,text,uuid,text,timestamptz,text) from public,anon,authenticated,service_role;

create function public.research_catalog_approval_owner(p_actor text,p_identity jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare k text:=public.research_catalog_publication_key(p_identity); e public.research_catalog_approval_owner_events%rowtype;
begin
  perform public.research_catalog_publication_backend_only();
  select * into e from public.research_catalog_approval_owner_events where identity_key=k and actor=p_actor order by sequence desc limit 1;
  if e.id is null or e.decision<>'grant' or e.expires_at<=now() then return null; end if;
  return jsonb_build_object('capabilityId',e.capability_id,'grantEventId',e.id,'identity',e.identity,'actor',e.actor,'usage','public_catalog_display','expiresAt',e.expires_at);
end; $$;
revoke all on function public.research_catalog_approval_owner(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_approval_owner(text,jsonb) to service_role;

create function public.research_catalog_approval_replay(p_actor text,p_key text,p_intent jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare old public.research_catalog_approval_events%rowtype;
begin
  perform public.research_catalog_publication_backend_only();
  select * into old from public.research_catalog_approval_events where actor=p_actor and operation_key=p_key;
  if not found then return null; end if;
  if old.intent is distinct from p_intent then raise exception 'publication_idempotency_conflict'; end if;
  return old.receipt||jsonb_build_object('replayed',true);
end; $$;
revoke all on function public.research_catalog_approval_replay(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_approval_replay(text,text,jsonb) to service_role;

create function public.research_catalog_approval_for_source(p_identity jsonb,p_source_sha256 text,p_media_id uuid,p_media_version integer)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare k text:=public.research_catalog_publication_key(p_identity); e public.research_catalog_approval_events%rowtype; owner jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  select * into e from public.research_catalog_approval_events where identity_key=k and decision='approved'
    and evidence->>'sourceSha256'=p_source_sha256 and evidence->>'mediaId'=p_media_id::text
    and (evidence->>'mediaVersion')::integer=p_media_version order by version desc limit 1;
  if e.id is null or exists(select 1 from public.research_catalog_approval_events where identity_key=k and approval_id=e.approval_id and decision='revoked') then return null; end if;
  owner:=public.research_catalog_approval_owner(e.actor,p_identity);
  if owner is null or owner->>'grantEventId'<>e.owner_event_id::text or (e.evidence->>'expiresAt' is not null and (e.evidence->>'expiresAt')::timestamptz<=now()) then return null; end if;
  return e.evidence;
end; $$;
revoke all on function public.research_catalog_approval_for_source(jsonb,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_approval_for_source(jsonb,text,uuid,integer) to service_role;

create function public.research_catalog_approval_state(p_actor text,p_identity jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare k text:=public.research_catalog_publication_key(p_identity);
begin
  perform public.research_catalog_publication_backend_only();
  return (
    with latest as (
      select e.approval_id,e.decision,e.version from public.research_catalog_approval_events e where e.identity_key=k
        and not exists(select 1 from public.research_catalog_approval_events n where n.identity_key=k and n.approval_id=e.approval_id and n.version>e.version)
      order by e.version desc limit 51
    ), recent as (select * from latest order by version desc limit 50)
    select jsonb_build_object('identity',p_identity,'approvalVersion',coalesce((select max(version) from public.research_catalog_approval_events where identity_key=k),0),'ownerCapability',public.research_catalog_approval_owner(p_actor,p_identity),
      'approvals',coalesce((select jsonb_agg(jsonb_build_object('approvalId',r.approval_id,'recordedDecision',r.decision,'approvalVersion',r.version,'sourceSha256',a.evidence->>'sourceSha256','mediaId',a.evidence->>'mediaId','mediaVersion',a.evidence->'mediaVersion','mediaSha256',a.evidence->>'mediaSha256','expiresAt',a.evidence->'expiresAt') order by r.version desc)
        from recent r join public.research_catalog_approval_events a on a.identity_key=k and a.approval_id=r.approval_id and a.decision='approved'),'[]'::jsonb),
      'historyTruncated',(select count(*)>50 from latest))
  );
end; $$;
revoke all on function public.research_catalog_approval_state(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_approval_state(text,jsonb) to service_role;

create function public.research_catalog_approval_decide(p_actor text,p_key text,p_intent jsonb,p_media_sha256 text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare subject_identity jsonb:=p_intent->'identity'; k text:=public.research_catalog_publication_key(subject_identity); op text:=p_intent->>'operation'; old public.research_catalog_approval_events%rowtype;
  v bigint; owner jsonb; source jsonb; evidence jsonb; proof jsonb; approval uuid; result jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  if p_intent is null or jsonb_typeof(p_intent) is distinct from 'object' or op is null or p_actor is null or p_actor<>trim(p_actor) or length(p_actor) not between 1 and 320 or p_key is null or p_key<>trim(p_key) or length(p_key) not between 1 and 200
    or op not in ('approve','revoke') or jsonb_typeof(p_intent->'expectedApprovalVersion') is distinct from 'number'
    or (p_intent->>'expectedApprovalVersion') !~ '^[0-9]+$' then raise exception 'publication_invalid_command'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-approval-command:'||p_actor||'|'||p_key,0));
  select * into old from public.research_catalog_approval_events where actor=p_actor and operation_key=p_key;
  if found then if old.intent is distinct from p_intent then raise exception 'publication_idempotency_conflict'; end if;return old.receipt||jsonb_build_object('replayed',true);end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-approval:'||k,0));
  select coalesce(max(version),0) into v from public.research_catalog_approval_events where identity_key=k;
  if v<>(p_intent->>'expectedApprovalVersion')::bigint or v>=9007199254740991 then raise exception 'publication_approval_version_conflict'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-approval-owner:'||k,0));
  owner:=public.research_catalog_approval_owner(p_actor,subject_identity);if owner is null then raise exception 'publication_approval_owner_required'; end if;
  if op='approve' then
    if (select count(*) from jsonb_object_keys(p_intent))<>14 or not(p_intent ?& array['operation','identity','expectedApprovalVersion','mediaId','sourceSha256','expectedMediaSha256','contentApprovalReference','rightsEvidenceReference','expiresAt','width','height','representation','packagingDesign','usage'])
      or p_media_sha256 is null or p_media_sha256 !~ '^[a-f0-9]{64}$' or p_media_sha256 is distinct from p_intent->>'expectedMediaSha256' or p_intent->>'usage' is distinct from 'public_catalog_display'
      or length(trim(coalesce(p_intent->>'contentApprovalReference',''))) not between 1 and 512
      or length(trim(coalesce(p_intent->>'rightsEvidenceReference',''))) not between 1 and 512
      or jsonb_typeof(p_intent->'width') is distinct from 'number' or jsonb_typeof(p_intent->'height') is distinct from 'number'
      or (p_intent->>'width') !~ '^[0-9]+$' or (p_intent->>'height') !~ '^[0-9]+$'
      or (p_intent->>'width')::integer not between 1 and 20000 or (p_intent->>'height')::integer not between 1 and 20000
      or coalesce(p_intent->>'representation','') not in ('proposed_carton','proposed_vial','catalog_reference')
      or jsonb_typeof(p_intent->'packagingDesign') is distinct from 'boolean'
      or (p_intent->>'expiresAt' is not null and (not isfinite((p_intent->>'expiresAt')::timestamptz) or (p_intent->>'expiresAt')::timestamptz<=now())) then raise exception 'publication_invalid_command'; end if;
    -- These row locks match the existing seal ordering and protect native
    -- source validation while recording the immutable decision and audit.
    perform 1 from public.research_products where id=(subject_identity->>'productId')::uuid for update;
    perform 1 from public.research_product_variants where product_id=(subject_identity->>'productId')::uuid and id=(subject_identity->>'variantId')::uuid for update;
    perform 1 from public.research_product_media where product_id=(subject_identity->>'productId')::uuid and id=(p_intent->>'mediaId')::uuid for update;
    source:=public.research_catalog_publication_source(subject_identity,(p_intent->>'mediaId')::uuid);
    if source is null or source->>'sourceSha256' is distinct from p_intent->>'sourceSha256' then raise exception 'publication_source_version_conflict'; end if;
    approval:=gen_random_uuid();proof:=jsonb_build_object('identity',subject_identity,'sourceSha256',source->>'sourceSha256','contentSha256',source->>'contentSha256','mediaId',source#>>'{media,id}','mediaVersion',source#>'{media,version}','mediaSha256',p_media_sha256,'actor',p_actor,'ownerEventId',owner->>'grantEventId','usage','public_catalog_display','expiresAt',p_intent->'expiresAt','contentReference',p_intent->>'contentApprovalReference','rightsReference',p_intent->>'rightsEvidenceReference');
    evidence:=jsonb_build_object('identity',subject_identity,'sourceSha256',source->>'sourceSha256','contentSha256',source->>'contentSha256','mediaId',source#>>'{media,id}','mediaVersion',source#>'{media,version}','mediaSha256',p_media_sha256,'contentApprovalSha256',public.research_catalog_publication_hash(proof||jsonb_build_object('purpose','content')),'rightsApprovalSha256',public.research_catalog_publication_hash(proof||jsonb_build_object('purpose','rights')),'usage','public_catalog_display','state','approved','expiresAt',p_intent->'expiresAt','width',p_intent->'width','height',p_intent->'height','representation',p_intent->'representation','packagingDesign',p_intent->'packagingDesign');
  else
    if p_media_sha256 is not null then raise exception 'publication_invalid_command'; end if;
    if (select count(*) from jsonb_object_keys(p_intent))<>5 or not(p_intent ?& array['operation','identity','expectedApprovalVersion','approvalId','reason']) or length(trim(coalesce(p_intent->>'reason',''))) not between 1 and 1000 then raise exception 'publication_invalid_command'; end if;
    approval:=(p_intent->>'approvalId')::uuid;
    if not exists(select 1 from public.research_catalog_approval_events where identity_key=k and approval_id=approval and decision='approved') then raise exception 'publication_approval_not_found'; end if;
    if exists(select 1 from public.research_catalog_approval_events where identity_key=k and approval_id=approval and decision='revoked') then raise exception 'publication_approval_already_revoked'; end if;
  end if;
  result:=jsonb_build_object('operation',op,'identity',subject_identity,'approvalId',approval,'approvalVersion',v+1,'decision',case when op='approve' then 'approved' else 'revoked' end,'replayed',false);
  insert into public.research_catalog_approval_events(identity_key,identity,version,approval_id,decision,actor,operation_key,intent,intent_sha256,owner_event_id,evidence,receipt)
    values(k,subject_identity,v+1,approval,case when op='approve' then 'approved' else 'revoked' end,p_actor,p_key,p_intent,public.research_catalog_publication_hash(p_intent),(owner->>'grantEventId')::uuid,evidence,result);
  insert into public.research_product_admin_audit(product_id,entity_type,entity_id,action,actor,detail,after_state)
    values((subject_identity->>'productId')::uuid,'content',approval,'catalog_approval_'||op,p_actor,'Authorized exact-variant content and media evidence decision; private source references retained in immutable approval history.',result);
  return result;
end; $$;
revoke all on function public.research_catalog_approval_decide(text,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_approval_decide(text,text,jsonb,text) to service_role;

-- Bind existing publication transactions to the actual current approval under
-- the same owner-window lock used by approve/revoke and the native issuer.
-- The original source stays frozen; direct backend execution is replaced by
-- these checked entry points. Historical exact receipts remain recoverable.
create function public.research_catalog_publication_seal_verified(p_actor text,p_key text,p_intent jsonb,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare subject_identity jsonb:=p_intent->'identity'; k text:=public.research_catalog_publication_key(subject_identity); replay jsonb; approved jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  replay:=public.research_catalog_publication_replay(p_actor,p_key,p_intent);if replay is not null then return replay;end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-approval-owner:'||k,0));
  replay:=public.research_catalog_publication_replay(p_actor,p_key,p_intent);if replay is not null then return replay;end if;
  approved:=public.research_catalog_approval_for_source(subject_identity,p_intent->>'sourceSha256',(p_intent->>'mediaId')::uuid,(p_evidence->>'mediaVersion')::integer);
  if approved is null or approved is distinct from p_evidence then raise exception 'publication_approval_required';end if;
  return public.research_catalog_publication_seal(p_actor,p_key,p_intent,p_evidence);
end; $$;
revoke all on function public.research_catalog_publication_seal_verified(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_publication_seal_verified(text,text,jsonb,jsonb) to service_role;

create function public.research_catalog_publication_transition_verified(p_actor text,p_key text,p_intent jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare subject_identity jsonb:=p_intent->'identity'; k text:=public.research_catalog_publication_key(subject_identity); replay jsonb; r public.research_catalog_publication_revisions%rowtype; approved jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  replay:=public.research_catalog_publication_replay(p_actor,p_key,p_intent);if replay is not null then return replay;end if;
  if p_intent->>'operation'='withdraw' then return public.research_catalog_publication_transition(p_actor,p_key,p_intent);end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-approval-owner:'||k,0));
  replay:=public.research_catalog_publication_replay(p_actor,p_key,p_intent);if replay is not null then return replay;end if;
  select * into r from public.research_catalog_publication_revisions where identity_key=k and id=(p_intent->>'revisionId')::uuid;
  if not found then raise exception 'publication_revision_mismatch';end if;
  approved:=public.research_catalog_approval_for_source(subject_identity,r.snapshot->>'sourceSha256',(r.snapshot#>>'{media,id}')::uuid,(r.snapshot#>>'{media,version}')::integer);
  if approved is null or approved is distinct from r.evidence then raise exception 'publication_approval_required';end if;
  return public.research_catalog_publication_transition(p_actor,p_key,p_intent);
end; $$;
revoke all on function public.research_catalog_publication_transition_verified(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_publication_transition_verified(text,text,jsonb) to service_role;
revoke all on function public.research_catalog_publication_seal(text,text,jsonb,jsonb),public.research_catalog_publication_transition(text,text,jsonb) from public,anon,authenticated,service_role;

alter table public.research_catalog_approval_owner_events enable row level security;
alter table public.research_catalog_approval_owner_events force row level security;
alter table public.research_catalog_approval_events enable row level security;
alter table public.research_catalog_approval_events force row level security;
revoke all on public.research_catalog_approval_owner_events,public.research_catalog_approval_events from public,anon,authenticated,service_role;

-- One STABLE backend call uses one snapshot for head, immutable revisions and
-- committed operations. It never substitutes the public current-media filter.
create function public.research_catalog_publication_admin_state(p_actor text,p_identity jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare k text:=public.research_catalog_publication_key(p_identity); result jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  if p_actor is null or p_actor<>trim(p_actor) or length(p_actor) not between 1 and 320 then
    raise exception 'publication_invalid_command';
  end if;
  with head as (
    select h.generation,h.current_revision from public.research_catalog_publication_heads h where h.identity_key=k
  ), chosen as (
    select r.id,r.created_at from public.research_catalog_publication_revisions r where r.identity_key=k
    order by (r.id=(select current_revision from head)) desc nulls last,r.created_at desc,r.id desc limit 50
  ), recent as (
    select o.operation,o.receipt,o.accepted_at,o.actor,o.operation_key from public.research_catalog_publication_operations o where o.identity_key=k
    order by o.accepted_at desc,o.actor,o.operation_key limit 50
  )
  select jsonb_build_object(
    'identity',p_identity,
    'generation',coalesce((select generation from head),0),
    'currentRevisionId',(select current_revision from head),
    'revisions',coalesce((select jsonb_agg(jsonb_build_object('revisionId',c.id,'previouslyPublished',exists(
      select 1 from public.research_catalog_publication_operations o where o.identity_key=k and o.operation in ('publish','rollback') and o.receipt->>'revisionId'=c.id::text
    )) order by c.created_at desc,c.id desc) from chosen c),'[]'::jsonb),
    'operations',coalesce((select jsonb_agg(jsonb_build_object('operation',r.operation,'revisionId',r.receipt->'revisionId','generation',r.receipt->'generation','at',r.accepted_at) order by r.accepted_at desc,r.actor,r.operation_key) from recent r),'[]'::jsonb),
    'historyTruncated',(select count(*)>50 from (select 1 from public.research_catalog_publication_revisions where identity_key=k limit 51) bounded_revisions)
      or (select count(*)>50 from (select 1 from public.research_catalog_publication_operations where identity_key=k limit 51) bounded_operations)
  ) into result;
  return result;
end; $$;
revoke all on function public.research_catalog_publication_admin_state(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_publication_admin_state(text,jsonb) to service_role;



-- BEGIN COMPONENT: exact owned sequence revoke candidate
-- PREPARED ONLY. Insert after selected authority DDL and BEFORE unchanged strict installation guard.
-- Resolve only the identity sequence owned by the selected new table/column.
DO $publication_owner_sequence_acl$
DECLARE sequence_schema text; sequence_name text;
BEGIN
 SELECT n.nspname,c.relname INTO sequence_schema,sequence_name
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.oid=pg_get_serial_sequence('public.research_catalog_approval_owner_events','sequence')::regclass
   AND c.relkind='S' AND n.nspname='public';
 IF sequence_name IS NULL THEN RAISE EXCEPTION 'publication_owner_sequence_missing'; END IF;
 EXECUTE format('REVOKE ALL ON SEQUENCE %I.%I FROM PUBLIC,anon,authenticated,service_role',sequence_schema,sequence_name);
END;
$publication_owner_sequence_acl$;


-- BEGIN COMPONENT: unchanged b677 strict publication guard
-- Additive installation postcondition only. No table/owner/approval rows written.
DO $publication_install_guard$
DECLARE failures integer; t text; row_total bigint; sequence_oid oid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'publication_install_privileged_owner_required';
 END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'research_catalog_publication_%' OR p.proname LIKE 'research_catalog_approval_%' OR p.proname='research_catalog_record_approval_owner'))<>19 THEN
  RAISE EXCEPTION 'publication_install_function_family_collision';
 END IF;
 WITH expected(signature,body_sha,definer,volatility,service_execute,language_name,return_type) AS (VALUES
('public.research_catalog_publication_key(jsonb)','04accf4cfe51c39921e4e700143248aa8cc22f01d80dde3872a9f2d9efce3dff',false,'i',false,'plpgsql','text'),
('public.research_catalog_publication_hash(jsonb)','6008f9e735a9416cedc78a362fd8b5d0367fa6fcea3bf5c6e86d73f78b5b8337',false,'i',false,'sql','text'),
('public.research_catalog_publication_backend_only()','5cdcc1c649ee3527f6dc90c554b7b998ca3bbbb8f21d4b1aef37d0d32e7dd8c9',false,'s',false,'plpgsql','void'),
('public.research_catalog_publication_append_only()','d7a9a350ebcb8e693c7792c4b976cfffc33dfb4d7995c92f477853b2f40e33bb',false,'v',false,'plpgsql','trigger'),
('public.research_catalog_publication_source(jsonb,uuid)','dc48941de652e6a356bb2d4138d8151d11a730c6963e95c09fc112aec60f561e',true,'v',true,'plpgsql','jsonb'),
('public.research_catalog_publication_replay(text,text,jsonb)','a4a8ac497f0a2de9d41ba6e7b2e27b08c519028458eb7162db4d80eb20b6d528',true,'v',true,'plpgsql','jsonb'),
('public.research_catalog_publication_revision(jsonb,uuid)','d66a881c87aa66ba33e99fee77e268e8a31a8165323d5af16a1b5f15a6da2317',true,'v',true,'plpgsql','jsonb'),
('public.research_catalog_publication_current(jsonb)','3a3e9cc3251dfc57aa2556499bffb9475599b8117e0122f685643c63cdb93735',true,'v',true,'plpgsql','jsonb'),
('public.research_catalog_publication_seal(text,text,jsonb,jsonb)','b6437fcafe38b1c88b7bc3dcc45146ec0240587fa4095d2e5ee84db665eb96e0',true,'v',false,'plpgsql','jsonb'),
('public.research_catalog_publication_transition(text,text,jsonb)','5f62c56ae114cb733bfc6be8f9411a68c969ae4335a52178f7241ef2ac24347d',true,'v',false,'plpgsql','jsonb'),
('public.research_catalog_record_approval_owner(jsonb,text,uuid,text,timestamptz,text)','90c6ffdae9b4998028bff830a177792bb6e87b82b5132ad3053128018c11de30',false,'v',false,'plpgsql','uuid'),
('public.research_catalog_approval_owner(text,jsonb)','a65dbf18f1b6a3ab14d906463d623e9394347106e87a8cd59363516613fe2547',true,'s',true,'plpgsql','jsonb'),
('public.research_catalog_approval_replay(text,text,jsonb)','f103efeabe1ba2dbfd7d481a87a39b0af562f4fd1916544301bdd3af9f6b377a',true,'s',true,'plpgsql','jsonb'),
('public.research_catalog_approval_for_source(jsonb,text,uuid,integer)','b6e8b1168a73fe6ec330cad268f2ef6cc0158410cdfb85d33f1481646cb69bdb',true,'s',true,'plpgsql','jsonb'),
('public.research_catalog_approval_state(text,jsonb)','40b1b42ae8746939a2f2d6bd5025cf2ea7707797eeabb9e96924cacb7342fd0b',true,'s',true,'plpgsql','jsonb'),
('public.research_catalog_approval_decide(text,text,jsonb,text)','99f949600f8d75970951ddbadac3a3aa656cc28fa8081bba9f812651c85f61d5',true,'v',true,'plpgsql','jsonb'),
('public.research_catalog_publication_seal_verified(text,text,jsonb,jsonb)','6aed59580bb5c54f53532ecb5f8010b0de878fe11fd80e6a130fb4f04f26bb52',true,'v',true,'plpgsql','jsonb'),
('public.research_catalog_publication_transition_verified(text,text,jsonb)','75283d857f62f3024a5459d47d722b0daf102dec6bf2f818c331ae54c4590f8b',true,'v',true,'plpgsql','jsonb'),
('public.research_catalog_publication_admin_state(text,jsonb)','668b763716f80a581449743e4826f276d70c078a5713b39d8e9d8b0fbd588233',true,'s',true,'plpgsql','jsonb')
 )
 SELECT count(*) INTO failures FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) LEFT JOIN pg_language l ON l.oid=p.prolang
 WHERE p.oid IS NULL OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM e.body_sha
 OR p.prosecdef IS DISTINCT FROM e.definer OR p.provolatile::text IS DISTINCT FROM e.volatility
 OR l.lanname IS DISTINCT FROM e.language_name OR format_type(p.prorettype,NULL) IS DISTINCT FROM e.return_type
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[] OR p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
 OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')
 OR has_function_privilege('service_role',p.oid,'EXECUTE') IS DISTINCT FROM e.service_execute
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>p.proowner AND NOT(e.service_execute AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role')));
 IF failures<>0 THEN RAISE EXCEPTION 'publication_install_function_postimage_mismatch'; END IF;
 FOREACH t IN ARRAY ARRAY['research_catalog_publication_revisions','research_catalog_publication_heads','research_catalog_publication_operations','research_catalog_approval_owner_events','research_catalog_approval_events'
 ] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)=current_user) THEN
   RAISE EXCEPTION 'publication_install_table_postimage_mismatch';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE n.nspname='public' AND c.relname=t AND a.grantee<>c.relowner) THEN
   RAISE EXCEPTION 'publication_install_unexpected_table_grant';
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO row_total;
  IF row_total<>0 THEN RAISE EXCEPTION 'publication_install_initial_rows_not_empty'; END IF;
 END LOOP;
 sequence_oid:=pg_get_serial_sequence('public.research_catalog_approval_owner_events','sequence')::regclass;
 IF sequence_oid IS NULL OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('S',c.relowner))) a WHERE c.oid=sequence_oid AND a.grantee<>c.relowner) THEN
  RAISE EXCEPTION 'publication_install_unexpected_sequence_grant';
 END IF;
END;
$publication_install_guard$;


-- BEGIN COMPONENT: new full foundation postimage
-- Additive full-foundation checks, separate from unchanged b677 publication guard.
DO $foundation_postimage$
DECLARE t text; total bigint; rights_count integer; failures integer;
BEGIN
 FOREACH t IN ARRAY ARRAY['research_products','research_product_facts','research_product_goals','research_product_guide_links','research_product_prohibited_claims','research_product_open_questions','research_supplement_candidates','research_product_content','research_product_variants','research_product_prices','research_product_media','research_product_admin_audit','research_catalog_publication_revisions','research_catalog_publication_heads','research_catalog_publication_operations','research_catalog_approval_owner_events','research_catalog_approval_events']::text[] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    AND c.relname=t AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND c.relowner=current_user::regrole)
  THEN RAISE EXCEPTION 'foundation_owned_forced_rls_missing:%',t; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO total;
  IF total<>0 THEN RAISE EXCEPTION 'foundation_no_product_or_authority_seed_allowed:%',t; END IF;
 END LOOP;
 SELECT count(*) INTO rights_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
 WHERE n.nspname='public' AND c.relname=ANY(ARRAY['research_products','research_product_facts','research_product_goals','research_product_guide_links','research_product_prohibited_claims','research_product_open_questions','research_supplement_candidates','research_product_content','research_product_variants','research_product_prices','research_product_media','research_product_admin_audit']::text[]) AND a.grantee='service_role'::regrole;
 IF rights_count<>33 THEN RAISE EXCEPTION 'foundation_canonical_33_rights_mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
 WHERE n.nspname='public' AND c.relname=ANY(ARRAY['research_products','research_product_facts','research_product_goals','research_product_guide_links','research_product_prohibited_claims','research_product_open_questions','research_supplement_candidates','research_product_content','research_product_variants','research_product_prices','research_product_media','research_product_admin_audit']::text[]) AND a.grantee<>c.relowner
 AND (a.grantee<>'service_role'::regrole OR a.is_grantable OR NOT (
  (c.relname=ANY(ARRAY['research_products','research_product_variants','research_product_prices','research_product_media','research_product_admin_audit']::text[]) AND a.privilege_type='SELECT') OR
  (NOT(c.relname=ANY(ARRAY['research_products','research_product_variants','research_product_prices','research_product_media','research_product_admin_audit']::text[])) AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')))))
 THEN RAISE EXCEPTION 'foundation_unexpected_canonical_table_privilege'; END IF;
 WITH expected(table_name,column_name,column_type) AS (VALUES ('research_products','id','uuid'),('research_products','active_state','boolean'),('research_products','admin_status','text'),('research_products','visibility_state','text'),('research_products','version','integer'),('research_product_variants','id','uuid'),('research_product_variants','product_id','uuid'),('research_product_variants','active','boolean'),('research_product_variants','status','text'),('research_product_variants','version','integer'),('research_product_content','product_id','uuid'),('research_product_content','section','text'),('research_product_content','body','text'),('research_product_media','id','uuid'),('research_product_media','product_id','uuid'),('research_product_media','version','integer'),('research_product_media','state','text'),('research_product_media','approved_by','text'),('research_product_media','approved_at','timestamp with time zone'),('research_product_media','storage_key','text'),('research_product_media','content_type','text'),('research_product_media','size_bytes','bigint'),('research_product_media','alt_text','text'),('research_product_admin_audit','id','uuid'),('research_product_admin_audit','product_id','uuid'),('research_product_admin_audit','entity_type','text'),('research_product_admin_audit','entity_id','uuid'),('research_product_admin_audit','action','text'),('research_product_admin_audit','actor','text'),('research_product_admin_audit','detail','text'),('research_product_admin_audit','before_state','jsonb'),('research_product_admin_audit','after_state','jsonb'),('research_product_admin_audit','occurred_at','timestamp with time zone'))
 SELECT count(*) INTO failures FROM expected e LEFT JOIN pg_class c ON c.relnamespace='public'::regnamespace AND c.relname=e.table_name
 LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=e.column_name AND a.attnum>0 AND NOT a.attisdropped
 WHERE a.attnum IS NULL OR format_type(a.atttypid,a.atttypmod)<>e.column_type;
 IF failures<>0 THEN RAISE EXCEPTION 'foundation_33_canonical_columns_missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='research-product-media-production'
 AND name='research-product-media-production' AND public=false AND file_size_limit=10485760
 AND allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp']::text[])
 THEN RAISE EXCEPTION 'foundation_private_bucket_configuration_mismatch'; END IF;
END;
$foundation_postimage$;

