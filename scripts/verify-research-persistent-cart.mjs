// Disposable PostgreSQL 16 verifier. Never connects to Supabase or production.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const container = "xenios_persistent_cart_dryrun";
const docker = (args, input) =>
  spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 64 << 20 });
const psql = (sql, stop = true) => {
  const args = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-q", "-t", "-A"];
  if (stop) args.push("-v", "ON_ERROR_STOP=1");
  return docker(args, sql);
};
const psqlAsync = (database, sql) =>
  new Promise((resolve) => {
    const child = spawn("docker", [
      "exec", "-i", container, "psql", "-U", "postgres", "-d", database,
      "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(sql);
  });
const file = (name) => readFileSync(path.join(root, name), "utf8");
const requireOk = (name, result) => {
  if (result.status !== 0) throw new Error(`${name}\n${result.stderr}`);
  console.log(`PASS  ${name}`);
};
const cleanup = () => docker(["rm", "-f", container]);
const selectionFixtureSql = `
  insert into public.research_products(
    id,sku,slug,display_name,lane,lane_decision,availability,commerce_approval,
    fulfillment_owner,guide_state,quality_document_state,storage_data_state,
    shipping_profile_state,canonical_name,admin_status,active_state,visibility_state
  ) values(
    '81000000-0000-4000-8000-000000000001','RACE-SKU','race-product','Race Product',
    'supplement','decided','in_stock','approved','xenios','guide_published',
    'approved','approved','approved','Race Product','published',true,'public'
  );
  insert into public.research_product_variants(
    id,product_id,sku,label,status,active,version,created_by,updated_by
  ) values(
    '82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001','RACE-VARIANT','Race Variant',
    'draft',false,1,'test','test'
  );
  update public.research_product_variants set status='in_review' where sku='RACE-VARIANT';
  update public.research_product_variants set status='approved' where sku='RACE-VARIANT';
  update public.research_product_variants set active=true where sku='RACE-VARIANT';
  insert into public.research_product_prices(
    id,product_id,variant_id,audience,amount_cents,currency,effective_at,status,
    version,created_by,approved_by,approved_at
  ) values(
    '83000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    'member',1250,'USD','2026-01-01T00:00:00Z','active',1,'test','reviewer',now()
  );
  insert into public.research_required_inputs(
    id,key,domain,label,description,why_required,record_type,record_id,field_path,
    current_state,blocking_level,responsible_role,verification_method,evidence_required,
    entered_value,entered_by,entered_at,verified_by,verified_at,public_launch_impact,
    next_action,admin_entry_href,version,created_by
  ) values
    ('84000000-0000-4000-8000-000000000001','products.sku','products','PRODUCT SKU REQUIRED',
     'Race SKU verification','Required for race proof','product','81000000-0000-4000-8000-000000000001',
     'sku','verified','blocks_display','product_admin','Race verification','[]',null,'test',now(),
     'reviewer',now(),'Blocks race proof','Verify input','/admin/products',1,'test'),
    ('84000000-0000-4000-8000-000000000002','products.family','products','PRODUCT FAMILY REQUIRED',
     'Race family verification','Required for race proof','product','81000000-0000-4000-8000-000000000001',
     'family','verified','blocks_display','product_admin','Race verification','[]',null,'test',now(),
     'reviewer',now(),'Blocks race proof','Verify input','/admin/products',1,'test'),
    ('84000000-0000-4000-8000-000000000003','product_content.primary_image','product_content',
     'PRIMARY IMAGE REQUIRED','Race image verification','Required for race proof','product',
     '81000000-0000-4000-8000-000000000001','primary_image','verified','blocks_display',
     'product_admin','Race verification','[]',null,'test',now(),'reviewer',now(),
     'Blocks race proof','Verify input','/admin/products',1,'test'),
    ('84000000-0000-4000-8000-000000000004','product_content.storage_information','product_content',
     'STORAGE INFORMATION REQUIRED','Race storage verification','Required for race proof','product',
     '81000000-0000-4000-8000-000000000001','storage_information','verified','blocks_display',
     'product_admin','Race verification','[]',null,'test',now(),'reviewer',now(),
     'Blocks race proof','Verify input','/admin/products',1,'test');
  insert into public.research_domain_launch_controls(
    domain,launch_status,software_complete,release_approved_by,release_approved_at,
    version,updated_by,updated_reason
  ) values
    ('products','public_enabled',true,'reviewer',now(),1,'test','Race verification'),
    ('product_content','public_enabled',true,'reviewer',now(),1,'test','Race verification');
  create table public.cart_test_selection(value jsonb not null);
  insert into public.cart_test_selection values(jsonb_build_object(
    'productId','81000000-0000-4000-8000-000000000001',
    'variantId','82000000-0000-4000-8000-000000000001','sku','RACE-VARIANT',
    'displayName','Race Product','fulfillmentOwner','xenios','audience','member',
    'audienceEligibility',jsonb_build_object('audience','member','state','authorized',
      'sourceVersion','member:1','evaluatedAt',clock_timestamp()),
    'price',jsonb_build_object('id','83000000-0000-4000-8000-000000000001',
      'amountCents',1250,'currency','USD','effectiveAt','2026-01-01T00:00:00Z',
      'expiresAt',null,'version',1),
    'media',jsonb_build_object('id','media','kind','primary_image','altText','Race product'),
    'canonicalReadiness',jsonb_build_object('ready',true,'verifiedInputCount',4,
      'inputVersions',jsonb_build_array(
        jsonb_build_object('id','84000000-0000-4000-8000-000000000001','version',1),
        jsonb_build_object('id','84000000-0000-4000-8000-000000000002','version',1),
        jsonb_build_object('id','84000000-0000-4000-8000-000000000003','version',1),
        jsonb_build_object('id','84000000-0000-4000-8000-000000000004','version',1)),
      'domainVersions',jsonb_build_array(
        jsonb_build_object('domain','products','version',1),
        jsonb_build_object('domain','product_content','version',1))),
    'inventoryEligibility',jsonb_build_object(
      'productId','81000000-0000-4000-8000-000000000001',
      'variantId','82000000-0000-4000-8000-000000000001','state','eligible',
      'sourceVersion','inventory:1','evaluatedAt',clock_timestamp()),
    'evaluatedAt',clock_timestamp()
  ));
`;

try {
  cleanup();
  requireOk("start PostgreSQL 16", docker([
    "run", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=pw", "postgres:16",
  ]));
  let readyStreak = 0;
  for (let i = 0; i < 60 && readyStreak < 2; i += 1) {
    const ready = docker(["exec", container, "pg_isready", "-U", "postgres"]).status === 0;
    readyStreak = ready ? readyStreak + 1 : 0;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (readyStreak < 2) throw new Error("PostgreSQL did not become ready");
  requireOk("roles", psql(`
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin bypassrls;
    create table public.research_members(id uuid primary key);
    create schema storage;
    create table storage.buckets(
      id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[]
    );
  `));
  for (const prerequisite of [
    "supabase/research-catalog.sql",
    "supabase/research-inventory-lots.sql",
    "supabase/research-products-diagnostics.sql",
    "supabase/research-required-input-readiness.sql",
    "supabase/migrations/20260726143000_research_product_control_center.sql",
  ]) requireOk(`prerequisite ${prerequisite}`, psql(file(prerequisite)));
  const migration = "supabase/migrations/20260727200000_research_persistent_cart.sql";
  requireOk("migration first apply", psql(file(migration)));
  requireOk("migration second apply", psql(file(migration)));
  requireOk("read-only verifier", psql(file("supabase/verify-research-persistent-cart.sql")));
  requireOk("idempotency, stale-selection, remove, claim, expiry, immutable-audit lifecycle", psql(`
    begin;
    insert into public.research_products(
      id,sku,slug,display_name,lane,lane_decision,availability,commerce_approval,
      fulfillment_owner,guide_state,quality_document_state,storage_data_state,
      shipping_profile_state,canonical_name,admin_status,active_state,visibility_state
    ) values(
      '10000000-0000-4000-8000-000000000001','CART-SKU','cart-product','Cart Product',
      'supplement','decided','in_stock','approved','xenios','guide_published',
      'approved','approved','approved','Cart Product','published',true,'public'
    );
    insert into public.research_members(id) values
      ('50000000-0000-4000-8000-000000000001'),
      ('50000000-0000-4000-8000-000000000002');
    insert into public.research_product_variants(
      id,product_id,sku,label,status,active,version,created_by,updated_by
    ) values(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001','CART-VARIANT','Cart Variant',
      'draft',false,1,'test','test'
    );
    update public.research_product_variants set status='in_review' where sku='CART-VARIANT';
    update public.research_product_variants set status='approved' where sku='CART-VARIANT';
    update public.research_product_variants set active=true where sku='CART-VARIANT';
    insert into public.research_product_prices(
      id,product_id,variant_id,audience,amount_cents,currency,effective_at,status,
      version,created_by,approved_by,approved_at
    ) values(
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'member',1250,'USD','2026-01-01T00:00:00Z','active',1,'test','reviewer',now()
    );
    insert into public.research_required_inputs(
      id,key,domain,label,description,why_required,record_type,record_id,field_path,
      current_state,blocking_level,responsible_role,verification_method,evidence_required,
      entered_value,entered_by,entered_at,verified_by,verified_at,public_launch_impact,
      next_action,admin_entry_href,version,created_by
    ) values
      ('40000000-0000-4000-8000-000000000001','products.sku','products',
       'PRODUCT SKU REQUIRED','Disposable cart SKU verification','Required for cart proof',
       'product','10000000-0000-4000-8000-000000000001','sku','verified',
       'blocks_display','product_admin','Disposable verification','[]',null,'test',now(),
       'reviewer',now(),'Blocks cart proof','Verify input','/admin/products',1,'test'),
      ('40000000-0000-4000-8000-000000000002','products.family','products',
       'PRODUCT FAMILY REQUIRED','Disposable cart family verification','Required for cart proof',
       'product','10000000-0000-4000-8000-000000000001','family','verified',
       'blocks_display','product_admin','Disposable verification','[]',null,'test',now(),
       'reviewer',now(),'Blocks cart proof','Verify input','/admin/products',1,'test'),
      ('40000000-0000-4000-8000-000000000003','product_content.primary_image','product_content',
       'PRIMARY IMAGE REQUIRED','Disposable cart image verification','Required for cart proof',
       'product','10000000-0000-4000-8000-000000000001','primary_image','verified',
       'blocks_display','product_admin','Disposable verification','[]',null,'test',now(),
       'reviewer',now(),'Blocks cart proof','Verify input','/admin/products',1,'test'),
      ('40000000-0000-4000-8000-000000000004','product_content.storage_information','product_content',
       'STORAGE INFORMATION REQUIRED','Disposable cart storage verification','Required for cart proof',
       'product','10000000-0000-4000-8000-000000000001','storage_information','verified',
       'blocks_display','product_admin','Disposable verification','[]',null,'test',now(),
       'reviewer',now(),'Blocks cart proof','Verify input','/admin/products',1,'test');
    insert into public.research_domain_launch_controls(
      domain,launch_status,software_complete,release_approved_by,release_approved_at,
      version,updated_by,updated_reason
    ) values
      ('products','public_enabled',true,'reviewer',now(),1,'test','Disposable verification'),
      ('product_content','public_enabled',true,'reviewer',now(),1,'test','Disposable verification');

    create temporary table cart_selection(value jsonb);
    insert into cart_selection values(jsonb_build_object(
      'productId','10000000-0000-4000-8000-000000000001',
      'variantId','20000000-0000-4000-8000-000000000001','sku','CART-VARIANT',
      'displayName','Cart Product','fulfillmentOwner','xenios',
      'audience','member',
      'audienceEligibility',jsonb_build_object('audience','member','state','authorized',
        'sourceVersion','member:1','evaluatedAt',clock_timestamp()),
      'price',jsonb_build_object('id','30000000-0000-4000-8000-000000000001',
        'amountCents',1250,'currency','USD','effectiveAt','2026-01-01T00:00:00Z',
        'expiresAt',null,'version',1),
      'media',jsonb_build_object('id','media','kind','primary_image','altText','Cart product'),
      'canonicalReadiness',jsonb_build_object('ready',true,'verifiedInputCount',4,
        'inputVersions',jsonb_build_array(
          jsonb_build_object('id','40000000-0000-4000-8000-000000000001','version',1),
          jsonb_build_object('id','40000000-0000-4000-8000-000000000002','version',1),
          jsonb_build_object('id','40000000-0000-4000-8000-000000000003','version',1),
          jsonb_build_object('id','40000000-0000-4000-8000-000000000004','version',1)),
        'domainVersions',jsonb_build_array(
          jsonb_build_object('domain','products','version',1),
          jsonb_build_object('domain','product_content','version',1))),
      'inventoryEligibility',jsonb_build_object(
        'productId','10000000-0000-4000-8000-000000000001',
        'variantId','20000000-0000-4000-8000-000000000001','state','eligible',
        'sourceVersion','inventory:1','evaluatedAt',clock_timestamp()),
      'evaluatedAt',clock_timestamp()
    ));

    do $proof$
    declare v_bad jsonb;
    begin
      v_bad:=(select value from cart_selection)
        #- '{canonicalReadiness,inputVersions,3}';
      begin
        perform public.research_persistent_cart_put_item(
          'anonymous',repeat('a',64),null,null,null,2,v_bad,repeat('9',64),
          '2027-07-27T20:00:00Z');
        raise exception 'missing readiness binding passed';
      exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;

      v_bad:=jsonb_set((select value from cart_selection),
        '{canonicalReadiness,domainVersions}',
        (select value->'canonicalReadiness'->'domainVersions' from cart_selection)
          || jsonb_build_object('domain','unexpected','version',1));
      begin
        perform public.research_persistent_cart_put_item(
          'anonymous',repeat('a',64),null,null,null,2,v_bad,repeat('8',64),
          '2027-07-27T20:00:00Z');
        raise exception 'extra readiness domain passed';
      exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;

      update public.research_required_inputs set key='products.wrong'
        where id='40000000-0000-4000-8000-000000000001';
      begin
        perform public.research_persistent_cart_put_item(
          'anonymous',repeat('a',64),null,null,null,2,(select value from cart_selection),
          repeat('7',64),'2027-07-27T20:00:00Z');
        raise exception 'wrong readiness binding passed';
      exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;
      update public.research_required_inputs set key='products.sku'
        where id='40000000-0000-4000-8000-000000000001';

      update public.research_required_inputs set record_id='99999999-9999-4999-8999-999999999999'
        where id='40000000-0000-4000-8000-000000000001';
      begin
        perform public.research_persistent_cart_put_item(
          'anonymous',repeat('a',64),null,null,null,2,(select value from cart_selection),
          repeat('6',64),'2027-07-27T20:00:00Z');
        raise exception 'cross-product readiness binding passed';
      exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;
      update public.research_required_inputs set record_id='10000000-0000-4000-8000-000000000001'
        where id='40000000-0000-4000-8000-000000000001';
    end $proof$;

    insert into public.research_required_inputs(
      id,key,domain,label,description,why_required,record_type,record_id,field_path,
      current_state,blocking_level,responsible_role,verification_method,evidence_required,
      entered_value,entered_by,entered_at,verified_by,verified_at,public_launch_impact,
      next_action,admin_entry_href,version,created_by
    ) values(
      '40000000-0000-4000-8000-000000000005','products.extra','products',
      'EXTRA INPUT REQUIRED','Disposable extra input verification','Required for negative proof',
      'product','10000000-0000-4000-8000-000000000001','extra','verified',
      'blocks_display','product_admin','Disposable verification','[]',null,'test',now(),
      'reviewer',now(),'Blocks cart proof','Verify input','/admin/products',1,'test');
    do $proof$ begin
      begin
        perform public.research_persistent_cart_put_item(
          'anonymous',repeat('a',64),null,null,null,2,(select value from cart_selection),
          repeat('5',64),'2027-07-27T20:00:00Z');
        raise exception 'extra active readiness row passed';
      exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;
    end $proof$;
    delete from public.research_required_inputs
      where id='40000000-0000-4000-8000-000000000005';

    select public.research_persistent_cart_put_item(
      'anonymous',repeat('a',64),null,null,null,2,(select value from cart_selection),
      repeat('1',64),'2027-07-27T20:00:00Z'::timestamptz);
    -- Exact replay is idempotent.
    select public.research_persistent_cart_put_item(
      'anonymous',repeat('a',64),null,null,null,2,(select value from cart_selection),
      repeat('1',64),'2027-07-27T20:00:00Z'::timestamptz);
    do $proof$
    declare v_bad jsonb;
    begin
      v_bad:=(select value from cart_selection)
        #- '{canonicalReadiness,inputVersions,3}';
      begin
        perform public.research_persistent_cart_put_item(
          'anonymous',repeat('a',64),null,null,null,2,v_bad,repeat('1',64),
          '2027-07-27T20:00:00Z');
        raise exception 'replay accepted incomplete readiness';
      exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;
      v_bad:=jsonb_set((select value from cart_selection),
        '{canonicalReadiness,domainVersions}',
        (select value->'canonicalReadiness'->'domainVersions' from cart_selection)
          || jsonb_build_object('domain','unexpected','version',1));
      begin
        perform public.research_persistent_cart_put_item(
          'anonymous',repeat('a',64),null,null,null,2,v_bad,repeat('1',64),
          '2027-07-27T20:00:00Z');
        raise exception 'replay accepted extra readiness';
      exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;
      v_bad:=jsonb_set((select value from cart_selection),
        '{canonicalReadiness,inputVersions,0,id}',
        to_jsonb('99999999-9999-4999-8999-999999999999'::text));
      begin
        perform public.research_persistent_cart_put_item(
          'anonymous',repeat('a',64),null,null,null,2,v_bad,repeat('1',64),
          '2027-07-27T20:00:00Z');
        raise exception 'replay accepted wrong readiness binding';
      exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;
    end $proof$;
    do $proof$ begin
      if (select count(*) from public.research_persistent_cart_items)<>1
         or (select count(*) from public.research_persistent_cart_commands)<>1
         or (select count(*) from public.research_persistent_cart_events)<>2 then
        raise exception 'put replay was not idempotent';
      end if;
    end $proof$;

    -- Exposure-reducing remove remains available even with a stale saved
    -- projection; it intentionally does not consult selection authority.
    update public.research_persistent_cart_items set selection_snapshot='{}'
      where cart_id=(select id from public.research_persistent_carts
        where anonymous_hash=repeat('a',64));
    select public.research_persistent_cart_remove_item(
      'anonymous',repeat('a',64),
      (select id from public.research_persistent_carts where anonymous_hash=repeat('a',64)),
      (select id from public.research_persistent_cart_items),
      2,1,repeat('2',64));
    -- With no active item referencing the price, invalidation may proceed.
    update public.research_product_prices set status='expired'
      where id='30000000-0000-4000-8000-000000000001';
    do $proof$ begin
      begin
        perform public.research_persistent_cart_put_item(
          'anonymous',repeat('a',64),null,null,null,2,(select value from cart_selection),
          repeat('1',64),'2027-07-27T20:00:00Z'::timestamptz);
        raise exception 'stale replay passed';
      exception when others then
        if sqlerrm<>'selection_stale' then raise; end if;
      end;
    end $proof$;
    update public.research_product_prices set status='active'
      where id='30000000-0000-4000-8000-000000000001';

    -- A second anonymous cart claims one-way into a member cart.
    select public.research_persistent_cart_put_item(
      'anonymous',repeat('b',64),null,null,null,3,(select value from cart_selection),
      repeat('3',64),'2027-07-27T20:00:00Z'::timestamptz);
    do $proof$
    declare v_carts bigint; v_items bigint; v_commands bigint; v_events bigint;
    begin
      select count(*) into v_carts from public.research_persistent_carts;
      select count(*) into v_items from public.research_persistent_cart_items;
      select count(*) into v_commands from public.research_persistent_cart_commands;
      select count(*) into v_events from public.research_persistent_cart_events;
      begin
        perform public.research_persistent_cart_claim(
          '50000000-0000-4000-8000-000000000001',repeat('b',64),
          jsonb_build_array((select value from cart_selection)
            #- '{canonicalReadiness,inputVersions,3}'),2,null,null,
          repeat('a',64),'2027-07-27T20:00:00Z');
        raise exception 'claim accepted incomplete readiness';
      exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;
      begin
        perform public.research_persistent_cart_claim(
          '50000000-0000-4000-8000-000000000001',repeat('b',64),
          jsonb_build_array(jsonb_set((select value from cart_selection),
            '{canonicalReadiness,domainVersions}',
            (select value->'canonicalReadiness'->'domainVersions' from cart_selection)
              || jsonb_build_object('domain','unexpected','version',1))),
          2,null,null,repeat('e',64),'2027-07-27T20:00:00Z');
        raise exception 'claim accepted extra readiness';
      exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;
      begin
        perform public.research_persistent_cart_claim(
          '50000000-0000-4000-8000-000000000001',repeat('b',64),
          jsonb_build_array(jsonb_set((select value from cart_selection),
            '{canonicalReadiness,inputVersions,0,id}',
            to_jsonb('99999999-9999-4999-8999-999999999999'::text))),
          2,null,null,repeat('f',64),'2027-07-27T20:00:00Z');
        raise exception 'claim accepted wrong readiness binding';
      exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;
      begin
        perform public.research_persistent_cart_claim(
          '50000000-0000-4000-8000-000000000001',repeat('b',64),
          jsonb_build_array((select value from cart_selection)),2,null,null,
          repeat('b',64),clock_timestamp()-interval '1 minute');
        raise exception 'claim accepted past target expiry';
      exception when others then if sqlerrm<>'expired' then raise; end if; end;
      update public.research_persistent_carts set expires_at=clock_timestamp()-interval '1 minute'
        where anonymous_hash=repeat('b',64);
      begin
        perform public.research_persistent_cart_claim(
          '50000000-0000-4000-8000-000000000001',repeat('b',64),
          jsonb_build_array((select value from cart_selection)),2,null,null,
          repeat('c',64),'2027-07-27T20:00:00Z');
        raise exception 'claim accepted expired source';
      exception when others then if sqlerrm<>'expired' then raise; end if; end;
      update public.research_persistent_carts set expires_at='2027-07-27T20:00:00Z'
        where anonymous_hash=repeat('b',64);
      if (select count(*) from public.research_persistent_carts)<>v_carts
        or (select count(*) from public.research_persistent_cart_items)<>v_items
        or (select count(*) from public.research_persistent_cart_commands)<>v_commands
        or (select count(*) from public.research_persistent_cart_events)<>v_events
      then raise exception 'failed claim mutated persistent state'; end if;
    end $proof$;
    select public.research_persistent_cart_claim(
      '50000000-0000-4000-8000-000000000001',repeat('b',64),
      jsonb_build_array((select value from cart_selection)),2,null,null,
      repeat('4',64),'2027-07-27T20:00:00Z'::timestamptz);
    select public.research_persistent_cart_claim(
      '50000000-0000-4000-8000-000000000001',repeat('b',64),
      jsonb_build_array((select value from cart_selection)),2,null,null,
      repeat('4',64),'2027-07-27T20:00:00Z'::timestamptz);
    do $proof$ begin
      if (select state from public.research_persistent_carts where anonymous_hash=repeat('b',64))<>'reconciled'
         or (select count(*) from public.research_persistent_cart_commands where action='claim')<>1 then
        raise exception 'claim was not one-way/idempotent';
      end if;
      begin
        perform public.research_persistent_cart_claim(
          '50000000-0000-4000-8000-000000000002',repeat('b',64),
          jsonb_build_array((select value from cart_selection)),2,null,null,
          repeat('5',64),'2027-07-27T20:00:00Z'::timestamptz);
        raise exception 'cross-user claim passed';
      exception when others then
        if sqlerrm not in ('already_claimed','conflict') then raise; end if;
      end;
    end $proof$;

    update public.research_persistent_carts set expires_at=clock_timestamp()-interval '1 second'
      where owner_kind='member';
    select public.research_persistent_cart_expire(
      (select id from public.research_persistent_carts where owner_kind='member'),2,repeat('6',64));
    select public.research_persistent_cart_expire(
      (select id from public.research_persistent_carts where owner_kind='member'),2,repeat('6',64));

    update public.research_required_inputs set current_state='expired'
      where id='40000000-0000-4000-8000-000000000001';
    do $proof$ begin
      begin
        perform public.research_persistent_cart_claim(
          '50000000-0000-4000-8000-000000000001',repeat('b',64),
          jsonb_build_array((select value from cart_selection)),2,null,null,
          repeat('4',64),'2027-07-27T20:00:00Z');
        raise exception 'claim replay bypassed current readiness';
      exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;
    end $proof$;
    update public.research_required_inputs set current_state='verified'
      where id='40000000-0000-4000-8000-000000000001';

    do $proof$ begin
      begin
        update public.research_persistent_cart_events set metadata='{}';
        raise exception 'event mutation passed';
      exception when sqlstate '55000' then null; end;
      begin
        delete from public.research_persistent_cart_commands;
        raise exception 'command delete passed';
      exception when sqlstate '55000' then null; end;
    end $proof$;
    rollback;
  `));
  requireOk("create isolated concurrency database", psql(
    "create database cart_concurrency template postgres;",
  ));
  requireOk("seed isolated concurrency cart", docker([
    "exec", "-i", container, "psql", "-U", "postgres", "-d", "cart_concurrency",
    "-q", "-v", "ON_ERROR_STOP=1", "-c", `
      insert into public.research_members(id)
      values('70000000-0000-4000-8000-000000000002');
      insert into public.research_persistent_carts(
        id,owner_kind,member_id,state,version,expires_at
      ) values(
        '70000000-0000-4000-8000-000000000001','member',
        '70000000-0000-4000-8000-000000000002','active',1,
        '2027-07-27T20:00:00Z'
      );
      insert into public.research_persistent_cart_items(
        id,cart_id,product_id,variant_id,sku,audience,quantity,price_id,
        price_amount_cents,price_currency,price_effective_at,price_version,
        selection_evaluated_at,selection_snapshot,selection_hash,version
      ) values(
        '70000000-0000-4000-8000-000000000003',
        '70000000-0000-4000-8000-000000000001',
        '70000000-0000-4000-8000-000000000004',
        '70000000-0000-4000-8000-000000000005','CONCURRENT','member',1,
        '70000000-0000-4000-8000-000000000006',100,'USD',
        '2026-01-01T00:00:00Z',1,'2026-07-27T20:00:00Z','{}',repeat('a',64),1
      );
    `,
  ]));
  const concurrentSql = (key) => `
    select public.research_persistent_cart_remove_item(
      'member','70000000-0000-4000-8000-000000000002',
      '70000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000003',1,1,repeat('${key}',64)
    );`;
  const contenders = await Promise.all([
    psqlAsync("cart_concurrency", concurrentSql("7")),
    psqlAsync("cart_concurrency", concurrentSql("8")),
  ]);
  const winners = contenders.filter(({ status }) => status === 0).length;
  requireOk("concurrent same-version writers serialize to one winner",
    winners === 1 ? { status: 0 } : {
      status: 1,
      stderr: `expected one winner, saw ${winners}\n${contenders.map((item) => item.stderr).join("\n")}`,
    });
  requireOk("concurrency leaves one event/command and no item", docker([
    "exec", container, "psql", "-U", "postgres", "-d", "cart_concurrency",
    "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", `
      do $proof$ begin
        if (select count(*) from public.research_persistent_cart_items)<>0
          or (select count(*) from public.research_persistent_cart_commands)<>1
          or (select count(*) from public.research_persistent_cart_events)<>1
          or (select version from public.research_persistent_carts
              where id='70000000-0000-4000-8000-000000000001')<>2
        then raise exception 'concurrency invariant failed'; end if;
      end $proof$;
    `,
  ]));
  const putRaceSql = `
    select public.research_persistent_cart_put_item(
      'anonymous',repeat('d',64),null,null,null,1,
      (select value from public.cart_test_selection),repeat('d',64),
      '2027-07-27T20:00:00Z'
    );`;
  const invalidations = [
    {
      name: "price",
      sql: `update public.research_product_prices set status='expired'
        where id='83000000-0000-4000-8000-000000000001';`,
    },
    {
      name: "product",
      sql: `update public.research_products
        set visibility_state='hidden', admin_status='archived', active_state=false
        where id='81000000-0000-4000-8000-000000000001';`,
    },
    {
      name: "required_input",
      sql: `update public.research_required_inputs set current_state='expired'
        where id='84000000-0000-4000-8000-000000000001';`,
    },
    {
      name: "domain",
      sql: `update public.research_domain_launch_controls
        set launch_status='disabled', software_complete=false
        where domain='products';`,
    },
  ];
  for (const invalidation of invalidations) {
    const cartFirstDatabase = `cart_first_${invalidation.name}`;
    const writerFirstDatabase = `writer_first_${invalidation.name}`;
    for (const database of [cartFirstDatabase, writerFirstDatabase]) {
      requireOk(`create ${database}`, psql(`create database ${database} template postgres;`));
      requireOk(`seed ${database}`, await psqlAsync(database, selectionFixtureSql));
    }

    const cartFirst = psqlAsync(cartFirstDatabase, `
      begin; ${putRaceSql} select pg_sleep(2); commit;`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const writerAfterCart = psqlAsync(cartFirstDatabase, invalidation.sql);
    const [cartFirstResult, writerAfterCartResult] = await Promise.all([
      cartFirst, writerAfterCart,
    ]);
    requireOk(`${invalidation.name} cart-first commits current cart`, cartFirstResult);
    requireOk(`${invalidation.name} cart-first permits authoritative invalidation`,
      writerAfterCartResult);
    requireOk(`${invalidation.name} invalidation stales forward/replay/claim but permits remove`,
      await psqlAsync(cartFirstDatabase, `
        do $proof$
        declare v_carts bigint; v_items bigint; v_commands bigint; v_events bigint;
          v_cart uuid; v_item uuid;
        begin
          select id into v_cart from public.research_persistent_carts
            where anonymous_hash=repeat('d',64);
          select id into v_item from public.research_persistent_cart_items where cart_id=v_cart;
          select count(*) into v_carts from public.research_persistent_carts;
          select count(*) into v_items from public.research_persistent_cart_items;
          select count(*) into v_commands from public.research_persistent_cart_commands;
          select count(*) into v_events from public.research_persistent_cart_events;
          begin
            perform public.research_persistent_cart_put_item(
              'anonymous',repeat('d',64),v_cart,2,1,1,
              (select value from public.cart_test_selection),repeat('d',64),
              '2027-07-27T20:00:00Z');
            raise exception 'stale replay passed';
          exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;
          begin
            perform public.research_persistent_cart_put_item(
              'anonymous',repeat('d',64),v_cart,2,1,2,
              (select value from public.cart_test_selection),repeat('e',64),
              '2027-07-27T20:00:00Z');
            raise exception 'stale forward mutation passed';
          exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;
          begin
            perform public.research_persistent_cart_claim(
              '50000000-0000-4000-8000-000000000001',repeat('d',64),
              jsonb_build_array((select value from public.cart_test_selection)),
              2,null,null,repeat('f',64),'2027-07-27T20:00:00Z');
            raise exception 'stale claim passed';
          exception when others then if sqlerrm<>'selection_stale' then raise; end if; end;
          if (select count(*) from public.research_persistent_carts)<>v_carts
            or (select count(*) from public.research_persistent_cart_items)<>v_items
            or (select count(*) from public.research_persistent_cart_commands)<>v_commands
            or (select count(*) from public.research_persistent_cart_events)<>v_events
          then raise exception 'stale command mutated state'; end if;
          perform public.research_persistent_cart_remove_item(
            'anonymous',repeat('d',64),v_cart,v_item,2,1,repeat('a',64));
          if (select count(*) from public.research_persistent_cart_items)<>0
          then raise exception 'stale remove failed'; end if;
        end $proof$;`,
      ));

    const writerFirst = psqlAsync(writerFirstDatabase, `
      begin; ${invalidation.sql} select pg_sleep(2); commit;`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const cartAfterWriter = psqlAsync(writerFirstDatabase, putRaceSql);
    const [writerFirstResult, cartAfterWriterResult] = await Promise.all([
      writerFirst, cartAfterWriter,
    ]);
    requireOk(`${invalidation.name} writer-first commits invalidation`, writerFirstResult);
    requireOk(`${invalidation.name} writer-first rejects stale cart`,
      cartAfterWriterResult.status !== 0 &&
        /selection_stale/.test(cartAfterWriterResult.stderr)
        ? { status: 0 }
        : { status: 1, stderr: cartAfterWriterResult.stderr });
    requireOk(`${invalidation.name} writer-first leaves zero cart state`,
      await psqlAsync(writerFirstDatabase, `
        do $proof$ begin
          if (select count(*) from public.research_persistent_carts)
            +(select count(*) from public.research_persistent_cart_items)
            +(select count(*) from public.research_persistent_cart_commands)
            +(select count(*) from public.research_persistent_cart_events)<>0
          then raise exception 'writer-first stale commit'; end if;
        end $proof$;`,
      ));
  }
  const directDml = psql(`
    set role service_role;
    insert into public.research_persistent_carts(owner_kind,member_id,expires_at)
    values('member','11111111-1111-4111-8111-111111111111',now()+interval '1 day');
  `);
  requireOk("direct DML denied", directDml.status === 0
    ? { status: 1, stderr: "direct DML unexpectedly passed" }
    : { status: 0 });
  requireOk("rollback leaves zero rows", psql(`
    do $proof$ begin
    if
      (select count(*) from public.research_persistent_carts)
      +(select count(*) from public.research_persistent_cart_items)
      +(select count(*) from public.research_persistent_cart_commands)
      +(select count(*) from public.research_persistent_cart_events)<>0
    then raise exception 'residual rows'; end if;
    end $proof$;
  `));
} finally {
  cleanup();
}
