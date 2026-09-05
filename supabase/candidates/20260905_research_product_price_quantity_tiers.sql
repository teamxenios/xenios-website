-- CANDIDATE ONLY. Not applied. Exact production provenance and founder GO required.
-- Extends canonical Product Control economic history; does not import or activate prices.
begin;

alter table public.research_product_prices
  add column quantity_tiers jsonb not null default '[]'::jsonb;

create function public.research_product_quantity_tiers_valid(p_amount bigint, p_tiers jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare
  v_tier jsonb;
  v_quantity numeric;
  v_amount numeric;
  v_previous_quantity numeric := 0;
  v_previous_amount numeric := p_amount;
begin
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' then return false; end if;
  if jsonb_array_length(p_tiers) = 0 then return true; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 9007199254740991
     or jsonb_array_length(p_tiers) > 16 then return false; end if;
  for v_tier in select value from jsonb_array_elements(p_tiers) loop
    if jsonb_typeof(v_tier) <> 'object' then return false; end if;
    if not (v_tier ?& array['minimumQuantity','amountCents'])
       or (select count(*) from jsonb_object_keys(v_tier)) <> 2
       or jsonb_typeof(v_tier->'minimumQuantity') <> 'number'
       or jsonb_typeof(v_tier->'amountCents') <> 'number' then return false; end if;
    v_quantity := (v_tier->>'minimumQuantity')::numeric;
    v_amount := (v_tier->>'amountCents')::numeric;
    if v_quantity <> trunc(v_quantity) or v_amount <> trunc(v_amount)
       or v_quantity <= 0 or v_quantity > 9007199254740991
       or v_amount <= 0 or v_amount > 9007199254740991 then return false; end if;
    if v_previous_quantity = 0 then
      if v_quantity <> 1 or v_amount <> p_amount then return false; end if;
    elsif v_quantity <= v_previous_quantity or v_amount > v_previous_amount then
      return false;
    end if;
    v_previous_quantity := v_quantity;
    v_previous_amount := v_amount;
  end loop;
  return true;
end;
$$;

alter table public.research_product_prices
  add constraint research_product_prices_quantity_tiers_valid
  check (public.research_product_quantity_tiers_valid(amount_cents, quantity_tiers));

create or replace function public.research_product_price_history_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'research product price history is append-only';
  end if;
  if new.id is distinct from old.id
     or new.product_id is distinct from old.product_id
     or new.variant_id is distinct from old.variant_id
     or new.audience is distinct from old.audience
     or new.amount_cents is distinct from old.amount_cents
     or new.quantity_tiers is distinct from old.quantity_tiers
     or new.currency is distinct from old.currency
     or new.effective_at is distinct from old.effective_at
     or new.expires_at is distinct from old.expires_at
     or new.approval_note is distinct from old.approval_note
     or new.version is distinct from old.version
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'research product price economic history is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.research_admin_create_product_price(
  p_product_id uuid,
  p_input jsonb,
  p_actor text,
  p_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_id uuid := gen_random_uuid();
  v_variant uuid := (p_input->>'variantId')::uuid;
  v_audience text := p_input->>'audience';
  v_version integer;
begin
  if p_actor is null or btrim(p_actor) = '' or p_at is null then
    raise exception 'actor and observation time required';
  end if;
  perform 1 from public.research_product_variants
  where id = v_variant and product_id = p_product_id
    and status = 'approved' and active;
  if not found then raise exception 'approved active variant not found'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_variant::text || ':' || v_audience, 0)
  );
  select coalesce(max(version), 0) + 1 into v_version
  from public.research_product_prices
  where variant_id = v_variant and audience = v_audience;
  insert into public.research_product_prices (
    id, product_id, variant_id, audience, amount_cents, currency, quantity_tiers,
    effective_at, expires_at, status, approval_note, version,
    created_by, created_at, updated_at
  ) values (
    v_id, p_product_id, v_variant, v_audience,
    (p_input->>'amountCents')::bigint, p_input->>'currency',
    coalesce(p_input->'quantityTiers', '[]'::jsonb),
    (p_input->>'effectiveAt')::timestamptz,
    nullif(p_input->>'expiresAt','')::timestamptz,
    'draft', nullif(p_input->>'approvalNote',''), v_version,
    p_actor, p_at, p_at
  );
  insert into public.research_product_admin_audit (
    product_id, entity_type, entity_id, action, actor, occurred_at
  ) values (p_product_id, 'price', v_id, 'price_created', p_actor, p_at);
  return p_product_id;
end;
$$;

-- Capability-specific entry point: an older schema returns RPC-not-found before
-- writing anything. Delegates to the same canonical version allocation and audit.
create function public.research_admin_create_tiered_product_price(
  p_product_id uuid, p_input jsonb, p_actor text, p_at timestamptz
) returns uuid language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not (p_input ? 'quantityTiers') or jsonb_typeof(p_input->'quantityTiers') <> 'array' then
    raise exception 'quantity ladder required';
  end if;
  if jsonb_array_length(p_input->'quantityTiers') = 0 then
    raise exception 'quantity ladder required';
  end if;
  return public.research_admin_create_product_price(p_product_id, p_input, p_actor, p_at);
end;
$$;

revoke all on function public.research_product_quantity_tiers_valid(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.research_product_quantity_tiers_valid(bigint,jsonb) to service_role;
revoke all on function public.research_admin_create_tiered_product_price(uuid,jsonb,text,timestamptz) from public, anon, authenticated;
grant execute on function public.research_admin_create_tiered_product_price(uuid,jsonb,text,timestamptz) to service_role;
-- CREATE OR REPLACE above preserves the existing canonical functions' ACLs.
-- No DML against existing products/prices, no lifecycle activation, no history repair.
commit;
