-- UNAPPLIED CANDIDATE — Xenios Research assisted-order audit store v1.
--
-- This artifact is deliberately outside docs/coordination/MIGRATION_DAG.json.
-- It must not be promoted or applied without the Lead's exact-SHA release
-- process and explicit production authority. The application remains
-- unavailable until this schema, its attestation RPC, and the dedicated actor
-- HMAC key configuration all resolve exactly.

create or replace function public.research_assisted_order_audit_evidence_valid(
  p_event_type text,
  p_evidence jsonb
) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item text;
  v_seen text[];
begin
  if jsonb_typeof(p_evidence) is distinct from 'object' then
    return false;
  end if;

  case p_event_type
    when 'assisted_order.submitted' then
      if not (p_evidence ?& array['lineCount', 'workflowModes', 'requestFingerprint'])
         or p_evidence - array['lineCount', 'workflowModes', 'requestFingerprint'] <> '{}'::jsonb
         or jsonb_typeof(p_evidence -> 'lineCount') is distinct from 'number'
         or (p_evidence ->> 'lineCount') !~ '^[0-9]{1,3}$'
         or (p_evidence ->> 'lineCount')::integer not between 1 and 200
         or jsonb_typeof(p_evidence -> 'workflowModes') is distinct from 'array'
         or jsonb_array_length(p_evidence -> 'workflowModes') not between 1 and 5
         or jsonb_typeof(p_evidence -> 'requestFingerprint') is distinct from 'string'
         or (p_evidence ->> 'requestFingerprint') !~ '^[0-9a-f]{64}$' then
        return false;
      end if;
      v_seen := array[]::text[];
      for v_item in select jsonb_array_elements_text(p_evidence -> 'workflowModes') loop
        if v_item not in (
          'direct_order_request',
          'provider_request',
          'request_pricing',
          'request_activation',
          'availability_review'
        ) or v_item = any(v_seen) then
          return false;
        end if;
        v_seen := array_append(v_seen, v_item);
      end loop;
      return true;

    when 'assisted_order.status_changed' then
      if not (p_evidence ?& array['from', 'to', 'authorityEvidenceKinds'])
         or p_evidence - array['from', 'to', 'authorityEvidenceKinds'] <> '{}'::jsonb
         or jsonb_typeof(p_evidence -> 'from') is distinct from 'string'
         or jsonb_typeof(p_evidence -> 'to') is distinct from 'string'
         or (p_evidence ->> 'from') not in (
           'submitted', 'reviewing', 'waiting_on_customer', 'identity_requested',
           'identity_received', 'agreements_pending', 'agreements_complete',
           'payment_pending', 'payment_review', 'paid', 'supplier_processing',
           'shipped', 'delivered', 'closed', 'cancelled'
         )
         or (p_evidence ->> 'to') not in (
           'submitted', 'reviewing', 'waiting_on_customer', 'identity_requested',
           'identity_received', 'agreements_pending', 'agreements_complete',
           'payment_pending', 'payment_review', 'paid', 'supplier_processing',
           'shipped', 'delivered', 'closed', 'cancelled'
         )
         or (p_evidence ->> 'from') = (p_evidence ->> 'to')
         or jsonb_typeof(p_evidence -> 'authorityEvidenceKinds') is distinct from 'array'
         or jsonb_array_length(p_evidence -> 'authorityEvidenceKinds') > 5 then
        return false;
      end if;
      v_seen := array[]::text[];
      for v_item in select jsonb_array_elements_text(p_evidence -> 'authorityEvidenceKinds') loop
        if v_item not in (
          'agreement_attestation',
          'payment_verification',
          'supplier_assignment',
          'tracking',
          'cancellation_reason_present'
        ) or v_item = any(v_seen) then
          return false;
        end if;
        v_seen := array_append(v_seen, v_item);
      end loop;
      return true;

    when 'assisted_order.document_upload_authorized' then
      return
        p_evidence ?& array['documentId', 'documentType', 'side', 'mimeType', 'sizeBytes']
        and p_evidence - array['documentId', 'documentType', 'side', 'mimeType', 'sizeBytes'] = '{}'::jsonb
        and jsonb_typeof(p_evidence -> 'documentId') = 'string'
        and (p_evidence ->> 'documentId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and jsonb_typeof(p_evidence -> 'documentType') = 'string'
        and (p_evidence ->> 'documentType') in ('government_id', 'business_document', 'other')
        and jsonb_typeof(p_evidence -> 'side') = 'string'
        and (p_evidence ->> 'side') in ('front', 'back', 'single')
        and jsonb_typeof(p_evidence -> 'mimeType') = 'string'
        and (p_evidence ->> 'mimeType') in ('image/jpeg', 'image/png', 'application/pdf')
        and jsonb_typeof(p_evidence -> 'sizeBytes') = 'number'
        and (p_evidence ->> 'sizeBytes') ~ '^[0-9]{1,8}$'
        and (p_evidence ->> 'sizeBytes')::integer between 1 and 15728640;

    when 'assisted_order.document_upload_completion_authorized' then
      return
        p_evidence ?& array['documentId', 'documentType', 'sizeBytes']
        and p_evidence - array['documentId', 'documentType', 'sizeBytes'] = '{}'::jsonb
        and jsonb_typeof(p_evidence -> 'documentId') = 'string'
        and (p_evidence ->> 'documentId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and jsonb_typeof(p_evidence -> 'documentType') = 'string'
        and (p_evidence ->> 'documentType') in ('government_id', 'business_document', 'other')
        and jsonb_typeof(p_evidence -> 'sizeBytes') = 'number'
        and (p_evidence ->> 'sizeBytes') ~ '^[0-9]{1,8}$'
        and (p_evidence ->> 'sizeBytes')::integer between 1 and 15728640;

    when 'assisted_order.document_download_authorized' then
      return
        p_evidence ? 'documentId'
        and p_evidence - 'documentId' = '{}'::jsonb
        and jsonb_typeof(p_evidence -> 'documentId') = 'string'
        and (p_evidence ->> 'documentId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    else
      return false;
  end case;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.research_assisted_order_audit_evidence_valid(text, jsonb)
  from public, anon, authenticated, service_role;

create table if not exists public.research_assisted_order_audit_events_v1 (
  event_id uuid primary key,
  event_key text not null unique,
  event_fingerprint text not null,
  event_type text not null,
  request_id uuid not null references public.research_assisted_order_requests(id)
    on update restrict on delete restrict,
  actor_type text not null,
  actor_alias text,
  evidence jsonb not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  schema_version text not null,
  attestation text not null,

  constraint research_assisted_order_audit_event_key_chk
    check (
      event_key = 'assisted-order-audit:v1:' || event_id::text
      and length(event_key) = 60
    ),
  constraint research_assisted_order_audit_fingerprint_chk
    check (event_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint research_assisted_order_audit_event_type_chk
    check (event_type in (
      'assisted_order.submitted',
      'assisted_order.status_changed',
      'assisted_order.document_upload_authorized',
      'assisted_order.document_upload_completion_authorized',
      'assisted_order.document_download_authorized'
    )),
  constraint research_assisted_order_audit_actor_type_chk
    check (actor_type in ('member', 'early_access_session', 'admin', 'system')),
  constraint research_assisted_order_audit_actor_alias_chk
    check (
      (actor_type = 'system' and actor_alias is null)
      or
      (actor_type <> 'system' and actor_alias ~ '^aa1:[a-z0-9](?:[a-z0-9_-]{0,30}[a-z0-9])?:[0-9a-f]{64}$')
    ),
  constraint research_assisted_order_audit_evidence_chk
    check (public.research_assisted_order_audit_evidence_valid(event_type, evidence)),
  constraint research_assisted_order_audit_schema_chk
    check (schema_version = 'research_assisted_order_audit_v1'),
  constraint research_assisted_order_audit_attestation_chk
    check (
      attestation = 'research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694'
    )
);

create index if not exists research_assisted_order_audit_request_time_idx
  on public.research_assisted_order_audit_events_v1 (request_id, occurred_at, event_id);

alter table public.research_assisted_order_audit_events_v1 enable row level security;
alter table public.research_assisted_order_audit_events_v1 force row level security;

revoke all on table public.research_assisted_order_audit_events_v1
  from public, anon, authenticated, service_role;

create or replace function public.research_assisted_order_audit_reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'research_assisted_order_audit_append_only'
    using errcode = '55000';
end;
$$;

revoke all on function public.research_assisted_order_audit_reject_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists research_assisted_order_audit_no_row_mutation
  on public.research_assisted_order_audit_events_v1;
create trigger research_assisted_order_audit_no_row_mutation
before update or delete on public.research_assisted_order_audit_events_v1
for each row execute function public.research_assisted_order_audit_reject_mutation();

drop trigger if exists research_assisted_order_audit_no_truncate
  on public.research_assisted_order_audit_events_v1;
create trigger research_assisted_order_audit_no_truncate
before truncate on public.research_assisted_order_audit_events_v1
for each statement execute function public.research_assisted_order_audit_reject_mutation();

create or replace function public.research_assisted_order_audit_authority()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 'research_assisted_order_audit_v1',
    'attestation', 'research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694',
    'eventTypes', jsonb_build_array(
      'assisted_order.submitted',
      'assisted_order.status_changed',
      'assisted_order.document_upload_authorized',
      'assisted_order.document_upload_completion_authorized',
      'assisted_order.document_download_authorized'
    ),
    'actorTypes', jsonb_build_array('member', 'early_access_session', 'admin', 'system'),
    'evidencePolicy', 'bounded_allowlist_v1',
    'actorIdentityPolicy', 'hmac_sha256_alias_v1',
    'appendOnly', true
  );
$$;

revoke all on function public.research_assisted_order_audit_authority()
  from public, anon, authenticated, service_role;
grant execute on function public.research_assisted_order_audit_authority()
  to service_role;

create or replace function public.research_assisted_order_audit_append(
  p_schema_version text,
  p_attestation text,
  p_event jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_event_key text;
  v_event_fingerprint text;
  v_event_type text;
  v_request_id uuid;
  v_actor_type text;
  v_actor_alias text;
  v_evidence jsonb;
  v_occurred_at timestamptz;
  v_existing public.research_assisted_order_audit_events_v1%rowtype;
  v_state text;
  v_matches integer;
begin
  if p_schema_version is distinct from 'research_assisted_order_audit_v1'
     or p_attestation is distinct from 'research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694' then
    raise exception 'research_assisted_order_audit_authority_mismatch'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_event) is distinct from 'object'
     or not (p_event ?& array[
       'eventId', 'eventKey', 'eventFingerprint', 'eventType', 'requestId',
       'actorType', 'actorAlias', 'evidence', 'occurredAt'
     ])
     or p_event - array[
       'eventId', 'eventKey', 'eventFingerprint', 'eventType', 'requestId',
       'actorType', 'actorAlias', 'evidence', 'occurredAt'
     ] <> '{}'::jsonb then
    raise exception 'research_assisted_order_audit_invalid_event'
      using errcode = '22023';
  end if;

  begin
    v_event_id := (p_event ->> 'eventId')::uuid;
    v_event_key := p_event ->> 'eventKey';
    v_event_fingerprint := p_event ->> 'eventFingerprint';
    v_event_type := p_event ->> 'eventType';
    v_request_id := (p_event ->> 'requestId')::uuid;
    v_actor_type := p_event ->> 'actorType';
    v_actor_alias := p_event ->> 'actorAlias';
    v_evidence := p_event -> 'evidence';
    v_occurred_at := (p_event ->> 'occurredAt')::timestamptz;
  exception
    when others then
      raise exception 'research_assisted_order_audit_invalid_event'
        using errcode = '22023';
  end;

  if p_event ->> 'eventId' is distinct from v_event_id::text
     or p_event ->> 'requestId' is distinct from v_request_id::text
     or v_event_key is distinct from 'assisted-order-audit:v1:' || v_event_id::text
     or v_event_fingerprint !~ '^[0-9a-f]{64}$'
     or v_event_type not in (
       'assisted_order.submitted',
       'assisted_order.status_changed',
       'assisted_order.document_upload_authorized',
       'assisted_order.document_upload_completion_authorized',
       'assisted_order.document_download_authorized'
     )
     or v_actor_type not in ('member', 'early_access_session', 'admin', 'system')
     or (
       (v_actor_type = 'system' and v_actor_alias is not null)
       or
       (v_actor_type <> 'system' and coalesce(v_actor_alias, '') !~ '^aa1:[a-z0-9](?:[a-z0-9_-]{0,30}[a-z0-9])?:[0-9a-f]{64}$')
     )
     or not public.research_assisted_order_audit_evidence_valid(v_event_type, v_evidence)
     or (p_event ->> 'occurredAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
     or v_occurred_at < timestamptz '2026-01-01 00:00:00+00'
     or v_occurred_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'research_assisted_order_audit_invalid_event'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_event_key, 0));

  select count(*)::integer
    into v_matches
    from public.research_assisted_order_audit_events_v1
   where event_id = v_event_id or event_key = v_event_key;

  if v_matches > 1 then
    raise exception 'research_assisted_order_audit_conflicting_duplicate'
      using errcode = '23505';
  end if;

  select *
    into v_existing
    from public.research_assisted_order_audit_events_v1
   where event_id = v_event_id or event_key = v_event_key
   limit 1
   for update;

  if found then
    if v_existing.event_id is distinct from v_event_id
       or v_existing.event_key is distinct from v_event_key
       or v_existing.event_fingerprint is distinct from v_event_fingerprint
       or v_existing.event_type is distinct from v_event_type
       or v_existing.request_id is distinct from v_request_id
       or v_existing.actor_type is distinct from v_actor_type
       or v_existing.actor_alias is distinct from v_actor_alias
       or v_existing.evidence is distinct from v_evidence
       or v_existing.occurred_at is distinct from v_occurred_at
       or v_existing.schema_version is distinct from p_schema_version
       or v_existing.attestation is distinct from p_attestation then
      raise exception 'research_assisted_order_audit_conflicting_duplicate'
        using errcode = '23505';
    end if;
    v_state := 'replayed';
  else
    insert into public.research_assisted_order_audit_events_v1 (
      event_id,
      event_key,
      event_fingerprint,
      event_type,
      request_id,
      actor_type,
      actor_alias,
      evidence,
      occurred_at,
      schema_version,
      attestation
    ) values (
      v_event_id,
      v_event_key,
      v_event_fingerprint,
      v_event_type,
      v_request_id,
      v_actor_type,
      v_actor_alias,
      v_evidence,
      v_occurred_at,
      p_schema_version,
      p_attestation
    );
    v_state := 'inserted';
  end if;

  return jsonb_build_object(
    'state', v_state,
    'eventId', v_event_id::text,
    'eventKey', v_event_key,
    'requestId', v_request_id::text,
    'eventType', v_event_type,
    'eventFingerprint', v_event_fingerprint,
    'schemaVersion', p_schema_version,
    'attestation', p_attestation
  );
end;
$$;

revoke all on function public.research_assisted_order_audit_append(text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.research_assisted_order_audit_append(text, text, jsonb)
  to service_role;
