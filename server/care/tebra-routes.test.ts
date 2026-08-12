import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { TEBRA_ROUTE_CONTRACTS, type TebraIntegrationStatus } from "@shared/care/tebra";
import type { CarePrincipal, CareRole } from "@shared/care/contracts";
import type { CareAccessDependencies } from "./access";
import type { TebraAdminService } from "./tebra-admin";
import { createTebraAdminHandlers } from "./tebra-routes";

const ADMIN_ID = "66666666-6666-4666-8666-666666666666";

const STATUS: TebraIntegrationStatus = {
  integration: "tebra",
  state: "ready",
  ready: true,
  transportBound: true,
  pollIntervalMinutes: 10,
  cursors: [{ entity: "patient", fromModifiedAt: null, toModifiedAt: null }],
  checkedAt: "2026-08-12T12:00:00.000Z",
};

function access(
  overrides: {
    capabilityState?: "enabled" | "pending_qa";
    principal?: CarePrincipal | null;
    recordAccessDecision?: CareAccessDependencies["recordAccessDecision"];
  } = {},
): CareAccessDependencies {
  const state = overrides.capabilityState ?? "enabled";
  return {
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care" as const,
      state,
      enabled: state === "enabled",
      publicMessage: "Care is available in supported locations.",
      checkedAt: "2026-08-12T12:00:00.000Z",
    })),
    resolvePrincipal: vi.fn(async () =>
      overrides.principal === undefined
        ? ({ subjectId: ADMIN_ID, roles: ["clinical_admin" as CareRole] } as CarePrincipal)
        : overrides.principal,
    ),
    recordAccessDecision: overrides.recordAccessDecision ?? vi.fn(async () => undefined),
  };
}

function service(overrides: Partial<TebraAdminService> = {}): TebraAdminService {
  return {
    status: vi.fn(async () => STATUS),
    sync: vi.fn(async () => ({
      outcomes: [{ entity: "patient" as const, skipped: true as const, reason: "lease_held" as const }],
    })),
    ...overrides,
  };
}

/**
 * The connector exports handlers rather than registering them, because the
 * composition root and the repository route inventory belong to other lanes.
 * This mirrors the exact wiring documented for the integration lane, so the
 * behaviour under a real Express app is still proven here.
 */
function app(deps: { access?: CareAccessDependencies; service?: TebraAdminService } = {}) {
  const handlers = createTebraAdminHandlers({
    access: deps.access ?? access(),
    service: deps.service ?? service(),
  });
  const instance = express();
  instance.use(express.json());
  instance.get(TEBRA_ROUTE_CONTRACTS.status, handlers.requireAdmin, handlers.status);
  instance.post(TEBRA_ROUTE_CONTRACTS.sync, handlers.requireAdmin, handlers.sync);
  return instance;
}

describe("Tebra admin authorization", () => {
  it("refuses everyone while the Care capability is not enabled", async () => {
    const svc = service();
    const server = app({ access: access({ capabilityState: "pending_qa" }), service: svc });

    const status = await request(server).get(TEBRA_ROUTE_CONTRACTS.status);
    const sync = await request(server).post(TEBRA_ROUTE_CONTRACTS.sync).send({});

    expect(status.status).toBe(503);
    expect(status.body).toMatchObject({ code: "care_disabled" });
    expect(sync.status).toBe(503);
    expect(svc.status).not.toHaveBeenCalled();
    expect(svc.sync).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller", async () => {
    const svc = service();
    const server = app({ access: access({ principal: null }), service: svc });

    const response = await request(server).post(TEBRA_ROUTE_CONTRACTS.sync).send({});
    expect(response.status).toBe(401);
    expect(svc.sync).not.toHaveBeenCalled();
  });

  it("refuses a Care role that does not administer, including a patient", async () => {
    for (const role of ["care_patient", "clinician", "care_security_admin"] as CareRole[]) {
      const svc = service();
      const server = app({
        access: access({ principal: { subjectId: ADMIN_ID, roles: [role] } }),
        service: svc,
      });

      const response = await request(server).post(TEBRA_ROUTE_CONTRACTS.sync).send({});
      expect(response.status).toBe(403);
      expect(svc.sync).not.toHaveBeenCalled();
    }
  });

  it("records the access decision through the existing Care audit", async () => {
    const recordAccessDecision = vi.fn(async () => undefined);
    const server = app({ access: access({ recordAccessDecision }) });

    await request(server).get(TEBRA_ROUTE_CONTRACTS.status);
    expect(recordAccessDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        actorSubjectId: ADMIN_ID,
        permission: "care:administer",
        outcome: "allowed",
      }),
    );
  });
});

describe("Tebra admin status", () => {
  it("returns the integration state to a clinical admin and forbids caching", async () => {
    const response = await request(app()).get(TEBRA_ROUTE_CONTRACTS.status);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, integration: STATUS });
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["x-robots-tag"]).toContain("noindex");
  });

  it("says only that the integration is unavailable when the service throws", async () => {
    const server = app({
      service: service({
        status: vi.fn(async () => {
          throw new Error("SOAP fault: patient Jane Doe not found");
        }),
      }),
    });

    const response = await request(server).get(TEBRA_ROUTE_CONTRACTS.status);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ok: false, code: "tebra_unavailable" });
    expect(JSON.stringify(response.body)).not.toContain("Jane Doe");
  });
});

describe("Tebra manual sync", () => {
  it("runs every entity when none is named", async () => {
    const svc = service();
    const response = await request(app({ service: svc }))
      .post(TEBRA_ROUTE_CONTRACTS.sync)
      .send({});

    expect(response.status).toBe(202);
    expect(svc.sync).toHaveBeenCalledWith(undefined);
    expect(response.body.outcomes).toHaveLength(1);
  });

  it("runs a single named entity", async () => {
    const svc = service();
    await request(app({ service: svc }))
      .post(TEBRA_ROUTE_CONTRACTS.sync)
      .send({ entity: "appointment" });

    expect(svc.sync).toHaveBeenCalledWith("appointment");
  });

  it("refuses an entity it does not recognize", async () => {
    const svc = service();
    const response = await request(app({ service: svc }))
      .post(TEBRA_ROUTE_CONTRACTS.sync)
      .send({ entity: "prescription" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ ok: false, code: "tebra_invalid_payload" });
    expect(svc.sync).not.toHaveBeenCalled();
  });
});
