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
-- AND service_role on all six tables and on both identity sequences —
-- so platform ALTER DEFAULT PRIVILEGES and PUBLIC inheritance cannot smuggle
-- verbs in, and the explicit grants below are the EXACT effective surface:
--   batches:    service_role INSERT, SELECT
--   staging:    service_role INSERT, SELECT, UPDATE (contact enrichment)
--   interests:  service_role INSERT, SELECT, UPDATE, DELETE
--   invitations: service_role SELECT ONLY — every write goes through the
--                governed SECURITY DEFINER transition functions below
--   invitation events: service_role SELECT ONLY (+ trigger blocks rewrites)
--   audit:      service_role INSERT, SELECT (+ trigger blocks all rewrites)
--
-- INVITATION IMMUTABILITY (P1-F, 2026-08-27 round 3). An approval BINDS to an
-- immutable snapshot of the exact evidence approved: the guard trigger
-- computes a sha256 over canonical JSON containing (staging_id, batch,
-- normalized identity, contact, consent, partner, evidence arrays,
-- row_version, approved wave) at approval time, stores it
-- on the invitation, and RE-VERIFIES it on every queue/sent advance — so
-- approve-then-mutate, staging swaps, replaced approvers, and stale
-- approvals all refuse. Approval fields are immutable once written, for
-- every writer. As a second wall, the staging row's evidence fields FREEZE
-- while a founder_approved/queued/sent invitation references them.
--
-- INVITATION GOVERNANCE (P1-9). An invitation:
--   * must reference a real staging row (staging_id NOT NULL + FK);
--   * may hold exactly one immutable invitation history per staged identity;
--   * moves ONLY along draft → founder_approved → queued → sent,
--     with sent → expired and (draft|founder_approved|queued|sent) → revoked,
--     enforced by trigger for EVERY writer including the owner;
--   * may leave draft only when the staged person has contact information
--     AND granted consent AND the approval names a CURRENTLY-ACTIVE
--     super_admin in research_prelaunch_role_assignments AND the approver is
--     the authenticated auth.uid() that invoked the approval door — arbitrary
--     actor text is NOT founder approval.
--   * records every birth/transition in an append-only event ledger.
--
-- This candidate deliberately has no `accepted` or staged `active` status.
-- There is no authoritative customer-account binding in this dependency
-- chain, so claiming either state here would manufacture account truth.
--
-- ROLLBACK. Dropping these tables and functions removes staged import data,
-- invitation records/event history and activation audit history, and nothing
-- else: no live customer account, order, member, or catalog row references
-- them yet.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight: refuse to adopt objects someone else created under these names,
-- and refuse to apply where the prelaunch role authority does not exist.
-- ---------------------------------------------------------------------------

do $client_accounts_blitz_preflight$
begin
  if exists (
    select 1
      from (values ('anon'), ('authenticated'), ('service_role')) required(role_name)
     where not exists (
       select 1 from pg_roles r where r.rolname = required.role_name
     )
  ) then
    raise exception 'client-accounts blitz: anon, authenticated, and service_role roles are required';
  end if;
  if to_regclass('public.research_client_import_batches') is not null
     or to_regclass('public.research_client_import_staging') is not null
     or to_regclass('public.research_customer_product_interests') is not null
     or to_regclass('public.research_customer_account_invitations') is not null
     or to_regclass('public.research_customer_account_invitation_events') is not null
     or to_regclass('public.research_product_activation_overlay_audit') is not null then
    raise exception 'client-accounts blitz: one of the target tables already exists; reconcile before applying';
  end if;
  if to_regclass('public.research_prelaunch_role_assignments') is null then
    raise exception 'client-accounts blitz: research_prelaunch_role_assignments is required for invitation approval verification and does not exist here';
  end if;
  if to_regclass('public.research_members') is null then
    raise exception 'client-accounts blitz: research_members is required so product interests bind to a real member rather than an arbitrary uuid';
  end if;
  if to_regprocedure('auth.uid()') is null then
    raise exception 'client-accounts blitz: auth.uid() is required so approval authority binds to the authenticated caller';
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
  contact_email text check (contact_email is null or contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  contact_phone text check (contact_phone is null or contact_phone ~ '^[+0-9() .-]{7,25}$'),
  us_state text check (us_state is null or us_state ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- P1-F: bumped on every update; approval snapshots bind to the exact
  -- version they approved, so silent post-approval mutation is detectable.
  row_version integer not null default 1,
  unique (batch_id, normalized_name_key),
  -- Fail closed across imports: without a durable external person identifier,
  -- a repeated partner/name identity is ambiguous and must be reconciled by a
  -- human rather than silently creating a second invitation history.
  unique (source_partner, normalized_name_key)
);

comment on table public.research_client_import_staging is
  'Staged imported people. Service-role only; the admin HTTP surface returns aggregate reports and NEVER rows from this table.';

create index research_client_import_staging_batch_idx
  on public.research_client_import_staging (batch_id);

-- The canonical evidence string an approval binds to (P1-F). Everything an
-- approval decision depends on is in here; sha256 is a PostgreSQL built-in
-- (v11+), so no extension is required. The hash is computed BY THE TRIGGER,
-- never accepted from a caller.
create or replace function public.research_client_invitation_evidence_hash(
  p_staging public.research_client_import_staging,
  p_approved_wave text
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select encode(sha256(convert_to(
    jsonb_build_object(
      'schema_version', 1,
      'approved_wave', p_approved_wave,
      'staging', jsonb_build_object(
        'staging_id', p_staging.staging_id,
        'batch_id', p_staging.batch_id,
        'source_name', p_staging.source_name,
        'normalized_name_key', p_staging.normalized_name_key,
        'interest_keys', to_jsonb(p_staging.interest_keys),
        'raw_interests', to_jsonb(p_staging.raw_interests),
        'unmapped_interests', to_jsonb(p_staging.unmapped_interests),
        'source_partner', p_staging.source_partner,
        'relationship_owner', p_staging.relationship_owner,
        'consent_status', p_staging.consent_status,
        'contact_email', p_staging.contact_email,
        'contact_phone', p_staging.contact_phone,
        'us_state', p_staging.us_state,
        'row_version', p_staging.row_version
      )
    )::text,
    'UTF8')), 'hex');
$$;

create or replace function public.research_client_import_staging_touch()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

drop trigger if exists research_client_import_staging_touch on public.research_client_import_staging;
create trigger research_client_import_staging_touch
  before update on public.research_client_import_staging
  for each row execute function public.research_client_import_staging_touch();

-- P1-F option B, as belt to the snapshot's braces: once a person's invitation
-- is founder-approved (or further along), the approved evidence fields on the
-- staging row are FROZEN for every writer. Revoke the invitation before any
-- correction; this candidate intentionally offers no re-invite path, so a
-- future reviewed governance change is required before another invitation.
create or replace function public.research_client_import_staging_freeze()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (new.contact_email is distinct from old.contact_email
      or new.contact_phone is distinct from old.contact_phone
      or new.consent_status is distinct from old.consent_status
      or new.normalized_name_key is distinct from old.normalized_name_key
      or new.source_name is distinct from old.source_name
      or new.interest_keys is distinct from old.interest_keys
      or new.raw_interests is distinct from old.raw_interests
      or new.unmapped_interests is distinct from old.unmapped_interests
      or new.batch_id is distinct from old.batch_id
      or new.source_partner is distinct from old.source_partner
      or new.relationship_owner is distinct from old.relationship_owner
      or new.us_state is distinct from old.us_state
      or new.staging_id is distinct from old.staging_id)
     and exists (
       select 1 from public.research_customer_account_invitations i
        where i.staging_id = old.staging_id
          and i.state in ('founder_approved', 'queued', 'sent')
     ) then
    raise exception
      'staging row % carries a live approved invitation; approved evidence is immutable — revoke the invitation before editing',
      old.staging_id;
  end if;
  return new;
end;
$$;

drop trigger if exists research_client_import_staging_freeze on public.research_client_import_staging;
create trigger research_client_import_staging_freeze
  before update on public.research_client_import_staging
  for each row execute function public.research_client_import_staging_freeze();

-- ---------------------------------------------------------------------------
-- Customer product interests: canonical keys on an ACTIVE customer account.
-- Populated only after a staged person becomes a real customer; keyed by the
-- member, not the staging row, so staging can be purged independently.
-- ---------------------------------------------------------------------------

create table public.research_customer_product_interests (
  member_id uuid not null references public.research_members (id) on delete restrict,
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
  -- P1-F: the immutable snapshot the approval BOUND TO — computed by the
  -- guard trigger over the staging row's evidence at approval time, and
  -- re-verified on every later transition. Never caller-supplied.
  approved_snapshot_hash text check (approved_snapshot_hash is null or approved_snapshot_hash ~ '^[0-9a-f]{64}$'),
  approved_row_version integer check (approved_row_version is null or approved_row_version >= 1),
  state text not null default 'draft'
    check (state in ('draft', 'founder_approved', 'queued', 'sent', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  state_changed_at timestamptz not null default now(),
  -- Defense in depth alongside the trigger, ALIGNED with the trigger's state
  -- graph (P1-F): a draft may be revoked without ever being approved, so
  -- 'revoked' is exempt; every other non-draft state requires the full
  -- approval record including its evidence snapshot. ONE state machine.
  constraint invitation_approval_bundle_is_atomic
    check (
      (
        approved_wave is null
        and approved_by is null
        and approved_at is null
        and approved_snapshot_hash is null
        and approved_row_version is null
      )
      or (
        approved_wave is not null
        and approved_by is not null
        and approved_at is not null
        and approved_snapshot_hash is not null
        and approved_row_version is not null
      )
    ),
  constraint invitation_state_requires_exact_approval_bundle
    check (
      (state = 'draft' and approved_wave is null)
      or (state in ('founder_approved', 'queued', 'sent', 'expired') and approved_wave is not null)
      or state = 'revoked'
    ),
  constraint invitation_approval_not_before_birth
    check (
      approved_at is null or approved_at >= created_at
    )
);

comment on table public.research_customer_account_invitations is
  'Current invitation projection. Writes only through governed SECURITY DEFINER doors; every state transition is also recorded in the append-only invitation event ledger.';

-- One staged identity owns one invitation history, including terminal states.
-- Retrying after revoke/expiry requires an explicit future governance change;
-- silently creating a second history is prohibited.
create unique index research_customer_account_invitations_one_history
  on public.research_customer_account_invitations (staging_id);

create table public.research_customer_account_invitation_events (
  event_id bigint generated always as identity primary key,
  invitation_id uuid not null references public.research_customer_account_invitations (invitation_id),
  transition_sequence integer not null check (transition_sequence >= 1),
  prior_state text check (prior_state is null or prior_state in (
    'draft', 'founder_approved', 'queued', 'sent', 'expired', 'revoked'
  )),
  next_state text not null check (next_state in (
    'draft', 'founder_approved', 'queued', 'sent', 'expired', 'revoked'
  )),
  actor_auth_user_id uuid,
  actor_database_role text not null,
  approved_wave text,
  approved_snapshot_hash text check (
    approved_snapshot_hash is null or approved_snapshot_hash ~ '^[0-9a-f]{64}$'
  ),
  recorded_at timestamptz not null default now(),
  unique (invitation_id, transition_sequence),
  constraint invitation_event_transition_shape check (
    (transition_sequence = 1 and prior_state is null and next_state = 'draft')
    or (transition_sequence > 1 and prior_state is not null)
  )
);

comment on table public.research_customer_account_invitation_events is
  'Append-only birth and transition ledger for account invitations. Corrections are new governed transitions; UPDATE and DELETE are always rejected.';

create or replace function public.research_client_invitation_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  staging_row public.research_client_import_staging%rowtype;
  approver_ok boolean;
  authenticated_actor uuid;
  current_hash text;
begin
  if tg_op = 'DELETE' then
    raise exception 'invitations are history: revoke or expire %, never delete it', old.invitation_id;
  end if;

  if tg_op = 'INSERT' then
    if new.state <> 'draft' then
      raise exception 'an invitation is born draft; % is not a birth state', new.state;
    end if;
    if new.approved_wave is not null or new.approved_by is not null or new.approved_at is not null
       or new.approved_snapshot_hash is not null or new.approved_row_version is not null then
      raise exception 'a draft invitation carries no approval bundle, including no approved wave';
    end if;
    new.created_at := statement_timestamp();
    new.state_changed_at := new.created_at;
    return new;
  end if;

  -- The invitation is bound to ONE staged person forever.
  if new.invitation_id is distinct from old.invitation_id
     or new.staging_id is distinct from old.staging_id
     or new.created_at is distinct from old.created_at then
    raise exception 'invitation % identity and birth timestamp are immutable', old.invitation_id;
  end if;

  if old.approved_by is not null and (
       new.approved_wave is distinct from old.approved_wave
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.approved_snapshot_hash is distinct from old.approved_snapshot_hash
       or new.approved_row_version is distinct from old.approved_row_version
     ) then
    raise exception 'invitation % approval bundle is immutable', old.invitation_id;
  end if;

  -- There are no same-state edits. Transition history is append-only, and
  -- even a draft cannot be decorated with a partial approval bundle.
  if new.state = old.state then
    raise exception 'invitation % is %; same-state mutation is prohibited', old.invitation_id, old.state;
  end if;

  if not (
    (old.state = 'draft' and new.state = 'founder_approved')
    or (old.state = 'founder_approved' and new.state = 'queued')
    or (old.state = 'queued' and new.state = 'sent')
    or (old.state = 'sent' and new.state = 'expired')
    or (old.state in ('draft', 'founder_approved', 'queued', 'sent') and new.state = 'revoked')
  ) then
    raise exception 'invitation transition % -> % is not in the state machine', old.state, new.state;
  end if;

  new.state_changed_at := statement_timestamp();

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
    if new.approved_wave is null or length(btrim(new.approved_wave)) not between 1 and 80 then
      raise exception 'founder approval requires a nonblank approved wave';
    end if;
    new.approved_wave := btrim(new.approved_wave);

    -- Identity is server-derived from the authenticated caller. The API does
    -- not accept an approver id, so a service or caller cannot name another
    -- active administrator to manufacture approval authority.
    authenticated_actor := auth.uid();
    if authenticated_actor is null then
      raise exception 'founder approval requires an authenticated auth.uid()';
    end if;
    select exists (
      select 1
        from public.research_prelaunch_role_assignments a
        where a.auth_user_id = authenticated_actor
          and a.role = 'super_admin'
          and a.revoked_at is null
          and a.granted_at <= statement_timestamp()
          and (a.expires_at is null or a.expires_at > statement_timestamp())
    ) into approver_ok;
    if not approver_ok then
      raise exception 'authenticated actor % is not a currently-active super_admin', authenticated_actor;
    end if;
    new.approved_by := authenticated_actor::text;
    new.approved_at := statement_timestamp();
    -- P1-F: bind the approval to the EXACT evidence it approved. The trigger
    -- computes the snapshot itself; a caller-supplied value is overwritten.
    new.approved_snapshot_hash := public.research_client_invitation_evidence_hash(
      staging_row,
      new.approved_wave
    );
    new.approved_row_version := staging_row.row_version;
  else
    -- The entire approval bundle, including the wave, is immutable after
    -- approval and must remain all-null for draft -> revoked.
    if new.approved_wave is distinct from old.approved_wave
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.approved_snapshot_hash is distinct from old.approved_snapshot_hash
       or new.approved_row_version is distinct from old.approved_row_version then
      raise exception 'invitation % approval bundle is immutable', old.invitation_id;
    end if;
  end if;

  if new.state in ('queued', 'sent') then
    -- P1-F: every advance toward sending RE-RESOLVES the approved evidence
    -- and refuses if anything moved since the founder looked at it.
    select * into staging_row
      from public.research_client_import_staging
      where staging_id = new.staging_id;
    if not found then
      raise exception 'invitation % lost its staging row %; cannot advance', new.invitation_id, new.staging_id;
    end if;
    current_hash := public.research_client_invitation_evidence_hash(
      staging_row,
      old.approved_wave
    );
    if current_hash is distinct from old.approved_snapshot_hash
       or staging_row.row_version is distinct from old.approved_row_version then
      raise exception
        'invitation % approved evidence has changed since approval (snapshot mismatch); revoke and reconcile before any future invitation',
        old.invitation_id;
    end if;
    -- Eligibility must still hold at the moment of advancing.
    if staging_row.contact_email is null and staging_row.contact_phone is null then
      raise exception 'staged person % no longer has contact information; cannot advance', new.staging_id;
    end if;
    if staging_row.consent_status <> 'granted' then
      raise exception 'staged person % no longer has granted consent; cannot advance', new.staging_id;
    end if;
    -- The approving principal must still satisfy policy.
    select exists (
      select 1
        from public.research_prelaunch_role_assignments a
        where a.auth_user_id::text = old.approved_by
          and a.role = 'super_admin'
          and a.revoked_at is null
          and a.granted_at <= statement_timestamp()
          and (a.expires_at is null or a.expires_at > statement_timestamp())
    ) into approver_ok;
    if not approver_ok then
      raise exception 'the approving principal for invitation % is no longer an active super_admin; revoke and reconcile before any future invitation', old.invitation_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists research_client_invitation_guard on public.research_customer_account_invitations;
create trigger research_client_invitation_guard
  before insert or update or delete on public.research_customer_account_invitations
  for each row execute function public.research_client_invitation_guard();

create or replace function public.research_client_invitation_event_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception
    'invitation event ledger is append only; % on event % is prohibited',
    tg_op, old.event_id;
end;
$$;

create trigger research_client_invitation_events_no_rewrite
  before update or delete on public.research_customer_account_invitation_events
  for each row execute function public.research_client_invitation_event_append_only();

create or replace function public.research_client_invitation_record_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  next_sequence integer;
begin
  select coalesce(max(e.transition_sequence), 0) + 1
    into next_sequence
    from public.research_customer_account_invitation_events e
   where e.invitation_id = new.invitation_id;

  insert into public.research_customer_account_invitation_events (
    invitation_id,
    transition_sequence,
    prior_state,
    next_state,
    actor_auth_user_id,
    actor_database_role,
    approved_wave,
    approved_snapshot_hash,
    recorded_at
  ) values (
    new.invitation_id,
    next_sequence,
    case when tg_op = 'INSERT' then null else old.state end,
    new.state,
    auth.uid(),
    session_user || ' -> ' || current_user,
    new.approved_wave,
    new.approved_snapshot_hash,
    new.state_changed_at
  );
  return new;
end;
$$;

create trigger research_client_invitation_record_event
  after insert or update on public.research_customer_account_invitations
  for each row execute function public.research_client_invitation_record_event();

-- The sanctioned doors. SECURITY DEFINER so service_role needs no table
-- grants at all; the trigger above still validates everything they do.
create or replace function public.research_client_invitation_draft(p_staging_id text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
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

create or replace function public.research_client_invitation_founder_approve(
  p_invitation_id uuid,
  p_approved_wave text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.research_customer_account_invitations
    set state = 'founder_approved',
        approved_wave = p_approved_wave
    where invitation_id = p_invitation_id;
  if not found then
    raise exception 'invitation % does not exist', p_invitation_id;
  end if;
end;
$$;

create or replace function public.research_client_invitation_transition(
  p_invitation_id uuid,
  p_next_state text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_next_state not in ('queued', 'sent', 'expired', 'revoked') then
    raise exception 'system transition door does not accept state %', p_next_state;
  end if;
  update public.research_customer_account_invitations
    set state = p_next_state
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
set search_path = pg_catalog, public
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
alter table public.research_customer_account_invitation_events enable row level security;
alter table public.research_customer_account_invitation_events force row level security;
alter table public.research_product_activation_overlay_audit enable row level security;
alter table public.research_product_activation_overlay_audit force row level security;

revoke all on public.research_client_import_batches from public, anon, authenticated, service_role;
revoke all on public.research_client_import_staging from public, anon, authenticated, service_role;
revoke all on public.research_customer_product_interests from public, anon, authenticated, service_role;
revoke all on public.research_customer_account_invitations from public, anon, authenticated, service_role;
revoke all on public.research_customer_account_invitation_events from public, anon, authenticated, service_role;
revoke all on public.research_product_activation_overlay_audit from public, anon, authenticated, service_role;

-- The audit identity column owns a sequence; nothing may touch it directly.
revoke all on sequence public.research_product_activation_overlay_audit_audit_id_seq
  from public, anon, authenticated, service_role;
revoke all on sequence public.research_customer_account_invitation_events_event_id_seq
  from public, anon, authenticated, service_role;

-- Function execution: revoke the PostgreSQL default PUBLIC EXECUTE and every
-- platform role explicitly, then grant only the three sanctioned doors. This
-- closes inherited/default-ACL ambiguity for every routine this candidate
-- creates without mutating the owner's global default privileges.
revoke all on function public.research_client_invitation_draft(text)
  from public, anon, authenticated, service_role;
revoke all on function public.research_client_invitation_founder_approve(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.research_client_invitation_transition(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.research_client_accounts_append_only()
  from public, anon, authenticated, service_role;
revoke all on function public.research_client_invitation_event_append_only()
  from public, anon, authenticated, service_role;
revoke all on function public.research_client_invitation_record_event()
  from public, anon, authenticated, service_role;
revoke all on function public.research_client_invitation_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.research_client_import_staging_touch()
  from public, anon, authenticated, service_role;
revoke all on function public.research_client_import_staging_freeze()
  from public, anon, authenticated, service_role;
revoke all on function public.research_client_invitation_evidence_hash(
  public.research_client_import_staging,
  text
) from public, anon, authenticated, service_role;

grant insert, select on public.research_client_import_batches to service_role;
grant insert, select, update on public.research_client_import_staging to service_role;
grant insert, select, update, delete on public.research_customer_product_interests to service_role;
-- Invitations: READ only. Writes go through the governed definer functions.
grant select on public.research_customer_account_invitations to service_role;
grant select on public.research_customer_account_invitation_events to service_role;
grant insert, select on public.research_product_activation_overlay_audit to service_role;
grant execute on function public.research_client_invitation_draft(text) to service_role;
grant execute on function public.research_client_invitation_founder_approve(uuid, text) to authenticated;
grant execute on function public.research_client_invitation_transition(uuid, text) to service_role;

commit;
