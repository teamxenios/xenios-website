-- ==========================================================================
-- XENIOS RESEARCH - FOUNDING MEMBERSHIP ACTIVATION (the FM migration set)
-- ==========================================================================
-- The founding-membership apply. Runs AFTER migrations 1-8 (already RUN in
-- production), AFTER Track A (research-track-a-private-platform.sql,
-- migrations 9-19), and AFTER the Track B commerce bundle
-- (research-track-b-commerce.sql, migrations 20-26 + additions).
--
-- Contents, in order (each domain file included VERBATIM, diff-proven by the
-- assembly dry run in docs/research-launch/FM_MIGRATION_DRY_RUN_REPORT.md):
--   1. supabase/research-fm-payment-methods.sql  (Domain 1: the payment
--      method registry, versioned audit history, bridge settings, bridge
--      audit trail)
--   2. supabase/research-fm-obligations.sql      (Domain 2: the money spine;
--      obligations, obligation events, membership periods, the payment
--      ledger, receipts)
--   3. supabase/research-fm-identity.sql         (Domain 3: identity cases,
--      manual name and age reviews, the identity audit trail)
--   4. supabase/research-fm-agreements.sql       (Domain 4: versioned
--      agreement documents and append-only e-signatures)
--   5. supabase/research-fm-checklist.sql        (the Day 15 bridge exit
--      checklist row createSupabaseChecklistStore targets)
--
-- ADAPTER COVERAGE NOTE. The Supabase adapters in
-- server/research/membership-activation/production-deps.ts target, beyond
-- their own persistence stores:
--   - research_members: provisioned by base migration
--     supabase/research-members.sql (already RUN); the membership writer
--     UPDATES status/billing_state/activated_at only, no schema change here.
--   - research_fm_ledger and research_fm_receipts: provisioned in Domain 2
--     below; column shapes verified one to one against createSupabaseLedger
--     and createSupabaseReceipts (the receipt path additionally relies on the
--     UNIQUE (obligation_id) constraint and Postgres error 23505, both
--     present below).
--   - research_fm_bridge_checklist: provisioned in section 5 below.
--   - RESEARCH_EVIDENCE_BUCKET: a PRIVATE Supabase Storage bucket, created in
--     the Storage dashboard, NOT by SQL. It holds member payment-evidence
--     objects (screenshots, bank receipts) reached only through short-lived
--     signed URLs. Create it private, with no public access, before flipping
--     RESEARCH_FOUNDING_ACTIVATION_ENABLED on. The identity lane's separate
--     private bucket (RESEARCH_IDENTITY_BUCKET) is likewise dashboard-created.
--
-- PRICING FACTS THIS SCHEMA ENFORCES (canonical): ONE Founding Membership;
-- $50 due at activation, INCLUDING the first 30 days; then $25 per additional
-- 30 day period; the first renewal date is computed when the activation
-- payment is verified. There is never a $25 obligation at activation: the
-- database binds activation_50 to exactly 5000 cents and renewal_25 to
-- exactly 2500 cents.
--
-- Every statement is idempotent (create table/index if not exists,
-- create or replace function, or drop-trigger-if-exists immediately followed
-- by create trigger), enables row level security on every new table, and
-- adds NO policy: access is service-role only by design (the server uses the
-- Supabase service role, which bypasses RLS; no client role ever touches
-- these tables). Adding a public policy would be a security regression. No
-- destructive DDL: no drop table, no truncate, no delete from, no drop
-- column.
--
-- Apply in the Supabase SQL Editor (production project) AFTER review, then
-- run research-founding-membership-verification.sql (every FAIL check must
-- return zero rows). Applying this schema does NOT enable anything: every
-- surface sits behind RESEARCH_FOUNDING_ACTIVATION_ENABLED (default false),
-- and a payment method row additionally starts disabled and pending_review.
-- ==========================================================================

-- ==========================================================================
-- SECTION 1: supabase/research-fm-payment-methods.sql (verbatim)
-- ==========================================================================

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

-- ==========================================================================
-- SECTION 2: supabase/research-fm-obligations.sql (verbatim)
-- ==========================================================================

-- ==========================================================================
-- MIGRATION (Track B, founding membership activation, Domain 2):
-- research-fm-obligations
-- ==========================================================================
-- The money spine of the founding membership: payment obligations, their
-- append-only audit trail, membership periods, the payment ledger, and
-- receipts. Persists server/research/membership-activation/.
--
-- Pricing facts these tables enforce: ONE membership, $50 at activation which
-- INCLUDES the first 30 calendar days, the first $25 renewal due 30 days
-- after activation, each $25 covering the next 30 days, and NO $25 at
-- activation (the amount check binds each obligation type to exactly one
-- amount).
--
-- PRIVACY AND SECRETS. The method jsonb carries the admin-configured LABEL
-- and an OPAQUE reference to the encrypted-at-rest receiving instructions.
-- No receiving detail (phone, email, handle, cash tag, account or routing
-- number, QR image) is ever stored in these tables, and the audit trail
-- stores IP and user agent as sha256 hashes only.
--
-- Additive, idempotent, RLS-on, no policies (server-only through the
-- service_role client), no destructive DDL. DRAFT, NOT RUN. Part of the
-- Track B founding activation migration set, gated behind
-- RESEARCH_FOUNDING_ACTIVATION_ENABLED (default false).
-- ==========================================================================

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- Obligations (header, current state)
-- --------------------------------------------------------------------------

create table if not exists public.research_fm_obligations (
  id                    uuid primary key default gen_random_uuid(),
  human_ref             text not null,
  member_id             uuid not null,
  type                  text not null
                          check (type in ('activation_50','renewal_25')),
  expected_amount_cents bigint not null,
  currency              text not null default 'USD',
  description           text not null,
  status                text not null
                          check (status in ('upcoming','due','submitted','under_review',
                                            'info_requested','mismatch','duplicate','verified',
                                            'rejected','overdue','in_grace','suspended',
                                            'cancelled','reversed','refunded')),
  bridge_phase          text not null default 'phase_a_manual_bridge'
                          check (bridge_phase in ('phase_a_manual_bridge','phase_b_business_methods')),
  -- Method snapshot: label plus opaque instructions ref only, never details.
  method                jsonb not null,
  -- Agreement-versions snapshot at creation (key, version, content hash).
  agreements            jsonb not null,
  -- The member's payment report. Recording it never changes membership state.
  submission            jsonb,
  -- The admin verification (every field plus the explicit confirmation).
  verification          jsonb,
  receiving_account_ref text,
  receipt_ref           text,
  created_at            timestamptz not null default now(),
  due_at                timestamptz not null,
  expires_at            timestamptz not null,

  constraint research_fm_obligations_human_ref_unique unique (human_ref),
  -- Each type owes exactly one amount: $50 activates (and includes the first
  -- 30 days), $25 renews. No other pairing can be written.
  constraint research_fm_obligations_amount_matches_type
    check ((type = 'activation_50' and expected_amount_cents = 5000)
        or (type = 'renewal_25'    and expected_amount_cents = 2500)),
  -- A verified obligation must carry its verification record.
  constraint research_fm_obligations_verified_needs_verification
    check (status <> 'verified' or verification is not null)
);

create index if not exists research_fm_obligations_member_idx
  on public.research_fm_obligations (member_id, created_at);
-- The admin review queue scan: reports waiting on a human.
create index if not exists research_fm_obligations_review_idx
  on public.research_fm_obligations (created_at)
  where status in ('submitted','under_review','info_requested','mismatch','duplicate');
-- One LIVE activation obligation per member. Closed ones (cancelled,
-- reversed, refunded) do not block a fresh start.
create unique index if not exists research_fm_one_live_activation_per_member
  on public.research_fm_obligations (member_id)
  where type = 'activation_50' and status not in ('cancelled','reversed','refunded');

-- --------------------------------------------------------------------------
-- Obligation audit events (append-only, enforced by trigger)
-- --------------------------------------------------------------------------

create table if not exists public.research_fm_obligation_events (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null,
  obligation_id   uuid not null references public.research_fm_obligations (id),
  action          text not null,
  actor_type      text not null check (actor_type in ('member','admin','system')),
  actor_id        text,
  actor_role      text,
  -- sha256 hex only, never raw request context.
  ip_hash         text,
  user_agent_hash text,
  from_status     text,
  to_status       text,
  detail          text,
  occurred_at     timestamptz not null default now(),

  -- The domain generates event ids, so a replayed save cannot duplicate an
  -- event on disk.
  constraint research_fm_obligation_events_event_unique unique (event_id)
);

create index if not exists research_fm_obligation_events_obligation_idx
  on public.research_fm_obligation_events (obligation_id, occurred_at);

-- --------------------------------------------------------------------------
-- Membership periods (append-only; one period per funding obligation)
-- --------------------------------------------------------------------------

create table if not exists public.research_fm_membership_periods (
  id                     uuid primary key default gen_random_uuid(),
  member_id              uuid not null,
  sequence               integer not null check (sequence >= 1),
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  funding_obligation_id  uuid not null references public.research_fm_obligations (id),
  created_at             timestamptz not null default now(),

  constraint research_fm_periods_ends_after_start check (ends_at > starts_at),
  -- THE double-extend lock: one verified payment funds exactly one period,
  -- under concurrency, at the database.
  constraint research_fm_periods_one_per_obligation unique (funding_obligation_id),
  constraint research_fm_periods_member_sequence_unique unique (member_id, sequence)
);

create index if not exists research_fm_periods_member_idx
  on public.research_fm_membership_periods (member_id, sequence);

-- --------------------------------------------------------------------------
-- Payment ledger (append-only, enforced by trigger)
-- --------------------------------------------------------------------------

create table if not exists public.research_fm_ledger (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null,
  member_id     uuid not null,
  obligation_id uuid not null references public.research_fm_obligations (id),
  entry_type    text not null
                  check (entry_type in ('activation_payment','renewal_payment','reversal','refund')),
  -- Positive for money received, negative for a reversal or refund. A
  -- correction is a NEW row; balances are sums, never a mutable total.
  amount_cents  bigint not null,
  actor_id      text not null,
  recorded_at   timestamptz not null default now(),

  constraint research_fm_ledger_entry_unique unique (entry_id),
  constraint research_fm_ledger_signed_amounts
    check ((entry_type in ('activation_payment','renewal_payment') and amount_cents > 0)
        or (entry_type in ('reversal','refund') and amount_cents < 0))
);

create index if not exists research_fm_ledger_member_idx
  on public.research_fm_ledger (member_id, recorded_at);
create index if not exists research_fm_ledger_obligation_idx
  on public.research_fm_ledger (obligation_id);

-- --------------------------------------------------------------------------
-- Receipts (exactly one per obligation)
-- --------------------------------------------------------------------------

create table if not exists public.research_fm_receipts (
  id             uuid primary key default gen_random_uuid(),
  receipt_number text not null,
  obligation_id  uuid not null references public.research_fm_obligations (id),
  member_id      uuid not null,
  amount_cents   bigint not null check (amount_cents > 0),
  currency       text not null default 'USD',
  -- The admin-configured method LABEL only, never receiving details.
  method_label   text not null,
  issued_at      timestamptz not null default now(),

  constraint research_fm_receipts_one_per_obligation unique (obligation_id),
  constraint research_fm_receipts_number_unique unique (receipt_number)
);

create index if not exists research_fm_receipts_member_idx
  on public.research_fm_receipts (member_id, issued_at);

-- --------------------------------------------------------------------------
-- Append-only enforcement
-- --------------------------------------------------------------------------
-- History that can be edited is not history. Events, periods, ledger rows,
-- and receipts are never updated or deleted; a correction is a new row that
-- references what it corrects.

create or replace function public.research_fm_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'table % is append only. Record a new row instead of % on row %.',
    tg_table_name, tg_op, old.id;
end;
$$;

drop trigger if exists research_fm_obligation_events_no_rewrite on public.research_fm_obligation_events;
create trigger research_fm_obligation_events_no_rewrite
  before update or delete on public.research_fm_obligation_events
  for each row execute function public.research_fm_append_only();

drop trigger if exists research_fm_membership_periods_no_rewrite on public.research_fm_membership_periods;
create trigger research_fm_membership_periods_no_rewrite
  before update or delete on public.research_fm_membership_periods
  for each row execute function public.research_fm_append_only();

drop trigger if exists research_fm_ledger_no_rewrite on public.research_fm_ledger;
create trigger research_fm_ledger_no_rewrite
  before update or delete on public.research_fm_ledger
  for each row execute function public.research_fm_append_only();

drop trigger if exists research_fm_receipts_no_rewrite on public.research_fm_receipts;
create trigger research_fm_receipts_no_rewrite
  before update or delete on public.research_fm_receipts
  for each row execute function public.research_fm_append_only();

-- --------------------------------------------------------------------------
-- RLS: enabled, no policies. Server-only through the service_role client.
-- --------------------------------------------------------------------------

alter table public.research_fm_obligations        enable row level security;
alter table public.research_fm_obligation_events  enable row level security;
alter table public.research_fm_membership_periods enable row level security;
alter table public.research_fm_ledger             enable row level security;
alter table public.research_fm_receipts           enable row level security;

-- ==========================================================================
-- SECTION 3: supabase/research-fm-identity.sql (verbatim)
-- ==========================================================================

-- xenios research founding membership activation: identity documents,
-- manual name and age review, and retention (Domain 3).
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent, no
-- destructive DDL: nothing here drops a table or a column).
--
-- RLS is ON with NO policies on every table: only the server's service-role
-- client reads or writes here. Applicants reach their case only through the
-- server routes; administrators reach a document only through short-lived
-- signed URLs minted per request, each mint preceded by an audit row.
--
-- HARD RULES this schema keeps honest:
-- - No SSN, anywhere. There is no column on any table that could carry a
--   Social Security number, a full license number, a name, or a birth date.
--   license_last4 is the one sanctioned fragment and the check constraint
--   caps it at exactly four characters.
-- - The raw document lives in a PRIVATE storage bucket
--   (RESEARCH_IDENTITY_BUCKET), never in a table. storage_path is a pointer,
--   nulled when the retention worker or an emergency delete destroys the
--   object; after that, only the minimal review row remains.
-- - The audit trail is append only, enforced by a database trigger, not by
--   application promises.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Cases: one header row per identity document case (current state).
-- The twelve statuses mirror IDENTITY_CASE_STATUSES in
-- server/research/membership-activation/identity-documents.ts.
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_identity_cases (
  case_id                uuid primary key default gen_random_uuid(),
  tenant_id              text not null default 'xenios-research',
  member_id              text not null,
  status                 text not null default 'awaiting_consent' check (status in (
                           'awaiting_consent',
                           'consent_declined',
                           'consent_recorded',
                           'upload_url_issued',
                           'upload_expired',
                           'uploaded',
                           'review_pending',
                           'under_review',
                           'verified',
                           'rejected',
                           'deletion_scheduled',
                           'deleted'
                         )),
  consent_version        text,
  consent_recorded_at    timestamptz,
  -- The raw object pointer. Nulled at deletion; a deleted case keeps no path.
  storage_path           text,
  content_type           text check (content_type is null or content_type in (
                           'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
                         )),
  upload_url_expires_at  timestamptz,
  uploaded_at            timestamptz,
  review_id              uuid,
  raw_deleted_at         timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Consent first, structurally: no case may hold an object pointer without
  -- a recorded consent timestamp.
  constraint research_fm_identity_consent_before_upload
    check (storage_path is null or consent_recorded_at is not null)
);

create index if not exists research_fm_identity_cases_member_idx
  on public.research_fm_identity_cases (tenant_id, member_id, created_at desc);

-- The deletion sweep scans for cases still holding an object.
create index if not exists research_fm_identity_cases_raw_idx
  on public.research_fm_identity_cases (tenant_id)
  where storage_path is not null;

-- The manual review queue.
create index if not exists research_fm_identity_cases_queue_idx
  on public.research_fm_identity_cases (tenant_id, updated_at)
  where status in ('review_pending', 'under_review');

-- ---------------------------------------------------------------------------
-- Reviews: the minimal verification record (what outlives the document).
-- Written once at review completion; the ONLY later update is stamping
-- raw_source_deleted_at when the retention worker destroys the object.
-- Note the columns that do NOT exist: no name, no birth date, no full
-- license or document number, no SSN, no image, ever.
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_identity_reviews (
  review_id             uuid primary key,
  case_id               uuid not null,
  tenant_id             text not null default 'xenios-research',
  member_id             text not null,
  -- This lane is a manual name and age check by a named person; the type is
  -- pinned so no other review flavor can ever be filed here.
  review_type           text not null default 'manual_name_age'
                          check (review_type = 'manual_name_age'),
  name_match            text not null check (name_match in ('match', 'mismatch')),
  age_threshold_met     boolean not null,
  document_not_expired  boolean not null,
  jurisdiction          text,
  -- The one sanctioned identifier fragment: exactly four characters or null.
  license_last4         text check (
                          license_last4 is null
                          or license_last4 ~ '^[A-Za-z0-9]{4}$'
                        ),
  outcome               text not null check (outcome in ('verified', 'rejected')),
  rejection_category    text check (rejection_category is null or rejection_category in (
                          'name_mismatch',
                          'age_threshold_not_met',
                          'document_expired',
                          'unreadable',
                          'required_field_concealed',
                          'not_a_government_id',
                          'other'
                        )),
  -- A rejection always carries a reason; a pass never does.
  constraint research_fm_identity_rejection_reason
    check (
      (outcome = 'rejected' and rejection_category is not null)
      or (outcome = 'verified' and rejection_category is null)
    ),
  reviewer_id           text not null,
  started_at            timestamptz not null,
  completed_at          timestamptz not null,
  raw_source_deleted_at timestamptz,
  created_at            timestamptz not null default now()
);

create unique index if not exists research_fm_identity_reviews_case_idx
  on public.research_fm_identity_reviews (tenant_id, case_id);

create index if not exists research_fm_identity_reviews_member_idx
  on public.research_fm_identity_reviews (tenant_id, member_id, completed_at desc);

-- ---------------------------------------------------------------------------
-- Audit: append only. One row per event, including EVERY administrator view
-- of a document (the row is written before the signed URL is minted) and
-- every deletion. History is never rewritten; the trigger refuses update and
-- delete outright.
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_identity_audit (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default 'xenios-research',
  case_id     uuid not null,
  member_id   text not null,
  kind        text not null check (kind in (
                'case_opened',
                'consent_recorded',
                'consent_declined',
                'upload_url_issued',
                'upload_confirmed',
                'submitted_for_review',
                'review_started',
                'review_completed',
                'admin_viewed',
                'deletion_scheduled',
                'raw_deleted',
                'emergency_deleted'
              )),
  actor_type  text not null check (actor_type in ('member', 'admin', 'system')),
  actor_id    text,
  occurred_at timestamptz not null default now(),
  detail      text,
  created_at  timestamptz not null default now()
);

create index if not exists research_fm_identity_audit_case_idx
  on public.research_fm_identity_audit (tenant_id, case_id, occurred_at);

create index if not exists research_fm_identity_audit_member_idx
  on public.research_fm_identity_audit (tenant_id, member_id, occurred_at desc);

create or replace function public.research_fm_identity_audit_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'research_fm_identity_audit is append only. Record a new row instead of % on row %.',
    tg_op, old.id;
end;
$$;

drop trigger if exists research_fm_identity_audit_no_update on public.research_fm_identity_audit;
create trigger research_fm_identity_audit_no_update
  before update or delete on public.research_fm_identity_audit
  for each row execute function public.research_fm_identity_audit_is_append_only();

-- ---------------------------------------------------------------------------
-- RLS: on, with no policies. The anon and authenticated roles can touch
-- nothing here; only the service-role client (which bypasses RLS) operates,
-- and it does so exclusively through the server's identity store.
-- ---------------------------------------------------------------------------

alter table public.research_fm_identity_cases enable row level security;
alter table public.research_fm_identity_reviews enable row level security;
alter table public.research_fm_identity_audit enable row level security;

-- ==========================================================================
-- SECTION 4: supabase/research-fm-agreements.sql (verbatim)
-- ==========================================================================

-- xenios research founding membership activation: versioned agreement
-- documents and e-signatures. DRAFT, NOT RUN as of 2026-07-22.
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent, no
-- destructive DDL). RLS enabled, no policies; server-only access through the
-- service role.
--
-- Persists: server/research/membership-activation/{documents,signatures}.ts
-- via persistence/documents-store.ts. Sits ABOVE the acceptance register in
-- research-agreements.sql (research_agreement_acceptances stays untouched).
--
-- RULES THIS SCHEMA ENFORCES RATHER THAN TRUSTS:
--   1. A signature can only ever bind to a PUBLISHED document version, and
--      only to that version's exact content hash. A draft can never be
--      signed, even by a manual insert.
--   2. Signatures are append-only: no update, no delete, ever.
--   3. Published text is frozen: content, hash, semver, and category of a
--      version that reached publication cannot change.
--   4. At most one published version per (tenant, category).
--   5. Both attestation booleans must be true on every signature row; a
--      prechecked-false or missing consent cannot be stored.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Document versions
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_document_versions (
  id                                uuid primary key default gen_random_uuid(),
  tenant                            text not null default 'xenios_research',
  category                          text not null check (category in (
                                      'electronic_record_consent',
                                      'founding_membership_agreement',
                                      'activation_terms',
                                      'recurring_membership_authorization',
                                      'immediate_cancellation_acknowledgment',
                                      'membership_covenant',
                                      'confidentiality_covenant',
                                      'privacy_notice',
                                      'research_education_disclaimer',
                                      'assumption_of_risk_acknowledgment',
                                      'no_guarantee_acknowledgment',
                                      'arbitration_agreement',
                                      'manual_payment_bridge_terms',
                                      'identity_age_verification_consent',
                                      'sensitive_health_data_consent',
                                      'referral_store_credit_terms')),
  title                             text not null,
  semver                            text not null
                                      check (semver ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'),
  status                            text not null default 'draft' check (status in (
                                      'draft','under_legal_review','approved_for_publication',
                                      'scheduled','published','superseded','archived','withdrawn')),
  effective_date                    date,
  published_at                      timestamptz,
  jurisdiction                      text not null,
  content                           text not null check (length(btrim(content)) > 0),
  content_hash                      text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  download_ref                      text,
  requirement                       text not null default 'required'
                                      check (requirement in ('required','optional')),
  activation_step                   text check (activation_step in (
                                      'electronic_consent','activation_agreements',
                                      'arbitration_acknowledgment','recurring_authorization',
                                      'payment_bridge','assessment_entry')),
  reacceptance_required             boolean not null default false,
  requires_separate_acknowledgment  boolean not null default false,
  superseded_version_id             uuid references public.research_fm_document_versions (id),
  publisher                         text,
  counsel_review                    text not null default 'not_reviewed' check (counsel_review in (
                                      'not_reviewed','under_review','changes_requested','approved')),
  notes                             text,
  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now(),

  -- A version at or past publication carries a publication timestamp.
  constraint research_fm_versions_published_needs_timestamp
    check (status not in ('published','superseded','archived') or published_at is not null),
  -- Nothing publishes without counsel approval on record.
  constraint research_fm_versions_published_needs_counsel
    check (status not in ('published','superseded') or counsel_review = 'approved'),
  -- One semver per category per tenant.
  constraint research_fm_versions_unique_semver unique (tenant, category, semver)
);

-- At most ONE published version per category.
create unique index if not exists research_fm_versions_one_published_per_category
  on public.research_fm_document_versions (tenant, category)
  where status = 'published';

create index if not exists research_fm_versions_category_status_idx
  on public.research_fm_document_versions (tenant, category, status);

-- Freeze published text: once a version has reached publication (published,
-- superseded, or archived), its identity and content cannot change.
create or replace function public.research_fm_versions_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('published','superseded','archived') then
    if new.content is distinct from old.content
       or new.content_hash is distinct from old.content_hash
       or new.semver is distinct from old.semver
       or new.category is distinct from old.category
       or new.published_at is distinct from old.published_at then
      raise exception
        'document version % reached publication; its content, hash, semver, category, and publication timestamp are frozen',
        old.id;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists research_fm_versions_guard on public.research_fm_document_versions;
create trigger research_fm_versions_guard
  before update on public.research_fm_document_versions
  for each row execute function public.research_fm_versions_guard();

-- A version that ever left draft is a legal record; it is never deleted.
create or replace function public.research_fm_versions_no_delete()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' then
    raise exception
      'document version % left draft and is a permanent record; supersede, archive, or withdraw it instead of deleting',
      old.id;
  end if;
  return old;
end;
$$;

drop trigger if exists research_fm_versions_no_delete on public.research_fm_document_versions;
create trigger research_fm_versions_no_delete
  before delete on public.research_fm_document_versions
  for each row execute function public.research_fm_versions_no_delete();

alter table public.research_fm_document_versions enable row level security;

-- ---------------------------------------------------------------------------
-- Signatures (append-only legal events)
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_document_signatures (
  id                             uuid primary key default gen_random_uuid(),
  tenant                         text not null default 'xenios_research',
  member_id                      uuid not null,
  document_version_id            uuid not null references public.research_fm_document_versions (id),
  category                       text not null check (category in (
                                   'electronic_record_consent',
                                   'founding_membership_agreement',
                                   'activation_terms',
                                   'recurring_membership_authorization',
                                   'immediate_cancellation_acknowledgment',
                                   'membership_covenant',
                                   'confidentiality_covenant',
                                   'privacy_notice',
                                   'research_education_disclaimer',
                                   'assumption_of_risk_acknowledgment',
                                   'no_guarantee_acknowledgment',
                                   'arbitration_agreement',
                                   'manual_payment_bridge_terms',
                                   'identity_age_verification_consent',
                                   'sensitive_health_data_consent',
                                   'referral_store_credit_terms')),
  semver                         text not null,
  content_hash                   text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  typed_legal_name               text not null check (length(btrim(typed_legal_name)) >= 2),
  -- Attestations must be TRUE. There is no way to store an unconsented row.
  full_document_shown            boolean not null check (full_document_shown),
  affirmative_consent            boolean not null check (affirmative_consent),
  separate_acknowledgment        boolean not null default false,
  electronic_consent_version_id  uuid not null references public.research_fm_document_versions (id),
  ip_hash                        text,
  user_agent_hash                text,
  signed_at                      timestamptz not null default now(),

  -- One signature per member per version. Retries replay, never duplicate.
  constraint research_fm_signatures_once unique (member_id, document_version_id)
);

create index if not exists research_fm_signatures_member_idx
  on public.research_fm_document_signatures (member_id, signed_at desc);

-- Structural: a signature can only bind to a PUBLISHED version, and only to
-- that version's exact content hash. A draft can never be signed.
create or replace function public.research_fm_signature_requires_published()
returns trigger
language plpgsql
as $$
declare
  v_status text;
  v_hash   text;
begin
  select status, content_hash into v_status, v_hash
    from public.research_fm_document_versions
   where id = new.document_version_id;
  if v_status is null then
    raise exception 'signature references unknown document version %', new.document_version_id;
  end if;
  if v_status <> 'published' then
    raise exception
      'document version % is %, not published; a draft or unpublished version can never be signed',
      new.document_version_id, v_status;
  end if;
  if new.content_hash <> v_hash then
    raise exception
      'signature content hash does not match published version %; the member must be shown the exact published text',
      new.document_version_id;
  end if;
  return new;
end;
$$;

drop trigger if exists research_fm_signature_requires_published on public.research_fm_document_signatures;
create trigger research_fm_signature_requires_published
  before insert on public.research_fm_document_signatures
  for each row execute function public.research_fm_signature_requires_published();

-- Append-only: a signature is never updated and never deleted.
create or replace function public.research_fm_signatures_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'research_fm_document_signatures is append only; % on signature % is refused',
    tg_op, old.id;
end;
$$;

drop trigger if exists research_fm_signatures_no_update on public.research_fm_document_signatures;
create trigger research_fm_signatures_no_update
  before update on public.research_fm_document_signatures
  for each row execute function public.research_fm_signatures_append_only();

drop trigger if exists research_fm_signatures_no_delete on public.research_fm_document_signatures;
create trigger research_fm_signatures_no_delete
  before delete on public.research_fm_document_signatures
  for each row execute function public.research_fm_signatures_append_only();

alter table public.research_fm_document_signatures enable row level security;

-- ==========================================================================
-- SECTION 5: supabase/research-fm-checklist.sql (verbatim)
-- ==========================================================================

-- xenios research founding membership activation: the Day 15 bridge exit
-- checklist (Domain 5 follow-up). DRAFT, NOT RUN as of 2026-07-22.
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent, no
-- destructive DDL). RLS enabled, no policies; server-only access through the
-- service role.
--
-- Persists: createSupabaseChecklistStore in
-- server/research/membership-activation/production-deps.ts, which reads and
-- upserts exactly one row shape: { id: 'day15', items: <jsonb> }, with
-- upsert(..., { onConflict: 'id' }). The store reads FAIL SOFT (a missing
-- table or row is an empty checklist) and writes LOUD (an upsert error
-- surfaces), so this table can ship after the code with no hazard; until it
-- exists, checklist saves error truthfully instead of losing progress
-- silently.
--
-- The items jsonb holds one entry per checklist key (see
-- DAY15_CHECKLIST_ITEMS), each { done, note, updatedBy, updatedAt }. This is
-- deliberately MUTABLE operational state (the one non-append-only FM table
-- besides the registry header rows): the record of WHO changed WHAT lives in
-- the per-item updatedBy/updatedAt fields the server always stamps.

create table if not exists public.research_fm_bridge_checklist (
  id          text primary key,
  tenant      text not null default 'xenios',
  items       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Keep updated_at honest on every write without asking the application.
create or replace function public.research_fm_checklist_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists research_fm_checklist_touch on public.research_fm_bridge_checklist;
create trigger research_fm_checklist_touch
  before update on public.research_fm_bridge_checklist
  for each row execute function public.research_fm_checklist_touch();

-- RLS: enabled, no policies. Server-only through the service_role client.
alter table public.research_fm_bridge_checklist enable row level security;
