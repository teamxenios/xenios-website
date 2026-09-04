import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(__dirname, path), "utf8").replace(/\r\n/gu, "\n");
}

// Removing the classifier, the boundary registration, or the mount order
// must break one of these assertions; they are the regression tripwire the
// founder asked for ("removing the classifier or route boundary breaks a
// regression test").
describe("Care ↔ generic LOI domain-integrity wiring", () => {
  it("has exactly one Care classifier: the pure module, consumed by the projection, the writer and the boundary", () => {
    const classifier = source("manual-access-classifier.ts");
    const admin = source("manual-access-admin.ts");
    const writer = source("manual-access.ts");
    const boundary = source("loi-boundary.ts");

    expect(classifier).toContain("export function isCareManualAccessOperationsRow(row: LoiRow): boolean {");
    expect(classifier).toContain('export const CARE_ACCESS_BUSINESS_NAME = "Xenios Care access request";');
    expect(classifier).toContain('export const CARE_ACCESS_ROLE_PREFIX = "care_access:";');
    expect(classifier).toContain('export const CARE_ACCESS_SCHEMA = "xenios_care_manual_access_v1";');

    // The projection no longer defines its own markers or predicate.
    expect(admin).toContain('} from "./manual-access-classifier";');
    expect(admin).not.toMatch(/^const CARE_ACCESS_BUSINESS_NAME/mu);
    expect(admin).not.toMatch(/^const CARE_ACCESS_SCHEMA/mu);
    expect(admin).not.toMatch(/^(export )?function isCareManualAccessOperationsRow/mu);
    expect(admin).not.toMatch(/^function rawPayloadHasCareSchema/mu);
    expect(admin).not.toContain('"care_access:"');

    // The public writer stamps the same constants it is later recognised by.
    expect(writer).toContain('} from "./manual-access-classifier";');
    expect(writer).toContain("business_name: CARE_ACCESS_BUSINESS_NAME,");
    expect(writer).toContain("role: `${CARE_ACCESS_ROLE_PREFIX}${request.careGoal}`,");
    expect(writer).toContain("schema: CARE_ACCESS_SCHEMA,");
    expect(writer).not.toContain('"Xenios Care access request"');

    // The boundary consumes the same module.
    expect(boundary).toContain('} from "./manual-access-classifier";');
    expect(boundary).toContain("isCareManualAccessOperationsRow(row)");
  });

  it("keeps the classifier a leaf module (type-only store import, shared constants, nothing else)", () => {
    const classifier = source("manual-access-classifier.ts");
    const imports = classifier.split("\n").filter((line) => line.startsWith("import "));
    expect(imports).toEqual([
      'import type { LoiRow } from "../supabase-store";',
      'import { CARE_MANUAL_ACCESS_SOURCE_PAGE } from "@shared/care/manual-access";',
    ]);
  });

  it("mounts the boundary from the Care registrar behind the same canonical admin guard as the Care admin API", () => {
    const careIndex = source("index.ts");
    expect(careIndex).toContain('from "./loi-boundary";');
    expect(careIndex).toContain("loiBoundaryDependencies?: CareLoiBoundaryDependencies;");
    expect(careIndex).toContain(
      "  registerCareLoiBoundary(\n    app,\n    options.manualAccessAdminGuard ?? requireSupabaseAdmin,\n    options.loiBoundaryDependencies ?? buildCareLoiBoundaryProductionDependencies(),\n  );",
    );
  });

  it("is mounted before the generic routes so it can answer or refuse first", () => {
    const serverIndex = source("../index.ts");
    const careMount = serverIndex.indexOf("registerCareApi(app, careAccess)");
    const genericMount = serverIndex.indexOf("await registerRoutes(httpServer, app)");
    expect(careMount).toBeGreaterThan(0);
    expect(genericMount).toBeGreaterThan(careMount);
  });

  it("shadows the generic doors with prefix middleware only, never a second route registration (census stays 1:1)", () => {
    const boundary = source("loi-boundary.ts");
    expect(boundary).not.toMatch(/app\.(get|post|put|patch|delete|all)\(/u);
    expect(boundary).toContain('loi: "/api/admin/loi"');
    expect(boundary).toContain('export: "/api/admin/export"');
    expect(boundary).toContain('analytics: "/api/admin/analytics"');
    expect((boundary.match(/^\s*app\.use\(/gmu) ?? []).length).toBe(3);
  });

  it("leaves the protected generic routes and store untouched (the boundary is a Care-domain seam)", () => {
    const routes = source("../routes.ts");
    const store = source("../supabase-store.ts");
    expect(routes).not.toContain("manual-access-classifier");
    expect(routes).not.toContain("loi-boundary");
    expect(store).not.toContain("manual-access-classifier");
    expect(store).not.toContain("isCareManualAccessOperationsRow");
  });
});
