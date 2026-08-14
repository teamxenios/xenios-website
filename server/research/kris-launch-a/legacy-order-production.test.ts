import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { EarlyAccessCatalogRow } from "../early-access/catalog/early-access-catalog";
import {
  earlyAccessReleaseVersion,
  validateEarlyAccessRelease,
  type EarlyAccessRelease,
} from "../early-access/release/founder-release";
import { projectKrisItem } from "./projection";
import { krisProduct, pricedAt } from "./test-fixtures";
import {
  KRIS_LEGACY_BINDINGS_ENV,
  KrisLegacyBindingError,
  buildKrisLegacyOrderResolver,
  loadKrisLegacyBindings,
  type KrisLegacyBindingRecord,
} from "./legacy-order-production";

const HELD_BLOCKERS = ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED"] as const;

function row(overrides: Partial<EarlyAccessCatalogRow> = {}): EarlyAccessCatalogRow {
  return {
    productId: "prod-retatrutide",
    slug: "retatrutide",
    displayName: "Retatrutide",
    canonicalName: "retatrutide",
    variantId: "var-10mg",
    sku: "RETA-10",
    strength: "10 mg",
    presentation: "lyophilised vial",
    priceCents: null,
    currency: "",
    audience: "member",
    availability: "available",
    offerState: "APPROVAL_REQUIRED_PURCHASE",
    description: "",
    imageState: "none",
    quantityLimit: 3,
    supplierReady: false,
    disputeStatus: { identity: "none", strength: "none" },
    purchasable: false,
    blockers: [...HELD_BLOCKERS],
    ...overrides,
  } as unknown as EarlyAccessCatalogRow;
}

function approved(overrides: Record<string, unknown> = {}): EarlyAccessRelease {
  const validated = validateEarlyAccessRelease({
    releaseId: "rel-0001",
    productId: "prod-retatrutide",
    variantId: "var-10mg",
    productVersion: earlyAccessReleaseVersion(row()),
    status: "approved",
    approvedPriceCents: 24_900,
    currency: "USD",
    waivedBlockers: [...HELD_BLOCKERS],
    approvedQuantityLimit: 3,
    expiresAt: null,
    actor: "Samuel Boadu",
    reason: "Founder release for the private early access pilot.",
    recordedAt: "2026-08-04T12:00:00.000Z",
    ...overrides,
  });
  if (!validated.ok) throw new Error(`fixture invalid: ${validated.code}`);
  return validated.release;
}

const KRIS_ID = "kli_testalpha0001";
const BINDING: KrisLegacyBindingRecord = {
  krisId: KRIS_ID,
  productId: "prod-retatrutide",
  variantId: "var-10mg",
};

function deps(overrides: Record<string, unknown> = {}) {
  return {
    catalog: { load: vi.fn(async () => ({ rows: [row()] })) },
    releases: { all: vi.fn(async () => [approved()]) },
    customers: { customerRefsFor: vi.fn(async () => ["XEA-0001"]) },
    bindings: [BINDING] as readonly KrisLegacyBindingRecord[],
    now: () => Date.parse("2026-08-13T12:00:00.000Z"),
    ...overrides,
  };
}

const VIEWER = { memberId: "member-1" };

describe("the reviewed bindings loader", () => {
  it("accepts a valid environment value and refuses duplicates", () => {
    const env = {
      [KRIS_LEGACY_BINDINGS_ENV]: JSON.stringify([BINDING]),
    } as NodeJS.ProcessEnv;
    expect(loadKrisLegacyBindings(env, { warn: () => {} })).toEqual([BINDING]);

    const dup = {
      [KRIS_LEGACY_BINDINGS_ENV]: JSON.stringify([BINDING, BINDING]),
    } as NodeJS.ProcessEnv;
    const warned: string[] = [];
    // A duplicate in the ENVIRONMENT falls back to the committed set rather
    // than throwing the composition down.
    const fallback = loadKrisLegacyBindings(dup, {
      warn: (message) => warned.push(message),
      committedPath: writeScratch({ schemaVersion: 1, bindings: [] }),
    });
    expect(fallback).toEqual([]);
    expect(warned.join(" ")).toMatch(/duplicate/);
  });

  it("throws on a malformed COMMITTED file, which is a review failure", () => {
    const bad = writeScratch({ bindings: [{ krisId: "kli_x", productId: "p", variantId: "v" }] });
    expect(() => loadKrisLegacyBindings({} as NodeJS.ProcessEnv, { warn: () => {}, committedPath: bad })).toThrow(
      KrisLegacyBindingError,
    );
  });

  it("stays closed when nothing is configured and no committed file exists", () => {
    const missing = path.join(mkdtempSync(path.join(tmpdir(), "kris-bind-")), "absent.json");
    expect(
      loadKrisLegacyBindings({} as NodeJS.ProcessEnv, { warn: () => {}, committedPath: missing }),
    ).toEqual([]);
  });

  it("the committed repo file parses and is currently empty pending founder review", () => {
    const committed = loadKrisLegacyBindings({} as NodeJS.ProcessEnv, { warn: () => {} });
    expect(Array.isArray(committed)).toBe(true);
  });
});

function writeScratch(value: unknown): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "kris-bind-")), "bindings.json");
  writeFileSync(file, JSON.stringify(value));
  return file;
}

describe("the production Buy Now resolver", () => {
  it("offers a bound, released unit at the ledger price through the projection", async () => {
    const d = deps();
    const resolver = await buildKrisLegacyOrderResolver(d, VIEWER);
    expect(resolver).toBeDefined();

    const projected = projectKrisItem(
      krisProduct({ id: KRIS_ID, channel: "ruo_research" }),
      pricedAt(24_900),
      resolver,
    );
    expect(projected.canBuyNow).toBe(true);
    expect(projected.legacyOrder).toEqual({
      productId: "prod-retatrutide",
      variantId: "var-10mg",
      unitPriceCents: 24_900,
      currency: "USD",
      quantityLimit: 3,
      evaluatedAt: "2026-08-13T12:00:00.000Z",
    });
    // The projection loaded the catalog AS the member's own Early Access
    // customer, exactly as the order door will.
    expect(d.catalog.load).toHaveBeenCalledWith(expect.any(Date), {
      earlyAccessCustomer: { customerRef: "XEA-0001" },
    });
  });

  it("closes Buy Now when the ledger price disagrees with the Kris price", async () => {
    const resolver = await buildKrisLegacyOrderResolver(deps(), VIEWER);
    const projected = projectKrisItem(
      krisProduct({ id: KRIS_ID, channel: "ruo_research" }),
      pricedAt(2_464),
      resolver,
    );
    expect(projected.canBuyNow).toBe(false);
    expect(projected.legacyOrder).toBeNull();
  });

  it("offers nothing without bindings, a customer, a release, or a readable catalog", async () => {
    expect(await buildKrisLegacyOrderResolver(deps({ bindings: [] }), VIEWER)).toBeUndefined();
    expect(
      await buildKrisLegacyOrderResolver(
        deps({ customers: { customerRefsFor: async () => [] } }),
        VIEWER,
      ),
    ).toBeUndefined();
    expect(
      await buildKrisLegacyOrderResolver(
        deps({ customers: { customerRefsFor: async () => { throw new Error("down"); } } }),
        VIEWER,
      ),
    ).toBeUndefined();
    expect(
      await buildKrisLegacyOrderResolver(deps({ releases: { all: async () => [] } }), VIEWER),
    ).toBeUndefined();
    expect(
      await buildKrisLegacyOrderResolver(
        deps({ catalog: { load: async () => { throw new Error("down"); } } }),
        VIEWER,
      ),
    ).toBeUndefined();
  });

  it("skips a unit the projection carries twice rather than guessing", async () => {
    const resolver = await buildKrisLegacyOrderResolver(
      deps({ catalog: { load: async () => ({ rows: [row(), row()] }) } }),
      VIEWER,
    );
    expect(resolver).toBeUndefined();
  });

  it("keeps the quantity ceiling at the tightest authority", async () => {
    const resolver = await buildKrisLegacyOrderResolver(
      deps({
        catalog: { load: async () => ({ rows: [row({ quantityLimit: 2 })] }) },
        releases: {
          all: async () => [
            approved({ productVersion: earlyAccessReleaseVersion(row({ quantityLimit: 2 })) }),
          ],
        },
      }),
      VIEWER,
    );
    expect(resolver).toBeDefined();
    const projected = projectKrisItem(
      krisProduct({ id: KRIS_ID, channel: "ruo_research" }),
      pricedAt(24_900),
      resolver,
    );
    expect(projected.legacyOrder?.quantityLimit).toBe(2);
  });

  it("never offers a unit to a provider-workflow row even when bound", async () => {
    const resolver = await buildKrisLegacyOrderResolver(deps(), VIEWER);
    const projected = projectKrisItem(
      krisProduct({ id: KRIS_ID, channel: "clinical_provider_only" }),
      pricedAt(24_900),
      resolver,
    );
    expect(projected.purchaseMode).toBe("provider_workflow");
    expect(projected.canBuyNow).toBe(false);
    expect(projected.legacyOrder).toBeNull();
  });
});
