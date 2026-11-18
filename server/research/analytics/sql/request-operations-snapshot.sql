-- Source candidate only. Root allocates the canonical migration and activation.
-- Counts are unclassified source coverage, never operational denominators.
begin;
set local lock_timeout = '5s';

create or replace function request_intent_private.operations_snapshot(
  p_start_at timestamptz, p_end_at timestamptz
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  observed timestamptz := statement_timestamp();
  source record;
  facts jsonb;
  sources jsonb := '{}'::jsonb;
begin
  if current_setting('role', true) is distinct from 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'operations_snapshot_backend_only';
  end if;
  if p_start_at is null or p_end_at is null or not isfinite(p_start_at) or not isfinite(p_end_at)
    or p_start_at >= p_end_at or p_end_at - p_start_at > interval '32 days' then
    raise exception using errcode = '22023', message = 'invalid_operations_window';
  end if;
  -- STABLE keeps these reads on the caller's one statement snapshot. Literal
  -- authorities only: no user-supplied relation, scope, expression or identity.
  for source in select * from (values
    ('requests', 'request_intent_private.requests', 'created_at', 'true'),
    ('workflows', 'request_intent_private.workflow', 'changed_at', 'true'),
    ('workflowEvents', 'request_intent_private.workflow_events', 'occurred_at', 'true'),
    ('outbox', 'public.research_notification_outbox', 'created_at',
      '(event_key like ''ea-request-submitted-%'' or event_key like ''ea-request-customer-%'')'),
    ('support', 'public.research_member_questions', 'created_at', 'true')
  ) as definitions(key, relation_name, time_column, predicate) loop
    facts := jsonb_build_object('state', 'unavailable', 'totalRecords', null,
      'windowRecords', null, 'latestAt', null);
    if to_regclass(source.relation_name) is not null then
      begin
        -- No contact, body, address, intake, recipient, subject or audit read.
        -- No LIMIT: a source with >1,000 rows is not silently truncated.
        execute format(
          'select jsonb_build_object(''state'',''observed'',''totalRecords'',count(*),'
          || '''windowRecords'',count(*) filter (where %1$I >= $1 and %1$I < $2),'
          || '''latestAt'',to_char(max(%1$I) at time zone ''UTC'',''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"''))'
          || ' from %2$s where %1$I <= $3 and (%3$s)',
          source.time_column, source.relation_name, source.predicate)
          into facts using p_start_at, p_end_at, observed;
      exception when undefined_table or undefined_column or insufficient_privilege then
        -- A missing optional authority is unavailable, never a measured zero.
        facts := jsonb_build_object('state', 'unavailable', 'totalRecords', null,
          'windowRecords', null, 'latestAt', null);
      end;
    end if;
    sources := sources || jsonb_build_object(source.key, facts);
  end loop;
  return jsonb_build_object('schemaVersion', 1,
    'observedAt', to_char(observed at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'windowStart', to_char(p_start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'windowEnd', to_char(p_end_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'sources', sources);
end;
$$;

create or replace function public.request_intent_operations_snapshot(
  p_start_at timestamptz, p_end_at timestamptz
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select request_intent_private.operations_snapshot(p_start_at, p_end_at);
$$;

revoke all on function request_intent_private.operations_snapshot(timestamptz,timestamptz),
  public.request_intent_operations_snapshot(timestamptz,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function request_intent_private.operations_snapshot(timestamptz,timestamptz),
  public.request_intent_operations_snapshot(timestamptz,timestamptz)
  to service_role;
commit;
