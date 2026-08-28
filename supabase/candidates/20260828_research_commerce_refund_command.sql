-- Xenios Research durable refund command, v1 (2026-08-28).
--
-- ############################################################################
-- ## STATUS: UNAPPLIED CANDIDATE. NOT REGISTERED IN THE MIGRATION DAG/LEDGER. ##
-- ## DO NOT APPLY TO PRODUCTION without independent review, disposable-DB     ##
-- ## evidence, exact-SHA freeze, founder approval, and normal release gates.  ##
-- ############################################################################
--
-- This candidate creates no payment capability and never contacts a provider.
-- It is the server-side transaction authority around provider I/O:
--
--   prepare        lock claim + order, validate captured/refundable balance,
--                  and record immutable intent + one durable provider key;
--   claim_provider serialize permission to make the provider call;
--   record_outcome persist a closed refusal or explicit ambiguity without
--                  publishing a refund fact;
--   complete       atomically publish provider proof, refund-key ledger, order
--                  transition/event, and claim resolution.
--
-- A process lost after claim_provider remains provider_in_flight. An ordinary
-- retry receives reconciliation_required and cannot mint or use a fresh key.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $research_commerce_refund_command_preflight$
declare
  wrong_column text;
begin
  if exists (
    select 1
      from (values ('anon'), ('authenticated'), ('service_role')) required(role_name)
     where not exists (select 1 from pg_catalog.pg_roles r where r.rolname = required.role_name)
  ) then
    raise exception 'refund command: anon, authenticated, and service_role roles are required';
  end if;

  if pg_catalog.to_regclass('public.research_claims') is null
     or pg_catalog.to_regclass('public.research_orders') is null
     or pg_catalog.to_regclass('public.research_order_state_events') is null
     or pg_catalog.to_regclass('public.research_refund_keys') is null then
    raise exception 'refund command: Track B claims, orders, state events, and refund keys are required';
  end if;

  select expected.table_name || '.' || expected.column_name
    into wrong_column
    from (values
      ('research_claims', 'id', 'uuid'),
      ('research_claims', 'order_id', 'uuid'),
      ('research_claims', 'member_id', 'uuid'),
      ('research_claims', 'state', 'text'),
      ('research_claims', 'resolution', 'text'),
      ('research_claims', 'reviewed_by', 'text'),
      ('research_claims', 'updated_at', 'timestamp with time zone'),
      ('research_orders', 'id', 'uuid'),
      ('research_orders', 'member_id', 'uuid'),
      ('research_orders', 'state', 'text'),
      ('research_orders', 'captured_amount_cents', 'bigint'),
      ('research_orders', 'refunded_cents', 'bigint'),
      ('research_orders', 'payment_reference', 'text'),
      ('research_orders', 'last_idempotency_key', 'text'),
      ('research_orders', 'updated_at', 'timestamp with time zone'),
      ('research_order_state_events', 'order_id', 'uuid'),
      ('research_order_state_events', 'from_state', 'text'),
      ('research_order_state_events', 'to_state', 'text'),
      ('research_order_state_events', 'actor_type', 'text'),
      ('research_order_state_events', 'actor_id', 'text'),
      ('research_order_state_events', 'provider_reference', 'text'),
      ('research_order_state_events', 'idempotency_key', 'text'),
      ('research_order_state_events', 'occurred_at', 'timestamp with time zone'),
      ('research_refund_keys', 'scope', 'text'),
      ('research_refund_keys', 'refund_reference', 'text'),
      ('research_refund_keys', 'recorded_at', 'timestamp with time zone')
    ) expected(table_name, column_name, data_type)
   where not exists (
     select 1
       from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = expected.table_name
        and c.column_name = expected.column_name
        and c.data_type = expected.data_type
   )
   limit 1;
  if wrong_column is not null then
    raise exception 'refund command: missing or incompatible dependency column %', wrong_column;
  end if;

  if exists (
    select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'research_refund_commands'
  ) then
    raise exception 'refund command: same-name relation collision';
  end if;
  if exists (
    select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'research_commerce_refund_command_envelope_v1',
         'research_commerce_refund_command_v1'
       )
  ) then
    raise exception 'refund command: same-name routine collision';
  end if;
end
$research_commerce_refund_command_preflight$;

create table public.research_refund_commands (
  command_id text primary key,
  claim_id uuid not null references public.research_claims (id),
  order_id uuid not null references public.research_orders (id),
  member_id uuid not null,
  client_idempotency_key text not null,
  provider_idempotency_key text not null unique,
  provider_name text not null,
  payment_reference text not null,
  amount_cents bigint not null check (amount_cents between 1 and 9007199254740991),
  expected_order_state text not null,
  expected_refunded_cents bigint not null check (expected_refunded_cents >= 0),
  requested_by_admin text not null,
  state text not null check (state in (
    'prepared', 'provider_in_flight', 'provider_retryable',
    'reconciliation_required', 'terminal_refused', 'applied'
  )),
  attempt integer not null default 0 check (attempt >= 0),
  failure_code text,
  provider_refund_reference text,
  provider_refunded_cents bigint,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint research_refund_commands_scope_unique
    unique (claim_id, client_idempotency_key),
  constraint research_refund_commands_identity_bounds check (
    pg_catalog.length(command_id) between 1 and 255
    and pg_catalog.length(client_idempotency_key) between 1 and 255
    and pg_catalog.length(provider_idempotency_key) between 1 and 255
    and pg_catalog.length(provider_name) between 1 and 80
    and pg_catalog.length(payment_reference) between 1 and 255
    and pg_catalog.length(requested_by_admin) between 1 and 255
    and command_id !~ '[[:cntrl:]]'
    and client_idempotency_key !~ '[[:cntrl:]]'
    and provider_idempotency_key !~ '[[:cntrl:]]'
    and provider_name !~ '[[:cntrl:]]'
    and payment_reference !~ '[[:cntrl:]]'
    and requested_by_admin !~ '[[:cntrl:]]'
  ),
  constraint research_refund_commands_outcome_bundle check (
    (
      state = 'prepared' and attempt = 0 and failure_code is null
      and provider_refund_reference is null and provider_refunded_cents is null
    ) or (
      state = 'provider_in_flight' and attempt > 0 and failure_code is null
      and provider_refund_reference is null and provider_refunded_cents is null
    ) or (
      state = 'provider_retryable' and attempt > 0
      and failure_code is not null
      and failure_code in ('DISABLED', 'MISCONFIGURED')
      and provider_refund_reference is null and provider_refunded_cents is null
    ) or (
      state = 'terminal_refused' and attempt > 0
      and failure_code is not null
      and failure_code in ('REJECTED', 'PERMANENT_FAILURE')
      and provider_refund_reference is null and provider_refunded_cents is null
    ) or (
      state = 'reconciliation_required' and attempt > 0
      and failure_code is not null and failure_code in (
        'RETRYABLE', 'INVALID_SUCCESS_PROOF', 'PROVIDER_THROW', 'STALE_DOMAIN_SNAPSHOT'
      )
      and (provider_refund_reference is null or (
        pg_catalog.length(provider_refund_reference) between 1 and 255
        and provider_refund_reference !~ '[[:cntrl:]]'
      ))
      and (provider_refunded_cents is null or provider_refunded_cents > 0)
    ) or (
      state = 'applied' and attempt > 0 and failure_code is null
      and pg_catalog.length(provider_refund_reference) between 1 and 255
      and provider_refund_reference !~ '[[:cntrl:]]'
      and provider_refunded_cents = amount_cents
    )
  )
);

-- At most one unresolved financial command can reserve an order's refundable
-- balance. Terminal confirmed refusals stop blocking; ambiguous commands do not.
create unique index research_refund_commands_one_active_per_order_idx
  on public.research_refund_commands (order_id)
  where state in (
    'prepared', 'provider_in_flight', 'provider_retryable', 'reconciliation_required'
  );

-- A provider proof is a money fact, not an arbitrary label. One proof may
-- quarantine or resolve only one command for a given provider.
create unique index research_refund_commands_provider_proof_unique_idx
  on public.research_refund_commands (provider_name, provider_refund_reference)
  where provider_refund_reference is not null;

create function public.research_commerce_refund_command_envelope_v1(
  p_action text,
  p_outcome text,
  p_command public.research_refund_commands
)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $research_commerce_refund_command_envelope_v1$
  select pg_catalog.jsonb_build_object(
    'capability', 'research_commerce_refund_command/v1',
    'action', p_action,
    'outcome', p_outcome,
    'command', case when p_command is null then null else pg_catalog.jsonb_build_object(
      'commandId', p_command.command_id,
      'claimId', p_command.claim_id::text,
      'orderId', p_command.order_id::text,
      'memberId', p_command.member_id::text,
      'clientIdempotencyKey', p_command.client_idempotency_key,
      'providerIdempotencyKey', p_command.provider_idempotency_key,
      'providerName', p_command.provider_name,
      'paymentReference', p_command.payment_reference,
      'amountCents', p_command.amount_cents,
      'state', p_command.state,
      'attempt', p_command.attempt
    ) end
  )
$research_commerce_refund_command_envelope_v1$;

comment on function public.research_commerce_refund_command_envelope_v1(
  text, text, public.research_refund_commands
) is 'research_commerce_refund_command_envelope/v1: exact four-key capability response';

create function public.research_commerce_refund_command_v1(
  p_action text,
  p_claim_id text,
  p_admin_id text,
  p_amount_cents bigint,
  p_client_idempotency_key text,
  p_provider_name text,
  p_command_id text,
  p_provider_idempotency_key text,
  p_attempt integer,
  p_provider_outcome text,
  p_failure_code text,
  p_provider_refund_reference text,
  p_provider_refunded_cents bigint,
  p_as_of timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $research_commerce_refund_command_v1$
declare
  locked_claim public.research_claims%rowtype;
  locked_order public.research_orders%rowtype;
  locked_command public.research_refund_commands%rowtype;
  existing_key public.research_refund_keys%rowtype;
  scope_text text;
  digest text;
  outcome text;
begin
  if p_action is null
     or p_action not in ('prepare', 'claim_provider', 'record_outcome', 'complete')
     or p_as_of is null then
    raise exception 'refund command: invalid action envelope' using errcode = '22023';
  end if;

  if p_action = 'prepare' then
    if p_claim_id is null or pg_catalog.length(p_claim_id) not between 1 and 255
       or p_claim_id ~ '[[:cntrl:]]'
       or p_admin_id is null or pg_catalog.length(p_admin_id) not between 1 and 255
       or p_admin_id ~ '[[:cntrl:]]'
       or p_amount_cents is null or p_amount_cents not between 1 and 9007199254740991
       or p_client_idempotency_key is null
       or pg_catalog.length(p_client_idempotency_key) not between 1 and 255
       or p_client_idempotency_key ~ '[[:cntrl:]]'
       or p_provider_name is null or pg_catalog.length(p_provider_name) not between 1 and 80
       or p_provider_name ~ '[[:cntrl:]]'
       or p_command_id is not null or p_provider_idempotency_key is not null
       or p_attempt is not null or p_provider_outcome is not null
       or p_failure_code is not null or p_provider_refund_reference is not null
       or p_provider_refunded_cents is not null then
      raise exception 'refund command: invalid prepare input' using errcode = '22023';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'xenios:refund-command:v1|' || p_claim_id || '|' || p_client_idempotency_key,
        0
      )
    );

    select * into locked_claim
      from public.research_claims c
     where c.id::text = p_claim_id
     for update;
    if not found then
      return public.research_commerce_refund_command_envelope_v1(
        p_action, 'order_not_found', null::public.research_refund_commands
      );
    end if;

    select * into locked_order
      from public.research_orders o
     where o.id = locked_claim.order_id
     for update;
    if not found or locked_order.member_id <> locked_claim.member_id then
      return public.research_commerce_refund_command_envelope_v1(
        p_action, 'order_not_found', null::public.research_refund_commands
      );
    end if;

    select * into locked_command
      from public.research_refund_commands c
     where c.claim_id = locked_claim.id
       and c.client_idempotency_key = p_client_idempotency_key
     for update;
    if found then
      if locked_command.order_id <> locked_order.id
         or locked_command.member_id <> locked_claim.member_id
         or locked_command.amount_cents <> p_amount_cents
         or locked_command.provider_name <> p_provider_name then
        return public.research_commerce_refund_command_envelope_v1(
          p_action, 'idempotency_conflict', null::public.research_refund_commands
        );
      end if;
      outcome := case locked_command.state
        when 'applied' then 'applied'
        when 'terminal_refused' then 'terminal_refused'
        when 'provider_in_flight' then 'reconciliation_required'
        when 'reconciliation_required' then 'reconciliation_required'
        else 'ready'
      end;
      return public.research_commerce_refund_command_envelope_v1(
        p_action, outcome, locked_command
      );
    end if;

    scope_text := locked_claim.id::text || ':' || p_client_idempotency_key;
    select * into existing_key
      from public.research_refund_keys k
     where k.scope = scope_text
     for update;
    if found then
      return public.research_commerce_refund_command_envelope_v1(
        p_action, 'reconciliation_required', null::public.research_refund_commands
      );
    end if;

    if locked_claim.state <> 'approved'
       or locked_order.state not in ('payment_captured', 'delivered', 'exception') then
      return public.research_commerce_refund_command_envelope_v1(
        p_action, 'order_state_invalid', null::public.research_refund_commands
      );
    end if;
    if locked_order.payment_reference is null
       or pg_catalog.length(locked_order.payment_reference) not between 1 and 255
       or locked_order.captured_amount_cents is null
       or locked_order.captured_amount_cents <= 0
       or locked_order.refunded_cents < 0
       or p_amount_cents > locked_order.captured_amount_cents - locked_order.refunded_cents then
      return public.research_commerce_refund_command_envelope_v1(
        p_action, 'payment_failed', null::public.research_refund_commands
      );
    end if;

    select * into locked_command
      from public.research_refund_commands c
     where c.order_id = locked_order.id
       and c.state in (
         'prepared', 'provider_in_flight', 'provider_retryable', 'reconciliation_required'
       )
     for update;
    if found then
      return public.research_commerce_refund_command_envelope_v1(
        p_action, 'refund_pending', null::public.research_refund_commands
      );
    end if;

    digest := pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        locked_claim.id::text || '|' || locked_order.id::text || '|'
        || locked_claim.member_id::text || '|' || p_client_idempotency_key,
        'UTF8'
      )),
      'hex'
    );
    insert into public.research_refund_commands (
      command_id, claim_id, order_id, member_id, client_idempotency_key,
      provider_idempotency_key, provider_name, payment_reference, amount_cents,
      expected_order_state, expected_refunded_cents, requested_by_admin,
      state, attempt, created_at, updated_at
    ) values (
      'refund_command_' || pg_catalog.substr(digest, 1, 32), locked_claim.id, locked_order.id,
      locked_claim.member_id, p_client_idempotency_key, 'xrrf_v1_' || digest,
      p_provider_name, locked_order.payment_reference, p_amount_cents,
      locked_order.state, locked_order.refunded_cents, p_admin_id,
      'prepared', 0, p_as_of, p_as_of
    ) returning * into locked_command;
    return public.research_commerce_refund_command_envelope_v1(
      p_action, 'ready', locked_command
    );
  end if;

  if p_command_id is null or pg_catalog.length(p_command_id) not between 1 and 255
     or p_command_id ~ '[[:cntrl:]]'
     or p_provider_idempotency_key is null
     or pg_catalog.length(p_provider_idempotency_key) not between 1 and 255
     or p_provider_idempotency_key ~ '[[:cntrl:]]'
     or p_claim_id is not null or p_admin_id is not null or p_amount_cents is not null
     or p_client_idempotency_key is not null or p_provider_name is not null then
    raise exception 'refund command: invalid command identity' using errcode = '22023';
  end if;

  select * into locked_command
    from public.research_refund_commands c
   where c.command_id = p_command_id
     and c.provider_idempotency_key = p_provider_idempotency_key
   for update;
  if not found then
    return public.research_commerce_refund_command_envelope_v1(
      p_action, 'idempotency_conflict', null::public.research_refund_commands
    );
  end if;

  if p_action = 'claim_provider' then
    if p_attempt is not null or p_provider_outcome is not null or p_failure_code is not null
       or p_provider_refund_reference is not null or p_provider_refunded_cents is not null then
      raise exception 'refund command: invalid provider-claim input' using errcode = '22023';
    end if;
    if locked_command.state in ('prepared', 'provider_retryable') then
      update public.research_refund_commands
         set state = 'provider_in_flight', attempt = attempt + 1,
             failure_code = null, updated_at = p_as_of
       where command_id = locked_command.command_id
       returning * into locked_command;
      return public.research_commerce_refund_command_envelope_v1(
        p_action, 'execute', locked_command
      );
    end if;
    outcome := case locked_command.state
      when 'applied' then 'applied'
      when 'terminal_refused' then 'terminal_refused'
      else 'reconciliation_required'
    end;
    return public.research_commerce_refund_command_envelope_v1(
      p_action, outcome, locked_command
    );
  end if;

  if p_attempt is null or p_attempt <= 0 or p_attempt <> locked_command.attempt then
    return public.research_commerce_refund_command_envelope_v1(
      p_action, 'idempotency_conflict', null::public.research_refund_commands
    );
  end if;
  if locked_command.state = 'applied' then
    if p_action = 'complete'
       and p_provider_refund_reference = locked_command.provider_refund_reference
       and p_provider_refunded_cents = locked_command.provider_refunded_cents then
      return public.research_commerce_refund_command_envelope_v1(
        p_action, 'applied', locked_command
      );
    end if;
    return public.research_commerce_refund_command_envelope_v1(
      p_action, 'idempotency_conflict', null::public.research_refund_commands
    );
  end if;
  if locked_command.state <> 'provider_in_flight'
     and not (
       p_action = 'complete' and locked_command.state = 'reconciliation_required'
     ) then
    outcome := case locked_command.state
      when 'terminal_refused' then 'terminal_refused'
      when 'provider_retryable' then 'safe_retryable'
      else 'reconciliation_required'
    end;
    return public.research_commerce_refund_command_envelope_v1(
      p_action, outcome, locked_command
    );
  end if;

  if p_action = 'record_outcome' then
    if p_provider_outcome is null or p_failure_code is null
       or p_provider_outcome not in (
         'safe_retryable', 'terminal_refused', 'reconciliation_required'
       )
       or not (
         (p_provider_outcome = 'safe_retryable'
           and p_failure_code in ('DISABLED', 'MISCONFIGURED'))
         or (p_provider_outcome = 'terminal_refused'
           and p_failure_code in ('REJECTED', 'PERMANENT_FAILURE'))
         or (p_provider_outcome = 'reconciliation_required'
           and p_failure_code in ('RETRYABLE', 'INVALID_SUCCESS_PROOF', 'PROVIDER_THROW'))
       )
       or (p_provider_refund_reference is not null and (
         pg_catalog.length(p_provider_refund_reference) not between 1 and 255
         or p_provider_refund_reference ~ '[[:cntrl:]]'
       ))
       or (p_provider_refunded_cents is not null and p_provider_refunded_cents <= 0)
       or (
         p_failure_code <> 'INVALID_SUCCESS_PROOF'
         and (p_provider_refund_reference is not null or p_provider_refunded_cents is not null)
       ) then
      raise exception 'refund command: invalid provider outcome' using errcode = '22023';
    end if;
    update public.research_refund_commands
       set state = case p_provider_outcome
             when 'safe_retryable' then 'provider_retryable'
             else p_provider_outcome
           end,
           failure_code = p_failure_code,
           provider_refund_reference = p_provider_refund_reference,
           provider_refunded_cents = p_provider_refunded_cents,
           updated_at = p_as_of
     where command_id = locked_command.command_id
     returning * into locked_command;
    return public.research_commerce_refund_command_envelope_v1(
      p_action, p_provider_outcome, locked_command
    );
  end if;

  if p_action <> 'complete'
     or p_provider_outcome is not null or p_failure_code is not null
     or p_provider_refund_reference is null
     or pg_catalog.length(p_provider_refund_reference) not between 1 and 255
     or p_provider_refund_reference ~ '[[:cntrl:]]'
     or p_provider_refunded_cents is null
     or p_provider_refunded_cents <> locked_command.amount_cents then
    raise exception 'refund command: invalid completion proof' using errcode = '22023';
  end if;

  select * into locked_claim
    from public.research_claims c
   where c.id = locked_command.claim_id
   for update;
  select * into locked_order
    from public.research_orders o
   where o.id = locked_command.order_id
   for update;
  scope_text := locked_command.claim_id::text || ':' || locked_command.client_idempotency_key;
  select * into existing_key
    from public.research_refund_keys k
   where k.scope = scope_text
   for update;

  if locked_claim.id is null or locked_order.id is null or existing_key.scope is not null
     or locked_claim.state <> 'approved'
     or locked_claim.order_id <> locked_command.order_id
     or locked_claim.member_id <> locked_command.member_id
     or locked_order.member_id <> locked_command.member_id
     or locked_order.state <> locked_command.expected_order_state
     or locked_order.state not in ('payment_captured', 'delivered', 'exception')
     or locked_order.payment_reference is distinct from locked_command.payment_reference
     or locked_order.refunded_cents <> locked_command.expected_refunded_cents
     or locked_order.captured_amount_cents is null
     or locked_order.captured_amount_cents - locked_order.refunded_cents
          < locked_command.amount_cents then
    update public.research_refund_commands
       set state = 'reconciliation_required',
           failure_code = 'STALE_DOMAIN_SNAPSHOT',
           provider_refund_reference = p_provider_refund_reference,
           provider_refunded_cents = p_provider_refunded_cents,
           updated_at = p_as_of
     where command_id = locked_command.command_id
     returning * into locked_command;
    return public.research_commerce_refund_command_envelope_v1(
      p_action, 'reconciliation_required', locked_command
    );
  end if;

  update public.research_orders
     set state = 'refunded',
         refunded_cents = refunded_cents + locked_command.amount_cents,
         last_idempotency_key = locked_command.provider_idempotency_key,
         updated_at = p_as_of
   where id = locked_order.id;

  insert into public.research_order_state_events (
    order_id, from_state, to_state, actor_type, actor_id,
    provider_reference, idempotency_key, occurred_at
  ) values (
    locked_order.id, locked_order.state, 'refunded', 'admin',
    locked_command.requested_by_admin, p_provider_refund_reference,
    locked_command.provider_idempotency_key, p_as_of
  );

  insert into public.research_refund_keys (scope, refund_reference, recorded_at)
  values (scope_text, p_provider_refund_reference, p_as_of);

  update public.research_claims
     set state = 'resolved',
         resolution = case
           when locked_order.refunded_cents + locked_command.amount_cents
                  >= locked_order.captured_amount_cents then 'refund'
           else 'partial_refund'
         end,
         reviewed_by = locked_command.requested_by_admin,
         updated_at = p_as_of
   where id = locked_claim.id;

  update public.research_refund_commands
     set state = 'applied', failure_code = null,
         provider_refund_reference = p_provider_refund_reference,
         provider_refunded_cents = p_provider_refunded_cents,
         updated_at = p_as_of
   where command_id = locked_command.command_id
   returning * into locked_command;

  return public.research_commerce_refund_command_envelope_v1(
    p_action, 'applied', locked_command
  );
end
$research_commerce_refund_command_v1$;

comment on function public.research_commerce_refund_command_v1(
  text, text, text, bigint, text, text, text, text, integer,
  text, text, text, bigint, timestamptz
) is 'UNAPPLIED candidate contract v1: serialized intent, stable provider key, explicit ambiguity, and atomic refund publication.';

alter table public.research_refund_commands enable row level security;
alter table public.research_refund_commands force row level security;

revoke all on table public.research_refund_commands
  from public, anon, authenticated, service_role;
grant select on table public.research_refund_commands to service_role;
-- The legacy split repository is no longer allowed to consume a replay key
-- before order/claim publication. The definer routine above is the sole writer.
revoke all on table public.research_refund_keys
  from public, anon, authenticated, service_role;
grant select on table public.research_refund_keys to service_role;

revoke all on function public.research_commerce_refund_command_envelope_v1(
  text, text, public.research_refund_commands
) from public, anon, authenticated, service_role;
revoke all on function public.research_commerce_refund_command_v1(
  text, text, text, bigint, text, text, text, text, integer,
  text, text, text, bigint, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.research_commerce_refund_command_v1(
  text, text, text, bigint, text, text, text, text, integer,
  text, text, text, bigint, timestamptz
) to service_role;

do $research_commerce_refund_command_postcheck$
declare
  routine_oid oid := pg_catalog.to_regprocedure(
    'public.research_commerce_refund_command_v1(text,text,text,bigint,text,text,text,text,integer,text,text,text,bigint,timestamp with time zone)'
  );
  helper_oid oid := pg_catalog.to_regprocedure(
    'public.research_commerce_refund_command_envelope_v1(text,text,public.research_refund_commands)'
  );
  routine_config text[];
begin
  if routine_oid is null or helper_oid is null then
    raise exception 'refund command: exact v1 routines are absent after apply';
  end if;
  select p.proconfig into routine_config
    from pg_catalog.pg_proc p
   where p.oid = routine_oid
     and p.prosecdef
     and p.prorettype = 'pg_catalog.jsonb'::pg_catalog.regtype
     and pg_catalog.pg_get_userbyid(p.proowner) = current_user;
  if not found or routine_config is distinct from array['search_path=pg_catalog']::text[] then
    raise exception 'refund command: routine is not SECURITY DEFINER with exact hardened search_path';
  end if;
  if pg_catalog.has_function_privilege('anon', routine_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', routine_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', routine_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', helper_oid, 'EXECUTE')
     or pg_catalog.has_table_privilege(
       'service_role', 'public.research_refund_commands', 'INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role', 'public.research_refund_keys', 'INSERT,UPDATE,DELETE,TRUNCATE'
     ) then
    raise exception 'refund command: exact table/routine ACL is not service_role read-only plus RPC-only';
  end if;
  if not exists (
    select 1
      from pg_catalog.pg_index i
      join pg_catalog.pg_class c on c.oid = i.indexrelid
     where i.indrelid = 'public.research_refund_commands'::pg_catalog.regclass
       and c.relname = 'research_refund_commands_one_active_per_order_idx'
       and i.indisunique and i.indisvalid and i.indisready
       and pg_catalog.pg_get_expr(i.indpred, i.indrelid) is not null
  ) then
    raise exception 'refund command: active-order serialization index is absent';
  end if;
  if not exists (
    select 1
      from pg_catalog.pg_index i
      join pg_catalog.pg_class c on c.oid = i.indexrelid
     where i.indrelid = 'public.research_refund_commands'::pg_catalog.regclass
       and c.relname = 'research_refund_commands_provider_proof_unique_idx'
       and i.indisunique and i.indisvalid and i.indisready
       and pg_catalog.pg_get_expr(i.indpred, i.indrelid) is not null
  ) then
    raise exception 'refund command: provider-proof uniqueness index is absent';
  end if;
end
$research_commerce_refund_command_postcheck$;

commit;
