-- ADP03 PENDING/source-only. Explicit, separately granted admin authorization
-- of a stored authenticated full-capture fact. No adapter, source/policy/grant,
-- historical adoption, refund, void, autonomous settlement or hosted activation.
-- service_role normalized journal input is a trusted integration boundary, not
-- SQL cryptographic proof. Raw provider bytes and credentials never belong here.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local search_path='';

do $migration$
declare installed integer; fingerprint text; seal text;
  predecessor_definition constant text := '5a59a6d48cf40faa74f8b971d4abc43d1e65f5896d42843fc2bf362dfde36430';
  fingerprint_sql text := $fingerprint_query$
select encode(extensions.digest(convert_to(jsonb_build_object(
  'functions',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proowner::regrole::text,p.proacl::text)
    order by p.oid::regprocedure::text) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'research_assisted_order_%'),
  'relations',(select jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relowner::regrole::text,c.relacl::text)
    order by c.relname) from pg_class c where c.relnamespace='public'::regnamespace and (c.relname like 'research_assisted_order_%' or c.relname='research_notification_outbox')),
  'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,a.attidentity,a.attacl::text,pg_get_expr(d.adbin,d.adrelid))
    order by c.relname,a.attnum) from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and (c.relname like 'research_assisted_order_%' or c.relname='research_notification_outbox')),
  'constraints',(select jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid,true),k.convalidated) order by c.relname,k.conname)
    from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace and (c.relname like 'research_assisted_order_%' or c.relname='research_notification_outbox')),
  'indexes',(select jsonb_agg(jsonb_build_array(c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) order by c.relname,i.indexrelid::regclass::text)
    from pg_index i join pg_class c on c.oid=i.indrelid where c.relnamespace='public'::regnamespace and (c.relname like 'research_assisted_order_%' or c.relname='research_notification_outbox')),
  'triggers',(select jsonb_agg(jsonb_build_array(t.tgrelid::regclass::text,t.tgname,pg_get_triggerdef(t.oid,true),t.tgenabled) order by t.tgrelid::regclass::text,t.tgname)
    from pg_trigger t where not t.tgisinternal and t.tgrelid in(select c.oid from pg_class c where c.relnamespace='public'::regnamespace and (c.relname like 'research_assisted_order_%' or c.relname='research_notification_outbox'))),
  'policies',(select jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname) from pg_policies p where p.schemaname='public' and (p.tablename like 'research_assisted_order_%' or p.tablename='research_notification_outbox'))
)::text,'UTF8'),'sha256'),'hex');
$fingerprint_query$;
  install_sql text := $install$

create table public.research_assisted_order_provider_settlement_policies (
  source_id text primary key references public.research_assisted_order_provider_sources(source_id) on update restrict on delete restrict,
  policy_revision text not null check(policy_revision ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  capture_semantics text not null check(capture_semantics='single_full_capture'),
  granted_by text not null,created_at timestamptz not null default date_trunc('milliseconds',clock_timestamp()),revoked_at timestamptz
);
create table public.research_assisted_order_provider_settlement_grants (
  source_id text not null references public.research_assisted_order_provider_sources(source_id) on update restrict on delete restrict,
  auth_user_id uuid not null,actor_label text not null,granted_by text not null,
  granted_at timestamptz not null default date_trunc('milliseconds',clock_timestamp()),revoked_at timestamptz,
  primary key(source_id,auth_user_id)
);
create table public.research_assisted_order_provider_settlements (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.research_assisted_order_requests(id) on update restrict on delete restrict,
  journal_id uuid not null unique references public.research_assisted_order_provider_event_journal(id) on update restrict on delete restrict,
  attempt_id uuid not null unique references public.research_assisted_order_provider_attempts(id) on update restrict on delete restrict,
  source_id text not null references public.research_assisted_order_provider_sources(source_id) on update restrict on delete restrict,
  adapter_revision text not null,expected_scope jsonb not null,policy_revision text not null,
  actor_auth_user_id uuid not null,actor_label text not null,
  quote_id uuid not null references public.research_assisted_order_quotes(id) on update restrict on delete restrict,
  quote_version integer not null,acceptance_id uuid not null,
  amount_cents bigint not null check(amount_cents>0),currency text not null,
  provider_event_id text not null,provider_payment_id text not null,provider_session_id text,
  payment_reference text not null unique,evidence_ref text not null unique,
  observation_id uuid not null unique references public.research_assisted_order_payment_observations(id) on update restrict on delete no action deferrable initially deferred,
  verification_id uuid not null unique references public.research_assisted_order_payment_verifications(id) on update restrict on delete no action deferrable initially deferred,
  observed_at timestamptz not null,verified_at timestamptz not null,
  graph_snapshot jsonb not null,graph_fingerprint text not null check(graph_fingerprint ~ '^[0-9a-f]{64}$'),
  unique(source_id,provider_event_id),unique(source_id,provider_payment_id)
);

create function public.research_assisted_order_provider_settlement_config_guard()
returns trigger language plpgsql set search_path='' as $config$
declare stamp timestamptz;units integer;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  if tg_op='UPDATE' and (old.revoked_at is not null or new.revoked_at is null
    or (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at')) then
    raise exception 'Settlement configuration is immutable except first revocation' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_IMMUTABLE';end if;
  if public.research_assisted_order_disposition_text_valid(new.granted_by,512) is not true then
    raise exception 'Named settlement authority required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_GRANT_REQUIRED';end if;
  if tg_table_name='research_assisted_order_provider_settlement_policies' then stamp:=new.created_at;
  else
    stamp:=new.granted_at;
    select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) into units from regexp_split_to_table(new.actor_label,'') chars(ch);
    if public.research_assisted_order_disposition_text_valid(new.actor_label,512) is not true or units not between 1 and 512 then
      raise exception 'Representable settlement actor required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_GRANT_REQUIRED';end if;
  end if;
  if stamp is null or not isfinite(stamp) or stamp>clock_timestamp()
    or (new.revoked_at is not null and (not isfinite(new.revoked_at) or new.revoked_at<stamp or new.revoked_at>clock_timestamp())) then
    raise exception 'Invalid settlement authority time' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_GRANT_REQUIRED';end if;
  return new;
end
$config$;

-- A bounded full content snapshot, never a count/max-time shortcut. Revoking an
-- authority does not rewrite historical facts; new journal/claim/result/binding
-- facts DO change this snapshot and hold financial fulfillment until reviewed.
create function public.research_assisted_order_provider_settlement_graph(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $graph$
declare a public.research_assisted_order_provider_attempts%rowtype;j jsonb;c jsonb;r jsonb;b jsonb;
begin
  select * into a from public.research_assisted_order_provider_attempts where request_id=p_request_id;
  if not found then return null;end if;
  if (select count(*) from public.research_assisted_order_provider_event_journal where established_request_id=p_request_id)>100
    or (select count(*) from public.research_assisted_order_provider_create_claims where attempt_id=a.id)>100
    or (select count(*) from public.research_assisted_order_provider_create_results x join public.research_assisted_order_provider_create_claims y on y.id=x.claim_id where y.attempt_id=a.id)>100 then
    raise exception 'Settlement evidence exceeds bounded review' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_HELD';end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into j from public.research_assisted_order_provider_event_journal x where established_request_id=p_request_id;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into c from public.research_assisted_order_provider_create_claims x where attempt_id=a.id;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into r from public.research_assisted_order_provider_create_results x
    where claim_id in(select id from public.research_assisted_order_provider_create_claims where attempt_id=a.id);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.binding_kind),'[]') into b from public.research_assisted_order_provider_identity_bindings x where attempt_id=a.id;
  return jsonb_build_object('attempt',to_jsonb(a),'journal',j,'claims',c,'results',r,'bindings',b);
end
$graph$;

-- Pure structural lineage check, usable while assembling the transaction.
-- The deferred complete check below additionally requires paid event + outbox.
create function public.research_assisted_order_provider_settlement_verification_valid(p_verification_id uuid)
returns boolean language sql stable security definer set search_path='' as $valid$
 select exists(select 1 from public.research_assisted_order_provider_settlements s
  join public.research_assisted_order_payment_observations o on o.id=s.observation_id
  join public.research_assisted_order_payment_verifications v on v.id=s.verification_id
  where v.id=p_verification_id and row(o.request_id,o.quote_id,o.method,o.observed_amount_cents,o.observed_currency,o.payment_reference,o.provider_name,o.provider_event_id,o.provider_payment_id,o.source_evidence_ref,o.observed_by,o.observed_by_auth_user_id,o.observed_at)
    is not distinct from row(s.request_id,s.quote_id,'provider'::text,s.amount_cents,s.currency,s.payment_reference,s.source_id,s.provider_event_id,s.provider_payment_id,s.evidence_ref,s.actor_label,s.actor_auth_user_id,s.observed_at)
  and row(v.request_id,v.quote_id,v.quote_version,v.acceptance_id,v.observation_id,v.expected_amount_cents,v.expected_currency,v.observed_amount_cents,v.observed_currency,v.payment_reference,v.method,v.provider_name,v.provider_event_id,v.provider_payment_id,v.verified_by,v.verified_at)
    is not distinct from row(s.request_id,s.quote_id,s.quote_version,s.acceptance_id,s.observation_id,s.amount_cents,s.currency,s.amount_cents,s.currency,s.payment_reference,'provider'::text,s.source_id,s.provider_event_id,s.provider_payment_id,s.actor_label,s.verified_at));
$valid$;

create function public.research_assisted_order_provider_settlement_complete(p_settlement_id uuid)
returns boolean language sql stable security definer set search_path='' as $complete$
 select exists(select 1 from public.research_assisted_order_provider_settlements s
  where s.id=p_settlement_id and public.research_assisted_order_provider_settlement_verification_valid(s.verification_id)
  and exists(select 1 from public.research_assisted_order_requests r where r.id=s.request_id and r.status in('paid','supplier_processing','shipped','delivered','closed'))
  and (select count(*) from public.research_assisted_order_payment_observations where request_id=s.request_id)=1
  and (select count(*) from public.research_assisted_order_payment_verifications where request_id=s.request_id)=1
  and (select count(*) from public.research_assisted_order_evidence_claims where request_id=s.request_id)=1
  and (select count(*) from public.research_assisted_order_events where request_id=s.request_id and status='paid')=1
  and not exists(select 1 from public.research_assisted_order_observation_corrections where observation_id=s.observation_id or replacement_id=s.observation_id)
  and exists(select 1 from public.research_assisted_order_evidence_claims c where c.method='provider' and c.provider_namespace=s.source_id and c.evidence_ref=s.evidence_ref and c.request_id=s.request_id)
  and exists(select 1 from public.research_assisted_order_events e where e.request_id=s.request_id and e.status='paid'
    and e.actor_type='admin' and e.actor_id=s.actor_label and e.occurred_at=s.verified_at
    and e.evidence=jsonb_build_object('paymentVerificationId',s.verification_id)
    and e.customer_message='Payment verification recorded.' and e.internal_note is null)
  and exists(select 1 from public.research_notification_outbox o join public.research_assisted_order_requests r on r.id=s.request_id
    where o.assisted_order_verification_id=s.verification_id
    and o.event_key='assisted-order:'||s.request_id::text||':payment-verification:'||s.verification_id::text
    and o.event_type='assisted_order.status_changed' and o.channel='email' and o.recipient=r.normalized_email
    and o.template_key='research.assisted_order.status_changed.customer' and o.application_id is null and o.member_id is null
    and o.created_at=s.verified_at and o.payload=jsonb_build_object('publicReference',r.public_reference,'status','paid',
      'customerMessage','Payment verified. Fulfillment is reviewed separately.')
    and (o.status='held' or public.research_assisted_order_payment_effects_audit_receipt(s.verification_id) is not null)));
$complete$;

create function public.research_assisted_order_provider_settlement_guard()
returns trigger language plpgsql security definer set search_path='' as $guard$
declare r public.research_assisted_order_requests%rowtype;a public.research_assisted_order_provider_attempts%rowtype;
  j public.research_assisted_order_provider_event_journal%rowtype;q public.research_assisted_order_quotes%rowtype;
  source public.research_assisted_order_provider_sources%rowtype;label text;g jsonb;payment_id text;session_id text;first_started timestamptz;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  perform public.research_assisted_order_provider_settlement_integrity();
  select * into r from public.research_assisted_order_requests where id=new.request_id for update;
  if not found then raise exception 'Settlement request unavailable' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_CONFLICT';end if;
  perform 1 from public.research_assisted_order_provider_fence where id for update;
  if not found then raise exception 'Provider fence unavailable' using errcode='55000';end if;
  if new.attempt_id is not null or new.actor_label is not null or new.quote_id is not null or new.quote_version is not null
    or new.acceptance_id is not null or new.amount_cents is not null or new.currency is not null or new.provider_event_id is not null
    or new.provider_payment_id is not null or new.provider_session_id is not null or new.payment_reference is not null
    or new.evidence_ref is not null or new.observation_id is not null or new.verification_id is not null
    or new.observed_at is not null or new.verified_at is not null or new.graph_snapshot is not null or new.graph_fingerprint is not null then
    raise exception 'Settlement facts must be database-derived' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_CONFLICT';end if;
  select * into source from public.research_assisted_order_provider_sources where source_id=new.source_id and revoked_at is null for share;
  if not found or public.research_assisted_order_provider_scope_valid(new.expected_scope,source,new.adapter_revision) is not true then
    raise exception 'Exact active settlement source required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_GRANT_REQUIRED';end if;
  perform 1 from public.research_assisted_order_provider_settlement_policies where source_id=new.source_id
    and policy_revision=new.policy_revision and capture_semantics='single_full_capture' and revoked_at is null for share;
  if not found then raise exception 'Settlement policy required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_GRANT_REQUIRED';end if;
  select actor_label into label from public.research_assisted_order_provider_settlement_grants
    where source_id=new.source_id and auth_user_id=new.actor_auth_user_id and revoked_at is null for share;
  if not found then raise exception 'Distinct settlement grant required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_GRANT_REQUIRED';end if;
  select * into j from public.research_assisted_order_provider_event_journal where id=new.journal_id;
  select * into a from public.research_assisted_order_provider_attempts where id=j.established_attempt_id;
  select * into q from public.research_assisted_order_quotes where id=a.quote_id;
  if j.id is null or a.id is null or q.id is null or r.status<>'payment_review'
    or j.established_request_id is distinct from r.id or a.request_id is distinct from r.id
    or j.source_id is distinct from new.source_id or a.source_id is distinct from new.source_id
    or j.adapter_revision is distinct from new.adapter_revision or a.adapter_revision is distinct from new.adapter_revision
    or j.expected_scope is distinct from new.expected_scope or a.expected_scope is distinct from new.expected_scope
    or j.classification<>'bound' or j.reason<>'exact_binding' or j.event->>'kind'<>'captured'
    or j.event->'adjustmentId'<>'null'::jsonb or q.request_id is distinct from r.id or q.state<>'accepted'
    or q.acceptance_id is null or a.acceptance_id is distinct from q.acceptance_id or a.quote_version is distinct from q.version
    or a.expected_amount_cents is distinct from q.total_cents or a.currency is distinct from q.currency
    or (j.event->>'observedAmountCents')::bigint is distinct from q.total_cents or j.event->>'currency' is distinct from q.currency
    or (j.event->>'claimedRequestId')::uuid is distinct from r.id or (j.event->>'claimedQuoteId')::uuid is distinct from q.id
    or (j.event->>'claimedQuoteVersion')::integer is distinct from q.version or (j.event->>'claimedAcceptanceId')::uuid is distinct from q.acceptance_id
    or (j.event->>'claimedAttemptId')::uuid is distinct from a.id or j.event->'claimedCanonicalOrderId'<>'null'::jsonb
    or exists(select 1 from public.research_assisted_order_quotes where request_id=r.id and version>q.version)
    or exists(select 1 from public.research_assisted_order_payment_observations where request_id=r.id)
    or exists(select 1 from public.research_assisted_order_payment_verifications where request_id=r.id)
    or exists(select 1 from public.research_assisted_order_evidence_claims where request_id=r.id)
    or exists(select 1 from public.research_assisted_order_events where request_id=r.id and status='paid')
    or exists(select 1 from public.research_assisted_order_financial_dispositions where request_id=r.id)
    or exists(select 1 from public.research_assisted_order_provider_event_journal where established_request_id is null)
    or exists(select 1 from public.research_assisted_order_provider_event_journal x where x.established_request_id=r.id
      and (x.established_attempt_id is distinct from a.id or x.classification<>'bound' or x.reason<>'exact_binding'
        or x.event->>'kind' not in ('pending','authorized','captured') or (x.event->>'kind'='captured' and x.id<>j.id))) then
    raise exception 'Capture lineage remains held' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_HELD';end if;
  select provider_identity into payment_id from public.research_assisted_order_provider_identity_bindings where attempt_id=a.id and binding_kind='payment' and source_id=new.source_id;
  select provider_identity into session_id from public.research_assisted_order_provider_identity_bindings where attempt_id=a.id and binding_kind='session' and source_id=new.source_id;
  select min(creation_started_at) into first_started from public.research_assisted_order_provider_create_claims where attempt_id=a.id;
  if payment_id is null or payment_id is distinct from j.event->>'providerPaymentId'
    or session_id is distinct from j.event->>'providerSessionId' or first_started is null
    or (j.event->>'occurredAt')::timestamptz<greatest(first_started,q.accepted_at)
    or (j.event->>'occurredAt')::timestamptz>j.received_at
    or exists(select 1 from public.research_assisted_order_provider_create_results x join public.research_assisted_order_provider_create_claims c on c.id=x.claim_id
      where c.attempt_id=a.id and (x.classification<>'bound' or x.reason<>'exact_binding'))
    or exists(select 1 from public.research_assisted_order_provider_create_claims c where c.attempt_id=a.id and not exists(
      select 1 from public.research_assisted_order_provider_create_results x where x.claim_id=c.id and x.classification='bound')) then
    raise exception 'Provider identity or create outcome remains held' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_HELD';end if;
  g:=public.research_assisted_order_provider_settlement_graph(r.id);
  new.attempt_id:=a.id;new.actor_label:=label;new.quote_id:=q.id;new.quote_version:=q.version;new.acceptance_id:=q.acceptance_id;
  new.amount_cents:=q.total_cents;new.currency:=q.currency;new.provider_event_id:=j.event->>'eventId';
  new.provider_payment_id:=payment_id;new.provider_session_id:=session_id;
  -- Existing provider_name is the canonical evidence namespace, not marketing
  -- copy. The immutable configured source identifies exact account/test-live scope.
  new.payment_reference:='provider:'||encode(extensions.digest(convert_to(jsonb_build_array(new.source_id,payment_id)::text,'UTF8'),'sha256'),'hex');
  new.evidence_ref:='provider-journal:'||j.id::text;new.observation_id:=gen_random_uuid();new.verification_id:=gen_random_uuid();
  new.observed_at:=(j.event->>'occurredAt')::timestamptz;new.verified_at:=date_trunc('milliseconds',clock_timestamp());
  new.graph_snapshot:=g;new.graph_fingerprint:=encode(extensions.digest(convert_to(g::text,'UTF8'),'sha256'),'hex');
  return new;
end
$guard$;

create function public.research_assisted_order_provider_settlement_receipt(s public.research_assisted_order_provider_settlements,p_replayed boolean)
returns jsonb language sql immutable set search_path='' as $receipt$
 select jsonb_build_object('schemaVersion','assisted_order_provider_settlement_receipt_v1','settlementId',s.id,'requestId',s.request_id,
  'journalId',s.journal_id,'attemptId',s.attempt_id,'sourceId',s.source_id,'adapterRevision',s.adapter_revision,'policyRevision',s.policy_revision,
  'quoteId',s.quote_id,'quoteVersion',s.quote_version,'acceptanceId',s.acceptance_id,'verificationId',s.verification_id,
  'verifiedAt',public.research_assisted_order_provider_execution_iso(s.verified_at),'verifiedBy',s.actor_label,'state','verified','replayed',p_replayed);
$receipt$;

create function public.research_assisted_order_provider_settlement_commit(
 p_request_id uuid,p_journal_id uuid,p_source_id text,p_adapter_revision text,p_expected_scope jsonb,p_policy_revision text,p_actor_auth_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $settle$
declare s public.research_assisted_order_provider_settlements%rowtype;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  perform public.research_assisted_order_provider_settlement_integrity();
  if p_request_id is null or p_journal_id is null or p_actor_auth_user_id is null then
    raise exception 'Bound settlement command required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_CONFLICT';end if;
  perform 1 from public.research_assisted_order_requests where id=p_request_id for update;
  if not found then return null;end if;
  perform 1 from public.research_assisted_order_provider_fence where id for update;
  select * into s from public.research_assisted_order_provider_settlements where request_id=p_request_id or journal_id=p_journal_id;
  if found then
    if row(s.request_id,s.journal_id,s.source_id,s.adapter_revision,s.expected_scope,s.policy_revision,s.actor_auth_user_id)
      is distinct from row(p_request_id,p_journal_id,p_source_id,p_adapter_revision,p_expected_scope,p_policy_revision,p_actor_auth_user_id) then
      raise exception 'Settlement replay conflicts' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_CONFLICT';end if;
    -- An immutable receipt is not new permission, nor current eligibility.
    return public.research_assisted_order_provider_settlement_receipt(s,true);
  end if;
  perform 1 from public.research_assisted_order_provider_event_journal where id=p_journal_id;
  if not found then return null;end if;
  insert into public.research_assisted_order_provider_settlements(request_id,journal_id,source_id,adapter_revision,expected_scope,policy_revision,actor_auth_user_id)
    values(p_request_id,p_journal_id,p_source_id,p_adapter_revision,p_expected_scope,p_policy_revision,p_actor_auth_user_id) returning * into s;
  insert into public.research_assisted_order_payment_observations(id,request_id,quote_id,method,observed_amount_cents,observed_currency,
    payment_reference,provider_name,provider_event_id,provider_payment_id,source_evidence_ref,observed_by,observed_by_auth_user_id,observed_at)
    values(s.observation_id,s.request_id,s.quote_id,'provider',s.amount_cents,s.currency,s.payment_reference,s.source_id,s.provider_event_id,
      s.provider_payment_id,s.evidence_ref,s.actor_label,s.actor_auth_user_id,s.observed_at);
  insert into public.research_assisted_order_payment_verifications(id,request_id,quote_id,quote_version,acceptance_id,observation_id,
    expected_amount_cents,expected_currency,observed_amount_cents,observed_currency,payment_reference,method,provider_name,provider_event_id,provider_payment_id,verified_by,verified_at)
    values(s.verification_id,s.request_id,s.quote_id,s.quote_version,s.acceptance_id,s.observation_id,s.amount_cents,s.currency,s.amount_cents,s.currency,
      s.payment_reference,'provider',s.source_id,s.provider_event_id,s.provider_payment_id,s.actor_label,s.verified_at);
  perform public.research_assisted_order_set_status(s.request_id,'payment_review','paid',s.actor_label,'admin',
    'Payment verification recorded.',null,jsonb_build_object('paymentVerificationId',s.verification_id),s.verified_at);
  return public.research_assisted_order_provider_settlement_receipt(s,false);
end
$settle$;

create function public.research_assisted_order_financial_eligibility(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $eligibility$
declare s public.research_assisted_order_provider_settlements%rowtype;verified boolean;reason text;g jsonb;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  perform public.research_assisted_order_provider_settlement_integrity();
  perform 1 from public.research_assisted_order_requests where id=p_request_id for update;
  if not found then return null;end if;
  perform 1 from public.research_assisted_order_provider_fence where id for share;
  select * into s from public.research_assisted_order_provider_settlements where request_id=p_request_id;
  verified:=coalesce((public.research_assisted_order_financial_state(p_request_id)->>'paymentVerified')::boolean,false);
  if exists(select 1 from public.research_assisted_order_provider_event_journal where established_request_id is null) then reason:='provider_uncertainty_held';
  elsif s.id is not null then
    if not public.research_assisted_order_provider_settlement_complete(s.id) then reason:='provider_settlement_incomplete';
    else
      g:=public.research_assisted_order_provider_settlement_graph(p_request_id);
      if g is distinct from s.graph_snapshot then reason:='provider_uncertainty_held';end if;
    end if;
  elsif exists(select 1 from public.research_assisted_order_provider_attempts where request_id=p_request_id)
    or exists(select 1 from public.research_assisted_order_provider_event_journal where established_request_id=p_request_id) then reason:='provider_uncertainty_held';
  elsif not verified then reason:='payment_not_verified';end if;
  return jsonb_build_object('schemaVersion','assisted_order_financial_eligibility_v1','requestId',p_request_id,'paymentVerified',verified,
    'providerSettlement',s.id is not null,'fulfillmentEligible',verified and reason is null,'reason',reason);
end
$eligibility$;

-- Table-specific exact prospective rows, not an own-request blanket bypass.
create function public.research_assisted_order_provider_settlement_row_allowed(p_table text,p_row jsonb)
returns boolean language plpgsql security definer set search_path='' as $allowed$
declare s public.research_assisted_order_provider_settlements%rowtype;
begin
  select * into s from public.research_assisted_order_provider_settlements where request_id=(p_row->>'request_id')::uuid;
  if not found then return false;end if;
  if exists(select 1 from public.research_assisted_order_provider_event_journal where established_request_id is null)
    or public.research_assisted_order_provider_settlement_graph(s.request_id) is distinct from s.graph_snapshot then return false;end if;
  if p_table='research_assisted_order_payment_observations' then
    return p_row @> jsonb_build_object('id',s.observation_id,'request_id',s.request_id,'quote_id',s.quote_id,'method','provider',
      'observed_amount_cents',s.amount_cents,'observed_currency',s.currency,'payment_reference',s.payment_reference,'provider_name',s.source_id,
      'provider_event_id',s.provider_event_id,'provider_payment_id',s.provider_payment_id,'source_evidence_ref',s.evidence_ref,
      'observed_by',s.actor_label,'observed_by_auth_user_id',s.actor_auth_user_id,'observed_at',s.observed_at);
  elsif p_table='research_assisted_order_payment_verifications' then
    return p_row @> jsonb_build_object('id',s.verification_id,'request_id',s.request_id,'quote_id',s.quote_id,'quote_version',s.quote_version,
      'acceptance_id',s.acceptance_id,'observation_id',s.observation_id,'expected_amount_cents',s.amount_cents,'expected_currency',s.currency,
      'observed_amount_cents',s.amount_cents,'observed_currency',s.currency,'payment_reference',s.payment_reference,'method','provider',
      'provider_name',s.source_id,'provider_event_id',s.provider_event_id,'provider_payment_id',s.provider_payment_id,'verified_by',s.actor_label,'verified_at',s.verified_at);
  elsif p_table='research_assisted_order_evidence_claims' then
    return p_row @> jsonb_build_object('request_id',s.request_id,'method','provider','provider_namespace',s.source_id,'evidence_ref',s.evidence_ref);
  end if;
  return false;
end
$allowed$;

create or replace function public.research_assisted_order_provider_payment_hold_guard()
returns trigger language plpgsql security definer set search_path='' as $hold$
begin
  perform public.research_assisted_order_provider_require_read_committed();
  if new.method='provider' and public.research_assisted_order_provider_settlement_row_allowed(tg_table_name,to_jsonb(new)) is not true then
    raise exception 'Provider payment authority is not ready' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_AUTHORITY_NOT_READY';end if;
  return new;
end
$hold$;

create or replace function public.research_assisted_order_provider_financial_guard()
returns trigger language plpgsql security definer set search_path='' as $financial$
declare request_uuid uuid;s public.research_assisted_order_provider_settlements%rowtype;e jsonb;allowed boolean;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  if tg_table_name='research_assisted_order_requests' then
    if new.status is not distinct from old.status then return new;end if;
    select * into s from public.research_assisted_order_provider_settlements where request_id=new.id;
    if s.id is not null then
      if old.status='payment_review' and new.status='paid' then
        perform 1 from public.research_assisted_order_provider_fence where id for share;
        if public.research_assisted_order_provider_settlement_verification_valid(s.verification_id)
          and not exists(select 1 from public.research_assisted_order_provider_event_journal where established_request_id is null)
          and public.research_assisted_order_provider_settlement_graph(new.id) is not distinct from s.graph_snapshot then return new;end if;
      else
        e:=public.research_assisted_order_financial_eligibility(new.id);
        allowed:=case old.status when 'paid' then new.status='supplier_processing' when 'supplier_processing' then new.status='shipped'
          when 'shipped' then new.status='delivered' when 'delivered' then new.status='closed' else false end;
        if allowed and e->>'fulfillmentEligible'='true' then return new;end if;
      end if;
      raise exception 'Current financial fulfillment remains held' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_FULFILLMENT_HELD';
    end if;
    if new.status in ('paid','supplier_processing','shipped','delivered','closed','cancelled')
      or old.status in ('paid','supplier_processing','shipped','delivered','closed') then
      perform public.research_assisted_order_provider_assert_clear(new.id);end if;
  elsif tg_table_name='research_assisted_order_observation_corrections' then
    select request_id into request_uuid from public.research_assisted_order_payment_observations where id=new.observation_id;
    perform public.research_assisted_order_provider_assert_clear(request_uuid);
  elsif tg_table_name='research_assisted_order_quotes' then
    if tg_op='UPDATE' and new is not distinct from old then return new;end if;
    perform public.research_assisted_order_provider_assert_clear(new.request_id);
  else
    perform 1 from public.research_assisted_order_requests where id=new.request_id for update;
    perform 1 from public.research_assisted_order_provider_fence where id for share;
    if public.research_assisted_order_provider_settlement_row_allowed(tg_table_name,to_jsonb(new)) then return new;end if;
    perform public.research_assisted_order_provider_assert_clear(new.request_id);
  end if;
  return new;
end
$financial$;

create function public.research_assisted_order_provider_settlement_event_guard()
returns trigger language plpgsql security definer set search_path='' as $event$
declare s public.research_assisted_order_provider_settlements%rowtype;
begin
  if new.status<>'paid' then return new;end if;
  select * into s from public.research_assisted_order_provider_settlements
    where request_id=new.request_id or verification_id::text=new.evidence->>'paymentVerificationId';
  if not found then return new;end if;
  if new.request_id is distinct from s.request_id or new.actor_type is distinct from 'admin' or new.actor_id is distinct from s.actor_label
    or new.occurred_at is distinct from s.verified_at or new.evidence is distinct from jsonb_build_object('paymentVerificationId',s.verification_id)
    or new.customer_message is distinct from 'Payment verification recorded.' or new.internal_note is not null
    or exists(select 1 from public.research_assisted_order_events where request_id=s.request_id and status='paid') then
    raise exception 'Capture paid event conflicts' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_CONFLICT';end if;
  return new;
end
$event$;

create function public.research_assisted_order_provider_settlement_transaction_guard()
returns trigger language plpgsql security definer set search_path='' as $transaction$
begin
  if not public.research_assisted_order_provider_settlement_complete(new.id)
    or not exists(select 1 from public.research_assisted_order_requests where id=new.request_id and status in('paid','supplier_processing','shipped','delivered','closed')) then
    raise exception 'Settlement requires complete canonical evidence, paid event and held outbox' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SETTLEMENT_CONFLICT';end if;
  return null;
end
$transaction$;

create function public.research_assisted_order_provider_settled_evidence_immutable()
returns trigger language plpgsql security definer set search_path='' as $immutable$
declare request_uuid uuid;
begin
  if tg_op='TRUNCATE' then
    if exists(select 1 from public.research_assisted_order_provider_settlements) then
      raise exception 'Settled evidence cannot be truncated' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_IMMUTABLE';end if;
    return null;
  end if;
  if tg_op='UPDATE' and new is not distinct from old then return new;end if;
  if tg_table_name='research_assisted_order_requests' then request_uuid:=old.id;
  else request_uuid:=old.request_id;end if;
  if exists(select 1 from public.research_assisted_order_provider_settlements where request_id=request_uuid) then
    raise exception 'Settled evidence is immutable' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_IMMUTABLE';end if;
  if tg_op='DELETE' then return old;end if;return new;
end
$immutable$;

create function public.research_assisted_order_provider_settled_request_guard()
returns trigger language plpgsql set search_path='' as $request$
begin
  if exists(select 1 from public.research_assisted_order_provider_settlements where request_id=old.id)
    and (to_jsonb(new)-array['status','updated_at']) is distinct from (to_jsonb(old)-array['status','updated_at']) then
    raise exception 'Settled request identity is immutable' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_IMMUTABLE';end if;
  return new;
end
$request$;

-- F4 remains the one outbox/audit authority. Retain the exact admin receipt,
-- real actor label, canonical copy, audit-before-release and restart semantics.
-- Only the method guard changes, and only for a complete linked verification.
do $effects$
declare definition text;replacement text;signature text;needle text:='v.method <> ''manual''';
begin
  foreach signature in array array['public.research_assisted_order_payment_effects_outbox_guard()',
    'public.research_assisted_order_payment_effects_context(uuid)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
      raise exception 'Unexpected canonical effects predecessor' using errcode='55000';end if;
    replacement:=replace(definition,needle,'(v.method not in (''manual'',''provider'') or (v.method=''provider'' and public.research_assisted_order_provider_settlement_verification_valid(v.id) is not true))');
    execute replacement;
  end loop;
end
$effects$;
create or replace function public.research_assisted_order_payment_effects_authority()
returns jsonb language sql stable security definer set search_path='' as $effects_authority$
  select jsonb_build_object('schemaVersion','research_assisted_order_payment_effects_v2','intentPolicy','verification_atomic_canonical_outbox_admin_v2',
    'auditPolicy','canonical_audit_before_dispatch_v1','historicalAdoption',false);
$effects_authority$;

do $guards$
declare t text;
begin
  foreach t in array array['research_assisted_order_provider_settlement_policies','research_assisted_order_provider_settlement_grants','research_assisted_order_provider_settlements'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('create trigger adp03_no_truncate before truncate on public.%I for each statement execute function public.research_assisted_order_provider_immutable()',t);
    execute format('alter table public.%I enable always trigger adp03_no_truncate',t);
    if t='research_assisted_order_provider_settlements' then
      execute format('create trigger adp03_immutable before update or delete on public.%I for each row execute function public.research_assisted_order_provider_immutable()',t);
    else
      execute format('create trigger adp03_immutable before delete on public.%I for each row execute function public.research_assisted_order_provider_immutable()',t);
      execute format('create trigger adp03_config before insert or update on public.%I for each row execute function public.research_assisted_order_provider_settlement_config_guard()',t);
      execute format('alter table public.%I enable always trigger adp03_config',t);
    end if;
    execute format('alter table public.%I enable always trigger adp03_immutable',t);
  end loop;
  foreach t in array array['research_assisted_order_payment_observations','research_assisted_order_payment_verifications','research_assisted_order_evidence_claims',
    'research_assisted_order_quotes','research_assisted_order_events','research_assisted_order_requests'] loop
    execute format('create trigger adp03_evidence_truncate before truncate on public.%I for each statement execute function public.research_assisted_order_provider_settled_evidence_immutable()',t);
    execute format('alter table public.%I enable always trigger adp03_evidence_truncate',t);
    if t='research_assisted_order_requests' then
      execute format('create trigger adp03_evidence_immutable before delete on public.%I for each row execute function public.research_assisted_order_provider_settled_evidence_immutable()',t);
    else
      execute format('create trigger adp03_evidence_immutable before update or delete on public.%I for each row execute function public.research_assisted_order_provider_settled_evidence_immutable()',t);
    end if;
    execute format('alter table public.%I enable always trigger adp03_evidence_immutable',t);
  end loop;
end
$guards$;
create trigger adp03_request_identity before update on public.research_assisted_order_requests for each row execute function public.research_assisted_order_provider_settled_request_guard();
alter table public.research_assisted_order_requests enable always trigger adp03_request_identity;
create trigger adp03_settlement before insert on public.research_assisted_order_provider_settlements for each row execute function public.research_assisted_order_provider_settlement_guard();
alter table public.research_assisted_order_provider_settlements enable always trigger adp03_settlement;
create constraint trigger adp03_settlement_complete after insert on public.research_assisted_order_provider_settlements
  deferrable initially deferred for each row execute function public.research_assisted_order_provider_settlement_transaction_guard();
alter table public.research_assisted_order_provider_settlements enable always trigger adp03_settlement_complete;
create trigger adp03_paid_event before insert on public.research_assisted_order_events for each row execute function public.research_assisted_order_provider_settlement_event_guard();
alter table public.research_assisted_order_events enable always trigger adp03_paid_event;
-- The new transaction's critical inherited invariants must also hold in replica
-- mode. This advances effective triggers, never predecessor migration bytes.
do $inherited$
declare x record;
begin
  for x in select * from (values
    ('research_assisted_order_payment_observations','hl12_provider_observation_hold'),
    ('research_assisted_order_payment_verifications','hl12_provider_verification_hold'),
    ('research_assisted_order_payment_observations','hl12_evidence_claim'),
    ('research_assisted_order_payment_observations','research_assisted_order_observation_immutable'),
    ('research_assisted_order_payment_verifications','research_assisted_order_verification_immutable'),
    ('research_assisted_order_evidence_claims','hl12_claim_immutable'),
    ('research_assisted_order_observation_corrections','hl12_correction_immutable'),
    ('research_assisted_order_observation_corrections','hl12_disposition_no_truncate'),
    ('research_assisted_order_events','research_assisted_order_events_append_only'),
    ('research_assisted_order_quotes','hl12_quote_snapshot_immutable'),
    ('research_assisted_order_quotes','hl12_quote_snapshot_no_truncate'),
    ('research_assisted_order_payment_observations','research_assisted_order_observation_insert'),
    ('research_assisted_order_payment_verifications','research_assisted_order_verification_insert'),
    ('research_assisted_order_payment_verifications','hl12_correction_verification'),
    ('research_assisted_order_payment_verifications','hl12_payment_effects_capture'),
    ('research_notification_outbox','hl12_payment_effects_outbox_guard'),
    ('research_notification_outbox','hl12_payment_effects_outbox_truncate'),
    ('research_assisted_order_events','research_assisted_order_paid_event_evidence')) as g(relation_name,trigger_name) loop
    if not exists(select 1 from pg_trigger where tgrelid=('public.'||x.relation_name)::regclass and tgname=x.trigger_name and tgenabled in('O','A')) then
      raise exception 'Settlement predecessor guard missing or ineffective' using errcode='55000';end if;
    execute format('alter table public.%I enable always trigger %I',x.relation_name,x.trigger_name);
  end loop;
end
$inherited$;

create function public.research_assisted_order_provider_settlement_rpc_oids()
returns oid[] language plpgsql stable set search_path='' as $oids$
begin
 return array[
  'public.research_assisted_order_provider_attempt_reserve(uuid,uuid,integer,uuid,text,text,jsonb,uuid,text)'::regprocedure,
  'public.research_assisted_order_provider_event_append(text,text,jsonb,jsonb)'::regprocedure,
  'public.research_assisted_order_provider_uncertainty(uuid)'::regprocedure,
  'public.research_assisted_order_provider_journal_authority()'::regprocedure,
  'public.research_assisted_order_provider_create_context(uuid,uuid,text,text,jsonb,text,uuid)'::regprocedure,
  'public.research_assisted_order_provider_create_claim(uuid,uuid,text,text,jsonb,text,uuid,uuid)'::regprocedure,
  'public.research_assisted_order_provider_create_result_append(uuid,text,text,jsonb,text,jsonb)'::regprocedure,
  'public.research_assisted_order_provider_execution_authority()'::regprocedure,
  'public.research_assisted_order_provider_settlement_authority()'::regprocedure,
  'public.research_assisted_order_provider_settlement_commit(uuid,uuid,text,text,jsonb,text,uuid)'::regprocedure,
  'public.research_assisted_order_financial_eligibility(uuid)'::regprocedure]::oid[];
end
$oids$;

create function public.research_assisted_order_provider_settlement_integrity()
returns void language plpgsql stable security definer set search_path='' as $integrity$
declare seal text;p record;permitted boolean;role_name text;t record;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
  if seal is null or seal !~ '^ADP03_SCHEMA_V1:5a59a6d48cf40faa74f8b971d4abc43d1e65f5896d42843fc2bf362dfde36430:[0-9a-f]{64}:[0-9a-f]{64}$'
    or split_part(seal,':',4) is distinct from public.research_assisted_order_provider_schema_fingerprint()
    or not exists(select 1 from public.research_assisted_order_provider_fence where id)
    or exists(select 1 from public.research_assisted_order_provider_settlements s where not public.research_assisted_order_provider_settlement_complete(s.id))
    or exists(select 1 from public.research_assisted_order_payment_verifications v where v.method='provider'
      and not public.research_assisted_order_provider_settlement_verification_valid(v.id)) then
    raise exception 'Provider settlement schema or lineage requires reconciliation' using errcode='55000';end if;
  for p in select oid from pg_proc where pronamespace='public'::regnamespace and (proname like 'research_assisted_order_provider_%' or proname='research_assisted_order_financial_eligibility') loop
    permitted:=p.oid=any(public.research_assisted_order_provider_settlement_rpc_oids());
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,p.oid,'EXECUTE') is distinct from (permitted and role_name='service_role') then
        raise exception 'Provider settlement function ACL drift' using errcode='55000';end if;
    end loop;
  end loop;
  for t in select oid from pg_class where relnamespace='public'::regnamespace and relkind in('r','p') and relname like 'research_assisted_order_provider_%' loop
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(role_name,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(role_name,t.oid,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Provider settlement table ACL drift' using errcode='55000';end if;
    end loop;
  end loop;
end
$integrity$;
-- One-way delegation, never recursively comparing seals from two generations.
create or replace function public.research_assisted_order_provider_execution_integrity()
returns void language plpgsql stable security definer set search_path='' as $integrity$
begin perform public.research_assisted_order_provider_settlement_integrity();end
$integrity$;
create or replace function public.research_assisted_order_provider_journal_authority()
returns jsonb language plpgsql stable security definer set search_path='' as $authority$
begin
  perform public.research_assisted_order_provider_settlement_integrity();
  return jsonb_build_object('schemaVersion','assisted_order_provider_journal_v3','transactionIsolation','read_committed_only',
    'journalPolicy','authenticated_durable_evidence_only_v1','settlementPolicy','separate_scoped_admin_capture_v1','refundPolicy','record_and_hold_only_v1');
end
$authority$;
create or replace function public.research_assisted_order_provider_execution_authority()
returns jsonb language plpgsql stable security definer set search_path='' as $authority$
begin
  perform public.research_assisted_order_provider_settlement_integrity();
  return jsonb_build_object('schemaVersion','assisted_order_provider_execution_v2','transactionIsolation','read_committed_only',
    'dispatchTiming','database_budget_monotonic_v1','durableCreateOwnership',true,'providerIdentityBinding','write_once',
    'settlementPolicy','separate_scoped_admin_capture_v1','refundPolicy','record_and_hold_only_v1','dispatchPolicy','explicit_source_create_policy_and_grant_v1');
end
$authority$;
create function public.research_assisted_order_provider_settlement_authority()
returns jsonb language plpgsql stable security definer set search_path='' as $authority$
begin
  perform public.research_assisted_order_provider_settlement_integrity();
  return jsonb_build_object('schemaVersion','assisted_order_provider_settlement_v1','transactionIsolation','read_committed_only',
    'settlementPolicy','separate_scoped_admin_capture_v1','effectsPolicy','canonical_verification_outbox_admin_v2',
    'eligibilityPolicy','reviewed_lineage_no_new_facts_v1','historicalAdoption',false);
end
$authority$;

do $acl$
declare p record;
begin
  for p in select oid from pg_proc where pronamespace='public'::regnamespace and (proname like 'research_assisted_order_provider_%' or proname='research_assisted_order_financial_eligibility') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',p.oid::regprocedure);
    if p.oid=any(public.research_assisted_order_provider_settlement_rpc_oids()) then
      execute format('grant execute on function %s to service_role',p.oid::regprocedure);end if;
  end loop;
end
$acl$;

$install$;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  select count(*) into installed from pg_class where relnamespace='public'::regnamespace and relname=any(array[
    'research_assisted_order_provider_settlement_policies','research_assisted_order_provider_settlement_grants','research_assisted_order_provider_settlements']);
  if installed not in (0,3) then raise exception 'Partial settlement schema requires reconciliation' using errcode='55000';end if;
  if installed=3 then
    execute fingerprint_sql into fingerprint;
    seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
    if seal is distinct from 'ADP03_SCHEMA_V1:'||predecessor_definition||':'||
      encode(extensions.digest(convert_to(replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')||':'||fingerprint then
      raise exception 'Settlement definition or schema drift' using errcode='55000';end if;
    perform public.research_assisted_order_provider_settlement_integrity();return;
  end if;
  if public.research_assisted_order_provider_execution_authority() is distinct from jsonb_build_object(
    'schemaVersion','assisted_order_provider_execution_v1','transactionIsolation','read_committed_only','dispatchTiming','database_budget_monotonic_v1',
    'durableCreateOwnership',true,'providerIdentityBinding','write_once','settlementEnabled',false,'refundEnabled',false,'liveExecutionEnabled',false) then
    raise exception 'Exact timing-qualified ADP02 predecessor required' using errcode='55000';end if;
  seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
  if seal is distinct from 'ADP02_SCHEMA_V1:f52a30e40557294dfac4bb5775b3f9c2c8983ae8e275a07a1b3e9cedab33fa53:'||predecessor_definition||':'||public.research_assisted_order_provider_schema_fingerprint() then
    raise exception 'Exact final ADP02 definition required' using errcode='55000';end if;
  execute install_sql;
  execute format('create or replace function public.research_assisted_order_provider_schema_fingerprint() returns text language sql stable security definer set search_path=%L as %L','',fingerprint_sql);
  revoke all on function public.research_assisted_order_provider_schema_fingerprint() from public,anon,authenticated,service_role;
  execute fingerprint_sql into fingerprint;
  execute format('comment on table public.research_assisted_order_provider_fence is %L','ADP03_SCHEMA_V1:'||predecessor_definition||':'||
    encode(extensions.digest(convert_to(replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')||':'||fingerprint);
  perform public.research_assisted_order_provider_settlement_integrity();
end
$migration$;
commit;
