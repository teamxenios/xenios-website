// Disposable local PostgreSQL only. The predecessor migrations must already
// be loaded in the named Docker container. No hosted connection is used.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const container = process.env.XENIOS_HL12_PG_CONTAINER ?? "xenios-hl12-schema-local";
if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(container)) {
  throw new Error("Invalid disposable container name");
}
const requestId = "10000000-0000-4000-8000-000000000011";
const memberId = "20000000-0000-4000-8000-000000000011";
const lineId = "30000000-0000-4000-8000-000000000011";
const financeActor = "40000000-0000-4000-8000-000000000011";
const reference = "XRR-20260930-ABCDEF0011";

async function psql(sql) {
  const { stdout, stderr } = await runFile("docker", [
    "exec", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
    "-d", "postgres", "-A", "-t", "-c", sql,
  ], { maxBuffer: 1024 * 1024 });
  if (stderr.trim()) process.stderr.write(stderr);
  return stdout.trim();
}

// A unique fixture belongs only to this disposable database. A second run
// refuses on the primary key rather than silently resetting an earlier proof.
await psql(`
begin;
insert into public.research_assisted_order_requests (
  id, public_reference, idempotency_key_hash, request_fingerprint,
  actor_member_id, normalized_email, full_legal_name, mobile_phone,
  shipping_address, billing_address, age_confirmed, source, status
) values (
  '${requestId}', '${reference}', 'synthetic-race-key', 'synthetic-race-fingerprint',
  '${memberId}', 'synthetic-race@example.test', 'Synthetic Race Buyer', '+10000000001',
  '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}'::jsonb,
  '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}'::jsonb,
  true, 'early_access_manual_order_bridge', 'reviewing'
);
insert into public.research_assisted_order_lines (
  id, request_id, product_id, variant_id, product_name, quantity,
  minimum_quantity, quantity_increment, workflow_mode, customer_action_label,
  unit_price_cents, line_estimate_cents, catalog_version, authoritative_fingerprint
) values (
  '${lineId}', '${requestId}', 'P-RACE', 'V-RACE', 'Synthetic race item', 2,
  1, 1, 'direct_order_request', 'Request order', 2500, 5000, 'cat-race', 'fp-race'
);
select public.research_assisted_order_quote_issue(
  '${requestId}'::uuid, '[{"lineId":"${lineId}"}]'::jsonb,
  now() + interval '1 day', 'synthetic-admin'
);
select public.research_assisted_order_quote_accept(
  (select id from public.research_assisted_order_quotes where request_id = '${requestId}'::uuid),
  1, 5000, '${memberId}'::uuid
);
insert into public.research_assisted_order_payment_verifier_grants (
  auth_user_id, actor_label, granted_by
) values ('${financeActor}', 'synthetic-finance-race', 'synthetic-founder');
select public.research_assisted_order_payment_observe(
  '${requestId}'::uuid,
  (select id from public.research_assisted_order_quotes where request_id = '${requestId}'::uuid),
  'manual', 5000, 'USD', '${reference}', 'synthetic-bank-ledger-race', now(),
  '${financeActor}'::uuid
);
select public.research_assisted_order_set_status(
  '${requestId}'::uuid, 'reviewing', 'payment_pending', 'synthetic-admin', 'admin'
);
select public.research_assisted_order_set_status(
  '${requestId}'::uuid, 'payment_pending', 'payment_review', 'synthetic-admin', 'admin'
);
commit;
`);

const observationId = await psql(`
select id from public.research_assisted_order_payment_observations
where request_id = '${requestId}'::uuid;
`);
assert.match(observationId, /^[0-9a-f-]{36}$/i);
const verifySql = `
set role service_role;
select public.research_assisted_order_payment_verify_bound(
  '${requestId}'::uuid, '${observationId}'::uuid, '${financeActor}'::uuid
)::text;
`;
// Separate docker exec processes mean separate PostgreSQL connections. Both
// start before either result is awaited, exercising the row-lock/replay path.
const [first, second] = await Promise.all([psql(verifySql), psql(verifySql)]);
const results = [first, second].map((output) => {
  const line = output.split(/\r?\n/).find((entry) => entry.startsWith("{"));
  assert.ok(line, `Missing verification result: ${output}`);
  return JSON.parse(line);
});
assert.deepEqual(results.map((result) => result.replayed).sort(), [false, true]);
assert.equal(results[0].verificationId, results[1].verificationId);
assert.ok(results.every((result) => result.state === "paid"));

const counts = JSON.parse(await psql(`
select json_build_object(
  'verifications', (select count(*) from public.research_assisted_order_payment_verifications where request_id = '${requestId}'::uuid),
  'paidEvents', (select count(*) from public.research_assisted_order_events where request_id = '${requestId}'::uuid and status = 'paid'),
  'status', (select status from public.research_assisted_order_requests where id = '${requestId}'::uuid)
)::text;
`));
assert.deepEqual(counts, { verifications: 1, paidEvents: 1, status: "paid" });
process.stdout.write("HL-12 disposable concurrent verification PASS: one paid event, one immutable verification, one replay.\n");
