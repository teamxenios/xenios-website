import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AccountIdentityStore } from "./production-deps";

const store = {
  findPersonalAccount: vi.fn(async () => null),
  listOrganizationAccess: vi.fn(async () => []),
} as unknown as AccountIdentityStore;

vi.mock("./production-store", () => ({
  createSupabaseAccountIdentityStore: vi.fn(() => store),
}));

import {
  buildProductionAccountIdentityDependencies,
  createImmediateAccountNotificationDelivery,
  registerProductionAccountIdentityApi,
} from "./production-mount";

const admin = {} as any;
const anon = {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: null }, error: new Error("invalid") })),
  },
};

describe("Pack02 production mount", () => {
  it("builds on the canonical Supabase clients and refuses unproven password evidence", async () => {
    const deps = buildProductionAccountIdentityDependencies({ admin, anon });
    expect(await deps.resolveAuthenticatedUser({ headers: { authorization: "Bearer invalid" } })).toBeNull();
    expect(await deps.completePasswordChange({
      userId: "00000000-0000-4000-8000-000000000001",
      membershipIds: ["00000000-0000-4000-8000-000000000002"],
      requiredAfter: "2026-08-13T00:00:00.000Z",
    })).toBe(false);
  });

  it("adds exactly the registrar's nine routes once", () => {
    const app = express();
    registerProductionAccountIdentityApi(app, { admin, anon });
    const routes = (app as any).router.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
    expect(routes).toEqual([
      "GET /api/research/account/context",
      "POST /api/research/account/claims/request",
      "POST /api/research/account/claims/confirm",
      "POST /api/research/account/security/password-change-complete",
      "POST /api/research/account/organization-invitations/accept",
      "GET /api/research/account/organizations/:organizationId/dashboard",
      "PATCH /api/research/account/organizations/:organizationId/profile",
      "POST /api/research/account/organizations/:organizationId/users/invitations",
      "POST /api/research/account/organizations/:organizationId/orders/request-again",
    ]);
    expect(new Set(routes).size).toBe(9);
  });

  it("fails invalid bearer authentication at the canonical verifier without account reads", async () => {
    store.findPersonalAccount = vi.fn(async () => null);
    store.listOrganizationAccess = vi.fn(async () => []);
    const app = express();
    registerProductionAccountIdentityApi(app, { admin, anon });
    const response = await request(app)
      .get("/api/research/account/context")
      .set("Authorization", "Bearer invalid");
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("AUTH_REQUIRED");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(store.findPersonalAccount).not.toHaveBeenCalled();
    expect(store.listOrganizationAccess).not.toHaveBeenCalled();
  });

  it("delivers action URLs immediately with a non-secret provider idempotency key", async () => {
    const send = vi.fn(async () => ({ data: { id: "provider-message-1" }, error: null }));
    const delivery = createImmediateAccountNotificationDelivery(async () => ({
      client: { emails: { send } } as never,
      fromEmail: "Xenios Research <research@xeniostechnology.com>",
      replyToEmail: "research@xeniostechnology.com",
    }));
    const actionUrl = "https://xeniostechnology.com/research/account/claim-history?claim=944a9541-53a5-4ff3-a6b7-71002a831822&token=raw-secret-token";
    await expect(delivery.deliver({
      kind: "customer_history_claim",
      recipient: "buyer@example.test",
      actionUrl,
      expiresAt: "2026-08-14T00:00:00.000Z",
    })).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: "buyer@example.test",
      text: expect.stringContaining(actionUrl),
    }), {
      idempotencyKey: "pack02-customer_history_claim-944a9541-53a5-4ff3-a6b7-71002a831822",
    });
    expect(JSON.stringify(send.mock.calls[0]?.[1])).not.toContain("raw-secret-token");
  });

  it("refuses malformed action URLs before resolving the provider", async () => {
    const resolveProvider = vi.fn();
    const delivery = createImmediateAccountNotificationDelivery(resolveProvider as never);
    await expect(delivery.deliver({
      kind: "organization_invitation",
      recipient: "buyer@example.test",
      actionUrl: "https://xeniostechnology.com/research/account/organization-invitation?token=secret-without-id",
      expiresAt: "2026-08-14T00:00:00.000Z",
    })).resolves.toBe(false);
    expect(resolveProvider).not.toHaveBeenCalled();
  });
});
