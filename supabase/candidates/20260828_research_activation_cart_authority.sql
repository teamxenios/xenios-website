-- CANDIDATE ONLY. UNAPPLIED. DO NOT add this file to the protected migration
-- DAG or production ledger without a separate, exact-SHA review and opt-in.
--
-- This candidate closes the activation/cart TOCTOU by making the exact
-- Product Control binding, immutable activation revision, current head, cart
-- line authority snapshot, and cart CAS one PostgreSQL command. It also adds a
-- short-lived precharge intent. The intent is a database-enforced lease across
-- external provider I/O; it is not a claim that a SQL transaction spans that
-- I/O. Settlement consumes the intent in its own transaction and terminal
-- pre-provider compensation cancels it.

begin;

do $candidate_preflight$
declare
  v_missing text[] := array[]::text[];
begin
  if to_regclass('public.research_products') is null then
    v_missing := array_append(v_missing, 'public.research_products');
  end if;
  if to_regclass('public.research_product_variants') is null then
    v_missing := array_append(v_missing, 'public.research_product_variants');
  end if;
  if to_regclass('public.research_carts') is null then
    v_missing := array_append(v_missing, 'public.research_carts');
  end if;
  if to_regclass('public.research_cart_lines') is null then
    v_missing := array_append(v_missing, 'public.research_cart_lines');
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    v_missing := array_append(v_missing, 'extensions.digest(bytea,text)');
  end if;
  if cardinality(v_missing) <> 0 then
    raise exception 'activation cart authority prerequisites missing: %',
      array_to_string(v_missing, ', ');
  end if;

  if to_regclass('public.research_product_variant_activation_revisions') is not null
     or to_regclass('public.research_product_variant_activation_heads') is not null
     or to_regclass('public.research_cart_line_activation_authority') is not null
     or to_regclass('public.research_cart_activation_versions') is not null
     or to_regclass('public.research_checkout_activation_intents') is not null
     or to_regclass('public.research_checkout_activation_intent_lines') is not null
     or to_regprocedure(
       'public.research_cart_mutate_with_activation_v1(uuid,text,text,integer,text,integer,timestamp with time zone,integer)'
     ) is not null
  then
    raise exception 'activation cart authority candidate is already present; refusing an in-place rerun';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.research_products'::regclass
      and attname = 'version' and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
    where attrelid = 'public.research_products'::regclass
      and attname = 'active_state' and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
    where attrelid = 'public.research_products'::regclass
      and attname = 'visibility_state' and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
    where attrelid = 'public.research_product_variants'::regclass
      and attname = 'version' and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
    where attrelid = 'public.research_product_variants'::regclass
      and attname = 'member_eligible' and not attisdropped
  ) then
    raise exception 'canonical Product Control revision/lifecycle columns are missing';
  end if;
end
$candidate_preflight$;

create function public.research_activation_hash_json_v1(p_payload jsonb)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select 'sha256:' || encode(
    extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  )
$function$;

create function public.research_activation_binding_fingerprint_v1(
  p_product_id uuid,
  p_variant_id uuid,
  p_sku text,
  p_product_revision integer,
  p_variant_revision integer
)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select 'sha256:' || encode(extensions.digest(convert_to(
    '['
      || to_json(p_product_id::text)::text || ','
      || to_json(p_variant_id::text)::text || ','
      || to_json(p_sku)::text || ','
      || p_product_revision::text || ','
      || p_variant_revision::text
      || ']',
    'UTF8'
  ), 'sha256'), 'hex')
$function$;

create function public.research_activation_evidence_fingerprint_v1(
  p_schema_version smallint,
  p_ledger_revision bigint,
  p_product_id uuid,
  p_variant_id uuid,
  p_sku text,
  p_product_state text,
  p_variant_state text,
  p_approval_id uuid,
  p_approved_by_actor_id uuid,
  p_approved_by_role text,
  p_approved_at timestamptz,
  p_reviewed_at timestamptz,
  p_valid_from timestamptz,
  p_valid_through timestamptz,
  p_revoked_at timestamptz
)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  -- Byte-for-byte parity with
  -- canonicalProductVariantActivationPayload() in authority-repository.ts.
  select 'sha256:' || encode(extensions.digest(convert_to(
    '['
      || p_schema_version::text || ','
      || p_ledger_revision::text || ','
      || to_json(p_product_id::text)::text || ','
      || to_json(p_variant_id::text)::text || ','
      || to_json(p_sku)::text || ','
      || to_json(p_product_state)::text || ','
      || to_json(p_variant_state)::text || ','
      || to_json(p_approval_id::text)::text || ','
      || to_json(p_approved_by_actor_id::text)::text || ','
      || to_json(p_approved_by_role)::text || ','
      || to_json(to_char(p_approved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ','
      || to_json(to_char(p_reviewed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ','
      || to_json(to_char(p_valid_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ','
      || to_json(to_char(p_valid_through at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ','
      || case when p_revoked_at is null then 'null' else
           to_json(to_char(p_revoked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text
         end
      || ']',
    'UTF8'
  ), 'sha256'), 'hex')
$function$;

create table public.research_product_variant_activation_revisions (
  ledger_revision bigint generated always as identity primary key,
  schema_version smallint not null default 1 check (schema_version = 1),
  product_id uuid not null references public.research_products(id),
  variant_id uuid not null,
  sku text not null check (sku = btrim(sku) and length(sku) between 1 and 200),
  product_revision integer not null check (product_revision > 0),
  variant_revision integer not null check (variant_revision > 0),
  product_state text not null
    check (product_state in ('live','held','pending','unavailable','retired')),
  variant_state text not null
    check (variant_state in ('live','held','pending','unavailable','retired')),
  approval_id uuid not null,
  approved_by_actor_id uuid not null,
  approved_by_role text not null
    check (approved_by_role in ('founder','super_admin')),
  approved_at timestamptz not null,
  reviewed_at timestamptz not null,
  valid_from timestamptz not null,
  valid_through timestamptz not null,
  revoked_at timestamptz,
  evidence_fingerprint text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint research_activation_revision_variant_product_fk
    foreign key (product_id, variant_id)
    references public.research_product_variants(product_id, id),
  constraint research_activation_revision_chronology
    check (
      approved_at <= reviewed_at
      and reviewed_at <= valid_from
      and valid_from < valid_through
      and (revoked_at is null or revoked_at >= approved_at)
    ),
  constraint research_activation_revision_exact_unique
    unique (ledger_revision, product_id, variant_id, sku)
);

comment on table public.research_product_variant_activation_revisions is
  'Candidate-only append-only product+variant activation evidence. A row is not current unless the exact SKU head points to it.';

create function public.research_activation_revision_prepare_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if tg_op <> 'INSERT' then
    raise exception 'activation revisions are append-only' using errcode = '55000';
  end if;
  new.approved_at := date_trunc('milliseconds', new.approved_at);
  new.reviewed_at := date_trunc('milliseconds', new.reviewed_at);
  new.valid_from := date_trunc('milliseconds', new.valid_from);
  new.valid_through := date_trunc('milliseconds', new.valid_through);
  new.revoked_at := case when new.revoked_at is null then null
    else date_trunc('milliseconds', new.revoked_at) end;
  new.evidence_fingerprint := public.research_activation_evidence_fingerprint_v1(
    new.schema_version,
    new.ledger_revision,
    new.product_id,
    new.variant_id,
    new.sku,
    new.product_state,
    new.variant_state,
    new.approval_id,
    new.approved_by_actor_id,
    new.approved_by_role,
    new.approved_at,
    new.reviewed_at,
    new.valid_from,
    new.valid_through,
    new.revoked_at
  );
  return new;
end
$function$;

create trigger research_activation_revision_prepare_v1
before insert or update or delete
on public.research_product_variant_activation_revisions
for each row execute function public.research_activation_revision_prepare_v1();

create table public.research_product_variant_activation_heads (
  sku text primary key,
  product_id uuid not null,
  variant_id uuid not null,
  ledger_revision bigint not null unique,
  appointed_at timestamptz not null default clock_timestamp(),
  constraint research_activation_head_exact_revision_fk
    foreign key (ledger_revision, product_id, variant_id, sku)
    references public.research_product_variant_activation_revisions(
      ledger_revision, product_id, variant_id, sku
    )
);

create table public.research_cart_activation_versions (
  cart_id uuid primary key references public.research_carts(id) on delete cascade,
  version bigint not null check (version > 0),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.research_cart_line_activation_authority (
  cart_id uuid not null,
  sku text not null,
  product_id uuid not null,
  variant_id uuid not null,
  product_revision integer not null check (product_revision > 0),
  variant_revision integer not null check (variant_revision > 0),
  binding_fingerprint text not null check (binding_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  activation_ledger_revision bigint not null,
  activation_evidence_fingerprint text not null
    check (activation_evidence_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (cart_id, sku),
  constraint research_cart_line_activation_line_fk
    foreign key (cart_id, sku)
    references public.research_cart_lines(cart_id, sku)
    on delete cascade,
  constraint research_cart_line_activation_revision_fk
    foreign key (activation_ledger_revision, product_id, variant_id, sku)
    references public.research_product_variant_activation_revisions(
      ledger_revision, product_id, variant_id, sku
    )
);

create table public.research_checkout_activation_intents (
  intent_id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null,
  checkout_idempotency_key_hash text not null
    check (checkout_idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  cart_id uuid not null references public.research_carts(id),
  cart_version bigint not null check (cart_version > 0),
  cart_fingerprint text not null check (cart_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  authorization_digest text check (authorization_digest ~ '^sha256:[a-f0-9]{64}$'),
  state text not null default 'authorized'
    check (state in ('authorized','claimed','consumed','cancelled')),
  checkout_command_id uuid,
  checkout_command_digest text
    check (checkout_command_digest is null or checkout_command_digest ~ '^sha256:[a-f0-9]{64}$'),
  authorized_at timestamptz not null,
  expires_at timestamptz not null,
  bound_at timestamptz,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint research_checkout_activation_intent_key_unique
    unique (member_id, checkout_idempotency_key_hash),
  constraint research_checkout_activation_intent_window
    check (authorized_at < expires_at),
  constraint research_checkout_activation_intent_state_shape
    check (
      (state = 'authorized' and checkout_command_id is null
          and consumed_at is null and cancelled_at is null)
      or (state = 'claimed' and checkout_command_id is not null
          and checkout_command_digest is not null
          and consumed_at is null and cancelled_at is null)
      or (state = 'consumed' and checkout_command_id is not null
          and checkout_command_digest is not null and consumed_at is not null
          and cancelled_at is null)
      or (state = 'cancelled' and checkout_command_id is not null
          and checkout_command_digest is not null and cancelled_at is not null
          and consumed_at is null)
    ),
  constraint research_checkout_activation_intent_binding_shape
    check (
      (checkout_command_id is null and checkout_command_digest is null and bound_at is null)
      or (checkout_command_id is not null and checkout_command_digest is not null and bound_at is not null)
    )
);

create index research_checkout_activation_intents_cart_live_idx
on public.research_checkout_activation_intents(cart_id, expires_at)
where state in ('authorized','claimed');

create table public.research_checkout_activation_intent_lines (
  intent_id uuid not null
    references public.research_checkout_activation_intents(intent_id) on delete restrict,
  line_ordinal integer not null check (line_ordinal > 0),
  sku text not null,
  quantity integer not null check (quantity > 0 and quantity <= 100),
  purchase_mode text not null check (purchase_mode in ('one_time','subscription')),
  subscription_frequency_days integer check (subscription_frequency_days in (30,60,90)),
  product_id uuid not null,
  variant_id uuid not null,
  product_revision integer not null check (product_revision > 0),
  variant_revision integer not null check (variant_revision > 0),
  binding_fingerprint text not null check (binding_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  activation_ledger_revision bigint not null,
  activation_evidence_fingerprint text not null
    check (activation_evidence_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  primary key (intent_id, line_ordinal),
  unique (intent_id, sku),
  constraint research_checkout_activation_line_mode_shape
    check ((purchase_mode = 'subscription') = (subscription_frequency_days is not null)),
  constraint research_checkout_activation_line_revision_fk
    foreign key (activation_ledger_revision, product_id, variant_id, sku)
    references public.research_product_variant_activation_revisions(
      ledger_revision, product_id, variant_id, sku
    )
);

create index research_checkout_activation_intent_lines_authority_idx
on public.research_checkout_activation_intent_lines(product_id, variant_id, sku, intent_id);

create function public.research_activation_line_is_current_v1(
  p_product_id uuid,
  p_variant_id uuid,
  p_sku text,
  p_product_revision integer,
  p_variant_revision integer,
  p_binding_fingerprint text,
  p_ledger_revision bigint,
  p_evidence_fingerprint text,
  p_evaluated_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.research_products p
    join public.research_product_variants v
      on v.product_id = p.id
    join public.research_product_variant_activation_heads h
      on h.sku = v.sku
     and h.product_id = p.id
     and h.variant_id = v.id
    join public.research_product_variant_activation_revisions r
      on r.ledger_revision = h.ledger_revision
     and r.product_id = h.product_id
     and r.variant_id = h.variant_id
     and r.sku = h.sku
    where p.id = p_product_id
      and v.id = p_variant_id
      and v.sku = p_sku
      and p.version = p_product_revision
      and v.version = p_variant_revision
      and public.research_activation_binding_fingerprint_v1(
        p.id, v.id, v.sku, p.version, v.version
      ) = p_binding_fingerprint
      and h.ledger_revision = p_ledger_revision
      and r.product_revision = p.version
      and r.variant_revision = v.version
      and r.evidence_fingerprint = p_evidence_fingerprint
      and r.evidence_fingerprint = public.research_activation_evidence_fingerprint_v1(
        r.schema_version,
        r.ledger_revision,
        r.product_id,
        r.variant_id,
        r.sku,
        r.product_state,
        r.variant_state,
        r.approval_id,
        r.approved_by_actor_id,
        r.approved_by_role,
        r.approved_at,
        r.reviewed_at,
        r.valid_from,
        r.valid_through,
        r.revoked_at
      )
      and p.admin_status = 'published'
      and p.active_state
      and p.visibility_state <> 'hidden'
      and p.commerce_approval = 'approved'
      and p.availability in ('in_stock','low_stock')
      and v.status = 'approved'
      and v.active
      and v.member_eligible
      and r.product_state = 'live'
      and r.variant_state = 'live'
      and r.revoked_at is null
      and r.approved_at <= r.reviewed_at
      and r.reviewed_at <= r.valid_from
      and r.valid_from <= p_evaluated_at
      and p_evaluated_at < r.valid_through
      and r.valid_from <= clock_timestamp()
      and clock_timestamp() < r.valid_through
  )
$function$;

create function public.research_activation_cart_fingerprint_v1(
  p_cart_id uuid,
  p_cart_version bigint
)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select public.research_activation_hash_json_v1(jsonb_build_object(
    'protocol', 'xenios:research-activation-cart-snapshot:v1',
    'cartId', p_cart_id::text,
    'cartVersion', p_cart_version,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_array(
        l.sku,
        l.quantity,
        l.purchase_mode,
        l.subscription_frequency_days,
        a.product_id::text,
        a.variant_id::text,
        a.product_revision,
        a.variant_revision,
        a.binding_fingerprint,
        a.activation_ledger_revision,
        a.activation_evidence_fingerprint
      ) order by l.sku)
      from public.research_cart_lines l
      join public.research_cart_line_activation_authority a
        on a.cart_id = l.cart_id and a.sku = l.sku
      where l.cart_id = p_cart_id
    ), '[]'::jsonb)
  ))
$function$;

create function public.research_checkout_activation_authorization_digest_v1(
  p_intent_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select public.research_activation_hash_json_v1(jsonb_build_object(
    'protocol', 'xenios:research-checkout-activation-intent:v1',
    'intentId', i.intent_id::text,
    'memberId', i.member_id::text,
    'checkoutKeyHash', i.checkout_idempotency_key_hash,
    'cartId', i.cart_id::text,
    'cartVersion', i.cart_version,
    'cartFingerprint', i.cart_fingerprint,
    'authorizedAt', to_char(i.authorized_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'expiresAt', to_char(i.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_array(
        l.line_ordinal,
        l.sku,
        l.quantity,
        l.purchase_mode,
        l.subscription_frequency_days,
        l.product_id::text,
        l.variant_id::text,
        l.product_revision,
        l.variant_revision,
        l.binding_fingerprint,
        l.activation_ledger_revision,
        l.activation_evidence_fingerprint
      ) order by l.line_ordinal)
      from public.research_checkout_activation_intent_lines l
      where l.intent_id = i.intent_id
    ), '[]'::jsonb)
  ))
  from public.research_checkout_activation_intents i
  where i.intent_id = p_intent_id
$function$;

create function public.research_checkout_activation_command_digest_v1(
  p_intent_id uuid,
  p_authorization_digest text,
  p_checkout_command_id uuid,
  p_member_id uuid,
  p_checkout_idempotency_key_hash text,
  p_cart_fingerprint text
)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select public.research_activation_hash_json_v1(jsonb_build_array(
    'xenios:research-checkout-activation-command:v1',
    p_intent_id::text,
    p_authorization_digest,
    p_checkout_command_id::text,
    p_member_id::text,
    p_checkout_idempotency_key_hash,
    p_cart_fingerprint
  ))
$function$;

create function public.research_activation_intent_line_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  raise exception 'checkout activation intent lines are immutable' using errcode = '55000';
end
$function$;

create trigger research_activation_intent_line_immutable_v1
before update or delete
on public.research_checkout_activation_intent_lines
for each row execute function public.research_activation_intent_line_immutable_v1();

create function public.research_activation_live_intent_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_product_id uuid;
  v_old_product_id uuid;
  v_variant_id uuid;
  v_old_variant_id uuid;
  v_sku text;
  v_old_sku text;
  v_cart_id uuid;
  v_old_cart_id uuid;
begin
  if tg_table_name = 'research_products' then
    v_product_id := case when tg_op = 'DELETE' then old.id else new.id end;
    v_old_product_id := case when tg_op = 'UPDATE' then old.id else v_product_id end;
    if exists (
      select 1
      from public.research_checkout_activation_intents i
      join public.research_checkout_activation_intent_lines l using (intent_id)
      where (i.state = 'claimed'
             or (i.state = 'authorized' and i.expires_at > clock_timestamp()))
        and l.product_id in (v_old_product_id, v_product_id)
    ) then
      raise exception 'product authority is leased by an active checkout intent'
        using errcode = '55000';
    end if;
  elsif tg_table_name = 'research_product_variants' then
    v_variant_id := case when tg_op = 'DELETE' then old.id else new.id end;
    v_old_variant_id := case when tg_op = 'UPDATE' then old.id else v_variant_id end;
    v_sku := case when tg_op = 'DELETE' then old.sku else new.sku end;
    v_old_sku := case when tg_op = 'UPDATE' then old.sku else v_sku end;
    if exists (
      select 1
      from public.research_checkout_activation_intents i
      join public.research_checkout_activation_intent_lines l using (intent_id)
      where (i.state = 'claimed'
             or (i.state = 'authorized' and i.expires_at > clock_timestamp()))
        and (l.variant_id in (v_old_variant_id, v_variant_id)
             or l.sku in (v_old_sku, v_sku))
    ) then
      raise exception 'variant authority is leased by an active checkout intent'
        using errcode = '55000';
    end if;
  elsif tg_table_name = 'research_product_variant_activation_heads' then
    v_sku := case when tg_op = 'DELETE' then old.sku else new.sku end;
    v_old_sku := case when tg_op = 'UPDATE' then old.sku else v_sku end;
    if exists (
      select 1
      from public.research_checkout_activation_intents i
      join public.research_checkout_activation_intent_lines l using (intent_id)
      where (i.state = 'claimed'
             or (i.state = 'authorized' and i.expires_at > clock_timestamp()))
        and l.sku in (v_old_sku, v_sku)
    ) then
      raise exception 'activation head is leased by an active checkout intent'
        using errcode = '55000';
    end if;
  elsif tg_table_name = 'research_cart_lines' then
    v_cart_id := case when tg_op = 'DELETE' then old.cart_id else new.cart_id end;
    v_old_cart_id := case when tg_op = 'UPDATE' then old.cart_id else v_cart_id end;
    if exists (
      select 1 from public.research_checkout_activation_intents i
      where i.cart_id in (v_old_cart_id, v_cart_id)
        and (i.state = 'claimed'
             or (i.state = 'authorized' and i.expires_at > clock_timestamp()))
    ) then
      raise exception 'cart is leased by an active checkout intent'
        using errcode = '55000';
    end if;
  elsif tg_table_name = 'research_carts' then
    v_cart_id := case when tg_op = 'DELETE' then old.id else new.id end;
    v_old_cart_id := case when tg_op = 'UPDATE' then old.id else v_cart_id end;
    if exists (
      select 1 from public.research_checkout_activation_intents i
      where i.cart_id in (v_old_cart_id, v_cart_id)
        and (i.state = 'claimed'
             or (i.state = 'authorized' and i.expires_at > clock_timestamp()))
    ) then
      raise exception 'cart is leased by an active checkout intent'
        using errcode = '55000';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$function$;

create trigger research_activation_product_live_intent_guard_v1
before update or delete on public.research_products
for each row execute function public.research_activation_live_intent_guard_v1();

create trigger research_activation_variant_live_intent_guard_v1
before update or delete on public.research_product_variants
for each row execute function public.research_activation_live_intent_guard_v1();

create trigger research_activation_head_live_intent_guard_v1
before insert or update or delete on public.research_product_variant_activation_heads
for each row execute function public.research_activation_live_intent_guard_v1();

create trigger research_activation_cart_line_live_intent_guard_v1
before insert or update or delete on public.research_cart_lines
for each row execute function public.research_activation_live_intent_guard_v1();

create trigger research_activation_cart_live_intent_guard_v1
before update or delete on public.research_carts
for each row execute function public.research_activation_live_intent_guard_v1();

create function public.research_cart_mutate_with_activation_v1(
  p_member_id uuid,
  p_action text,
  p_sku text,
  p_quantity integer,
  p_purchase_mode text,
  p_subscription_frequency_days integer,
  p_evaluated_at timestamptz,
  p_max_line_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_product_id uuid;
  v_variant_id uuid;
  v_product_revision integer;
  v_variant_revision integer;
  v_ledger_revision bigint;
  v_evidence_fingerprint text;
  v_binding_fingerprint text;
  v_cart_id uuid;
  v_cart_version bigint;
  v_existing_quantity integer;
  v_existing_mode text;
  v_existing_frequency integer;
  v_next_quantity integer;
  v_lines jsonb;
begin
  if p_action not in ('add','set_quantity')
     or p_sku is null or p_sku <> btrim(p_sku) or length(p_sku) not between 1 and 200
     or p_quantity is null or p_quantity <= 0
     or p_max_line_quantity is null or p_max_line_quantity not between 1 and 100
     or p_quantity > p_max_line_quantity
     or p_evaluated_at is null
     or p_evaluated_at < v_now - interval '2 minutes'
     or p_evaluated_at > v_now + interval '30 seconds'
     or (p_action = 'add' and (
       p_purchase_mode not in ('one_time','subscription')
       or (p_purchase_mode = 'subscription') <> (p_subscription_frequency_days is not null)
       or (p_subscription_frequency_days is not null and p_subscription_frequency_days not in (30,60,90))
     ))
     or (p_action = 'set_quantity' and (
       p_purchase_mode is not null or p_subscription_frequency_days is not null
     ))
  then
    return jsonb_build_object('ok', false, 'code', 'cart_conflict');
  end if;

  -- SHARE conflicts with every ordinary Product Control/head/ledger writer.
  -- All authority commands use this fixed table order, so no writer can slip
  -- between validation and the cart mutation.
  lock table public.research_products,
    public.research_product_variants,
    public.research_product_variant_activation_revisions,
    public.research_product_variant_activation_heads
    in share mode;

  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:research-activation-cart:v1|member|' || p_member_id::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:research-activation-cart:v1|sku|' || p_sku, 0
  ));

  select p.id, v.id, p.version, v.version, h.ledger_revision,
         r.evidence_fingerprint
  into v_product_id, v_variant_id, v_product_revision, v_variant_revision,
       v_ledger_revision, v_evidence_fingerprint
  from public.research_products p
  join public.research_product_variants v on v.product_id = p.id
  join public.research_product_variant_activation_heads h
    on h.sku = v.sku and h.product_id = p.id and h.variant_id = v.id
  join public.research_product_variant_activation_revisions r
    on r.ledger_revision = h.ledger_revision
   and r.product_id = h.product_id and r.variant_id = h.variant_id and r.sku = h.sku
  where v.sku = p_sku
    and p.admin_status = 'published'
    and p.active_state
    and p.visibility_state <> 'hidden'
    and p.commerce_approval = 'approved'
    and p.availability in ('in_stock','low_stock')
    and v.status = 'approved'
    and v.active
    and v.member_eligible
    and r.product_revision = p.version
    and r.variant_revision = v.version
    and r.product_state = 'live'
    and r.variant_state = 'live'
    and r.revoked_at is null
    and r.valid_from <= p_evaluated_at and p_evaluated_at < r.valid_through
    and r.valid_from <= v_now and v_now < r.valid_through
    and r.evidence_fingerprint = public.research_activation_evidence_fingerprint_v1(
      r.schema_version, r.ledger_revision, r.product_id, r.variant_id, r.sku,
      r.product_state, r.variant_state,
      r.approval_id, r.approved_by_actor_id, r.approved_by_role,
      r.approved_at, r.reviewed_at, r.valid_from, r.valid_through, r.revoked_at
    );

  if not found then
    return jsonb_build_object('ok', false, 'code', 'activation_not_live');
  end if;

  v_binding_fingerprint := public.research_activation_binding_fingerprint_v1(
    v_product_id, v_variant_id, p_sku, v_product_revision, v_variant_revision
  );

  select c.id into v_cart_id
  from public.research_carts c
  where c.member_id = p_member_id
  for update;

  if v_cart_id is null then
    if p_action = 'set_quantity' then
      return jsonb_build_object('ok', false, 'code', 'product_not_found');
    end if;
    insert into public.research_carts(member_id, created_at, updated_at)
    values (p_member_id, v_now, v_now)
    returning id into v_cart_id;
    insert into public.research_cart_activation_versions(cart_id, version, updated_at)
    values (v_cart_id, 1, v_now)
    returning version into v_cart_version;
  else
    if exists (
      select 1 from public.research_checkout_activation_intents i
      where i.cart_id = v_cart_id
        and (i.state = 'claimed' or (i.state = 'authorized' and i.expires_at > v_now))
    ) then
      return jsonb_build_object('ok', false, 'code', 'cart_conflict');
    end if;
    select av.version into v_cart_version
    from public.research_cart_activation_versions av
    where av.cart_id = v_cart_id
    for update;
    if v_cart_version is null then
      if exists (select 1 from public.research_cart_lines where cart_id = v_cart_id) then
        return jsonb_build_object('ok', false, 'code', 'cart_conflict');
      end if;
      insert into public.research_cart_activation_versions(cart_id, version, updated_at)
      values (v_cart_id, 1, v_now)
      returning version into v_cart_version;
    end if;
  end if;

  select l.quantity, l.purchase_mode, l.subscription_frequency_days
  into v_existing_quantity, v_existing_mode, v_existing_frequency
  from public.research_cart_lines l
  where l.cart_id = v_cart_id and l.sku = p_sku
  for update;

  if p_action = 'set_quantity' and not found then
    return jsonb_build_object('ok', false, 'code', 'product_not_found');
  end if;

  if p_action = 'add' then
    v_next_quantity := coalesce(v_existing_quantity, 0) + p_quantity;
  else
    v_next_quantity := p_quantity;
  end if;
  if v_next_quantity <= 0 or v_next_quantity > p_max_line_quantity then
    return jsonb_build_object('ok', false, 'code', 'quantity_invalid');
  end if;

  insert into public.research_cart_lines(
    cart_id, sku, quantity, purchase_mode, subscription_frequency_days, added_at
  ) values (
    v_cart_id,
    p_sku,
    v_next_quantity,
    case when p_action = 'add' then p_purchase_mode else v_existing_mode end,
    case when p_action = 'add' then p_subscription_frequency_days else v_existing_frequency end,
    v_now
  )
  on conflict (cart_id, sku) do update set
    quantity = excluded.quantity,
    purchase_mode = excluded.purchase_mode,
    subscription_frequency_days = excluded.subscription_frequency_days;

  insert into public.research_cart_line_activation_authority(
    cart_id, sku, product_id, variant_id, product_revision, variant_revision,
    binding_fingerprint, activation_ledger_revision,
    activation_evidence_fingerprint, recorded_at
  ) values (
    v_cart_id, p_sku, v_product_id, v_variant_id,
    v_product_revision, v_variant_revision, v_binding_fingerprint,
    v_ledger_revision, v_evidence_fingerprint, v_now
  )
  on conflict (cart_id, sku) do update set
    product_id = excluded.product_id,
    variant_id = excluded.variant_id,
    product_revision = excluded.product_revision,
    variant_revision = excluded.variant_revision,
    binding_fingerprint = excluded.binding_fingerprint,
    activation_ledger_revision = excluded.activation_ledger_revision,
    activation_evidence_fingerprint = excluded.activation_evidence_fingerprint,
    recorded_at = excluded.recorded_at;

  update public.research_cart_activation_versions
  set version = version + 1, updated_at = v_now
  where cart_id = v_cart_id
  returning version into v_cart_version;
  update public.research_carts set updated_at = v_now where id = v_cart_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sku', l.sku,
    'quantity', l.quantity,
    'purchaseMode', l.purchase_mode,
    'subscriptionFrequencyDays', l.subscription_frequency_days
  ) order by l.sku), '[]'::jsonb)
  into v_lines
  from public.research_cart_lines l where l.cart_id = v_cart_id;

  return jsonb_build_object(
    'ok', true,
    'cartId', v_cart_id,
    'cartVersion', v_cart_version,
    'lines', v_lines,
    'authority', jsonb_build_object(
      'productId', v_product_id,
      'variantId', v_variant_id,
      'sku', p_sku,
      'productRevision', v_product_revision,
      'variantRevision', v_variant_revision,
      'bindingFingerprint', v_binding_fingerprint,
      'activationLedgerRevision', v_ledger_revision,
      'activationEvidenceFingerprint', v_evidence_fingerprint
    )
  );
exception when unique_violation or foreign_key_violation or check_violation then
  return jsonb_build_object('ok', false, 'code', 'cart_conflict');
end
$function$;

create function public.research_checkout_activation_precharge_authorize_v1(
  p_member_id uuid,
  p_checkout_idempotency_key_hash text,
  p_evaluated_at timestamptz,
  p_lease_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_cart_id uuid;
  v_cart_version bigint;
  v_cart_fingerprint text;
  v_intent public.research_checkout_activation_intents%rowtype;
  v_intent_id uuid;
  v_authorization_digest text;
  v_line_count integer;
  v_authority_count integer;
  v_invalid_count integer;
  v_lines jsonb;
begin
  if p_checkout_idempotency_key_hash !~ '^[a-f0-9]{64}$'
     or p_evaluated_at is null
     or p_evaluated_at < v_now - interval '2 minutes'
     or p_evaluated_at > v_now + interval '30 seconds'
     or p_lease_ttl_seconds not between 1 and 300
  then
    return jsonb_build_object('ok', false, 'code', 'cart_conflict');
  end if;

  lock table public.research_products,
    public.research_product_variants,
    public.research_product_variant_activation_revisions,
    public.research_product_variant_activation_heads
    in share mode;
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:research-activation-cart:v1|member|' || p_member_id::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:research-checkout-activation:v1|key|' || p_member_id::text || '|' || p_checkout_idempotency_key_hash, 0
  ));

  select c.id into v_cart_id from public.research_carts c
  where c.member_id = p_member_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'cart_empty');
  end if;
  perform 1 from public.research_cart_lines l
  where l.cart_id = v_cart_id order by l.sku for update;

  select av.version into v_cart_version
  from public.research_cart_activation_versions av
  where av.cart_id = v_cart_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'cart_conflict');
  end if;

  select count(*) into v_line_count
  from public.research_cart_lines where cart_id = v_cart_id;
  if v_line_count = 0 then
    return jsonb_build_object('ok', false, 'code', 'cart_empty');
  end if;
  select count(*) into v_authority_count
  from public.research_cart_line_activation_authority where cart_id = v_cart_id;
  if v_line_count <> v_authority_count then
    return jsonb_build_object('ok', false, 'code', 'activation_not_live');
  end if;
  select count(*) into v_invalid_count
  from public.research_cart_line_activation_authority a
  where a.cart_id = v_cart_id and not public.research_activation_line_is_current_v1(
    a.product_id, a.variant_id, a.sku, a.product_revision, a.variant_revision,
    a.binding_fingerprint, a.activation_ledger_revision,
    a.activation_evidence_fingerprint, p_evaluated_at
  );
  if v_invalid_count <> 0 then
    return jsonb_build_object('ok', false, 'code', 'activation_not_live');
  end if;

  v_cart_fingerprint := public.research_activation_cart_fingerprint_v1(
    v_cart_id, v_cart_version
  );

  select * into v_intent
  from public.research_checkout_activation_intents i
  where i.member_id = p_member_id
    and i.checkout_idempotency_key_hash = p_checkout_idempotency_key_hash
  for update;
  if found then
    if v_intent.state not in ('authorized','claimed')
       or (v_intent.state = 'authorized' and v_intent.expires_at <= v_now)
       or v_intent.cart_id <> v_cart_id
       or v_intent.cart_version <> v_cart_version
       or v_intent.cart_fingerprint <> v_cart_fingerprint
       or v_intent.authorization_digest is distinct from
          public.research_checkout_activation_authorization_digest_v1(v_intent.intent_id)
    then
      return jsonb_build_object('ok', false, 'code', 'cart_conflict');
    end if;
    v_intent_id := v_intent.intent_id;
    v_authorization_digest := v_intent.authorization_digest;
  else
    insert into public.research_checkout_activation_intents(
      member_id, checkout_idempotency_key_hash, cart_id, cart_version,
      cart_fingerprint, authorized_at, expires_at
    ) values (
      p_member_id, p_checkout_idempotency_key_hash, v_cart_id, v_cart_version,
      v_cart_fingerprint, v_now, v_now + make_interval(secs => p_lease_ttl_seconds)
    ) returning intent_id into v_intent_id;

    insert into public.research_checkout_activation_intent_lines(
      intent_id, line_ordinal, sku, quantity, purchase_mode,
      subscription_frequency_days, product_id, variant_id, product_revision,
      variant_revision, binding_fingerprint, activation_ledger_revision,
      activation_evidence_fingerprint
    )
    select v_intent_id,
      row_number() over (order by l.sku)::integer,
      l.sku, l.quantity, l.purchase_mode, l.subscription_frequency_days,
      a.product_id, a.variant_id, a.product_revision, a.variant_revision,
      a.binding_fingerprint, a.activation_ledger_revision,
      a.activation_evidence_fingerprint
    from public.research_cart_lines l
    join public.research_cart_line_activation_authority a
      on a.cart_id = l.cart_id and a.sku = l.sku
    where l.cart_id = v_cart_id
    order by l.sku;

    v_authorization_digest :=
      public.research_checkout_activation_authorization_digest_v1(v_intent_id);
    update public.research_checkout_activation_intents
    set authorization_digest = v_authorization_digest
    where intent_id = v_intent_id;
  end if;

  select jsonb_agg(jsonb_build_object(
    'sku', l.sku,
    'quantity', l.quantity,
    'purchaseMode', l.purchase_mode,
    'subscriptionFrequencyDays', l.subscription_frequency_days,
    'productId', l.product_id,
    'variantId', l.variant_id,
    'productRevision', l.product_revision,
    'variantRevision', l.variant_revision,
    'bindingFingerprint', l.binding_fingerprint,
    'activationLedgerRevision', l.activation_ledger_revision,
    'activationEvidenceFingerprint', l.activation_evidence_fingerprint
  ) order by l.line_ordinal)
  into v_lines
  from public.research_checkout_activation_intent_lines l
  where l.intent_id = v_intent_id;

  select * into v_intent from public.research_checkout_activation_intents
  where intent_id = v_intent_id;
  return jsonb_build_object(
    'ok', true,
    'authorization', jsonb_build_object(
      'intentId', v_intent.intent_id,
      'cartId', v_intent.cart_id,
      'cartVersion', v_intent.cart_version,
      'cartFingerprint', v_intent.cart_fingerprint,
      'lines', v_lines,
      'authorizedAt', to_char(v_intent.authorized_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt', to_char(v_intent.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );
end
$function$;

create function public.research_checkout_activation_intent_claim_v1(
  p_member_id uuid,
  p_checkout_idempotency_key_hash text,
  p_intent_id uuid,
  p_checkout_command_id uuid,
  p_expected_cart_fingerprint text,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_intent public.research_checkout_activation_intents%rowtype;
  v_digest text;
  v_command_digest text;
begin
  if p_checkout_idempotency_key_hash !~ '^[a-f0-9]{64}$'
     or p_expected_cart_fingerprint !~ '^sha256:[a-f0-9]{64}$'
     or p_at < v_now - interval '2 minutes' or p_at > v_now + interval '30 seconds'
  then return jsonb_build_object('ok', false, 'code', 'intent_mismatch'); end if;
  lock table public.research_products,
    public.research_product_variants,
    public.research_product_variant_activation_revisions,
    public.research_product_variant_activation_heads in share mode;
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:research-activation-cart:v1|member|' || p_member_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:research-checkout-activation:v1|key|' || p_member_id::text || '|' || p_checkout_idempotency_key_hash, 0));
  select * into v_intent from public.research_checkout_activation_intents
  where intent_id = p_intent_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'intent_not_found'); end if;
  if v_intent.member_id <> p_member_id
     or v_intent.checkout_idempotency_key_hash <> p_checkout_idempotency_key_hash
     or v_intent.cart_fingerprint <> p_expected_cart_fingerprint
  then return jsonb_build_object('ok', false, 'code', 'intent_mismatch'); end if;
  v_digest := public.research_checkout_activation_authorization_digest_v1(p_intent_id);
  if v_intent.authorization_digest is distinct from v_digest then
    return jsonb_build_object('ok', false, 'code', 'intent_mismatch');
  end if;
  v_command_digest := public.research_checkout_activation_command_digest_v1(
    p_intent_id, v_digest, p_checkout_command_id, p_member_id,
    p_checkout_idempotency_key_hash, p_expected_cart_fingerprint);
  if v_intent.checkout_command_id is not null then
    if v_intent.state = 'claimed'
       and v_intent.checkout_command_id = p_checkout_command_id
       and v_intent.checkout_command_digest = v_command_digest
    then return jsonb_build_object('ok', true, 'state', 'claimed', 'idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'intent_conflict');
  end if;
  if v_intent.state <> 'authorized' then
    return jsonb_build_object('ok', false, 'code', 'intent_conflict');
  end if;
  if v_intent.expires_at <= v_now then
    return jsonb_build_object('ok', false, 'code', 'intent_stale');
  end if;
  if not exists (
    select 1 from public.research_cart_activation_versions av
    where av.cart_id = v_intent.cart_id and av.version = v_intent.cart_version
      and public.research_activation_cart_fingerprint_v1(av.cart_id, av.version)
        = v_intent.cart_fingerprint
  ) or exists (
    select 1 from public.research_checkout_activation_intent_lines l
    where l.intent_id = p_intent_id
      and not public.research_activation_line_is_current_v1(
        l.product_id, l.variant_id, l.sku, l.product_revision, l.variant_revision,
        l.binding_fingerprint, l.activation_ledger_revision,
        l.activation_evidence_fingerprint, p_at)
  ) then return jsonb_build_object('ok', false, 'code', 'intent_stale'); end if;
  update public.research_checkout_activation_intents set
    state = 'claimed',
    checkout_command_id = p_checkout_command_id,
    checkout_command_digest = v_command_digest,
    bound_at = p_at
  where intent_id = p_intent_id;
  return jsonb_build_object('ok', true, 'state', 'claimed', 'idempotent', false);
end
$function$;

create function public.research_checkout_activation_intent_consume_v1(
  p_member_id uuid,
  p_checkout_idempotency_key_hash text,
  p_intent_id uuid,
  p_checkout_command_id uuid,
  p_expected_cart_fingerprint text,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_intent public.research_checkout_activation_intents%rowtype;
  v_digest text;
  v_command_digest text;
begin
  if p_checkout_idempotency_key_hash !~ '^[a-f0-9]{64}$'
     or p_expected_cart_fingerprint !~ '^sha256:[a-f0-9]{64}$'
     or p_at < v_now - interval '2 minutes' or p_at > v_now + interval '30 seconds'
  then return jsonb_build_object('ok', false, 'code', 'intent_mismatch'); end if;
  lock table public.research_products,
    public.research_product_variants,
    public.research_product_variant_activation_revisions,
    public.research_product_variant_activation_heads in share mode;
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:research-activation-cart:v1|member|' || p_member_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:research-checkout-activation:v1|key|' || p_member_id::text || '|' || p_checkout_idempotency_key_hash, 0));
  select * into v_intent from public.research_checkout_activation_intents
  where intent_id = p_intent_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'intent_not_found'); end if;
  if v_intent.member_id <> p_member_id
     or v_intent.checkout_idempotency_key_hash <> p_checkout_idempotency_key_hash
     or v_intent.cart_fingerprint <> p_expected_cart_fingerprint
  then return jsonb_build_object('ok', false, 'code', 'intent_mismatch'); end if;
  v_digest := public.research_checkout_activation_authorization_digest_v1(p_intent_id);
  if v_intent.authorization_digest is distinct from v_digest then
    return jsonb_build_object('ok', false, 'code', 'intent_mismatch');
  end if;
  v_command_digest := public.research_checkout_activation_command_digest_v1(
    p_intent_id, v_digest, p_checkout_command_id, p_member_id,
    p_checkout_idempotency_key_hash, p_expected_cart_fingerprint);
  if v_intent.state = 'consumed' then
    if v_intent.checkout_command_id = p_checkout_command_id
       and v_intent.checkout_command_digest = v_command_digest
    then return jsonb_build_object('ok', true, 'state', 'consumed', 'idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'intent_conflict');
  end if;
  if v_intent.state = 'authorized' then
    if v_intent.expires_at <= v_now then
      return jsonb_build_object('ok', false, 'code', 'intent_stale');
    end if;
    -- Settlement cannot bind opportunistically after provider I/O. A durable
    -- pre-provider claim is mandatory even while the short lease is live.
    return jsonb_build_object('ok', false, 'code', 'intent_conflict');
  end if;
  if v_intent.state <> 'claimed' then
    return jsonb_build_object('ok', false, 'code', 'intent_conflict');
  end if;
  if (
    v_intent.checkout_command_id <> p_checkout_command_id
    or v_intent.checkout_command_digest <> v_command_digest
  ) then return jsonb_build_object('ok', false, 'code', 'intent_conflict'); end if;
  if not exists (
    select 1 from public.research_cart_activation_versions av
    where av.cart_id = v_intent.cart_id and av.version = v_intent.cart_version
      and public.research_activation_cart_fingerprint_v1(av.cart_id, av.version)
        = v_intent.cart_fingerprint
  ) then return jsonb_build_object('ok', false, 'code', 'intent_stale'); end if;
  update public.research_checkout_activation_intents set
    state = 'consumed',
    checkout_command_id = p_checkout_command_id,
    checkout_command_digest = v_command_digest,
    bound_at = coalesce(bound_at, p_at),
    consumed_at = p_at
  where intent_id = p_intent_id;
  return jsonb_build_object('ok', true, 'state', 'consumed', 'idempotent', false);
end
$function$;

create function public.research_checkout_activation_intent_cancel_v1(
  p_member_id uuid,
  p_checkout_idempotency_key_hash text,
  p_intent_id uuid,
  p_checkout_command_id uuid,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_intent public.research_checkout_activation_intents%rowtype;
  v_digest text;
  v_command_digest text;
begin
  if p_checkout_idempotency_key_hash !~ '^[a-f0-9]{64}$'
     or p_at < v_now - interval '2 minutes' or p_at > v_now + interval '30 seconds'
  then return jsonb_build_object('ok', false, 'code', 'intent_mismatch'); end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:research-activation-cart:v1|member|' || p_member_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:research-checkout-activation:v1|key|' || p_member_id::text || '|' || p_checkout_idempotency_key_hash, 0));
  select * into v_intent from public.research_checkout_activation_intents
  where intent_id = p_intent_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'intent_not_found'); end if;
  if v_intent.member_id <> p_member_id
     or v_intent.checkout_idempotency_key_hash <> p_checkout_idempotency_key_hash
  then return jsonb_build_object('ok', false, 'code', 'intent_mismatch'); end if;
  v_digest := public.research_checkout_activation_authorization_digest_v1(p_intent_id);
  if v_intent.authorization_digest is distinct from v_digest then
    return jsonb_build_object('ok', false, 'code', 'intent_mismatch');
  end if;
  v_command_digest := public.research_checkout_activation_command_digest_v1(
    p_intent_id, v_digest, p_checkout_command_id, p_member_id,
    p_checkout_idempotency_key_hash, v_intent.cart_fingerprint);
  if v_intent.state = 'cancelled' then
    if v_intent.checkout_command_id = p_checkout_command_id
       and v_intent.checkout_command_digest = v_command_digest
    then return jsonb_build_object('ok', true, 'state', 'cancelled', 'idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'intent_conflict');
  end if;
  if v_intent.state = 'authorized' then
    if v_intent.expires_at <= v_now then
      return jsonb_build_object('ok', false, 'code', 'intent_stale');
    end if;
    -- The checkout command must claim before it may reach any terminal path.
    return jsonb_build_object('ok', false, 'code', 'intent_conflict');
  end if;
  if v_intent.state <> 'claimed' then
    return jsonb_build_object('ok', false, 'code', 'intent_conflict');
  end if;
  if (
    v_intent.checkout_command_id <> p_checkout_command_id
    or v_intent.checkout_command_digest <> v_command_digest
  ) then return jsonb_build_object('ok', false, 'code', 'intent_conflict'); end if;
  update public.research_checkout_activation_intents set
    state = 'cancelled',
    checkout_command_id = p_checkout_command_id,
    checkout_command_digest = v_command_digest,
    bound_at = coalesce(bound_at, p_at),
    cancelled_at = p_at
  where intent_id = p_intent_id;
  return jsonb_build_object('ok', true, 'state', 'cancelled', 'idempotent', false);
end
$function$;

alter table public.research_product_variant_activation_revisions enable row level security;
alter table public.research_product_variant_activation_revisions force row level security;
alter table public.research_product_variant_activation_heads enable row level security;
alter table public.research_product_variant_activation_heads force row level security;
alter table public.research_cart_activation_versions enable row level security;
alter table public.research_cart_activation_versions force row level security;
alter table public.research_cart_line_activation_authority enable row level security;
alter table public.research_cart_line_activation_authority force row level security;
alter table public.research_checkout_activation_intents enable row level security;
alter table public.research_checkout_activation_intents force row level security;
alter table public.research_checkout_activation_intent_lines enable row level security;
alter table public.research_checkout_activation_intent_lines force row level security;

revoke all on table public.research_product_variant_activation_revisions from public, anon, authenticated, service_role;
revoke all on table public.research_product_variant_activation_heads from public, anon, authenticated, service_role;
revoke all on table public.research_cart_activation_versions from public, anon, authenticated, service_role;
revoke all on table public.research_cart_line_activation_authority from public, anon, authenticated, service_role;
revoke all on table public.research_checkout_activation_intents from public, anon, authenticated, service_role;
revoke all on table public.research_checkout_activation_intent_lines from public, anon, authenticated, service_role;

do $revoke_identity_sequence$
declare
  v_sequence text := pg_get_serial_sequence(
    'public.research_product_variant_activation_revisions',
    'ledger_revision'
  );
begin
  if v_sequence is null then
    raise exception 'activation revision identity sequence is missing';
  end if;
  execute format(
    'revoke all on sequence %s from public, anon, authenticated, service_role',
    v_sequence
  );
end
$revoke_identity_sequence$;

revoke all on function public.research_activation_hash_json_v1(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.research_activation_binding_fingerprint_v1(uuid,uuid,text,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.research_activation_evidence_fingerprint_v1(smallint,bigint,uuid,uuid,text,text,text,uuid,uuid,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_activation_revision_prepare_v1() from public, anon, authenticated, service_role;
revoke all on function public.research_activation_line_is_current_v1(uuid,uuid,text,integer,integer,text,bigint,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_activation_cart_fingerprint_v1(uuid,bigint) from public, anon, authenticated, service_role;
revoke all on function public.research_checkout_activation_authorization_digest_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.research_checkout_activation_command_digest_v1(uuid,text,uuid,uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.research_activation_intent_line_immutable_v1() from public, anon, authenticated, service_role;
revoke all on function public.research_activation_live_intent_guard_v1() from public, anon, authenticated, service_role;
revoke all on function public.research_checkout_activation_intent_claim_v1(uuid,text,uuid,uuid,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_checkout_activation_intent_consume_v1(uuid,text,uuid,uuid,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_checkout_activation_intent_cancel_v1(uuid,text,uuid,uuid,timestamptz) from public, anon, authenticated, service_role;

revoke all on function public.research_cart_mutate_with_activation_v1(uuid,text,text,integer,text,integer,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.research_checkout_activation_precharge_authorize_v1(uuid,text,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.research_cart_mutate_with_activation_v1(uuid,text,text,integer,text,integer,timestamptz,integer) to service_role;
grant execute on function public.research_checkout_activation_precharge_authorize_v1(uuid,text,timestamptz,integer) to service_role;

comment on function public.research_cart_mutate_with_activation_v1(uuid,text,text,integer,text,integer,timestamptz,integer) is
  'Candidate exact activation-authorized cart CAS. Every denial precedes mutation; exceptions roll back the statement.';
comment on function public.research_checkout_activation_precharge_authorize_v1(uuid,text,timestamptz,integer) is
  'Candidate short-lived precharge activation intent. It leases exact cart and activation revisions without spanning provider I/O.';
comment on function public.research_checkout_activation_intent_claim_v1(uuid,text,uuid,uuid,text,timestamptz) is
  'Internal checkout-saga helper: pre-provider claim binds one live authorized intent to one immutable command and keeps the lease until terminal consume/cancel.';
comment on function public.research_checkout_activation_intent_consume_v1(uuid,text,uuid,uuid,text,timestamptz) is
  'Internal checkout-saga settlement helper. Invoke inside the same transaction that publishes the order.';
comment on function public.research_checkout_activation_intent_cancel_v1(uuid,text,uuid,uuid,timestamptz) is
  'Internal checkout-saga compensation helper. Invoke inside the same transaction that releases pre-provider holds.';

commit;
