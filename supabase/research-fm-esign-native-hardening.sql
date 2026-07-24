-- xenios research: native e-sign attempt isolation and concurrency hardening.
-- Additive/idempotent. No legal rows are rewritten and RLS is unchanged.

alter table public.research_fm_esign_requests
  add column if not exists native_intent_hash text,
  add column if not exists native_attempt_id uuid;

alter table public.research_fm_esign_requests
  drop constraint if exists research_fm_esign_requests_native_intent_hash_check;
alter table public.research_fm_esign_requests
  add constraint research_fm_esign_requests_native_intent_hash_check
  check (native_intent_hash is null or native_intent_hash ~ '^[0-9a-f]{64}$');

do $$
begin
  if exists (
    select 1
      from public.research_fm_esign_requests
     where provider = 'xenios_native'
       and native_completion_state in ('preparing', 'evidence_stored', 'completed')
     group by member_id, (xenios_document_version_ids ->> 0)
    having count(*) > 1
  ) then
    raise exception 'native esign hardening refused: duplicate live member/version requests exist';
  end if;
end $$;

create unique index if not exists research_fm_esign_requests_native_live_unique
  on public.research_fm_esign_requests (member_id, ((xenios_document_version_ids ->> 0)))
  where provider = 'xenios_native'
    and native_completion_state in ('preparing', 'evidence_stored', 'completed');

do $$
begin
  if exists (
    select 1
      from public.research_fm_esign_archive
     where provider = 'xenios_native' and document_version_id is not null
     group by member_id, document_version_id
    having count(*) > 1
  ) then
    raise exception 'native esign hardening refused: duplicate native archives exist';
  end if;
end $$;

create unique index if not exists research_fm_esign_archive_native_version_unique
  on public.research_fm_esign_archive (member_id, document_version_id)
  where provider = 'xenios_native' and document_version_id is not null;

create or replace function public.research_fm_native_esign_claim(
  p_request_id uuid,
  p_attempt_id uuid,
  p_intent_hash text,
  p_member_id text,
  p_document_version_id text,
  p_source_content_hash text,
  p_idempotency_key text,
  p_signer_identifier text,
  p_created_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.research_fm_esign_requests%rowtype;
begin
  if p_intent_hash !~ '^[0-9a-f]{64}$'
     or p_source_content_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'claim_error');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_member_id || ':' || p_document_version_id, 0));

  select * into v_req
    from public.research_fm_esign_requests
   where member_id = p_member_id and idempotency_key = p_idempotency_key
   for update;

  if found then
    if (v_req.xenios_document_version_ids ->> 0) is distinct from p_document_version_id
       or v_req.native_intent_hash is distinct from p_intent_hash then
      return jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
    end if;
    if v_req.native_completion_state = 'completed' then
      return jsonb_build_object(
        'ok', true, 'code', 'already_completed', 'request_id', v_req.id,
        'created_at', v_req.created_at
      );
    end if;
    if v_req.native_completion_state is distinct from 'failed_cleanup_required' then
      return jsonb_build_object('ok', false, 'code', 'in_progress');
    end if;

    update public.research_fm_esign_requests
       set native_completion_state = 'preparing',
           native_attempt_id = p_attempt_id,
           native_intent_hash = p_intent_hash,
           source_content_hashes = jsonb_build_array(p_source_content_hash),
           signer_identifier = p_signer_identifier,
           signing_link_status = 'created',
           signed_at = null, completed_at = null,
           signed_pdf_ref = null, certificate_ref = null,
           signed_pdf_hash = null, certificate_hash = null,
           verified_event_ids = '[]'::jsonb,
           provider_event_history = '[]'::jsonb,
           xenios_acceptance_event_ids = '[]'::jsonb,
           updated_at = now()
     where id = v_req.id;
    return jsonb_build_object(
      'ok', true, 'code', 'claimed', 'request_id', v_req.id,
      'created_at', v_req.created_at
    );
  end if;

  select * into v_req
    from public.research_fm_esign_requests
   where member_id = p_member_id
     and provider = 'xenios_native'
     and (xenios_document_version_ids ->> 0) = p_document_version_id
     and native_completion_state in ('preparing', 'evidence_stored', 'completed')
   for update;

  if found then
    if v_req.native_completion_state = 'completed' then
      return jsonb_build_object(
        'ok', true, 'code', 'already_completed', 'request_id', v_req.id,
        'created_at', v_req.created_at
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'in_progress');
  end if;

  insert into public.research_fm_esign_requests (
    id, tenant, member_id, packet_or_document_id, mode, provider,
    xenios_document_version_ids, source_content_hashes, signer_identifier,
    signing_link_status, native_completion_state, native_intent_hash,
    native_attempt_id, idempotency_key, created_at, updated_at
  ) values (
    p_request_id, 'xenios_research', p_member_id, p_document_version_id,
    'esign_document', 'xenios_native', jsonb_build_array(p_document_version_id),
    jsonb_build_array(p_source_content_hash), p_signer_identifier, 'created',
    'preparing', p_intent_hash, p_attempt_id, p_idempotency_key, p_created_at, p_created_at
  );

  return jsonb_build_object(
    'ok', true, 'code', 'claimed', 'request_id', p_request_id,
    'created_at', p_created_at
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'in_progress');
end;
$$;

create or replace function public.research_fm_native_esign_commit(
  p_member_id text,
  p_document_version_id text,
  p_idempotency_key text,
  p_request_id uuid,
  p_attempt_id uuid,
  p_intent_hash text,
  p_signature jsonb,
  p_signed_at timestamptz,
  p_signature_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.research_fm_esign_requests%rowtype;
  v_signed_iso text := to_char(p_signed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_now_iso text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  perform pg_advisory_xact_lock(hashtextextended(p_member_id || ':' || p_document_version_id, 0));

  select * into v_req
    from public.research_fm_esign_requests
   where id = p_request_id
     and member_id = p_member_id
     and idempotency_key = p_idempotency_key
   for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'request_missing'); end if;
  if v_req.native_attempt_id is distinct from p_attempt_id then
    return jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  end if;
  if v_req.native_intent_hash is distinct from p_intent_hash then
    return jsonb_build_object('ok', false, 'code', 'intent_mismatch');
  end if;
  if v_req.native_completion_state = 'completed' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;
  if (p_signature ->> 'member_id') is distinct from p_member_id then
    return jsonb_build_object('ok', false, 'code', 'member_mismatch');
  end if;
  if (v_req.xenios_document_version_ids ->> 0) is distinct from p_document_version_id then
    return jsonb_build_object('ok', false, 'code', 'version_mismatch');
  end if;
  if (p_signature ->> 'document_version_id') is distinct from p_document_version_id
     or (p_signature ->> 'document_version_id') is distinct from (v_req.xenios_document_version_ids ->> 0) then
    return jsonb_build_object('ok', false, 'code', 'signature_version_mismatch');
  end if;
  if (p_signature ->> 'content_hash') is distinct from (v_req.source_content_hashes ->> 0) then
    return jsonb_build_object('ok', false, 'code', 'signature_hash_mismatch');
  end if;
  if v_req.provider is distinct from 'xenios_native' then
    return jsonb_build_object('ok', false, 'code', 'request_provider_mismatch');
  end if;
  if v_req.mode is distinct from 'esign_document' then
    return jsonb_build_object('ok', false, 'code', 'request_mode_mismatch');
  end if;
  if (p_signature ->> 'full_document_shown')::boolean is distinct from true
     or (p_signature ->> 'affirmative_consent')::boolean is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'signature_consent_invalid');
  end if;
  if v_req.native_completion_state is distinct from 'evidence_stored' then
    return jsonb_build_object('ok', false, 'code', 'request_not_evidence_stored');
  end if;
  if v_req.signed_pdf_ref is null or v_req.certificate_ref is null
     or v_req.signed_pdf_hash is null or v_req.certificate_hash is null then
    return jsonb_build_object('ok', false, 'code', 'evidence_incomplete');
  end if;
  if exists (
    select 1 from public.research_fm_document_signatures
     where member_id = p_member_id::uuid and document_version_id = p_document_version_id::uuid
  ) then
    return jsonb_build_object('ok', false, 'code', 'signature_already_committed');
  end if;

  begin
    insert into public.research_fm_document_signatures (
      id, tenant, member_id, document_version_id, category, semver, content_hash,
      typed_legal_name, full_document_shown, affirmative_consent, separate_acknowledgment,
      electronic_consent_version_id, ip_hash, user_agent_hash, signed_at
    ) values (
      p_signature_id, 'xenios_research', (p_signature ->> 'member_id')::uuid,
      (p_signature ->> 'document_version_id')::uuid, p_signature ->> 'category',
      p_signature ->> 'semver', p_signature ->> 'content_hash',
      p_signature ->> 'typed_legal_name', (p_signature ->> 'full_document_shown')::boolean,
      (p_signature ->> 'affirmative_consent')::boolean,
      coalesce((p_signature ->> 'separate_acknowledgment')::boolean, false),
      (p_signature ->> 'electronic_consent_version_id')::uuid,
      p_signature ->> 'ip_hash', p_signature ->> 'user_agent_hash', p_signed_at
    );
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'signature_already_committed');
  end;

  update public.research_fm_esign_requests
     set signing_link_status = 'completed',
         native_completion_state = 'completed',
         signed_at = p_signed_at, completed_at = p_signed_at,
         xenios_acceptance_event_ids = jsonb_build_array(p_signature_id::text),
         provider_event_history = coalesce(v_req.provider_event_history, '[]'::jsonb)
           || jsonb_build_array(jsonb_build_object(
             'eventId', 'native:' || v_req.id::text || ':completed',
             'type', 'completed', 'occurredAt', v_signed_iso, 'recordedAt', v_now_iso
           )),
         updated_at = now()
   where id = p_request_id
     and native_attempt_id = p_attempt_id
     and native_intent_hash = p_intent_hash
     and native_completion_state = 'evidence_stored';
  if not found then raise exception 'native esign commit lost request compare-and-set'; end if;

  insert into public.research_fm_esign_archive (
    tenant, member_id, packet_or_document_id, document_version_id, provider,
    signed_pdf_ref, signed_pdf_hash, certificate_ref, certificate_hash,
    xenios_source_hash, signer_email, completed_at, retention_class,
    access_classification, archive_status, email_delivery_status, local_export_status
  ) values (
    'xenios_research', v_req.member_id, v_req.packet_or_document_id,
    (v_req.xenios_document_version_ids ->> 0), v_req.provider,
    v_req.signed_pdf_ref, v_req.signed_pdf_hash, v_req.certificate_ref,
    v_req.certificate_hash, (v_req.source_content_hashes ->> 0),
    v_req.signer_identifier, p_signed_at, 'legal_records',
    'member_and_admin', 'stored', 'pending', 'not_exported'
  );

  return jsonb_build_object('ok', true, 'replayed', false, 'signature_id', p_signature_id);
end;
$$;

do $$
begin
  revoke all on function public.research_fm_native_esign_claim(uuid, uuid, text, text, text, text, text, text, timestamptz) from public;
  revoke all on function public.research_fm_native_esign_commit(text, text, text, uuid, uuid, text, jsonb, timestamptz, uuid) from public;
  revoke all on function public.research_fm_native_esign_commit(text, text, text, jsonb, timestamptz, uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.research_fm_native_esign_claim(uuid, uuid, text, text, text, text, text, text, timestamptz) from anon;
    revoke all on function public.research_fm_native_esign_commit(text, text, text, uuid, uuid, text, jsonb, timestamptz, uuid) from anon;
    revoke all on function public.research_fm_native_esign_commit(text, text, text, jsonb, timestamptz, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.research_fm_native_esign_claim(uuid, uuid, text, text, text, text, text, text, timestamptz) from authenticated;
    revoke all on function public.research_fm_native_esign_commit(text, text, text, uuid, uuid, text, jsonb, timestamptz, uuid) from authenticated;
    revoke all on function public.research_fm_native_esign_commit(text, text, text, jsonb, timestamptz, uuid) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on function public.research_fm_native_esign_commit(text, text, text, jsonb, timestamptz, uuid) from service_role;
    grant execute on function public.research_fm_native_esign_claim(uuid, uuid, text, text, text, text, text, text, timestamptz) to service_role;
    grant execute on function public.research_fm_native_esign_commit(text, text, text, uuid, uuid, text, jsonb, timestamptz, uuid) to service_role;
  end if;
end $$;
