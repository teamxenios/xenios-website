#!/usr/bin/env bash
#
# Lane C rehearsal: the three 2026-08-19 cart migrations, applied twice over
# the REAL deployed chain on disposable PostgreSQL 16 and 17.
#
#   72 / A  supabase/migrations/20260819170000_research_ea_cart_commission_settlement.sql
#   73 / B  supabase/migrations/20260819170100_research_ea_cart_member_order_history.sql
#   74 / C  supabase/migrations/20260819170200_research_ea_cart_settlement_canonical_txn.sql
#
# WHAT THIS PROVES, AND WHY EACH PART IS HERE.
#
# The three candidates preflight against DEPLOYED prerequisites: the M58 cart
# tables, the M62 hardened settlement door, the M62 legal-bindings table and
# the M61 disposition column. So the container is bootstrapped by replaying
# the real deployed migration chain from supabase/migrations/ in timestamp
# order, 20260726143000 through 20260815150000, over the minimal REAL root
# prefix those chain files themselves alter (research-membership, members,
# catalog, inventory-lots, products-diagnostics — all RUN in production).
# Files the ledger marks PENDING are skipped, with one deliberate exception:
# 20260815150000 (M71, the chain endpoint this rehearsal was scoped to) is
# applied even though its ledger row is still PENDING, because the launch
# sequence applies it ahead of Lane C and every object it creates is disjoint
# from everything the three candidates touch, so its presence cannot fake a
# pass. The managed-Supabase seams a stock container lacks come from
# supabase/verification/research-20260819-cart-migrations-disposable-bootstrap.sql:
# pgcrypto in the `extensions` schema (public.digest PROVEN absent first — a
# container with public.digest present rehearses an environment production
# does not have, which is exactly how the original M58/M60 digest defect
# shipped), a minimal storage.buckets stand-in for the two RUN migrations
# that insert into it unguarded, and name-and-signature stand-ins for the
# twelve root-chain functions M68 ALTERs.
#
# Each candidate is applied TWICE at psql exit 0, with its structural suite
# and its supabase/candidates postcheck green after BOTH passes, and then a
# behavioural suite exercises the semantics on REAL rows:
#
#   A  a malformed commission returns commission_invalid with ZERO settlement
#      rows written (validated BEFORE the door, which is the entire point of
#      the wrapper); a valid commission settles and holds atomically; replay
#      short-circuits on already_settled without a second hold; the ledger's
#      append-only trigger refuses UPDATE and DELETE on the real held row.
#   B  null and empty handle arrays return the empty jsonb array rather than
#      every order; a two-customer fixture proves the filter returns only the
#      requested handle's rows, with M62 binding provenance carried and null
#      provenance for a handle with no binding.
#   C  canonical_transaction_id is STORED GENERATED and derives exactly
#      upper(regexp_replace(raw,'[^0-9A-Za-z]+','','g')); a canonically-equal
#      second spelling is refused by the named unique index itself; and on a
#      SEPARATE database seeded with a pre-existing duplicate pair before the
#      index exists, the sibling precheck answers STOP_RECONCILE_DUPLICATES
#      and the migration refuses whole, leaving no column and no index behind.
#
# Disposable databases only. This never connects to anything but the
# containers it starts, reads no production environment, and removes its
# containers on exit.
set -euo pipefail

IMAGES=("postgres:16" "postgres:17")
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ROLE_BOOTSTRAP="supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql"
SEAM_BOOTSTRAP="supabase/verification/research-20260819-cart-migrations-disposable-bootstrap.sql"

# The minimal REAL root prefix (all RUN in production) that the deployed
# migrations/ chain itself alters: 20260726143000 ALTERs research_products
# and enables RLS across the catalog + diagnostics tables; 20260727120000
# extends the inventory-lot tables.
ROOT_PREFIX=(
  "supabase/research-membership.sql"
  "supabase/research-members.sql"
  "supabase/research-catalog.sql"
  "supabase/research-inventory-lots.sql"
  "supabase/research-products-diagnostics.sql"
)

# The deployed supabase/migrations/ chain in timestamp order. Ledger rows
# marked PENDING are omitted (42-46, 52-57, 59, 63-66); 20260815150000 is
# included deliberately (see header).
DEPLOYED_CHAIN=(
  "supabase/migrations/20260726143000_research_product_control_center.sql"
  "supabase/migrations/20260726214500_research_product_control_center_privilege_hardening.sql"
  "supabase/migrations/20260727120000_research_inventory_lot_coa_admin.sql"
  "supabase/migrations/20260727160000_research_inventory_reservation_commands.sql"
  "supabase/migrations/20260801120000_research_variant_strength_write_gate.sql"
  "supabase/migrations/20260804120000_research_early_access_identity_persistence.sql"
  "supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql"
  "supabase/migrations/20260807193000_research_early_access_cart_checkout.sql"
  "supabase/migrations/20260808100000_research_early_access_cart_completion.sql"
  "supabase/migrations/20260809120000_research_early_access_cart_duplicate_guard.sql"
  "supabase/migrations/20260809130000_research_early_access_hardening.sql"
  "supabase/migrations/20260813120000_research_early_access_member_order_history.sql"
  "supabase/migrations/20260814061500_research_function_search_path_hardening.sql"
  "supabase/migrations/20260815150000_research_assisted_order_bridge.sql"
)

# The cart-only chain for the duplicate-pair database: exactly the deployed
# cart lineage the C preflight reads, with nothing else, mirroring the
# production truth that 52/53 are absent.
CART_CHAIN=(
  "supabase/migrations/20260804120000_research_early_access_identity_persistence.sql"
  "supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql"
  "supabase/migrations/20260807193000_research_early_access_cart_checkout.sql"
  "supabase/migrations/20260808100000_research_early_access_cart_completion.sql"
  "supabase/migrations/20260809120000_research_early_access_cart_duplicate_guard.sql"
  "supabase/migrations/20260809130000_research_early_access_hardening.sql"
)

TARGET_A="supabase/migrations/20260819170000_research_ea_cart_commission_settlement.sql"
TARGET_B="supabase/migrations/20260819170100_research_ea_cart_member_order_history.sql"
TARGET_C="supabase/migrations/20260819170200_research_ea_cart_settlement_canonical_txn.sql"
POSTCHECK_A="supabase/candidates/20260819_research_ea_cart_commission_settlement_postcheck.sql"
POSTCHECK_B="supabase/candidates/20260819_research_ea_cart_member_order_history_postcheck.sql"
POSTCHECK_C="supabase/candidates/20260819_research_ea_cart_settlement_canonical_txn_postcheck.sql"
PRECHECK_C="supabase/candidates/20260819_research_ea_cart_settlement_canonical_txn_precheck.sql"

fail() { echo "FAIL: $*" >&2; exit 1; }

for f in "$ROLE_BOOTSTRAP" "$SEAM_BOOTSTRAP" "${ROOT_PREFIX[@]}" "${DEPLOYED_CHAIN[@]}" \
         "$TARGET_A" "$TARGET_B" "$TARGET_C" \
         "$POSTCHECK_A" "$POSTCHECK_B" "$POSTCHECK_C" "$PRECHECK_C"; do
  [ -f "$REPO_ROOT/$f" ] || fail "missing $f"
done

# ---------------------------------------------------------------------------
# Structural suites, run after EVERY apply pass. Every assertion is
# `expected|actual` compared as text so a silent coercion cannot pass.
# ---------------------------------------------------------------------------

read -r -d '' STRUCT_A <<'SQL' || true
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
-- A1. The commission ledger carries RLS ENABLED and FORCED.
select 'A1 rls forced|' ||
  (select (c.relrowsecurity and c.relforcerowsecurity)::text
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='research_early_access_cart_commission_events')
  = 'A1 rls forced|true';
-- A2. ZERO direct table grants for PUBLIC, anon, authenticated AND service_role.
select 'A2 zero table grants|' ||
  (select count(*)::text
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid=c.relnamespace
     cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,'{}'::aclitem[])) acl
     left join pg_catalog.pg_roles r on r.oid=acl.grantee
    where n.nspname='public' and c.relname='research_early_access_cart_commission_events'
      and (acl.grantee=0 or r.rolname in ('anon','authenticated','service_role')))
  = 'A2 zero table grants|0';
-- A3. Wrapper AND append-only guard are both SECURITY DEFINER.
select 'A3 definer pair|' ||
  (select count(*)::text from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.proname in ('research_early_access_commit_cart_settlement_with_commission',
                        'research_early_access_cart_commission_append_only'))
  = 'A3 definer pair|2';
-- A4. The wrapper executes for service_role and for NO browser role.
select 'A4 wrapper execute|' ||
  has_function_privilege('service_role',
    'public.research_early_access_commit_cart_settlement_with_commission(text,text,text,bigint,text,text,boolean,boolean,timestamptz,jsonb)','EXECUTE')::text
  || ',' || has_function_privilege('anon',
    'public.research_early_access_commit_cart_settlement_with_commission(text,text,text,bigint,text,text,boolean,boolean,timestamptz,jsonb)','EXECUTE')::text
  || ',' || has_function_privilege('authenticated',
    'public.research_early_access_commit_cart_settlement_with_commission(text,text,text,bigint,text,text,boolean,boolean,timestamptz,jsonb)','EXECUTE')::text
  = 'A4 wrapper execute|true,false,false';
-- A5. NO PUBLIC EXECUTE on either routine, with acldefault expanded, because a
--     null proacl means the PostgreSQL default which INCLUDES PUBLIC execute.
select 'A5 no public execute|' ||
  (select count(*)::text
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
     cross join lateral pg_catalog.aclexplode(
       coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
    where n.nspname='public'
      and p.proname in ('research_early_access_commit_cart_settlement_with_commission',
                        'research_early_access_cart_commission_append_only')
      and acl.grantee=0 and acl.privilege_type='EXECUTE')
  = 'A5 no public execute|0';
-- A6. The append-only guard is reachable by NO client role at all.
select 'A6 guard sealed|' ||
  (select count(*)::text
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,
          lateral unnest(array['anon','authenticated','service_role']) as r(role)
    where n.nspname='public' and p.proname='research_early_access_cart_commission_append_only'
      and has_function_privilege(r.role, p.oid, 'EXECUTE'))
  = 'A6 guard sealed|0';
-- A7. The append-only trigger stands on the ledger.
select 'A7 append-only trigger|' ||
  (select count(*)::text from pg_catalog.pg_trigger t
    where t.tgrelid='public.research_early_access_cart_commission_events'::regclass
      and t.tgname='research_early_access_cart_commission_events_append_only'
      and not t.tgisinternal)
  = 'A7 append-only trigger|1';
SQL

read -r -d '' STRUCT_B <<'SQL' || true
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
-- B1. Exactly one routine with the exact text[] signature, STABLE, DEFINER.
select 'B1 routine shape|' ||
  (select count(*)::text || ',' || bool_and(p.provolatile = 's')::text || ',' || bool_and(p.prosecdef)::text
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='research_early_access_cart_checkouts_for_customers'
      and p.pronargs=1 and p.proargtypes[0]='pg_catalog.text[]'::regtype)
  = 'B1 routine shape|1,true,true';
-- B2. EXECUTE for service_role alone among client roles.
select 'B2 routine execute|' ||
  has_function_privilege('service_role','public.research_early_access_cart_checkouts_for_customers(text[])','EXECUTE')::text
  || ',' || has_function_privilege('anon','public.research_early_access_cart_checkouts_for_customers(text[])','EXECUTE')::text
  || ',' || has_function_privilege('authenticated','public.research_early_access_cart_checkouts_for_customers(text[])','EXECUTE')::text
  = 'B2 routine execute|true,false,false';
-- B3. NO PUBLIC EXECUTE with acldefault expanded.
select 'B3 no public execute|' ||
  (select count(*)::text
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
     cross join lateral pg_catalog.aclexplode(
       coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
    where n.nspname='public' and p.proname='research_early_access_cart_checkouts_for_customers'
      and acl.grantee=0 and acl.privilege_type='EXECUTE')
  = 'B3 no public execute|0';
-- B4. The routine gained no table grant anywhere: service_role still cannot
--     SELECT legal_bindings, and no browser role can SELECT either table.
select 'B4 no table grant|' ||
  has_table_privilege('service_role','public.research_early_access_legal_bindings','SELECT')::text
  || ',' || has_table_privilege('anon','public.research_early_access_cart_checkouts','SELECT')::text
  || ',' || has_table_privilege('authenticated','public.research_early_access_cart_checkouts','SELECT')::text
  || ',' || has_table_privilege('anon','public.research_early_access_legal_bindings','SELECT')::text
  || ',' || has_table_privilege('authenticated','public.research_early_access_legal_bindings','SELECT')::text
  = 'B4 no table grant|false,false,false,false,false';
SQL

read -r -d '' STRUCT_C <<'SQL' || true
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
-- C1. canonical_transaction_id is STORED GENERATED (attgenerated = 's').
select 'C1 stored generated|' ||
  (select att.attgenerated::text
     from pg_catalog.pg_attribute att
     join pg_catalog.pg_class rel on rel.oid=att.attrelid
     join pg_catalog.pg_namespace nsp on nsp.oid=rel.relnamespace
    where nsp.nspname='public' and rel.relname='research_early_access_cart_settlements'
      and att.attname='canonical_transaction_id' and att.attnum>0 and not att.attisdropped)
  = 'C1 stored generated|s';
-- C2. The canonical unique index is present and unique.
select 'C2 unique index|' ||
  (select i.indisunique::text from pg_catalog.pg_index i
     join pg_catalog.pg_class idx on idx.oid=i.indexrelid
    where idx.relname='research_ea_cart_settlements_canonical_txn_uidx')
  = 'C2 unique index|true';
-- C3. Every stored settlement agrees with the derivation.
select 'C3 zero disagreements|' ||
  (select count(*)::text from public.research_early_access_cart_settlements s
    where s.canonical_transaction_id is distinct from
          upper(regexp_replace(s.external_transaction_id,'[^0-9A-Za-z]+','','g')))
  = 'C3 zero disagreements|0';
SQL

# ---------------------------------------------------------------------------
# Behavioural suites, run ONCE after both apply passes (they write fixtures).
# Every emitted row must be `t`; DO-block probes raise instead of emitting.
# ---------------------------------------------------------------------------

read -r -d '' BEHAVE_A <<'SQL' || true
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.seed_cart_checkout(
  p_suffix text, p_customer text, p_amount bigint
) returns text language plpgsql as $$
declare
  v_quote text := 'xeaq_lc' || lower(p_suffix) || repeat('0', greatest(0, 18-length(p_suffix)));
  v_checkout text := 'XEC-LC' || upper(p_suffix) || repeat('0', greatest(0, 18-length(p_suffix)));
  v_order text := 'XEA-CART-LC-' || upper(p_suffix) || '-01';
  v_invoice text := 'XEI-LC' || upper(p_suffix) || repeat('0', greatest(0, 18-length(p_suffix)));
  v_reference text := 'XEACART-LC' || upper(p_suffix) || repeat('0', greatest(0, 16-length(p_suffix)));
begin
  insert into public.research_early_access_cart_quotes(
    quote_id, customer_ref, intent_hash, quote_hash, record, quoted_at, expires_at
  ) values (
    v_quote, p_customer, repeat('1',64), repeat('2',64), '{}', clock_timestamp(), clock_timestamp()+interval '1 day'
  );
  insert into public.research_early_access_cart_checkouts(
    checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id, payment_state,
    currency, subtotal_cents, discount_cents, shipping_cents, tax_cents, payable_total_cents, record, placed_at
  ) values (
    v_checkout, p_customer,
    encode(extensions.digest(convert_to(v_checkout,'utf8'),'sha256'),'hex'),
    repeat('1',64), v_quote, 'awaiting_payment', 'USD', p_amount, 0, 0, 0, p_amount,
    jsonb_build_object('cartCheckoutNumber', v_checkout, 'customerRef', p_customer), clock_timestamp()
  );
  insert into public.research_early_access_cart_items(
    cart_checkout_id, line_index, order_number, product_id, variant_id, sku, quantity,
    supplier_id, supplier_sku, unit_price_cents, subtotal_cents, discount_cents, payable_cents, record
  ) select id, 0, v_order, 'product-lc', 'variant-lc', 'SKU-LC', 1, 'supplier-lc', 'SUP-LC',
           p_amount, p_amount, 0, p_amount, jsonb_build_object('orderNumber', v_order, 'supplierId', 'supplier-lc')
      from public.research_early_access_cart_checkouts where checkout_number = v_checkout;
  insert into public.research_early_access_cart_invoices(
    cart_checkout_id, invoice_number, payment_reference, currency, subtotal_cents, discount_cents,
    shipping_cents, tax_cents, payable_total_cents, record, issued_at
  ) select id, v_invoice, v_reference, 'USD', p_amount, 0, 0, 0, p_amount,
           jsonb_build_object('invoiceNumber', v_invoice), clock_timestamp()
      from public.research_early_access_cart_checkouts where checkout_number = v_checkout;
  return v_checkout;
end $$;

create or replace function pg_temp.ready_for_settlement(
  p_suffix text, p_customer text, p_member uuid, p_amount bigint, p_evidence text
) returns text language plpgsql as $$
declare
  v_checkout text;
begin
  v_checkout := pg_temp.seed_cart_checkout(p_suffix, p_customer, p_amount);
  perform public.research_early_access_record_legal_binding(jsonb_build_object(
    'customerRef', p_customer, 'memberId', p_member::text, 'establishedBy', 'verified_link',
    'verifiedAt', '2026-08-19T10:00:00Z', 'attestedBy', null, 'aliasRefs', jsonb_build_array()));
  perform public.research_early_access_record_agreement_attestation(jsonb_build_object(
    'attestationId', 'eaa_lanec_attestation_' || lower(p_suffix), 'cartCheckoutNumber', v_checkout,
    'memberId', p_member::text, 'packageId', 'ea-package', 'packageVersion', repeat('c',24),
    'signedAt', jsonb_build_object(
      'manual_payment_bridge_terms', '2026-08-19T10:01:00Z',
      'arbitration_agreement', '2026-08-19T10:02:00Z')), 'legal:rehearsal');
  perform public.research_early_access_begin_proof_submission(jsonb_build_object(
    'submissionId', 'eaps_lanec_submission_' || lower(p_suffix), 'cartCheckoutNumber', v_checkout,
    'customerRef', p_customer, 'memberId', p_member::text,
    'method', jsonb_build_object('code','wire_transfer','methodName','Wire transfer',
      'registryVersion','registry-v2','presentedAt','2026-08-19T10:03:00Z'),
    'filename','payment.pdf','contentType','application/pdf','byteSize',1024,
    'proofSha256', repeat('9',64), 'packageVersion', repeat('c',24)), 'eask_lanec_submission_' || lower(p_suffix));
  perform public.research_early_access_confirm_submission_email(
    'eaps_lanec_submission_' || lower(p_suffix), 'eask_lanec_submission_' || lower(p_suffix),
    'accepted', 'provider-lc-' || lower(p_suffix), null);
  perform public.research_early_access_record_cart_external_proof(jsonb_build_object(
    'cartCheckoutNumber', v_checkout, 'evidenceRef', p_evidence, 'sha256', repeat('9',64),
    'filename','payment.pdf','contentType','application/pdf','byteSize',1024,
    'provenanceNote','disposable rehearsal','recordedBy','admin@example.com','recordedAt','2026-08-19T10:04:00Z'));
  return v_checkout;
end $$;

-- Fixture: one current package, one fully settle-ready checkout. Everything
-- below is deterministic: the seeded checkout is XEC-LCALPHA1000000000000.
do $seed$
begin
  perform public.research_early_access_register_agreement_package(jsonb_build_object(
    'packageId','ea-package','packageVersion',repeat('c',24),'supersedesPackageVersion',null,
    'requirements', jsonb_build_array(
      jsonb_build_object('category','manual_payment_bridge_terms','documentVersionId','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'semver','1.0.0','requiresSeparateAcknowledgment',false,'ordering',1),
      jsonb_build_object('category','arbitration_agreement','documentVersionId','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'semver','1.0.0','requiresSeparateAcknowledgment',true,'ordering',2))
  ), 'legal:rehearsal');
  perform pg_temp.ready_for_settlement(
    'ALPHA1', 'eac_' || repeat('a',28) || '0001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001', 25000,
    'eaext.LaneCAlphaEvidence0001');
end
$seed$;

-- A-b1. Malformed commission (payout=true): commission_invalid, nothing written.
select (public.research_early_access_commit_cart_settlement_with_commission(
  'XEC-LCALPHA1000000000000', 'TX-LaneC-Alpha-001', 'eaext.LaneCAlphaEvidence0001',
  25000, 'USD', 'admin@example.com', true, true, clock_timestamp(),
  jsonb_build_object(
    'accrualId','early-access-commission-accrual:XEC-LCALPHA1000000000000',
    'orderReference','XEC-LCALPHA1000000000000','basis','subtotal_less_discount','currency','USD',
    'payout', true, 'commissionAmountCents','2500','commissionBasisCents','25000',
    'affiliateId','aff_rehearsal_001','referralCode','REHEARSE10')
)->>'reason') = 'commission_invalid';
-- A-b2. Malformed commission (amount above basis): the same refusal.
select (public.research_early_access_commit_cart_settlement_with_commission(
  'XEC-LCALPHA1000000000000', 'TX-LaneC-Alpha-001', 'eaext.LaneCAlphaEvidence0001',
  25000, 'USD', 'admin@example.com', true, true, clock_timestamp(),
  jsonb_build_object(
    'accrualId','early-access-commission-accrual:XEC-LCALPHA1000000000000',
    'orderReference','XEC-LCALPHA1000000000000','basis','subtotal_less_discount','currency','USD',
    'payout', false, 'commissionAmountCents','25001','commissionBasisCents','25000',
    'affiliateId','aff_rehearsal_001','referralCode','REHEARSE10')
)->>'reason') = 'commission_invalid';
-- A-b3. NO settlement row was written by either refusal (the checkout was
--       otherwise fully settle-ready, so only the commission gate refused).
select (select count(*) from public.research_early_access_cart_settlements s
  join public.research_early_access_cart_checkouts c on c.id=s.cart_checkout_id
  where c.checkout_number='XEC-LCALPHA1000000000000') = 0;
-- A-b4. And NO commission hold either.
select (select count(*) from public.research_early_access_cart_commission_events) = 0;
-- A-b5. A valid commission settles and holds in one transaction.
select (public.research_early_access_commit_cart_settlement_with_commission(
  'XEC-LCALPHA1000000000000', 'TX-LaneC-Alpha-001', 'eaext.LaneCAlphaEvidence0001',
  25000, 'USD', 'admin@example.com', true, true, clock_timestamp(),
  jsonb_build_object(
    'accrualId','early-access-commission-accrual:XEC-LCALPHA1000000000000',
    'orderReference','XEC-LCALPHA1000000000000','basis','subtotal_less_discount','currency','USD',
    'payout', false, 'commissionAmountCents','2500','commissionBasisCents','25000',
    'affiliateId','aff_rehearsal_001','referralCode','REHEARSE10')
) #>> '{commission,recorded}') = 'true';
-- A-b6. Exactly one settlement and one held commission event exist.
select (select count(*) from public.research_early_access_cart_settlements s
  join public.research_early_access_cart_checkouts c on c.id=s.cart_checkout_id
  where c.checkout_number='XEC-LCALPHA1000000000000') = 1;
select (select state='held' and hold_amount_cents=2500 and currency='USD'
  from public.research_early_access_cart_commission_events
  where checkout_number='XEC-LCALPHA1000000000000');
-- A-b7. Money time is database authority: held_at equals the hardened door's
--       payment_verified_at exactly.
select (select e.held_at = h.payment_verified_at
  from public.research_early_access_cart_commission_events e
  join public.research_early_access_cart_settlement_hardening h on h.cart_checkout_id=e.cart_checkout_id
  where e.checkout_number='XEC-LCALPHA1000000000000');
-- A-b8. Replay short-circuits on already_settled with no second hold.
select (public.research_early_access_commit_cart_settlement_with_commission(
  'XEC-LCALPHA1000000000000', 'TX-LaneC-Alpha-001', 'eaext.LaneCAlphaEvidence0001',
  25000, 'USD', 'admin@example.com', true, true, clock_timestamp(),
  jsonb_build_object(
    'accrualId','early-access-commission-accrual:XEC-LCALPHA1000000000000',
    'orderReference','XEC-LCALPHA1000000000000','basis','subtotal_less_discount','currency','USD',
    'payout', false, 'commissionAmountCents','2500','commissionBasisCents','25000',
    'affiliateId','aff_rehearsal_001','referralCode','REHEARSE10')
)->>'reason') = 'already_settled';
select (select count(*) from public.research_early_access_cart_commission_events) = 1;
-- A-b9. A door refusal passes through verbatim: unknown checkout, valid shape.
select (public.research_early_access_commit_cart_settlement_with_commission(
  'XEC-LCUNKNOWN00000000000', 'TX-LaneC-Unknown-001', 'eaext.LaneCUnknownEvid0001',
  1000, 'USD', 'admin@example.com', true, true, clock_timestamp(),
  jsonb_build_object(
    'accrualId','early-access-commission-accrual:XEC-LCUNKNOWN00000000000',
    'orderReference','XEC-LCUNKNOWN00000000000','basis','subtotal_less_discount','currency','USD',
    'payout', false, 'commissionAmountCents','100','commissionBasisCents','1000',
    'affiliateId','aff_rehearsal_001','referralCode','REHEARSE10')
)->>'reason') = 'checkout_unknown';
-- A-b10. Append-only, exercised on the REAL held row: UPDATE and DELETE are
--        both refused, and the row is unchanged afterward.
do $probe$
declare
  v_allowed boolean := false;
begin
  begin
    update public.research_early_access_cart_commission_events
       set hold_amount_cents = 1 where checkout_number='XEC-LCALPHA1000000000000';
    v_allowed := true;
  exception when others then null; end;
  if v_allowed then raise exception 'commission ledger UPDATE was permitted'; end if;
  begin
    delete from public.research_early_access_cart_commission_events
     where checkout_number='XEC-LCALPHA1000000000000';
    v_allowed := true;
  exception when others then null; end;
  if v_allowed then raise exception 'commission ledger DELETE was permitted'; end if;
end
$probe$;
select (select hold_amount_cents=2500 from public.research_early_access_cart_commission_events
  where checkout_number='XEC-LCALPHA1000000000000');
SQL

read -r -d '' BEHAVE_B <<'SQL' || true
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.seed_cart_checkout(
  p_suffix text, p_customer text, p_amount bigint
) returns text language plpgsql as $$
declare
  v_quote text := 'xeaq_lc' || lower(p_suffix) || repeat('0', greatest(0, 18-length(p_suffix)));
  v_checkout text := 'XEC-LC' || upper(p_suffix) || repeat('0', greatest(0, 18-length(p_suffix)));
begin
  insert into public.research_early_access_cart_quotes(
    quote_id, customer_ref, intent_hash, quote_hash, record, quoted_at, expires_at
  ) values (
    v_quote, p_customer, repeat('1',64), repeat('2',64), '{}', clock_timestamp(), clock_timestamp()+interval '1 day'
  );
  insert into public.research_early_access_cart_checkouts(
    checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id, payment_state,
    currency, subtotal_cents, discount_cents, shipping_cents, tax_cents, payable_total_cents, record, placed_at
  ) values (
    v_checkout, p_customer,
    encode(extensions.digest(convert_to(v_checkout,'utf8'),'sha256'),'hex'),
    repeat('1',64), v_quote, 'awaiting_payment', 'USD', p_amount, 0, 0, 0, p_amount,
    jsonb_build_object('cartCheckoutNumber', v_checkout, 'customerRef', p_customer), clock_timestamp()
  );
  return v_checkout;
end $$;

-- Fixture: TWO customers so every positive answer is also a
-- does-not-return-the-other-customer answer. 0001 has two checkouts and a
-- verified M62 binding; 0002 has one checkout and NO binding.
do $seed$
begin
  perform pg_temp.seed_cart_checkout('HIST1A', 'eac_' || repeat('b',28) || '0001', 11000);
  perform pg_temp.seed_cart_checkout('HIST1B', 'eac_' || repeat('b',28) || '0001', 12000);
  perform pg_temp.seed_cart_checkout('HIST2A', 'eac_' || repeat('b',28) || '0002', 13000);
  perform public.research_early_access_record_legal_binding(jsonb_build_object(
    'customerRef', 'eac_' || repeat('b',28) || '0001', 'memberId', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001',
    'establishedBy', 'verified_link', 'verifiedAt', '2026-08-19T09:00:00Z',
    'attestedBy', null, 'aliasRefs', jsonb_build_array()));
end
$seed$;

-- B-b1/2/3. Null, empty and unknown handle lists return the EMPTY jsonb
--           array, never every order.
select public.research_early_access_cart_checkouts_for_customers(null) = '[]'::jsonb;
select public.research_early_access_cart_checkouts_for_customers(array[]::text[]) = '[]'::jsonb;
select public.research_early_access_cart_checkouts_for_customers(
  array['eac_' || repeat('f',28) || '9999']) = '[]'::jsonb;
-- B-b4. The filter returns BOTH of the first customer's rows and ONLY that
--       customer's rows.
select (select jsonb_array_length(public.research_early_access_cart_checkouts_for_customers(
  array['eac_' || repeat('b',28) || '0001'])) = 2);
select (select count(distinct e->>'customerRef') = 1
           and min(e->>'customerRef') = 'eac_' || repeat('b',28) || '0001'
  from jsonb_array_elements(public.research_early_access_cart_checkouts_for_customers(
    array['eac_' || repeat('b',28) || '0001'])) e);
-- B-b5. The second customer's single row comes back alone.
select (select jsonb_array_length(public.research_early_access_cart_checkouts_for_customers(
  array['eac_' || repeat('b',28) || '0002'])) = 1);
-- B-b6. M62 binding provenance is carried; a handle with no binding reports
--       null provenance, never a fabricated verified one.
select (select string_agg(distinct coalesce(e->>'bindingProvenance','<null>'), ',') = 'verified_link'
  from jsonb_array_elements(public.research_early_access_cart_checkouts_for_customers(
    array['eac_' || repeat('b',28) || '0001'])) e);
select (select string_agg(distinct coalesce(e->>'bindingProvenance','<null>'), ',') = '<null>'
  from jsonb_array_elements(public.research_early_access_cart_checkouts_for_customers(
    array['eac_' || repeat('b',28) || '0002'])) e);
-- B-b7. Both handles together return all three rows.
select (select jsonb_array_length(public.research_early_access_cart_checkouts_for_customers(
  array['eac_' || repeat('b',28) || '0001', 'eac_' || repeat('b',28) || '0002'])) = 3);
-- B-b8. Deterministic order: oldest first, checkout number breaking ties.
select (select string_agg(e->>'checkoutNumber', ',' order by ord)
          = 'XEC-LCHIST1A000000000000,XEC-LCHIST1B000000000000'
  from jsonb_array_elements(public.research_early_access_cart_checkouts_for_customers(
    array['eac_' || repeat('b',28) || '0001'])) with ordinality t(e, ord));
SQL

read -r -d '' BEHAVE_C <<'SQL' || true
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.seed_cart_checkout(
  p_suffix text, p_customer text, p_amount bigint
) returns text language plpgsql as $$
declare
  v_quote text := 'xeaq_lc' || lower(p_suffix) || repeat('0', greatest(0, 18-length(p_suffix)));
  v_checkout text := 'XEC-LC' || upper(p_suffix) || repeat('0', greatest(0, 18-length(p_suffix)));
begin
  insert into public.research_early_access_cart_quotes(
    quote_id, customer_ref, intent_hash, quote_hash, record, quoted_at, expires_at
  ) values (
    v_quote, p_customer, repeat('1',64), repeat('2',64), '{}', clock_timestamp(), clock_timestamp()+interval '1 day'
  );
  insert into public.research_early_access_cart_checkouts(
    checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id, payment_state,
    currency, subtotal_cents, discount_cents, shipping_cents, tax_cents, payable_total_cents, record, placed_at
  ) values (
    v_checkout, p_customer,
    encode(extensions.digest(convert_to(v_checkout,'utf8'),'sha256'),'hex'),
    repeat('1',64), v_quote, 'awaiting_payment', 'USD', p_amount, 0, 0, 0, p_amount,
    jsonb_build_object('cartCheckoutNumber', v_checkout, 'customerRef', p_customer), clock_timestamp()
  );
  return v_checkout;
end $$;

do $seed$
begin
  perform pg_temp.seed_cart_checkout('CANON1', 'eac_' || repeat('c',28) || '0001', 14000);
  perform pg_temp.seed_cart_checkout('CANON2', 'eac_' || repeat('c',28) || '0002', 15000);
  insert into public.research_early_access_cart_settlements(
    cart_checkout_id, external_transaction_id, reviewed_evidence_ref,
    verified_amount_cents, verified_currency, actor_id, record, settled_at)
  select id, 'TX Lane-C canon 001', 'eaext.LaneCCanonEvidence001', 14000, 'USD',
         'admin@example.com', '{}', clock_timestamp()
    from public.research_early_access_cart_checkouts where checkout_number='XEC-LCCANON1000000000000';
end
$seed$;

-- C-b1. The stored value IS the frozen derivation, on a real inserted row.
select (select canonical_transaction_id = 'TXLANECCANON001'
           and canonical_transaction_id
             = upper(regexp_replace(external_transaction_id,'[^0-9A-Za-z]+','','g'))
  from public.research_early_access_cart_settlements
  where external_transaction_id='TX Lane-C canon 001');
-- C-b2. A canonically-equal second spelling ('tx-lane-c-CANON-001', raw-distinct)
--       is refused by the canonical unique index ITSELF, named in the error.
do $probe$
declare
  v_constraint text := '';
  v_allowed boolean := false;
begin
  begin
    insert into public.research_early_access_cart_settlements(
      cart_checkout_id, external_transaction_id, reviewed_evidence_ref,
      verified_amount_cents, verified_currency, actor_id, record, settled_at)
    select id, 'tx-lane-c-CANON-001', 'eaext.LaneCCanonEvidence002', 15000, 'USD',
           'admin@example.com', '{}', clock_timestamp()
      from public.research_early_access_cart_checkouts where checkout_number='XEC-LCCANON2000000000000';
    v_allowed := true;
  exception when unique_violation then
    get stacked diagnostics v_constraint := CONSTRAINT_NAME;
  end;
  if v_allowed then
    raise exception 'a canonically-equal transaction id was accepted by the settlements table';
  end if;
  if v_constraint <> 'research_ea_cart_settlements_canonical_txn_uidx' then
    raise exception 'refusal came from % rather than the canonical unique index', v_constraint;
  end if;
end
$probe$;
-- C-b3. The refused insert left no settlement behind: neither the raw variant
--       nor any second holder of the canonical form exists.
select (select count(*) from public.research_early_access_cart_settlements
  where external_transaction_id = 'tx-lane-c-CANON-001') = 0;
select (select count(*) from public.research_early_access_cart_settlements
  where canonical_transaction_id = 'TXLANECCANON001') = 1;
SQL

# ---------------------------------------------------------------------------
# Runner.
# ---------------------------------------------------------------------------

for image in "${IMAGES[@]}"; do
  docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image" >/dev/null
done

for image in "${IMAGES[@]}"; do
  tag="${image//[:.]/_}"
  name="lanec20260819_${tag}"
  echo "=============================================================="
  echo "Lane C 2026-08-19 cart rehearsal on ${image}"
  echo "=============================================================="

  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" -e POSTGRES_PASSWORD=rehearse "$image" >/dev/null
  trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT

  for _ in $(seq 1 60); do
    if docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; then break; fi
    sleep 1
  done
  docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 || fail "${image} never became ready"

  run_sql() {
    docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres -d "$1" -q
  }
  query() {
    docker exec "$name" psql -U postgres -d "$1" -tAc "$2"
  }

  # ---- 1. Bootstrap: roles, then the managed-Supabase seams ---------------
  docker exec "$name" psql -U postgres -q -c 'create database rehearse' >/dev/null
  run_sql rehearse < "${REPO_ROOT}/${ROLE_BOOTSTRAP}" >/dev/null \
    || fail "${image}: role bootstrap failed"
  run_sql rehearse < "${REPO_ROOT}/${SEAM_BOOTSTRAP}" >/dev/null \
    || fail "${image}: seam bootstrap failed"
  shape="$(query rehearse "select (to_regprocedure('extensions.digest(bytea,text)') is not null)::text
    || ',' || (to_regprocedure('public.digest(bytea,text)') is null)::text")"
  [ "$shape" = "true,true" ] \
    || fail "${image}: container does not reproduce managed Supabase (extensions.digest present, public.digest absent); got ${shape}"
  echo "  managed shape proven: extensions.digest present, public.digest ABSENT"

  # ---- 2. The REAL deployed lineage ---------------------------------------
  for f in "${ROOT_PREFIX[@]}"; do
    run_sql rehearse < "${REPO_ROOT}/${f}" >/dev/null || fail "${image}: root prefix ${f} failed"
    echo "  root   psql exit 0  $(basename "$f")"
  done
  for f in "${DEPLOYED_CHAIN[@]}"; do
    run_sql rehearse < "${REPO_ROOT}/${f}" >/dev/null || fail "${image}: chain ${f} failed"
    echo "  chain  psql exit 0  $(basename "$f")"
  done

  # ---- 3. Apply each candidate twice; structural suite and postcheck green
  #         after EVERY pass; behavioural suite once after both. -----------
  run_target() {
    local label="$1" migration="$2" struct="$3" struct_n="$4" postcheck="$5" behave="$6" behave_n="$7"
    local pass results rc count verdict
    for pass in 1 2; do
      run_sql rehearse < "${REPO_ROOT}/${migration}" >/dev/null \
        || fail "${image}: target ${label} apply pass ${pass} failed"
      echo "  target ${label} apply pass ${pass}: psql exit 0"
      set +e
      results="$(printf '%s\n' "$struct" | run_sql rehearse 2>&1)"
      rc=$?
      set -e
      if [ "$rc" -ne 0 ]; then
        echo "$results" >&2
        fail "${image}: target ${label} structural suite errored (psql exit ${rc}) after pass ${pass}"
      fi
      if echo "$results" | grep -qv '^t$'; then
        echo "$results" >&2
        fail "${image}: target ${label} structural suite failed after pass ${pass}"
      fi
      count="$(echo "$results" | grep -c '^t$')"
      [ "$count" = "$struct_n" ] \
        || fail "${image}: target ${label} expected ${struct_n} structural assertions, got ${count}"
      verdict="$(run_sql rehearse < "${REPO_ROOT}/${postcheck}" 2>&1 | tr -d ' ')" || true
      echo "$verdict" | grep -q '"verdict":"APPLIED_OK"' \
        || fail "${image}: target ${label} postcheck after pass ${pass} did not report APPLIED_OK: ${verdict}"
      echo "  target ${label} pass ${pass}: structural ${struct_n}/${struct_n}, postcheck APPLIED_OK"
    done
    set +e
    results="$(printf '%s\n' "$behave" | run_sql rehearse 2>&1)"
    rc=$?
    set -e
    if [ "$rc" -ne 0 ]; then
      echo "$results" >&2
      fail "${image}: target ${label} behavioural suite errored (psql exit ${rc})"
    fi
    if echo "$results" | grep -qv '^t$'; then
      echo "$results" >&2
      fail "${image}: target ${label} behavioural suite failed"
    fi
    count="$(echo "$results" | grep -c '^t$')"
    [ "$count" = "$behave_n" ] \
      || fail "${image}: target ${label} expected ${behave_n} behavioural assertions, got ${count}"
    echo "  target ${label} behavioural suite: ${behave_n}/${behave_n}"
  }

  run_target "A" "$TARGET_A" "$STRUCT_A" 7 "$POSTCHECK_A" "$BEHAVE_A" 12
  run_target "B" "$TARGET_B" "$STRUCT_B" 4 "$POSTCHECK_B" "$BEHAVE_B" 10
  run_target "C" "$TARGET_C" "$STRUCT_C" 3 "$POSTCHECK_C" "$BEHAVE_C" 3

  # ---- 4. The pre-existing-duplicate scenario, on its OWN database --------
  # Production-faithful cart lineage only, no canonical column yet, seeded
  # with two settlements whose transaction ids are canonically equal.
  docker exec "$name" psql -U postgres -q -c 'create database canondup' >/dev/null
  run_sql canondup < "${REPO_ROOT}/${ROLE_BOOTSTRAP}" >/dev/null \
    || fail "${image}: canondup role bootstrap failed"
  run_sql canondup < "${REPO_ROOT}/${SEAM_BOOTSTRAP}" >/dev/null \
    || fail "${image}: canondup seam bootstrap failed"
  for f in "${CART_CHAIN[@]}"; do
    run_sql canondup < "${REPO_ROOT}/${f}" >/dev/null \
      || fail "${image}: canondup chain ${f} failed"
  done
  run_sql canondup >/dev/null <<'SQL' || fail "${image}: canondup duplicate-pair seed failed"
insert into public.research_early_access_cart_quotes(quote_id, customer_ref, intent_hash, quote_hash, record, quoted_at, expires_at)
values ('xeaq_lcdupa000000000000000','eac_dddddddddddddddddddddddddddd0001',repeat('1',64),repeat('2',64),'{}',now(),now()+interval '1 day'),
       ('xeaq_lcdupb000000000000000','eac_dddddddddddddddddddddddddddd0002',repeat('1',64),repeat('2',64),'{}',now(),now()+interval '1 day');
insert into public.research_early_access_cart_checkouts(
  checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id, payment_state,
  currency, subtotal_cents, discount_cents, shipping_cents, tax_cents, payable_total_cents, record, placed_at)
values ('XEC-LCDUPA00000000000000','eac_dddddddddddddddddddddddddddd0001',repeat('a',64),repeat('1',64),'xeaq_lcdupa000000000000000','awaiting_payment','USD',100,0,0,0,100,'{}',now()),
       ('XEC-LCDUPB00000000000000','eac_dddddddddddddddddddddddddddd0002',repeat('b',64),repeat('1',64),'xeaq_lcdupb000000000000000','awaiting_payment','USD',100,0,0,0,100,'{}',now());
insert into public.research_early_access_cart_settlements(
  cart_checkout_id, external_transaction_id, reviewed_evidence_ref, verified_amount_cents, verified_currency, actor_id, record, settled_at)
select id,'TX-123','eaext.LaneCDupEvidence00001',100,'USD','drift:rehearsal','{}',clock_timestamp()
  from public.research_early_access_cart_checkouts where checkout_number='XEC-LCDUPA00000000000000';
insert into public.research_early_access_cart_settlements(
  cart_checkout_id, external_transaction_id, reviewed_evidence_ref, verified_amount_cents, verified_currency, actor_id, record, settled_at)
select id,'TX 123','eaext.LaneCDupEvidence00002',100,'USD','drift:rehearsal','{}',clock_timestamp()
  from public.research_early_access_cart_checkouts where checkout_number='XEC-LCDUPB00000000000000';
SQL

  precheck="$(run_sql canondup < "${REPO_ROOT}/${PRECHECK_C}" 2>&1 | tr -d ' ')" || true
  echo "$precheck" | grep -q '"verdict":"STOP_RECONCILE_DUPLICATES"' \
    || fail "${image}: precheck over the duplicate pair did not answer STOP_RECONCILE_DUPLICATES: ${precheck}"
  echo "  precheck over a pre-existing duplicate pair: STOP_RECONCILE_DUPLICATES"

  set +e
  dup_out="$(run_sql canondup < "${REPO_ROOT}/${TARGET_C}" 2>&1)"
  dup_rc=$?
  set -e
  [ "$dup_rc" -ne 0 ] \
    || fail "${image}: target C applied over a pre-existing canonical duplicate pair"
  echo "$dup_out" | grep -q "duplicate canonical transaction forms" \
    || fail "${image}: duplicate-pair apply refused for the wrong reason: ${dup_out}"
  left="$(query canondup "select (not exists(
      select 1 from pg_attribute att
      join pg_class rel on rel.oid=att.attrelid
      join pg_namespace n on n.oid=rel.relnamespace
      where n.nspname='public' and rel.relname='research_early_access_cart_settlements'
        and att.attname='canonical_transaction_id' and att.attnum>0 and not att.attisdropped))::text
    || ',' || (to_regclass('public.research_ea_cart_settlements_canonical_txn_uidx') is null)::text
    || ',' || (select count(*) from public.research_early_access_cart_settlements)::text")"
  [ "$left" = "true,true,2" ] \
    || fail "${image}: the refused apply left something behind or lost a row: ${left}"
  echo "  refused apply left no column, no index, and both settlement rows intact"

  docker rm -f "$name" >/dev/null 2>&1 || true
  trap - EXIT
  echo "  ${image}: PASS"
done

echo
echo "LANE C 2026-08-19 CART REHEARSAL PASS on ${IMAGES[*]}. Production was not connected to or mutated."
