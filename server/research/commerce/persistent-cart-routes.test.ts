import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CartProductSelection } from "@shared/research/cart-product-selection";
import type { PersistentCartPort } from "@shared/research/persistent-cart";
import type { MemberRow } from "../member-auth";
import { registerPersistentCartApi } from "./persistent-cart-routes";

const memberId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const variantId = "33333333-3333-4333-8333-333333333333";
const selection: CartProductSelection = {
  productId,
  variantId,
  sku: "SKU-1",
  audience: "member",
  audienceEligibility: {
    audience: "member",
    state: "authorized",
    sourceVersion: "member:1",
    evaluatedAt: "2026-07-27T20:00:00.000Z",
  },
  price: {
    id: "44444444-4444-4444-8444-444444444444",
    amountCents: 1000,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00.000Z",
    expiresAt: null,
    version: 1,
  },
  media: { id: "m1", kind: "primary_image", altText: "Product" },
  canonicalReadiness: {
    ready: true,
    verifiedInputCount: 1,
    inputVersions: [
      { id: "55555555-5555-4555-8555-555555555555", version: 1 },
    ],
    domainVersions: [{ domain: "product_content", version: 1 }],
  },
  inventoryEligibility: {
    productId,
    variantId,
    state: "eligible",
    sourceVersion: "inventory:1",
    evaluatedAt: "2026-07-27T20:00:00.000Z",
  },
  evaluatedAt: "2026-07-27T20:00:00.000Z",
};
const cart = {
  id: "66666666-6666-4666-8666-666666666666",
  owner: "member" as const,
  state: "active" as const,
  version: 1,
  expiresAt: "2026-08-26T20:00:00.000Z",
  items: [],
};
const member: MemberRow = {
  id: memberId,
  application_id: "application",
  auth_user_id: "auth",
  email: "member@example.invalid",
  first_name: "Member",
  status: "active",
  created_at: "2026-07-01T00:00:00.000Z",
};

function createApp(options?: { signedIn?: boolean; resolved?: boolean }) {
  const carts = {
    getMemberCart: vi.fn(async () => ({ ok: true as const, cart })),
    getAnonymousCart: vi.fn(async () => ({ ok: true as const, cart })),
    putMemberItem: vi.fn(async () => ({ ok: true as const, cart })),
    putAnonymousItem: vi.fn(async () => ({ ok: true as const, cart })),
    removeMemberItem: vi.fn(async () => ({ ok: true as const, cart })),
    removeAnonymousItem: vi.fn(async () => ({ ok: true as const, cart })),
    claimAnonymousCart: vi.fn(async () => ({ ok: true as const, cart })),
    expireCart: vi.fn(async () => ({ ok: true as const, cart })),
  } satisfies PersistentCartPort;
  const resolveMemberSelection = vi.fn(async () =>
    options?.resolved === false ? null : selection,
  );
  const resolveAnonymousSelection = vi.fn(async () =>
    options?.resolved === false ? null : { ...selection, audience: "retail" as const },
  );
  const app = express();
  app.use(express.json());
  registerPersistentCartApi(app, {
    carts,
    selections: { resolveMemberSelection, resolveAnonymousSelection },
    requireActiveMember: (req, res, next) => {
      if (options?.signedIn === false) {
        res.status(401).json({ ok: false, code: "sign_in_required" });
        return;
      }
      (req as typeof req & { researchMember: MemberRow }).researchMember =
        member;
      next();
    },
    now: () => new Date("2026-07-27T20:00:00.000Z"),
    randomSecret: () =>
      "anonymous-secret-with-at-least-thirty-two-characters",
  });
  return { app, carts, resolveMemberSelection };
}

describe("persistent cart HTTP boundary", () => {
  it("sets private headers before authentication", async () => {
    const { app } = createApp({ signedIn: false });
    const response = await request(app).get("/api/research/member/cart");
    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("re-resolves the exact server selection and ignores browser prices", async () => {
    const { app, carts, resolveMemberSelection } = createApp();
    const response = await request(app)
      .put("/api/research/member/cart/items")
      .send({
        productId,
        variantId,
        quantity: 2,
        expectedCartVersion: null,
        expectedItemVersion: null,
        idempotencyKey: "put-member-item-123456",
        price: { amountCents: 1 },
      });
    expect(response.status).toBe(200);
    expect(resolveMemberSelection).toHaveBeenCalledWith({
      member,
      productId,
      variantId,
      slug: undefined,
    });
    expect(carts.putMemberItem).toHaveBeenCalledWith(
      memberId,
      expect.objectContaining({
        quantity: 2,
        selection,
        expiresAt: "2026-08-26T20:00:00.000Z",
      }),
    );
    expect(
      carts.putMemberItem.mock.calls[0][1].selection.price.amountCents,
    ).toBe(1000);
  });

  it("fails stale or unavailable selections without creating a cart", async () => {
    const { app, carts } = createApp({ resolved: false });
    const response = await request(app)
      .put("/api/research/member/cart/items")
      .send({
        productId,
        variantId,
        quantity: 1,
        expectedCartVersion: null,
        expectedItemVersion: null,
        idempotencyKey: "put-member-item-123456",
      });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ ok: false, code: "selection_stale" });
    expect(carts.putMemberItem).not.toHaveBeenCalled();
  });

  it("keeps anonymous cart identity in an HttpOnly cookie", async () => {
    const { app, carts } = createApp();
    const response = await request(app)
      .put("/api/research/anonymous/cart/items")
      .send({
        productId,
        variantId,
        quantity: 1,
        expectedCartVersion: null,
        expectedItemVersion: null,
        idempotencyKey: "put-anonymous-item-123456",
      });
    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"][0]).toContain("SameSite=Lax");
    expect(carts.putAnonymousItem).toHaveBeenCalledWith(
      "anonymous-secret-with-at-least-thirty-two-characters",
      expect.objectContaining({ selection: expect.any(Object) }),
    );
  });
});
