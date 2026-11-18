import { describe, expect, it } from "vitest";
import { parseRequestWorkflow, parseStartReview, parseStartReviewResult, parseStaffRequestWorkflow, requestCustomerNoticeSchema } from "./request-intent-workflow";

const id = "11111111-1111-4111-8111-111111111111";
const at = "2026-11-18T03:00:00.000Z";
const events = [
  { id: "22222222-2222-4222-8222-222222222222", revision: 0, kind: "received", occurredAt: at },
  { id: "33333333-3333-4333-8333-333333333333", revision: 1, kind: "queued", occurredAt: at },
];
const queued = { schemaVersion: 1, requestId: id, publicReference: `XRI-${id.replaceAll("-", "").toUpperCase()}`,
  state: "queued", revision: 1, changedAt: at, customerNotice: "pending", events };
describe("request workflow v1 wire boundary", () => {
  it("keeps staff action availability in a strict separate wrapper", () => {
    expect(parseStaffRequestWorkflow({ workflow: queued, canStartReview: false }).canStartReview).toBe(false);
    expect(parseStaffRequestWorkflow({ workflow: queued, canStartReview: true }).canStartReview).toBe(true);
    for (const value of [{ workflow: queued }, { workflow: queued, canStartReview: "true" },
      { workflow: queued, canStartReview: true, actorId: id }]) {
      expect(() => parseStaffRequestWorkflow(value)).toThrow();
    }
    expect(() => parseRequestWorkflow({ ...queued, canStartReview: true })).toThrow();
  });
  it("keeps receipt status separate and validates real initial and review histories", () => {
    expect(parseRequestWorkflow(queued)).toEqual(queued);
    const reviewing = { ...queued, state: "reviewing", revision: 2,
      events: [...events, { id: "44444444-4444-4444-8444-444444444444", revision: 2, kind: "review_started", occurredAt: at }] };
    expect(parseStartReviewResult({ replay: true, workflow: reviewing }).workflow.state).toBe("reviewing");
  });
  it.each(["pending", "provider_accepted", "delivered_to_server", "delivery_unknown", "failed", "suppressed", "unavailable"])("keeps %s transport evidence distinct", customerNotice => {
    expect(parseRequestWorkflow({ ...queued, customerNotice }).customerNotice).toBe(customerNotice);
  });
  it.each([
    { ...queued, contact: { email: "private@example.invalid" } }, { ...queued, staffIdentity: id },
    { ...queued, state: "pending_review" }, { ...queued, state: "reviewing" },
    { ...queued, revision: 2 }, { ...queued, changedAt: "2026-11-19T03:00:00.000Z" },
    { ...queued, publicReference: "XRI-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
    { ...queued, events: [] }, { ...queued, events: [events[0], events[0]] },
    { ...queued, events: [events[1], events[0]] },
    { ...queued, events: [events[0], { ...events[1], actor: id }] },
  ])("rejects scope drift or fabricated progression %#", value => expect(() => parseRequestWorkflow(value)).toThrow());
  it("accepts only a stable command ID and integer expected revision", () => {
    expect(parseStartReview({ commandId: id, expectedRevision: 1 })).toEqual({ commandId: id, expectedRevision: 1 });
    for (const extra of ["actorId", "to", "ownerHash", "state", "tenant"]) {
      expect(() => parseStartReview({ commandId: id, expectedRevision: 1, [extra]: id })).toThrow();
    }
    for (const expectedRevision of [0, -1, 1.5, "1", Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseStartReview({ commandId: id, expectedRevision })).toThrow();
    }
    expect(requestCustomerNoticeSchema.safeParse("sent").success).toBe(false);
  });
});
