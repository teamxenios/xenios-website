import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS,
  assistedOrderFormPair,
} from "../../../shared/research/assisted-order/form";
import {
  STEP1_PREVIEW_PASSWORD,
  STEP1_PREVIEW_ENABLE_ENV,
  STEP1_PREVIEW_REQUIRED_AGREEMENT,
  buildStep1PreviewApp,
} from "../../../scripts/preview-step1-hotfix";

const ACCEPTED_AT = "2026-08-25T12:00:00.000Z";

function submission(quantity: number) {
  return {
    idempotencyKey: `step1-preview-${quantity}`,
    contact: {
      fullLegalName: "Step One QA",
      email: "step1@example.invalid",
      mobilePhone: "+15125550199",
      ageConfirmed: true,
      shippingAddress: {
        line1: "100 Test Street",
        city: "Austin",
        region: "TX",
        postalCode: "78704",
        countryCode: "US",
      },
      billingSameAsShipping: true,
    },
    agreements: [
      { ...STEP1_PREVIEW_REQUIRED_AGREEMENT, acceptedAt: ACCEPTED_AT },
      ...ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((acknowledgment) => ({
        ...assistedOrderFormPair(acknowledgment),
        acceptedAt: ACCEPTED_AT,
      })),
    ],
    lines: [
      {
        productId: "qa-research-request",
        variantId: "qa-research-request-10mg",
        quantity,
        expectedCatalogVersion: "step1-browser-qa-v1",
        expectedPriceVersion: "qa-price-request-v1",
        expectedUnitPriceCents: 9900,
      },
    ],
  };
}

describe("Step 1 real-browser preview composition", () => {
  it("exercises the real session, filters, quantity ceiling, submission and logout", async () => {
    const built = await buildStep1PreviewApp({
      NODE_ENV: "test",
      [STEP1_PREVIEW_ENABLE_ENV]: "true",
    });
    const browser = request(built.app);

    const runtimeConfig = await browser.get("/api/config");
    expect(runtimeConfig.status).toBe(200);
    expect(runtimeConfig.headers["cache-control"]).toBe("no-store");
    expect(runtimeConfig.body).toMatchObject({
      metaPixelId: null,
      turnstileSiteKey: null,
      supabaseAnonKey: "preview-anon-key-not-a-secret",
    });

    const blockedAdmin = await browser.get("/api/admin/research/assisted-orders");
    expect(blockedAdmin.status).toBe(404);
    expect(blockedAdmin.body.error).toBe("step1_preview_route_not_available");
    const blockedMember = await browser.get("/api/research/member/me");
    expect(blockedMember.status).toBe(404);
    expect(blockedMember.body.error).toBe("step1_preview_route_not_available");
    for (const nonCanonicalPath of [
      "/API/research/member/me",
      "/api/Research/member/me",
      "/API/admin/research/assisted-orders",
      "/api/Admin/research/assisted-orders",
    ]) {
      const blockedMixedCaseApi = await browser.get(nonCanonicalPath);
      expect(blockedMixedCaseApi.status).toBe(404);
      expect(blockedMixedCaseApi.body.error).toBe(
        "step1_preview_route_not_available",
      );
    }

    const openConfig = await browser.get(
      "/api/research/early-access/assisted-orders/config",
    );
    expect(openConfig.status).toBe(200);
    expect(openConfig.body).not.toHaveProperty("items");

    const lockedCatalog = await browser.get(
      "/api/research/early-access/assisted-orders/catalog",
    );
    expect(lockedCatalog.status).toBe(403);

    const unlock = await browser
      .post("/api/research/early-access/unlock")
      .send({ password: STEP1_PREVIEW_PASSWORD });
    expect(unlock.status).toBe(200);
    // The real browser accepts Secure cookies on loopback. Supertest's HTTP
    // agent intentionally does not, so carry the exact server-set values
    // explicitly while still exercising the real signed-cookie resolver.
    const cookieHeader = (unlock.headers["set-cookie"] as string[] | undefined)
      ?.map((value) => value.split(";", 1)[0])
      .join("; ");
    expect(cookieHeader).toBeTruthy();

    const beforeAcceptance = await browser.get(
      "/api/research/early-access/agreements",
    ).set("Cookie", cookieHeader!);
    expect(beforeAcceptance.status).toBe(200);
    expect(beforeAcceptance.body.accepted).toBe(false);

    const accepted = await browser
      .post("/api/research/early-access/agreements/accept")
      .set("Cookie", cookieHeader!)
      .send(STEP1_PREVIEW_REQUIRED_AGREEMENT);
    expect(accepted.status).toBe(200);

    const fullCatalog = await browser.get(
      "/api/research/early-access/assisted-orders/catalog",
    ).set("Cookie", cookieHeader!);
    expect(fullCatalog.status).toBe(200);
    expect(fullCatalog.body.items).toHaveLength(4);
    expect(fullCatalog.body.items[0]).toMatchObject({
      variantId: "qa-research-direct-5mg",
      sourceSelection: {
        family: "research_peptides_materials",
        slug: "qa-research-direct",
        variantId: "mo-qa-research-direct-5mg",
      },
    });
    expect(fullCatalog.body.items.map((item: { actionLabel: string }) => item.actionLabel)).toEqual([
      "Add to order request",
      "Request Order",
      "Continue through Care",
      "Temporarily Unavailable",
    ]);

    const forgedStatus = await browser.get(
      "/api/research/early-access/assisted-orders/XRR-20000101-0000000000",
    ).set("Cookie", cookieHeader!);
    expect(forgedStatus.status).toBe(404);
    expect(forgedStatus.text).toBe(
      '{"error":"not_found","message":"The request was not found."}',
    );
    expect(forgedStatus.text).not.toContain("XRR-20000101-0000000000");

    const searched = await browser.get(
      "/api/research/early-access/assisted-orders/catalog?q=Wellness",
    ).set("Cookie", cookieHeader!);
    expect(searched.body.total).toBe(2);
    const intersection = await browser.get(
      "/api/research/early-access/assisted-orders/catalog?family=research_peptides_materials&action=request_order",
    ).set("Cookie", cookieHeader!);
    expect(intersection.body.total).toBe(1);
    expect(intersection.body.items[0].productName).toBe("QA Research Request");

    const overCeiling = await browser
      .post("/api/research/early-access/assisted-orders")
      .set("Cookie", cookieHeader!)
      .send(submission(101));
    expect(overCeiling.status).toBe(400);
    expect(built.assistedOrderEnqueued).toHaveLength(0);

    const placed = await browser
      .post("/api/research/early-access/assisted-orders")
      .set("Cookie", cookieHeader!)
      .send(submission(100));
    expect(placed.status).toBe(201);
    expect(placed.body.publicReference).toMatch(/^XRR-\d{8}-[0-9A-F]{10}$/);
    expect(placed.body.lines[0].quantity).toBe(100);
    expect(built.assistedOrderEnqueued).toHaveLength(2);

    const ownStatus = await browser.get(
      `/api/research/early-access/assisted-orders/${placed.body.publicReference}`,
    ).set("Cookie", cookieHeader!);
    expect(ownStatus.status).toBe(200);

    const tokenVerifiedStatus = await browser.get(
      `/api/research/early-access/assisted-orders/${placed.body.publicReference}`,
    ).set("x-xenios-order-status-token", placed.body.statusToken);
    expect(tokenVerifiedStatus.status).toBe(200);
    expect(tokenVerifiedStatus.body.publicReference).toBe(placed.body.publicReference);
    expect(tokenVerifiedStatus.body.status).toBe("submitted");

    const logout = await browser
      .post("/api/research/early-access/logout")
      .set("Cookie", cookieHeader!);
    expect(logout.status).toBe(200);
    const afterLogout = await browser.get(
      "/api/research/early-access/assisted-orders/catalog",
    ).set("Cookie", cookieHeader!);
    expect(afterLogout.status).toBe(403);
    const statusAfterLogout = await browser.get(
      `/api/research/early-access/assisted-orders/${placed.body.publicReference}`,
    ).set("Cookie", cookieHeader!);
    expect(statusAfterLogout.status).toBe(403);
    expect(built.assistedOrderEnqueued).toHaveLength(2);
  });
});
