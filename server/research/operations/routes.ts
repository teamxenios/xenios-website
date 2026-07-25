import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import type { AffiliateService } from "./affiliate-service";
import type { CrmService } from "./crm-service";
import type { FulfillmentService, MitchQueue } from "./fulfillment-service";
import type { NotificationOutbox, NotificationStatus } from "./notification-outbox";
import type { OperationsDashboardInput } from "./operations-dashboard";
import { buildOperationsDashboard } from "./operations-dashboard";
import type { ProfessionalAccountService, ProfessionalLifecycle, ProfessionalProgram } from "./professional-accounts";
import type { OperationsActor } from "./state-machines";

export interface OperationsRouteRequest extends Request {
  operationsActor?: OperationsActor;
  operationsMemberRef?: string;
}

export interface OperationsRouteGuards {
  requireAdmin: RequestHandler;
  requireLogistics: RequestHandler;
  requireAffiliate: RequestHandler;
  requireMember: RequestHandler;
  actorOf(req: OperationsRouteRequest): OperationsActor | null;
  memberRefOf(req: OperationsRouteRequest): string | null;
}

export interface OperationsRouteDeps {
  guards: OperationsRouteGuards;
  fulfillment: FulfillmentService;
  affiliates: AffiliateService;
  professionals: ProfessionalAccountService;
  crm: CrmService;
  outbox: NotificationOutbox;
  dashboard(): Promise<OperationsDashboardInput> | OperationsDashboardInput;
  now(): Date;
}

const MITCH_QUEUES: readonly MitchQueue[] = [
  "new",
  "awaiting_acknowledgement",
  "due_today",
  "picking",
  "packed",
  "label_required",
  "shipped_today",
  "exceptions",
  "inventory_issues",
  "samuel_decisions",
] as const;

function noStore(res: Response): void {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
}

function actor(req: OperationsRouteRequest, deps: OperationsRouteDeps, res: Response): OperationsActor | null {
  const value = deps.guards.actorOf(req);
  if (!value) res.status(403).json({ ok: false, code: "forbidden", message: "Server-authorized role is required." });
  return value;
}

function key(req: Request): string {
  return String(req.header("Idempotency-Key") ?? (req.body as { idempotencyKey?: unknown })?.idempotencyKey ?? "").trim();
}

function expectedVersion(req: Request): number | null {
  const value = (req.body as { expectedVersion?: unknown })?.expectedVersion;
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function relay(res: Response, result: { ok: boolean; [key: string]: unknown }): void {
  if (result.ok) {
    res.json(result);
    return;
  }
  const code = String(result.code ?? "invalid_input");
  const status = code === "not_found" ? 404 : code === "forbidden" || code === "login_refused" ? 403 : code === "stale_write" ? 409 : 400;
  res.status(status).json(result);
}

function requireCommand(req: Request, res: Response): { idempotencyKey: string; expectedVersion: number } | null {
  const idempotencyKey = key(req);
  const version = expectedVersion(req);
  if (!idempotencyKey || version === null) {
    res.status(400).json({
      ok: false,
      code: "invalid_input",
      message: "Idempotency-Key and a non-negative expectedVersion are required.",
    });
    return null;
  }
  return { idempotencyKey, expectedVersion: version };
}

export function registerOperationsApi(app: Express, deps: OperationsRouteDeps): void {
  const admin = deps.guards.requireAdmin;
  const logistics = deps.guards.requireLogistics;
  const affiliate = deps.guards.requireAffiliate;
  const member = deps.guards.requireMember;

  app.get("/api/admin/research/operations/dashboard", admin, async (_req, res) => {
    noStore(res);
    res.json({ ok: true, dashboard: buildOperationsDashboard(await deps.dashboard()) });
  });

  app.get("/api/operations/mitch/queues/:queue", logistics, (req, res) => {
    noStore(res);
    const queue = String(req.params.queue) as MitchQueue;
    if (!MITCH_QUEUES.includes(queue)) {
      res.status(400).json({ ok: false, code: "invalid_input", message: "Unknown Mitch queue." });
      return;
    }
    res.json({ ok: true, queue, rows: deps.fulfillment.listMitchQueue(queue, deps.now()) });
  });

  app.get("/api/research/orders/:orderId/tracking", member, (req: OperationsRouteRequest, res) => {
    noStore(res);
    const memberRef = deps.guards.memberRefOf(req);
    const tracking = memberRef ? deps.fulfillment.trackingForMember(String(req.params.orderId), memberRef) : null;
    if (!tracking) {
      // Ownership failures are indistinguishable from absence.
      res.status(404).json({ ok: false, code: "not_found", message: "Order tracking not found." });
      return;
    }
    res.json({ ok: true, tracking });
  });

  app.post("/api/operations/mitch/orders/:orderId/acknowledge", logistics, (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    if (!command || !acting) return;
    relay(
      res,
      deps.fulfillment.acknowledge({
        orderId: String(req.params.orderId),
        ...command,
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/expected-date", logistics, (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    const expectedAt = (req.body as { expectedAt?: unknown })?.expectedAt;
    if (!command || !acting) return;
    if (typeof expectedAt !== "string") {
      res.status(400).json({ ok: false, code: "invalid_input", message: "expectedAt is required." });
      return;
    }
    relay(
      res,
      deps.fulfillment.setExpectedDate({
        orderId: String(req.params.orderId),
        ...command,
        expectedAt,
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/allocate", logistics, (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    const body = req.body as Record<string, unknown>;
    if (!command || !acting) return;
    if (
      typeof body.itemId !== "string" ||
      typeof body.lotId !== "string" ||
      !Number.isInteger(body.quantity) ||
      !Number.isInteger(body.expectedLotVersion)
    ) {
      res.status(400).json({ ok: false, code: "invalid_input", message: "Exact item, lot, quantity, and lot version are required." });
      return;
    }
    relay(
      res,
      deps.fulfillment.allocateExact({
        orderId: String(req.params.orderId),
        itemId: body.itemId,
        lotId: body.lotId,
        quantity: Number(body.quantity),
        expectedLotVersion: Number(body.expectedLotVersion),
        ...command,
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/pick", logistics, (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    if (!command || !acting) return;
    relay(
      res,
      deps.fulfillment.beginPicking({
        orderId: String(req.params.orderId),
        ...command,
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/pack", logistics, (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    if (!command || !acting) return;
    relay(
      res,
      deps.fulfillment.pack({
        orderId: String(req.params.orderId),
        ...command,
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/label", logistics, (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    const body = req.body as Record<string, unknown>;
    if (!command || !acting) return;
    if (![body.carrier, body.service, body.tracking].every((value) => typeof value === "string")) {
      res.status(400).json({ ok: false, code: "invalid_input", message: "Carrier, service, and tracking are required." });
      return;
    }
    relay(
      res,
      deps.fulfillment.addShippingLabel({
        orderId: String(req.params.orderId),
        ...command,
        carrier: String(body.carrier),
        service: String(body.service),
        tracking: String(body.tracking),
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/ship", logistics, (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    if (!command || !acting) return;
    relay(
      res,
      deps.fulfillment.ship({
        orderId: String(req.params.orderId),
        ...command,
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/exception", logistics, (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    const body = req.body as Record<string, unknown>;
    if (!command || !acting) return;
    relay(
      res,
      deps.fulfillment.reportException({
        orderId: String(req.params.orderId),
        ...command,
        kind: String(body.kind ?? "other") as Parameters<FulfillmentService["reportException"]>[0]["kind"],
        severity: String(body.severity ?? "normal") as Parameters<FulfillmentService["reportException"]>[0]["severity"],
        detail: String(body.detail ?? ""),
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/note", logistics, (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    const body = req.body as Record<string, unknown>;
    if (!command || !acting) return;
    relay(
      res,
      deps.fulfillment.addNote({
        orderId: String(req.params.orderId),
        ...command,
        text: String(body.text ?? ""),
        assistanceRequested: body.assistanceRequested === true,
        escalation: body.escalation === true,
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.get("/api/research/affiliate/dashboard", affiliate, (req: OperationsRouteRequest, res) => {
    noStore(res);
    const acting = actor(req, deps, res);
    if (!acting) return;
    relay(res, deps.affiliates.login(acting.id));
  });

  app.post("/api/research/affiliate/links", affiliate, (req: OperationsRouteRequest, res) => {
    const acting = actor(req, deps, res);
    const idempotencyKey = key(req);
    if (!acting || !idempotencyKey) {
      if (!idempotencyKey) res.status(400).json({ ok: false, code: "invalid_input", message: "Idempotency-Key is required." });
      return;
    }
    relay(
      res,
      deps.affiliates.issueLink({
        affiliateId: String((req.body as { affiliateId?: unknown }).affiliateId ?? ""),
        campaign: typeof (req.body as { campaign?: unknown }).campaign === "string" ? String((req.body as { campaign?: unknown }).campaign) : null,
        actor: acting,
        idempotencyKey,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/research/professional-accounts/apply", (req, res) => {
    const body = req.body as Record<string, unknown>;
    const idempotencyKey = key(req);
    if (!idempotencyKey || !Array.isArray(body.programs)) {
      res.status(400).json({ ok: false, code: "invalid_input", message: "Idempotency-Key and programs are required." });
      return;
    }
    relay(
      res,
      deps.professionals.apply({
        id: String(body.id ?? ""),
        accountType: body.accountType === "practitioner" ? "practitioner" : "professional",
        organizationName: String(body.organizationName ?? ""),
        contactEmail: String(body.contactEmail ?? ""),
        programs: body.programs.map(String) as ProfessionalProgram[],
        proposedEconomics:
          body.proposedEconomics && typeof body.proposedEconomics === "object"
            ? (body.proposedEconomics as Record<string, unknown>)
            : undefined,
        idempotencyKey,
        occurredAt: deps.now(),
      }),
    );
  });

  app.get("/api/admin/research/professional-accounts", admin, (req: OperationsRouteRequest, res) => {
    noStore(res);
    const acting = actor(req, deps, res);
    if (!acting) return;
    const state = typeof req.query.state === "string" ? (req.query.state as ProfessionalLifecycle) : undefined;
    relay(res, deps.professionals.list(acting, state));
  });

  app.get("/api/admin/research/operations/crm", admin, (req: OperationsRouteRequest, res) => {
    noStore(res);
    const acting = actor(req, deps, res);
    if (!acting) return;
    relay(res, deps.crm.list(acting, undefined, typeof req.query.search === "string" ? req.query.search : undefined));
  });

  app.get("/api/admin/research/operations/outbox", admin, (req, res) => {
    noStore(res);
    const status = typeof req.query.status === "string" ? (req.query.status as NotificationStatus) : undefined;
    res.json({ ok: true, notifications: deps.outbox.list(status) });
  });
}

export function attachOperationsActor(actorValue: OperationsActor, memberRef?: string): RequestHandler {
  return (req: OperationsRouteRequest, _res: Response, next: NextFunction) => {
    req.operationsActor = actorValue;
    req.operationsMemberRef = memberRef;
    next();
  };
}
