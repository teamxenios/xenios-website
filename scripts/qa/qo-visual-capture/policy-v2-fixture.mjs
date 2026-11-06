import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const entry = "/api/research/early-access";
export const policyPaths = Object.freeze({
  documents: "/api/research/policies",
  standing: entry + "/agreements",
  accept: entry + "/agreements/accept",
  intent: entry + "/request-intents",
  config: entry + "/request-intents/config",
  catalog: entry + "/request-intents/catalog",
  recover: entry + "/request-intents/recover",
});
const reads = new Set([policyPaths.documents, policyPaths.standing, policyPaths.config, policyPaths.catalog]);
const writes = new Set([policyPaths.accept, policyPaths.intent, policyPaths.recover]);
const catalogParams = new Set(["search", "family", "page", "pageSize"]);

export function isPolicyFixtureRequest(method, url) {
  if (!(method === "GET" && reads.has(url.pathname) || method === "POST" && writes.has(url.pathname))) return false;
  if (url.pathname !== policyPaths.catalog) return !url.search;
  return [...url.searchParams.keys()].every((key) => catalogParams.has(key) && url.searchParams.getAll(key).length === 1);
}

export const policyMembers = Object.freeze({
  prior: { authUserId: "00000000-0000-4000-8000-000000000003", memberId: "qa-prior", cartScope: "a".repeat(64) },
  other: { authUserId: "00000000-0000-4000-8000-000000000004", memberId: "qa-other", cartScope: "b".repeat(64) },
});
export const policyProductNames = ["Synthetic clinical", "Synthetic research"];

const products = ["clinical", "research"].map((id) => {
  const clinical = id === "clinical";
  const family = clinical ? "clinical_formulations_503a" : "research_peptides_materials";
  const displayState = clinical ? "care_pathway" : "request_access";
  return {
    productId: id, variantId: id + "-variant", productName: "Synthetic " + id,
    family, channel: "synthetic", specification: "Synthetic variant",
    format: null, packBasis: null, minimumQuantity: 1, maximumQuantity: 100, quantityIncrement: 1,
    unitPriceCents: null, currency: "USD", workflowMode: clinical ? "provider_request" : "request_pricing",
    actionLabel: "Add to request", accessNotice: null, researchUseOnly: !clinical,
    catalogVersion: "synthetic", priceVersion: null,
    sourceSelection: { family, slug: id, variantId: id + "-source" },
    selectableForReview: true, intentExclusion: null, clinicalReviewRequired: clinical,
    sourceDisplayState: displayState, sourceVariantDisplayState: displayState, sourceRefusal: null,
  };
});

// Mount the candidate's existing handlers on a private loopback port. Only the
// owner resolver, catalog, acceptance ledger and request repository are fixtures.
export async function createMountedPolicyFixture(candidate) {
  const fromCandidate = (path) => import(pathToFileURL(join(candidate, path)).href);
  const require = createRequire(join(candidate, "package.json"));
  const express = require("express");
  const [
    { RequestIntentService }, { createRequestIntentRouter }, { sha256AssistedOrderHasher },
    { createEarlyAccessAgreementAcceptRoute, createEarlyAccessAgreementStatusRoute },
    { policies, RESEARCH_USE_POLICY_AGREEMENT, publishedEarlyAccessAgreement },
    { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair },
  ] = await Promise.all([
    fromCandidate("server/research/assisted-order/request-intent/service.ts"),
    fromCandidate("server/research/assisted-order/request-intent/express.ts"),
    fromCandidate("server/research/assisted-order/defaults.ts"),
    fromCandidate("server/research/early-access/routes/agreement-routes.ts"),
    fromCandidate("server/research/policies-data.ts"),
    fromCandidate("shared/research/assisted-order/form.ts"),
  ]);
  const historical = RESEARCH_USE_POLICY_AGREEMENT;
  const current = publishedEarlyAccessAgreement();
  assert.deepEqual(historical, { kind: "early_access_terms", version: "v1" });
  assert.deepEqual(current, { kind: "early_access_terms", version: "v2" });
  let active = historical;
  let intakeOpen = true;
  const accepted = new Map([
    ["draft:v1", "2026-10-14T12:00:00.000Z"], ["prior:v1", "2026-10-14T12:01:00.000Z"],
  ]);
  const attempts = new Map();
  const capabilities = new Set(["assisted_orders:submit"]);
  const viewers = new Map(["protocol", "draft", "prior", "other"].map((owner) => [
    owner, Object.hasOwn(policyMembers, owner)
      ? { actorType: "member", ...policyMembers[owner], capabilities }
      : { actorType: "early_access_session", earlyAccessCustomerRef: owner,
          earlyAccessSessionHash: "synthetic-policy-" + owner, capabilities },
  ]));
  const ownerForViewer = new Map([...viewers].map(([owner, viewer]) => [viewer, owner]));
  const identity = { resolve: async ({ cookieHeader }) => viewers.has(cookieHeader)
    ? { customerRef: cookieHeader } : null };
  const standing = { accepted: async (owner) => accepted.has(owner + ":" + active.version) };
  const recorder = { record: async ({ customerRef, version, acceptedAt }) => {
    const key = customerRef + ":" + version;
    if (accepted.has(key)) return "already_on_file";
    accepted.set(key, acceptedAt);
    return "recorded";
  } };
  const service = new RequestIntentService({
    catalog: {
      list: async (_viewer, query) => ({
        items: products, total: products.length, page: query.page, pageSize: query.pageSize,
        families: products.map((item) => item.family), channels: [], workflowModes: [],
      }),
      resolveMany: async (_viewer, lines) => lines.map((line) => products.find((item) =>
        item.productId === line.productId && item.variantId === line.variantId) ?? null),
    },
    repository: {
      findAttempt: async (owner, attempt) => attempts.get(owner + ":" + attempt) ?? null,
      createOrReplay: async (record) => {
        const key = record.ownerHash + ":" + record.attemptHash;
        if (!attempts.has(key)) {
          const { kind, requestId, publicReference, status, createdAt } = record.detail;
          attempts.set(key, { fingerprint: record.fingerprint,
            receipt: { kind, requestId, publicReference, status, createdAt } });
        }
        return attempts.get(key);
      },
    },
    standing: { accepted: async (viewer) => standing.accepted(ownerForViewer.get(viewer)) },
    legal: { requiredAgreements: async () => [active] },
    hasher: sha256AssistedOrderHasher,
    ids: { uuid: randomUUID }, clock: { now: () => new Date() },
  });
  const form = ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((ack) =>
    ({ id: ack.id, scope: ack.scope, copy: ack.copy, ...assistedOrderFormPair(ack) }));

  const app = express();
  const ownerOf = (request) => request.get("x-xenios-qa-owner");
  app.use((req, res, next) => {
    const url = new URL(req.originalUrl, "http://127.0.0.1");
    if (!viewers.has(ownerOf(req)) || !isPolicyFixtureRequest(req.method, url)) {
      res.status(404).json({ error: "outside_policy_fixture" });
      return;
    }
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.get(policyPaths.documents, (_req, res) => res.json({
    // Represent a previously loaded v1 view on the mounted form using the
    // exact historical document. After cutover the canonical map is unmodified.
    policies: active === historical ? { ...policies, "early-access-product-policy": policies["research-use"] } : policies,
  }));
  app.get(policyPaths.standing, async (req, res) => createEarlyAccessAgreementStatusRoute({
    identity, agreements: standing, required: [active],
  })({ cookieHeader: ownerOf(req) }, res));
  app.post(policyPaths.accept, async (req, res) => createEarlyAccessAgreementAcceptRoute({
    identity, recorder, required: [active], now: Date.now,
  })({ cookieHeader: ownerOf(req), body: req.body }, res));
  app.get(policyPaths.config, (_req, res) => {
    if (!intakeOpen) {
      res.status(503).json({ enabled: false, error: "request_intent_disabled" });
      return;
    }
    res.json({ enabled: true, requiredAgreements: [active], formAcknowledgments: form });
  });
  const nextLocal = (_req, _res, next) => next();
  app.use(policyPaths.intent, createRequestIntentRouter({
    service, resolveCustomer: async (req) => viewers.get(ownerOf(req)),
    care: {}, staffReadEnabled: () => false, staffReader: {},
    mutationGuard: nextLocal, readRateLimit: nextLocal, writeRateLimit: nextLocal,
    enabled: () => intakeOpen,
  }));
  app.use((_err, _req, res, _next) => res.status(400).json({ error: "invalid_policy_fixture_request" }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  return {
    origin: "http://127.0.0.1:" + server.address().port,
    savedCount: () => attempts.size,
    acceptedAt: (owner, version) => accepted.get(owner + ":" + version) ?? null,
    cutover() {
      assert.equal(active, historical);
      active = current;
    },
    closeIntake() {
      assert.equal(active, current);
      intakeOpen = false;
    },
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
