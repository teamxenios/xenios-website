// Source-only synthetic proof. Creates one disposable no-network/no-port
// PostgreSQL container and removes only that container in finally. No hosted
// connection, credentials, email, bank records or managed migration history.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

assert.equal(process.version, "v20.19.0", "Run with the isolated pinned Node runtime");
const runFile = promisify(execFile);
const containerName = `xenios-hl12-provider-hold-${process.pid}-local`;
const migrationPath = "supabase/migrations/20260930234614_research_assisted_order_quote_provider_hold.sql";
const migration = await readFile(migrationPath, "utf8");
const predecessorPaths = [
  "supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql",
  "supabase/migrations/20260815150000_research_assisted_order_bridge.sql",
  "supabase/migrations/20260930191323_research_assisted_order_quote_payment_guard.sql",
  "supabase/migrations/20260930193033_research_assisted_order_quote_paid_hold.sql",
  "supabase/migrations/20260930202413_research_assisted_order_quote_payment_authority.sql",
  "supabase/migrations/20260930205725_research_assisted_order_quote_access_finance_bound.sql",
  "supabase/migrations/20260930230541_research_assisted_order_quote_evidence_corrections.sql",
];
const id = (prefix, suffix) => `${prefix}0000000-0000-4000-8000-0000000000${suffix}`;
const request = (n) => id(1, n);
const member = (n) => id(2, n);
const line = (n) => id(3, n);
const actor = id(4, 42);
const reference = (n) => `XRR-20260930-ABCDEF00${n}`;
const observedAt = "2026-09-30T23:00:00.000Z";
const holdDetail = "ASSISTED_ORDER_PROVIDER_AUTHORITY_NOT_READY";
let containerId;

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", containerId, "psql", "-X", "-q", "-A", "-t",
      "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 30_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(Object.assign(new Error(`Disposable psql exited ${code}`), { code, stdout, stderr }));
    });
    child.stdin.end(`\\set VERBOSITY verbose\n${sql}\n`);
  });
}
function receipt(output) {
  const value = output.split(/\r?\n/).filter((row) => row.startsWith("{")).at(-1);
  assert.ok(value, "Expected a structured SQL result");
  return JSON.parse(value);
}
async function refused(sql, state, detail) {
  let failure;
  try { await psql(sql); } catch (error) { failure = error; }
  assert.ok(failure, `Expected SQLSTATE ${state}`);
  assert.match(failure.stderr ?? "", new RegExp(`ERROR:\\s+${state}:`));
  if (detail) assert.match(failure.stderr, new RegExp(`DETAIL:\\s+${detail}(?:\\r?\\n|$)`));
  return failure;
}
function fixtureSql(n) {
  return `insert into public.research_assisted_order_requests (
    id,public_reference,idempotency_key_hash,request_fingerprint,actor_member_id,
    normalized_email,full_legal_name,mobile_phone,shipping_address,billing_address,
    age_confirmed,source,status
  ) values ('${request(n)}','${reference(n)}','synthetic-provider-hold-key${n}',
    'synthetic-provider-hold-fp${n}','${member(n)}','synthetic-hold${n}@example.test',
    'Synthetic Hold Buyer','+100000000${n}',
    '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}',
    '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}',
    true,'early_access_manual_order_bridge','reviewing');
  insert into public.research_assisted_order_lines (
    id,request_id,product_id,variant_id,product_name,quantity,minimum_quantity,
    quantity_increment,workflow_mode,customer_action_label,unit_price_cents,
    line_estimate_cents,catalog_version,authoritative_fingerprint
  ) values ('${line(n)}','${request(n)}','P-HOLD${n}','V-HOLD${n}','Synthetic hold item',
    2,1,1,'direct_order_request','Request order',2500,5000,'cat-hold','fp-hold');
  set local role service_role;
  select (public.research_assisted_order_quote_issue('${request(n)}',
    '[{"lineId":"${line(n)}"}]',now()+interval '1 day','synthetic-admin')->>'quoteId') as quote${n} \\gset
  select public.research_assisted_order_quote_accept(:'quote${n}',1,5000,'${member(n)}');
  select public.research_assisted_order_set_status('${request(n)}','reviewing','payment_pending','synthetic-admin','admin');
  select public.research_assisted_order_set_status('${request(n)}','payment_pending','payment_review','synthetic-admin','admin');
  reset role;`;
}
function providerSql(n, quoteExpression, evidence = `synthetic-forged-evidence${n}`) {
  return `public.research_assisted_order_payment_observe('${request(n)}',${quoteExpression},
    'provider',5000,'USD','synthetic-pi-forged${n}','${evidence}','${observedAt}',null,
    'synthetic-unconfigured-provider','synthetic-evt-forged${n}','synthetic-pi-forged${n}')`;
}
async function snapshot() {
  return receipt(await psql(`select json_build_object(
    'requests',(select count(*) from public.research_assisted_order_requests),
    'quotes',(select count(*) from public.research_assisted_order_quotes),
    'events',(select count(*) from public.research_assisted_order_events),
    'observations',(select count(*) from public.research_assisted_order_payment_observations),
    'verifications',(select count(*) from public.research_assisted_order_payment_verifications),
    'claims',(select count(*) from public.research_assisted_order_evidence_claims),
    'observeBody',md5(pg_get_functiondef('public.research_assisted_order_payment_observe(uuid,uuid,text,bigint,text,text,text,timestamptz,uuid,text,text,text)'::regprocedure)),
    'verifyBody',md5(pg_get_functiondef('public.research_assisted_order_payment_verify(uuid,uuid)'::regprocedure))
  )::text;`));
}

try {
  const started = await runFile("docker", ["run", "-d", "--rm", "--name", containerName,
    "--network", "none", "--tmpfs", "/var/lib/postgresql/data",
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17-alpine"], { windowsHide: true });
  containerId = started.stdout.trim();
  assert.match(containerId, /^[0-9a-f]{64}$/);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await runFile("docker", ["exec", containerId, "pg_isready", "-U", "postgres"], { windowsHide: true });
      ready = true;
      break;
    } catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  assert.ok(ready, "Disposable PostgreSQL did not become ready");
  process.stdout.write(`Runtime ${process.version}; PostgreSQL ${await psql("show server_version;")}\n`);
  for (const path of predecessorPaths) await psql(await readFile(path, "utf8"));
  const before = await snapshot();

  // Reproduce the predecessor defect using service_role, then prove that a
  // historical provider verification makes migration preflight refuse. The
  // outer transaction rolls the synthetic defect reproduction back on failure.
  const historicalFailure = await refused(`begin;\n${fixtureSql(43)}
    set local role service_role;
    select (${providerSql(43, ":'quote43'")}->>'observationId') as obs43 \\gset
    select public.research_assisted_order_payment_verify_bound('${request(43)}',:'obs43',null)::text;
    reset role;\n${migration}`, "55000", "ASSISTED_ORDER_PROVIDER_VERIFICATIONS_RECONCILIATION_REQUIRED");
  assert.equal(receipt(historicalFailure.stdout).state, "paid", "Predecessor exploit must be independently reproduced");
  assert.deepEqual(await snapshot(), before, "Rejected migration must preserve functions and all original rows");
  process.stdout.write("PASS predecessor service-role exploit reproduced; provider-verification preflight refused exactly; transaction fully rolled back.\n");

  await psql(`begin;\n${fixtureSql(41)}\n${fixtureSql(42)}
    insert into public.research_assisted_order_payment_verifier_grants(auth_user_id,actor_label,granted_by)
      values ('${actor}','synthetic-hold-finance42','synthetic-founder');
    set local role service_role;
    select ${providerSql(41, ":'quote41'")};
    commit;`);
  const legacy = receipt(await psql(`select json_build_object(
    'observationId',(select id from public.research_assisted_order_payment_observations where request_id='${request(41)}'),
    'providerQuote',(select id from public.research_assisted_order_quotes where request_id='${request(41)}'),
    'manualQuote',(select id from public.research_assisted_order_quotes where request_id='${request(42)}')
  )::text;`));
  await psql(migration);
  await psql(migration);
  process.stdout.write("PASS exact source migration applied twice; legacy provider observation preserved.\n");

  const afterApply = await snapshot();
  await refused(`set role service_role; select ${providerSql(41, `'${legacy.providerQuote}'`)};`, "P0001", holdDetail);
  await refused(`set role service_role; select ${providerSql(42, `'${legacy.manualQuote}'`)};`, "P0001", holdDetail);
  for (const verifier of ["null", `'${actor}'`]) {
    await refused(`set role service_role; select public.research_assisted_order_payment_verify_bound(
      '${request(41)}','${legacy.observationId}',${verifier});`, "P0001", holdDetail);
  }
  assert.equal(await psql(`set role service_role; select public.research_assisted_order_payment_verify_bound(
    null,'${legacy.observationId}',null) is null;`), "t");
  assert.equal(await psql(`set role service_role; select public.research_assisted_order_payment_verify_bound(
    '${request(42)}','${legacy.observationId}',null) is null;`), "t");
  assert.deepEqual(await snapshot(), afterApply, "Provider refusals and unbound attempts must not mutate state");
  process.stdout.write("PASS new/replayed provider observations and legacy provider verification refused with exact P0001/detail; NULL/wrong request denied; zero side effects.\n");

  // Owner-only trigger backstops model a predecessor body already executing.
  // These do not substitute for the service-role RPC/ACL proofs above and below.
  await refused(`insert into public.research_assisted_order_payment_observations (
    request_id,quote_id,method,observed_amount_cents,observed_currency,payment_reference,
    provider_name,provider_event_id,provider_payment_id,source_evidence_ref,observed_by,observed_at
  ) values ('${request(41)}','${legacy.providerQuote}','provider',5000,'USD',
    'synthetic-pi-trigger','synthetic-unconfigured-provider','synthetic-evt-trigger',
    'synthetic-pi-trigger','synthetic-trigger-evidence','provider:synthetic-unconfigured-provider','${observedAt}');`, "P0001", holdDetail);
  await refused(`insert into public.research_assisted_order_payment_verifications (
    request_id,quote_id,quote_version,acceptance_id,observation_id,expected_amount_cents,
    expected_currency,observed_amount_cents,observed_currency,payment_reference,
    method,provider_name,provider_event_id,provider_payment_id,verified_by
  ) select '${request(41)}',q.id,q.version,q.acceptance_id,'${legacy.observationId}',
    5000,'USD',5000,'USD','synthetic-pi-forged41','provider','synthetic-unconfigured-provider',
    'synthetic-evt-forged41','synthetic-pi-forged41','provider:synthetic-unconfigured-provider'
    from public.research_assisted_order_quotes q where id='${legacy.providerQuote}';`, "P0001", holdDetail);
  assert.deepEqual(await snapshot(), afterApply, "Trigger refusal must roll back even a newly claimed evidence identity");
  process.stdout.write("PASS provider observation/verification insertion backstops refused exactly; no evidence-claim residue (owner-only trigger proof).\n");

  const manualObservation = receipt(await psql(`set role service_role;
    select public.research_assisted_order_payment_observe('${request(42)}','${legacy.manualQuote}',
      'manual',4999,'USD','${reference(42)}','synthetic-bank-hold42-original','${observedAt}','${actor}')::text;`));
  await refused(`set role service_role; select public.research_assisted_order_payment_verify_bound(
    '${request(42)}','${manualObservation.observationId}','${actor}');`, "P0001", "ASSISTED_ORDER_PAYMENT_AMOUNT_CURRENCY_MISMATCH");
  const correctionSql = `set role service_role; select public.research_assisted_order_payment_correct_manual(
    '${request(42)}','${manualObservation.observationId}','${actor}','${legacy.manualQuote}','${reference(42)}',
    5000,'USD','synthetic-bank-hold42-correct','${observedAt}','Synthetic amount correction')::text;`;
  const corrected = receipt(await psql(correctionSql));
  const correctedReplay = receipt(await psql(correctionSql));
  assert.equal(corrected.replayed, false);
  assert.equal(correctedReplay.replayed, true);
  assert.equal(correctedReplay.observationId, corrected.observationId);
  await refused(`set role service_role; select public.research_assisted_order_payment_verify_bound(
    '${request(42)}','${corrected.observationId}','${member(42)}');`, "P0001", "ASSISTED_ORDER_MANUAL_VERIFIER_REQUIRED");
  assert.equal(await psql(`set role service_role; select public.research_assisted_order_payment_verify_bound(
    null,'${corrected.observationId}','${actor}') is null;`), "t");
  const verifySql = `set role service_role; select public.research_assisted_order_payment_verify_bound(
    '${request(42)}','${corrected.observationId}','${actor}')::text;`;
  const verified = receipt(await psql(verifySql));
  const replay = receipt(await psql(verifySql));
  assert.equal(verified.state, "paid");
  assert.equal(verified.replayed, false);
  assert.deepEqual(replay, { ...verified, replayed: true });
  assert.equal(verified.verifiedBy, "synthetic-hold-finance42");
  assert.ok(Number.isFinite(Date.parse(verified.verifiedAt)));
  const totals = receipt(await psql(`select json_build_object(
    'manualVerifications',(select count(*) from public.research_assisted_order_payment_verifications where request_id='${request(42)}'),
    'manualPaidEvents',(select count(*) from public.research_assisted_order_events where request_id='${request(42)}' and status='paid'),
    'providerVerifications',(select count(*) from public.research_assisted_order_payment_verifications where method='provider'),
    'providerStatus',(select status from public.research_assisted_order_requests where id='${request(41)}')
  )::text;`));
  assert.deepEqual(totals, { manualVerifications: 1, manualPaidEvents: 1, providerVerifications: 0, providerStatus: "payment_review" });
  process.stdout.write("PASS manual exact-quote observe/correction/verification/replay unchanged; wrong amount/actor/NULL request refused; one verification and paid event.\n");

  for (const role of ["anon", "authenticated", "service_role"]) {
    await refused(`set role ${role}; select public.research_assisted_order_payment_verify('${legacy.observationId}',null);`, "42501");
    await refused(`set role ${role}; insert into public.research_assisted_order_payment_observations default values;`, "42501");
    await refused(`set role ${role}; insert into public.research_assisted_order_payment_verifications default values;`, "42501");
    if (role !== "service_role") {
      await refused(`set role ${role}; select ${providerSql(41, `'${legacy.providerQuote}'`)};`, "42501");
      await refused(`set role ${role}; select public.research_assisted_order_payment_verify_bound('${request(41)}','${legacy.observationId}',null);`, "42501");
    }
  }
  process.stdout.write("PASS actual anon/authenticated/service_role ACL denials (42501), including private unbound verifier and direct evidence tables.\n");
  process.stdout.write(`PASS provider hold migration sha256=${createHash("sha256").update(migration.replace(/\r\n/g, "\n")).digest("hex")}\n`);
} finally {
  if (containerId && /^[0-9a-f]{64}$/.test(containerId)) {
    await runFile("docker", ["rm", "-f", containerId], { windowsHide: true });
    process.stdout.write("CLEANUP removed only this proof's disposable container and tmpfs synthetic database.\n");
  }
}
