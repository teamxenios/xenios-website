\set ON_ERROR_STOP on

do $verify_rollback$
declare
  v_residual text[] := array[]::text[];
begin
  if to_regclass('public.research_product_variant_activation_revisions') is not null then
    v_residual := array_append(v_residual, 'research_product_variant_activation_revisions');
  end if;
  if to_regclass('public.research_product_variant_activation_heads') is not null then
    v_residual := array_append(v_residual, 'research_product_variant_activation_heads');
  end if;
  if to_regclass('public.research_cart_activation_versions') is not null then
    v_residual := array_append(v_residual, 'research_cart_activation_versions');
  end if;
  if to_regclass('public.research_cart_line_activation_authority') is not null then
    v_residual := array_append(v_residual, 'research_cart_line_activation_authority');
  end if;
  if to_regclass('public.research_checkout_activation_intents') is not null then
    v_residual := array_append(v_residual, 'research_checkout_activation_intents');
  end if;
  if to_regclass('public.research_checkout_activation_intent_lines') is not null then
    v_residual := array_append(v_residual, 'research_checkout_activation_intent_lines');
  end if;
  if to_regprocedure(
    'public.research_cart_mutate_with_activation_v1(uuid,text,text,integer,text,integer,timestamp with time zone,integer)'
  ) is not null then
    v_residual := array_append(v_residual, 'research_cart_mutate_with_activation_v1');
  end if;
  if to_regprocedure(
    'public.research_checkout_activation_precharge_authorize_v1(uuid,text,timestamp with time zone,integer)'
  ) is not null then
    v_residual := array_append(v_residual, 'research_checkout_activation_precharge_authorize_v1');
  end if;
  if to_regprocedure(
    'public.research_checkout_activation_intent_claim_v1(uuid,text,uuid,uuid,text,timestamp with time zone)'
  ) is not null then
    v_residual := array_append(v_residual, 'research_checkout_activation_intent_claim_v1');
  end if;
  if cardinality(v_residual) <> 0 then
    raise exception 'candidate rollback left residuals: %', array_to_string(v_residual, ', ');
  end if;

  if to_regclass('public.research_products') is null
     or to_regclass('public.research_product_variants') is null
     or to_regclass('public.research_carts') is null
     or to_regclass('public.research_cart_lines') is null
  then
    raise exception 'rollback removed a prerequisite base table';
  end if;

  if exists (
    select 1
    from pg_trigger t
    where t.tgrelid in (
      'public.research_products'::regclass,
      'public.research_product_variants'::regclass,
      'public.research_carts'::regclass,
      'public.research_cart_lines'::regclass
    )
      and t.tgname like 'research_activation_%_live_intent_guard_v1'
      and not t.tgisinternal
  ) then
    raise exception 'candidate rollback left a live-intent guard on a base table';
  end if;
end
$verify_rollback$;

\echo 'PASS activation authority rollback inventory'
