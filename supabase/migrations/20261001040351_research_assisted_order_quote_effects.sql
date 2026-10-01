-- PENDING/source-only. Canonical verification -> canonical notification outbox.
-- Requires 20261001024018 and the unchanged promoted canonical audit candidate.
-- No historical adoption, second queue, provider activation or live dispatch.
begin;

do $preflight$
begin
  if to_regprocedure('public.research_assisted_order_payment_verify_bound(uuid,uuid,uuid)') is null
     or to_regprocedure('public.research_assisted_order_audit_append(text,text,jsonb)') is null
     or to_regclass('public.research_notification_outbox') is null
     or not exists (select 1 from pg_trigger where tgrelid = 'public.research_assisted_order_quotes'::regclass
                    and tgname = 'hl12_quote_snapshot_immutable' and tgenabled in ('O','A') and not tgisinternal) then
    raise exception 'Payment effects prerequisites are absent' using errcode = '55000';
  end if;
  lock table public.research_assisted_order_payment_verifications in share row exclusive mode;
  lock table public.research_notification_outbox in share row exclusive mode;
  if exists(select 1 from public.research_notification_outbox
    where template_key = 'research.assisted_order.status_changed.customer'
      and (jsonb_typeof(payload) is distinct from 'object'
        or jsonb_typeof(payload->'status') is distinct from 'string'
        or payload->>'status' not in ('submitted','reviewing','waiting_on_customer','identity_requested',
          'identity_received','agreements_pending','agreements_complete','payment_pending','payment_review',
          'paid','supplier_processing','shipped','delivered','closed','cancelled'))) then
    raise exception 'Existing assisted status envelopes require reconciliation'
      using errcode='55000', detail='ASSISTED_ORDER_STATUS_ENVELOPE_INVALID';
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.research_notification_outbox'::regclass
                 and attname = 'assisted_order_verification_id' and not attisdropped) then
    if exists (select 1 from public.research_assisted_order_payment_verifications)
       or exists (select 1 from public.research_notification_outbox where
         event_key like 'assisted-order:%:payment-verification:%'
         or (template_key = 'research.assisted_order.status_changed.customer' and payload->>'status' = 'paid')) then
      raise exception 'Existing financial effects require deliberate adoption'
        using errcode = '55000', detail = 'ASSISTED_ORDER_EFFECTS_ADOPTION_REQUIRED';
    end if;
  else
    if exists (select 1 from public.research_assisted_order_payment_verifications v
      where not exists (select 1 from public.research_notification_outbox o
        where o.assisted_order_verification_id = v.id)) then
      raise exception 'Existing financial effects require deliberate adoption'
        using errcode = '55000', detail = 'ASSISTED_ORDER_EFFECTS_ADOPTION_REQUIRED';
    end if;
  end if;
end
$preflight$;

alter table public.research_notification_outbox add column if not exists assisted_order_verification_id uuid
  references public.research_assisted_order_payment_verifications(id) on update restrict on delete restrict;
create unique index if not exists research_outbox_assisted_verification_uq
  on public.research_notification_outbox(assisted_order_verification_id)
  where assisted_order_verification_id is not null;
alter table public.research_notification_outbox drop constraint if exists research_notification_outbox_status_check;
alter table public.research_notification_outbox add constraint research_notification_outbox_status_check
  check (status in ('held','pending','processing','sent','delivered','failed_retryable','failed_permanent','cancelled'));
create index if not exists research_outbox_assisted_effects_pending_idx
  on public.research_notification_outbox(created_at,id)
  where assisted_order_verification_id is not null and status = 'held';

-- Private receipt reader. A colliding canonical audit record is NOT completion.
-- Alias cryptography remains in the existing branded audit adapter, not SQL.
create or replace function public.research_assisted_order_payment_effects_audit_receipt(p_verification_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $receipt$
declare
  v public.research_assisted_order_payment_verifications%rowtype;
  a public.research_assisted_order_audit_events_v1%rowtype;
begin
  select * into v from public.research_assisted_order_payment_verifications where id = p_verification_id;
  if not found then return null; end if;
  select * into a from public.research_assisted_order_audit_events_v1 where event_id = v.id;
  if not found then return null; end if;
  if a.event_key is distinct from 'assisted-order-audit:v1:' || v.id::text
     or a.request_id is distinct from v.request_id
     or a.event_type is distinct from 'assisted_order.status_changed'
     or a.actor_type is distinct from 'admin'
     or a.actor_alias is null
     or a.evidence is distinct from '{"from":"payment_review","to":"paid","authorityEvidenceKinds":["payment_verification"]}'::jsonb
     or a.occurred_at is distinct from date_trunc('milliseconds',v.verified_at)
     or a.schema_version is distinct from 'research_assisted_order_audit_v1'
     or a.attestation is distinct from 'research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694' then
    raise exception 'Payment audit binding conflicts'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_EFFECTS_CONFLICT';
  end if;
  return jsonb_build_object('state','replayed','eventId',a.event_id,'eventKey',a.event_key,
    'requestId',a.request_id,'eventType',a.event_type,'eventFingerprint',a.event_fingerprint,
    'schemaVersion',a.schema_version,'attestation',a.attestation);
end
$receipt$;

-- Reserve payment notices even if a caller omits the new binding column.
create or replace function public.research_assisted_order_payment_effects_outbox_guard()
returns trigger language plpgsql security definer set search_path = '' as $guard$
declare
  v public.research_assisted_order_payment_verifications%rowtype;
  r public.research_assisted_order_requests%rowtype;
  old_bound boolean := false;
  new_bound boolean := false;
begin
  if tg_op = 'TRUNCATE' then
    if exists (select 1 from public.research_notification_outbox where assisted_order_verification_id is not null) then
      raise exception 'Financial notification intents cannot be truncated'
        using errcode = 'P0001', detail = 'ASSISTED_ORDER_EFFECTS_IMMUTABLE';
    end if;
    return null;
  end if;
  -- Renderer normalization is not authority. Every canonical status envelope
  -- must carry an exact vocabulary string, including non-payment messages.
  if tg_op in ('INSERT','UPDATE') and new.template_key = 'research.assisted_order.status_changed.customer'
     and (jsonb_typeof(new.payload) is distinct from 'object'
       or jsonb_typeof(new.payload->'status') is distinct from 'string'
       or new.payload->>'status' not in ('submitted','reviewing','waiting_on_customer','identity_requested',
         'identity_received','agreements_pending','agreements_complete','payment_pending','payment_review',
         'paid','supplier_processing','shipped','delivered','closed','cancelled')) then
    raise exception 'Assisted status envelope is invalid'
      using errcode='P0001', detail='ASSISTED_ORDER_STATUS_ENVELOPE_INVALID';
  end if;
  if tg_op <> 'INSERT' then
    old_bound := old.assisted_order_verification_id is not null
      or old.event_key like 'assisted-order:%:payment-verification:%'
      or coalesce(old.template_key = 'research.assisted_order.status_changed.customer' and old.payload->>'status' = 'paid',false);
  end if;
  if tg_op <> 'DELETE' then
    new_bound := new.assisted_order_verification_id is not null
      or new.event_key like 'assisted-order:%:payment-verification:%'
      or coalesce(new.template_key = 'research.assisted_order.status_changed.customer' and new.payload->>'status' = 'paid',false);
  end if;
  if tg_op = 'DELETE' then
    if old_bound then
      raise exception 'Financial notification intents cannot be deleted'
        using errcode = 'P0001', detail = 'ASSISTED_ORDER_EFFECTS_IMMUTABLE';
    end if;
    return old;
  end if;
  if not old_bound and not new_bound then return new; end if;
  if tg_op = 'UPDATE' then
    if not old_bound or not new_bound or
      row(new.id,new.event_key,new.application_id,new.member_id,new.event_type,new.channel,new.recipient,
          new.template_key,new.payload,new.created_at,new.assisted_order_verification_id)
      is distinct from
      row(old.id,old.event_key,old.application_id,old.member_id,old.event_type,old.channel,old.recipient,
          old.template_key,old.payload,old.created_at,old.assisted_order_verification_id) then
      raise exception 'Financial notification identity is immutable'
        using errcode = 'P0001', detail = 'ASSISTED_ORDER_EFFECTS_IMMUTABLE';
    end if;
    if (old.status = 'held' and new.status not in ('held','pending'))
       or (old.status <> 'held' and new.status = 'held')
       or (new.status <> 'held' and public.research_assisted_order_payment_effects_audit_receipt(new.assisted_order_verification_id) is null)
       or (old.status = 'held' and (new.attempt_count <> 0 or new.last_attempt_at is not null
           or new.provider_message_id is not null or new.completed_at is not null)) then
      raise exception 'Payment audit is required before notification release'
        using errcode = 'P0001', detail = 'ASSISTED_ORDER_EFFECTS_AUDIT_REQUIRED';
    end if;
    return new;
  end if;
  select * into v from public.research_assisted_order_payment_verifications where id = new.assisted_order_verification_id;
  if not found then
    raise exception 'Financial notification requires a real verification'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_EFFECTS_CONFLICT';
  end if;
  select * into r from public.research_assisted_order_requests where id = v.request_id;
  if v.method <> 'manual' or new.event_key is distinct from 'assisted-order:' || v.request_id::text || ':payment-verification:' || v.id::text
     or new.event_type is distinct from 'assisted_order.status_changed'
     or new.template_key is distinct from 'research.assisted_order.status_changed.customer'
     or new.channel is distinct from 'email' or new.recipient is distinct from r.normalized_email
     or new.payload is distinct from jsonb_build_object('publicReference',r.public_reference,'status','paid',
         'customerMessage','Payment verified. Fulfillment is reviewed separately.')
     or new.application_id is not null or new.member_id is not null
     or new.created_at is distinct from date_trunc('milliseconds',v.verified_at)
     or new.status <> 'held' or new.attempt_count <> 0 or new.last_attempt_at is not null
     or new.provider_message_id is not null or new.completed_at is not null then
    raise exception 'Financial notification binding conflicts'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_EFFECTS_CONFLICT';
  end if;
  -- The atomic capture already occupies the unique verification/event keys.
  -- A direct duplicate insert cannot create a second intent or replace it.
  return new;
end
$guard$;
drop trigger if exists hl12_payment_effects_outbox_guard on public.research_notification_outbox;
create trigger hl12_payment_effects_outbox_guard before insert or update or delete
  on public.research_notification_outbox for each row
  execute function public.research_assisted_order_payment_effects_outbox_guard();
drop trigger if exists hl12_payment_effects_outbox_truncate on public.research_notification_outbox;
create trigger hl12_payment_effects_outbox_truncate before truncate
  on public.research_notification_outbox for each statement
  execute function public.research_assisted_order_payment_effects_outbox_guard();

create or replace function public.research_assisted_order_payment_effects_capture()
returns trigger language plpgsql security definer set search_path = '' as $capture$
declare r public.research_assisted_order_requests%rowtype; v_actor_units integer;
begin
  -- Match the canonical audit adapter before committing an intent that it
  -- could never prepare: ECMAScript trim characters, C0/DEL and UTF-16 length.
  -- PostgreSQL text cannot contain NUL; Unicode scalar values above FFFF take
  -- two JavaScript UTF-16 units. This does not edit or invent a verifier grant.
  select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0)::integer
    into v_actor_units from regexp_split_to_table(new.verified_by,'') as chars(ch);
  if new.verified_by is null or v_actor_units not between 1 and 512
     or new.verified_by ~ U&'[\0001-\001F\007F]'
     or new.verified_by is distinct from btrim(new.verified_by,
       U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') then
    raise exception 'Payment actor cannot be represented by canonical audit'
      using errcode='P0001', detail='ASSISTED_ORDER_EFFECTS_ACTOR_INVALID';
  end if;
  select * into strict r from public.research_assisted_order_requests where id = new.request_id;
  insert into public.research_notification_outbox(event_key,event_type,channel,recipient,template_key,payload,
    status,created_at,updated_at,assisted_order_verification_id)
  values ('assisted-order:' || new.request_id::text || ':payment-verification:' || new.id::text,
    'assisted_order.status_changed','email',r.normalized_email,'research.assisted_order.status_changed.customer',
    jsonb_build_object('publicReference',r.public_reference,'status','paid',
      'customerMessage','Payment verified. Fulfillment is reviewed separately.'),
    'held',date_trunc('milliseconds',new.verified_at),date_trunc('milliseconds',new.verified_at),new.id);
  return new;
end
$capture$;
drop trigger if exists hl12_payment_effects_capture on public.research_assisted_order_payment_verifications;
create trigger hl12_payment_effects_capture after insert on public.research_assisted_order_payment_verifications
  for each row execute function public.research_assisted_order_payment_effects_capture();

create or replace function public.research_assisted_order_payment_effects_context(p_verification_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $context$
declare
  v public.research_assisted_order_payment_verifications%rowtype;
  o public.research_notification_outbox%rowtype;
  a jsonb;
begin
  select * into v from public.research_assisted_order_payment_verifications where id = p_verification_id;
  if not found then return null; end if;
  select * into o from public.research_notification_outbox where assisted_order_verification_id = v.id;
  if not found or o.event_key is distinct from 'assisted-order:' || v.request_id::text || ':payment-verification:' || v.id::text
     or o.event_type is distinct from 'assisted_order.status_changed'
     or o.template_key is distinct from 'research.assisted_order.status_changed.customer'
     or o.channel is distinct from 'email' or v.method <> 'manual'
     or o.created_at is distinct from date_trunc('milliseconds',v.verified_at) then
    raise exception 'Financial notification binding conflicts'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_EFFECTS_CONFLICT';
  end if;
  a := public.research_assisted_order_payment_effects_audit_receipt(v.id);
  if o.status <> 'held' and a is null then
    raise exception 'Payment audit is required before notification release'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_EFFECTS_AUDIT_REQUIRED';
  end if;
  return jsonb_build_object('verificationId',v.id,'requestId',v.request_id,
    'verifiedAt',to_char(date_trunc('milliseconds',v.verified_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'verifiedBy',v.verified_by,'outboxId',o.id,'outboxStatus',o.status,
    'state',case when o.status = 'held' then 'pending' else 'complete' end,'auditReceipt',a);
end
$context$;

create or replace function public.research_assisted_order_payment_effects_pending(
  p_after_created_at timestamptz default null,p_after_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $pending$
begin
  if (p_after_created_at is null) <> (p_after_id is null) or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid payment effects cursor' using errcode = '22023';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('verificationId',x.assisted_order_verification_id,
    'outboxId',x.id,'createdAt',to_char(x.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    order by x.created_at,x.id),'[]'::jsonb)
    from (select id,created_at,assisted_order_verification_id from public.research_notification_outbox
      where assisted_order_verification_id is not null and status = 'held'
        and (p_after_created_at is null or (created_at,id) > (p_after_created_at,p_after_id))
      order by created_at,id limit p_limit) x);
end
$pending$;

create or replace function public.research_assisted_order_payment_effects_complete(
  p_verification_id uuid,p_schema_version text,p_attestation text,p_event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $complete$
declare
  o public.research_notification_outbox%rowtype;
  c jsonb;
begin
  select * into o from public.research_notification_outbox
    where assisted_order_verification_id = p_verification_id for update;
  if not found then return null; end if;
  c := public.research_assisted_order_payment_effects_context(p_verification_id);
  -- Return a committed receipt before generating/revalidating an alias. Another
  -- worker may have completed under a previous HMAC key while this one waited.
  if c->'auditReceipt' = 'null'::jsonb then
    if p_event->>'eventId' is distinct from c->>'verificationId'
       or p_event->>'requestId' is distinct from c->>'requestId'
       or p_event->>'eventType' is distinct from 'assisted_order.status_changed'
       or p_event->>'actorType' is distinct from 'admin'
       or p_event->>'occurredAt' is distinct from c->>'verifiedAt'
       or p_event->'evidence' is distinct from '{"from":"payment_review","to":"paid","authorityEvidenceKinds":["payment_verification"]}'::jsonb then
      raise exception 'Payment audit binding conflicts'
        using errcode = 'P0001', detail = 'ASSISTED_ORDER_EFFECTS_CONFLICT';
    end if;
    perform public.research_assisted_order_audit_append(p_schema_version,p_attestation,p_event);
  end if;
  if o.status = 'held' then
    update public.research_notification_outbox set status='pending',updated_at=clock_timestamp()
      where id=o.id;
  end if;
  return public.research_assisted_order_payment_effects_context(p_verification_id);
end
$complete$;

create or replace function public.research_assisted_order_payment_effects_outbox_ready(
  p_outbox_id uuid,p_verification_id uuid,p_event_key text,p_recipient text,p_template_key text,p_payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $ready$
declare o public.research_notification_outbox%rowtype;
begin
  if p_verification_id is null then return false; end if;
  select * into o from public.research_notification_outbox where id=p_outbox_id;
  if not found or o.assisted_order_verification_id is distinct from p_verification_id
     or o.event_key is distinct from p_event_key or o.recipient is distinct from p_recipient
     or o.template_key is distinct from p_template_key or o.payload is distinct from p_payload
     or o.status not in ('pending','processing','failed_retryable') then return false; end if;
  return public.research_assisted_order_payment_effects_context(p_verification_id)->>'state' = 'complete';
end
$ready$;

create or replace function public.research_assisted_order_payment_effects_authority()
returns jsonb language sql stable security definer set search_path = '' as $authority$
  select jsonb_build_object('schemaVersion','research_assisted_order_payment_effects_v1',
    'intentPolicy','verification_atomic_canonical_outbox_v1',
    'auditPolicy','canonical_audit_before_dispatch_v1','historicalAdoption',false);
$authority$;

revoke all on function public.research_assisted_order_payment_effects_audit_receipt(uuid) from public,anon,authenticated,service_role;
revoke all on function public.research_assisted_order_payment_effects_outbox_guard() from public,anon,authenticated,service_role;
revoke all on function public.research_assisted_order_payment_effects_capture() from public,anon,authenticated,service_role;
revoke all on function public.research_assisted_order_payment_effects_authority() from public,anon,authenticated,service_role;
revoke all on function public.research_assisted_order_payment_effects_context(uuid) from public,anon,authenticated,service_role;
revoke all on function public.research_assisted_order_payment_effects_pending(timestamptz,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.research_assisted_order_payment_effects_complete(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.research_assisted_order_payment_effects_outbox_ready(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_assisted_order_payment_effects_authority() to service_role;
grant execute on function public.research_assisted_order_payment_effects_context(uuid) to service_role;
grant execute on function public.research_assisted_order_payment_effects_pending(timestamptz,uuid,integer) to service_role;
grant execute on function public.research_assisted_order_payment_effects_complete(uuid,text,text,jsonb) to service_role;
grant execute on function public.research_assisted_order_payment_effects_outbox_ready(uuid,uuid,text,text,text,jsonb) to service_role;

do $postcondition$
declare p record; v_role text;
begin
  for p in select oid,proname from pg_proc where pronamespace='public'::regnamespace
    and proname like 'research_assisted_order_payment_effects_%' loop
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role,p.oid,'EXECUTE') is distinct from
        (v_role='service_role' and p.proname in ('research_assisted_order_payment_effects_authority',
          'research_assisted_order_payment_effects_context','research_assisted_order_payment_effects_pending',
          'research_assisted_order_payment_effects_complete','research_assisted_order_payment_effects_outbox_ready')) then
        raise exception 'Payment effects RPC privileges invalid' using errcode='55000';
      end if;
    end loop;
  end loop;
  if exists (select 1 from public.research_assisted_order_payment_verifications where method='provider')
     or has_function_privilege('service_role','public.research_assisted_order_payment_verify(uuid,uuid)','EXECUTE') then
    raise exception 'Existing provider or unbound verifier hold changed' using errcode='55000';
  end if;
end
$postcondition$;
commit;
