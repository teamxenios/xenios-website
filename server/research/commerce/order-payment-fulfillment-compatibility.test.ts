import { describe, expect, it } from "vitest";
import {
  adaptCanonicalApprovalDecision,
  adaptBuyerCommerceRequest,
  PACK04_CANONICAL_PERSISTENCE_POLICY,
  PACK04_RECONCILED_AUTHORITIES,
  projectCanonicalOrderOperations,
  projectPack04OrganizationOrder,
  resolvePack04AccountBinding,
  type Pack04AccountContext,
} from "./order-payment-fulfillment-compatibility";
import { InMemoryOrderWorkflowEngine } from "./order-payment-fulfillment";

const MEMBER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

function account(overrides: Partial<Pack04AccountContext> = {}): Pack04AccountContext {
  return {
    auth: { userId: "33333333-3333-4333-8333-333333333333", emailVerified: true },
    personal: { memberId: MEMBER },
    organizations: [{
      id: ORG,
      status: "active",
      roles: ["business_buyer"],
      passwordChangeRequired: false,
    }],
    security: { passwordChangeRequired: false },
    ...overrides,
  };
}

describe("Pack 04 final-base compatibility seams", () => {
  it("pins the reconciled Q50, Buyer Commerce, and Pack 02 authorities", () => {
    expect(PACK04_RECONCILED_AUTHORITIES).toEqual({
      q50: "0a15c63e57da25b56214c5e6f39eca1214018b09",
      buyerCommerce: "6f4c7517e762c484458d0ef9d935e518ff1398ee",
      pack02Accounts: "ca943a66b9ce6b6f8f03b9cf302a5aacea9b4fd2",
    });
  });

  it("permits only adapters and projections over canonical persistence", () => {
    expect(PACK04_CANONICAL_PERSISTENCE_POLICY).toEqual({
      mode: "canonical_adapters_and_projections_only",
      createsOrderTables: false,
      createsPaymentTables: false,
      createsFulfillmentTables: false,
      createsTimelineTables: false,
      createsAuditTables: false,
    });
  });

  it("derives personal and organization ownership only from Pack 02 context", () => {
    expect(resolvePack04AccountBinding(account(), { kind: "personal" })).toMatchObject({
      ok: true,
      owner: { kind: "personal", buyerId: MEMBER },
    });
    expect(resolvePack04AccountBinding(account(), {
      kind: "business", organizationId: ORG,
    })).toMatchObject({
      ok: true,
      actor: { actorId: MEMBER, organizationIds: [ORG] },
      owner: { kind: "business", buyerId: MEMBER, organizationId: ORG },
    });
    expect(resolvePack04AccountBinding(account({ personal: null }), { kind: "personal" }))
      .toEqual({ ok: false, code: "member_binding_required" });
    expect(resolvePack04AccountBinding(account({
      organizations: [{ id: ORG, status: "active", roles: ["billing_viewer"], passwordChangeRequired: false }],
    }), { kind: "business", organizationId: ORG }))
      .toEqual({ ok: false, code: "organization_access_denied" });
    expect(resolvePack04AccountBinding(account({
      security: { passwordChangeRequired: true },
    }), { kind: "personal" })).toEqual({ ok: false, code: "password_change_required" });
  });

  it("accepts Buyer Commerce order-request quantities through 50 without stealing cart or Care lines", () => {
    const binding = resolvePack04AccountBinding(account(), { kind: "business", organizationId: ORG });
    expect(binding.ok).toBe(true);
    if (!binding.ok) return;
    const base = {
      requestRef: "request_buyer_commerce_0001",
      createdAt: "2026-08-13T08:00:00.000Z",
      payload: { notes: "Buyer Commerce request" },
    } as const;
    for (const quantity of [1, 20, 21, 49, 50]) {
      const adapted = adaptBuyerCommerceRequest({
        ...base,
        requestRef: `request_buyer_commerce_${quantity}`,
        resolvedLines: [{
          sku: "SKU-BUYER-COMMERCE",
          requestedQuantity: quantity,
          disposition: "order_request",
          reason: "PRODUCT_CONTROL_REVIEW_REQUIRED",
        }],
      }, binding.owner, `order_buyer_commerce_${quantity}`);
      expect(adapted).toMatchObject({
        ok: true,
        canonicalRequestRef: `request_buyer_commerce_${quantity}`,
        reviewReasons: [{ reason: "PRODUCT_CONTROL_REVIEW_REQUIRED" }],
        command: { request: { lines: [{ quantity }] } },
      });
      if (adapted.ok) {
        const engine = new InMemoryOrderWorkflowEngine();
        expect(engine.execute(binding.actor, `pack04:buyer:${quantity}:0001`, adapted.command))
          .toMatchObject({ ok: true, order: { stage: "request_pending" } });
      }
    }
    expect(adaptBuyerCommerceRequest({
      ...base,
      resolvedLines: [{ sku: "SKU-DIRECT", requestedQuantity: 50, disposition: "direct_cart_eligible" }],
    }, binding.owner, "order_direct_0001")).toEqual({ ok: false, code: "existing_cart_required" });
    expect(adaptBuyerCommerceRequest({
      ...base,
      resolvedLines: [{ sku: "SKU-CARE", requestedQuantity: 1, disposition: "care_pathway" }],
    }, binding.owner, "order_care_0001")).toEqual({ ok: false, code: "care_pathway_required" });
    expect(adaptBuyerCommerceRequest({
      ...base,
      resolvedLines: [{
        sku: "SKU-51", requestedQuantity: 51, disposition: "order_request",
        reason: "PRODUCT_CONTROL_REVIEW_REQUIRED",
      }],
    }, binding.owner, "order_51_0001")).toEqual({ ok: false, code: "invalid_request_line" });
    expect(adaptBuyerCommerceRequest({
      ...base,
      resolvedLines: [{ sku: "SKU-FORGED", requestedQuantity: 1, disposition: "order_request" }],
    }, binding.owner, "order_forged_0001")).toEqual({ ok: false, code: "invalid_request_line" });
  });

  it("requires canonical eligibility, Product Control, legal, value and fraud decisions before approval", () => {
    const clear = (decisionRef: string) => ({ state: "cleared" as const, decisionRef });
    const base = {
      orderId: "order_approval_0001",
      occurredAt: "2026-08-13T08:05:00.000Z",
      quantityReviewTriggered: false,
      eligibility: clear("eligibility:decision:0001"),
      productControl: clear("product-control:decision:0001"),
      productSpecificLegal: { state: "not_required" as const },
      valueReview: { state: "not_required" as const },
      fraudReview: { state: "not_required" as const },
    };
    expect(adaptCanonicalApprovalDecision(base)).toMatchObject({
      ok: true,
      command: { kind: "approve_request", orderId: "order_approval_0001" },
      canonicalDecisionRefs: ["eligibility:decision:0001", "product-control:decision:0001"],
    });
    expect(adaptCanonicalApprovalDecision({ ...base, quantityReviewTriggered: true }))
      .toEqual({ ok: false, code: "stale_quantity_review_rule" });
    expect(adaptCanonicalApprovalDecision({
      ...base, eligibility: { state: "blocked" },
    })).toEqual({ ok: false, code: "eligibility_required" });
    expect(adaptCanonicalApprovalDecision({
      ...base, productControl: { state: "blocked" },
    })).toEqual({ ok: false, code: "product_control_required" });
    expect(adaptCanonicalApprovalDecision({
      ...base, productSpecificLegal: { state: "blocked" },
    })).toEqual({ ok: false, code: "product_legal_restriction" });
    expect(adaptCanonicalApprovalDecision({
      ...base, valueReview: { state: "blocked" },
    })).toEqual({ ok: false, code: "value_review_required" });
    expect(adaptCanonicalApprovalDecision({
      ...base, fraudReview: { state: "blocked" },
    })).toEqual({ ok: false, code: "fraud_review_required" });
    expect(adaptCanonicalApprovalDecision({
      ...base, fraudReview: clear("bad ref with spaces"),
    })).toEqual({ ok: false, code: "invalid_decision_reference" });
  });

  it("fails Pack 02 history projection closed without catalog display authority", () => {
    const binding = resolvePack04AccountBinding(account(), { kind: "business", organizationId: ORG });
    if (!binding.ok) throw new Error("fixture binding failed");
    const adapted = adaptBuyerCommerceRequest({
      requestRef: "request_projection_0001",
      createdAt: "2026-08-13T08:00:00.000Z",
      payload: {},
      resolvedLines: [{
        sku: "SKU-PROJECTION", requestedQuantity: 50, disposition: "order_request",
        reason: "PRODUCT_CONTROL_REVIEW_REQUIRED",
      }],
    }, binding.owner, "order_projection_0001");
    if (!adapted.ok) throw new Error("fixture adaptation failed");
    const engine = new InMemoryOrderWorkflowEngine();
    const created = engine.execute(binding.actor, "pack04:projection:0001", adapted.command);
    if (!created.ok) throw new Error("fixture order failed");
    expect(projectPack04OrganizationOrder(created.order, {}, [])).toBeNull();
    expect(projectPack04OrganizationOrder(created.order, {
      "SKU-PROJECTION": "Authoritative catalog display name",
    }, ["fraud_rule"])).toMatchObject({
      source: "research_order",
      ownership: { organizationId: ORG },
      reviewTriggers: ["fraud_rule"],
      lines: [{ quantity: 50, displayName: "Authoritative catalog display name" }],
    });
    expect(projectPack04OrganizationOrder(created.order, {
      "SKU-PROJECTION": "Authoritative catalog display name",
    }, ["fraud_rule", "fraud_rule"])).toBeNull();

    expect(projectCanonicalOrderOperations({
      order: created.order,
      fulfillment: null,
      claims: [],
    })).toEqual({
      orderId: "order_projection_0001",
      supplierReleaseEligible: false,
      fulfillment: null,
      claims: [],
    });

    const canonicalFulfillment = {
      assignmentId: "assignment_projection_0001",
      fulfillmentOrderId: "fulfillment_projection_0001",
      orderReference: created.order.orderId,
      supplierId: "supplier_projection_0001",
      supplierLabel: "Canonical supplier",
      state: "shipped" as const,
      version: 4,
      expectedShipAt: null,
      recipient: {
        name: "Minimum Necessary",
        addressLine1: "123 Example St",
        addressLine2: null,
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "US" as const,
        phone: null,
      },
      shippingService: "ground",
      handlingProfile: "ambient" as const,
      lines: [{
        lineId: "line_projection_0001",
        sku: "SKU-PROJECTION",
        quantity: 50,
        lotId: "lot_projection_0001",
        lotCode: "LOT-PROJECTION",
      }],
      labelReference: "label_projection_0001",
      carrier: "UPS",
      trackingReference: "tracking_projection_0001",
      updatedAt: "2026-08-13T09:00:00.000Z",
    };
    expect(projectCanonicalOrderOperations({
      order: created.order,
      fulfillment: canonicalFulfillment,
      claims: [],
    })).toMatchObject({
      fulfillment: {
        assignmentId: "assignment_projection_0001",
        state: "shipped",
        version: 4,
        carrier: "UPS",
        trackingReference: "tracking_projection_0001",
      },
    });
    expect(projectCanonicalOrderOperations({
      order: created.order,
      fulfillment: { ...canonicalFulfillment, orderReference: "another_order" },
      claims: [],
    })).toBeNull();
    expect(projectCanonicalOrderOperations({
      order: created.order,
      fulfillment: null,
      claims: [{
        claimId: "claim_other_order_0001",
        orderId: "another_order",
        state: "submitted",
        resolution: null,
      }],
    })).toBeNull();

    expect(projectCanonicalOrderOperations({
      order: {
        ...created.order,
        approvedAt: "2026-08-13T08:05:00.000Z",
        approvedBy: "admin_projection_0001",
        settlement: {
          settlementRef: "settlement_projection_0001",
          externalTransactionRef: "transaction_projection_0001",
          amountCents: 5000,
          currency: "USD",
          settledAt: "2026-08-13T08:10:00.000Z",
        },
        supplierHandoff: {
          handoffRef: "handoff_projection_0001",
          supplierId: "supplier_projection_0001",
          queuedAt: "2026-08-13T08:11:00.000Z",
          queuedBy: "admin_projection_0001",
          releasedAt: "2026-08-13T08:12:00.000Z",
          releasedBy: "admin_projection_0001",
        },
      },
      fulfillment: canonicalFulfillment,
      claims: [],
    })).toMatchObject({ supplierReleaseEligible: true });
  });
});
