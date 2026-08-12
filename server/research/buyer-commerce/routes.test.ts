import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import type { BuyerOrderRequestRecord } from "@shared/research/buyer-commerce";
import { InMemoryEarlyAccessAuditSink } from "../early-access/routes/ports";
import { createBuyerCommerceRouter } from "./routes";

function app() {
  const server = express();
  server.use(express.json());
  server.use(
    createBuyerCommerceRouter({
      identity: { upsert: async () => ({ customerRef: "eac_0123456789abcdef0123456789abcdef" }) },
      catalog: {
        variants: async () => [
          {
            offeringId: "p1",
            variantId: "v1",
            sku: "SKU-1",
            slug: "p1",
            productName: "Product 1",
            category: "peptide",
            currency: "USD",
            displayState: "AVAILABLE",
            directPurchaseAuthorized: true,
            directQuantityLimit: 20,
            directAuthorityBasis: "product_control",
            carePathway: false,
          },
        ],
      },
      requests: {
        commit: async (record: BuyerOrderRequestRecord) => ({ committed: true as const, record }),
      },
      audit: new InMemoryEarlyAccessAuditSink(),
      notifications: { notify: async () => ({ customerQueued: true, operationsQueued: true }) },
      clock: () => new Date("2026-08-12T19:00:00.000Z"),
      newRequestRef: () => "XBR-00000000000000000001",
    }),
  );
  return server;
}

const valid = {
  identity: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" },
  shipping: {
    line1: "1 Research Way",
    city: "Austin",
    region: "TX",
    postalCode: "78701",
    country: "US",
  },
  lines: [{ offeringId: "p1", variantId: "v1", requestedQuantity: 1 }],
  idempotencyKey: "xbr_0123456789abcdefghijkl",
};

describe("unmounted buyer commerce route factory", () => {
  it("returns an accepted durable request with private cache headers", async () => {
    const response = await request(app())
      .post("/api/research/buyer/order-requests")
      .send(valid);
    expect(response.status).toBe(202);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      requestRef: "XBR-00000000000000000001",
      status: "submitted_for_review",
      replayed: false,
    });
  });

  it("refuses quantity 51 at the request boundary", async () => {
    const response = await request(app())
      .post("/api/research/buyer/order-requests")
      .send({ ...valid, lines: [{ ...valid.lines[0], requestedQuantity: 51 }] });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_request");
  });
});
