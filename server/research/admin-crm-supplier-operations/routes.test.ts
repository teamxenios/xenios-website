import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_OPERATIONS_SOURCE_KEYS,
  type AdminCrmSupplierOperationsSnapshot,
  type AdminOperationsSources,
} from "@shared/research/admin-crm-supplier-operations";
import { AdminCrmRefusal } from "./service";
import { registerAdminCrmSupplierOperationsApi } from "./routes";

const at = "2026-08-12T12:00:00.000Z";
const sources = Object.fromEntries(ADMIN_OPERATIONS_SOURCE_KEYS.map((key) => [key, {
  availability: "unavailable",
  code: "source_not_configured",
  message: `${key} source is unavailable in this environment.`,
  provenance: `admin_ops.${key}`,
  checkedAt: at,
  items: null,
}])) as AdminOperationsSources;

const snapshot: AdminCrmSupplierOperationsSnapshot = {
  generatedAt: at,
  trustDial: "never",
  sources,
};

function makeApp() {
  const service = {
    readSnapshot: vi.fn(async () => snapshot),
    recordRecommendation: vi.fn(async (_actorId: string, input: any) => ({
      recordId: "recommendation_1",
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      recordState: "recorded" as const,
      executionState: "not_executed" as const,
      externalEffect: false as const,
      executor: null,
      requiresHumanApproval: true as const,
      configuredTrustDial: "queue" as const,
      evidenceSource: "supplierAssignments" as const,
      evidenceCheckedAt: at,
      createdAt: at,
      idempotentReplay: false,
    })),
  };
  const app = express();
  app.use(express.json());
  registerAdminCrmSupplierOperationsApi(app, {
    requireAdmin(req: Request, res: Response, next: NextFunction) {
      if (req.headers.authorization !== "Bearer verified-admin") return void res.status(401).json({ ok: false });
      (req as Request & { adminEmail?: string }).adminEmail = "admin@example.test";
      next();
    },
    resolveActorId: async (email) => email === "admin@example.test" ? "admin_001" : null,
    service,
  });
  return { app, service };
}

describe("Admin CRM supplier operations routes", () => {
  it("keeps reads behind the server admin guard", async () => {
    const { app, service } = makeApp();
    const response = await request(app).get("/api/admin/research/crm-supplier-operations");
    expect(response.status).toBe(401);
    expect(service.readSnapshot).not.toHaveBeenCalled();
  });

  it("resolves the storage actor from verified server identity and prevents caching", async () => {
    const { app, service } = makeApp();
    const response = await request(app)
      .get("/api/admin/research/crm-supplier-operations")
      .set("Authorization", "Bearer verified-admin");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.snapshot).toEqual(snapshot);
    expect(service.readSnapshot).toHaveBeenCalledWith("admin_001");
  });

  it("records a non-executing recommendation with 201 rather than implying deferred execution", async () => {
    const { app, service } = makeApp();
    const response = await request(app)
      .post("/api/admin/research/crm-supplier-operations/actions")
      .set("Authorization", "Bearer verified-admin")
      .send({
        action: "supplier_assignment",
        targetType: "supplier_assignment",
        targetId: "assignment_1",
        reason: "Record a human review of supplier evidence.",
        idempotencyKey: "admin-crm:assignment_1:review:v1",
      });
    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.recommendation).toMatchObject({
      executionState: "not_executed",
      externalEffect: false,
      requiresHumanApproval: true,
    });
    expect(service.recordRecommendation).toHaveBeenCalledWith("admin_001", expect.any(Object));
  });

  it("strictly validates action requests before the Trust Dial service", async () => {
    const { app, service } = makeApp();
    const response = await request(app)
      .post("/api/admin/research/crm-supplier-operations/actions")
      .set("Authorization", "Bearer verified-admin")
      .send({
        action: "send_email_now",
        targetType: "buyer",
        targetId: "buyer_1",
        reason: "Bypass approval",
        idempotencyKey: "admin-crm:bad-action",
        unexpected: true,
      });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("invalid_request");
    expect(service.recordRecommendation).not.toHaveBeenCalled();
  });

  it("returns a safe client error for a restricted review reason", async () => {
    const { app, service } = makeApp();
    service.recordRecommendation.mockRejectedValueOnce(
      new AdminCrmRefusal("unsafe_request", "Restricted content is not permitted in an operations reason."),
    );
    const response = await request(app)
      .post("/api/admin/research/crm-supplier-operations/actions")
      .set("Authorization", "Bearer verified-admin")
      .send({
        action: "supplier_assignment",
        targetType: "supplier_assignment",
        targetId: "assignment_1",
        reason: "Contains restricted synthetic detail.",
        idempotencyKey: "admin-crm:assignment_1:review:v2",
      });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("unsafe_request");
  });

  it("maps source evidence refusals to 503 without raw upstream detail", async () => {
    const { app, service } = makeApp();
    service.readSnapshot.mockRejectedValueOnce(
      new AdminCrmRefusal("source_evidence_invalid", "Source evidence is invalid."),
    );
    const response = await request(app)
      .get("/api/admin/research/crm-supplier-operations")
      .set("Authorization", "Bearer verified-admin");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: "source_evidence_invalid",
      message: "Source evidence is invalid.",
    });
  });

  it("keeps unknown failures generic", async () => {
    const { app, service } = makeApp();
    service.readSnapshot.mockRejectedValueOnce(new Error("raw database hostname"));
    const response = await request(app)
      .get("/api/admin/research/crm-supplier-operations")
      .set("Authorization", "Bearer verified-admin");
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("hostname");
    expect(response.body.code).toBe("unavailable");
  });
});
