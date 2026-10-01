-- PENDING/local-source N2 slice: independently evidenced never-received funds
-- plus EXPLICIT cancellation only. No void, refund, provider or historical-paid
-- adoption. Installs no actor/source grants and authenticates no bank itself.
-- The mounted independent evidence adapter remains null/default-off.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $preflight$
declare g record;
begin
  if to_regprocedure('public.research_assisted_order_disposition_context(uuid,uuid)') is not null then
    raise exception 'Unexpected unscoped disposition context overload' using errcode='55000';end if;
  if to_regprocedure('public.research_assisted_order_disposition_context(uuid,uuid,text)') is null
     and (to_regprocedure('public.research_assisted_order_payment_effects_authority()') is null
       or to_regprocedure('public.research_assisted_order_audit_append(text,text,jsonb)') is null
       or position('ASSISTED_ORDER_QUOTE_FINANCIAL_HISTORY_HOLD' in
         pg_get_functiondef('public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)'::regprocedure))=0) then
    raise exception 'No-funds disposition requires the exact financial predecessor chain' using errcode='55000';
  end if;
  for g in select * from (values
    ('public.research_assisted_order_requests','hl12_history_progression','research_assisted_order_history_progression_guard()'),
    ('public.research_assisted_order_quotes','hl12_quote_snapshot_immutable','research_assisted_order_quote_snapshot_guard()'),
    ('public.research_assisted_order_quotes','hl12_quote_snapshot_no_truncate','research_assisted_order_quote_snapshot_guard()'),
    ('public.research_assisted_order_payment_observations','hl12_provider_observation_hold','research_assisted_order_provider_payment_hold_guard()'),
    ('public.research_assisted_order_payment_verifications','hl12_provider_verification_hold','research_assisted_order_provider_payment_hold_guard()'),
    ('public.research_assisted_order_payment_observations','research_assisted_order_observation_immutable','research_assisted_order_financial_block_mutation()'),
    ('public.research_assisted_order_payment_verifications','research_assisted_order_verification_immutable','research_assisted_order_financial_block_mutation()'),
    ('public.research_assisted_order_evidence_claims','hl12_claim_immutable','research_assisted_order_financial_block_mutation()'),
    ('public.research_assisted_order_observation_corrections','hl12_correction_immutable','research_assisted_order_financial_block_mutation()'),
    ('public.research_assisted_order_events','research_assisted_order_events_append_only','research_assisted_order_events_block_mutation()'),
    ('public.research_assisted_order_requests','hl12_observed_cancel','research_assisted_order_observed_cancel_guard()'),
    ('public.research_assisted_order_payment_verifications','hl12_payment_effects_capture','research_assisted_order_payment_effects_capture()'),
    ('public.research_notification_outbox','hl12_payment_effects_outbox_guard','research_assisted_order_payment_effects_outbox_guard()')
  ) guards(relation_name,trigger_name,function_name) loop
    if not exists(select 1 from pg_trigger where tgrelid=to_regclass(g.relation_name)
      and tgname=g.trigger_name and tgfoid=to_regprocedure('public.'||g.function_name) and tgenabled in ('O','A') and not tgisinternal) then
      raise exception 'No-funds prerequisite guard missing or ineffective' using errcode='55000';
    end if;
  end loop;
  -- Never silently adopt a preexisting financial-disposition-shaped message.
  if to_regclass('public.research_assisted_order_financial_dispositions') is null
    and exists(select 1 from public.research_notification_outbox
      where event_key like 'assisted-order:%:financial-disposition:%'
        or lower(btrim(payload->>'customerMessage',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))='request cancelled. no funds were received for this request.') then
    raise exception 'Existing disposition messages need explicit reconciliation' using errcode='55000';
  end if;
end
$preflight$;

-- Separate capability: a manual mark-paid grant cannot resolve financial holds.
create table if not exists public.research_assisted_order_no_funds_grants (
  auth_user_id uuid not null,
  source_namespace text not null check(source_namespace ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  actor_label text not null,
  granted_by text not null check(length(btrim(granted_by))>0),
  granted_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  primary key(auth_user_id,source_namespace)
);
create table if not exists public.research_assisted_order_no_funds_evidence (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.research_assisted_order_requests(id) on update restrict on delete restrict,
  quote_id uuid not null references public.research_assisted_order_quotes(id) on update restrict on delete restrict,
  source_namespace text not null,
  source_receipt_id text not null,
  graph_fingerprint text not null check(graph_fingerprint ~ '^[0-9a-f]{64}$'),
  outcome text not null check(outcome='never_received'),
  finality text not null check(finality='terminal'),
  checked_at timestamptz not null,
  actor_auth_user_id uuid not null,
  receipt jsonb not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique(source_namespace,source_receipt_id)
);
create table if not exists public.research_assisted_order_financial_dispositions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.research_assisted_order_requests(id) on update restrict on delete restrict,
  quote_id uuid not null references public.research_assisted_order_quotes(id) on update restrict on delete restrict,
  evidence_id uuid not null unique references public.research_assisted_order_no_funds_evidence(id) on update restrict on delete restrict,
  idempotency_key text not null unique check(idempotency_key ~ '^[0-9a-f]{64}$'),
  kind text not null check(kind='no_funds'),
  from_status text not null check(from_status in ('reviewing','payment_pending','payment_review')),
  graph_fingerprint text not null check(graph_fingerprint ~ '^[0-9a-f]{64}$'),
  graph_snapshot jsonb not null,
  context_snapshot jsonb not null,
  resolved_by_auth_user_id uuid not null,
  resolved_by text not null,
  resolved_at timestamptz not null default date_trunc('milliseconds',clock_timestamp()),
  cancellation_reason text not null check(cancellation_reason='Independent terminal no-funds confirmation.')
);
alter table public.research_assisted_order_no_funds_grants enable row level security;
alter table public.research_assisted_order_no_funds_grants force row level security;
alter table public.research_assisted_order_no_funds_evidence enable row level security;
alter table public.research_assisted_order_no_funds_evidence force row level security;
alter table public.research_assisted_order_financial_dispositions enable row level security;
alter table public.research_assisted_order_financial_dispositions force row level security;
revoke all on public.research_assisted_order_no_funds_grants,public.research_assisted_order_no_funds_evidence,
  public.research_assisted_order_financial_dispositions from public,anon,authenticated,service_role;

create or replace function public.research_assisted_order_disposition_text_valid(p_value text,p_max integer)
returns boolean language sql immutable set search_path='' as $valid$
  select p_value is not null and coalesce((select sum(case when ascii(ch)>65535 then 2 else 1 end)
    from regexp_split_to_table(p_value,'') chars(ch)),0) between 1 and p_max
    and p_value !~ U&'[\0001-\001F\007F]'
    and p_value=btrim(p_value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$valid$;

-- Reserved truthful copy cannot escape binding by changing case/JS-trim space.
create or replace function public.research_assisted_order_disposition_reserved_copy(p_value text)
returns boolean language sql immutable set search_path='' as $copy$
  select lower(btrim(p_value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
    ='request cancelled. no funds were received for this request.';
$copy$;

-- Called only while the parent request is locked by context/commit/guards.
-- Every source row and correction edge is retained; bounds REFUSE, never LIMIT.
create or replace function public.research_assisted_order_disposition_graph(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $graph$
declare r public.research_assisted_order_requests%rowtype; q public.research_assisted_order_quotes%rowtype;
  observations jsonb; corrections jsonb; claims jsonb; snapshot jsonb; fingerprint text; context jsonb;
begin
  select * into r from public.research_assisted_order_requests where id=p_request_id;
  if not found then return null; end if;
  if r.status not in ('reviewing','payment_pending','payment_review')
    or exists(select 1 from public.research_assisted_order_events where request_id=r.id and status='paid')
    or exists(select 1 from public.research_assisted_order_payment_verifications where request_id=r.id)
    or exists(select 1 from public.research_assisted_order_payment_observations
      where request_id=r.id and (method<>'manual' or observed_by_auth_user_id is null
        or provider_name is not null or provider_event_id is not null or provider_payment_id is not null)) then
    raise exception 'Financial state cannot be resolved as never received'
      using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';
  end if;
  select * into q from public.research_assisted_order_quotes where request_id=r.id and state='accepted';
  if not found or q.acceptance_id is null or q.currency<>'USD'
    or exists(select 1 from public.research_assisted_order_quotes where request_id=r.id and version>q.version)
    or exists(select 1 from public.research_assisted_order_payment_observations where request_id=r.id and quote_id<>q.id) then
    raise exception 'An exact current accepted quote is required'
      using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';
  end if;
  if (select count(*) from public.research_assisted_order_payment_observations where request_id=r.id)>100
    or (select count(*) from public.research_assisted_order_evidence_claims where request_id=r.id)>100
    or (select count(*) from public.research_assisted_order_observation_corrections c
      join public.research_assisted_order_payment_observations o on o.id=c.observation_id
      where o.request_id=r.id)>100 then
    raise exception 'Financial graph exceeds the bounded qualification contract'
      using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';
  end if;
  if exists(select 1 from public.research_assisted_order_observation_corrections c
    left join public.research_assisted_order_payment_observations a on a.id=c.observation_id
    left join public.research_assisted_order_payment_observations b on b.id=c.replacement_id
    where (a.request_id=r.id or b.request_id=r.id)
      and (a.request_id is distinct from r.id or b.request_id is distinct from r.id
        or a.quote_id is distinct from q.id or b.quote_id is distinct from q.id))
    or exists(select 1 from public.research_assisted_order_payment_observations o
      where o.request_id=r.id and not exists(select 1 from public.research_assisted_order_evidence_claims c
        where c.method=o.method and c.provider_namespace=coalesce(o.provider_name,'')
          and c.evidence_ref=btrim(o.source_evidence_ref) and c.request_id=r.id))
    or exists(select 1 from public.research_assisted_order_evidence_claims c where c.request_id=r.id
      and not exists(select 1 from public.research_assisted_order_payment_observations o where o.request_id=r.id
        and o.method=c.method and coalesce(o.provider_name,'')=c.provider_namespace and btrim(o.source_evidence_ref)=c.evidence_ref)) then
    raise exception 'Financial source graph is incomplete or cross-request'
      using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';
  end if;
  if exists(with recursive walk(next_id,path,cycle) as (
    select c.replacement_id,array[c.observation_id],c.replacement_id=c.observation_id
      from public.research_assisted_order_observation_corrections c
      join public.research_assisted_order_payment_observations o on o.id=c.observation_id where o.request_id=r.id
    union all select c.replacement_id,w.path||c.observation_id,c.replacement_id=any(w.path||c.observation_id)
      from walk w join public.research_assisted_order_observation_corrections c on c.observation_id=w.next_id where not w.cycle
  ) select 1 from walk where cycle) then
    raise exception 'Financial correction graph contains a cycle'
      using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';
  end if;
  select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]') into observations
    from public.research_assisted_order_payment_observations o where request_id=r.id;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.observation_id),'[]') into corrections
    from public.research_assisted_order_observation_corrections c
    join public.research_assisted_order_payment_observations o on o.id=c.observation_id where o.request_id=r.id;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.method,c.provider_namespace,c.evidence_ref),'[]') into claims
    from public.research_assisted_order_evidence_claims c where request_id=r.id;
  snapshot:=jsonb_build_object('request',jsonb_build_object('id',r.id,'publicReference',r.public_reference,
    'status',r.status,'updatedAt',r.updated_at),'quote',to_jsonb(q),'observations',observations,'corrections',corrections,'claims',claims);
  fingerprint:=encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex');
  context:=jsonb_build_object('schemaVersion','assisted_order_no_funds_context_v1','requestId',r.id,'publicReference',r.public_reference,
    'fromStatus',r.status,'quoteId',q.id,'quoteVersion',q.version,'acceptanceId',q.acceptance_id,'totalCents',q.total_cents,'currency',q.currency,
    'graphFingerprint',fingerprint,'existingDispositionId',null,
    'observations',(select coalesce(jsonb_agg(jsonb_build_object('observationId',o.id,'quoteId',o.quote_id,'method',o.method,
      'paymentReference',o.payment_reference,'sourceEvidenceRef',o.source_evidence_ref,'observedAmountCents',o.observed_amount_cents,
      'observedCurrency',o.observed_currency,'observedAt',to_char(date_trunc('milliseconds',o.observed_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'recordedAt',to_char(date_trunc('milliseconds',o.recorded_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'observedByAuthUserId',o.observed_by_auth_user_id) order by o.id),'[]') from public.research_assisted_order_payment_observations o where request_id=r.id),
    'corrections',(select coalesce(jsonb_agg(jsonb_build_object('observationId',c.observation_id,'replacementId',c.replacement_id,
      'reason',c.reason,'correctedBy',c.corrected_by,
      'correctedAt',to_char(date_trunc('milliseconds',c.corrected_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by c.observation_id),'[]')
      from public.research_assisted_order_observation_corrections c join public.research_assisted_order_payment_observations o on o.id=c.observation_id where o.request_id=r.id));
  return jsonb_build_object('snapshot',snapshot,'context',context);
end
$graph$;

create or replace function public.research_assisted_order_disposition_context(p_request_id uuid,p_actor_auth_user_id uuid,p_source_namespace text)
returns jsonb language plpgsql security definer set search_path='' as $context$
declare d public.research_assisted_order_financial_dispositions%rowtype; g jsonb;
begin
  perform 1 from public.research_assisted_order_requests where id=p_request_id for update;
  if not found then return null; end if;
  select * into d from public.research_assisted_order_financial_dispositions where request_id=p_request_id;
  if found and d.resolved_by_auth_user_id=p_actor_auth_user_id then
    perform 1 from public.research_assisted_order_no_funds_grants grant_row
      join public.research_assisted_order_no_funds_evidence e on e.source_namespace=grant_row.source_namespace
      where e.id=d.evidence_id and e.source_namespace=p_source_namespace
        and grant_row.auth_user_id=p_actor_auth_user_id and grant_row.revoked_at is null for share of grant_row;
    if not found then raise exception 'Source graph access requires the active original source grant'
      using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED';end if;
    return d.context_snapshot||jsonb_build_object('existingDispositionId',d.id);
  end if;
  perform 1 from public.research_assisted_order_no_funds_grants
    where auth_user_id=p_actor_auth_user_id and source_namespace=p_source_namespace and revoked_at is null for share;
  if not found then
    raise exception 'A scoped no-funds grant is required' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED';
  end if;
  if d.id is not null then raise exception 'Request already has a terminal disposition' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';end if;
  g:=public.research_assisted_order_disposition_graph(p_request_id);
  return g->'context';
end
$context$;

create or replace function public.research_assisted_order_disposition_receipt(d public.research_assisted_order_financial_dispositions,p_replayed boolean)
returns jsonb language sql immutable set search_path='' as $receipt$
  select jsonb_build_object('dispositionId',d.id,'requestId',d.request_id,'quoteId',d.quote_id,'graphFingerprint',d.graph_fingerprint,
    'kind',d.kind,'state','cancelled','resolvedAt',to_char(d.resolved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'resolvedBy',d.resolved_by,'replayed',p_replayed);
$receipt$;

-- The trusted mounted adapter supplies this receipt after independent lookup.
-- SQL enforces scope/binding/finality and cannot authenticate bank facts itself.
create or replace function public.research_assisted_order_disposition_commit_cancel(
  p_request_id uuid,p_quote_id uuid,p_expected_graph_fingerprint text,p_actor_auth_user_id uuid,
  p_idempotency_key text,p_intent text,p_receipt jsonb)
returns jsonb language plpgsql security definer set search_path='' as $commit$
declare d public.research_assisted_order_financial_dispositions%rowtype; e public.research_assisted_order_no_funds_evidence%rowtype;
  grant_row public.research_assisted_order_no_funds_grants%rowtype; g jsonb; checked_at timestamptz; latest_at timestamptz;
begin
  perform 1 from public.research_assisted_order_requests where id=p_request_id for update;
  if not found then return null; end if;
  if p_intent is distinct from 'cancel' or p_quote_id is null or p_actor_auth_user_id is null
    or p_expected_graph_fingerprint is null or p_expected_graph_fingerprint !~ '^[0-9a-f]{64}$'
    or p_idempotency_key is null or p_idempotency_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid explicit no-funds cancellation command' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';
  end if;
  select * into d from public.research_assisted_order_financial_dispositions where request_id=p_request_id or idempotency_key=p_idempotency_key;
  if found then
    select * into e from public.research_assisted_order_no_funds_evidence where id=d.evidence_id;
    if d.request_id is distinct from p_request_id or d.quote_id is distinct from p_quote_id
      or d.graph_fingerprint is distinct from p_expected_graph_fingerprint or d.resolved_by_auth_user_id is distinct from p_actor_auth_user_id
      or d.idempotency_key is distinct from p_idempotency_key or e.receipt is distinct from p_receipt then
      raise exception 'No-funds replay differs from the immutable receipt' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REPLAY_CONFLICT';
    end if;
    return public.research_assisted_order_disposition_receipt(d,true);
  end if;
  if jsonb_typeof(p_receipt) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_receipt))<>9
    or p_receipt->>'schemaVersion' is distinct from 'assisted_order_no_funds_receipt_v1'
    or p_receipt->>'requestId' is distinct from p_request_id::text
    or p_receipt->>'quoteId' is distinct from p_quote_id::text
    or p_receipt->>'graphFingerprint' is distinct from p_expected_graph_fingerprint
    or p_receipt->>'outcome' is distinct from 'never_received' or p_receipt->>'finality' is distinct from 'terminal'
    or jsonb_typeof(p_receipt->'sourceNamespace') is distinct from 'string'
    or (p_receipt->>'sourceNamespace') !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
    or jsonb_typeof(p_receipt->'sourceReceiptId') is distinct from 'string'
    or public.research_assisted_order_disposition_text_valid(p_receipt->>'sourceReceiptId',160) is not true
    or jsonb_typeof(p_receipt->'checkedAt') is distinct from 'string'
    or (p_receipt->>'checkedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then
    raise exception 'Invalid independent no-funds receipt' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_RECEIPT_INVALID';
  end if;
  begin checked_at:=(p_receipt->>'checkedAt')::timestamptz;
  exception when others then raise exception 'Invalid receipt time' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_RECEIPT_INVALID';end;
  if not isfinite(checked_at) or checked_at>clock_timestamp() then
    raise exception 'Invalid receipt time' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_RECEIPT_INVALID';
  end if;
  -- Row SHARE conflicts with revocation UPDATE: the grant is valid at this
  -- serialized decision point, not merely when the remote lookup began.
  select * into grant_row from public.research_assisted_order_no_funds_grants
    where auth_user_id=p_actor_auth_user_id and source_namespace=p_receipt->>'sourceNamespace' and revoked_at is null for share;
  if not found or public.research_assisted_order_disposition_text_valid(grant_row.actor_label,512) is not true then
    raise exception 'A scoped auditable no-funds grant is required' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED';
  end if;
  g:=public.research_assisted_order_disposition_graph(p_request_id);
  if g->'context'->>'quoteId' is distinct from p_quote_id::text
    or g->'context'->>'graphFingerprint' is distinct from p_expected_graph_fingerprint then
    raise exception 'Financial source graph changed' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE';
  end if;
  select greatest((g->'snapshot'->'request'->>'updatedAt')::timestamptz,(g->'snapshot'->'quote'->>'accepted_at')::timestamptz,
    (select max(recorded_at) from public.research_assisted_order_payment_observations where request_id=p_request_id),
    (select max(observed_at) from public.research_assisted_order_payment_observations where request_id=p_request_id),
    (select max(claimed_at) from public.research_assisted_order_evidence_claims where request_id=p_request_id),
    (select max(c.corrected_at) from public.research_assisted_order_observation_corrections c
      join public.research_assisted_order_payment_observations o on o.id=c.observation_id where o.request_id=p_request_id)) into latest_at;
  if checked_at<date_trunc('milliseconds',latest_at) then
    raise exception 'Receipt predates financial source graph' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE';
  end if;
  if exists(select 1 from public.research_assisted_order_no_funds_evidence
    where source_namespace=p_receipt->>'sourceNamespace' and source_receipt_id=p_receipt->>'sourceReceiptId') then
    raise exception 'External receipt is already consumed' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_EVIDENCE_REUSED';
  end if;
  insert into public.research_assisted_order_no_funds_evidence(request_id,quote_id,source_namespace,source_receipt_id,
    graph_fingerprint,outcome,finality,checked_at,actor_auth_user_id,receipt)
  values(p_request_id,p_quote_id,p_receipt->>'sourceNamespace',p_receipt->>'sourceReceiptId',p_expected_graph_fingerprint,
    'never_received','terminal',checked_at,p_actor_auth_user_id,p_receipt) returning * into e;
  insert into public.research_assisted_order_financial_dispositions(request_id,quote_id,evidence_id,idempotency_key,kind,
    from_status,graph_fingerprint,graph_snapshot,context_snapshot,resolved_by_auth_user_id,resolved_by,cancellation_reason)
  values(p_request_id,p_quote_id,e.id,p_idempotency_key,'no_funds',g->'context'->>'fromStatus',p_expected_graph_fingerprint,
    g->'snapshot',g->'context',p_actor_auth_user_id,grant_row.actor_label,'Independent terminal no-funds confirmation.') returning * into d;
  perform public.research_assisted_order_set_status(p_request_id,d.from_status,'cancelled',d.resolved_by,'admin',
    'Request cancelled. No funds were received for this request.',null,
    jsonb_build_object('cancellationReason',d.cancellation_reason,'financialDispositionId',d.id),d.resolved_at);
  return public.research_assisted_order_disposition_receipt(d,false);
end
$commit$;

-- No rewriting/deleting originals, including TRUNCATE/CASCADE. Exact old
-- observation/correction replay may READ a receipt; it creates no authority.
create or replace function public.research_assisted_order_disposition_immutable()
returns trigger language plpgsql set search_path='' as $immutable$
begin raise exception 'Financial disposition graph is immutable' using errcode='P0001',detail='ASSISTED_ORDER_DISPOSITION_IMMUTABLE';end
$immutable$;
create or replace function public.research_assisted_order_disposition_terminal_guard()
returns trigger language plpgsql set search_path='' as $terminal$
declare request_uuid uuid; other_request uuid;
begin
  if tg_table_name='research_assisted_order_requests' then request_uuid:=new.id;
  elsif tg_table_name='research_assisted_order_observation_corrections' then
    select request_id into request_uuid from public.research_assisted_order_payment_observations where id=new.observation_id;
    select request_id into other_request from public.research_assisted_order_payment_observations where id=new.replacement_id;
    if request_uuid is null or (other_request is not null and other_request<>request_uuid) then
      raise exception 'Correction binding is invalid' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';end if;
  else request_uuid:=new.request_id;end if;
  perform 1 from public.research_assisted_order_requests where id=request_uuid for update;
  if exists(select 1 from public.research_assisted_order_financial_dispositions where request_id=request_uuid) then
    if tg_table_name='research_assisted_order_requests' then
      if new.status='cancelled' then return new;end if;
    end if;
    raise exception 'Terminal financial disposition forbids new financial writes or status revival'
      using errcode='P0001',detail='ASSISTED_ORDER_FINANCIAL_DISPOSITION_TERMINAL';
  end if;
  return new;
end
$terminal$;
create or replace function public.research_assisted_order_observed_cancel_guard()
returns trigger language plpgsql set search_path='' as $cancel$
begin
  if new.status='cancelled' and old.status<>'cancelled'
    and exists(select 1 from public.research_assisted_order_payment_observations where request_id=new.id)
    and not exists(select 1 from public.research_assisted_order_financial_dispositions d
      join public.research_assisted_order_no_funds_evidence e on e.id=d.evidence_id
      where d.request_id=new.id and d.from_status=old.status and d.kind='no_funds'
        and e.request_id=d.request_id and e.quote_id=d.quote_id and e.graph_fingerprint=d.graph_fingerprint
        and e.outcome='never_received' and e.finality='terminal') then
    raise exception 'Observed money requires a governed no-funds or refund resolution before cancellation'
      using errcode='P0001',detail='ASSISTED_ORDER_REFUND_AUTHORITY_NOT_READY';
  end if;
  return new;
end
$cancel$;

do $guards$
declare t text;
begin
  foreach t in array array['research_assisted_order_no_funds_evidence','research_assisted_order_financial_dispositions'] loop
    execute format('drop trigger if exists hl12_disposition_immutable on public.%I',t);
    execute format('create trigger hl12_disposition_immutable before update or delete on public.%I for each row execute function public.research_assisted_order_disposition_immutable()',t);
  end loop;
  foreach t in array array['research_assisted_order_no_funds_evidence','research_assisted_order_financial_dispositions',
    'research_assisted_order_payment_observations','research_assisted_order_payment_verifications','research_assisted_order_observation_corrections','research_assisted_order_evidence_claims',
    'research_assisted_order_events'] loop
    execute format('drop trigger if exists hl12_disposition_no_truncate on public.%I',t);
    execute format('create trigger hl12_disposition_no_truncate before truncate on public.%I for each statement execute function public.research_assisted_order_disposition_immutable()',t);
  end loop;
  foreach t in array array['research_assisted_order_payment_observations','research_assisted_order_payment_verifications',
    'research_assisted_order_observation_corrections','research_assisted_order_evidence_claims','research_assisted_order_quotes'] loop
    execute format('drop trigger if exists aa_hl12_disposition_terminal on public.%I',t);
    execute format('create trigger aa_hl12_disposition_terminal before insert on public.%I for each row execute function public.research_assisted_order_disposition_terminal_guard()',t);
  end loop;
end
$guards$;
drop trigger if exists aa_hl12_disposition_terminal on public.research_assisted_order_requests;
create trigger aa_hl12_disposition_terminal before update of status on public.research_assisted_order_requests
  for each row execute function public.research_assisted_order_disposition_terminal_guard();

create or replace function public.research_assisted_order_disposition_evidence_guard()
returns trigger language plpgsql security definer set search_path='' as $evidence$
declare g jsonb; granted_label text; latest_at timestamptz;
begin
  perform 1 from public.research_assisted_order_requests where id=new.request_id for update;
  if not found then raise exception 'No-funds request missing' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';end if;
  select actor_label into granted_label from public.research_assisted_order_no_funds_grants
    where auth_user_id=new.actor_auth_user_id and source_namespace=new.source_namespace and revoked_at is null for share;
  if not found or public.research_assisted_order_disposition_text_valid(granted_label,512) is not true then
    raise exception 'Scoped no-funds grant required' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED';end if;
  if new.source_namespace !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
    or public.research_assisted_order_disposition_text_valid(new.source_receipt_id,160) is not true
    or new.outcome is distinct from 'never_received' or new.finality is distinct from 'terminal'
    or new.checked_at is null or not isfinite(new.checked_at) or new.checked_at>clock_timestamp()
    or new.checked_at is distinct from date_trunc('milliseconds',new.checked_at)
    or new.receipt is distinct from jsonb_build_object('schemaVersion','assisted_order_no_funds_receipt_v1',
      'sourceNamespace',new.source_namespace,'sourceReceiptId',new.source_receipt_id,'requestId',new.request_id,'quoteId',new.quote_id,
      'graphFingerprint',new.graph_fingerprint,'outcome','never_received','finality','terminal',
      'checkedAt',to_char(new.checked_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) then
    raise exception 'No-funds receipt fields conflict' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_RECEIPT_INVALID';end if;
  g:=public.research_assisted_order_disposition_graph(new.request_id);
  if g->'context'->>'quoteId' is distinct from new.quote_id::text or g->'context'->>'graphFingerprint' is distinct from new.graph_fingerprint then
    raise exception 'Financial graph changed' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE';end if;
  select greatest((g->'snapshot'->'request'->>'updatedAt')::timestamptz,(g->'snapshot'->'quote'->>'accepted_at')::timestamptz,
    (select max(recorded_at) from public.research_assisted_order_payment_observations where request_id=new.request_id),
    (select max(observed_at) from public.research_assisted_order_payment_observations where request_id=new.request_id),
    (select max(claimed_at) from public.research_assisted_order_evidence_claims where request_id=new.request_id),
    (select max(c.corrected_at) from public.research_assisted_order_observation_corrections c
      join public.research_assisted_order_payment_observations o on o.id=c.observation_id where o.request_id=new.request_id)) into latest_at;
  if new.checked_at<date_trunc('milliseconds',latest_at) then
    raise exception 'Receipt predates graph' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE';end if;
  return new;
end
$evidence$;
drop trigger if exists hl12_disposition_evidence on public.research_assisted_order_no_funds_evidence;
create trigger hl12_disposition_evidence before insert on public.research_assisted_order_no_funds_evidence
  for each row execute function public.research_assisted_order_disposition_evidence_guard();

-- The correction replacement FK is deferred. Recheck BOTH visible endpoints
-- at commit, including a concurrently inserted replacement previously invisible.
create or replace function public.research_assisted_order_disposition_correction_edges_guard()
returns trigger language plpgsql security definer set search_path='' as $edges$
declare a public.research_assisted_order_payment_observations%rowtype; b public.research_assisted_order_payment_observations%rowtype;
begin
  select * into a from public.research_assisted_order_payment_observations where id=new.observation_id;
  select * into b from public.research_assisted_order_payment_observations where id=new.replacement_id;
  if a.id is null or b.id is null or a.request_id is distinct from b.request_id or a.quote_id is distinct from b.quote_id then
    raise exception 'Correction endpoints must bind the same request and quote'
      using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';end if;
  perform 1 from public.research_assisted_order_requests where id=a.request_id for update;
  if exists(select 1 from public.research_assisted_order_financial_dispositions where request_id=a.request_id) then
    raise exception 'Correction cannot change a terminal graph' using errcode='P0001',detail='ASSISTED_ORDER_FINANCIAL_DISPOSITION_TERMINAL';end if;
  return null;
end
$edges$;
drop trigger if exists hl12_disposition_correction_edges on public.research_assisted_order_observation_corrections;
create constraint trigger hl12_disposition_correction_edges after insert on public.research_assisted_order_observation_corrections
  deferrable initially deferred for each row execute function public.research_assisted_order_disposition_correction_edges_guard();

create or replace function public.research_assisted_order_disposition_cancel_event_guard()
returns trigger language plpgsql security definer set search_path='' as $event$
declare d public.research_assisted_order_financial_dispositions%rowtype;
begin
  perform 1 from public.research_assisted_order_requests where id=new.request_id for update;
  select * into d from public.research_assisted_order_financial_dispositions where request_id=new.request_id;
  if not found then
    if new.evidence ? 'financialDispositionId' then raise exception 'Cancellation disposition does not match the request'
      using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';end if;
    return new;
  end if;
  if new.status is distinct from 'cancelled' or new.actor_type is distinct from 'admin' or new.actor_id is distinct from d.resolved_by
    or new.occurred_at is distinct from d.resolved_at
    or new.evidence is distinct from jsonb_build_object('cancellationReason',d.cancellation_reason,'financialDispositionId',d.id)
    or new.customer_message is distinct from 'Request cancelled. No funds were received for this request.'
    or exists(select 1 from public.research_assisted_order_events where request_id=d.request_id and evidence ? 'financialDispositionId') then
    raise exception 'Terminal cancellation event binding conflicts' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';end if;
  return new;
end
$event$;
drop trigger if exists hl12_disposition_cancel_event on public.research_assisted_order_events;
create trigger hl12_disposition_cancel_event before insert on public.research_assisted_order_events
  for each row execute function public.research_assisted_order_disposition_cancel_event_guard();

alter table public.research_notification_outbox add column if not exists assisted_order_disposition_id uuid
  references public.research_assisted_order_financial_dispositions(id) on update restrict on delete restrict;
create unique index if not exists research_outbox_assisted_disposition_uq
  on public.research_notification_outbox(assisted_order_disposition_id) where assisted_order_disposition_id is not null;
alter table public.research_notification_outbox drop constraint if exists hl12_outbox_financial_binding_exclusive;
alter table public.research_notification_outbox add constraint hl12_outbox_financial_binding_exclusive
  check(assisted_order_disposition_id is null or assisted_order_verification_id is null);
create index if not exists research_outbox_assisted_disposition_pending_idx
  on public.research_notification_outbox(created_at,id) where assisted_order_disposition_id is not null and status='held';

create or replace function public.research_assisted_order_disposition_effects_audit_receipt(p_disposition_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $audit$
declare d public.research_assisted_order_financial_dispositions%rowtype; a public.research_assisted_order_audit_events_v1%rowtype;
begin
  select * into d from public.research_assisted_order_financial_dispositions where id=p_disposition_id;
  if not found then return null;end if;
  select * into a from public.research_assisted_order_audit_events_v1 where event_id=d.id;
  if not found then return null;end if;
  if a.event_key is distinct from 'assisted-order-audit:v1:'||d.id::text or a.request_id is distinct from d.request_id
    or a.event_type is distinct from 'assisted_order.status_changed' or a.actor_type is distinct from 'admin' or a.actor_alias is null
    or a.evidence is distinct from jsonb_build_object('from',d.from_status,'to','cancelled','authorityEvidenceKinds',jsonb_build_array('cancellation_reason_present'))
    or a.occurred_at is distinct from d.resolved_at or a.schema_version is distinct from 'research_assisted_order_audit_v1'
    or a.attestation is distinct from 'research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694' then
    raise exception 'Disposition audit binding conflicts' using errcode='P0001',detail='ASSISTED_ORDER_DISPOSITION_EFFECTS_CONFLICT';
  end if;
  return jsonb_build_object('state','replayed','eventId',a.event_id,'eventKey',a.event_key,'requestId',a.request_id,
    'eventType',a.event_type,'eventFingerprint',a.event_fingerprint,'schemaVersion',a.schema_version,'attestation',a.attestation);
end
$audit$;

create or replace function public.research_assisted_order_disposition_effects_outbox_guard()
returns trigger language plpgsql security definer set search_path='' as $guard$
declare d public.research_assisted_order_financial_dispositions%rowtype; r public.research_assisted_order_requests%rowtype;
  old_bound boolean:=false; new_bound boolean:=false;
begin
  if tg_op='TRUNCATE' then
    if exists(select 1 from public.research_notification_outbox where assisted_order_disposition_id is not null) then
      raise exception 'Disposition intents cannot be truncated' using errcode='P0001',detail='ASSISTED_ORDER_DISPOSITION_IMMUTABLE';end if;
    return null;
  end if;
  if tg_op<>'INSERT' then old_bound:=old.assisted_order_disposition_id is not null
    or old.event_key like 'assisted-order:%:financial-disposition:%'
    or public.research_assisted_order_disposition_reserved_copy(old.payload->>'customerMessage');end if;
  if tg_op<>'DELETE' then
    new_bound:=new.assisted_order_disposition_id is not null or new.event_key like 'assisted-order:%:financial-disposition:%'
      or public.research_assisted_order_disposition_reserved_copy(new.payload->>'customerMessage');
    -- A stripped financial FK/key must not turn the same resolved request's
    -- canonical cancellation envelope into an unguarded generic notice.
    if new.template_key='research.assisted_order.status_changed.customer' and new.payload->>'status'='cancelled'
      and exists(select 1 from public.research_assisted_order_financial_dispositions x
        join public.research_assisted_order_requests y on y.id=x.request_id where y.public_reference=new.payload->>'publicReference') then new_bound:=true;end if;
  end if;
  if tg_op='DELETE' then
    if coalesce(old_bound,false) then raise exception 'Disposition intent cannot be deleted' using errcode='P0001',detail='ASSISTED_ORDER_DISPOSITION_IMMUTABLE';end if;
    return old;
  end if;
  if not coalesce(old_bound,false) and not coalesce(new_bound,false) then return new;end if;
  if tg_op='UPDATE' then
    if not coalesce(old_bound,false) or not coalesce(new_bound,false)
      or row(new.id,new.event_key,new.application_id,new.member_id,new.event_type,new.channel,new.recipient,new.template_key,
        new.payload,new.created_at,new.assisted_order_disposition_id,new.assisted_order_verification_id)
      is distinct from row(old.id,old.event_key,old.application_id,old.member_id,old.event_type,old.channel,old.recipient,old.template_key,
        old.payload,old.created_at,old.assisted_order_disposition_id,old.assisted_order_verification_id) then
      raise exception 'Disposition notification identity is immutable' using errcode='P0001',detail='ASSISTED_ORDER_DISPOSITION_IMMUTABLE';
    end if;
    if (old.status='held' and new.status not in ('held','pending')) or (old.status<>'held' and new.status='held')
      or (new.status<>'held' and public.research_assisted_order_disposition_effects_audit_receipt(new.assisted_order_disposition_id) is null)
      or (old.status='held' and (new.attempt_count<>0 or new.last_attempt_at is not null or new.provider_message_id is not null or new.completed_at is not null)) then
      raise exception 'Disposition audit required before dispatch' using errcode='P0001',detail='ASSISTED_ORDER_DISPOSITION_EFFECTS_AUDIT_REQUIRED';
    end if;
    return new;
  end if;
  select * into d from public.research_assisted_order_financial_dispositions where id=new.assisted_order_disposition_id;
  if not found then raise exception 'A real disposition is required' using errcode='P0001',detail='ASSISTED_ORDER_DISPOSITION_EFFECTS_CONFLICT';end if;
  select * into strict r from public.research_assisted_order_requests where id=d.request_id;
  if new.event_key is distinct from 'assisted-order:'||d.request_id::text||':financial-disposition:'||d.id::text
    or new.event_type is distinct from 'assisted_order.status_changed' or new.channel is distinct from 'email'
    or new.template_key is distinct from 'research.assisted_order.status_changed.customer' or new.recipient is distinct from r.normalized_email
    or new.payload is distinct from jsonb_build_object('publicReference',r.public_reference,'status','cancelled',
      'customerMessage','Request cancelled. No funds were received for this request.')
    or new.created_at is distinct from d.resolved_at or new.application_id is not null or new.member_id is not null
    or new.assisted_order_verification_id is not null or new.status<>'held' or new.attempt_count<>0
    or new.last_attempt_at is not null or new.provider_message_id is not null or new.completed_at is not null then
    raise exception 'Disposition notification binding conflicts' using errcode='P0001',detail='ASSISTED_ORDER_DISPOSITION_EFFECTS_CONFLICT';
  end if;
  return new;
end
$guard$;
drop trigger if exists hl12_disposition_effects_outbox on public.research_notification_outbox;
create trigger hl12_disposition_effects_outbox before insert or update or delete on public.research_notification_outbox
  for each row execute function public.research_assisted_order_disposition_effects_outbox_guard();
drop trigger if exists hl12_disposition_effects_truncate on public.research_notification_outbox;
create trigger hl12_disposition_effects_truncate before truncate on public.research_notification_outbox
  for each statement execute function public.research_assisted_order_disposition_effects_outbox_guard();

create or replace function public.research_assisted_order_disposition_capture()
returns trigger language plpgsql security definer set search_path='' as $capture$
declare e public.research_assisted_order_no_funds_evidence%rowtype; r public.research_assisted_order_requests%rowtype; g jsonb;
begin
  select * into strict r from public.research_assisted_order_requests where id=new.request_id for update;
  select * into strict e from public.research_assisted_order_no_funds_evidence where id=new.evidence_id;
  g:=public.research_assisted_order_disposition_graph(new.request_id);
  if e.request_id is distinct from new.request_id or e.quote_id is distinct from new.quote_id
    or e.graph_fingerprint is distinct from new.graph_fingerprint or e.actor_auth_user_id is distinct from new.resolved_by_auth_user_id
    or new.graph_snapshot is distinct from g->'snapshot' or new.context_snapshot is distinct from g->'context'
    or new.from_status is distinct from r.status or new.graph_fingerprint is distinct from g->'context'->>'graphFingerprint'
    or new.resolved_at is distinct from date_trunc('milliseconds',new.resolved_at)
    or public.research_assisted_order_disposition_text_valid(new.resolved_by,512) is not true
    or not exists(select 1 from public.research_assisted_order_no_funds_grants
      where auth_user_id=new.resolved_by_auth_user_id and source_namespace=e.source_namespace and revoked_at is null and actor_label=new.resolved_by) then
    raise exception 'Disposition source binding conflicts' using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';
  end if;
  insert into public.research_notification_outbox(event_key,event_type,channel,recipient,template_key,payload,status,created_at,updated_at,assisted_order_disposition_id)
  values('assisted-order:'||new.request_id::text||':financial-disposition:'||new.id::text,'assisted_order.status_changed','email',r.normalized_email,
    'research.assisted_order.status_changed.customer',jsonb_build_object('publicReference',r.public_reference,'status','cancelled',
    'customerMessage','Request cancelled. No funds were received for this request.'),'held',new.resolved_at,new.resolved_at,new.id);
  return new;
end
$capture$;
drop trigger if exists hl12_disposition_capture on public.research_assisted_order_financial_dispositions;
create trigger hl12_disposition_capture after insert on public.research_assisted_order_financial_dispositions
  for each row execute function public.research_assisted_order_disposition_capture();

-- An owner-level direct insert may not leave a standalone disposition or a
-- consumed evidence row without its cancellation/event/held intent transaction.
create or replace function public.research_assisted_order_disposition_transaction_guard()
returns trigger language plpgsql security definer set search_path='' as $transaction$
declare d public.research_assisted_order_financial_dispositions%rowtype;
begin
  if tg_table_name='research_assisted_order_no_funds_evidence' then
    select * into d from public.research_assisted_order_financial_dispositions where evidence_id=new.id;
  else select * into d from public.research_assisted_order_financial_dispositions where id=new.id;end if;
  if not found or not exists(select 1 from public.research_assisted_order_requests where id=d.request_id and status='cancelled')
    or not exists(select 1 from public.research_assisted_order_events where request_id=d.request_id and status='cancelled'
      and actor_type='admin' and actor_id=d.resolved_by and occurred_at=d.resolved_at
      and evidence=jsonb_build_object('cancellationReason',d.cancellation_reason,'financialDispositionId',d.id))
    or not exists(select 1 from public.research_notification_outbox where assisted_order_disposition_id=d.id) then
    raise exception 'Disposition requires atomic cancellation, event and held intent'
      using errcode='P0001',detail='ASSISTED_ORDER_NO_FUNDS_REFUSED';
  end if;
  return null;
end
$transaction$;
drop trigger if exists hl12_disposition_transaction on public.research_assisted_order_financial_dispositions;
create constraint trigger hl12_disposition_transaction after insert on public.research_assisted_order_financial_dispositions
  deferrable initially deferred for each row execute function public.research_assisted_order_disposition_transaction_guard();
drop trigger if exists hl12_disposition_evidence_transaction on public.research_assisted_order_no_funds_evidence;
create constraint trigger hl12_disposition_evidence_transaction after insert on public.research_assisted_order_no_funds_evidence
  deferrable initially deferred for each row execute function public.research_assisted_order_disposition_transaction_guard();

create or replace function public.research_assisted_order_disposition_effects_context(p_disposition_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $context$
declare d public.research_assisted_order_financial_dispositions%rowtype; o public.research_notification_outbox%rowtype; a jsonb;
begin
  select * into d from public.research_assisted_order_financial_dispositions where id=p_disposition_id;
  if not found then return null;end if;
  select * into o from public.research_notification_outbox where assisted_order_disposition_id=d.id;
  if not found or o.event_key is distinct from 'assisted-order:'||d.request_id::text||':financial-disposition:'||d.id::text
    or o.event_type is distinct from 'assisted_order.status_changed' or o.template_key is distinct from 'research.assisted_order.status_changed.customer'
    or o.channel is distinct from 'email' or o.created_at is distinct from d.resolved_at then
    raise exception 'Disposition effect binding conflicts' using errcode='P0001',detail='ASSISTED_ORDER_DISPOSITION_EFFECTS_CONFLICT';end if;
  a:=public.research_assisted_order_disposition_effects_audit_receipt(d.id);
  if o.status<>'held' and a is null then raise exception 'Disposition audit required' using errcode='P0001',detail='ASSISTED_ORDER_DISPOSITION_EFFECTS_AUDIT_REQUIRED';end if;
  return jsonb_build_object('dispositionId',d.id,'requestId',d.request_id,'fromStatus',d.from_status,
    'resolvedAt',to_char(d.resolved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'resolvedBy',d.resolved_by,
    'outboxId',o.id,'outboxStatus',o.status,'state',case when o.status='held' then 'pending' else 'complete' end,'auditReceipt',a);
end
$context$;
create or replace function public.research_assisted_order_disposition_effects_pending(
  p_after_created_at timestamptz default null,p_after_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $pending$
begin
  if (p_after_created_at is null)<>(p_after_id is null) or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid disposition effects cursor' using errcode='22023';end if;
  return(select coalesce(jsonb_agg(jsonb_build_object('dispositionId',x.assisted_order_disposition_id,'outboxId',x.id,
    'createdAt',to_char(x.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by x.created_at,x.id),'[]')
    from(select id,created_at,assisted_order_disposition_id from public.research_notification_outbox
      where assisted_order_disposition_id is not null and status='held'
        and (p_after_created_at is null or (created_at,id)>(p_after_created_at,p_after_id)) order by created_at,id limit p_limit)x);
end
$pending$;
create or replace function public.research_assisted_order_disposition_effects_complete(
  p_disposition_id uuid,p_schema_version text,p_attestation text,p_event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $complete$
declare o public.research_notification_outbox%rowtype; c jsonb;
begin
  select * into o from public.research_notification_outbox where assisted_order_disposition_id=p_disposition_id for update;
  if not found then return null;end if;
  c:=public.research_assisted_order_disposition_effects_context(p_disposition_id);
  if c->'auditReceipt'='null'::jsonb then
    if p_event->>'eventId' is distinct from c->>'dispositionId' or p_event->>'requestId' is distinct from c->>'requestId'
      or p_event->>'eventType' is distinct from 'assisted_order.status_changed' or p_event->>'actorType' is distinct from 'admin'
      or p_event->>'occurredAt' is distinct from c->>'resolvedAt'
      or p_event->'evidence' is distinct from jsonb_build_object('from',c->>'fromStatus','to','cancelled','authorityEvidenceKinds',jsonb_build_array('cancellation_reason_present')) then
      raise exception 'Disposition audit binding conflicts' using errcode='P0001',detail='ASSISTED_ORDER_DISPOSITION_EFFECTS_CONFLICT';end if;
    perform public.research_assisted_order_audit_append(p_schema_version,p_attestation,p_event);
  end if;
  if o.status='held' then update public.research_notification_outbox set status='pending',updated_at=clock_timestamp() where id=o.id;end if;
  return public.research_assisted_order_disposition_effects_context(p_disposition_id);
end
$complete$;
create or replace function public.research_assisted_order_disposition_effects_outbox_ready(
  p_outbox_id uuid,p_disposition_id uuid,p_event_key text,p_recipient text,p_template_key text,p_payload jsonb)
returns boolean language plpgsql security definer set search_path='' as $ready$
declare o public.research_notification_outbox%rowtype;
begin
  if p_disposition_id is null then return false;end if;
  select * into o from public.research_notification_outbox where id=p_outbox_id;
  if not found or o.assisted_order_disposition_id is distinct from p_disposition_id or o.event_key is distinct from p_event_key
    or o.recipient is distinct from p_recipient or o.template_key is distinct from p_template_key or o.payload is distinct from p_payload
    or o.status not in ('pending','processing','failed_retryable') then return false;end if;
  return public.research_assisted_order_disposition_effects_context(p_disposition_id)->>'state'='complete';
end
$ready$;
create or replace function public.research_assisted_order_disposition_effects_authority()
returns jsonb language sql stable security definer set search_path='' as $authority$
  select jsonb_build_object('schemaVersion','research_assisted_order_disposition_effects_v1',
    'intentPolicy','no_funds_cancel_atomic_canonical_outbox_v1','auditPolicy','canonical_audit_before_dispatch_v1','historicalAdoption',false,
    'allowedOutcomes',jsonb_build_array('never_received'),'allowedFinality',jsonb_build_array('terminal'),'unsupportedKinds',jsonb_build_array('void','refund'));
$authority$;

-- Explicit allowlist over exact signatures. New private helpers and tables
-- never inherit Supabase's permissive default privileges.
do $acl$
declare p record; v_role text; permitted boolean;
begin
  for p in select oid,proname from pg_proc where pronamespace='public'::regnamespace
    and (proname like 'research_assisted_order_disposition_%' or proname='research_assisted_order_observed_cancel_guard') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',p.oid::regprocedure);
    permitted:=p.oid=any(array[
      'public.research_assisted_order_disposition_context(uuid,uuid,text)'::regprocedure,
      'public.research_assisted_order_disposition_commit_cancel(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure,
      'public.research_assisted_order_disposition_effects_authority()'::regprocedure,
      'public.research_assisted_order_disposition_effects_context(uuid)'::regprocedure,
      'public.research_assisted_order_disposition_effects_pending(timestamptz,uuid,integer)'::regprocedure,
      'public.research_assisted_order_disposition_effects_complete(uuid,text,text,jsonb)'::regprocedure,
      'public.research_assisted_order_disposition_effects_outbox_ready(uuid,uuid,text,text,text,jsonb)'::regprocedure]::oid[]);
    if permitted then execute format('grant execute on function %s to service_role',p.oid::regprocedure);end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role,p.oid,'EXECUTE') is distinct from (permitted and v_role='service_role') then
        raise exception 'Disposition function ACL mismatch' using errcode='55000';end if;
    end loop;
  end loop;
end
$acl$;
commit;
