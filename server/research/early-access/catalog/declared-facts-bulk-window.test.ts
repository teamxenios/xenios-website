/**
 * The bulk facts window: same facts, fewer reads.
 *
 * The projection may prefetch inventory, holds and supplier confirmations in
 * bulk, but the ANSWERS must be byte-identical to the per-unit path — the
 * "second opinion that can drift from the first" is the defect class this
 * fleet hit five times on 2026-08-21, so the parity tests here pin the two
 * fetch strategies against each other on the same underlying rows, including
 * the inventory sourceVersion fingerprint that a SQL twin recomputes.
 *
 * The ladder is also pinned: a failed bulk HOLD or CONFIRMATION read falls
 * back to per-unit reads (a deployment where only the new bulk RPC is missing
 * must not lose facts the old path still serves), while a failed bulk
 * INVENTORY read raises — "we could not look" must never project as "there is
 * nothing there".
 */

import { describe, expect, it, vi } from "vitest";
import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { MemberRow } from "../../member-auth";
import {
  createSupabaseBulkVariantInventoryFactsReader,
  createSupabaseVariantInventoryFactsReader,
  type InventoryLotRow,
  type VariantInventoryFactsReader,
} from "../../catalog/member-catalog-service";
import {
  MEMBER_ROW_AUDIENCE_SOURCE,
  ProductControlDeclaredFactsReader,
  EarlyAccessDeclaredFactsError,
  type ProductControlDeclaredFactsDependencies,
} from "./declared-facts-source";
import { resolveEarlyAccessSettlementCurrency } from "./product-control-source";
import { InMemoryUnitHoldRegistry, recordUnitHold } from "../ops/unit-holds";
import {
  InMemorySupplierConfirmationStore,
  createSupplierConfirmation,
} from "../ops/supplier-confirmation";

const NOW = new Date("2026-08-04T12:00:00.000Z");
const CURRENCY = resolveEarlyAccessSettlementCurrency();

function variant(
  id: string,
  productId: string,
  sku: string,
  overrides: Partial<AdminProductVariant> = {},
): AdminProductVariant {
  return {
    id,
    productId,
    sku,
    catalogNumber: null,
    label: "Primary presentation",
    strength: "10 mg",
    size: "1 unit",
    format: "vial",
    presentation: "Single-use vial",
    shippingClass: "ambient",
    memberEligible: true,
    status: "approved",
    active: true,
    sortOrder: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function price(productId: string, variantId: string): AdminProductPrice {
  return {
    id: `price-${variantId}`,
    productId,
    variantId,
    audience: "member",
    amountCents: 24_900,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00.000Z",
    expiresAt: null,
    status: "active",
    approvalNote: null,
    version: 1,
    createdBy: "operations",
    approvedBy: "founder",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function product(
  id: string,
  slug: string,
  variants: AdminProductVariant[],
): AdminProductDetail {
  return {
    id,
    productCode: id.toUpperCase(),
    slug,
    displayName: `Item ${id}`,
    canonicalName: `Item ${id}`,
    aliases: [],
    lane: "research_material",
    category: "Research materials",
    classification: "Research catalog item",
    status: "published",
    active: true,
    visibility: "public",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: variants.length,
    approvedVariantCount: variants.length,
    missingInputCount: 0,
    updatedAt: "2026-07-01T00:00:00.000Z",
    publishedAt: "2026-07-01T00:00:00.000Z",
    content: {
      shortDescription: "A research catalog item.",
      longDescription: null,
      overview: null,
      specifications: null,
      researchInformation: null,
      storageInformation: null,
      handlingInformation: null,
      shippingInformation: null,
      returnInformation: null,
      disclaimers: null,
      citations: [],
      reviewDate: null,
    },
    variants,
    prices: variants.map((unit) => price(id, unit.id)),
    media: [],
    history: [],
  };
}

function member(): MemberRow {
  return {
    id: "member-0001",
    status: "active",
    billing_state: "current",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  } as MemberRow;
}

const V_A1 = variant("var-a1", "prod-a", "SKU-A1");
const V_A2 = variant("var-a2", "prod-a", "SKU-A2");
const V_B1 = variant("var-b1", "prod-b", "SKU-B1");
const PRODUCTS = [
  product("prod-a", "item-a", [V_A1, V_A2]),
  product("prod-b", "item-b", [V_B1]),
];

/**
 * One shared set of lot rows: an allocatable lot for var-a1, an unallocatable
 * lot for var-a2, a row whose sku does NOT match var-b1 (the per-variant
 * query's sku filter must exclude it in bulk too), and a row for a product
 * nobody asked about.
 */
const LOTS: InventoryLotRow[] = [
  { id: "lot-01", product_id: "prod-a", variant_id: "var-a1", sku: "SKU-A1", disposition: "available", version: 3, updated_at: "2026-08-01T00:00:00.000Z" },
  { id: "lot-02", product_id: "prod-a", variant_id: "var-a2", sku: "SKU-A2", disposition: "quarantined", version: 1, updated_at: "2026-08-01T00:00:00.000Z" },
  { id: "lot-03", product_id: "prod-b", variant_id: "var-b1", sku: "SKU-STALE", disposition: "available", version: 2, updated_at: "2026-08-01T00:00:00.000Z" },
  { id: "lot-04", product_id: "prod-zz", variant_id: "var-zz", sku: "SKU-ZZ", disposition: "available", version: 1, updated_at: "2026-08-01T00:00:00.000Z" },
];

const ALLOCATABLE: Record<string, boolean> = { "lot-01": true, "lot-02": false, "lot-03": true, "lot-04": true };

/** A fake Supabase client serving both the per-variant and the bulk query shape. */
function fakeLotsDb(counters?: { selects?: number[]; rpcs?: number[] }) {
  return {
    from(table: string) {
      expect(table).toBe("research_inventory_lots");
      const state = { eq: [] as [string, unknown][], in: null as null | readonly string[] };
      const run = () => {
        counters?.selects?.push(1);
        let rows = LOTS;
        for (const [column, value] of state.eq) {
          rows = rows.filter((row) => (row as unknown as Record<string, unknown>)[column] === value);
        }
        if (state.in !== null) {
          const allowed = state.in;
          rows = rows.filter((row) => allowed.includes(row.product_id ?? ""));
        }
        rows = [...rows].sort((left, right) => left.id.localeCompare(right.id));
        return { data: rows, error: null };
      };
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          state.eq.push([column, value]);
          return builder;
        },
        in: (_column: string, values: readonly string[]) => {
          state.in = values;
          return builder;
        },
        order: async () => run(),
      };
      return builder;
    },
    async rpc(name: string, args: { p_lot_id: string }) {
      expect(name).toBe("research_lot_is_allocatable");
      counters?.rpcs?.push(1);
      return { data: ALLOCATABLE[args.p_lot_id] === true, error: null };
    },
  };
}

function reader(overrides: Partial<ProductControlDeclaredFactsDependencies>) {
  return new ProductControlDeclaredFactsReader({
    inventory: createSupabaseVariantInventoryFactsReader({
      configured: () => true,
      db: () => fakeLotsDb() as never,
    }),
    audience: MEMBER_ROW_AUDIENCE_SOURCE,
    currency: CURRENCY,
    ...overrides,
  });
}

async function declaredWith(overrides: Partial<ProductControlDeclaredFactsDependencies>) {
  return reader(overrides).readDeclaredFacts({
    products: PRODUCTS,
    now: NOW,
    context: { member: member() },
  });
}

describe("bulk inventory window", () => {
  it("projects byte-identical facts to the per-variant path, fingerprints included", async () => {
    const perUnit = await declaredWith({});
    const bulk = await declaredWith({
      bulkInventory: createSupabaseBulkVariantInventoryFactsReader({
        configured: () => true,
        db: () => fakeLotsDb() as never,
      }),
    });
    expect(bulk).toEqual(perUnit);
    // The fixture exercised all three shapes: allocatable, unallocatable, and
    // sku-mismatched rows. Confirm they resolved as designed, not vacuously.
    expect(bulk[0].variantFacts[0].fulfillment?.state).toBe("eligible");
    expect(bulk[0].variantFacts[1].fulfillment?.state).toBe("unavailable");
    expect(bulk[1].variantFacts[0].fulfillment?.state).toBe("unavailable");
  });

  it("costs one lot select and one RPC per decided lot, not one select per variant", async () => {
    const counters = { selects: [] as number[], rpcs: [] as number[] };
    await declaredWith({
      bulkInventory: createSupabaseBulkVariantInventoryFactsReader({
        configured: () => true,
        db: () => fakeLotsDb(counters) as never,
      }),
    });
    expect(counters.selects.length).toBe(1);
    // lot-03 (sku mismatch) and lot-04 (unrequested product) are never decided.
    expect(counters.rpcs.length).toBe(2);
  });

  it("raises rather than falling back when the bulk inventory read fails", async () => {
    await expect(
      declaredWith({
        bulkInventory: {
          async readAllVariantInventoryFacts() {
            throw new Error("member_catalog_inventory_unavailable");
          },
        },
      }),
    ).rejects.toBeInstanceOf(EarlyAccessDeclaredFactsError);
  });
});

describe("bulk hold window", () => {
  async function heldRegistry() {
    const registry = new InMemoryUnitHoldRegistry();
    const hold = recordUnitHold({
      holdId: "hold-0001",
      kind: "STOP_SHIP",
      productId: "prod-a",
      variantId: "var-a1",
      reason: "Recorded prohibition for the bulk-window parity test.",
      recordedBy: "Samuel Boadu",
      recordedAt: "2026-08-03T00:00:00.000Z",
    });
    if (!hold.ok) throw new Error(hold.code);
    await registry.record(hold.value);
    return registry;
  }

  it("answers from one bulk read, identically to per-unit reads", async () => {
    const registry = await heldRegistry();
    // A per-unit-ONLY view of the same registry: the window cannot detect a
    // bulk method on it, so this is the classic path over the same records.
    const perUnitOnly = await declaredWith({
      holds: {
        activeHoldsForUnit: (productId, variantId, evaluatedAt) =>
          registry.activeHoldsForUnit(productId, variantId, evaluatedAt),
      },
    });
    const perUnitSpy = vi.spyOn(registry, "activeHoldsForUnit");
    const declared = await declaredWith({ holds: registry });
    expect(declared).toEqual(perUnitOnly);
    expect(declared[0].variantFacts[0].activeHolds).toEqual(["STOP_SHIP"]);
    expect(declared[0].variantFacts[1].activeHolds).toEqual([]);
    // The bulk method answered the window; the per-variant projection never
    // reached the store directly. (The in-memory bulk read derives THROUGH the
    // per-unit method internally, so parity is by construction; the calls here
    // are the window's own, made before the spy could see projection calls.)
    expect(
      perUnitSpy.mock.calls.filter(([productId]) => productId === "prod-b"),
    ).toEqual([]);
  });

  it("falls back to per-unit reads when the bulk hold read fails, and reports", async () => {
    const registry = await heldRegistry();
    const degraded: string[] = [];
    const failing = Object.assign(
      Object.create(Object.getPrototypeOf(registry)) as InMemoryUnitHoldRegistry,
      registry,
    );
    failing.activeHoldsForAllUnits = async () => {
      throw new Error("bulk hold RPC missing");
    };
    const declared = await declaredWith({
      holds: failing,
      onBulkDegraded: (message) => degraded.push(message),
    });
    expect(declared[0].variantFacts[0].activeHolds).toEqual(["STOP_SHIP"]);
    expect(degraded.some((message) => message.includes("bulk unit-hold read failed"))).toBe(true);
  });
});

describe("bulk supplier-confirmation window", () => {
  async function liveStore() {
    const store = new InMemorySupplierConfirmationStore();
    const created = createSupplierConfirmation({
      confirmationId: "supconf-bulk-0001",
      supplierOrg: "Apex Research Supply",
      supplierContact: "Mitch (recorded)",
      productId: "prod-b",
      variantId: "var-b1",
      sku: "SKU-B1",
      supplierSku: "APX-B1",
      strength: "10 mg",
      presentation: "Single vial, 10 mg",
      maxQuantity: 12,
      fulfillmentLocation: "Houston TX",
      fulfillmentMethod: "courier_handoff",
      targetHandoffHours: 72,
      shippingRequirements: "Insulated mailer",
      coldChainState: "ambient_ok",
      documentationState: "supplier_states_coa_available",
      confirmedAt: "2026-08-04T00:00:00.000Z",
      expiresAt: "2026-08-05T00:00:00.000Z",
      confirmedBy: "Samuel Boadu",
      evidenceRef: "telegram:supplier-thread/8841",
    });
    if (!created.ok) throw new Error(`fixture invalid: ${created.code}`);
    await store.insert(created.value);
    return store;
  }

  it("projects the confirmation from the bulk window exactly as per-unit reads do", async () => {
    const store = await liveStore();
    // A per-unit-ONLY view of the same store: no bulk method to detect.
    const perUnit = await declaredWith({
      supplierConfirmations: {
        liveForUnit: (productId, variantId, now) =>
          store.liveForUnit(productId, variantId, now),
      },
    });
    const viaBulk = await declaredWith({ supplierConfirmations: store });
    expect(viaBulk).toEqual(perUnit);
    // var-b1 has no allocatable lot (sku mismatch), so its eligibility is the
    // confirmation's doing — the exact production shape (zero lots, live
    // confirmations carrying the shelf).
    expect(viaBulk[1].variantFacts[0].fulfillment?.state).toBe("eligible");
    expect(viaBulk[1].variantFacts[0].fulfillment?.sourceVersion).toContain(
      "SUPPLIER_CONFIRMED_ON_DEMAND",
    );
  });

  it("falls back to per-unit confirmation reads when the bulk read fails", async () => {
    const store = await liveStore();
    const degraded: string[] = [];
    const failing = Object.assign(
      Object.create(Object.getPrototypeOf(store)) as InMemorySupplierConfirmationStore,
      store,
    );
    failing.liveForAllUnits = async () => {
      throw new Error("bulk confirmation RPC missing");
    };
    const declared = await declaredWith({
      supplierConfirmations: failing,
      onBulkDegraded: (message) => degraded.push(message),
    });
    expect(declared[1].variantFacts[0].fulfillment?.state).toBe("eligible");
    expect(
      degraded.some((message) => message.includes("bulk supplier-confirmation read failed")),
    ).toBe(true);
  });
});
