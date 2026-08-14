import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildDomainRouteEvidence,
  classifyDomains,
  domainRouteCsv,
  extractClientRoutesFromSource,
  extractFeatureFlagSignals,
  extractGuardSignals,
  extractPersistenceSignals,
  extractPrivateFieldSignals,
  validateDomainRouteEvidence,
  type DomainAuditEvidence,
  type DomainRouteEvidence,
} from "../../scripts/research/generate-catalog-commerce-ops-audit.ts";

const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function route(overrides: Partial<DomainRouteEvidence> = {}): DomainRouteEvidence {
  return {
    method: "GET",
    path: "/api/research/catalog",
    file: "server/research/catalog/routes.ts",
    line: 10,
    domains: ["catalog"],
    guardSignals: ["requireActiveMember"],
    featureFlags: [],
    persistenceSignals: [],
    guardTrace: "file_signal_present",
    ...overrides,
  };
}

describe("catalog/commerce/operations forensic audit scanner", () => {
  it("classifies overlapping systems without pretending they are independent truths", () => {
    expect(classifyDomains("server/research/buyer-commerce/product-control-catalog.ts")).toEqual([
      "catalog",
      "commerce",
      "organization",
    ]);
    expect(classifyDomains("server/research/admin-crm-supplier-operations/routes.ts")).toEqual([
      "supplier",
      "admin",
    ]);
    expect(classifyDomains("client/src/research/pages/partners/Commissions.tsx")).toEqual([
      "affiliate",
    ]);
  });

  it("extracts route, guard, flag and persistence evidence from source", () => {
    const source = `
      const TABLE = "research_orders";
      const FLAG = "RESEARCH_COMMERCE_ENABLED";
      app.post("/api/research/orders", requireActiveMember, handler);
      db.from("research_order_lines");
    `;
    expect(extractGuardSignals(source)).toContain("requireActiveMember");
    expect(extractFeatureFlagSignals(source)).toEqual(["RESEARCH_COMMERCE_ENABLED"]);
    expect(extractPersistenceSignals(source)).toEqual(["research_order_lines", "research_orders"]);
    expect(
      buildDomainRouteEvidence(
        { method: "POST", path: "/api/research/orders", file: "server/research/commerce/routes.ts", line: 4 },
        source,
      ),
    ).toMatchObject({
      domains: ["commerce"],
      guardTrace: "file_signal_present",
    });
  });

  it("enumerates the current catalog, partner and admin client route families", () => {
    const sectionFile = "client/src/research/section.tsx";
    const adminFile = "client/src/research/adminx-section.tsx";
    const sectionRoutes = extractClientRoutesFromSource(
      readFileSync(resolve(repoRoot, sectionFile), "utf8"),
      sectionFile,
    );
    const adminRoutes = extractClientRoutesFromSource(
      readFileSync(resolve(repoRoot, adminFile), "utf8"),
      adminFile,
    );
    expect(sectionRoutes.some((entry) => entry.path === "/research/member/catalog")).toBe(true);
    expect(sectionRoutes.some((entry) => entry.path === "/research/member/kris-catalog")).toBe(true);
    expect(sectionRoutes.some((entry) => entry.path === "/research/partners/dashboard")).toBe(true);
    expect(adminRoutes.some((entry) => entry.path === "/admin/research/products")).toBe(true);
    expect(adminRoutes.find((entry) => entry.path === "/admin/research/inventory")?.component).toBe(
      "Redirect:/admin/research/inventory/lots",
    );
    expect(sectionRoutes.some((entry) => entry.path.startsWith("/research/supplier"))).toBe(false);
  });

  it("negative control: a planted duplicate domain route fails validation", () => {
    const issues = validateDomainRouteEvidence([
      route(),
      route({ file: "server/research/legacy-catalog/routes.ts", line: 99 }),
    ]);
    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "DUPLICATE_DOMAIN_ROUTE", severity: "error" })]),
    );
  });

  it("negative control: a planted unguarded commerce mutation demands an authorization trace", () => {
    const issues = validateDomainRouteEvidence([
      route({
        method: "POST",
        path: "/api/research/commerce/orders",
        guardSignals: [],
        guardTrace: "parent_or_runtime_trace_required",
      }),
    ]);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MUTATION_GUARD_TRACE_REQUIRED", severity: "review" }),
      ]),
    );
  });

  it("negative control: a planted private supplier-cost field is detected", () => {
    const safe = `type CatalogDto = { productId: string; displayPriceCents: number };`;
    const poisoned = `${safe}\ntype PoisonedDto = { supplierCostCents: number; source_path: string };`;
    expect(extractPrivateFieldSignals(safe)).toEqual([]);
    expect(extractPrivateFieldSignals(poisoned)).toEqual(["source_path", "supplierCostCents"]);
  });

  it("serializes route evidence as stable RFC-4180-compatible CSV", () => {
    const evidence = {
      scan: {
        domainApiRoutes: [route({ path: "/api/research/catalog?q=\"all\"" })],
        clientRoutes: [{
          path: "/research/member/catalog",
          component: "MemberFullCatalog",
          file: "client/src/research/section.tsx",
          line: 1,
          domains: ["catalog"],
          wrapperSignals: ["active-member-shell"],
        }],
      },
    } as unknown as DomainAuditEvidence;
    const csv = domainRouteCsv(evidence);
    expect(csv).toContain('"/api/research/catalog?q=""all"""');
    expect(csv).toContain("client,catalog,,/research/member/catalog,MemberFullCatalog");
    expect(csv.endsWith("\n")).toBe(true);
  });
});
