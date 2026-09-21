-- ==========================================================================
-- Referral V1: one new READ operation, attributionForTouch.
--
-- CANDIDATE. NOT APPLIED. No production or staging execution is authorized by
-- this file existing.
--
-- WHY IT EXISTS
--
-- A visitor who is not signed in can carry a sealed Referral V1 capture claim.
-- That claim names a TOUCH; it does not name a partner, and it must not, or a
-- browser could choose who gets paid. Every existing operation that can say
-- which partner a touch belongs to requires an authenticated actor:
--
--   listOwn     the partner themselves
--   bind        a signed-in member claiming their own binding
--   getBinding  the same
--   listAdmin   a canonical admin
--
-- So the assisted-order submit path and the Early Access grant path, both of
-- which run for a visitor who may never sign in, have no way to ask the
-- question they need answered. Until this operation exists, the server-side
-- resolver in server/research/partners/referral-v1-attribution.ts receives
-- `unavailable` from the RPC and attributes nothing. Orders still complete;
-- they complete unattributed, for a reason that is now named rather than silent.
--
-- WHAT IT DOES AND DOES NOT DO
--
-- Reads only. It creates no row, moves no money, and records no event: a
-- lookup is not a conversion. It re-resolves availability through the existing
-- research_referral_v1_availability function rather than trusting the touch, so
-- a suspended, terminated, revoked or expired link attributes nothing no matter
-- how valid the visitor's cookie is. The subject key must match the touch, so a
-- claim lifted into another browser resolves to nothing.
--
-- It answers `eligible:false` with `partnerId:null` rather than a denial for an
-- unknown or ineligible touch, because the caller's next step is identical in
-- every one of those cases and a denial code would only tell an anonymous
-- caller which touch ids exist.
--
-- APPLY ORDER: after 20260904_research_partner_referral_v1.sql, which creates
-- research_referral_v1_execute, research_referral_v1_availability and
-- research_attribution_touches.
--
-- ROLLBACK: restore the prior body of research_referral_v1_execute from the
-- reviewed 20260904 candidate, then drop research_referral_v1_touch_attribution
-- (uuid,text,uuid). No application data is written. The helper is internal-only.
-- The guarded dispatcher edit and helper creation commit atomically; unexpected
-- dispatcher-seam drift or replay refuses the entire transaction. The whole
-- predecessor must still be compared to the reviewed base before managed use.
-- ==========================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Guard: the operation allowlist and the availability helper must already exist.
do $$
begin
  if pg_catalog.to_regprocedure('public.research_referral_v1_execute(text,jsonb)') is null then
    raise exception 'research_referral_v1_execute is absent; apply 20260904_research_partner_referral_v1.sql first';
  end if;
  if pg_catalog.to_regprocedure('public.research_referral_v1_availability(uuid,uuid)') is null then
    raise exception 'research_referral_v1_availability is absent; apply 20260904_research_partner_referral_v1.sql first';
  end if;
end
$$;

-- The branch itself, as a separate SECURITY DEFINER read the execute function
-- delegates to. Keeping it in its own function means the existing execute body
-- gains one allowlist entry and one delegation, which is the smallest change
-- that can carry this behaviour, and it can be reviewed on its own.
create or replace function public.research_referral_v1_touch_attribution(
  p_touch_id uuid,
  p_subject_key_hash text,
  p_actor_auth_user_id uuid
) returns jsonb
language plpgsql
-- The canonical authority probe requires all internal read helpers to retain
-- the same reviewed owner/definer contract. No role can invoke this helper
-- directly: only the service-role dispatcher delegates after closed validation.
security definer
set search_path = ''
as $$
declare
  t public.research_attribution_touches%rowtype;
  v_availability text;
begin
  if p_touch_id is null or coalesce(p_subject_key_hash,'') !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('partnerId', null, 'eligible', false);
  end if;

  -- The subject key binds the claim to the browser that captured it.
  select * into t
    from public.research_attribution_touches
   where id = p_touch_id
     and subject_key = p_subject_key_hash
     and referral_version = 1;
  if not found then
    return jsonb_build_object('partnerId', null, 'eligible', false);
  end if;

  -- Eligibility is re-read, never inherited from the touch. Authenticated
  -- submissions carry the canonical verified Auth UUID so self-referral is
  -- refused before an assisted order records attribution. Guests pass null and
  -- remain provisional until the later account-binding check.
  v_availability := public.research_referral_v1_availability(t.referral_link_id, p_actor_auth_user_id);
  if v_availability <> 'ready' or t.referral_expires_at <= clock_timestamp() then
    return jsonb_build_object('partnerId', null, 'eligible', false);
  end if;

  return jsonb_build_object('partnerId', t.partner_id, 'eligible', true);
end
$$;

revoke all on function public.research_referral_v1_touch_attribution(uuid, text, uuid) from public, anon, authenticated, service_role;

-- ==========================================================================
-- Retain the existing dispatcher body and ACLs byte-for-byte apart from the
-- two exact, uniquely occurring seams below. Refuse an unknown predecessor;
-- never ask an operator to hand-edit a privileged function after applying SQL.
-- ==========================================================================
do $install$
declare
  v_body text := pg_catalog.pg_get_functiondef('public.research_referral_v1_execute(text,jsonb)'::pg_catalog.regprocedure);
  v_allowlist text := $old$if jsonb_typeof(p_input)<>'object' or p_operation not in ('issue','revoke','listOwn','resolve','capture','bind','getBinding','bindingAt','transferBinding','listAdmin') then$old$;
  v_actor text := $old$  if p_operation in ('issue','revoke','listOwn','bind','getBinding','bindingAt','transferBinding','listAdmin') or p_input ? 'actorAuthUserId' then$old$;
  v_branch text := $new$  if p_operation='attributionForTouch' then
    if jsonb_typeof(p_input) is distinct from 'object'
      or (p_input - 'touchId' - 'subjectKeyHash' - 'actorAuthUserId') <> '{}'::jsonb
      or coalesce(p_input->>'touchId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or coalesce(p_input->>'subjectKeyHash','') !~ '^[a-f0-9]{64}$'
      or (p_input ? 'actorAuthUserId' and coalesce(p_input->>'actorAuthUserId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then
      return jsonb_build_object('ok',false,'reason','invalid_input');
    end if;
    return jsonb_build_object('ok',true,'value',
      public.research_referral_v1_touch_attribution((p_input->>'touchId')::uuid,p_input->>'subjectKeyHash',
        case when p_input ? 'actorAuthUserId' then (p_input->>'actorAuthUserId')::uuid else null end));
  end if;
$new$;
begin
  if position('attributionForTouch' in v_body)>0
    or (length(v_body)-length(replace(v_body,v_allowlist,'')))/length(v_allowlist) <> 1
    or (length(v_body)-length(replace(v_body,v_actor,'')))/length(v_actor) <> 1 then
    raise exception 'referral dispatcher drift or replay; review predecessor before applying';
  end if;
  v_body := replace(v_body,v_allowlist,
    $new$if jsonb_typeof(p_input)<>'object' or p_operation not in ('issue','revoke','listOwn','resolve','capture','bind','getBinding','bindingAt','transferBinding','listAdmin','attributionForTouch') then$new$);
  v_body := replace(v_body,v_actor,v_branch || v_actor);
  execute v_body;
end
$install$;

-- Executable read-only postconditions: missing touch, malformed input and
-- actor/partner injection are not allowed to produce an attributed partner.
do $postcheck$
declare
  v_input jsonb := jsonb_build_object('touchId','00000000-0000-4000-8000-000000000000','subjectKeyHash',repeat('a',64));
  v_transfer_input jsonb := jsonb_build_object(
    'actorAuthUserId','00000000-0000-4000-8000-000000000001','accountAuthUserId','00000000-0000-4000-8000-000000000002',
    'expectedRevisionId','00000000-0000-4000-8000-000000000003','targetLinkId','00000000-0000-4000-8000-000000000004',
    'idempotencyKey','postcheck_probe_01','reasonCode','compliance_action','authorizationReferenceHash',repeat('0',64));
begin
  if public.research_referral_v1_authority()
    <> '{"ok":true,"value":{"schemaVersion":"gen2_referral_v1_transfer_touch_20260921"}}'::jsonb then
    raise exception 'referral authority postcheck failed';
  end if;
  if public.research_referral_v1_execute('attributionForTouch',v_input)
    <> '{"ok":true,"value":{"partnerId":null,"eligible":false}}'::jsonb
    or public.research_referral_v1_execute('attributionForTouch','{"touchId":"not-a-uuid","subjectKeyHash":"short"}')
    <> '{"ok":false,"reason":"invalid_input"}'::jsonb
    or public.research_referral_v1_execute('attributionForTouch',v_input || '{"partnerId":"00000000-0000-4000-8000-000000000000"}')
    <> '{"ok":false,"reason":"invalid_input"}'::jsonb
    or public.research_referral_v1_execute('transferBinding',v_transfer_input)
    <> '{"ok":false,"reason":"not_eligible"}'::jsonb then
    raise exception 'referral touch attribution postcheck failed';
  end if;
  if pg_catalog.has_function_privilege('anon','public.research_referral_v1_execute(text,jsonb)','execute')
    or pg_catalog.has_function_privilege('authenticated','public.research_referral_v1_execute(text,jsonb)','execute')
    or not pg_catalog.has_function_privilege('service_role','public.research_referral_v1_execute(text,jsonb)','execute')
    or pg_catalog.has_function_privilege('anon','public.research_referral_v1_touch_attribution(uuid,text,uuid)','execute')
    or pg_catalog.has_function_privilege('authenticated','public.research_referral_v1_touch_attribution(uuid,text,uuid)','execute')
    or pg_catalog.has_function_privilege('service_role','public.research_referral_v1_touch_attribution(uuid,text,uuid)','execute') then
    raise exception 'referral touch attribution privilege boundary failed';
  end if;
end
$postcheck$;

commit;
