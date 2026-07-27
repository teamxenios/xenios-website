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

try {
  cleanup();
  requireOk("start PostgreSQL 16", docker([
    "run", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=pw", "postgres:16",
  ]));
  let ready = false;
  for (let i = 0; i < 60 && !ready; i += 1) {
    ready = docker(["exec", container, "pg_isready", "-U", "postgres"]).status === 0;
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("PostgreSQL did not become ready");
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
    ) values(
      '40000000-0000-4000-8000-000000000001','cart.fixture.input','product_content',
      'CART FIXTURE INPUT','Disposable cart verification input','Required for cart proof',
      'product','10000000-0000-4000-8000-000000000001','summary','verified',
      'blocks_transaction','product_admin','Disposable verification','[]',null,'test',now(),
      'reviewer',now(),'Blocks cart proof','Verify input','/admin/products',1,'test'
    );
    insert into public.research_domain_launch_controls(
      domain,launch_status,software_complete,release_approved_by,release_approved_at,
      version,updated_by,updated_reason
    ) values('product_content','public_enabled',true,'reviewer',now(),1,'test','Disposable verification');

    create temporary table cart_selection(value jsonb);
    insert into cart_selection values(jsonb_build_object(
      'productId','10000000-0000-4000-8000-000000000001',
      'variantId','20000000-0000-4000-8000-000000000001','sku','CART-VARIANT',
      'audience','member',
      'audienceEligibility',jsonb_build_object('audience','member','state','authorized',
        'sourceVersion','member:1','evaluatedAt',clock_timestamp()),
      'price',jsonb_build_object('id','30000000-0000-4000-8000-000000000001',
        'amountCents',1250,'currency','USD','effectiveAt','2026-01-01T00:00:00Z',
        'expiresAt',null,'version',1),
      'media',jsonb_build_object('id','media','kind','primary_image','altText','Cart product'),
      'canonicalReadiness',jsonb_build_object('ready',true,'verifiedInputCount',1,
        'inputVersions',jsonb_build_array(jsonb_build_object(
          'id','40000000-0000-4000-8000-000000000001','version',1)),
        'domainVersions',jsonb_build_array(jsonb_build_object('domain','product_content','version',1))),
      'inventoryEligibility',jsonb_build_object(
        'productId','10000000-0000-4000-8000-000000000001',
        'variantId','20000000-0000-4000-8000-000000000001','state','eligible',
        'sourceVersion','inventory:1','evaluatedAt',clock_timestamp()),
      'evaluatedAt',clock_timestamp()
    ));

    select public.research_persistent_cart_put_item(
      'anonymous',repeat('a',64),null,null,null,2,(select value from cart_selection),
      repeat('1',64),'2027-07-27T20:00:00Z'::timestamptz);
    -- Exact replay is idempotent.
    select public.research_persistent_cart_put_item(
      'anonymous',repeat('a',64),null,null,null,2,(select value from cart_selection),
      repeat('1',64),'2027-07-27T20:00:00Z'::timestamptz);
    do $proof$ begin
      if (select count(*) from public.research_persistent_cart_items)<>1
         or (select count(*) from public.research_persistent_cart_commands)<>1
         or (select count(*) from public.research_persistent_cart_events)<>2 then
        raise exception 'put replay was not idempotent';
      end if;
    end $proof$;

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
    -- Exposure-reducing remove remains available while the selection is stale.
    select public.research_persistent_cart_remove_item(
      'anonymous',repeat('a',64),
      (select id from public.research_persistent_carts where anonymous_hash=repeat('a',64)),
      (select id from public.research_persistent_cart_items),
      2,1,repeat('2',64));
    update public.research_product_prices set status='active'
      where id='30000000-0000-4000-8000-000000000001';

    -- A second anonymous cart claims one-way into a member cart.
    select public.research_persistent_cart_put_item(
      'anonymous',repeat('b',64),null,null,null,3,(select value from cart_selection),
      repeat('3',64),'2027-07-27T20:00:00Z'::timestamptz);
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
