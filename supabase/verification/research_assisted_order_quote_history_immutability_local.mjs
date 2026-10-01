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
const containerName = `xenios-hl12-history-immutability-${process.pid}-local`;
const migrationPath = "supabase/migrations/20261001024018_research_assisted_order_quote_history_immutability.sql";
const migration = await readFile(migrationPath, "utf8");
const predecessorPaths = [
  "supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql",
  "supabase/migrations/20260815150000_research_assisted_order_bridge.sql",
  "supabase/migrations/20260930191323_research_assisted_order_quote_payment_guard.sql",
  "supabase/migrations/20260930193033_research_assisted_order_quote_paid_hold.sql",
  "supabase/migrations/20260930202413_research_assisted_order_quote_payment_authority.sql",
  "supabase/migrations/20260930205725_research_assisted_order_quote_access_finance_bound.sql",
  "supabase/migrations/20260930230541_research_assisted_order_quote_evidence_corrections.sql",
  "supabase/migrations/20260930234614_research_assisted_order_quote_provider_hold.sql",
];
const id = (prefix, suffix) => `${prefix}0000000-0000-4000-8000-0000000000${suffix}`;
const request = (n) => id(1, n);
const member = (n) => id(2, n);
const line = (n) => id(3, n);
const actor = id(4, 66);
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
function fixtureSql(n, accepted = true) {
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
  ${accepted ? `select public.research_assisted_order_quote_accept(:'quote${n}',1,5000,'${member(n)}');` : ''}
  ${accepted ? `select public.research_assisted_order_set_status('${request(n)}','reviewing','payment_pending','synthetic-admin','admin');
  select public.research_assisted_order_set_status('${request(n)}','payment_pending','payment_review','synthetic-admin','admin');` : ''}
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

function legacySql(n, finalStatus, paidHistory = true) {
  const insertOnly = fixtureSql(n).split("  set local role service_role;")[0];
  if (!paidHistory) return insertOnly + `update public.research_assisted_order_requests set status='${finalStatus}' where id='${request(n)}';`;
  let sql = insertOnly + `set local role service_role;
    select public.research_assisted_order_set_status('${request(n)}','reviewing','payment_pending','synthetic-admin','admin');
    select public.research_assisted_order_set_status('${request(n)}','payment_pending','payment_review','synthetic-admin','admin');
    select public.research_assisted_order_set_status('${request(n)}','payment_review','paid','synthetic-admin','admin',null,null,
      '{"paymentVerificationId":"synthetic-legacy-label-not-verification"}');
    select public.research_assisted_order_set_status('${request(n)}','paid','supplier_processing','synthetic-admin','admin',null,null,
      '{"supplierAssignmentId":"synthetic-legacy-assignment"}');`;
  if (["shipped", "delivered"].includes(finalStatus)) sql += `
    select public.research_assisted_order_set_status('${request(n)}','supplier_processing','shipped','synthetic-admin','admin',null,null,'{"trackingId":"synthetic-tracking"}');`;
  if (finalStatus === "delivered") sql += `
    select public.research_assisted_order_set_status('${request(n)}','shipped','delivered','synthetic-admin','admin');`;
  sql += "reset role;";
  if (finalStatus === "reviewing") sql += `update public.research_assisted_order_requests set status='reviewing' where id='${request(n)}';`;
  return sql;
}
const setStatus = (n, from, to, evidence = {}) => `set role service_role;
  select public.research_assisted_order_set_status('${request(n)}','${from}','${to}','synthetic-admin','admin',null,null,'${JSON.stringify(evidence)}')::text;`;
const acceptSql = (n, quoteId, who = member(n)) => `set role service_role;
  select public.research_assisted_order_quote_accept('${quoteId}',1,5000,'${who}')::text;`;
function jsonRows(output) {
  return output.split(/\r?\n/).filter((row) => row.startsWith("{")).map((row) => JSON.parse(row));
}
const startedAt = performance.now();
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
  for (const path of predecessorPaths.slice(0, 2)) await psql(await readFile(path, "utf8"));
  // Build actual synthetic past-paid history under the old M71 authority.
  // No verification row is fabricated, before or after the new guards.
  await psql(`begin;
    ${legacySql(61, "supplier_processing")}
    ${legacySql(62, "shipped")}
    ${legacySql(63, "delivered")}
    ${legacySql(64, "reviewing")}
    ${legacySql(65, "supplier_processing", false)}
    commit;`);
  for (const path of predecessorPaths.slice(2, -1)) await psql(await readFile(path, "utf8"));
  // Preserve one pre-hold provider observation for the aggregate pre/post read.
  await psql(`begin; ${fixtureSql(68)}
    set local role service_role; select ${providerSql(68, ":'quote68'")}; commit;`);
  await psql(await readFile(predecessorPaths.at(-1), "utf8"));
  await psql(`begin;
    ${fixtureSql(66)}
    ${fixtureSql(67, false)}
    ${fixtureSql(69, false)}
    ${fixtureSql(70, false)}
    ${fixtureSql(71, false)}
    insert into public.research_assisted_order_payment_verifier_grants(auth_user_id,actor_label,granted_by)
      values ('${actor}','synthetic-history-finance66','synthetic-founder');
    commit;`);
  const quotes = receipt(await psql(`select json_object_agg(right(request_id::text,2),id)::text from public.research_assisted_order_quotes;`));
  const beforeDefect = await snapshot();
  const defect = receipt(await psql(`begin;
    ${setStatus(61, "supplier_processing", "shipped", { trackingId: "synthetic-before-guard" })}
    ${setStatus(62, "shipped", "delivered")}
    reset role;
    update public.research_assisted_order_quotes set total_cents=5001 where id='${quotes["66"]}';
    ${setStatus(67, "reviewing", "cancelled", { cancellationReason: "Synthetic no money" })}
    ${acceptSql(67, quotes["67"])}
    reset role;
    select json_build_object(
      'historicalShipped',(select status='shipped' from public.research_assisted_order_requests where id='${request(61)}'),
      'historicalDelivered',(select status='delivered' from public.research_assisted_order_requests where id='${request(62)}'),
      'acceptedQuoteMutated',(select total_cents=5001 from public.research_assisted_order_quotes where id='${quotes["66"]}'),
      'cancelledQuoteAccepted',(select state='accepted' from public.research_assisted_order_quotes where id='${quotes["67"]}'),
      'verifications',(select count(*) from public.research_assisted_order_payment_verifications)
    )::text;
    rollback;`));
  assert.deepEqual(defect, { historicalShipped: true, historicalDelivered: true, acceptedQuoteMutated: true, cancelledQuoteAccepted: true, verifications: 0 });
  assert.deepEqual(await snapshot(), beforeDefect);
  process.stdout.write("PASS predecessor defects reproduced and rolled back: unverified historical progression, accepted-quote mutation, terminal acceptance.\n");

  const precheck = await readFile("supabase/verification/research_assisted_order_quote_history_immutability_precheck.sql", "utf8");
  const postcheck = await readFile("supabase/verification/research_assisted_order_quote_history_immutability_postcheck.sql", "utf8");
  const beforeCounts = receipt(await psql(precheck));
  assert.equal(beforeCounts.historical_progression_holds, 5);
  assert.equal(beforeCounts.provider_observations, 1);
  assert.equal(beforeCounts.provider_verifications, 0);
  process.stdout.write("PRECHECK " + JSON.stringify(beforeCounts) + "\n");
  await psql(migration);
  await psql(migration);
  const postRows = jsonRows(await psql(postcheck));
  assert.deepEqual(postRows[0], beforeCounts, "Migration must preserve every aggregate financial fact");
  assert.ok(Object.values(postRows[1]).every((value) => value === true));
  process.stdout.write("POSTCHECK " + JSON.stringify(postRows[0]) + "\n");
  process.stdout.write("FUNCTION_FINGERPRINTS " + JSON.stringify(postRows[2]) + "\n");
  process.stdout.write("PASS new migration applied twice; guard/ACL checks pass; no data backfill.\n");

  const historicalCases = [
    [61, "supplier_processing", "shipped", { trackingId: "synthetic-after-guard" }],
    [62, "shipped", "delivered", {}],
    [63, "delivered", "closed", {}],
    [64, "reviewing", "payment_pending", {}],
    [65, "supplier_processing", "shipped", { trackingId: "synthetic-no-history" }],
    [61, "supplier_processing", "cancelled", { cancellationReason: "Not financial evidence" }],
  ];
  for (const [n, from, to, evidence] of historicalCases) {
    await refused(setStatus(n, from, to, evidence), "P0001", "ASSISTED_ORDER_HISTORICAL_PAID_UNRESOLVED");
  }
  assert.deepEqual(receipt(await psql(precheck)), beforeCounts);
  process.stdout.write("PASS service-role historical holds across supplier/shipped/delivered, paid-history-at-reviewing, missing timeline and cancellation.\n");

  const quoteBefore = await psql(`select row_to_json(q)::text from public.research_assisted_order_quotes q where id='${quotes["66"]}';`);
  for (const change of [
    "id=gen_random_uuid()", `request_id='${request(67)}'`, "version=2", "total_cents=5001",
    "currency='EUR'", "lines='[]'::jsonb", "pricing_basis='{\"changed\":true}'::jsonb",
    "issued_by='changed-issuer'", "issued_at=issued_at-interval '1 minute'",
    "valid_until=valid_until+interval '1 hour'", "customer_note='changed-note'",
    "accepted_at=accepted_at+interval '1 second'", "acceptance_id=gen_random_uuid()",
    "state='superseded',accepted_at=null,acceptance_id=null",
  ]) await refused(`update public.research_assisted_order_quotes set ${change} where id='${quotes["66"]}';`, "P0001", "ASSISTED_ORDER_QUOTE_IMMUTABLE");
  await refused(`delete from public.research_assisted_order_quotes where id='${quotes["66"]}';`, "P0001", "ASSISTED_ORDER_QUOTE_IMMUTABLE");
  // TRUNCATE CASCADE also targets referencing evidence tables; quote guard must
  // reject before any truncate occurs. Everything is confined to this container.
  await refused("truncate public.research_assisted_order_quotes cascade;", "P0001", "ASSISTED_ORDER_QUOTE_IMMUTABLE");
  assert.equal(await psql(`select row_to_json(q)::text from public.research_assisted_order_quotes q where id='${quotes["66"]}';`), quoteBefore);
  await refused(`update public.research_assisted_order_quotes set total_cents=5001 where id='${quotes["69"]}';`, "P0001", "ASSISTED_ORDER_QUOTE_IMMUTABLE");
  process.stdout.write("PASS owner-level accepted snapshot identity/economics/lines/terms/acceptance mutation and deletion/truncation refused; issued snapshots also immutable.\n");

  assert.equal(await psql(acceptSql(69, quotes["69"], member(70))), "", "Cross-order customer must receive NULL");
  await psql(`update public.research_assisted_order_requests set actor_member_id=null,early_access_session_hash='synthetic-history-session70' where id='${request(70)}';`);
  assert.equal(await psql(acceptSql(70, quotes["70"], member(70))), "", "NULL owner must not authorize a supplied member");
  const sessionAccepted = receipt(await psql(`set role service_role; select public.research_assisted_order_quote_accept('${quotes["70"]}',1,5000,null,'synthetic-history-session70')::text;`));
  assert.equal(sessionAccepted.replayed, false);
  await psql(setStatus(67, "reviewing", "cancelled", { cancellationReason: "Synthetic no money" }));
  await refused(acceptSql(67, quotes["67"]), "P0001", "ASSISTED_ORDER_QUOTE_ACCEPTANCE_CLOSED");
  const superseded = receipt(await psql(`set role service_role; select public.research_assisted_order_quote_issue(
    '${request(69)}','[{"lineId":"${line(69)}"}]',now()+interval '1 day','synthetic-requote')::text;`));
  assert.equal(superseded.version, 2);
  assert.equal(await psql(`select state from public.research_assisted_order_quotes where id='${quotes["69"]}';`), "superseded");
  await refused(acceptSql(69, quotes["69"]), "P0001", "ASSISTED_ORDER_QUOTE_STALE");
  process.stdout.write("PASS owner/session isolation, cancelled acceptance refusal and legitimate issued->superseded successor preserved.\n");

  const observation = receipt(await psql(`set role service_role;
    select public.research_assisted_order_payment_observe('${request(66)}','${quotes["66"]}',
      'manual',5000,'USD','${reference(66)}','synthetic-history-bank66','${observedAt}','${actor}')::text;`));
  const verify = `set role service_role; select public.research_assisted_order_payment_verify_bound('${request(66)}','${observation.observationId}','${actor}')::text;`;
  const verifies = (await Promise.all([psql(verify), psql(verify)])).map(receipt);
  assert.deepEqual(verifies.map((value) => value.replayed).sort(), [false, true]);
  assert.equal(verifies[0].verificationId, verifies[1].verificationId);
  await refused(setStatus(66, "paid", "cancelled", { cancellationReason: "Not refund evidence" }), "P0001", "ASSISTED_ORDER_REFUND_AUTHORITY_NOT_READY");
  await psql(setStatus(66, "paid", "supplier_processing", { supplierAssignmentId: "synthetic-existing-gate" }));
  const acceptedReplay = receipt(await psql(acceptSql(66, quotes["66"])));
  assert.equal(acceptedReplay.replayed, true);
  const concurrentProgression = await Promise.allSettled([
    psql(setStatus(66, "supplier_processing", "shipped", { trackingId: "synthetic-existing-gate" })),
    psql(setStatus(66, "supplier_processing", "shipped", { trackingId: "synthetic-existing-gate" })),
  ]);
  assert.equal(concurrentProgression.filter((value) => value.status === "fulfilled").length, 1);
  const progressionFailure = concurrentProgression.find((value) => value.status === "rejected").reason;
  assert.match(progressionFailure.stderr, /ERROR:\s+P0001:/);
  assert.match(progressionFailure.stderr, /DETAIL:\s+ASSISTED_ORDER_STALE_STATUS/);
  await psql(setStatus(66, "shipped", "delivered"));
  await psql(setStatus(66, "delivered", "closed"));
  await refused(acceptSql(66, quotes["66"]), "P0001", "ASSISTED_ORDER_QUOTE_ACCEPTANCE_CLOSED");
  const verifiedReplay = receipt(await psql(verify));
  assert.equal(verifiedReplay.replayed, true);
  assert.equal(verifiedReplay.state, "closed");
  const verifiedCounts = receipt(await psql(`select json_build_object(
    'verifications',(select count(*) from public.research_assisted_order_payment_verifications where request_id='${request(66)}'),
    'paidEvents',(select count(*) from public.research_assisted_order_events where request_id='${request(66)}' and status='paid'),
    'shippedEvents',(select count(*) from public.research_assisted_order_events where request_id='${request(66)}' and status='shipped')
  )::text;`));
  assert.deepEqual(verifiedCounts, { verifications: 1, paidEvents: 1, shippedEvents: 1 });
  process.stdout.write("PASS actual manual verification, verified progression through closed, nonterminal accepted replay, refund hold and independent-connection convergence.\n");

  const acceptCancel = await Promise.allSettled([
    psql(acceptSql(71, quotes["71"])),
    psql(setStatus(71, "reviewing", "cancelled", { cancellationReason: "Synthetic no funds observed" })),
  ]);
  assert.equal(acceptCancel[1].status, "fulfilled");
  const finalRace = receipt(await psql(`select json_build_object('status',r.status,'quoteState',q.state)::text
    from public.research_assisted_order_requests r join public.research_assisted_order_quotes q on q.request_id=r.id
    where r.id='${request(71)}';`));
  assert.equal(finalRace.status, "cancelled");
  if (acceptCancel[0].status === "fulfilled") {
    assert.equal(receipt(acceptCancel[0].value).replayed, false);
    assert.equal(finalRace.quoteState, "accepted"); // Acceptance won request lock before no-money cancellation.
  } else {
    assert.match(acceptCancel[0].reason.stderr, /ERROR:\s+P0001:/);
    assert.match(acceptCancel[0].reason.stderr, /DETAIL:\s+ASSISTED_ORDER_QUOTE_ACCEPTANCE_CLOSED/);
    assert.equal(finalRace.quoteState, "issued");
  }
  await refused(acceptSql(71, quotes["71"]), "P0001", "ASSISTED_ORDER_QUOTE_ACCEPTANCE_CLOSED");
  process.stdout.write("PASS accept/cancel race serialized on request; subsequent terminal acceptance refused.\n");

  await refused(`set role service_role; select ${providerSql(68, `'${quotes["68"]}'`)};`, "P0001", holdDetail);
  for (const role of ["anon", "authenticated", "service_role"]) {
    await refused(`set role ${role}; update public.research_assisted_order_quotes set total_cents=1;`, "42501");
    await refused(`set role ${role}; select public.research_assisted_order_payment_verify(null,null);`, "42501");
    if (role !== "service_role") await refused(`set role ${role}; select public.research_assisted_order_quote_accept('${quotes["66"]}',1,5000,'${member(66)}');`, "42501");
  }
  process.stdout.write("FINAL_COUNTS " + JSON.stringify(receipt(await psql(precheck))) + "\n");
  process.stdout.write("PASS provider hold and actual role ACLs preserved; local synthetic SQL evidence only, production readiness remains incomplete.\n");
  process.stdout.write(`PASS migration sha256=${createHash("sha256").update(migration.replace(/\r\n/g, "\n")).digest("hex")}\n`);
} finally {
  if (containerId && /^[0-9a-f]{64}$/.test(containerId)) {
    await runFile("docker", ["rm", "-f", containerId], { windowsHide: true });
    process.stdout.write("CLEANUP removed only this proof's disposable container and tmpfs synthetic database.\n");
  }
  process.stdout.write(`Elapsed ${((performance.now() - startedAt) / 1000).toFixed(3)} seconds.\n`);
}
