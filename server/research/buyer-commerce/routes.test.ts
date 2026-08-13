import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { BuyerOrderRequestRecord } from "@shared/research/buyer-commerce";
import { InMemoryEarlyAccessAuditSink } from "../early-access/routes/ports";
import { createBuyerCommerceRouter } from "./routes";

function app(options: Parameters<typeof createBuyerCommerceRouter>[1] = {}) {
  const server = express();
  server.use(express.json({ limit: "1mb" }));
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
    }, options),
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
      status: "request_received",
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

  it("rate-limits unauthenticated intake with a hashed network key", async () => {
    const limiter = vi.fn(async () => false);
    const response = await request(app({ rateLimit: limiter, ip: () => "203.0.113.8" }))
      .post("/api/research/buyer/order-requests")
      .send(valid);
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("600");
    expect(limiter).toHaveBeenCalledOnce();
    const [key, seconds, hits] = limiter.mock.calls[0]!;
    expect(key).toMatch(/^buyer-request:[a-f0-9]{64}$/);
    expect(key).not.toContain("203.0.113.8");
    expect([seconds, hits]).toEqual([600, 5]);
  });

  it("rejects oversized declared bodies before rate-limit or domain work", async () => {
    const limiter = vi.fn(async () => true);
    const response = await request(app({ rateLimit: limiter }))
      .post("/api/research/buyer/order-requests")
      .send({ ...valid, notes: "x".repeat(256 * 1024) });
    expect(response.status).toBe(413);
    expect(response.body.error).toBe("request_too_large");
    expect(limiter).not.toHaveBeenCalled();
  });
});
