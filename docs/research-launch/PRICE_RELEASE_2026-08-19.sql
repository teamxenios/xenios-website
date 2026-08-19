-- CONTROLLED PRICE RELEASE 2026-08-19 (founder directive: retail price book)
-- 34 exact-matched variants move to the approved retail schedule through the
-- canonical Product Control price-version RPCs (create draft -> approve, which
-- supersedes the previous active member price and appends audit rows).
-- One transaction: all 34 or none. The 5 unmapped book rows are excluded.
do $$
declare
  v_actor text := 'founder-directive-2026-08-19-retail-price-book';
  v_at timestamptz := now();
  v_price_id uuid;
begin
  -- XRUO-027: AOD-9604 AOD-9604 5 mg: 5600 -> 4900 cents
  perform public.research_admin_create_product_price(
    'c5b471c3-fadd-476d-94c6-b3213141ea63'::uuid,
    jsonb_build_object(
      'variantId', 'f51fe137-1784-4a3d-b093-39a9c42204c6',
      'audience', 'member',
      'amountCents', 4900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-027); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = 'f51fe137-1784-4a3d-b093-39a9c42204c6'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'c5b471c3-fadd-476d-94c6-b3213141ea63'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-028: Aod-9604 AOD-9604 10 mg: 18125 -> 8900 cents
  perform public.research_admin_create_product_price(
    'c5b471c3-fadd-476d-94c6-b3213141ea63'::uuid,
    jsonb_build_object(
      'variantId', '60661393-b16d-4860-af28-b0ab5023f756',
      'audience', 'member',
      'amountCents', 8900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-028); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '60661393-b16d-4860-af28-b0ab5023f756'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'c5b471c3-fadd-476d-94c6-b3213141ea63'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-008: BPC-157 BPC-157 10 mg: 4750 -> 4900 cents
  perform public.research_admin_create_product_price(
    '92bd3921-c3c1-4568-86a5-6ef6c42b10f5'::uuid,
    jsonb_build_object(
      'variantId', '6915bc89-2311-4d42-8c5c-61195489febd',
      'audience', 'member',
      'amountCents', 4900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-008); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '6915bc89-2311-4d42-8c5c-61195489febd'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '92bd3921-c3c1-4568-86a5-6ef6c42b10f5'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-010: BPC-157 + TB-500 BPC-157 10 mg + TB-500 10 mg: 13450 -> 9900 cents
  perform public.research_admin_create_product_price(
    '4925f52a-2da8-4940-bc90-f55c71500c2f'::uuid,
    jsonb_build_object(
      'variantId', '245c11d1-76f9-41e5-8bbf-55b262c2e254',
      'audience', 'member',
      'amountCents', 9900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-010); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '245c11d1-76f9-41e5-8bbf-55b262c2e254'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '4925f52a-2da8-4940-bc90-f55c71500c2f'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-009: BPC-157 + TB-500 BPC-157 5 mg + TB-500 5 mg: 7000 -> 7900 cents
  perform public.research_admin_create_product_price(
    '4925f52a-2da8-4940-bc90-f55c71500c2f'::uuid,
    jsonb_build_object(
      'variantId', '8c5a2f43-bff7-409d-876d-b104b544f8fa',
      'audience', 'member',
      'amountCents', 7900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-009); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '8c5a2f43-bff7-409d-876d-b104b544f8fa'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '4925f52a-2da8-4940-bc90-f55c71500c2f'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-013: CJC-1295 (No DAC) + Ipamorelin CJC-1295 (No DAC) 5 mg + IPAMORELIN 5 mg: 7000 -> 7900 cents
  perform public.research_admin_create_product_price(
    '028ac4a9-a370-49fe-bf93-ac86e3a3a16a'::uuid,
    jsonb_build_object(
      'variantId', '10287aac-44e7-4d43-b17d-90bd470f99f8',
      'audience', 'member',
      'amountCents', 7900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-013); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '10287aac-44e7-4d43-b17d-90bd470f99f8'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '028ac4a9-a370-49fe-bf93-ac86e3a3a16a'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-021: Cagrilintide CAGRILINTIDE 10 mg: 14000 -> 10900 cents
  perform public.research_admin_create_product_price(
    '0eb35923-88be-4492-89ed-1cf5b200044d'::uuid,
    jsonb_build_object(
      'variantId', 'ee4b3610-9656-4288-87ed-cd7f5387a219',
      'audience', 'member',
      'amountCents', 10900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-021); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = 'ee4b3610-9656-4288-87ed-cd7f5387a219'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '0eb35923-88be-4492-89ed-1cf5b200044d'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-020: Cagrilintide CAGRILINTIDE 5 mg: 22500 -> 5900 cents
  perform public.research_admin_create_product_price(
    '0eb35923-88be-4492-89ed-1cf5b200044d'::uuid,
    jsonb_build_object(
      'variantId', '883e1c77-06df-447c-97a0-9c7a0fc5ae17',
      'audience', 'member',
      'amountCents', 5900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-020); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '883e1c77-06df-447c-97a0-9c7a0fc5ae17'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '0eb35923-88be-4492-89ed-1cf5b200044d'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-034: DSIP DSIP 10 mg: 7000 -> 4900 cents
  perform public.research_admin_create_product_price(
    'efb533c4-c73d-481a-98e5-7a1533c785af'::uuid,
    jsonb_build_object(
      'variantId', '901e3afb-69ef-426e-81d4-f98e3f673c54',
      'audience', 'member',
      'amountCents', 4900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-034); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '901e3afb-69ef-426e-81d4-f98e3f673c54'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'efb533c4-c73d-481a-98e5-7a1533c785af'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-011: GHK-Cu GHK-Cu 50 mg: 2250 -> 4900 cents
  perform public.research_admin_create_product_price(
    '2eefd77a-4210-48f1-aabf-aa78c29fb06e'::uuid,
    jsonb_build_object(
      'variantId', 'cf6e8347-caa3-49bc-97f6-bc756b78835d',
      'audience', 'member',
      'amountCents', 4900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-011); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = 'cf6e8347-caa3-49bc-97f6-bc756b78835d'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '2eefd77a-4210-48f1-aabf-aa78c29fb06e'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-025: GLOW (BPC-157 + TB-500 + GHK-Cu) BPC-157 10 mg + TB-500 10 mg + GHK-Cu 50 mg: 13450 -> 13900 cents
  perform public.research_admin_create_product_price(
    'f6f848f7-fc25-402f-bded-3cde23e71391'::uuid,
    jsonb_build_object(
      'variantId', 'b6052cdc-ab5c-46c2-b767-6e45c6526d3c',
      'audience', 'member',
      'amountCents', 13900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-025); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = 'b6052cdc-ab5c-46c2-b767-6e45c6526d3c'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'f6f848f7-fc25-402f-bded-3cde23e71391'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-018: Ipamorelin IPAMORELIN 10 mg: 4750 -> 5900 cents
  perform public.research_admin_create_product_price(
    '48375080-7a09-4c8c-8215-0a79598f19a5'::uuid,
    jsonb_build_object(
      'variantId', '9c4bc2dc-4525-44bc-8338-ac61038d228a',
      'audience', 'member',
      'amountCents', 5900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-018); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '9c4bc2dc-4525-44bc-8338-ac61038d228a'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '48375080-7a09-4c8c-8215-0a79598f19a5'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-039: KLOW (BPC-157 + TB-500 + GHK-Cu + KPV) BPC-157 10 mg + TB-500 10 mg + GHK-Cu 50 mg + KPV 10 mg: 15400 -> 13900 cents
  perform public.research_admin_create_product_price(
    '706d9237-230a-4f49-b974-3edf15803b2e'::uuid,
    jsonb_build_object(
      'variantId', '2fb3e008-d8e9-414a-a14d-6ee92ccc1ce2',
      'audience', 'member',
      'amountCents', 13900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-039); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '2fb3e008-d8e9-414a-a14d-6ee92ccc1ce2'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '706d9237-230a-4f49-b974-3edf15803b2e'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-029: KPV KPV 10 mg: 5050 -> 4900 cents
  perform public.research_admin_create_product_price(
    'cd6ded4d-a94c-4d56-8092-9262a83d6a8d'::uuid,
    jsonb_build_object(
      'variantId', '8daded5c-f9f7-43ed-a55d-c460f8b2d0a5',
      'audience', 'member',
      'amountCents', 4900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-029); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '8daded5c-f9f7-43ed-a55d-c460f8b2d0a5'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'cd6ded4d-a94c-4d56-8092-9262a83d6a8d'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-023: MOTS-C MOTS-C 10 mg: 4475 -> 4900 cents
  perform public.research_admin_create_product_price(
    '1f2bbd9c-d1c5-44ca-98e3-129b3fa36446'::uuid,
    jsonb_build_object(
      'variantId', 'd1ffeb84-cfd2-4115-a5aa-e4fab5195e70',
      'audience', 'member',
      'amountCents', 4900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-023); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = 'd1ffeb84-cfd2-4115-a5aa-e4fab5195e70'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '1f2bbd9c-d1c5-44ca-98e3-129b3fa36446'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-022: Melanotan II Melanotan II 10 mg: 4475 -> 3900 cents
  perform public.research_admin_create_product_price(
    '32d8914d-6462-478a-86ea-f65b618561cf'::uuid,
    jsonb_build_object(
      'variantId', 'b5e22c3f-53fd-4baa-9345-30f21fb7516e',
      'audience', 'member',
      'amountCents', 3900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-022); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = 'b5e22c3f-53fd-4baa-9345-30f21fb7516e'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '32d8914d-6462-478a-86ea-f65b618561cf'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-017: NAD+ NAD+ 1000 mg: 10075 -> 11900 cents
  perform public.research_admin_create_product_price(
    'f3406695-b225-4242-ac02-3fc4cac8c1aa'::uuid,
    jsonb_build_object(
      'variantId', 'f9ae8c72-9ed9-4356-8d02-3784487ce3a4',
      'audience', 'member',
      'amountCents', 11900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-017); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = 'f9ae8c72-9ed9-4356-8d02-3784487ce3a4'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'f3406695-b225-4242-ac02-3fc4cac8c1aa'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-016: NAD+ NAD+ 500 mg: 7000 -> 7900 cents
  perform public.research_admin_create_product_price(
    'f3406695-b225-4242-ac02-3fc4cac8c1aa'::uuid,
    jsonb_build_object(
      'variantId', '70588a66-1be4-4532-bfec-5b761360d2f1',
      'audience', 'member',
      'amountCents', 7900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-016); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '70588a66-1be4-4532-bfec-5b761360d2f1'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'f3406695-b225-4242-ac02-3fc4cac8c1aa'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-036: Oxytocin OXYTOCIN 5 mg: 4475 -> 3900 cents
  perform public.research_admin_create_product_price(
    'a51871dd-cb32-4058-bde4-1f336b840cfa'::uuid,
    jsonb_build_object(
      'variantId', '083689ea-b693-4194-bc9e-dfd1b8ff7484',
      'audience', 'member',
      'amountCents', 3900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-036); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '083689ea-b693-4194-bc9e-dfd1b8ff7484'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'a51871dd-cb32-4058-bde4-1f336b840cfa'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-019: PT-141 PT-141 10 mg: 3925 -> 4500 cents
  perform public.research_admin_create_product_price(
    '69137dca-9a9f-4596-b992-e2d7ff209a16'::uuid,
    jsonb_build_object(
      'variantId', '57df93f4-cd4b-49b4-b3d8-6a4a78abb107',
      'audience', 'member',
      'amountCents', 4500,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-019); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '57df93f4-cd4b-49b4-b3d8-6a4a78abb107'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '69137dca-9a9f-4596-b992-e2d7ff209a16'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-005: Retatrutide RETATRUTIDE 20 mg: 50400 -> 15900 cents
  perform public.research_admin_create_product_price(
    '0e0fda27-ad27-47d3-9340-cc267dc4c297'::uuid,
    jsonb_build_object(
      'variantId', 'c4e06e39-8158-470b-b174-33e1b6da5ee9',
      'audience', 'member',
      'amountCents', 15900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-005); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = 'c4e06e39-8158-470b-b174-33e1b6da5ee9'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '0e0fda27-ad27-47d3-9340-cc267dc4c297'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-006: Retatrutide RETATRUTIDE 40 mg: 95000 -> 18900 cents
  perform public.research_admin_create_product_price(
    '0e0fda27-ad27-47d3-9340-cc267dc4c297'::uuid,
    jsonb_build_object(
      'variantId', '91d1c225-3670-4a52-a6a0-d3af5610462e',
      'audience', 'member',
      'amountCents', 18900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-006); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '91d1c225-3670-4a52-a6a0-d3af5610462e'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '0e0fda27-ad27-47d3-9340-cc267dc4c297'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-033: Selank SELANK 10 mg: 5325 -> 4900 cents
  perform public.research_admin_create_product_price(
    'a21aebe9-9c38-4bd3-ad63-016086ece085'::uuid,
    jsonb_build_object(
      'variantId', '8e205121-0057-4c09-8e8e-3e97716c9a81',
      'audience', 'member',
      'amountCents', 4900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-033); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '8e205121-0057-4c09-8e8e-3e97716c9a81'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'a21aebe9-9c38-4bd3-ad63-016086ece085'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-003: Semaglutide SEMAGLUTIDE 10 mg: 3925 -> 8900 cents
  perform public.research_admin_create_product_price(
    'f207461b-7317-4bd5-8c73-cbbf68a67cdd'::uuid,
    jsonb_build_object(
      'variantId', '873ff4bd-c8cc-466f-8304-75a6828b1984',
      'audience', 'member',
      'amountCents', 8900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-003); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '873ff4bd-c8cc-466f-8304-75a6828b1984'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'f207461b-7317-4bd5-8c73-cbbf68a67cdd'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-004: Semaglutide SEMAGLUTIDE 20 mg: 31250 -> 9900 cents
  perform public.research_admin_create_product_price(
    'f207461b-7317-4bd5-8c73-cbbf68a67cdd'::uuid,
    jsonb_build_object(
      'variantId', '11ff33ff-1dc1-4783-adbb-14f201379b07',
      'audience', 'member',
      'amountCents', 9900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-004); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '11ff33ff-1dc1-4783-adbb-14f201379b07'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'f207461b-7317-4bd5-8c73-cbbf68a67cdd'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-032: Semax SEMAX 10 mg: 5325 -> 4900 cents
  perform public.research_admin_create_product_price(
    '9e3cdfb0-ae8a-45e0-ba29-a6e4de7dd018'::uuid,
    jsonb_build_object(
      'variantId', '18a0faf4-c4cd-41b8-9b96-f1a7de60b7e9',
      'audience', 'member',
      'amountCents', 4900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-032); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '18a0faf4-c4cd-41b8-9b96-f1a7de60b7e9'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '9e3cdfb0-ae8a-45e0-ba29-a6e4de7dd018'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-015: Sermorelin SERMORELIN 10 mg: 12000 -> 7900 cents
  perform public.research_admin_create_product_price(
    'd4105afa-9e90-4df8-b24f-7e25577589ea'::uuid,
    jsonb_build_object(
      'variantId', '0dda5d8f-68f8-4775-add6-ca6577e79117',
      'audience', 'member',
      'amountCents', 7900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-015); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '0dda5d8f-68f8-4775-add6-ca6577e79117'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'd4105afa-9e90-4df8-b24f-7e25577589ea'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-012: Tesamorelin TESAMORELIN 10 mg: 10650 -> 9900 cents
  perform public.research_admin_create_product_price(
    'd24840ba-386e-4ee0-8680-21a1904b5cd4'::uuid,
    jsonb_build_object(
      'variantId', 'deca3ada-9960-420c-ab87-5d8e85d24484',
      'audience', 'member',
      'amountCents', 9900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-012); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = 'deca3ada-9960-420c-ab87-5d8e85d24484'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'd24840ba-386e-4ee0-8680-21a1904b5cd4'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-031: Thymosin Alpha-1 Thymosin Alpha-1 10 mg: 10650 -> 9900 cents
  perform public.research_admin_create_product_price(
    'eecc1569-3529-4ce4-87a1-17837ab3195b'::uuid,
    jsonb_build_object(
      'variantId', '9dad8f2a-c610-41e8-a384-b39f1a467398',
      'audience', 'member',
      'amountCents', 9900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-031); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '9dad8f2a-c610-41e8-a384-b39f1a467398'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'eecc1569-3529-4ce4-87a1-17837ab3195b'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-030: Thymosin Alpha-1 Thymosin Alpha-1 5 mg: 17000 -> 4900 cents
  perform public.research_admin_create_product_price(
    'eecc1569-3529-4ce4-87a1-17837ab3195b'::uuid,
    jsonb_build_object(
      'variantId', '737bf3c0-bf87-4347-93ad-bc3c89301aa4',
      'audience', 'member',
      'amountCents', 4900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-030); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '737bf3c0-bf87-4347-93ad-bc3c89301aa4'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'eecc1569-3529-4ce4-87a1-17837ab3195b'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-001: Tirzepatide TIRZEPATIDE 30 mg: 9250 -> 7900 cents
  perform public.research_admin_create_product_price(
    '8cdacd81-e1ad-4ffb-921b-acd985d99e73'::uuid,
    jsonb_build_object(
      'variantId', 'bb7117a3-fdfa-434e-9b78-1b07350d3aeb',
      'audience', 'member',
      'amountCents', 7900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-001); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = 'bb7117a3-fdfa-434e-9b78-1b07350d3aeb'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '8cdacd81-e1ad-4ffb-921b-acd985d99e73'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-002: Tirzepatide TIRZEPATIDE 60 mg: 62500 -> 11900 cents
  perform public.research_admin_create_product_price(
    '8cdacd81-e1ad-4ffb-921b-acd985d99e73'::uuid,
    jsonb_build_object(
      'variantId', '2928724e-194b-4287-bb1b-15a594c62257',
      'audience', 'member',
      'amountCents', 11900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-002); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '2928724e-194b-4287-bb1b-15a594c62257'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '8cdacd81-e1ad-4ffb-921b-acd985d99e73'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-038: Hexarelin Hexarelin (5mg): 6250 -> 4900 cents
  perform public.research_admin_create_product_price(
    '3d9261e4-0428-4850-8b57-f4ca9f0e9472'::uuid,
    jsonb_build_object(
      'variantId', '5c705967-53dc-4fd0-9a35-c3c51abf937a',
      'audience', 'member',
      'amountCents', 4900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-038); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = '5c705967-53dc-4fd0-9a35-c3c51abf937a'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    '3d9261e4-0428-4850-8b57-f4ca9f0e9472'::uuid, v_price_id, v_actor, v_at
  );
  -- XRUO-037: Oxytocin Oxytocin (10mg): 10750 -> 5900 cents
  perform public.research_admin_create_product_price(
    'a51871dd-cb32-4058-bde4-1f336b840cfa'::uuid,
    jsonb_build_object(
      'variantId', 'ed16b4d7-7a0e-4f34-a01f-b81966aac0b0',
      'audience', 'member',
      'amountCents', 5900,
      'currency', 'USD',
      'effectiveAt', v_at::text,
      'expiresAt', '',
      'approvalNote', 'Founder retail price book 2026-08-16 (XRUO-037); directive 2026-08-19'
    ),
    v_actor, v_at
  );
  select id into v_price_id from public.research_product_prices
    where variant_id = 'ed16b4d7-7a0e-4f34-a01f-b81966aac0b0'::uuid and audience = 'member' and status = 'draft'
    order by version desc limit 1;
  perform public.research_admin_approve_product_price(
    'a51871dd-cb32-4058-bde4-1f336b840cfa'::uuid, v_price_id, v_actor, v_at
  );
end $$;
