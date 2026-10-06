import { describe, expect, it } from "vitest";
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
