import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CARE_MANUAL_ACCESS_ADMIN_LIST_PATH } from "@shared/care/manual-access-admin";

function source(path: string): string {
  return readFileSync(resolve(__dirname, path), "utf8");
}

describe("Care access request admin reliability wiring", () => {
  it("registers the admin doors as literal paths that equal the shared client constant (census-visible)", () => {
    const registrar = source("manual-access-admin.ts");
    expect(CARE_MANUAL_ACCESS_ADMIN_LIST_PATH).toBe("/api/admin/care/access-requests");
    expect(registrar).toContain("\"/api/admin/care/access-requests\",");
    expect(registrar).toContain("\"/api/admin/care/access-requests/:requestId\",");
    expect(registrar).toContain("\"/api/admin/care/access-requests/:requestId/status\",");
  });

  it("mounts the protected Care admin API from the same Care registrar as the public write path", () => {
    const careIndex = source("index.ts");
    expect(careIndex).toContain("registerCareManualAccessApi(app, manualAccess)");
    expect(careIndex).toContain("registerCareManualAccessAdminApi(");
    expect(careIndex).toContain(
      "options.manualAccessAdminGuard ?? requireSupabaseAdmin",
    );
    expect(careIndex).toContain(
      "buildCareManualAccessAdminProductionDependencies()",
    );
  });

  it("keeps the admin page in the canonical route manifest and mounted admin router", () => {
    const routes = source("../../client/src/research/lib/routes.ts");
    const router = source("../../client/src/research/adminx-section.tsx");
    const shell = source("../../client/src/research/ui/shells.tsx");

    expect(routes).toContain(
      'careRequests: "/admin/research/care-requests"',
    );
    expect(router).toContain(
      'import("./pages/adminx/CareAccessRequests")',
    );
    expect(router).toContain(
      '<Route path="/admin/research/care-requests">',
    );
    expect(shell).toContain(
      '{ href: ADMIN_ROUTES.careRequests, label: "Care requests" }',
    );
  });

  it("binds the UI to the dedicated admin-only API instead of the generic LOI endpoint", () => {
    const adapter = source(
      "../../client/src/research/adapters/careAdmin.ts",
    );
    const page = source(
      "../../client/src/research/pages/adminx/CareAccessRequests.tsx",
    );

    expect(adapter).toContain("CARE_MANUAL_ACCESS_ADMIN_LIST_PATH");
    expect(adapter).toContain("careManualAccessAdminStatusPath");
    expect(adapter).not.toContain("/api/admin/loi");
    expect(page).toContain("Every successfully saved public Care request");
    expect(page).toContain("notification or data-quality problems");
    expect(page).toContain("Do not place");
  });
});
