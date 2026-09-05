import { describe, expect, it, vi } from "vitest";
import { SupabaseProductAdminRepository } from "./product-admin-production";

const input = {
  variantId: "variant-1", audience: "retail" as const, amountCents: 1000,
  currency: "USD", effectiveAt: "2026-09-05T12:00:00Z",
};
describe("Product Control tier persistence compatibility", () => {
  it("refuses on old schema without falling back to a scalar write", async () => {
    const rpc = vi.fn(async (_name: string, _args: unknown) => ({ data: null, error: { code: "PGRST202" } }));
    const repo = new SupabaseProductAdminRepository({ rpc } as never);
    const quantityTiers = [{ minimumQuantity: 1, amountCents: 1000 }, { minimumQuantity: 5, amountCents: 900 }];
    await expect(repo.createPrice("product-1", { ...input, quantityTiers }, "admin@example.invalid", input.effectiveAt))
      .rejects.toThrow("PGRST202");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("research_admin_create_tiered_product_price", {
      p_product_id: "product-1", p_input: { ...input, quantityTiers }, p_actor: "admin@example.invalid", p_at: input.effectiveAt,
    });
  });
  it("retains the legacy RPC for existing scalar inputs", async () => {
    const rpc = vi.fn(async (_name: string, _args: unknown) => ({ data: null, error: { code: "fixture_failure" } }));
    const repo = new SupabaseProductAdminRepository({ rpc } as never);
    await expect(repo.createPrice("product-1", input, "admin@example.invalid", input.effectiveAt)).rejects.toThrow();
    expect(rpc.mock.calls[0][0]).toBe("research_admin_create_product_price");
  });
  it.each([null, {}, "invalid"])("does not downgrade a malformed present ladder to the old RPC (%j)", async (quantityTiers) => {
    const rpc = vi.fn(async (_name: string, _args: unknown) => ({ data: null, error: { code: "PGRST202" } }));
    const repo = new SupabaseProductAdminRepository({ rpc } as never);
    await expect(repo.createPrice("product-1", { ...input, quantityTiers } as never,
      "admin@example.invalid", input.effectiveAt)).rejects.toThrow();
    expect(rpc.mock.calls[0][0]).toBe("research_admin_create_tiered_product_price");
  });
});
