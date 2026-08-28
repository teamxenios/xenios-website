\set ON_ERROR_STOP on

do $verify_refund_command_prepare$
declare
  result jsonb;
  command jsonb;
begin
  result := public.research_commerce_refund_command_v1(
    'prepare', '30000000-0000-4000-8000-000000000001', 'admin-disposable', 4000,
    'disposable-key-1', 'stripe', null, null, null, null, null, null, null,
    '2026-08-28T09:01:00Z'
  );
  if result->>'capability' <> 'research_commerce_refund_command/v1'
     or result->>'action' <> 'prepare' or result->>'outcome' <> 'ready' then
    raise exception 'prepare did not return exact ready attestation: %', result;
  end if;
  command := result->'command';
  if command->>'claimId' <> '30000000-0000-4000-8000-000000000001'
     or command->>'orderId' <> '10000000-0000-4000-8000-000000000001'
     or command->>'memberId' <> '20000000-0000-4000-8000-000000000001'
     or command->>'providerIdempotencyKey' !~ '^xrrf_v1_[0-9a-f]{64}$'
     or command->>'state' <> 'prepared' then
    raise exception 'prepare command identity is not exact: %', command;
  end if;

  result := public.research_commerce_refund_command_v1(
    'prepare', '30000000-0000-4000-8000-000000000001', 'another-admin', 3999,
    'disposable-key-1', 'stripe', null, null, null, null, null, null, null,
    '2026-08-28T09:01:01Z'
  );
  if result->>'outcome' <> 'idempotency_conflict' then
    raise exception 'same key with changed amount was not refused: %', result;
  end if;
end
$verify_refund_command_prepare$;

-- Direct roles can inspect only through service_role SELECT; no role can call
-- the helper or mutate the command table directly.
set role service_role;
select count(*) from public.research_refund_commands;
reset role;

do $verify_refund_command_acl$
declare
  routine_oid oid := pg_catalog.to_regprocedure(
    'public.research_commerce_refund_command_v1(text,text,text,bigint,text,text,text,text,integer,text,text,text,bigint,timestamp with time zone)'
  );
begin
  if pg_catalog.has_table_privilege(
       'service_role', 'public.research_refund_commands', 'INSERT,UPDATE,DELETE'
     )
     or pg_catalog.has_table_privilege(
       'service_role', 'public.research_refund_keys', 'INSERT,UPDATE,DELETE'
     )
     or pg_catalog.has_function_privilege(
       'anon', routine_oid, 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', routine_oid, 'EXECUTE'
     ) then
    raise exception 'refund command ACL is wider than reviewed';
  end if;
end
$verify_refund_command_acl$;
