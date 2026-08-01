import { describe, expect, it } from "vitest";
import { isPrelaunchRole, PRELAUNCH_ROLES } from "./prelaunch";
import { CARE_ROLES, hasCarePermission, CARE_PERMISSIONS } from "../care/contracts";
import {
  findConfidentialOperatingFields,
  hasOperatingPermission,
  isConfidentialOperatingKey,
  isOperatingDeniedCapability,
  isOperatingGrowthPrincipal,
  isOperatingPermission,
  OPERATING_DENIED_CAPABILITIES,
  OPERATING_GROWTH_ROLE,
  OPERATING_PERMISSION_CAPABILITY,
  OPERATING_PERMISSIONS,
  OPERATING_ROLE_PERMISSIONS,
  OPERATING_SURFACE_POLICY,
  operatingSurfaceDecision,
  redactOperatingPayload,
} from "./operating-role";

const kris = { subjectId: "subject-1", roles: [OPERATING_GROWTH_ROLE] };

describe("operating and growth role: the granted set is closed and minimal", () => {
  it("grants exactly the five authorized permissions and nothing else", () => {
    expect(OPERATING_ROLE_PERMISSIONS[OPERATING_GROWTH_ROLE]).toEqual([
      "operating:partner_pipeline_read",
      "operating:partner_workflow",
      "operating:organization_pipeline_read",
      "operating:growth_kpis_read",
      "operating:operating_kpis_read",
    ]);
    expect(OPERATING_PERMISSIONS).toHaveLength(5);
  });

  it("allows each granted permission for the role", () => {
    for (const permission of OPERATING_PERMISSIONS) {
      expect(hasOperatingPermission(kris, permission)).toBe(true);
    }
  });

  it("refuses a permission string that is not in the closed set", () => {
    for (const attempt of [
      "operating:price_approve",
      "operating:*",
      "*",
      "admin",
      "care:administer",
      "",
      null,
      undefined,
      42,
      { toString: () => "operating:partner_workflow" },
    ]) {
      expect(hasOperatingPermission(kris, attempt)).toBe(false);
    }
  });

  it("grants nothing to a principal that does not carry the role", () => {
    for (const roles of [[], ["super_admin"], ["clinical_admin"], ["research_admin"]]) {
      for (const permission of OPERATING_PERMISSIONS) {
        expect(hasOperatingPermission({ roles }, permission)).toBe(false);
      }
    }
  });

  it("does not widen when the principal also claims an elevated role", () => {
    // The module is not an authority for super_admin, so a co-claimed name
    // adds nothing here. It also must not subtract: the operating permissions
    // still resolve from the operating list alone.
    const both = { subjectId: "s", roles: [OPERATING_GROWTH_ROLE, "super_admin"] };
    expect(hasOperatingPermission(both, "operating:partner_workflow")).toBe(true);
    expect(hasOperatingPermission(both, "care:administer")).toBe(false);
    expect(hasOperatingPermission(both, "price:approve")).toBe(false);
  });

  it("treats a non array roles value as no roles", () => {
    expect(isOperatingGrowthPrincipal({ roles: undefined })).toBe(false);
    expect(
      isOperatingGrowthPrincipal({ roles: "operating_growth" as unknown as string[] }),
    ).toBe(false);
  });
});

describe("operating and growth role: the refused set is named and disjoint", () => {
  it("names every capability the role must not hold", () => {
    expect([...OPERATING_DENIED_CAPABILITIES]).toEqual([
      "price_approval",
      "product_approval",
      "product_image_approval",
      "super_admin_surface",
      "user_and_role_administration",
      "database_migration",
      "environment_configuration",
      "care_clinical_data",
      "patient_data",
      "supplier_cost",
      "margin",
      "audit_search_other_actors",
    ]);
  });

  it("maps no granted permission onto a refused capability", () => {
    // The structural invariant. A future permission cannot be added that
    // quietly reaches a refused surface without this failing.
    for (const permission of OPERATING_PERMISSIONS) {
      const capability = OPERATING_PERMISSION_CAPABILITY[permission];
      expect(isOperatingDeniedCapability(capability)).toBe(false);
    }
  });

  it("covers every granted permission in the capability map", () => {
    expect(Object.keys(OPERATING_PERMISSION_CAPABILITY).sort()).toEqual(
      [...OPERATING_PERMISSIONS].sort(),
    );
  });
});

describe("operating and growth role: it is not a prelaunch role", () => {
  it("stays outside PRELAUNCH_ROLES so the bare prelaunch guard cannot admit it", () => {
    // server/research/prelaunch.ts buildPrelaunchGuard treats an omitted
    // allowedRoles as "any prelaunch role passes", and registerPrelaunchApi
    // mounts one such bare guard. Membership in PRELAUNCH_ROLES would widen
    // that surface by default, which is the escalation shape this role exists
    // to avoid.
    expect(isPrelaunchRole(OPERATING_GROWTH_ROLE)).toBe(false);
    expect(PRELAUNCH_ROLES as readonly string[]).not.toContain(
      OPERATING_GROWTH_ROLE,
    );
  });
});

describe("operating and growth role: it is not a Care role", () => {
  it("carries no Care permission at all", () => {
    for (const permission of CARE_PERMISSIONS) {
      expect(hasCarePermission({ roles: [OPERATING_GROWTH_ROLE] }, permission)).toBe(
        false,
      );
    }
  });

  it("is not one of the Care roles", () => {
    expect(CARE_ROLES as readonly string[]).not.toContain(OPERATING_GROWTH_ROLE);
  });
});

describe("operating and growth role: confidential commercial fields", () => {
  it("flags wholesale cost, margin, supplier, and vendor keys in every casing", () => {
    for (const key of [
      "wholesaleSourceCostCents",
      "wholesale_source_cost_cents",
      "WholesaleSourceCost",
      "unitCostCents",
      "landed_cost",
      "marginCents",
      "grossMarginPct",
      "markupMultiplier",
      "supplierSource",
      "supplier_name",
      "vendorId",
      "cogsCents",
    ]) {
      expect(isConfidentialOperatingKey(key)).toBe(true);
    }
  });

  it("leaves legitimate operating fields alone", () => {
    for (const key of [
      "orgId",
      "leadCount",
      "conversionCount",
      "commissionCents",
      "expenseCents",
      "customerAmountCents",
      "stage",
      "partnerId",
    ]) {
      expect(isConfidentialOperatingKey(key)).toBe(false);
    }
  });

  it("removes confidential fields at every depth without inventing a value", () => {
    const payload = {
      orgId: "org-1",
      leadCount: 12,
      wholesaleSourceCostCents: 4200,
      partners: [
        {
          partnerId: "prt-1",
          commissionCents: 900,
          marginCents: 3100,
          product: { name: "Item", supplierSource: "Apex", unitCostCents: 1 },
        },
      ],
    };
    const redacted = redactOperatingPayload(payload);
    expect(findConfidentialOperatingFields(redacted)).toEqual([]);
    expect(redacted).toEqual({
      orgId: "org-1",
      leadCount: 12,
      partners: [
        {
          partnerId: "prt-1",
          commissionCents: 900,
          product: { name: "Item" },
        },
      ],
    });
    // Missing stays missing. The key is absent, not present with a zero or a
    // placeholder amount standing in for the value that was removed.
    expect(Object.keys(redacted)).not.toContain("wholesaleSourceCostCents");
    expect(
      (redacted as Record<string, unknown>).wholesaleSourceCostCents,
    ).toBeUndefined();
    expect("wholesaleSourceCostCents" in redacted).toBe(false);
  });

  it("reports the dotted path of every confidential field it finds", () => {
    expect(
      findConfidentialOperatingFields({
        a: { marginCents: 1 },
        b: [{ supplierSource: "x" }],
      }),
    ).toEqual(["a.marginCents", "b[0].supplierSource"]);
  });
});

describe("operating and growth role: the surface policy", () => {
  it("resolves the price approval route as refused", () => {
    expect(
      operatingSurfaceDecision(
        "POST",
        "/api/admin/research/products/:productId/prices/:priceId/approve",
      ),
    ).toEqual({ kind: "deny", capability: "price_approval" });
  });

  it("names a real capability on every entry and never allows a refused one", () => {
    for (const entry of OPERATING_SURFACE_POLICY) {
      if (entry.decision.kind === "allow") {
        expect(isOperatingPermission(entry.decision.permission)).toBe(true);
      } else {
        expect(isOperatingDeniedCapability(entry.decision.capability)).toBe(true);
      }
    }
  });

  it("covers each refused capability with at least one real surface", () => {
    for (const capability of OPERATING_DENIED_CAPABILITIES) {
      const covered = OPERATING_SURFACE_POLICY.some(
        (entry) =>
          entry.decision.kind === "deny" && entry.decision.capability === capability,
      );
      expect(covered, `no surface covers ${capability}`).toBe(true);
    }
  });

  it("returns null for a surface it has no opinion about", () => {
    expect(operatingSurfaceDecision("GET", "/api/health")).toBeNull();
  });
});
