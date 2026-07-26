import express, { type RequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { AffiliateService } from "./affiliate-service";
import { CrmService } from "./crm-service";
import { FulfillmentService } from "./fulfillment-service";
import { InventoryLedger } from "./inventory-ledger";
import { InMemoryOutboxRepository, NotificationOutbox } from "./notification-outbox";
import { OperationsTaskService } from "./operations-tasks";
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
  let fulfillment: FulfillmentService;

  beforeEach(() => {
    fulfillment = new FulfillmentService(new InventoryLedger());
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
      partnerPortal: {
        read: async (surface) => ({ surface, rows: [] }),
        submit: async (kind) => ({ ok: true, message: `${kind} received`, idempotent: false }),
      },
      crm: new CrmService(),
      tasks: new OperationsTaskService(),
      inventory: {
        list: async () => ({ ok: true, lots: [] }),
        command: async (input) => ({
          ok: true,
          idempotent: false,
          lot: {
            id: input.lotId,
            version: input.expectedVersion + 1,
            quantityAvailable: input.action === "damage" ? 8 : 10,
          },
        }),
      },
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

  it("awaits durable async fulfillment adapters before replying", async () => {
    const service = deps.fulfillment;
    const acknowledge = service.acknowledge.bind(service);
    deps.fulfillment = {
      ...service,
      acknowledge: async (input) => {
        await Promise.resolve();
        return acknowledge(input);
      },
    };
    const [row] = await service.listMitchQueue("awaiting_acknowledgement", NOW);

    const response = await request(app)
      .post("/api/operations/mitch/orders/ful-1/acknowledge")
      .set("x-role", "mitch")
      .set("x-actor-id", "mitch")
      .set("Idempotency-Key", "async-ack")
      .send({ expectedVersion: row.version });

    expect(response.status).toBe(200);
    expect(response.body.value.aggregate.states.fulfillment).toBe("acknowledged");
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

  it("registers all 16 partner adapter endpoints behind partner ownership", async () => {
    const reads = [
      "conversions",
      "leads",
      "commissions",
      "payouts",
      "resources",
      "training",
      "campaigns",
      "events",
      "organizations",
      "compliance",
      "onboarding",
      "security/sessions",
    ];
    for (const path of reads) {
      expect((await request(app).get(`/api/research/partner/${path}`)).status).toBe(403);
      const response = await request(app)
        .get(`/api/research/partner/${path}`)
        .set("x-role", "affiliate")
        .set("x-actor-id", "partner-auth-user");
      expect(response.status, path).toBe(200);
      expect(response.headers["cache-control"], path).toBe("no-store");
    }

    const writes = [
      "campaigns/request",
      "events/request",
      "organizations/request",
      "compliance/submissions",
    ];
    for (const path of writes) {
      expect((await request(app).post(`/api/research/partner/${path}`).send({})).status).toBe(403);
      const response = await request(app)
        .post(`/api/research/partner/${path}`)
        .set("x-role", "affiliate")
        .set("x-actor-id", "partner-auth-user")
        .send({ example: true });
      expect(response.status, path).toBe(202);
    }
  });

  it("runs the required professional prospect-to-active pipeline with versioned agreement", async () => {
    const applied = await request(app)
      .post("/api/research/professional-accounts/apply")
      .set("Idempotency-Key", "pipeline-apply")
      .send({
        id: "professional-pipeline",
        accountType: "professional",
        organizationName: "Pipeline Practice",
        contactEmail: "pipeline@example.com",
        programs: ["education", "software"],
      });
    expect(applied.status).toBe(200);

    const stages = ["prospect", "discovery", "diligence", "commercial_review", "agreement", "active"];
    let version = 1;
    for (const stage of stages) {
      const response = await request(app)
        .post("/api/admin/research/professional-accounts/professional-pipeline/transition")
        .set("x-role", "admin")
        .set("x-actor-id", "samuel")
        .set("Idempotency-Key", `pipeline-${stage}`)
        .send({
          to: stage,
          expectedVersion: version,
          ...(stage === "agreement" ? { agreementVersion: "agreement-v1" } : {}),
        });
      expect(response.status, stage).toBe(200);
      expect(response.body.value.state, stage).toBe(stage);
      version += 1;
    }
  });

  it("persists an assigned operations task and refuses stale or replay-conflicting transitions", async () => {
    const created = await request(app)
      .post("/api/admin/research/operations/tasks")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel")
      .set("Idempotency-Key", "task-create")
      .send({
        id: "task-1",
        title: "Review fulfillment shortage",
        priority: "urgent",
        assignedTo: "operations@example.com",
      });
    expect(created.status).toBe(200);
    expect(created.body.value).toMatchObject({ id: "task-1", status: "open", version: 1 });

    const transitioned = await request(app)
      .post("/api/admin/research/operations/tasks/task-1/transition")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel")
      .set("Idempotency-Key", "task-start")
      .send({ to: "in_progress", expectedVersion: 1 });
    expect(transitioned.status).toBe(200);
    expect(transitioned.body.value).toMatchObject({ status: "in_progress", version: 2 });

    const replay = await request(app)
      .post("/api/admin/research/operations/tasks/task-1/transition")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel")
      .set("Idempotency-Key", "task-start")
      .send({ to: "in_progress", expectedVersion: 1 });
    expect(replay.status).toBe(200);
    expect(replay.body.idempotent).toBe(true);

    const conflict = await request(app)
      .post("/api/admin/research/operations/tasks/task-1/transition")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel")
      .set("Idempotency-Key", "task-start")
      .send({ to: "completed", expectedVersion: 2 });
    expect(conflict.status).toBe(400);
    expect(conflict.body.code).toBe("idempotency_conflict");

    const stale = await request(app)
      .post("/api/admin/research/operations/tasks/task-1/transition")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel")
      .set("Idempotency-Key", "task-stale")
      .send({ to: "completed", expectedVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("stale_write");

    const list = await request(app)
      .get("/api/admin/research/operations/tasks?status=in_progress")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel");
    expect(list.status).toBe(200);
    expect(list.body.value).toHaveLength(1);
  });

  it("persists CRM create, stage, note, reference, and timeline commands with privacy refusal", async () => {
    const created = await request(app)
      .post("/api/admin/research/operations/crm")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel")
      .set("Idempotency-Key", "crm-create")
      .send({
        id: "crm-1",
        kind: "professional",
        displayName: "Example Practice",
        email: "contact@example.com",
      });
    expect(created.status).toBe(200);
    expect(created.body.value).toMatchObject({ id: "crm-1", stage: "new", version: 1 });

    const staged = await request(app)
      .post("/api/admin/research/operations/crm/crm-1/stage")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel")
      .set("Idempotency-Key", "crm-stage")
      .send({ to: "active", expectedVersion: 1 });
    expect(staged.status).toBe(200);
    expect(staged.body.value).toMatchObject({ stage: "active", version: 2 });

    const privateNote = await request(app)
      .post("/api/admin/research/operations/crm/crm-1/notes")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel")
      .set("Idempotency-Key", "crm-private-note")
      .send({ summary: "Patient diagnosis follow-up", expectedVersion: 2 });
    expect(privateNote.status).toBe(400);
    expect(privateNote.body.code).toBe("privacy_refused");

    const note = await request(app)
      .post("/api/admin/research/operations/crm/crm-1/notes")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel")
      .set("Idempotency-Key", "crm-note")
      .send({ summary: "Commercial review scheduled.", expectedVersion: 2 });
    expect(note.status).toBe(200);
    expect(note.body.value.version).toBe(3);

    const linked = await request(app)
      .post("/api/admin/research/operations/crm/crm-1/references")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel")
      .set("Idempotency-Key", "crm-link")
      .send({ referenceType: "order", referenceId: "order-1", expectedVersion: 3 });
    expect(linked.status).toBe(200);
    expect(linked.body.value.version).toBe(4);

    const detail = await request(app)
      .get("/api/admin/research/operations/crm/crm-1")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel");
    expect(detail.status).toBe(200);
    expect(detail.body.value.timeline.map((event: { kind: string }) => event.kind)).toEqual([
      "created",
      "stage_changed",
      "note",
      "order_linked",
    ]);
  });

  it("protects the production inventory lifecycle and requires a versioned idempotent command", async () => {
    expect((await request(app).get("/api/admin/research/operations/inventory/lots")).status).toBe(403);
    const missing = await request(app)
      .post("/api/admin/research/operations/inventory/lots/00000000-0000-0000-0000-000000000420/commands")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel")
      .send({ action: "damage", quantity: 2, reason: "Damaged in handling" });
    expect(missing.status).toBe(400);

    const applied = await request(app)
      .post("/api/admin/research/operations/inventory/lots/00000000-0000-0000-0000-000000000420/commands")
      .set("x-role", "admin")
      .set("x-actor-id", "samuel")
      .set("Idempotency-Key", "inventory-damage")
      .send({ action: "damage", quantity: 2, reason: "Damaged in handling", expectedVersion: 1 });
    expect(applied.status).toBe(200);
    expect(applied.body.lot).toMatchObject({ version: 2, quantityAvailable: 8 });
  });

  it("opens and resolves a shortage without mutating inventory or shipment state", async () => {
    const beforeMovements = fulfillment.inventory.listMovements();
    const startingVersion = fulfillment.get("ful-1")!.aggregate.version;
    const opened = await request(app)
      .post("/api/operations/mitch/orders/ful-1/exception")
      .set("x-role", "mitch")
      .set("x-actor-id", "mitch")
      .set("Idempotency-Key", "shortage-open")
      .send({
        kind: "shortage",
        severity: "urgent",
        detail: "Exact allocated quantity is unavailable.",
        expectedVersion: startingVersion,
      });
    expect(opened.status).toBe(200);
    const exceptionId = opened.body.value.exceptions[0].id;
    const openedVersion = opened.body.value.aggregate.version;
    expect(opened.body.value.aggregate.states.shipment).toBe("not_created");

    const resolved = await request(app)
      .post(`/api/operations/mitch/orders/ful-1/exceptions/${exceptionId}/resolve`)
      .set("x-role", "mitch")
      .set("x-actor-id", "mitch")
      .set("Idempotency-Key", "shortage-resolve")
      .send({ resolution: "Replacement lot requested.", expectedVersion: openedVersion });
    expect(resolved.status).toBe(200);
    expect(resolved.body.value.exceptions[0].status).toBe("resolved");
    expect(resolved.body.value.aggregate.states.shipment).toBe("not_created");
    expect(fulfillment.inventory.listMovements()).toEqual(beforeMovements);
  });
});
