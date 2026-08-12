import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AdminCrmSupplierOperationsSnapshot } from "@shared/research/admin-crm-supplier-operations";
import { registerAdminCrmSupplierOperationsApi } from "./routes";

const snapshot: AdminCrmSupplierOperationsSnapshot = {
  generatedAt: "2026-08-12T12:00:00.000Z", trustDial: "queue", buyerQueue: [], organizations: [], customers: [],
  availabilityReviews: [], priceReviews: [], invoices: [], supplierAssignments: [], fulfillment: [], exceptions: [], audit: [], intake: [],
};

function makeApp() {
  const service = {
    readSnapshot: vi.fn(async () => snapshot),
    queueAction: vi.fn(async (_actorId: string, input: any) => ({
      queueId: "queue_1", action: input.action, targetType: input.targetType, targetId: input.targetId,
      state: "queued" as const, trustDial: "queue" as const, createdAt: snapshot.generatedAt, idempotentReplay: false,
    })),
  };
  const app = express();
  app.use(express.json());
  registerAdminCrmSupplierOperationsApi(app, {
    requireAdmin(req: Request, res: Response, next: NextFunction) {
      if (req.headers.authorization !== "Bearer verified-admin") return void res.status(401).json({ ok: false });
      (req as Request & { adminEmail?: string }).adminEmail = "founder@xeniostechnology.com";
      next();
    },
    resolveActorId: async (email) => email === "founder@xeniostechnology.com" ? "admin_001" : null,
    service,
  });
  return { app, service };
}

describe("unmounted Admin CRM supplier operations routes", () => {
  it("keeps reads behind the server admin guard", async () => {
    const { app, service } = makeApp();
    const response = await request(app).get("/api/admin/research/crm-supplier-operations");
    expect(response.status).toBe(401);
    expect(service.readSnapshot).not.toHaveBeenCalled();
  });

  it("resolves the storage actor from verified server identity", async () => {
    const { app, service } = makeApp();
    const response = await request(app)
      .get("/api/admin/research/crm-supplier-operations")
      .set("Authorization", "Bearer verified-admin");
    expect(response.status).toBe(200);
    expect(response.body.snapshot).toEqual(snapshot);
    expect(service.readSnapshot).toHaveBeenCalledWith("admin_001");
  });

  it("strictly validates action requests before the Trust-Dial service", async () => {
    const { app, service } = makeApp();
    const response = await request(app)
      .post("/api/admin/research/crm-supplier-operations/actions")
      .set("Authorization", "Bearer verified-admin")
      .send({ action: "send_email_now", targetType: "buyer", targetId: "buyer_1", reason: "Bypass approval", idempotencyKey: "pack05:bad-action" });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("invalid_request");
    expect(service.queueAction).not.toHaveBeenCalled();
  });
});
