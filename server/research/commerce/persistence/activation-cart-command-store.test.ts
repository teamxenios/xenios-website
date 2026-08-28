import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  canonicalProductVariantActivationFingerprint,
  type ProductVariantActivationLedgerRecord,
} from "../../product-activation/authority-repository";
import type { StoredCart } from "../cart";
import {
  ACTIVATION_CART_COMMAND_CAPABILITY_ATTESTATION,
  canonicalActivationBindingFingerprint,
  createInMemoryActivationCartAuthorityControl,
  createSupabaseActivationBoundCartCommandStore,
  resolveActivationBoundCartCommandStore,
  unavailableCheckoutActivationPrechargeAuthorizer,
  type ActivationBindingRevision,
  type ActivationCartCommandDatabase,
} from "./activation-cart-command-store";

const AT = "2026-08-28T12:00:00.000Z";
const MEMBER = "member-activation-command";
const SKU = "XR-ACT-001";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "22222222-2222-4222-8222-222222222222";

function binding(
  overrides: Partial<ActivationBindingRevision> = {},
): ActivationBindingRevision {
  return {
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    sku: SKU,
    productRevision: 7,
    variantRevision: 11,
    ...overrides,
  };
}

function activationRow(
  overrides: Partial<
    Omit<ProductVariantActivationLedgerRecord, "evidenceFingerprint">
  > = {},
): ProductVariantActivationLedgerRecord {
  const unsigned = {
    schemaVersion: 1 as const,
    ledgerRevision: 23,
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    sku: SKU,
    productState: "live" as const,
    variantState: "live" as const,
    approvalId: "33333333-3333-4333-8333-333333333333",
    approvedByActorId: "44444444-4444-4444-8444-444444444444",
    approvedByRole: "founder" as const,
    approvedAt: "2026-08-27T08:00:00.000Z",
    reviewedAt: "2026-08-27T09:00:00.000Z",
    validFrom: "2026-08-27T10:00:00.000Z",
    validThrough: "2026-09-27T10:00:00.000Z",
    revokedAt: null,
    ...overrides,
  };
  return {
    ...unsigned,
    evidenceFingerprint:
      canonicalProductVariantActivationFingerprint(unsigned),
  };
}

function inMemoryCartRepository(initial: StoredCart = { lines: [] }) {
  let value = { lines: initial.lines.map((line) => ({ ...line })) };
  const load = vi.fn(async () => ({
    lines: value.lines.map((line) => ({ ...line })),
  }));
  const save = vi.fn(async (_memberId: string, cart: StoredCart) => {
    value = { lines: cart.lines.map((line) => ({ ...line })) };
  });
  return {
    repository: { load, save },
    load,
    save,
    inspect: () => ({ lines: value.lines.map((line) => ({ ...line })) }),
  };
}

function commandControl(initial: StoredCart = { lines: [] }) {
  const cart = inMemoryCartRepository(initial);
  const control = createInMemoryActivationCartAuthorityControl({
    cartRepository: cart.repository,
    bindings: new Map([[SKU, [binding()]]]),
    activationRows: new Map([[SKU, [activationRow()]]]),
  });
  return { cart, control };
}

function addInput(quantityDelta = 2) {
  return {
    kind: "add" as const,
    memberId: MEMBER,
    sku: SKU,
    quantityDelta,
    purchaseMode: "one_time" as const,
    evaluatedAt: AT,
    maxLineQuantity: 100,
  };
}

describe("activation-bound cart command", () => {
  it("commits the cart and exact binding/activation revisions as one command", async () => {
    const { cart, control } = commandControl();

    const result = await control.commandStore.mutateLine(addInput());

    expect(result).toEqual({
      ok: true,
      cart: {
        lines: [
          {
            sku: SKU,
            quantity: 2,
            purchaseMode: "one_time",
          },
        ],
      },
      cartId: expect.stringMatching(/^in-memory-cart:sha256:/),
      cartVersion: 1,
      authority: {
        productId: PRODUCT_ID,
        variantId: VARIANT_ID,
        sku: SKU,
        productRevision: 7,
        variantRevision: 11,
        bindingFingerprint: canonicalActivationBindingFingerprint(binding()),
        activationLedgerRevision: 23,
        activationEvidenceFingerprint:
          activationRow().evidenceFingerprint,
      },
    });
    expect(cart.save).toHaveBeenCalledTimes(1);
    expect(await control.inspectAuthority(MEMBER, SKU)).toEqual(
      result.ok ? result.authority : null,
    );
  });

  it.each([
    ["missing binding", [] as ActivationBindingRevision[], [activationRow()]],
    ["ambiguous binding", [binding(), binding()], [activationRow()]],
    [
      "mismatched binding",
      [binding({ variantId: "55555555-5555-4555-8555-555555555555" })],
      [activationRow()],
    ],
    ["missing activation", [binding()], []],
    ["ambiguous activation", [binding()], [activationRow(), activationRow()]],
    [
      "held product",
      [binding()],
      [activationRow({ productState: "held" })],
    ],
    [
      "held variant",
      [binding()],
      [activationRow({ variantState: "held" })],
    ],
    [
      "unavailable product",
      [binding()],
      [activationRow({ productState: "unavailable" })],
    ],
    [
      "pending variant",
      [binding()],
      [activationRow({ variantState: "pending" })],
    ],
    [
      "retired variant",
      [binding()],
      [activationRow({ variantState: "retired" })],
    ],
    [
      "revoked activation",
      [binding()],
      [activationRow({ revokedAt: "2026-08-28T11:59:59.000Z" })],
    ],
    [
      "stale activation",
      [binding()],
      [activationRow({ validThrough: AT })],
    ],
    [
      "conflicting fingerprint",
      [binding()],
      [{ ...activationRow(), evidenceFingerprint: `sha256:${"0".repeat(64)}` }],
    ],
  ])("denies %s without mutating the cart", async (_name, bindings, rows) => {
    const cart = inMemoryCartRepository({
      lines: [{ sku: SKU, quantity: 3, purchaseMode: "one_time" }],
    });
    const control = createInMemoryActivationCartAuthorityControl({
      cartRepository: cart.repository,
      bindings: new Map([[SKU, bindings]]),
      activationRows: new Map([[SKU, rows]]),
    });

    const result = await control.commandStore.mutateLine(addInput());

    expect(result.ok).toBe(false);
    expect(cart.save).not.toHaveBeenCalled();
    expect(cart.inspect()).toEqual({
      lines: [{ sku: SKU, quantity: 3, purchaseMode: "one_time" }],
    });
  });

  it("serializes concurrent adds so neither update is lost", async () => {
    const { cart, control } = commandControl();

    const [first, second] = await Promise.all([
      control.commandStore.mutateLine(addInput(40)),
      control.commandStore.mutateLine(addInput(60)),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(cart.inspect().lines).toEqual([
      { sku: SKU, quantity: 100, purchaseMode: "one_time" },
    ]);
    expect(cart.save).toHaveBeenCalledTimes(2);
  });

  it("does not let a revocation interleave after authority read and before commit", async () => {
    let releaseLoad!: () => void;
    let signalLoad!: () => void;
    const loadStarted = new Promise<void>((resolve) => {
      signalLoad = resolve;
    });
    const loadMayFinish = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    let value: StoredCart = { lines: [] };
    const repository = {
      load: vi.fn(async () => {
        signalLoad();
        await loadMayFinish;
        return { lines: value.lines.map((line) => ({ ...line })) };
      }),
      save: vi.fn(async (_memberId: string, cart: StoredCart) => {
        value = { lines: cart.lines.map((line) => ({ ...line })) };
      }),
    };
    const control = createInMemoryActivationCartAuthorityControl({
      cartRepository: repository,
      bindings: new Map([[SKU, [binding()]]]),
      activationRows: new Map([[SKU, [activationRow()]]]),
    });

    const mutation = control.commandStore.mutateLine(addInput());
    await loadStarted;
    const revocation = control.replaceActivationRows(SKU, [
      activationRow({ revokedAt: "2026-08-28T12:00:00.000Z" }),
    ]);
    releaseLoad();

    expect((await mutation).ok).toBe(true);
    await revocation;
    const afterRevocation = await control.commandStore.mutateLine(addInput());
    expect(afterRevocation).toEqual({
      ok: false,
      code: "activation_not_live",
    });
    expect(value.lines).toEqual([
      { sku: SKU, quantity: 2, purchaseMode: "one_time" },
    ]);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it("denies without mutation when a binding change wins the serialization order", async () => {
    const { cart, control } = commandControl({
      lines: [{ sku: SKU, quantity: 2, purchaseMode: "one_time" }],
    });
    await control.replaceBindings(SKU, [
      binding({ variantId: "55555555-5555-4555-8555-555555555555" }),
    ]);

    const result = await control.commandStore.mutateLine({
      kind: "set_quantity",
      memberId: MEMBER,
      sku: SKU,
      quantity: 9,
      evaluatedAt: AT,
      maxLineQuantity: 100,
    });

    expect(result).toEqual({ ok: false, code: "activation_not_live" });
    expect(cart.save).not.toHaveBeenCalled();
    expect(cart.inspect().lines[0]?.quantity).toBe(2);
  });

  it("keeps quantity enforcement inside the serialized command", async () => {
    const { cart, control } = commandControl({
      lines: [{ sku: SKU, quantity: 99, purchaseMode: "one_time" }],
    });

    const result = await control.commandStore.mutateLine(addInput(2));

    expect(result).toEqual({ ok: false, code: "quantity_invalid" });
    expect(cart.save).not.toHaveBeenCalled();
    expect(cart.inspect().lines[0]?.quantity).toBe(99);
  });
});

describe("Supabase activation-bound cart command adapter", () => {
  it("calls only the atomic RPC and accepts its exact committed evidence", async () => {
    const authority = {
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      sku: SKU,
      productRevision: 7,
      variantRevision: 11,
      bindingFingerprint: canonicalActivationBindingFingerprint(binding()),
      activationLedgerRevision: 23,
      activationEvidenceFingerprint: activationRow().evidenceFingerprint,
    };
    const database: ActivationCartCommandDatabase = {
      rpc: vi.fn(async () => ({
        data: {
          ok: true,
          cartId: "55555555-5555-4555-8555-555555555555",
          cartVersion: 4,
          lines: [
            {
              sku: SKU,
              quantity: 2,
              purchaseMode: "one_time",
              subscriptionFrequencyDays: null,
            },
          ],
          authority,
        },
        error: null,
      })),
    };
    const store = createSupabaseActivationBoundCartCommandStore(database);

    const result = await store.mutateLine({
      ...addInput(),
      memberId: "66666666-6666-4666-8666-666666666666",
    });

    expect(result).toEqual({
      ok: true,
      cart: {
        lines: [{ sku: SKU, quantity: 2, purchaseMode: "one_time" }],
      },
      cartId: "55555555-5555-4555-8555-555555555555",
      cartVersion: 4,
      authority,
    });
    expect(database.rpc).toHaveBeenCalledOnce();
    expect(database.rpc).toHaveBeenCalledWith(
      "research_cart_mutate_with_activation_v1",
      expect.objectContaining({
        p_action: "add",
        p_sku: SKU,
        p_quantity: 2,
        p_max_line_quantity: 100,
      }),
    );
  });

  it("fails closed on malformed success data or an unavailable RPC", async () => {
    const malformed = createSupabaseActivationBoundCartCommandStore({
      rpc: async () => ({ data: { ok: true, lines: [] }, error: null }),
    });
    const unavailable = createSupabaseActivationBoundCartCommandStore({
      rpc: async () => ({ data: null, error: { message: "function missing" } }),
    });
    const input = {
      ...addInput(),
      memberId: "66666666-6666-4666-8666-666666666666",
    };

    await expect(malformed.mutateLine(input)).resolves.toEqual({
      ok: false,
      code: "authority_unavailable",
    });
    await expect(unavailable.mutateLine(input)).resolves.toEqual({
      ok: false,
      code: "authority_unavailable",
    });
  });
});

describe("activation cart production capability attestation", () => {
  const configured = {
    SUPABASE_URL: "https://authority.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "server-only-rehearsal-key",
  };
  const input = {
    ...addInput(),
    memberId: "66666666-6666-4666-8666-666666666666",
  };

  it("pins the exact unapplied SQL candidate digest", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/candidates/20260828_research_activation_cart_authority.sql",
      ),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const digest = createHash("sha256").update(sql, "utf8").digest("hex");

    expect(ACTIVATION_CART_COMMAND_CAPABILITY_ATTESTATION).toBe(
      `research_activation_cart_authority_v1@sha256:${digest}`,
    );
  });

  it.each([
    ["default off", configured],
    [
      "wrong attestation",
      {
        ...configured,
        RESEARCH_ACTIVATION_CART_COMMAND_ENABLED: "true",
        RESEARCH_ACTIVATION_CART_COMMAND_ATTESTATION:
          "research_activation_cart_authority_v1@sha256:wrong",
      },
    ],
    [
      "non-exact switch",
      {
        ...configured,
        RESEARCH_ACTIVATION_CART_COMMAND_ENABLED: "TRUE",
        RESEARCH_ACTIVATION_CART_COMMAND_ATTESTATION:
          ACTIVATION_CART_COMMAND_CAPABILITY_ATTESTATION,
      },
    ],
  ])("keeps the production command unavailable when %s", async (_name, env) => {
    const database: ActivationCartCommandDatabase = {
      rpc: vi.fn(async () => ({
        data: { ok: false, code: "activation_not_live" },
        error: null,
      })),
    };

    await expect(
      resolveActivationBoundCartCommandStore(env, database).mutateLine(input),
    ).resolves.toEqual({ ok: false, code: "authority_unavailable" });
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("enables only the exact attested candidate capability", async () => {
    const database: ActivationCartCommandDatabase = {
      rpc: vi.fn(async () => ({
        data: { ok: false, code: "activation_not_live" },
        error: null,
      })),
    };
    const store = resolveActivationBoundCartCommandStore(
      {
        ...configured,
        RESEARCH_ACTIVATION_CART_COMMAND_ENABLED: "true",
        RESEARCH_ACTIVATION_CART_COMMAND_ATTESTATION:
          ACTIVATION_CART_COMMAND_CAPABILITY_ATTESTATION,
      },
      database,
    );

    await expect(store.mutateLine(input)).resolves.toEqual({
      ok: false,
      code: "activation_not_live",
    });
    expect(database.rpc).toHaveBeenCalledOnce();
  });

  it("keeps every checkout lifecycle operation unavailable by default", async () => {
    await expect(
      unavailableCheckoutActivationPrechargeAuthorizer.claim({
        memberId: input.memberId,
        checkoutIdempotencyKey: "checkout-key",
        intentId: "77777777-7777-4777-8777-777777777777",
        checkoutCommandId: "88888888-8888-4888-8888-888888888888",
        expectedCartFingerprint: `sha256:${"0".repeat(64)}`,
        at: AT,
      }),
    ).resolves.toEqual({ ok: false, code: "authority_unavailable" });
  });
});
