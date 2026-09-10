-- CANDIDATE ONLY. Generated with Supabase CLI migration new, then prepared here.
-- No installed financial function or historical idempotency record is changed.
-- This is operational metadata, not payment/credit/order authority.

create function public.research_checkout_recovery_operation(
  p_action text, p_owner uuid default null, p_fence bigint default null,
  p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security invoker
set search_path = ''
set timezone = 'UTC'
set datestyle = 'ISO, YMD'
as $$
declare
  v_control public.research_idempotency_keys%rowtype;
  v_execution public.research_checkout_executions%rowtype;
  v_state jsonb;
  v_pending jsonb;
  v_outcome jsonb;
  v_existing jsonb;
  v_now timestamptz;
  v_before timestamptz;
  v_observed timestamptz;
  v_cursor timestamptz;
  v_intent uuid;
  v_execution_id uuid;
  v_code text;
  v_created boolean := false;
begin
  if (p_action in ('read','claim','renew','begin','complete','exhaust','release')
      and jsonb_typeof(p_data) = 'object') is not true then
    raise exception 'recovery_request_invalid' using errcode = '22023';
  end if;
  if p_action in ('read','claim','renew','exhaust','release') and p_data <> '{}'::jsonb then
    raise exception 'recovery_request_invalid' using errcode = '22023';
  end if;
  if p_action = 'read' then
    if p_owner is not null or p_fence is not null then
      raise exception 'recovery_request_invalid' using errcode = '22023';
    end if;
  elsif p_owner is null or (p_action = 'claim' and p_fence is not null)
      or (p_action <> 'claim' and (p_fence is null or p_fence < 1)) then
    raise exception 'recovery_request_invalid' using errcode = '22023';
  end if;

  -- The unique namespace serializes first initialization. Existing null or
  -- corrupt values are never overwritten as though the namespace were absent.
  if p_action = 'claim' then
    v_now := clock_timestamp();
    insert into public.research_idempotency_keys(scope, key, result)
    values ('checkout_recovery_control_v1', 'singleton', jsonb_build_object(
      'schemaVersion', 1, 'owner', null, 'fence', '1', 'leaseUntil', null,
      'cycleId', gen_random_uuid()::text,
      'before', date_trunc('milliseconds', v_now - interval '5 minutes'),
      'after', null, 'exhausted', false, 'pending', null))
    on conflict (scope, key) do nothing;
    v_created := found;
  end if;
  if p_action = 'read' then
    select * into v_control from public.research_idempotency_keys
      where scope = 'checkout_recovery_control_v1' and key = 'singleton';
  else
    select * into v_control from public.research_idempotency_keys
      where scope = 'checkout_recovery_control_v1' and key = 'singleton' for update;
  end if;
  if not found then
    if p_action = 'read' then return jsonb_build_object('status','absent'); end if;
    raise exception 'recovery_state_missing' using errcode = '22023';
  end if;
  v_state := v_control.result;
  -- Refresh only after acquiring the row lock: waiting cannot extend an old lease.
  v_now := clock_timestamp();
  if (jsonb_typeof(v_state) = 'object'
      and v_state ?& array['schemaVersion','owner','fence','leaseUntil','cycleId','before','after','exhausted','pending']
      and v_state - array['schemaVersion','owner','fence','leaseUntil','cycleId','before','after','exhausted','pending'] = '{}'::jsonb
      and v_state->'schemaVersion' = '1'::jsonb
      and jsonb_typeof(v_state->'fence') = 'string' and v_state->>'fence' ~ '^[1-9][0-9]*$'
      and (v_state->>'fence')::bigint >= 1
      and jsonb_typeof(v_state->'cycleId') = 'string' and (v_state->>'cycleId')::uuid::text = v_state->>'cycleId'
      and jsonb_typeof(v_state->'before') = 'string'
      and jsonb_typeof(v_state->'exhausted') = 'boolean'
      and ((v_state->'owner' = 'null'::jsonb and v_state->'leaseUntil' = 'null'::jsonb)
        or (jsonb_typeof(v_state->'owner') = 'string' and (v_state->>'owner')::uuid::text = v_state->>'owner'
          and jsonb_typeof(v_state->'leaseUntil') = 'string'
          and v_state->>'leaseUntil' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'))
      and v_state->>'before' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$') is not true then
    raise exception 'recovery_state_invalid' using errcode = '22023';
  end if;
  v_before := (v_state->>'before')::timestamptz;
  if v_before <> date_trunc('milliseconds', v_before) then
    raise exception 'recovery_state_invalid' using errcode = '22023';
  end if;
  if v_state->'leaseUntil' <> 'null'::jsonb then perform (v_state->>'leaseUntil')::timestamptz; end if;
  if v_state->'after' <> 'null'::jsonb then
    if (jsonb_typeof(v_state->'after') = 'object'
        and (v_state->'after') ?& array['updatedAt','executionId']
        and (v_state->'after') - array['updatedAt','executionId'] = '{}'::jsonb
        and jsonb_typeof(v_state->'after'->'updatedAt') = 'string'
        and jsonb_typeof(v_state->'after'->'executionId') = 'string'
        and (v_state->'after'->>'executionId')::uuid::text = v_state->'after'->>'executionId'
        and v_state->'after'->>'updatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$') is not true then
      raise exception 'recovery_state_invalid' using errcode = '22023';
    end if;
    v_cursor := (v_state->'after'->>'updatedAt')::timestamptz;
    if v_cursor >= v_before then raise exception 'recovery_state_invalid' using errcode = '22023'; end if;
  end if;
  v_pending := v_state->'pending';
  if v_pending <> 'null'::jsonb then
    if (jsonb_typeof(v_pending) = 'object'
        and v_pending ?& array['intentId','executionId','memberId','orderId','requestKey','observedUpdatedAt','observedPhase','decision']
        and v_pending - array['intentId','executionId','memberId','orderId','requestKey','observedUpdatedAt','observedPhase','decision'] = '{}'::jsonb
        and jsonb_typeof(v_pending->'intentId') = 'string' and (v_pending->>'intentId')::uuid::text = v_pending->>'intentId'
        and jsonb_typeof(v_pending->'executionId') = 'string' and (v_pending->>'executionId')::uuid::text = v_pending->>'executionId'
        and jsonb_typeof(v_pending->'memberId') = 'string' and (v_pending->>'memberId')::uuid::text = v_pending->>'memberId'
        and jsonb_typeof(v_pending->'orderId') = 'string' and (v_pending->>'orderId')::uuid::text = v_pending->>'orderId'
        and jsonb_typeof(v_pending->'requestKey') = 'string' and char_length(v_pending->>'requestKey') between 8 and 120
        and jsonb_typeof(v_pending->'observedUpdatedAt') = 'string'
        and v_pending->>'observedUpdatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
        and v_pending->>'observedPhase' in ('reserved','authorizing','action_required','authorized','capturing','captured','cancelling','cancelled','reconciliation_required')
        and v_pending->>'decision' in ('settle','skip')) is not true then
      raise exception 'recovery_state_invalid' using errcode = '22023';
    end if;
    v_observed := (v_pending->>'observedUpdatedAt')::timestamptz;
    if v_observed >= v_before or (v_cursor is not null and
        (v_observed, (v_pending->>'executionId')::uuid) <= (v_cursor, (v_state->'after'->>'executionId')::uuid)) then
      raise exception 'recovery_state_invalid' using errcode = '22023';
    end if;
  end if;
  if v_state->'exhausted' = 'true'::jsonb and v_pending <> 'null'::jsonb then
    raise exception 'recovery_state_invalid' using errcode = '22023';
  end if;
  if p_action = 'read' then return jsonb_build_object('status','read','state',v_state); end if;

  if p_action = 'claim' then
    if v_state->'owner' <> 'null'::jsonb and (v_state->>'leaseUntil')::timestamptz > v_now then
      if v_state->>'owner' <> p_owner::text then return jsonb_build_object('status','busy'); end if;
      return jsonb_build_object('status','acquired','state',v_state);
    end if;
    if v_state->'exhausted' = 'true'::jsonb then
      v_state := v_state || jsonb_build_object('cycleId',gen_random_uuid()::text,
        'before',date_trunc('milliseconds',v_now - interval '5 minutes'),'after',null,'exhausted',false);
    end if;
    v_state := v_state || jsonb_build_object('owner',p_owner::text,'leaseUntil',v_now + interval '120 seconds',
      'fence',case when v_created then '1' else ((v_state->>'fence')::bigint + 1)::text end);
  else
    if (v_state->>'owner' = p_owner::text and (v_state->>'fence')::bigint = p_fence
        and (v_state->>'leaseUntil')::timestamptz > v_now) is not true then
      raise exception 'recovery_lease_lost' using errcode = '55000';
    end if;
    if p_action = 'renew' then
      v_state := v_state || jsonb_build_object('leaseUntil',v_now + interval '120 seconds');
    elsif p_action = 'release' then
      v_state := v_state || jsonb_build_object('owner',null,'leaseUntil',null);
    elsif p_action = 'begin' then
      if (p_data ?& array['intentId','executionId','observedUpdatedAt','observedPhase','decision']
          and p_data - array['intentId','executionId','observedUpdatedAt','observedPhase','decision'] = '{}'::jsonb
          and jsonb_typeof(p_data->'intentId') = 'string' and (p_data->>'intentId')::uuid::text = p_data->>'intentId'
          and jsonb_typeof(p_data->'executionId') = 'string' and (p_data->>'executionId')::uuid::text = p_data->>'executionId'
          and jsonb_typeof(p_data->'observedUpdatedAt') = 'string'
          and p_data->>'observedUpdatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
          and p_data->>'observedPhase' in ('reserved','authorizing','action_required','authorized','capturing','captured','cancelling','cancelled','reconciliation_required')
          and p_data->>'decision' in ('settle','skip') and v_state->'exhausted' = 'false'::jsonb) is not true then
        raise exception 'recovery_begin_invalid' using errcode = '22023';
      end if;
      v_intent := (p_data->>'intentId')::uuid;
      v_execution_id := (p_data->>'executionId')::uuid;
      v_observed := (p_data->>'observedUpdatedAt')::timestamptz;
      if v_pending <> 'null'::jsonb then
        if v_pending - array['memberId','orderId','requestKey'] = p_data then
          return jsonb_build_object('status','ok','state',v_state);
        end if;
        raise exception 'recovery_pending_conflict' using errcode = '55000';
      end if;
      if v_observed >= v_before or (v_cursor is not null and
          (v_observed, v_execution_id) <= (v_cursor, (v_state->'after'->>'executionId')::uuid)) then
        raise exception 'recovery_begin_position_invalid' using errcode = '22023';
      end if;
      if exists (select 1 from public.research_idempotency_keys where scope = 'checkout_recovery_outcome_v1' and key = v_intent::text) then
        raise exception 'recovery_intent_reused' using errcode = '55000';
      end if;
      select * into v_execution from public.research_checkout_executions where id = v_execution_id;
      if not found or v_execution.updated_at < v_observed then
        raise exception 'recovery_execution_unavailable' using errcode = '55000';
      end if;
      v_pending := p_data || jsonb_build_object('memberId',v_execution.member_id::text,
        'orderId',v_execution.order_id::text,'requestKey',v_execution.request_key);
      v_state := v_state || jsonb_build_object('pending',v_pending);
    elsif p_action = 'complete' then
      if (p_data ?& array['intentId','code'] and p_data - array['intentId','code'] = '{}'::jsonb
          and jsonb_typeof(p_data->'intentId') = 'string' and (p_data->>'intentId')::uuid::text = p_data->>'intentId'
          and p_data->>'code' in ('settled_committed','settled_cancelled','left_pending','contended','needs_person','vanished','skipped','attempt_failed')) is not true then
        raise exception 'recovery_completion_invalid' using errcode = '22023';
      end if;
      v_intent := (p_data->>'intentId')::uuid;
      v_code := p_data->>'code';
      select result into v_existing from public.research_idempotency_keys
        where scope = 'checkout_recovery_outcome_v1' and key = v_intent::text;
      if v_pending = 'null'::jsonb then
        if (found and jsonb_typeof(v_existing) = 'object'
            and v_existing ?& array['schemaVersion','cycleId','intent','code','recordedAt']
            and v_existing - array['schemaVersion','cycleId','intent','code','recordedAt'] = '{}'::jsonb
            and v_existing->'schemaVersion' = '1'::jsonb
            and jsonb_typeof(v_existing->'cycleId') = 'string' and v_existing->>'cycleId' = v_state->>'cycleId'
            and jsonb_typeof(v_existing->'code') = 'string' and v_existing->>'code' = v_code
            and jsonb_typeof(v_existing->'recordedAt') = 'string'
            and v_existing->>'recordedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
            and jsonb_typeof(v_existing->'intent') = 'object'
            and (v_existing->'intent') ?& array['intentId','executionId','memberId','orderId','requestKey','observedUpdatedAt','observedPhase','decision']
            and (v_existing->'intent') - array['intentId','executionId','memberId','orderId','requestKey','observedUpdatedAt','observedPhase','decision'] = '{}'::jsonb
            and v_existing->'intent'->>'intentId' = v_intent::text
            and jsonb_typeof(v_existing->'intent'->'executionId') = 'string'
            and (v_existing->'intent'->>'executionId')::uuid::text = v_existing->'intent'->>'executionId'
            and jsonb_typeof(v_existing->'intent'->'memberId') = 'string'
            and (v_existing->'intent'->>'memberId')::uuid::text = v_existing->'intent'->>'memberId'
            and jsonb_typeof(v_existing->'intent'->'orderId') = 'string'
            and (v_existing->'intent'->>'orderId')::uuid::text = v_existing->'intent'->>'orderId'
            and jsonb_typeof(v_existing->'intent'->'requestKey') = 'string'
            and char_length(v_existing->'intent'->>'requestKey') between 8 and 120
            and jsonb_typeof(v_existing->'intent'->'observedUpdatedAt') = 'string'
            and v_existing->'intent'->>'observedUpdatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
            and v_existing->'intent'->>'observedPhase' in ('reserved','authorizing','action_required','authorized','capturing','captured','cancelling','cancelled','reconciliation_required')
            and ((v_existing->'intent'->>'decision' = 'skip' and v_code = 'skipped')
              or (v_existing->'intent'->>'decision' = 'settle' and v_code <> 'skipped'))
            and v_state->'after' = jsonb_build_object('updatedAt',v_existing->'intent'->>'observedUpdatedAt',
              'executionId',v_existing->'intent'->>'executionId')) is true then
          perform (v_existing->>'recordedAt')::timestamptz;
          return jsonb_build_object('status','ok','state',v_state);
        end if;
        raise exception 'recovery_completion_missing' using errcode = '55000';
      end if;
      if v_pending->>'intentId' <> v_intent::text or v_existing is not null
          or (v_pending->>'decision' = 'skip' and v_code <> 'skipped')
          or (v_pending->>'decision' = 'settle' and v_code = 'skipped') then
        raise exception 'recovery_completion_conflict' using errcode = '55000';
      end if;
      select * into v_execution from public.research_checkout_executions where id = (v_pending->>'executionId')::uuid;
      if (v_code = 'vanished' and found) or (v_code <> 'vanished' and not found)
          or (v_code = 'settled_committed' and v_execution.phase <> 'committed')
          or (v_code = 'settled_cancelled' and (v_execution.phase <> 'cancelled' or v_execution.settled_at is null)) then
        raise exception 'recovery_completion_evidence_disagrees' using errcode = '55000';
      end if;
      v_outcome := jsonb_build_object('schemaVersion',1,'cycleId',v_state->>'cycleId',
        'intent',v_pending,'code',v_code,'recordedAt',v_now);
      insert into public.research_idempotency_keys(scope,key,result,settled_at)
        values ('checkout_recovery_outcome_v1',v_intent::text,v_outcome,v_now);
      v_state := v_state || jsonb_build_object('pending',null,'after',jsonb_build_object(
        'updatedAt',v_pending->>'observedUpdatedAt','executionId',v_pending->>'executionId'));
    elsif p_action = 'exhaust' then
      if v_pending <> 'null'::jsonb then raise exception 'recovery_pending_conflict' using errcode = '55000'; end if;
      if exists (select 1 from public.research_checkout_executions_list_recoverable(v_before,1,
          v_cursor,(v_state->'after'->>'executionId')::uuid)) then
        raise exception 'recovery_not_exhausted' using errcode = '55000';
      end if;
      v_state := v_state || jsonb_build_object('exhausted',true);
    end if;
  end if;
  update public.research_idempotency_keys set result = v_state where id = v_control.id;
  return jsonb_build_object('status',case when p_action = 'claim' then 'acquired' else 'ok' end,'state',v_state);
exception
  when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    raise exception 'recovery_state_invalid' using errcode = '22023';
end;
$$;

revoke all on function public.research_checkout_recovery_operation(text,uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.research_checkout_recovery_operation(text,uuid,bigint,jsonb) to service_role;
grant select, insert, update on public.research_idempotency_keys to service_role;
grant select on public.research_checkout_executions to service_role;
-- Existing RLS remains required; no policy or default-grant behavior is weakened.
