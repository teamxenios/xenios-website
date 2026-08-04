import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  OPERATING_GROWTH_ROLE,
  OPERATING_LIVE_PERMISSIONS,
  OPERATING_PERMISSIONS,
  OPERATING_PLANNED_PERMISSIONS,
  OPERATING_SURFACE_POLICY,
  type OperatingPermission,
  type OperatingSurfacePolicyEntry,
} from "@shared/research/operating-role";
import {
  OPERATING_PRINCIPAL_LOCALS_KEY,
  readOperatingPrincipal,
  refuseOperatingRole,
  requireOperatingPermission,
  sendOperatingJson,
  type OperatingAccessDependencies,
  type OperatingPrincipal,
} from "./operating-access";

// ---------------------------------------------------------------------------
// The negative tests are the deliverable of this lane.
//
// Every refusal below asserts two things together: the status is 403, and the
// repository spy was never called. A guard that refuses after touching the
// repository has already leaked the read.
// ---------------------------------------------------------------------------

interface Harness {
  app: express.Express;
  repository: ReturnType<typeof vi.fn>;
  decisions: ReturnType<typeof vi.fn>;
  seenPrincipal: () => OperatingPrincipal | undefined;
}

function harness(
  mount: (app: express.Express, deps: OperatingAccessDependencies, repository: () => unknown) => void,
  principal: OperatingPrincipal | null = { subjectId: "kris-subject", roles: [OPERATING_GROWTH_ROLE] },
  overrides: Partial<OperatingAccessDependencies> = {},
): Harness {
  const repository = vi.fn(() => ({ ok: true, rows: [] }));
  const decisions = vi.fn(async () => undefined);
  let captured: OperatingPrincipal | undefined;
  const deps: OperatingAccessDependencies = {
    resolvePrincipal: vi.fn(async () => principal),
    recordAccessDecision: decisions,
    now: () => new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    const original = res.json.bind(res);
    res.json = ((body: unknown) => {
      captured = res.locals[OPERATING_PRINCIPAL_LOCALS_KEY] as OperatingPrincipal | undefined;
      return original(body);
    }) as typeof res.json;
    next();
  });
  mount(app, deps, repository);
  return { app, repository, decisions, seenPrincipal: () => captured };
}

/** Mounts one route per policy entry, guarded exactly as the policy says. */
function mountPolicySurface(entry: OperatingSurfacePolicyEntry) {
  return (
    app: express.Express,
    deps: OperatingAccessDependencies,
    repository: () => unknown,
  ) => {
    const guard =
      entry.decision.kind === "allow"
        ? requireOperatingPermission(entry.decision.permission, deps)
        : refuseOperatingRole(entry.decision.capability, deps);
    const handler = (_req: express.Request, res: express.Response) => {
      // A refused request must never reach this line.
      res.json({ ok: true, data: repository() });
    };
    const method = entry.method.toLowerCase() as "get" | "post" | "patch" | "delete";
    app[method](entry.surface, guard, handler);
  };
}

function concreteUrl(surface: string): string {
  return surface.replace(/:[A-Za-z0-9_]+/g, "id-1");
}

const deniedEntries = OPERATING_SURFACE_POLICY.filter(
  (entry) => entry.decision.kind === "deny",
);
const allowedEntries = OPERATING_SURFACE_POLICY.filter(
  (entry) => entry.decision.kind === "allow",
);

// ---------------------------------------------------------------------------
// 1. Every refused capability, refused, before any repository call
// ---------------------------------------------------------------------------

describe("the operating role is refused on every capability it must not hold", () => {
  for (const entry of deniedEntries) {
    const capability =
      entry.decision.kind === "deny" ? entry.decision.capability : "";
    it(`refuses ${capability} at ${entry.method} ${entry.surface} before any repository call`, async () => {
      const h = harness(mountPolicySurface(entry));
      const method = entry.method.toLowerCase() as "get" | "post" | "patch" | "delete";
      const response = await request(h.app)[method](concreteUrl(entry.surface)).send({});
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ ok: false, code: "operating_forbidden" });
      expect(h.repository).not.toHaveBeenCalled();
    });
  }

  it("cannot approve a price", async () => {
    const entry = deniedEntries.find(
      (candidate) =>
        candidate.decision.kind === "deny" &&
        candidate.decision.capability === "price_approval",
    )!;
    const h = harness(mountPolicySurface(entry));
    const response = await request(h.app)
      .post(concreteUrl(entry.surface))
      .set("Idempotency-Key", "key-1")
      .send({ amountCents: 9900, approve: true });
    expect(response.status).toBe(403);
    expect(h.repository).not.toHaveBeenCalled();
  });

  it("cannot approve a product or a product image", async () => {
    for (const entry of deniedEntries.filter(
      (candidate) =>
        candidate.decision.kind === "deny" &&
        (candidate.decision.capability === "product_approval" ||
          candidate.decision.capability === "product_image_approval"),
    )) {
      const h = harness(mountPolicySurface(entry));
      const method = entry.method.toLowerCase() as "post" | "patch";
      const response = await request(h.app)[method](concreteUrl(entry.surface)).send({});
      expect(response.status).toBe(403);
      expect(h.repository).not.toHaveBeenCalled();
    }
  });

  it("cannot administer users or roles", async () => {
    for (const entry of deniedEntries.filter(
      (candidate) =>
        candidate.decision.kind === "deny" &&
        candidate.decision.capability === "user_and_role_administration",
    )) {
      const h = harness(mountPolicySurface(entry));
      const method = entry.method.toLowerCase() as "get" | "post" | "delete";
      const response = await request(h.app)
        [method](concreteUrl(entry.surface))
        .send({ authUserId: "someone", role: "super_admin", reason: "self grant" });
      expect(response.status).toBe(403);
      expect(h.repository).not.toHaveBeenCalled();
    }
  });

  it("cannot reach a super admin surface or environment configuration", async () => {
    for (const entry of deniedEntries.filter(
      (candidate) =>
        candidate.decision.kind === "deny" &&
        (candidate.decision.capability === "super_admin_surface" ||
          candidate.decision.capability === "environment_configuration" ||
          candidate.decision.capability === "database_migration"),
    )) {
      const h = harness(mountPolicySurface(entry));
      const method = entry.method.toLowerCase() as "get" | "post";
      const response = await request(h.app)[method](concreteUrl(entry.surface)).send({});
      expect(response.status).toBe(403);
      expect(h.repository).not.toHaveBeenCalled();
    }
  });

  it("cannot read Care patient data or clinical data", async () => {
    for (const entry of deniedEntries.filter(
      (candidate) =>
        candidate.decision.kind === "deny" &&
        (candidate.decision.capability === "patient_data" ||
          candidate.decision.capability === "care_clinical_data"),
    )) {
      const h = harness(mountPolicySurface(entry));
      const response = await request(h.app).get(concreteUrl(entry.surface));
      expect(response.status).toBe(403);
      expect(h.repository).not.toHaveBeenCalled();
    }
  });

  it("cannot read supplier cost or margin", async () => {
    for (const entry of deniedEntries.filter(
      (candidate) =>
        candidate.decision.kind === "deny" &&
        (candidate.decision.capability === "supplier_cost" ||
          candidate.decision.capability === "margin"),
    )) {
      const h = harness(mountPolicySurface(entry));
      const response = await request(h.app).get(concreteUrl(entry.surface));
      expect(response.status).toBe(403);
      expect(h.repository).not.toHaveBeenCalled();
    }
  });

  it("cannot search the audit trail of other actors", async () => {
    const entry = deniedEntries.find(
      (candidate) =>
        candidate.decision.kind === "deny" &&
        candidate.decision.capability === "audit_search_other_actors",
    )!;
    const h = harness(mountPolicySurface(entry));
    const response = await request(h.app).get(
      `${concreteUrl(entry.surface)}?actorSubjectId=someone-else`,
    );
    expect(response.status).toBe(403);
    expect(h.repository).not.toHaveBeenCalled();
  });

  it("records the refused capability in the access decision", async () => {
    const entry = deniedEntries[0];
    const h = harness(mountPolicySurface(entry));
    const method = entry.method.toLowerCase() as "get" | "post" | "patch" | "delete";
    await request(h.app)[method](concreteUrl(entry.surface)).send({});
    expect(h.decisions).toHaveBeenCalledWith(
      expect.objectContaining({
        actorSubjectId: "kris-subject",
        outcome: "forbidden",
        capability:
          entry.decision.kind === "deny" ? entry.decision.capability : null,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. A permission the role does not hold is refused wherever it is mounted
// ---------------------------------------------------------------------------

describe("a permission outside the granted set is refused", () => {
  const notGranted = [
    "price:approve",
    "product:approve",
    "care:administer",
    "care:security_audit",
    "operating:*",
    "*",
  ];

  for (const attempt of notGranted) {
    it(`refuses ${attempt} before any repository call`, async () => {
      const h = harness((app, deps, repository) => {
        app.get(
          "/probe",
          requireOperatingPermission(attempt as OperatingPermission, deps),
          (_req, res) => res.json({ ok: true, data: repository() }),
        );
      });
      const response = await request(h.app).get("/probe");
      expect(response.status).toBe(403);
      expect(h.repository).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Escalation: a forged claim in the body, query, path, or headers is inert
// ---------------------------------------------------------------------------

describe("the acting principal comes only from the guard", () => {
  const forgeries: Array<{
    name: string;
    send: (agent: ReturnType<typeof request>) => request.Test;
  }> = [
    {
      name: "a forged role in the body",
      send: (agent) =>
        agent.post("/probe").send({ role: "super_admin", roles: ["super_admin"] }),
    },
    {
      name: "a forged principal object in the body",
      send: (agent) =>
        agent.post("/probe").send({
          principal: { subjectId: "founder", roles: ["super_admin"] },
          operatingPrincipal: { subjectId: "founder", roles: ["super_admin"] },
        }),
    },
    {
      name: "a forged permission list in the body",
      send: (agent) =>
        agent
          .post("/probe")
          .send({ permissions: ["price:approve", "operating:partner_workflow"] }),
    },
    {
      name: "a forged role in the query string",
      send: (agent) =>
        agent.post("/probe?role=super_admin&roles[]=super_admin").send({}),
    },
    {
      name: "a forged role in a header",
      send: (agent) =>
        agent
          .post("/probe")
          .set("x-xenios-role", "super_admin")
          .set("x-admin-email", "founder@example.com")
          .send({}),
    },
    {
      name: "a forged admin email claim on the request",
      send: (agent) => agent.post("/probe").set("authorization", "Bearer forged").send({}),
    },
  ];

  for (const forgery of forgeries) {
    it(`refuses a denied capability despite ${forgery.name}`, async () => {
      const h = harness((app, deps, repository) => {
        app.post(
          "/probe",
          refuseOperatingRole("price_approval", deps),
          (_req, res) => res.json({ ok: true, data: repository() }),
        );
      });
      const response = await forgery.send(request(h.app));
      expect(response.status).toBe(403);
      expect(h.repository).not.toHaveBeenCalled();
    });

    it(`refuses an ungranted permission despite ${forgery.name}`, async () => {
      const h = harness((app, deps, repository) => {
        app.post(
          "/probe",
          requireOperatingPermission("care:administer" as OperatingPermission, deps),
          (_req, res) => res.json({ ok: true, data: repository() }),
        );
      });
      const response = await forgery.send(request(h.app));
      expect(response.status).toBe(403);
      expect(h.repository).not.toHaveBeenCalled();
    });
  }

  it("discards a principal planted on res.locals by upstream middleware", async () => {
    const h = harness((app, deps, repository) => {
      app.use((req, res, next) => {
        // The exact shape a sibling lane found trusted from a caller: a
        // pre-populated principal that a later guard would read instead of
        // resolving. It must not survive.
        res.locals[OPERATING_PRINCIPAL_LOCALS_KEY] = {
          subjectId: "forged-founder",
          roles: ["super_admin", OPERATING_GROWTH_ROLE],
        };
        (req as express.Request & { operatingPrincipal?: unknown }).operatingPrincipal = {
          subjectId: "forged-founder",
          roles: ["super_admin"],
        };
        next();
      });
      app.get(
        "/probe",
        requireOperatingPermission("operating:partner_pipeline_read", deps),
        (_req, res) => {
          const principal = readOperatingPrincipal(res);
          res.json({ ok: true, principal, data: repository() });
        },
      );
    });
    const response = await request(h.app).get("/probe");
    expect(response.status).toBe(200);
    // Resolved identity replaced the planted one entirely.
    expect(response.body.principal).toEqual({
      subjectId: "kris-subject",
      roles: [OPERATING_GROWTH_ROLE],
    });
  });

  it("narrows a resolved principal to the operating role alone", async () => {
    // If the identity source ever returns the operating role beside a more
    // powerful name, downstream code must not be able to see or branch on it.
    const h = harness(
      (app, deps, repository) => {
        app.get(
          "/probe",
          requireOperatingPermission("operating:growth_kpis_read", deps),
          (_req, res) => res.json({ ok: true, principal: readOperatingPrincipal(res), data: repository() }),
        );
      },
      { subjectId: "kris-subject", roles: [OPERATING_GROWTH_ROLE, "super_admin", "clinical_admin"] },
    );
    const response = await request(h.app).get("/probe");
    expect(response.status).toBe(200);
    expect(response.body.principal.roles).toEqual([OPERATING_GROWTH_ROLE]);
    expect(h.seenPrincipal()?.roles).toEqual([OPERATING_GROWTH_ROLE]);
  });

  it("still refuses a denied capability when the resolver returns an elevated claim beside the role", async () => {
    const h = harness(
      (app, deps, repository) => {
        app.post(
          "/probe",
          refuseOperatingRole("user_and_role_administration", deps),
          (_req, res) => res.json({ ok: true, data: repository() }),
        );
      },
      { subjectId: "kris-subject", roles: [OPERATING_GROWTH_ROLE, "super_admin"] },
    );
    const response = await request(h.app).post("/probe").send({ role: "super_admin" });
    expect(response.status).toBe(403);
    expect(h.repository).not.toHaveBeenCalled();
  });

  it("ignores a session-style principal planted on the request object", async () => {
    const h = harness((app, deps, repository) => {
      app.use((req, _res, next) => {
        (req as express.Request & { user?: unknown; adminEmail?: string }).user = {
          id: "forged-founder",
          roles: ["super_admin"],
        };
        (req as express.Request & { adminEmail?: string }).adminEmail =
          "founder@example.com";
        next();
      });
      app.post(
        "/probe",
        refuseOperatingRole("price_approval", deps),
        (_req, res) => res.json({ ok: true, data: repository() }),
      );
    });
    const response = await request(h.app).post("/probe").send({});
    expect(response.status).toBe(403);
    expect(h.repository).not.toHaveBeenCalled();
  });

  it("produces the identical decision for a forged request and a clean one", async () => {
    // If any caller-supplied surface influenced the guard, these two audit
    // records would differ.
    const clean = harness((app, deps, repository) => {
      app.post(
        "/probe",
        requireOperatingPermission("care:administer" as OperatingPermission, deps),
        (_req, res) => res.json({ ok: true, data: repository() }),
      );
    });
    await request(clean.app).post("/probe").send({});

    const forged = harness((app, deps, repository) => {
      app.post(
        "/probe",
        requireOperatingPermission("care:administer" as OperatingPermission, deps),
        (_req, res) => res.json({ ok: true, data: repository() }),
      );
    });
    await request(forged.app)
      .post("/probe?role=super_admin")
      .set("x-xenios-role", "super_admin")
      .send({ roles: ["super_admin"], permissions: ["care:administer"] });

    expect(forged.decisions.mock.calls).toEqual(clean.decisions.mock.calls);
    expect(forged.repository).not.toHaveBeenCalled();
    expect(clean.repository).not.toHaveBeenCalled();
  });

  it("throws rather than guessing when a handler reads the principal without the guard", () => {
    const res = { locals: {} } as unknown as express.Response;
    expect(() => readOperatingPrincipal(res)).toThrow(/operating principal/);
  });
});

// ---------------------------------------------------------------------------
// 4. Authentication and failure paths never authorize
// ---------------------------------------------------------------------------

describe("unresolved identity and adapter failure never authorize", () => {
  it("returns 401 without reaching the repository when no principal resolves", async () => {
    const h = harness(
      (app, deps, repository) => {
        app.get(
          "/probe",
          requireOperatingPermission("operating:partner_pipeline_read", deps),
          (_req, res) => res.json({ ok: true, data: repository() }),
        );
      },
      null,
    );
    const response = await request(h.app).get("/probe");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ ok: false, code: "operating_auth_required" });
    expect(h.repository).not.toHaveBeenCalled();
  });

  it("returns 503 without authorizing when the identity source fails", async () => {
    const h = harness(
      (app, deps, repository) => {
        app.get(
          "/probe",
          requireOperatingPermission("operating:partner_pipeline_read", deps),
          (_req, res) => res.json({ ok: true, data: repository() }),
        );
      },
      null,
      {
        resolvePrincipal: vi.fn(async () => {
          throw new Error("identity provider down: secret-connection-string");
        }),
      },
    );
    const response = await request(h.app).get("/probe");
    expect(response.status).toBe(503);
    expect(h.repository).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain("secret-connection-string");
  });

  it("returns 503 without authorizing when the access decision cannot be recorded", async () => {
    const h = harness(
      (app, deps, repository) => {
        app.get(
          "/probe",
          requireOperatingPermission("operating:partner_pipeline_read", deps),
          (_req, res) => res.json({ ok: true, data: repository() }),
        );
      },
      { subjectId: "kris-subject", roles: [OPERATING_GROWTH_ROLE] },
      { recordAccessDecision: vi.fn(async () => { throw new Error("audit sink down"); }) },
    );
    const response = await request(h.app).get("/probe");
    expect(response.status).toBe(503);
    expect(h.repository).not.toHaveBeenCalled();
  });

  it("marks every response no-store", async () => {
    const h = harness(mountPolicySurface(deniedEntries[0]));
    const method = deniedEntries[0].method.toLowerCase() as "get" | "post" | "patch" | "delete";
    const response = await request(h.app)[method](concreteUrl(deniedEntries[0].surface)).send({});
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });
});

// ---------------------------------------------------------------------------
// 5. What the role CAN do, and what its payloads may never carry
// ---------------------------------------------------------------------------

describe("the authorized surfaces work and stay clean", () => {
  for (const entry of allowedEntries) {
    const permission =
      entry.decision.kind === "allow" ? entry.decision.permission : "";
    it(`allows ${permission} at ${entry.method} ${entry.surface}`, async () => {
      const h = harness(mountPolicySurface(entry));
      const method = entry.method.toLowerCase() as "get" | "post";
      const response = await request(h.app)[method](concreteUrl(entry.surface)).send({});
      expect(response.status).toBe(200);
      expect(h.repository).toHaveBeenCalledTimes(1);
      expect(h.decisions).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "allowed", permission }),
      );
    });
  }

  it("covers every LIVE permission with an authorized surface, and no planned one", () => {
    // The earlier version of this test asserted a surface for all five
    // permissions and passed, because four of the five surfaces in the table
    // did not exist in this repository. It was asserting the table against
    // itself. Only the permissions with a route registered in server/** are
    // exercised here; the rest are named as planned and reach nothing.
    // server/research/operating-surface-registry.test.ts is what holds that
    // line against the real sources.
    const covered = new Set<string>(
      allowedEntries.map((entry) =>
        entry.decision.kind === "allow" ? entry.decision.permission : "",
      ),
    );
    for (const permission of OPERATING_LIVE_PERMISSIONS) {
      expect(covered.has(permission), `no surface uses ${permission}`).toBe(true);
    }
    for (const permission of OPERATING_PLANNED_PERMISSIONS) {
      expect(
        covered.has(permission),
        `${permission} is planned but an authorized surface uses it`,
      ).toBe(false);
    }
    expect([...covered].sort()).toEqual([...OPERATING_LIVE_PERMISSIONS].sort());
    expect(OPERATING_PERMISSIONS.length).toBe(
      OPERATING_LIVE_PERMISSIONS.length + OPERATING_PLANNED_PERMISSIONS.length,
    );
  });

  it("strips supplier cost, margin, and supplier identity from an authorized payload", async () => {
    const h = harness((app, deps) => {
      app.get(
        "/api/admin/research/growth/kpis",
        requireOperatingPermission("operating:growth_kpis_read", deps),
        (_req, res) =>
          sendOperatingJson(res, {
            orgId: "org-1",
            conversionCount: 4,
            commissionCents: 1200,
            wholesaleSourceCostCents: 4200,
            grossMarginPct: 61.2,
            items: [{ sku: "SKU-1", supplierSource: "Apex", unitCostCents: 900 }],
          }),
      );
    });
    const response = await request(h.app).get("/api/admin/research/growth/kpis");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      orgId: "org-1",
      conversionCount: 4,
      commissionCents: 1200,
      items: [{ sku: "SKU-1" }],
    });
    const body = JSON.stringify(response.body);
    for (const leak of ["wholesale", "Margin", "supplier", "unitCost", "Apex"]) {
      expect(body).not.toContain(leak);
    }
  });
});
