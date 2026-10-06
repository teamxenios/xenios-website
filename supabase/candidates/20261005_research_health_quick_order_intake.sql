-- DRAFT SOURCE ONLY / NOT RUN. Contract b75325a; no migration registration.
-- Reading this file is not permission to apply it. No commit or source-write
-- guards are present. Only read RPCs are granted; owner bypass is not prevented.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local search_path='';
do $qo_install$
declare
  install_sql text:=$qo_ddl$
-- SOURCE CANDIDATE ONLY. No commit function, writer guards, triggers or activation.
-- The callable surface is read-only. A database owner can bypass this boundary;
-- no trigger-enforced immutability is claimed.
create function public.research_health_quick_order_intake_closed(v jsonb, keys text[])
returns boolean language sql immutable set search_path='' as $closed$
  select case when jsonb_typeof(v)='object' then
    (select array_agg(k order by k) from jsonb_object_keys(v) k)
      = (select array_agg(k order by k) from unnest(keys) k)
    else false end
$closed$;

create function public.research_health_quick_order_intake_valid(
  p_request_id uuid,p_payload_hash text,p_received_at timestamptz,
  p_attribution jsonb,p_receipt jsonb,p_classifications jsonb)
returns boolean language plpgsql immutable set search_path='' as $valid$
declare v jsonb; k text; s text; seen text[]:=array[]::text[]; identity text; subtotal numeric;
begin
  if p_request_id is null or p_payload_hash is null or p_payload_hash!~'^[a-f0-9]{64}$'
    or p_received_at is null or not isfinite(p_received_at)
    or p_received_at<>date_trunc('milliseconds',p_received_at)
    or public.research_health_quick_order_intake_closed(p_attribution,
      array['schemaVersion','source','sourceDetail','declaredAffiliateCode','affiliation',
        'confirmedByCustomer','receivedAt','reviewState','commissionState']) is not true
    or p_attribution->>'schemaVersion' is distinct from 'attribution-v1'
    or p_attribution->'confirmedByCustomer' is distinct from 'true'::jsonb
    or p_attribution->>'commissionState' is distinct from 'not_authorized'
    or p_attribution->>'source' not in ('person','collective','organization','social','search','direct','other')
    or jsonb_typeof(p_attribution->'source') is distinct from 'string'
    or public.research_health_quick_order_intake_closed(p_attribution->'affiliation',array['kind','detail']) is not true
    or p_attribution->'affiliation'->>'kind' not in ('none','collective','gym','team','clinic','other')
    or jsonb_typeof(p_attribution->'affiliation'->'kind') is distinct from 'string'
    or jsonb_typeof(p_attribution->'receivedAt') is distinct from 'string'
    or p_attribution->>'receivedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
    or p_attribution->>'receivedAt' is distinct from to_char(p_received_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    or (p_attribution->>'receivedAt')::timestamptz is distinct from p_received_at
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
  if v not in ('null'::jsonb,'""'::jsonb) and (jsonb_typeof(v) is distinct from 'string'
      or v#>>'{}' !~ '^[A-Z0-9_-]{1,64}$') then return false; end if;
  if p_attribution->>'reviewState' is distinct from
    case when p_attribution->>'source'='direct' and v in ('null'::jsonb,'""'::jsonb)
      then 'direct_no_referrer' else 'captured_unmatched' end then return false; end if;
  if public.research_health_quick_order_intake_closed(p_receipt,
      array['schemaVersion','requestId','publicReference','payloadHash','attributionState','estimate']) is not true
    or p_receipt->>'schemaVersion' is distinct from 'quick-order-v1'
    or p_receipt->>'requestId' is distinct from p_request_id::text
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
      or v->>'requestId' is distinct from p_request_id::text
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
    identity:=jsonb_build_array(v->>'productId',v->>'variantId')::text;
    if identity=any(seen) then return false; end if;
    seen:=array_append(seen,identity);
  end loop;
  return true;
exception when others then return false;
end
$valid$;

create table public.research_health_quick_order_intakes (
  request_id uuid primary key references public.research_assisted_order_requests(id) on delete restrict,
  actor_scope text not null,
  key_hash text not null,
  payload_hash text not null,
  received_at timestamptz not null,
  attribution_snapshot jsonb not null,
  request_acknowledged boolean not null,
  receipt jsonb not null,
  classifications jsonb not null,
  notification_recipient text not null,
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
-- No policies, raw table/column grants, write helper, mutation/truncate trigger,
-- or owner-proof immutability. Only the two reader RPCs below are callable.

create function public.research_health_quick_order_admin_detail(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $detail$
declare
  r public.research_assisted_order_requests%rowtype;
  c public.research_health_quick_order_intakes%rowtype;
  e public.research_assisted_order_events%rowtype;
  o public.research_notification_outbox%rowtype;
  detail jsonb; intake jsonb; result jsonb; v_event_key text;
  marked integer; obligations integer; have_companion boolean; have_request boolean;
  subtotal numeric; complete boolean; line_count integer; raw_time timestamptz;
begin
  if p_request_id is null then raise exception 'Quick Order evidence unavailable' using errcode='22023'; end if;
  v_event_key:='assisted-order:'||p_request_id::text||':quick-order-submitted:admin';
  select * into r from public.research_assisted_order_requests where id=p_request_id;
  have_request:=found;
  select * into c from public.research_health_quick_order_intakes where request_id=p_request_id;
  have_companion:=found;
  -- Marker discovery does not depend on the companion, event status or marker value.
  select count(*) into marked from public.research_assisted_order_events
    where request_id=p_request_id and (evidence ? 'intakeKind' or evidence ? 'payloadHash');
  select count(*) into obligations from public.research_notification_outbox n
    where n.event_key=v_event_key or
      (n.template_key='research.assisted_order.quick_order.submitted.admin.v1'
       and n.payload->>'requestId'=p_request_id::text);
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
    or detail->>'requestId' is distinct from r.id::text
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
    where request_id=p_request_id and (evidence ? 'intakeKind' or evidence ? 'payloadHash');
  select * into strict o from public.research_notification_outbox n
    where n.event_key=v_event_key or
      (n.template_key='research.assisted_order.quick_order.submitted.admin.v1'
       and n.payload->>'requestId'=p_request_id::text);
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
    'declaredCode',nullif(c.attribution_snapshot->'declaredAffiliateCode','""'::jsonb),
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

create function public.research_health_quick_order_replay(p_actor_scope text,p_key_hash text)
returns jsonb language plpgsql stable security definer set search_path='' as $replay$
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

revoke all on function public.research_health_quick_order_intake_closed(jsonb,text[]),
  public.research_health_quick_order_intake_valid(uuid,text,timestamptz,jsonb,jsonb,jsonb),
  public.research_health_quick_order_admin_detail(uuid),
  public.research_health_quick_order_replay(text,text) from public,anon,authenticated,service_role;
grant execute on function public.research_health_quick_order_admin_detail(uuid),
  public.research_health_quick_order_replay(text,text) to service_role;
$qo_ddl$;
  fingerprint_sql text:=$qo_fingerprint$
select encode(extensions.digest(convert_to(jsonb_build_object(
 'relations',(select jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relowner::regrole::text,c.relpersistence,c.reloptions,c.relam,c.reltablespace,c.relrowsecurity,c.relforcerowsecurity,c.relacl) order by c.relname)
   from pg_catalog.pg_class c where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attnum,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attisdropped,a.attcollation,a.attstorage,a.attcompression,a.attstattarget,a.attnotnull,a.attidentity,a.attgenerated,a.attacl,pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum)
   from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid=c.oid
   left join pg_catalog.pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
   where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake' and a.attnum>0),
 'constraints',(select jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_catalog.pg_get_constraintdef(k.oid,true),k.convalidated) order by c.relname,k.conname)
   from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid=c.oid where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'indexes',(select jsonb_agg(jsonb_build_array(c.relname,pg_catalog.pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) order by c.relname,i.indexrelid::regclass::text)
   from pg_catalog.pg_class c join pg_catalog.pg_index i on i.indrelid=c.oid where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'rules',(select jsonb_agg(jsonb_build_array(c.relname,r.rulename,pg_catalog.pg_get_ruledef(r.oid,true),r.ev_enabled) order by c.relname,r.rulename)
   from pg_catalog.pg_class c join pg_catalog.pg_rewrite r on r.ev_class=c.oid where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'policies',(select jsonb_agg(jsonb_build_array(c.relname,po.polname,po.polcmd,po.polpermissive,po.polroles,pg_catalog.pg_get_expr(po.polqual,po.polrelid),pg_catalog.pg_get_expr(po.polwithcheck,po.polrelid)) order by c.relname,po.polname)
   from pg_catalog.pg_class c join pg_catalog.pg_policy po on po.polrelid=c.oid where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_catalog.pg_get_triggerdef(t.oid,true),t.tgenabled) order by c.relname,t.tgname)
   from pg_catalog.pg_class c join pg_catalog.pg_trigger t on t.tgrelid=c.oid where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake' and not t.tgisinternal),
 'functions',(select jsonb_agg(jsonb_build_array(p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid),pg_catalog.pg_get_functiondef(p.oid),p.proowner::regrole::text,p.proacl) order by p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid))
   from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail')))
 )::text,'UTF8'),'sha256'),'hex')
$qo_fingerprint$;
  definition_hash text; actual_hash text; seal text; provider_before text;
  relation_count integer; function_count integer; role_name text; fn record;
begin
  if current_setting('transaction_isolation')<>'read committed'
    or not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
    or current_user::regrole::oid is distinct from (select relowner from pg_catalog.pg_class
      where oid=pg_catalog.to_regclass('public.research_assisted_order_provider_fence'))
  then raise exception 'Quick Order draft requires a read-committed schema owner with RLS bypass' using errcode='55000'; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if not exists(select 1 from pg_catalog.pg_roles where rolname=role_name) then
      raise exception 'Quick Order required role missing' using errcode='55000';
    end if;
  end loop;
  if pg_catalog.to_regprocedure('extensions.digest(bytea,text)') is null
    or pg_catalog.to_regprocedure('public.research_assisted_order_admin_get(uuid)') is null
    or pg_catalog.to_regprocedure('public.research_assisted_order_provider_settlement_integrity()') is null
  then raise exception 'Quick Order predecessors unavailable' using errcode='55000'; end if;
  if exists(select 1 from pg_catalog.pg_proc where pronamespace='public'::regnamespace
      and proname in ('research_health_quick_order_commit','research_health_quick_order_guard_source_write')) then
    raise exception 'Held Quick Order write surface unexpectedly exists' using errcode='55000';
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
      ('research_assisted_order_events','research_assisted_order_events_append_only','A'),
      ('research_assisted_order_events','research_assisted_order_paid_event_evidence','A'),
      ('research_assisted_order_events','hl12_disposition_cancel_event','O'),
      ('research_assisted_order_events','adp03_paid_event','A'),
      ('research_notification_outbox','hl12_payment_effects_outbox_guard','A'),
      ('research_notification_outbox','hl12_payment_effects_outbox_truncate','A'),
      ('research_notification_outbox','hl12_disposition_effects_outbox','O'),
      ('research_notification_outbox','hl12_disposition_effects_truncate','O')
    ), actual as (
      select c.relname::text relation_name,t.tgname::text trigger_name,t.tgenabled::text enabled
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
      where c.relnamespace='public'::regnamespace and not t.tgisinternal
        and c.relname in ('research_assisted_order_requests','research_assisted_order_events','research_notification_outbox')
    )
    select 1 from expected e full join actual a using(relation_name,trigger_name)
    where e.enabled is distinct from a.enabled
  ) then raise exception 'Quick Order predecessor trigger inventory differs' using errcode='55000'; end if;

  provider_before:=public.research_assisted_order_provider_schema_fingerprint();
  definition_hash:=encode(extensions.digest(convert_to(replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex');
  select count(*) into relation_count from pg_catalog.pg_class c where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake';
  select count(*) into function_count from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail'));
  if relation_count=0 and function_count=0 then
    execute install_sql;

  if (select count(*) from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail')))<>4
    or (select count(*) from pg_catalog.pg_class c where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake')<>3
    or not exists(select 1 from pg_catalog.pg_class where oid='public.research_health_quick_order_intakes'::regclass
      and relkind='r' and relrowsecurity and relforcerowsecurity and relowner=current_user::regrole)
    or exists(select 1 from pg_catalog.pg_policy where polrelid='public.research_health_quick_order_intakes'::regclass)
    or exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.research_health_quick_order_intakes'::regclass and not tgisinternal)
  then raise exception 'Quick Order installation shape differs' using errcode='55000'; end if;
  if exists(select 1 from pg_catalog.pg_class c,
      lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
      where c.oid='public.research_health_quick_order_intakes'::regclass and a.grantee<>c.relowner)
    or exists(select 1 from pg_catalog.pg_attribute a,
      lateral pg_catalog.aclexplode(a.attacl) g
      where a.attrelid='public.research_health_quick_order_intakes'::regclass and g.grantee<>current_user::regrole::oid)
  then raise exception 'Quick Order table or column grants differ' using errcode='55000'; end if;
  for fn in select * from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail')) loop
    if fn.proowner<>current_user::regrole::oid or fn.prokind<>'f'
      or fn.proconfig is distinct from array['search_path=""']::text[]
      or fn.prosecdef is distinct from (fn.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail'))
      or exists(select 1 from pg_catalog.aclexplode(coalesce(fn.proacl,pg_catalog.acldefault('f',fn.proowner))) a
        where a.grantee<>fn.proowner and (a.grantee<>'service_role'::regrole::oid
          or fn.proname not in ('research_health_quick_order_replay','research_health_quick_order_admin_detail')
          or a.privilege_type<>'EXECUTE' or a.is_grantable))
    then raise exception 'Quick Order function authority differs' using errcode='55000'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if pg_catalog.has_function_privilege(role_name,fn.oid,'EXECUTE') is distinct from
        (role_name='service_role' and fn.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail'))
      then raise exception 'Quick Order effective execute authority differs' using errcode='55000'; end if;
    end loop;
  end loop;

    execute fingerprint_sql into actual_hash;
    execute format('comment on table public.research_health_quick_order_intakes is %L',
      'QO_INTAKE_READERS_V1:'||definition_hash||':'||actual_hash);
  else
    if relation_count<>3 or function_count<>4
      or pg_catalog.to_regclass('public.research_health_quick_order_intakes') is null then
      raise exception 'Quick Order partial or unknown installation' using errcode='55000';
    end if;
    seal:=pg_catalog.obj_description('public.research_health_quick_order_intakes'::regclass,'pg_class');
    execute fingerprint_sql into actual_hash;
    if seal is distinct from 'QO_INTAKE_READERS_V1:'||definition_hash||':'||actual_hash then
      raise exception 'Quick Order source or catalog differs; no repair attempted' using errcode='55000';
    end if;

  if (select count(*) from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail')))<>4
    or (select count(*) from pg_catalog.pg_class c where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake')<>3
    or not exists(select 1 from pg_catalog.pg_class where oid='public.research_health_quick_order_intakes'::regclass
      and relkind='r' and relrowsecurity and relforcerowsecurity and relowner=current_user::regrole)
    or exists(select 1 from pg_catalog.pg_policy where polrelid='public.research_health_quick_order_intakes'::regclass)
    or exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.research_health_quick_order_intakes'::regclass and not tgisinternal)
  then raise exception 'Quick Order installation shape differs' using errcode='55000'; end if;
  if exists(select 1 from pg_catalog.pg_class c,
      lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
      where c.oid='public.research_health_quick_order_intakes'::regclass and a.grantee<>c.relowner)
    or exists(select 1 from pg_catalog.pg_attribute a,
      lateral pg_catalog.aclexplode(a.attacl) g
      where a.attrelid='public.research_health_quick_order_intakes'::regclass and g.grantee<>current_user::regrole::oid)
  then raise exception 'Quick Order table or column grants differ' using errcode='55000'; end if;
  for fn in select * from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail')) loop
    if fn.proowner<>current_user::regrole::oid or fn.prokind<>'f'
      or fn.proconfig is distinct from array['search_path=""']::text[]
      or fn.prosecdef is distinct from (fn.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail'))
      or exists(select 1 from pg_catalog.aclexplode(coalesce(fn.proacl,pg_catalog.acldefault('f',fn.proowner))) a
        where a.grantee<>fn.proowner and (a.grantee<>'service_role'::regrole::oid
          or fn.proname not in ('research_health_quick_order_replay','research_health_quick_order_admin_detail')
          or a.privilege_type<>'EXECUTE' or a.is_grantable))
    then raise exception 'Quick Order function authority differs' using errcode='55000'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if pg_catalog.has_function_privilege(role_name,fn.oid,'EXECUTE') is distinct from
        (role_name='service_role' and fn.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail'))
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
      ('research_assisted_order_events','research_assisted_order_events_append_only','A'),
      ('research_assisted_order_events','research_assisted_order_paid_event_evidence','A'),
      ('research_assisted_order_events','hl12_disposition_cancel_event','O'),
      ('research_assisted_order_events','adp03_paid_event','A'),
      ('research_notification_outbox','hl12_payment_effects_outbox_guard','A'),
      ('research_notification_outbox','hl12_payment_effects_outbox_truncate','A'),
      ('research_notification_outbox','hl12_disposition_effects_outbox','O'),
      ('research_notification_outbox','hl12_disposition_effects_truncate','O')
    ), actual as (
      select c.relname::text relation_name,t.tgname::text trigger_name,t.tgenabled::text enabled
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
      where c.relnamespace='public'::regnamespace and not t.tgisinternal
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
-- HELD / NOT IMPLEMENTED: atomic commit, Auth/standing admission, source-write
-- guards, currentness activation, writer races, liveness and real notification.
