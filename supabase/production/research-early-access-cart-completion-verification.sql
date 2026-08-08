-- Behavioural proof of the Early Access cart schema, run against a disposable
-- database. Every assertion raises an exception on failure, and the whole file
-- runs with ON_ERROR_STOP so psql's exit status is the real result.
-- Run as the owner. The RPCs are SECURITY DEFINER and service_role holds
-- EXECUTE on all of them and SELECT on NONE of the tables, which is proven
-- separately by the privilege matrix; these assertions need to read the tables
-- directly to check what the functions actually wrote.
\set ON_ERROR_STOP on

create or replace function pg_temp.want(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

-- ---------------------------------------------------------------- quote
select pg_temp.want(
  (research_early_access_put_cart_quote(
    'xeaq_behaviour0000000001',
    'eac_'||repeat('a',32),
    repeat('1',64),
    repeat('2',64),
    jsonb_build_object('publicQuote', jsonb_build_object('quoteId','xeaq_behaviour0000000001'), 'customerRef','eac_'||repeat('a',32)),
    '2026-08-08T10:00:00Z','2026-08-08T10:30:00Z')->>'stored') = 'true',
  'a quote persists durably');

select pg_temp.want(
  research_early_access_cart_quote_record('xeaq_behaviour0000000001') is not null,
  'the persisted quote reads back');

-- The quote created NO checkout fact.
select pg_temp.want(
  (select count(*) from public.research_early_access_cart_checkouts) = 0,
  'a quote creates zero durable checkout facts');

-- ------------------------------------------------------- atomic checkout
\set chk '''XEC-BEHAVIOUR0000000001'''
\set key '''xeac_behaviour0000000001'''

with args as (
  select
    jsonb_build_object(
      'cartCheckoutNumber', :chk,
      'customerRef', 'eac_'||repeat('a',32),
      'idempotencyKey', :key,
      'intentHash', repeat('1',64),
      'quoteId','xeaq_behaviour0000000001',
      'paymentState','awaiting_payment',
      'placedAt','2026-08-08T10:05:00Z',
      'contact', jsonb_build_object('email','buyer@example.com','phone','+15125550100'),
      'shipTo', jsonb_build_object('recipientName','A Buyer','line1','1 Test St','line2',null,'city','Houston','region','TX','postalCode','77002','country','US'),
      'invoice', jsonb_build_object('currency','USD','subtotalCents',30000,'discountCents',5000,'shippingCents',0,'taxCents',0,'payableTotalCents',25000)
    ) as checkout,
    jsonb_build_array(
      jsonb_build_object('lineIndex',0,'orderNumber','XEA-CART-BEH00001-01','productId','P1','variantId','V1','sku','S1','quantity',1,'supplierId','supplier-apex','supplierSku','APEX-1','unitPriceCents',10000,'subtotalCents',10000,'discountCents',0,'payableCents',10000),
      jsonb_build_object('lineIndex',1,'orderNumber','XEA-CART-BEH00001-02','productId','P2','variantId','V2','sku','S2','quantity',2,'supplierId','supplier-renew360','supplierSku','R360-2','unitPriceCents',10000,'subtotalCents',20000,'discountCents',5000,'payableCents',15000)
    ) as items,
    jsonb_build_object(
      'invoiceNumber','XEI-BEHAVIOUR0000000001',
      'cartCheckoutNumber', :chk,
      'paymentReference','XEACART-BEHAVIOUR0000000001',
      'currency','USD','subtotalCents',30000,'discountCents',5000,'shippingCents',0,'taxCents',0,
      'payableTotalCents',25000,'status','awaiting_payment','issuedAt','2026-08-08T10:05:00Z'
    ) as invoice
)
select pg_temp.want(
  (research_early_access_commit_cart_checkout(checkout, items, invoice, :key, '2026-08-08T10:05:00Z')->>'committed') = 'true',
  'the cart commits atomically')
from args;

select pg_temp.want((select count(*) from public.research_early_access_cart_checkouts) = 1, 'exactly ONE parent checkout');
select pg_temp.want((select count(*) from public.research_early_access_cart_items) = 2, 'ALL child lines were written');
select pg_temp.want((select count(*) from public.research_early_access_cart_invoices) = 1, 'exactly ONE invoice');
select pg_temp.want(
  (select count(distinct payment_reference) from public.research_early_access_cart_invoices) = 1,
  'exactly ONE payment reference for the whole cart');

-- ------------------------------------------------------------ idempotency
select pg_temp.want(
  research_early_access_cart_checkout_for_key(:key) is not null,
  'the checkout is found by its idempotency key');

-- Replaying the SAME key must not create a second parent.
with args as (
  select jsonb_build_object(
      'cartCheckoutNumber','XEC-BEHAVIOUR0000000002',
      'customerRef','eac_'||repeat('a',32),
      'idempotencyKey', :key,
      'intentHash', repeat('1',64),
      'quoteId','xeaq_behaviour0000000001',
      'paymentState','awaiting_payment','placedAt','2026-08-08T10:06:00Z',
      'contact', jsonb_build_object('email','buyer@example.com','phone','+15125550100'),
      'shipTo', jsonb_build_object('recipientName','A Buyer','line1','1 Test St','line2',null,'city','Houston','region','TX','postalCode','77002','country','US'),
      'invoice', jsonb_build_object('currency','USD','subtotalCents',30000,'discountCents',5000,'shippingCents',0,'taxCents',0,'payableTotalCents',25000)
    ) as checkout,
    jsonb_build_array(
      jsonb_build_object('lineIndex',0,'orderNumber','XEA-CART-BEH00002-01','productId','P1','variantId','V1','sku','S1','quantity',1,'supplierId','supplier-apex','supplierSku','APEX-1','unitPriceCents',10000,'subtotalCents',10000,'discountCents',0,'payableCents',10000)
    ) as items,
    jsonb_build_object('invoiceNumber','XEI-BEHAVIOUR0000000002','cartCheckoutNumber','XEC-BEHAVIOUR0000000002','paymentReference','XEACART-BEHAVIOUR0000000002','currency','USD','subtotalCents',30000,'discountCents',5000,'shippingCents',0,'taxCents',0,'payableTotalCents',25000,'status','awaiting_payment','issuedAt','2026-08-08T10:06:00Z') as invoice
)
select pg_temp.want(
  (research_early_access_commit_cart_checkout(checkout, items, invoice, :key, '2026-08-08T10:06:00Z')->>'reason') = 'idempotency_key_taken',
  'the same key under a second cart is refused')
from args;

select pg_temp.want((select count(*) from public.research_early_access_cart_checkouts) = 1, 'the refused replay wrote NO second parent');
select pg_temp.want((select count(*) from public.research_early_access_cart_items) = 2, 'the refused replay wrote NO extra child');
select pg_temp.want((select count(*) from public.research_early_access_cart_invoices) = 1, 'the refused replay wrote NO second invoice');

-- ------------------------------------------- FORCED MID-TRANSACTION FAILURE
-- The third child collides with a child that already exists, so the function
-- fails only AFTER two of its three children would otherwise have been
-- written. Nothing of the attempt may survive.
do $$
declare
  failed boolean := false;
begin
  begin
    perform research_early_access_commit_cart_checkout(
      jsonb_build_object(
        'cartCheckoutNumber','XEC-PARTIAL000000000001',
        'customerRef','eac_'||repeat('b',32),
        'idempotencyKey','xeac_partial00000000001',
        'intentHash', repeat('3',64),
        'quoteId','xeaq_behaviour0000000001',
        'paymentState','awaiting_payment','placedAt','2026-08-08T10:07:00Z',
        'contact', jsonb_build_object('email','other@example.com','phone','+15125550101'),
        'shipTo', jsonb_build_object('recipientName','B Buyer','line1','2 Test St','line2',null,'city','Houston','region','TX','postalCode','77002','country','US'),
        'invoice', jsonb_build_object('currency','USD','subtotalCents',30000,'discountCents',5000,'shippingCents',0,'taxCents',0,'payableTotalCents',25000)
      ),
      jsonb_build_array(
        jsonb_build_object('lineIndex',0,'orderNumber','XEA-CART-PARTIAL-01','productId','P1','variantId','V1','sku','S1','quantity',1,'supplierId','supplier-apex','supplierSku','APEX-1','unitPriceCents',10000,'subtotalCents',10000,'discountCents',0,'payableCents',10000),
        jsonb_build_object('lineIndex',1,'orderNumber','XEA-CART-PARTIAL-02','productId','P2','variantId','V2','sku','S2','quantity',1,'supplierId','supplier-apex','supplierSku','APEX-2','unitPriceCents',10000,'subtotalCents',10000,'discountCents',0,'payableCents',10000),
        -- collides with the FIRST cart's child, after two would have landed
        jsonb_build_object('lineIndex',2,'orderNumber','XEA-CART-BEH00001-01','productId','P3','variantId','V3','sku','S3','quantity',1,'supplierId','supplier-apex','supplierSku','APEX-3','unitPriceCents',10000,'subtotalCents',10000,'discountCents',0,'payableCents',10000)
      ),
      jsonb_build_object('invoiceNumber','XEI-PARTIAL000000000001','cartCheckoutNumber','XEC-PARTIAL000000000001','paymentReference','XEACART-PARTIAL000000000001','currency','USD','subtotalCents',30000,'discountCents',5000,'shippingCents',0,'taxCents',0,'payableTotalCents',25000,'status','awaiting_payment','issuedAt','2026-08-08T10:07:00Z'),
      'xeac_partial00000000001',
      '2026-08-08T10:07:00Z'
    );
  exception when others then
    failed := true;
  end;
  raise notice 'forced mid-transaction outcome: raised=%', failed;
end $$;

select pg_temp.want((select count(*) from public.research_early_access_cart_checkouts where checkout_number='XEC-PARTIAL000000000001') = 0, 'ATOMICITY: no parent checkout survived the failed cart');
select pg_temp.want((select count(*) from public.research_early_access_cart_items where order_number like 'XEA-CART-PARTIAL-%') = 0, 'ATOMICITY: no child line survived the failed cart');
select pg_temp.want((select count(*) from public.research_early_access_cart_invoices where invoice_number='XEI-PARTIAL000000000001') = 0, 'ATOMICITY: no invoice survived the failed cart');
select pg_temp.want((select count(*) from public.research_early_access_cart_settlements) = 0, 'ATOMICITY: no settlement survived the failed cart');
select pg_temp.want((select count(*) from public.research_early_access_cart_receipts) = 0, 'ATOMICITY: no receipt survived the failed cart');
select pg_temp.want((select count(*) from public.research_early_access_cart_child_releases) = 0, 'ATOMICITY: no supplier release survived the failed cart');
select pg_temp.want((select count(*) from public.research_early_access_cart_supplier_outbox) = 0, 'ATOMICITY: no supplier outbox row survived the failed cart');
-- and the untouched first cart is exactly as it was
select pg_temp.want((select count(*) from public.research_early_access_cart_checkouts) = 1, 'ATOMICITY: the earlier cart is intact');
select pg_temp.want((select count(*) from public.research_early_access_cart_items) = 2, 'ATOMICITY: the earlier cart kept exactly its own children');

-- ------------------------------------------------- proof is not payment
select pg_temp.want(
  (research_early_access_record_cart_external_proof(jsonb_build_object(
     'evidenceRef','eaext.behaviour00000001',
     'cartCheckoutNumber','XEC-BEHAVIOUR0000000001',
     'sha256', repeat('a',64),
     'filename','wire.pdf','contentType','application/pdf','byteSize',1024,
     'provenanceNote','Received by email and checked against the bank record.',
     'recordedAt','2026-08-08T10:08:00Z','recordedBy','named.operator@xeniostechnology.com',
     'storedOnPlatform', false))->>'committed') = 'true',
  'external proof metadata is recorded');

select pg_temp.want((select count(*) from public.research_early_access_cart_settlements) = 0, 'PROOF IS NOT PAYMENT: still no settlement');
select pg_temp.want((select count(*) from public.research_early_access_cart_receipts) = 0, 'PROOF IS NOT PAYMENT: still no receipt');
select pg_temp.want((select count(*) from public.research_early_access_cart_child_releases) = 0, 'PROOF IS NOT PAYMENT: still no supplier release');
select pg_temp.want(
  ((research_early_access_cart_status('XEC-BEHAVIOUR0000000001')->'payment')->>'paid') = 'false',
  'PROOF IS NOT PAYMENT: status still says unpaid');

-- ------------------------------------------------------------- settlement
select pg_temp.want(
  (research_early_access_commit_cart_settlement(
     'XEC-BEHAVIOUR0000000001','WIRE-BEHAVIOUR-001','eaext.behaviour00000001',
     25000,'USD','named.operator@xeniostechnology.com','2026-08-08T10:09:00Z')->>'committed') = 'true',
  'a named admin settles the cart');

select pg_temp.want((select count(*) from public.research_early_access_cart_settlements) = 1, 'exactly ONE settlement');
select pg_temp.want((select count(*) from public.research_early_access_cart_receipts) = 1, 'exactly ONE receipt');
select pg_temp.want((select count(*) from public.research_early_access_cart_child_releases) = 2, 'EVERY child released, one release each');
select pg_temp.want(
  (select count(distinct supplier_id) from public.research_early_access_cart_child_releases) = 2,
  'MIXED SUPPLIERS: each child kept its own real supplier');
select pg_temp.want(
  (select count(*) from public.research_early_access_cart_supplier_outbox) >= 1,
  'the supplier outbox received the release');
select pg_temp.want(
  (select count(*) from public.research_early_access_cart_child_releases where supplier_sku is null or supplier_sku = '') = 0,
  'no supplier SKU was invented or blanked to make grouping succeed');

-- retry is the same settlement, with no duplicates
select pg_temp.want(
  (research_early_access_commit_cart_settlement(
     'XEC-BEHAVIOUR0000000001','WIRE-BEHAVIOUR-001','eaext.behaviour00000001',
     25000,'USD','named.operator@xeniostechnology.com','2026-08-08T10:10:00Z')->>'reason') = 'already_settled',
  'a settlement RETRY is refused as already settled');
select pg_temp.want((select count(*) from public.research_early_access_cart_settlements) = 1, 'RETRY: still exactly one settlement');
select pg_temp.want((select count(*) from public.research_early_access_cart_receipts) = 1, 'RETRY: no second receipt');
select pg_temp.want((select count(*) from public.research_early_access_cart_child_releases) = 2, 'RETRY: no duplicate child release');
select pg_temp.want(
  (select count(*) from public.research_early_access_cart_supplier_outbox) =
  (select count(*) from public.research_early_access_cart_child_releases),
  'RETRY: no duplicate supplier outbox entry');
select pg_temp.want(
  (research_early_access_cart_settlement('XEC-BEHAVIOUR0000000001')->>'settledBy') = 'named.operator@xeniostechnology.com',
  'the settlement records the NAMED actor who made it');

-- ---------------------------------------------------- ownership isolation
select pg_temp.want(
  (research_early_access_cart_checkout_for_number('XEC-BEHAVIOUR0000000001')->>'customerRef') = 'eac_'||repeat('a',32),
  'the checkout carries the owning customer reference the server re-checks');
select pg_temp.want(
  research_early_access_cart_checkout_for_number('XEC-NOSUCHCART0000000001') is null,
  'a checkout number that does not exist reads as null');

-- ------------------------------------------- F2: zero commission events
-- The commission and referral tables DO exist here: they belong to migration
-- 51, the pre-existing single-product referral lane, and predate the cart
-- entirely. The claim under test is therefore not that they are absent, it is
-- that a COMPLETE cart settlement wrote nothing into them. That is the honest
-- version of the question, and it is checked by counting rows after the cart
-- was settled above, not by reading a flag.
select pg_temp.want(
  (select count(*) from public.research_early_access_commission_events) = 0,
  'F2: the settled cart created ZERO commission events');
select pg_temp.want(
  (select count(*) from public.research_early_access_referral_grants) = 0,
  'F2: the settled cart created ZERO referral grants');
select pg_temp.want(
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname like '%affiliate%') = 0,
  'F2: the affiliate v2 platform (migration 59) is absent, as required');

\echo 'ALL BEHAVIOURAL ASSERTIONS PASSED'
