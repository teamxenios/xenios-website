import { describe, expect, it } from "vitest";
import { productReleaseGateFromRequiredInputs } from "./product-admin-production";

function dbWith(data: unknown[]) {
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
  };
}

describe("productReleaseGateFromRequiredInputs", () => {
  it("fails closed when the canonical item projection is empty", async () => {
    const gate = productReleaseGateFromRequiredInputs(dbWith([]) as never);

    await expect(gate.evaluate("product-1")).resolves.toEqual({
      displayReady: false,
      commerceReady: false,
      blockingKeys: ["product.required_inputs"],
    });
  });

  it("allows display only when canonical required inputs are verified", async () => {
    const gate = productReleaseGateFromRequiredInputs(
      dbWith([
        { key: "product.name", current_state: "verified", blocking_level: "blocks_display" },
        { key: "product.note", current_state: "missing", blocking_level: "informational" },
      ]) as never,
    );

    await expect(gate.evaluate("product-1")).resolves.toEqual({
      displayReady: true,
      commerceReady: false,
      blockingKeys: [],
    });
  });

  it("returns the exact canonical key for rejected or expired blockers", async () => {
    const gate = productReleaseGateFromRequiredInputs(
      dbWith([
        { key: "product.price", current_state: "rejected", blocking_level: "blocks_transaction" },
        { key: "product.media", current_state: "expired", blocking_level: "blocks_display" },
      ]) as never,
    );

    await expect(gate.evaluate("product-1")).resolves.toEqual({
      displayReady: false,
      commerceReady: false,
      blockingKeys: ["product.price", "product.media"],
    });
  });
});
