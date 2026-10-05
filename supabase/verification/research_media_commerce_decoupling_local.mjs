// Source-only synthetic proof for the unapplied media/commerce decoupling
// candidate. It creates one disposable, no-network/no-port PostgreSQL 16/17
// container and removes only that container in finally. It never connects to a
// hosted project and must not be run concurrently with another heavy SQL job.
// --source-only checks exact source/DAG provenance without invoking Docker.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

assert.equal(process.version, "v20.19.0", "Run with the isolated pinned Node runtime");
assert.ok(process.argv.slice(2).every((arg) => arg === "--source-only"), "Unknown verifier argument");
const runFile = promisify(execFile);
const containerName = `xenios-media-commerce-${process.pid}-local`;
const postgresImage =
  process.env.XENIOS_MEDIA_COMMERCE_PG_IMAGE ?? "postgres:17-alpine";
assert.match(
  postgresImage,
  /^postgres:(?:16|17)(?:\.\d+)?-alpine$/,
  "Use an explicit PostgreSQL 16/17 Alpine image tag",
);
const candidatePath =
  "supabase/candidates/20261003_research_media_commerce_decoupling.sql";
const candidate = await readFile(candidatePath, "utf8");
const prerequisitePins = [
  ["supabase/research-catalog.sql", "0e868dcd4bea04a5cc6bdce474ac93d0feae9553bdfcbaf74a448c05b07d4f42"],
  ["supabase/research-inventory-lots.sql", "00ccc125f9bfcd428b530e19445c1042b7953b5450dea223707609b87282ee7e"],
  ["supabase/research-products-diagnostics.sql", "5d191bc21fea106a934640df8effe82eaf2bf5f445b6a3510f6272233b982013"],
  ["supabase/research-required-input-readiness.sql", "ffbd07e9c42703299cc9babe0f7c680bc6a22e88e7fae5c4c0fd66c7a93e6b8f"],
  ["supabase/migrations/20260726143000_research_product_control_center.sql", "b1589eb24405d4700206d25541b647479afee34c2cd05422da70df2179876203"],
  ["supabase/migrations/20260726214500_research_product_control_center_privilege_hardening.sql", "2fb96f105fcfb1d6f77bf6e9bcf191b48decbc9206f2045b32cf7595d31551db"],
  ["supabase/migrations/20260727120000_research_inventory_lot_coa_admin.sql", "65a98ccdb43c4adb541d0e21c1cc54b7bfb618755dc37f679414e3dba7a48524"],
  ["supabase/migrations/20260727160000_research_inventory_reservation_commands.sql", "4e30807c7f58abc2d819abf509914364b55cba029586b3492329bacb7eef6005"],
  ["supabase/migrations/20260801120000_research_variant_strength_write_gate.sql", "6cd11e07eb764d0f803db4baa308ae397c23aacb8ff5d29306c8797be60b4818"],
  ["supabase/migrations/20260727200000_research_persistent_cart.sql", "0e0bbe23bef4c214ccdafd9cb9cd6a8682a9de0b8cc8fa4e376de51f4b5a1f43"],
];
const prerequisites = prerequisitePins.map(([path]) => path);
const prerequisiteSources = new Map();
const canonical = (source) => source.replace(/\r\n/g, "\n");
const sha256 = (source) => createHash("sha256").update(canonical(source)).digest("hex");
for (const [path, expected] of prerequisitePins) {
  const source = await readFile(path, "utf8");
  assert.equal(sha256(source), expected, `Core predecessor bytes drifted: ${path}`);
  prerequisiteSources.set(path, source);
}

const dag = JSON.parse(await readFile("docs/coordination/MIGRATION_DAG.json", "utf8"));
const graph = new Map(dag.migrations.map((node) => [node.id, node]));
const closure = [];
const visited = new Set();
function visit(id) {
  if (visited.has(id)) return;
  visited.add(id);
  const node = graph.get(id);
  assert.ok(node, `Missing DAG predecessor ${id}`);
  for (const dependency of node.dependsOn) visit(dependency);
  closure.push(node);
}
visit("research_persistent_cart");
assert.deepEqual(closure.map(({ path }) => path), prerequisites.slice(4), "Persistent-cart DAG closure drifted");
for (const node of closure) {
  assert.equal(node.checksum.algorithm, "sha256");
  assert.equal(sha256(prerequisiteSources.get(node.path)), node.checksum.value, `DAG source mismatch: ${node.id}`);
}
assert.equal(graph.get("research_persistent_cart").appliedToProduction, false, "Refresh managed predecessor status before qualification");
assert.equal(graph.get("research_persistent_cart").managedMigrationId, "PENDING");
assert.ok(!dag.migrations.some((node) => node.path.includes("research_media_commerce_decoupling")), "Candidate must remain unregistered");
assert.ok(!(await readFile("supabase/MIGRATIONS.md", "utf8")).includes("research_media_commerce_decoupling"), "Candidate must remain outside the managed ledger");

const predecessorBodies = [
  ["research_persistent_cart_selection_current", "717d44a6e6378b3c5c8acfb28f0ddff3", prerequisites.at(-1)],
  ["research_persistent_cart_put_item", "2872890758dc0afa84b1815d8cbfa6db", prerequisites.at(-1)],
  ["research_persistent_cart_claim", "c38501b49ac295be3852eccc482faed5", prerequisites.at(-1)],
  ["research_required_input_manifest_hash", "8aba188324fde758904adebf54bb9e22", prerequisites[3]],
  ["research_domain_readiness", "0a6bfabc6ca617ccab71f4882e4842cb", prerequisites[3]],
  ["research_set_readiness_manifest", "70d9a438d582be5c9b8e9e106b9edf67", prerequisites[3]],
];
for (const [name, expected, path] of predecessorBodies) {
  const pattern = new RegExp(`create or replace function public\\.${name}\\([^]*?as \\$\\$([^]*?)\\$\\$;`, "i");
  const match = canonical(prerequisiteSources.get(path)).match(pattern);
  assert.ok(match, `Missing predecessor body ${name}`);
  assert.equal(createHash("md5").update(match[1]).digest("hex"), expected, `Function predecessor drifted: ${name}`);
  assert.ok(candidate.includes(`'${expected}'`), `Candidate must pin current predecessor: ${name}`);
}
process.stdout.write(`SOURCE PASS Core 3eaa017fcbd28989c65ffc4bb439a554aa1f3f59; ${prerequisites.length} exact prerequisite files; six function bodies; complete persistent-cart DAG closure.\n`);
process.stdout.write("SQL_STATE source-only, unregistered; no managed application or managed-state requalification.\n");
process.stdout.write(`CANDIDATE_SHA256 ${sha256(candidate)}\n`);
if (process.argv.includes("--source-only")) process.exit(0);
let containerId;

function psql(database, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec", "-i", containerId, "psql", "-X", "-q", "-A", "-t",
        "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
      ],
      { windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 45_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(Object.assign(new Error(`Disposable psql exited ${code}`), {
        code,
        stdout,
        stderr,
      }));
    });
    child.stdin.end(`\\set VERBOSITY verbose\n${sql}\n`);
  });
}

async function refused(database, sql, detail) {
  let failure;
  try {
    await psql(database, sql);
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, `Expected refusal ${detail ?? ""}`);
  if (detail) assert.match(failure.stderr ?? "", new RegExp(`DETAIL:\\s+${detail}(?:\\r?\\n|$)`));
  return failure;
}

function json(output) {
  const row = output.split(/\r?\n/).filter((value) => value.startsWith("{")).at(-1);
  assert.ok(row, `Expected JSON output, received: ${output}`);
  return JSON.parse(row);
}

const ids = {
  product: "10000000-0000-4000-8000-000000000001",
  variant: "20000000-0000-4000-8000-000000000001",
  retailPrice: "30000000-0000-4000-8000-000000000001",
  memberPrice: "30000000-0000-4000-8000-000000000002",
  lot: "40000000-0000-4000-8000-000000000001",
  document: "41000000-0000-4000-8000-000000000001",
  skuInput: "50000000-0000-4000-8000-000000000001",
  familyInput: "50000000-0000-4000-8000-000000000002",
  imageInput: "50000000-0000-4000-8000-000000000003",
  storageInput: "50000000-0000-4000-8000-000000000004",
  media: "60000000-0000-4000-8000-000000000001",
  member: "70000000-0000-4000-8000-000000000001",
  claimMember: "70000000-0000-4000-8000-000000000002",
};
const inventoryUpdatedAt = "2026-07-28T00:00:00+00:00";

const fixtureSql = `
insert into public.research_members(id,status,billing_state) values
  ('${ids.member}','active','active'),
  ('${ids.claimMember}','active','active');
insert into public.research_products(
  id,sku,slug,display_name,lane,lane_decision,availability,commerce_approval,
  fulfillment_owner,guide_state,quality_document_state,storage_data_state,
  shipping_profile_state,canonical_name,admin_status,active_state,visibility_state
) values(
  '${ids.product}','MEDIA-CART-SKU','media-cart-product','Media Cart Product',
  'supplement','decided','in_stock','approved','xenios','guide_published',
  'approved','approved','approved','Media Cart Product','published',true,'public'
);
insert into public.research_product_variants(
  id,product_id,sku,label,status,active,version,created_by,updated_by
) values(
  '${ids.variant}','${ids.product}','MEDIA-CART-VARIANT','Media Cart Variant',
  'draft',false,1,'synthetic','synthetic'
);
update public.research_product_variants set status='in_review' where id='${ids.variant}';
update public.research_product_variants set status='approved' where id='${ids.variant}';
update public.research_product_variants
set active=true,member_eligible=true where id='${ids.variant}';
insert into public.research_product_prices(
  id,product_id,variant_id,audience,amount_cents,currency,effective_at,status,
  version,created_by,approved_by,approved_at
) values
  ('${ids.retailPrice}','${ids.product}','${ids.variant}','retail',1250,'USD',
    '2026-01-01T00:00:00Z','active',1,'synthetic','reviewer',now()),
  ('${ids.memberPrice}','${ids.product}','${ids.variant}','member',1100,'USD',
    '2026-01-01T00:00:00Z','active',1,'synthetic','reviewer',now());
insert into public.research_product_media(
  id,product_id,kind,state,storage_key,filename,content_type,size_bytes,
  alt_text,approved_by,approved_at,created_by,updated_by
) values(
  '${ids.media}','${ids.product}','primary_image','approved',
  '${ids.product}/${ids.media}/synthetic.webp','synthetic.webp','image/webp',128,
  'Synthetic presentation image','reviewer',now(),'synthetic','synthetic'
);
insert into public.research_required_inputs(
  id,key,domain,label,description,why_required,record_type,record_id,field_path,
  current_state,blocking_level,responsible_role,verification_method,evidence_required,
  entered_value,entered_by,entered_at,verified_by,verified_at,public_launch_impact,
  next_action,admin_entry_href,version,created_by
) values
  ('${ids.skuInput}','products.sku','products','PRODUCT SKU REQUIRED',
    'Synthetic SKU verification','Required for commerce','product','${ids.product}',
    'sku','verified','blocks_display','product_admin','Synthetic verification','[]',
    null,'synthetic',now(),'reviewer',now(),'Blocks commerce','Verify input','/admin/products',1,'synthetic'),
  ('${ids.familyInput}','products.family','products','PRODUCT FAMILY REQUIRED',
    'Synthetic family verification','Required for commerce','product','${ids.product}',
    'family','verified','blocks_display','product_admin','Synthetic verification','[]',
    null,'synthetic',now(),'reviewer',now(),'Blocks commerce','Verify input','/admin/products',1,'synthetic'),
  ('${ids.imageInput}','product_content.primary_image','product_content','PRIMARY IMAGE REQUIRED',
    'Synthetic image verification','Presentation only','product','${ids.product}',
    'primary_image','verified','blocks_display','product_admin','Synthetic verification','[]',
    null,'synthetic',now(),'reviewer',now(),'Presentation only','Review image','/admin/products',1,'synthetic'),
  ('${ids.storageInput}','product_content.storage_information','product_content','STORAGE INFORMATION REQUIRED',
    'Synthetic storage verification','Required for commerce','product','${ids.product}',
    'storage_information','verified','blocks_display','product_admin','Synthetic verification','[]',
    null,'synthetic',now(),'reviewer',now(),'Blocks commerce','Verify storage','/admin/products',1,'synthetic');
insert into public.research_domain_launch_controls(
  domain,launch_status,software_complete,manifest_version,manifest_hash,
  expected_input_count,manifest_approved_by,manifest_approved_at,
  release_approved_by,release_approved_at,version,updated_by,updated_reason
) values
  ('products','public_enabled',true,1,
    public.research_required_input_manifest_hash('products'),2,'reviewer',now(),
    'reviewer',now(),1,'synthetic','Synthetic products readiness'),
  ('product_content','public_enabled',true,1,
    public.research_required_input_manifest_hash('product_content'),2,'reviewer',now(),
    'reviewer',now(),1,'synthetic','Synthetic product-content readiness');
select set_config('xenios.inventory_command','allowed',false);
select set_config('xenios.quality_command','allowed',false);
insert into public.research_inventory_lots(
  id,lot_id,sku,owner,disposition,quantity_available,manufactured_date,
  expiry_date,shelf_life_source,excursion,recalled,updated_at,product_id,
  variant_id,storage_location,supplier_reference,quantity_received,version,
  reviewed_at,reviewed_by
) values(
  '${ids.lot}','MEDIA-CART-LOT','MEDIA-CART-VARIANT','xenios','available',10,
  '2026-01-01','2028-01-01','coa','none',false,'${inventoryUpdatedAt}',
  '${ids.product}','${ids.variant}','vault-a','synthetic',10,1,
  '${inventoryUpdatedAt}','reviewer'
);
insert into public.research_lot_quality_documents(
  id,lot_id,coa_on_file,identity_confirmed,purity_confirmed,
  sterility_confirmed,endotoxin_confirmed,document_ref,recorded_at,
  document_state,verification_state,private_storage_key,reviewed_at,
  bucket_id,original_filename,content_type,size_bytes,sha256,
  report_issuer,report_number,report_date,reviewed_by,published_at,published_by
) values(
  '${ids.document}','${ids.lot}',true,true,true,true,true,'SYNTHETIC',now(),
  'available','document_on_file','lots/${ids.lot}/coa.pdf','${inventoryUpdatedAt}',
  'research-coa-production','coa.pdf','application/pdf',128,repeat('a',64),
  'Synthetic laboratory','SYNTHETIC-REPORT','2026-07-27','reviewer',
  '${inventoryUpdatedAt}','reviewer'
);
insert into public.research_lot_quality_tests(
  quality_document_id,test_key,state,method,result,reviewed_by,reviewed_at
)
select '${ids.document}',test_key,
  case when test_key in ('sterility','endotoxin','particulate',
    'residual_solvents','elemental_impurities') then 'not_applicable' else 'passed' end,
  case when test_key in ('sterility','endotoxin','particulate',
    'residual_solvents','elemental_impurities') then null else 'Synthetic method' end,
  case when test_key in ('sterility','endotoxin','particulate',
    'residual_solvents','elemental_impurities') then null else 'Pass' end,
  case when test_key in ('sterility','endotoxin','particulate',
    'residual_solvents','elemental_impurities') then null else 'reviewer' end,
  case when test_key in ('sterility','endotoxin','particulate',
    'residual_solvents','elemental_impurities') then null
    else '${inventoryUpdatedAt}'::timestamptz end
from unnest(array[
  'identity','assay','purity','sterility','endotoxin','particulate',
  'residual_solvents','elemental_impurities','chain_of_custody'
]) as test_key;
select set_config('xenios.inventory_command','',false);
select set_config('xenios.quality_command','',false);
`;

function selectionExpression({ legacy = false, member = false, media = true } = {}) {
  const inputs = legacy
    ? [ids.skuInput, ids.familyInput, ids.imageInput, ids.storageInput]
    : [ids.skuInput, ids.familyInput, ids.storageInput];
  const inputObjects = inputs.map((id) =>
    `jsonb_build_object('id','${id}','version',` +
      `(select version from public.research_required_inputs where id='${id}'))`,
  ).join(",");
  const audience = member ? "member" : "retail";
  const price = member ? ids.memberPrice : ids.retailPrice;
  const amount = member ? 1100 : 1250;
  const principal = member ? `'${ids.member}'` : "null";
  const sourceVersion = member ? `repeat('b',64)` : `'retail:v1'`;
  const mediaPair = media
    ? `,'media',jsonb_build_object('id','${ids.media}','kind','primary_image','altText','Synthetic presentation image')`
    : "";
  return `(with evaluated as materialized (select clock_timestamp() as evaluated_at)
    select jsonb_build_object(
      'productId','${ids.product}','variantId','${ids.variant}',
      'sku','MEDIA-CART-VARIANT','audience','${audience}',
      'audienceEligibility',jsonb_build_object(
        'audience','${audience}','state','authorized','sourceVersion',${sourceVersion},
        'evaluatedAt',evaluated_at,'principalId',${principal}),
      'price',jsonb_build_object(
        'id','${price}','amountCents',${amount},'currency','USD',
        'effectiveAt','2026-01-01T00:00:00Z','expiresAt',null,'version',1)
      ${mediaPair},
      'canonicalReadiness',jsonb_build_object(
        'ready',true,'verifiedInputCount',${inputs.length},
        'inputVersions',jsonb_build_array(${inputObjects}),
        'domainVersions',jsonb_build_array(
          jsonb_build_object('domain','products','version',
            (select version from public.research_domain_launch_controls where domain='products')),
          jsonb_build_object('domain','product_content','version',
            (select version from public.research_domain_launch_controls where domain='product_content')))),
      'inventoryEligibility',jsonb_build_object(
        'productId','${ids.product}','variantId','${ids.variant}','state','eligible',
        'sourceVersion',public.research_persistent_cart_inventory_source_version(
          '${ids.product}','${ids.variant}','MEDIA-CART-VARIANT',evaluated_at),
        'evaluatedAt',evaluated_at),
      'evaluatedAt',evaluated_at)
    from evaluated)`;
}

const currentSql = (selection = "(select value from public.media_test_selection)") =>
  `select public.research_persistent_cart_selection_current(
    'anonymous',repeat('a',64),${selection});`;

async function expectCurrentAfter(label, mutation, expected = "f") {
  const result = await psql("postgres", `begin; ${mutation}\n${currentSql()} rollback;`);
  assert.equal(result.split(/\r?\n/).filter(Boolean).at(-1), expected, label);
  process.stdout.write(`PASS ${label}\n`);
}

try {
  const started = await runFile(
    "docker",
    [
      "run", "-d", "--rm", "--name", containerName, "--network", "none",
      "--tmpfs", "/var/lib/postgresql/data", "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
      postgresImage,
    ],
    { windowsHide: true },
  );
  containerId = started.stdout.trim();
  assert.match(containerId, /^[0-9a-f]{64}$/);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await runFile("docker", ["exec", containerId, "pg_isready", "-U", "postgres"], {
        windowsHide: true,
      });
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.ok(ready, "Disposable PostgreSQL did not become ready");
  process.stdout.write(`Runtime ${process.version}; PostgreSQL ${await psql("postgres", "show server_version;")}\n`);

  await psql("postgres", `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role media_migration_nobypass nologin;
    create role media_acl_drift nologin;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    alter default privileges in schema public grant execute on functions to anon,authenticated;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    create table public.research_members(
      id uuid primary key,
      status text not null default 'active',
      billing_state text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create schema storage;
    create table storage.buckets(
      id text primary key,name text not null,public boolean not null default false,
      file_size_limit bigint,allowed_mime_types text[]
    );
  `);
  for (const path of prerequisites) {
    await psql("postgres", prerequisiteSources.get(path));
  }
  await psql("postgres", fixtureSql);
  process.stdout.write("PASS exact predecessor schema and synthetic non-image authorities loaded.\n");

  assert.equal(
    await psql("postgres", currentSql(selectionExpression({ legacy: true, media: true }))),
    "t",
    "Predecessor canonical selection fixture must be valid",
  );
  assert.equal(
    await psql("postgres", currentSql(selectionExpression({ legacy: true, media: false }))),
    "f",
    "Predecessor must reproduce the missing-media eligibility defect",
  );
  assert.equal(
    await psql("postgres", `begin;
      update public.research_required_inputs set current_state='missing'
      where id='${ids.imageInput}';
      ${currentSql(selectionExpression({ legacy: true, media: true }))}
      rollback;`),
    "f",
    "Predecessor must reproduce primary-image required-input coupling",
  );
  process.stdout.write("BEFORE PASS approved media required; missing media/input reproduced as ineligible.\n");

  // Isolated clones prove fail-closed installation without touching the main
  // proof database. The candidate refuses public readiness, nonzero history,
  // body drift, unexpected function/table ACLs, and a non-BYPASSRLS invoker.
  await psql("postgres", "create database media_cart_public template postgres;");
  await refused(
    "media_cart_public",
    candidate,
    "RESEARCH_MEDIA_COMMERCE_PUBLIC_READINESS_PAUSE_REQUIRED",
  );
  await psql("postgres", "create database media_cart_image_domain template postgres;");
  await psql("media_cart_image_domain", `
    update public.research_required_inputs set domain='products',record_type='variant'
    where id='${ids.imageInput}';
    select public.research_transition_launch_status(
      'product_content',
      (select version from public.research_domain_launch_controls where domain='product_content'),
      'paused','synthetic-governance',array['super_admin'],
      'Pause before checking malformed legacy image governance.',clock_timestamp()
    );
  `);
  await refused(
    "media_cart_image_domain",
    candidate,
    "RESEARCH_MEDIA_COMMERCE_PUBLIC_READINESS_PAUSE_REQUIRED",
  );
  await psql("media_cart_image_domain", `
    select public.research_transition_launch_status(
      'products',
      (select version from public.research_domain_launch_controls where domain='products'),
      'paused','synthetic-governance',array['super_admin'],
      'Pause the old manifest affected by mislabelled primary imagery.',clock_timestamp()
    );
  `);
  await psql("media_cart_image_domain", candidate);
  assert.deepEqual(json(await psql("media_cart_image_domain", `
    select jsonb_object_agg(domain,jsonb_build_object(
      'approved',manifest_hash is not null,
      'releaseApproved',release_approved_by is not null,
      'status',launch_status,
      'auditCount',(select count(*) from public.research_domain_launch_audit a
        where a.domain=c.domain
          and a.actor='migration:20261003_research_media_commerce_decoupling')
    )) from public.research_domain_launch_controls c
    where domain in ('products','product_content');
  `)), {
    products: { approved: false, releaseApproved: false, status: "paused", auditCount: 1 },
    product_content: { approved: false, releaseApproved: false, status: "paused", auditCount: 1 },
  });
  process.stdout.write("BEFORE PASS malformed legacy image domain requires explicit pause and invalidates both affected approvals without enabling either domain.\n");
  await psql("postgres", "create database media_cart_rows template postgres;");
  await psql("media_cart_rows", `insert into public.research_persistent_carts(
    owner_kind,anonymous_hash,expires_at
  ) values('anonymous',repeat('9',64),now()+interval '1 day');`);
  await refused(
    "media_cart_rows",
    candidate,
    "RESEARCH_MEDIA_COMMERCE_CART_RECONCILIATION_REQUIRED",
  );
  assert.equal(
    await psql("media_cart_rows", "select count(*) from public.research_persistent_carts;"),
    "1",
  );
  await psql("postgres", "create database media_cart_drift template postgres;");
  await psql("media_cart_drift", `create or replace function
    public.research_persistent_cart_selection_current(
      p_owner_kind text,p_owner_identity text,p_selection jsonb
    )
    returns boolean language sql security definer set search_path=pg_catalog
    as $$select false$$;`);
  await refused(
    "media_cart_drift",
    candidate,
    "RESEARCH_MEDIA_COMMERCE_PREDECESSOR_DRIFT",
  );
  assert.equal(
    await psql("media_cart_drift", `select
      public.research_persistent_cart_selection_current('anonymous',repeat('a',64),'{}');`),
    "f",
  );
  await psql("postgres", "create database media_cart_function_acl template postgres;");
  await psql("media_cart_function_acl", `grant execute on function
    public.research_persistent_cart_put_item(
      text,text,uuid,bigint,bigint,integer,jsonb,text,timestamptz
    ) to media_acl_drift;`);
  await refused(
    "media_cart_function_acl",
    candidate,
    "RESEARCH_MEDIA_COMMERCE_FUNCTION_ACL_DRIFT",
  );
  await psql("postgres", "create database media_cart_table_acl template postgres;");
  await psql("media_cart_table_acl", `grant truncate on table
    public.research_persistent_cart_items to media_acl_drift;`);
  await refused(
    "media_cart_table_acl",
    candidate,
    "RESEARCH_MEDIA_COMMERCE_RLS_DRIFT",
  );
  await refused(
    "postgres",
    `set role media_migration_nobypass; ${candidate}`,
    "RESEARCH_MEDIA_COMMERCE_BYPASSRLS_REQUIRED",
  );
  process.stdout.write(
    "BEFORE PASS public readiness, nonzero history, function drift, ACL drift, and non-bypass apply all refuse atomically.\n",
  );

  await psql("postgres", `
    select public.research_transition_launch_status(
      'product_content',
      (select version from public.research_domain_launch_controls where domain='product_content'),
      'paused','synthetic-governance',array['super_admin'],
      'Pause before changing product-content readiness semantics.',clock_timestamp()
    );
    select public.research_transition_launch_status(
      'product_content',
      (select version from public.research_domain_launch_controls where domain='product_content'),
      'release_review','synthetic-governance',array['super_admin'],
      'Hold in release review for the media-decoupling candidate.',clock_timestamp()
    );
  `);
  assert.equal(
    await psql("postgres", `select launch_status from public.research_domain_launch_controls
      where domain='product_content';`),
    "release_review",
  );

  await psql("postgres", candidate);
  await refused("postgres", candidate, "RESEARCH_MEDIA_COMMERCE_PREDECESSOR_DRIFT");
  process.stdout.write("AFTER PASS candidate applied once; unregistered replay refused without duplicate audit.\n");

  const invalidatedGovernance = json(await psql("postgres", `select json_build_object(
    'launchStatus',c.launch_status,
    'manifestVersion',c.manifest_version,
    'manifestHash',c.manifest_hash,
    'expectedInputCount',c.expected_input_count,
    'manifestApprovedBy',c.manifest_approved_by,
    'manifestApprovedAt',c.manifest_approved_at,
    'releaseApprovedBy',c.release_approved_by,
    'releaseApprovedAt',c.release_approved_at,
    'updatedBy',c.updated_by,
    'manifestApproved',public.research_domain_readiness('product_content')->'manifestApproved',
    'publicEnabled',public.research_domain_readiness('product_content')->'publicEnabled'
  )::text from public.research_domain_launch_controls c
  where c.domain='product_content';`));
  assert.deepEqual(invalidatedGovernance, {
    launchStatus: "release_review",
    manifestVersion: null,
    manifestHash: null,
    expectedInputCount: null,
    manifestApprovedBy: null,
    manifestApprovedAt: null,
    releaseApprovedBy: null,
    releaseApprovedAt: null,
    updatedBy: "migration:20261003_research_media_commerce_decoupling",
    manifestApproved: false,
    publicEnabled: false,
  });
  const beforeNullManifestVersion = json(await psql("postgres", `select json_build_object(
    'version',c.version,'manifestHash',c.manifest_hash,
    'manifestApprovedBy',c.manifest_approved_by,
    'auditCount',(select count(*) from public.research_domain_launch_audit
      where domain='product_content')
  )::text from public.research_domain_launch_controls c
  where c.domain='product_content';`));
  await refused("postgres", `set role service_role; select
    public.research_set_readiness_manifest(
      'product_content',null::integer,2,1,true,'synthetic-governance',
      array['super_admin'],'Null expected version must refuse.',clock_timestamp()
    );`);
  const afterNullManifestVersion = json(await psql("postgres", `select json_build_object(
    'version',c.version,'manifestHash',c.manifest_hash,
    'manifestApprovedBy',c.manifest_approved_by,
    'auditCount',(select count(*) from public.research_domain_launch_audit
      where domain='product_content')
  )::text from public.research_domain_launch_controls c
  where c.domain='product_content';`));
  assert.deepEqual(afterNullManifestVersion, beforeNullManifestVersion);
  process.stdout.write("AFTER PASS null manifest expected-version refuses without control or audit mutation.\n");
  const approvedReadiness = json(await psql("postgres", `select
    public.research_set_readiness_manifest(
      'product_content',
      (select version from public.research_domain_launch_controls where domain='product_content'),
      2,1,true,'synthetic-governance',array['super_admin'],
      'Approve the reviewed non-image product-content manifest.',clock_timestamp()
    )::text;`));
  assert.equal(approvedReadiness.manifestApproved, true);
  assert.equal(approvedReadiness.expectedInputCount, 1);
  assert.equal(approvedReadiness.actualInputCount, 1);
  const releasedReadiness = json(await psql("postgres", `select
    public.research_transition_launch_status(
      'product_content',
      (select version from public.research_domain_launch_controls where domain='product_content'),
      'public_enabled','synthetic-release',array['super_admin'],
      'Explicitly re-enable reviewed non-image product-content readiness.',clock_timestamp()
    )::text;`));
  assert.equal(releasedReadiness.publicEnabled, true);
  assert.equal(releasedReadiness.manifestApproved, true);
  assert.equal(
    await psql("postgres", `select manifest_version::text||':'||manifest_approved_by||':'||release_approved_by
      from public.research_domain_launch_controls where domain='product_content';`),
    "2:synthetic-governance:synthetic-release",
  );
  process.stdout.write(
    "AFTER PASS migration invalidated governance; canonical manifest approval and separate release restored readiness.\n",
  );

  await psql("postgres", `
    create table public.media_test_selection(value jsonb not null);
    insert into public.media_test_selection values (${selectionExpression({ media: false })});
    create table public.media_test_member_selection(value jsonb not null);
    insert into public.media_test_member_selection values (${selectionExpression({ member: true, media: false })});
    create table public.media_test_clock(expires_at timestamptz not null);
    insert into public.media_test_clock values(clock_timestamp()+interval '1 day');
    grant select on public.media_test_selection,
      public.media_test_member_selection,
      public.media_test_clock to service_role;
  `);
  assert.equal(await psql("postgres", currentSql()), "t");
  const malformedSelections = [
    ["canonicalReadiness omitted", `value - 'canonicalReadiness'`],
    ["canonicalReadiness null", `jsonb_set(value,'{canonicalReadiness}','null'::jsonb)`],
    ["canonicalReadiness wrong type", `jsonb_set(value,'{canonicalReadiness}','[]'::jsonb)`],
    ["readiness ready omitted", `value #- '{canonicalReadiness,ready}'`],
    ["readiness ready null", `jsonb_set(value,'{canonicalReadiness,ready}','null'::jsonb)`],
    ["readiness ready wrong type", `jsonb_set(value,'{canonicalReadiness,ready}',to_jsonb('true'::text))`],
    ["verifiedInputCount omitted", `value #- '{canonicalReadiness,verifiedInputCount}'`],
    ["verifiedInputCount null", `jsonb_set(value,'{canonicalReadiness,verifiedInputCount}','null'::jsonb)`],
    ["verifiedInputCount wrong type", `jsonb_set(value,'{canonicalReadiness,verifiedInputCount}',to_jsonb('3'::text))`],
    ["inputVersions omitted", `value #- '{canonicalReadiness,inputVersions}'`],
    ["inputVersions null", `jsonb_set(value,'{canonicalReadiness,inputVersions}','null'::jsonb)`],
    ["inputVersions object", `jsonb_set(value,'{canonicalReadiness,inputVersions}','{}'::jsonb)`],
    ["inputVersions short", `jsonb_set(value,'{canonicalReadiness,inputVersions}',
      jsonb_build_array(value#>'{canonicalReadiness,inputVersions,0}'))`],
    ["inputVersions duplicate", `jsonb_set(value,'{canonicalReadiness,inputVersions}',
      jsonb_build_array(value#>'{canonicalReadiness,inputVersions,0}',
        value#>'{canonicalReadiness,inputVersions,0}',
        value#>'{canonicalReadiness,inputVersions,1}'))`],
    ["inputVersions unknown", `jsonb_set(value,'{canonicalReadiness,inputVersions}',
      jsonb_build_array(value#>'{canonicalReadiness,inputVersions,0}',
        value#>'{canonicalReadiness,inputVersions,1}',
        jsonb_build_object('id','50000000-0000-4000-8000-000000000098','version',1)))`],
    ["inputVersions malformed", `jsonb_set(value,'{canonicalReadiness,inputVersions}',
      jsonb_build_array(value#>'{canonicalReadiness,inputVersions,0}',
        value#>'{canonicalReadiness,inputVersions,1}',
        jsonb_build_object('id','${ids.storageInput}','version','1'))) `],
    ["domainVersions omitted", `value #- '{canonicalReadiness,domainVersions}'`],
    ["domainVersions null", `jsonb_set(value,'{canonicalReadiness,domainVersions}','null'::jsonb)`],
    ["domainVersions object", `jsonb_set(value,'{canonicalReadiness,domainVersions}','{}'::jsonb)`],
    ["domainVersions short", `jsonb_set(value,'{canonicalReadiness,domainVersions}',
      jsonb_build_array(value#>'{canonicalReadiness,domainVersions,0}'))`],
    ["domainVersions duplicate", `jsonb_set(value,'{canonicalReadiness,domainVersions}',
      jsonb_build_array(value#>'{canonicalReadiness,domainVersions,0}',
        value#>'{canonicalReadiness,domainVersions,0}'))`],
    ["domainVersions unknown", `jsonb_set(value,'{canonicalReadiness,domainVersions}',
      jsonb_build_array(value#>'{canonicalReadiness,domainVersions,0}',
        jsonb_build_object('domain','unknown','version',1)))`],
    ["domainVersions malformed", `jsonb_set(value,'{canonicalReadiness,domainVersions}',
      jsonb_build_array(value#>'{canonicalReadiness,domainVersions,0}',
        jsonb_build_object('domain','product_content','version','1'))) `],
    ["inventoryEligibility omitted", `value - 'inventoryEligibility'`],
    ["inventoryEligibility null", `jsonb_set(value,'{inventoryEligibility}','null'::jsonb)`],
    ["inventoryEligibility object malformed", `jsonb_set(value,'{inventoryEligibility}','{}'::jsonb)`],
    ["inventory state omitted", `value #- '{inventoryEligibility,state}'`],
    ["inventory productId omitted", `value #- '{inventoryEligibility,productId}'`],
    ["inventory variantId omitted", `value #- '{inventoryEligibility,variantId}'`],
    ["inventory sourceVersion omitted", `value #- '{inventoryEligibility,sourceVersion}'`],
    ["inventory evaluatedAt omitted", `value #- '{inventoryEligibility,evaluatedAt}'`],
    ["audienceEligibility omitted", `value - 'audienceEligibility'`],
    ["audienceEligibility null", `jsonb_set(value,'{audienceEligibility}','null'::jsonb)`],
    ["audienceEligibility object malformed", `jsonb_set(value,'{audienceEligibility}','{}'::jsonb)`],
    ["audience state omitted", `value #- '{audienceEligibility,state}'`],
    ["audience audience omitted", `value #- '{audienceEligibility,audience}'`],
    ["audience sourceVersion omitted", `value #- '{audienceEligibility,sourceVersion}'`],
    ["audience evaluatedAt omitted", `value #- '{audienceEligibility,evaluatedAt}'`],
    ["audience principalId omitted", `value #- '{audienceEligibility,principalId}'`],
    ["top-level audience omitted", `value - 'audience'`],
    ["top-level audience null", `jsonb_set(value,'{audience}','null'::jsonb)`],
    ["top-level evaluatedAt omitted", `value - 'evaluatedAt'`],
    ["top-level evaluatedAt null", `jsonb_set(value,'{evaluatedAt}','null'::jsonb)`],
    ["price expiresAt empty string", `jsonb_set(value,'{price,expiresAt}',to_jsonb(''::text))`],
  ];
  for (const [label, mutation] of malformedSelections) {
    assert.equal(
      await psql("postgres", currentSql(`(select ${mutation} from public.media_test_selection)`)),
      "f",
      label,
    );
  }
  assert.equal(
    await psql("postgres", `select public.research_persistent_cart_selection_current(
      null,repeat('a',64),(select value from public.media_test_selection));`),
    "f",
    "null owner kind must fail closed",
  );
  assert.equal(
    await psql("postgres", `select public.research_persistent_cart_selection_current(
      'anonymous',null,(select value from public.media_test_selection));`),
    "f",
    "null owner identity must fail closed",
  );
  process.stdout.write(
    "AFTER PASS missing, null, wrong-type, short, duplicate, unknown, and malformed selection contracts all return false.\n",
  );
  for (const media of [
    "null",
    `to_jsonb('legacy-string'::text)`,
    `'{"id":"not-a-uuid","state":"rejected"}'::jsonb`,
    `'{"id":"${ids.media}","state":"approved","bytes":"changed"}'::jsonb`,
  ]) {
    assert.equal(
      await psql("postgres", currentSql(`
        (select value || jsonb_build_object('media',${media}) from public.media_test_selection)
      `)),
      "t",
      `Media payload must be ignored: ${media}`,
    );
  }
  await expectCurrentAfter(
    "rejected product_media row cannot affect eligibility",
    `update public.research_product_media set state='rejected',approved_by=null,approved_at=null
      where id='${ids.media}';`,
    "t",
  );
  await expectCurrentAfter(
    "absent product_media row cannot affect eligibility",
    `delete from public.research_product_media where id='${ids.media}';`,
    "t",
  );

  const readinessBaseline = json(await psql("postgres", `
    select public.research_domain_readiness('product_content')::text;
  `));
  for (const state of ["missing", "under_review", "rejected", "expired", "superseded", "verified"]) {
    const output = await psql("postgres", `begin;
      update public.research_required_inputs set current_state='${state}'
      where id='${ids.imageInput}';
      select public.research_domain_readiness('product_content')::text;
      ${currentSql()}
      rollback;`);
    const changed = json(output);
    assert.deepEqual(changed, readinessBaseline, `Image state ${state} changed domain readiness`);
    assert.equal(output.split(/\r?\n/).filter(Boolean).at(-1), "t", `Image state ${state} changed eligibility`);
  }
  const blockingLevels = [
    "informational",
    "blocks_display",
    "blocks_transaction",
    "blocks_fulfillment",
    "blocks_public_launch",
    "blocks_clinical_activation",
    "blocks_provider_activation",
  ];
  for (const blockingLevel of blockingLevels) {
    const output = await psql("postgres", `begin;
      update public.research_required_inputs
      set current_state='verified',blocking_level='${blockingLevel}'
      where id='${ids.imageInput}';
      select public.research_domain_readiness('product_content')::text;
      ${currentSql()}
      rollback;`);
    assert.deepEqual(
      json(output),
      readinessBaseline,
      `Image blocking level ${blockingLevel} changed domain readiness`,
    );
    assert.equal(
      output.split(/\r?\n/).filter(Boolean).at(-1),
      "t",
      `Image blocking level ${blockingLevel} changed eligibility`,
    );
  }
  const absentImageInput = await psql("postgres", `begin;
    update public.research_required_inputs set record_id=null
    where id='${ids.imageInput}';
    select public.research_domain_readiness('product_content')::text;
    ${currentSql()}
    rollback;`);
  assert.deepEqual(json(absentImageInput), readinessBaseline);
  assert.equal(absentImageInput.split(/\r?\n/).filter(Boolean).at(-1), "t");
  assert.equal(readinessBaseline.manifestApproved, true);
  assert.equal(readinessBaseline.expectedInputCount, 1);
  assert.equal(readinessBaseline.actualInputCount, 1);
  assert.equal(readinessBaseline.blockingInputCount, 0);
  process.stdout.write("AFTER PASS zero product binding, image state, active-count, and every permitted blocker level cannot affect readiness or eligibility.\n");

  const domainReadinessSql = `select jsonb_build_object(
    'products',public.research_domain_readiness('products'),
    'product_content',public.research_domain_readiness('product_content')
  )::text;`;
  const domainReadiness = json(await psql("postgres", domainReadinessSql));
  for (const [label, mutation] of [
    ["wrong domain", "domain='products'"],
    ["unknown domain", "domain='malformed_presentation'"],
    ["wrong record type", "record_type='variant'"],
    ["wrong domain and record type", "domain='products',record_type='variant'"],
    ["wrong field path", "field_path='price.amountCents'"],
    ["changed version", "version=version+99"],
    ["different product binding", "record_id='10000000-0000-4000-8000-000000000099'"],
  ]) {
    const output = await psql("postgres", `begin;
      update public.research_required_inputs set ${mutation},current_state='missing'
      where id='${ids.imageInput}';
      ${domainReadinessSql}
      ${currentSql()}
      rollback;`);
    assert.deepEqual(json(output), domainReadiness, `Image ${label} changed domain readiness`);
    assert.equal(output.split(/\r?\n/).filter(Boolean).at(-1), "t", `Image ${label} changed cart eligibility`);
  }
  process.stdout.write("AFTER PASS malformed primary-image domain, record type, field, version, and product binding cannot change either domain or cart authority.\n");

  const authorityExpression = `jsonb_build_object(
    'controls',(select jsonb_agg(to_jsonb(c) order by c.domain)
      from public.research_domain_launch_controls c),
    'product',(select to_jsonb(p) from public.research_products p where p.id='${ids.product}'),
    'nonImageInputs',(select jsonb_agg(to_jsonb(i) order by i.id)
      from public.research_required_inputs i where i.key<>'product_content.primary_image')
  )`;
  const authorityBaseline = json(await psql("postgres", `select ${authorityExpression}::text;`));
  const authorityReceiptSql = `select jsonb_build_object(
    'authority',${authorityExpression},
    'eligible',public.research_persistent_cart_selection_current(
      'anonymous',repeat('a',64),(select value from public.media_test_selection))
  )::text;`;
  const imageInputLifecycle = ["expired", "entered", "under_review", "rejected", "entered", "under_review", "verified", "superseded"];
  const imageInputReceipts = (await psql("postgres", `begin;
    ${imageInputLifecycle.map((state) => `
      select (public.research_transition_required_input(
        '${ids.imageInput}',
        (select version from public.research_required_inputs where id='${ids.imageInput}'),
        '${state}','${["verified", "rejected"].includes(state) ? "synthetic-reviewer" : "synthetic-inputter"}',
        array['super_admin'],'Synthetic image lifecycle must remain presentation only.',
        ${state === "entered" ? "'{\"filename\":\"synthetic.webp\"}'::jsonb" : "null::jsonb"},
        null,clock_timestamp()
      )).id;
      ${authorityReceiptSql}
    `).join("\n")}
    rollback;`)).split(/\r?\n/).filter((line) => line.startsWith("{")).map(JSON.parse);
  assert.equal(imageInputReceipts.length, imageInputLifecycle.length);
  imageInputReceipts.forEach((receipt, index) => {
    assert.deepEqual(receipt, { authority: authorityBaseline, eligible: true }, `Primary-image ${imageInputLifecycle[index]} RPC changed commerce authority`);
  });

  const mediaReceipts = (await psql("postgres", `begin;
    select public.research_admin_update_product_media(
      '${ids.product}','${ids.media}','archived','Synthetic image',0,
      'Archive synthetic presentation.','synthetic-reviewer',clock_timestamp());
    ${authorityReceiptSql}
    create temporary table media_lifecycle_upload as
      select * from public.research_admin_prepare_product_media(
        '${ids.product}',jsonb_build_object('kind','primary_image','filename','synthetic-new.webp',
          'contentType','image/webp','sizeBytes',128,'altText','Synthetic new image','sortOrder',0),
        'synthetic-uploader',clock_timestamp());
    ${authorityReceiptSql}
    select public.research_admin_confirm_product_media(
      '${ids.product}',(select id from media_lifecycle_upload),'synthetic-uploader',clock_timestamp());
    ${authorityReceiptSql}
    ${["in_review", "rejected", "in_review", "approved", "archived"].map((state) => `
      select public.research_admin_update_product_media(
        '${ids.product}',(select id from media_lifecycle_upload),'${state}','Synthetic new image',0,
        'Synthetic media lifecycle must remain presentation only.','synthetic-reviewer',clock_timestamp());
      ${authorityReceiptSql}
    `).join("\n")}
    rollback;`)).split(/\r?\n/).filter((line) => line.startsWith("{")).map(JSON.parse);
  assert.equal(mediaReceipts.length, 8);
  for (const receipt of mediaReceipts) {
    assert.deepEqual(receipt, { authority: authorityBaseline, eligible: true }, "Product-media RPC changed parent product or domain approval");
  }
  process.stdout.write("AFTER PASS eight required-input and eight media RPC lifecycle states preserve parent product, non-image inputs, full domain approvals/versions, and cart eligibility.\n");

  await expectCurrentAfter(
    "storage-information required input remains fail-closed",
    `update public.research_required_inputs set current_state='missing'
      where id='${ids.storageInput}';`,
  );
  const storageBlocked = json(await psql("postgres", `begin;
    update public.research_required_inputs set current_state='missing'
    where id='${ids.storageInput}';
    select public.research_domain_readiness('product_content')::text;
    rollback;`));
  assert.equal(storageBlocked.realInputsRequired, true);
  assert.equal(storageBlocked.blockingInputCount, 1);
  assert.deepEqual(storageBlocked.blockingKeys, ["product_content.storage_information"]);
  await psql("postgres", `insert into public.research_required_inputs(
    id,key,domain,label,description,why_required,record_type,record_id,field_path,
    current_state,blocking_level,responsible_role,verification_method,evidence_required,
    entered_by,entered_at,verified_by,verified_at,public_launch_impact,next_action,
    admin_entry_href,version,created_by
  ) values(
    '50000000-0000-4000-8000-000000000099','product_content.unknown_commerce_fact',
    'product_content','UNKNOWN COMMERCE FACT','Synthetic unknown fact','Must fail closed',
    'product','${ids.product}','unknown','verified','blocks_display','product_admin',
    'Synthetic verification','[]','synthetic',now(),'reviewer',now(),'Blocks commerce',
    'Reconcile fact','/admin/products',1,'synthetic'
  );`);
  for (const blockingLevel of blockingLevels) {
    await psql("postgres", `update public.research_required_inputs
      set current_state='verified',blocking_level='${blockingLevel}'
      where key='product_content.unknown_commerce_fact';`);
    assert.equal(
      await psql("postgres", currentSql()),
      "f",
      `Unknown active non-image row with ${blockingLevel} must fail closed`,
    );
  }
  const unknownBlocked = json(await psql("postgres", `
    select public.research_domain_readiness('product_content')::text;
  `));
  assert.equal(unknownBlocked.manifestApproved, false);
  assert.equal(unknownBlocked.actualInputCount, 2);
  await expectCurrentAfter(
    "an image-like unknown key is not the reserved primary-image exemption",
    `update public.research_required_inputs set key='product_content.primary_image.extra'
      where key='product_content.unknown_commerce_fact';`,
  );
  await psql("postgres", `update public.research_required_inputs set current_state='superseded'
    where key='product_content.unknown_commerce_fact';`);
  assert.equal(await psql("postgres", currentSql()), "t");
  process.stdout.write("AFTER PASS exact storage fact remains required; every active unknown non-image blocker class fails closed.\n");

  const malformedInput = `(select jsonb_set(value,'{canonicalReadiness,inputVersions}',
    jsonb_build_array(
      jsonb_build_object('id','${ids.skuInput}','version',1),
      jsonb_build_object('id','${ids.familyInput}','version',1),
      jsonb_build_object('id','${ids.imageInput}','version',2)
    )) from public.media_test_selection)`;
  assert.equal(await psql("postgres", currentSql(malformedInput)), "f");
  process.stdout.write("AFTER PASS primary-image input cannot substitute for the three exact non-image inputs.\n");

  await expectCurrentAfter(
    "product publication/approval gate remains fail-closed",
    `update public.research_products set visibility_state='hidden',commerce_approval='blocked_by_documentation'
      where id='${ids.product}';`,
  );
  await expectCurrentAfter(
    "variant approval/active gate remains fail-closed",
    `update public.research_product_variants set active=false where id='${ids.variant}';`,
  );
  await expectCurrentAfter(
    "price approval/effective authority remains fail-closed",
    `update public.research_product_prices set status='expired' where id='${ids.retailPrice}';`,
  );
  await expectCurrentAfter(
    "domain launch-control version/status gate remains fail-closed",
    `update public.research_domain_launch_controls set launch_status='disabled'
      where domain='products';`,
  );
  await expectCurrentAfter(
    "inventory availability gate remains fail-closed",
    `update public.research_inventory_lots set disposition='quality_hold',version=version+1,
      updated_at=clock_timestamp() where id='${ids.lot}';`,
  );
  await expectCurrentAfter(
    "COA/document authority remains fail-closed",
    `select set_config('xenios.quality_command','allowed',false);
     update public.research_lot_quality_documents
     set document_state='withdrawn',verification_state='withdrawn',
       withdrawn_at=clock_timestamp(),withdrawn_by='reviewer',version=version+1
     where id='${ids.document}';`,
  );
  await expectCurrentAfter(
    "lot quality-test authority remains fail-closed",
    `select set_config('xenios.quality_command','allowed',false);
     update public.research_lot_quality_tests
     set state='failed',method='Synthetic failure',result='Fail',
       reviewed_by='reviewer',reviewed_at=clock_timestamp(),updated_at=clock_timestamp()
     where quality_document_id='${ids.document}' and test_key='identity';`,
  );
  assert.equal(
    await psql("postgres", `begin;
      update public.research_members set status='suspended' where id='${ids.member}';
      select public.research_persistent_cart_selection_current(
        'member','${ids.member}',(select value from public.media_test_member_selection));
      rollback;`),
    "f",
  );
  assert.equal(
    await psql("postgres", `select public.research_persistent_cart_selection_current(
      'anonymous',repeat('a',64),(select value from public.media_test_member_selection));`),
    "f",
  );
  process.stdout.write("AFTER PASS product, variant, price, audience/member, domain, inventory, COA and quality gates preserved.\n");

  const putSelectionA = `(select value || jsonb_build_object('media',
    jsonb_build_object('id','${ids.media}','bytes','legacy-a')) from public.media_test_selection)`;
  const putSelectionB = `(select value || jsonb_build_object('media',
    jsonb_build_object('id','not-a-uuid','bytes','legacy-b')) from public.media_test_selection)`;
  for (const [label, argumentsSql] of [
    ["null put owner kind", `null::text,repeat('8',64),null,null,null,1,
      (select value from public.media_test_selection),repeat('8',64),
      (select expires_at from public.media_test_clock)`],
    ["null put quantity", `'anonymous',repeat('8',64),null,null,null,null,
      (select value from public.media_test_selection),repeat('8',64),
      (select expires_at from public.media_test_clock)`],
    ["null put selection", `'anonymous',repeat('8',64),null,null,null,1,
      null::jsonb,repeat('8',64),(select expires_at from public.media_test_clock)`],
    ["null put idempotency", `'anonymous',repeat('8',64),null,null,null,1,
      (select value from public.media_test_selection),null::text,
      (select expires_at from public.media_test_clock)`],
    ["null put expiry", `'anonymous',repeat('8',64),null,null,null,1,
      (select value from public.media_test_selection),repeat('8',64),null::timestamptz`],
    ["empty selection price expiry", `'anonymous',repeat('8',64),null,null,null,1,
      (select jsonb_set(value,'{price,expiresAt}',to_jsonb(''::text))
        from public.media_test_selection),repeat('8',64),
      (select expires_at from public.media_test_clock)`],
  ]) {
    await refused("postgres", `set role service_role; select
      public.research_persistent_cart_put_item(${argumentsSql});`);
    process.stdout.write(`PASS ${label} refused before mutation.\n`);
  }
  assert.equal(
    await psql("postgres", `select count(*) from public.research_persistent_carts
      where anonymous_hash=repeat('8',64);`),
    "0",
  );
  const putCall = (selection) => `set role service_role;
    select public.research_persistent_cart_put_item(
      'anonymous',repeat('1',64),null,null,null,2,${selection},repeat('2',64),
      (select expires_at from public.media_test_clock)
    )::text;`;
  const firstPut = json(await psql("postgres", putCall(putSelectionA)));
  const replayPut = json(await psql("postgres", putCall(putSelectionB)));
  assert.deepEqual(replayPut, firstPut);
  const putStored = json(await psql("postgres", `select json_build_object(
    'mediaPresent',selection_snapshot ? 'media',
    'inputs',jsonb_array_length(selection_snapshot->'canonicalReadiness'->'inputVersions'),
    'hashMatches',selection_hash=encode(extensions.digest(
      convert_to(selection_snapshot::text,'utf8'),'sha256'),'hex'),
    'commands',(select count(*) from public.research_persistent_cart_commands where action='put')
  )::text from public.research_persistent_cart_items i
  join public.research_persistent_carts c on c.id=i.cart_id
  where c.anonymous_hash=repeat('1',64);`));
  assert.deepEqual(putStored, { mediaPresent: false, inputs: 3, hashMatches: true, commands: 1 });
  process.stdout.write("AFTER PASS put command hash/replay/snapshot/hash canonicalize legacy media away.\n");

  await psql("postgres", `insert into public.research_persistent_carts(
    owner_kind,anonymous_hash,expires_at
  ) values('anonymous',repeat('6',64),clock_timestamp()+interval '1 day');`);
  for (const [label, memberId, selections, anonymousVersion] of [
    ["null claim selections", `'${ids.claimMember}'`, "null::jsonb", "1::bigint"],
    ["empty claim selections", `'${ids.claimMember}'`, "'[]'::jsonb", "1::bigint"],
    ["null anonymous version", `'${ids.claimMember}'`,
      `jsonb_build_array((select value from public.media_test_selection))`, "null::bigint"],
    ["null claim member", "null::uuid",
      `jsonb_build_array((select value from public.media_test_selection))`, "1::bigint"],
  ]) {
    await refused("postgres", `set role service_role; select
      public.research_persistent_cart_claim(
        ${memberId},repeat('6',64),${selections},${anonymousVersion},
        null,null,repeat('6',64),(select expires_at from public.media_test_clock)
      );`);
    process.stdout.write(`PASS ${label} refused before mutation.\n`);
  }
  const emptyClaimCart = json(await psql("postgres", `select json_build_object(
    'state',c.state,'version',c.version,
    'items',(select count(*) from public.research_persistent_cart_items i where i.cart_id=c.id),
    'commands',(select count(*) from public.research_persistent_cart_commands k where k.cart_id=c.id),
    'events',(select count(*) from public.research_persistent_cart_events e where e.cart_id=c.id)
  )::text from public.research_persistent_carts c where c.anonymous_hash=repeat('6',64);`));
  assert.deepEqual(emptyClaimCart, {
    state: "active",
    version: 1,
    items: 0,
    commands: 0,
    events: 0,
  });
  process.stdout.write("AFTER PASS claim null/empty inputs and null optimistic-concurrency scalars refuse without mutation.\n");

  const anonPut = `set role service_role;
    select public.research_persistent_cart_put_item(
      'anonymous',repeat('3',64),null,null,null,1,${putSelectionA},repeat('4',64),
      (select expires_at from public.media_test_clock)
    )::text;`;
  await psql("postgres", anonPut);
  const claimCall = (selection) => `set role service_role;
    select public.research_persistent_cart_claim(
      '${ids.claimMember}',repeat('3',64),jsonb_build_array(${selection}),2,
      null,null,repeat('5',64),(select expires_at from public.media_test_clock)
    )::text;`;
  const firstClaim = json(await psql("postgres", claimCall(putSelectionA)));
  const replayClaim = json(await psql("postgres", claimCall(putSelectionB)));
  assert.deepEqual(replayClaim, firstClaim);
  const claimStored = json(await psql("postgres", `select json_build_object(
    'mediaPresent',i.selection_snapshot ? 'media',
    'inputs',jsonb_array_length(i.selection_snapshot->'canonicalReadiness'->'inputVersions'),
    'hashMatches',i.selection_hash=encode(extensions.digest(
      convert_to(i.selection_snapshot::text,'utf8'),'sha256'),'hex'),
    'claimCommands',(select count(*) from public.research_persistent_cart_commands where action='claim')
  )::text from public.research_persistent_cart_items i
  join public.research_persistent_carts c on c.id=i.cart_id
  where c.member_id='${ids.claimMember}';`));
  assert.deepEqual(claimStored, {
    mediaPresent: false,
    inputs: 3,
    hashMatches: true,
    claimCommands: 1,
  });
  process.stdout.write("AFTER PASS claim command hash/replay/snapshot/hash canonicalize legacy media away.\n");

  for (const role of ["anon", "authenticated", "service_role"]) {
    await refused(
      "postgres",
      `set role ${role}; select public.research_persistent_cart_selection_current(
        'anonymous',repeat('a',64),(select value from public.media_test_selection));`,
    );
    await refused(
      "postgres",
      `set role ${role}; update public.research_persistent_cart_items set quantity=3;`,
    );
    if (role !== "service_role") {
      await refused(
        "postgres",
        `set role ${role}; select public.research_persistent_cart_put_item(
          'anonymous',repeat('8',64),null,null,null,1,
          (select value from public.media_test_selection),repeat('8',64),
          (select expires_at from public.media_test_clock));`,
      );
    }
  }
  assert.equal(
    await psql("postgres", `select bool_and(relrowsecurity and relforcerowsecurity)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in (
        'research_persistent_carts','research_persistent_cart_items',
        'research_persistent_cart_commands','research_persistent_cart_events');`),
    "t",
  );
  process.stdout.write("AFTER PASS helper privacy, service-only bounded RPCs, forced RLS and direct-DML denial preserved.\n");
  process.stdout.write(
    `CANDIDATE_SHA256 ${createHash("sha256").update(candidate.replace(/\r\n/g, "\n")).digest("hex")}\n`,
  );
  process.stdout.write("LOCAL_PROOF_PASS media is presentation-only; all named non-image commerce gates remain authoritative.\n");
} catch (error) {
  process.stderr.write(`LOCAL_PROOF_FAILURE ${error.message}\n${error.stderr ?? ""}\n`);
  throw error;
} finally {
  if (containerId && /^[0-9a-f]{64}$/.test(containerId)) {
    await runFile("docker", ["rm", "-f", containerId], { windowsHide: true });
    process.stdout.write("CLEANUP removed only this proof's disposable container and tmpfs database.\n");
  }
}
