import { describe, expect, it } from "vitest";
import { PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS } from "@shared/research/product-admin";
import { productReleaseGateFromRequiredInputs } from "./product-admin-production";

type Readiness = {
  domain: string;
  manifestApproved: boolean;
  softwareComplete: boolean;
  publicEnabled: boolean;
  launchStatus: string;
  realInputsRequired: boolean;
  expectedInputCount: number;
  actualInputCount: number;
  blockingInputCount: number;
  blockingKeys: string[];
};

function ready(domain: string, count = 2): Readiness {
  return {
    domain,
    manifestApproved: true,
    softwareComplete: true,
    publicEnabled: true,
    launchStatus: "public_enabled",
    realInputsRequired: false,
    expectedInputCount: count,
    actualInputCount: count,
    blockingInputCount: 0,
    blockingKeys: [],
  };
}

function canonicalRows(productId = "product-1") {
  return PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS.map((binding) => ({
    key: binding.key,
    domain: binding.domain,
    record_type: binding.recordType,
    record_id: productId,
    current_state: "verified",
    blocking_level: "blocks_display",
  }));
}

function dbWith(
  data: unknown[],
  readiness: Record<string, Partial<Readiness>> = {},
) {
  return {
    from() {
      return {
        select() {
          return {
            async eq() {
              return { data, error: null };
            },
          };
        },
      };
    },
    async rpc(_name: string, args: { p_domain: string }) {
      const baseline = ready(args.p_domain);
      return {
        data: { ...baseline, ...(readiness[args.p_domain] ?? {}) },
        error: null,
      };
    },
  };
}

async function evaluate(
  rows: unknown[],
  readiness: Record<string, Partial<Readiness>> = {},
) {
  return productReleaseGateFromRequiredInputs(
    dbWith(rows, readiness) as never,
  ).evaluate("product-1");
}

describe("productReleaseGateFromRequiredInputs", () => {
  it("fails closed for empty, truncated, and same-count replacement projections", async () => {
    const complete = canonicalRows();
    const empty = await evaluate([]);
    const truncated = await evaluate(complete.slice(0, -1));
    const replaced = await evaluate([
      ...complete.slice(0, -1),
      { ...complete.at(-1), key: "products.unexpected" },
    ]);

    expect(empty.displayReady).toBe(false);
    expect(truncated.displayReady).toBe(false);
    expect(replaced.displayReady).toBe(false);
    expect(replaced.blockingKeys).toContain("product.required_inputs.record_set");
  });

  it("fails closed for stale manifest and inconsistent canonical counts", async () => {
    const rows = canonicalRows();
    const stale = await evaluate(rows, {
      products: { manifestApproved: false },
    });
    const inconsistent = await evaluate(rows, {
      product_content: { actualInputCount: 1, expectedInputCount: 2 },
    });

    expect(stale.blockingKeys).toContain(
      "product.required_inputs.manifest:products",
    );
    expect(inconsistent.blockingKeys).toContain(
      "product.required_inputs.manifest:product_content",
    );
  });

  it("isolates the exact product record identity", async () => {
    const wrongRecord = canonicalRows("product-2");
    const result = await evaluate(wrongRecord);

    expect(result.displayReady).toBe(false);
    expect(result.blockingKeys).toContain("products.sku");
  });

  it("returns exact rejected and expired blockers", async () => {
    const rows = canonicalRows();
    rows[0].current_state = "rejected";
    rows[1].current_state = "expired";
    const result = await evaluate(rows);

    expect(result.displayReady).toBe(false);
    expect(result.blockingKeys).toEqual(
      expect.arrayContaining([rows[0].key, rows[1].key]),
    );
  });

  it("allows display only for the exact current record set and canonical readiness", async () => {
    await expect(evaluate(canonicalRows())).resolves.toEqual({
      displayReady: true,
      commerceReady: false,
      blockingKeys: [],
    });
  });
});
