// Website 3 Product Control Center disposable PostgreSQL verifier.
// Never connects to Supabase or any remote database.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = "xenios_product_control_dryrun";
const results = [];

function docker(args, input) {
  return spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function psql(sql, { stopOnError = true } = {}) {
  const args = [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-q",
    "-t",
    "-A",
  ];
  if (stopOnError) args.push("-v", "ON_ERROR_STOP=1");
  const result = docker(args, sql);
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function applyFile(relativePath) {
  return psql(readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function record(name, pass, evidence = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (evidence.trim()) {
    console.log(
      evidence
        .trim()
        .split("\n")
        .map((line) => `      ${line}`)
        .join("\n"),
    );
  }
}

function requireOk(name, result) {
  const pass = result.status === 0;
  record(name, pass, pass ? result.stdout : result.stderr);
  if (!pass) throw new Error(name);
}

function expectScalar(name, sql, expected) {
  const result = psql(sql);
  const actual = result.stdout.trim();
  const pass = result.status === 0 && actual === expected;
  record(
    name,
    pass,
    result.status === 0
      ? `expected=${expected} actual=${actual}`
      : result.stderr,
  );
  if (!pass) throw new Error(name);
}

function expectRejected(name, sql, pattern) {
  const result = psql(sql);
  const evidence = result.stderr || result.stdout;
  const pass = result.status !== 0 && pattern.test(evidence);
  record(name, pass, evidence);
  if (!pass) throw new Error(name);
}

function cleanup() {
  docker(["rm", "-f", CONTAINER]);
}

try {
  cleanup();
  const run = docker([
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-e",
    "POSTGRES_PASSWORD=pw",
    "postgres:16",
  ]);
  if (run.status !== 0) {
    throw new Error(run.stderr || "could not start postgres");
  }
  let readyStreak = 0;
  for (let attempt = 0; attempt < 60 && readyStreak < 2; attempt += 1) {
    const ready = docker([
      "exec",
      CONTAINER,
      "pg_isready",
      "-U",
      "postgres",
    ]);
    readyStreak = ready.status === 0 ? readyStreak + 1 : 0;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (readyStreak < 2) throw new Error("postgres did not become ready");

  requireOk(
    "create Supabase-compatible roles and Storage catalog",
    psql(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema storage;
      create table storage.buckets (
        id text primary key,
        name text not null,
        public boolean not null default false,
        file_size_limit bigint,
        allowed_mime_types text[]
      );
      create table public.research_members (id uuid primary key);
    `),
  );
  for (const relativePath of [
    "supabase/research-catalog.sql",
    "supabase/research-inventory-lots.sql",
    "supabase/research-products-diagnostics.sql",
    "supabase/research-required-input-readiness.sql",
  ]) {
    requireOk(`prerequisite: ${relativePath}`, applyFile(relativePath));
  }

  const migration =
    "supabase/migrations/20260726143000_research_product_control_center.sql";
  requireOk("Product Control migration: first apply", applyFile(migration));
  requireOk(
    "Product Control migration: idempotent second apply",
    applyFile(migration),
  );

  expectScalar(
    "all legacy and new product tables force RLS",
    `select count(*)::text
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'research_products','research_product_facts','research_product_goals',
          'research_product_guide_links','research_product_prohibited_claims',
          'research_product_open_questions','research_supplement_candidates',
          'research_product_content','research_product_variants',
          'research_product_prices','research_product_media',
          'research_product_admin_audit'
        )
        and c.relrowsecurity and c.relforcerowsecurity;`,
    "12",
  );
  expectScalar(
    "anon/authenticated have zero product table privileges",
    `select count(*)::text from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in (
          'research_products','research_product_facts','research_product_goals',
          'research_product_guide_links','research_product_prohibited_claims',
          'research_product_open_questions','research_supplement_candidates',
          'research_product_content','research_product_variants',
          'research_product_prices','research_product_media',
          'research_product_admin_audit'
        )
        and grantee in ('anon','authenticated');`,
    "0",
  );
  expectScalar(
    "anon/authenticated have zero Product Control RPC grants",
    `select count(*)::text
       from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name like 'research_admin_%product%'
        and grantee in ('anon','authenticated');`,
    "0",
  );
  expectScalar(
    "browser/public roles cannot execute lifecycle or immutability triggers",
    `select count(*)::text
       from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name in (
          'research_product_variant_lifecycle_guard',
          'research_product_price_history_immutable'
        )
        and grantee in ('PUBLIC','anon','authenticated');`,
    "0",
  );
  expectScalar(
    "service role has the exact 33 table privileges required by the RPC-only boundary",
    `select count(*)::text from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in (
          'research_products','research_product_facts','research_product_goals',
          'research_product_guide_links','research_product_prohibited_claims',
          'research_product_open_questions','research_supplement_candidates',
          'research_product_content','research_product_variants',
          'research_product_prices','research_product_media',
          'research_product_admin_audit'
        )
        and grantee = 'service_role'
        and privilege_type in ('SELECT','INSERT','UPDATE','DELETE');`,
    "33",
  );
  expectScalar(
    "five command-managed tables expose SELECT and zero direct mutation privileges",
    `select concat_ws(':',
       count(*) filter (where privilege_type = 'SELECT'),
       count(*) filter (where privilege_type in ('INSERT','UPDATE','DELETE'))
     )
     from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in (
         'research_products','research_product_variants',
         'research_product_prices','research_product_media',
         'research_product_admin_audit'
       )
       and grantee = 'service_role';`,
    "5:0",
  );
  expectScalar(
    "seven legacy support tables retain their exact 28 repository privileges",
    `select count(*)::text
     from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in (
         'research_product_facts','research_product_goals',
         'research_product_guide_links','research_product_prohibited_claims',
         'research_product_open_questions','research_supplement_candidates',
         'research_product_content'
       )
       and grantee = 'service_role'
       and privilege_type in ('SELECT','INSERT','UPDATE','DELETE');`,
    "28",
  );
  expectScalar(
    "service role alone receives the 11 Product Control RPC grants",
    `select count(*)::text
       from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name like 'research_admin_%product%'
        and grantee = 'service_role';`,
    "11",
  );
  expectScalar(
    "private product media bucket exists exactly once",
    `select count(*)::text from storage.buckets
      where id = 'research-product-media-production' and public = false;`,
    "1",
  );
  expectScalar(
    "migration creates no product, variant, price, media, or audit rows",
    `select (
       (select count(*) from public.research_products) +
       (select count(*) from public.research_product_variants) +
       (select count(*) from public.research_product_prices) +
       (select count(*) from public.research_product_media) +
       (select count(*) from public.research_product_admin_audit)
     )::text;`,
    "0",
  );

  requireOk(
    "service role creates product, duplicate draft, and inactive draft variant",
    psql(`
      set role service_role;
      select public.research_admin_create_product(
        '{"productCode":"DRY-A","slug":"dry-a","displayName":"Dry A","canonicalName":"Dry A","aliases":[],"lane":"research_material","category":"dry","classification":"research_material"}',
        'admin@example.invalid',
        '2026-07-26T14:30:00Z'
      );
      select public.research_admin_duplicate_product(
        (select id from public.research_products where sku = 'DRY-A'),
        'DRY-B', 'dry-b', 'Dry B',
        'admin@example.invalid',
        '2026-07-26T14:31:00Z'
      );
      select public.research_admin_create_product_variant(
        (select id from public.research_products where sku = 'DRY-A'),
        '{"sku":"DRY-A-01","label":"Primary","strength":"10 mg","size":"1 vial","format":"vial","presentation":"single","shippingClass":"ambient","memberEligible":true,"sortOrder":0}',
        'admin@example.invalid',
        '2026-07-26T14:32:00Z'
      );
      reset role;
    `),
  );
  expectScalar(
    "new variants are inactive drafts",
    `select status || ':' || active::text
       from public.research_product_variants where sku='DRY-A-01';`,
    "draft:false",
  );
  expectRejected(
    "service role cannot insert products outside command RPCs",
    `set role service_role;
     insert into public.research_products (sku) values ('DIRECT-PRODUCT');`,
    /permission denied/i,
  );
  expectRejected(
    "service role cannot publish products outside the readiness command",
    `set role service_role;
     update public.research_products
        set admin_status='published', visibility_state='public', active_state=true
      where sku='DRY-A';`,
    /permission denied/i,
  );
  expectRejected(
    "service role cannot delete products outside command RPCs",
    `set role service_role;
     delete from public.research_products where sku='DRY-A';`,
    /permission denied/i,
  );
  expectScalar(
    "rejected product DML preserves lifecycle, version, and command audit",
    `select p.admin_status || ':' || p.visibility_state || ':' ||
       p.active_state::text || ':' || p.version::text || ':' ||
       (select count(*)::text from public.research_product_admin_audit a
         where a.product_id=p.id and a.entity_type='product')
       from public.research_products p where p.sku='DRY-A';`,
    "draft:hidden:true:1:1",
  );
  expectRejected(
    "service role cannot insert variants outside command RPCs",
    `set role service_role;
     insert into public.research_product_variants (
       product_id, sku, label, created_by, updated_by
     ) values (
       (select id from public.research_products where sku='DRY-A'),
       'DIRECT-VARIANT', 'Direct', 'direct', 'direct'
     );`,
    /permission denied/i,
  );
  expectRejected(
    "service role cannot update variants outside command RPCs",
    `set role service_role;
     update public.research_product_variants
        set status='approved', active=true
      where sku='DRY-A-01';`,
    /permission denied/i,
  );
  expectRejected(
    "service role cannot delete variants outside command RPCs",
    `set role service_role;
     delete from public.research_product_variants where sku='DRY-A-01';`,
    /permission denied/i,
  );
  expectRejected(
    "draft variant cannot skip review and activate",
    `set role service_role;
     select public.research_admin_update_product_variant(
       (select id from public.research_products where sku='DRY-A'),
       (select id from public.research_product_variants where sku='DRY-A-01'),
       '{"status":"approved","active":true}',
       'reviewer@example.invalid', now()
     );`,
    /invalid variant state transition/i,
  );
  expectRejected(
    "unreviewed variant cannot receive pricing",
    `set role service_role;
     select public.research_admin_create_product_price(
       (select id from public.research_products where sku='DRY-A'),
       jsonb_build_object(
         'variantId',(select id from public.research_product_variants where sku='DRY-A-01'),
         'audience','retail','amountCents',10000,'currency','USD',
         'effectiveAt','2026-07-26T14:34:00Z'
       ),
       'admin@example.invalid', now()
     );`,
    /approved active variant not found/i,
  );
  expectScalar(
    "rejected variant and price bypasses leave lifecycle and history unchanged",
    `select v.status || ':' || v.active::text || ':' ||
       (select count(*)::text from public.research_product_prices)
       from public.research_product_variants v where v.sku='DRY-A-01';`,
    "draft:false:0",
  );
  requireOk(
    "reviewed variant activates before v1 price is created and approved",
    psql(`
      set role service_role;
      select public.research_admin_update_product_variant(
        (select id from public.research_products where sku = 'DRY-A'),
        (select id from public.research_product_variants where sku = 'DRY-A-01'),
        '{"status":"in_review","active":false}',
        'reviewer@example.invalid','2026-07-26T14:33:00Z'
      );
      select public.research_admin_update_product_variant(
        (select id from public.research_products where sku = 'DRY-A'),
        (select id from public.research_product_variants where sku = 'DRY-A-01'),
        '{"status":"approved","active":true}',
        'reviewer@example.invalid','2026-07-26T14:33:30Z'
      );
      select public.research_admin_create_product_price(
        (select id from public.research_products where sku = 'DRY-A'),
        jsonb_build_object(
          'variantId',(select id from public.research_product_variants where sku = 'DRY-A-01'),
          'audience','retail','amountCents',10000,'currency','USD',
          'effectiveAt','2026-07-26T14:34:00Z'
        ),
        'admin@example.invalid','2026-07-26T14:34:00Z'
      );
      select public.research_admin_approve_product_price(
        (select id from public.research_products where sku = 'DRY-A'),
        (select id from public.research_product_prices where version = 1),
        'reviewer@example.invalid','2026-07-26T14:35:00Z'
      );
      reset role;
    `),
  );
  expectScalar(
    "duplicate is isolated draft without variants, prices, or media",
    `select concat_ws(':',
       p.admin_status,
       p.visibility_state,
       (select count(*) from public.research_product_variants v where v.product_id=p.id),
       (select count(*) from public.research_product_prices x where x.product_id=p.id),
       (select count(*) from public.research_product_media m where m.product_id=p.id)
     )
     from public.research_products p where p.sku='DRY-B';`,
    "draft:hidden:0:0:0",
  );
  expectScalar(
    "v1 retail price is active with immutable version number",
    `select status || ':' || version::text || ':' || amount_cents::text
       from public.research_product_prices where version=1;`,
    "active:1:10000",
  );

  requireOk(
    "future v2 remains approved and immediate v3 supersedes v1",
    psql(`
      set role service_role;
      select public.research_admin_create_product_price(
        (select id from public.research_products where sku = 'DRY-A'),
        jsonb_build_object(
          'variantId',(select id from public.research_product_variants where sku = 'DRY-A-01'),
          'audience','retail','amountCents',11000,'currency','USD',
          'effectiveAt','2027-01-01T00:00:00Z'
        ),
        'admin@example.invalid','2026-07-26T14:36:00Z'
      );
      select public.research_admin_approve_product_price(
        (select id from public.research_products where sku = 'DRY-A'),
        (select id from public.research_product_prices where version = 2),
        'reviewer@example.invalid','2026-07-26T14:37:00Z'
      );
      select public.research_admin_create_product_price(
        (select id from public.research_products where sku = 'DRY-A'),
        jsonb_build_object(
          'variantId',(select id from public.research_product_variants where sku = 'DRY-A-01'),
          'audience','retail','amountCents',10500,'currency','USD',
          'effectiveAt','2026-07-26T14:38:00Z'
        ),
        'admin@example.invalid','2026-07-26T14:38:00Z'
      );
      select public.research_admin_approve_product_price(
        (select id from public.research_products where sku = 'DRY-A'),
        (select id from public.research_product_prices where version = 3),
        'reviewer@example.invalid','2026-07-26T14:39:00Z'
      );
      reset role;
    `),
  );
  expectScalar(
    "price history preserves superseded, approved-future, and active versions",
    `select string_agg(version::text || '=' || status, ',' order by version)
       from public.research_product_prices;`,
    "1=superseded,2=approved,3=active",
  );

  expectRejected(
    "service role cannot insert price history outside command RPCs",
    `set role service_role;
     insert into public.research_product_prices (
       product_id, variant_id, audience, amount_cents, currency,
       effective_at, status, version, created_by
     ) values (
       (select id from public.research_products where sku='DRY-A'),
       (select id from public.research_product_variants where sku='DRY-A-01'),
       'member', 1, 'USD', now(), 'active', 1, 'direct'
     );`,
    /permission denied/i,
  );
  expectRejected(
    "service role cannot activate price history outside command RPCs",
    `set role service_role;
     update public.research_product_prices
        set status = 'active'
      where version = 2;`,
    /permission denied/i,
  );
  expectRejected(
    "service role cannot rewrite price economic history",
    `set role service_role;
     update public.research_product_prices
        set amount_cents = 1, version = 99
      where version = 1;`,
    /permission denied/i,
  );
  expectRejected(
    "service role cannot delete price history outside command RPCs",
    `set role service_role;
     delete from public.research_product_prices where version = 1;`,
    /permission denied/i,
  );
  expectScalar(
    "rejected price mutations preserve all economic versions",
    `select string_agg(version::text || '=' || amount_cents::text, ',' order by version)
       from public.research_product_prices;`,
    "1=10000,2=11000,3=10500",
  );

  requireOk(
    "media upload preparation creates only pending metadata",
    psql(`
      set role service_role;
      select id from public.research_admin_prepare_product_media(
        (select id from public.research_products where sku = 'DRY-A'),
        '{"kind":"primary_image","filename":"dry.png","contentType":"image/png","sizeBytes":8,"altText":"Dry product","sortOrder":2}',
        'admin@example.invalid','2026-07-26T14:40:00Z'
      );
      reset role;
    `),
  );
  expectRejected(
    "service role cannot insert media outside the verified-object command",
    `set role service_role;
     insert into public.research_product_media (
       product_id, kind, storage_key, filename, content_type,
       size_bytes, alt_text, created_by, updated_by
     ) values (
       (select id from public.research_products where sku='DRY-A'),
       'gallery_image', 'direct/object.png', 'object.png', 'image/png',
       8, 'Direct object', 'direct', 'direct'
     );`,
    /permission denied/i,
  );
  expectRejected(
    "service role cannot advance or rewrite pending media directly",
    `set role service_role;
     update public.research_product_media
        set state='approved', alt_text='Bypassed object confirmation', sort_order=99
      where state='pending_upload';`,
    /permission denied/i,
  );
  expectRejected(
    "service role cannot delete pending media outside command RPCs",
    `set role service_role;
     delete from public.research_product_media where state='pending_upload';`,
    /permission denied/i,
  );
  expectRejected(
    "pending media cannot bypass object confirmation into review",
    `set role service_role;
     select public.research_admin_update_product_media(
       (select id from public.research_products where sku='DRY-A'),
       (select id from public.research_product_media),
       'in_review','Bypass attempt',1,'',
       'admin@example.invalid',now()
     );`,
    /invalid media state transition/i,
  );
  expectRejected(
    "pending media cannot bypass object confirmation into approval",
    `set role service_role;
     select public.research_admin_update_product_media(
       (select id from public.research_products where sku='DRY-A'),
       (select id from public.research_product_media),
       'approved','Bypass attempt',1,'',
       'admin@example.invalid',now()
     );`,
    /invalid media state transition/i,
  );
  expectScalar(
    "rejected media bypasses preserve pending state, version, and audit count",
    `select m.state || ':' || m.version::text || ':' ||
       (select count(*)::text from public.research_product_admin_audit a
         where a.entity_type='media')
       from public.research_product_media m;`,
    "pending_upload:1:1",
  );
  requireOk(
    "media metadata moves through upload, review, approval, and ordering",
    psql(`
      set role service_role;

      select public.research_admin_confirm_product_media(
        (select id from public.research_products where sku = 'DRY-A'),
        (select id from public.research_product_media),
        'admin@example.invalid','2026-07-26T14:41:00Z'
      );
      select public.research_admin_update_product_media(
        (select id from public.research_products where sku = 'DRY-A'),
        (select id from public.research_product_media),
        'in_review','Dry product front view',1,'',
        'admin@example.invalid','2026-07-26T14:42:00Z'
      );
      select public.research_admin_update_product_media(
        (select id from public.research_products where sku = 'DRY-A'),
        (select id from public.research_product_media),
        'approved','Dry product front view',0,'',
        'reviewer@example.invalid','2026-07-26T14:43:00Z'
      );
      select public.research_admin_update_product_media(
        (select id from public.research_products where sku = 'DRY-A'),
        (select id from public.research_product_media),
        'approved','Dry product approved view',3,'',
        'reviewer@example.invalid','2026-07-26T14:44:00Z'
      );
      reset role;
    `),
  );
  expectScalar(
    "approved media retains metadata and final order",
    `select state || ':' || alt_text || ':' || sort_order::text
       from public.research_product_media;`,
    "approved:Dry product approved view:3",
  );
  expectScalar(
    "verified media commands append one confirmation audit and every versioned change",
    `select m.version::text || ':' ||
       (select count(*)::text from public.research_product_admin_audit a
         where a.entity_type='media') || ':' ||
       (select count(*)::text from public.research_product_admin_audit a
         where a.entity_type='media' and a.action='media_upload_confirmed')
       from public.research_product_media m;`,
    "5:5:1",
  );

  requireOk(
    "reviewed product transition command publishes and audits once",
    psql(`
      set role service_role;
      select public.research_admin_transition_product(
        (select id from public.research_products where sku='DRY-A'),
        'published', true, 'public',
        'reviewer@example.invalid', '2026-07-26T14:45:00Z',
        'Canonical manifest/hash/count and zero-blocker gate passed'
      );
      reset role;
    `),
  );
  expectScalar(
    "product command preserves versioning and exactly one publication audit",
    `select p.admin_status || ':' || p.visibility_state || ':' ||
       p.active_state::text || ':' || p.version::text || ':' ||
       (select count(*)::text from public.research_product_admin_audit a
         where a.product_id=p.id and a.action='published')
       from public.research_products p where p.sku='DRY-A';`,
    "published:public:true:2:1",
  );

  expectRejected(
    "authenticated browser cannot create products",
    `set role authenticated;
     select public.research_admin_create_product(
       '{"productCode":"NOPE","slug":"nope","displayName":"Nope","canonicalName":"Nope","aliases":[],"lane":"research_material","category":"dry","classification":"research_material"}',
       'browser@example.invalid', now()
     );`,
    /permission denied/i,
  );
  expectRejected(
    "anon browser cannot mutate variants directly",
    `set role anon;
     update public.research_product_variants set label='Nope';`,
    /permission denied/i,
  );
  expectRejected(
    "cross-product variant mutation is refused",
    `set role service_role;
     select public.research_admin_update_product_variant(
       (select id from public.research_products where sku='DRY-B'),
       (select id from public.research_product_variants where sku='DRY-A-01'),
       '{"label":"Cross entity"}',
       'admin@example.invalid', now()
     );`,
    /variant not found/i,
  );
  expectRejected(
    "service role cannot insert audit history outside command RPCs",
    `set role service_role;
     insert into public.research_product_admin_audit (
       product_id, entity_type, action, actor
     ) values (
       (select id from public.research_products where sku='DRY-A'),
       'product', 'forged', 'direct'
     );`,
    /permission denied/i,
  );
  expectRejected(
    "service role cannot update audit history outside command RPCs",
    `set role service_role;
     update public.research_product_admin_audit set action='rewritten';`,
    /permission denied/i,
  );
  expectRejected(
    "service role cannot delete audit history outside command RPCs",
    `set role service_role;
     delete from public.research_product_admin_audit;`,
    /permission denied/i,
  );
  expectScalar(
    "service role retains read access to RPC-appended audit history",
    `set role service_role;
     select (count(*) > 0)::text
       from public.research_product_admin_audit
      where actor in ('admin@example.invalid','reviewer@example.invalid');`,
    "true",
  );

  requireOk(
    "rollback cleanup removes all dry-run domain records",
    psql(`
      truncate table
        public.research_product_admin_audit,
        public.research_product_media,
        public.research_product_prices,
        public.research_product_variants,
        public.research_product_content,
        public.research_products
      cascade;
    `),
  );
  expectScalar(
    "rollback leaves zero product-control rows",
    `select (
       (select count(*) from public.research_products) +
       (select count(*) from public.research_product_variants) +
       (select count(*) from public.research_product_prices) +
       (select count(*) from public.research_product_media) +
       (select count(*) from public.research_product_admin_audit)
     )::text;`,
    "0",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  cleanup();
  const failed = results.filter((result) => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}
