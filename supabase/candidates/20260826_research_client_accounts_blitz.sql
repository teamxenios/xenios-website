-- Xenios Research client-accounts blitz (2026-08-26): import staging, product
-- interests, account invitations, and the product-activation overlay audit.
-- Candidate only. FOUNDER-GATED: apply after review, then register in the
-- canonical migration ledger and DAG. NOT applied by this lane, anywhere.
--
-- WHY THIS EXISTS. A partner (Vitality Advisors / Seth Grant) brings ~109
-- existing relationships expressed as a name + product-interest list with no
-- contact fields. The operating rule the founder set: those people become
-- customers only through consent — staging import → contact enrichment →
-- founder-approved invitation wave → the person accepts → active account.
-- These tables hold the staging truth and the audit trail for every step that
-- is allowed to exist today (which is: staging and reporting, nothing else).
--
-- WHAT MAY AND MAY NOT BE HELD.
--   * research_client_import_staging holds the imported name and interest
--     strings — that IS personal data, and it lives ONLY here, behind
--     service_role, never in git, fixtures, logs, or reports. Reports are
--     aggregate counts computed server-side.
--   * No health information: a product-interest STRING as written by the
--     partner, and its canonical mapping. No condition, dosage, or protocol
--     column exists to be filled.
--   * research_customer_account_invitations records invitation DECISIONS and
--     lifecycle; sending remains the outbox's job under its own founder gate.
--     Nothing in this file sends anything.
--   * research_product_activation_overlay_audit is append-only history of
--     activation-state changes (verbal confirmation recorded, documentation
--     landed, founder approval). The RESOLVER lives in shared code and can
--     never read "live" out of a verbal basis; this table only remembers who
--     recorded what, when.
--
-- PRIVILEGE MODEL. Same as every research_* table: RLS enabled AND forced
-- with ZERO policies; anon/authenticated get nothing; service_role receives
-- the minimum verbs. Staging is INSERT+SELECT+UPDATE (enrichment fills
-- contact fields); invitations are INSERT+SELECT+UPDATE (state transitions);
-- the audit table is INSERT+SELECT only — history does not get rewritten.
--
-- ROLLBACK. Dropping these tables removes staged import data, invitation
-- records and activation audit history, and nothing else: no live customer
-- account, order, member, or catalog row references them yet.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight: refuse to adopt objects someone else created under these names.
-- ---------------------------------------------------------------------------

do $client_accounts_blitz_preflight$
begin
  if to_regclass('public.research_client_import_batches') is not null
     or to_regclass('public.research_client_import_staging') is not null
     or to_regclass('public.research_customer_product_interests') is not null
     or to_regclass('public.research_customer_account_invitations') is not null
     or to_regclass('public.research_product_activation_overlay_audit') is not null then
    raise exception 'client-accounts blitz: one of the target tables already exists; reconcile before applying';
  end if;
end
$client_accounts_blitz_preflight$;

-- ---------------------------------------------------------------------------
-- Import batches: one row per dry-run/import execution. Counts only.
-- ---------------------------------------------------------------------------

create table public.research_client_import_batches (
  batch_id text primary key
    check (batch_id ~ '^imp-[a-z0-9-]{4,64}$'),
  source_label text not null check (length(trim(source_label)) between 1 and 200),
  source_partner text not null check (source_partner ~ '^[a-z0-9_]{2,64}$'),
  relationship_owner text not null check (length(trim(relationship_owner)) between 1 and 120),
  dry_run boolean not null default true,
  total_rows integer not null check (total_rows >= 0),
  unique_people integer not null check (unique_people >= 0),
  report jsonb not null,
  created_at timestamptz not null default now(),
  created_by text not null check (length(trim(created_by)) between 1 and 200)
);

comment on table public.research_client_import_batches is
  'One row per client-import execution. report holds the aggregate ImportDryRunReportDto (counts and product strings only — no person data).';

-- ---------------------------------------------------------------------------
-- Import staging: the ONLY place imported personal data may live.
-- ---------------------------------------------------------------------------

create table public.research_client_import_staging (
  staging_id text primary key
    check (staging_id ~ '^imp-[a-z0-9-]{4,64}-p[0-9]{4}$'),
  batch_id text not null references public.research_client_import_batches (batch_id),
  source_name text not null check (length(trim(source_name)) between 1 and 200),
  normalized_name_key text not null check (length(trim(normalized_name_key)) between 1 and 200),
  interest_keys text[] not null default '{}',
  raw_interests text[] not null default '{}',
  unmapped_interests text[] not null default '{}',
  source_partner text not null check (source_partner ~ '^[a-z0-9_]{2,64}$'),
  relationship_owner text not null check (length(trim(relationship_owner)) between 1 and 120),
  consent_status text not null default 'pending'
    check (consent_status in ('pending', 'granted', 'declined')),
  account_status text not null default 'not_invited'
    check (account_status in ('not_invited', 'invitation_approved', 'invited', 'active')),
  contact_email text check (contact_email is null or contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  contact_phone text check (contact_phone is null or contact_phone ~ '^[+0-9() .-]{7,25}$'),
  us_state text check (us_state is null or us_state ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, normalized_name_key)
);

comment on table public.research_client_import_staging is
  'Staged imported people. Service-role only; the admin HTTP surface returns aggregate reports and NEVER rows from this table.';

create index research_client_import_staging_batch_idx
  on public.research_client_import_staging (batch_id);

-- ---------------------------------------------------------------------------
-- Customer product interests: canonical keys on an ACTIVE customer account.
-- Populated only after a staged person becomes a real customer; keyed by the
-- member, not the staging row, so staging can be purged independently.
-- ---------------------------------------------------------------------------

create table public.research_customer_product_interests (
  member_id uuid not null,
  interest_key text not null check (interest_key ~ '^[a-z0-9-]{2,64}$'),
  display_label text not null check (length(trim(display_label)) between 1 and 160),
  source text not null default 'partner_import'
    check (source in ('partner_import', 'customer_request', 'availability_request')),
  recorded_at timestamptz not null default now(),
  primary key (member_id, interest_key)
);

comment on table public.research_customer_product_interests is
  'Canonical product-interest keys for a customer. Interest is not availability and never implies an order or a prescription.';

-- ---------------------------------------------------------------------------
-- Account invitations: decisions and lifecycle. Sending stays in the outbox
-- under its own founder gate; this table cannot send.
-- ---------------------------------------------------------------------------

create table public.research_customer_account_invitations (
  invitation_id uuid primary key default gen_random_uuid(),
  staging_id text references public.research_client_import_staging (staging_id),
  approved_wave text check (approved_wave is null or length(trim(approved_wave)) between 1 and 80),
  approved_by text check (approved_by is null or length(trim(approved_by)) between 1 and 200),
  approved_at timestamptz,
  state text not null default 'draft'
    check (state in ('draft', 'founder_approved', 'queued', 'sent', 'accepted', 'expired', 'revoked')),
  state_changed_at timestamptz not null default now(),
  -- An invitation may not advance past draft without a founder approval record.
  constraint invitation_requires_founder_approval
    check (state = 'draft' or (approved_by is not null and approved_at is not null))
);

comment on table public.research_customer_account_invitations is
  'Invitation lifecycle. The check constraint makes an unapproved non-draft state unrepresentable.';

-- ---------------------------------------------------------------------------
-- Product-activation overlay audit: append-only history.
-- ---------------------------------------------------------------------------

create table public.research_product_activation_overlay_audit (
  audit_id bigint generated always as identity primary key,
  group_id text not null check (group_id ~ '^(GRP-[0-9]{4}|Q-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2})$'),
  event text not null check (event in (
    'verbal_confirmation_recorded',
    'documentation_recorded',
    'checklist_field_recorded',
    'founder_activation_approved',
    'hold_recorded',
    'hold_released'
  )),
  detail jsonb not null default '{}'::jsonb,
  recorded_by text not null check (length(trim(recorded_by)) between 1 and 200),
  recorded_at timestamptz not null default now()
);

comment on table public.research_product_activation_overlay_audit is
  'Append-only activation history. The status resolver lives in shared code; a verbal basis can never resolve to live regardless of rows here.';

-- ---------------------------------------------------------------------------
-- Privileges: forced RLS, zero policies, minimum service_role verbs.
-- ---------------------------------------------------------------------------

alter table public.research_client_import_batches enable row level security;
alter table public.research_client_import_batches force row level security;
alter table public.research_client_import_staging enable row level security;
alter table public.research_client_import_staging force row level security;
alter table public.research_customer_product_interests enable row level security;
alter table public.research_customer_product_interests force row level security;
alter table public.research_customer_account_invitations enable row level security;
alter table public.research_customer_account_invitations force row level security;
alter table public.research_product_activation_overlay_audit enable row level security;
alter table public.research_product_activation_overlay_audit force row level security;

revoke all on public.research_client_import_batches from anon, authenticated;
revoke all on public.research_client_import_staging from anon, authenticated;
revoke all on public.research_customer_product_interests from anon, authenticated;
revoke all on public.research_customer_account_invitations from anon, authenticated;
revoke all on public.research_product_activation_overlay_audit from anon, authenticated;

grant insert, select on public.research_client_import_batches to service_role;
grant insert, select, update on public.research_client_import_staging to service_role;
grant insert, select, update, delete on public.research_customer_product_interests to service_role;
grant insert, select, update on public.research_customer_account_invitations to service_role;
grant insert, select on public.research_product_activation_overlay_audit to service_role;

commit;
