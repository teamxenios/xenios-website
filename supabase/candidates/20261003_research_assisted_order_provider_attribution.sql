-- SESSION03 ADP-G1 exact-object risk attribution. SOURCE CANDIDATE ONLY.
-- Requires the exact M94 predecessor. No managed application is authorized.
-- An immutable receipt narrows one unknown event's source-wide risk to its
-- independently derived request. That request remains held permanently here.
-- This is NOT settlement, financial reconciliation, quarantine dismissal,
-- attempt retirement, refund, fulfillment permission, or complete G1 closure.
-- Early/unbound objects and equal-clock witnesses remain unresolved. Original
-- journal, create history, verification, settlement and outbox rows are untouched.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local search_path='';

do $candidate$
declare installed integer;fingerprint text;seal text;
  predecessor_definition constant text := '5302be3131cca3dc97bc9d9a9bb40b0f8addab975aaa76c9b74b68343921d349';
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
create table public.research_assisted_order_provider_attribution_policies (
  source_id text primary key references public.research_assisted_order_provider_sources(source_id) on update restrict on delete restrict,
  policy_revision text not null check(policy_revision ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  attribution_semantics text not null check(attribution_semantics='preexisting_exact_object_risk_only_v1'),
  granted_by text not null,
  created_at timestamptz not null default date_trunc('milliseconds',clock_timestamp()),
  revoked_at timestamptz
);
create table public.research_assisted_order_provider_attribution_grants (
  source_id text not null references public.research_assisted_order_provider_sources(source_id) on update restrict on delete restrict,
  auth_user_id uuid not null,
  actor_label text not null,
  granted_by text not null,
  granted_at timestamptz not null default date_trunc('milliseconds',clock_timestamp()),
  revoked_at timestamptz,
  primary key(source_id,auth_user_id)
);
create table public.research_assisted_order_provider_attributions (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null unique references public.research_assisted_order_provider_event_journal(id) on update restrict on delete restrict,
  source_id text not null references public.research_assisted_order_provider_sources(source_id) on update restrict on delete restrict,
  adapter_revision text not null,
  expected_scope jsonb not null,
  policy_revision text not null,
  actor_auth_user_id uuid not null,
  actor_label text not null,
  request_id uuid not null references public.research_assisted_order_requests(id) on update restrict on delete restrict,
  attempt_id uuid not null references public.research_assisted_order_provider_attempts(id) on update restrict on delete restrict,
  payment_result_id uuid not null references public.research_assisted_order_provider_create_results(id) on update restrict on delete restrict,
  session_result_id uuid references public.research_assisted_order_provider_create_results(id) on update restrict on delete restrict,
  journal_fingerprint text not null check(journal_fingerprint ~ '^[0-9a-f]{64}$'),
  witness_fingerprint text not null check(witness_fingerprint ~ '^[0-9a-f]{64}$'),
  witness_snapshot jsonb not null check(jsonb_typeof(witness_snapshot)='object'),
  attributed_at timestamptz not null,
  state text not null default 'held' check(state='held')
);
create index research_assisted_order_provider_attribution_request_idx
  on public.research_assisted_order_provider_attributions(request_id,journal_id);

create function public.research_assisted_order_provider_attribution_config_guard()
returns trigger language plpgsql set search_path='' as $config$
declare stamp timestamptz;units integer;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  if tg_op='UPDATE' and (old.revoked_at is not null or new.revoked_at is null
    or (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at')) then
    raise exception 'Attribution configuration permits only first revocation'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_IMMUTABLE';end if;
  if public.research_assisted_order_disposition_text_valid(new.granted_by,512) is not true then
    raise exception 'Named attribution authority required'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_GRANT_REQUIRED';end if;
  if tg_table_name='research_assisted_order_provider_attribution_policies' then stamp:=new.created_at;
  else
    stamp:=new.granted_at;
    select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) into units
      from regexp_split_to_table(new.actor_label,'') chars(ch);
    if public.research_assisted_order_disposition_text_valid(new.actor_label,512) is not true or units not between 1 and 512 then
      raise exception 'Representable attribution actor required'
        using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_GRANT_REQUIRED';end if;
  end if;
  if stamp is null or not isfinite(stamp) or stamp>clock_timestamp()
    or (new.revoked_at is not null and (not isfinite(new.revoked_at) or new.revoked_at<stamp or new.revoked_at>clock_timestamp())) then
    raise exception 'Invalid attribution authority time'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_GRANT_REQUIRED';end if;
  return new;
end
$config$;

-- Millisecond equality is not affirmative chronological evidence. This narrow
-- candidate refuses equal or reversed clocks rather than fabricating ordering.
-- The private pure predicate also permits deterministic boundary qualification.
create function public.research_assisted_order_provider_attribution_witness_precedes(
  p_result_at timestamptz,p_bound_at timestamptz,p_received_at timestamptz)
returns boolean language sql immutable set search_path='' as $precedes$
  select coalesce(isfinite(p_result_at) and isfinite(p_bound_at) and isfinite(p_received_at)
    and p_result_at=p_bound_at and p_result_at<p_received_at,false);
$precedes$;

-- Only this locked context selects the target. The caller supplies an original
-- journal identity and its configured authority, never a target order/attempt.
create function public.research_assisted_order_provider_attribution_context(
  p_journal_id uuid,p_source_id text,p_adapter_revision text,p_expected_scope jsonb,
  p_policy_revision text,p_actor_auth_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $context$
declare e public.research_assisted_order_provider_event_journal%rowtype;
  a public.research_assisted_order_provider_attempts%rowtype;
  b public.research_assisted_order_provider_identity_bindings%rowtype;
  sb public.research_assisted_order_provider_identity_bindings%rowtype;
  x public.research_assisted_order_provider_create_results%rowtype;
  sx public.research_assisted_order_provider_create_results%rowtype;
  c public.research_assisted_order_provider_create_claims%rowtype;
  sc public.research_assisted_order_provider_create_claims%rowtype;
  s public.research_assisted_order_provider_sources%rowtype;
  target_request uuid;label text;witness jsonb;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  perform public.research_assisted_order_provider_settlement_integrity();
  if p_journal_id is null or p_source_id is null or p_adapter_revision is null or p_expected_scope is null
    or p_policy_revision is null or p_actor_auth_user_id is null then
    raise exception 'Exact attribution authority required'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_GRANT_REQUIRED';end if;
  -- Preliminary authorization does not lock configuration ahead of the request.
  -- Recheck and lock all grants after request/fence acquisition below.
  select * into s from public.research_assisted_order_provider_sources where source_id=p_source_id and revoked_at is null;
  if not found or public.research_assisted_order_provider_scope_valid(p_expected_scope,s,p_adapter_revision) is not true
    or not exists(select 1 from public.research_assisted_order_provider_attribution_policies
      where source_id=p_source_id and policy_revision=p_policy_revision and attribution_semantics='preexisting_exact_object_risk_only_v1' and revoked_at is null)
    or not exists(select 1 from public.research_assisted_order_provider_attribution_grants
      where source_id=p_source_id and auth_user_id=p_actor_auth_user_id and revoked_at is null) then
    raise exception 'Separate scoped attribution policy and grant required'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_GRANT_REQUIRED';end if;
  select attempt.request_id into target_request
    from public.research_assisted_order_provider_event_journal journal
    join public.research_assisted_order_provider_identity_bindings binding
      on binding.source_id=journal.source_id and binding.binding_kind='payment'
      and binding.provider_identity=journal.event->>'providerPaymentId'
    join public.research_assisted_order_provider_attempts attempt on attempt.id=binding.attempt_id
    where journal.id=p_journal_id and journal.source_id=p_source_id;
  if not found then
    raise exception 'No independent preexisting object witness'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_HELD';end if;
  perform 1 from public.research_assisted_order_requests where id=target_request for update;
  if not found then raise exception 'Derived attribution request unavailable' using errcode='55000';end if;
  perform 1 from public.research_assisted_order_provider_fence where id for update;
  if not found then raise exception 'Provider fence unavailable' using errcode='55000';end if;
  -- No other request is acquired after the fence. All witnesses below are
  -- immutable; reloading nevertheless avoids relying on pre-lock snapshots.
  select * into s from public.research_assisted_order_provider_sources where source_id=p_source_id and revoked_at is null for share;
  if not found or public.research_assisted_order_provider_scope_valid(p_expected_scope,s,p_adapter_revision) is not true then
    raise exception 'Active exact attribution source required'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_GRANT_REQUIRED';end if;
  perform 1 from public.research_assisted_order_provider_attribution_policies where source_id=p_source_id
    and policy_revision=p_policy_revision and attribution_semantics='preexisting_exact_object_risk_only_v1' and revoked_at is null for share;
  if not found then raise exception 'Active attribution policy required'
    using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_GRANT_REQUIRED';end if;
  select actor_label into label from public.research_assisted_order_provider_attribution_grants
    where source_id=p_source_id and auth_user_id=p_actor_auth_user_id and revoked_at is null for share;
  if not found then raise exception 'Active attribution actor grant required'
    using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_GRANT_REQUIRED';end if;
  select * into e from public.research_assisted_order_provider_event_journal where id=p_journal_id;
  select * into b from public.research_assisted_order_provider_identity_bindings where source_id=p_source_id
    and binding_kind='payment' and provider_identity=e.event->>'providerPaymentId';
  select * into a from public.research_assisted_order_provider_attempts where id=b.attempt_id;
  select * into x from public.research_assisted_order_provider_create_results where id=b.result_id;
  select * into c from public.research_assisted_order_provider_create_claims where id=x.claim_id;
  if e.id is null or a.id is null or b.attempt_id is null or x.id is null or c.id is null
    or a.request_id is distinct from target_request or e.source_id is distinct from p_source_id
    or a.source_id is distinct from p_source_id or c.source_id is distinct from p_source_id
    or e.adapter_revision is distinct from p_adapter_revision or a.adapter_revision is distinct from p_adapter_revision
    or e.expected_scope is distinct from p_expected_scope or a.expected_scope is distinct from p_expected_scope
    or e.established_request_id is not null or e.established_attempt_id is not null
    or e.classification<>'quarantined' or e.reason<>'unknown_attempt' or e.state<>'held'
    or e.event->>'eventId' is null or e.event->>'providerPaymentId' is null
    or e.event->>'kind' not in ('pending','authorized','captured','failed','cancelled','refunded','dispute_opened','dispute_won','dispute_lost')
    or x.classification<>'bound' or x.reason<>'exact_binding' or x.result->>'outcome'<>'object'
    or c.attempt_id is distinct from a.id or c.request_id is distinct from a.request_id
    or x.result->>'providerPaymentId' is distinct from b.provider_identity
    or (x.result->>'attemptId')::uuid is distinct from a.id or (x.result->>'requestId')::uuid is distinct from a.request_id
    or (x.result->>'quoteId')::uuid is distinct from a.quote_id or (x.result->>'quoteVersion')::integer is distinct from a.quote_version
    or (x.result->>'acceptanceId')::uuid is distinct from a.acceptance_id
    or x.result->>'provider' is distinct from p_expected_scope->>'provider'
    or x.result->>'accountId' is distinct from p_expected_scope->>'accountId' or x.result->>'mode' is distinct from p_expected_scope->>'mode'
    or public.research_assisted_order_provider_attribution_witness_precedes(x.recorded_at,b.bound_at,e.received_at) is not true then
    raise exception 'Event lacks an exact independently bound prior object'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_HELD';end if;
  -- Missing lineage is allowed only because the object witnesses select it.
  -- Contradictory supplied claims never become permission to retarget evidence.
  if (e.event->>'claimedAttemptId' is not null and (e.event->>'claimedAttemptId')::uuid is distinct from a.id)
    or (e.event->>'claimedRequestId' is not null and (e.event->>'claimedRequestId')::uuid is distinct from a.request_id)
    or (e.event->>'claimedQuoteId' is not null and (e.event->>'claimedQuoteId')::uuid is distinct from a.quote_id)
    or (e.event->>'claimedQuoteVersion' is not null and (e.event->>'claimedQuoteVersion')::integer is distinct from a.quote_version)
    or (e.event->>'claimedAcceptanceId' is not null and (e.event->>'claimedAcceptanceId')::uuid is distinct from a.acceptance_id)
    or e.event->>'claimedCanonicalOrderId' is not null then
    raise exception 'Supplied event lineage conflicts with independent object binding'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_HELD';end if;
  select * into sb from public.research_assisted_order_provider_identity_bindings
    where attempt_id=a.id and source_id=p_source_id and binding_kind='session';
  if sb.provider_identity is distinct from e.event->>'providerSessionId' then
    raise exception 'Exact optional session identity required'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_HELD';end if;
  if sb.attempt_id is not null then
    select * into sx from public.research_assisted_order_provider_create_results where id=sb.result_id;
    select * into sc from public.research_assisted_order_provider_create_claims where id=sx.claim_id;
    if sx.id is null or sc.id is null or sx.classification<>'bound' or sx.reason<>'exact_binding' or sx.result->>'outcome'<>'object'
      or sc.attempt_id is distinct from a.id or sc.request_id is distinct from a.request_id or sc.source_id is distinct from p_source_id
      or sx.result->>'providerPaymentId' is distinct from b.provider_identity or sx.result->>'providerSessionId' is distinct from sb.provider_identity
      or (sx.result->>'attemptId')::uuid is distinct from a.id or (sx.result->>'requestId')::uuid is distinct from a.request_id
      or (sx.result->>'quoteId')::uuid is distinct from a.quote_id or (sx.result->>'quoteVersion')::integer is distinct from a.quote_version
      or (sx.result->>'acceptanceId')::uuid is distinct from a.acceptance_id
      or sx.result->>'provider' is distinct from p_expected_scope->>'provider'
      or sx.result->>'accountId' is distinct from p_expected_scope->>'accountId' or sx.result->>'mode' is distinct from p_expected_scope->>'mode'
      or public.research_assisted_order_provider_attribution_witness_precedes(sx.recorded_at,sb.bound_at,e.received_at) is not true then
      raise exception 'Session lacks an exact independently bound prior result'
        using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_HELD';end if;
  elsif x.result->>'providerSessionId' is not null then
    raise exception 'Object receipt session witness is absent'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_HELD';end if;
  witness:=jsonb_build_object('journalId',e.id,'journalFingerprint',e.event_fingerprint,
    'sourceId',a.source_id,'adapterRevision',a.adapter_revision,'scope',a.expected_scope,
    'requestId',a.request_id,'attemptId',a.id,'quoteId',a.quote_id,'quoteVersion',a.quote_version,'acceptanceId',a.acceptance_id,
    'paymentBinding',to_jsonb(b),'paymentResultId',x.id,'paymentResultFingerprint',x.result_fingerprint,'paymentClaimId',c.id,
    'sessionBinding',case when sb.attempt_id is not null then to_jsonb(sb) else 'null'::jsonb end,
    'sessionResultId',sx.id,'sessionResultFingerprint',sx.result_fingerprint,'sessionClaimId',sc.id);
  return jsonb_build_object('requestId',a.request_id,'attemptId',a.id,'actorLabel',label,
    'paymentResultId',x.id,'sessionResultId',sx.id,'journalFingerprint',e.event_fingerprint,
    'witnessSnapshot',witness,'witnessFingerprint',encode(extensions.digest(convert_to(witness::text,'UTF8'),'sha256'),'hex'));
end
$context$;

create function public.research_assisted_order_provider_attribution_guard()
returns trigger language plpgsql security definer set search_path='' as $guard$
declare c jsonb;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  if new.request_id is not null or new.attempt_id is not null or new.actor_label is not null
    or new.payment_result_id is not null or new.session_result_id is not null or new.journal_fingerprint is not null
    or new.witness_fingerprint is not null or new.witness_snapshot is not null or new.attributed_at is not null
    or new.state is distinct from 'held' then
    raise exception 'Attribution target and witnesses must be database-derived'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_CONFLICT';end if;
  c:=public.research_assisted_order_provider_attribution_context(new.journal_id,new.source_id,new.adapter_revision,
    new.expected_scope,new.policy_revision,new.actor_auth_user_id);
  if exists(select 1 from public.research_assisted_order_provider_attributions where journal_id=new.journal_id) then
    raise exception 'Attribution already exists; use exact receipt replay'
      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_CONFLICT';end if;
  new.request_id:=(c->>'requestId')::uuid;new.attempt_id:=(c->>'attemptId')::uuid;new.actor_label:=c->>'actorLabel';
  new.payment_result_id:=(c->>'paymentResultId')::uuid;new.session_result_id:=(c->>'sessionResultId')::uuid;
  new.journal_fingerprint:=c->>'journalFingerprint';new.witness_fingerprint:=c->>'witnessFingerprint';
  new.witness_snapshot:=c->'witnessSnapshot';new.attributed_at:=date_trunc('milliseconds',clock_timestamp());
  return new;
end
$guard$;

create function public.research_assisted_order_provider_attribution_receipt(
  a public.research_assisted_order_provider_attributions,p_replayed boolean)
returns jsonb language sql immutable set search_path='' as $receipt$
  select jsonb_build_object('schemaVersion','assisted_order_provider_attribution_receipt_v1',
    'attributionId',a.id,'journalId',a.journal_id,'sourceId',a.source_id,'requestId',a.request_id,'attemptId',a.attempt_id,
    'state','held','attributedAt',to_char(a.attributed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'replayed',p_replayed);
$receipt$;

create function public.research_assisted_order_provider_attribution_commit(
  p_journal_id uuid,p_source_id text,p_adapter_revision text,p_expected_scope jsonb,
  p_policy_revision text,p_actor_auth_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $commit$
declare c jsonb;a public.research_assisted_order_provider_attributions%rowtype;
begin
  -- Authorization and immutable witness checks run even for replay. Historical
  -- receipt effects survive revoked authority, but revoked actors cannot call it.
  c:=public.research_assisted_order_provider_attribution_context(p_journal_id,p_source_id,p_adapter_revision,
    p_expected_scope,p_policy_revision,p_actor_auth_user_id);
  select * into a from public.research_assisted_order_provider_attributions where journal_id=p_journal_id;
  if found then
    if a.source_id is distinct from p_source_id or a.adapter_revision is distinct from p_adapter_revision
      or a.expected_scope is distinct from p_expected_scope or a.policy_revision is distinct from p_policy_revision
      or a.actor_auth_user_id is distinct from p_actor_auth_user_id or a.actor_label is distinct from c->>'actorLabel'
      or a.request_id is distinct from (c->>'requestId')::uuid or a.attempt_id is distinct from (c->>'attemptId')::uuid
      or a.witness_fingerprint is distinct from c->>'witnessFingerprint' or a.witness_snapshot is distinct from c->'witnessSnapshot' then
      raise exception 'Attribution receipt replay conflicts'
        using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_ATTRIBUTION_CONFLICT';end if;
    return public.research_assisted_order_provider_attribution_receipt(a,true);
  end if;
  insert into public.research_assisted_order_provider_attributions(journal_id,source_id,adapter_revision,expected_scope,policy_revision,actor_auth_user_id)
    values(p_journal_id,p_source_id,p_adapter_revision,p_expected_scope,p_policy_revision,p_actor_auth_user_id) returning * into a;
  return public.research_assisted_order_provider_attribution_receipt(a,false);
end
$commit$;

-- Effective RISK attribution is not settlement lineage. Original journal DTOs,
-- classifications and established IDs stay unchanged. No current-grant/age
-- predicate may erase the target hold or reassign an existing receipt.
create function public.research_assisted_order_provider_event_risk_target(p_journal_id uuid)
returns uuid language sql security definer set search_path='' as $risk_target$
  select coalesce(j.established_request_id,a.request_id)
    from public.research_assisted_order_provider_event_journal j
    left join public.research_assisted_order_provider_attributions a on a.journal_id=j.id
    where j.id=p_journal_id;
$risk_target$;
create or replace function public.research_assisted_order_provider_source_quarantine_held(p_source_id text)
returns boolean language sql security definer set search_path='' as $source_quarantine$
  select p_source_id is null or exists(
    select 1 from public.research_assisted_order_provider_event_journal j
    where j.source_id=p_source_id and j.established_request_id is null
      and not exists(select 1 from public.research_assisted_order_provider_attributions a where a.journal_id=j.id));
$source_quarantine$;
create or replace function public.research_assisted_order_provider_request_quarantine_held(p_request_id uuid)
returns boolean language sql security definer set search_path='' as $request_quarantine$
  select p_request_id is null
    or exists(select 1 from public.research_assisted_order_provider_attributions where request_id=p_request_id)
    or exists(select 1 from public.research_assisted_order_provider_attempts attempt
      join public.research_assisted_order_provider_event_journal journal on journal.source_id=attempt.source_id
      where attempt.request_id=p_request_id and journal.established_request_id is null
        and not exists(select 1 from public.research_assisted_order_provider_attributions attribution where attribution.journal_id=journal.id));
$request_quarantine$;

-- A later fully specified event for the SAME independently attributed object
-- must not turn the preserved original null established ID into a new global
-- payment-identity conflict. Change only that predicate in the exact attested
-- predecessor classifier. The M92 binding wrapper and every other check stay.
-- This does not attribute a new unknown event, rehabilitate early creation,
-- change original history, or remove the target's explicit quarantine hold.
do $classifier$
declare definition text;
  old_predicate constant text := 'and (j.established_request_id is null or j.established_request_id<>a.request_id)';
  new_predicate constant text := 'and public.research_assisted_order_provider_event_risk_target(j.id) is distinct from a.request_id';
begin
  definition:=pg_get_functiondef('public.research_assisted_order_provider_pre_execution_event_classify(text,jsonb,uuid)'::regprocedure);
  if (length(definition)-length(replace(definition,old_predicate,'')))/length(old_predicate)<>1 then
    raise exception 'Exact predecessor classifier predicate required' using errcode='55000';end if;
  execute replace(definition,old_predicate,new_predicate);
end
$classifier$;

do $guards$
declare t text;
begin
  foreach t in array array['research_assisted_order_provider_attribution_policies',
    'research_assisted_order_provider_attribution_grants','research_assisted_order_provider_attributions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('create trigger adp05a_no_truncate before truncate on public.%I for each statement execute function public.research_assisted_order_provider_immutable()',t);
    execute format('alter table public.%I enable always trigger adp05a_no_truncate',t);
    if t='research_assisted_order_provider_attributions' then
      execute format('create trigger adp05a_immutable before update or delete on public.%I for each row execute function public.research_assisted_order_provider_immutable()',t);
    else
      execute format('create trigger adp05a_config before insert or update on public.%I for each row execute function public.research_assisted_order_provider_attribution_config_guard()',t);
      execute format('alter table public.%I enable always trigger adp05a_config',t);
      execute format('create trigger adp05a_immutable before delete on public.%I for each row execute function public.research_assisted_order_provider_immutable()',t);
    end if;
    execute format('alter table public.%I enable always trigger adp05a_immutable',t);
  end loop;
end
$guards$;
create trigger adp05a_attribution before insert on public.research_assisted_order_provider_attributions
  for each row execute function public.research_assisted_order_provider_attribution_guard();
alter table public.research_assisted_order_provider_attributions enable always trigger adp05a_attribution;

create function public.research_assisted_order_provider_attribution_authority()
returns jsonb language plpgsql stable security definer set search_path='' as $authority$
begin
  perform public.research_assisted_order_provider_settlement_integrity();
  return jsonb_build_object('schemaVersion','assisted_order_provider_attribution_v1','transactionIsolation','read_committed_only',
    'attributionPolicy','preexisting_exact_object_risk_only_v1','settlementEnabled',false,'refundEnabled',false,'targetHoldRequired',true);
end
$authority$;
create or replace function public.research_assisted_order_provider_settlement_rpc_oids()
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
  'public.research_assisted_order_financial_eligibility(uuid)'::regprocedure,
  'public.research_assisted_order_provider_attribution_authority()'::regprocedure,
  'public.research_assisted_order_provider_attribution_commit(uuid,text,text,jsonb,text,uuid)'::regprocedure]::oid[];
end
$oids$;
create or replace function public.research_assisted_order_provider_settlement_integrity()
returns void language plpgsql stable security definer set search_path='' as $integrity$
declare seal text;p record;permitted boolean;role_name text;t record;
begin
  perform public.research_assisted_order_provider_require_read_committed();
  seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
  if seal is null or seal !~ '^ADP05A_SCHEMA_V1:5302be3131cca3dc97bc9d9a9bb40b0f8addab975aaa76c9b74b68343921d349:[0-9a-f]{64}:[0-9a-f]{64}$'
    or split_part(seal,':',4) is distinct from public.research_assisted_order_provider_schema_fingerprint()
    or not exists(select 1 from public.research_assisted_order_provider_fence where id)
    or exists(select 1 from public.research_assisted_order_provider_settlements s where not public.research_assisted_order_provider_settlement_complete(s.id))
    or exists(select 1 from public.research_assisted_order_payment_verifications v where v.method='provider'
      and not public.research_assisted_order_provider_settlement_verification_valid(v.id)) then
    raise exception 'Provider attribution schema or financial lineage requires reconciliation' using errcode='55000';end if;
  for p in select oid from pg_proc where pronamespace='public'::regnamespace
    and (proname like 'research_assisted_order_provider_%' or proname='research_assisted_order_financial_eligibility') loop
    permitted:=p.oid=any(public.research_assisted_order_provider_settlement_rpc_oids());
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,p.oid,'EXECUTE') is distinct from (permitted and role_name='service_role') then
        raise exception 'Provider attribution function ACL drift' using errcode='55000';end if;
    end loop;
  end loop;
  for t in select oid from pg_class where relnamespace='public'::regnamespace and relkind in('r','p') and relname like 'research_assisted_order_provider_%' loop
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(role_name,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(role_name,t.oid,'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'Provider attribution table ACL drift' using errcode='55000';end if;
    end loop;
  end loop;
end
$integrity$;
do $acl$
declare p record;
begin
  for p in select oid from pg_proc where pronamespace='public'::regnamespace
    and (proname like 'research_assisted_order_provider_%' or proname='research_assisted_order_financial_eligibility') loop
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
    'research_assisted_order_provider_attribution_policies','research_assisted_order_provider_attribution_grants',
    'research_assisted_order_provider_attributions']);
  if installed not in(0,3) then
    raise exception 'Partial provider attribution schema requires reconciliation' using errcode='55000';end if;
  if installed=3 then
    execute fingerprint_sql into fingerprint;
    seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
    if seal is distinct from 'ADP05A_SCHEMA_V1:'||predecessor_definition||':'||
      encode(extensions.digest(convert_to(replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')||':'||fingerprint then
      raise exception 'Provider attribution definition or schema drift' using errcode='55000';end if;
    perform public.research_assisted_order_provider_settlement_integrity();return;
  end if;
  perform public.research_assisted_order_provider_settlement_integrity();
  seal:=obj_description('public.research_assisted_order_provider_fence'::regclass,'pg_class');
  if seal is distinct from 'ADP04Q_SCHEMA_V1:1edd550f2f2362501f9357aa6f7bdef9c51634fc3377c2efcdffbc45df24715b:'||
    predecessor_definition||':'||public.research_assisted_order_provider_schema_fingerprint() then
    raise exception 'Exact M94 quarantine predecessor required' using errcode='55000';end if;
  execute install_sql;
  execute format('create or replace function public.research_assisted_order_provider_schema_fingerprint() returns text language sql stable security definer set search_path=%L as %L','',fingerprint_sql);
  revoke all on function public.research_assisted_order_provider_schema_fingerprint() from public,anon,authenticated,service_role;
  execute fingerprint_sql into fingerprint;
  execute format('comment on table public.research_assisted_order_provider_fence is %L','ADP05A_SCHEMA_V1:'||predecessor_definition||':'||
    encode(extensions.digest(convert_to(replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex')||':'||fingerprint);
  perform public.research_assisted_order_provider_settlement_integrity();
end
$candidate$;
commit;
