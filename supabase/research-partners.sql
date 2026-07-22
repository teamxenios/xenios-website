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
