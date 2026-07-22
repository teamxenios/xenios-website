-- xenios research founding-membership activation: payment-method registry and
-- the 14 day manual external payment bridge. DRAFT, NOT RUN as of 2026-07-22.
--
-- Run once in the Supabase SQL Editor. Safe to re-run: create-if-not-exists
-- only, the sole "drop" statements are drop-trigger-if-exists immediately
-- followed by create trigger, and there is NO destructive DDL. RLS is enabled
-- on every table with NO policies, so only the server's service-role key can
-- touch these rows; nothing is reachable from a browser.
--
-- SECRECY POSTURE. receiving_instructions_enc holds CIPHERTEXT ONLY (AES-GCM,
-- encrypted server-side through the injected cipher seam keyed from the
-- environment variable PAYMENT_INSTRUCTIONS_ENC_KEY). No plaintext receiving
-- identifier (phone, email, handle, cash tag, account or routing number) ever
-- lands in this schema, in this file, or in any seed data. The masked variant
-- is derived server-side before insert and is served only post-auth.
--
-- Provisioning these tables does NOT enable anything. Every surface sits
-- behind the default-false flag RESEARCH_FOUNDING_ACTIVATION_ENABLED, and a
-- method row additionally starts disabled and pending_review.

-- ---------------------------------------------------------------------------
-- The payment-method registry (provider neutral; phase A category is
-- manual_external_payment, phase B adds real merchant categories by config)
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_payment_methods (
  id                              uuid primary key default gen_random_uuid(),
  tenant                          text not null default 'xenios',
  method_id                       text not null unique,
  provider_code                   text not null,
  category                        text not null default 'manual_external_payment'
                                    check (category in ('manual_external_payment')),
  member_facing_name              text not null,
  admin_facing_name               text not null,
  -- Enabled only through a recorded approval; created disabled.
  enabled                         boolean not null default false,
  duration                        text not null check (duration in ('temporary', 'permanent')),
  active_start_at                 timestamptz,
  active_end_at                   timestamptz,
  currency                        text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  activation_eligible             boolean not null default false,
  renewal_eligible                boolean not null default false,
  -- The bridge never buys product. Default false, and for the manual external
  -- category the database refuses true outright.
  product_eligible                boolean not null default false,
  min_amount_cents                integer check (min_amount_cents is null or min_amount_cents >= 0),
  max_amount_cents                integer check (max_amount_cents is null or max_amount_cents > 0),
  settlement_time                 text not null,
  receiving_legal_entity          text not null,
  ownership_classification        text not null
                                    check (ownership_classification in ('business', 'personal', 'third_party')),
  -- Contractual approval is never assumed; review happens, then a named
  -- approver approves.
  approval_status                 text not null default 'pending_review'
                                    check (approval_status in ('pending_review', 'approved', 'rejected', 'revoked')),
  approval_date                   timestamptz,
  compliance_review_note          text,
  approved_by                     text,
  -- Ciphertext only (enc.v1 format). Never plaintext.
  receiving_instructions_enc      text not null,
  receiving_instructions_masked   text not null,
  mobile_instructions             text,
  desktop_instructions            text,
  memo_instructions               text,
  deep_link_ref                   text,
  -- Opaque media-provider reference for a QR asset. Never image bytes.
  qr_asset_ref                    text,
  support_contact_ref             text,
  disabled_reason                 text,
  version                         integer not null default 1 check (version >= 1),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint research_fm_methods_amount_order
    check (min_amount_cents is null or max_amount_cents is null or min_amount_cents <= max_amount_cents),
  constraint research_fm_methods_window_order
    check (active_start_at is null or active_end_at is null or active_start_at < active_end_at),
  constraint research_fm_methods_temporary_has_end
    check (duration <> 'temporary' or active_end_at is not null),
  constraint research_fm_methods_manual_never_product
    check (category <> 'manual_external_payment' or product_eligible = false),
  constraint research_fm_methods_approved_is_stamped
    check (approval_status <> 'approved' or (approval_date is not null and approved_by is not null))
);

create index if not exists research_fm_payment_methods_enabled_idx
  on public.research_fm_payment_methods (enabled) where enabled = true;

-- ---------------------------------------------------------------------------
-- Versioned audit history: one append-only row per registry change
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_payment_method_versions (
  id           uuid primary key default gen_random_uuid(),
  tenant       text not null default 'xenios',
  version_id   text not null unique,
  method_id    text not null references public.research_fm_payment_methods (method_id),
  version      integer not null check (version >= 1),
  change_kind  text not null check (change_kind in ('created', 'approved', 'updated', 'disabled')),
  changed_by   text not null,
  changed_at   timestamptz not null default now(),
  -- The full record AFTER the change; instructions inside are ciphertext only.
  snapshot     jsonb not null,
  constraint research_fm_method_versions_unique_version unique (method_id, version)
);

create index if not exists research_fm_method_versions_method_idx
  on public.research_fm_payment_method_versions (method_id, version);

-- ---------------------------------------------------------------------------
-- Bridge settings (one logical row) and the append-only bridge audit trail
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_bridge_settings (
  id                                       text primary key default 'bridge' check (id = 'bridge'),
  tenant                                   text not null default 'xenios',
  bridge_enabled                           boolean not null default false,
  start_at                                 timestamptz not null,
  end_at                                   timestamptz not null,
  timezone                                 text not null,
  accepting_new_activation_payments        boolean not null default false,
  accepting_existing_obligation_payments   boolean not null default false,
  replacement_provider_status              text not null default 'not_started'
    check (replacement_provider_status in ('not_started', 'in_progress', 'testing', 'ready', 'live')),
  administrator_emergency_disable          boolean not null default false,
  administrator_extension_reason           text,
  administrator_extension_expires_at       timestamptz,
  updated_at                               timestamptz not null default now(),
  constraint research_fm_bridge_window_order check (start_at < end_at),
  -- An extension is reason AND expiry together; a half-filled extension is
  -- refused by the database, not just by the application.
  constraint research_fm_bridge_extension_complete
    check (
      (administrator_extension_reason is null and administrator_extension_expires_at is null)
      or (administrator_extension_reason is not null and administrator_extension_expires_at is not null)
    )
);

create table if not exists public.research_fm_bridge_audit_events (
  id        uuid primary key default gen_random_uuid(),
  tenant    text not null default 'xenios',
  event_id  text not null unique,
  kind      text not null
    check (kind in ('bridge_extension', 'bridge_emergency_disable', 'bridge_settings_updated')),
  actor_id  text not null,
  reason    text not null,
  at        timestamptz not null,
  detail    jsonb not null default '{}'
);

create index if not exists research_fm_bridge_audit_events_at_idx
  on public.research_fm_bridge_audit_events (at);

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
-- The method version history and the bridge audit trail are records of what
-- happened. Blocking UPDATE and DELETE at the database means an application
-- bug, a migration, or a hand-run statement cannot rewrite them. Corrections
-- are new rows.

create or replace function public.research_fm_history_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'table % is append only. Record a new row instead of % on row %.',
    tg_table_name, tg_op, old.id;
end;
$$;

drop trigger if exists research_fm_method_versions_no_update on public.research_fm_payment_method_versions;
create trigger research_fm_method_versions_no_update
  before update or delete on public.research_fm_payment_method_versions
  for each row execute function public.research_fm_history_is_append_only();

drop trigger if exists research_fm_bridge_audit_no_update on public.research_fm_bridge_audit_events;
create trigger research_fm_bridge_audit_no_update
  before update or delete on public.research_fm_bridge_audit_events
  for each row execute function public.research_fm_history_is_append_only();

-- ---------------------------------------------------------------------------
-- Row level security: enabled, no policies, server-only access
-- ---------------------------------------------------------------------------

alter table public.research_fm_payment_methods         enable row level security;
alter table public.research_fm_payment_method_versions enable row level security;
alter table public.research_fm_bridge_settings         enable row level security;
alter table public.research_fm_bridge_audit_events     enable row level security;
