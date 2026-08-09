-- M62 managed-shape behavioral verification. Disposable databases only.
-- ON_ERROR_STOP must be enabled by the caller.

create or replace function pg_temp.want(ok boolean,label text) returns void
language plpgsql as $$ begin
  if ok then raise notice 'PASS  %',label;
  else raise exception 'FAIL  %',label;
  end if;
end $$;

create or replace function pg_temp.seed_checkout(
  p_suffix text,p_customer text,p_amount bigint
) returns text language plpgsql as $$
declare
  v_quote text := 'xeaq_m62' || lower(p_suffix) || repeat('0',greatest(0,18-length(p_suffix)));
  v_checkout text := 'XEC-M62' || upper(p_suffix) || repeat('0',greatest(0,18-length(p_suffix)));
  v_order text := 'XEA-CART-M62-' || upper(p_suffix) || '-01';
  v_invoice text := 'XEI-M62' || upper(p_suffix) || repeat('0',greatest(0,18-length(p_suffix)));
  v_reference text := 'XEACART-M62' || upper(p_suffix) || repeat('0',greatest(0,16-length(p_suffix)));
begin
  insert into public.research_early_access_cart_quotes(
    quote_id,customer_ref,intent_hash,quote_hash,record,quoted_at,expires_at
  ) values (
    v_quote,p_customer,repeat('1',64),repeat('2',64),'{}',clock_timestamp(),clock_timestamp()+interval '1 day'
  );
  insert into public.research_early_access_cart_checkouts(
    checkout_number,customer_ref,idempotency_key_hash,intent_hash,quote_id,payment_state,
    currency,subtotal_cents,discount_cents,shipping_cents,tax_cents,payable_total_cents,record,placed_at
  ) values (
    v_checkout,p_customer,encode(extensions.digest(convert_to(v_checkout,'utf8'),'sha256'),'hex'),repeat('1',64),v_quote,
    'awaiting_payment','USD',p_amount,0,0,0,p_amount,
    jsonb_build_object('cartCheckoutNumber',v_checkout,'customerRef',p_customer,'shipTo',jsonb_build_object('country','US')),
    clock_timestamp()
  );
  insert into public.research_early_access_cart_items(
    cart_checkout_id,line_index,order_number,product_id,variant_id,sku,quantity,supplier_id,supplier_sku,
    unit_price_cents,subtotal_cents,discount_cents,payable_cents,record
  ) select id,0,v_order,'product-m62','variant-m62','SKU-M62',1,'supplier-m62','SUP-M62',
           p_amount,p_amount,0,p_amount,jsonb_build_object('orderNumber',v_order,'supplierId','supplier-m62')
      from public.research_early_access_cart_checkouts where checkout_number=v_checkout;
  insert into public.research_early_access_cart_invoices(
    cart_checkout_id,invoice_number,payment_reference,currency,subtotal_cents,discount_cents,
    shipping_cents,tax_cents,payable_total_cents,record,issued_at
  ) select id,v_invoice,v_reference,'USD',p_amount,0,0,0,p_amount,
           jsonb_build_object('invoiceNumber',v_invoice,'paymentReference',v_reference),clock_timestamp()
      from public.research_early_access_cart_checkouts where checkout_number=v_checkout;
  return v_checkout;
end $$;

select pg_temp.want(
  to_regprocedure('public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,timestamptz)') is null,
  'the unhardened seven-argument settlement RPC is gone');
select pg_temp.want(
  not has_function_privilege('service_role','public.research_early_access_commit_cart_settlement_m60_core(text,text,text,bigint,text,text,timestamptz)','execute'),
  'the exact M60 core is private');
select pg_temp.want(
  has_function_privilege('service_role','public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,boolean,boolean,timestamptz)','execute'),
  'one hardened settlement RPC is service reachable');

select pg_temp.want(
  (select count(*)=7 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'research_early_access_legal_bindings','research_early_access_agreement_packages',
      'research_early_access_agreement_attestations','research_early_access_proof_submissions',
      'research_early_access_cart_transaction_ids','research_early_access_cart_settlement_hardening',
      'research_early_access_cart_fulfilment_events') and c.relrowsecurity and c.relforcerowsecurity),
  'all seven M62 tables have forced RLS');
select pg_temp.want(
  not exists(
    select 1 from information_schema.role_table_grants
     where table_schema='public' and table_name like 'research_early_access_%'
       and grantee in ('PUBLIC','anon','authenticated','service_role')
       and table_name in (
         'research_early_access_legal_bindings','research_early_access_agreement_packages',
         'research_early_access_agreement_attestations','research_early_access_proof_submissions',
         'research_early_access_cart_transaction_ids','research_early_access_cart_settlement_hardening',
         'research_early_access_cart_fulfilment_events')),
  'M62 exposes no direct table privilege');
select pg_temp.want(
  not exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='research_early_access_proof_submissions'
      and (data_type='bytea' or column_name ~ '(object|path|base64|bytes|body|payload)')),
  'proof submissions have no bytes, base64, object path or payload column');
select pg_temp.want(
  not exists(
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'digest'
  ),
  'public pgcrypto digest overloads remain absent');

select pg_temp.seed_checkout('PRIMARY','eac_'||repeat('a',32),25000) as checkout_primary \gset

select pg_temp.want(
  (public.research_early_access_commit_cart_settlement(
    :'checkout_primary','WIRE-M62-001','eaext.M62PrimaryEvidence01',25000,'USD','admin@example.com',true,true,'2000-01-01T00:00:00Z'
  )->>'reason')='agreements_not_current',
  'settlement fails closed while no current package exists');

select pg_temp.want(
  (public.research_early_access_record_legal_binding(jsonb_build_object(
    'customerRef','eac_'||repeat('a',32),'memberId','11111111-1111-1111-1111-111111111111',
    'establishedBy','verified_link','verifiedAt','2026-08-09T10:00:00Z','attestedBy',null,'aliasRefs',jsonb_build_array()
  ))->>'recorded')='true','verified legal binding is durable');

select pg_temp.want(
  (public.research_early_access_register_agreement_package(jsonb_build_object(
    'packageId','ea-package','packageVersion',repeat('a',24),'supersedesPackageVersion',null,
    'requirements',jsonb_build_array(
      jsonb_build_object('category','manual_payment_bridge_terms','documentVersionId','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'semver','1.0.0','requiresSeparateAcknowledgment',false,'ordering',1),
      jsonb_build_object('category','arbitration_agreement','documentVersionId','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'semver','1.0.0','requiresSeparateAcknowledgment',true,'ordering',2)
    )
  ),'legal:test')->>'recorded')='true','versioned package snapshot is recorded without seed data');

select pg_temp.want(
  (public.research_early_access_record_agreement_attestation(jsonb_build_object(
    'attestationId','eaa_primary_attestation_0001','cartCheckoutNumber',:'checkout_primary',
    'memberId','11111111-1111-1111-1111-111111111111','packageId','ea-package','packageVersion',repeat('a',24),
    'signedAt',jsonb_build_object('manual_payment_bridge_terms','2026-08-09T10:01:00Z','arbitration_agreement','2026-08-09T10:02:00Z')
  ),'legal:test')->>'recorded')='true','attestation stores real per-category signature timestamps');

select pg_temp.want(
  (public.research_early_access_begin_proof_submission(jsonb_build_object(
    'submissionId','eas_primary_submission_0001','cartCheckoutNumber',:'checkout_primary',
    'memberId','11111111-1111-1111-1111-111111111111',
    'method',jsonb_build_object('code','wire_transfer','methodName','Wire transfer','registryVersion','registry-v1','presentedAt','2026-08-09T10:03:00Z'),
    'filename','payment.pdf','contentType','application/pdf','byteSize',1024,'proofSha256',repeat('c',64),'packageVersion',repeat('a',24)
  ),'eask_primary_submission_0001')->>'recorded')='true','one metadata-only submission identity is reserved');

select pg_temp.want(
  (public.research_early_access_begin_proof_submission(jsonb_build_object(
    'submissionId','eas_other_submission_0000001','cartCheckoutNumber',:'checkout_primary',
    'memberId','11111111-1111-1111-1111-111111111111',
    'method',jsonb_build_object('code','wire_transfer','methodName','Wire transfer','registryVersion','registry-v1','presentedAt','2026-08-09T10:03:00Z'),
    'filename','other.pdf','contentType','application/pdf','byteSize',1024,'proofSha256',repeat('d',64),'packageVersion',repeat('a',24)
  ),'eask_other_submission_0000001')->>'reason')='submission_exists',
  'a checkout cannot acquire a second submission identity');

select pg_temp.want(
  (public.research_early_access_submission_customer_view(:'checkout_primary') ?&
    array['state','method','methodLabel','filename','acceptedAt','retryAllowed'])
  and not (public.research_early_access_submission_customer_view(:'checkout_primary') ?|
    array['submissionKey','internalRecipient','providerMessageId','lastError','proofSha256','memberId']),
  'customer submission projection contains only customer-safe keys');
select pg_temp.want(
  public.research_early_access_submission_admin_view(:'checkout_primary') ?&
    array['submissionKey','internalRecipient','providerMessageId','lastError','proofSha256','memberId'],
  'admin submission projection is a separate operational view');

select pg_temp.want(
  (public.research_early_access_commit_cart_settlement(
    :'checkout_primary','WIRE-M62-001','eaext.M62PrimaryEvidence01',25000,'USD','admin@example.com',true,true,'2000-01-01T00:00:00Z'
  )->>'reason')='submission_missing','pending submission cannot settle');

select public.research_early_access_confirm_submission_email(
  'eas_primary_submission_0001','eask_primary_submission_0001','unknown',null,'provider accepted; confirm write unknown');
select pg_temp.want(
  (public.research_early_access_commit_cart_settlement(
    :'checkout_primary','WIRE-M62-001','eaext.M62PrimaryEvidence01',25000,'USD','admin@example.com',true,true,'2000-01-01T00:00:00Z'
  )->>'reason')='submission_unreconciled','unknown provider acceptance cannot settle');

select public.research_early_access_confirm_submission_email(
  'eas_primary_submission_0001','eask_primary_submission_0001','accepted','provider-message-m62-1',null);
select pg_temp.want(
  (public.research_early_access_commit_cart_settlement(
    :'checkout_primary','WIRE-M62-001','eaext.M62PrimaryEvidence01',25000,'USD','admin@example.com',false,true,'2000-01-01T00:00:00Z'
  )->>'reason')='admin_confirmation_missing','both named-admin confirmations are required');

select public.research_early_access_record_cart_external_proof(jsonb_build_object(
  'cartCheckoutNumber',:'checkout_primary','evidenceRef','eaext.M62PrimaryEvidence01','sha256',repeat('c',64),
  'filename','payment.pdf','contentType','application/pdf','byteSize',1024,'provenanceNote','received by disposable harness',
  'recordedBy','admin@example.com','recordedAt','2026-08-09T10:04:00Z'));

select pg_temp.want(
  (public.research_early_access_commit_cart_settlement(
    :'checkout_primary',null::text,'eaext.M62PrimaryEvidence01',25000,'USD','admin@example.com',true,true,'2000-01-01T00:00:00Z'
  )->>'reason')='input_invalid','null transaction identity is refused explicitly');

select pg_temp.want(
  (public.research_early_access_commit_cart_settlement(
    :'checkout_primary','WIRE-M62-001','eaext.M62PrimaryEvidence01',25000,'USD','admin@example.com',true,true,'2000-01-01T00:00:00Z'
  )->>'committed')='true','the hardened wrapper commits through the exact M60 core');
select pg_temp.want((select count(*)=1 from public.research_early_access_cart_settlements c
  join public.research_early_access_cart_checkouts o on o.id=c.cart_checkout_id where o.checkout_number=:'checkout_primary'),
  'one settlement exists');
select pg_temp.want((select count(*)=1 from public.research_early_access_cart_receipts r
  join public.research_early_access_cart_checkouts o on o.id=r.cart_checkout_id where o.checkout_number=:'checkout_primary'),
  'one receipt exists');
select pg_temp.want((select count(*)=1 from public.research_early_access_cart_child_releases r
  join public.research_early_access_cart_checkouts o on o.id=r.cart_checkout_id where o.checkout_number=:'checkout_primary'),
  'the expected child release exists');
select pg_temp.want((select ship_by_at=payment_verified_at+interval '72 hours'
  and payment_verified_at>'2026-01-01'::timestamptz
  from public.research_early_access_cart_settlement_hardening h
  join public.research_early_access_cart_checkouts c on c.id=h.cart_checkout_id
  where c.checkout_number=:'checkout_primary'),
  'shipByAt is DB verification time plus exactly 72 hours and ignores caller p_at');
select pg_temp.want((select confirmed_funds_received and confirmed_amount_and_reference and actor_id='admin@example.com'
  from public.research_early_access_cart_settlement_hardening h
  join public.research_early_access_cart_checkouts c on c.id=h.cart_checkout_id
  where c.checkout_number=:'checkout_primary'),
  'named admin facts persist with settlement metadata');
select pg_temp.want(
  (public.research_early_access_commit_cart_settlement(
    :'checkout_primary','WIRE-M62-OTHER','eaext.M62PrimaryEvidence01',25000,'USD','admin@example.com',true,true,clock_timestamp()
  )->>'reason')='already_settled','settlement replay preserves the existing M60 refusal');

-- Append-only package drift and reacceptance on the same founder-compatible checkout.
select pg_temp.seed_checkout('SECONDARY','eac_'||repeat('b',32),18000) as checkout_secondary \gset
select public.research_early_access_record_legal_binding(jsonb_build_object(
  'customerRef','eac_'||repeat('b',32),'memberId','22222222-2222-2222-2222-222222222222',
  'establishedBy','verified_link','verifiedAt','2026-08-09T11:00:00Z','attestedBy',null,'aliasRefs',jsonb_build_array()));
select public.research_early_access_record_agreement_attestation(jsonb_build_object(
  'attestationId','eaa_secondary_attestation_01','cartCheckoutNumber',:'checkout_secondary',
  'memberId','22222222-2222-2222-2222-222222222222','packageId','ea-package','packageVersion',repeat('a',24),
  'signedAt',jsonb_build_object('manual_payment_bridge_terms','2026-08-09T11:01:00Z','arbitration_agreement','2026-08-09T11:02:00Z')),'legal:test');

select public.research_early_access_register_agreement_package(jsonb_build_object(
  'packageId','ea-package','packageVersion',repeat('b',24),'supersedesPackageVersion',repeat('a',24),
  'requirements',jsonb_build_array(
    jsonb_build_object('category','manual_payment_bridge_terms','documentVersionId','cccccccc-cccc-cccc-cccc-cccccccccccc',
      'semver','2.0.0','requiresSeparateAcknowledgment',false,'ordering',1),
    jsonb_build_object('category','arbitration_agreement','documentVersionId','dddddddd-dddd-dddd-dddd-dddddddddddd',
      'semver','2.0.0','requiresSeparateAcknowledgment',true,'ordering',2))) ,'legal:test');
select pg_temp.want(
  (public.research_early_access_begin_proof_submission(jsonb_build_object(
    'submissionId','eas_secondary_submission_01','cartCheckoutNumber',:'checkout_secondary',
    'memberId','22222222-2222-2222-2222-222222222222',
    'method',jsonb_build_object('code','wire_transfer','methodName','Wire transfer','registryVersion','registry-v2','presentedAt','2026-08-09T11:03:00Z'),
    'filename','second.pdf','contentType','application/pdf','byteSize',2048,'proofSha256',repeat('e',64),'packageVersion',repeat('a',24)
  ),'eask_secondary_submission_01')->>'reason')='agreements_not_current',
  'old package attestation cannot satisfy a newly-current version');

select public.research_early_access_record_agreement_attestation(jsonb_build_object(
  'attestationId','eaa_secondary_attestation_02','cartCheckoutNumber',:'checkout_secondary',
  'memberId','22222222-2222-2222-2222-222222222222','packageId','ea-package','packageVersion',repeat('b',24),
  'signedAt',jsonb_build_object('manual_payment_bridge_terms','2026-08-09T11:04:00Z','arbitration_agreement','2026-08-09T11:05:00Z')),'legal:test');
select pg_temp.want((select count(*)=2 and count(supersedes_attestation_id)=1
  from public.research_early_access_agreement_attestations a
  join public.research_early_access_cart_checkouts c on c.id=a.cart_checkout_id
  where c.checkout_number=:'checkout_secondary'),
  'reacceptance appends and supersedes without rewriting the old attestation');

select public.research_early_access_begin_proof_submission(jsonb_build_object(
  'submissionId','eas_secondary_submission_01','cartCheckoutNumber',:'checkout_secondary',
  'memberId','22222222-2222-2222-2222-222222222222',
  'method',jsonb_build_object('code','wire_transfer','methodName','Wire transfer','registryVersion','registry-v2','presentedAt','2026-08-09T11:06:00Z'),
  'filename','second.pdf','contentType','application/pdf','byteSize',2048,'proofSha256',repeat('e',64),'packageVersion',repeat('b',24)
),'eask_secondary_submission_01');
select public.research_early_access_confirm_submission_email(
  'eas_secondary_submission_01','eask_secondary_submission_01','accepted','provider-message-m62-2',null);
select public.research_early_access_record_cart_external_proof(jsonb_build_object(
  'cartCheckoutNumber',:'checkout_secondary','evidenceRef','eaext.M62SecondaryEvidence1','sha256',repeat('e',64),
  'filename','second.pdf','contentType','application/pdf','byteSize',2048,'provenanceNote','received by disposable harness',
  'recordedBy','admin@example.com','recordedAt','2026-08-09T11:07:00Z'));
select pg_temp.want(
  (public.research_early_access_commit_cart_settlement(
    :'checkout_secondary','  wire-m62-001  ','eaext.M62SecondaryEvidence1',18000,'USD','admin@example.com',true,true,clock_timestamp()
  )->>'reason')='transaction_id_duplicate_canonical',
  'case and whitespace variants cannot reuse one canonical transaction id');
select pg_temp.want(
  (public.research_early_access_commit_cart_settlement(
    :'checkout_secondary','WIRE-M62-002','eaext.M62SecondaryEvidence1',18000,'USD','admin@example.com',true,true,clock_timestamp()
  )->>'committed')='true',
  'the pre-M62 checkout crosses new gates without a new checkout or invoice');
select pg_temp.want((select count(*)=1 from public.research_early_access_cart_checkouts where checkout_number=:'checkout_secondary'),
  'founder compatibility preserves the checkout identity');

select public.research_early_access_record_cart_fulfilment_event(jsonb_build_object(
  'cartCheckoutNumber',:'checkout_secondary','orderNumber','XEA-CART-M62-SECONDARY-01',
  'eventType','tracking_added','metadata',jsonb_build_object('tracking','TRACK-OLD')),'ops:test') as tracking_event \gset
select pg_temp.want((:'tracking_event'::jsonb->>'recorded')='true','append-only tracking event is recorded after settlement');
select pg_temp.want(
  (public.research_early_access_record_cart_fulfilment_event(jsonb_build_object(
    'cartCheckoutNumber',:'checkout_secondary','orderNumber','XEA-CART-M62-SECONDARY-01',
    'eventType','tracking_corrected','supersedesEventId',(:'tracking_event'::jsonb->>'eventId'),
    'metadata',jsonb_build_object('tracking','TRACK-NEW')),'ops:test')->>'recorded')='true',
  'tracking correction is a new superseding event');

do $$ declare refused boolean:=false; begin
  begin update public.research_early_access_agreement_attestations set package_id='rewrite' where attestation_id='eaa_secondary_attestation_01';
  exception when sqlstate '55000' then refused:=true; end;
  perform pg_temp.want(refused,'agreement attestations reject update');
end $$;

select pg_temp.want(
  not exists(select 1 from public.research_early_access_cart_events where event_type not in (
    'quote_created','checkout_created','proof_recorded','payment_verified','child_release_created',
    'shipment_updated','payment_rejected','checkout_superseded')),
  'M62 preserved the existing cart event vocabulary');

-- Ready one final checkout for the shell-level six-way concurrency probe.
select pg_temp.seed_checkout('CONCURRENT','eac_'||repeat('c',32),12000) as checkout_concurrent \gset
select public.research_early_access_record_legal_binding(jsonb_build_object(
  'customerRef','eac_'||repeat('c',32),'memberId','33333333-3333-3333-3333-333333333333',
  'establishedBy','verified_link','verifiedAt','2026-08-09T12:00:00Z','attestedBy',null,'aliasRefs',jsonb_build_array()));
select public.research_early_access_record_agreement_attestation(jsonb_build_object(
  'attestationId','eaa_concurrent_attestation_01','cartCheckoutNumber',:'checkout_concurrent',
  'memberId','33333333-3333-3333-3333-333333333333','packageId','ea-package','packageVersion',repeat('b',24),
  'signedAt',jsonb_build_object('manual_payment_bridge_terms','2026-08-09T12:01:00Z','arbitration_agreement','2026-08-09T12:02:00Z')),'legal:test');
select public.research_early_access_begin_proof_submission(jsonb_build_object(
  'submissionId','eas_concurrent_submission_01','cartCheckoutNumber',:'checkout_concurrent',
  'memberId','33333333-3333-3333-3333-333333333333',
  'method',jsonb_build_object('code','wire_transfer','methodName','Wire transfer','registryVersion','registry-v2','presentedAt','2026-08-09T12:03:00Z'),
  'filename','concurrent.pdf','contentType','application/pdf','byteSize',4096,'proofSha256',repeat('f',64),'packageVersion',repeat('b',24)
),'eask_concurrent_submission_01');
select public.research_early_access_confirm_submission_email(
  'eas_concurrent_submission_01','eask_concurrent_submission_01','accepted','provider-message-m62-3',null);
select public.research_early_access_record_cart_external_proof(jsonb_build_object(
  'cartCheckoutNumber',:'checkout_concurrent','evidenceRef','eaext.M62ConcurrentEvid01','sha256',repeat('f',64),
  'filename','concurrent.pdf','contentType','application/pdf','byteSize',4096,'provenanceNote','received by disposable harness',
  'recordedBy','admin@example.com','recordedAt','2026-08-09T12:04:00Z'));

\echo 'ALL M62 HARDENING ASSERTIONS PASSED'
