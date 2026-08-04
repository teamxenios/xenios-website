import { describe, expect, it } from "vitest";

import { loadEarlyAccessCatalog } from "./earlyAccessCatalog";
import type { ApiResult } from "../lib/api";

function respond<T>(result: ApiResult<T>) {
  return async <R>(_path: string): Promise<ApiResult<R>> => result as unknown as ApiResult<R>;
}

/** One approved row in the shape the mounted route projects. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    productId: "prod-aod",
    variantId: "var-5mg",
    displayName: "AOD-9604",
    strength: "5 mg",
    priceCents: 5_600,
    currency: "USD",
    description: "Lyophilised vial for research use.",
    availability: "available",
    purchasable: true,
    blockers: [],
    supplierReady: true,
    ...overrides,
  };
}

describe("early access catalogue adapter", () => {
  it("maps server rows into cards and reports how many arrived", () => {
    return loadEarlyAccessCatalog(
      respond({ kind: "ok", data: { rows: [row(), row({ variantId: "var-10mg" })] } }),
    ).then((load) => {
      expect(load.kind).toBe("ok");
      if (load.kind !== "ok") return;
      expect(load.received).toBe(2);
      expect(load.products).toHaveLength(2);
      expect(load.dropped).toBe(0);
      expect(load.products[0].unitPriceCents).toBe(5_600);
    });
  });

  it("distinguishes an empty catalogue from a broken response", async () => {
    // These look identical to a customer, and only one of them should ever be
    // reported as "there are no products". A shape the browser cannot read is a
    // defect, not an empty shelf.
    const empty = await loadEarlyAccessCatalog(respond({ kind: "ok", data: { rows: [] } }));
    expect(empty.kind).toBe("ok");
    if (empty.kind === "ok") expect(empty.received).toBe(0);

    const broken = await loadEarlyAccessCatalog(respond({ kind: "ok", data: {} }));
    expect(broken.kind).toBe("unreadable");

    const alsoBroken = await loadEarlyAccessCatalog(
      respond({ kind: "ok", data: { rows: "not-an-array" } }),
    );
    expect(alsoBroken.kind).toBe("unreadable");
  });

  it("reports a lapsed private session as locked, not as an empty catalogue", async () => {
    // Showing a signed-out customer an empty shelf tells them the wrong thing:
    // they would conclude there is nothing to buy rather than that they need to
    // unlock again.
    for (const kind of ["unauthorized", "forbidden"] as const) {
      const load = await loadEarlyAccessCatalog(respond({ kind } as ApiResult<unknown>));
      expect(load.kind).toBe("locked");
    }
  });

  it("keeps held and confirmation-required rows, and drops unrenderable ones", async () => {
    const load = await loadEarlyAccessCatalog(
      respond({
        kind: "ok",
        data: {
          rows: [
            row(),
            row({ variantId: "v2", blockers: ["nonwaivable_hold"], purchasable: false }),
            row({ variantId: "v3", supplierReady: false }),
            // No price the server approved: dropped rather than shown at zero.
            row({ variantId: "v4", priceCents: 0 }),
          ],
        },
      }),
    );

    expect(load.kind).toBe("ok");
    if (load.kind !== "ok") return;
    expect(load.received).toBe(4);
    expect(load.dropped).toBe(1);
    expect(load.products.map((p) => p.availability)).toEqual([
      "AVAILABLE",
      "TEMPORARILY_HELD",
      "AVAILABILITY_CONFIRMATION_REQUIRED",
    ]);
  });

  it("accepts the projection under either known key and nothing else", async () => {
    const underProducts = await loadEarlyAccessCatalog(
      respond({ kind: "ok", data: { products: [row()] } }),
    );
    expect(underProducts.kind).toBe("ok");

    // Not a guess at an arbitrary shape: an unknown key is unreadable.
    const unknownKey = await loadEarlyAccessCatalog(
      respond({ kind: "ok", data: { catalogue: [row()] } } as ApiResult<unknown>),
    );
    expect(unknownKey.kind).toBe("unreadable");
  });

  it("surfaces a transport error as an error", async () => {
    const load = await loadEarlyAccessCatalog(
      respond({ kind: "error", message: "network down" } as ApiResult<unknown>),
    );
    expect(load.kind).toBe("error");
    if (load.kind === "error") expect(load.message).toBe("network down");
  });
});
