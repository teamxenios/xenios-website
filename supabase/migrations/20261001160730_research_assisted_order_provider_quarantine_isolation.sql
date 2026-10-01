-- ADP-G1 bounded source-exposure isolation. PENDING, local-source only.
-- Fixes the demonstrated platform-wide manual-order freeze. This is NOT
-- exact-event attribution, quarantine dismissal, G2-G4 resolution or activation.
-- Same-source provider-exposed orders remain conservatively held until a
-- separately governed evidence-backed reconciliation can establish attribution.
-- No original event, verification, price, source, grant or historical notice is
-- changed. No live adapter, processor assumption, refund or financial fact.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local search_path='';

do $migration$
declare installed integer;fingerprint text;seal text;
  predecessor_definition constant text := '1edd550f2f2362501f9357aa6f7bdef9c51634fc3377c2efcdffbc45df24715b';
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
-- A source is an immutable unique (provider namespace, account, mode) identity.
-- Quarantine is not money evidence. Preserve every event and classification.
-- Unknown events may constrain that source's actual/prospective provider
-- exposure, never arbitrary manual-only orders named by untrusted metadata.
create function public.research_assisted_order_provider_source_quarantine_held(p_source_id text)
returns boolean language sql security definer set search_path='' as $source_quarantine$
  select p_source_id is null or exists(
    select 1 from public.research_assisted_order_provider_event_journal j
    where j.source_id=p_source_id and j.established_request_id is null);
$source_quarantine$;

-- Historical exposure survives revoked source/grants, expired leases and
-- terminal orders. Do not infer exposure from claimedRequestId or equal totals.
-- Callers hold request then fence and require READ COMMITTED before using this.
create function public.research_assisted_order_provider_request_quarantine_held(p_request_id uuid)
returns boolean language sql security definer set search_path='' as $request_quarantine$
  select p_request_id is null or exists(
    select 1 from public.research_assisted_order_provider_attempts a
    join public.research_assisted_order_provider_event_journal j on j.source_id=a.source_id
    where a.request_id=p_request_id and j.established_request_id is null);
$request_quarantine$;

create index research_assisted_order_provider_journal_source_unbound_idx
  on public.research_assisted_order_provider_event_journal(source_id)
  where established_request_id is null;

create or replace function public.research_assisted_order_provider_uncertainty(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $uncertainty$
declare reason text;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  perform 1 from public.research_assisted_order_requests where id=p_request_id for update;
  if not found then return null;end if;
  perform 1 from public.research_assisted_order_provider_fence where id for share;
  if not found then raise exception 'Provider fence unavailable' using errcode='55000';end if;
  if public.research_assisted_order_provider_request_quarantine_held(p_request_id) then
    reason:='provider_unbound_event_held';
  elsif exists(select 1 from public.research_assisted_order_provider_attempts where request_id=p_request_id)
    or exists(select 1 from public.research_assisted_order_provider_event_journal where established_request_id=p_request_id) then
    reason:='provider_attempt_held';
  end if;
  return jsonb_build_object('schemaVersion','assisted_order_provider_uncertainty_v1','requestId',p_request_id,'held',reason is not null,'reason',reason);
end
$uncertainty$;

create or replace function public.research_assisted_order_provider_attempt_guard()
returns trigger language plpgsql security definer set search_path='' as $attempt_guard$
declare r public.research_assisted_order_requests%rowtype; q public.research_assisted_order_quotes%rowtype;
  s public.research_assisted_order_provider_sources%rowtype;
  label text;
begin
  select * into r from public.research_assisted_order_requests where id=new.request_id for update;
  if not found then raise exception 'Request not found' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_RESERVATION_REFUSED';end if;
  perform public.research_assisted_order_provider_assert_clear(r.id);
  -- Check prospective exposure before the attempt exists. Refusal inserts no
  -- reservation and therefore cannot strand a previously manual-only order.
  if public.research_assisted_order_provider_source_quarantine_held(new.source_id) then
    raise exception 'Configured provider source has unresolved quarantine'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_UNCERTAINTY_HELD';end if;
  select * into s from public.research_assisted_order_provider_sources where source_id=new.source_id and revoked_at is null for share;
  if not found or public.research_assisted_order_provider_scope_valid(new.expected_scope,s,new.adapter_revision) is not true then
    raise exception 'Exact configured source scope is unavailable' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SOURCE_REQUIRED';end if;
  select actor_label into label from public.research_assisted_order_provider_source_grants
    where source_id=new.source_id and auth_user_id=new.actor_auth_user_id and revoked_at is null for share;
  if not found or new.actor_label is distinct from label then
    raise exception 'Named scoped reservation grant required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_GRANT_REQUIRED';end if;
  select * into q from public.research_assisted_order_quotes where id=new.quote_id;
  if not found or q.request_id is distinct from r.id or q.state is distinct from 'accepted'
    or q.version is distinct from new.quote_version or q.acceptance_id is distinct from new.acceptance_id
    or q.total_cents is distinct from new.expected_amount_cents or q.currency is distinct from new.currency
    or new.state is distinct from 'held' or new.reserved_at is null or not isfinite(new.reserved_at)
    or new.reserved_at>clock_timestamp() or new.reserved_at<date_trunc('milliseconds',q.accepted_at)
    or r.status not in ('reviewing','payment_pending','payment_review')
    or exists(select 1 from public.research_assisted_order_quotes where request_id=r.id and version>q.version)
    or exists(select 1 from public.research_assisted_order_payment_observations where request_id=r.id)
    or exists(select 1 from public.research_assisted_order_evidence_claims where request_id=r.id)
    or exists(select 1 from public.research_assisted_order_payment_verifications where request_id=r.id)
    or exists(select 1 from public.research_assisted_order_events where request_id=r.id and status='paid')
    or exists(select 1 from public.research_assisted_order_financial_dispositions where request_id=r.id) then
    raise exception 'Exact accepted quote and unresolved-free request required'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_RESERVATION_REFUSED';end if;
  return new;
end
$attempt_guard$;

create or replace function public.research_assisted_order_provider_create_context(
  p_request_id uuid,p_attempt_id uuid,p_source_id text,p_adapter_revision text,p_expected_scope jsonb,
  p_policy_revision text,p_actor_auth_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $context$
declare a public.research_assisted_order_provider_attempts%rowtype;
  r public.research_assisted_order_requests%rowtype;q public.research_assisted_order_quotes%rowtype;
  s public.research_assisted_order_provider_sources%rowtype;p public.research_assisted_order_provider_create_policies%rowtype;
  first_claim public.research_assisted_order_provider_create_claims%rowtype;
  last_claim public.research_assisted_order_provider_create_claims%rowtype;
  payment_id text;session_id text;next_action text;stamp timestamptz;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  perform public.research_assisted_order_provider_execution_integrity();
  select * into r from public.research_assisted_order_requests where id=p_request_id for update;
  if not found then return null;end if;
  select * into a from public.research_assisted_order_provider_attempts where id=p_attempt_id and request_id=r.id;
  if not found then return null;end if;
  perform 1 from public.research_assisted_order_provider_fence where id for share;
  if not found then raise exception 'Provider fence unavailable' using errcode='55000';end if;
  select * into s from public.research_assisted_order_provider_sources where source_id=p_source_id and revoked_at is null for share;
  if not found or public.research_assisted_order_provider_scope_valid(p_expected_scope,s,p_adapter_revision) is not true
    or a.source_id is distinct from p_source_id or a.adapter_revision is distinct from p_adapter_revision
    or a.expected_scope is distinct from p_expected_scope then
    raise exception 'Configured execution source unavailable' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_SOURCE_REQUIRED';end if;
  select * into p from public.research_assisted_order_provider_create_policies where source_id=p_source_id
    and policy_revision=p_policy_revision and revoked_at is null for share;
  if not found then raise exception 'Explicit replay policy required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_POLICY_REQUIRED';end if;
  perform 1 from public.research_assisted_order_provider_execution_grants where source_id=p_source_id
    and auth_user_id=p_actor_auth_user_id and revoked_at is null for share;
  if not found then raise exception 'Separate scoped execution grant required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_GRANT_REQUIRED';end if;
  select * into q from public.research_assisted_order_quotes where id=a.quote_id;
  if not found or q.request_id is distinct from r.id or q.state is distinct from 'accepted'
    or q.version is distinct from a.quote_version or q.acceptance_id is distinct from a.acceptance_id
    or q.total_cents is distinct from a.expected_amount_cents or q.currency is distinct from a.currency then
    raise exception 'Accepted quote binding unavailable' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_HELD';end if;
  select * into first_claim from public.research_assisted_order_provider_create_claims where attempt_id=a.id order by sequence limit 1;
  select * into last_claim from public.research_assisted_order_provider_create_claims where attempt_id=a.id order by sequence desc limit 1;
  select provider_identity into payment_id from public.research_assisted_order_provider_identity_bindings where attempt_id=a.id and binding_kind='payment';
  select provider_identity into session_id from public.research_assisted_order_provider_identity_bindings where attempt_id=a.id and binding_kind='session';
  stamp:=date_trunc('milliseconds',clock_timestamp());
  if last_claim.id is not null and stamp<last_claim.lease_expires_at then next_action:='wait';
  elsif payment_id is not null then next_action:='retrieve';
  elsif r.status not in ('reviewing','payment_pending','payment_review')
    or exists(select 1 from public.research_assisted_order_quotes where request_id=r.id and version>q.version)
    or exists(select 1 from public.research_assisted_order_payment_observations where request_id=r.id)
    or exists(select 1 from public.research_assisted_order_evidence_claims where request_id=r.id)
    or exists(select 1 from public.research_assisted_order_payment_verifications where request_id=r.id)
    or exists(select 1 from public.research_assisted_order_events where request_id=r.id and status='paid')
    or exists(select 1 from public.research_assisted_order_financial_dispositions where request_id=r.id)
    or (public.research_assisted_order_provider_request_quarantine_held(r.id)
      or exists(select 1 from public.research_assisted_order_provider_event_journal where established_request_id=r.id))
    or exists(select 1 from public.research_assisted_order_provider_create_results x join public.research_assisted_order_provider_create_claims c
      on c.id=x.claim_id where c.attempt_id=a.id and x.classification='conflict')
    or (first_claim.id is not null and (stamp<first_claim.creation_started_at or stamp>=first_claim.creation_replay_until))
    then next_action:='reconciliation_required';
  else next_action:='create';end if;
  return jsonb_build_object('schemaVersion','assisted_order_provider_execution_context_v1',
    'requestId',r.id,'attemptId',a.id,'sourceId',a.source_id,'adapterRevision',a.adapter_revision,'scope',a.expected_scope,
    'policyRevision',p.policy_revision,'replayGuarantee',p.replay_guarantee,'createReplaySeconds',p.create_replay_seconds,
    'quoteId',a.quote_id,'quoteVersion',a.quote_version,'acceptanceId',a.acceptance_id,
    'expectedAmountCents',a.expected_amount_cents,'currency',a.currency,
    'creationKey',encode(extensions.digest(convert_to('assisted-provider-create:v1:'||a.id::text,'UTF8'),'sha256'),'hex'),
    'creationStartedAt',public.research_assisted_order_provider_execution_iso(first_claim.creation_started_at),
    'creationReplayUntil',public.research_assisted_order_provider_execution_iso(first_claim.creation_replay_until),
    'providerPaymentId',payment_id,'providerSessionId',session_id,'state','held','nextAction',next_action,
    'claimId',last_claim.id,'leaseExpiresAt',public.research_assisted_order_provider_execution_iso(last_claim.lease_expires_at));
end
$context$;

create or replace function public.research_assisted_order_provider_settlement_guard()
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
    or public.research_assisted_order_provider_request_quarantine_held(r.id)
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

create or replace function public.research_assisted_order_financial_eligibility(p_request_id uuid)
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
  if public.research_assisted_order_provider_request_quarantine_held(p_request_id) then reason:='provider_uncertainty_held';
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

create or replace function public.research_assisted_order_provider_settlement_row_allowed(p_table text,p_row jsonb)
returns boolean language plpgsql security definer set search_path='' as $allowed$
declare s public.research_assisted_order_provider_settlements%rowtype;
begin
  select * into s from public.research_assisted_order_provider_settlements where request_id=(p_row->>'request_id')::uuid;
  if not found then return false;end if;
  if public.research_assisted_order_provider_request_quarantine_held(s.request_id)
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
          and not public.research_assisted_order_provider_request_quarantine_held(new.id)
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

create or replace function public.research_assisted_order_provider_settlement_integrity()
returns void language plpgsql stable security definer set search_path='' as $integrity$
declare seal text;p record;permitted boolean;role_name text;t record;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
  if seal is null or seal !~ '^ADP04Q_SCHEMA_V1:1edd550f2f2362501f9357aa6f7bdef9c51634fc3377c2efcdffbc45df24715b:[0-9a-f]{64}:[0-9a-f]{64}$'
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
-- Helpers are internal, including under permissive managed default ACLs.
revoke all on function public.research_assisted_order_provider_source_quarantine_held(text) from public,anon,authenticated,service_role;
revoke all on function public.research_assisted_order_provider_request_quarantine_held(uuid) from public,anon,authenticated,service_role;
$install$;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  installed:=(case when to_regprocedure('public.research_assisted_order_provider_source_quarantine_held(text)') is null then 0 else 1 end)
    +(case when to_regprocedure('public.research_assisted_order_provider_request_quarantine_held(uuid)') is null then 0 else 1 end)
    +(case when to_regclass('public.research_assisted_order_provider_journal_source_unbound_idx') is null then 0 else 1 end);
  if installed not in(0,3) then
    raise exception 'Partial quarantine isolation schema requires reconciliation' using errcode='55000';end if;
  if installed=3 then
    execute fingerprint_sql into fingerprint;
    seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
    if seal is distinct from 'ADP04Q_SCHEMA_V1:'||predecessor_definition||':'||
      encode(extensions.digest(convert_to(replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')||':'||fingerprint then
      raise exception 'Quarantine isolation definition or schema drift' using errcode='55000';end if;
    perform public.research_assisted_order_provider_settlement_integrity();return;
  end if;
  -- Validate the complete exact predecessor before changing a function OID or
  -- body. Old migration replays after this successor must fail, not downgrade.
  perform public.research_assisted_order_provider_settlement_integrity();
  seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
  if seal is distinct from 'ADP03_SCHEMA_V1:5a59a6d48cf40faa74f8b971d4abc43d1e65f5896d42843fc2bf362dfde36430:'||
    predecessor_definition||':'||public.research_assisted_order_provider_schema_fingerprint() then
    raise exception 'Exact final ADP03 predecessor required' using errcode='55000';end if;
  execute install_sql;
  execute format('create or replace function public.research_assisted_order_provider_schema_fingerprint() returns text language sql stable security definer set search_path=%L as %L','',fingerprint_sql);
  revoke all on function public.research_assisted_order_provider_schema_fingerprint() from public,anon,authenticated,service_role;
  execute fingerprint_sql into fingerprint;
  execute format('comment on table public.research_assisted_order_provider_fence is %L','ADP04Q_SCHEMA_V1:'||predecessor_definition||':'||
    encode(extensions.digest(convert_to(replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')||':'||fingerprint);
  perform public.research_assisted_order_provider_settlement_integrity();
end
$migration$;
commit;
