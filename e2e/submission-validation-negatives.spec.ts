// Input-shape negatives at the composed intake door.
//
// The launch-invariant and acceptance suites attack MONEY, PATHWAY and
// NOTIFICATION integrity. This file attacks the plainer question a manual
// launch still depends on: does a malformed submission get refused cleanly, at
// the same HTTP door a customer reaches, with a 4xx the browser can act on and
// NOBODY notified? Each module's own unit tests already prove the validator;
// these prove the validator is actually wired IN FRONT of order creation and
// the outbox, over the real production composition — the seam where the
// 2026-08-20 conversion defects lived.
//
// Everything asserted here is CURRENT, correct behaviour. They are regression
// locks: if a refactor lets any of these reach order creation or the outbox,
// the launch has a new hole and one of these goes red.

import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  buildDoor,
  submission,
  AGREEMENTS,
  FOUNDER_MAX_QUANTITY,
} from "./harness/assisted-order-door";

const SUBMIT = "/api/research/early-access/assisted-orders";

async function submitAs(app: Parameters<typeof request>[0], body: Record<string, unknown>) {
  return request(app).post(SUBMIT).set("x-test-member", "a").send(body);
}

function line(quantity: unknown): Record<string, unknown> {
  return { productId: "pc_product_1", variantId: "pc_variant_1", quantity };
}

describe("door negative: quantity must be a positive whole number", () => {
  for (const [name, quantity] of [
    ["zero", 0],
    ["negative", -5],
    ["fractional", 2.5],
    ["a string", "2"],
    ["not a number", null],
  ] as const) {
    it(`refuses ${name} quantity with a client error and no order`, async () => {
      const { app, enqueued } = buildDoor();
      const response = await submitAs(app, { ...submission(), lines: [line(quantity)] });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(response.body.publicReference).toBeUndefined();
      expect(enqueued).toHaveLength(0);
    });
  }

  it("accepts exactly the founder ceiling and refuses one above it", async () => {
    const ceiling = buildDoor();
    const at = await submitAs(ceiling.app, {
      ...submission(),
      lines: [line(FOUNDER_MAX_QUANTITY)],
    });
    expect(at.status).toBe(201);

    const { app, enqueued } = buildDoor();
    const above = await submitAs(app, {
      ...submission(),
      lines: [line(FOUNDER_MAX_QUANTITY + 1)],
    });
    expect(above.status).toBeGreaterThanOrEqual(400);
    expect(above.status).toBeLessThan(500);
    expect(enqueued).toHaveLength(0);
  });
});

describe("door negative: the line set itself must be well formed", () => {
  it("refuses an empty line set", async () => {
    const { app, enqueued } = buildDoor();
    const response = await submitAs(app, { ...submission(), lines: [] });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(enqueued).toHaveLength(0);
  });

  it("refuses the same variant listed twice rather than silently summing it", async () => {
    const { app, enqueued } = buildDoor();
    const response = await submitAs(app, {
      ...submission(),
      lines: [line(1), line(1)],
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(enqueued).toHaveLength(0);
  });
});

describe("door negative: the legal gate holds at the door", () => {
  it("refuses a submission that accepted no agreements", async () => {
    const { app, enqueued } = buildDoor();
    const response = await submitAs(app, { ...submission(), agreements: [] });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(enqueued).toHaveLength(0);
  });

  it("refuses a stale agreement version, however well formed", async () => {
    const { app, enqueued } = buildDoor();
    const stale = AGREEMENTS.map((agreement) => ({ ...agreement, version: "v0" }));
    const response = await submitAs(app, { ...submission(), agreements: stale });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(enqueued).toHaveLength(0);
  });

  it("refuses a submission that accepted only the notice and skipped the form pair", async () => {
    const { app, enqueued } = buildDoor();
    const response = await submitAs(app, { ...submission(), agreements: [AGREEMENTS[0]] });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(enqueued).toHaveLength(0);
  });
});

describe("door negative: age and identity gates hold at the door", () => {
  it("refuses a submission that did not confirm age", async () => {
    const { app, enqueued } = buildDoor();
    const contact = { ...(submission().contact as Record<string, unknown>), ageConfirmed: false };
    const response = await submitAs(app, { ...submission(), contact });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(enqueued).toHaveLength(0);
  });

  it("refuses an anonymous caller with no member session", async () => {
    const { app, enqueued } = buildDoor();
    const response = await request(app).post(SUBMIT).send(submission());
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(enqueued).toHaveLength(0);
  });
});

describe("door negative: a required shipping sub-field is refused cleanly", () => {
  // The whole address OBJECT being absent is a SEPARATE, worse case tracked in
  // malformed-submission-5xx.spec.ts — that one currently 500s. A missing
  // sub-field on a present address object is handled correctly, and this locks
  // that in.
  for (const field of ["line1", "city", "region", "postalCode", "countryCode"] as const) {
    it(`refuses a shipping address missing ${field}`, async () => {
      const { app, enqueued } = buildDoor();
      const base = submission();
      const contact = base.contact as Record<string, unknown>;
      const shipping = { ...(contact.shippingAddress as Record<string, unknown>) };
      delete shipping[field];
      const response = await submitAs(app, {
        ...base,
        contact: { ...contact, shippingAddress: shipping },
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(response.body.field ?? "").toContain(field);
      expect(enqueued).toHaveLength(0);
    });
  }
});
