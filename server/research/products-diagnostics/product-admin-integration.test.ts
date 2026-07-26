import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ADMIN_ROUTES } from "../../../client/src/research/lib/routes";
import { registerProductAdminApi } from "./product-admin-routes";
import { buildProductAdminProductionService } from "./product-admin-integration";

function appForUnavailableDependencies() {
  const app = express();
  app.use(express.json());
  registerProductAdminApi(app, {
    service: buildProductAdminProductionService({
      configured: () => false,
      admin: vi.fn(() => {
        throw new Error("admin client must stay lazy");
      }),
    }),
    requireAdmin(req, _res, next) {
      (req as typeof req & { adminEmail?: string }).adminEmail =
        "admin@example.invalid";
      next();
    },
  });
  return app;
}

describe("Product Control shared integration", () => {
  it("registers stable fail-closed routes without constructing missing dependencies", async () => {
    const app = appForUnavailableDependencies();

    const read = await request(app).get("/api/admin/research/products");
    expect(read.status).toBe(503);
    expect(read.headers["cache-control"]).toBe("no-store");
    expect(read.body).toEqual({
      ok: false,
      code: "persistence_failed",
      message: "The product update could not be saved.",
    });

    const write = await request(app)
      .post("/api/admin/research/products")
      .set("Idempotency-Key", "integration-test")
      .send({});
    expect(write.status).toBe(503);
    expect(write.body).not.toHaveProperty("error");
    expect(JSON.stringify(write.body)).not.toContain(
      "product_admin_not_configured",
    );
  });

  it("wires the production API before the API and SPA fallbacks", () => {
    const serverSource = readFileSync(
      resolve(__dirname, "../../index.ts"),
      "utf8",
    );
    const registration = serverSource.indexOf(
      "registerProductAdminApi(app, {",
    );
    const apiFallback = serverSource.indexOf('app.use("/api/{*rest}"');
    const productionSpa = serverSource.indexOf("serveStatic(app)");
    const developmentSpa = serverSource.indexOf("setupVite(");

    expect(registration).toBeGreaterThan(-1);
    expect(registration).toBeLessThan(apiFallback);
    expect(registration).toBeLessThan(productionSpa);
    expect(registration).toBeLessThan(developmentSpa);
    expect(serverSource).toContain("buildProductAdminProductionService()");
    expect(serverSource).toContain("requireAdmin: requireSupabaseAdmin");
  });

  it("preserves exact client route and grouped navigation parity", () => {
    const routeSource = readFileSync(
      resolve(__dirname, "../../../client/src/research/adminx-section.tsx"),
      "utf8",
    );
    const shellSource = readFileSync(
      resolve(__dirname, "../../../client/src/research/ui/shells.tsx"),
      "utf8",
    );

    expect(ADMIN_ROUTES.products).toBe("/admin/research/products");
    expect(routeSource).toContain(
      '<Route path="/admin/research/products">{() => <S><ProductsAdmin /></S>}</Route>',
    );
    expect(routeSource).toContain(
      '<Route path="/admin/research/products/:id">{() => <S><ProductAdminDetail /></S>}</Route>',
    );
    expect(shellSource).toContain(
      '{ href: ADMIN_ROUTES.products, label: "Products" }',
    );
  });

  it("pins the exact media bucket posture and canonical migration checksum", () => {
    const repositoryRoot = resolve(__dirname, "../../..");
    const migrationPath =
      "supabase/migrations/20260726143000_research_product_control_center.sql";
    const expectedChecksum =
      "b1589eb24405d4700206d25541b647479afee34c2cd05422da70df2179876203";
    const verifier = readFileSync(
      resolve(repositoryRoot, "supabase/verify-research-product-control-center.sql"),
      "utf8",
    );
    const rollback = readFileSync(
      resolve(
        repositoryRoot,
        "supabase/production/research-product-control-center-rollback-notes.md",
      ),
      "utf8",
    );
    const handoff = readFileSync(
      resolve(repositoryRoot, "docs/coordination/WEBSITE_2_HANDOFF.md"),
      "utf8",
    );
    const privilegeHardening = readFileSync(
      resolve(
        repositoryRoot,
        "supabase/migrations/20260726214500_research_product_control_center_privilege_hardening.sql",
      ),
      "utf8",
    );
    const migrationBlob = execFileSync(
      "git",
      ["show", `HEAD:${migrationPath}`],
      { cwd: repositoryRoot },
    );
    const actualChecksum = createHash("sha256")
      .update(migrationBlob)
      .digest("hex");

    expect(verifier).toContain("file_size_limit = 10485760");
    expect(verifier).toContain("cardinality(allowed_mime_types) = 3");
    expect(verifier).toContain(
      "allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]",
    );
    expect(verifier).toContain(
      "allowed_mime_types <@ array['image/jpeg','image/png','image/webp']::text[]",
    );
    expect(actualChecksum).toBe(expectedChecksum);
    expect(rollback).toContain(expectedChecksum);
    expect(handoff).toContain(expectedChecksum);
    expect(privilegeHardening).toContain(
      "revoke truncate, references, trigger on table public.%I from service_role",
    );
    for (const tableName of [
      "research_products",
      "research_product_facts",
      "research_product_goals",
      "research_product_guide_links",
      "research_product_prohibited_claims",
      "research_product_open_questions",
      "research_supplement_candidates",
      "research_product_content",
      "research_product_variants",
      "research_product_prices",
      "research_product_media",
      "research_product_admin_audit",
    ]) {
      expect(privilegeHardening).toContain(`'${tableName}'`);
    }
  });
});
