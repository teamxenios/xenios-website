// Synthetic disposable local PostgreSQL proof only. This script neither loads
// credentials nor accepts a hosted connection. Run after the HL-12 corrections
// migration. Fixture31 is insert-once; reruns refuse instead of resetting data.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const container = process.env.XENIOS_HL12_PG_CONTAINER ?? "xenios-hl12-corrections-local";
if (!/^xenios-hl12-[a-z0-9-]+-local$/.test(container)) {
  throw new Error("This proof requires a named Xenios disposable local container");
}
const requestId = "10000000-0000-4000-8000-000000000031";
const memberId = "20000000-0000-4000-8000-000000000031";
const lineId = "30000000-0000-4000-8000-000000000031";
const financeActor = "40000000-0000-4000-8000-000000000031";
const reference = "XRR-20260930-ABCDEF0031";
const occurredAt = "2026-09-30T23:00:00.000Z";
const correctedEvidence = "synthetic-bank-correction-race31-correct";
const correctionReason = "Synthetic controlled-import amount correction";

async function psql(sql) {
  const { stdout, stderr } = await runFile("docker", [
    "exec", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
    "-d", "postgres", "-A", "-t", "-c", sql,
  ], { maxBuffer: 1024 * 1024, timeout: 30_000 });
  if (stderr.trim()) process.stderr.write(stderr);
  return stdout.trim();
}
function jsonResult(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.startsWith("{"));
  assert.equal(lines.length, 1, "Expected one structured local SQL receipt");
  return JSON.parse(lines[0]);
}
async function refused(sql, expected) {
  await assert.rejects(psql(sql), (error) => {
    assert.match(error.stderr ?? "", expected);
    return true;
  });
}
async function fixture11Snapshot() {
  return psql(`select json_build_object(
    'requests',(select count(*) from public.research_assisted_order_requests where id='10000000-0000-4000-8000-000000000011'),
    'status',(select status from public.research_assisted_order_requests where id='10000000-0000-4000-8000-000000000011'),
    'events',(select count(*) from public.research_assisted_order_events where request_id='10000000-0000-4000-8000-000000000011'),
    'observations',(select count(*) from public.research_assisted_order_payment_observations where request_id='10000000-0000-4000-8000-000000000011'),
    'verifications',(select count(*) from public.research_assisted_order_payment_verifications where request_id='10000000-0000-4000-8000-000000000011')
  )::text;`);
}
const before11 = await fixture11Snapshot();

await psql(`begin;
insert into public.research_assisted_order_requests (
  id,public_reference,idempotency_key_hash,request_fingerprint,actor_member_id,
  normalized_email,full_legal_name,mobile_phone,shipping_address,billing_address,
  age_confirmed,source,status
) values (
  '${requestId}','${reference}','synthetic-correction-race31-key','synthetic-correction-race31-fingerprint','${memberId}',
  'synthetic-correction-race31@example.test','Synthetic Correction Race Buyer','+10000000031',
  '{"line1":"31 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}'::jsonb,
  '{"line1":"31 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}'::jsonb,
  true,'early_access_manual_order_bridge','reviewing'
);
insert into public.research_assisted_order_lines (
  id,request_id,product_id,variant_id,product_name,quantity,minimum_quantity,
  quantity_increment,workflow_mode,customer_action_label,unit_price_cents,
  line_estimate_cents,catalog_version,authoritative_fingerprint
) values (
  '${lineId}','${requestId}','P-CORRECTION-RACE31','V-CORRECTION-RACE31','Synthetic correction race item',2,1,
  1,'direct_order_request','Request order',2500,5000,'cat-correction-race31','fp-correction-race31'
);
select public.research_assisted_order_quote_issue('${requestId}',
  '[{"lineId":"${lineId}"}]'::jsonb,now()+interval '1 day','synthetic-correction-admin');
select public.research_assisted_order_quote_accept(
  (select id from public.research_assisted_order_quotes where request_id='${requestId}'),1,5000,'${memberId}');
insert into public.research_assisted_order_payment_verifier_grants(auth_user_id,actor_label,granted_by)
values ('${financeActor}','synthetic-correction-finance31','synthetic-founder');
select public.research_assisted_order_set_status('${requestId}','reviewing','payment_pending','synthetic-admin','admin');
select public.research_assisted_order_set_status('${requestId}','payment_pending','payment_review','synthetic-admin','admin');
select public.research_assisted_order_payment_observe('${requestId}',
  (select id from public.research_assisted_order_quotes where request_id='${requestId}'),
  'manual',4999,'USD','${reference}','synthetic-bank-correction-race31-original','${occurredAt}','${financeActor}');
commit;`);

const fixture = jsonResult(await psql(`select json_build_object(
  'quoteId',(select id from public.research_assisted_order_quotes where request_id='${requestId}'),
  'observationId',(select id from public.research_assisted_order_payment_observations where request_id='${requestId}')
)::text;`));
assert.match(fixture.quoteId, /^[0-9a-f-]{36}$/i);
assert.match(fixture.observationId, /^[0-9a-f-]{36}$/i);

function correctionSql(amount = 5000, evidence = correctedEvidence, reason = correctionReason) {
  return `set role service_role;
    select public.research_assisted_order_payment_correct_manual(
      '${requestId}','${fixture.observationId}','${financeActor}','${fixture.quoteId}','${reference}',
      ${amount},'USD','${evidence}','${occurredAt}','${reason}')::text;`;
}
function verifySql(observationId) {
  return `set role service_role;
    select public.research_assisted_order_payment_verify_bound('${requestId}','${observationId}','${financeActor}')::text;`;
}

// Invalid replacement fails after the correction insert was attempted; the
// whole call must roll back, including the deferred FK and evidence claim.
await refused(correctionSql(0, "synthetic-bank-correction-race31-invalid"), /check constraint/);
const failedCounts = jsonResult(await psql(`select json_build_object(
  'observations',(select count(*) from public.research_assisted_order_payment_observations where request_id='${requestId}'),
  'corrections',(select count(*) from public.research_assisted_order_observation_corrections where observation_id='${fixture.observationId}'),
  'invalidClaims',(select count(*) from public.research_assisted_order_evidence_claims where evidence_ref='synthetic-bank-correction-race31-invalid')
)::text;`));
assert.deepEqual(failedCounts, { observations: 1, corrections: 0, invalidClaims: 0 });
process.stdout.write("PASS invalid replacement: original preserved; zero correction, replacement or evidence-claim residue.\n");

// Both child processes start before either result is awaited: distinct
// PostgreSQL connections exercise request-row locking and immutable replay.
const corrected = (await Promise.all([psql(correctionSql()), psql(correctionSql())])).map(jsonResult);
assert.deepEqual(corrected.map((value) => value.replayed).sort(), [false, true]);
assert.equal(corrected[0].observationId, corrected[1].observationId);
assert.notEqual(corrected[0].observationId, fixture.observationId);
assert.ok(corrected.every((value) => value.supersedes === fixture.observationId));
const replacementId = corrected[0].observationId;
process.stdout.write("PASS concurrent correction: two independent service-role connections, one replacement and one replay.\n");

await refused(correctionSql(5001), /ASSISTED_ORDER_CORRECTION_CONFLICT/);
await refused(verifySql(fixture.observationId), /ASSISTED_ORDER_PAYMENT_AMOUNT_CURRENCY_MISMATCH|ASSISTED_ORDER_OBSERVATION_SUPERSEDED/);
process.stdout.write("PASS changed correction replay and superseded wrong-amount observation verification refused.\n");

const verified = (await Promise.all([psql(verifySql(replacementId)), psql(verifySql(replacementId))])).map(jsonResult);
assert.deepEqual(verified.map((value) => value.replayed).sort(), [false, true]);
assert.equal(verified[0].verificationId, verified[1].verificationId);
assert.equal(verified[0].verifiedAt, verified[1].verifiedAt);
assert.ok(Number.isFinite(Date.parse(verified[0].verifiedAt)));
assert.ok(verified.every((value) => value.state === "paid" && value.verifiedBy === "synthetic-correction-finance31"));

const counts = jsonResult(await psql(`select json_build_object(
  'observations',(select count(*) from public.research_assisted_order_payment_observations where request_id='${requestId}'),
  'corrections',(select count(*) from public.research_assisted_order_observation_corrections where observation_id='${fixture.observationId}' and replacement_id='${replacementId}'),
  'verifications',(select count(*) from public.research_assisted_order_payment_verifications where request_id='${requestId}'),
  'paidEvents',(select count(*) from public.research_assisted_order_events where request_id='${requestId}' and status='paid'),
  'status',(select status from public.research_assisted_order_requests where id='${requestId}')
)::text;`));
assert.deepEqual(counts, { observations: 2, corrections: 1, verifications: 1, paidEvents: 1, status: "paid" });
assert.equal(await fixture11Snapshot(), before11, "Original fixture11 must remain unchanged for the PostgREST probe");
process.stdout.write("PASS concurrent verification: one immutable verification, one paid event, one replay; immutable receipt time/actor match.\n");
process.stdout.write("PASS fixture11 unchanged. " + JSON.stringify(counts) + "\n");
