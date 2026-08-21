// LANE F, the negatives that close it.
//
// The launch is manual: a customer submits, the founder reads an email and
// finishes the sale by hand. That makes three claims dangerous, because nothing
// downstream re-checks them before a human acts:
//
//   1. a HELD product being ordered directly
//   2. a classification-PENDING product being ordered directly
//   3. an affiliate code the browser typed being treated as verified attribution
//
// The third is the money one. A declared code is a customer typing something
// into a box; verified attribution decides which partner gets paid. If a
// browser can promote the first into the second, it can route commission to
// whoever it likes. The service takes the verified ref as a SERVER-SUPPLIED
// argument and never reads it from the request body — these tests hold that
// line at the composed door.

import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  ADMIN_BEARER,
  buildDoor,
  catalogItem,
  submission,
} from "./harness/assisted-order-door";

const SUBMIT = "/api/research/early-access/assisted-orders";

async function submitAs(app: Parameters<typeof request>[0], body: Record<string, unknown>) {
  return request(app).post(SUBMIT).set("x-test-member", "a").send(body);
}

async function adminDetail(app: Parameters<typeof request>[0], requestId: string) {
  return request(app)
    .get(`/api/admin/research/assisted-orders/${requestId}`)
    .set("authorization", ADMIN_BEARER);
}

describe("LANE F negative: a classification-pending product cannot be ordered directly", () => {
  it("records the authority's request pathway, not the direct order the browser claimed", async () => {
    const { app } = buildDoor([
      catalogItem({
        productId: "pc_pending",
        variantId: "pc_pending_variant",
        productName: "Classification Pending Peptide",
        workflowMode: "request_pricing",
        actionLabel: "Request Order",
        // Pending means no approved retail price to charge against.
        unitPriceCents: null as unknown as number,
      }),
    ]);

    const response = await submitAs(app, {
      ...submission(),
      lines: [
        {
          productId: "pc_pending",
          variantId: "pc_pending_variant",
          quantity: 1,
          // The browser insisting this is a normal priced order.
          workflowMode: "direct_order_request",
          expectedUnitPriceCents: 9900,
        },
      ],
    });

    if (response.status === 201) {
      const line = (response.body.lines as Array<Record<string, unknown>>)[0];
      expect(line.workflowMode).toBe("request_pricing");
      expect(line.unitPriceCents ?? null).toBeNull();
      expect(response.body.estimatedTotalCents ?? null).toBeNull();
    } else {
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    }
  });
});

describe("LANE F negative: a held product cannot be ordered at all", () => {
  it("refuses a line the authority will not serve", async () => {
    // A held row is one the catalog authority declines to resolve. The door
    // must take that as final rather than assembling a line from the request.
    const { app, enqueued } = buildDoor([catalogItem()]);

    const response = await submitAs(app, {
      ...submission(),
      lines: [
        {
          productId: "pc_held",
          variantId: "pc_held_variant",
          quantity: 1,
          workflowMode: "direct_order_request",
          expectedUnitPriceCents: 9900,
        },
      ],
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    // And nobody is told to go price something that was never accepted.
    expect(enqueued).toHaveLength(0);
  });
});

describe("LANE F negative: a typed affiliate code is never verified attribution", () => {
  it("does not let the browser supply its own attribution reference", async () => {
    const { app } = buildDoor();

    const response = await submitAs(app, {
      ...submission(),
      // Both shapes a hopeful browser might use to name who gets paid.
      affiliateAttributionRef: "partner-chosen-by-browser",
      verifiedAffiliateAttributionRef: "partner-chosen-by-browser",
      declaredAffiliateCode: "DANA10",
    });

    expect(response.status).toBe(201);

    const detail = await adminDetail(app, response.body.requestId as string);
    expect(detail.status).toBe(200);

    const serialized = JSON.stringify(detail.body);
    // The forged reference must appear nowhere in the durable record.
    expect(serialized).not.toContain("partner-chosen-by-browser");
  });

  it("keeps the declared code as a declared fact, separate from verified attribution", async () => {
    const { app } = buildDoor();

    const response = await submitAs(app, {
      ...submission(),
      declaredAffiliateCode: "DANA10",
    });
    expect(response.status).toBe(201);

    const detail = await adminDetail(app, response.body.requestId as string);
    const body = detail.body as Record<string, unknown>;

    // The founder needs to SEE the code the customer typed, because they
    // reconcile it by hand — it just must not be the thing that pays anyone.
    expect(JSON.stringify(body)).toContain("DANA10");
    expect(body.affiliateAttributionRef ?? null).toBeNull();
  });

  it("does not let a declared code change what the order costs", async () => {
    const { app } = buildDoor();

    const plain = await submitAs(app, submission({ idempotencyKey: "routing-plain" }));
    const coded = await submitAs(app, {
      ...submission({ idempotencyKey: "routing-coded" }),
      declaredAffiliateCode: "DANA10",
    });

    expect(coded.body.estimatedTotalCents).toBe(plain.body.estimatedTotalCents);
  });

  it("accepts an unknown code rather than costing the customer their order", async () => {
    // An unrecognised code is normalized and captured, never a rejection: a
    // typo in an optional box must not lose a sale the founder would have
    // closed by hand.
    const { app } = buildDoor();

    const response = await submitAs(app, {
      ...submission(),
      declaredAffiliateCode: "  not-a-real-code-!!  ",
    });

    expect(response.status).toBe(201);
    expect(response.body.publicReference).toMatch(/^XRR-/);
  });
});
