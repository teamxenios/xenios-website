import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import type { AffiliateService } from "./affiliate-service";
import type { CrmService } from "./crm-service";
import type { FulfillmentService, MitchQueue } from "./fulfillment-service";
import type { NotificationOutbox, NotificationStatus } from "./notification-outbox";
import type { OperationsDashboardInput } from "./operations-dashboard";
import { buildOperationsDashboard } from "./operations-dashboard";
import type {
  OperationsTaskPriority,
  OperationsTaskResult,
  OperationsTaskStatus,
  OperationsTask,
} from "./operations-tasks";
import type { ProfessionalAccountService, ProfessionalLifecycle, ProfessionalProgram } from "./professional-accounts";
import type { OperationsActor } from "./state-machines";

type Awaitable<T> = T | Promise<T>;
type AsyncCompatibleMethod<T extends (...args: any[]) => any> = (
  ...args: Parameters<T>
) => Awaitable<Awaited<ReturnType<T>>>;

export interface OperationsFulfillmentPort {
  listMitchQueue: AsyncCompatibleMethod<FulfillmentService["listMitchQueue"]>;
  trackingForMember: AsyncCompatibleMethod<FulfillmentService["trackingForMember"]>;
  acknowledge: AsyncCompatibleMethod<FulfillmentService["acknowledge"]>;
  setExpectedDate: AsyncCompatibleMethod<FulfillmentService["setExpectedDate"]>;
  allocateExact: AsyncCompatibleMethod<FulfillmentService["allocateExact"]>;
  beginPicking: AsyncCompatibleMethod<FulfillmentService["beginPicking"]>;
  pack: AsyncCompatibleMethod<FulfillmentService["pack"]>;
  addShippingLabel: AsyncCompatibleMethod<FulfillmentService["addShippingLabel"]>;
  ship: AsyncCompatibleMethod<FulfillmentService["ship"]>;
  reportException: AsyncCompatibleMethod<FulfillmentService["reportException"]>;
  addNote: AsyncCompatibleMethod<FulfillmentService["addNote"]>;
}

export interface OperationsAffiliatePort {
  login: AsyncCompatibleMethod<AffiliateService["login"]>;
  issueLink: AsyncCompatibleMethod<AffiliateService["issueLink"]>;
}

export interface OperationsProfessionalPort {
  apply: AsyncCompatibleMethod<ProfessionalAccountService["apply"]>;
  list: AsyncCompatibleMethod<ProfessionalAccountService["list"]>;
  review: AsyncCompatibleMethod<ProfessionalAccountService["review"]>;
}

export interface OperationsCrmPort {
  list: AsyncCompatibleMethod<CrmService["list"]>;
}

export interface OperationsOutboxPort {
  list: AsyncCompatibleMethod<NotificationOutbox["list"]>;
}

export interface OperationsTasksPort {
  list(actor: OperationsActor, status?: OperationsTaskStatus): Awaitable<OperationsTaskResult<OperationsTask[]>>;
  create(input: {
    id: string;
    title: string;
    description?: string | null;
    priority?: OperationsTaskPriority;
    assignedTo?: string | null;
    sourceType?: string | null;
    sourceId?: string | null;
    dueAt?: string | null;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): Awaitable<OperationsTaskResult<OperationsTask>>;
  transition(input: {
    taskId: string;
    to: OperationsTaskStatus;
    assignedTo?: string | null;
    expectedVersion: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): Awaitable<OperationsTaskResult<OperationsTask>>;
}

export type PartnerPortalSurface =
  | "conversions"
  | "leads"
  | "commissions"
  | "payouts"
  | "resources"
  | "training"
  | "campaigns"
  | "events"
  | "organizations"
  | "compliance"
  | "onboarding"
  | "security_sessions";

export type PartnerPortalRequestKind = "campaign" | "event" | "organization" | "compliance";

export interface OperationsPartnerPortalPort {
  read(
    surface: PartnerPortalSurface,
    authUserId: string,
    currentSessionKey?: string | null,
  ): Awaitable<Record<string, unknown>>;
  submit(
    kind: PartnerPortalRequestKind,
    authUserId: string,
    body: unknown,
    occurredAt: Date,
  ): Awaitable<{ ok: boolean; message?: string; code?: string; idempotent?: boolean }>;
}

export interface OperationsRouteRequest extends Request {
  operationsActor?: OperationsActor;
  operationsMemberRef?: string;
  operationsSessionKey?: string;
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
  fulfillment: OperationsFulfillmentPort;
  affiliates: OperationsAffiliatePort;
  professionals: OperationsProfessionalPort;
  partnerPortal: OperationsPartnerPortalPort;
  crm: OperationsCrmPort;
  tasks: OperationsTasksPort;
  outbox: OperationsOutboxPort;
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

  app.get("/api/operations/mitch/queues/:queue", logistics, async (req, res) => {
    noStore(res);
    const queue = String(req.params.queue) as MitchQueue;
    if (!MITCH_QUEUES.includes(queue)) {
      res.status(400).json({ ok: false, code: "invalid_input", message: "Unknown Mitch queue." });
      return;
    }
    res.json({ ok: true, queue, rows: await deps.fulfillment.listMitchQueue(queue, deps.now()) });
  });

  app.get("/api/research/orders/:orderId/tracking", member, async (req: OperationsRouteRequest, res) => {
    noStore(res);
    const memberRef = deps.guards.memberRefOf(req);
    const tracking = memberRef
      ? await deps.fulfillment.trackingForMember(String(req.params.orderId), memberRef)
      : null;
    if (!tracking) {
      // Ownership failures are indistinguishable from absence.
      res.status(404).json({ ok: false, code: "not_found", message: "Order tracking not found." });
      return;
    }
    res.json({ ok: true, tracking });
  });

  app.post("/api/operations/mitch/orders/:orderId/acknowledge", logistics, async (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    if (!command || !acting) return;
    relay(
      res,
      await deps.fulfillment.acknowledge({
        orderId: String(req.params.orderId),
        ...command,
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/expected-date", logistics, async (req: OperationsRouteRequest, res) => {
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
      await deps.fulfillment.setExpectedDate({
        orderId: String(req.params.orderId),
        ...command,
        expectedAt,
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/allocate", logistics, async (req: OperationsRouteRequest, res) => {
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
      await deps.fulfillment.allocateExact({
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

  app.post("/api/operations/mitch/orders/:orderId/pick", logistics, async (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    if (!command || !acting) return;
    relay(
      res,
      await deps.fulfillment.beginPicking({
        orderId: String(req.params.orderId),
        ...command,
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/pack", logistics, async (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    if (!command || !acting) return;
    relay(
      res,
      await deps.fulfillment.pack({
        orderId: String(req.params.orderId),
        ...command,
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/label", logistics, async (req: OperationsRouteRequest, res) => {
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
      await deps.fulfillment.addShippingLabel({
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

  app.post("/api/operations/mitch/orders/:orderId/ship", logistics, async (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    if (!command || !acting) return;
    relay(
      res,
      await deps.fulfillment.ship({
        orderId: String(req.params.orderId),
        ...command,
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/exception", logistics, async (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    const body = req.body as Record<string, unknown>;
    if (!command || !acting) return;
    relay(
      res,
      await deps.fulfillment.reportException({
        orderId: String(req.params.orderId),
        ...command,
        kind: String(body.kind ?? "other") as Parameters<OperationsFulfillmentPort["reportException"]>[0]["kind"],
        severity: String(body.severity ?? "normal") as Parameters<OperationsFulfillmentPort["reportException"]>[0]["severity"],
        detail: String(body.detail ?? ""),
        actor: acting,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/operations/mitch/orders/:orderId/note", logistics, async (req: OperationsRouteRequest, res) => {
    const command = requireCommand(req, res);
    const acting = actor(req, deps, res);
    const body = req.body as Record<string, unknown>;
    if (!command || !acting) return;
    relay(
      res,
      await deps.fulfillment.addNote({
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

  app.get("/api/research/affiliate/dashboard", affiliate, async (req: OperationsRouteRequest, res) => {
    noStore(res);
    const acting = actor(req, deps, res);
    if (!acting) return;
    relay(res, await deps.affiliates.login(acting.id));
  });

  app.post("/api/research/affiliate/links", affiliate, async (req: OperationsRouteRequest, res) => {
    const acting = actor(req, deps, res);
    const idempotencyKey = key(req);
    if (!acting || !idempotencyKey) {
      if (!idempotencyKey) res.status(400).json({ ok: false, code: "invalid_input", message: "Idempotency-Key is required." });
      return;
    }
    relay(
      res,
      await deps.affiliates.issueLink({
        affiliateId: String((req.body as { affiliateId?: unknown }).affiliateId ?? ""),
        campaign: typeof (req.body as { campaign?: unknown }).campaign === "string" ? String((req.body as { campaign?: unknown }).campaign) : null,
        actor: acting,
        idempotencyKey,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post("/api/research/professional-accounts/apply", async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const idempotencyKey = key(req);
    if (!idempotencyKey || !Array.isArray(body.programs)) {
      res.status(400).json({ ok: false, code: "invalid_input", message: "Idempotency-Key and programs are required." });
      return;
    }
    relay(
      res,
      await deps.professionals.apply({
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

  app.get("/api/admin/research/professional-accounts", admin, async (req: OperationsRouteRequest, res) => {
    noStore(res);
    const acting = actor(req, deps, res);
    if (!acting) return;
    const state = typeof req.query.state === "string" ? (req.query.state as ProfessionalLifecycle) : undefined;
    relay(res, await deps.professionals.list(acting, state));
  });

  app.post(
    "/api/admin/research/professional-accounts/:accountId/transition",
    admin,
    async (req: OperationsRouteRequest, res) => {
      const acting = actor(req, deps, res);
      const command = requireCommand(req, res);
      if (!acting || !command) return;
      const body = req.body as Record<string, unknown>;
      relay(
        res,
        await deps.professionals.review({
          accountId: String(req.params.accountId),
          to: String(body.to) as Exclude<ProfessionalLifecycle, "applied">,
          expectedVersion: command.expectedVersion,
          actor: acting,
          agreementVersion:
            typeof body.agreementVersion === "string" ? body.agreementVersion : undefined,
          idempotencyKey: command.idempotencyKey,
          occurredAt: deps.now(),
        }),
      );
    },
  );

  app.get("/api/admin/research/operations/crm", admin, async (req: OperationsRouteRequest, res) => {
    noStore(res);
    const acting = actor(req, deps, res);
    if (!acting) return;
    relay(res, await deps.crm.list(acting, undefined, typeof req.query.search === "string" ? req.query.search : undefined));
  });

  app.get("/api/admin/research/operations/tasks", admin, async (req: OperationsRouteRequest, res) => {
    noStore(res);
    const acting = actor(req, deps, res);
    if (!acting) return;
    const status =
      typeof req.query.status === "string" ? (req.query.status as OperationsTaskStatus) : undefined;
    relay(res, await deps.tasks.list(acting, status));
  });

  app.post("/api/admin/research/operations/tasks", admin, async (req: OperationsRouteRequest, res) => {
    const acting = actor(req, deps, res);
    const idempotencyKey = key(req);
    const body = req.body as Record<string, unknown>;
    if (!acting || !idempotencyKey) {
      if (!idempotencyKey) {
        res.status(400).json({ ok: false, code: "invalid_input", message: "Idempotency-Key is required." });
      }
      return;
    }
    relay(
      res,
      await deps.tasks.create({
        id: String(body.id ?? ""),
        title: String(body.title ?? ""),
        description: typeof body.description === "string" ? body.description : null,
        priority: String(body.priority ?? "normal") as OperationsTaskPriority,
        assignedTo: typeof body.assignedTo === "string" ? body.assignedTo : null,
        sourceType: typeof body.sourceType === "string" ? body.sourceType : null,
        sourceId: typeof body.sourceId === "string" ? body.sourceId : null,
        dueAt: typeof body.dueAt === "string" ? body.dueAt : null,
        actor: acting,
        idempotencyKey,
        occurredAt: deps.now(),
      }),
    );
  });

  app.post(
    "/api/admin/research/operations/tasks/:taskId/transition",
    admin,
    async (req: OperationsRouteRequest, res) => {
      const acting = actor(req, deps, res);
      const command = requireCommand(req, res);
      const body = req.body as Record<string, unknown>;
      if (!acting || !command) return;
      relay(
        res,
        await deps.tasks.transition({
          taskId: String(req.params.taskId),
          to: String(body.to) as OperationsTaskStatus,
          assignedTo: typeof body.assignedTo === "string" ? body.assignedTo : undefined,
          ...command,
          actor: acting,
          occurredAt: deps.now(),
        }),
      );
    },
  );

  app.get("/api/admin/research/operations/outbox", admin, async (req, res) => {
    noStore(res);
    const status = typeof req.query.status === "string" ? (req.query.status as NotificationStatus) : undefined;
    res.json({ ok: true, notifications: await deps.outbox.list(status) });
  });

  const partnerRead =
    (surface: PartnerPortalSurface) => async (req: OperationsRouteRequest, res: Response) => {
      noStore(res);
      const acting = actor(req, deps, res);
      if (!acting) return;
      try {
        res.json(await deps.partnerPortal.read(surface, acting.id, req.operationsSessionKey ?? null));
      } catch (error) {
        console.error(`[research partner] ${surface} load failed:`, error);
        res.status(500).json({ ok: false, code: "internal_error", message: "Unable to load this partner surface." });
      }
    };

  const partnerSubmit =
    (kind: PartnerPortalRequestKind) => async (req: OperationsRouteRequest, res: Response) => {
      noStore(res);
      const acting = actor(req, deps, res);
      if (!acting) return;
      try {
        const result = await deps.partnerPortal.submit(kind, acting.id, req.body, deps.now());
        if (!result.ok) {
          relay(res, result);
          return;
        }
        res.status(result.idempotent ? 200 : 202).json(result);
      } catch (error) {
        console.error(`[research partner] ${kind} request failed:`, error);
        res.status(500).json({ ok: false, code: "internal_error", message: "Unable to submit this partner request." });
      }
    };

  // These are the 16 literal adapter paths that previously had no server
  // registration. Literal calls keep generated route inventories authoritative.
  app.get("/api/research/partner/conversions", affiliate, partnerRead("conversions"));
  app.get("/api/research/partner/leads", affiliate, partnerRead("leads"));
  app.get("/api/research/partner/commissions", affiliate, partnerRead("commissions"));
  app.get("/api/research/partner/payouts", affiliate, partnerRead("payouts"));
  app.get("/api/research/partner/resources", affiliate, partnerRead("resources"));
  app.get("/api/research/partner/training", affiliate, partnerRead("training"));
  app.get("/api/research/partner/campaigns", affiliate, partnerRead("campaigns"));
  app.post("/api/research/partner/campaigns/request", affiliate, partnerSubmit("campaign"));
  app.get("/api/research/partner/events", affiliate, partnerRead("events"));
  app.post("/api/research/partner/events/request", affiliate, partnerSubmit("event"));
  app.get("/api/research/partner/organizations", affiliate, partnerRead("organizations"));
  app.post("/api/research/partner/organizations/request", affiliate, partnerSubmit("organization"));
  app.get("/api/research/partner/compliance", affiliate, partnerRead("compliance"));
  app.post("/api/research/partner/compliance/submissions", affiliate, partnerSubmit("compliance"));
  app.get("/api/research/partner/onboarding", affiliate, partnerRead("onboarding"));
  app.get("/api/research/partner/security/sessions", affiliate, partnerRead("security_sessions"));
}

export function attachOperationsActor(actorValue: OperationsActor, memberRef?: string): RequestHandler {
  return (req: OperationsRouteRequest, _res: Response, next: NextFunction) => {
    req.operationsActor = actorValue;
    req.operationsMemberRef = memberRef;
    next();
  };
}
