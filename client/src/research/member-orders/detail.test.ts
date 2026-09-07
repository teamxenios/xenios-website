import { describe, expect, it } from "vitest";
import type { ClaimDto, ClaimReason, OrderDetailDto } from "@shared/research/commerce-api";
import {
  decodeMemberOrderId,
  readMemberClaims,
  readMemberOrderDetail,
  readSubmittedMemberClaim,
} from "./detail";

const ORDER_ID = "XO-SYNTHETIC_Account.1";
const SKU = "SKU-SYNTHETIC-Alpha";
const detail = (patch: Partial<OrderDetailDto> = {}): OrderDetailDto => ({
  orderId: ORDER_ID,
  state: "processing",
  placedAt: "2026-09-07T12:34:56.000Z",
  totalCents: 8000,
  shipments: [],
  lines: [
    { sku: SKU, displayName: "Synthetic Research Item Alpha", quantity: 2, lineTotalCents: 5000 },
    { sku: "SKU-SYNTHETIC-Beta", displayName: "Synthetic Research Item Beta", quantity: 1, lineTotalCents: 2500 },
  ],
  shippingCents: 500,
  storeCreditAppliedCents: 0,
  reviewReason: null,
  ...patch,
});
const claim = (patch: Partial<ClaimDto> = {}): ClaimDto => ({
  claimId: "CLAIM-SYNTHETIC_One.1",
  orderId: ORDER_ID,
  sku: SKU,
  reason: "damaged",
  state: "submitted",
  resolution: null,
  submittedAt: "2026-09-07T13:00:00.000Z",
  ...patch,
});
const request = { orderId: ORDER_ID, sku: SKU, reason: "damaged" as ClaimReason };
const validatedOrder = () => readMemberOrderDetail({ ok: true, order: detail() }, ORDER_ID)!;
const badMoney: unknown[] = [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity, -Infinity, "0", null, undefined, false, {}];
const unsafeIds: unknown[] = [null, undefined, 1, {}, [], "", ".", "..", "_hidden", "-hidden", "a/b", "a\\b", "a?b", "a#b", "a b", "a\n", "a\u0000", "é", "A".repeat(193)];
const malformedText: unknown[] = [null, undefined, "", "  ", " leading", "trailing ", "synthetic\ntext", "synthetic\u0000text", "synthetic\u007ftext", 1, {}, []];
const validReasons = ["damaged", "lost", "incorrect", "missing", "temperature_concern"] as const satisfies readonly ClaimReason[];
const validStates = ["submitted", "under_review", "information_requested", "approved", "declined", "resolved"] as const satisfies readonly ClaimDto["state"][];
const validResolutions = [null, "replacement", "refund", "partial_refund", "none"] as const satisfies readonly ClaimDto["resolution"][];

describe("decodeMemberOrderId route boundary", () => {
  it("preserves exact safe identifiers and decodes escaped characters once", () => {
    expect(decodeMemberOrderId(ORDER_ID)).toBe(ORDER_ID);
    expect(decodeMemberOrderId("%58O-SYNTHETIC%5fAccount%2e1")).toBe(ORDER_ID);
    expect(decodeMemberOrderId("0")).toBe("0");
    expect(decodeMemberOrderId("A".repeat(192))).toBe("A".repeat(192));
    expect(decodeMemberOrderId("%41".repeat(192))).toBe("A".repeat(192));
  });

  it.each([
    ...unsafeIds,
    "%", "%0", "%GG", "%E0%A4%A", "\ud800",
    "a%2Fb", "a%5Cb", "a%3Fb", "a%23b", "%2E%2E",
    "%2558O-SYNTHETIC", "a%252Fb", "a%253Fb", "%252E%252E",
    `${ORDER_ID}?source=private`, `${ORDER_ID}#fragment`, `/${ORDER_ID}`,
    `${ORDER_ID}/nested`, `${ORDER_ID}+suffix`, "%41".repeat(193),
  ])("refuses malformed, nested, or noncanonical route input %j", (value) => {
    expect(decodeMemberOrderId(value)).toBeNull();
  });
});

describe("readMemberOrderDetail exact projection", () => {
  it("returns only validated detail fields bound to the requested order", () => {
    const expected = detail({
      recordKind: "request",
      shipmentsSource: "connected",
      shipments: [{ owner: "xenios", status: "Preparing", trackingNumber: null, carrier: null }],
      payment: { amountDueCents: 8000, amountCapturedCents: null, amountRefundedCents: 0, currency: "USD" },
      reviewReason: "Synthetic order needs review",
    });
    const response = {
      ok: true,
      unrelatedEnvelope: "synthetic-private-envelope",
      order: {
        ...expected,
        unrelatedOrder: "synthetic-private-order",
        lines: expected.lines.map((line) => ({ ...line, unrelatedLine: "synthetic-private-line" })),
        shipments: expected.shipments.map((shipment) => ({ ...shipment, unrelatedShipment: "synthetic-private-shipment" })),
        payment: { ...expected.payment, unrelatedPayment: "synthetic-private-payment" },
      },
    };
    expect(readMemberOrderDetail(response, ORDER_ID)).toEqual(expected);
  });

  it("accepts legacy optional evidence without inventing defaults", () => {
    const expected = detail();
    const result = readMemberOrderDetail({ ok: true, order: expected }, ORDER_ID);
    expect(result).toEqual(expected);
    expect(result).not.toHaveProperty("recordKind");
    expect(result).not.toHaveProperty("shipmentsSource");
    expect(result).not.toHaveProperty("payment");
    expect(result?.reviewReason).toBeNull();
  });

  it("accepts empty line detail without manufacturing a SKU or quantity", () => {
    const expected = detail({ lines: [] });
    expect(readMemberOrderDetail({ ok: true, order: expected }, ORDER_ID)).toEqual(expected);
  });

  it("preserves permitted line text and exact safe-integer boundaries", () => {
    const expected = detail({
      lines: [{ sku: "S".repeat(160), displayName: "D".repeat(300), quantity: Number.MAX_SAFE_INTEGER, lineTotalCents: 0 }],
      shippingCents: 0,
      storeCreditAppliedCents: Number.MAX_SAFE_INTEGER,
      reviewReason: "R".repeat(2000),
    });
    expect(readMemberOrderDetail({ ok: true, order: expected }, ORDER_ID)).toEqual(expected);
    const safeText = detail({ lines: [{ sku: "SKU-SYNTHETIC/Alpha:10 mg", displayName: "Synthetic item • Alpha", quantity: 1, lineTotalCents: Number.MAX_SAFE_INTEGER }] });
    expect(readMemberOrderDetail({ ok: true, order: safeText }, ORDER_ID)).toEqual(safeText);
  });

  it.each(["XO-OTHER-SYNTHETIC", ORDER_ID.toLowerCase(), `${ORDER_ID}-extra`, ORDER_ID.slice(0, -1)])("refuses a returned order that differs from expected %s", (expectedId) => {
    expect(readMemberOrderDetail({ ok: true, order: detail() }, expectedId)).toBeNull();
  });

  it("requires a safe expected identifier independently of the response", () => {
    for (const expectedId of unsafeIds.filter((value): value is string => typeof value === "string")) {
      expect(readMemberOrderDetail({ ok: true, order: detail({ orderId: expectedId }) }, expectedId)).toBeNull();
    }
  });
});

describe("readMemberOrderDetail rejects incomplete or malformed records", () => {
  it.each([null, undefined, [], {}, { ok: true }, { ok: false, order: detail() }, { ok: "true", order: detail() }, { ok: true, order: null }, { ok: true, order: [] }])("refuses malformed detail envelope %j", (value) => {
    expect(readMemberOrderDetail(value, ORDER_ID)).toBeNull();
  });

  it.each(["lines", "shippingCents", "storeCreditAppliedCents", "reviewReason"])("requires detail.%s", (field) => {
    const row: Record<string, unknown> = { ...detail() };
    delete row[field];
    expect(readMemberOrderDetail({ ok: true, order: row }, ORDER_ID)).toBeNull();
  });

  it("still applies the full order-summary validation to detail responses", () => {
    for (const patch of [
      { state: "paid" }, { totalCents: -1 }, { placedAt: "not-a-date" },
      { recordKind: "unknown" }, { shipmentsSource: "available" },
      { payment: { amountDueCents: 8000, currency: "USD" } },
      { shipments: [{ owner: "other", status: "Preparing", carrier: null, trackingNumber: null }] },
    ]) {
      expect(readMemberOrderDetail({ ok: true, order: { ...detail(), ...patch } }, ORDER_ID)).toBeNull();
    }
  });

  it.each(["shippingCents", "storeCreditAppliedCents"])("rejects invalid detail.%s money", (field) => {
    for (const value of badMoney) {
      expect(readMemberOrderDetail({ ok: true, order: { ...detail(), [field]: value } }, ORDER_ID), `${field}: ${String(value)}`).toBeNull();
    }
  });

  it("rejects invalid review reason text without treating missing evidence as null", () => {
    for (const reviewReason of [...malformedText.filter((value) => value !== null), "R".repeat(2001)]) {
      expect(readMemberOrderDetail({ ok: true, order: { ...detail(), reviewReason } }, ORDER_ID)).toBeNull();
    }
  });

  it("requires an array of valid line objects", () => {
    for (const lines of [null, {}, "lines", 0, false, [null], [undefined], [false], [0], ["line"], [[]], [{}]]) {
      expect(readMemberOrderDetail({ ok: true, order: { ...detail(), lines } }, ORDER_ID)).toBeNull();
    }
  });

  it.each(["sku", "displayName", "quantity", "lineTotalCents"])("requires every line's %s", (field) => {
    const line: Record<string, unknown> = { ...detail().lines[0] };
    delete line[field];
    expect(readMemberOrderDetail({ ok: true, order: { ...detail(), lines: [line] } }, ORDER_ID)).toBeNull();
  });

  it.each([
    { field: "sku", invalid: [...malformedText, "S".repeat(161)] },
    { field: "displayName", invalid: [...malformedText, "D".repeat(301)] },
    { field: "quantity", invalid: [0, ...badMoney] },
    { field: "lineTotalCents", invalid: badMoney },
  ])("rejects malformed line $field without retaining a valid sibling", ({ field, invalid }) => {
    for (const value of invalid) {
      const lines = [detail().lines[0], { ...detail().lines[1], [field]: value }];
      expect(readMemberOrderDetail({ ok: true, order: { ...detail(), lines } }, ORDER_ID), `${field}: ${String(value)}`).toBeNull();
    }
  });

  it("rejects duplicate exact SKUs but preserves distinct case-sensitive SKUs", () => {
    const first = detail().lines[0]!;
    const duplicate = { ...first, displayName: "Second synthetic label", quantity: 3 };
    expect(readMemberOrderDetail({ ok: true, order: detail({ lines: [first, duplicate] }) }, ORDER_ID)).toBeNull();
    const distinct = detail({ lines: [first, { ...duplicate, sku: first.sku.toLowerCase() }] });
    expect(readMemberOrderDetail({ ok: true, order: distinct }, ORDER_ID)).toEqual(distinct);
  });
});

describe("readMemberClaims member-order binding", () => {
  it("projects only canonical claim fields from rows for the exact validated order", () => {
    const expected = claim();
    const other = claim({ claimId: "CLAIM-OTHER-SYNTHETIC", orderId: "XO-OTHER-SYNTHETIC", sku: "OTHER-ORDER-SKU" });
    const data = {
      ok: true,
      unrelatedEnvelope: "synthetic-private-envelope",
      claims: [{ ...expected, internalComment: "synthetic-private-comment" }, other],
    };
    expect(readMemberClaims(data, validatedOrder())).toEqual([expected]);
  });

  it("returns a real empty list when no claims belong to this exact order", () => {
    expect(readMemberClaims({ ok: true, claims: [] }, validatedOrder())).toEqual([]);
    expect(readMemberClaims({ ok: true, claims: [claim({ orderId: ORDER_ID.toLowerCase(), sku: "OTHER-SKU" })] }, validatedOrder())).toEqual([]);
  });

  it.each(validReasons)("accepts canonical claim reason %s", (reason) => {
    expect(readMemberClaims({ ok: true, claims: [claim({ reason })] }, validatedOrder())).toEqual([claim({ reason })]);
  });

  it.each(validStates)("accepts canonical claim state %s without inventing a resolution", (state) => {
    expect(readMemberClaims({ ok: true, claims: [claim({ state })] }, validatedOrder())).toEqual([claim({ state, resolution: null })]);
  });

  it.each(validResolutions)("preserves canonical or null resolution %s", (resolution) => {
    expect(readMemberClaims({ ok: true, claims: [claim({ resolution })] }, validatedOrder())).toEqual([claim({ resolution })]);
  });

  it("requires target-order claims to name an exact SKU on that validated order", () => {
    for (const sku of ["NOT-ON-THIS-ORDER", SKU.toLowerCase(), `${SKU}-extra`]) {
      expect(readMemberClaims({ ok: true, claims: [claim({ sku })] }, validatedOrder())).toBeNull();
    }
    const emptyOrder = readMemberOrderDetail({ ok: true, order: detail({ lines: [] }) }, ORDER_ID)!;
    expect(readMemberClaims({ ok: true, claims: [claim()] }, emptyOrder)).toBeNull();
    expect(readMemberClaims({ ok: true, claims: [] }, emptyOrder)).toEqual([]);
  });

  it("rejects duplicate claim IDs across both target and filtered-out orders", () => {
    expect(readMemberClaims({ ok: true, claims: [claim(), claim({ state: "under_review" })] }, validatedOrder())).toBeNull();
    expect(readMemberClaims({ ok: true, claims: [claim(), claim({ orderId: "XO-OTHER-SYNTHETIC" })] }, validatedOrder())).toBeNull();
  });

  it.each([0, 1])("rejects the whole list when malformed claim %s accompanies a valid row", (index) => {
    const rows: unknown[] = [claim(), claim({ claimId: "CLAIM-SYNTHETIC-SECOND", orderId: "XO-OTHER-SYNTHETIC" })];
    rows[index] = { ...rows[index] as object, state: "not-a-claim-state" };
    expect(readMemberClaims({ ok: true, claims: rows }, validatedOrder())).toBeNull();
  });
});

describe("claim payload validation", () => {
  it.each([null, undefined, [], {}, { ok: true }, { ok: false, claims: [] }, { ok: "true", claims: [] }, { ok: true, claims: null }, { ok: true, claims: {} }])("refuses a malformed claims envelope %j", (value) => {
    expect(readMemberClaims(value, validatedOrder())).toBeNull();
  });

  it.each(["claimId", "orderId", "sku", "reason", "state", "resolution", "submittedAt"])("requires claim.%s in list and submission responses", (field) => {
    const row: Record<string, unknown> = { ...claim() };
    delete row[field];
    expect(readMemberClaims({ ok: true, claims: [row] }, validatedOrder())).toBeNull();
    expect(readSubmittedMemberClaim({ ok: true, claim: row }, request)).toBeNull();
  });

  it.each([
    { field: "claimId", invalid: unsafeIds },
    { field: "orderId", invalid: unsafeIds },
    { field: "sku", invalid: [...malformedText, "S".repeat(161)] },
    { field: "reason", invalid: [null, "", "DAMAGED", "other", "damaged ", 1, {}] },
    { field: "state", invalid: [null, "", "SUBMITTED", "pending", "submitted ", 1, {}] },
    { field: "resolution", invalid: [undefined, "", "REFUND", "unavailable", "refund ", 1, {}] },
    { field: "submittedAt", invalid: [null, undefined, "", "not-a-date", "2026-09-07", "2026-09-07 12:00:00Z", "2026-13-07T12:00:00Z", `2026-09-07T12:34:56.${"0".repeat(44)}Z`, 0, {}] },
  ])("rejects invalid claim $field in every response shape", ({ field, invalid }) => {
    for (const value of invalid) {
      const row = { ...claim(), [field]: value };
      expect(readMemberClaims({ ok: true, claims: [row] }, validatedOrder()), `${field}: ${String(value)}`).toBeNull();
      expect(readSubmittedMemberClaim({ ok: true, claim: row }, request), `${field}: ${String(value)}`).toBeNull();
    }
  });

  it("refuses malformed claim rows even when there are no matching target-order claims", () => {
    for (const row of [null, undefined, false, 0, "claim", [], {}]) {
      expect(readMemberClaims({ ok: true, claims: [row] }, validatedOrder())).toBeNull();
      expect(readSubmittedMemberClaim({ ok: true, claim: row }, request)).toBeNull();
    }
  });

  it("accepts exact maximum ID, SKU, and timestamp lengths", () => {
    const sku = "S".repeat(160);
    const orderId = "O".repeat(192);
    const row = claim({ claimId: "C".repeat(192), orderId, sku, submittedAt: `2026-09-07T12:34:56.${"0".repeat(43)}Z` });
    const order = readMemberOrderDetail({ ok: true, order: detail({ orderId, lines: [{ ...detail().lines[0]!, sku }] }) }, orderId)!;
    expect(row.submittedAt).toHaveLength(64);
    expect(readMemberClaims({ ok: true, claims: [row] }, order)).toEqual([row]);
    expect(readSubmittedMemberClaim({ ok: true, claim: row }, { orderId, sku, reason: row.reason })).toEqual(row);
  });
});

describe("readSubmittedMemberClaim requires an authoritative response bound to the request", () => {
  it("projects a valid returned claim without inventing its status or resolution", () => {
    const returned = claim({ state: "under_review", resolution: "none" });
    expect(readSubmittedMemberClaim({ ok: true, claim: { ...returned, internalComment: "synthetic-private-comment" } }, request)).toEqual(returned);
  });

  it.each([
    null, undefined, [], {}, { ok: true }, { ok: false, claim: claim() },
    { ok: "true", claim: claim() }, { ok: true, claim: null }, { ok: true, claimId: "CLAIM-SYNTHETIC" },
  ])("does not optimistically accept incomplete success envelope %j", (value) => {
    expect(readSubmittedMemberClaim(value, request)).toBeNull();
  });

  it.each([
    { orderId: "XO-OTHER-SYNTHETIC" },
    { orderId: ORDER_ID.toLowerCase() },
    { sku: "SKU-SYNTHETIC-Beta" },
    { sku: SKU.toLowerCase() },
    { reason: "missing" as const },
  ])("refuses a valid claim that differs from the submitted binding: %j", (patch) => {
    expect(readSubmittedMemberClaim({ ok: true, claim: claim(patch) }, request)).toBeNull();
  });
});
