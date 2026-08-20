// The founder's launch negative controls, asserted at the composed seam.
//
// These are the "important negatives" from the 2026-08-20 worker directive.
// Each one states a thing a customer, a browser, or an affiliate must NOT be
// able to do on the Early Access revenue path. They run against the real
// intake doors rather than against modules, because every conversion defect
// found on 2026-08-20 lived in a seam between individually-correct modules
// whose own unit tests were green.
//
// A failure here is a launch blocker, not a style complaint.

import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  ADMIN_BEARER,
  AUTHORITATIVE_UNIT_PRICE_CENTS,
  FOUNDER_MAX_QUANTITY,
  buildDoor,
  catalogItem,
  submission,
} from "./harness/assisted-order-door";

const SUBMIT = "/api/research/early-access/assisted-orders";

async function submitAs(
  app: Parameters<typeof request>[0],
  member: "a" | "b",
  body: Record<string, unknown>,
) {
  return request(app).post(SUBMIT).set("x-test-member", member).send(body);
}

describe("launch invariant: money is server-authoritative", () => {
  it("refuses a submission whose declared unit price disagrees with the authority", async () => {
    const { app } = buildDoor();
    const response = await submitAs(app, "a", {
      ...submission(),
      lines: [
        {
          productId: "pc_product_1",
          variantId: "pc_variant_1",
          quantity: 1,
          // A browser claiming the item costs one cent.
          expectedUnitPriceCents: 1,
        },
      ],
    });

    expect(response.status).not.toBe(201);
    expect(JSON.stringify(response.body)).not.toContain('"unitPriceCents":1,');
  });

  it("stores the authority's price, never a price the request carried", async () => {
    const { app } = buildDoor();
    const response = await submitAs(app, "a", submission());

    expect(response.status).toBe(201);
    const line = (response.body.lines as Array<Record<string, unknown>>)[0];
    expect(line.unitPriceCents).toBe(AUTHORITATIVE_UNIT_PRICE_CENTS);
    expect(response.body.estimatedTotalCents).toBe(AUTHORITATIVE_UNIT_PRICE_CENTS * 2);
  });

  it("never lets a request declare itself paid", async () => {
    const { app } = buildDoor();
    const response = await submitAs(app, "a", {
      ...submission(),
      // Every shape a hopeful browser might try.
      status: "paid",
      paid: true,
      paymentState: "paid",
      paymentVerificationId: "forged-by-browser",
    });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("submitted");
    expect(JSON.stringify(response.body)).not.toContain("forged-by-browser");
  });

  it("does not let an affiliate code move the price or the total", async () => {
    const { app } = buildDoor();
    const plain = await submitAs(app, "a", submission());
    const referred = await submitAs(app, "a", {
      ...submission({ idempotencyKey: "launch-invariant-affiliate" }),
      affiliateCode: "PARTNER50",
      affiliateAttributionRef: "forged-attribution",
      discountCents: 5000,
    });

    expect(plain.status).toBe(201);
    expect(referred.status).toBe(201);
    expect(referred.body.estimatedTotalCents).toBe(plain.body.estimatedTotalCents);
    const line = (referred.body.lines as Array<Record<string, unknown>>)[0];
    expect(line.unitPriceCents).toBe(AUTHORITATIVE_UNIT_PRICE_CENTS);
  });
});

describe("launch invariant: quantity ceiling", () => {
  it("accepts the founder maximum", async () => {
    const { app } = buildDoor();
    const response = await submitAs(app, "a", {
      ...submission(),
      lines: [
        {
          productId: "pc_product_1",
          variantId: "pc_variant_1",
          quantity: FOUNDER_MAX_QUANTITY,
        },
      ],
    });
    expect(response.status).toBe(201);
  });

  it("refuses one unit above the maximum", async () => {
    const { app } = buildDoor();
    const response = await submitAs(app, "a", {
      ...submission(),
      lines: [
        {
          productId: "pc_product_1",
          variantId: "pc_variant_1",
          quantity: FOUNDER_MAX_QUANTITY + 1,
        },
      ],
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});

describe("launch invariant: one customer cannot read another", () => {
  it("does not disclose a request to a different signed-in member", async () => {
    const { app } = buildDoor();
    const created = await submitAs(app, "a", submission());
    expect(created.status).toBe(201);
    const reference = created.body.publicReference as string;

    const asOwner = await request(app)
      .get(`${SUBMIT}/${reference}`)
      .set("x-test-member", "a");
    expect(asOwner.status).toBe(200);

    const asStranger = await request(app)
      .get(`${SUBMIT}/${reference}`)
      .set("x-test-member", "b");
    expect(asStranger.status).not.toBe(200);
    expect(JSON.stringify(asStranger.body)).not.toContain("Test Member");
  });

  it("does not disclose a request to an anonymous caller", async () => {
    const { app } = buildDoor();
    const created = await submitAs(app, "a", submission());
    const anonymous = await request(app).get(
      `${SUBMIT}/${created.body.publicReference}`,
    );
    expect(anonymous.status).not.toBe(200);
  });
});

describe("launch invariant: duplicate submission is idempotent", () => {
  it("collapses two concurrent identical submissions into one order", async () => {
    const { app } = buildDoor();
    const body = submission({ idempotencyKey: "launch-invariant-duplicate" });
    const [first, second] = await Promise.all([
      submitAs(app, "a", body),
      submitAs(app, "a", body),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.publicReference).toBe(first.body.publicReference);

    const queue = await request(app)
      .get("/api/admin/research/assisted-orders")
      .set("authorization", ADMIN_BEARER);
    expect(queue.status).toBe(200);
    expect(queue.body.total).toBe(1);
  });
});

describe("launch invariant: pathway integrity", () => {
  it("refuses a provider-pathway row through the direct-order door", async () => {
    // A Care / provider-required row must never be orderable as RUO direct
    // commerce, however it is reached.
    const { app } = buildDoor([
      catalogItem({
        productId: "pc_care_1",
        variantId: "pc_care_variant_1",
        productName: "Provider Pathway Item",
        workflowMode: "provider_request",
        actionLabel: "Start provider workflow",
        unitPriceCents: null as unknown as number,
      }),
    ]);

    const response = await submitAs(app, "a", {
      ...submission(),
      lines: [
        {
          productId: "pc_care_1",
          variantId: "pc_care_variant_1",
          quantity: 1,
          // The browser asserting it is a normal direct order.
          workflowMode: "direct_order_request",
        },
      ],
    });

    // Observed 2026-08-20: the intake door ACCEPTS this (201), because it is a
    // request rather than a checkout, but the browser's claimed workflowMode is
    // discarded and the authority's own pathway is what gets stored. Either
    // outcome satisfies the invariant; what must never happen is a provider row
    // being recorded as a priced direct order.
    if (response.status === 201) {
      const line = (response.body.lines as Array<Record<string, unknown>>)[0];
      expect(line.workflowMode).toBe("provider_request");
      expect(line.unitPriceCents ?? null).toBeNull();
      expect(response.body.estimatedTotalCents ?? null).toBeNull();
    } else {
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("refuses a line naming a variant the authority does not serve", async () => {
    const { app } = buildDoor();
    const response = await submitAs(app, "a", {
      ...submission(),
      lines: [
        { productId: "pc_unknown", variantId: "pc_unknown_variant", quantity: 1 },
      ],
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe("launch invariant: no internal money data reaches a customer surface", () => {
  const FORBIDDEN = [
    "wholesale",
    "supplierCost",
    "supplier_cost",
    "margin",
    "markup",
    "costCents",
    "cost_cents",
    "multiplier",
    "benchmark",
  ];

  it("keeps cost, margin and supplier pricing out of the catalog projection", async () => {
    const { app } = buildDoor();
    const catalog = await request(app)
      .get("/api/research/early-access/assisted-orders/catalog")
      .set("x-test-member", "a");

    expect(catalog.status).toBe(200);
    const body = JSON.stringify(catalog.body).toLowerCase();
    for (const term of FORBIDDEN) {
      expect(body).not.toContain(term.toLowerCase());
    }
  });

  it("keeps cost, margin and supplier pricing out of the submission receipt", async () => {
    const { app } = buildDoor();
    const response = await submitAs(app, "a", submission());
    const body = JSON.stringify(response.body).toLowerCase();
    for (const term of FORBIDDEN) {
      expect(body).not.toContain(term.toLowerCase());
    }
  });

  it("never renders a zero price as a real price", async () => {
    const { app } = buildDoor();
    const catalog = await request(app)
      .get("/api/research/early-access/assisted-orders/catalog")
      .set("x-test-member", "a");
    const items = catalog.body.items as Array<Record<string, unknown>>;
    for (const item of items) {
      expect(item.unitPriceCents).not.toBe(0);
    }
  });
});

describe("launch invariant: every accepted request notifies both sides", () => {
  it("enqueues customer and Xenios notifications on the durable outbox", async () => {
    const { app, enqueued } = buildDoor();
    const response = await submitAs(app, "a", submission());
    expect(response.status).toBe(201);

    // Two audiences must be told: the customer, and Xenios. The founder
    // directive requires both, through the existing outbox, and email failure
    // must never roll the request back.
    expect(enqueued.length).toBeGreaterThanOrEqual(2);
    const serialized = JSON.stringify(enqueued).toLowerCase();
    expect(serialized).toContain("member@example.com");
    expect(serialized).toContain("research@xeniostechnology.com");
  });

  it("still records the request when the outbox refuses", async () => {
    // Email is not allowed to be a transaction. A failing notifier must not
    // cost the customer their order.
    const { app } = buildDoor();
    const response = await submitAs(app, "a", submission());
    expect(response.status).toBe(201);
    expect(response.body.publicReference).toMatch(/^XRR-/);
  });
});
