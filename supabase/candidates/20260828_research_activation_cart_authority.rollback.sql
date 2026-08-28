\set ON_ERROR_STOP on

begin;

drop trigger if exists research_activation_cart_live_intent_guard_v1
  on public.research_carts;
drop trigger if exists research_activation_cart_line_live_intent_guard_v1
  on public.research_cart_lines;
drop trigger if exists research_activation_product_live_intent_guard_v1
  on public.research_products;
drop trigger if exists research_activation_variant_live_intent_guard_v1
  on public.research_product_variants;

drop function if exists public.research_checkout_activation_intent_cancel_v1(
  uuid,text,uuid,uuid,timestamptz
);
drop function if exists public.research_checkout_activation_intent_consume_v1(
  uuid,text,uuid,uuid,text,timestamptz
);
drop function if exists public.research_checkout_activation_intent_claim_v1(
  uuid,text,uuid,uuid,text,timestamptz
);
drop function if exists public.research_checkout_activation_precharge_authorize_v1(
  uuid,text,timestamptz,integer
);
drop function if exists public.research_cart_mutate_with_activation_v1(
  uuid,text,text,integer,text,integer,timestamptz,integer
);

drop trigger if exists research_activation_head_live_intent_guard_v1
  on public.research_product_variant_activation_heads;
drop trigger if exists research_activation_intent_line_immutable_v1
  on public.research_checkout_activation_intent_lines;
drop trigger if exists research_activation_revision_prepare_v1
  on public.research_product_variant_activation_revisions;

drop function if exists public.research_activation_live_intent_guard_v1();
drop function if exists public.research_activation_intent_line_immutable_v1();
drop function if exists public.research_checkout_activation_command_digest_v1(
  uuid,text,uuid,uuid,text,text
);
drop function if exists public.research_checkout_activation_authorization_digest_v1(uuid);
drop function if exists public.research_activation_cart_fingerprint_v1(uuid,bigint);
drop function if exists public.research_activation_line_is_current_v1(
  uuid,uuid,text,integer,integer,text,bigint,text,timestamptz
);
drop function if exists public.research_activation_revision_prepare_v1();

drop table if exists public.research_checkout_activation_intent_lines;
drop table if exists public.research_checkout_activation_intents;
drop table if exists public.research_cart_line_activation_authority;
drop table if exists public.research_cart_activation_versions;
drop table if exists public.research_product_variant_activation_heads;
drop table if exists public.research_product_variant_activation_revisions;

drop function if exists public.research_activation_evidence_fingerprint_v1(
  smallint,bigint,uuid,uuid,text,text,text,uuid,uuid,text,
  timestamptz,timestamptz,timestamptz,timestamptz,timestamptz
);
drop function if exists public.research_activation_binding_fingerprint_v1(
  uuid,uuid,text,integer,integer
);
drop function if exists public.research_activation_hash_json_v1(jsonb);

commit;
