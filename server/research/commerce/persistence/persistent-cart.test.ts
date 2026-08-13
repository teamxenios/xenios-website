import { describe, expect, it, vi } from "vitest";
import {
  createPersistentCartRepository,
  hashCartIdempotencyKey,
  hashCartSecret,
} from "./persistent-cart";
import type { PersistentCartSelection } from "@shared/research/persistent-cart";

const member = "11111111-1111-4111-8111-111111111111";
const product = "22222222-2222-4222-8222-222222222222";
const variant = "33333333-3333-4333-8333-333333333333";
const price = "44444444-4444-4444-8444-444444444444";
const secret = "anonymous-secret-with-at-least-32-characters";
const selection: PersistentCartSelection = {
  productId: product,
  variantId: variant,
  sku: "SKU-1",
  audience: "retail",
  audienceEligibility: {
    audience: "retail",
    state: "authorized",
    sourceVersion: "retail:v1",
    evaluatedAt: "2026-07-27T20:00:00Z",
    principalId: null,
  },
  price: {
    id: price,
    amountCents: 1000,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00Z",
    expiresAt: null,
    version: 3,
  },
  media: {
    id: "88888888-8888-4888-8888-888888888888",
    kind: "primary_image",
    altText: "Product",
  },
  canonicalReadiness: {
    ready: true,
    verifiedInputCount: 4,
    inputVersions: [
      { id: "55555555-5555-4555-8555-555555555551", version: 2 },
      { id: "55555555-5555-4555-8555-555555555552", version: 2 },
      { id: "55555555-5555-4555-8555-555555555553", version: 2 },
      { id: "55555555-5555-4555-8555-555555555554", version: 2 },
    ],
    domainVersions: [
      { domain: "products", version: 4 },
      { domain: "product_content", version: 4 },
    ],
  },
  inventoryEligibility: {
    productId: product,
    variantId: variant,
    state: "eligible",
    sourceVersion: "c".repeat(64),
    evaluatedAt: "2026-07-27T20:00:00Z",
  },
  evaluatedAt: "2026-07-27T20:00:00Z",
};
const cart = {
  id: "66666666-6666-4666-8666-666666666666",
  owner: "member",
  state: "active",
  version: 1,
  expiresAt: "2026-08-27T20:00:00Z",
  items: [],
};

describe("persistent cart repository", () => {
  it("domain-separates and never sends raw anonymous or idempotency secrets", async () => {
    const rpc = vi.fn(async () => ({ data: cart, error: null }));
    const repo = createPersistentCartRepository({ rpc });
    await repo.putAnonymousItem(secret, {
      expectedCartVersion: null,
      expectedItemVersion: null,
      quantity: 1,
      selection,
      idempotencyKey: "idem-key-123456789",
      expiresAt: cart.expiresAt,
    });
    const params = rpc.mock.calls[0][1];
    expect(params.p_owner_identity).toBe(hashCartSecret(secret));
    expect(params.p_idempotency_key_hash).toBe(
      hashCartIdempotencyKey("idem-key-123456789"),
    );
    expect(JSON.stringify(params)).not.toContain(secret);
    expect(JSON.stringify(params)).not.toContain("idem-key-123456789");
    expect(hashCartSecret(secret)).not.toBe(hashCartIdempotencyKey(secret));
  });

  it("requires a fresh server selection for every exposure-increasing put", async () => {
    const rpc = vi.fn();
    const repo = createPersistentCartRepository({ rpc });
    const result = await repo.putMemberItem(member, {
      expectedCartVersion: null,
      expectedItemVersion: null,
      quantity: 1,
      selection: {
        ...selection,
        canonicalReadiness: { ...selection.canonicalReadiness, ready: false as true },
      },
      idempotencyKey: "idem-key-123456789",
      expiresAt: cart.expiresAt,
    });
    expect(result).toEqual({ ok: false, code: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("binds non-retail audiences to members and keeps anonymous carts retail-only", async () => {
    const rpc = vi.fn(async () => ({ data: cart, error: null }));
    const repo = createPersistentCartRepository({ rpc });
    for (const audience of ["member", "professional", "wholesale"] as const) {
      const result = await repo.putAnonymousItem(secret, {
        expectedCartVersion: null,
        expectedItemVersion: null,
        quantity: 1,
        selection: {
          ...selection,
          audience,
          audienceEligibility: {
            ...selection.audienceEligibility,
            audience,
            sourceVersion: "a".repeat(64),
            principalId: member,
          },
        },
        idempotencyKey: `anonymous-${audience}-123456`,
        expiresAt: cart.expiresAt,
      });
      expect(result).toEqual({ ok: false, code: "invalid_input" });
    }
    const memberResult = await repo.putMemberItem(member, {
      expectedCartVersion: null,
      expectedItemVersion: null,
      quantity: 1,
      selection: {
        ...selection,
        audience: "member",
        audienceEligibility: {
          ...selection.audienceEligibility,
          audience: "member",
          sourceVersion: "b".repeat(64),
          principalId: member,
        },
      },
      idempotencyKey: "member-tier-key-123456",
      expiresAt: cart.expiresAt,
    });
    expect(memberResult.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("allows remove without a current selection snapshot", async () => {
    const rpc = vi.fn(async () => ({ data: cart, error: null }));
    const repo = createPersistentCartRepository({ rpc });
    await repo.removeMemberItem(member, {
      cartId: cart.id,
      itemId: "77777777-7777-4777-8777-777777777777",
      expectedCartVersion: 1,
      expectedItemVersion: 1,
      idempotencyKey: "remove-key-12345678",
    });
    expect(rpc).toHaveBeenCalledWith(
      "research_persistent_cart_remove_item",
      expect.not.objectContaining({ p_selection: expect.anything() }),
    );
  });

  it("maps adapter details to one stable safe failure", async () => {
    const repo = createPersistentCartRepository({
      rpc: async () => ({ data: null, error: { message: "adapter internal detail" } }),
    });
    await expect(repo.getMemberCart(member)).resolves.toEqual({
      ok: false,
      code: "dependency_unavailable",
    });
  });

  it("passes only hashed claim identity and rejects malformed inputs", async () => {
    const rpc = vi.fn(async () => ({ data: cart, error: null }));
    const repo = createPersistentCartRepository({ rpc });
    await repo.claimAnonymousCart(member, {
      anonymousSecret: secret,
      selections: [selection],
      expectedAnonymousCartVersion: 1,
      expectedMemberCartVersion: null,
      idempotencyKey: "claim-key-123456789",
      expiresAt: cart.expiresAt,
    });
    expect(rpc.mock.calls[0][1].p_anonymous_hash).toBe(hashCartSecret(secret));
    expect(rpc.mock.calls[0][1].p_selections).toEqual([selection]);
    expect(JSON.stringify(rpc.mock.calls[0][1])).not.toContain(secret);
    await expect(repo.getAnonymousCart("short")).resolves.toEqual({
      ok: false,
      code: "invalid_input",
    });
  });

  it("accepts Q50 and rejects Q51 before persistence", async () => {
    const rpc = vi.fn(async () => ({ data: cart, error: null }));
    const repo = createPersistentCartRepository({ rpc });
    const base = {
      expectedCartVersion: null,
      expectedItemVersion: null,
      selection,
      idempotencyKey: "quantity-key-123456",
      expiresAt: cart.expiresAt,
    };
    await expect(repo.putMemberItem(member, {
      ...base,
      quantity: 50,
    })).resolves.toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    await expect(repo.putMemberItem(member, {
      ...base,
      quantity: 51,
    })).resolves.toEqual({ ok: false, code: "invalid_input" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched selection identities locally", async () => {
    const rpc = vi.fn();
    const repo = createPersistentCartRepository({ rpc });
    const base = {
      expectedCartVersion: null,
      expectedItemVersion: null,
      selection,
      idempotencyKey: "quantity-key-123456",
      expiresAt: cart.expiresAt,
    };
    await expect(repo.putMemberItem(member, {
      ...base,
      quantity: 1,
      selection: {
        ...selection,
        inventoryEligibility: {
          ...selection.inventoryEligibility,
          variantId: "99999999-9999-4999-8999-999999999999",
        },
      },
    })).resolves.toEqual({ ok: false, code: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires a canonical inventory fingerprint at the selection instant", async () => {
    const rpc = vi.fn();
    const repo = createPersistentCartRepository({ rpc });
    const base = {
      expectedCartVersion: null,
      expectedItemVersion: null,
      quantity: 1,
      selection,
      idempotencyKey: "inventory-version-123456",
      expiresAt: cart.expiresAt,
    };
    await expect(repo.putAnonymousItem(secret, {
      ...base,
      selection: {
        ...selection,
        inventoryEligibility: {
          ...selection.inventoryEligibility,
          sourceVersion: "inventory:caller",
        },
      },
    })).resolves.toEqual({ ok: false, code: "invalid_input" });
    await expect(repo.putAnonymousItem(secret, {
      ...base,
      selection: {
        ...selection,
        inventoryEligibility: {
          ...selection.inventoryEligibility,
          evaluatedAt: "2026-07-27T20:00:01Z",
        },
      },
    })).resolves.toEqual({ ok: false, code: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed on malformed adapter cart items", async () => {
    const repo = createPersistentCartRepository({
      rpc: async () => ({
        data: { ...cart, items: [{ id: "not-a-uuid", quantity: 1 }] },
        error: null,
      }),
    });
    await expect(repo.getMemberCart(member)).resolves.toEqual({
      ok: false,
      code: "dependency_unavailable",
    });
  });

  it("rejects low-entropy anonymous credentials before hashing", async () => {
    const rpc = vi.fn();
    const repo = createPersistentCartRepository({ rpc });
    await expect(repo.getAnonymousCart("a".repeat(64))).resolves.toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects past target expiry before put or claim reaches persistence", async () => {
    const rpc = vi.fn();
    const repo = createPersistentCartRepository({ rpc });
    await expect(repo.putMemberItem(member, {
      expectedCartVersion: null,
      expectedItemVersion: null,
      quantity: 1,
      selection,
      idempotencyKey: "past-put-key-123456",
      expiresAt: "2026-01-01T00:00:00Z",
    })).resolves.toEqual({ ok: false, code: "invalid_input" });
    await expect(repo.claimAnonymousCart(member, {
      anonymousSecret: secret,
      selections: [selection],
      expectedAnonymousCartVersion: 1,
      expectedMemberCartVersion: null,
      idempotencyKey: "past-claim-key-1234",
      expiresAt: "2026-01-01T00:00:00Z",
    })).resolves.toEqual({ ok: false, code: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
