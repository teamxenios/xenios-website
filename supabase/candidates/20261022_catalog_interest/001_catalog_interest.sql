-- Candidate only. Do not apply to a managed environment until the canonical
-- outbox worker has reviewed catalog_interest_customer/team renderers.
-- This function is service-role-only and is the single transaction boundary
-- for the lead, consent snapshot, and exactly two canonical outbox jobs.

create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;

do $$
begin
  if to_regclass('public.research_notification_outbox') is null then
    raise exception 'research_notification_outbox prerequisite is missing';
  end if;
end
$$;

create table if not exists public.catalog_interest_leads (
  id                    uuid primary key default gen_random_uuid(),
  request_id            uuid not null unique,
  request_fingerprint   text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  email                 text not null check (
                          email = lower(btrim(email))
                          and length(email) between 3 and 320
                          and position('@' in email) > 1
                        ),
  receipt               text not null unique check (receipt ~ '^XHC-[A-Z0-9]{12}$'),
  status                text not null check (status in ('queued', 'manual_review')),
  catalog_revision      text not null,
  catalog_url           text not null,
  catalog_approved_at   timestamptz not null,
  catalog_expires_at    timestamptz not null,
  catalog_revoked_at    timestamptz,
  authority_state       text not null check (authority_state in ('approved', 'manual_review')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.catalog_interest_consents (
  id                       uuid primary key default gen_random_uuid(),
  lead_id                  uuid not null unique references public.catalog_interest_leads(id) on delete restrict,
  catalog_delivery_requested boolean not null check (catalog_delivery_requested),
  delivery_notice_version text not null,
  marketing_opt_in        boolean not null default false,
  marketing_notice_version text,
  recorded_at              timestamptz not null default now(),
  check (
    (marketing_opt_in and marketing_notice_version is not null)
    or (not marketing_opt_in and marketing_notice_version is null)
  )
);

alter table public.catalog_interest_leads enable row level security;
alter table public.catalog_interest_consents enable row level security;
alter table public.catalog_interest_leads force row level security;
alter table public.catalog_interest_consents force row level security;

revoke all on table public.catalog_interest_leads from public, anon, authenticated, service_role;
revoke all on table public.catalog_interest_consents from public, anon, authenticated, service_role;

create or replace function public.record_catalog_interest(
  p_request_id uuid,
  p_fingerprint text,
  p_email text,
  p_marketing_consent boolean,
  p_delivery_notice_version text,
  p_marketing_notice_version text,
  p_catalog_revision text,
  p_catalog_url text,
  p_catalog_approved_at timestamptz,
  p_catalog_expires_at timestamptz,
  p_catalog_revoked_at timestamptz,
  p_authority_state text,
  p_team_recipient text,
  p_customer_event_key text,
  p_team_event_key text,
  p_customer_event_type text,
  p_team_event_type text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_team_recipient text := lower(btrim(p_team_recipient));
  v_expected_fingerprint text;
  v_lead public.catalog_interest_leads%rowtype;
  v_receipt text;
  v_status text;
  v_authority_state text;
  v_payload jsonb;
begin
  if p_request_id is null
     or p_fingerprint is null
     or p_email is null
     or p_marketing_consent is null
     or p_delivery_notice_version is null
     or p_catalog_revision is null
     or p_catalog_url is null
     or p_catalog_approved_at is null
     or p_catalog_expires_at is null
     or p_authority_state is null
     or p_team_recipient is null
     or p_customer_event_key is null
     or p_team_event_key is null
     or p_customer_event_type is null
     or p_team_event_type is null
  then
    raise exception 'invalid catalog interest input' using errcode = '22023';
  end if;

  if p_delivery_notice_version <> 'catalog_delivery_notice_v1'
     or p_customer_event_type <> 'catalog_interest_customer'
     or p_team_event_type <> 'catalog_interest_team'
     or p_customer_event_key <> 'catalog-interest:' || p_request_id::text || ':customer'
     or p_team_event_key <> 'catalog-interest:' || p_request_id::text || ':team'
     or p_catalog_revision !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$'
     or p_catalog_url !~ '^https://(www\.)?xeniostechnology\.com(?:/[^?#]*)?$'
     or p_catalog_approved_at > now()
     or p_catalog_expires_at <= p_catalog_approved_at
     or (p_catalog_revoked_at is not null and p_catalog_revoked_at < p_catalog_approved_at)
     or p_authority_state not in ('approved', 'manual_review')
     or length(v_email) not between 3 and 320
     or position('@' in v_email) <= 1
     or length(v_team_recipient) not between 3 and 320
     or position('@' in v_team_recipient) <= 1
     or (p_marketing_consent and p_marketing_notice_version <> 'catalog_marketing_opt_in_v1')
     or (not p_marketing_consent and p_marketing_notice_version is not null)
  then
    raise exception 'invalid catalog interest input' using errcode = '22023';
  end if;

  v_expected_fingerprint := encode(extensions.digest(
    v_email || E'\n'
      || case when p_marketing_consent then '1' else '0' end || E'\n'
      || p_delivery_notice_version || E'\n'
      || p_catalog_revision,
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select * into v_lead
    from public.catalog_interest_leads
    where request_id = p_request_id;

  if found then
    if v_lead.request_fingerprint is distinct from v_expected_fingerprint
       or p_fingerprint is distinct from v_expected_fingerprint
    then
      return jsonb_build_object('ok', false, 'code', 'request_conflict');
    end if;
    return jsonb_build_object(
      'ok', true,
      'receipt', v_lead.receipt,
      'status', v_lead.status,
      'catalogRevision', v_lead.catalog_revision,
      'replayed', true
    );
  end if;

  if p_fingerprint is distinct from v_expected_fingerprint then
    raise exception 'catalog interest fingerprint mismatch' using errcode = '22023';
  end if;

  v_authority_state := case
    when p_authority_state = 'manual_review'
      or p_catalog_revoked_at is not null
      or p_catalog_expires_at <= now()
      then 'manual_review'
    else 'approved'
  end;
  v_status := case when v_authority_state = 'approved' then 'queued' else 'manual_review' end;
  v_receipt := 'XHC-' || upper(substr(encode(extensions.digest(p_request_id::text, 'sha256'), 'hex'), 1, 12));

  insert into public.catalog_interest_leads (
    request_id, request_fingerprint, email, receipt, status,
    catalog_revision, catalog_url, catalog_approved_at, catalog_expires_at,
    catalog_revoked_at, authority_state
  ) values (
    p_request_id, p_fingerprint, v_email, v_receipt, v_status,
    p_catalog_revision, p_catalog_url, p_catalog_approved_at, p_catalog_expires_at,
    p_catalog_revoked_at, v_authority_state
  ) returning * into v_lead;

  insert into public.catalog_interest_consents (
    lead_id, catalog_delivery_requested, delivery_notice_version,
    marketing_opt_in, marketing_notice_version
  ) values (
    v_lead.id, true, p_delivery_notice_version,
    p_marketing_consent, p_marketing_notice_version
  );

  v_payload := jsonb_build_object(
    'schemaVersion', 1,
    'receipt', v_receipt,
    'email', v_email,
    'catalog', jsonb_build_object(
      'revision', p_catalog_revision,
      'url', p_catalog_url,
      'approvedAt', p_catalog_approved_at,
      'expiresAt', p_catalog_expires_at,
      'revokedAt', p_catalog_revoked_at,
      'state', v_authority_state
    )
  );

  insert into public.research_notification_outbox (
    event_key, application_id, member_id, event_type, channel,
    recipient, template_key, payload, status,
    last_error_code, last_error_summary, completed_at
  ) values (
    p_customer_event_key, null, null, p_customer_event_type, 'email',
    v_email, 'catalog_interest_customer', v_payload,
    case when v_authority_state = 'approved' then 'pending' else 'cancelled' end,
    case when v_authority_state = 'approved' then null else 'catalog_authority_manual_review' end,
    case when v_authority_state = 'approved' then null else 'Catalog authority expired or was revoked; customer delivery requires manual review.' end,
    case when v_authority_state = 'approved' then null else now() end
  );

  -- Intentionally separate from the customer insert. Any failure here raises
  -- from the function and PostgreSQL rolls back the lead, consent, and first
  -- job with the surrounding statement transaction.
  insert into public.research_notification_outbox (
    event_key, application_id, member_id, event_type, channel,
    recipient, template_key, payload, status
  ) values (
    p_team_event_key, null, null, p_team_event_type, 'email',
    v_team_recipient, 'catalog_interest_team',
    v_payload || jsonb_build_object('marketingConsent', p_marketing_consent),
    'pending'
  );

  return jsonb_build_object(
    'ok', true,
    'receipt', v_receipt,
    'status', v_status,
    'catalogRevision', p_catalog_revision,
    'replayed', false
  );
end
$$;

revoke all on function public.record_catalog_interest(
  uuid, text, text, boolean, text, text, text, text, timestamptz,
  timestamptz, timestamptz, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_catalog_interest(
  uuid, text, text, boolean, text, text, text, text, timestamptz,
  timestamptz, timestamptz, text, text, text, text, text, text
) to service_role;
