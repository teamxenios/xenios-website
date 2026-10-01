-- ADP-01, PENDING/local-source only. Predecessor: 20261001062651.
-- Durable HELD reservations and authenticated-adapter event quarantine ONLY.
-- SQL validates configured ingress, not external signatures. JSON supplied by
-- service_role is not proof of money. Sources and scoped admin grants install
-- empty. No provider execution, payment observation, verification, paid/refund,
-- notification, historical adoption or managed activation is introduced.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local search_path='';

-- Exact reapplication is read-only. A complete catalog seal is recorded only
-- after a successful fresh installation. Partial/preexisting/drifted objects
-- are not adopted or repaired by replay. The seal is a migration-integrity
-- check, not a defense against a database owner who can replace schema/code.
do $migration$
declare phase integer; installed boolean; object_count integer; fingerprint text; seal text;
  fingerprint_sql text := $fingerprint_query$
select encode(extensions.digest(convert_to(jsonb_build_object(
        'functions',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),
            p.proowner::regrole::text,p.proacl::text) order by p.oid::regprocedure::text)
          from pg_proc p where p.pronamespace='public'::regnamespace and
            p.proname like 'research_assisted_order_%'),
        'relations',(select jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
            c.relowner::regrole::text,c.relacl::text) order by c.relname)
          from pg_class c where c.relnamespace='public'::regnamespace and c.relname=any(array[
            'research_assisted_order_provider_sources','research_assisted_order_provider_source_grants',
            'research_assisted_order_provider_attempts','research_assisted_order_provider_event_journal','research_assisted_order_provider_fence'])),
        'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),
            a.attnotnull,a.attgenerated,a.attidentity,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum)
          from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
          left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
          where c.relnamespace='public'::regnamespace and c.relname=any(array[
            'research_assisted_order_provider_sources','research_assisted_order_provider_source_grants',
            'research_assisted_order_provider_attempts','research_assisted_order_provider_event_journal','research_assisted_order_provider_fence'])),
        'constraints',(select jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid,true),k.convalidated)
            order by c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid
          where c.relnamespace='public'::regnamespace and c.relname like 'research_assisted_order_provider_%'),
        'indexes',(select jsonb_agg(jsonb_build_array(c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready)
            order by c.relname,i.indexrelid::regclass::text) from pg_index i join pg_class c on c.oid=i.indrelid
          where c.relnamespace='public'::regnamespace and c.relname like 'research_assisted_order_provider_%'),
        'triggers',(select jsonb_agg(jsonb_build_array(t.tgrelid::regclass::text,t.tgname,pg_get_triggerdef(t.oid,true),t.tgenabled)
            order by t.tgrelid::regclass::text,t.tgname) from pg_trigger t
          where not t.tgisinternal and (t.tgname like '%adp01%' or t.tgname like '%hl12%' or t.tgrelid in(select c.oid from pg_class c
            where c.relnamespace='public'::regnamespace and c.relname like 'research_assisted_order_%'))),
        'policies',(select jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname) from pg_policies p
          where p.schemaname='public' and p.tablename like 'research_assisted_order_provider_%')
      )::text,'UTF8'),'sha256'),'hex');
$fingerprint_query$;
  install_sql text := $install$

do $preflight$
declare g record; n text;
begin
  foreach n in array array['research_assisted_order_provider_sources','research_assisted_order_provider_source_grants',
    'research_assisted_order_provider_attempts','research_assisted_order_provider_event_journal','research_assisted_order_provider_fence'] loop
    if to_regclass('public.'||n) is not null then
      raise exception 'Existing provider journal objects need explicit reconciliation' using errcode='55000';end if;
  end loop;
  if to_regprocedure('public.research_assisted_order_disposition_graph(uuid)') is null
    or to_regprocedure('public.research_assisted_order_disposition_commit_cancel(uuid,uuid,text,uuid,text,text,jsonb)') is null
    or to_regprocedure('public.research_assisted_order_financial_state(uuid)') is null
    or to_regprocedure('public.research_assisted_order_disposition_text_valid(text,integer)') is null then
    raise exception 'Provider journal requires the complete no-funds predecessor' using errcode='55000';end if;
  for g in select * from (values
    ('research_assisted_order_requests','hl12_history_progression','research_assisted_order_history_progression_guard()'),
    ('research_assisted_order_requests','hl12_observed_cancel','research_assisted_order_observed_cancel_guard()'),
    ('research_assisted_order_requests','aa_hl12_disposition_terminal','research_assisted_order_disposition_terminal_guard()'),
    ('research_assisted_order_quotes','hl12_quote_snapshot_immutable','research_assisted_order_quote_snapshot_guard()'),
    ('research_assisted_order_quotes','hl12_quote_snapshot_no_truncate','research_assisted_order_quote_snapshot_guard()'),
    ('research_assisted_order_payment_observations','hl12_provider_observation_hold','research_assisted_order_provider_payment_hold_guard()'),
    ('research_assisted_order_payment_verifications','hl12_provider_verification_hold','research_assisted_order_provider_payment_hold_guard()'),
    ('research_assisted_order_payment_observations','research_assisted_order_observation_immutable','research_assisted_order_financial_block_mutation()'),
    ('research_assisted_order_payment_verifications','research_assisted_order_verification_immutable','research_assisted_order_financial_block_mutation()'),
    ('research_assisted_order_evidence_claims','hl12_claim_immutable','research_assisted_order_financial_block_mutation()'),
    ('research_assisted_order_observation_corrections','hl12_correction_immutable','research_assisted_order_financial_block_mutation()'),
    ('research_assisted_order_no_funds_evidence','hl12_disposition_evidence','research_assisted_order_disposition_evidence_guard()'),
    ('research_assisted_order_financial_dispositions','hl12_disposition_capture','research_assisted_order_disposition_capture()'),
    ('research_assisted_order_events','research_assisted_order_events_append_only','research_assisted_order_events_block_mutation()'),
    ('research_assisted_order_payment_verifications','hl12_payment_effects_capture','research_assisted_order_payment_effects_capture()')
  ) x(relation_name,trigger_name,function_name) loop
    if not exists(select 1 from pg_trigger where tgrelid=to_regclass('public.'||g.relation_name)
      and tgname=g.trigger_name and tgfoid=to_regprocedure('public.'||g.function_name)
      and tgenabled in ('O','A') and not tgisinternal) then
      raise exception 'Provider journal predecessor trigger missing or ineffective' using errcode='55000';end if;
  end loop;
  if exists(select 1 from public.research_assisted_order_payment_verifications where method='provider') then
    raise exception 'Existing provider verification needs explicit reconciliation' using errcode='55000';end if;
end
$preflight$;

create table public.research_assisted_order_provider_sources (
  source_id text primary key check(source_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  provider_namespace text not null check(provider_namespace ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  account_ref text not null,
  mode text not null check(mode in ('test','live')),
  adapter_revision text not null,
  granted_by text not null,
  created_at timestamptz not null default date_trunc('milliseconds',clock_timestamp()),
  revoked_at timestamptz,
  unique(provider_namespace,account_ref,mode)
);
create table public.research_assisted_order_provider_source_grants (
  source_id text not null references public.research_assisted_order_provider_sources(source_id) on update restrict on delete restrict,
  auth_user_id uuid not null,
  actor_label text not null,
  granted_by text not null,
  granted_at timestamptz not null default date_trunc('milliseconds',clock_timestamp()),
  revoked_at timestamptz,
  primary key(source_id,auth_user_id)
);
-- A row lock, not a financial fact or queue. Bound decisions acquire their
-- request first and then SHARE this fence. Journal insertion exclusively locks
-- it. Unknown events lock ONLY the fence and never subsequently a request.
create table public.research_assisted_order_provider_fence (id boolean primary key check(id));
insert into public.research_assisted_order_provider_fence values(true);
create table public.research_assisted_order_provider_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.research_assisted_order_requests(id) on update restrict on delete restrict,
  quote_id uuid not null references public.research_assisted_order_quotes(id) on update restrict on delete restrict,
  quote_version integer not null check(quote_version>0),
  acceptance_id uuid not null,
  source_id text not null references public.research_assisted_order_provider_sources(source_id) on update restrict on delete restrict,
  adapter_revision text not null,
  expected_scope jsonb not null,
  actor_auth_user_id uuid not null,
  actor_label text not null,
  idempotency_key text not null unique check(idempotency_key ~ '^[0-9a-f]{64}$'),
  expected_amount_cents bigint not null check(expected_amount_cents between 1 and 100000000),
  currency text not null check(currency='USD'),
  state text not null default 'held' check(state='held'),
  reserved_at timestamptz not null default date_trunc('milliseconds',clock_timestamp())
);
create table public.research_assisted_order_provider_event_journal (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.research_assisted_order_provider_sources(source_id) on update restrict on delete restrict,
  adapter_revision text not null,
  expected_scope jsonb not null,
  event_identity text not null,
  event_fingerprint text not null check(event_fingerprint ~ '^[0-9a-f]{64}$'),
  event jsonb not null,
  established_request_id uuid references public.research_assisted_order_requests(id) on update restrict on delete restrict,
  established_attempt_id uuid references public.research_assisted_order_provider_attempts(id) on update restrict on delete restrict,
  classification text not null check(classification in ('bound','quarantined','conflict')),
  reason text not null check(reason in ('exact_binding','unknown_attempt','missing_event_identity','binding_mismatch',
    'amount_currency_mismatch','unsupported_financial_effect','terminal_request','event_identity_conflict','payment_identity_conflict','source_revoked')),
  state text not null default 'held' check(state='held'),
  received_at timestamptz not null,
  check((established_request_id is null)=(established_attempt_id is null)),
  unique(source_id,event_identity,event_fingerprint)
);
create index research_assisted_order_provider_journal_request_idx
  on public.research_assisted_order_provider_event_journal(established_request_id,received_at,id);
create index research_assisted_order_provider_journal_unknown_idx
  on public.research_assisted_order_provider_event_journal(id) where established_request_id is null;
create index research_assisted_order_provider_journal_payment_idx
  on public.research_assisted_order_provider_event_journal(source_id,(event->>'providerPaymentId'));

create function public.research_assisted_order_provider_immutable()
returns trigger language plpgsql set search_path='' as $immutable$
begin raise exception 'Provider records cannot be rewritten or removed'
  using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_IMMUTABLE';end
$immutable$;

create function public.research_assisted_order_provider_source_guard()
returns trigger language plpgsql set search_path='' as $source$
declare stamp timestamptz;
begin
  if tg_op='UPDATE' then
    if old.revoked_at is not null or new.revoked_at is null
      or (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') then
      raise exception 'Configured source identity is immutable; only first revocation is allowed'
        using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_IMMUTABLE';end if;
  end if;
  if public.research_assisted_order_disposition_text_valid(new.granted_by,512) is not true then
    raise exception 'Invalid named source authority' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SOURCE_REQUIRED';end if;
  if tg_table_name='research_assisted_order_provider_sources' then
    stamp:=new.created_at;
    if public.research_assisted_order_disposition_text_valid(new.account_ref,255) is not true
      or public.research_assisted_order_disposition_text_valid(new.adapter_revision,80) is not true then
      raise exception 'Invalid configured source' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SOURCE_REQUIRED';end if;
  else
    stamp:=new.granted_at;
    if public.research_assisted_order_disposition_text_valid(new.actor_label,512) is not true then
      raise exception 'Invalid grant actor' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_GRANT_REQUIRED';end if;
  end if;
  if stamp is null or not isfinite(stamp) or stamp>clock_timestamp()
    or (new.revoked_at is not null and (not isfinite(new.revoked_at) or new.revoked_at<stamp or new.revoked_at>clock_timestamp())) then
    raise exception 'Invalid source authority timestamp' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SOURCE_REQUIRED';end if;
  return new;
end
$source$;

create function public.research_assisted_order_provider_scope_valid(scope jsonb,s public.research_assisted_order_provider_sources,revision text)
returns boolean language sql immutable set search_path='' as $scope$
  select coalesce(jsonb_typeof(scope)='object' and scope=jsonb_build_object(
    'provider',s.provider_namespace,'accountId',s.account_ref,'mode',s.mode)
    and revision=s.adapter_revision,false);
$scope$;

-- The fence serializes READ COMMITTED decisions, whose individual queries see
-- the winning transaction's committed facts. Locks alone do not advance an
-- already-frozen REPEATABLE READ/SERIALIZABLE snapshot, including a mixed-
-- isolation caller. Refuse unsupported modes; never downgrade a transaction
-- or infer that a stale snapshot proves absence of provider activity.
create function public.research_assisted_order_provider_require_read_committed()
returns void language plpgsql set search_path='' as $isolation$
begin
  if current_setting('transaction_isolation') is distinct from 'read committed' then
    raise exception 'Provider financial authority requires a fresh READ COMMITTED transaction'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_TRANSACTION_ISOLATION_REQUIRED';
  end if;
end
$isolation$;

create function public.research_assisted_order_provider_uncertainty(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $uncertainty$
declare reason text;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  perform 1 from public.research_assisted_order_requests where id=p_request_id for update;
  if not found then return null;end if;
  perform 1 from public.research_assisted_order_provider_fence where id for share;
  if not found then raise exception 'Provider fence unavailable' using errcode='55000';end if;
  if exists(select 1 from public.research_assisted_order_provider_event_journal where established_request_id is null) then
    reason:='provider_unbound_event_held';
  elsif exists(select 1 from public.research_assisted_order_provider_attempts where request_id=p_request_id)
    or exists(select 1 from public.research_assisted_order_provider_event_journal where established_request_id=p_request_id) then
    reason:='provider_attempt_held';
  end if;
  return jsonb_build_object('schemaVersion','assisted_order_provider_uncertainty_v1','requestId',p_request_id,'held',reason is not null,'reason',reason);
end
$uncertainty$;
create function public.research_assisted_order_provider_assert_clear(p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $clear$
declare u jsonb;
begin
  u:=public.research_assisted_order_provider_uncertainty(p_request_id);
  if u is null or (u->>'held')::boolean is distinct from false then
    raise exception 'Provider evidence remains held; no financial absence or release may be inferred'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_UNCERTAINTY_HELD';end if;
end
$clear$;

create function public.research_assisted_order_provider_attempt_guard()
returns trigger language plpgsql security definer set search_path='' as $attempt_guard$
declare r public.research_assisted_order_requests%rowtype; q public.research_assisted_order_quotes%rowtype;
  s public.research_assisted_order_provider_sources%rowtype;
  label text;
begin
  select * into r from public.research_assisted_order_requests where id=new.request_id for update;
  if not found then raise exception 'Request not found' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_RESERVATION_REFUSED';end if;
  perform public.research_assisted_order_provider_assert_clear(r.id);
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

create function public.research_assisted_order_provider_attempt_receipt(a public.research_assisted_order_provider_attempts,p_replayed boolean)
returns jsonb language sql immutable set search_path='' as $receipt$
  select jsonb_build_object('schemaVersion','assisted_order_provider_attempt_v1','attemptId',a.id,'requestId',a.request_id,
    'quoteId',a.quote_id,'quoteVersion',a.quote_version,'acceptanceId',a.acceptance_id,'sourceId',a.source_id,
    'expectedAmountCents',a.expected_amount_cents,'currency',a.currency,'state','held',
    'reservedAt',to_char(a.reserved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'replayed',p_replayed);
$receipt$;
create function public.research_assisted_order_provider_attempt_reserve(
  p_request_id uuid,p_quote_id uuid,p_quote_version integer,p_acceptance_id uuid,
  p_source_id text,p_adapter_revision text,p_expected_scope jsonb,p_actor_auth_user_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $reserve$
declare a public.research_assisted_order_provider_attempts%rowtype; q public.research_assisted_order_quotes%rowtype;
  s public.research_assisted_order_provider_sources%rowtype; label text;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  perform 1 from public.research_assisted_order_requests where id=p_request_id for update;
  if not found then return null;end if;
  if p_quote_id is null or p_quote_version is null or p_quote_version<1 or p_acceptance_id is null
    or p_actor_auth_user_id is null or p_source_id is null or p_source_id !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
    or p_idempotency_key is null or p_idempotency_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid held reservation' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_RESERVATION_REFUSED';end if;
  perform 1 from public.research_assisted_order_provider_fence where id for share;
  if not found then raise exception 'Provider fence unavailable' using errcode='55000';end if;
  select * into s from public.research_assisted_order_provider_sources where source_id=p_source_id and revoked_at is null for share;
  if not found or public.research_assisted_order_provider_scope_valid(p_expected_scope,s,p_adapter_revision) is not true then
    raise exception 'Exact configured source scope required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SOURCE_REQUIRED';end if;
  select actor_label into label from public.research_assisted_order_provider_source_grants
    where source_id=p_source_id and auth_user_id=p_actor_auth_user_id and revoked_at is null for share;
  if not found then raise exception 'Scoped reservation grant required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_GRANT_REQUIRED';end if;
  select * into a from public.research_assisted_order_provider_attempts where request_id=p_request_id or idempotency_key=p_idempotency_key;
  if found then
    if a.request_id is distinct from p_request_id or a.quote_id is distinct from p_quote_id or a.quote_version is distinct from p_quote_version
      or a.acceptance_id is distinct from p_acceptance_id or a.source_id is distinct from p_source_id
      or a.adapter_revision is distinct from p_adapter_revision or a.expected_scope is distinct from p_expected_scope
      or a.actor_auth_user_id is distinct from p_actor_auth_user_id or a.idempotency_key is distinct from p_idempotency_key then
      raise exception 'Held reservation replay conflicts' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_REPLAY_CONFLICT';end if;
    return public.research_assisted_order_provider_attempt_receipt(a,true);
  end if;
  select * into q from public.research_assisted_order_quotes where id=p_quote_id;
  if not found then raise exception 'Accepted quote required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_RESERVATION_REFUSED';end if;
  insert into public.research_assisted_order_provider_attempts(request_id,quote_id,quote_version,acceptance_id,source_id,
    adapter_revision,expected_scope,actor_auth_user_id,actor_label,idempotency_key,expected_amount_cents,currency)
  values(p_request_id,p_quote_id,p_quote_version,p_acceptance_id,p_source_id,p_adapter_revision,p_expected_scope,
    p_actor_auth_user_id,label,p_idempotency_key,q.total_cents,q.currency)
  returning * into a;
  return public.research_assisted_order_provider_attempt_receipt(a,false);
end
$reserve$;

create function public.research_assisted_order_provider_event_validate(e jsonb)
returns void language plpgsql immutable set search_path='' as $validate$
declare k text; stamp timestamptz; number_value numeric;
begin
  if jsonb_typeof(e) is distinct from 'object' then
    raise exception 'Invalid event envelope' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EVENT_INVALID';end if;
  if (select count(*) from jsonb_object_keys(e))<>16 or not e ?& array['schemaVersion','eventId','payloadSha256','kind','occurredAt',
    'claimedAttemptId','claimedRequestId','claimedQuoteId','claimedQuoteVersion','claimedAcceptanceId','claimedCanonicalOrderId',
    'providerPaymentId','providerSessionId','observedAmountCents','currency','adjustmentId']
    or e->>'schemaVersion' is distinct from 'assisted_order_provider_event_v1'
    or jsonb_typeof(e->'payloadSha256') is distinct from 'string' or e->>'payloadSha256' !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(e->'kind') is distinct from 'string'
    or e->>'kind' not in ('pending','authorized','captured','failed','cancelled','refunded','dispute_opened','dispute_won','dispute_lost','unknown') then
    raise exception 'Invalid allowlisted event envelope' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EVENT_INVALID';end if;
  foreach k in array array['eventId','providerPaymentId','providerSessionId','adjustmentId'] loop
    if e->k<>'null'::jsonb and (jsonb_typeof(e->k) is distinct from 'string'
      or public.research_assisted_order_disposition_text_valid(e->>k,255) is not true) then
      raise exception 'Invalid event identifier' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EVENT_INVALID';end if;
  end loop;
  foreach k in array array['claimedAttemptId','claimedRequestId','claimedQuoteId','claimedAcceptanceId','claimedCanonicalOrderId'] loop
    if e->k<>'null'::jsonb and (jsonb_typeof(e->k) is distinct from 'string'
      or e->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
      raise exception 'Invalid event claimed identity' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EVENT_INVALID';end if;
  end loop;
  foreach k in array array['claimedQuoteVersion','observedAmountCents'] loop
    if e->k<>'null'::jsonb then
      if jsonb_typeof(e->k) is distinct from 'number' then
        raise exception 'Invalid event number' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EVENT_INVALID';end if;
      number_value:=(e->>k)::numeric;
      if number_value<>trunc(number_value) or abs(number_value)>9007199254740991
        or (k='claimedQuoteVersion' and (number_value<1 or number_value>2147483647)) then
        raise exception 'Invalid bounded event number' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EVENT_INVALID';end if;
    end if;
  end loop;
  if e->'currency'<>'null'::jsonb and (jsonb_typeof(e->'currency') is distinct from 'string' or e->>'currency' !~ '^[A-Z]{3}$') then
    raise exception 'Invalid event currency' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EVENT_INVALID';end if;
  if e->'occurredAt'<>'null'::jsonb then
    if jsonb_typeof(e->'occurredAt') is distinct from 'string'
      or e->>'occurredAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then
      raise exception 'Invalid event time' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EVENT_INVALID';end if;
    begin stamp:=(e->>'occurredAt')::timestamptz;
    exception when others then raise exception 'Invalid event time' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EVENT_INVALID';end;
    if not isfinite(stamp) or to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>e->>'occurredAt' then
      raise exception 'Invalid canonical event time' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EVENT_INVALID';end if;
  end if;
end
$validate$;

-- Caller holds the request (when a configured attempt exists) then the fence.
-- This classifier never locks another request through untrusted claimed IDs.
create function public.research_assisted_order_provider_event_classify(p_source_id text,e jsonb,p_locked_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $classify$
declare a public.research_assisted_order_provider_attempts%rowtype; s public.research_assisted_order_provider_sources%rowtype;
  result_request uuid; result_attempt uuid; category text:='quarantined'; why text; identity_key text; fingerprint text;
begin
  select * into strict s from public.research_assisted_order_provider_sources where source_id=p_source_id;
  identity_key:=case when e->>'eventId' is null then 'digest:'||(e->>'payloadSha256') else 'id:'||(e->>'eventId') end;
  fingerprint:=encode(extensions.digest(convert_to(e::text,'UTF8'),'sha256'),'hex');
  -- The guard resolved this identity BEFORE the global fence. A previously
  -- unknown claim MUST stay unbound even if an attempt commits while we wait.
  select * into a from public.research_assisted_order_provider_attempts where id=p_locked_attempt_id and source_id=p_source_id;
  if exists(select 1 from public.research_assisted_order_provider_event_journal
    where source_id=p_source_id and event_identity=identity_key and event_fingerprint<>fingerprint) then
    category:='conflict';why:='event_identity_conflict';
  elsif s.revoked_at is not null then why:='source_revoked';
  elsif e->>'eventId' is null then why:='missing_event_identity';
  elsif a.id is null then why:='unknown_attempt';
  elsif e->>'kind'='unknown' then why:='unsupported_financial_effect';
  elsif (e->>'claimedRequestId')::uuid is distinct from a.request_id
    or (e->>'claimedQuoteId')::uuid is distinct from a.quote_id
    or (e->>'claimedQuoteVersion')::integer is distinct from a.quote_version
    or (e->>'claimedAcceptanceId')::uuid is distinct from a.acceptance_id
    or e->>'claimedCanonicalOrderId' is not null or e->>'providerPaymentId' is null then why:='binding_mismatch';
  elsif exists(select 1 from public.research_assisted_order_provider_event_journal j
    where j.source_id=p_source_id and j.event->>'providerPaymentId'=e->>'providerPaymentId'
      and (j.established_request_id is null or j.established_request_id<>a.request_id)) then
    category:='conflict';why:='payment_identity_conflict';
  else
    result_request:=a.request_id;result_attempt:=a.id;
    if exists(select 1 from public.research_assisted_order_financial_dispositions where request_id=a.request_id)
      or exists(select 1 from public.research_assisted_order_requests where id=a.request_id and status in ('cancelled','closed')) then why:='terminal_request';
    elsif e->>'currency' is distinct from a.currency or e->'observedAmountCents'='null'::jsonb
      or (e->>'kind' in ('authorized','captured') and (e->>'observedAmountCents')::bigint<>a.expected_amount_cents)
      or (e->>'kind' in ('pending','failed','cancelled') and (e->>'observedAmountCents')::bigint<>0) then why:='amount_currency_mismatch';
    elsif e->>'kind' in ('refunded','dispute_opened','dispute_won','dispute_lost','unknown')
      or e->>'adjustmentId' is not null or e->>'occurredAt' is null
      or (e->>'occurredAt')::timestamptz>clock_timestamp() then why:='unsupported_financial_effect';
    else category:='bound';why:='exact_binding';end if;
  end if;
  return jsonb_build_object('requestId',result_request,'attemptId',result_attempt,'classification',category,'reason',why);
end
$classify$;

create function public.research_assisted_order_provider_journal_guard()
returns trigger language plpgsql security definer set search_path='' as $journal_guard$
declare request_uuid uuid; attempt_uuid uuid; c jsonb; s public.research_assisted_order_provider_sources%rowtype;
  identity_key text; fingerprint text;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  perform public.research_assisted_order_provider_event_validate(new.event);
  if new.event_identity is not null or new.event_fingerprint is not null or new.established_request_id is not null
    or new.established_attempt_id is not null or new.classification is not null or new.reason is not null
    or new.received_at is not null or new.state is distinct from 'held' then
    raise exception 'Journal derived fields must be database-created' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_EVENT_INVALID';end if;
  select id,request_id into attempt_uuid,request_uuid from public.research_assisted_order_provider_attempts
    where id=(new.event->>'claimedAttemptId')::uuid and source_id=new.source_id;
  if request_uuid is not null then perform 1 from public.research_assisted_order_requests where id=request_uuid for update;end if;
  perform 1 from public.research_assisted_order_provider_fence where id for update;
  if not found then raise exception 'Provider fence unavailable' using errcode='55000';end if;
  select * into s from public.research_assisted_order_provider_sources where source_id=new.source_id for share;
  if not found or public.research_assisted_order_provider_scope_valid(new.expected_scope,s,new.adapter_revision) is not true then
    raise exception 'Exact configured adapter scope required' using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_SOURCE_REQUIRED';end if;
  identity_key:=case when new.event->>'eventId' is null then 'digest:'||(new.event->>'payloadSha256') else 'id:'||(new.event->>'eventId') end;
  fingerprint:=encode(extensions.digest(convert_to(new.event::text,'UTF8'),'sha256'),'hex');
  if exists(select 1 from public.research_assisted_order_provider_event_journal
    where source_id=new.source_id and event_identity=identity_key and event_fingerprint=fingerprint) then return null;end if;
  c:=public.research_assisted_order_provider_event_classify(new.source_id,new.event,attempt_uuid);
  new.event_identity:=identity_key;new.event_fingerprint:=fingerprint;
  new.established_request_id:=(c->>'requestId')::uuid;new.established_attempt_id:=(c->>'attemptId')::uuid;
  new.classification:=c->>'classification';new.reason:=c->>'reason';
  new.received_at:=date_trunc('milliseconds',clock_timestamp());
  return new;
end
$journal_guard$;
create function public.research_assisted_order_provider_journal_receipt(j public.research_assisted_order_provider_event_journal,p_replayed boolean)
returns jsonb language sql immutable set search_path='' as $receipt$
  select jsonb_build_object('schemaVersion','assisted_order_provider_journal_receipt_v1','journalId',j.id,'sourceId',j.source_id,
    'state','held','classification',j.classification,'reason',j.reason,'requestId',j.established_request_id,
    'attemptId',j.established_attempt_id,'receivedAt',to_char(j.received_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'replayed',p_replayed);
$receipt$;
create function public.research_assisted_order_provider_event_append(p_source_id text,p_adapter_revision text,p_expected_scope jsonb,p_event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $append$
declare identity_key text; fingerprint text; j public.research_assisted_order_provider_event_journal%rowtype;
begin
  perform public.research_assisted_order_provider_event_validate(p_event);
  -- The INSERT guard is the ONLY lock/classification coordinator. In
  -- particular this wrapper must never take the fence before the guard has
  -- frozen its initial attempt lookup and acquired any known parent lock.
  insert into public.research_assisted_order_provider_event_journal(source_id,adapter_revision,expected_scope,event)
  values(p_source_id,p_adapter_revision,p_expected_scope,p_event) returning * into j;
  if found then return public.research_assisted_order_provider_journal_receipt(j,false);end if;
  identity_key:=case when p_event->>'eventId' is null then 'digest:'||(p_event->>'payloadSha256') else 'id:'||(p_event->>'eventId') end;
  fingerprint:=encode(extensions.digest(convert_to(p_event::text,'UTF8'),'sha256'),'hex');
  select * into strict j from public.research_assisted_order_provider_event_journal
    where source_id=p_source_id and event_identity=identity_key and event_fingerprint=fingerprint;
  return public.research_assisted_order_provider_journal_receipt(j,true);
end
$append$;

-- Preserve the original evaluator body privately, while retaining the public
-- helper's original OID. CREATE OR REPLACE invalidates cached callers; renaming
-- the original instead would leave an already-prepared plan calling its old
-- OID without the new uncertainty check.
do $preserve_graph$
declare definition text; copied_definition text;
begin
  definition:=pg_get_functiondef('public.research_assisted_order_disposition_graph(uuid)'::regprocedure);
  copied_definition:=replace(definition,'CREATE OR REPLACE FUNCTION public.research_assisted_order_disposition_graph(',
    'CREATE FUNCTION public.research_assisted_order_provider_prior_disposition_graph(');
  if copied_definition=definition then raise exception 'Unexpected predecessor graph definition' using errcode='55000';end if;
  execute copied_definition;
end
$preserve_graph$;
create or replace function public.research_assisted_order_disposition_graph(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $graph$
begin
  perform public.research_assisted_order_provider_assert_clear(p_request_id);
  return public.research_assisted_order_provider_prior_disposition_graph(p_request_id);
end
$graph$;
revoke all on function public.research_assisted_order_disposition_graph(uuid) from public,anon,authenticated,service_role;

create function public.research_assisted_order_provider_financial_guard()
returns trigger language plpgsql security definer set search_path='' as $financial$
declare request_uuid uuid;
begin
  if tg_table_name='research_assisted_order_requests' then
    if new.status is distinct from old.status and (new.status in ('paid','supplier_processing','shipped','delivered','closed','cancelled')
      or old.status in ('paid','supplier_processing','shipped','delivered','closed')) then
      perform public.research_assisted_order_provider_assert_clear(new.id);
    end if;
  elsif tg_table_name='research_assisted_order_observation_corrections' then
    select request_id into request_uuid from public.research_assisted_order_payment_observations where id=new.observation_id;
    perform public.research_assisted_order_provider_assert_clear(request_uuid);
  elsif tg_table_name='research_assisted_order_quotes' then
    if tg_op='UPDATE' and new is not distinct from old then return new;end if;
    perform public.research_assisted_order_provider_assert_clear(new.request_id);
  else
    perform public.research_assisted_order_provider_assert_clear(new.request_id);
  end if;
  return new;
end
$financial$;

do $guards$
declare t text;
begin
  foreach t in array array['research_assisted_order_provider_sources','research_assisted_order_provider_source_grants',
    'research_assisted_order_provider_attempts','research_assisted_order_provider_event_journal','research_assisted_order_provider_fence'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('create trigger adp01_no_truncate before truncate on public.%I for each statement execute function public.research_assisted_order_provider_immutable()',t);
    execute format('alter table public.%I enable always trigger adp01_no_truncate',t);
    if t in ('research_assisted_order_provider_sources','research_assisted_order_provider_source_grants') then
      execute format('create trigger adp01_source_guard before insert or update on public.%I for each row execute function public.research_assisted_order_provider_source_guard()',t);
      execute format('alter table public.%I enable always trigger adp01_source_guard',t);
      execute format('create trigger adp01_immutable before delete on public.%I for each row execute function public.research_assisted_order_provider_immutable()',t);
    else
      execute format('create trigger adp01_immutable before update or delete on public.%I for each row execute function public.research_assisted_order_provider_immutable()',t);
    end if;
    execute format('alter table public.%I enable always trigger adp01_immutable',t);
  end loop;
  foreach t in array array['research_assisted_order_no_funds_evidence','research_assisted_order_financial_dispositions',
    'research_assisted_order_payment_verifications','research_assisted_order_payment_observations',
    'research_assisted_order_evidence_claims','research_assisted_order_observation_corrections'] loop
    execute format('create trigger aaa_adp01_uncertainty before insert on public.%I for each row execute function public.research_assisted_order_provider_financial_guard()',t);
    execute format('alter table public.%I enable always trigger aaa_adp01_uncertainty',t);
  end loop;
end
$guards$;
create trigger aaa_adp01_uncertainty before insert or update on public.research_assisted_order_quotes
  for each row execute function public.research_assisted_order_provider_financial_guard();
alter table public.research_assisted_order_quotes enable always trigger aaa_adp01_uncertainty;
create trigger aaa_adp01_uncertainty before update of status on public.research_assisted_order_requests
  for each row execute function public.research_assisted_order_provider_financial_guard();
alter table public.research_assisted_order_requests enable always trigger aaa_adp01_uncertainty;
create trigger adp01_attempt_guard before insert on public.research_assisted_order_provider_attempts
  for each row execute function public.research_assisted_order_provider_attempt_guard();
alter table public.research_assisted_order_provider_attempts enable always trigger adp01_attempt_guard;
create trigger adp01_journal_guard before insert on public.research_assisted_order_provider_event_journal
  for each row execute function public.research_assisted_order_provider_journal_guard();
alter table public.research_assisted_order_provider_event_journal enable always trigger adp01_journal_guard;
create trigger adp01_fence_insert before insert on public.research_assisted_order_provider_fence
  for each row execute function public.research_assisted_order_provider_immutable();
alter table public.research_assisted_order_provider_fence enable always trigger adp01_fence_insert;

create function public.research_assisted_order_provider_journal_authority()
returns jsonb language plpgsql stable security definer set search_path='' as $authority$
declare seal text; p record; role_name text; permitted boolean; relation_name text;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
  if seal is null or seal !~ '^ADP01_SCHEMA_V1:[0-9a-f]{64}:[0-9a-f]{64}$'
    or split_part(seal,':',3) is distinct from public.research_assisted_order_provider_schema_fingerprint()
    or not exists(select 1 from public.research_assisted_order_provider_fence where id)
    or exists(select 1 from public.research_assisted_order_payment_verifications where method='provider') then
    raise exception 'Provider journal schema posture requires reconciliation' using errcode='55000';end if;
  for p in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'research_assisted_order_provider_%' loop
    permitted:=p.oid=any(array[
      'public.research_assisted_order_provider_attempt_reserve(uuid,uuid,integer,uuid,text,text,jsonb,uuid,text)'::regprocedure,
      'public.research_assisted_order_provider_event_append(text,text,jsonb,jsonb)'::regprocedure,
      'public.research_assisted_order_provider_uncertainty(uuid)'::regprocedure,
      'public.research_assisted_order_provider_journal_authority()'::regprocedure]::oid[]);
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,p.oid,'EXECUTE') is distinct from (permitted and role_name='service_role') then
        raise exception 'Provider effective function privileges drifted' using errcode='55000';end if;
    end loop;
  end loop;
  foreach relation_name in array array['research_assisted_order_provider_sources','research_assisted_order_provider_source_grants',
    'research_assisted_order_provider_attempts','research_assisted_order_provider_event_journal','research_assisted_order_provider_fence'] loop
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(role_name,'public.'||relation_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(role_name,'public.'||relation_name,'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'Provider effective relation privileges drifted' using errcode='55000';end if;
    end loop;
  end loop;
  return jsonb_build_object('schemaVersion','assisted_order_provider_journal_v1',
    'settlementEnabled',false,'refundEnabled',false,'liveExecutionEnabled',false);
end
$authority$;

do $acl$
declare p record; role_name text; permitted boolean; table_name text;
begin
  for p in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'research_assisted_order_provider_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',p.oid::regprocedure);
    permitted:=p.oid=any(array[
      'public.research_assisted_order_provider_attempt_reserve(uuid,uuid,integer,uuid,text,text,jsonb,uuid,text)'::regprocedure,
      'public.research_assisted_order_provider_event_append(text,text,jsonb,jsonb)'::regprocedure,
      'public.research_assisted_order_provider_uncertainty(uuid)'::regprocedure,
      'public.research_assisted_order_provider_journal_authority()'::regprocedure]::oid[]);
    if permitted then execute format('grant execute on function %s to service_role',p.oid::regprocedure);end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,p.oid,'EXECUTE') is distinct from (permitted and role_name='service_role') then
        raise exception 'Provider function ACL mismatch' using errcode='55000';end if;
    end loop;
  end loop;
  foreach table_name in array array['research_assisted_order_provider_sources','research_assisted_order_provider_source_grants',
    'research_assisted_order_provider_attempts','research_assisted_order_provider_event_journal','research_assisted_order_provider_fence'] loop
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(role_name,'public.'||table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(role_name,'public.'||table_name,'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'Provider direct table access remains' using errcode='55000';end if;
    end loop;
  end loop;
end
$acl$;
$install$;
begin
  select count(*) into object_count from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any(array['research_assisted_order_provider_sources',
      'research_assisted_order_provider_source_grants','research_assisted_order_provider_attempts',
      'research_assisted_order_provider_event_journal','research_assisted_order_provider_fence']);
  if object_count not in (0,5) then raise exception 'Partial provider journal requires explicit reconciliation' using errcode='55000';end if;
  installed:=object_count=5;
  for phase in 1..2 loop
    if (phase=1 and installed) or phase=2 then
      execute fingerprint_sql into fingerprint;
      if phase=1 then
        seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
        if seal is distinct from 'ADP01_SCHEMA_V1:'||encode(extensions.digest(
          convert_to(replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')||':'||fingerprint then
          raise exception 'Provider schema drift requires explicit reconciliation' using errcode='55000';end if;
        if not exists(select 1 from public.research_assisted_order_provider_fence where id)
          or exists(select 1 from public.research_assisted_order_payment_verifications where method='provider') then
          raise exception 'Provider fence or held financial posture is invalid' using errcode='55000';end if;
        return;
      else
        execute format('comment on table public.research_assisted_order_provider_fence is %L','ADP01_SCHEMA_V1:'||encode(extensions.digest(
          convert_to(replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')||':'||fingerprint);
      end if;
    else
      execute install_sql;
      execute format('create function public.research_assisted_order_provider_schema_fingerprint() returns text language sql stable security definer set search_path=%L as %L','',fingerprint_sql);
      revoke all on function public.research_assisted_order_provider_schema_fingerprint() from public,anon,authenticated,service_role;
    end if;
  end loop;
end
$migration$;
commit;
