-- ADP-02, PENDING/local-source only. Exact predecessor: ADP01 v2 (20261001085559).
-- Durable create ownership, late response retention and external identity binding.
-- No transport is called by SQL. Normalized service-role JSON is NOT independent
-- provider authentication or settlement proof. Attempts and all money stay HELD.
-- No policies, execution grants, dispatch claims or historical facts are seeded.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local search_path='';

do $migration$
declare installed boolean; object_count integer; fingerprint text; seal text;
  fingerprint_sql text := $fingerprint_query$
select encode(extensions.digest(convert_to(jsonb_build_object(
  'functions',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),
    p.proowner::regrole::text,p.proacl::text) order by p.oid::regprocedure::text)
    from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'research_assisted_order_%'),
  'relations',(select jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
    c.relowner::regrole::text,c.relacl::text) order by c.relname) from pg_class c
    where c.relnamespace='public'::regnamespace and c.relname like 'research_assisted_order_provider_%'),
  'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),
    a.attnotnull,a.attgenerated,a.attidentity,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum)
    from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where c.relnamespace='public'::regnamespace and c.relname like 'research_assisted_order_provider_%'),
  'constraints',(select jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid,true),k.convalidated)
    order by c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid
    where c.relnamespace='public'::regnamespace and c.relname like 'research_assisted_order_provider_%'),
  'indexes',(select jsonb_agg(jsonb_build_array(c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready)
    order by c.relname,i.indexrelid::regclass::text) from pg_index i join pg_class c on c.oid=i.indrelid
    where c.relnamespace='public'::regnamespace and c.relname like 'research_assisted_order_provider_%'),
  'triggers',(select jsonb_agg(jsonb_build_array(t.tgrelid::regclass::text,t.tgname,pg_get_triggerdef(t.oid,true),t.tgenabled)
    order by t.tgrelid::regclass::text,t.tgname) from pg_trigger t where not t.tgisinternal
    and (t.tgname like '%adp0%' or t.tgname like '%hl12%' or t.tgrelid in(select c.oid from pg_class c
      where c.relnamespace='public'::regnamespace and c.relname like 'research_assisted_order_%'))),
  'policies',(select jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname) from pg_policies p
    where p.schemaname='public' and p.tablename like 'research_assisted_order_provider_%')
)::text,'UTF8'),'sha256'),'hex');
$fingerprint_query$;
  install_sql text := $install$

create table public.research_assisted_order_provider_create_policies (
  source_id text primary key references public.research_assisted_order_provider_sources(source_id) on update restrict on delete restrict,
  policy_revision text not null check(policy_revision ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  replay_guarantee text not null check(replay_guarantee='same_key_same_body'),
  -- This is an engineering ceiling, not a default provider guarantee.
  create_replay_seconds integer not null check(create_replay_seconds between 1 and 86400),
  lease_ms integer not null check(lease_ms between 1000 and 300000 and lease_ms<=create_replay_seconds*1000),
  granted_by text not null,
  created_at timestamptz not null default date_trunc('milliseconds',clock_timestamp()),
  revoked_at timestamptz
);
create table public.research_assisted_order_provider_execution_grants (
  source_id text not null references public.research_assisted_order_provider_sources(source_id) on update restrict on delete restrict,
  auth_user_id uuid not null,
  actor_label text not null,
  granted_by text not null,
  granted_at timestamptz not null default date_trunc('milliseconds',clock_timestamp()),
  revoked_at timestamptz,
  primary key(source_id,auth_user_id)
);
create table public.research_assisted_order_provider_create_claims (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.research_assisted_order_provider_attempts(id) on update restrict on delete restrict,
  request_id uuid not null references public.research_assisted_order_requests(id) on update restrict on delete restrict,
  source_id text not null references public.research_assisted_order_provider_sources(source_id) on update restrict on delete restrict,
  actor_auth_user_id uuid not null,
  actor_label text not null,
  policy_revision text not null,
  claim_key uuid not null unique,
  sequence integer not null check(sequence>0),
  action text not null check(action in ('create','retrieve')),
  creation_key text not null check(creation_key ~ '^[0-9a-f]{64}$'),
  request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
  creation_started_at timestamptz not null,
  creation_replay_until timestamptz not null,
  claimed_at timestamptz not null,
  lease_expires_at timestamptz not null,
  unique(attempt_id,sequence),
  check(creation_replay_until>creation_started_at and lease_expires_at>claimed_at)
);
create table public.research_assisted_order_provider_create_results (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.research_assisted_order_provider_create_claims(id) on update restrict on delete restrict,
  result jsonb not null,
  result_fingerprint text not null check(result_fingerprint ~ '^[0-9a-f]{64}$'),
  classification text not null check(classification in ('bound','unknown','conflict')),
  reason text not null check(reason in ('exact_binding','transport_uncertain','invalid_response','binding_mismatch',
    'provider_identity_conflict','response_conflict')),
  recorded_at timestamptz not null,
  unique(claim_id,result_fingerprint)
);
create table public.research_assisted_order_provider_identity_bindings (
  attempt_id uuid not null references public.research_assisted_order_provider_attempts(id) on update restrict on delete restrict,
  source_id text not null references public.research_assisted_order_provider_sources(source_id) on update restrict on delete restrict,
  binding_kind text not null check(binding_kind in ('payment','session')),
  provider_identity text not null,
  result_id uuid not null references public.research_assisted_order_provider_create_results(id) on update restrict on delete restrict,
  bound_at timestamptz not null,
  primary key(attempt_id,binding_kind),
  unique(source_id,binding_kind,provider_identity)
);
create index research_assisted_order_provider_create_result_claim_idx
  on public.research_assisted_order_provider_create_results(claim_id,recorded_at,id);

create function public.research_assisted_order_provider_execution_config_guard()
returns trigger language plpgsql set search_path='' as $config$
declare stamp timestamptz;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  if not exists(select 1 from public.research_assisted_order_provider_sources where source_id=new.source_id
    and public.research_assisted_order_disposition_text_valid(account_ref,160)
    and adapter_revision ~ '^[a-z0-9][a-z0-9._-]{0,79}$') then
    raise exception 'Exact supported execution source required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_SOURCE_REQUIRED';end if;
  if tg_op='UPDATE' and (old.revoked_at is not null or new.revoked_at is null
    or (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at')) then
    raise exception 'Execution configuration is immutable except first revocation'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_IMMUTABLE';end if;
  if public.research_assisted_order_disposition_text_valid(new.granted_by,512) is not true then
    raise exception 'Named execution authority required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_GRANT_REQUIRED';end if;
  if tg_table_name='research_assisted_order_provider_create_policies' then stamp:=new.created_at;
  else
    stamp:=new.granted_at;
    if public.research_assisted_order_disposition_text_valid(new.actor_label,512) is not true then
      raise exception 'Named execution actor required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_GRANT_REQUIRED';end if;
  end if;
  if stamp is null or not isfinite(stamp) or stamp>clock_timestamp()
    or (new.revoked_at is not null and (not isfinite(new.revoked_at) or new.revoked_at<stamp or new.revoked_at>clock_timestamp())) then
    raise exception 'Invalid execution authority time' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_GRANT_REQUIRED';end if;
  return new;
end
$config$;

create function public.research_assisted_order_provider_execution_iso(t timestamptz)
returns text language sql immutable set search_path='' as $iso$
  select to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$iso$;

-- Caller and trigger both use this one request-first locked view. This is NOT
-- provider_assert_clear: it admits only the request's own reservation for
-- dispatch, without weakening any financial/cancellation/no-funds guard.
create function public.research_assisted_order_provider_create_context(
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
    or exists(select 1 from public.research_assisted_order_provider_event_journal where established_request_id is null or established_request_id=r.id)
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

create function public.research_assisted_order_provider_create_claim_guard()
returns trigger language plpgsql security definer set search_path='' as $claim_guard$
declare a public.research_assisted_order_provider_attempts%rowtype;c jsonb;
  p public.research_assisted_order_provider_create_policies%rowtype;stamp timestamptz;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  if new.sequence is not null or new.action is not null or new.creation_key is not null
    or new.request_fingerprint is not null or new.creation_started_at is not null or new.creation_replay_until is not null
    or new.claimed_at is not null or new.lease_expires_at is not null or new.actor_label is not null then
    raise exception 'Dispatch facts must be generated by authority' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_CLAIM_REFUSED';end if;
  select * into a from public.research_assisted_order_provider_attempts where id=new.attempt_id;
  if not found or new.request_id is distinct from a.request_id or new.source_id is distinct from a.source_id or new.claim_key is null then
    raise exception 'Exact held attempt required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_CLAIM_REFUSED';end if;
  c:=public.research_assisted_order_provider_create_context(a.request_id,a.id,a.source_id,a.adapter_revision,a.expected_scope,new.policy_revision,new.actor_auth_user_id);
  if c is null or c->>'nextAction' not in ('create','retrieve') then
    raise exception 'Create ownership is not available' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_HELD';end if;
  select * into strict p from public.research_assisted_order_provider_create_policies where source_id=a.source_id;
  stamp:=date_trunc('milliseconds',clock_timestamp());
  new.sequence:=coalesce((select max(sequence) from public.research_assisted_order_provider_create_claims where attempt_id=a.id),0)+1;
  new.action:=c->>'nextAction';new.creation_key:=c->>'creationKey';
  new.creation_started_at:=coalesce((c->>'creationStartedAt')::timestamptz,stamp);
  new.creation_replay_until:=coalesce((c->>'creationReplayUntil')::timestamptz,stamp+make_interval(secs=>p.create_replay_seconds));
  new.claimed_at:=stamp;
  new.lease_expires_at:=stamp+p.lease_ms*interval '1 millisecond';
  if new.action='create' then
    new.lease_expires_at:=least(new.lease_expires_at,new.creation_replay_until);
    if stamp<new.creation_started_at or stamp>=new.creation_replay_until then
      raise exception 'Creation guarantee has expired' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_HELD';end if;
  end if;
  new.request_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
    'requestId',a.request_id,'attemptId',a.id,'quoteId',a.quote_id,'quoteVersion',a.quote_version,
    'acceptanceId',a.acceptance_id,'canonicalOrderId',null,'amountCents',a.expected_amount_cents,'currency',a.currency,
    'scope',a.expected_scope,'adapterRevision',a.adapter_revision,'policyRevision',new.policy_revision,
    'creationKey',new.creation_key)::text,'UTF8'),'sha256'),'hex');
  select actor_label into strict new.actor_label from public.research_assisted_order_provider_execution_grants
    where source_id=a.source_id and auth_user_id=new.actor_auth_user_id and revoked_at is null;
  return new;
end
$claim_guard$;

create function public.research_assisted_order_provider_create_claim(
  p_request_id uuid,p_attempt_id uuid,p_source_id text,p_adapter_revision text,p_expected_scope jsonb,
  p_policy_revision text,p_actor_auth_user_id uuid,p_claim_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $claim$
declare c jsonb;previous public.research_assisted_order_provider_create_claims%rowtype;
  claimed public.research_assisted_order_provider_create_claims%rowtype;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  c:=public.research_assisted_order_provider_create_context(p_request_id,p_attempt_id,p_source_id,p_adapter_revision,p_expected_scope,p_policy_revision,p_actor_auth_user_id);
  if c is null then return null;end if;
  if p_claim_key is null then raise exception 'Server claim identity required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_CLAIM_REFUSED';end if;
  select * into previous from public.research_assisted_order_provider_create_claims where claim_key=p_claim_key;
  if found then
    if previous.attempt_id is distinct from p_attempt_id or previous.request_id is distinct from p_request_id
      or previous.source_id is distinct from p_source_id or previous.policy_revision is distinct from p_policy_revision
      or previous.actor_auth_user_id is distinct from p_actor_auth_user_id then
      raise exception 'Claim replay conflicts' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_REPLAY_CONFLICT';end if;
    -- RPC replay is an immutable receipt, not another dispatch permission.
    return c||jsonb_build_object('authorized',false,'replayed',true,'claimIssuedAt',null,'dispatchBudgetMs',0);
  end if;
  if c->>'nextAction' not in ('create','retrieve') then
    return c||jsonb_build_object('authorized',false,'replayed',false,'claimIssuedAt',null,'dispatchBudgetMs',0);end if;
  insert into public.research_assisted_order_provider_create_claims(attempt_id,request_id,source_id,actor_auth_user_id,policy_revision,claim_key)
    values(p_attempt_id,p_request_id,p_source_id,p_actor_auth_user_id,p_policy_revision,p_claim_key) returning * into claimed;
  return c||jsonb_build_object('authorized',true,'replayed',false,'nextAction',claimed.action,'claimId',claimed.id,
    -- The client deducts monotonic elapsed time measured BEFORE this RPC. It
    -- must never derive a renewed dispatch budget from its local wall clock.
    'claimIssuedAt',public.research_assisted_order_provider_execution_iso(claimed.claimed_at),
    'dispatchBudgetMs',floor(extract(epoch from (
      least(claimed.lease_expires_at,case when claimed.action='create' then claimed.creation_replay_until
        else claimed.lease_expires_at end)-claimed.claimed_at))*1000)::bigint,
    'creationStartedAt',public.research_assisted_order_provider_execution_iso(claimed.creation_started_at),
    'creationReplayUntil',public.research_assisted_order_provider_execution_iso(claimed.creation_replay_until),
    'leaseExpiresAt',public.research_assisted_order_provider_execution_iso(claimed.lease_expires_at));
end
$claim$;

create function public.research_assisted_order_provider_create_result_validate(e jsonb)
returns void language plpgsql set search_path='' as $result_validate$
declare k text;
begin
  if e is null or jsonb_typeof(e) is distinct from 'object' then
    raise exception 'Closed normalized result required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
  if (select count(*) from jsonb_object_keys(e))<>16 or not e ?& array[
    'schemaVersion','outcome','reason','provider','accountId','mode','attemptId','requestId','quoteId','quoteVersion',
    'acceptanceId','observedAmountCents','currency','providerPaymentId','providerSessionId','state'] then
    raise exception 'Closed normalized result fields required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
  if e->>'schemaVersion' is distinct from 'assisted_order_provider_create_result_v1'
    or e->>'outcome' not in ('object','unknown') or jsonb_typeof(e->'outcome') is distinct from 'string' then
    raise exception 'Invalid normalized result type' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
  if e->>'outcome'='unknown' then
    if e->>'reason' not in ('transport_uncertain','invalid_response')
      or jsonb_typeof(e->'reason') is distinct from 'string'
      or exists(select 1 from jsonb_each(e) x where x.key not in ('schemaVersion','outcome','reason') and x.value<>'null'::jsonb) then
      raise exception 'Unknown result cannot carry invented facts' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
    return;
  end if;
  if e->>'reason' is distinct from 'object_received' then
    raise exception 'Object result reason invalid' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
  foreach k in array array['provider','accountId','providerPaymentId','currency','mode','state'] loop
    if jsonb_typeof(e->k) is distinct from 'string' or public.research_assisted_order_disposition_text_valid(e->>k,160) is not true then
      raise exception 'Invalid object text' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
  end loop;
  if e->>'provider' !~ '^[a-z0-9][a-z0-9._-]{0,79}$' or e->>'currency' !~ '^[A-Z]{3}$'
    or e->>'mode' not in ('test','live') or e->>'state' not in ('pending','authorized')
    or (e->'providerSessionId'<>'null'::jsonb and (jsonb_typeof(e->'providerSessionId') is distinct from 'string'
      or public.research_assisted_order_disposition_text_valid(e->>'providerSessionId',160) is not true)) then
    raise exception 'Invalid object identity or state' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
  foreach k in array array['attemptId','requestId','quoteId','acceptanceId'] loop
    if jsonb_typeof(e->k) is distinct from 'string' or e->>k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Invalid object binding' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
  end loop;
  if jsonb_typeof(e->'quoteVersion') is distinct from 'number' or e->>'quoteVersion' !~ '^[1-9][0-9]*$'
    or (e->>'quoteVersion')::numeric>2147483647
    or jsonb_typeof(e->'observedAmountCents') is distinct from 'number' or e->>'observedAmountCents' !~ '^[1-9][0-9]*$'
    or (e->>'observedAmountCents')::numeric>100000000 then
    raise exception 'Invalid exact object economics' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
end
$result_validate$;

-- Results carry an issued claim, not a current lease/grant. Losing ownership or
-- revoking a source cannot erase an external response already caused by a claim.
create function public.research_assisted_order_provider_create_result_guard()
returns trigger language plpgsql security definer set search_path='' as $result_guard$
declare c public.research_assisted_order_provider_create_claims%rowtype;
  a public.research_assisted_order_provider_attempts%rowtype;e jsonb;payment_id text;session_id text;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  perform public.research_assisted_order_provider_execution_integrity();
  perform public.research_assisted_order_provider_create_result_validate(new.result);
  if new.result_fingerprint is not null or new.classification is not null or new.reason is not null or new.recorded_at is not null then
    raise exception 'Result classification is server-derived' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
  select * into c from public.research_assisted_order_provider_create_claims where id=new.claim_id;
  if not found then raise exception 'Issued create claim required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_CLAIM_REFUSED';end if;
  perform 1 from public.research_assisted_order_requests where id=c.request_id for update;
  if not found then raise exception 'Claim request missing' using errcode='55000';end if;
  perform 1 from public.research_assisted_order_provider_fence where id for update;
  if not found then raise exception 'Provider fence unavailable' using errcode='55000';end if;
  select * into strict a from public.research_assisted_order_provider_attempts where id=c.attempt_id;
  new.result_fingerprint:=encode(extensions.digest(convert_to(new.result::text,'UTF8'),'sha256'),'hex');
  if exists(select 1 from public.research_assisted_order_provider_create_results where claim_id=c.id and result_fingerprint=new.result_fingerprint) then return null;end if;
  new.recorded_at:=date_trunc('milliseconds',clock_timestamp());
  select provider_identity into payment_id from public.research_assisted_order_provider_identity_bindings where attempt_id=a.id and binding_kind='payment';
  select provider_identity into session_id from public.research_assisted_order_provider_identity_bindings where attempt_id=a.id and binding_kind='session';
  e:=new.result;
  if e->>'outcome'='unknown' then
    new.classification:='unknown';new.reason:=e->>'reason';return new;
  end if;
  new.classification:='conflict';
  if e->>'provider' is distinct from a.expected_scope->>'provider' or e->>'accountId' is distinct from a.expected_scope->>'accountId'
    or e->>'mode' is distinct from a.expected_scope->>'mode' or (e->>'attemptId')::uuid is distinct from a.id
    or (e->>'requestId')::uuid is distinct from a.request_id or (e->>'quoteId')::uuid is distinct from a.quote_id
    or (e->>'quoteVersion')::integer is distinct from a.quote_version or (e->>'acceptanceId')::uuid is distinct from a.acceptance_id
    or (e->>'observedAmountCents')::bigint is distinct from a.expected_amount_cents or e->>'currency' is distinct from a.currency then
    new.reason:='binding_mismatch';
  elsif (payment_id is not null and payment_id is distinct from e->>'providerPaymentId')
    or (session_id is not null and session_id is distinct from e->>'providerSessionId') then new.reason:='response_conflict';
  elsif exists(select 1 from public.research_assisted_order_provider_identity_bindings b where b.source_id=a.source_id and b.attempt_id<>a.id
      and ((b.binding_kind='payment' and b.provider_identity=e->>'providerPaymentId')
        or (b.binding_kind='session' and b.provider_identity=e->>'providerSessionId')))
    or exists(select 1 from public.research_assisted_order_provider_event_journal j where j.source_id=a.source_id
      and (j.event->>'providerPaymentId'=e->>'providerPaymentId'
        or (e->>'providerSessionId' is not null and j.event->>'providerSessionId'=e->>'providerSessionId'))
      and j.established_attempt_id is distinct from a.id) then
    new.reason:='provider_identity_conflict';
  elsif exists(select 1 from public.research_assisted_order_provider_create_results x
      join public.research_assisted_order_provider_create_claims prior on prior.id=x.claim_id
      where prior.attempt_id=a.id and x.classification='conflict')
    or exists(select 1 from public.research_assisted_order_provider_event_journal j where j.established_attempt_id=a.id
      and ((j.event->>'providerPaymentId' is not null and j.event->>'providerPaymentId' is distinct from e->>'providerPaymentId')
        or (j.event->>'providerSessionId' is not null and j.event->>'providerSessionId' is distinct from e->>'providerSessionId'))) then
    new.reason:='response_conflict';
  else new.classification:='bound';new.reason:='exact_binding';end if;
  return new;
end
$result_guard$;

create function public.research_assisted_order_provider_identity_guard()
returns trigger language plpgsql security definer set search_path='' as $identity_guard$
declare x public.research_assisted_order_provider_create_results%rowtype;
  c public.research_assisted_order_provider_create_claims%rowtype;a public.research_assisted_order_provider_attempts%rowtype;expected text;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  select * into a from public.research_assisted_order_provider_attempts where id=new.attempt_id;
  if not found then raise exception 'Binding attempt missing' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
  perform 1 from public.research_assisted_order_requests where id=a.request_id for update;
  perform 1 from public.research_assisted_order_provider_fence where id for update;
  if not found then raise exception 'Provider fence unavailable' using errcode='55000';end if;
  select * into x from public.research_assisted_order_provider_create_results where id=new.result_id and classification='bound';
  if not found then raise exception 'Exact durable object receipt required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
  select * into strict c from public.research_assisted_order_provider_create_claims where id=x.claim_id;
  expected:=case new.binding_kind when 'payment' then x.result->>'providerPaymentId' when 'session' then x.result->>'providerSessionId' end;
  if c.attempt_id is distinct from a.id or new.source_id is distinct from a.source_id
    or expected is null or new.provider_identity is distinct from expected or new.bound_at is distinct from x.recorded_at
    or public.research_assisted_order_disposition_text_valid(new.provider_identity,160) is not true then
    raise exception 'External identity does not match its immutable object receipt' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
  if new.binding_kind='session' and not exists(select 1 from public.research_assisted_order_provider_identity_bindings
    where attempt_id=a.id and binding_kind='payment' and provider_identity=x.result->>'providerPaymentId') then
    raise exception 'Session requires its write-once payment binding' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_RESULT_INVALID';end if;
  return new;
end
$identity_guard$;

create function public.research_assisted_order_provider_create_result_bind()
returns trigger language plpgsql security definer set search_path='' as $result_bind$
declare c public.research_assisted_order_provider_create_claims%rowtype;k text;identity_value text;
begin
  if new.classification<>'bound' then return new;end if;
  select * into strict c from public.research_assisted_order_provider_create_claims where id=new.claim_id;
  foreach k in array array['payment','session'] loop
    identity_value:=new.result->>(case k when 'payment' then 'providerPaymentId' else 'providerSessionId' end);
    if identity_value is not null and not exists(select 1 from public.research_assisted_order_provider_identity_bindings where attempt_id=c.attempt_id and binding_kind=k) then
      insert into public.research_assisted_order_provider_identity_bindings(attempt_id,source_id,binding_kind,provider_identity,result_id,bound_at)
        values(c.attempt_id,c.source_id,k,identity_value,new.id,new.recorded_at);
    end if;
  end loop;
  return new;
end
$result_bind$;

create function public.research_assisted_order_provider_create_result_receipt(x public.research_assisted_order_provider_create_results,p_replayed boolean)
returns jsonb language sql stable security definer set search_path='' as $result_receipt$
  select jsonb_build_object('schemaVersion','assisted_order_provider_create_result_receipt_v1','resultId',x.id,
    'claimId',x.claim_id,'attemptId',c.attempt_id,'requestId',c.request_id,'state','held',
    'classification',x.classification,'reason',x.reason,
    'providerPaymentId',case when x.classification='bound' then x.result->>'providerPaymentId' end,
    'providerSessionId',case when x.classification='bound' then x.result->>'providerSessionId' end,
    'recordedAt',public.research_assisted_order_provider_execution_iso(x.recorded_at),'replayed',p_replayed)
  from public.research_assisted_order_provider_create_claims c where c.id=x.claim_id;
$result_receipt$;

create function public.research_assisted_order_provider_create_result_append(
  p_claim_id uuid,p_source_id text,p_adapter_revision text,p_expected_scope jsonb,p_policy_revision text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $append_result$
declare c public.research_assisted_order_provider_create_claims%rowtype;
  a public.research_assisted_order_provider_attempts%rowtype;x public.research_assisted_order_provider_create_results%rowtype;fingerprint text;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  perform public.research_assisted_order_provider_create_result_validate(p_result);
  select * into c from public.research_assisted_order_provider_create_claims where id=p_claim_id;
  if not found then raise exception 'Issued claim required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_CLAIM_REFUSED';end if;
  select * into strict a from public.research_assisted_order_provider_attempts where id=c.attempt_id;
  if a.source_id is distinct from p_source_id or a.adapter_revision is distinct from p_adapter_revision
    or a.expected_scope is distinct from p_expected_scope or c.policy_revision is distinct from p_policy_revision then
    raise exception 'Exact issued execution source required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EXECUTION_SOURCE_REQUIRED';end if;
  -- The INSERT guard coordinates all locks, including privileged direct writes.
  insert into public.research_assisted_order_provider_create_results(claim_id,result) values(p_claim_id,p_result) returning * into x;
  if found then return public.research_assisted_order_provider_create_result_receipt(x,false);end if;
  fingerprint:=encode(extensions.digest(convert_to(p_result::text,'UTF8'),'sha256'),'hex');
  select * into strict x from public.research_assisted_order_provider_create_results where claim_id=p_claim_id and result_fingerprint=fingerprint;
  return public.research_assisted_order_provider_create_result_receipt(x,true);
end
$append_result$;

-- Copy the exact attested classifier, then preserve its OID with a narrow
-- wrapper. Old immutable journal rows retain their original classification.
-- A matching webhook claim alone never creates a provider identity binding.
do $classifier$
declare definition text;
begin
  definition:=pg_get_functiondef('public.research_assisted_order_provider_event_classify(text,jsonb,uuid)'::regprocedure);
  definition:=replace(definition,'CREATE OR REPLACE FUNCTION public.research_assisted_order_provider_event_classify(',
    'CREATE FUNCTION public.research_assisted_order_provider_pre_execution_event_classify(');
  execute definition;
end
$classifier$;
create or replace function public.research_assisted_order_provider_event_classify(p_source_id text,e jsonb,p_locked_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $classify$
declare prior jsonb;payment_id text;session_id text;
begin
  prior:=public.research_assisted_order_provider_pre_execution_event_classify(p_source_id,e,p_locked_attempt_id);
  if p_locked_attempt_id is null then return prior;end if;
  select provider_identity into payment_id from public.research_assisted_order_provider_identity_bindings
    where attempt_id=p_locked_attempt_id and binding_kind='payment';
  select provider_identity into session_id from public.research_assisted_order_provider_identity_bindings
    where attempt_id=p_locked_attempt_id and binding_kind='session';
  if (payment_id is not null and payment_id is distinct from e->>'providerPaymentId')
    or (session_id is not null and session_id is distinct from e->>'providerSessionId')
    or exists(select 1 from public.research_assisted_order_provider_identity_bindings where source_id=p_source_id
      and attempt_id<>p_locked_attempt_id and ((binding_kind='payment' and provider_identity=e->>'providerPaymentId')
        or (binding_kind='session' and provider_identity=e->>'providerSessionId'))) then
    return jsonb_build_object('requestId',null,'attemptId',null,'classification','conflict','reason','payment_identity_conflict');
  end if;
  return prior;
end
$classify$;

do $guards$
declare t text;
begin
  foreach t in array array['research_assisted_order_provider_create_policies','research_assisted_order_provider_execution_grants',
    'research_assisted_order_provider_create_claims','research_assisted_order_provider_create_results','research_assisted_order_provider_identity_bindings'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('create trigger adp02_no_truncate before truncate on public.%I for each statement execute function public.research_assisted_order_provider_immutable()',t);
    execute format('alter table public.%I enable always trigger adp02_no_truncate',t);
    if t in ('research_assisted_order_provider_create_policies','research_assisted_order_provider_execution_grants') then
      execute format('create trigger adp02_config before insert or update on public.%I for each row execute function public.research_assisted_order_provider_execution_config_guard()',t);
      execute format('alter table public.%I enable always trigger adp02_config',t);
      execute format('create trigger adp02_immutable before delete on public.%I for each row execute function public.research_assisted_order_provider_immutable()',t);
    else
      execute format('create trigger adp02_immutable before update or delete on public.%I for each row execute function public.research_assisted_order_provider_immutable()',t);
    end if;
    execute format('alter table public.%I enable always trigger adp02_immutable',t);
  end loop;
end
$guards$;
create trigger adp02_claim before insert on public.research_assisted_order_provider_create_claims
  for each row execute function public.research_assisted_order_provider_create_claim_guard();
alter table public.research_assisted_order_provider_create_claims enable always trigger adp02_claim;
create trigger adp02_result before insert on public.research_assisted_order_provider_create_results
  for each row execute function public.research_assisted_order_provider_create_result_guard();
alter table public.research_assisted_order_provider_create_results enable always trigger adp02_result;
create trigger adp02_result_bind after insert on public.research_assisted_order_provider_create_results
  for each row execute function public.research_assisted_order_provider_create_result_bind();
alter table public.research_assisted_order_provider_create_results enable always trigger adp02_result_bind;
create trigger adp02_identity before insert on public.research_assisted_order_provider_identity_bindings
  for each row execute function public.research_assisted_order_provider_identity_guard();
alter table public.research_assisted_order_provider_identity_bindings enable always trigger adp02_identity;

create function public.research_assisted_order_provider_execution_integrity()
returns void language plpgsql stable security definer set search_path='' as $integrity$
declare seal text;p record;permitted boolean;role_name text;t record;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
  if seal is null or seal !~ '^ADP02_SCHEMA_V1:f52a30e40557294dfac4bb5775b3f9c2c8983ae8e275a07a1b3e9cedab33fa53:[0-9a-f]{64}:[0-9a-f]{64}$'
    or split_part(seal,':',4) is distinct from public.research_assisted_order_provider_schema_fingerprint()
    or not exists(select 1 from public.research_assisted_order_provider_fence where id)
    or exists(select 1 from public.research_assisted_order_payment_verifications where method='provider') then
    raise exception 'Provider execution schema requires reconciliation' using errcode='55000';end if;
  for p in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'research_assisted_order_provider_%' loop
    permitted:=p.oid=any(array[
      'public.research_assisted_order_provider_attempt_reserve(uuid,uuid,integer,uuid,text,text,jsonb,uuid,text)'::regprocedure,
      'public.research_assisted_order_provider_event_append(text,text,jsonb,jsonb)'::regprocedure,
      'public.research_assisted_order_provider_uncertainty(uuid)'::regprocedure,
      'public.research_assisted_order_provider_journal_authority()'::regprocedure,
      'public.research_assisted_order_provider_create_context(uuid,uuid,text,text,jsonb,text,uuid)'::regprocedure,
      'public.research_assisted_order_provider_create_claim(uuid,uuid,text,text,jsonb,text,uuid,uuid)'::regprocedure,
      'public.research_assisted_order_provider_create_result_append(uuid,text,text,jsonb,text,jsonb)'::regprocedure,
      'public.research_assisted_order_provider_execution_authority()'::regprocedure]::oid[]);
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,p.oid,'EXECUTE') is distinct from (permitted and role_name='service_role') then
        raise exception 'Provider execution function ACL drift' using errcode='55000';end if;
    end loop;
  end loop;
  for t in select oid from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p')
    and relname like 'research_assisted_order_provider_%' loop
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(role_name,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(role_name,t.oid,'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'Provider execution table ACL drift' using errcode='55000';end if;
    end loop;
  end loop;
end
$integrity$;

-- Existing journal callers keep their exact v2 held contract. Readiness now
-- attests the explicit successor definition chain, not an arbitrary rebaseline.
create or replace function public.research_assisted_order_provider_journal_authority()
returns jsonb language plpgsql stable security definer set search_path='' as $journal_authority$
begin
  perform public.research_assisted_order_provider_require_read_committed();
  perform public.research_assisted_order_provider_execution_integrity();
  return jsonb_build_object('schemaVersion','assisted_order_provider_journal_v2','transactionIsolation','read_committed_only',
    'settlementEnabled',false,'refundEnabled',false,'liveExecutionEnabled',false);
end
$journal_authority$;
create function public.research_assisted_order_provider_execution_authority()
returns jsonb language plpgsql stable security definer set search_path='' as $execution_authority$
begin
  perform public.research_assisted_order_provider_require_read_committed();
  perform public.research_assisted_order_provider_execution_integrity();
  return jsonb_build_object('schemaVersion','assisted_order_provider_execution_v1','transactionIsolation','read_committed_only',
    'dispatchTiming','database_budget_monotonic_v1',
    'durableCreateOwnership',true,'providerIdentityBinding','write_once','settlementEnabled',false,'refundEnabled',false,'liveExecutionEnabled',false);
end
$execution_authority$;

do $acl$
declare p record;permitted boolean;
begin
  for p in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'research_assisted_order_provider_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',p.oid::regprocedure);
    permitted:=p.oid=any(array[
      'public.research_assisted_order_provider_attempt_reserve(uuid,uuid,integer,uuid,text,text,jsonb,uuid,text)'::regprocedure,
      'public.research_assisted_order_provider_event_append(text,text,jsonb,jsonb)'::regprocedure,
      'public.research_assisted_order_provider_uncertainty(uuid)'::regprocedure,
      'public.research_assisted_order_provider_journal_authority()'::regprocedure,
      'public.research_assisted_order_provider_create_context(uuid,uuid,text,text,jsonb,text,uuid)'::regprocedure,
      'public.research_assisted_order_provider_create_claim(uuid,uuid,text,text,jsonb,text,uuid,uuid)'::regprocedure,
      'public.research_assisted_order_provider_create_result_append(uuid,text,text,jsonb,text,jsonb)'::regprocedure,
      'public.research_assisted_order_provider_execution_authority()'::regprocedure]::oid[]);
    if permitted then execute format('grant execute on function %s to service_role',p.oid::regprocedure);end if;
  end loop;
end
$acl$;
$install$;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  select count(*) into object_count from pg_class where relnamespace='public'::regnamespace and relname=any(array[
    'research_assisted_order_provider_create_policies','research_assisted_order_provider_execution_grants',
    'research_assisted_order_provider_create_claims','research_assisted_order_provider_create_results','research_assisted_order_provider_identity_bindings']);
  if object_count not in (0,5) then raise exception 'Partial provider execution schema requires reconciliation' using errcode='55000';end if;
  installed:=object_count=5;
  if installed then
    execute fingerprint_sql into fingerprint;
    seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
    if seal is distinct from 'ADP02_SCHEMA_V1:f52a30e40557294dfac4bb5775b3f9c2c8983ae8e275a07a1b3e9cedab33fa53:'||
      encode(extensions.digest(convert_to(replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')||':'||fingerprint then
      raise exception 'Provider execution definition or schema drift' using errcode='55000';end if;
    perform public.research_assisted_order_provider_execution_integrity();
    return;
  end if;
  -- First apply accepts ONLY the exact final-v2 predecessor, never old5809 or
  -- a self-consistent but different v2 definition. Full file bytes remain an
  -- external release-DAG check; the definition seal is not an owner-DDL defense.
  if public.research_assisted_order_provider_journal_authority() is distinct from jsonb_build_object(
    'schemaVersion','assisted_order_provider_journal_v2','transactionIsolation','read_committed_only',
    'settlementEnabled',false,'refundEnabled',false,'liveExecutionEnabled',false) then
    raise exception 'Exact journal v2 predecessor required' using errcode='55000';end if;
  seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
  if seal is distinct from 'ADP01_SCHEMA_V1:f52a30e40557294dfac4bb5775b3f9c2c8983ae8e275a07a1b3e9cedab33fa53:'||
    public.research_assisted_order_provider_schema_fingerprint() then
    raise exception 'Exact final ADP01 definition required' using errcode='55000';end if;
  execute install_sql;
  execute format('create or replace function public.research_assisted_order_provider_schema_fingerprint() returns text language sql stable security definer set search_path=%L as %L','',fingerprint_sql);
  revoke all on function public.research_assisted_order_provider_schema_fingerprint() from public,anon,authenticated,service_role;
  execute fingerprint_sql into fingerprint;
  execute format('comment on table public.research_assisted_order_provider_fence is %L',
    'ADP02_SCHEMA_V1:f52a30e40557294dfac4bb5775b3f9c2c8983ae8e275a07a1b3e9cedab33fa53:'||
    encode(extensions.digest(convert_to(replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')||':'||fingerprint);
  perform public.research_assisted_order_provider_execution_integrity();
end
$migration$;
commit;
