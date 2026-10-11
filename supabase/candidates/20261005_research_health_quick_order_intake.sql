-- DISABLED SOURCE CANDIDATE / NOT RUN. Doc71 + Doc78; no migration registration.
-- No installation, route, execution, measurement or live-intake authority.
begin;
set local search_path='';
do $qo_install$
declare
  install_sql pg_catalog.text:=$qo_ddl$
-- Canonical five-write transaction candidate; missing trusted prerequisites refuse.
-- The database owner can bypass this boundary; no owner-resistant proof is claimed.
create function public.research_health_quick_order_intake_closed(v pg_catalog.jsonb, keys pg_catalog.text[])
returns boolean language sql immutable set search_path='' as $closed$
  select case when jsonb_typeof(v)='object' then
    (select array_agg(k order by k) from jsonb_object_keys(v) k)
      = (select array_agg(k order by k) from unnest(keys) k)
    else false end
$closed$;

create function public.research_health_quick_order_intake_valid(
  p_request_id pg_catalog.uuid,p_payload_hash pg_catalog.text,p_received_at pg_catalog.timestamptz,
  p_attribution pg_catalog.jsonb,p_receipt pg_catalog.jsonb,p_classifications pg_catalog.jsonb)
returns boolean language plpgsql immutable set search_path='' as $valid$
declare v pg_catalog.jsonb; k pg_catalog.text; s pg_catalog.text; seen pg_catalog.text[]:=array[]::pg_catalog.text[]; identity pg_catalog.text; subtotal numeric;
begin
  if p_request_id is null or p_payload_hash is null or p_payload_hash!~'^[a-f0-9]{64}$'
    or p_received_at is null or not isfinite(p_received_at)
    or p_received_at<>date_trunc('milliseconds',p_received_at)
    or public.research_health_quick_order_intake_closed(p_attribution,
      array['schemaVersion','source','sourceDetail','declaredAffiliateCode','affiliation',
        'confirmedByCustomer','receivedAt','reviewState','commissionState']) is not true
    or p_attribution->>'schemaVersion' is distinct from 'attribution-v1'
    or p_attribution->'confirmedByCustomer' is distinct from 'true'::pg_catalog.jsonb
    or p_attribution->>'commissionState' is distinct from 'not_authorized'
    or p_attribution->>'source' not in ('person','collective','organization','social','search','direct','other')
    or jsonb_typeof(p_attribution->'source') is distinct from 'string'
    or public.research_health_quick_order_intake_closed(p_attribution->'affiliation',array['kind','detail']) is not true
    or p_attribution->'affiliation'->>'kind' not in ('none','collective','gym','team','clinic','other')
    or jsonb_typeof(p_attribution->'affiliation'->'kind') is distinct from 'string'
    or jsonb_typeof(p_attribution->'receivedAt') is distinct from 'string'
    or p_attribution->>'receivedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
    or p_attribution->>'receivedAt' is distinct from to_char(p_received_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    or (p_attribution->>'receivedAt')::pg_catalog.timestamptz is distinct from p_received_at
  then return false; end if;
  -- Input was normalized by core.mjs. These closed storage checks do not replace
  -- the frozen decoder's Unicode normalization checks or legal standing.
  foreach k in array array['sourceDetail','affiliationDetail'] loop
    v:=case when k='sourceDetail' then p_attribution->k else p_attribution->'affiliation'->'detail' end;
    if jsonb_typeof(v) is distinct from 'string' then return false; end if;
    s:=v#>>'{}';
    if length(s)>180 or s<>btrim(s) or s~'[[:cntrl:]]' then return false; end if;
    if k='sourceDetail' and p_attribution->>'source'<>'direct' and s='' then return false; end if;
    if k='affiliationDetail' and
      ((p_attribution->'affiliation'->>'kind'='none' and s<>'')
       or (p_attribution->'affiliation'->>'kind'<>'none' and s='')) then return false; end if;
  end loop;
  v:=p_attribution->'declaredAffiliateCode';
  if v not in ('null'::pg_catalog.jsonb,'""'::pg_catalog.jsonb) and (jsonb_typeof(v) is distinct from 'string'
      or v#>>'{}' !~ '^[A-Z0-9_-]{1,64}$') then return false; end if;
  if p_attribution->>'reviewState' is distinct from
    case when p_attribution->>'source'='direct' and v in ('null'::pg_catalog.jsonb,'""'::pg_catalog.jsonb)
      then 'direct_no_referrer' else 'captured_unmatched' end then return false; end if;
  if public.research_health_quick_order_intake_closed(p_receipt,
      array['schemaVersion','requestId','publicReference','payloadHash','attributionState','estimate']) is not true
    or p_receipt->>'schemaVersion' is distinct from 'quick-order-v1'
    or p_receipt->>'requestId' is distinct from p_request_id::pg_catalog.text
    or jsonb_typeof(p_receipt->'publicReference') is distinct from 'string'
    or p_receipt->>'publicReference' !~ '^XRR-[0-9]{8}-[A-F0-9]{10}$'
    or jsonb_typeof(p_receipt->'payloadHash') is distinct from 'string'
    or p_receipt->>'payloadHash' is distinct from p_payload_hash
    or p_receipt->>'attributionState' is distinct from p_attribution->>'reviewState'
    or public.research_health_quick_order_intake_closed(p_receipt->'estimate',
      array['knownSubtotalCents','estimateComplete','currency']) is not true
    or p_receipt->'estimate'->>'currency' is distinct from 'USD'
    or jsonb_typeof(p_receipt->'estimate'->'estimateComplete') is distinct from 'boolean'
    or jsonb_typeof(p_receipt->'estimate'->'knownSubtotalCents') is distinct from 'number'
    or p_receipt->'estimate'->>'knownSubtotalCents' !~ '^[0-9]+$'
  then return false; end if;
  subtotal:=(p_receipt->'estimate'->>'knownSubtotalCents')::numeric;
  if subtotal>9007199254740991 then return false; end if;
  if jsonb_typeof(p_classifications) is distinct from 'array'
    or jsonb_array_length(p_classifications) not between 1 and 100 then return false; end if;
  for v in select value from jsonb_array_elements(p_classifications) loop
    if public.research_health_quick_order_intake_closed(v,array['schemaVersion','requestId',
       'productId','variantId','payloadHash','decision','sourceVersion','authorityRevisionId']) is not true
      or v->>'schemaVersion' is distinct from 'quick-order-health-classification-v1'
      or v->>'requestId' is distinct from p_request_id::pg_catalog.text
      or jsonb_typeof(v->'payloadHash') is distinct from 'string'
      or v->>'payloadHash' is distinct from p_payload_hash
      or v->>'decision' is distinct from 'health_requestable'
      or jsonb_typeof(v->'authorityRevisionId') is distinct from 'string'
      or v->>'authorityRevisionId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    then return false; end if;
    foreach k in array array['productId','variantId','sourceVersion'] loop
      s:=v->>k;
      if jsonb_typeof(v->k) is distinct from 'string' or s='' or length(s)>160
        or s<>btrim(s) or s~'[[:cntrl:]]' then return false; end if;
    end loop;
    identity:=jsonb_build_array(v->>'productId',v->>'variantId')::pg_catalog.text;
    if identity=any(seen) then return false; end if;
    seen:=array_append(seen,identity);
  end loop;
  return true;
exception when others then return false;
end
$valid$;

create table public.research_health_quick_order_intakes (
  request_id pg_catalog.uuid primary key references public.research_assisted_order_requests(id) on delete restrict,
  actor_scope pg_catalog.text not null,
  key_hash pg_catalog.text not null,
  payload_hash pg_catalog.text not null,
  received_at pg_catalog.timestamptz not null,
  attribution_snapshot pg_catalog.jsonb not null,
  request_acknowledged boolean not null,
  receipt pg_catalog.jsonb not null,
  classifications pg_catalog.jsonb not null,
  notification_recipient pg_catalog.text not null,
  constraint research_health_quick_order_intakes_actor_key_uq unique(actor_scope,key_hash),
  constraint research_health_quick_order_intakes_actor_chk check (
    actor_scope~'^(member:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}|early_access:eac_[a-f0-9]{32})$'),
  constraint research_health_quick_order_intakes_key_chk check(key_hash~'^[a-f0-9]{64}$'),
  constraint research_health_quick_order_intakes_ack_chk check(request_acknowledged is true),
  constraint research_health_quick_order_intakes_recipient_chk check (
    length(notification_recipient) between 3 and 320 and notification_recipient=btrim(notification_recipient)
    and notification_recipient!~'[[:cntrl:][:space:]]'
    and notification_recipient~'^[^@]+@[^@]+[.][^@]+$'),
  constraint research_health_quick_order_intakes_evidence_chk check (
    public.research_health_quick_order_intake_valid(request_id,payload_hash,received_at,
      attribution_snapshot,receipt,classifications) is true)
);
alter table public.research_health_quick_order_intakes enable row level security;
alter table public.research_health_quick_order_intakes force row level security;
revoke all on public.research_health_quick_order_intakes from public,anon,authenticated,service_role;
-- No policies, raw table/column grants or owner-proof immutability. Two reader
-- RPCs and the prerequisite-refusing commit below form the service-only API.

create function public.research_health_quick_order_admin_detail(p_request_id pg_catalog.uuid)
returns pg_catalog.jsonb language plpgsql stable security definer set search_path='' as $detail$
declare
  r public.research_assisted_order_requests%rowtype;
  c public.research_health_quick_order_intakes%rowtype;
  e public.research_assisted_order_events%rowtype;
  o public.research_notification_outbox%rowtype;
  detail pg_catalog.jsonb; intake pg_catalog.jsonb; result pg_catalog.jsonb; v_event_key pg_catalog.text;
  marked integer; obligations integer; have_companion boolean; have_request boolean;
  subtotal numeric; complete boolean; line_count integer; raw_time pg_catalog.timestamptz;
begin
  if p_request_id is null then raise exception 'Quick Order evidence unavailable' using errcode='22023'; end if;
  v_event_key:='assisted-order:'||p_request_id::pg_catalog.text||':quick-order-submitted:admin';
  select * into r from public.research_assisted_order_requests where id=p_request_id;
  have_request:=found;
  select * into c from public.research_health_quick_order_intakes where request_id=p_request_id;
  have_companion:=found;
  -- Only submitted events can identify an intake. Later canonical status events
  -- may carry arbitrary operator evidence, including these keys. Malformed
  -- submitted candidates still refuse before the genuine-legacy fallback.
  if exists(select 1 from public.research_assisted_order_events
    where request_id=p_request_id and status='submitted'
      and (evidence ? 'intakeKind' or evidence ? 'payloadHash')
      and (public.research_health_quick_order_intake_closed(evidence,array['intakeKind','payloadHash']) is not true
        or evidence->>'intakeKind' is distinct from 'quick-order-v1'
        or jsonb_typeof(evidence->'payloadHash') is distinct from 'string'
        or evidence->>'payloadHash' !~ '^[a-f0-9]{64}$')) then
    raise exception 'Quick Order submitted marker unavailable' using errcode='55000';
  end if;
  select count(*) into marked from public.research_assisted_order_events
    where request_id=p_request_id and status='submitted'
      and public.research_health_quick_order_intake_closed(evidence,array['intakeKind','payloadHash']) is true;
  select count(*) into obligations from public.research_notification_outbox n
    where n.event_key=v_event_key or
      (n.template_key='research.assisted_order.quick_order.submitted.admin.v1'
       and n.payload->>'requestId'=p_request_id::pg_catalog.text);
  if not have_request then
    if have_companion or marked<>0 or obligations<>0 then
      raise exception 'Quick Order evidence unavailable' using errcode='55000';
    end if;
    return null;
  end if;
  detail:=public.research_assisted_order_admin_get(p_request_id);
  if public.research_health_quick_order_intake_closed(detail,array[
      'requestId','publicReference','status','actorMemberId','fullLegalName','email','mobilePhone',
      'organizationName','shippingAddress','billingAddress','lines','estimatedTotalCents','currency',
      'generalNotes','agreements','affiliateAttributionRef','timeline','documents','createdAt','updatedAt']) is not true
    or detail->>'requestId' is distinct from r.id::pg_catalog.text
    or detail->>'publicReference' is distinct from r.public_reference
    or r.source is distinct from 'early_access_manual_order_bridge'
  then raise exception 'Quick Order evidence unavailable' using errcode='55000'; end if;
  detail:=detail||jsonb_build_object('source',r.source,'declaredAffiliateCode',r.declared_affiliate_code,
    'declaredAffiliateCodeState',coalesce(r.declared_affiliate_code_state,'not_provided'));
  if not have_companion and marked=0 and obligations=0 then
    return jsonb_build_object('schemaVersion','quick-order-admin-envelope-v1','requestId',r.id,
      'detail',detail,'submittedEvent',null,'enrichment',null);
  end if;
  if not have_companion or marked<>1 or obligations<>1
    or public.research_health_quick_order_intake_valid(c.request_id,c.payload_hash,c.received_at,
      c.attribution_snapshot,c.receipt,c.classifications) is not true
    or c.request_acknowledged is distinct from true
  then raise exception 'Quick Order evidence unavailable' using errcode='55000'; end if;
  select * into strict e from public.research_assisted_order_events
    where request_id=p_request_id and status='submitted'
      and public.research_health_quick_order_intake_closed(evidence,array['intakeKind','payloadHash']) is true;
  select * into strict o from public.research_notification_outbox n
    where n.event_key=v_event_key or
      (n.template_key='research.assisted_order.quick_order.submitted.admin.v1'
       and n.payload->>'requestId'=p_request_id::pg_catalog.text);
  if e.status is distinct from 'submitted'
    or public.research_health_quick_order_intake_closed(e.evidence,array['intakeKind','payloadHash']) is not true
    or e.evidence->>'intakeKind' is distinct from 'quick-order-v1'
    or jsonb_typeof(e.evidence->'payloadHash') is distinct from 'string'
    or e.evidence->>'payloadHash' is distinct from c.payload_hash
    or r.request_fingerprint is distinct from c.payload_hash
    or c.receipt->>'publicReference' is distinct from r.public_reference
  then raise exception 'Quick Order evidence unavailable' using errcode='55000'; end if;
  -- Equality is checked before rendering. Never hide nonzero microseconds.
  foreach raw_time in array array[r.created_at,e.occurred_at,c.received_at] loop
    if not isfinite(raw_time) or raw_time<>date_trunc('milliseconds',raw_time)
      or raw_time is distinct from c.received_at then
      raise exception 'Quick Order identity time unavailable' using errcode='55000';
    end if;
  end loop;
  if o.event_key is distinct from v_event_key or o.event_type is distinct from 'assisted_order.submitted'
    or o.channel is distinct from 'email'
    or o.template_key is distinct from 'research.assisted_order.quick_order.submitted.admin.v1'
    or o.recipient is distinct from c.notification_recipient
    or o.application_id is not null or o.member_id is not null
    or o.assisted_order_verification_id is not null or o.assisted_order_disposition_id is not null
    or o.payload is distinct from jsonb_build_object('schemaVersion','quick-order-v1',
      'requestId',r.id,'publicReference',r.public_reference)
    or o.status not in ('held','pending','processing','sent','delivered','failed_retryable','failed_permanent','cancelled')
    or o.attempt_count<0 or o.next_attempt_at is null or not isfinite(o.next_attempt_at)
    or (o.completed_at is not null and not isfinite(o.completed_at))
  then raise exception 'Quick Order obligation unavailable' using errcode='55000'; end if;
  -- Canonical retained-line authority, not current catalog or fabricated fixture prices.
  select count(*),coalesce(sum(l.unit_price_cents::numeric*l.quantity),0),
    coalesce(bool_and(l.unit_price_cents is not null),false)
    into line_count,subtotal,complete from public.research_assisted_order_lines l where l.request_id=r.id;
  if line_count not between 1 and 100 or line_count<>jsonb_array_length(c.classifications)
    or exists(select 1 from public.research_assisted_order_lines l where l.request_id=r.id
      group by l.product_id,l.variant_id having count(*)>1)
    or subtotal>9007199254740991
    or (c.receipt->'estimate'->>'knownSubtotalCents')::numeric is distinct from subtotal
    or (c.receipt->'estimate'->>'estimateComplete')::boolean is distinct from complete
    or r.estimated_total_cents::numeric is distinct from nullif(subtotal,0)
    or r.currency is distinct from 'USD'
    or exists (select 1 from public.research_assisted_order_lines l where l.request_id=r.id and (
      l.quantity not between 1 and 100000 or l.research_use_only is distinct from false
      or l.minimum_quantity<1 or l.quantity_increment<1 or l.quantity<l.minimum_quantity
      or (l.maximum_quantity is not null and (l.maximum_quantity<l.minimum_quantity or l.quantity>l.maximum_quantity))
      or case when l.quantity_increment>=1 then (l.quantity-l.minimum_quantity)%l.quantity_increment<>0 else true end
      or l.workflow_mode not in ('direct_order_request','request_pricing') or l.currency<>'USD'
      or (l.workflow_mode='request_pricing' and l.unit_price_cents is not null)
      or (l.unit_price_cents is not null and (l.unit_price_cents<=0 or l.unit_price_cents>9007199254740991))
      or l.line_estimate_cents::numeric is distinct from l.unit_price_cents::numeric*l.quantity
      or not exists (select 1 from jsonb_array_elements(c.classifications) x
        where x->>'productId'=l.product_id and x->>'variantId'=l.variant_id)))
  then raise exception 'Quick Order retained lines unavailable' using errcode='55000'; end if;
  intake:=jsonb_build_object('schemaVersion','quick-order-v1',
    'source',c.attribution_snapshot->'source','sourceDetail',c.attribution_snapshot->'sourceDetail',
    'declaredCode',nullif(c.attribution_snapshot->'declaredAffiliateCode','""'::pg_catalog.jsonb),
    'affiliationKind',c.attribution_snapshot->'affiliation'->'kind',
    'affiliationDetail',c.attribution_snapshot->'affiliation'->'detail',
    'confirmedByCustomer',c.attribution_snapshot->'confirmedByCustomer',
    'confirmedAt',c.attribution_snapshot->'receivedAt','requestAcknowledged',c.request_acknowledged,
    'reviewState',c.attribution_snapshot->'reviewState','commissionState',c.attribution_snapshot->'commissionState',
    'estimate',c.receipt->'estimate');
  detail:=jsonb_set(detail,'{createdAt}',to_jsonb(to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  result:=jsonb_build_object('schemaVersion','quick-order-admin-envelope-v1','requestId',r.id,'detail',detail,
    'submittedEvent',jsonb_build_object('schemaVersion','quick-order-v1','requestId',r.id,
      'eventType',e.status,'occurredAt',c.attribution_snapshot->'receivedAt','payloadHash',c.payload_hash),
    'enrichment',jsonb_build_object('schemaVersion','quick-order-v1',
      'companion',jsonb_build_object('requestId',r.id,'payloadHash',c.payload_hash,'intake',intake),
      'receipt',c.receipt,
      'obligation',jsonb_build_object('eventKey',o.event_key,'templateKey',o.template_key,'payload',o.payload),
      'observation',jsonb_build_object('state','observed','eventKey',o.event_key,
        'observedAt',to_char(date_trunc('milliseconds',statement_timestamp()) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'notification',jsonb_build_object('status',o.status,'attemptCount',o.attempt_count,
          'nextAttemptAt',to_char(date_trunc('milliseconds',o.next_attempt_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'completedAt',case when o.completed_at is null then null else
            to_char(date_trunc('milliseconds',o.completed_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end))));
  return result;
end
$detail$;

create function public.research_health_quick_order_replay(p_actor_scope pg_catalog.text,p_key_hash pg_catalog.text)
returns pg_catalog.jsonb language plpgsql stable security definer set search_path='' as $replay$
declare c public.research_health_quick_order_intakes%rowtype;
begin
  -- Caller must already authenticate and derive this scope. This is not Auth,
  -- an impersonation boundary against service_role, a token mint or a writer.
  if p_actor_scope is null or p_key_hash is null
    or p_actor_scope!~'^(member:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}|early_access:eac_[a-f0-9]{32})$'
    or p_key_hash!~'^[a-f0-9]{64}$'
  then raise exception 'Quick Order replay identity unavailable' using errcode='22023'; end if;
  select * into c from public.research_health_quick_order_intakes
    where actor_scope=p_actor_scope and key_hash=p_key_hash;
  if not found then return null; end if;
  perform public.research_health_quick_order_admin_detail(c.request_id);
  return jsonb_build_object('payloadHash',c.payload_hash,'publicReceipt',jsonb_build_object(
    'requestId',c.receipt->'requestId','publicReference',c.receipt->'publicReference',
    'attributionState',c.receipt->'attributionState',
    'estimate',(c.receipt->'estimate')||jsonb_build_object('excludes',
      'Shipping, tax, clinical, pharmacy and other unconfirmed charges. Not a payment quote.')));
end
$replay$;

-- Doc71 / Doc78 disabled transaction. This body is never mounted by the production
-- factory. The private context, configuration digest and recipient are supplied
-- only by an authenticated server constructor (synthetic fixtures in this slice).
-- No EXCEPTION block: all source/witness/gate/head locks and all five writes
-- remain in the caller's one outer transaction. A returned value is not a commit
-- receipt until the single-RPC transport confirms transaction completion.
create function public.research_health_quick_order_commit(p_payload pg_catalog.jsonb)
returns pg_catalog.jsonb language plpgsql volatile security definer set search_path='' as $qo_commit$
declare
  args pg_catalog.jsonb; input pg_catalog.jsonb; context pg_catalog.jsonb;
  actor pg_catalog.text; key_hash pg_catalog.text; payload_hash pg_catalog.text;
  recovered pg_catalog.jsonb; preflight pg_catalog.jsonb; current_authority pg_catalog.jsonb;
  revision public.research_health_quick_order_authority_revisions%rowtype;
  decision pg_catalog.jsonb; scope pg_catalog.jsonb; offer pg_catalog.jsonb; rule pg_catalog.jsonb;
  line pg_catalog.jsonb; snapshot pg_catalog.jsonb; item pg_catalog.jsonb;
  offerings pg_catalog.jsonb; lines pg_catalog.jsonb:='[]'::pg_catalog.jsonb;
  classifications pg_catalog.jsonb:='[]'::pg_catalog.jsonb; required_pairs pg_catalog.jsonb;
  member public.research_members%rowtype; customer public.research_early_access_customers%rowtype;
  binding public.research_early_access_session_bindings%rowtype;
  legal public.research_early_access_legal_bindings%rowtype;
  legal_match public.research_early_access_legal_bindings%rowtype;
  identity_count pg_catalog.int4; snapshot_matches pg_catalog.jsonb;
  private_session public.research_private_early_access_sessions%rowtype;
  product public.research_products%rowtype; variant public.research_product_variants%rowtype;
  price public.research_product_prices%rowtype; lot public.research_inventory_lots%rowtype;
  document public.research_lot_quality_documents%rowtype;
  v_customer_ref pg_catalog.text; member_id pg_catalog.uuid; decision_at pg_catalog.timestamptz;
  preflight_at pg_catalog.timestamptz; observed pg_catalog.jsonb; v_domain pg_catalog.text;
  witness_ids pg_catalog.uuid[]:='{}'::pg_catalog.uuid[]; document_ids pg_catalog.uuid[]:='{}'::pg_catalog.uuid[];
  witness_id pg_catalog.uuid; quantity pg_catalog.int4; price_count pg_catalog.int8;
  subtotal pg_catalog.numeric:=0; complete pg_catalog.bool:=true; amount pg_catalog.int8;
  price_version pg_catalog.text; workflow pg_catalog.text; source_version pg_catalog.text;
  price_preimage pg_catalog.text; stock_preimage pg_catalog.text; line_preimage pg_catalog.text;
  lot_digest pg_catalog.text; document_digest pg_catalog.text; tests_digest pg_catalog.text;
  request_id pg_catalog.uuid; public_reference pg_catalog.text; received_text pg_catalog.text;
  attribution pg_catalog.jsonb; receipt pg_catalog.jsonb; result pg_catalog.jsonb;
  object_name pg_catalog.text; relation_oid pg_catalog.oid;
  callable pg_catalog.text; function_oid pg_catalog.oid;
  limits_raw pg_catalog.text; limits pg_catalog.jsonb; profile pg_catalog.jsonb; anchor pg_catalog.text; catalog_settings pg_catalog.text[];
  login_oid pg_catalog.oid; database_oid pg_catalog.oid; owner_oid pg_catalog.oid; request_role pg_catalog.text;
  timer pg_catalog.text; timer_field pg_catalog.text; timer_raw pg_catalog.text; catalog_raw pg_catalog.text; timer_parts pg_catalog.text[];
  effective_ms pg_catalog.numeric; catalog_ms pg_catalog.numeric; field pg_catalog.text; section pg_catalog.text; setting_row pg_catalog.text;
  elapsed_ms pg_catalog.numeric; class_name pg_catalog.text; timer_values pg_catalog.jsonb := '{}'::pg_catalog.jsonb;
begin
  if public.research_health_quick_order_intake_closed(p_payload,array[
      'schemaVersion','actorScope','context','expectedConfigurationDigest','notificationRecipient','submission']) is not true
    or p_payload->>'schemaVersion' is distinct from 'quick-order-commit-v1' then
    raise exception 'Quick Order input unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}';
  end if;
  actor:=p_payload->>'actorScope'; args:=p_payload->'submission'; input:=args->'input'; context:=p_payload->'context';
  payload_hash:=args->>'payloadHash';
  if actor is null or actor!~'^(member:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}|early_access:eac_[a-f0-9]{32})$'
    or input->>'idempotencyKey' is null or input->>'idempotencyKey'!~'^[A-Za-z0-9_-]{16,80}$'
    or payload_hash is null or payload_hash!~'^[a-f0-9]{64}$' then
    raise exception 'Quick Order identity unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}';
  end if;
  key_hash:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    'xenios:health:quick-order:key:v1|'||actor||'|'||(input->>'idempotencyKey'),'UTF8'),'sha256'),'hex');
  -- Read-only recovery precedes mutable admission. An already committed receipt
  -- needs no waiting actor lock. New submissions check catalog/effective finite
  -- timer consistency before that first lock, then repeat recovery under it.
  -- These checks do not establish that the connection armed timers before BEGIN.
  recovered:=public.research_health_quick_order_replay(actor,key_hash);
  if recovered is not null then
    if recovered->>'payloadHash' is distinct from payload_hash then
      raise exception 'Quick Order key conflicts' using errcode='23505',detail='{"quickOrderCode":"IDEMPOTENCY_CONFLICT"}';
    end if;
    return recovered->'publicReceipt'||pg_catalog.jsonb_build_object('persisted',true,'replayed',true);
  end if;
  if pg_catalog.current_setting('transaction_isolation') is distinct from 'read committed'
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4<170011
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4>=180000
    or pg_catalog.current_setting('max_prepared_transactions')::pg_catalog.int4<>0 then
    raise exception 'Quick Order transaction contract unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}';
  end if;



  -- Admission is a catalog/effective-setting consistency check, never proof that
  -- the gateway armed a timer before BEGIN. No value or route is installed here.
  select oid into login_oid from pg_catalog.pg_roles where rolname=session_user;
  select oid into database_oid from pg_catalog.pg_database where datname=pg_catalog.current_database();
  select relowner into owner_oid from pg_catalog.pg_class
    where oid='public.research_assisted_order_provider_fence'::pg_catalog.regclass;
  request_role := pg_catalog.current_setting('role',true);
  if request_role='none' then request_role:=session_user; end if;
  if login_oid is null or database_oid is null or owner_oid is null or request_role is null
    or current_user<>pg_catalog.pg_get_userbyid(owner_oid) then
    raise exception 'Quick Order connection identities unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
  select setconfig into catalog_settings from pg_catalog.pg_db_role_setting
    where setrole=login_oid and setdatabase=database_oid;
  select pg_catalog.substring(s,pg_catalog.length('research_health_quick_order.approved_limits=')+1)
    into limits_raw from pg_catalog.unnest(catalog_settings) s
    where pg_catalog.starts_with(s,'research_health_quick_order.approved_limits=');
  anchor := (p_payload->>'expectedConfigurationDigest');
  if anchor is null or anchor !~ '^[0-9a-f]{64}$' or limits_raw is null
    or pg_catalog.encode(extensions.digest(pg_catalog.convert_to(limits_raw,'UTF8'),'sha256'),'hex')<>anchor
    or limits_raw is not json object with unique keys then
    raise exception 'Quick Order approved limits binding unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
  -- This caller-supplied digest checks consistency with catalog approved_limits
  -- bytes; it is not authorization against a caller already holding EXECUTE.
  -- jsonb::pg_catalog.text is not the serialization or hash preimage. The adapter
  -- separately checks canonical encoding; neither fact proves pre-BEGIN arming.
  limits:=limits_raw::pg_catalog.jsonb;
  if limits-array['schemaVersion','profileId','profileVersion','database','loginRole','requestRole','ownerRole',
      'routeClass','routeId','timeZone','dateStyle','intake','writer','enforcement']<>'{}'::pg_catalog.jsonb
    or not limits ?& array['schemaVersion','profileId','profileVersion','database','loginRole','requestRole','ownerRole',
      'routeClass','routeId','timeZone','dateStyle','intake','writer','enforcement']
    or limits->>'schemaVersion' is distinct from 'quick-order-approved-limits-v1'
    or limits->>'routeClass' is distinct from 'intake' or limits_raw ~ '[^ -~]'
    or limits#>>'{database,name}' is distinct from pg_catalog.current_database()
    or limits#>>'{database,oid}' is distinct from database_oid::pg_catalog.text
    or limits#>>'{loginRole,name}' is distinct from session_user::pg_catalog.text
    or limits#>>'{loginRole,oid}' is distinct from login_oid::pg_catalog.text
    or limits#>>'{requestRole,name}' is distinct from request_role
    or limits#>>'{requestRole,oid}' is distinct from (select oid::pg_catalog.text from pg_catalog.pg_roles where rolname=request_role)
    or limits#>>'{ownerRole,name}' is distinct from current_user::pg_catalog.text
    or limits#>>'{ownerRole,oid}' is distinct from owner_oid::pg_catalog.text then
    raise exception 'Quick Order approved limits identity mismatch' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
  foreach field in array array['profileId','profileVersion','routeId','timeZone','dateStyle'] loop
    if pg_catalog.jsonb_typeof(limits->field)<>'string' or pg_catalog.length(limits->>field)=0 then
      raise exception 'Quick Order approved limits identity missing' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
  end loop;
  foreach section in array array['database','loginRole','requestRole','ownerRole'] loop
    if pg_catalog.jsonb_typeof(limits->section)<>'object'
      or (limits->section)-array['name','oid']<>'{}'::pg_catalog.jsonb
      or not (limits->section) ?& array['name','oid']
      or pg_catalog.jsonb_typeof(limits#>array[section,'name'])<>'string'
      or pg_catalog.jsonb_typeof(limits#>array[section,'oid'])<>'string'
      or limits#>>array[section,'oid'] !~ '^[1-9][0-9]*$' then
      raise exception 'Quick Order role binding malformed' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
  end loop;
  if pg_catalog.jsonb_typeof(limits->'enforcement')<>'object'
    or (limits->'enforcement')-array['preBeginAttestationSha256','writerOrderAttestationSha256','singleRpcAutocommit']<>'{}'::pg_catalog.jsonb
    or not (limits->'enforcement') ?& array['preBeginAttestationSha256','writerOrderAttestationSha256','singleRpcAutocommit']
    or pg_catalog.jsonb_typeof(limits#>'{enforcement,preBeginAttestationSha256}') is distinct from 'string'
    or limits#>>'{enforcement,preBeginAttestationSha256}' !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(limits#>'{enforcement,writerOrderAttestationSha256}') is distinct from 'string'
    or limits#>>'{enforcement,writerOrderAttestationSha256}' !~ '^[0-9a-f]{64}$'
    or limits#>'{enforcement,singleRpcAutocommit}'<>'true'::pg_catalog.jsonb then
    raise exception 'Quick Order route attestation binding missing' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
  foreach section in array array['intake','writer'] loop
    profile:=limits->section;
    if pg_catalog.jsonb_typeof(profile)<>'object'
      or not profile ?& array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
        'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs']
      or (section='intake' and profile-array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
        'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs']<>'{}'::pg_catalog.jsonb)
      or (section='writer' and (not profile ?& array['gateWaitMs','postGateReserveMs']
        or profile-array['lockTimeoutMs','statementTimeoutMs','transactionTimeoutMs','idleTimeoutMs','deadlockTimeoutMs',
          'cleanupMs','attemptDeadlineMs','acquisitionMs','responseMs','gateWaitMs','postGateReserveMs']<>'{}'::pg_catalog.jsonb)) then
      raise exception 'Quick Order approved limits fields invalid' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
    for field in select key from pg_catalog.jsonb_each(profile) loop
      if pg_catalog.jsonb_typeof(profile->field)<>'number' or profile->>field !~ '^[1-9][0-9]*$'
        or (profile->>field)::pg_catalog.numeric>9223372036854775807 then
        raise exception 'Quick Order approved limit is not representable positive milliseconds' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
    end loop;
    if (profile->>'idleTimeoutMs')::pg_catalog.numeric >= (profile->>'statementTimeoutMs')::pg_catalog.numeric
      or (profile->>'statementTimeoutMs')::pg_catalog.numeric >= (profile->>'transactionTimeoutMs')::pg_catalog.numeric
      or (profile->>'attemptDeadlineMs')::pg_catalog.numeric <> (profile->>'acquisitionMs')::pg_catalog.numeric+
        (profile->>'transactionTimeoutMs')::pg_catalog.numeric+(profile->>'cleanupMs')::pg_catalog.numeric+(profile->>'responseMs')::pg_catalog.numeric then
      raise exception 'Quick Order approved limit relationships invalid' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
  end loop;
  if (limits#>>'{intake,lockTimeoutMs}')::pg_catalog.numeric >= (limits#>>'{intake,deadlockTimeoutMs}')::pg_catalog.numeric
    or (limits#>>'{writer,gateWaitMs}')::pg_catalog.numeric < (limits#>>'{intake,transactionTimeoutMs}')::pg_catalog.numeric+(limits#>>'{intake,cleanupMs}')::pg_catalog.numeric
    or (limits#>>'{writer,lockTimeoutMs}')::pg_catalog.numeric <> (limits#>>'{writer,gateWaitMs}')::pg_catalog.numeric
    or (limits#>>'{writer,gateWaitMs}')::pg_catalog.numeric+(limits#>>'{writer,postGateReserveMs}')::pg_catalog.numeric >= (limits#>>'{writer,statementTimeoutMs}')::pg_catalog.numeric then
    raise exception 'Quick Order approved gate relationships invalid' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
  profile:=limits->'intake';
  for timer,timer_field in select * from (values ('lock_timeout','lockTimeoutMs'),('statement_timeout','statementTimeoutMs'),
    ('transaction_timeout','transactionTimeoutMs'),('idle_in_transaction_session_timeout','idleTimeoutMs'),('deadlock_timeout','deadlockTimeoutMs')) timers(name,field) loop
    timer_raw:=pg_catalog.current_setting(timer,true);
    timer_parts:=pg_catalog.regexp_match(timer_raw,'^([1-9][0-9]*)(ms|s)$');
    if timer_parts is null then
      raise exception 'Quick Order effective timer unavailable or unsupported' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
    effective_ms:=timer_parts[1]::pg_catalog.numeric * case timer_parts[2] when 'ms' then 1 when 's' then 1000 end;
    if effective_ms>9223372036854775807 or effective_ms>(profile->>timer_field)::pg_catalog.numeric then
      raise exception 'Quick Order effective timer exceeds approved field' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
    timer_values:=timer_values||pg_catalog.jsonb_build_object(timer_field,effective_ms);
    if timer in ('statement_timeout','transaction_timeout','idle_in_transaction_session_timeout') then
      select pg_catalog.substring(s,pg_catalog.length(timer)+2) into catalog_raw
        from pg_catalog.unnest(catalog_settings) s where pg_catalog.starts_with(s,timer||'=');
      timer_parts:=pg_catalog.regexp_match(catalog_raw,'^([1-9][0-9]*)(ms|s)$');
      if timer_parts is null then
        raise exception 'Quick Order startup timer binding missing' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
      catalog_ms:=timer_parts[1]::pg_catalog.numeric * case timer_parts[2] when 'ms' then 1 when 's' then 1000 end;
      if catalog_ms>9223372036854775807 or catalog_ms<>effective_ms then
        raise exception 'Quick Order effective startup timer mismatch' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
    end if;
  end loop;
  if (timer_values->>'idleTimeoutMs')::pg_catalog.numeric >= (timer_values->>'statementTimeoutMs')::pg_catalog.numeric
    or (timer_values->>'statementTimeoutMs')::pg_catalog.numeric >= (timer_values->>'transactionTimeoutMs')::pg_catalog.numeric
    or (timer_values->>'lockTimeoutMs')::pg_catalog.numeric >= (timer_values->>'deadlockTimeoutMs')::pg_catalog.numeric
    or pg_catalog.current_setting('TimeZone') is distinct from limits->>'timeZone'
    or pg_catalog.current_setting('DateStyle') is distinct from limits->>'dateStyle' then
    raise exception 'Quick Order effective profile relationship mismatch' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
  elapsed_ms:=pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()-pg_catalog.transaction_timestamp())*1000;
  if elapsed_ms<0 or elapsed_ms >= (timer_values->>'transactionTimeoutMs')::pg_catalog.numeric then
    raise exception 'Quick Order transaction budget exhausted' using errcode='55P03',detail='{"quickOrderCode":"DEFINITE_REFUSAL_RETRYABLE"}'; end if;
  owner_oid:=(select c.relowner from pg_catalog.pg_class c where c.oid='public.research_assisted_order_provider_fence'::pg_catalog.regclass);
  if owner_oid is distinct from current_user::pg_catalog.regrole::pg_catalog.oid
    or not exists(select 1 from pg_catalog.pg_roles r where r.oid=owner_oid and (r.rolsuper or r.rolbypassrls)) then
    raise exception 'Quick Order owner unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}';
  end if;
  foreach object_name in array array['research_private_early_access_sessions','research_private_early_access_nonces',
      'research_health_quick_order_authority_head','research_health_quick_order_authority_revisions',
      'research_health_quick_order_authority_activations','research_health_quick_order_intakes',
      'research_domain_launch_controls','research_early_access_legal_bindings','research_early_access_session_bindings',
      'research_early_access_shipping_regions','research_inventory_lots','research_lot_quality_documents',
      'research_lot_quality_tests','research_product_content','research_product_prices','research_product_variants',
      'research_products','research_required_inputs'] loop
    if (select c.relowner from pg_catalog.pg_class c where c.oid=pg_catalog.to_regclass('public.'||object_name)) is distinct from owner_oid
      or pg_catalog.has_table_privilege(owner_oid,pg_catalog.to_regclass('public.'||object_name),'SELECT') is not true
      or pg_catalog.has_table_privilege(owner_oid,pg_catalog.to_regclass('public.'||object_name),'UPDATE') is not true then
      raise exception 'Quick Order dependency owner unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}';
    end if;
  end loop;
  -- Additional canonical row-share targets need SELECT plus UPDATE permission;
  -- they do not gain a new same-owner requirement or an automatic grant here.
  foreach object_name in array array['research_members','research_early_access_customers','research_early_access_agreement_acceptances'] loop
    relation_oid:=pg_catalog.to_regclass('public.'||object_name);
    if relation_oid is null or pg_catalog.has_table_privilege(owner_oid,relation_oid,'SELECT') is not true
      or pg_catalog.has_table_privilege(owner_oid,relation_oid,'UPDATE') is not true then
      raise exception 'Quick Order dependency privileges unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}';
    end if;
  end loop;
  foreach object_name in array array['research_assisted_order_requests','research_assisted_order_lines','research_assisted_order_events','research_notification_outbox','research_health_quick_order_intakes'] loop
    relation_oid:=pg_catalog.to_regclass('public.'||object_name);
    if relation_oid is null or pg_catalog.has_table_privilege(owner_oid,relation_oid,'SELECT') is not true
      or pg_catalog.has_table_privilege(owner_oid,relation_oid,'INSERT') is not true then
      raise exception 'Quick Order dependency privileges unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}';
    end if;
  end loop;
  -- Check the named call graph before new-submission locks. Recovery above stays
  -- first. Unknown failures in callees are not broadly converted to this marker.
  if pg_catalog.has_schema_privilege(owner_oid,'public','USAGE') is not true
    or pg_catalog.has_schema_privilege(owner_oid,'extensions','USAGE') is not true then
    raise exception 'Quick Order callee privileges unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}';
  end if;
  foreach callable in array array[
    'extensions.digest(pg_catalog.bytea,pg_catalog.text)',
    'public.research_health_quick_order_intake_closed(pg_catalog.jsonb,pg_catalog.text[])',
    'public.research_health_quick_order_intake_valid(pg_catalog.uuid,pg_catalog.text,pg_catalog.timestamptz,pg_catalog.jsonb,pg_catalog.jsonb,pg_catalog.jsonb)',
    'public.research_health_quick_order_replay(pg_catalog.text,pg_catalog.text)',
    'public.research_health_quick_order_admin_detail(pg_catalog.uuid)',
    'public.research_assisted_order_admin_get(pg_catalog.uuid)',
    'public.research_health_quick_order_currentness_read_strict_authority(pg_catalog.timestamptz)',
    'public.research_health_quick_order_currentness_resolve_scope(pg_catalog.uuid,pg_catalog.text,pg_catalog.jsonb)',
    'public.research_health_quick_order_currentness_integrity()',
    'public.research_health_quick_order_currentness_schema_fingerprint()',
    'public.research_health_quick_order_currentness_valid_publication(pg_catalog.jsonb)',
    'public.research_health_quick_order_currentness_valid_decision_inputs(pg_catalog.text,pg_catalog.jsonb)',
    'public.research_lot_is_allocatable(pg_catalog.uuid,pg_catalog.timestamptz)',
    'public.research_lot_quality_tests_ready(pg_catalog.uuid)',
    'public.research_domain_readiness(pg_catalog.text)'] loop
    function_oid:=pg_catalog.to_regprocedure(callable);
    if function_oid is null or pg_catalog.has_function_privilege(owner_oid,function_oid,'EXECUTE') is not true then
      raise exception 'Quick Order callee privileges unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}';
    end if;
  end loop;
  if public.research_health_quick_order_intake_closed(context,array[
      'rawStoredSessionHash','configuredOwnerId','actorScope','requiredRole']) is not true
    or context->>'actorScope' is distinct from actor
    or context->>'rawStoredSessionHash' is null or context->>'rawStoredSessionHash'!~'^[a-f0-9]{64}$'
    or context->>'configuredOwnerId' is null or context->>'configuredOwnerId'!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or context->>'requiredRole' is distinct from 'private_early_access_member'
    or input->'requestAcknowledged' is distinct from 'true'::pg_catalog.jsonb
    or input->'contact'->'ageConfirmed' is distinct from 'true'::pg_catalog.jsonb
    or pg_catalog.jsonb_typeof(input->'lines') is distinct from 'array'
    or pg_catalog.jsonb_array_length(input->'lines') not between 1 and 100
    or pg_catalog.jsonb_typeof(args->'snapshots') is distinct from 'array'
    or pg_catalog.jsonb_array_length(args->'snapshots')<>pg_catalog.jsonb_array_length(input->'lines') then
    raise exception 'Quick Order private context unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}';
  end if;
  if p_payload->>'notificationRecipient' is null or p_payload->>'notificationRecipient'!~'^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Quick Order notification recipient unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}';
  end if;
  -- The intended external contract includes every wait, including actor/key
  -- serialization. Only catalog/effective consistency was checked here; actual
  -- pre-BEGIN enforcement needs independent connection evidence. The second read
  -- closes the initial recovery race.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'xenios:health:quick-order:actor-key:v1|'||actor||'|'||key_hash,0));
  recovered:=public.research_health_quick_order_replay(actor,key_hash);
  if recovered is not null then
    if recovered->>'payloadHash' is distinct from payload_hash then
      raise exception 'Quick Order key conflicts' using errcode='23505',detail='{"quickOrderCode":"IDEMPOTENCY_CONFLICT"}';
    end if;
    return recovered->'publicReceipt'||pg_catalog.jsonb_build_object('persisted',true,'replayed',true);
  end if;
  preflight_at:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());
  -- Accepted strict reader verifies the sealed scope header via resolve_scope('verify').
  preflight:=public.research_health_quick_order_currentness_read_strict_authority(preflight_at);
  if preflight->>'state' is distinct from 'active' then
    raise exception 'Quick Order authority unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}';
  end if;
  select * into strict revision from public.research_health_quick_order_authority_revisions where revision_id=(preflight->>'revisionId')::pg_catalog.uuid;
  decision:=revision.decision_inputs_text::pg_catalog.jsonb;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind',x->'kind','version',x->'version') order by x->>'kind',x->>'version')
    into required_pairs from pg_catalog.jsonb_array_elements(decision->'healthAgreements') x;
  -- Resolve identities without positive locks first, then take row classes 4–8
  -- in the accepted order and recheck the same identities after every wait.
  select * into binding from public.research_early_access_session_bindings where session_id=context->>'rawStoredSessionHash';
  if not found then raise exception 'Quick Order session binding unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}'; end if;
  select * into customer from public.research_early_access_customers where id=binding.customer_id;
  if not found then raise exception 'Quick Order customer unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}'; end if;
  v_customer_ref:='eac_'||pg_catalog.left(pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    'early-access-customer-v1:'||customer.id,'UTF8'),'sha256'),'hex'),32);
  identity_count:=0;
  for legal_match in select b.* from public.research_early_access_legal_bindings b where b.customer_ref=v_customer_ref or v_customer_ref=any(b.alias_refs) order by b.id loop
    identity_count:=identity_count+1; legal:=legal_match;
  end loop;
  if identity_count<>1 then raise exception 'Quick Order legal binding unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}'; end if;
  member_id:=legal.member_id;
  select * into member from public.research_members where id=member_id order by id for share;
  if not found then raise exception 'Quick Order member unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}'; end if;
  select * into customer from public.research_early_access_customers where id=binding.customer_id order by id for share;
  if not found then raise exception 'Quick Order locked customer unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}'; end if;
  select * into binding from public.research_early_access_session_bindings where session_id=context->>'rawStoredSessionHash' order by session_id for share;
  if not found then raise exception 'Quick Order locked session binding unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}'; end if;
  identity_count:=0;
  for legal_match in select b.* from public.research_early_access_legal_bindings b where b.customer_ref=v_customer_ref or v_customer_ref=any(b.alias_refs) order by b.id for share loop
    identity_count:=identity_count+1; legal:=legal_match;
  end loop;
  if identity_count<>1 then raise exception 'Quick Order locked legal binding unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}'; end if;
  perform a.id from public.research_early_access_agreement_acceptances a
    where a.customer_ref=v_customer_ref and exists(select 1 from pg_catalog.jsonb_array_elements(required_pairs) r
      where r->>'kind'=a.agreement_kind and r->>'version'=a.agreement_version)
    order by a.agreement_kind collate "C",a.agreement_version collate "C",a.id for share;
  -- No trusted checkout-number carrier exists in the four-field private context.
  -- The admin-attested row-8 branch refuses rather than guessing a checkout.
  if legal.established_by is distinct from 'verified_link' then
    raise exception 'Quick Order trusted checkout binding unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}';
  end if;
  select pg_catalog.jsonb_agg(r->'offeringVariantId' order by r->>'offeringVariantId' collate "C") into offerings
    from pg_catalog.jsonb_array_elements(decision->'offerRules') r
    where exists(select 1 from pg_catalog.jsonb_array_elements(input->'lines') l where l->>'productId'=r->>'productId' and l->>'variantId'=r->>'variantId');
  -- IC-2: NULL/short sets must receive the intake's definite-refusal marker
  -- before the resolver can raise an unmarked integrity/shape refusal. The
  -- accepted 1-100 input-line cap remains unchanged above.
  if offerings is null or pg_catalog.jsonb_array_length(offerings) is distinct from pg_catalog.jsonb_array_length(input->'lines') then
    raise exception 'Quick Order scope unavailable before resolver' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}';
  end if;
  -- The separate offer lookup also recomputes the sealed-row digest.
  scope:=public.research_health_quick_order_currentness_resolve_scope(revision.revision_id,'offer',pg_catalog.jsonb_build_object('offeringVariantIds',offerings));
  if pg_catalog.jsonb_array_length(scope->'offers') is distinct from pg_catalog.jsonb_array_length(input->'lines') then
    raise exception 'Quick Order scope unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}';
  end if;
  -- Request-only stock: exactly one allocatable witness per variant, never a
  -- reservation or a promise of sufficient requested quantity. Busy NOWAIT
  -- witnesses abort; no SKIP LOCKED and no second candidate loop.
  for offer in select value from pg_catalog.jsonb_array_elements(scope->'offers') loop
    select l.id into witness_id from public.research_inventory_lots l
      where l.id in(select value::pg_catalog.uuid from pg_catalog.jsonb_array_elements_text(offer->'lotIds'))
        and l.product_id=(offer->>'productId')::pg_catalog.uuid and l.variant_id=(offer->>'variantId')::pg_catalog.uuid
        and public.research_lot_is_allocatable(l.id,preflight_at) is true order by l.id limit 1;
    if witness_id is null then raise exception 'Quick Order witness unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}'; end if;
    witness_ids:=pg_catalog.array_append(witness_ids,witness_id);
  end loop;
  perform l.id from public.research_inventory_lots l where l.id=any(witness_ids) order by l.id for share nowait;
  select pg_catalog.array_agg(selected.id order by selected.id) into document_ids
    from pg_catalog.unnest(witness_ids) selected_lot(id)
    cross join lateral (
      select d.id from public.research_lot_quality_documents d
      where d.lot_id=selected_lot.id and d.document_state='available'
        and d.verification_state='document_on_file' and d.coa_on_file
        and d.private_storage_key is not null and d.report_issuer is not null
        and d.report_number is not null and d.report_date is not null
        and d.reviewed_at is not null and d.reviewed_at<=preflight_at
        and d.published_at is not null and d.published_at<=preflight_at
        and public.research_lot_quality_tests_ready(d.id) is true
        and exists(select 1 from pg_catalog.jsonb_array_elements(scope->'offers') o
          where (o->'documentIds') ? d.id::pg_catalog.text)
      order by d.id limit 1
    ) selected;
  if pg_catalog.cardinality(document_ids) is distinct from pg_catalog.cardinality(witness_ids) then
    raise exception 'Quick Order quality witness unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}';
  end if;
  perform d.id from public.research_lot_quality_documents d where d.id=any(document_ids) order by d.id for share nowait;
  perform t.id from public.research_lot_quality_tests t where t.quality_document_id=any(document_ids) order by t.id for share nowait;
  -- Row 11 is the last source-row lock. Never call a helper that resets time.
  select * into private_session from public.research_private_early_access_sessions
    where session_hash=context->>'rawStoredSessionHash' for share;
  if not found then raise exception 'Quick Order private session unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}'; end if;
  if exists(select 1 from pg_catalog.pg_locks l where l.locktype='advisory' and l.pid=pg_catalog.pg_backend_pid()
    and l.database=(select oid from pg_catalog.pg_database where datname=pg_catalog.current_database())
    and l.classid=1380471107 and l.objid=1 and l.objsubid=2 and l.granted) then
    raise exception 'Quick Order reentrant admission refused' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}';
  end if;
  elapsed_ms:=pg_catalog.date_part('epoch',(pg_catalog.clock_timestamp()-pg_catalog.transaction_timestamp()))*1000;
  if elapsed_ms<0 or elapsed_ms >= (timer_values->>'transactionTimeoutMs')::pg_catalog.numeric then
    raise exception 'Quick Order transaction budget exhausted' using errcode='55P03',detail='{"quickOrderCode":"DEFINITE_REFUSAL_RETRYABLE"}';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock_shared(1380471107,1) then
    raise exception 'Quick Order temporarily unavailable' using errcode='55P03',detail='{"quickOrderCode":"DEFINITE_REFUSAL_RETRYABLE"}';
  end if;
  perform singleton from public.research_health_quick_order_authority_head where singleton for share;
  if not found then raise exception 'Quick Order head unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
  decision_at:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());
  -- Repeat strict header/seal verification under the final authority gate.
  current_authority:=public.research_health_quick_order_currentness_read_strict_authority(decision_at);
  if current_authority is distinct from preflight
    or not exists(select 1 from public.research_health_quick_order_authority_revisions r
      where r.revision_id=revision.revision_id and r.publication=revision.publication and r.decision_inputs_text=revision.decision_inputs_text) then
    raise exception 'Quick Order authority changed' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}';
  end if;
  if private_session.owner_id is distinct from (context->>'configuredOwnerId')::pg_catalog.uuid
    or private_session.access_role is distinct from context->>'requiredRole'
    or private_session.revoked_at is not null or private_session.issued_at>decision_at or private_session.expires_at<=decision_at
    or member.status is distinct from 'active' or member.id is distinct from legal.member_id
    or customer.status is distinct from 'APPROVED' or customer.id is distinct from binding.customer_id
    or customer.record->>'audience' is distinct from 'PRIVATE_EARLY_ACCESS'
    or legal.verified_at>decision_at or binding.bound_at>decision_at
    or (pg_catalog.starts_with(actor,'member:') and actor is distinct from 'member:'||member.auth_user_id::pg_catalog.text)
    or (pg_catalog.starts_with(actor,'early_access:') and actor is distinct from 'early_access:'||v_customer_ref)
    or customer.normalized_email is distinct from pg_catalog.lower(input->'contact'->>'email') then
    raise exception 'Quick Order eligibility changed' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}';
  end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements(required_pairs) r where not exists(
      select 1 from public.research_early_access_agreement_acceptances a where a.customer_ref=v_customer_ref
        and a.agreement_kind=r->>'kind' and a.agreement_version=r->>'version' and a.accepted_at<=decision_at and a.recorded_at<=decision_at))
    or exists(select 1 from pg_catalog.jsonb_array_elements(required_pairs) r where not (input->'agreements') @> pg_catalog.jsonb_build_array(r)) then
    raise exception 'Quick Order agreement pair changed' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_TERMS_CHANGED"}';
  end if;
  received_text:=pg_catalog.to_char(decision_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  request_id:=pg_catalog.gen_random_uuid();
  public_reference:='XRR-'||pg_catalog.to_char(decision_at at time zone 'UTC','YYYYMMDD')||'-'||pg_catalog.upper(pg_catalog.left(pg_catalog.replace(request_id::pg_catalog.text,'-',''),10));
  for line in select value from pg_catalog.jsonb_array_elements(input->'lines') loop
    select r into strict rule from pg_catalog.jsonb_array_elements(decision->'offerRules') r where r->>'productId'=line->>'productId' and r->>'variantId'=line->>'variantId';
    select o into strict offer from pg_catalog.jsonb_array_elements(scope->'offers') o where o->>'offeringVariantId'=rule->>'offeringVariantId';
    select pg_catalog.jsonb_agg(s) into snapshot_matches from pg_catalog.jsonb_array_elements(args->'snapshots') s
      where s->>'productId'=line->>'productId' and s->>'variantId'=line->>'variantId';
    if pg_catalog.jsonb_array_length(snapshot_matches) is distinct from 1 then
      raise exception 'Quick Order snapshot unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}';
    end if;
    snapshot:=snapshot_matches->0;
    if pg_catalog.jsonb_typeof(line->'quantity') is distinct from 'number'
      or line->>'quantity' is null or line->>'quantity'!~'^(100|[1-9][0-9]?)$' then
      raise exception 'Quick Order quantity invalid' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}';
    end if;
    quantity:=(line->>'quantity')::pg_catalog.int4;
    select * into strict product from public.research_products where id=(offer->>'productId')::pg_catalog.uuid;
    select * into strict variant from public.research_product_variants where id=(offer->>'variantId')::pg_catalog.uuid and product_id=product.id;
    if product.admin_status not in ('approved','published') or product.active_state is distinct from true
      or product.lane in ('research_material','future_clinical','non_product_program') or product.lane_decision<>'decided'
      or variant.status<>'approved' or not variant.active or not variant.member_eligible
      or quantity not between (rule->'quantity'->>'minimum')::pg_catalog.int4 and (rule->'quantity'->>'maximum')::pg_catalog.int4
      or (quantity-(rule->'quantity'->>'minimum')::pg_catalog.int4)%(rule->'quantity'->>'increment')::pg_catalog.int4<>0
      or snapshot->'quantity' is distinct from line->'quantity'
      or snapshot->>'catalogVersion' is distinct from line->>'expectedCatalogVersion'
      or snapshot->'priceVersion' is distinct from line->'expectedPriceVersion'
      or rule->'destination'->>'countryCode' is distinct from input->'contact'->'shippingAddress'->>'countryCode'
      or not (rule->'destination'->'regions') ? (input->'contact'->'shippingAddress'->>'region')
      or not exists(select 1 from public.research_early_access_shipping_regions s where s.active and s.country=input->'contact'->'shippingAddress'->>'countryCode'
        and (s.region is null or s.region=input->'contact'->'shippingAddress'->>'region')) then
      raise exception 'Quick Order offer unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}';
    end if;
    for v_domain in select value from pg_catalog.jsonb_array_elements_text(offer->'domains') loop
      observed:=public.research_domain_readiness(v_domain);
      if observed->'softwareComplete' is distinct from 'true'::pg_catalog.jsonb
        or observed->'manifestApproved' is distinct from 'true'::pg_catalog.jsonb
        or observed->'realInputsRequired' is distinct from 'false'::pg_catalog.jsonb
        or observed->'publicEnabled' is distinct from 'true'::pg_catalog.jsonb
        or exists(select 1 from public.research_required_inputs i where i.domain=v_domain and i.current_state='verified' and (i.verified_at is null or i.verified_at>decision_at)) then
        raise exception 'Quick Order readiness unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}';
      end if;
    end loop;
    -- The canonical assisted-order pricing viewer grants the member audience to
    -- the admitted member and to an actual Early Access session through
    -- EARLY_ACCESS_RETAIL_PRICE_AUDIENCE (early-access-retail/2026-08-20).
    -- The locked identity checks above and sealed audience allowlist remain
    -- independent requirements; an actor prefix alone grants no price access.
    select pg_catalog.count(*) into price_count from public.research_product_prices p where p.product_id=product.id and p.variant_id=variant.id
      and p.status='active' and (rule->'price'->'audiences') ? p.audience and p.audience='member'
      and p.effective_at<=decision_at and (p.expires_at is null or p.expires_at>decision_at);
    if price_count>1 then raise exception 'Quick Order price ambiguous' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}'; end if;
    amount:=null; price_version:=null; price_preimage:='null'; workflow:='request_pricing';
    if price_count=1 then
      select * into strict price from public.research_product_prices p where p.product_id=product.id and p.variant_id=variant.id
        and p.status='active' and (rule->'price'->'audiences') ? p.audience and p.audience='member'
        and p.effective_at<=decision_at and (p.expires_at is null or p.expires_at>decision_at);
      if price.amount_cents<=0 or price.amount_cents>9007199254740991 or price.currency<>'USD'
        or price.approved_by is null or pg_catalog.btrim(price.approved_by)=''
        or price.approved_at is null or price.approved_at>decision_at
        or not pg_catalog.isfinite(price.effective_at)
        or (price.expires_at is not null and not pg_catalog.isfinite(price.expires_at)) then
        raise exception 'Quick Order price unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}'; end if;
      amount:=price.amount_cents; price_version:=price.id::pg_catalog.text; workflow:='direct_order_request';
      select pg_catalog.row_to_json(p)::pg_catalog.text into price_preimage from (select price.id::pg_catalog.text as id,price.version as version,price.audience as audience,
        null::pg_catalog.int4 as "minimumQuantity",null::pg_catalog.int4 as "maximumQuantity",
        pg_catalog.to_char(price.effective_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "effectiveFrom",
        pg_catalog.to_char(price.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "effectiveUntil") p;
    elsif rule->'price'->>'unpriced'<>'request_pricing' then raise exception 'Quick Order price unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}'; end if;
    if not (rule->'workflowModes') ? workflow or snapshot->>'workflowMode' is distinct from workflow
      or snapshot->'unitPriceCents' is distinct from coalesce(pg_catalog.to_jsonb(amount),'null'::pg_catalog.jsonb) or snapshot->>'priceVersion' is distinct from price_version then
      raise exception 'Quick Order price changed' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}';
    end if;
    select * into strict lot from public.research_inventory_lots l where l.id=any(witness_ids) and l.product_id=product.id and l.variant_id=variant.id;
    select * into strict document from public.research_lot_quality_documents d where d.id=any(document_ids) and d.lot_id=lot.id
      and d.id in(select value::pg_catalog.uuid from pg_catalog.jsonb_array_elements_text(offer->'documentIds'));
    if public.research_lot_is_allocatable(lot.id,decision_at) is not true
      or document.document_state is distinct from 'available'
      or document.verification_state is distinct from 'document_on_file'
      or document.coa_on_file is distinct from true
      or document.private_storage_key is null or document.report_issuer is null
      or document.report_number is null or document.report_date is null
      or document.report_date>decision_at::pg_catalog.date
      or document.reviewed_at is null or document.reviewed_at>decision_at
      or document.published_at is null or document.published_at>decision_at
      or public.research_lot_quality_tests_ready(document.id) is not true then
      raise exception 'Quick Order stock witness changed' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}'; end if;
    -- Typed projections deliberately exclude lot quantity/version/updated_at.
    select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.row_to_json(p)::pg_catalog.text,'UTF8'),'sha256'),'hex') into lot_digest
      from (select lot.id,lot.lot_id,lot.product_id,lot.variant_id,lot.sku,lot.disposition,lot.recalled,lot.excursion,
        pg_catalog.to_char(lot.expiry_date,'YYYY-MM-DD') as expiry_date,pg_catalog.to_char(lot.retest_date,'YYYY-MM-DD') as retest_date,lot.shelf_life_source) p;
    select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.row_to_json(p)::pg_catalog.text,'UTF8'),'sha256'),'hex') into document_digest
      from (select document.id,document.lot_id,document.document_state,document.verification_state,document.coa_on_file,document.private_storage_key,
        document.report_issuer,document.report_number,pg_catalog.to_char(document.report_date,'YYYY-MM-DD') as report_date,
        pg_catalog.to_char(document.reviewed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as reviewed_at,
        pg_catalog.to_char(document.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as published_at) p;
    select pg_catalog.encode(extensions.digest(pg_catalog.convert_to('['||pg_catalog.string_agg(pg_catalog.row_to_json(p)::pg_catalog.text,',' order by p.id,p.test_key)||']','UTF8'),'sha256'),'hex') into tests_digest
      from (select t.id,t.quality_document_id,t.test_key,t.state from public.research_lot_quality_tests t where t.quality_document_id=document.id) p;
    stock_preimage:='{"mode":"any_allocatable","decisionAt":'||pg_catalog.to_json(received_text)::pg_catalog.text||',"witnesses":[{"lotId":'||pg_catalog.to_json(lot.id::pg_catalog.text)::pg_catalog.text||
      ',"lotProjectionSha256":'||pg_catalog.to_json(lot_digest)::pg_catalog.text||',"qualityDocumentId":'||pg_catalog.to_json(document.id::pg_catalog.text)::pg_catalog.text||
      ',"qualityDocumentProjectionSha256":'||pg_catalog.to_json(document_digest)::pg_catalog.text||',"qualityTestsSha256":'||pg_catalog.to_json(tests_digest)::pg_catalog.text||',"availableQuantity":'||lot.quantity_available::pg_catalog.text||'}]}';
    line_preimage:='{"schemaVersion":"quick-order-line-source-v1","revisionId":'||pg_catalog.to_json(revision.revision_id::pg_catalog.text)::pg_catalog.text||
      ',"writerEpoch":'||pg_catalog.to_json(preflight->>'writerEpoch')::pg_catalog.text||',"sourceCommit":'||pg_catalog.to_json(decision->>'sourceCommit')::pg_catalog.text||
      ',"decisionInputsSha256":'||pg_catalog.to_json(pg_catalog.encode(extensions.digest(pg_catalog.convert_to(revision.decision_inputs_text,'UTF8'),'sha256'),'hex'))::pg_catalog.text||
      ',"readerCensusSha256":'||pg_catalog.to_json(decision->>'readerCensusSha256')::pg_catalog.text||',"productId":'||pg_catalog.to_json(line->>'productId')::pg_catalog.text||
      ',"variantId":'||pg_catalog.to_json(line->>'variantId')::pg_catalog.text||',"workflowMode":'||pg_catalog.to_json(workflow)::pg_catalog.text||',"quantity":'||quantity::pg_catalog.text||
      ',"priceVersion":'||coalesce(pg_catalog.to_json(price_version)::pg_catalog.text,'null')||',"unitPriceCents":'||coalesce(amount::pg_catalog.text,'null')||
      ',"currency":"USD","priceDecision":'||price_preimage||',"stockDecision":'||stock_preimage||'}';
    source_version:='qosv1:'||pg_catalog.encode(extensions.digest(pg_catalog.convert_to(line_preimage,'UTF8'),'sha256'),'hex');
    lines:=lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('productId',line->'productId','variantId',line->'variantId','productName',product.display_name,
      'specification',variant.strength,'format',variant.format,'packBasis',variant.presentation,'quantity',quantity,'minimumQuantity',rule->'quantity'->'minimum',
      'maximumQuantity',rule->'quantity'->'maximum','quantityIncrement',rule->'quantity'->'increment','workflowMode',workflow,
      'customerActionLabel',case when workflow='request_pricing' then 'Request pricing' else 'Submit request' end,'unitPriceCents',amount,
      'catalogVersion',snapshot->'catalogVersion','priceVersion',price_version,'sourceVersion',source_version));
    classifications:=classifications||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('schemaVersion','quick-order-health-classification-v1','requestId',request_id,
      'productId',line->'productId','variantId',line->'variantId','payloadHash',payload_hash,'decision','health_requestable','sourceVersion',source_version,'authorityRevisionId',revision.revision_id));
    subtotal:=subtotal+coalesce(amount::pg_catalog.numeric*quantity,0); complete:=complete and amount is not null;
  end loop;
  if subtotal>9007199254740991
    or args->'computedEstimate'->'knownSubtotalCents' is distinct from pg_catalog.to_jsonb(subtotal)
    or args->'computedEstimate'->'estimateComplete' is distinct from pg_catalog.to_jsonb(complete)
    or args->'computedEstimate'->>'currency' is distinct from 'USD' then raise exception 'Quick Order estimate unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}'; end if;
  attribution:=args->'attribution'||pg_catalog.jsonb_build_object('receivedAt',received_text);
  receipt:=pg_catalog.jsonb_build_object('schemaVersion','quick-order-v1','requestId',request_id,'publicReference',public_reference,'payloadHash',payload_hash,
    'attributionState',attribution->'reviewState','estimate',pg_catalog.jsonb_build_object('knownSubtotalCents',subtotal,'estimateComplete',complete,'currency','USD'));
  if public.research_health_quick_order_intake_valid(request_id,payload_hash,decision_at,attribution,receipt,classifications) is not true then
    raise exception 'Quick Order evidence unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}';
  end if;
  -- Five canonical effects, all timestamped at the same post-wait decisionAt.
  insert into public.research_assisted_order_requests(id,public_reference,idempotency_key_hash,request_fingerprint,actor_member_id,early_access_session_hash,
    normalized_email,full_legal_name,mobile_phone,organization_name,shipping_address,billing_address,age_confirmed,agreements,general_notes,
    affiliate_attribution_ref,declared_affiliate_code,declared_affiliate_code_state,estimated_total_cents,currency,status,source,created_at,updated_at)
  values(request_id,public_reference,key_hash,payload_hash,member.id,pg_catalog.encode(extensions.digest(pg_catalog.convert_to(context->>'rawStoredSessionHash','UTF8'),'sha256'),'hex'),customer.normalized_email,input->'contact'->>'fullLegalName',
    input->'contact'->>'mobilePhone',nullif(input->'contact'->>'organizationName',''),input->'contact'->'shippingAddress',input->'contact'->'billingAddress',true,
    required_pairs,null,null,nullif(attribution->>'declaredAffiliateCode',''),case when nullif(attribution->>'declaredAffiliateCode','') is null then 'not_provided' else 'captured_unmatched' end,
    nullif(subtotal,0)::pg_catalog.int8,'USD','submitted','early_access_manual_order_bridge',decision_at,decision_at);
  for item in select value from pg_catalog.jsonb_array_elements(lines) loop
    insert into public.research_assisted_order_lines(id,request_id,product_id,variant_id,product_name,specification,format,pack_basis,quantity,minimum_quantity,maximum_quantity,
      quantity_increment,workflow_mode,customer_action_label,unit_price_cents,line_estimate_cents,currency,catalog_version,price_version,access_notice,research_use_only,authoritative_fingerprint,created_at)
    values(pg_catalog.gen_random_uuid(),request_id,item->>'productId',item->>'variantId',item->>'productName',item->>'specification',item->>'format',item->>'packBasis',
      (item->>'quantity')::pg_catalog.int4,(item->>'minimumQuantity')::pg_catalog.int4,(item->>'maximumQuantity')::pg_catalog.int4,(item->>'quantityIncrement')::pg_catalog.int4,
      item->>'workflowMode',item->>'customerActionLabel',(item->>'unitPriceCents')::pg_catalog.int8,(item->>'unitPriceCents')::pg_catalog.int8*(item->>'quantity')::pg_catalog.int4,
      'USD',item->>'catalogVersion',item->>'priceVersion',null,false,item->>'sourceVersion',decision_at);
  end loop;
  -- actor_id intentionally retains the opaque member:/early_access: audit scope.
  -- It is distinct from the canonical request ownership double hash above.
  insert into public.research_assisted_order_events(request_id,status,actor_type,actor_id,customer_message,evidence,occurred_at)
    values(request_id,'submitted',case when pg_catalog.starts_with(actor,'member:') then 'member' else 'early_access_session' end,actor,'Your request has been received.',
      pg_catalog.jsonb_build_object('intakeKind','quick-order-v1','payloadHash',payload_hash),decision_at);
  insert into public.research_notification_outbox(event_key,event_type,channel,recipient,template_key,payload,status,attempt_count,next_attempt_at,created_at,updated_at)
    values('assisted-order:'||request_id::pg_catalog.text||':quick-order-submitted:admin','assisted_order.submitted','email',p_payload->>'notificationRecipient',
      'research.assisted_order.quick_order.submitted.admin.v1',pg_catalog.jsonb_build_object('schemaVersion','quick-order-v1','requestId',request_id,'publicReference',public_reference),
      'pending',0,decision_at,decision_at,decision_at);
  insert into public.research_health_quick_order_intakes(request_id,actor_scope,key_hash,payload_hash,received_at,attribution_snapshot,request_acknowledged,receipt,classifications,notification_recipient)
    values(request_id,actor,key_hash,payload_hash,decision_at,attribution,true,receipt,classifications,p_payload->>'notificationRecipient');
  result:=public.research_health_quick_order_replay(actor,key_hash);
  if result is null then raise exception 'Quick Order final evidence unavailable' using errcode='55000',detail='{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}'; end if;
  return result->'publicReceipt'||pg_catalog.jsonb_build_object('persisted',true,'replayed',false);
end
$qo_commit$;

revoke all on function public.research_health_quick_order_commit(pg_catalog.jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_health_quick_order_commit(pg_catalog.jsonb) to service_role;

revoke all on function public.research_health_quick_order_intake_closed(pg_catalog.jsonb,pg_catalog.text[]),
  public.research_health_quick_order_intake_valid(pg_catalog.uuid,pg_catalog.text,pg_catalog.timestamptz,pg_catalog.jsonb,pg_catalog.jsonb,pg_catalog.jsonb),
  public.research_health_quick_order_admin_detail(pg_catalog.uuid),
  public.research_health_quick_order_replay(pg_catalog.text,pg_catalog.text) from public,anon,authenticated,service_role;
grant execute on function public.research_health_quick_order_admin_detail(pg_catalog.uuid),
  public.research_health_quick_order_replay(pg_catalog.text,pg_catalog.text) to service_role;
$qo_ddl$;
  fingerprint_sql pg_catalog.text:=$qo_fingerprint$
select encode(extensions.digest(convert_to(jsonb_build_object(
 'relations',(select jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relowner::pg_catalog.regrole::pg_catalog.text,c.relpersistence,c.reloptions,c.relam,c.reltablespace,c.relrowsecurity,c.relforcerowsecurity,c.relacl) order by c.relname)
   from pg_catalog.pg_class c where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attnum,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attisdropped,a.attcollation,a.attstorage,a.attcompression,a.attstattarget,a.attnotnull,a.attidentity,a.attgenerated,a.attacl,pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum)
   from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid=c.oid
   left join pg_catalog.pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
   where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake' and a.attnum>0),
 'constraints',(select jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_catalog.pg_get_constraintdef(k.oid,true),k.convalidated) order by c.relname,k.conname)
   from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid=c.oid where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'indexes',(select jsonb_agg(jsonb_build_array(c.relname,pg_catalog.pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) order by c.relname,i.indexrelid::pg_catalog.regclass::pg_catalog.text)
   from pg_catalog.pg_class c join pg_catalog.pg_index i on i.indrelid=c.oid where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'rules',(select jsonb_agg(jsonb_build_array(c.relname,r.rulename,pg_catalog.pg_get_ruledef(r.oid,true),r.ev_enabled) order by c.relname,r.rulename)
   from pg_catalog.pg_class c join pg_catalog.pg_rewrite r on r.ev_class=c.oid where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'policies',(select jsonb_agg(jsonb_build_array(c.relname,po.polname,po.polcmd,po.polpermissive,po.polroles,pg_catalog.pg_get_expr(po.polqual,po.polrelid),pg_catalog.pg_get_expr(po.polwithcheck,po.polrelid)) order by c.relname,po.polname)
   from pg_catalog.pg_class c join pg_catalog.pg_policy po on po.polrelid=c.oid where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_catalog.pg_get_triggerdef(t.oid,true),t.tgenabled) order by c.relname,t.tgname)
   from pg_catalog.pg_class c join pg_catalog.pg_trigger t on t.tgrelid=c.oid where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake' and not t.tgisinternal),
 'functions',(select jsonb_agg(jsonb_build_array(p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid),pg_catalog.pg_get_functiondef(p.oid),p.proowner::pg_catalog.regrole::pg_catalog.text,p.proacl) order by p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid))
   from pg_catalog.pg_proc p where p.pronamespace='public'::pg_catalog.regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit')))
 )::pg_catalog.text,'UTF8'),'sha256'),'hex')
$qo_fingerprint$;
  -- Doc82 accepted this unchanged currentness definition for dependent source.
  -- Intake successor acceptance remains PENDING. Additional receipt inventory
  -- rows require original byte confirmation; real S/census and installation stay held.
  expected_currentness_definition pg_catalog.text:='8b631a8323394d8277986b3be6560a494bf541e102e93ad263a7a5990e3baabe';
  currentness_seal pg_catalog.text;
  definition_hash pg_catalog.text; actual_hash pg_catalog.text; seal pg_catalog.text; provider_before pg_catalog.text;
  relation_count integer; function_count integer; role_name pg_catalog.text; fn pg_catalog.record;
begin
  if current_setting('transaction_isolation')<>'read committed'
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4 <170011
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4 >=180000
    or not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
    or current_user::pg_catalog.regrole::pg_catalog.oid is distinct from (select relowner from pg_catalog.pg_class
      where oid=pg_catalog.to_regclass('public.research_assisted_order_provider_fence'))
  then raise exception 'Quick Order draft requires a read-committed schema owner with RLS bypass' using errcode='55000'; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if not exists(select 1 from pg_catalog.pg_roles where rolname=role_name) then
      raise exception 'Quick Order required role missing' using errcode='55000';
    end if;
  end loop;
  if pg_catalog.to_regprocedure('extensions.digest(pg_catalog.bytea,pg_catalog.text)') is null
    or pg_catalog.to_regprocedure('public.research_assisted_order_admin_get(pg_catalog.uuid)') is null
    or pg_catalog.to_regprocedure('public.research_assisted_order_provider_settlement_integrity()') is null
  then raise exception 'Quick Order predecessors unavailable' using errcode='55000'; end if;
  if expected_currentness_definition is null then
    raise exception 'Quick Order exact accepted currentness receipt is pending' using errcode='55000';
  end if;
  -- Complete accepted function identity/owner/search_path/security inventory.
  if (select pg_catalog.count(*) from pg_catalog.pg_proc p where p.pronamespace='public'::pg_catalog.regnamespace
      and (p.proname in ('research_health_quick_order_publish_revision','research_health_quick_order_revoke_revision','research_health_quick_order_read_current_authority','research_health_quick_order_guard_source_write')
        or pg_catalog.starts_with(p.proname,'research_health_quick_order_currentness_')))<>13
    or exists(select 1 from (values ('public.research_health_quick_order_currentness_valid_publication(pg_catalog.jsonb)'),('public.research_health_quick_order_currentness_valid_decision_inputs(pg_catalog.text,pg_catalog.jsonb)'),('public.research_health_quick_order_currentness_refuse_mutation()'),('public.research_health_quick_order_currentness_monotonic_epoch()'),('public.research_health_quick_order_currentness_integrity()'),('public.research_health_quick_order_currentness_schema_fingerprint()'),('public.research_health_quick_order_currentness_read_strict_authority(pg_catalog.timestamptz)'),('public.research_health_quick_order_currentness_resolve_scope(pg_catalog.uuid,pg_catalog.text,pg_catalog.jsonb)'),('public.research_health_quick_order_currentness_activate_revision(pg_catalog.uuid,pg_catalog.int8,pg_catalog.text,pg_catalog.text)'),('public.research_health_quick_order_guard_source_write()'),('public.research_health_quick_order_publish_revision(pg_catalog.jsonb,pg_catalog.text)'),('public.research_health_quick_order_revoke_revision(pg_catalog.uuid,pg_catalog.text)'),('public.research_health_quick_order_read_current_authority()')) expected(signature)
      left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(expected.signature)
      where p.oid is null or p.proowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)
        or p.proconfig is distinct from array['search_path=""']::pg_catalog.text[]
        or p.prosecdef is distinct from (p.proname='research_health_quick_order_guard_source_write')) then
    raise exception 'Quick Order exact function inventory mismatch' using errcode='55000'; end if;
  currentness_seal:=pg_catalog.obj_description(pg_catalog.to_regclass('public.research_health_quick_order_authority_head'),'pg_class');
  if expected_currentness_definition !~ '^[a-f0-9]{64}$'
    or currentness_seal is null or currentness_seal !~ '^RHQOC_HELD_V1:[0-9a-f]{64}:[0-9a-f]{64}$'
    or pg_catalog.split_part(currentness_seal,':',2) is distinct from expected_currentness_definition then
    raise exception 'Quick Order accepted currentness definition differs' using errcode='55000';
  end if;
  if pg_catalog.split_part(currentness_seal,':',3) is distinct from public.research_health_quick_order_currentness_schema_fingerprint() then
    raise exception 'Quick Order accepted currentness fingerprint differs' using errcode='55000';
  end if;
  -- Includes the accepted corrected legal guard, source descriptors and ACLs.
  -- Actual implemented-S/census descriptor remains absent and fails closed.
  perform public.research_health_quick_order_currentness_integrity();

  perform public.research_assisted_order_provider_settlement_integrity();
  if exists (
    with expected(relation_name, trigger_name, enabled) as (values
      ('research_assisted_order_requests','research_assisted_order_paid_hold','O'),
      ('research_assisted_order_requests','hl12_observed_cancel','O'),
      ('research_assisted_order_requests','hl12_history_progression','O'),
      ('research_assisted_order_requests','aa_hl12_disposition_terminal','O'),
      ('research_assisted_order_requests','aaa_adp01_uncertainty','A'),
      ('research_assisted_order_requests','adp03_request_identity','A'),
      ('research_assisted_order_requests','adp03_evidence_truncate','A'),
      ('research_assisted_order_requests','adp03_evidence_immutable','A'),
      ('research_assisted_order_events','research_assisted_order_events_append_only','A'),
      ('research_assisted_order_events','research_assisted_order_paid_event_evidence','A'),
      ('research_assisted_order_events','hl12_disposition_cancel_event','O'),
      ('research_assisted_order_events','adp03_paid_event','A'),
      ('research_assisted_order_events','adp03_evidence_truncate','A'),
      ('research_assisted_order_events','adp03_evidence_immutable','A'),
      ('research_assisted_order_events','hl12_disposition_no_truncate','O'),
      ('research_notification_outbox','hl12_payment_effects_outbox_guard','A'),
      ('research_notification_outbox','hl12_payment_effects_outbox_truncate','A'),
      ('research_notification_outbox','hl12_disposition_effects_outbox','O'),
      ('research_notification_outbox','hl12_disposition_effects_truncate','O')
    ), actual as (
      select c.relname::pg_catalog.text relation_name,t.tgname::pg_catalog.text trigger_name,t.tgenabled::pg_catalog.text enabled
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
      where c.relnamespace='public'::pg_catalog.regnamespace and not t.tgisinternal
        and c.relname in ('research_assisted_order_requests','research_assisted_order_events','research_notification_outbox')
    )
    select 1 from expected e full join actual a using(relation_name,trigger_name)
    where e.enabled is distinct from a.enabled
  ) then raise exception 'Quick Order predecessor trigger inventory differs' using errcode='55000'; end if;

  provider_before:=public.research_assisted_order_provider_schema_fingerprint();
  definition_hash:=encode(extensions.digest(convert_to(replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex');
  select count(*) into relation_count from pg_catalog.pg_class c where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake';
  select count(*) into function_count from pg_catalog.pg_proc p where p.pronamespace='public'::pg_catalog.regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit'));
  if relation_count=0 and function_count=0 then
    execute install_sql;

  if (select count(*) from pg_catalog.pg_proc p where p.pronamespace='public'::pg_catalog.regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit')))<>5
    or (select count(*) from pg_catalog.pg_class c where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake')<>3
    or not exists(select 1 from pg_catalog.pg_class where oid='public.research_health_quick_order_intakes'::pg_catalog.regclass
      and relkind='r' and relrowsecurity and relforcerowsecurity and relowner=current_user::pg_catalog.regrole)
    or exists(select 1 from pg_catalog.pg_policy where polrelid='public.research_health_quick_order_intakes'::pg_catalog.regclass)
    or exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.research_health_quick_order_intakes'::pg_catalog.regclass and not tgisinternal)
  then raise exception 'Quick Order installation shape differs' using errcode='55000'; end if;
  if exists(select 1 from pg_catalog.pg_class c,
      lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
      where c.oid='public.research_health_quick_order_intakes'::pg_catalog.regclass and a.grantee<>c.relowner)
    or exists(select 1 from pg_catalog.pg_attribute a,
      lateral pg_catalog.aclexplode(a.attacl) g
      where a.attrelid='public.research_health_quick_order_intakes'::pg_catalog.regclass and g.grantee<>current_user::pg_catalog.regrole::pg_catalog.oid)
  then raise exception 'Quick Order table or column grants differ' using errcode='55000'; end if;
  for fn in select * from pg_catalog.pg_proc p where p.pronamespace='public'::pg_catalog.regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit')) loop
    if fn.proowner<>current_user::pg_catalog.regrole::pg_catalog.oid or fn.prokind<>'f'
      or fn.oid not in ('public.research_health_quick_order_intake_closed(pg_catalog.jsonb,pg_catalog.text[])'::pg_catalog.regprocedure,
        'public.research_health_quick_order_intake_valid(pg_catalog.uuid,pg_catalog.text,pg_catalog.timestamptz,pg_catalog.jsonb,pg_catalog.jsonb,pg_catalog.jsonb)'::pg_catalog.regprocedure,
        'public.research_health_quick_order_admin_detail(pg_catalog.uuid)'::pg_catalog.regprocedure,
        'public.research_health_quick_order_replay(pg_catalog.text,pg_catalog.text)'::pg_catalog.regprocedure,
        'public.research_health_quick_order_commit(pg_catalog.jsonb)'::pg_catalog.regprocedure)
      or fn.proconfig is distinct from array['search_path=""']::pg_catalog.text[]
      or fn.prosecdef is distinct from (fn.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit'))
      or exists(select 1 from pg_catalog.aclexplode(coalesce(fn.proacl,pg_catalog.acldefault('f',fn.proowner))) a
        where a.grantee<>fn.proowner and (a.grantee<>'service_role'::pg_catalog.regrole::pg_catalog.oid
          or fn.proname not in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit')
          or a.privilege_type<>'EXECUTE' or a.is_grantable))
    then raise exception 'Quick Order function authority differs' using errcode='55000'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if pg_catalog.has_function_privilege(role_name,fn.oid,'EXECUTE') is distinct from
        (role_name='service_role' and fn.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit'))
      then raise exception 'Quick Order effective execute authority differs' using errcode='55000'; end if;
    end loop;
  end loop;

    execute fingerprint_sql into actual_hash;
    execute format('comment on table public.research_health_quick_order_intakes is %L',
      'QO_INTAKE_TRANSACTION_V2:'||definition_hash||':'||actual_hash);
  else
    if relation_count<>3 or function_count<>5
      or pg_catalog.to_regclass('public.research_health_quick_order_intakes') is null then
      raise exception 'Quick Order partial or unknown installation' using errcode='55000';
    end if;
    seal:=pg_catalog.obj_description('public.research_health_quick_order_intakes'::pg_catalog.regclass,'pg_class');
    execute fingerprint_sql into actual_hash;
    if seal is distinct from 'QO_INTAKE_TRANSACTION_V2:'||definition_hash||':'||actual_hash then
      raise exception 'Quick Order source or catalog differs; no repair attempted' using errcode='55000';
    end if;

  if (select count(*) from pg_catalog.pg_proc p where p.pronamespace='public'::pg_catalog.regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit')))<>5
    or (select count(*) from pg_catalog.pg_class c where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake')<>3
    or not exists(select 1 from pg_catalog.pg_class where oid='public.research_health_quick_order_intakes'::pg_catalog.regclass
      and relkind='r' and relrowsecurity and relforcerowsecurity and relowner=current_user::pg_catalog.regrole)
    or exists(select 1 from pg_catalog.pg_policy where polrelid='public.research_health_quick_order_intakes'::pg_catalog.regclass)
    or exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.research_health_quick_order_intakes'::pg_catalog.regclass and not tgisinternal)
  then raise exception 'Quick Order installation shape differs' using errcode='55000'; end if;
  if exists(select 1 from pg_catalog.pg_class c,
      lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
      where c.oid='public.research_health_quick_order_intakes'::pg_catalog.regclass and a.grantee<>c.relowner)
    or exists(select 1 from pg_catalog.pg_attribute a,
      lateral pg_catalog.aclexplode(a.attacl) g
      where a.attrelid='public.research_health_quick_order_intakes'::pg_catalog.regclass and g.grantee<>current_user::pg_catalog.regrole::pg_catalog.oid)
  then raise exception 'Quick Order table or column grants differ' using errcode='55000'; end if;
  for fn in select * from pg_catalog.pg_proc p where p.pronamespace='public'::pg_catalog.regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit')) loop
    if fn.proowner<>current_user::pg_catalog.regrole::pg_catalog.oid or fn.prokind<>'f'
      or fn.proconfig is distinct from array['search_path=""']::pg_catalog.text[]
      or fn.prosecdef is distinct from (fn.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit'))
      or exists(select 1 from pg_catalog.aclexplode(coalesce(fn.proacl,pg_catalog.acldefault('f',fn.proowner))) a
        where a.grantee<>fn.proowner and (a.grantee<>'service_role'::pg_catalog.regrole::pg_catalog.oid
          or fn.proname not in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit')
          or a.privilege_type<>'EXECUTE' or a.is_grantable))
    then raise exception 'Quick Order function authority differs' using errcode='55000'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if pg_catalog.has_function_privilege(role_name,fn.oid,'EXECUTE') is distinct from
        (role_name='service_role' and fn.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit'))
      then raise exception 'Quick Order effective execute authority differs' using errcode='55000'; end if;
    end loop;
  end loop;

  end if;

  perform public.research_assisted_order_provider_settlement_integrity();
  if exists (
    with expected(relation_name, trigger_name, enabled) as (values
      ('research_assisted_order_requests','research_assisted_order_paid_hold','O'),
      ('research_assisted_order_requests','hl12_observed_cancel','O'),
      ('research_assisted_order_requests','hl12_history_progression','O'),
      ('research_assisted_order_requests','aa_hl12_disposition_terminal','O'),
      ('research_assisted_order_requests','aaa_adp01_uncertainty','A'),
      ('research_assisted_order_requests','adp03_request_identity','A'),
      ('research_assisted_order_requests','adp03_evidence_truncate','A'),
      ('research_assisted_order_requests','adp03_evidence_immutable','A'),
      ('research_assisted_order_events','research_assisted_order_events_append_only','A'),
      ('research_assisted_order_events','research_assisted_order_paid_event_evidence','A'),
      ('research_assisted_order_events','hl12_disposition_cancel_event','O'),
      ('research_assisted_order_events','adp03_paid_event','A'),
      ('research_assisted_order_events','adp03_evidence_truncate','A'),
      ('research_assisted_order_events','adp03_evidence_immutable','A'),
      ('research_assisted_order_events','hl12_disposition_no_truncate','O'),
      ('research_notification_outbox','hl12_payment_effects_outbox_guard','A'),
      ('research_notification_outbox','hl12_payment_effects_outbox_truncate','A'),
      ('research_notification_outbox','hl12_disposition_effects_outbox','O'),
      ('research_notification_outbox','hl12_disposition_effects_truncate','O')
    ), actual as (
      select c.relname::pg_catalog.text relation_name,t.tgname::pg_catalog.text trigger_name,t.tgenabled::pg_catalog.text enabled
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
      where c.relnamespace='public'::pg_catalog.regnamespace and not t.tgisinternal
        and c.relname in ('research_assisted_order_requests','research_assisted_order_events','research_notification_outbox')
    )
    select 1 from expected e full join actual a using(relation_name,trigger_name)
    where e.enabled is distinct from a.enabled
  ) then raise exception 'Quick Order predecessor trigger inventory differs' using errcode='55000'; end if;

  if public.research_assisted_order_provider_schema_fingerprint() is distinct from provider_before then
    raise exception 'Quick Order changed canonical provider fingerprint' using errcode='55000';
  end if;
end
$qo_install$;
commit;
-- LOCAL ONLY / NOT RUN. Real inputs, source acceptance, route proofs, writer order,
-- qualification, installation and activation remain separately required.
