import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AccountIdentityDeps } from "./service";
import { registerAccountIdentityApi } from "./routes";

function deps(): AccountIdentityDeps {
  return {
    resolveAuthenticatedUser: vi.fn(async () => ({ userId: "u1", email: "buyer@example.com", emailVerified: false })),
    findPersonalAccount: vi.fn(async () => null),
    listOrganizationAccess: vi.fn(async () => []),
    getOrganizationAccess: vi.fn(async () => null),
    findCustomerByRef: vi.fn(async () => null),
    issueCustomerClaimChallenge: vi.fn(async () => ({ claimId: "00000000-0000-4000-8000-000000000000", deliveryAccepted: true })),
    inspectCustomerClaimChallenge: vi.fn(async () => null),
    commitCustomerClaim: vi.fn(async () => "invalid"),
    getOrganizationDashboard: vi.fn(async () => { throw new Error("not called"); }),
    updateOrganizationProfile: vi.fn(async () => { throw new Error("not called"); }),
    issueOrganizationInvitation: vi.fn(async () => ({ invitationId: "00000000-0000-4000-8000-000000000000", deliveryAccepted: true })),
    inspectOrganizationInvitation: vi.fn(async () => null),
    commitOrganizationInvitation: vi.fn(async () => "invalid"),
    completePasswordChange: vi.fn(async () => false),
    findOrderForOrganization: vi.fn(async () => null),
    createRequestAgain: vi.fn(async () => ({ requestId: "00000000-0000-4000-8000-000000000000", replayed: false })),
    emitAudit: vi.fn(async () => undefined),
  };
}

describe("account identity routes", () => {
  it("returns machine-readable verification denial with private no-store headers", async () => {
    const app = express();
    app.use(express.json());
    registerAccountIdentityApi(app, deps());
    const response = await request(app).get("/api/research/account/context").set("Authorization", "Bearer test");
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ ok: false, code: "EMAIL_VERIFICATION_REQUIRED" });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers.vary).toContain("Authorization");
  });
});
