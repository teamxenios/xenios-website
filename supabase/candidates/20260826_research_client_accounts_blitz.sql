-- Xenios Research client-accounts blitz (2026-08-26, REWORKED 2026-08-27):
-- import staging, product interests, account invitations, and the product-
-- activation overlay audit.
--
-- ############################################################################
-- ##  STATUS: NOT READY FOR APPLY.                                          ##
-- ##  Candidate only. FOUNDER-GATED. This file was corrected for the P1-8   ##
-- ##  (effective privileges) and P1-9 (invitation governance) findings of   ##
-- ##  the 2026-08-27 adversarial review, and REMAINS UNAPPLIED after that   ##
-- ##  recut: it awaits its own independent review, ledger registration and  ##
-- ##  DAG entry before any environment runs it. Every production feature    ##
-- ##  that would depend on it stays disabled.                               ##
-- ############################################################################
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
--   * research_product_activation_overlay_audit is append-only HISTORY —
--     enforced by trigger (the commission-ledger pattern), not by grant
--     absence, so a migration, an owner connection, or a later stray GRANT
--     cannot rewrite it either.
--
-- PRIVILEGE MODEL (P1-8). RLS enabled AND forced with ZERO policies. Before
-- any grant, EVERY privilege is revoked from PUBLIC, anon, authenticated,
-- AND service_role on all five tables and on the audit identity sequence —
-- so platform ALTER DEFAULT PRIVILEGES and PUBLIC inheritance cannot smuggle
-- verbs in, and the explicit grants below are the EXACT effective surface:
--   batches:    service_role INSERT, SELECT
--   staging:    service_role INSERT, SELECT, UPDATE (contact enrichment)
--   interests:  service_role INSERT, SELECT, UPDATE, DELETE
--   invitations: service_role SELECT ONLY — every write goes through the
--                governed SECURITY DEFINER transition functions below
--   audit:      service_role INSERT, SELECT (+ trigger blocks all rewrites)
--
-- INVITATION GOVERNANCE (P1-9). An invitation:
--   * must reference a real staging row (staging_id NOT NULL + FK);
--   * may hold at most ONE live invitation per person (partial unique index);
--   * moves ONLY along draft → founder_approved → queued → sent → accepted,
--     with sent → expired and (draft|founder_approved|queued|sent) → revoked,
--     enforced by trigger for EVERY writer including the owner;
--   * may leave draft only when the staged person has contact information
--     AND granted consent AND the approval names a CURRENTLY-ACTIVE
--     super_admin in research_prelaunch_role_assignments — arbitrary actor
--     text is NOT founder approval, and the trigger verifies the authority,
--     not the spelling.
--
-- ROLLBACK. Dropping these tables and functions removes staged import data,
-- invitation records and activation audit history, and nothing else: no live
-- customer account, order, member, or catalog row references them yet.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight: refuse to adopt objects someone else created under these names,
-- and refuse to apply where the prelaunch role authority does not exist.
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
  if to_regclass('public.research_prelaunch_role_assignments') is null then
    raise exception 'client-accounts blitz: research_prelaunch_role_assignments is required for invitation approval verification and does not exist here';
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
  'One row per client-import execution. report holds the aggregate ImportDryRunReportDto (counts, canonical codes, and non-reversible product refs only — no person data, no raw product strings).';

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

create or replace function public.research_client_import_staging_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists research_client_import_staging_touch on public.research_client_import_staging;
create trigger research_client_import_staging_touch
  before update on public.research_client_import_staging
  for each row execute function public.research_client_import_staging_touch();

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
-- Account invitations: decisions and lifecycle, GOVERNED. Sending stays in
-- the outbox under its own founder gate; this table cannot send.
-- ---------------------------------------------------------------------------

create table public.research_customer_account_invitations (
  invitation_id uuid primary key default gen_random_uuid(),
  -- P1-9: an invitation with no staged person behind it is unrepresentable.
  staging_id text not null references public.research_client_import_staging (staging_id),
  approved_wave text check (approved_wave is null or length(trim(approved_wave)) between 1 and 80),
  -- The approver's auth user id AS TEXT, verified against the prelaunch
  -- super_admin assignments by the transition trigger — never free text.
  approved_by text check (approved_by is null or approved_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  approved_at timestamptz,
  state text not null default 'draft'
    check (state in ('draft', 'founder_approved', 'queued', 'sent', 'accepted', 'expired', 'revoked')),
  state_changed_at timestamptz not null default now(),
  -- Defense in depth alongside the trigger: a non-draft state without an
  -- approval record is unrepresentable even if the trigger were dropped.
  constraint invitation_requires_founder_approval
    check (state = 'draft' or (approved_by is not null and approved_at is not null))
);

comment on table public.research_customer_account_invitations is
  'Invitation lifecycle. Writes only through the governed transition functions; the trigger enforces the state machine, staging/contact/consent eligibility, and verified super_admin approval for EVERY writer.';

-- P1-9: at most one LIVE invitation per staged person.
create unique index research_customer_account_invitations_one_active
  on public.research_customer_account_invitations (staging_id)
  where state in ('draft', 'founder_approved', 'queued', 'sent');

create or replace function public.research_client_invitation_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  staging_row public.research_client_import_staging%rowtype;
  approver_ok boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'invitations are history: revoke or expire %, never delete it', old.invitation_id;
  end if;

  if tg_op = 'INSERT' then
    if new.state <> 'draft' then
      raise exception 'an invitation is born draft; % is not a birth state', new.state;
    end if;
    if new.approved_by is not null or new.approved_at is not null then
      raise exception 'a draft invitation carries no approval record';
    end if;
    return new;
  end if;

  -- UPDATE: enforce the transition map.
  if new.state = old.state then
    -- Non-state edits (wave label) are allowed while still a draft only.
    if old.state <> 'draft' then
      raise exception 'invitation % is % and no longer editable', old.invitation_id, old.state;
    end if;
    return new;
  end if;

  if not (
    (old.state = 'draft' and new.state = 'founder_approved')
    or (old.state = 'founder_approved' and new.state = 'queued')
    or (old.state = 'queued' and new.state = 'sent')
    or (old.state = 'sent' and new.state = 'accepted')
    or (old.state = 'sent' and new.state = 'expired')
    or (old.state in ('draft', 'founder_approved', 'queued', 'sent') and new.state = 'revoked')
  ) then
    raise exception 'invitation transition % -> % is not in the state machine', old.state, new.state;
  end if;

  new.state_changed_at := now();

  if new.state = 'founder_approved' then
    -- Eligibility of the staged person, read at approval time.
    select * into staging_row
      from public.research_client_import_staging
      where staging_id = new.staging_id;
    if not found then
      raise exception 'invitation % references staging row % which does not exist', new.invitation_id, new.staging_id;
    end if;
    if staging_row.contact_email is null and staging_row.contact_phone is null then
      raise exception 'staged person % has no contact information; enrichment precedes approval', new.staging_id;
    end if;
    if staging_row.consent_status <> 'granted' then
      raise exception 'staged person % has consent_status %; only granted consent can be approved', new.staging_id, staging_row.consent_status;
    end if;
    -- The approval must name a CURRENTLY-ACTIVE super_admin. Text equality
    -- with a founder's name is not authority; a live role assignment is.
    if new.approved_by is null or new.approved_at is null then
      raise exception 'founder approval requires approved_by and approved_at';
    end if;
    select exists (
      select 1
        from public.research_prelaunch_role_assignments a
        where a.auth_user_id::text = new.approved_by
          and a.role = 'super_admin'
          and a.revoked_at is null
          and (a.expires_at is null or a.expires_at > now())
    ) into approver_ok;
    if not approver_ok then
      raise exception 'approved_by % is not a currently-active super_admin; arbitrary actor text is not founder approval', new.approved_by;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists research_client_invitation_guard on public.research_customer_account_invitations;
create trigger research_client_invitation_guard
  before insert or update or delete on public.research_customer_account_invitations
  for each row execute function public.research_client_invitation_guard();

-- The sanctioned doors. SECURITY DEFINER so service_role needs no table
-- grants at all; the trigger above still validates everything they do.
create or replace function public.research_client_invitation_draft(p_staging_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.research_customer_account_invitations (staging_id)
    values (p_staging_id)
    returning invitation_id into new_id;
  return new_id;
end;
$$;

create or replace function public.research_client_invitation_transition(
  p_invitation_id uuid,
  p_next_state text,
  p_approver_auth_user_id uuid default null,
  p_approved_wave text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.research_customer_account_invitations
    set state = p_next_state,
        approved_by = case
          when p_next_state = 'founder_approved' then p_approver_auth_user_id::text
          else approved_by
        end,
        approved_at = case
          when p_next_state = 'founder_approved' then now()
          else approved_at
        end,
        approved_wave = coalesce(p_approved_wave, approved_wave)
    where invitation_id = p_invitation_id;
  if not found then
    raise exception 'invitation % does not exist', p_invitation_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Product-activation overlay audit: append-only history, BY TRIGGER.
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
  'Append-only activation history, enforced by trigger for every writer including the owner. Corrections are new rows. The status resolver lives in shared code; a verbal basis can never resolve to live regardless of rows here.';

create or replace function public.research_client_accounts_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception
    'audit table % is append only. Record a new row that references the original instead of % on row %.',
    tg_table_name, tg_op, old.audit_id;
end;
$$;

drop trigger if exists research_product_activation_overlay_audit_no_rewrite
  on public.research_product_activation_overlay_audit;
create trigger research_product_activation_overlay_audit_no_rewrite
  before update or delete on public.research_product_activation_overlay_audit
  for each row execute function public.research_client_accounts_append_only();

-- ---------------------------------------------------------------------------
-- Privileges (P1-8): forced RLS, zero policies, REVOKE ALL from every role
-- INCLUDING service_role and PUBLIC first, then the exact explicit grants.
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

revoke all on public.research_client_import_batches from public, anon, authenticated, service_role;
revoke all on public.research_client_import_staging from public, anon, authenticated, service_role;
revoke all on public.research_customer_product_interests from public, anon, authenticated, service_role;
revoke all on public.research_customer_account_invitations from public, anon, authenticated, service_role;
revoke all on public.research_product_activation_overlay_audit from public, anon, authenticated, service_role;

-- The audit identity column owns a sequence; nothing may touch it directly.
revoke all on sequence public.research_product_activation_overlay_audit_audit_id_seq
  from public, anon, authenticated, service_role;

-- Function execution: definers only for service_role; nothing for PUBLIC.
revoke all on function public.research_client_invitation_draft(text) from public;
revoke all on function public.research_client_invitation_transition(uuid, text, uuid, text) from public;
revoke all on function public.research_client_accounts_append_only() from public;
revoke all on function public.research_client_invitation_guard() from public;
revoke all on function public.research_client_import_staging_touch() from public;

grant insert, select on public.research_client_import_batches to service_role;
grant insert, select, update on public.research_client_import_staging to service_role;
grant insert, select, update, delete on public.research_customer_product_interests to service_role;
-- Invitations: READ only. Writes go through the governed definer functions.
grant select on public.research_customer_account_invitations to service_role;
grant insert, select on public.research_product_activation_overlay_audit to service_role;
grant execute on function public.research_client_invitation_draft(text) to service_role;
grant execute on function public.research_client_invitation_transition(uuid, text, uuid, text) to service_role;

commit;
