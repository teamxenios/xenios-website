// Disposable loopback PostgREST probe only. Requires the synthetic fixture
// from research_assisted_order_quote_payment_concurrency_local.mjs and the
// local-only PostgREST container on 127.0.0.1:31334. No hosted URL is used.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";

const origin = "http://127.0.0.1:31334";
const localSecret = "local-only-hl12-jwt-secret-20260930";
const reference = "XRR-20260930-ABCDEF0011";
const requestId = "10000000-0000-4000-8000-000000000011";
const memberId = "20000000-0000-4000-8000-000000000011";
const financeActor = "40000000-0000-4000-8000-000000000011";
const observationId = execFileSync("docker", [
  "exec", "xenios-hl12-schema-local", "psql", "-X", "-A", "-t", "-U", "postgres",
  "-d", "postgres", "-c",
  `select id from public.research_assisted_order_payment_observations where request_id = '${requestId}'::uuid`,
], { encoding: "utf8" }).trim();
assert.match(observationId, /^[0-9a-f-]{36}$/i);

function jwt(role) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const content = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    role, exp: Math.floor(Date.now() / 1000) + 120,
  })}`;
  return `${content}.${createHmac("sha256", localSecret).update(content).digest("base64url")}`;
}

async function rpc(name, body, role) {
  const response = await fetch(`${origin}/rpc/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(role ? { authorization: `Bearer ${jwt(role)}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

let ready = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const response = await fetch(`${origin}/`);
    if (response.status < 500) { ready = true; break; }
  } catch { /* local container not ready yet */ }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
assert.ok(ready, "Local PostgREST did not become ready");

const unauthenticated = await rpc("research_assisted_order_quote_get", {
  p_public_reference: reference, p_member_id: memberId,
});
assert.ok(unauthenticated.status === 401 || unauthenticated.status === 404,
  `Anon quote RPC unexpectedly exposed: ${unauthenticated.status}`);

const owner = await rpc("research_assisted_order_quote_get", {
  p_public_reference: reference, p_member_id: memberId,
}, "service_role");
assert.equal(owner.status, 200);
assert.equal(owner.data?.totalCents, 5000);
assert.equal(owner.data?.currency, "USD");
assert.equal(owner.data?.publicReference, reference);
assert.ok(!Object.hasOwn(owner.data, "pricingBasis"));

const wrongOwner = await rpc("research_assisted_order_quote_get", {
  p_public_reference: reference,
  p_member_id: "20000000-0000-4000-8000-000000000012",
}, "service_role");
assert.equal(wrongOwner.status, 200);
assert.equal(wrongOwner.data, null);

const directTable = await fetch(`${origin}/research_assisted_order_quotes?select=*`, {
  headers: { authorization: `Bearer ${jwt("service_role")}` },
});
assert.ok(directTable.status === 401 || directTable.status === 403 || directTable.status === 404,
  `Direct finance table was exposed: ${directTable.status}`);

const oldUnbound = await rpc("research_assisted_order_payment_verify", {
  p_observation_id: observationId,
  p_verifier_auth_user_id: financeActor,
}, "service_role");
assert.ok(oldUnbound.status === 401 || oldUnbound.status === 403 || oldUnbound.status === 404,
  `Unbound verifier was exposed: ${oldUnbound.status}`);

const wrongPath = await rpc("research_assisted_order_payment_verify_bound", {
  p_request_id: "10000000-0000-4000-8000-000000000012",
  p_observation_id: observationId,
  p_verifier_auth_user_id: financeActor,
}, "service_role");
assert.equal(wrongPath.status, 200);
assert.equal(wrongPath.data, null);

const correctReplay = await rpc("research_assisted_order_payment_verify_bound", {
  p_request_id: requestId,
  p_observation_id: observationId,
  p_verifier_auth_user_id: financeActor,
}, "service_role");
assert.equal(correctReplay.status, 200);
assert.equal(correctReplay.data?.state, "paid");
assert.equal(correctReplay.data?.replayed, true);

process.stdout.write("HL-12 local PostgREST PASS: owner quote, wrong owner null, anon/direct-table/unbound denial, bound wrong-path null, correct replay.\n");
