-- ==========================================================================
-- XENIOS RESEARCH - TRACK B: COMMERCE ACTIVATION (migrations 20-26 + additions)
-- ==========================================================================
-- The commerce-only apply. Runs AFTER Track A
-- (supabase/production/research-track-a-private-platform.sql, migrations 9-19),
-- which itself runs after migrations 1-8 (already RUN in production).
-- Excludes ALL health-program and tracker tables (they are Track A and already
-- merged); this bundle is commerce only.
--
-- Contents, in order:
--   1. Migrations 20-26, verbatim from the reviewed full-production bundle
--      (catalog, inventory lots, orders, subscriptions, fulfillment, partners,
--      commission + store-credit ledgers).
--   2. research_idempotency_keys (durable commerce idempotency; the UNIQUE
--      (scope, key) constraint is the concurrency guarantee).
--   3. The Track B schema-fidelity additions (order approval and cancellation
--      evidence, research_order_shipments, claim notes, the store-credit
--      settlement partial unique index, the commission kind column).
--   4. Completions for the schema gaps the persistence stores document:
--      research_admin_queue_items, subscription price_version and
--      shipping_address_ref columns, store-credit expires_at column, and
--      append-only triggers extended to the two state-event trails.
--
-- Every statement is idempotent (create table/index/column if not exists, or
-- drop-trigger-if-exists immediately followed by create trigger), enables row
-- level security on every new table, and adds NO policy: access is
-- service-role only by design (the server uses the Supabase service role,
-- which bypasses RLS; no client role ever touches these tables). Adding a
-- public policy would be a security regression. No destructive DDL: no drop
-- table, no truncate, no delete from, no drop column.
--
-- Apply in the Supabase SQL Editor (production project) AFTER review, then run
-- research-track-b-verification.sql (every FAIL check must return zero rows).
-- Applying this schema does NOT enable commerce: every table sits inert until
-- the commerce flag, per-SKU eligibility, and the provider layer are turned on.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- MIGRATION 20: research-catalog.sql  (products + provenanced facts)
-- --------------------------------------------------------------------------

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

-- --------------------------------------------------------------------------
-- MIGRATION 21: research-inventory-lots.sql  (lots, quality docs, FEFO)
-- --------------------------------------------------------------------------

-- xenios research inventory, lots, and quality (Website 3, G7).
-- DRAFT, NOT RUN as of 2026-07-21. Run once in the Supabase SQL Editor. Safe to
-- re-run. RLS enabled, no public policies; server-only access.
--
-- Persists: server/research/inventory/lots.ts (InventoryLot, LotDisposition,
-- QualityDocuments, FEFO allocation, recall traceability).
--
-- THE RULE THIS SCHEMA ENCODES: a lot must EARN the right to ship. Unknown data is
-- never acceptable data. Shelf life is never invented, so an unknown expiry is null
-- and null blocks allocation rather than defaulting to fine.

create extension if not exists "pgcrypto";

create table if not exists public.research_inventory_lots (
  id                  uuid primary key default gen_random_uuid(),
  lot_id              text not null unique,
  sku                 text not null,
  owner               text not null check (owner in ('mitch','xenios')),

  disposition         text not null default 'quarantined'
                        check (disposition in ('available','allocated','picked','packed','shipped',
                                               'quarantined','quality_hold','temperature_hold',
                                               'damaged','expired','recalled','destroyed')),
  quantity_available  integer not null default 0 check (quantity_available >= 0),

  -- Nullable on purpose. Null means unknown, and unknown blocks allocation.
  manufactured_date   date,
  expiry_date         date,
  retest_date         date,
  shelf_life_source   text not null default 'not_confirmed'
                        check (shelf_life_source in ('supplier_document','coa','not_confirmed')),

  excursion           text not null default 'none'
                        check (excursion in ('none','pending_review','cleared','rejected')),
  recalled            boolean not null default false,
  recalled_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint research_lots_recalled_has_date
    check (recalled = false or recalled_at is not null)
);
create index if not exists research_lots_sku_idx on public.research_inventory_lots (sku);
-- FEFO reads earliest expiry first among allocatable lots, so this is the hot index.
create index if not exists research_lots_fefo_idx
  on public.research_inventory_lots (sku, expiry_date)
  where disposition = 'available' and recalled = false and expiry_date is not null;

-- Quality documents are per LOT, not per product. A COA covering a different lot proves
-- nothing about this one.
create table if not exists public.research_lot_quality_documents (
  id                   uuid primary key default gen_random_uuid(),
  lot_id               uuid not null references public.research_inventory_lots (id) on delete cascade,
  coa_on_file          boolean not null default false,
  identity_confirmed   boolean not null default false,
  purity_confirmed     boolean not null default false,
  -- Tri-state: null means not applicable to this format, false means required and
  -- absent. Collapsing them into a boolean would let "not applicable" read as "missing"
  -- or, far worse, let "missing" read as "fine".
  sterility_confirmed  boolean,
  endotoxin_confirmed  boolean,
  document_ref         text,
  recorded_at          timestamptz not null default now(),
  constraint research_lot_quality_documents_unique unique (lot_id)
);

create table if not exists public.research_lot_excursion_events (
  id          uuid primary key default gen_random_uuid(),
  lot_id      uuid not null references public.research_inventory_lots (id) on delete cascade,
  detected_at timestamptz not null default now(),
  detail      text not null,
  reviewed_by text,
  outcome     text check (outcome in ('cleared','rejected')),
  reviewed_at timestamptz
);
create index if not exists research_lot_excursion_open_idx
  on public.research_lot_excursion_events (lot_id) where reviewed_at is null;

create table if not exists public.research_lot_allocations (
  id             uuid primary key default gen_random_uuid(),
  lot_id         uuid not null references public.research_inventory_lots (id),
  order_id       uuid not null,
  quantity       integer not null check (quantity > 0),
  allocated_at   timestamptz not null default now(),
  released_at    timestamptz
);
create index if not exists research_lot_allocations_order_idx on public.research_lot_allocations (order_id);
create index if not exists research_lot_allocations_lot_idx on public.research_lot_allocations (lot_id);

-- Recall traceability runs FROM THE LOT, because a recall is lot-scoped. Recalling an
-- entire SKU would be both wrong and alarming.
create table if not exists public.research_lot_shipments (
  id          uuid primary key default gen_random_uuid(),
  lot_id      uuid not null references public.research_inventory_lots (id),
  order_id    uuid not null,
  member_id   uuid not null,
  shipped_at  timestamptz not null default now()
);
create index if not exists research_lot_shipments_lot_idx on public.research_lot_shipments (lot_id);
create index if not exists research_lot_shipments_order_idx on public.research_lot_shipments (order_id);

alter table public.research_inventory_lots           enable row level security;
alter table public.research_lot_quality_documents    enable row level security;
alter table public.research_lot_excursion_events     enable row level security;
alter table public.research_lot_allocations          enable row level security;
alter table public.research_lot_shipments            enable row level security;

-- --------------------------------------------------------------------------
-- MIGRATION 22: research-orders.sql  (carts, orders, refunds)
-- --------------------------------------------------------------------------

-- xenios research orders and carts (Website 3, G7). DRAFT, NOT RUN as of 2026-07-21.
-- Run once in the Supabase SQL Editor. Safe to re-run. RLS enabled, no public
-- policies; server-only access.
--
-- Persists: server/research/commerce/{cart,checkout,orders,refunds}.ts and the order
-- state machine in shared/research/commerce.ts.
--
-- TWO RULES THIS SCHEMA ENFORCES RATHER THAN TRUSTS:
--   1. Money is integer cents. No float, no numeric with scale, no money type.
--   2. Every idempotency key is UNIQUE at the database level. Idempotency enforced
--      only in application code is not idempotency under concurrency: two requests
--      can both pass an in-process check and both create an order.

create extension if not exists "pgcrypto";

create table if not exists public.research_carts (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_cart_lines (
  id                          uuid primary key default gen_random_uuid(),
  cart_id                     uuid not null references public.research_carts (id) on delete cascade,
  sku                         text not null,
  quantity                    integer not null check (quantity > 0 and quantity <= 1000),
  purchase_mode               text not null default 'one_time'
                                check (purchase_mode in ('one_time','subscription')),
  subscription_frequency_days integer
                                check (subscription_frequency_days in (30,60,90)),
  added_at                    timestamptz not null default now(),

  -- A subscription line must name a frequency, and a one-time line must not.
  constraint research_cart_lines_subscription_needs_frequency
    check ((purchase_mode = 'subscription') = (subscription_frequency_days is not null)),
  constraint research_cart_lines_unique_sku unique (cart_id, sku)
);
create index if not exists research_cart_lines_cart_idx on public.research_cart_lines (cart_id);

create table if not exists public.research_orders (
  id                      uuid primary key default gen_random_uuid(),
  member_id               uuid not null,
  state                   text not null default 'draft'
                            check (state in ('draft','checkout_pending','payment_authorized',
                                             'manual_review','approved','payment_captured',
                                             'processing','partially_fulfilled','fulfilled',
                                             'delivered','exception','cancelled','refunded','replaced')),
  subtotal_cents          bigint not null check (subtotal_cents >= 0),
  shipping_cents          bigint not null default 0 check (shipping_cents >= 0),
  store_credit_applied_cents bigint not null default 0 check (store_credit_applied_cents >= 0),
  total_cents             bigint not null check (total_cents >= 0),

  -- The amount the provider actually authorized, as the provider reported it. A capture
  -- may never exceed this, so a total recomputed upward after the hold cannot take more
  -- than the member agreed to.
  authorized_amount_cents bigint check (authorized_amount_cents >= 0),
  captured_amount_cents   bigint check (captured_amount_cents >= 0),
  refunded_cents          bigint not null default 0 check (refunded_cents >= 0),

  payment_reference       text,
  -- Client-supplied, so a retried submit cannot create a second order. UNIQUE per member.
  checkout_idempotency_key text,
  last_idempotency_key    text,

  review_triggers         text[] not null default '{}',
  placed_at               timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- A paid state requires provider evidence. Code cannot mark itself paid, and neither
  -- can a manual UPDATE that forgets to set the reference.
  constraint research_orders_paid_needs_provider_reference
    check (state not in ('payment_authorized','payment_captured','refunded')
           or payment_reference is not null),
  constraint research_orders_capture_within_authorization
    check (captured_amount_cents is null
           or authorized_amount_cents is null
           or captured_amount_cents <= authorized_amount_cents),
  constraint research_orders_refund_within_capture
    check (captured_amount_cents is null or refunded_cents <= captured_amount_cents),
  constraint research_orders_idempotency_unique unique (member_id, checkout_idempotency_key)
);
create index if not exists research_orders_member_idx on public.research_orders (member_id);
create index if not exists research_orders_state_idx on public.research_orders (state);
create index if not exists research_orders_review_idx
  on public.research_orders (created_at) where state = 'manual_review';

create table if not exists public.research_order_lines (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.research_orders (id) on delete cascade,
  sku              text not null,
  display_name     text not null,
  quantity         integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  fulfillment_owner text not null check (fulfillment_owner in ('mitch','xenios'))
);
create index if not exists research_order_lines_order_idx on public.research_order_lines (order_id);

-- Append-only state history. Every advance records who caused it and what proved it.
create table if not exists public.research_order_state_events (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.research_orders (id) on delete cascade,
  from_state          text not null,
  to_state            text not null,
  actor_type          text not null check (actor_type in ('member','admin','system','provider_webhook')),
  actor_id            text,
  provider_reference  text,
  idempotency_key     text,
  occurred_at         timestamptz not null default now()
);
create index if not exists research_order_state_events_order_idx
  on public.research_order_state_events (order_id, occurred_at);

-- Webhook replay protection. UNIQUE is the whole point: a replayed provider event
-- cannot be applied twice even if two instances race to handle it.
create table if not exists public.research_provider_webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider_name text not null,
  event_id      text not null,
  event_type    text not null,
  received_at   timestamptz not null default now(),
  constraint research_provider_webhook_events_unique unique (provider_name, event_id)
);

create table if not exists public.research_claims (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.research_orders (id),
  member_id      uuid not null,
  sku            text not null,
  lot_id         text,
  -- Founder policy: there are no ordinary returns. Only these five reasons exist.
  reason         text not null
                   check (reason in ('damaged','lost','incorrect','missing','temperature_concern')),
  state          text not null default 'submitted'
                   check (state in ('submitted','under_review','information_requested',
                                    'approved','declined','resolved')),
  resolution     text check (resolution in ('replacement','refund','partial_refund','none')),
  -- Opaque references only. No image bytes and no private media URLs cross this boundary.
  evidence_refs  text[] not null default '{}',
  reviewed_by    text,
  submitted_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists research_claims_member_idx on public.research_claims (member_id);
create index if not exists research_claims_open_idx
  on public.research_claims (submitted_at) where state not in ('resolved','declined');

-- Refund idempotency, durable on purpose. It lived in a per-process map, which stops
-- being idempotency the moment the service restarts or a second instance handles the
-- retry: the map is empty, the key looks new, and real money moves twice.
create table if not exists public.research_refund_keys (
  scope             text primary key,
  refund_reference  text not null,
  recorded_at       timestamptz not null default now()
);

alter table public.research_orders                   enable row level security;
alter table public.research_order_lines              enable row level security;
alter table public.research_order_state_events       enable row level security;
alter table public.research_carts                    enable row level security;
alter table public.research_cart_lines               enable row level security;
alter table public.research_provider_webhook_events  enable row level security;
alter table public.research_claims                   enable row level security;
alter table public.research_refund_keys              enable row level security;

-- --------------------------------------------------------------------------
-- MIGRATION 23: research-subscriptions.sql  (product subscriptions)
-- --------------------------------------------------------------------------

-- xenios research product subscriptions (Website 3, G7).
-- DRAFT, NOT RUN as of 2026-07-21. Run once in the Supabase SQL Editor. Safe to
-- re-run. RLS enabled, no public policies; server-only access.
--
-- Persists: the subscription state machine in shared/research/commerce.ts.
--
-- Note on discounts: subscription discount percentages remain admin-configurable and
-- are deliberately NOT modelled as a published permanent tier here, because unit
-- economics are not complete. A rate lives on the plan row and can change.

create extension if not exists "pgcrypto";

create table if not exists public.research_product_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null,
  sku                text not null,
  state              text not null default 'pending'
                       check (state in ('pending','active','paused','skip_scheduled',
                                        'rescheduled','payment_issue','cancelled')),
  frequency_days     integer not null check (frequency_days in (30,60,90)),
  quantity           integer not null check (quantity > 0 and quantity <= 1000),

  discount_basis_points integer not null default 0
                          check (discount_basis_points >= 0 and discount_basis_points <= 10000),

  next_charge_at     timestamptz,
  next_shipment_at   timestamptz,
  payment_reference  text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  cancelled_at       timestamptz,

  -- An active subscription needs a schedule. A cancelled one must not keep one, so a
  -- cancelled row cannot quietly continue charging.
  constraint research_subscriptions_active_has_schedule
    check (state <> 'active' or next_charge_at is not null),
  constraint research_subscriptions_cancelled_has_no_schedule
    check (state <> 'cancelled' or (next_charge_at is null and next_shipment_at is null)),
  constraint research_subscriptions_cancelled_has_date
    check (state <> 'cancelled' or cancelled_at is not null)
);
create index if not exists research_subscriptions_member_idx
  on public.research_product_subscriptions (member_id);
create index if not exists research_subscriptions_due_idx
  on public.research_product_subscriptions (next_charge_at) where state = 'active';

-- Append-only action history, so a pause, skip, or reschedule is auditable rather than
-- being an overwrite of the schedule columns.
create table if not exists public.research_subscription_events (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.research_product_subscriptions (id) on delete cascade,
  action          text not null
                    check (action in ('activate','pause','resume','skip','reschedule',
                                      'report_payment_issue','resolve_payment_issue','cancel')),
  from_state      text not null,
  to_state        text not null,
  actor_type      text not null check (actor_type in ('member','admin','system','provider_webhook')),
  actor_id        text,
  effective_at    timestamptz,
  occurred_at     timestamptz not null default now()
);
create index if not exists research_subscription_events_sub_idx
  on public.research_subscription_events (subscription_id, occurred_at);

alter table public.research_product_subscriptions enable row level security;
alter table public.research_subscription_events   enable row level security;

-- --------------------------------------------------------------------------
-- MIGRATION 24: research-fulfillment.sql  (split fulfillment, shipping)
-- --------------------------------------------------------------------------

-- xenios research fulfillment and shipping (Website 3, G7).
-- DRAFT, NOT RUN as of 2026-07-21. Run once in the Supabase SQL Editor. Safe to
-- re-run. RLS enabled, no public policies; server-only access.
--
-- Persists: server/research/providers/{fulfillment,shipping}.ts and the split
-- fulfillment grouping in server/research/inventory/lots.ts.
--
-- THE PRIVACY CONSTRAINT, STATED SO A LATER MIGRATION DOES NOT QUIETLY BREAK IT:
--
-- A fulfillment partner needs to put a box on a truck. It does NOT need to know that
-- the recipient has a health goal, an assessment, a Blueprint, a tracker history, a
-- referral relationship, or any other order they have ever placed.
--
-- Therefore NO column on research_fulfillment_orders may carry member health data,
-- assessment answers, blueprint content, tracker observations, referral codes, or
-- order history. The outbound payload is built from a fixed allowlist in application
-- code, and this table exists to persist exactly that allowlist and nothing wider.
-- Adding such a column here is a privacy regression, not a convenience.

create extension if not exists "pgcrypto";

create table if not exists public.research_fulfillment_orders (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null,
  owner                 text not null check (owner in ('mitch','xenios')),
  state                 text not null default 'pending'
                          check (state in ('pending','submitted','accepted','rejected','on_hold',
                                           'shipped','delivered','exception','cancelled')),
  hold_reason           text,

  -- Minimum shipping identity only.
  recipient_name        text not null,
  address_line1         text not null,
  address_line2         text,
  address_city          text not null,
  address_state         char(2) not null,
  address_postal_code   text not null,
  address_country       char(2) not null default 'US',
  -- Present ONLY when the chosen carrier service genuinely requires it, so a partner
  -- does not receive a phone number merely because xenios holds one.
  recipient_phone       text,

  shipping_service      text not null,
  handling_profile      text not null default 'not_confirmed'
                          check (handling_profile in ('ambient','cold_chain','not_confirmed')),

  partner_reference     text,
  transport_mode        text not null default 'manual_export'
                          check (transport_mode in ('manual_export','signed_csv','sftp','api')),
  submitted_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Shipping without a confirmed storage decision is a safety failure, not a default.
  constraint research_fulfillment_shipped_needs_handling
    check (state not in ('shipped','delivered') or handling_profile <> 'not_confirmed'),
  constraint research_fulfillment_unique_owner_per_order unique (order_id, owner)
);
create index if not exists research_fulfillment_order_idx on public.research_fulfillment_orders (order_id);
create index if not exists research_fulfillment_open_idx
  on public.research_fulfillment_orders (created_at)
  where state in ('pending','submitted','on_hold','exception');

create table if not exists public.research_fulfillment_lines (
  id                    uuid primary key default gen_random_uuid(),
  fulfillment_order_id  uuid not null references public.research_fulfillment_orders (id) on delete cascade,
  sku                   text not null,
  quantity              integer not null check (quantity > 0),
  lot_id                text
);
create index if not exists research_fulfillment_lines_order_idx
  on public.research_fulfillment_lines (fulfillment_order_id);

create table if not exists public.research_shipments (
  id                    uuid primary key default gen_random_uuid(),
  fulfillment_order_id  uuid not null references public.research_fulfillment_orders (id) on delete cascade,
  carrier               text,
  tracking_number       text,
  service               text,
  shipped_at            timestamptz,
  estimated_delivery    date,
  delivered_at          timestamptz,
  exception_detail      text,
  created_at            timestamptz not null default now()
);
create index if not exists research_shipments_tracking_idx
  on public.research_shipments (tracking_number) where tracking_number is not null;

-- Quote provenance is persisted, because a configured fallback rate must never be
-- presented to a member as if a carrier returned it.
create table if not exists public.research_shipping_quotes (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null,
  kind                   text not null check (kind in ('configured_fallback','live_carrier_quote')),
  service                text not null check (service in ('standard','expedited_2day','next_day',
                                                          'same_day','temperature_controlled')),
  amount_cents           bigint not null check (amount_cents >= 0),
  -- Null whenever no carrier confirmed a window. A delivery date is never invented.
  earliest_delivery_days integer,
  latest_delivery_days   integer,
  disclosure             text not null,
  quoted_at              timestamptz not null default now(),

  constraint research_shipping_quotes_fallback_has_no_promise
    check (kind <> 'configured_fallback'
           or (earliest_delivery_days is null and latest_delivery_days is null))
);
create index if not exists research_shipping_quotes_order_idx on public.research_shipping_quotes (order_id);

create table if not exists public.research_shipping_profiles (
  id                    uuid primary key default gen_random_uuid(),
  sku                   text not null unique,
  requires_cold_chain   boolean not null default false,
  validated             boolean not null default false,
  validation_document   text,
  notes                 text,
  updated_at            timestamptz not null default now(),

  -- A temperature-controlled claim requires a validated service and a document.
  constraint research_shipping_profiles_cold_chain_needs_validation
    check (requires_cold_chain = false or (validated = true and validation_document is not null))
);

alter table public.research_fulfillment_orders  enable row level security;
alter table public.research_fulfillment_lines   enable row level security;
alter table public.research_shipments           enable row level security;
alter table public.research_shipping_quotes     enable row level security;
alter table public.research_shipping_profiles   enable row level security;

-- --------------------------------------------------------------------------
-- MIGRATION 25: research-partners.sql  (partners, training, attribution)
-- --------------------------------------------------------------------------

-- xenios research partners, attribution, and organizations (Website 3, G8).
-- DRAFT, NOT RUN as of 2026-07-21. Run once in the Supabase SQL Editor. Safe to
-- re-run. RLS enabled, no public policies; server-only access.
--
-- Persists: server/research/partners/{partners,attribution,organizations}.ts and the
-- partner contract in shared/research/distribution.ts.
--
-- TWO FOUNDER RULES, ENCODED HERE SO A LATER MIGRATION CANNOT ADD THEM BACK CASUALLY:
--
--   1. NO RECURSIVE DOWNLINE. There is deliberately NO parent_partner_id, sponsor_id,
--      upline_id, tier, or level column anywhere in this file. A multi-level
--      compensation structure must be impossible to express, not merely discouraged.
--   2. NO COMPENSATION FOR RECRUITING. There is no recruitment event type and no signup
--      bonus table. Commission derives only from eligible net revenue on an attributed
--      order, which lives in research-commission-ledger.sql.

create extension if not exists "pgcrypto";

create table if not exists public.research_partners (
  id                     uuid primary key default gen_random_uuid(),
  -- The member who owns this partner account. Routes resolve the partner FROM the
  -- authenticated member, never from a client-supplied partner id.
  member_id              uuid not null unique,
  role                   text not null
                           check (role in ('member_referral','affiliate','research_rep',
                                           'senior_research_rep','organization_partner',
                                           'private_community_partner','professional_partner',
                                           'future_wholesale','future_institutional')),
  state                  text not null default 'application'
                           check (state in ('application','identity_verification_pending',
                                            'tax_status_pending','payout_status_pending',
                                            'agreement_pending','training_pending',
                                            'certification_pending','active','quality_review',
                                            'suspended','terminated')),
  legal_name             text not null,
  contact_email          text not null,
  -- Written for Samuel, never serialized to the partner. The route layer builds a
  -- partner-facing DTO by explicit construction and this column is not in it.
  internal_notes         text,

  identity_verified      boolean not null default false,
  tax_status             text not null default 'not_started'
                           check (tax_status in ('not_started','submitted','verified','rejected')),
  payout_status          text not null default 'not_started'
                           check (payout_status in ('not_started','submitted','verified','rejected')),

  certified_at           timestamptz,
  certified_by_admin_id  text,
  activated_at           timestamptz,
  activated_by_admin_id  text,
  applied_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- Activation is a named human decision, so it cannot exist without the admin who made it.
  constraint research_partners_activation_names_an_admin
    check (activated_at is null or activated_by_admin_id is not null),
  constraint research_partners_certification_names_an_admin
    check (certified_at is null or certified_by_admin_id is not null),
  -- An active partner must have cleared every gate.
  constraint research_partners_active_is_fully_gated
    check (state <> 'active'
           or (identity_verified = true
               and tax_status = 'verified'
               and payout_status = 'verified'
               and certified_at is not null
               and activated_at is not null))
);
create index if not exists research_partners_state_idx on public.research_partners (state);

create table if not exists public.research_partner_agreements (
  id                 uuid primary key default gen_random_uuid(),
  partner_id         uuid not null references public.research_partners (id) on delete cascade,
  agreement_key      text not null,
  agreement_version  text not null,
  content_hash       text not null,
  decision           text not null default 'accepted' check (decision in ('accepted','declined')),
  decided_at         timestamptz not null default now(),
  constraint research_partner_agreements_unique unique (partner_id, agreement_key, agreement_version)
);

-- Append-only. A superseded module version is RETAINED, not deleted, because deleting
-- it destroys the evidence of what the partner took and when.
create table if not exists public.research_partner_training (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.research_partners (id) on delete cascade,
  module_key     text not null
                   check (module_key in ('xenios_membership','privacy_and_sensitive_data',
                                         'product_lanes','ftc_disclosures','claims_restrictions',
                                         'no_diagnosis_or_dosing','lead_handling',
                                         'telegram_boundaries','product_concerns','fraud',
                                         'brand_and_content','organizations','events','security')),
  module_version text not null,
  completed_at   timestamptz not null default now(),
  constraint research_partner_training_unique unique (partner_id, module_key, module_version)
);
create index if not exists research_partner_training_partner_idx
  on public.research_partner_training (partner_id);

create table if not exists public.research_partner_lifecycle_events (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.research_partners (id) on delete cascade,
  from_state  text not null,
  to_state    text not null,
  -- May contain a suspension or termination reason. Founder-facing only.
  detail      text,
  actor_id    text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists research_partner_lifecycle_partner_idx
  on public.research_partner_lifecycle_events (partner_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Attribution
-- ---------------------------------------------------------------------------

create table if not exists public.research_partner_links (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.research_partners (id) on delete cascade,
  code        text not null unique,
  channel     text not null check (channel in ('signed_link','code','qr','campaign',
                                               'organization','event','manual')),
  campaign    text,
  organization_id uuid,
  event_id    uuid,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create index if not exists research_partner_links_partner_idx on public.research_partner_links (partner_id);

-- The subject key is an opaque, non-reversible identifier for a visitor. A partner
-- learns that a conversion happened, never who it was, so no applicant email, name, or
-- rejection reason may be stored on these rows.
create table if not exists public.research_attribution_touches (
  id           uuid primary key default gen_random_uuid(),
  subject_key  text not null,
  partner_id   uuid not null references public.research_partners (id),
  channel      text not null check (channel in ('signed_link','code','qr','campaign',
                                                'organization','event','manual')),
  set_by_admin_id text,
  occurred_at  timestamptz not null default now(),
  -- Manual attribution overrides the automatic result, so it must name the admin.
  constraint research_attribution_manual_names_an_admin
    check (channel <> 'manual' or set_by_admin_id is not null)
);
create index if not exists research_attribution_subject_idx
  on public.research_attribution_touches (subject_key, occurred_at);

-- One conversion has one winner. UNIQUE on order_id is what makes that true under
-- concurrency rather than only in application code.
create table if not exists public.research_attribution_conversions (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique,
  partner_id    uuid not null references public.research_partners (id),
  subject_key   text not null,
  model         text not null default 'last_touch' check (model in ('first_touch','last_touch')),
  converted_at  timestamptz not null default now()
);
create index if not exists research_attribution_conversions_partner_idx
  on public.research_attribution_conversions (partner_id);

-- ---------------------------------------------------------------------------
-- Organizations and events
-- ---------------------------------------------------------------------------

create table if not exists public.research_organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  owner_partner_id uuid not null references public.research_partners (id),
  state        text not null default 'active' check (state in ('active','suspended','terminated')),
  created_at   timestamptz not null default now()
);

create table if not exists public.research_organization_representatives (
  organization_id uuid not null references public.research_organizations (id) on delete cascade,
  partner_id      uuid not null references public.research_partners (id) on delete cascade,
  added_at        timestamptz not null default now(),
  primary key (organization_id, partner_id)
);

create table if not exists public.research_organization_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.research_organizations (id) on delete cascade,
  name            text not null,
  campaign        text,
  starts_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists research_org_events_org_idx on public.research_organization_events (organization_id);

-- RSVPs carry an opaque subject key only. A pasted member name must never land here.
create table if not exists public.research_organization_rsvps (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.research_organization_events (id) on delete cascade,
  subject_key  text not null,
  rsvped_at    timestamptz not null default now(),
  -- An opaque key contains no whitespace, which is the cheapest structural guard
  -- against a pasted human name reaching an organization record.
  constraint research_rsvp_subject_key_is_opaque check (subject_key !~ '\s'),
  constraint research_rsvp_unique unique (event_id, subject_key)
);

create table if not exists public.research_content_assets (
  id                 uuid primary key default gen_random_uuid(),
  partner_id         uuid not null references public.research_partners (id) on delete cascade,
  version            integer not null default 1 check (version > 0),
  title              text not null,
  body               text not null,
  state              text not null default 'submitted'
                       check (state in ('submitted','preapproved','rejected','expired','withdrawn')),
  approved_claims    text[] not null default '{}',
  prohibited_claims  text[] not null default '{}',
  disclosure         text,
  approved_by_admin_id text,
  expires_at         timestamptz,
  created_at         timestamptz not null default now(),

  -- An approved asset must name its approver, carry a disclosure, and expire. A
  -- testimonial cannot make a claim xenios could not make directly, and an approval
  -- that never expires is an approval nobody revisits.
  constraint research_content_preapproved_is_complete
    check (state <> 'preapproved'
           or (approved_by_admin_id is not null and disclosure is not null and expires_at is not null)),
  constraint research_content_unique_version unique (partner_id, title, version)
);
create index if not exists research_content_assets_partner_idx on public.research_content_assets (partner_id);

create table if not exists public.research_content_violations (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references public.research_partners (id) on delete cascade,
  asset_id      uuid references public.research_content_assets (id),
  kind          text not null,
  detail        text not null,
  outcome       text not null default 'recorded'
                  check (outcome in ('recorded','correction_required','suspended')),
  recorded_by_admin_id text not null,
  recorded_at   timestamptz not null default now()
);
create index if not exists research_content_violations_partner_idx
  on public.research_content_violations (partner_id, recorded_at);

alter table public.research_partners                     enable row level security;
alter table public.research_partner_agreements           enable row level security;
alter table public.research_partner_training             enable row level security;
alter table public.research_partner_lifecycle_events     enable row level security;
alter table public.research_partner_links                enable row level security;
alter table public.research_attribution_touches          enable row level security;
alter table public.research_attribution_conversions      enable row level security;
alter table public.research_organizations                enable row level security;
alter table public.research_organization_representatives enable row level security;
alter table public.research_organization_events          enable row level security;
alter table public.research_organization_rsvps           enable row level security;
alter table public.research_content_assets               enable row level security;
alter table public.research_content_violations           enable row level security;

-- --------------------------------------------------------------------------
-- MIGRATION 26: research-commission-ledger.sql  (commission + credit ledgers)
-- --------------------------------------------------------------------------

-- xenios research commission and store-credit ledgers (Website 3, G8).
-- DRAFT, NOT RUN as of 2026-07-21. Run once in the Supabase SQL Editor. Safe to
-- re-run. RLS enabled, no public policies; server-only access.
--
-- Persists: server/research/partners/commissions.ts, server/research/providers/payout.ts,
-- and the ledger states in shared/research/distribution.ts.
--
-- THE DEFINING PROPERTY: these ledgers are APPEND-ONLY, enforced by trigger rather
-- than by convention. A correction is a NEW row referencing the original. Balances are
-- derived by summing rows, never stored as a mutable running total, so there is no
-- number an UPDATE could quietly change.

create extension if not exists "pgcrypto";

create table if not exists public.research_commission_ledger (
  id                  uuid primary key default gen_random_uuid(),
  partner_id          uuid not null,
  order_id            uuid not null,
  state               text not null default 'pending'
                        check (state in ('pending','held','approved','payable','paid',
                                         'reversed','disputed','forfeited')),

  -- Integer cents throughout. Rounding is DOWN in application code, so a fraction of a
  -- cent is never invented in the partner's favour.
  eligible_net_cents  bigint not null check (eligible_net_cents >= 0),
  basis_points        integer not null check (basis_points >= 0 and basis_points <= 10000),
  amount_cents        bigint not null check (amount_cents >= 0),

  -- A reversal is a new row pointing at what it reverses, never an edit.
  reverses_ledger_id  uuid references public.research_commission_ledger (id),
  -- The refund or chargeback reference that caused a reversal, so a replayed refund
  -- webhook cannot reverse the same commission twice.
  source_reference    text,

  -- Proof that money actually settled. A row cannot claim paid without it.
  payout_batch_id     uuid,
  payout_reference    text,

  actor_type          text not null default 'system'
                        check (actor_type in ('admin','system')),
  actor_id            text,
  created_at          timestamptz not null default now(),

  constraint research_commission_paid_needs_proof
    check (state <> 'paid' or (payout_reference is not null and payout_batch_id is not null)),
  constraint research_commission_reversal_needs_target
    check (reverses_ledger_id is null or state = 'reversed')
);
create index if not exists research_commission_partner_idx
  on public.research_commission_ledger (partner_id, created_at);
create index if not exists research_commission_order_idx
  on public.research_commission_ledger (order_id);
-- One live accrual per order. A re-attribution must reverse the losing chain before a
-- new partner can accrue, so this partial index refuses a second live accrual outright.
create unique index if not exists research_commission_one_live_accrual_per_order
  on public.research_commission_ledger (order_id)
  where state in ('pending','held','approved','payable','paid');

create table if not exists public.research_store_credit_ledger (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null,
  amount_cents bigint not null,
  state        text not null default 'pending'
                 check (state in ('pending','held','approved','reversed','fraud_flagged')),
  reason       text not null
                 check (reason in ('referral_new_member','referral_referrer',
                                   'service_recovery','manual_adjustment')),
  -- A 14 day hold before referral credit approves, per the founder decision.
  available_at timestamptz,
  reverses_id  uuid references public.research_store_credit_ledger (id),
  actor_type   text not null default 'system' check (actor_type in ('admin','system')),
  actor_id     text,
  created_at   timestamptz not null default now()
);
create index if not exists research_store_credit_member_idx
  on public.research_store_credit_ledger (member_id, created_at);
-- Spendable balance counts approved rows only, so this index serves the hot query.
create index if not exists research_store_credit_spendable_idx
  on public.research_store_credit_ledger (member_id) where state = 'approved';

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
--
-- A financial ledger that can be edited is not a ledger. Blocking UPDATE and DELETE at
-- the database means an application bug, a migration, or a hand-run statement cannot
-- rewrite history. Corrections must be new rows, which is what makes the trail auditable.

create or replace function public.research_ledger_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'ledger % is append only. Record a new row that references the original instead of % on row %.',
    tg_table_name, tg_op, old.id;
end;
$$;

drop trigger if exists research_commission_ledger_no_update on public.research_commission_ledger;
create trigger research_commission_ledger_no_update
  before update or delete on public.research_commission_ledger
  for each row execute function public.research_ledger_is_append_only();

drop trigger if exists research_store_credit_ledger_no_update on public.research_store_credit_ledger;
create trigger research_store_credit_ledger_no_update
  before update or delete on public.research_store_credit_ledger
  for each row execute function public.research_ledger_is_append_only();

-- ---------------------------------------------------------------------------
-- Payouts
-- ---------------------------------------------------------------------------
--
-- No live payout exists. The provider defaults to disabled and the real adapter is a
-- shell, so these tables hold batches that were built and never sent.

create table if not exists public.research_payout_batches (
  id                uuid primary key default gen_random_uuid(),
  partner_id        uuid not null,
  total_cents       bigint not null check (total_cents >= 0),
  state             text not null default 'built'
                      check (state in ('built','submitted','settled','failed','cancelled')),
  provider_name     text not null default 'disabled',
  provider_reference text,
  -- Entries excluded from the batch and why, so an operator can see what was held back.
  excluded_reasons  text[] not null default '{}',
  built_at          timestamptz not null default now(),
  settled_at        timestamptz,

  constraint research_payout_settled_needs_reference
    check (state <> 'settled' or provider_reference is not null)
);
create index if not exists research_payout_batches_partner_idx
  on public.research_payout_batches (partner_id, built_at);

create table if not exists public.research_payout_attempts (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.research_payout_batches (id),
  attempt_no    integer not null check (attempt_no > 0),
  outcome       text not null check (outcome in ('disabled','misconfigured','rejected',
                                                 'retryable','permanent_failure','settled')),
  provider_code text,
  attempted_at  timestamptz not null default now(),
  constraint research_payout_attempts_unique unique (batch_id, attempt_no)
);

alter table public.research_commission_ledger   enable row level security;
alter table public.research_store_credit_ledger enable row level security;
alter table public.research_payout_batches      enable row level security;
alter table public.research_payout_attempts     enable row level security;

-- --------------------------------------------------------------------------
-- TRACK B ADDITION: research-idempotency-keys.sql  (durable commerce idempotency)
-- --------------------------------------------------------------------------

-- ==========================================================================
-- MIGRATION (Track B commerce): research-idempotency-keys
-- ==========================================================================
-- Durable idempotency for commerce operations. The UNIQUE (scope, key)
-- constraint is what makes SupabaseIdempotencyStore concurrency-safe across
-- instances: exactly one reservation wins, everyone else replays the stored
-- result. Idempotency in application code alone is not idempotency under
-- concurrency.
--
-- Additive, idempotent, RLS-on. Server-only: reached exclusively through the
-- service_role admin client (which bypasses RLS); no policies, so no anon or
-- authenticated role can read or write it. DRAFT, NOT RUN. Do not apply during
-- Track A. Part of the Track B commerce migration set.
-- ==========================================================================

create table if not exists public.research_idempotency_keys (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null,
  key         text not null,
  result      jsonb,
  created_at  timestamptz not null default now(),
  settled_at  timestamptz,
  constraint research_idempotency_keys_scope_key_unique unique (scope, key)
);

create index if not exists research_idempotency_keys_created_idx
  on public.research_idempotency_keys (created_at desc);

alter table public.research_idempotency_keys enable row level security;

-- --------------------------------------------------------------------------
-- TRACK B ADDITION: research-track-b-fidelity.sql  (waves 14+15 schema fidelity)
-- --------------------------------------------------------------------------

-- xenios research Track B schema fidelity (waves 14+15). DRAFT, NOT RUN as of 2026-07-22.
-- Run once in the Supabase SQL Editor. Safe to re-run (create-if-not-exists and
-- add-column-if-not-exists only; NO destructive DDL). RLS enabled, no public
-- policies; server-only access.
--
-- Closes the round-trip fidelity gaps the wave 14 persistence audit named: the
-- domain OrderRecord (server/research/commerce/orders.ts) carries shipments,
-- approved_by, approved_at, cancellation_reason, and authorization_release_failed,
-- and ClaimRecord (server/research/commerce/refunds.ts) carries notes, none of
-- which the original tables could store. Without these columns the Supabase
-- stores silently dropped operator data the in-memory reference kept.
--
-- Shipments get a PROPER TYPED CHILD TABLE, not an untyped json column: the
-- domain shape is structured (owner, status, tracking, carrier), so the database
-- should hold the owner check and keep the rows queryable, exactly as
-- research_order_lines does for lines. Rows are current-state (replaced together
-- on save by the store), ordered by seq so the domain array order survives.

-- Order approval, cancellation, and authorization-release evidence. All nullable:
-- null means the service never set the field, and the store reads null back as
-- the absent optional key.
alter table public.research_orders add column if not exists approved_by text;
alter table public.research_orders add column if not exists approved_at timestamptz;
alter table public.research_orders add column if not exists cancellation_reason text;
alter table public.research_orders add column if not exists authorization_release_failed boolean;

-- One row per shipment of an order. seq preserves the domain array order and is
-- unique per order so a replace-on-save can never interleave two generations.
create table if not exists public.research_order_shipments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.research_orders (id) on delete cascade,
  seq             integer not null check (seq >= 0),
  owner           text not null check (owner in ('mitch','xenios')),
  status          text not null,
  tracking_number text,
  carrier         text,
  created_at      timestamptz not null default now(),
  constraint research_order_shipments_unique_seq unique (order_id, seq)
);
create index if not exists research_order_shipments_order_idx
  on public.research_order_shipments (order_id, seq);

-- Claim operator notes (the member's submitted detail, or a reviewer note).
-- Nullable so pre-migration rows read back as ''; the store writes the string.
alter table public.research_claims add column if not exists notes text;

alter table public.research_order_shipments enable row level security;

-- One settlement per store-credit entry, enforced by the DATABASE rather than
-- the store's read-then-insert application check (closes store-credit schema
-- gap 2): at most one row may reference a given entry via reverses_id, so two
-- concurrent approvals (or reverses) of one credit cannot both insert and
-- double the member's balance. Partial so ordinary issue rows (null) are free.
create unique index if not exists research_store_credit_settlement_unique
  on public.research_store_credit_ledger (reverses_id)
  where reverses_id is not null;

-- Commission chain fidelity: migration 26 stored no kind, so read-back derived
-- an entry's kind purely from sort position, which misreads the ledger when two
-- rows share a created_at millisecond (the accrual can reload as a "reversal"
-- and zero the partner's outstanding balance). Store the kind the service
-- wrote; nullable so pre-migration rows keep the positional fallback.
alter table public.research_commission_ledger add column if not exists kind text
  check (kind is null or kind in ('accrual', 'transition', 'reversal'));

-- --------------------------------------------------------------------------
-- TRACK B COMPLETION 1: research_admin_queue_items  (persisted admin queue)
-- --------------------------------------------------------------------------

-- Closes the schema gap named in
-- server/research/commerce/persistence/admin-queues-store.ts: explicit queue
-- items (payment_review, manual escalations, recall acknowledgements) persist
-- here, while most queue kinds stay DERIVED from the owning domain tables so
-- the queue can never disagree with the domain.
--
-- Summaries are built from an ALLOWLIST of fields in application code. No
-- recipient name, no address, no phone, no health data ever enters a queue
-- item; source_ref is an opaque pointer ("order:<id>", "lot:<id>",
-- "payment:<ref>"). Ownership is operational (admin/system actor columns),
-- not member-tenant, by design: this is Samuel's work queue, not member data.
--
-- History is never deleted (the store port has no delete method). A resolution
-- is a terminal status transition stamped with actor and timestamp; the two
-- check constraints make a half-stamped resolution or a pre-resolved open row
-- unrepresentable at rest.

create table if not exists public.research_admin_queue_items (
  id                    uuid primary key default gen_random_uuid(),
  kind                  text not null
                          check (kind in ('large_order_review','payment_review','refund_review',
                                          'replacement_review','supplier_document_review',
                                          'inventory_release','fulfillment_failure',
                                          'payout_review','fraud_review','recall_response')),
  -- Stable pointer at the source, e.g. "order:<id>", "lot:<id>", "payment:<ref>".
  source_ref            text not null,
  -- Built from allowlisted fields only. Never free text from a member.
  summary               text not null,
  status                text not null default 'open'
                          check (status in ('open','resolved','dismissed')),
  opened_at             timestamptz not null default now(),
  opened_by_actor_type  text not null default 'system'
                          check (opened_by_actor_type in ('admin','system')),
  opened_by_actor_id    text,
  resolved_at           timestamptz,
  resolved_by_actor_id  text,
  resolution            text,

  -- A closed item must be fully stamped: who, when, and what was decided.
  constraint research_admin_queue_items_resolution_is_stamped
    check (status = 'open'
           or (resolved_at is not null and resolved_by_actor_id is not null
               and resolution is not null)),
  -- An open item must carry no resolution fields, so enqueue cannot smuggle one in.
  constraint research_admin_queue_items_open_is_unresolved
    check (status <> 'open'
           or (resolved_at is null and resolved_by_actor_id is null and resolution is null))
);
-- The hot read: open items of one kind, oldest first.
create index if not exists research_admin_queue_items_open_idx
  on public.research_admin_queue_items (kind, opened_at) where status = 'open';

alter table public.research_admin_queue_items enable row level security;

-- --------------------------------------------------------------------------
-- TRACK B COMPLETION 2: subscription price_version + shipping_address_ref
-- --------------------------------------------------------------------------

-- Closes the schema gap named in
-- server/research/commerce/persistence/subscriptions-store.ts: the domain
-- SubscriptionRecord carries priceVersion and shippingAddressRef, which
-- migration 23 could not store (they round-tripped as "" and null). Both
-- nullable: null reads back as the pre-migration default, never invented.
-- price_version is the catalog price version quoted at subscribe time;
-- shipping_address_ref is an opaque reference, never an address itself.

alter table public.research_product_subscriptions
  add column if not exists price_version text;
alter table public.research_product_subscriptions
  add column if not exists shipping_address_ref text;

-- --------------------------------------------------------------------------
-- TRACK B COMPLETION 3: store-credit expires_at
-- --------------------------------------------------------------------------

-- Closes schema gap 1 named in
-- server/research/commerce/persistence/store-credit-store.ts: the in-memory
-- store supports an expiry written at issue time, and the Supabase store
-- REFUSES to persist a record carrying one while this column is missing
-- (silently dropping an expiry would make credit immortal). Nullable: null
-- means the credit does not expire. Set at issue time or never; the
-- append-only trigger below already blocks any later edit.

alter table public.research_store_credit_ledger
  add column if not exists expires_at timestamptz;

-- --------------------------------------------------------------------------
-- TRACK B COMPLETION 4: append-only enforcement on the state-event trails
-- --------------------------------------------------------------------------

-- Migration 26 enforces append-only by trigger on the two MONEY ledgers.
-- The two state-event trails (order state events, subscription events) carry
-- the same audit burden and their stores only ever INSERT
-- (orders-store.ts and subscriptions-store.ts both wire no update or delete
-- path), so the database now enforces what the code already promises: history
-- is never rewritten. Reuses migration 26's research_ledger_is_append_only().
--
-- Deliberate consequence: because both tables reference their parent with
-- on delete cascade, a parent order or subscription that has history can no
-- longer be deleted (the cascade would fire these triggers). That is intended:
-- an audit trail outlives convenience deletes, and no application path deletes
-- those parents anyway.

drop trigger if exists research_order_state_events_no_update on public.research_order_state_events;
create trigger research_order_state_events_no_update
  before update or delete on public.research_order_state_events
  for each row execute function public.research_ledger_is_append_only();

drop trigger if exists research_subscription_events_no_update on public.research_subscription_events;
create trigger research_subscription_events_no_update
  before update or delete on public.research_subscription_events
  for each row execute function public.research_ledger_is_append_only();
