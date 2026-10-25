import { describe, expect, it } from "vitest";
import { isPrelaunchRole, PRELAUNCH_ROLES } from "./prelaunch";
import { CARE_ROLES, hasCarePermission, CARE_PERMISSIONS } from "../care/contracts";
import {
  findConfidentialOperatingFields,
  hasOperatingPermission,
  isConfidentialOperatingKey,
  isOperatingDeniedCapability,
  isOperatingGrowthPrincipal,
  isOperatingLivePermission,
  isOperatingPermission,
  OPERATING_CAPABILITIES_WITHOUT_REGISTERED_SURFACE,
  OPERATING_DENIED_CAPABILITIES,
  OPERATING_GROWTH_ROLE,
  OPERATING_LIVE_PERMISSIONS,
  OPERATING_PERMISSION_CAPABILITY,
  OPERATING_PERMISSIONS,
  OPERATING_PLANNED_PERMISSIONS,
  OPERATING_PLANNED_SURFACES,
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

describe("operating and growth role: redaction does not trust the prototype", () => {
  // The first version of this walker only descended into objects whose
  // prototype was Object.prototype or null. Everything else fell through and
  // was returned unredacted. A repository row, an ORM entity, or any value
  // built by a constructor is exactly what a handler passes to sendOperatingJson,
  // so the redactor failed open on the shape it was most likely to be handed.
  class PartnerRow {
    partnerId = "prt-1";
    commissionCents = 900;
    wholesaleSourceCostCents = 4200;
    grossMarginPct = 61.2;
  }

  it("redacts a class instance", () => {
    const row = new PartnerRow();
    expect(Object.getPrototypeOf(row)).not.toBe(Object.prototype);
    expect(findConfidentialOperatingFields(row).sort()).toEqual([
      "grossMarginPct",
      "wholesaleSourceCostCents",
    ]);
    const redacted = redactOperatingPayload(row);
    expect(findConfidentialOperatingFields(redacted)).toEqual([]);
    expect(redacted).toEqual({ partnerId: "prt-1", commissionCents: 900 });
    const serialised = JSON.stringify(redacted);
    for (const leak of ["wholesale", "4200", "Margin", "61.2"]) {
      expect(serialised).not.toContain(leak);
    }
  });

  it("redacts a class instance nested inside a plain payload", () => {
    const payload = { orgId: "org-1", partners: [new PartnerRow()] };
    expect(findConfidentialOperatingFields(payload)).toEqual([
      "partners[0].wholesaleSourceCostCents",
      "partners[0].grossMarginPct",
    ]);
    const redacted = redactOperatingPayload(payload);
    expect(findConfidentialOperatingFields(redacted)).toEqual([]);
    expect(JSON.stringify(redacted)).not.toContain("4200");
  });

  it("redacts a null prototype object, at the top level and nested", () => {
    // A bare null prototype object was already handled by the old check, so
    // this half is a regression guard rather than a proof. The nested half is
    // the proof: under the old check the class instance around it was returned
    // whole, so the null prototype object inside it was never even reached.
    const bare = Object.create(null) as Record<string, unknown>;
    bare.partnerId = "prt-2";
    bare.unitCostCents = 4242;
    expect(findConfidentialOperatingFields(bare)).toEqual(["unitCostCents"]);
    const redacted = redactOperatingPayload(bare);
    expect(findConfidentialOperatingFields(redacted)).toEqual([]);
    expect(JSON.stringify(redacted)).toBe('{"partnerId":"prt-2"}');

    const nested = new PartnerRow() as unknown as Record<string, unknown>;
    nested.pricing = bare;
    expect(findConfidentialOperatingFields(nested)).toContain(
      "pricing.unitCostCents",
    );
    expect(
      findConfidentialOperatingFields(redactOperatingPayload(nested)),
    ).toEqual([]);
    expect(JSON.stringify(redactOperatingPayload(nested))).not.toContain("4242");
  });

  it("redacts an object whose prototype was replaced after construction", () => {
    const tampered = { partnerId: "prt-3", supplierSource: "Apex" };
    Object.setPrototypeOf(tampered, { toString: () => "row" });
    const redacted = redactOperatingPayload(tampered);
    expect(findConfidentialOperatingFields(redacted)).toEqual([]);
    expect(JSON.stringify(redacted)).not.toContain("Apex");
  });

  it("catches a confidential own getter from its name, without invoking it", () => {
    let reads = 0;
    const row: Record<string, unknown> = { partnerId: "prt-4" };
    Object.defineProperty(row, "landedCostCents", {
      enumerable: true,
      get() {
        reads += 1;
        return 1234;
      },
    });
    expect(findConfidentialOperatingFields(row)).toEqual(["landedCostCents"]);
    const redacted = redactOperatingPayload(row);
    expect(reads).toBe(0);
    expect(JSON.stringify(redacted)).toBe('{"partnerId":"prt-4"}');
  });

  it("leaves a value that serialises to a scalar intact rather than emptying it", () => {
    // A Date has no own enumerable keys, so recursing would turn a timestamp
    // into {} while removing nothing. It carries no field to redact.
    const at = new Date("2026-08-01T00:00:00.000Z");
    const payload = { partnerId: "prt-5", reviewedAt: at, unitCostCents: 5 };
    expect(findConfidentialOperatingFields(payload)).toEqual(["unitCostCents"]);
    const redacted = redactOperatingPayload(payload) as Record<string, unknown>;
    expect(redacted.reviewedAt).toBe(at);
    expect(JSON.stringify(redacted)).toBe(
      '{"partnerId":"prt-5","reviewedAt":"2026-08-01T00:00:00.000Z"}',
    );
  });

  it("still returns primitives and null unchanged", () => {
    for (const value of ["text", 7, true, null, undefined]) {
      expect(redactOperatingPayload(value)).toBe(value);
      expect(findConfidentialOperatingFields(value)).toEqual([]);
    }
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

  it("covers each refused capability except the two named as pre-committed", () => {
    // Honest form. supplier_cost and margin have no route in this repository at
    // all, so their refusal is written down rather than demonstrated. Naming
    // that in a constant, and asserting the constant matches the computed set,
    // means a reviewer is never told a refusal was exercised when it was not,
    // and a later margin route forces this list to be revisited.
    const preCommitted = new Set<string>(
      OPERATING_CAPABILITIES_WITHOUT_REGISTERED_SURFACE,
    );
    const uncovered: string[] = [];
    for (const capability of OPERATING_DENIED_CAPABILITIES) {
      const covered = OPERATING_SURFACE_POLICY.some(
        (entry) =>
          entry.decision.kind === "deny" && entry.decision.capability === capability,
      );
      if (!covered) uncovered.push(capability);
    }
    expect(uncovered.sort()).toEqual([...preCommitted].sort());
  });

  it("returns null for a surface it has no opinion about", () => {
    expect(operatingSurfaceDecision("GET", "/api/health")).toBeNull();
  });

  it("returns null for a planned surface, so it authorizes nothing", () => {
    for (const planned of OPERATING_PLANNED_SURFACES) {
      expect(
        operatingSurfaceDecision(planned.method, planned.surface),
        `${planned.method} ${planned.surface} resolved to a decision`,
      ).toBeNull();
    }
  });
});

describe("operating and growth role: live versus planned is a real distinction", () => {
  it("splits the five permissions into one live and four planned", () => {
    expect([...OPERATING_LIVE_PERMISSIONS]).toEqual(["operating:partner_workflow"]);
    expect([...OPERATING_PLANNED_PERMISSIONS]).toEqual([
      "operating:partner_pipeline_read",
      "operating:organization_pipeline_read",
      "operating:growth_kpis_read",
      "operating:operating_kpis_read",
    ]);
    expect(
      [...OPERATING_LIVE_PERMISSIONS, ...OPERATING_PLANNED_PERMISSIONS].sort(),
    ).toEqual([...OPERATING_PERMISSIONS].sort());
  });

  it("recognizes only a live permission as live", () => {
    expect(isOperatingLivePermission("operating:partner_workflow")).toBe(true);
    for (const permission of OPERATING_PLANNED_PERMISSIONS) {
      expect(isOperatingLivePermission(permission)).toBe(false);
    }
    for (const attempt of ["", "*", "admin", null, undefined, 42, {}]) {
      expect(isOperatingLivePermission(attempt)).toBe(false);
    }
  });

  it("allows nothing in the decision table for a planned permission", () => {
    // The type system already refuses this: OperatingSurfaceDecision's allow arm
    // is typed OperatingLivePermission, so writing an allow for a planned
    // permission does not compile. This asserts the shipped table agrees.
    for (const entry of OPERATING_SURFACE_POLICY) {
      if (entry.decision.kind !== "allow") continue;
      expect(isOperatingLivePermission(entry.decision.permission)).toBe(true);
    }
  });

  it("keeps a planned surface free of anything shaped like an authorization", () => {
    for (const planned of OPERATING_PLANNED_SURFACES) {
      expect(Object.keys(planned).sort()).toEqual(["method", "note", "surface"]);
      expect("decision" in planned).toBe(false);
      expect("permission" in planned).toBe(false);
      expect("capability" in planned).toBe(false);
    }
  });
});
