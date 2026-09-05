/** Offline PostgreSQL/WASM rehearsal. No connection strings or remote database calls.
 * Usage: node scripts/revenue-launch/rehearse-price-tiers.mjs <absolute pglite module path>
 * Install PGlite 0.5.8 in a disposable directory, not the application dependency tree.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
assert(modulePath && isAbsolute(modulePath), 'Provide an absolute local PGlite module path');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite(); // In-memory PostgreSQL; no sockets, credentials or production state.
const baselinePath = 'supabase/migrations/20260726143000_research_product_control_center.sql';
const baseline = execFileSync('git', ['show', `HEAD:${baselinePath}`], { encoding: 'utf8' });
const baselineHash = createHash('sha256').update(baseline).digest('hex');
assert.equal(baselineHash, 'b1589eb24405d4700206d25541b647479afee34c2cd05422da70df2179876203');
const candidatePath = 'supabase/candidates/20260905_research_product_price_quantity_tiers.sql';
const candidate = readFileSync(resolve(candidatePath), 'utf8');
const hash = (text) => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
const section = (start, end) => baseline.slice(baseline.indexOf(start), baseline.indexOf(end));
let checks = 0;
const checked = () => { checks += 1; };
const product = '10000000-0000-4000-8000-000000000001';
const variant = '20000000-0000-4000-8000-000000000001';
const at = '2026-09-05T12:00:00Z';
const input = {
  variantId: variant, audience: 'retail', amountCents: 1000, currency: 'USD', effectiveAt: at,
  quantityTiers: [{ minimumQuantity: 1, amountCents: 1000 }, { minimumQuantity: 5, amountCents: 900 }, { minimumQuantity: 10, amountCents: 800 }],
};
async function create(value = input, actor = 'admin@example.invalid', rpc = 'research_admin_create_tiered_product_price') {
  assert(['research_admin_create_tiered_product_price','research_admin_create_product_price'].includes(rpc));
  return db.query(`select public.${rpc}($1::uuid,$2::jsonb,$3::text,$4::timestamptz)`, [product, value, actor, at]);
}
async function refused(action, pattern) { await assert.rejects(action, pattern); checked(); }

try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.research_products (id uuid primary key);
    create table public.research_product_variants (id uuid primary key, product_id uuid references public.research_products, status text, active boolean);
    insert into public.research_products values ('${product}');
    insert into public.research_product_variants values ('${variant}','${product}','approved',true);`);
  // Use exact canonical economic table, trigger, audit and RPC definitions.
  // Product/variant parent tables above are deliberately minimal prerequisites.
  await db.exec(section('create table if not exists public.research_product_prices', 'create table if not exists public.research_product_media'));
  await db.exec(section('create table if not exists public.research_product_admin_audit', 'alter table public.research_product_content'));
  await db.exec(section('create or replace function public.research_admin_create_product_price(', 'create or replace function public.research_admin_prepare_product_media('));
  await db.exec(`revoke all on function public.research_admin_create_product_price(uuid,jsonb,text,timestamptz) from public,anon,authenticated;
    grant execute on function public.research_admin_create_product_price(uuid,jsonb,text,timestamptz) to service_role;`);
  const legacy = { ...input }; delete legacy.quantityTiers;
  await create(legacy, 'admin@example.invalid', 'research_admin_create_product_price');
  const before = (await db.query('select * from public.research_product_prices')).rows[0];
  await refused(() => create(), /does not exist/);
  assert.equal((await db.query('select count(*)::int n from public.research_product_prices')).rows[0].n, 1); checked();

  await db.exec(candidate);
  const migrated = (await db.query('select * from public.research_product_prices')).rows[0];
  const { quantity_tiers: legacyTiers, ...legacyAfter } = migrated;
  assert.deepEqual(legacyAfter, before); assert.deepEqual(legacyTiers, []); checked();
  await db.exec('set role service_role');
  await create();
  await db.exec('reset role');
  let prices = (await db.query('select * from public.research_product_prices order by version')).rows;
  assert.equal(prices.length, 2); assert.equal(prices[1].version, 2);
  assert.equal(prices[1].status, 'draft'); assert.deepEqual(prices[1].quantity_tiers, input.quantityTiers); checked();
  assert.equal((await db.query("select count(*)::int n from public.research_product_admin_audit where action='price_created'")).rows[0].n, 2); checked();
  const newId = prices[1].id;

  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await refused(() => create(), /permission denied/);
    await refused(() => create(input, 'admin@example.invalid', 'research_admin_create_product_price'), /permission denied/);
    await db.exec('reset role');
  }
  for (const quantityTiers of [null, {}, [],
    [{ minimumQuantity: 5, amountCents: 1000 }],
    [{ minimumQuantity: 1, amountCents: 999 }],
    [...input.quantityTiers, { minimumQuantity: 10, amountCents: 700 }],
    [...input.quantityTiers, { minimumQuantity: 11, amountCents: 900 }],
    [{ minimumQuantity: 1, amountCents: '1000' }],
    [{ minimumQuantity: 1, amountCents: 1000, cost: 1 }],
    [{ minimumQuantity: 1, amountCents: 1000 }, { minimumQuantity: 1.5, amountCents: 900 }],
    [{ minimumQuantity: 1, amountCents: 1000 }, { minimumQuantity: 5, amountCents: 0 }],
    [{ minimumQuantity: 1, amountCents: 1000 }, { minimumQuantity: 9007199254740992, amountCents: 900 }],
  ]) await refused(() => create({ ...input, quantityTiers }), /quantity ladder required|quantity_tiers_valid/);
  await refused(() => create(input, ''), /actor and observation time required/);
  assert.equal((await db.query('select count(*)::int n from public.research_product_prices')).rows[0].n, 2); checked();
  assert.equal((await db.query('select count(*)::int n from public.research_product_admin_audit')).rows[0].n, 2); checked();

  for (const [field, value] of [['quantity_tiers', JSON.stringify([{ minimumQuantity: 1, amountCents: 1000 }])], ['amount_cents', 1], ['effective_at', '2026-09-06T12:00:00Z']]) {
    await refused(() => db.query(`update public.research_product_prices set ${field}=$1 where id=$2`, [value, newId]), /economic history is immutable/);
  }
  await refused(() => db.query('delete from public.research_product_prices where id=$1', [newId]), /append-only/);
  await db.query('select public.research_admin_approve_product_price($1,$2,$3,$4)', [product, newId, 'approver@example.invalid', at]);
  prices = (await db.query('select * from public.research_product_prices order by version')).rows;
  assert.equal(prices[1].status, 'active'); assert.equal(prices[1].approved_by, 'approver@example.invalid');
  assert.deepEqual(prices[1].quantity_tiers, input.quantityTiers); checked();
  await create({ ...input, amountCents: 950, quantityTiers: [{ minimumQuantity: 1, amountCents: 950 }, { minimumQuantity: 5, amountCents: 850 }] });
  const next = (await db.query('select * from public.research_product_prices where version=3')).rows[0];
  await db.query('select public.research_admin_approve_product_price($1,$2,$3,$4)', [product, next.id, 'approver@example.invalid', at]);
  const previous = (await db.query('select * from public.research_product_prices where id=$1', [newId])).rows[0];
  assert.equal(previous.status, 'superseded'); assert.deepEqual(previous.quantity_tiers, input.quantityTiers); checked();
  assert.equal((await db.query("select count(*)::int n from public.research_product_prices where status='active'")).rows[0].n, 1); checked();

  const postcheck = readFileSync(resolve('supabase/candidates/20260905_research_product_price_quantity_tiers.postcheck.sql'), 'utf8');
  for (const result of await db.exec(postcheck)) {
    for (const row of result.rows) for (const value of Object.values(row)) { assert.equal(value, true); checked(); }
  }

  console.log(JSON.stringify({ status: 'PASS', checks, engine: (await db.query('select version() as version')).rows[0].version,
    baselinePath, baselineGitBlobSha256: baselineHash, candidatePath, candidateLfSha256: hash(candidate),
    productionMutated: false, scope: 'Isolated SQL engine; canonical price/audit/RPC baseline with minimal product/variant parent fixtures. No production schema parity, live RLS policies, concurrent-session or remote integration attestation.' }, null, 2));
} finally { await db.close(); }
