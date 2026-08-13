import { describe, expect, it, vi } from "vitest";

import type {
  BuyerCatalogVariant,
  BuyerOrderRequestInput,
  BuyerOrderRequestRecord,
  BuyerRequestCommit,
} from "@shared/research/buyer-commerce";
import { InMemoryEarlyAccessAuditSink } from "../early-access/routes/ports";
import {
  BuyerRequestConflictError,
  submitBuyerRequest,
  type BuyerCommerceDependencies,
  type BuyerOrderRequestPort,
} from "./service";

const NOW = new Date("2026-08-12T19:00:00.000Z");

function variant(
  variantId: string,
  overrides: Partial<BuyerCatalogVariant> = {},
): BuyerCatalogVariant {
  return {
    offeringId: `product-${variantId}`,
    variantId,
    sku: `SKU-${variantId}`,
    slug: `product-${variantId}`,
    productName: `Product ${variantId}`,
    category: "research_vial",
    strengthLabel: "5 mg",
    displayPriceCents: 4_500,
    currency: "USD",
    displayState: "AVAILABLE",
    directPurchaseAuthorized: true,
    directQuantityLimit: 50,
    directAuthorityBasis: "product_control",
    carePathway: false,
    ...overrides,
  };
}

function payload(
  lines: BuyerOrderRequestInput["lines"] = [
    { offeringId: "product-v1", variantId: "v1", requestedQuantity: 1 },
  ],
): BuyerOrderRequestInput {
  return {
    identity: {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "+1 512 555 0100",
    },
    shipping: {
      line1: "1 Research Way",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      country: "US",
    },
    lines,
    requestedInvoice: true,
    source: "buyer_quick_order",
    idempotencyKey: "xbr_0123456789abcdefghijkl",
  };
}

class RequestStore implements BuyerOrderRequestPort {
  record: BuyerOrderRequestRecord | null = null;

  async commit(record: BuyerOrderRequestRecord): Promise<BuyerRequestCommit> {
    if (this.record !== null) {
      return { committed: false, reason: "idempotency_key_taken", record: this.record };
    }
    this.record = record;
    return { committed: true, record };
  }
}

function harness(variants: readonly BuyerCatalogVariant[]) {
  const requests = new RequestStore();
  const audit = new InMemoryEarlyAccessAuditSink();
  const notify = vi.fn(async () => ({ customerQueued: true, operationsQueued: true }));
  const dependencies: BuyerCommerceDependencies = {
    identity: { upsert: vi.fn(async () => ({ customerRef: "eac_durablebuyer000000000000000001" })) },
    catalog: { variants: vi.fn(async () => variants) },
    requests,
    audit,
    notifications: { notify },
    clock: () => NOW,
    newRequestRef: () => "XBR-00000000000000000001",
  };
  return { dependencies, requests, audit, notify };
}

describe("buyer commerce bridge", () => {
  it("routes 1, 20, 21, 49, and 50 identically through direct commerce", async () => {
    const variants = [
      variant("v1"),
      variant("v2"),
      variant("v3"),
      variant("v4"),
      variant("v5"),
      variant("v6", {
        directPurchaseAuthorized: false,
        directQuantityLimit: null,
        directAuthorityBasis: null,
      }),
    ];
    const h = harness(variants);
    const receipt = await submitBuyerRequest(
      h.dependencies,
      payload([
        { offeringId: "product-v1", variantId: "v1", requestedQuantity: 1 },
        { offeringId: "product-v2", variantId: "v2", requestedQuantity: 20 },
        { offeringId: "product-v3", variantId: "v3", requestedQuantity: 21 },
        { offeringId: "product-v4", variantId: "v4", requestedQuantity: 49 },
        { offeringId: "product-v5", variantId: "v5", requestedQuantity: 50 },
        { offeringId: "product-v6", variantId: "v6", requestedQuantity: 1 },
      ]),
    );

    expect(receipt.lines.map((line) => line.disposition)).toEqual([
      "direct_cart_eligible",
      "direct_cart_eligible",
      "direct_cart_eligible",
      "direct_cart_eligible",
      "direct_cart_eligible",
      "order_request",
    ]);
    expect(receipt.lines.slice(0, 5).every((line) => line.reason === undefined)).toBe(true);
    expect(receipt.lines[5]?.reason).toBe("PRODUCT_CONTROL_REVIEW_REQUIRED");
    expect(receipt.customerRef).toBe("eac_durablebuyer000000000000000001");
    expect(h.requests.record?.customerRef).toBe(receipt.customerRef);
    expect(h.requests.record?.resolvedLines).toHaveLength(6);
    expect(receipt.nextStep).toContain("existing cart");
    expect(receipt.nextStep).toContain("order-request or Care pathway");
  });

  it("uses an order request above explicit exact-variant authority without quantity-review semantics", async () => {
    const h = harness([variant("v1", { directQuantityLimit: 5 })]);
    const receipt = await submitBuyerRequest(
      h.dependencies,
      payload([{ offeringId: "product-v1", variantId: "v1", requestedQuantity: 6 }]),
    );
    expect(receipt.lines[0]).toMatchObject({
      requestedQuantity: 6,
      directQuantityLimit: 5,
      disposition: "order_request",
      reason: "DIRECT_AUTHORITY_UNAVAILABLE",
    });
    expect(receipt.nextStep).not.toContain("existing cart");
    expect(receipt.nextStep).toContain("follow up");
  });

  it("fails direct commerce closed on missing price, missing basis, or malformed exact limits", async () => {
    const h = harness([
      variant("no-price", { displayPriceCents: undefined }),
      variant("no-basis", { directAuthorityBasis: null }),
      variant("fractional-limit", { directQuantityLimit: 1.5 }),
    ]);
    const receipt = await submitBuyerRequest(
      h.dependencies,
      payload([
        { offeringId: "product-no-price", variantId: "no-price", requestedQuantity: 1 },
        { offeringId: "product-no-basis", variantId: "no-basis", requestedQuantity: 1 },
        { offeringId: "product-fractional-limit", variantId: "fractional-limit", requestedQuantity: 1 },
      ]),
    );

    expect(receipt.lines.map((line) => [line.disposition, line.reason])).toEqual([
      ["order_request", "PRICE_AUTHORITY_UNAVAILABLE"],
      ["order_request", "PRODUCT_CONTROL_REVIEW_REQUIRED"],
      ["order_request", "PRODUCT_CONTROL_REVIEW_REQUIRED"],
    ]);
  });

  it("routes care through Care and refuses an unknown or mismatched exact variant", async () => {
    const h = harness([variant("care", { carePathway: true })]);
    const receipt = await submitBuyerRequest(
      h.dependencies,
      payload([
        { offeringId: "product-care", variantId: "care", requestedQuantity: 1 },
        { offeringId: "wrong-product", variantId: "missing", requestedQuantity: 1 },
      ]),
    );
    expect(receipt.lines[0]).toMatchObject({
      disposition: "care_pathway",
      reason: "CARE_PATHWAY_REQUIRED",
    });
    expect(receipt.lines[1]).toMatchObject({
      disposition: "unavailable",
      reason: "VARIANT_NOT_FOUND",
    });
  });

  it("writes one PII-free audit event and uses the existing notification seam", async () => {
    const h = harness([variant("v1")]);
    await submitBuyerRequest(h.dependencies, payload());
    expect(h.audit.all()).toHaveLength(1);
    const serialized = JSON.stringify(h.audit.all()[0]);
    expect(serialized).not.toContain("ada@example.com");
    expect(serialized).not.toContain("Research Way");
    expect(h.notify).toHaveBeenCalledOnce();
  });

  it("returns the durable receipt when audit or notification projection is unavailable", async () => {
    const h = harness([variant("v1")]);
    h.dependencies.audit = { record: vi.fn(async () => { throw new Error("audit unavailable"); }) };
    h.dependencies.notifications = {
      notify: vi.fn(async () => { throw new Error("outbox unavailable"); }),
    };

    await expect(submitBuyerRequest(h.dependencies, payload())).resolves.toMatchObject({
      requestRef: "XBR-00000000000000000001",
      replayed: false,
    });
    expect(h.requests.record).not.toBeNull();
  });

  it("replays the durable request without duplicating audit or notifications", async () => {
    const h = harness([variant("v1")]);
    const first = await submitBuyerRequest(h.dependencies, payload());
    const replay = await submitBuyerRequest(h.dependencies, payload());
    expect(replay).toMatchObject({ requestRef: first.requestRef, replayed: true });
    expect(h.audit.all()).toHaveLength(1);
    expect(h.notify).toHaveBeenCalledOnce();
  });

  it("collapses concurrent double submission to one durable request and one side-effect projection", async () => {
    const h = harness([variant("v1")]);
    const [left, right] = await Promise.all([
      submitBuyerRequest(h.dependencies, payload()),
      submitBuyerRequest(h.dependencies, payload()),
    ]);

    expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
    expect(left.requestRef).toBe(right.requestRef);
    expect(h.audit.all()).toHaveLength(1);
    expect(h.notify).toHaveBeenCalledOnce();
  });

  it("rejects an idempotency replay with changed intent", async () => {
    const h = harness([variant("v1")]);
    await submitBuyerRequest(h.dependencies, payload());
    await expect(
      submitBuyerRequest(
        h.dependencies,
        payload([{ offeringId: "product-v1", variantId: "v1", requestedQuantity: 2 }]),
      ),
    ).rejects.toBeInstanceOf(BuyerRequestConflictError);
  });

  it("rejects quantity 51 and duplicate exact-variant lines before any write", async () => {
    const h = harness([variant("v1")]);
    await expect(
      submitBuyerRequest(
        h.dependencies,
        payload([{ offeringId: "product-v1", variantId: "v1", requestedQuantity: 51 }]),
      ),
    ).rejects.toThrow();
    await expect(
      submitBuyerRequest(
        h.dependencies,
        payload([
          { offeringId: "product-v1", variantId: "v1", requestedQuantity: 1 },
          { offeringId: "product-v1", variantId: "v1", requestedQuantity: 1 },
        ]),
      ),
    ).rejects.toThrow();
    expect(h.requests.record).toBeNull();
  });

  it("refuses accessors, polluted prototypes, and sparse line arrays without invoking them", async () => {
    const h = harness([variant("v1")]);
    const getter = vi.fn(() => payload().identity);
    const hostile = payload() as unknown as Record<string, unknown>;
    Object.defineProperty(hostile, "identity", { enumerable: true, get: getter });
    await expect(submitBuyerRequest(h.dependencies, hostile)).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();

    await expect(
      submitBuyerRequest(h.dependencies, Object.assign(Object.create({ polluted: true }), payload())),
    ).rejects.toThrow();

    const sparse = payload();
    sparse.lines = new Array(2) as BuyerOrderRequestInput["lines"];
    sparse.lines[0] = { offeringId: "product-v1", variantId: "v1", requestedQuantity: 1 };
    await expect(submitBuyerRequest(h.dependencies, sparse)).rejects.toThrow();
    expect(h.requests.record).toBeNull();
  });
});
