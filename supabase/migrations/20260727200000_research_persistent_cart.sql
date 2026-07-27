-- Website 5 Wave 3: persistent Research cart persistence only.
-- Prepared for Website 2 review/application. Creates no rows and reserves no inventory.

create extension if not exists pgcrypto;

create table if not exists public.research_persistent_carts (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('member','anonymous')),
  member_id uuid references public.research_members(id) on delete cascade,
  anonymous_hash text,
  state text not null default 'active'
    check (state in ('active','reconciled','expired')),
  reconciled_to_cart_id uuid,
  version bigint not null default 1 check (version > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (owner_kind = 'member' and member_id is not null and anonymous_hash is null)
    or (owner_kind = 'anonymous' and member_id is null
      and anonymous_hash ~ '^[a-f0-9]{64}$')
  ),
  check (state <> 'reconciled' or reconciled_to_cart_id is not null)
);
create unique index if not exists research_persistent_carts_active_member
  on public.research_persistent_carts(member_id) where state = 'active' and owner_kind = 'member';
create unique index if not exists research_persistent_carts_active_anon
  on public.research_persistent_carts(anonymous_hash) where state = 'active' and owner_kind = 'anonymous';

create table if not exists public.research_persistent_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.research_persistent_carts(id) on delete cascade,
  product_id uuid not null,
  variant_id uuid not null,
  sku text not null check (length(btrim(sku)) between 1 and 200),
  audience text not null check (audience in ('retail','member','professional','wholesale')),
  quantity integer not null check (quantity between 1 and 1000),
  price_id uuid not null,
  price_amount_cents bigint not null check (price_amount_cents >= 0),
  price_currency text not null check (price_currency ~ '^[A-Z]{3}$'),
  price_effective_at timestamptz not null,
  price_expires_at timestamptz,
  price_version integer not null check (price_version > 0),
  selection_evaluated_at timestamptz not null,
  selection_snapshot jsonb not null check (jsonb_typeof(selection_snapshot) = 'object'),
  selection_hash text not null check (selection_hash ~ '^[a-f0-9]{64}$'),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_id, audience)
);

create table if not exists public.research_persistent_cart_commands (
  id uuid primary key default gen_random_uuid(),
  owner_scope_hash text not null check (owner_scope_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key_hash text not null check (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  command_hash text not null check (command_hash ~ '^[a-f0-9]{64}$'),
  action text not null check (action in ('put','remove','claim','expire')),
  cart_id uuid,
  redacted_result jsonb not null check (jsonb_typeof(redacted_result) = 'object'),
  occurred_at timestamptz not null default now(),
  unique (owner_scope_hash, idempotency_key_hash)
);

create table if not exists public.research_persistent_cart_events (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null,
  item_id uuid,
  event_type text not null
    check (event_type in ('cart_created','item_put','item_removed','cart_claimed','cart_expired')),
  actor_scope_hash text not null check (actor_scope_hash ~ '^[a-f0-9]{64}$'),
  cart_version bigint not null check (cart_version > 0),
  item_version bigint,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

alter table public.research_persistent_carts enable row level security;
alter table public.research_persistent_carts force row level security;
alter table public.research_persistent_cart_items enable row level security;
alter table public.research_persistent_cart_items force row level security;
alter table public.research_persistent_cart_commands enable row level security;
alter table public.research_persistent_cart_commands force row level security;
alter table public.research_persistent_cart_events enable row level security;
alter table public.research_persistent_cart_events force row level security;

create or replace function public.research_persistent_cart_immutable()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  raise exception 'persistent cart audit records are immutable' using errcode = '55000';
end;
$$;
drop trigger if exists research_persistent_cart_commands_immutable on public.research_persistent_cart_commands;
create trigger research_persistent_cart_commands_immutable before update or delete
on public.research_persistent_cart_commands for each row
execute function public.research_persistent_cart_immutable();
drop trigger if exists research_persistent_cart_events_immutable on public.research_persistent_cart_events;
create trigger research_persistent_cart_events_immutable before update or delete
on public.research_persistent_cart_events for each row
execute function public.research_persistent_cart_immutable();

create or replace function public.research_persistent_cart_owner_scope(
  p_owner_kind text, p_owner_identity text
) returns text language sql immutable set search_path = pg_catalog as $$
  select encode(public.digest(
    convert_to('xenios:persistent-cart:owner:v1|' || p_owner_kind || '|' ||
      case when p_owner_kind='member' then p_owner_identity::uuid::text else p_owner_identity end,
      'utf8'),
    'sha256'
  ), 'hex')
$$;

create or replace function public.research_persistent_cart_selection_current(p_selection jsonb)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare v_input jsonb; v_domain jsonb;
begin
  if p_selection->'canonicalReadiness'->>'ready' <> 'true'
     or p_selection->'inventoryEligibility'->>'state' <> 'eligible'
     or p_selection->'inventoryEligibility'->>'productId' <> p_selection->>'productId'
     or p_selection->'inventoryEligibility'->>'variantId' <> p_selection->>'variantId'
     or p_selection->'audienceEligibility'->>'state' <> 'authorized'
     or p_selection->'audienceEligibility'->>'audience' <> p_selection->>'audience'
     or jsonb_array_length(p_selection->'canonicalReadiness'->'inputVersions') < 1
     or jsonb_array_length(p_selection->'canonicalReadiness'->'domainVersions') < 1
     or (p_selection->'canonicalReadiness'->>'verifiedInputCount')::integer
        <> jsonb_array_length(p_selection->'canonicalReadiness'->'inputVersions')
     or (p_selection->>'evaluatedAt')::timestamptz
        not between clock_timestamp()-interval '10 minutes'
            and clock_timestamp()+interval '30 seconds'
  then return false; end if;
  if not exists (
    select 1
    from public.research_products p
    join public.research_product_variants v on v.product_id = p.id
    join public.research_product_prices r on r.product_id = p.id and r.variant_id = v.id
    where p.id = (p_selection->>'productId')::uuid
      and v.id = (p_selection->>'variantId')::uuid
      and v.sku = p_selection->>'sku'
      and p.admin_status = 'published' and p.active_state and p.visibility_state <> 'hidden'
      and v.status = 'approved' and v.active
      and r.id = (p_selection->'price'->>'id')::uuid
      and r.audience = p_selection->>'audience'
      and r.amount_cents = (p_selection->'price'->>'amountCents')::bigint
      and r.currency = p_selection->'price'->>'currency'
      and r.version = (p_selection->'price'->>'version')::integer
      and r.status = 'active' and r.approved_by is not null
      and r.effective_at = (p_selection->'price'->>'effectiveAt')::timestamptz
      and r.expires_at is not distinct from nullif(p_selection->'price'->>'expiresAt','')::timestamptz
      and r.effective_at <= (p_selection->>'evaluatedAt')::timestamptz
      and (r.expires_at is null or r.expires_at > (p_selection->>'evaluatedAt')::timestamptz)
    for key share of p,v,r
  ) then return false; end if;
  if (
    select count(distinct value->>'id')
    from jsonb_array_elements(p_selection->'canonicalReadiness'->'inputVersions')
  ) <> jsonb_array_length(p_selection->'canonicalReadiness'->'inputVersions')
  then return false; end if;
  if (
    select count(distinct value->>'domain')
    from jsonb_array_elements(p_selection->'canonicalReadiness'->'domainVersions')
  ) <> jsonb_array_length(p_selection->'canonicalReadiness'->'domainVersions')
  then return false; end if;
  for v_input in select value from jsonb_array_elements(p_selection->'canonicalReadiness'->'inputVersions')
  loop
    if not exists (
      select 1 from public.research_required_inputs i
      where i.id = (v_input->>'id')::uuid
        and i.version = (v_input->>'version')::integer
        and i.record_id = p_selection->>'productId'
        and i.current_state in ('verified','not_applicable')
      for key share
    ) then return false; end if;
  end loop;
  for v_domain in select value from jsonb_array_elements(p_selection->'canonicalReadiness'->'domainVersions')
  loop
    if not exists (
      select 1 from public.research_domain_launch_controls d
      where d.domain = v_domain->>'domain'
        and d.version = (v_domain->>'version')::integer
        and d.launch_status = 'public_enabled' and d.software_complete
      for key share
    ) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create or replace function public.research_persistent_cart_json(p_cart_id uuid)
returns jsonb language sql security definer set search_path = pg_catalog as $$
  select jsonb_build_object(
    'id', c.id, 'owner', c.owner_kind, 'state', c.state, 'version', c.version,
    'expiresAt', c.expires_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'productId', i.product_id, 'variantId', i.variant_id,
        'sku', i.sku, 'audience', i.audience, 'quantity', i.quantity,
        'priceReference', jsonb_build_object(
          'id', i.price_id, 'amountCents', i.price_amount_cents,
          'currency', i.price_currency, 'effectiveAt', i.price_effective_at,
          'expiresAt', i.price_expires_at, 'version', i.price_version),
        'selectionEvaluatedAt', i.selection_evaluated_at, 'version', i.version
      ) order by i.created_at, i.id)
      from public.research_persistent_cart_items i where i.cart_id = c.id
    ), '[]'::jsonb)
  ) from public.research_persistent_carts c where c.id = p_cart_id
$$;

create or replace function public.research_persistent_cart_get(
  p_owner_kind text, p_owner_identity text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_cart public.research_persistent_carts;
begin
  if p_owner_kind not in ('member','anonymous')
     or (p_owner_kind = 'anonymous' and p_owner_identity !~ '^[a-f0-9]{64}$') then
    raise exception 'unauthorized';
  end if;
  select * into v_cart from public.research_persistent_carts
   where state = 'active'
     and ((p_owner_kind = 'member' and owner_kind = 'member' and member_id = p_owner_identity::uuid)
       or (p_owner_kind = 'anonymous' and owner_kind = 'anonymous' and anonymous_hash = p_owner_identity));
  if not found then raise exception 'not_found'; end if;
  if v_cart.expires_at <= clock_timestamp() then raise exception 'expired'; end if;
  return public.research_persistent_cart_json(v_cart.id);
end;
$$;

create or replace function public.research_persistent_cart_put_item(
  p_owner_kind text, p_owner_identity text, p_cart_id uuid,
  p_expected_cart_version bigint, p_expected_item_version bigint,
  p_quantity integer, p_selection jsonb, p_idempotency_key_hash text,
  p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_scope text; v_hash text; v_replay public.research_persistent_cart_commands;
  v_cart public.research_persistent_carts; v_item public.research_persistent_cart_items;
  v_result jsonb;
begin
  if p_owner_kind not in ('member','anonymous') or p_quantity not between 1 and 1000
     or p_idempotency_key_hash !~ '^[a-f0-9]{64}$' or p_expires_at <= clock_timestamp()
     or (p_owner_kind='anonymous' and p_owner_identity !~ '^[a-f0-9]{64}$') then
    raise exception 'unauthorized';
  end if;
  v_scope := public.research_persistent_cart_owner_scope(p_owner_kind,p_owner_identity);
  v_hash := encode(public.digest(convert_to(jsonb_build_object(
    'action','put','owner',v_scope,'cart',p_cart_id,'cartVersion',p_expected_cart_version,
    'itemVersion',p_expected_item_version,'quantity',p_quantity,'selection',p_selection,
    'expiresAt',p_expires_at)::text,'utf8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('xenios:cart:v1|' || v_scope,0));
  select * into v_replay from public.research_persistent_cart_commands
   where owner_scope_hash=v_scope and idempotency_key_hash=p_idempotency_key_hash for share;
  if not public.research_persistent_cart_selection_current(p_selection) then
    raise exception 'selection_stale';
  end if;
  if v_replay.id is not null then
    if v_replay.command_hash <> v_hash then raise exception 'conflict'; end if;
    return v_replay.redacted_result;
  end if;
  select * into v_cart from public.research_persistent_carts
   where state='active' and ((p_owner_kind='member' and owner_kind='member' and member_id=p_owner_identity::uuid)
      or (p_owner_kind='anonymous' and owner_kind='anonymous' and anonymous_hash=p_owner_identity))
   for update;
  if not found then
    if p_cart_id is not null or p_expected_cart_version is not null then raise exception 'conflict'; end if;
    insert into public.research_persistent_carts(owner_kind,member_id,anonymous_hash,expires_at)
    values(p_owner_kind,case when p_owner_kind='member' then p_owner_identity::uuid end,
      case when p_owner_kind='anonymous' then p_owner_identity end,p_expires_at)
    returning * into v_cart;
    insert into public.research_persistent_cart_events(cart_id,event_type,actor_scope_hash,cart_version)
    values(v_cart.id,'cart_created',v_scope,v_cart.version);
  elsif v_cart.id is distinct from p_cart_id or v_cart.version is distinct from p_expected_cart_version
        or v_cart.expires_at <= clock_timestamp() then raise exception 'conflict';
  end if;
  select * into v_item from public.research_persistent_cart_items
    where cart_id=v_cart.id and variant_id=(p_selection->>'variantId')::uuid
      and audience=p_selection->>'audience' for update;
  if found and v_item.version is distinct from p_expected_item_version then raise exception 'conflict'; end if;
  if not found and p_expected_item_version is not null then raise exception 'conflict'; end if;
  if v_item.id is not null then
    update public.research_persistent_cart_items set
      quantity=p_quantity, sku=p_selection->>'sku',
      price_id=(p_selection->'price'->>'id')::uuid,
      price_amount_cents=(p_selection->'price'->>'amountCents')::bigint,
      price_currency=p_selection->'price'->>'currency',
      price_effective_at=(p_selection->'price'->>'effectiveAt')::timestamptz,
      price_expires_at=nullif(p_selection->'price'->>'expiresAt','')::timestamptz,
      price_version=(p_selection->'price'->>'version')::integer,
      selection_evaluated_at=(p_selection->>'evaluatedAt')::timestamptz,
      selection_snapshot=p_selection,
      selection_hash=encode(public.digest(convert_to(p_selection::text,'utf8'),'sha256'),'hex'),
      version=version+1, updated_at=clock_timestamp()
    where id=v_item.id returning * into v_item;
  else
    insert into public.research_persistent_cart_items(
      cart_id,product_id,variant_id,sku,audience,quantity,price_id,price_amount_cents,
      price_currency,price_effective_at,price_expires_at,price_version,
      selection_evaluated_at,selection_snapshot,selection_hash)
    values(v_cart.id,(p_selection->>'productId')::uuid,(p_selection->>'variantId')::uuid,
      p_selection->>'sku',p_selection->>'audience',p_quantity,
      (p_selection->'price'->>'id')::uuid,(p_selection->'price'->>'amountCents')::bigint,
      p_selection->'price'->>'currency',(p_selection->'price'->>'effectiveAt')::timestamptz,
      nullif(p_selection->'price'->>'expiresAt','')::timestamptz,
      (p_selection->'price'->>'version')::integer,(p_selection->>'evaluatedAt')::timestamptz,
      p_selection,encode(public.digest(convert_to(p_selection::text,'utf8'),'sha256'),'hex'))
    returning * into v_item;
  end if;
  update public.research_persistent_carts set version=version+1,
    expires_at=p_expires_at,updated_at=clock_timestamp() where id=v_cart.id returning * into v_cart;
  insert into public.research_persistent_cart_events(cart_id,item_id,event_type,actor_scope_hash,cart_version,item_version,
    metadata) values(v_cart.id,v_item.id,'item_put',v_scope,v_cart.version,v_item.version,
    jsonb_build_object('quantity',p_quantity,'selectionHash',v_item.selection_hash));
  v_result := public.research_persistent_cart_json(v_cart.id);
  insert into public.research_persistent_cart_commands(owner_scope_hash,idempotency_key_hash,command_hash,action,cart_id,redacted_result)
  values(v_scope,p_idempotency_key_hash,v_hash,'put',v_cart.id,v_result);
  return v_result;
end;
$$;

create or replace function public.research_persistent_cart_remove_item(
  p_owner_kind text, p_owner_identity text, p_cart_id uuid, p_item_id uuid,
  p_expected_cart_version bigint, p_expected_item_version bigint,
  p_idempotency_key_hash text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_scope text; v_hash text; v_replay public.research_persistent_cart_commands;
 v_cart public.research_persistent_carts; v_item public.research_persistent_cart_items; v_result jsonb;
begin
  v_scope:=public.research_persistent_cart_owner_scope(p_owner_kind,p_owner_identity);
  v_hash:=encode(public.digest(convert_to(jsonb_build_object('action','remove','owner',v_scope,'cart',p_cart_id,
    'item',p_item_id,'cartVersion',p_expected_cart_version,'itemVersion',p_expected_item_version)::text,'utf8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('xenios:cart:v1|'||v_scope,0));
  select * into v_cart from public.research_persistent_carts where id=p_cart_id and state='active'
   and ((p_owner_kind='member' and owner_kind='member' and member_id=p_owner_identity::uuid)
     or (p_owner_kind='anonymous' and owner_kind='anonymous' and anonymous_hash=p_owner_identity)) for update;
  if not found then raise exception 'unauthorized'; end if;
  select * into v_replay from public.research_persistent_cart_commands
   where owner_scope_hash=v_scope and idempotency_key_hash=p_idempotency_key_hash for share;
  if v_replay.id is not null then
    if v_replay.command_hash<>v_hash then raise exception 'conflict'; end if;
    return v_replay.redacted_result;
  end if;
  if v_cart.version<>p_expected_cart_version then raise exception 'conflict'; end if;
  select * into v_item from public.research_persistent_cart_items
   where id=p_item_id and cart_id=v_cart.id for update;
  if not found or v_item.version<>p_expected_item_version then raise exception 'conflict'; end if;
  delete from public.research_persistent_cart_items where id=v_item.id;
  update public.research_persistent_carts set version=version+1,updated_at=clock_timestamp()
   where id=v_cart.id returning * into v_cart;
  insert into public.research_persistent_cart_events(cart_id,item_id,event_type,actor_scope_hash,cart_version,item_version)
   values(v_cart.id,v_item.id,'item_removed',v_scope,v_cart.version,v_item.version);
  v_result:=public.research_persistent_cart_json(v_cart.id);
  insert into public.research_persistent_cart_commands(owner_scope_hash,idempotency_key_hash,command_hash,action,cart_id,redacted_result)
   values(v_scope,p_idempotency_key_hash,v_hash,'remove',v_cart.id,v_result);
  return v_result;
end;
$$;

create or replace function public.research_persistent_cart_claim(
  p_member_id uuid, p_anonymous_hash text, p_selections jsonb,
  p_expected_anonymous_cart_version bigint,
  p_member_cart_id uuid, p_expected_member_cart_version bigint,
  p_idempotency_key_hash text, p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_anon public.research_persistent_carts; v_member public.research_persistent_carts;
 v_scope text; v_anon_scope text; v_hash text; v_replay public.research_persistent_cart_commands;
 v_row record; v_selection jsonb; v_result jsonb;
begin
  if jsonb_typeof(p_selections)<>'array' or jsonb_array_length(p_selections) not between 1 and 100
     or p_anonymous_hash !~ '^[a-f0-9]{64}$' then raise exception 'unauthorized'; end if;
  v_scope:=public.research_persistent_cart_owner_scope('member',p_member_id::text);
  v_anon_scope:=public.research_persistent_cart_owner_scope('anonymous',p_anonymous_hash);
  v_hash:=encode(public.digest(convert_to(jsonb_build_object('action','claim','owner',v_scope,
    'anonymous',p_anonymous_hash,'selections',p_selections,
    'anonymousVersion',p_expected_anonymous_cart_version,
    'memberCart',p_member_cart_id,'memberVersion',p_expected_member_cart_version,'expiresAt',p_expires_at)::text,'utf8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('xenios:cart:v1|'||v_anon_scope,0));
  perform pg_advisory_xact_lock(hashtextextended('xenios:cart:v1|'||v_scope,0));
  select * into v_anon from public.research_persistent_carts
   where owner_kind='anonymous' and anonymous_hash=p_anonymous_hash for update;
  if not found then raise exception 'not_found'; end if;
  select * into v_member from public.research_persistent_carts
   where owner_kind='member' and member_id=p_member_id and state='active' for update;
  for v_row in select * from public.research_persistent_cart_items
    where cart_id=v_anon.id order by variant_id,audience for update
  loop
    select value into v_selection from jsonb_array_elements(p_selections)
     where value->>'productId'=v_row.product_id::text
       and value->>'variantId'=v_row.variant_id::text
       and value->>'sku'=v_row.sku and value->>'audience'=v_row.audience;
    if not found or (
      select count(*) from jsonb_array_elements(p_selections)
       where value->>'productId'=v_row.product_id::text
         and value->>'variantId'=v_row.variant_id::text
         and value->>'sku'=v_row.sku and value->>'audience'=v_row.audience
    )<>1 or not public.research_persistent_cart_selection_current(v_selection) then
      raise exception 'selection_stale';
    end if;
  end loop;
  if jsonb_array_length(p_selections)<>(select count(*) from public.research_persistent_cart_items where cart_id=v_anon.id)
  then raise exception 'conflict'; end if;
  select * into v_replay from public.research_persistent_cart_commands
   where owner_scope_hash=v_scope and idempotency_key_hash=p_idempotency_key_hash for share;
  if v_replay.id is not null then
    if v_replay.command_hash<>v_hash then raise exception 'conflict'; end if;
    return v_replay.redacted_result;
  end if;
  if v_anon.state<>'active' or v_anon.version<>p_expected_anonymous_cart_version then
    raise exception 'already_claimed';
  end if;
  if v_member.id is null then
    if p_member_cart_id is not null or p_expected_member_cart_version is not null then raise exception 'conflict'; end if;
    insert into public.research_persistent_carts(owner_kind,member_id,expires_at)
      values('member',p_member_id,p_expires_at) returning * into v_member;
  elsif v_member.id is distinct from p_member_cart_id or v_member.version is distinct from p_expected_member_cart_version then
    raise exception 'conflict';
  end if;
  for v_row in select * from public.research_persistent_cart_items where cart_id=v_anon.id order by variant_id,audience
  loop
    select value into v_selection from jsonb_array_elements(p_selections)
     where value->>'productId'=v_row.product_id::text
       and value->>'variantId'=v_row.variant_id::text
       and value->>'sku'=v_row.sku and value->>'audience'=v_row.audience;
    if exists (
      select 1 from public.research_persistent_cart_items target
      where target.cart_id=v_member.id and target.variant_id=v_row.variant_id
        and target.audience=v_row.audience
        and target.quantity+v_row.quantity>1000
    ) then
      if exists (
        select 1 from public.research_persistent_cart_items target
        where target.cart_id=v_member.id and target.variant_id=v_row.variant_id
          and target.audience=v_row.audience and target.quantity+v_row.quantity>1000
      ) then raise exception 'quantity_limit'; end if;
    end if;
    insert into public.research_persistent_cart_items(
      cart_id,product_id,variant_id,sku,audience,quantity,price_id,price_amount_cents,price_currency,
      price_effective_at,price_expires_at,price_version,selection_evaluated_at,selection_snapshot,selection_hash)
    values(v_member.id,v_row.product_id,v_row.variant_id,v_row.sku,v_row.audience,v_row.quantity,
      (v_selection->'price'->>'id')::uuid,(v_selection->'price'->>'amountCents')::bigint,
      v_selection->'price'->>'currency',(v_selection->'price'->>'effectiveAt')::timestamptz,
      nullif(v_selection->'price'->>'expiresAt','')::timestamptz,
      (v_selection->'price'->>'version')::integer,(v_selection->>'evaluatedAt')::timestamptz,
      v_selection,encode(public.digest(convert_to(v_selection::text,'utf8'),'sha256'),'hex'))
    on conflict(cart_id,variant_id,audience) do update set
      quantity=public.research_persistent_cart_items.quantity+excluded.quantity,
      sku=excluded.sku,price_id=excluded.price_id,
      price_amount_cents=excluded.price_amount_cents,price_currency=excluded.price_currency,
      price_effective_at=excluded.price_effective_at,price_expires_at=excluded.price_expires_at,
      price_version=excluded.price_version,selection_evaluated_at=excluded.selection_evaluated_at,
      selection_snapshot=excluded.selection_snapshot,selection_hash=excluded.selection_hash,
      version=public.research_persistent_cart_items.version+1,updated_at=clock_timestamp();
  end loop;
  update public.research_persistent_carts set state='reconciled',reconciled_to_cart_id=v_member.id,
    version=version+1,updated_at=clock_timestamp() where id=v_anon.id;
  update public.research_persistent_carts set version=version+1,expires_at=p_expires_at,
    updated_at=clock_timestamp() where id=v_member.id returning * into v_member;
  insert into public.research_persistent_cart_events(cart_id,event_type,actor_scope_hash,cart_version,
    metadata) values(v_anon.id,'cart_claimed',v_scope,v_anon.version+1,jsonb_build_object('targetCartId',v_member.id));
  v_result:=public.research_persistent_cart_json(v_member.id);
  insert into public.research_persistent_cart_commands(owner_scope_hash,idempotency_key_hash,command_hash,action,cart_id,redacted_result)
   values(v_scope,p_idempotency_key_hash,v_hash,'claim',v_member.id,v_result);
  return v_result;
end;
$$;

create or replace function public.research_persistent_cart_expire(
  p_cart_id uuid, p_expected_cart_version bigint, p_idempotency_key_hash text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_cart public.research_persistent_carts; v_scope text; v_hash text;
 v_replay public.research_persistent_cart_commands; v_result jsonb;
begin
  select * into v_cart from public.research_persistent_carts where id=p_cart_id;
  if not found then raise exception 'not_found'; end if;
  v_scope:=public.research_persistent_cart_owner_scope(v_cart.owner_kind,
    case when v_cart.owner_kind='member' then v_cart.member_id::text else v_cart.anonymous_hash end);
  v_hash:=encode(public.digest(convert_to(jsonb_build_object('action','expire','cart',p_cart_id,
    'cartVersion',p_expected_cart_version)::text,'utf8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('xenios:cart:v1|'||v_scope,0));
  select * into v_cart from public.research_persistent_carts where id=p_cart_id for update;
  if not found then raise exception 'not_found'; end if;
  select * into v_replay from public.research_persistent_cart_commands
   where owner_scope_hash=v_scope and idempotency_key_hash=p_idempotency_key_hash for share;
  if v_replay.id is not null then
    if v_replay.command_hash<>v_hash then raise exception 'conflict'; end if;
    return v_replay.redacted_result;
  end if;
  if v_cart.state<>'active' or v_cart.version<>p_expected_cart_version
     or v_cart.expires_at>clock_timestamp() then raise exception 'conflict'; end if;
  update public.research_persistent_carts set state='expired',version=version+1,
    updated_at=clock_timestamp() where id=v_cart.id returning * into v_cart;
  insert into public.research_persistent_cart_events(cart_id,event_type,actor_scope_hash,cart_version)
   values(v_cart.id,'cart_expired',v_scope,v_cart.version);
  v_result:=public.research_persistent_cart_json(v_cart.id);
  insert into public.research_persistent_cart_commands(owner_scope_hash,idempotency_key_hash,command_hash,action,cart_id,redacted_result)
   values(v_scope,p_idempotency_key_hash,v_hash,'expire',v_cart.id,v_result);
  return v_result;
end;
$$;

revoke all on table public.research_persistent_carts from public, anon, authenticated, service_role;
revoke all on table public.research_persistent_cart_items from public, anon, authenticated, service_role;
revoke all on table public.research_persistent_cart_commands from public, anon, authenticated, service_role;
revoke all on table public.research_persistent_cart_events from public, anon, authenticated, service_role;
grant select on table public.research_persistent_carts to service_role;
grant select on table public.research_persistent_cart_items to service_role;
grant select on table public.research_persistent_cart_commands to service_role;
grant select on table public.research_persistent_cart_events to service_role;
revoke all on function public.research_persistent_cart_get(text,text) from public, anon, authenticated;
revoke all on function public.research_persistent_cart_put_item(text,text,uuid,bigint,bigint,integer,jsonb,text,timestamptz) from public, anon, authenticated;
revoke all on function public.research_persistent_cart_remove_item(text,text,uuid,uuid,bigint,bigint,text) from public, anon, authenticated;
revoke all on function public.research_persistent_cart_claim(uuid,text,jsonb,bigint,uuid,bigint,text,timestamptz) from public, anon, authenticated;
revoke all on function public.research_persistent_cart_expire(uuid,bigint,text) from public, anon, authenticated;
revoke all on function public.research_persistent_cart_owner_scope(text,text) from public, anon, authenticated, service_role;
revoke all on function public.research_persistent_cart_selection_current(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.research_persistent_cart_json(uuid) from public, anon, authenticated, service_role;
revoke all on function public.research_persistent_cart_immutable() from public, anon, authenticated, service_role;
grant execute on function public.research_persistent_cart_get(text,text) to service_role;
grant execute on function public.research_persistent_cart_put_item(text,text,uuid,bigint,bigint,integer,jsonb,text,timestamptz) to service_role;
grant execute on function public.research_persistent_cart_remove_item(text,text,uuid,uuid,bigint,bigint,text) to service_role;
grant execute on function public.research_persistent_cart_claim(uuid,text,jsonb,bigint,uuid,bigint,text,timestamptz) to service_role;
grant execute on function public.research_persistent_cart_expire(uuid,bigint,text) to service_role;
