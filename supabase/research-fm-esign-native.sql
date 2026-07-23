-- xenios research: NATIVE (embedded) e-signature modes migration.
-- ADDITIVE and backward-compatible. Run once in the Supabase SQL Editor AFTER
-- the founding-membership bundle AND the base e-signature migration
-- (research-fm-esign.sql), so both research_fm_document_signatures (agreements)
-- and research_fm_esign_* exist: the atomic-commit function below references
-- all three tables and its body is validated at creation time. Safe to re-run.
-- RLS is unchanged (already enabled, server-only). No destructive DDL:
-- this only WIDENS the allowed set of `mode` values so the native modes
-- (esign_document, esign_packet) are storable alongside the existing
-- opensign_* modes, which remain fully readable and writable.
--
-- The `provider` column already accepts any text, so the native provider value
-- 'xenios_native' needs no schema change. Existing rows are untouched.
--
-- If the founding-membership bundle on this database already includes the
-- native modes (a fresh install from the current base file), this migration is
-- a no-op re-statement of the same constraint.

-- Signing requests: widen the mode check. The inline check Postgres created on
-- the mode column is auto-named <table>_mode_check; drop it if present, then add
-- the widened, explicitly-named constraint.
alter table public.research_fm_esign_requests
  drop constraint if exists research_fm_esign_requests_mode_check;
alter table public.research_fm_esign_requests
  add constraint research_fm_esign_requests_mode_check
  check (mode in (
    'view_only_public_policy','clickwrap_acceptance','typed_signature',
    'opensign_document','opensign_packet',
    'esign_document','esign_packet'));

-- Template mappings: same widening.
alter table public.research_fm_esign_templates
  drop constraint if exists research_fm_esign_templates_mode_check;
alter table public.research_fm_esign_templates
  add constraint research_fm_esign_templates_mode_check
  check (mode in (
    'view_only_public_policy','clickwrap_acceptance','typed_signature',
    'opensign_document','opensign_packet',
    'esign_document','esign_packet'));

-- Native completion state machine. Additive, nullable (null for OpenSign rows).
-- Only 'completed' is ever presented as a signed legal record; 'evidence_stored'
-- is a durable non-activating recoverable record; 'failed_cleanup_required'
-- marks uploaded objects for cleanup after a signature commit failed.
alter table public.research_fm_esign_requests
  add column if not exists native_completion_state text;
alter table public.research_fm_esign_requests
  drop constraint if exists research_fm_esign_requests_native_state_check;
alter table public.research_fm_esign_requests
  add constraint research_fm_esign_requests_native_state_check
  check (native_completion_state is null or native_completion_state in (
    'preparing','evidence_stored','completed','failed_cleanup_required'));

-- NOTE: native signed PDFs + completion certificates live in the SAME private
-- bucket the OpenSign path uses (RESEARCH_ESIGN_BUCKET), created in the Storage
-- dashboard, not by SQL. No new table is required for the native path: it reuses
-- research_fm_esign_requests (mode esign_document, provider xenios_native) and
-- research_fm_esign_archive.

-- ---------------------------------------------------------------------------
-- ATOMIC NATIVE COMPLETION (the final legal transaction)
-- ---------------------------------------------------------------------------
-- The native completion commits FOUR effects in ONE transaction (this function
-- body runs inside the caller's transaction; any RAISE rolls all of it back):
--   1. verify the evidence_stored request (member, exact version, exact
--      idempotency key, refs + hashes present) AND independently BIND the
--      signature to be inserted to that exact locked request (its member,
--      document version, and content hash must match the request; the request
--      must be a native esign_document request; consent flags must be true),
--      locked FOR UPDATE so concurrent commits serialize and exactly one
--      performs the transition,
--   2. insert the immutable legal signature (the append-only signatures table's
--      published + content-hash trigger and unique (member, version) still apply),
--   3. transition the request evidence_stored -> completed, binding signed_at,
--      completed_at, and the signature id,
--   4. upsert the archive projection (exactly one per member + version).
-- All four commit or roll back together, so a native signature can never exist
-- unless its matching request is completed. Storage uploads happen BEFORE this
-- (evidence_stored is non-activating) and stay outside the transaction. A
-- verification failure returns a structured {ok:false, code} having written
-- nothing; only genuine errors RAISE (and roll back).
--
-- SECURITY: service-role only (execute revoked from public/anon/authenticated).
-- The acting member id is a server-supplied parameter and is re-verified against
-- the request here; no client-supplied identity is trusted, and the transaction
-- NEVER trusts that the caller aligned the signature payload with the request:
-- it binds them here, in the database, under the row lock. The signature id and
-- signed_at are the authoritative scalar parameters p_signature_id / p_signed_at
-- (single source, not taken from the JSON), so no id/timestamp mismatch is
-- possible. No secret enters this function, its parameters, or its result.
-- Idempotent: create-or-replace.
create or replace function public.research_fm_native_esign_commit(
  p_member_id text,
  p_document_version_id text,
  p_idempotency_key text,
  p_signature jsonb,
  p_signed_at timestamptz,
  p_signature_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req         public.research_fm_esign_requests%rowtype;
  v_existing_id uuid;
  v_now_iso     text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_signed_iso  text := to_char(p_signed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  -- (1) Lock the request row for this (member, idempotency key). FOR UPDATE
  -- serializes concurrent commits; the loser re-reads the committed 'completed'
  -- state below and replays.
  select * into v_req
    from public.research_fm_esign_requests
   where member_id = p_member_id
     and idempotency_key = p_idempotency_key
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'request_missing');
  end if;

  -- Idempotent replay: already committed. No second write.
  if v_req.native_completion_state = 'completed' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  -- The acting member (parameter) and the signature's member must match the
  -- request. The client never supplies these; the server passes the
  -- authenticated member and its prepared signature.
  if v_req.member_id is distinct from p_member_id
     or (p_signature ->> 'member_id') is distinct from p_member_id then
    return jsonb_build_object('ok', false, 'code', 'member_mismatch');
  end if;

  if (v_req.xenios_document_version_ids ->> 0) is distinct from p_document_version_id then
    return jsonb_build_object('ok', false, 'code', 'version_mismatch');
  end if;

  -- INDEPENDENT BINDING. The transaction binds the signature it is about to
  -- insert to the EXACT locked request; it never trusts that the caller aligned
  -- the fields. Each check fires BEFORE any write, so a malformed internal call
  -- (request A paired with a signature for document B, a mismatched content
  -- hash, a non-native or non-esign_document request, or an unconsented
  -- signature) writes nothing. The signature id and signed_at are NOT taken from
  -- the JSON at all; they are the authoritative scalar parameters p_signature_id
  -- and p_signed_at (single source, no mismatch possible).
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

  -- (2) Insert the immutable legal signature. The signatures table's
  -- before-insert trigger re-checks published + exact content hash; the unique
  -- (member, version) admits exactly one, so a concurrent winner is tolerated.
  insert into public.research_fm_document_signatures (
    id, tenant, member_id, document_version_id, category, semver, content_hash,
    typed_legal_name, full_document_shown, affirmative_consent, separate_acknowledgment,
    electronic_consent_version_id, ip_hash, user_agent_hash, signed_at
  ) values (
    p_signature_id,
    'xenios_research',
    (p_signature ->> 'member_id')::uuid,
    (p_signature ->> 'document_version_id')::uuid,
    p_signature ->> 'category',
    p_signature ->> 'semver',
    p_signature ->> 'content_hash',
    p_signature ->> 'typed_legal_name',
    (p_signature ->> 'full_document_shown')::boolean,
    (p_signature ->> 'affirmative_consent')::boolean,
    coalesce((p_signature ->> 'separate_acknowledgment')::boolean, false),
    (p_signature ->> 'electronic_consent_version_id')::uuid,
    p_signature ->> 'ip_hash',
    p_signature ->> 'user_agent_hash',
    p_signed_at
  )
  on conflict (member_id, document_version_id) do nothing;

  -- The signature that actually stands (this call's, or a concurrent winner's).
  select id into v_existing_id
    from public.research_fm_document_signatures
   where member_id = (p_signature ->> 'member_id')::uuid
     and document_version_id = (p_signature ->> 'document_version_id')::uuid;

  if v_existing_id is null then
    -- The insert neither landed nor found an existing row: a genuine failure.
    -- RAISE so the whole transaction rolls back (no partial completion).
    raise exception 'native esign commit: signature did not persist for member % version %',
      p_member_id, p_document_version_id;
  end if;

  -- (3) Transition the request evidence_stored -> completed, binding the
  -- signature that stands.
  update public.research_fm_esign_requests
     set signing_link_status = 'completed',
         native_completion_state = 'completed',
         signed_at = p_signed_at,
         completed_at = p_signed_at,
         xenios_acceptance_event_ids = jsonb_build_array(v_existing_id::text),
         provider_event_history = coalesce(v_req.provider_event_history, '[]'::jsonb) || jsonb_build_array(
           jsonb_build_object(
             'eventId', 'native:' || v_req.id::text || ':completed',
             'type', 'completed',
             'occurredAt', v_signed_iso,
             'recordedAt', v_now_iso
           )
         ),
         updated_at = now()
   where id = v_req.id;

  -- (4) Upsert the archive projection: exactly one row per member + version.
  insert into public.research_fm_esign_archive (
    tenant, member_id, packet_or_document_id, document_version_id, provider,
    signed_pdf_ref, signed_pdf_hash, certificate_ref, certificate_hash,
    xenios_source_hash, signer_email, completed_at, retention_class,
    access_classification, archive_status, email_delivery_status, local_export_status
  )
  select
    'xenios_research', v_req.member_id, v_req.packet_or_document_id,
    (v_req.xenios_document_version_ids ->> 0), v_req.provider,
    v_req.signed_pdf_ref, v_req.signed_pdf_hash, v_req.certificate_ref, v_req.certificate_hash,
    (v_req.source_content_hashes ->> 0), v_req.signer_identifier, p_signed_at,
    'legal_records', 'member_and_admin', 'stored', 'pending', 'not_exported'
  where not exists (
    select 1 from public.research_fm_esign_archive a
     where a.member_id = v_req.member_id
       and a.document_version_id is not distinct from (v_req.xenios_document_version_ids ->> 0)
  );

  return jsonb_build_object('ok', true, 'replayed', (v_existing_id is distinct from p_signature_id));
end;
$$;

-- Service-role only. Remove the default PUBLIC execute; grant to the server role.
-- Guarded so the migration runs on any Postgres (the Supabase roles always exist
-- on the target). Idempotent.
do $$
begin
  revoke all on function public.research_fm_native_esign_commit(text, text, text, jsonb, timestamptz, uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.research_fm_native_esign_commit(text, text, text, jsonb, timestamptz, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.research_fm_native_esign_commit(text, text, text, jsonb, timestamptz, uuid) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.research_fm_native_esign_commit(text, text, text, jsonb, timestamptz, uuid) to service_role;
  end if;
end $$;
