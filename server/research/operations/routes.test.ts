import express, { type RequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { AffiliateService } from "./affiliate-service";
import { CrmService } from "./crm-service";
import { FulfillmentService } from "./fulfillment-service";
import { InventoryLedger } from "./inventory-ledger";
import { InMemoryOutboxRepository, NotificationOutbox } from "./notification-outbox";
import { ProfessionalAccountService } from "./professional-accounts";
import { registerOperationsApi, type OperationsRouteDeps, type OperationsRouteRequest } from "./routes";
import { newOperationsAggregate, type OperationsActor, type OperationsRole } from "./state-machines";

const NOW = new Date("2026-07-25T16:00:00.000Z");
const operations: OperationsActor = { id: "ops", role: "operations_manager" };

function roleGuard(...allowed: OperationsRole[]): RequestHandler {
  return (req: OperationsRouteRequest, res, next) => {
    const role = String(req.header("x-role") ?? "") as OperationsRole;
    if (!allowed.includes(role)) {
      res.status(403).json({ ok: false, code: "forbidden" });
      return;
    }
    req.operationsActor = { id: String(req.header("x-actor-id") ?? "actor"), role };
    next();
  };
}

describe("operations integration-ready routes", () => {
  let deps: OperationsRouteDeps;
  let app: express.Express;

  beforeEach(() => {
    const fulfillment = new FulfillmentService(new InventoryLedger());
    const created = fulfillment.create({
      id: "ful-1",
      memberRef: "member-1",
      orderReference: "XR-1042",
      recipientInitials: "A. R.",
      destinationZone: "TX-3",
      dueAt: "2026-07-25T22:00:00.000Z",
      items: [{ itemId: "line-1", sku: "SKU-1", displayName: "Item", quantity: 1 }],
      aggregate: newOperationsAggregate("ful-1"),
      actor: operations,
      idempotencyKey: "create",
      occurredAt: NOW,
    });
    if (!created.ok) throw new Error(created.message);

    deps = {
      guards: {
        requireAdmin: roleGuard("admin", "operations_manager"),
        requireLogistics: roleGuard("mitch", "logistics"),
        requireAffiliate: roleGuard("affiliate"),
        requireMember: (req: OperationsRouteRequest, res, next) => {
          const memberRef = req.header("x-member-ref");
          if (!memberRef) {
            res.status(403).json({ ok: false, code: "forbidden" });
            return;
          }
          req.operationsMemberRef = memberRef;
          req.operationsActor = { id: memberRef, role: "professional" };
          next();
        },
        actorOf: (req) => req.operationsActor ?? null,
        memberRefOf: (req) => req.operationsMemberRef ?? null,
      },
      fulfillment,
      affiliates: new AffiliateService("secret", "https://xenios.test"),
      professionals: new ProfessionalAccountService(),
      crm: new CrmService(),
      outbox: new NotificationOutbox(new InMemoryOutboxRepository(), {}),
      dashboard: () => ({
        generatedAt: NOW.toISOString(),
        pending_applications: 1,
        pending_activation: 0,
        payment_verification: 0,
        paid_orders: 0,
        ready_fulfillment: 1,
        overdue_acknowledgement: 0,
        shipping_today: 1,
        late_orders: 0,
        exceptions: 0,
        low_inventory: 0,
        quarantined_lots: 0,
        missing_coas: 0,
        affiliate_applications: 0,
        active_affiliates: 0,
        commissions: 0,
        payouts: 0,
        professional_applications: 0,
        active_professional_accounts: 0,
        notification_failures: 0,
      }),
      now: () => NOW,
    };
    app = express();
    app.use(express.json());
    registerOperationsApi(app, deps);
  });

  it("protects the admin dashboard and links every metric", async () => {
    expect((await request(app).get("/api/admin/research/operations/dashboard")).status).toBe(403);
    const response = await request(app)
      .get("/api/admin/research/operations/dashboard")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel");
    expect(response.status).toBe(200);
    expect(response.body.dashboard.metrics).toHaveLength(19);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("lets Mitch read the sanitized queue but does not grant admin access", async () => {
    const queue = await request(app)
      .get("/api/operations/mitch/queues/awaiting_acknowledgement")
      .set("x-role", "mitch")
      .set("x-actor-id", "mitch");
    expect(queue.status).toBe(200);
    expect(queue.body.rows).toHaveLength(1);
    expect(JSON.stringify(queue.body.rows[0])).not.toContain("memberRef");

    const admin = await request(app)
      .get("/api/operations/mitch/queues/awaiting_acknowledgement")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel");
    expect(admin.status).toBe(403);
  });

  it("requires idempotency and expected version on every Mitch mutation", async () => {
    const response = await request(app)
      .post("/api/operations/mitch/orders/ful-1/acknowledge")
      .set("x-role", "mitch")
      .set("x-actor-id", "mitch")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Idempotency-Key");
  });

  it("returns tracking only to the owning member and makes absence indistinguishable from unauthorized ownership", async () => {
    const owner = await request(app)
      .get("/api/research/orders/ful-1/tracking")
      .set("x-member-ref", "member-1");
    expect(owner.status).toBe(200);
    expect(owner.body.tracking).toMatchObject({ orderReference: "XR-1042", tracking: null });
    const other = await request(app)
      .get("/api/research/orders/ful-1/tracking")
      .set("x-member-ref", "member-2");
    expect(other.status).toBe(404);
  });

  it("refuses clinical referral economics at the public professional application wire", async () => {
    const response = await request(app)
      .post("/api/research/professional-accounts/apply")
      .set("Idempotency-Key", "professional-1")
      .send({
        id: "pro-1",
        accountType: "professional",
        organizationName: "Practice",
        contactEmail: "practice@example.com",
        programs: ["future_clinical_partnership"],
        proposedEconomics: { patientReferralPaymentCents: 100 },
      });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("clinical_economics_refused");
  });
});
