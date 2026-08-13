import { describe, expect, it, vi } from "vitest";

import type { BuyerOrderRequestRecord, ResolvedBuyerLine } from "@shared/research/buyer-commerce";
import {
  createEarlyAccessCustomer,
  customerRefFor,
  InMemoryEarlyAccessCustomerRepository,
} from "../early-access/identity/early-access-customer";
import {
  BUYER_CANONICAL_REVALIDATION_GATES,
  CanonicalBuyerAccountResolver,
  CanonicalBuyerCatalogAdapter,
  CanonicalBuyerOrderRequestAdapter,
  createBuyerCommerceProductionDependencies,
  type CanonicalBuyerCatalogBinding,
  type CanonicalBuyerCommerceCommitInput,
  type Pack02BuyerContextReader,
} from "./production-deps";

const NOW = "2026-08-13T12:00:00.000Z";

async function customer(userId: string | null = null) {
  const repository = new InMemoryEarlyAccessCustomerRepository();
  const created = createEarlyAccessCustomer({
    id: "buyer-production-composition",
    email: "buyer@example.com",
    legalName: "Buyer Example",
    now: NOW,
  });
  if (!created.ok) throw new Error(created.code);
  const record = userId === null ? created.value : Object.freeze({ ...created.value, userId });
  const inserted = await repository.insert(record);
  if (!inserted.ok) throw new Error(inserted.code);
  return { repository, record, customerRef: customerRefFor(record) };
}

function line(
  quantity: number,
  disposition: ResolvedBuyerLine["disposition"],
  overrides: Partial<ResolvedBuyerLine> = {},
): ResolvedBuyerLine {
  return {
    offeringId: "product-one",
    variantId: `variant-${quantity}-${disposition}`,
    requestedQuantity: quantity,
    sku: `SKU-${quantity}-${disposition}`,
    productName: "Product One",
    disposition,
    displayPriceCents: 2_500,
    currency: "USD",
    directQuantityLimit: disposition === "direct_cart_eligible" ? 50 : null,
    ...(disposition === "order_request"
      ? { reason: "PRODUCT_CONTROL_REVIEW_REQUIRED" as const }
      : {}),
    ...overrides,
  };
}

function request(customerRef: string, resolvedLines: readonly ResolvedBuyerLine[]): BuyerOrderRequestRecord {
  return Object.freeze({
    requestRef: "XBR-PRODUCTION-0001",
    customerRef,
    idempotencyKey: "xbr_production_composition_0001",
    payload: {
      identity: {
        firstName: "Buyer",
        lastName: "Example",
        email: "buyer@example.com",
        company: "Do not infer this as an organization",
      },
      shipping: {
        line1: "1 Main Street",
        city: "Austin",
        region: "TX",
        postalCode: "78701",
        country: "US",
      },
      lines: resolvedLines.map((entry) => ({
        offeringId: entry.offeringId,
        variantId: entry.variantId,
        requestedQuantity: entry.requestedQuantity,
      })),
      requestedInvoice: true,
      source: "buyer_quick_order",
      idempotencyKey: "xbr_production_composition_0001",
    },
    resolvedLines,
    createdAt: NOW,
  });
}

const noAccount: Pack02BuyerContextReader = { findByAuthUserId: vi.fn(async () => null) };

function catalogBinding(
  variants: readonly ResolvedBuyerLine[] = [],
): CanonicalBuyerCatalogBinding {
  return {
    authority: "master_offerings_plus_product_control",
    variants: vi.fn(async () => variants.map((variant) => ({
      offeringId: variant.offeringId,
      variantId: variant.variantId,
      sku: variant.sku ?? "SKU",
      slug: variant.offeringId,
      productName: variant.productName,
      category: "research",
      ...(variant.displayPriceCents === undefined
        ? {}
        : { displayPriceCents: variant.displayPriceCents }),
      currency: variant.currency,
      displayState: "available_now",
      directPurchaseAuthorized: variant.disposition === "direct_cart_eligible",
      directQuantityLimit: variant.disposition === "direct_cart_eligible"
        ? variant.directQuantityLimit
        : null,
      directAuthorityBasis: variant.disposition === "direct_cart_eligible"
        ? "product_control" as const
        : null,
      carePathway: variant.disposition === "care_pathway",
    }))),
  };
}

describe("Buyer Commerce production composition", () => {
  it("fails closed instead of accepting non-durable production ports", () => {
    expect(() => createBuyerCommerceProductionDependencies({
      persistenceMode: "memory",
    } as never)).toThrow("canonical durable production ports");
  });

  it("builds exactly the five Buyer ports from canonical production bindings", async () => {
    const { repository } = await customer();
    const notifications = { notify: vi.fn() };
    const dependencies = createBuyerCommerceProductionDependencies({
      persistenceMode: "durable",
      customers: repository,
      audit: { record: vi.fn() },
      catalog: catalogBinding(),
      pack02: noAccount,
      canonicalCommit: { commit: vi.fn() },
      notifications,
    });
    expect(Object.keys(dependencies).sort()).toEqual([
      "audit",
      "catalog",
      "identity",
      "notifications",
      "requests",
    ]);
    expect(dependencies.notifications).toBe(notifications);
  });

  it("guards the Pack03/Product Control seam against duplicate or forged direct authority", async () => {
    const valid = line(5, "direct_cart_eligible", { directQuantityLimit: 5 });
    await expect(new CanonicalBuyerCatalogAdapter(catalogBinding([valid]))
      .variants({ customerRef: "customer", at: new Date(NOW) }))
      .resolves.toMatchObject([{ directQuantityLimit: 5 }]);

    const duplicate = catalogBinding([valid, valid]);
    await expect(new CanonicalBuyerCatalogAdapter(duplicate)
      .variants({ customerRef: "customer", at: new Date(NOW) }))
      .rejects.toThrow("ambiguous or invalid authority");

    const forgedQ51 = catalogBinding([
      line(50, "direct_cart_eligible", { directQuantityLimit: 51 }),
    ]);
    await expect(new CanonicalBuyerCatalogAdapter(forgedQ51)
      .variants({ customerRef: "customer", at: new Date(NOW) }))
      .rejects.toThrow("ambiguous or invalid authority");
  });

  it("keeps a no-account buyer guest-bound without guessing an organization", async () => {
    const { repository, customerRef } = await customer();
    const pack02 = { findByAuthUserId: vi.fn(async () => null) };
    const resolved = await new CanonicalBuyerAccountResolver(repository, pack02)
      .resolve(request(customerRef, [line(1, "direct_cart_eligible")]));
    expect(resolved).toEqual({ kind: "guest", customerRef });
    expect(pack02.findByAuthUserId).not.toHaveBeenCalled();
  });

  it("uses only a verified claimed Pack02 member and carries organization evidence without selecting it", async () => {
    const { repository, customerRef } = await customer("auth-user-1");
    const pack02: Pack02BuyerContextReader = {
      findByAuthUserId: vi.fn(async () => ({
        authUserId: "auth-user-1",
        emailVerified: true as const,
        memberId: "member-1",
        passwordChangeRequired: false,
        organizations: [{
          organizationId: "organization-1",
          status: "active" as const,
          roles: ["business_buyer" as const],
          passwordChangeRequired: false,
        }],
      })),
    };
    const resolved = await new CanonicalBuyerAccountResolver(repository, pack02)
      .resolve(request(customerRef, [line(1, "order_request")]));
    expect(resolved).toMatchObject({
      kind: "pack02_member",
      authUserId: "auth-user-1",
      memberId: "member-1",
      organizations: [{ organizationId: "organization-1", roles: ["business_buyer"] }],
    });
    expect(resolved).not.toHaveProperty("organizationId");
  });

  it("refuses an unverified, password-blocked, or mismatched Pack02 binding", async () => {
    const { repository, customerRef } = await customer("auth-user-1");
    const pack02: Pack02BuyerContextReader = {
      findByAuthUserId: vi.fn(async () => ({
        authUserId: "auth-user-1",
        emailVerified: true as const,
        memberId: "member-1",
        passwordChangeRequired: true,
        organizations: [],
      })),
    };
    await expect(new CanonicalBuyerAccountResolver(repository, pack02)
      .resolve(request(customerRef, [line(1, "direct_cart_eligible")])))
      .rejects.toThrow("Pack02 buyer account context could not be verified");
  });

  it("partitions Q1-Q50 into canonical cart and Pack04 handoffs with every real gate retained", async () => {
    const { repository, customerRef } = await customer();
    const commits: CanonicalBuyerCommerceCommitInput[] = [];
    const adapter = new CanonicalBuyerOrderRequestAdapter(
      new CanonicalBuyerAccountResolver(repository, noAccount),
      {
        commit: vi.fn(async (input) => {
          commits.push(input);
          return { committed: true as const, record: input.record };
        }),
      },
    );
    const quantities = [1, 20, 21, 49, 50];
    const direct = quantities.map((quantity) => line(quantity, "direct_cart_eligible"));
    const orderRequest = line(6, "order_request", {
      directQuantityLimit: 5,
      reason: "DIRECT_AUTHORITY_UNAVAILABLE",
    });
    const record = request(customerRef, [...direct, orderRequest]);
    await adapter.commit(record);

    expect(commits).toHaveLength(1);
    expect(commits[0]?.directCart).toMatchObject({
      mode: "canonical_cart_then_checkout",
      lines: quantities.map((quantity) => ({ quantity, authorityLimit: 50 })),
    });
    expect(commits[0]?.orderRequest).toEqual({
      mode: "pack04_to_canonical_research_orders",
      lines: [{
        sku: orderRequest.sku,
        quantity: 6,
        reason: "DIRECT_AUTHORITY_UNAVAILABLE",
      }],
    });
    expect(commits[0]?.revalidate).toBe(BUYER_CANONICAL_REVALIDATION_GATES);
    expect(commits[0]?.revalidate).toEqual(expect.arrayContaining([
      "product_control",
      "eligibility",
      "product_specific_legal",
      "fraud",
      "value",
      "payment",
      "fulfillment",
    ]));
  });

  it("refuses forged Q51, duplicate variants, and a direct line above its lower Product Control limit", async () => {
    const { repository, customerRef } = await customer();
    const canonical = { commit: vi.fn() };
    const adapter = new CanonicalBuyerOrderRequestAdapter(
      new CanonicalBuyerAccountResolver(repository, noAccount),
      canonical,
    );
    await expect(adapter.commit(request(customerRef, [line(51, "order_request")])))
      .rejects.toThrow("Forged Buyer quantity");
    const duplicate = line(1, "direct_cart_eligible");
    await expect(adapter.commit(request(customerRef, [duplicate, duplicate])))
      .rejects.toThrow("duplicate exact variant");
    await expect(adapter.commit(request(customerRef, [line(6, "direct_cart_eligible", {
      directQuantityLimit: 5,
    })])))
      .rejects.toThrow("Forged or incomplete direct-cart handoff");
    expect(canonical.commit).not.toHaveBeenCalled();
  });

  it("passes the original idempotency identity to one canonical commit boundary", async () => {
    const { repository, customerRef } = await customer();
    const durable = new Map<string, BuyerOrderRequestRecord>();
    let writes = 0;
    const adapter = new CanonicalBuyerOrderRequestAdapter(
      new CanonicalBuyerAccountResolver(repository, noAccount),
      {
        async commit(input) {
          const key = `${input.record.customerRef}:${input.record.idempotencyKey}`;
          const existing = durable.get(key);
          if (existing) {
            return { committed: false, reason: "idempotency_key_taken", record: existing };
          }
          // Re-check synchronously before the first await, mirroring the
          // canonical transaction's unique-key claim.
          durable.set(key, input.record);
          writes += 1;
          return { committed: true, record: input.record };
        },
      },
    );
    const record = request(customerRef, [line(1, "direct_cart_eligible")]);
    const [first, second] = await Promise.all([adapter.commit(record), adapter.commit(record)]);
    expect([first.committed, second.committed].sort()).toEqual([false, true]);
    expect(writes).toBe(1);
  });
});
