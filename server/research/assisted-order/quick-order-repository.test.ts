import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { AssistedOrderViewer } from "./ports";
import type { CommitArguments, NormalizedSubmission, QuickOrderPrivateContext } from "../health/quick-order/ports";
import { submissionHash } from "../health/quick-order/handler.mjs";
import { ESTIMATE_EXCLUSIONS } from "../health/quick-order/core.mjs";
import {
  ASSISTED_ORDER_CURRENCY,
  ASSISTED_ORDER_MAX_QUANTITY,
  ASSISTED_ORDER_SOURCE,
  type AssistedOrderAdminDetail,
  type AssistedOrderLineSnapshot,
} from "../../../shared/research/assisted-order/contract";
import {
  decodeQuickOrderAdminEnvelope,
  PROPOSED_QUICK_ORDER_ADMIN_TEMPLATE,
  QUICK_ORDER_ADMIN_ENVELOPE_VERSION,
  QuickOrderAdminEnvelopeError,
  createQuickOrderTransactionExtension,
  QUICK_ORDER_COMMIT_RPC,
  QUICK_ORDER_REPLAY_RPC,
  type QuickOrderCandidateDependencies,
  type QuickOrderCandidateRpcResult,
} from "./quick-order-repository";

// Synthetic values only. This pure decoder suite neither calls a repository nor
// proves a stored request, transaction, notification, authorized read or freshness.
type Row = Record<string, unknown>;
const REQUEST_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_REQUEST_ID = "a0000000-0000-4000-8000-000000000002";
const REFERENCE = "XRR-20261006-ABCDEF1234";
const OTHER_REFERENCE = "XRR-20261006-ABCDEF5678";
const CREATED_AT = "2026-10-06T12:00:00.000Z";
const OBSERVED_AT = "2026-10-06T12:05:00.000Z";
const PAYLOAD_HASH = "a".repeat(64);
const EVENT_KEY = `assisted-order:${REQUEST_ID}:quick-order-submitted:admin`;
const INTAKE = "enrichment.companion.intake";
const NOTIFICATION = "enrichment.observation.notification";

function line(overrides: Partial<AssistedOrderLineSnapshot> = {}): AssistedOrderLineSnapshot {
  return {
    lineId: "b0000000-0000-4000-8000-000000000001",
    productId: "synthetic-product",
    variantId: "synthetic-variant",
    productName: "Synthetic retained product",
    specification: null,
    format: null,
    packBasis: null,
    quantity: 2,
    minimumQuantity: 1,
    maximumQuantity: 100,
    quantityIncrement: 1,
    workflowMode: "direct_order_request",
    customerActionLabel: "Request order",
    unitPriceCents: 1_250,
    lineEstimateCents: 2_500,
    currency: ASSISTED_ORDER_CURRENCY,
    catalogVersion: "synthetic-catalog-v1",
    priceVersion: "synthetic-price-v1",
    accessNotice: null,
    researchUseOnly: false,
    ...overrides,
  };
}

function fixture(): Row {
  const address = {
    line1: "1 Synthetic Test Way", line2: "", city: "Test City",
    region: "IL", postalCode: "60000", countryCode: "US",
  };
  const detail: AssistedOrderAdminDetail = {
    requestId: REQUEST_ID,
    publicReference: REFERENCE,
    status: "submitted",
    source: ASSISTED_ORDER_SOURCE,
    actorMemberId: null,
    fullLegalName: "Synthetic Test Customer",
    email: "synthetic-customer@example.invalid",
    mobilePhone: "+12025550100",
    organizationName: null,
    shippingAddress: { ...address },
    billingAddress: { ...address },
    lines: [line()],
    estimatedTotalCents: 2_500,
    currency: ASSISTED_ORDER_CURRENCY,
    generalNotes: null,
    agreements: [{ kind: "synthetic-terms", version: "synthetic-v1", acceptedAt: CREATED_AT }],
    affiliateAttributionRef: null,
    declaredAffiliateCode: null,
    declaredAffiliateCodeState: "not_provided",
    timeline: [{ status: "submitted", occurredAt: CREATED_AT, customerMessage: null }],
    documents: [],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
  const estimate = { knownSubtotalCents: 2_500, estimateComplete: true, currency: ASSISTED_ORDER_CURRENCY };
  return {
    schemaVersion: QUICK_ORDER_ADMIN_ENVELOPE_VERSION,
    requestId: REQUEST_ID,
    detail,
    submittedEvent: {
      schemaVersion: "quick-order-v1", requestId: REQUEST_ID,
      eventType: "submitted", occurredAt: CREATED_AT, payloadHash: PAYLOAD_HASH,
    },
    enrichment: {
      schemaVersion: "quick-order-v1",
      companion: {
        requestId: REQUEST_ID, payloadHash: PAYLOAD_HASH,
        intake: {
          schemaVersion: "quick-order-v1", source: "person", sourceDetail: "Synthetic referrer",
          declaredCode: null, affiliationKind: "none", affiliationDetail: "",
          confirmedByCustomer: true, confirmedAt: CREATED_AT, requestAcknowledged: true,
          reviewState: "captured_unmatched", commissionState: "not_authorized", estimate: { ...estimate },
        },
      },
      receipt: {
        schemaVersion: "quick-order-v1", requestId: REQUEST_ID, publicReference: REFERENCE,
        payloadHash: PAYLOAD_HASH, attributionState: "captured_unmatched", estimate: { ...estimate },
      },
      obligation: {
        eventKey: EVENT_KEY,
        templateKey: PROPOSED_QUICK_ORDER_ADMIN_TEMPLATE,
        payload: { schemaVersion: "quick-order-v1", requestId: REQUEST_ID, publicReference: REFERENCE },
      },
      observation: {
        state: "observed", eventKey: EVENT_KEY, observedAt: OBSERVED_AT,
        notification: { status: "pending", attemptCount: 0, nextAttemptAt: CREATED_AT, completedAt: null },
      },
    },
  };
}

function rowAt(value: unknown, path: string): Row {
  return path.split(".").filter(Boolean).reduce<unknown>(
    (current, key) => (current as Row)[key], value,
  ) as Row;
}
function setAt(value: Row, path: string, replacement: unknown): void {
  const parts = path.split(".");
  const key = parts.pop()!;
  rowAt(value, parts.join("."))[key] = replacement;
}
function reject(value: unknown, requestId = REQUEST_ID): void {
  expect(() => decodeQuickOrderAdminEnvelope(value, requestId)).toThrow(QuickOrderAdminEnvelopeError);
}
function quickOrder(value: Row) {
  const decoded = decodeQuickOrderAdminEnvelope(value, REQUEST_ID);
  expect(decoded).not.toBeNull();
  expect(decoded?.quickOrder).not.toBeNull();
  return decoded!.quickOrder!;
}
function expectedObservation(value: Row): Row {
  const { state, observedAt, notification } = rowAt(value, "enrichment.observation");
  return { state, observedAt, notification };
}
function setEstimate(value: Row, subtotal: number, complete: boolean): void {
  const estimate = { knownSubtotalCents: subtotal, estimateComplete: complete, currency: ASSISTED_ORDER_CURRENCY };
  setAt(value, `${INTAKE}.estimate`, { ...estimate });
  setAt(value, "enrichment.receipt.estimate", { ...estimate });
  setAt(value, "detail.estimatedTotalCents", subtotal === 0 ? null : subtotal);
}

// Independent explicit key lists ensure omission of a canonical nullable field
// cannot accidentally turn a fixture into a tolerated partial/legacy record.
const closedRecords: readonly { path: string; keys: readonly string[] }[] = [
  { path: "", keys: ["schemaVersion", "requestId", "detail", "submittedEvent", "enrichment"] },
  { path: "detail", keys: ["requestId", "publicReference", "status", "source", "actorMemberId", "fullLegalName", "email", "mobilePhone", "organizationName", "shippingAddress", "billingAddress", "lines", "estimatedTotalCents", "currency", "generalNotes", "agreements", "affiliateAttributionRef", "declaredAffiliateCode", "declaredAffiliateCodeState", "timeline", "documents", "createdAt", "updatedAt"] },
  { path: "detail.lines.0", keys: ["lineId", "productId", "variantId", "productName", "specification", "format", "packBasis", "quantity", "minimumQuantity", "maximumQuantity", "quantityIncrement", "workflowMode", "customerActionLabel", "unitPriceCents", "lineEstimateCents", "currency", "catalogVersion", "priceVersion", "accessNotice", "researchUseOnly"] },
  { path: "submittedEvent", keys: ["schemaVersion", "requestId", "eventType", "occurredAt", "payloadHash"] },
  { path: "enrichment", keys: ["schemaVersion", "companion", "receipt", "obligation", "observation"] },
  { path: "enrichment.companion", keys: ["requestId", "payloadHash", "intake"] },
  { path: INTAKE, keys: ["schemaVersion", "source", "sourceDetail", "declaredCode", "affiliationKind", "affiliationDetail", "confirmedByCustomer", "confirmedAt", "requestAcknowledged", "reviewState", "commissionState", "estimate"] },
  { path: `${INTAKE}.estimate`, keys: ["knownSubtotalCents", "estimateComplete", "currency"] },
  { path: "enrichment.receipt", keys: ["schemaVersion", "requestId", "publicReference", "payloadHash", "attributionState", "estimate"] },
  { path: "enrichment.receipt.estimate", keys: ["knownSubtotalCents", "estimateComplete", "currency"] },
  { path: "enrichment.obligation", keys: ["eventKey", "templateKey", "payload"] },
  { path: "enrichment.obligation.payload", keys: ["schemaVersion", "requestId", "publicReference"] },
  { path: "enrichment.observation", keys: ["state", "eventKey", "observedAt", "notification"] },
  { path: NOTIFICATION, keys: ["status", "attemptCount", "nextAttemptAt", "completedAt"] },
];
const requiredFields = closedRecords.flatMap(({ path, keys }) => keys.map(key => ({
  path, key, label: [path, key].filter(Boolean).join("."),
})));

describe("proposed Quick Order admin envelope: closed evidence", () => {
  it("decodes a complete synthetic envelope while leaving canonical detail for its existing decoder", () => {
    const value = fixture();
    for (const { path, keys } of closedRecords) {
      expect(Object.keys(rowAt(value, path)).sort()).toEqual([...keys].sort());
    }
    const decoded = decodeQuickOrderAdminEnvelope(value, REQUEST_ID)!;
    expect(decoded.detail).toBe(value.detail);
    expect(decoded.quickOrder).toEqual({
      intake: rowAt(value, INTAKE), observation: expectedObservation(value),
    });
    expect(decoded.quickOrder!.observation).not.toHaveProperty("eventKey");
  });

  it("uses null only for absence and requires an explicit closed legacy envelope", () => {
    expect(decodeQuickOrderAdminEnvelope(null, REQUEST_ID)).toBeNull();
    const legacy = fixture();
    legacy.enrichment = null;
    legacy.submittedEvent = null;
    expect(decodeQuickOrderAdminEnvelope(legacy, REQUEST_ID)).toEqual({ detail: legacy.detail, quickOrder: null });
    delete legacy.enrichment;
    reject(legacy);
  });

  it.each([
    { label: "undefined", value: undefined }, { label: "false", value: false },
    { label: "zero", value: 0 }, { label: "empty string", value: "" },
    { label: "array", value: [] }, { label: "object", value: {} },
  ])("refuses non-null absence lookalike $label", ({ value }) => reject(value));

  it.each(["", "not-a-uuid", REQUEST_ID.toUpperCase(), `${REQUEST_ID} `])("validates the requested identity even for absent data: %s", requestId => {
    reject(null, requestId);
  });

  it.each(requiredFields)("refuses missing required $label", ({ path, key }) => {
    const value = fixture();
    delete rowAt(value, path)[key];
    reject(value);
  });

  it.each(closedRecords)("refuses unknown fields at '$path'", ({ path }) => {
    const value = fixture();
    rowAt(value, path).unexpected = "synthetic-unknown";
    reject(value);
  });

  it.each(closedRecords)("rejects own accessors before reading them at '$path'", ({ path, keys }) => {
    const value = fixture();
    let reads = 0;
    Object.defineProperty(rowAt(value, path), keys[0], {
      enumerable: true, configurable: true,
      get() { reads += 1; throw new Error("synthetic getter must not run"); },
    });
    reject(value);
    expect(reads).toBe(0);
  });

  it.each(closedRecords)("rejects hidden symbol fields at '$path'", ({ path }) => {
    const value = fixture();
    Object.defineProperty(rowAt(value, path), Symbol("synthetic-private-field"), { value: "synthetic" });
    reject(value);
  });

  it("accepts plain null-prototype records without depending on inherited authority", () => {
    const value = fixture();
    for (const { path } of closedRecords) Object.setPrototypeOf(rowAt(value, path), null);
    expect(quickOrder(value).intake.commissionState).toBe("not_authorized");
  });

  it.each(closedRecords)("rejects inherited record authority at '$path'", ({ path }) => {
    const value = fixture();
    Object.setPrototypeOf(rowAt(value, path), { syntheticAuthority: true });
    reject(value);
  });

  it.each(["submittedEvent", "enrichment.companion", "enrichment.receipt", "enrichment.obligation", "enrichment.observation"])("does not recover missing evidence by treating %s as legacy", path => {
    const value = fixture();
    setAt(value, path, null);
    reject(value);
  });

  it("refuses a Quick Order marker with null enrichment", () => {
    const value = fixture();
    value.enrichment = null;
    reject(value);
  });

  it("keeps legacy detail closed and bound to the requested identity", () => {
    for (const [path, replacement] of [
      ["detail.requestId", OTHER_REQUEST_ID], ["detail.source", "quick_order"],
      ["detail.publicReference", "XRR-invalid"], ["detail.statusToken", "synthetic-private-token"],
    ] as const) {
      const value = fixture();
      value.enrichment = null;
      value.submittedEvent = null;
      setAt(value, path, replacement);
      reject(value);
    }
  });
});

describe("Quick Order evidence identity and representation", () => {
  it.each([
    "requestId", "detail.requestId", "submittedEvent.requestId", "enrichment.companion.requestId",
    "enrichment.receipt.requestId", "enrichment.obligation.payload.requestId",
  ])("refuses cross-request evidence at %s", path => {
    const value = fixture();
    setAt(value, path, OTHER_REQUEST_ID);
    reject(value);
  });

  it.each(["submittedEvent.payloadHash", "enrichment.companion.payloadHash", "enrichment.receipt.payloadHash"])("refuses a different retained hash at %s", path => {
    const value = fixture();
    setAt(value, path, "b".repeat(64));
    reject(value);
  });

  it.each(["", "a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64)])("refuses an identically malformed hash across all evidence: %#", hash => {
    const value = fixture();
    for (const path of ["submittedEvent.payloadHash", "enrichment.companion.payloadHash", "enrichment.receipt.payloadHash"]) setAt(value, path, hash);
    reject(value);
  });

  it.each(["detail.publicReference", "enrichment.receipt.publicReference", "enrichment.obligation.payload.publicReference"])("refuses a different public reference at %s", path => {
    const value = fixture();
    setAt(value, path, OTHER_REFERENCE);
    reject(value);
  });

  it.each(["XRR-20261006-abcdef1234", "XRR-2026106-ABCDEF1234", "XRR-20261006-ABCDEF123", `${REFERENCE} `, "https://example.invalid/request"])("refuses consistently noncanonical references: %s", reference => {
    const value = fixture();
    for (const path of ["detail.publicReference", "enrichment.receipt.publicReference", "enrichment.obligation.payload.publicReference"]) setAt(value, path, reference);
    reject(value);
  });

  it.each([
    "schemaVersion", "submittedEvent.schemaVersion", "enrichment.schemaVersion", `${INTAKE}.schemaVersion`,
    "enrichment.receipt.schemaVersion", "enrichment.obligation.payload.schemaVersion",
  ])("refuses unknown schema versions at %s", path => {
    const value = fixture();
    setAt(value, path, "quick-order-v999");
    reject(value);
  });

  it.each([
    { path: "detail.source", value: "health_quick_order" },
    { path: "submittedEvent.eventType", value: "approved" },
    { path: "enrichment.receipt.attributionState", value: "matched_manual" },
    { path: "enrichment.obligation.eventKey", value: `assisted-order:${OTHER_REQUEST_ID}:quick-order-submitted:admin` },
    { path: "enrichment.obligation.eventKey", value: `assisted-order:${REQUEST_ID}:quick-order-submitted:customer` },
    { path: "enrichment.obligation.templateKey", value: "research.assisted_order.paid.admin.v1" },
    { path: "enrichment.observation.eventKey", value: `assisted-order:${OTHER_REQUEST_ID}:quick-order-submitted:admin` },
    { path: "enrichment.observation.eventKey", value: `assisted-order:${REQUEST_ID}:quick-order-submitted:customer` },
    { path: "submittedEvent.occurredAt", value: OBSERVED_AT },
    { path: "detail.createdAt", value: OBSERVED_AT },
    { path: `${INTAKE}.confirmedAt`, value: OBSERVED_AT },
  ])("refuses mismatched binding $path", ({ path, value: replacement }) => {
    const value = fixture();
    setAt(value, path, replacement);
    reject(value);
  });

  it.each([
    "2026-10-06T12:00:00Z", "2026-10-06T12:00:00.000+00:00", "2026-10-06 12:00:00.000Z",
    "2026-02-30T12:00:00.000Z", "2026-10-06T24:00:00.000Z", "2026-10-06T12:00:00.0000Z",
  ])("refuses identically non-normalized intake/event/created timestamps: %s", time => {
    const value = fixture();
    for (const path of ["submittedEvent.occurredAt", "detail.createdAt", `${INTAKE}.confirmedAt`]) setAt(value, path, time);
    reject(value);
  });

  it.each(["statusToken", "accessToken", "paymentVerified", "paymentProof", "paymentUrl", "recoveryUrl", "uploadUrl", "operatorUrl"])("refuses unapproved %s fields at each evidence boundary", key => {
    for (const { path } of closedRecords) {
      const value = fixture();
      rowAt(value, path)[key] = "synthetic-private-value";
      reject(value);
    }
  });

  it("returns a fixed failure without including retained private values", () => {
    const value = fixture();
    rowAt(value, "enrichment.receipt").statusToken = "synthetic-private-value-do-not-echo";
    let failure: unknown;
    try { decodeQuickOrderAdminEnvelope(value, REQUEST_ID); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(QuickOrderAdminEnvelopeError);
    expect((failure as Error).name).toBe("QuickOrderAdminEnvelopeError");
    expect((failure as Error).message).toBe("Quick Order admin evidence is unavailable.");
    expect(String(failure)).not.toContain("synthetic-private-value-do-not-echo");
  });
});

describe("retained Quick Order declarations grant no attribution authority", () => {
  it.each(["person", "collective", "organization", "social", "search", "direct", "other"])("accepts the existing source vocabulary: %s", source => {
    const value = fixture();
    setAt(value, `${INTAKE}.source`, source);
    if (source === "direct") {
      setAt(value, `${INTAKE}.sourceDetail`, "");
      setAt(value, `${INTAKE}.reviewState`, "direct_no_referrer");
      setAt(value, "enrichment.receipt.attributionState", "direct_no_referrer");
    }
    expect(quickOrder(value).intake).toMatchObject({ source, commissionState: "not_authorized" });
  });

  it.each(["none", "collective", "gym", "team", "clinic", "other"])("accepts the existing affiliation vocabulary: %s", affiliationKind => {
    const value = fixture();
    setAt(value, `${INTAKE}.affiliationKind`, affiliationKind);
    setAt(value, `${INTAKE}.affiliationDetail`, affiliationKind === "none" ? "" : "Équipe 合作 🤝");
    expect(quickOrder(value).intake.affiliationKind).toBe(affiliationKind);
  });

  it("retains canonical Unicode and a 64-character code without matching or authorizing commission", () => {
    const value = fixture();
    setAt(value, `${INTAKE}.sourceDetail`, "Équipe 合作 🤝");
    setAt(value, `${INTAKE}.declaredCode`, "A1_-".repeat(16));
    expect(quickOrder(value).intake).toMatchObject({
      sourceDetail: "Équipe 合作 🤝", declaredCode: "A1_-".repeat(16),
      reviewState: "captured_unmatched", commissionState: "not_authorized",
    });
  });

  it.each(["", "Optional direct source detail"])("a direct source without code stays direct even with optional detail '%s'", detail => {
    const value = fixture();
    Object.assign(rowAt(value, INTAKE), { source: "direct", sourceDetail: detail, reviewState: "direct_no_referrer" });
    setAt(value, "enrichment.receipt.attributionState", "direct_no_referrer");
    expect(quickOrder(value).intake.reviewState).toBe("direct_no_referrer");
  });

  it("keeps a code declared with direct source unmatched", () => {
    const value = fixture();
    Object.assign(rowAt(value, INTAKE), { source: "direct", sourceDetail: "", declaredCode: "SYNTHETIC_CODE-1" });
    expect(quickOrder(value).intake.reviewState).toBe("captured_unmatched");
    setAt(value, `${INTAKE}.reviewState`, "direct_no_referrer");
    setAt(value, "enrichment.receipt.attributionState", "direct_no_referrer");
    reject(value);
  });

  it("accepts the exact UTF-16 detail length boundary used by existing declarations", () => {
    const value = fixture();
    Object.assign(rowAt(value, INTAKE), {
      sourceDetail: "界".repeat(180), affiliationKind: "team", affiliationDetail: "🤝".repeat(90),
    });
    expect(quickOrder(value).intake.sourceDetail).toHaveLength(180);
    setAt(value, `${INTAKE}.affiliationDetail`, "🤝".repeat(91));
    reject(value);
  });

  it.each([
    { field: "source", value: "affiliate" }, { field: "affiliationKind", value: "partner" },
    { field: "sourceDetail", value: "" }, { field: "sourceDetail", value: null },
    { field: "sourceDetail", value: " Synthetic referrer" }, { field: "sourceDetail", value: "E\u0301quipe" },
    { field: "sourceDetail", value: "Synthetic\nreferrer" }, { field: "sourceDetail", value: "x".repeat(181) },
    { field: "affiliationDetail", value: "Synthetic affiliation while none" }, { field: "affiliationDetail", value: null },
    { field: "declaredCode", value: "" }, { field: "declaredCode", value: "lowercase" },
    { field: "declaredCode", value: "WITH SPACE" }, { field: "declaredCode", value: "ÉQUIPE" },
    { field: "declaredCode", value: "A".repeat(65) }, { field: "declaredCode", value: 123 },
    { field: "confirmedByCustomer", value: false }, { field: "confirmedByCustomer", value: "true" },
    { field: "requestAcknowledged", value: false }, { field: "reviewState", value: "direct_no_referrer" },
    { field: "reviewState", value: "matched_manual" }, { field: "commissionState", value: "authorized" },
  ])("refuses invalid retained $field declaration %#", ({ field, value: replacement }) => {
    const value = fixture();
    setAt(value, `${INTAKE}.${field}`, replacement);
    reject(value);
  });

  it.each(["collective", "gym", "team", "clinic", "other"])("requires a nonempty named %s affiliation", affiliation => {
    const value = fixture();
    setAt(value, `${INTAKE}.affiliationKind`, affiliation);
    reject(value);
  });
});

describe("Quick Order estimate evidence agrees with canonical retained lines", () => {
  it("retains a partial subtotal and request-pricing nulls without manufacturing a price", () => {
    const value = fixture();
    const unpriced = line({
      lineId: "b0000000-0000-4000-8000-000000000002", variantId: "unpriced-variant",
      workflowMode: "request_pricing", unitPriceCents: null, lineEstimateCents: null, priceVersion: null,
    });
    setAt(value, "detail.lines", [line(), unpriced]);
    setEstimate(value, 2_500, false);
    expect(quickOrder(value).intake.estimate).toEqual({ knownSubtotalCents: 2_500, estimateComplete: false, currency: "USD" });
    setAt(value, "detail.lines", [unpriced]);
    setEstimate(value, 0, false);
    expect(quickOrder(value).intake.estimate).toEqual({ knownSubtotalCents: 0, estimateComplete: false, currency: "USD" });
    expect(rowAt(value, "detail").estimatedTotalCents).toBeNull();
  });

  it("accepts exact retained identity limits and the canonical quantity ceiling", () => {
    const value = fixture();
    setAt(value, "detail.lines", [line({
      productId: "p".repeat(160), variantId: "v".repeat(160), quantity: ASSISTED_ORDER_MAX_QUANTITY,
      minimumQuantity: 5, maximumQuantity: null, quantityIncrement: 5,
      unitPriceCents: 1, lineEstimateCents: ASSISTED_ORDER_MAX_QUANTITY,
    })]);
    setEstimate(value, ASSISTED_ORDER_MAX_QUANTITY, true);
    expect(quickOrder(value).intake.estimate.knownSubtotalCents).toBe(ASSISTED_ORDER_MAX_QUANTITY);
  });

  it("uses the retained minimum as the increment origin", () => {
    const value = fixture();
    setAt(value, "detail.lines", [line({ quantity: 5, minimumQuantity: 2, quantityIncrement: 3, maximumQuantity: 5, lineEstimateCents: 6_250 })]);
    setEstimate(value, 6_250, true);
    expect(quickOrder(value).intake.estimate.knownSubtotalCents).toBe(6_250);
  });

  it.each([
    { path: "detail.lines", value: [] }, { path: "detail.lines", value: null },
    { path: "detail.lines.0.productId", value: "p".repeat(161) },
    { path: "detail.lines.0.variantId", value: "v".repeat(161) },
    { path: "detail.lines.0.productId", value: " synthetic-product" },
    { path: "detail.lines.0.quantity", value: 0 }, { path: "detail.lines.0.quantity", value: 1.5 },
    { path: "detail.lines.0.quantity", value: ASSISTED_ORDER_MAX_QUANTITY + 1 },
    { path: "detail.lines.0.quantity", value: "2" },
    { path: "detail.lines.0.minimumQuantity", value: 0 }, { path: "detail.lines.0.minimumQuantity", value: 3 },
    { path: "detail.lines.0.quantityIncrement", value: 0 }, { path: "detail.lines.0.quantityIncrement", value: 2 },
    { path: "detail.lines.0.maximumQuantity", value: 1 }, { path: "detail.lines.0.maximumQuantity", value: 0 },
    { path: "detail.lines.0.workflowMode", value: "buy_now" }, { path: "detail.lines.0.currency", value: "EUR" },
    { path: "detail.lines.0.workflowMode", value: "provider_request" },
    { path: "detail.lines.0.workflowMode", value: "request_activation" },
    { path: "detail.lines.0.workflowMode", value: "availability_review" },
    { path: "detail.lines.0.researchUseOnly", value: true },
    { path: "detail.lines.0.researchUseOnly", value: null },
    { path: "detail.lines.0.researchUseOnly", value: "false" },
    { path: "detail.lines.0.workflowMode", value: "request_pricing" },
    { path: "detail.lines.0.unitPriceCents", value: 0 }, { path: "detail.lines.0.unitPriceCents", value: -1 },
    { path: "detail.lines.0.unitPriceCents", value: 1.5 }, { path: "detail.lines.0.unitPriceCents", value: null },
    { path: "detail.lines.0.lineEstimateCents", value: null }, { path: "detail.lines.0.lineEstimateCents", value: 2_499 },
    { path: "detail.estimatedTotalCents", value: null }, { path: "detail.estimatedTotalCents", value: 2_501 },
    { path: "detail.currency", value: "EUR" },
    { path: `${INTAKE}.estimate.knownSubtotalCents`, value: -1 },
    { path: `${INTAKE}.estimate.knownSubtotalCents`, value: 2_500.5 },
    { path: `${INTAKE}.estimate.knownSubtotalCents`, value: Number.MAX_SAFE_INTEGER + 1 },
    { path: `${INTAKE}.estimate.knownSubtotalCents`, value: 2_501 },
    { path: `${INTAKE}.estimate.estimateComplete`, value: false },
    { path: `${INTAKE}.estimate.estimateComplete`, value: "true" },
    { path: `${INTAKE}.estimate.currency`, value: "EUR" },
    { path: "enrichment.receipt.estimate.knownSubtotalCents", value: 2_501 },
    { path: "enrichment.receipt.estimate.estimateComplete", value: false },
    { path: "enrichment.receipt.estimate.currency", value: "EUR" },
  ])("refuses inconsistent estimate/line field $path %#", ({ path, value: replacement }) => {
    const value = fixture();
    setAt(value, path, replacement);
    reject(value);
  });

  it("checks line evidence even when companion and receipt agree on the same wrong estimate", () => {
    const value = fixture();
    setEstimate(value, 2_501, true);
    reject(value);
    setEstimate(value, 2_500, false);
    reject(value);
  });

  it("refuses an unpriced line with a numeric estimate and a zero canonical all-unpriced total", () => {
    const value = fixture();
    setAt(value, "detail.lines", [line({ workflowMode: "request_pricing", unitPriceCents: null, lineEstimateCents: 0, priceVersion: null })]);
    setEstimate(value, 0, false);
    reject(value);
    setAt(value, "detail.lines.0.lineEstimateCents", null);
    setAt(value, "detail.estimatedTotalCents", 0);
    reject(value);
  });

  it("refuses duplicate product/variant pairs even when totals otherwise agree", () => {
    const value = fixture();
    setAt(value, "detail.lines", [line(), line({ lineId: "b0000000-0000-4000-8000-000000000002" })]);
    setEstimate(value, 5_000, true);
    reject(value);
  });

  it("accepts 100 distinct retained lines and refuses 101", () => {
    const value = fixture();
    const lines = Array.from({ length: 100 }, (_, index) => line({
      lineId: `b0000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
      variantId: `synthetic-variant-${index}`,
    }));
    setAt(value, "detail.lines", lines);
    setEstimate(value, 250_000, true);
    expect(quickOrder(value).intake.estimate.knownSubtotalCents).toBe(250_000);
    setAt(value, "detail.lines", [...lines, line({ lineId: "b0000000-0000-4000-8000-000000000065", variantId: "synthetic-variant-100" })]);
    setEstimate(value, 252_500, true);
    reject(value);
  });

  it("refuses multiplication overflow even when the reported line total matches the unsafe product", () => {
    const value = fixture();
    setAt(value, "detail.lines", [line({ unitPriceCents: Number.MAX_SAFE_INTEGER, lineEstimateCents: Number.MAX_SAFE_INTEGER * 2 })]);
    reject(value);
  });

  it("refuses subtotal overflow across individually safe priced lines", () => {
    const value = fixture();
    setAt(value, "detail.lines", [
      line({ quantity: 1, unitPriceCents: Number.MAX_SAFE_INTEGER, lineEstimateCents: Number.MAX_SAFE_INTEGER }),
      line({ lineId: "b0000000-0000-4000-8000-000000000002", variantId: "second-variant", quantity: 1, unitPriceCents: 1, lineEstimateCents: 1 }),
    ]);
    // Keep envelope estimates safe and equal so the line accumulator is reached.
    setEstimate(value, Number.MAX_SAFE_INTEGER, true);
    reject(value);
  });
});

describe("Quick Order observation is separate from immutable intake", () => {
  it("preserves an explicit stale observation without inventing notification state", () => {
    const value = fixture();
    setAt(value, "enrichment.observation", { state: "stale" });
    const observation = quickOrder(value).observation;
    expect(observation).toEqual({ state: "stale" });
    expect(Object.isFrozen(observation)).toBe(true);
    for (const extra of [
      { notification: { status: "sent" } }, { eventKey: EVENT_KEY }, { observedAt: OBSERVED_AT },
    ]) {
      setAt(value, "enrichment.observation", { state: "stale", ...extra });
      reject(value);
    }
  });

  it.each(["held", "pending", "processing", "sent", "delivered", "failed_retryable", "failed_permanent", "cancelled"])("retains canonical outbox status %s without inferring delivery or acknowledgment", status => {
    const value = fixture();
    setAt(value, `${NOTIFICATION}.status`, status);
    const observation = quickOrder(value).observation;
    expect(observation).toEqual({
      state: "observed", observedAt: OBSERVED_AT,
      notification: { status, attemptCount: 0, nextAttemptAt: CREATED_AT, completedAt: null },
    });
  });

  it("does not invent counter ceilings, timestamp chronology or completion/status equivalences", () => {
    const value = fixture();
    setAt(value, "enrichment.observation.observedAt", "2000-01-01T00:00:00.000Z");
    Object.assign(rowAt(value, NOTIFICATION), {
      status: "pending", attemptCount: Number.MAX_SAFE_INTEGER,
      nextAttemptAt: "1999-01-01T00:00:00.000Z", completedAt: "2100-01-01T00:00:00.000Z",
    });
    expect(quickOrder(value).observation).toEqual(expectedObservation(value));
    Object.assign(rowAt(value, NOTIFICATION), { status: "sent", attemptCount: 0, completedAt: null });
    expect(quickOrder(value).observation).toEqual(expectedObservation(value));
  });

  it.each([
    { path: "enrichment.observation.state", value: "fresh" },
    { path: "enrichment.observation.observedAt", value: null },
    { path: "enrichment.observation.observedAt", value: "2026-10-06T12:05:00Z" },
    { path: `${NOTIFICATION}.status`, value: "acknowledged" },
    { path: `${NOTIFICATION}.status`, value: "failed" },
    { path: `${NOTIFICATION}.attemptCount`, value: -1 },
    { path: `${NOTIFICATION}.attemptCount`, value: 1.5 },
    { path: `${NOTIFICATION}.attemptCount`, value: Number.MAX_SAFE_INTEGER + 1 },
    { path: `${NOTIFICATION}.attemptCount`, value: "0" },
    { path: `${NOTIFICATION}.nextAttemptAt`, value: null },
    { path: `${NOTIFICATION}.nextAttemptAt`, value: "2026-10-06T12:00:00+00:00" },
    { path: `${NOTIFICATION}.completedAt`, value: "2026-02-30T12:00:00.000Z" },
    { path: `${NOTIFICATION}.completedAt`, value: false },
  ])("refuses malformed observation $path %#", ({ path, value: replacement }) => {
    const value = fixture();
    setAt(value, path, replacement);
    reject(value);
  });

  it("does not mutate or freeze the input, and returns detached frozen Quick Order projections", () => {
    const value = fixture();
    const before = JSON.stringify(value);
    const decoded = decodeQuickOrderAdminEnvelope(value, REQUEST_ID)!;
    const projection = decoded.quickOrder!;
    const projectedBefore = JSON.stringify(projection);
    expect(JSON.stringify(value)).toBe(before);
    for (const { path } of closedRecords) expect(Object.isFrozen(rowAt(value, path))).toBe(false);
    expect(decoded.detail).toBe(value.detail); // Canonical detail deliberately remains unknown, not re-decoded here.
    for (const output of [decoded, projection, projection.intake, projection.intake.estimate, projection.observation]) {
      expect(Object.isFrozen(output)).toBe(true);
    }
    expect(projection.observation.state).toBe("observed");
    if (projection.observation.state === "observed") expect(Object.isFrozen(projection.observation.notification)).toBe(true);
    setAt(value, `${INTAKE}.sourceDetail`, "Changed input declaration");
    setAt(value, `${INTAKE}.estimate.knownSubtotalCents`, 1);
    setAt(value, `${NOTIFICATION}.status`, "sent");
    expect(JSON.stringify(projection)).toBe(projectedBefore);
  });

  it("leaves a rejected envelope unchanged instead of repairing or normalizing retained evidence", () => {
    const value = fixture();
    setAt(value, `${INTAKE}.sourceDetail`, "  noncanonical retained declaration  ");
    const before = JSON.stringify(value);
    reject(value);
    expect(JSON.stringify(value)).toBe(before);
  });
});

// AUTHORED / NOT RUN. This injected transport has no database, real recipient,
// private session, installation anchor or qualified timer route.
const candidateViewer: AssistedOrderViewer = {
  actorType: "member", memberId: "synthetic-member", authUserId: "c0000000-0000-4000-8000-000000000001",
  earlyAccessSessionHash: null, normalizedEmail: "synthetic@example.invalid", capabilities: new Set(["assisted_orders:submit"]),
};
const candidateActor = `member:${candidateViewer.authUserId}`;
const syntheticContext: QuickOrderPrivateContext = {
  rawStoredSessionHash: "e".repeat(64), configuredOwnerId: "c0000000-0000-4000-8000-000000000002",
  actorScope: candidateActor, requiredRole: "synthetic-role",
};
function candidateInput(): NormalizedSubmission {
  const address = { line1: "1 Synthetic Way", line2: "", city: "Test City", region: "IL", postalCode: "60000", countryCode: "US" as const };
  return {
    schemaVersion: "quick-order-v1", idempotencyKey: "Synthetic_Key_0001",
    contact: { fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid", mobilePhone: "+12025550100", organizationName: "", ageConfirmed: true,
      shippingAddress: address, billingSameAsShipping: true, billingAddress: { ...address } },
    referral: { kind: "person", detail: "Synthetic referrer", declaredCode: "", confirmed: true }, affiliation: { kind: "none", detail: "" },
    lines: [{ productId: "synthetic-product", variantId: "synthetic-variant", quantity: 2, expectedCatalogVersion: "synthetic-catalog-v1", expectedPriceVersion: "synthetic-price-v1" }],
    agreements: [{ kind: "synthetic-terms", version: "synthetic-v1" }], requestAcknowledged: true,
  };
}
function candidateArguments(): CommitArguments {
  const input = candidateInput();
  return {
    input, payloadHash: submissionHash(input), receivedAt: CREATED_AT,
    attribution: { schemaVersion: "attribution-v1", source: "person", sourceDetail: "Synthetic referrer", declaredAffiliateCode: null,
      affiliation: { kind: "none", detail: "" }, confirmedByCustomer: true, receivedAt: CREATED_AT, reviewState: "captured_unmatched", commissionState: "not_authorized" },
    snapshots: [{ productId: "synthetic-product", variantId: "synthetic-variant", quantity: 2, workflowMode: "direct_order_request", unitPriceCents: 1250, catalogVersion: "synthetic-catalog-v1", priceVersion: "synthetic-price-v1" }],
    computedEstimate: { knownSubtotalCents: 2500, estimateComplete: true, currency: "USD", excludes: ESTIMATE_EXCLUSIONS },
  };
}
function candidateProfile() {
  return {
    schemaVersion: "quick-order-approved-limits-v1", profileId: "synthetic-nonproduction", profileVersion: "synthetic-v1",
    database: { name: "synthetic_db", oid: "10" }, loginRole: { name: "synthetic_login", oid: "11" },
    requestRole: { name: "service_role", oid: "12" }, ownerRole: { name: "synthetic_owner", oid: "13" },
    routeClass: "intake", routeId: "synthetic-route", timeZone: "UTC", dateStyle: "ISO, YMD",
    intake: { lockTimeoutMs: 250, statementTimeoutMs: 4000, transactionTimeoutMs: 5000, idleTimeoutMs: 1000, deadlockTimeoutMs: 1000, cleanupMs: 1000, attemptDeadlineMs: 8000, acquisitionMs: 1000, responseMs: 1000 },
    writer: { lockTimeoutMs: 7000, statementTimeoutMs: 15000, transactionTimeoutMs: 20000, idleTimeoutMs: 1000, deadlockTimeoutMs: 1000, cleanupMs: 1000, attemptDeadlineMs: 24000, acquisitionMs: 1000, responseMs: 2000, gateWaitMs: 7000, postGateReserveMs: 1000 },
    enforcement: { preBeginAttestationSha256: "a".repeat(64), writerOrderAttestationSha256: "b".repeat(64), singleRpcAutocommit: true },
  };
}
function candidateReceipt() {
  return { requestId: REQUEST_ID, publicReference: REFERENCE, attributionState: "captured_unmatched" as const,
    estimate: { knownSubtotalCents: 2500, estimateComplete: true, currency: "USD" as const, excludes: ESTIMATE_EXCLUSIONS } };
}
function transactionFixture(overrides: Partial<QuickOrderCandidateDependencies> = {}) {
  let clock = 0, expire = () => {};
  const raw = JSON.stringify(candidateProfile());
  const cancel = vi.fn();
  const rpc = vi.fn(async (_name: string, _args: Readonly<Record<string, unknown>>, _options?: { readonly signal: AbortSignal }): Promise<QuickOrderCandidateRpcResult> => ({
    data: { ...candidateReceipt(), persisted: true, replayed: false }, error: null, transactionOutcome: "committed",
  }));
  const schedule = vi.fn((_delay: number, callback: () => void) => { expire = callback; return cancel; });
  const dependencies: QuickOrderCandidateDependencies = {
    rpc, approvedLimitsJson: raw, expectedConfigurationDigest: createHash("sha256").update(raw).digest("hex"),
    notificationRecipient: "synthetic-operator@example.invalid", privateContextFor: () => syntheticContext,
    runtime: { now: () => clock, maximumDelayMs: 24000, schedule }, ...overrides,
  };
  const extension = createQuickOrderTransactionExtension(dependencies);
  const attempt = extension.beginAttempt(candidateViewer, candidateActor, extension.monotonicNow());
  return { extension, attempt, rpc, dependencies, schedule, cancel, setClock: (value: number) => { clock = value; }, expire: () => expire() };
}
describe("disabled canonical transaction adapter (synthetic, not executed)", () => {
  it("has a positive injected control and sends the exact trusted recipient/context through one canonical RPC", async () => {
    const f = transactionFixture(), args = candidateArguments();
    expect(f.attempt).not.toBeNull();
    await expect(f.extension.commitAttempt(candidateViewer, candidateActor, args, f.attempt!)).resolves.toEqual({ ...candidateReceipt(), persisted: true, replayed: false });
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc.mock.calls[0][0]).toBe(QUICK_ORDER_COMMIT_RPC);
    expect(f.rpc.mock.calls[0][1]).toEqual({ p_payload: { schemaVersion: "quick-order-commit-v1", actorScope: candidateActor,
      context: syntheticContext, expectedConfigurationDigest: f.dependencies.expectedConfigurationDigest,
      notificationRecipient: "synthetic-operator@example.invalid", submission: args } });
    expect(f.schedule).toHaveBeenCalledWith(8000, expect.any(Function));
    expect(f.cancel).toHaveBeenCalledOnce();
    await expect(f.extension.commitAttempt(candidateViewer, candidateActor, args, f.attempt!)).rejects.toMatchObject({ outcome: "DEFINITE_REFUSAL", status: 503 });
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["expectedConfigurationDigest", "approvedLimitsJson", "notificationRecipient", "privateContextFor", "runtime"] as const)("refuses the missing %s dependency without sending", async key => {
    const f = transactionFixture({ [key]: undefined });
    expect(f.attempt).toBeNull();
    await expect(f.extension.commit(candidateViewer, candidateActor, candidateArguments())).rejects.toMatchObject({ outcome: "DEFINITE_REFUSAL" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid timer %s even when its digest matches", value => {
    const profile = candidateProfile(); profile.intake.lockTimeoutMs = value;
    const raw = JSON.stringify(profile);
    expect(transactionFixture({ approvedLimitsJson: raw, expectedConfigurationDigest: createHash("sha256").update(raw).digest("hex") }).attempt).toBeNull();
  });
  it("rejects inconsistent relationships, noncanonical encodings, absent route evidence and wrong private actor", () => {
    for (const mutate of [
      (p: ReturnType<typeof candidateProfile>) => { p.writer.gateWaitMs = p.writer.lockTimeoutMs = 5000; },
      (p: ReturnType<typeof candidateProfile>) => { p.intake.idleTimeoutMs = p.intake.statementTimeoutMs; },
      (p: ReturnType<typeof candidateProfile>) => { p.enforcement.preBeginAttestationSha256 = ""; },
    ]) {
      const p = candidateProfile(); mutate(p); const raw = JSON.stringify(p);
      expect(transactionFixture({ approvedLimitsJson: raw, expectedConfigurationDigest: createHash("sha256").update(raw).digest("hex") }).attempt).toBeNull();
    }
    const raw = JSON.stringify(candidateProfile()) + "\n";
    expect(transactionFixture({ approvedLimitsJson: raw, expectedConfigurationDigest: createHash("sha256").update(raw).digest("hex") }).attempt).toBeNull();
    expect(transactionFixture({ privateContextFor: () => ({ ...syntheticContext, actorScope: "early_access:eac_" + "f".repeat(32) }) }).attempt).toBeNull();
  });
  it("counts preflight time from the Node HTTP-entry stamp and permits original-key recovery after expiry before transmission", async () => {
    const f = transactionFixture(), args = candidateArguments(); f.setClock(8000);
    await expect(f.extension.commitAttempt(candidateViewer, candidateActor, args, f.attempt!)).rejects.toMatchObject({
      outcome: "DEFINITE_REFUSAL_RETRYABLE", status: 503, code: "temporarily_unavailable",
    });
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.schedule).not.toHaveBeenCalled();
    f.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(f.extension.getExisting(candidateViewer, candidateActor, "Synthetic_Key_0001")).resolves.toBeNull();
    expect(f.rpc.mock.calls).toEqual([[QUICK_ORDER_REPLAY_RPC, {
      p_actor_scope: candidateActor,
      p_key_hash: createHash("sha256").update("xenios:health:quick-order:key:v1|" + candidateActor + "|Synthetic_Key_0001").digest("hex"),
    }]]);
  });

  it("retains uncertainty after transmitted expiry and addresses later recovery with the transmitted original key", async () => {
    let respond!: (value: QuickOrderCandidateRpcResult) => void;
    const rpc = vi.fn((name: string, _args: Readonly<Record<string, unknown>>, _options?: { readonly signal: AbortSignal }) =>
      name === QUICK_ORDER_REPLAY_RPC
        ? Promise.resolve<QuickOrderCandidateRpcResult>({ data: null, error: null })
        : new Promise<QuickOrderCandidateRpcResult>(resolve => { respond = resolve; }));
    const f = transactionFixture({ rpc }), args = candidateArguments();
    const result = f.extension.commitAttempt(candidateViewer, candidateActor, args, f.attempt!);
    const assertion = expect(result).rejects.toMatchObject({ outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" });
    f.setClock(8000); f.expire();
    await assertion;
    expect(rpc.mock.calls[0][0]).toBe(QUICK_ORDER_COMMIT_RPC);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_payload: { submission: { input: { idempotencyKey: "Synthetic_Key_0001" } } } });
    expect(rpc.mock.calls[0][2]?.signal.aborted).toBe(true);
    respond({ data: { ...candidateReceipt(), persisted: true, replayed: false }, error: null, transactionOutcome: "committed" });
    expect(rpc).toHaveBeenCalledOnce();
    await expect(f.extension.getExisting(candidateViewer, candidateActor, "Synthetic_Key_0001")).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual([QUICK_ORDER_REPLAY_RPC, {
      p_actor_scope: candidateActor,
      p_key_hash: createHash("sha256").update("xenios:health:quick-order:key:v1|" + candidateActor + "|Synthetic_Key_0001").digest("hex"),
    }]);
  });

  it.each([
    { label: "native lock refusal", sqlCode: "55P03", transactionOutcome: "aborted", details: undefined, outcome: "DEFINITE_REFUSAL_RETRYABLE", status: 503, code: "temporarily_unavailable" },
    { label: "exact try-lock and budget retryable wire marker", sqlCode: "55P03", transactionOutcome: "aborted", details: '{"quickOrderCode":"DEFINITE_REFUSAL_RETRYABLE"}', outcome: "DEFINITE_REFUSAL_RETRYABLE", status: 503, code: "temporarily_unavailable" },
    { label: "deadlock", sqlCode: "40P01", transactionOutcome: "aborted", details: undefined, outcome: "DEFINITE_REFUSAL_RETRYABLE", status: 503, code: "temporarily_unavailable" },
    { label: "serialization", sqlCode: "40001", transactionOutcome: "aborted", details: undefined, outcome: "DEFINITE_REFUSAL_RETRYABLE", status: 503, code: "temporarily_unavailable" },
    { label: "catalog class", sqlCode: "55000", transactionOutcome: "aborted", details: '{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}', outcome: "DEFINITE_REFUSAL", status: 409, code: "catalog_changed" },
    { label: "terms class", sqlCode: "55000", transactionOutcome: "aborted", details: '{"quickOrderCode":"DEFINITE_REFUSAL_TERMS_CHANGED"}', outcome: "DEFINITE_REFUSAL", status: 409, code: "terms_changed" },
    { label: "input/eligibility/verified-link class", sqlCode: "55000", transactionOutcome: "aborted", details: '{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}', outcome: "DEFINITE_REFUSAL", status: 422, code: "invalid_input" },
    { label: "held/authority/currentness class", sqlCode: "55000", transactionOutcome: "aborted", details: '{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}', outcome: "DEFINITE_REFUSAL", status: 503, code: "temporarily_unavailable" },
    { label: "key conflict", sqlCode: "23505", transactionOutcome: "aborted", details: '{"quickOrderCode":"IDEMPOTENCY_CONFLICT"}', outcome: "IDEMPOTENCY_CONFLICT", status: 409, code: "idempotency_conflict" },
    { label: "unconfirmed lock", sqlCode: "55P03", transactionOutcome: undefined, details: '{"quickOrderCode":"DEFINITE_REFUSAL_RETRYABLE"}', outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "unconfirmed deadlock", sqlCode: "40P01", transactionOutcome: undefined, details: undefined, outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "unconfirmed serialization", sqlCode: "40001", transactionOutcome: undefined, details: undefined, outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "unconfirmed unavailable", sqlCode: "55000", transactionOutcome: undefined, details: '{"quickOrderCode":"DEFINITE_REFUSAL_UNAVAILABLE"}', outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "unconfirmed catalog", sqlCode: "55000", transactionOutcome: undefined, details: '{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}', outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "unconfirmed terms", sqlCode: "55000", transactionOutcome: undefined, details: '{"quickOrderCode":"DEFINITE_REFUSAL_TERMS_CHANGED"}', outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "unconfirmed input", sqlCode: "55000", transactionOutcome: undefined, details: '{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}', outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "unconfirmed conflict", sqlCode: "23505", transactionOutcome: undefined, details: '{"quickOrderCode":"IDEMPOTENCY_CONFLICT"}', outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "error with committed metadata", sqlCode: "55000", transactionOutcome: "committed", details: '{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}', outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "idle termination", sqlCode: "25P03", transactionOutcome: "aborted", details: undefined, outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "transaction termination", sqlCode: "25P04", transactionOutcome: "aborted", details: undefined, outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "codeless", sqlCode: undefined, transactionOutcome: "aborted", details: undefined, outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "unmarked uniqueness", sqlCode: "23505", transactionOutcome: "aborted", details: undefined, outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "unqualified statement cancellation", sqlCode: "57014", transactionOutcome: "aborted", details: undefined, outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "legacy undifferentiated marker", sqlCode: "55000", transactionOutcome: "aborted", details: '{"quickOrderCode":"DEFINITE_REFUSAL"}', outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "unknown marker", sqlCode: "55000", transactionOutcome: "aborted", details: '{"quickOrderCode":"FUTURE_REFUSAL"}', outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "open marker shape", sqlCode: "55000", transactionOutcome: "aborted", details: '{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT","extra":"private"}', outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
    { label: "marker on wrong SQLSTATE", sqlCode: "23505", transactionOutcome: "aborted", details: '{"quickOrderCode":"DEFINITE_REFUSAL_INVALID_INPUT"}', outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" },
  ] as const)("classifies only explicit transport/SQL evidence: $label", async ({ sqlCode, transactionOutcome, details, outcome, status, code }) => {
    const rpc = vi.fn(async (name: string, _parameters: Readonly<Record<string, unknown>>): Promise<QuickOrderCandidateRpcResult> =>
      name === QUICK_ORDER_REPLAY_RPC ? { data: null, error: null }
        : { data: null, error: { code: sqlCode, details }, transactionOutcome });
    const f = transactionFixture({ rpc }), args = candidateArguments();
    const result = f.extension.commitAttempt(candidateViewer, candidateActor, args, f.attempt!);
    await expect(result).rejects.toMatchObject({ outcome, status, code, field: "request" });
    if (outcome === "DEFINITE_REFUSAL") {
      await expect(result).rejects.not.toHaveProperty("message", expect.stringContaining("could not confirm"));
    }
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][0]).toBe(QUICK_ORDER_COMMIT_RPC);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_payload: { submission: { input: { idempotencyKey: "Synthetic_Key_0001" } } } });
    await expect(f.extension.getExisting(candidateViewer, candidateActor, "Synthetic_Key_0001")).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual([QUICK_ORDER_REPLAY_RPC, {
      p_actor_scope: candidateActor,
      p_key_hash: createHash("sha256").update("xenios:health:quick-order:key:v1|" + candidateActor + "|Synthetic_Key_0001").digest("hex"),
    }]);
  });

  it.each(["before-send", "synchronous-expiry"] as const)("refuses %s expiry before transmission, paired with an unexpired control", async mode => {
    for (const expires of [false, true]) {
      let clock = 0;
      const cancel = vi.fn();
      const schedule = vi.fn((_delay: number, callback: () => void) => {
        if (expires && mode === "before-send") clock = 8000;
        if (expires && mode === "synchronous-expiry") callback();
        return cancel;
      });
      const f = transactionFixture({ runtime: { now: () => clock, maximumDelayMs: 24000, schedule } });
      expect(f.attempt).not.toBeNull();
      const result = f.extension.commitAttempt(candidateViewer, candidateActor, candidateArguments(), f.attempt!);
      if (expires) {
        await expect(result).rejects.toMatchObject({ outcome: "DEFINITE_REFUSAL_RETRYABLE", status: 503, code: "temporarily_unavailable" });
        expect(f.rpc).not.toHaveBeenCalled();
      } else {
        await expect(result).resolves.toMatchObject({ persisted: true, replayed: false });
        expect(f.rpc).toHaveBeenCalledOnce();
      }
      expect(schedule).toHaveBeenCalledWith(8000, expect.any(Function));
      expect(cancel).toHaveBeenCalledOnce();
    }
  });

  it("treats a synchronous transport throw after invocation as uncertain and never retries it", async () => {
    const rpc = vi.fn((_name: string, _parameters: Readonly<Record<string, unknown>>): Promise<QuickOrderCandidateRpcResult> => {
      throw new Error("Synthetic private synchronous transport diagnostic");
    });
    const f = transactionFixture({ rpc });
    const result = f.extension.commitAttempt(candidateViewer, candidateActor, candidateArguments(), f.attempt!);
    await expect(result).rejects.toMatchObject({ outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" });
    await expect(result).rejects.not.toHaveProperty("message", expect.stringContaining("private synchronous"));
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][0]).toBe(QUICK_ORDER_COMMIT_RPC);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_payload: { submission: { input: { idempotencyKey: "Synthetic_Key_0001" } } } });
    expect(f.cancel).toHaveBeenCalledOnce();
  });

  it.each([
    { label: "persisted false", patch: { persisted: false } },
    { label: "replayed string", patch: { replayed: "false" } },
  ])("refuses committed metadata with $label instead of exposing a success", async ({ patch }) => {
    const rpc = vi.fn(async (_name: string, _parameters: Readonly<Record<string, unknown>>): Promise<QuickOrderCandidateRpcResult> => ({
      data: { ...candidateReceipt(), persisted: true, replayed: false, ...patch }, error: null, transactionOutcome: "committed",
    }));
    const f = transactionFixture({ rpc });
    await expect(f.extension.commitAttempt(candidateViewer, candidateActor, candidateArguments(), f.attempt!))
      .rejects.toMatchObject({ outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" });
    expect(rpc).toHaveBeenCalledOnce();
    expect(f.cancel).toHaveBeenCalledOnce();
  });

  it.each([0, -1, Number.NaN])("refuses a maximum delay of %s before consulting private context or scheduling", maximumDelayMs => {
    const privateContextFor = vi.fn(() => syntheticContext), schedule = vi.fn(() => vi.fn());
    const f = transactionFixture({ privateContextFor, runtime: { now: () => 0, maximumDelayMs, schedule } });
    expect(f.attempt).toBeNull();
    expect(privateContextFor).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("refuses a throwing scheduler before transmission without leaking its diagnostic", async () => {
    const schedule = vi.fn((): (() => void) => { throw new Error("Synthetic private scheduler diagnostic"); });
    const f = transactionFixture({ runtime: { now: () => 0, maximumDelayMs: 24000, schedule } });
    expect(f.attempt).not.toBeNull();
    const result = f.extension.commitAttempt(candidateViewer, candidateActor, candidateArguments(), f.attempt!);
    await expect(result).rejects.toMatchObject({ outcome: "DEFINITE_REFUSAL", status: 503, code: "temporarily_unavailable" });
    await expect(result).rejects.not.toHaveProperty("message", expect.stringContaining("private scheduler"));
    expect(schedule).toHaveBeenCalledOnce();
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("treats transport rejection, unconfirmed success and malformed receipt as uncertain without retry", async () => {
    for (const rpc of [
      vi.fn(async (): Promise<QuickOrderCandidateRpcResult> => { throw new Error("synthetic transport loss"); }),
      vi.fn(async (): Promise<QuickOrderCandidateRpcResult> => ({ data: { ...candidateReceipt(), persisted: true, replayed: false }, error: null })),
      vi.fn(async (): Promise<QuickOrderCandidateRpcResult> => ({ data: { ...candidateReceipt(), persisted: true, replayed: false, privateContext: syntheticContext }, error: null, transactionOutcome: "committed" })),
    ]) {
      const f = transactionFixture({ rpc });
      await expect(f.extension.commitAttempt(candidateViewer, candidateActor, candidateArguments(), f.attempt!)).rejects.toMatchObject({ outcome: "OUTCOME_UNCERTAIN", status: 503, code: "temporarily_unavailable" });
      expect(rpc).toHaveBeenCalledOnce();
    }
  });
  it("recovers the same actor/key with no valid settings, deadline or recipient dependency", async () => {
    const args = candidateArguments();
    const rpc = vi.fn(async (): Promise<QuickOrderCandidateRpcResult> => ({ data: { payloadHash: args.payloadHash, publicReceipt: candidateReceipt() }, error: null }));
    const extension = createQuickOrderTransactionExtension({ rpc });
    await expect(extension.getExisting(candidateViewer, candidateActor, args.input.idempotencyKey)).resolves.toEqual({ payloadHash: args.payloadHash, publicReceipt: candidateReceipt() });
    expect(rpc).toHaveBeenCalledWith(QUICK_ORDER_REPLAY_RPC, { p_actor_scope: candidateActor, p_key_hash: createHash("sha256").update(`xenios:health:quick-order:key:v1|${candidateActor}|${args.input.idempotencyKey}`).digest("hex") });
    await expect(extension.getExisting(candidateViewer, "member:other", args.input.idempotencyKey)).rejects.toMatchObject({ outcome: "DEFINITE_REFUSAL" });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("models a lost commit acknowledgment followed by recovery through a fresh adapter without resubmission", async () => {
    // Transport-model control only: this map is synthetic and proves neither
    // database persistence nor actual disconnect/commit ordering.
    const args = candidateArguments(), originalKey = args.input.idempotencyKey;
    const stored = new Map<string, { payloadHash: string; publicReceipt: ReturnType<typeof candidateReceipt> }>();
    const keyHash = createHash("sha256").update(`xenios:health:quick-order:key:v1|${candidateActor}|${originalKey}`).digest("hex");
    const rpc = vi.fn(async (name: string, parameters: Readonly<Record<string, unknown>>): Promise<QuickOrderCandidateRpcResult> => {
      if (name === QUICK_ORDER_COMMIT_RPC) {
        const sent = parameters.p_payload as { actorScope: string; submission: CommitArguments };
        const sentHash = createHash("sha256").update(`xenios:health:quick-order:key:v1|${sent.actorScope}|${sent.submission.input.idempotencyKey}`).digest("hex");
        stored.set(sentHash, { payloadHash: sent.submission.payloadHash, publicReceipt: candidateReceipt() });
        throw new Error("synthetic acknowledgment lost after retained result");
      }
      expect(name).toBe(QUICK_ORDER_REPLAY_RPC);
      expect(parameters).toEqual({ p_actor_scope: candidateActor, p_key_hash: keyHash });
      return { data: stored.get(keyHash) ?? null, error: null };
    });
    const first = transactionFixture({ rpc });
    await expect(first.extension.commitAttempt(candidateViewer, candidateActor, args, first.attempt!))
      .rejects.toMatchObject({ outcome: "OUTCOME_UNCERTAIN", status: 503 });
    const recovered = createQuickOrderTransactionExtension({ rpc });
    await expect(recovered.getExisting(candidateViewer, candidateActor, originalKey))
      .resolves.toEqual({ payloadHash: args.payloadHash, publicReceipt: candidateReceipt() });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([QUICK_ORDER_COMMIT_RPC, QUICK_ORDER_REPLAY_RPC]);
    expect(stored.size).toBe(1);
    expect(rpc.mock.calls[1]).toEqual([QUICK_ORDER_REPLAY_RPC, { p_actor_scope: candidateActor, p_key_hash: keyHash }]);
  });

  it("retains the Node HTTP-entry deadline and refuses a late success even before the observer callback fires", async () => {
    let respond!: (value: QuickOrderCandidateRpcResult) => void;
    const rpc = vi.fn(() => new Promise<QuickOrderCandidateRpcResult>(resolve => { respond = resolve; }));
    const f = transactionFixture({ rpc });
    f.setClock(2500);
    const pending = f.extension.commitAttempt(candidateViewer, candidateActor, candidateArguments(), f.attempt!);
    expect(f.schedule).toHaveBeenCalledWith(5500, expect.any(Function));
    const assertion = expect(pending).rejects.toMatchObject({ outcome: "OUTCOME_UNCERTAIN", status: 503 });
    // No expire() call: delayed scheduling cannot extend the acceptance clock.
    f.setClock(8000);
    respond({ data: { ...candidateReceipt(), persisted: true, replayed: false }, error: null, transactionOutcome: "committed" });
    await assertion;
    expect(rpc).toHaveBeenCalledOnce();
    expect(f.cancel).toHaveBeenCalledOnce();
  });

  it("copies private context and submission before caller mutation and keeps the original recipient binding", async () => {
    const mutableContext = { ...syntheticContext };
    let respond!: (value: QuickOrderCandidateRpcResult) => void;
    const rpc = vi.fn((_name: string, _parameters: Readonly<Record<string, unknown>>) =>
      new Promise<QuickOrderCandidateRpcResult>(resolve => { respond = resolve; }));
    const f = transactionFixture({ rpc, privateContextFor: () => mutableContext });
    mutableContext.rawStoredSessionHash = "f".repeat(64);
    Object.assign(f.dependencies, { notificationRecipient: "replacement@example.invalid" });
    const args = candidateArguments(), original = structuredClone(args);
    const pending = f.extension.commitAttempt(candidateViewer, candidateActor, args, f.attempt!);
    args.input.contact.fullLegalName = "Changed caller value";
    args.snapshots[0].quantity = 99;
    expect(rpc.mock.calls[0][1]).toEqual({ p_payload: {
      schemaVersion: "quick-order-commit-v1", actorScope: candidateActor, context: syntheticContext,
      expectedConfigurationDigest: f.dependencies.expectedConfigurationDigest,
      notificationRecipient: "synthetic-operator@example.invalid", submission: original,
    } });
    respond({ data: { ...candidateReceipt(), persisted: true, replayed: false }, error: null, transactionOutcome: "committed" });
    await expect(pending).resolves.toEqual({ ...candidateReceipt(), persisted: true, replayed: false });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("refuses forged and foreign-viewer attempt tokens without consuming the valid owner's control", async () => {
    const f = transactionFixture(), args = candidateArguments();
    await expect(f.extension.commitAttempt(candidateViewer, candidateActor, args, { enteredAtMonotonicMs: 0 }))
      .rejects.toMatchObject({ outcome: "DEFINITE_REFUSAL" });
    await expect(f.extension.commitAttempt({ ...candidateViewer }, candidateActor, args, f.attempt!))
      .rejects.toMatchObject({ outcome: "DEFINITE_REFUSAL" });
    expect(f.rpc).not.toHaveBeenCalled();
    await expect(f.extension.commitAttempt(candidateViewer, candidateActor, args, f.attempt!))
      .resolves.toEqual({ ...candidateReceipt(), persisted: true, replayed: false });
    expect(f.rpc).toHaveBeenCalledOnce();
  });
});
