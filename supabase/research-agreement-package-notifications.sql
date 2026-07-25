-- Durable, transition-bound intent for the consolidated Research agreement
-- package emails. Apply only after the application release that suppresses
-- historical per-document completion messages is Live.
--
-- A candidate is written in the SAME transaction as the legal acceptance:
--   * clickwrap/native signatures: AFTER INSERT on the immutable signature row
--   * external provider: AFTER UPDATE when the provider request completes
-- The application then proves that removing this exact acceptance changes the
-- required package from incomplete to complete. Existing historical records
-- are intentionally not backfilled, so this migration cannot send old members
-- a surprise package-completion email.

create extension if not exists "pgcrypto";

create table if not exists public.research_fm_agreement_email_candidates (
  id                    uuid primary key default gen_random_uuid(),
  member_id             text not null,
  source_kind           text not null check (source_kind in ('signature','provider_completion')),
  source_id             text not null,
  accepted_version_ids  jsonb not null check (jsonb_typeof(accepted_version_ids) = 'array'),
  publication_snapshot  jsonb not null check (jsonb_typeof(publication_snapshot) = 'array'),
  completed_at          timestamptz not null,
  status                text not null default 'pending'
                          check (status in ('pending','processed','ignored')),
  package_version       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  processed_at          timestamptz,
  unique (source_kind, source_id)
);

create index if not exists research_fm_agreement_email_candidates_pending_idx
  on public.research_fm_agreement_email_candidates (status, created_at);

alter table public.research_fm_agreement_email_candidates enable row level security;
revoke all on table public.research_fm_agreement_email_candidates from public, anon, authenticated;

create or replace function public.research_fm_current_agreement_publication_snapshot()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'category', category,
        'id', id::text,
        'title', title,
        'semver', semver,
        'contentHash', content_hash,
        'requirement', requirement,
        'reacceptanceRequired', reacceptance_required
      )
      order by category
    ),
    '[]'::jsonb
  )
  from public.research_fm_document_versions
  where status = 'published';
$$;

create or replace function public.research_fm_capture_signature_email_candidate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.research_fm_agreement_email_candidates (
    member_id, source_kind, source_id, accepted_version_ids,
    publication_snapshot, completed_at
  ) values (
    new.member_id::text,
    'signature',
    new.id::text,
    jsonb_build_array(new.document_version_id::text),
    public.research_fm_current_agreement_publication_snapshot(),
    new.signed_at
  )
  on conflict (source_kind, source_id) do nothing;
  return new;
end;
$$;

drop trigger if exists research_fm_signature_email_candidate
  on public.research_fm_document_signatures;
create trigger research_fm_signature_email_candidate
  after insert on public.research_fm_document_signatures
  for each row execute function public.research_fm_capture_signature_email_candidate();

create or replace function public.research_fm_capture_provider_email_candidate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.provider <> 'xenios_native'
     and new.signing_link_status = 'completed'
     and old.signing_link_status is distinct from 'completed' then
    insert into public.research_fm_agreement_email_candidates (
      member_id, source_kind, source_id, accepted_version_ids,
      publication_snapshot, completed_at
    ) values (
      new.member_id::text,
      'provider_completion',
      new.id::text,
      new.xenios_document_version_ids,
      public.research_fm_current_agreement_publication_snapshot(),
      coalesce(new.completed_at, new.signed_at, now())
    )
    on conflict (source_kind, source_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists research_fm_provider_email_candidate
  on public.research_fm_esign_requests;
create trigger research_fm_provider_email_candidate
  after update on public.research_fm_esign_requests
  for each row execute function public.research_fm_capture_provider_email_candidate();

-- One strict database snapshot for transition evaluation. Supabase read
-- adapters used elsewhere intentionally fail closed to empty arrays; this RPC
-- instead returns an error on any database fault, so the worker can never
-- mistake a transient read failure for proof of a transition.
create or replace function public.research_fm_agreement_email_candidate_context(
  p_candidate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_candidate public.research_fm_agreement_email_candidates%rowtype;
begin
  select *
    into v_candidate
    from public.research_fm_agreement_email_candidates
   where id = p_candidate_id;
  if not found then
    raise exception 'agreement email candidate not found';
  end if;

  return jsonb_build_object(
    'candidate', jsonb_build_object(
      'id', v_candidate.id::text,
      'memberId', v_candidate.member_id,
      'sourceKind', v_candidate.source_kind,
      'sourceId', v_candidate.source_id,
      'completedAt', v_candidate.completed_at,
      'publicationSnapshot', v_candidate.publication_snapshot
    ),
    'timeline', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id::text,
          'sourceKind', c.source_kind,
          'sourceId', c.source_id,
          'createdAt', c.created_at
        )
        order by c.created_at, c.id
      )
      from public.research_fm_agreement_email_candidates c
      where c.member_id = v_candidate.member_id
    ), '[]'::jsonb),
    'signatures', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sourceId', s.id::text,
          'versionId', s.document_version_id::text,
          'acceptedAt', s.signed_at
        )
      )
      from public.research_fm_document_signatures s
      where s.member_id::text = v_candidate.member_id
    ), '[]'::jsonb),
    'providerCompletions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sourceId', r.id::text,
          'versionIds', r.xenios_document_version_ids,
          'acceptedAt', coalesce(r.completed_at, r.signed_at, r.updated_at)
        )
      )
      from public.research_fm_esign_requests r
      where r.member_id = v_candidate.member_id
        and r.provider <> 'xenios_native'
        and r.signing_link_status = 'completed'
    ), '[]'::jsonb),
    'versions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id::text,
          'category', d.category,
          'title', d.title,
          'semver', d.semver,
          'contentHash', d.content_hash
        )
      )
      from public.research_fm_document_versions d
    ), '[]'::jsonb)
  );
end;
$$;

-- Both audience rows and the candidate transition commit together. A failure
-- (including a missing recipient) leaves the candidate pending for the worker.
create or replace function public.research_fm_complete_agreement_email_candidate(
  p_candidate_id uuid,
  p_package_version text,
  p_member_recipient text,
  p_admin_recipient text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.research_fm_agreement_email_candidates%rowtype;
begin
  select *
    into v_candidate
    from public.research_fm_agreement_email_candidates
   where id = p_candidate_id
     and status = 'pending'
   for update;

  if not found then
    return false;
  end if;
  if nullif(btrim(p_package_version), '') is null
     or nullif(btrim(p_member_recipient), '') is null
     or nullif(btrim(p_admin_recipient), '') is null then
    raise exception 'agreement email candidate requires package and both recipients';
  end if;

  insert into public.research_notification_outbox (
    event_key, member_id, event_type, channel, recipient, template_key, payload
  ) values
  (
    'research_agreement_package_completed_member:' || v_candidate.member_id || ':' || p_package_version,
    v_candidate.member_id::uuid,
    'research_agreement_package_completed',
    'email',
    p_member_recipient,
    'fm_agreement_package_completed_member',
    p_payload
  ),
  (
    'research_agreement_package_completed_admin:' || v_candidate.member_id || ':' || p_package_version,
    v_candidate.member_id::uuid,
    'research_agreement_package_completed',
    'email',
    p_admin_recipient,
    'fm_admin_agreement_package_completed',
    p_payload
  )
  on conflict (event_key) do nothing;

  update public.research_fm_agreement_email_candidates
     set status = 'ignored',
         processed_at = now(),
         updated_at = now()
   where member_id = v_candidate.member_id
     and status = 'pending'
     and id <> v_candidate.id
     and (created_at, id) <= (v_candidate.created_at, v_candidate.id);

  update public.research_fm_agreement_email_candidates
     set status = 'processed',
         package_version = p_package_version,
         processed_at = now(),
         updated_at = now()
   where id = v_candidate.id;
  return true;
end;
$$;

create or replace function public.research_fm_ignore_agreement_email_candidate(
  p_candidate_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.research_fm_agreement_email_candidates
     set status = 'ignored', processed_at = now(), updated_at = now()
   where id = p_candidate_id and status = 'pending'
  returning true;
$$;

revoke all on function public.research_fm_capture_signature_email_candidate()
  from public, anon, authenticated;
revoke all on function public.research_fm_capture_provider_email_candidate()
  from public, anon, authenticated;
revoke all on function public.research_fm_current_agreement_publication_snapshot()
  from public, anon, authenticated;
revoke all on function public.research_fm_agreement_email_candidate_context(uuid)
  from public, anon, authenticated;
revoke all on function public.research_fm_complete_agreement_email_candidate(uuid,text,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.research_fm_ignore_agreement_email_candidate(uuid)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.research_fm_complete_agreement_email_candidate(uuid,text,text,text,jsonb)
      to service_role;
    grant execute on function public.research_fm_ignore_agreement_email_candidate(uuid)
      to service_role;
    grant execute on function public.research_fm_agreement_email_candidate_context(uuid)
      to service_role;
  end if;
end
$$;
