-- Xenios Research commerce webhook atomic apply, v1 (2026-08-28).
--
-- ############################################################################
-- ## STATUS: UNAPPLIED CANDIDATE. NOT REGISTERED IN THE MIGRATION DAG/LEDGER. ##
-- ## DO NOT APPLY TO PRODUCTION without independent review, disposable-DB     ##
-- ## evidence, exact-SHA freeze, founder approval, and normal release gates.  ##
-- ############################################################################
--
-- This is an additive hardening candidate over the pending Track B commerce
-- schema. It creates no payment, provider, catalog, checkout, refund, or
-- activation capability. Its one purpose is to make an ALREADY
-- signature-verified inbound event safe to apply:
--
--   * provider_name + event_id is the serialized inbox identity;
--   * payload_sha256 binds that identity to the exact verified bytes;
--   * no shared order idempotency field is read or written as replay authority;
--   * the addressed research_orders row is locked before transition review;
--   * only the closed provider_webhook transitions already published by
--     shared/research/commerce.ts are accepted;
--   * inbox claim, order state, append-only state event, and verified shipment
--     facts commit in this ONE SECURITY DEFINER routine or not at all;
--   * an unknown order, a future-valid out-of-order delivery, or incomplete
--     shipment projection claims nothing;
--   * direct inbox writes are removed from service_role, leaving SELECT-only
--     diagnostics plus EXECUTE on this routine.
--
-- Existing legacy inbox rows remain readable. Because they have no payload
-- digest, a colliding v1 delivery is a CONFLICT, never guessed to be a replay.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $research_commerce_webhook_atomic_preflight$
declare
  wrong_column text;
begin
  if exists (
    select 1
      from (values ('anon'), ('authenticated'), ('service_role')) required(role_name)
     where not exists (select 1 from pg_catalog.pg_roles r where r.rolname = required.role_name)
  ) then
    raise exception 'webhook atomic apply: anon, authenticated, and service_role roles are required';
  end if;

  if pg_catalog.to_regclass('public.research_orders') is null
     or pg_catalog.to_regclass('public.research_order_state_events') is null
     or pg_catalog.to_regclass('public.research_order_shipments') is null
     or pg_catalog.to_regclass('public.research_provider_webhook_events') is null then
    raise exception 'webhook atomic apply: Track B orders, state events, shipments, and webhook inbox are required';
  end if;

  select expected.column_name
    into wrong_column
    from (values
      ('research_orders', 'id', 'uuid'),
      ('research_orders', 'state', 'text'),
      ('research_orders', 'payment_reference', 'text'),
      ('research_orders', 'updated_at', 'timestamp with time zone'),
      ('research_order_state_events', 'order_id', 'uuid'),
      ('research_order_state_events', 'from_state', 'text'),
      ('research_order_state_events', 'to_state', 'text'),
      ('research_order_state_events', 'actor_type', 'text'),
      ('research_order_state_events', 'provider_reference', 'text'),
      ('research_order_state_events', 'idempotency_key', 'text'),
      ('research_order_shipments', 'order_id', 'uuid'),
      ('research_order_shipments', 'status', 'text'),
      ('research_order_shipments', 'tracking_number', 'text'),
      ('research_order_shipments', 'carrier', 'text'),
      ('research_provider_webhook_events', 'provider_name', 'text'),
      ('research_provider_webhook_events', 'event_id', 'text'),
      ('research_provider_webhook_events', 'event_type', 'text'),
      ('research_provider_webhook_events', 'received_at', 'timestamp with time zone')
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
    raise exception 'webhook atomic apply: missing or incompatible dependency column %', wrong_column;
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'research_provider_webhook_events'
       and c.contype = 'u'
       and pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (provider_name, event_id)'
  ) then
    raise exception 'webhook atomic apply: exact provider_name + event_id uniqueness is required';
  end if;

  -- This is a one-shot versioned candidate. It never overwrites or silently
  -- reuses same-name objects, regardless of owner or signature. A reviewed
  -- successor must use a new versioned name.
  if exists (
    select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'research_commerce_webhook_inbox_immutable',
         'research_commerce_webhook_claim_and_apply_v1'
       )
  ) then
    raise exception 'webhook atomic apply: same-name routine collision';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_trigger t
     where t.tgrelid = 'public.research_provider_webhook_events'::pg_catalog.regclass
       and t.tgname = 'research_commerce_webhook_inbox_immutable'
       and not t.tgisinternal
  ) then
    raise exception 'webhook atomic apply: same-name trigger collision';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_constraint c
     where c.conrelid = 'public.research_provider_webhook_events'::pg_catalog.regclass
       and c.conname = 'research_provider_webhook_events_atomic_bundle_check'
  ) then
    raise exception 'webhook atomic apply: same-name constraint collision';
  end if;
end
$research_commerce_webhook_atomic_preflight$;

alter table public.research_provider_webhook_events
  add column if not exists payload_sha256 text,
  add column if not exists atomic_order_id text,
  add column if not exists atomic_outcome text,
  add column if not exists atomic_applied_at timestamptz,
  add column if not exists atomic_capability text;

do $research_commerce_webhook_atomic_column_postflight$
declare
  wrong_column text;
begin
  select expected.column_name
    into wrong_column
    from (values
      ('payload_sha256', 'text'),
      ('atomic_order_id', 'text'),
      ('atomic_outcome', 'text'),
      ('atomic_applied_at', 'timestamp with time zone'),
      ('atomic_capability', 'text')
    ) expected(column_name, data_type)
   where not exists (
     select 1
       from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'research_provider_webhook_events'
        and c.column_name = expected.column_name
        and c.data_type = expected.data_type
        and c.is_nullable = 'YES'
        and c.column_default is null
   )
   limit 1;
  if wrong_column is not null then
    raise exception 'webhook atomic apply: incompatible candidate column %', wrong_column;
  end if;
end
$research_commerce_webhook_atomic_column_postflight$;

alter table public.research_provider_webhook_events
  add constraint research_provider_webhook_events_atomic_bundle_check check (
    (
      payload_sha256 is null
      and atomic_order_id is null
      and atomic_outcome is null
      and atomic_applied_at is null
      and atomic_capability is null
    )
    or (
      payload_sha256 ~ '^[0-9a-f]{64}$'
      and atomic_outcome in ('applied', 'acknowledged')
      and atomic_applied_at is not null
      and atomic_capability = 'research_commerce_webhook_atomic_apply/v1'
    )
  );

create function public.research_commerce_webhook_inbox_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $research_commerce_webhook_inbox_immutable$
begin
  raise exception 'provider webhook inbox claims are immutable'
    using errcode = '55000';
end
$research_commerce_webhook_inbox_immutable$;

comment on function public.research_commerce_webhook_inbox_immutable() is
  'research_commerce_webhook_inbox_immutable/v1: exact UPDATE-or-DELETE refusal trigger';

create trigger research_commerce_webhook_inbox_immutable
  before update or delete on public.research_provider_webhook_events
  for each row execute function public.research_commerce_webhook_inbox_immutable();

create function public.research_commerce_webhook_claim_and_apply_v1(
  p_provider_name text,
  p_event_id text,
  p_event_type text,
  p_payload_sha256 text,
  p_received_at timestamptz,
  p_order_id text,
  p_intent_kind text,
  p_target_state text,
  p_provider_confirmation text,
  p_shipment_status text,
  p_tracking_number text,
  p_carrier text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $research_commerce_webhook_claim_and_apply_v1$
declare
  capability constant text := 'research_commerce_webhook_atomic_apply/v1';
  response_identity jsonb;
  existing_event public.research_provider_webhook_events%rowtype;
  locked_order public.research_orders%rowtype;
  from_state text;
  transition_allowed boolean := false;
begin
  response_identity := pg_catalog.jsonb_build_object(
    'capability', capability,
    'providerName', p_provider_name,
    'eventId', p_event_id,
    'payloadSha256', p_payload_sha256
  );

  if p_provider_name is null
     or pg_catalog.length(p_provider_name) not between 1 and 80
     or p_provider_name ~ '[[:cntrl:]]'
     or p_event_id is null
     or pg_catalog.length(p_event_id) not between 1 and 255
     or p_event_id ~ '[[:cntrl:]]'
     or p_event_type is null
     or pg_catalog.length(p_event_type) not between 1 and 160
     or p_event_type ~ '[[:cntrl:]]'
     or p_payload_sha256 is null
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_received_at is null then
    raise exception 'webhook atomic apply: invalid event identity'
      using errcode = '22023';
  end if;

  if p_intent_kind not in ('acknowledge', 'transition') then
    raise exception 'webhook atomic apply: invalid intent kind'
      using errcode = '22023';
  end if;
  if p_intent_kind = 'acknowledge' and (
    p_order_id is not null
    or p_target_state is not null
    or p_provider_confirmation is not null
    or p_shipment_status is not null
    or p_tracking_number is not null
    or p_carrier is not null
  ) then
    raise exception 'webhook atomic apply: acknowledgement carries mutation fields'
      using errcode = '22023';
  end if;
  if p_intent_kind = 'transition' and (
    p_order_id is null
    or pg_catalog.length(p_order_id) not between 1 and 255
    or p_order_id ~ '[[:cntrl:]]'
    or p_target_state not in (
      'payment_authorized', 'payment_captured', 'refunded',
      'exception', 'fulfilled', 'delivered'
    )
    or (p_provider_confirmation is not null and (
      pg_catalog.length(p_provider_confirmation) not between 1 and 255
      or p_provider_confirmation ~ '[[:cntrl:]]'
    ))
    or (p_shipment_status is not null and (
      pg_catalog.length(p_shipment_status) not between 1 and 80
      or p_shipment_status ~ '[[:cntrl:]]'
    ))
    or (p_tracking_number is not null and (
      p_shipment_status is null
      or pg_catalog.length(p_tracking_number) not between 1 and 160
      or p_tracking_number ~ '[[:cntrl:]]'
    ))
    or (p_carrier is not null and (
      p_shipment_status is null
      or pg_catalog.length(p_carrier) not between 1 and 120
      or p_carrier ~ '[[:cntrl:]]'
    ))
    or (
      p_shipment_status is not null
      and p_target_state not in ('fulfilled', 'delivered', 'exception')
    )
    or not (
      (
        p_event_type = 'payment.authorized'
        and p_target_state = 'payment_authorized'
        and p_provider_confirmation is not null
        and p_shipment_status is null
      )
      or (
        p_event_type = 'payment.captured'
        and p_target_state = 'payment_captured'
        and p_provider_confirmation is not null
        and p_shipment_status is null
      )
      or (
        p_event_type = 'payment.refunded'
        and p_target_state = 'refunded'
        and p_shipment_status is null
      )
      or (
        p_event_type = 'payment.failed'
        and p_target_state = 'exception'
        and p_shipment_status is null
      )
      or (
        p_event_type = 'shipped'
        and p_target_state = 'fulfilled'
        and p_provider_confirmation is null
        and p_shipment_status = 'shipped'
      )
      or (
        p_event_type = 'delivered'
        and p_target_state = 'delivered'
        and p_provider_confirmation is null
        and p_shipment_status = 'delivered'
      )
      or (
        p_event_type = 'exception'
        and p_target_state = 'exception'
        and p_provider_confirmation is null
        and p_shipment_status = 'exception'
      )
    )
  ) then
    raise exception 'webhook atomic apply: invalid transition intent'
      using errcode = '22023';
  end if;

  -- A missing inbox row cannot be SELECT ... FOR UPDATE locked. The transaction
  -- advisory lock serializes that absence; the UNIQUE constraint remains the
  -- final database backstop.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'xenios:webhook-atomic:v1|' || p_provider_name || '|' || p_event_id,
      0
    )
  );

  select *
    into existing_event
    from public.research_provider_webhook_events e
   where e.provider_name = p_provider_name
     and e.event_id = p_event_id
   for update;
  if found then
    if existing_event.payload_sha256 is null
       or existing_event.payload_sha256 <> p_payload_sha256
       or existing_event.atomic_capability is distinct from capability then
      return response_identity || pg_catalog.jsonb_build_object('outcome', 'conflict');
    end if;
    return response_identity || pg_catalog.jsonb_build_object('outcome', 'duplicate');
  end if;

  if p_intent_kind = 'acknowledge' then
    insert into public.research_provider_webhook_events (
      provider_name, event_id, event_type, received_at, payload_sha256,
      atomic_order_id, atomic_outcome, atomic_applied_at, atomic_capability
    ) values (
      p_provider_name, p_event_id, p_event_type, p_received_at, p_payload_sha256,
      null, 'acknowledged', p_received_at, capability
    );
    return response_identity || pg_catalog.jsonb_build_object('outcome', 'acknowledged');
  end if;

  -- id::text deliberately avoids casting untrusted provider input to uuid. A
  -- malformed/nonexistent identifier simply finds no order and claims nothing.
  select *
    into locked_order
    from public.research_orders o
   where o.id::text = p_order_id
   for update;
  if not found then
    return response_identity || pg_catalog.jsonb_build_object('outcome', 'unknown_order');
  end if;

  if p_provider_confirmation is not null
     and locked_order.payment_reference is not null
     and locked_order.payment_reference <> p_provider_confirmation then
    return response_identity || pg_catalog.jsonb_build_object('outcome', 'conflict');
  end if;

  if locked_order.state = 'checkout_pending'
        and p_target_state = 'payment_authorized'
        and p_provider_confirmation is not null then
    transition_allowed := true;
  elsif locked_order.state = 'approved'
        and p_target_state = 'payment_captured'
        and p_provider_confirmation is not null then
    transition_allowed := true;
  elsif locked_order.state = 'fulfilled'
        and p_target_state = 'delivered'
        and p_provider_confirmation is null then
    transition_allowed := true;
  end if;

  -- These verified events are valid but arrived before the only state from
  -- which provider_webhook may apply them. They remain unclaimed so an HTTP
  -- 503 redelivery can succeed after the prerequisite state commits. Stale,
  -- terminal, and permanently actor-forbidden targets are acknowledged below.
  if not transition_allowed
     and (
       (
         p_target_state = 'payment_authorized'
         and locked_order.state = 'draft'
       )
       or (
         p_target_state = 'payment_captured'
         and locked_order.state in (
           'draft', 'checkout_pending', 'payment_authorized', 'manual_review'
         )
       )
       or (
         p_target_state = 'delivered'
         and locked_order.state in (
           'draft', 'checkout_pending', 'payment_authorized', 'manual_review',
           'approved', 'payment_captured', 'processing',
           'partially_fulfilled', 'exception'
         )
       )
     ) then
    return response_identity || pg_catalog.jsonb_build_object('outcome', 'retryable');
  end if;

  if not transition_allowed then
    insert into public.research_provider_webhook_events (
      provider_name, event_id, event_type, received_at, payload_sha256,
      atomic_order_id, atomic_outcome, atomic_applied_at, atomic_capability
    ) values (
      p_provider_name, p_event_id, p_event_type, p_received_at, p_payload_sha256,
      p_order_id, 'acknowledged', p_received_at, capability
    );
    return response_identity || pg_catalog.jsonb_build_object('outcome', 'acknowledged');
  end if;

  -- A verified fulfillment fact updates existing typed shipment rows only. The
  -- routine cannot invent an owner/sequence when checkout persisted none, so it
  -- returns a retryable capability refusal and claims nothing in that case.
  if p_shipment_status is not null then
    perform 1
      from public.research_order_shipments s
     where s.order_id = locked_order.id
     for update;
    if not found then
      return response_identity || pg_catalog.jsonb_build_object('outcome', 'capability_disabled');
    end if;
  end if;

  from_state := locked_order.state;
  update public.research_orders
     set state = p_target_state,
         payment_reference = coalesce(payment_reference, p_provider_confirmation),
         updated_at = p_received_at
   where id = locked_order.id;

  if p_shipment_status is not null then
    update public.research_order_shipments
       set status = p_shipment_status,
           tracking_number = coalesce(p_tracking_number, tracking_number),
           carrier = coalesce(p_carrier, carrier)
     where order_id = locked_order.id;
  end if;

  insert into public.research_order_state_events (
    order_id, from_state, to_state, actor_type, actor_id,
    provider_reference, idempotency_key, occurred_at
  ) values (
    locked_order.id, from_state, p_target_state, 'provider_webhook', null,
    p_provider_confirmation, p_event_id, p_received_at
  );

  insert into public.research_provider_webhook_events (
    provider_name, event_id, event_type, received_at, payload_sha256,
    atomic_order_id, atomic_outcome, atomic_applied_at, atomic_capability
  ) values (
    p_provider_name, p_event_id, p_event_type, p_received_at, p_payload_sha256,
    p_order_id, 'applied', p_received_at, capability
  );

  return response_identity || pg_catalog.jsonb_build_object('outcome', 'applied');
end
$research_commerce_webhook_claim_and_apply_v1$;

comment on function public.research_commerce_webhook_claim_and_apply_v1(
  text, text, text, text, timestamptz, text, text, text, text, text, text, text
) is
  'UNAPPLIED candidate contract v1: one transaction for payload-bound provider inbox claim, locked canonical order transition, append-only state evidence, and existing typed shipment facts.';

alter table public.research_provider_webhook_events enable row level security;
alter table public.research_provider_webhook_events force row level security;

revoke all on table public.research_provider_webhook_events
  from public, anon, authenticated, service_role;
grant select on table public.research_provider_webhook_events to service_role;

revoke all on function public.research_commerce_webhook_inbox_immutable()
  from public, anon, authenticated, service_role;
revoke all on function public.research_commerce_webhook_claim_and_apply_v1(
  text, text, text, text, timestamptz, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.research_commerce_webhook_claim_and_apply_v1(
  text, text, text, text, timestamptz, text, text, text, text, text, text, text
) to service_role;

do $research_commerce_webhook_atomic_postcheck$
declare
  routine_oid oid := pg_catalog.to_regprocedure(
    'public.research_commerce_webhook_claim_and_apply_v1(text,text,text,text,timestamp with time zone,text,text,text,text,text,text,text)'
  );
  helper_oid oid := pg_catalog.to_regprocedure(
    'public.research_commerce_webhook_inbox_immutable()'
  );
  constraint_definition text;
  routine_config text[];
begin
  if routine_oid is null then
    raise exception 'webhook atomic apply: exact v1 routine is absent after apply';
  end if;
  select p.proconfig
    into routine_config
    from pg_catalog.pg_proc p
   where p.oid = routine_oid
     and p.prosecdef
     and p.prorettype = 'pg_catalog.jsonb'::pg_catalog.regtype
     and pg_catalog.pg_get_userbyid(p.proowner) = current_user
     and pg_catalog.obj_description(p.oid, 'pg_proc') =
       'UNAPPLIED candidate contract v1: one transaction for payload-bound provider inbox claim, locked canonical order transition, append-only state evidence, and existing typed shipment facts.';
  if not found
     or routine_config is distinct from array['search_path=pg_catalog']::text[] then
    raise exception 'webhook atomic apply: routine is not SECURITY DEFINER with exact hardened search_path';
  end if;

  if helper_oid is null or not exists (
    select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_language l on l.oid = p.prolang
     where p.oid = helper_oid
       and p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
       and not p.prosecdef
       and l.lanname = 'plpgsql'
       and p.proconfig is not distinct from array['search_path=pg_catalog']::text[]
       and pg_catalog.pg_get_userbyid(p.proowner) = current_user
       and pg_catalog.obj_description(p.oid, 'pg_proc') =
         'research_commerce_webhook_inbox_immutable/v1: exact UPDATE-or-DELETE refusal trigger'
       and p.prosrc = E'\nbegin\n  raise exception ''provider webhook inbox claims are immutable''\n    using errcode = ''55000'';\nend\n'
  ) then
    raise exception 'webhook atomic apply: immutable helper definition is not exact';
  end if;

  select pg_catalog.pg_get_constraintdef(c.oid)
    into constraint_definition
    from pg_catalog.pg_constraint c
   where c.conrelid = 'public.research_provider_webhook_events'::pg_catalog.regclass
     and c.conname = 'research_provider_webhook_events_atomic_bundle_check'
     and c.contype = 'c'
     and c.convalidated
     and not c.connoinherit;
  if not found or constraint_definition is distinct from
    'CHECK ((((payload_sha256 IS NULL) AND (atomic_order_id IS NULL) AND (atomic_outcome IS NULL) AND (atomic_applied_at IS NULL) AND (atomic_capability IS NULL)) OR ((payload_sha256 ~ ''^[0-9a-f]{64}$''::text) AND (atomic_outcome = ANY (ARRAY[''applied''::text, ''acknowledged''::text])) AND (atomic_applied_at IS NOT NULL) AND (atomic_capability = ''research_commerce_webhook_atomic_apply/v1''::text))))' then
    raise exception 'webhook atomic apply: atomic bundle constraint definition is not exact';
  end if;
  if pg_catalog.has_function_privilege('anon', routine_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', routine_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', routine_oid, 'EXECUTE')
     or exists (
       select 1
         from pg_catalog.pg_proc p,
              lateral pg_catalog.aclexplode(
                coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) acl
        where p.oid = routine_oid
          and acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
     ) then
    raise exception 'webhook atomic apply: exact routine ACL is not service_role-only';
  end if;
  if not pg_catalog.has_table_privilege(
       'service_role', 'public.research_provider_webhook_events', 'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'service_role', 'public.research_provider_webhook_events', 'INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'anon', 'public.research_provider_webhook_events', 'SELECT,INSERT,UPDATE,DELETE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', 'public.research_provider_webhook_events', 'SELECT,INSERT,UPDATE,DELETE'
     ) then
    raise exception 'webhook atomic apply: inbox table ACL is not service_role read-only';
  end if;
  if not exists (
    select 1
      from pg_catalog.pg_trigger t
     where t.tgrelid = 'public.research_provider_webhook_events'::pg_catalog.regclass
       and t.tgname = 'research_commerce_webhook_inbox_immutable'
       and t.tgfoid = helper_oid
       and t.tgtype = 27
       and t.tgenabled = 'O'
       and t.tgconstraint = 0
       and not t.tgisinternal
  ) then
    raise exception 'webhook atomic apply: inbox immutability trigger definition is not exact';
  end if;
end
$research_commerce_webhook_atomic_postcheck$;

commit;
