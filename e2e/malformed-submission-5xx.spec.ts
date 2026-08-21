// CONFIRMED DEFECT REPRODUCTION — owner: MAIN FABLE / s3 (contract.ts).
//
// A malformed submission MUST be refused with a 4xx the browser can act on.
// Three shapes instead crash to a 500 "The assisted order service is
// temporarily unavailable", because the submit validator dereferences a nested
// object BEFORE validating that the object is present:
//
//   shared/research/assisted-order/contract.ts
//     validateSubmitInput() line ~449:  input.contact.email          (contact absent)
//     validateAddress()     line ~423:  input.line1                  (shippingAddress absent)
//     validateSubmitInput() line ~556:  billingAddress when billing differs and is absent
//
//   normalizeRequiredText(undefined) throws AssistedOrderValidationError (=> 400),
//   which is why a missing SUB-FIELD is a clean 400. But `undefined.line1`
//   throws a raw TypeError BEFORE any field is normalized, and the express
//   adapter maps an unrecognised throw to 500 assisted_order_unavailable.
//
// Why it matters on THIS launch (severity: medium — robustness / observability,
// fail-closed): no order is created, nothing is written, nobody is notified —
// so it is not a money or disclosure defect. But a 4xx client mistake is
// reported to the customer as "service temporarily unavailable" (they abandon,
// and on a manual launch the founder never learns they tried) and is logged as
// a 5xx server outage (it pollutes error monitoring / alerting).
//
// The one-line-per-guard fix belongs to the contract owner. This session does
// NOT edit contract.ts (MAIN/s3 lease) — see the handoff for the exact patch.
//
// TRIPWIRE: these are `it.fails`. They PASS while the defect stands and go RED
// the moment contract.ts is fixed — that red is the signal to delete this file
// and fold these three cases into submission-validation-negatives.spec.ts as
// ordinary `it`.

import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildDoor, submission } from "./harness/assisted-order-door";

const SUBMIT = "/api/research/early-access/assisted-orders";

async function submitAs(app: Parameters<typeof request>[0], body: Record<string, unknown>) {
  return request(app).post(SUBMIT).set("x-test-member", "a").send(body);
}

describe("malformed submission must never 500 [tripwire: fixes flip these red]", () => {
  it.fails("a missing shipping address object should be a 4xx, not a 500", async () => {
    const { app } = buildDoor();
    const base = submission();
    const contact = { ...(base.contact as Record<string, unknown>) };
    delete contact.shippingAddress;
    const response = await submitAs(app, { ...base, contact });
    expect(response.status).toBeLessThan(500);
  });

  it.fails("a missing contact object should be a 4xx, not a 500", async () => {
    const { app } = buildDoor();
    const response = await submitAs(app, { ...submission(), contact: undefined });
    expect(response.status).toBeLessThan(500);
  });

  it.fails(
    "a missing billing address (when billing differs) should be a 4xx, not a 500",
    async () => {
      const { app } = buildDoor();
      const base = submission();
      const contact = {
        ...(base.contact as Record<string, unknown>),
        billingSameAsShipping: false,
        // billingAddress deliberately absent
      };
      const response = await submitAs(app, { ...base, contact });
      expect(response.status).toBeLessThan(500);
    },
  );
});

// A companion assertion that stays GREEN both before and after the fix: a
// malformed submission, whatever its status, must never create an order or
// notify anyone. This is the launch-critical half and it already holds.
describe("malformed submission stays fail-closed regardless of status code", () => {
  it("creates no order and notifies nobody when the address object is absent", async () => {
    const { app, enqueued } = buildDoor();
    const base = submission();
    const contact = { ...(base.contact as Record<string, unknown>) };
    delete contact.shippingAddress;
    const response = await submitAs(app, { ...base, contact });
    expect(response.status).not.toBe(201);
    expect(response.body.publicReference).toBeUndefined();
    expect(enqueued).toHaveLength(0);
  });
});
