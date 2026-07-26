-- xenios research: native e-sign attempt lease and crash recovery.
-- Additive/idempotent. RLS and legal records are unchanged.

alter table public.research_fm_esign_requests
  add column if not exists native_attempt_expires_at timestamptz;

create or replace function public.research_fm_native_esign_claim(
  p_request_id uuid,
  p_attempt_id uuid,
  p_intent_hash text,
  p_member_id text,
  p_document_version_id text,
  p_source_content_hash text,
  p_idempotency_key text,
  p_signer_identifier text,
  p_created_at timestamptz,
  p_attempt_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.research_fm_esign_requests%rowtype;
begin
  if p_intent_hash !~ '^[0-9a-f]{64}$'
     or p_source_content_hash !~ '^[0-9a-f]{64}$'
     or p_attempt_expires_at <= p_created_at then
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
    if v_req.native_completion_state is distinct from 'failed_cleanup_required'
       and (v_req.native_attempt_expires_at is null or v_req.native_attempt_expires_at > now()) then
      return jsonb_build_object('ok', false, 'code', 'in_progress');
    end if;

    update public.research_fm_esign_requests
       set native_completion_state = 'preparing',
           native_attempt_id = p_attempt_id,
           native_attempt_expires_at = p_attempt_expires_at,
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
    if v_req.native_attempt_expires_at is null or v_req.native_attempt_expires_at > now() then
      return jsonb_build_object('ok', false, 'code', 'in_progress');
    end if;
    update public.research_fm_esign_requests
       set native_completion_state = 'failed_cleanup_required', updated_at = now()
     where id = v_req.id
       and native_completion_state in ('preparing', 'evidence_stored');
  end if;

  insert into public.research_fm_esign_requests (
    id, tenant, member_id, packet_or_document_id, mode, provider,
    xenios_document_version_ids, source_content_hashes, signer_identifier,
    signing_link_status, native_completion_state, native_intent_hash,
    native_attempt_id, native_attempt_expires_at, idempotency_key, created_at, updated_at
  ) values (
    p_request_id, 'xenios_research', p_member_id, p_document_version_id,
    'esign_document', 'xenios_native', jsonb_build_array(p_document_version_id),
    jsonb_build_array(p_source_content_hash), p_signer_identifier, 'created',
    'preparing', p_intent_hash, p_attempt_id, p_attempt_expires_at,
    p_idempotency_key, p_created_at, p_created_at
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

do $$
declare
  previous_claim regprocedure := to_regprocedure(
    'public.research_fm_native_esign_claim(uuid,uuid,text,text,text,text,text,text,timestamp with time zone)'
  );
begin
  revoke all on function public.research_fm_native_esign_claim(uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz) from public;
  if previous_claim is not null then
    execute format('revoke all on function %s from public', previous_claim);
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.research_fm_native_esign_claim(uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz) from anon;
    if previous_claim is not null then
      execute format('revoke all on function %s from anon', previous_claim);
    end if;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.research_fm_native_esign_claim(uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz) from authenticated;
    if previous_claim is not null then
      execute format('revoke all on function %s from authenticated', previous_claim);
    end if;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    if previous_claim is not null then
      execute format('revoke all on function %s from service_role', previous_claim);
    end if;
    grant execute on function public.research_fm_native_esign_claim(uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz) to service_role;
  end if;
end $$;
