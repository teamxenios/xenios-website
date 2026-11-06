/** Synthetic loopback verification only. Never use this against production. */
import { createHash } from "node:crypto";

export const POLICY_V2_EXPECTATION = Object.freeze({
  slug: "early-access-product-policy",
  kind: "early_access_terms",
  version: "v2",
  bodySha256: "491d2559f05f6201ee0279bbd0fb711ebc7eeb1fd0a826c8d9141373c146fa06",
  historicalSlug: "research-use",
  historicalVersion: "v1",
  historicalBodySha256: "98918e35e5a0f749790fb31cd406399818ced5d197cbed02679744ccf94ac325",
});
const POLICY_PATH = "/api/research/policies";
const STANDING_PATH = "/api/research/early-access/agreements";
const ACCEPT_PATH = STANDING_PATH + "/accept";
const PATHS = new Set([POLICY_PATH, STANDING_PATH, ACCEPT_PATH]);

export function assertSyntheticOrigin(raw) {
  if (typeof raw !== "string") throw new Error("A loopback origin is required.");
  let url;
  try { url = new URL(raw); } catch { throw new Error("Invalid loopback origin."); }
  if (!["http:", "https:"].includes(url.protocol)
    || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    || !url.port || url.username || url.password || url.search || url.hash
    || url.pathname !== "/" || raw !== url.origin) {
    throw new Error("Only a declared, port-bound loopback origin is allowed.");
  }
  return url.origin;
}

/** Mirrors server/research/policies-data.ts; missing bullets canonicalize to null. */
export function policyBodyDigest(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)
    || typeof raw.title !== "string" || typeof raw.updated !== "string" || !Array.isArray(raw.sections)) {
    throw new Error("Malformed policy document.");
  }
  const sections = raw.sections.map((section) => {
    if (!section || typeof section !== "object" || Array.isArray(section)
      || typeof section.heading !== "string" || !Array.isArray(section.paragraphs)
      || section.paragraphs.some((value) => typeof value !== "string")
      || (section.bullets !== undefined && (!Array.isArray(section.bullets)
        || section.bullets.some((value) => typeof value !== "string")))) {
      throw new Error("Malformed policy section.");
    }
    return { heading: section.heading, paragraphs: [...section.paragraphs],
      bullets: section.bullets === undefined ? null : [...section.bullets] };
  });
  return createHash("sha256").update(JSON.stringify({ title: raw.title, updated: raw.updated, sections }), "utf8").digest("hex");
}

function exactPair(pair, kind, version) {
  return Boolean(pair && typeof pair === "object" && !Array.isArray(pair)
    && Object.keys(pair).length === 2
    && pair.kind === kind && pair.version === version);
}
function successful(response) {
  return response && response.ok === true && Number.isInteger(response.status)
    && response.status >= 200 && response.status <= 299
    && response.payload && typeof response.payload === "object" && !Array.isArray(response.payload)
    && response.payload.ok !== false;
}
function assertStanding(response, expected, accepted) {
  if (!successful(response) || response.payload.accepted !== accepted
    || !Array.isArray(response.payload.required) || response.payload.required.length !== 1
    || !exactPair(response.payload.required[0], expected.kind, expected.version)) {
    throw new Error("The synthetic agreement standing did not match the exact expected state.");
  }
}
function assertAccepted(response, expected, alreadyAccepted) {
  if (!successful(response) || response.payload.kind !== expected.kind
    || response.payload.version !== expected.version
    || response.payload.alreadyAccepted !== alreadyAccepted) {
    throw new Error("The synthetic acceptance response did not confirm the expected identity.");
  }
}

/**
 * request is injected to make the finite protocol independently testable.
 * The harness entry point below binds it to the guarded browser transport.
 * No response body, session identifier or cookie is retained in the receipt.
 */
export async function verifySyntheticPolicyProtocol({ origin, request, expected = POLICY_V2_EXPECTATION }) {
  assertSyntheticOrigin(origin);
  if (!expected || expected.kind !== "early_access_terms" || expected.version !== "v2"
    || expected.historicalVersion !== "v1" || expected.slug !== "early-access-product-policy"
    || expected.historicalSlug !== "research-use"
    || !/^[a-f0-9]{64}$/.test(expected.bodySha256)
    || !/^[a-f0-9]{64}$/.test(expected.historicalBodySha256)) {
    throw new Error("Invalid explicit policy expectation.");
  }
  let count = 0;
  async function step(method, path, body) {
    if (++count > 8 || !PATHS.has(path) || !["GET", "POST"].includes(method)
      || (method === "POST" && path !== ACCEPT_PATH)) throw new Error("Invalid synthetic protocol step.");
    return request({ origin, method, path, ...(body ? { body } : {}) });
  }
  const policies = await step("GET", POLICY_PATH);
  if (!successful(policies) || !policies.payload.policies) throw new Error("Synthetic policies unavailable.");
  const current = policies.payload.policies[expected.slug];
  const historical = policies.payload.policies[expected.historicalSlug];
  if (!exactPair(current?.agreement, expected.kind, expected.version)
    || !exactPair(historical?.agreement, expected.kind, expected.historicalVersion)
    || policyBodyDigest(current) !== expected.bodySha256
    || policyBodyDigest(historical) !== expected.historicalBodySha256) {
    throw new Error("The published policies differ from the explicitly reviewed documents.");
  }
  // A fresh synthetic owner is necessary to prove the refusal did not unlock it.
  assertStanding(await step("GET", STANDING_PATH), expected, false);
  const stale = await step("POST", ACCEPT_PATH, { kind: expected.kind, version: expected.historicalVersion });
  if (!stale || stale.ok !== false || stale.status !== 400
    || stale.payload?.ok !== false || stale.payload.code !== "AGREEMENT_NOT_REQUIRED") {
    throw new Error("Stale v1 was not rejected with its exact refusal contract.");
  }
  assertStanding(await step("GET", STANDING_PATH), expected, false);
  assertAccepted(await step("POST", ACCEPT_PATH, { kind: expected.kind, version: expected.version }), expected, false);
  assertStanding(await step("GET", STANDING_PATH), expected, true);
  // Replay only this synthetic acceptance, not a customer order submission.
  assertAccepted(await step("POST", ACCEPT_PATH, { kind: expected.kind, version: expected.version }), expected, true);
  assertStanding(await step("GET", STANDING_PATH), expected, true);
  return Object.freeze({
    schemaVersion: 1,
    scope: "synthetic-loopback-policy-protocol",
    productionVerified: false,
    requestCount: count,
    expectedAgreement: { kind: expected.kind, version: expected.version },
    policyBodySha256: expected.bodySha256,
    historicalPolicyBodySha256: expected.historicalBodySha256,
    checks: ["EXACT_V2_DOCUMENT", "HISTORICAL_V1_PRESERVED", "FRESH_OWNER_UNACCEPTED",
      "STALE_V1_REFUSED", "STALE_V1_DID_NOT_UNLOCK", "EXACT_V2_ACCEPTED",
      "V2_STANDING_CONFIRMED", "V2_REPLAY_IDEMPOTENT"],
    // This checks observable standing, not a direct database row inventory.
    databaseRowsInspected: false,
  });
}

export function makeLoopbackBrowserRequest(page, origin) {
  const checkedOrigin = assertSyntheticOrigin(origin);
  return async ({ origin: suppliedOrigin, method, path, body }) => {
    if (suppliedOrigin !== checkedOrigin || !PATHS.has(path)
      || !["GET", "POST"].includes(method) || (method === "POST" && path !== ACCEPT_PATH)
      || (method === "GET" && body !== undefined)) throw new Error("Invalid loopback request.");
    const input = { origin: checkedOrigin, method, path, body };
    // page.evaluate is the existing raw-CDP expression API, not Playwright.
    return page.evaluate(`(async () => {
      const input = ${JSON.stringify(input)};
      if (location.origin !== input.origin) throw new Error('Synthetic origin changed.');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(input.origin + input.path, {
          method: input.method, credentials: 'include', cache: 'no-store', redirect: 'error',
          signal: controller.signal,
          headers: { 'accept': 'application/json', ...(input.method === 'POST' ? { 'content-type': 'application/json' } : {}) },
          ...(input.method === 'POST' ? { body: JSON.stringify(input.body) } : {})
        });
        if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Synthetic API returned non-JSON.');
        const bytes = await response.text();
        if (bytes.length > 262144) throw new Error('Synthetic response too large.');
        return { ok: response.ok, status: response.status, payload: JSON.parse(bytes) };
      } finally { clearTimeout(timer); }
    })()`);
  };
}

export async function verifySyntheticPolicyV2(page, origin) {
  return verifySyntheticPolicyProtocol({ origin, request: makeLoopbackBrowserRequest(page, origin) });
}
