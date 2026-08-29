import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildInventoryLotAdminIntegrationDependencies,
  SupabaseProductCommerceReadinessReader,
} from "./integration";

const projection = {
  productId: "00000000-0000-4000-8000-000000000101",
  variantId: "00000000-0000-4000-8000-000000000102",
  sku: "WAVE2-SKU",
  productApproved: true,
  productActive: true,
  variantApproved: true,
  variantActive: true,
  activePrice: null,
  shippingClass: "ambient",
  exactLotCoaRequired: true,
  productDocumentationRequired: true,
};

describe("inventory Product Control integration", () => {
  it("preserves the accepted migration and adds only the reviewed bridge and bucket posture", () => {
    const source = readFileSync(
      resolve("supabase/research-inventory-lot-coa-admin.sql"),
      "utf8",
    );
    const managed = readFileSync(
      resolve(
        "supabase/migrations/20260727120000_research_inventory_lot_coa_admin.sql",
      ),
      "utf8",
    );
    const verifier = readFileSync(
      resolve("supabase/verify-research-inventory-lot-coa-admin.sql"),
      "utf8",
    );
    const dag = readFileSync(
      resolve("docs/coordination/MIGRATION_DAG.json"),
      "utf8",
    );
    const rollback = readFileSync(
      resolve(
        "supabase/production/research-inventory-lot-coa-admin-rollback-notes.md",
      ),
      "utf8",
    );

    expect(
      managed.replaceAll("\r\n", "\n").startsWith(
        source.replaceAll("\r\n", "\n"),
      ),
    ).toBe(true);
    expect(managed).toContain(
      "research_inventory_product_variant_projection",
    );
    expect(managed).toContain(
      "revoke all on function public.research_inventory_product_variant_projection(uuid)",
    );
    expect(managed).toContain(
      "allowed_mime_types = excluded.allowed_mime_types",
    );
    expect(verifier).toContain(
      "and file_size_limit = 20971520",
    );
    expect(verifier).toContain(
      "and cardinality(allowed_mime_types) = 1",
    );
    expect(verifier).toContain(
      "raise exception 'Wave 2 browser/public RPC grants found: %'",
    );
    expect(dag).toContain(
      '"path": "supabase/migrations/20260727120000_research_inventory_lot_coa_admin.sql"',
    );
    expect(dag).toContain(
      '"sourceSha": "7007be2a8cfaad147d3846267040cef52dc82793"',
    );
    expect(dag).toContain(
      '"upstreamReviewedSourceSha": "2542f8da508792f39abe7dea5a5686ade5c9e5a3"',
    );
    expect(dag).toContain(
      '"value": "65a98ccdb43c4adb541d0e21c1cc54b7bfb618755dc37f679414e3dba7a48524"',
    );
    expect(rollback).toContain(
      "65a98ccdb43c4adb541d0e21c1cc54b7bfb618755dc37f679414e3dba7a48524",
    );
  });

  it("registers the API and both admin destinations in the shared assembly", () => {
    const server = readFileSync(resolve("server/index.ts"), "utf8");
    const client = readFileSync(
      resolve("client/src/research/adminx-section.tsx"),
      "utf8",
    );

    expect(server.match(/registerInventoryLotAdminApi\(/g)).toHaveLength(1);
    expect(server.indexOf("registerInventoryLotAdminApi(")).toBeLessThan(
      server.indexOf("registerFoundingActivationApi("),
    );
    expect(client).toContain('path="/admin/research/inventory/lots"');
    expect(client).toContain('path="/admin/research/inventory/coas"');
    expect(client).toContain('aria-label="Inventory administration"');
    expect(client).toContain(
      '<Redirect to="/admin/research/inventory/lots" />',
    );
  });

  it("reads one atomic server-only projection", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: projection, error: null });
    const reader = new SupabaseProductCommerceReadinessReader({ rpc } as never);

    await expect(reader.getForVariant(projection.variantId)).resolves.toEqual(
      projection,
    );
    expect(rpc).toHaveBeenCalledWith(
      "research_inventory_product_variant_projection",
      { p_variant_id: projection.variantId },
    );
  });

  it("preserves a complete authoritative active price projection", async () => {
    const priced = {
      ...projection,
      activePrice: {
        amountCents: 14_900,
        currency: "USD",
        effectiveAt: "2026-08-01T00:00:00Z",
        version: 3,
      },
    };
    const reader = new SupabaseProductCommerceReadinessReader({
      rpc: vi.fn().mockResolvedValue({ data: priced, error: null }),
    } as never);

    await expect(reader.getForVariant(projection.variantId)).resolves.toEqual(priced);
  });

  it("fails closed for malformed projection or persistence errors", async () => {
    const malformed = new SupabaseProductCommerceReadinessReader({
      rpc: vi.fn().mockResolvedValue({
        data: { ...projection, activePrice: { amountCents: 1 } },
        error: null,
      }),
    } as never);
    await expect(malformed.getForVariant(projection.variantId)).rejects.toMatchObject({
      code: "inventory_product_projection_evidence_invalid",
    });

    const coercivePrice = new SupabaseProductCommerceReadinessReader({
      rpc: vi.fn().mockResolvedValue({
        data: {
          ...projection,
          activePrice: {
            amountCents: "14900",
            currency: "USD",
            effectiveAt: "2026-08-01T00:00:00Z",
            version: 1,
          },
        },
        error: null,
      }),
    } as never);
    await expect(coercivePrice.getForVariant(projection.variantId)).rejects.toMatchObject({
      code: "inventory_product_projection_evidence_invalid",
    });

    const absent = new SupabaseProductCommerceReadinessReader({
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as never);
    await expect(absent.getForVariant(projection.variantId)).resolves.toBeNull();

    const unavailable = new SupabaseProductCommerceReadinessReader({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "missing" },
      }),
    } as never);
    await expect(
      unavailable.getForVariant(projection.variantId),
    ).rejects.toThrow("inventory_product_control_unavailable");
  });

  it("registers stable unavailable dependencies without touching Supabase", async () => {
    const admin = vi.fn();
    const dependencies = buildInventoryLotAdminIntegrationDependencies({
      configured: () => false,
      admin,
    });

    await expect(dependencies.inventory.listLots()).rejects.toThrow(
      "inventory_admin_not_configured",
    );
    await expect(dependencies.quality.listDocuments()).rejects.toThrow(
      "inventory_admin_not_configured",
    );
    expect(admin).not.toHaveBeenCalled();
  });
});
