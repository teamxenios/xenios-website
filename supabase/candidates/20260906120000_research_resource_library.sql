-- CANDIDATE MIGRATION (not applied; not part of any release until named in an
-- exact-SHA production request). Resource Hub V1: Xenios-published materials.
--
-- Direction matters: research_content_assets holds content a PARTNER submitted
-- for review (partner_id NOT NULL). These tables hold materials XENIOS publishes
-- to audiences, so they are a separate authority with no partner author column.
--
-- Rules encoded here, not in prose:
--   * a version's bytes identity (storage_key, sha256, size) is immutable;
--   * at most one current published version per resource;
--   * only published versions can be current;
--   * every delivery attempt is recorded with its outcome;
--   * the bucket is PRIVATE and asserted private; no policy grants anon/auth
--     access to any row or object (service-role, server-side only).

create table if not exists public.research_resource_library (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  purpose text not null check (char_length(purpose) between 10 and 400),
  kind text not null default 'pdf' check (kind in ('pdf')),
  created_at timestamptz not null default now(),
  created_by_admin text not null,
  current_published_version_id uuid null
);

create table if not exists public.research_resource_versions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.research_resource_library(id) on delete restrict,
  version_number integer not null check (version_number >= 1),
  state text not null check (state in ('quarantined','draft','in_review','published','superseded','withdrawn')),
  usage_policy text not null check (usage_policy in ('external_share','private','training','draft')),
  audience text[] not null check (cardinality(audience) >= 1),
  size_bytes integer not null check (size_bytes between 1 and 15728640),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  original_filename text not null check (char_length(original_filename) between 5 and 180),
  content_type text not null check (content_type = 'application/pdf'),
  storage_key text not null unique,
  validation_ok boolean not null,
  validation_reasons text[] not null default '{}',
  uploaded_at timestamptz not null default now(),
  uploaded_by_admin text not null,
  reviewed_at timestamptz null,
  reviewed_by_admin text null,
  review_reason text null,
  published_at timestamptz null,
  published_by_admin text null,
  withdrawn_at timestamptz null,
  withdrawn_by_admin text null,
  withdraw_reason text null,
  supersedes_version_id uuid null references public.research_resource_versions(id),
  change_summary text null check (change_summary is null or char_length(change_summary) <= 400),
  upload_idempotency_key text not null unique,
  unique (resource_id, version_number),
  constraint research_resource_published_is_complete check (
    state <> 'published' or (published_at is not null and published_by_admin is not null and reviewed_at is not null and validation_ok)
  ),
  constraint research_resource_withdrawn_is_complete check (
    state <> 'withdrawn' or (withdrawn_at is not null and withdrawn_by_admin is not null)
  )
);

alter table public.research_resource_library
  drop constraint if exists research_resource_library_current_fk,
  add constraint research_resource_library_current_fk
    foreign key (current_published_version_id) references public.research_resource_versions(id);

-- Bytes identity never changes after insert.
create or replace function public.research_resource_versions_immutable()
returns trigger language plpgsql as $$
begin
  if new.storage_key is distinct from old.storage_key
     or new.sha256 is distinct from old.sha256
     or new.size_bytes is distinct from old.size_bytes
     or new.resource_id is distinct from old.resource_id
     or new.version_number is distinct from old.version_number then
    raise exception 'research_resource_versions: bytes identity is immutable';
  end if;
  return new;
end $$;

drop trigger if exists research_resource_versions_immutable on public.research_resource_versions;
create trigger research_resource_versions_immutable
  before update on public.research_resource_versions
  for each row execute function public.research_resource_versions_immutable();

create table if not exists public.research_resource_deliveries (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.research_resource_library(id),
  version_id uuid null references public.research_resource_versions(id),
  member_id uuid not null,
  requested_at timestamptz not null default now(),
  outcome text not null check (outcome in ('delivered','denied','failed')),
  reason text null
);

create index if not exists research_resource_versions_resource_idx
  on public.research_resource_versions (resource_id, version_number);
create index if not exists research_resource_deliveries_resource_idx
  on public.research_resource_deliveries (resource_id, requested_at desc);
create index if not exists research_resource_deliveries_member_idx
  on public.research_resource_deliveries (member_id, requested_at desc);

-- Service-role only. RLS on with NO policies: anon and authenticated roles can
-- read nothing; every read and write goes through the server.
alter table public.research_resource_library enable row level security;
alter table public.research_resource_versions enable row level security;
alter table public.research_resource_deliveries enable row level security;

-- Private bucket, converged and ASSERTED private (same pattern as the payment
-- proof bucket privacy migration). Skipped on a database without the storage
-- schema (disposable verification database).
do $resource_bucket$
declare
  v_public boolean;
begin
  if pg_catalog.to_regclass('storage.buckets') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('research-resource-library', 'research-resource-library', false)
  on conflict (id) do update set public = false;

  select public into v_public from storage.buckets where id = 'research-resource-library';
  if v_public is distinct from false then
    raise exception 'research-resource-library must be PRIVATE after this migration; found public = %', v_public;
  end if;
end
$resource_bucket$;

-- The two multi-row transitions commit atomically here, with row locks, so a
-- resource can never be observed with a published version that is not current
-- or with a current pointer at a non-published version. Service-role only.
create or replace function public.research_resource_hub_publish(
  p_resource_id uuid,
  p_version_id uuid,
  p_actor text,
  p_at timestamptz
) returns void language plpgsql as $$
declare
  v_previous uuid;
  v_state text;
begin
  select current_published_version_id into v_previous
    from public.research_resource_library where id = p_resource_id for update;
  if not found then
    raise exception 'research_resource_hub_publish: unknown resource %', p_resource_id;
  end if;
  select state into v_state
    from public.research_resource_versions where id = p_version_id and resource_id = p_resource_id for update;
  if not found then
    raise exception 'research_resource_hub_publish: unknown version % for resource %', p_version_id, p_resource_id;
  end if;
  if v_state not in ('in_review', 'published') then
    raise exception 'research_resource_hub_publish: a % version cannot be published', v_state;
  end if;
  update public.research_resource_versions
     set state = 'published',
         published_at = coalesce(published_at, p_at),
         published_by_admin = coalesce(published_by_admin, p_actor)
   where id = p_version_id;
  update public.research_resource_library
     set current_published_version_id = p_version_id
   where id = p_resource_id;
  if v_previous is not null and v_previous <> p_version_id then
    update public.research_resource_versions
       set state = 'superseded'
     where id = v_previous and state = 'published';
  end if;
end $$;

create or replace function public.research_resource_hub_withdraw(
  p_resource_id uuid,
  p_version_id uuid,
  p_actor text,
  p_at timestamptz,
  p_reason text
) returns void language plpgsql as $$
declare
  v_state text;
begin
  perform 1 from public.research_resource_library where id = p_resource_id for update;
  if not found then
    raise exception 'research_resource_hub_withdraw: unknown resource %', p_resource_id;
  end if;
  select state into v_state
    from public.research_resource_versions where id = p_version_id and resource_id = p_resource_id for update;
  if not found then
    raise exception 'research_resource_hub_withdraw: unknown version % for resource %', p_version_id, p_resource_id;
  end if;
  if v_state not in ('published', 'superseded', 'withdrawn') then
    raise exception 'research_resource_hub_withdraw: a % version cannot be withdrawn', v_state;
  end if;
  update public.research_resource_versions
     set state = 'withdrawn',
         withdrawn_at = coalesce(withdrawn_at, p_at),
         withdrawn_by_admin = coalesce(withdrawn_by_admin, p_actor),
         withdraw_reason = coalesce(withdraw_reason, p_reason)
   where id = p_version_id;
  update public.research_resource_library
     set current_published_version_id = null
   where id = p_resource_id and current_published_version_id = p_version_id;
end $$;

revoke execute on function public.research_resource_hub_publish(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.research_resource_hub_withdraw(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;

comment on table public.research_resource_library is
  'Xenios-published materials (Resource Hub). Separate from partner-submitted research_content_assets.';
comment on table public.research_resource_versions is
  'Immutable versions of a resource: bytes identity fixed at insert; one current published version per resource.';
comment on table public.research_resource_deliveries is
  'Every partner delivery attempt with its outcome; only a completed byte read is delivered.';
