import type { Express, Request, RequestHandler, Response } from "express";
import {
  FULFILLMENT_ACTIONS,
  SUPPLIER_PERMITTED_ACTIONS,
  type FulfillmentAction,
  type FulfillmentActor,
  type FulfillmentAssignmentView,
  type FulfillmentState,
  type TransitionFulfillmentInput,
} from "@shared/research/fulfillment/contracts";
import { projectCustomerFulfillmentStatus } from "@shared/research/fulfillment/customer-status";
import type { FulfillmentOperationsPort } from "./port";
import { isFulfillmentError, type FulfillmentErrorCode } from "./errors";

/**
 * HTTP surface for the fulfillment engine. This module never mounts itself:
 * the composition root (server/index.ts, lead-owned) calls
 * `registerFulfillmentRoutes` with real authentication and persistence.
 * Every dependency that is not wired fails closed with 503, never open.
 */

export const FULFILLMENT_ADMIN_QUEUE_PATH =
  "/api/research/fulfillment/admin/assignments";
export const FULFILLMENT_ADMIN_ASSIGN_PATH =
  "/api/research/fulfillment/admin/assignments";
export const FULFILLMENT_ADMIN_TRANSITION_PATH =
  "/api/research/fulfillment/admin/assignments/:assignmentId/transition";
export const FULFILLMENT_SUPPLIER_QUEUE_PATH =
  "/api/research/fulfillment/supplier/assignments";
export const FULFILLMENT_SUPPLIER_TRANSITION_PATH =
  "/api/research/fulfillment/supplier/assignments/:assignmentId/transition";
export const FULFILLMENT_CUSTOMER_STATUS_PATH =
  "/api/research/fulfillment/orders/:orderReference/status";

type MaybePromise<T> = T | Promise<T>;

export interface FulfillmentCustomerReadDependencies {
  /** Server-derived member identity; never taken from the request body. */
  resolveMemberId(req: Request): MaybePromise<string | null>;
  /** Must only return an assignment the member actually owns. */
  findAssignmentForMember(
    memberId: string,
    orderReference: string,
  ): Promise<FulfillmentAssignmentView | null>;
}

export interface FulfillmentHttpDependencies {
  /** The validated service from createFulfillmentOperationsService. */
  service: FulfillmentOperationsPort;
  /** Admin wall, e.g. requireSupabaseAdmin. Runs before any admin handler. */
  requireAdmin: RequestHandler;
  /** Maps the authenticated admin request to an internal fulfillment actor. */
  resolveInternalActor(req: Request): MaybePromise<FulfillmentActor | null>;
  /**
   * Maps an authenticated supplier operator to a supplier-scoped actor.
   * Absent until the supplier workspace lands; supplier routes answer 503.
   */
  resolveSupplierActor?(req: Request): MaybePromise<FulfillmentActor | null>;
  /** Customer-safe status reads. Absent -> the status route answers 503. */
  customerReads?: FulfillmentCustomerReadDependencies;
  /** Injectable clock; commands are stamped server-side, never by clients. */
  now?(): string;
}

const ERROR_STATUS: Record<FulfillmentErrorCode, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  VERSION_CONFLICT: 409,
  INVALID_TRANSITION: 409,
  IDEMPOTENCY_REUSED: 409,
  ALREADY_ASSIGNED: 409,
  UNPAID_ORDER: 409,
};

function sendError(res: Response, error: unknown): void {
  if (isFulfillmentError(error)) {
    res.status(ERROR_STATUS[error.code]).json({
      ok: false,
      code: error.code,
      message: error.message,
    });
    return;
  }
  const message = error instanceof Error ? error.message : "Invalid request.";
  res.status(422).json({ ok: false, code: "INVALID_INPUT", message });
}

function notConfigured(res: Response, capability: string): void {
  res.status(503).json({
    ok: false,
    code: "FULFILLMENT_NOT_CONFIGURED",
    message: `${capability} is not wired in this deployment; refusing to guess.`,
  });
}

/** Express route params can widen to string[]; commands take a single value. */
function pathParam(req: Request, key: string): string {
  const value = (req.params as Record<string, string | string[]>)[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

function optionalStringField(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseStates(value: unknown): FulfillmentState[] | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const requested = value.split(",").map((item) => item.trim());
  const known = new Set<string>([
    "assigned", "acknowledged", "picking", "packed", "tracking_created",
    "shipped", "delivered", "exception", "returned", "replacement",
    "refunded", "damaged", "lost", "recalled", "cancelled",
  ]);
  const states = requested.filter((item): item is FulfillmentState =>
    known.has(item),
  );
  return states.length > 0 ? states : undefined;
}

function transitionInputFromRequest(
  actor: FulfillmentActor,
  assignmentId: string,
  body: Record<string, unknown>,
  at: string,
): TransitionFulfillmentInput {
  const action = stringField(body, "action") as FulfillmentAction;
  const expectedVersion = body.expectedVersion;
  return {
    actor,
    assignmentId,
    action,
    expectedVersion: typeof expectedVersion === "number" ? expectedVersion : -1,
    idempotencyKey: stringField(body, "idempotencyKey"),
    at,
    expectedShipAt: optionalStringField(body, "expectedShipAt"),
    labelReference: optionalStringField(body, "labelReference"),
    carrier: optionalStringField(body, "carrier"),
    service: optionalStringField(body, "service"),
    trackingReference: optionalStringField(body, "trackingReference"),
    reason: optionalStringField(body, "reason"),
  };
}

export function registerFulfillmentRoutes(
  app: Express,
  deps: FulfillmentHttpDependencies,
): void {
  const now = deps.now ?? (() => new Date().toISOString());

  const withInternalActor = (
    handler: (req: Request, res: Response, actor: FulfillmentActor) => Promise<void>,
  ): RequestHandler => {
    return async (req, res) => {
      try {
        const actor = await deps.resolveInternalActor(req);
        if (!actor || actor.kind !== "internal") {
          res.status(403).json({
            ok: false,
            code: "FORBIDDEN",
            message: "An internal fulfillment actor is required.",
          });
          return;
        }
        await handler(req, res, actor);
      } catch (error) {
        sendError(res, error);
      }
    };
  };

  const withSupplierActor = (
    handler: (req: Request, res: Response, actor: FulfillmentActor) => Promise<void>,
  ): RequestHandler => {
    return async (req, res) => {
      if (!deps.resolveSupplierActor) {
        notConfigured(res, "Supplier fulfillment access");
        return;
      }
      try {
        const actor = await deps.resolveSupplierActor(req);
        if (!actor || actor.kind !== "supplier") {
          res.status(401).json({
            ok: false,
            code: "UNAUTHENTICATED",
            message: "A supplier operator identity is required.",
          });
          return;
        }
        await handler(req, res, actor);
      } catch (error) {
        sendError(res, error);
      }
    };
  };

  app.get(
    FULFILLMENT_ADMIN_QUEUE_PATH,
    deps.requireAdmin,
    withInternalActor(async (req, res, actor) => {
      const limitRaw = req.query.limit;
      const limit =
        typeof limitRaw === "string" && /^\d{1,3}$/.test(limitRaw)
          ? Number(limitRaw)
          : undefined;
      const assignments = await deps.service.listAssignments({
        actor,
        states: parseStates(req.query.states),
        ...(limit !== undefined ? { limit } : {}),
      });
      res.json({ ok: true, assignments });
    }),
  );

  app.post(
    FULFILLMENT_ADMIN_ASSIGN_PATH,
    deps.requireAdmin,
    withInternalActor(async (req, res, actor) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const allocations = Array.isArray(body.allocations)
        ? (body.allocations as Array<Record<string, unknown>>).map((item) => ({
            fulfillmentLineId: stringField(item, "fulfillmentLineId"),
            reservationId: stringField(item, "reservationId"),
            reservationAllocationId: stringField(item, "reservationAllocationId"),
          }))
        : [];
      const result = await deps.service.assign({
        actor,
        supplierId: stringField(body, "supplierId"),
        supplierOfferId: stringField(body, "supplierOfferId"),
        fulfillmentOrderId: stringField(body, "fulfillmentOrderId"),
        allocations,
        expectedVersion: 0,
        idempotencyKey: stringField(body, "idempotencyKey"),
        at: now(),
      });
      res.status(result.idempotentReplay ? 200 : 201).json({ ok: true, result });
    }),
  );

  app.post(
    FULFILLMENT_ADMIN_TRANSITION_PATH,
    deps.requireAdmin,
    withInternalActor(async (req, res, actor) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const action = stringField(body, "action");
      if (!(FULFILLMENT_ACTIONS as readonly string[]).includes(action)) {
        res.status(422).json({
          ok: false,
          code: "INVALID_INPUT",
          message: "Unknown fulfillment action.",
        });
        return;
      }
      const result = await deps.service.transition(
        transitionInputFromRequest(actor, pathParam(req, "assignmentId"), body, now()),
      );
      res.json({ ok: true, result });
    }),
  );

  app.get(
    FULFILLMENT_SUPPLIER_QUEUE_PATH,
    withSupplierActor(async (req, res, actor) => {
      const assignments = await deps.service.listAssignments({
        actor,
        states: parseStates(req.query.states),
      });
      res.json({ ok: true, assignments });
    }),
  );

  app.post(
    FULFILLMENT_SUPPLIER_TRANSITION_PATH,
    withSupplierActor(async (req, res, actor) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const action = stringField(body, "action");
      if (!(SUPPLIER_PERMITTED_ACTIONS as readonly string[]).includes(action)) {
        res.status(403).json({
          ok: false,
          code: "FORBIDDEN",
          message:
            "This fulfillment disposition is an internal decision and is not available to supplier operators.",
        });
        return;
      }
      const result = await deps.service.transition(
        transitionInputFromRequest(actor, pathParam(req, "assignmentId"), body, now()),
      );
      res.json({ ok: true, result });
    }),
  );

  app.get(FULFILLMENT_CUSTOMER_STATUS_PATH, async (req, res) => {
    if (!deps.customerReads) {
      notConfigured(res, "Customer fulfillment status");
      return;
    }
    try {
      const memberId = await deps.customerReads.resolveMemberId(req);
      if (!memberId) {
        res.status(401).json({
          ok: false,
          code: "UNAUTHENTICATED",
          message: "Sign in to view fulfillment status.",
        });
        return;
      }
      const assignment = await deps.customerReads.findAssignmentForMember(
        memberId,
        pathParam(req, "orderReference"),
      );
      if (!assignment) {
        res.status(404).json({
          ok: false,
          code: "NOT_FOUND",
          message: "No fulfillment status is available for this order.",
        });
        return;
      }
      res.json({ ok: true, status: projectCustomerFulfillmentStatus(assignment) });
    } catch (error) {
      sendError(res, error);
    }
  });
}
