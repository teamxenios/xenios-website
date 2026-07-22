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
