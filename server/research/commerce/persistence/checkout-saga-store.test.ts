import { describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_SAGA_PROTOCOL,
  checkoutSha256,
  type CheckoutSagaCommand,
  type CheckoutSagaSnapshot,
} from "../checkout-saga";
import {
  createSupabaseCheckoutSagaStore,
  resolveCheckoutSagaStore,
  type CheckoutSagaRpcClient,
} from "./checkout-saga-store";

const SHA = `sha256:${"a".repeat(64)}`;

function command(): CheckoutSagaCommand {
  return {
    protocol: CHECKOUT_SAGA_PROTOCOL,
    commandId: "11111111-1111-4111-8111-111111111111",
    orderId: "22222222-2222-4222-8222-222222222222",
    memberId: "33333333-3333-4333-8333-333333333333",
    checkoutIdempotencyKey: "checkout-key",
    checkoutIdempotencyKeyHash: "b".repeat(64),
    providerAuthorizationKey: "xr_checkout_authorize_v1_key",
    providerCaptureKey: "xr_checkout_capture_v1_key",
    providerCancellationKey: "xr_checkout_cancel_v1_key",
    placedAt: "2026-08-28T10:00:00.000Z",
    request: {
      shippingAddress: {
        line1: "100 Main St",
        city: "Houston",
        state: "TX",
        postalCode: "77002",
        country: "US",
      },
      shippingService: "standard",
      acceptedAgreementKeys: ["XR-COM-001"],
      researchAttestation: true,
      applyStoreCreditCents: 0,
      paymentMethodReference: "pm_test_atomic",
    },
    activation: {
      intentId: "44444444-4444-4444-8444-444444444444",
      cartId: "55555555-5555-4555-8555-555555555555",
      cartVersion: 2,
      cartFingerprint: SHA,
      lines: [{
        productId: "66666666-6666-4666-8666-666666666666",
        variantId: "77777777-7777-4777-8777-777777777777",
        sku: "XR-1",
        productRevision: 1,
        variantRevision: 1,
        bindingFingerprint: SHA,
        activationLedgerRevision: 1,
        activationEvidenceFingerprint: SHA,
        quantity: 1,
        purchaseMode: "one_time",
      }],
      authorizedAt: "2026-08-28T10:00:00.000Z",
      expiresAt: "2026-08-28T10:30:00.000Z",
    },
    cart: {
      lines: [{
        sku: "XR-1",
        displayName: "Product",
        quantity: 1,
        purchaseMode: "one_time",
        unitPriceCents: 1_000,
        lineTotalCents: 1_000,
        blockedReason: null,
      }],
      shipmentGroups: [{ owner: "xenios", skus: ["XR-1"] }],
      subtotalCents: 1_000,
      shippingCents: 1_295,
      storeCreditAppliedCents: 0,
      estimatedTotalCents: 2_295,
      checkoutReady: true,
      blockingReasons: [],
      requiredAgreements: ["XR-COM-001"],
    },
    shippingQuote: {
      kind: "configured_fallback",
      service: "standard",
      amountCents: 1_295,
      estimatedDeliveryRange: null,
      disclosure: "Configured shipping rate; not a live carrier quote.",
    },
    totals: {
      currency: "usd",
      subtotalCents: 1_000,
      shippingCents: 1_295,
      storeCreditAppliedCents: 0,
      totalCents: 2_295,
    },
    reviewTriggers: [],
  };
}

function snapshot(): CheckoutSagaSnapshot {
  const value = command();
  return {
    command: value,
    commandDigest: `sha256:${checkoutSha256(value)}`,
    state: "authorization_pending",
    reservationIds: ["88888888-8888-4888-8888-888888888888"],
    providerReference: null,
    authorizedAmountCents: null,
    capturedAmountCents: null,
    order: null,
    lastReconciliationPhase: null,
  };
}

describe("Supabase checkout saga RPC adapter", () => {
  it("uses only the durable RPC surface and passes exact command input", async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === "research_checkout_command_find_v1"
        ? { ok: true, snapshot: snapshot() }
        : { ok: true, snapshot: snapshot(), idempotent: false },
      error: null,
    }));
    const store = createSupabaseCheckoutSagaStore({ rpc } as CheckoutSagaRpcClient);

    expect((await store.find(command().memberId, command().checkoutIdempotencyKeyHash)).ok).toBe(true);
    expect((await store.begin(command())).ok).toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(1, "research_checkout_command_find_v1", {
      p_member_id: command().memberId,
      p_checkout_idempotency_key_hash: command().checkoutIdempotencyKeyHash,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "research_checkout_command_begin_v1", { p_command: command() });
  });

  it("fails unavailable on database errors, malformed snapshots, or a changed command digest", async () => {
    const bad = snapshot();
    bad.command.totals.totalCents += 1;
    const stores = [
      createSupabaseCheckoutSagaStore({ rpc: async () => ({ data: null, error: { message: "redacted" } }) }),
      createSupabaseCheckoutSagaStore({ rpc: async () => ({ data: { ok: true, snapshot: {} }, error: null }) }),
      createSupabaseCheckoutSagaStore({ rpc: async () => ({ data: { ok: true, snapshot: bad }, error: null }) }),
    ];
    for (const store of stores) {
      await expect(store.find(command().memberId, command().checkoutIdempotencyKeyHash)).resolves.toEqual({
        ok: false,
        code: "capability_unavailable",
      });
    }
  });

  it("keeps the candidate off unless the exact opt-in and DB configuration are present", async () => {
    const rpc = vi.fn();
    const disabled = resolveCheckoutSagaStore({}, { rpc });
    expect(await disabled.find(command().memberId, command().checkoutIdempotencyKeyHash)).toEqual({
      ok: false,
      code: "capability_unavailable",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
