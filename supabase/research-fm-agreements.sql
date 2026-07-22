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
