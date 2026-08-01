import type { NextFunction, Request, Response } from "express";
import {
  CARE_REVIEW_ACTION_CAPABILITY,
  type CareClinicalCapability,
  type CareClinicalCapabilityFlags,
} from "@shared/care/clinical-actions";
import {
  CARE_CLINICIAN_REVIEW_ACTIONS,
  type CareClinicianReviewAction,
} from "@shared/care/clinician-review";
import type { CarePrincipal } from "@shared/care/contracts";
import { readCareClinicalCapabilityFlags } from "./review-detail";

/**
 * The Care clinical write chokepoint.
 *
 * Before this module the five clinical capability flags were read on exactly
 * one server path, `review-detail.ts`, and every function there is a
 * projection: the flags decided whether a control was drawn as usable, and
 * nothing else. A crafted request that skipped the browser reached the
 * repository regardless. This module is the server side of that promise.
 *
 * Three independent gates now apply to a clinical operation, and all three
 * must be open:
 *   1. `requireCarePermission`, which resolves the principal and the role
 *      permission and 401s or 403s before anything else runs,
 *   2. the Care capability status, which requires the approved database record
 *      plus CARE_ENABLED and CARE_ENABLE_APPROVED and is checked inside
 *      `requireCarePermission`, and
 *   3. the specific clinical capability flag checked here.
 * This module adds the third gate. It never replaces or relaxes the first two.
 *
 * Everything here fails closed:
 *   - an operation that is not in the map refuses,
 *   - a review action that is not a known clinician action refuses,
 *   - a flag that is missing, empty, or mistyped refuses, because
 *     `readCareClinicalCapabilityFlags` only treats the exact string "true"
 *     as enabled,
 *   - the refusal happens before the repository, the service, or the RPC is
 *     reached, so a refused operation performs no write at all.
 */

/** Every Care operation that carries a real clinical effect or real clinical content. */
export const CARE_CLINICAL_OPERATIONS = [
  // Reads that would return a real person's clinical content.
  "intake.read",
  "prescription.read_self",
  "pharmacy.read_orders",
  // Clinician and patient clinical writes.
  "intake.start",
  "intake.autosave",
  "intake.submit",
  "appointment.clinician_complete",
  "review.action",
  "prescription.create_draft",
  "prescription.sign",
  "prescription.assign_pharmacy",
  "pharmacy.order_action",
  "pharmacy.resolve_clarification",
] as const;

export type CareClinicalOperation = (typeof CARE_CLINICAL_OPERATIONS)[number];

/**
 * Which of the five capabilities each operation depends on.
 *
 * `review.action` is deliberately absent. A clinician review action carries
 * its capability per action in `CARE_REVIEW_ACTION_CAPABILITY`, because
 * requesting information is an outbound communication while approving is a
 * provider action, and collapsing them here would gate one of them wrongly.
 */
const OPERATION_CAPABILITY: Readonly<
  Record<Exclude<CareClinicalOperation, "review.action">, CareClinicalCapability>
> = {
  "intake.read": "real_patient_data",
  "prescription.read_self": "real_patient_data",
  // The assigned fulfillment worklist. Each order carries the prescription
  // content it is to be dispensed against (formulation, concentration, route,
  // quantity, directions, refills), joined in by the repository, so this read
  // returns the same clinical field set as the patient prescription read and
  // is gated on the same capability.
  "pharmacy.read_orders": "real_patient_data",
  "intake.start": "real_patient_data",
  "intake.autosave": "real_patient_data",
  "intake.submit": "real_patient_data",
  "appointment.clinician_complete": "provider_actions",
  "prescription.create_draft": "prescribing",
  "prescription.sign": "prescribing",
  "prescription.assign_pharmacy": "clinical_fulfillment",
  "pharmacy.order_action": "clinical_fulfillment",
  "pharmacy.resolve_clarification": "clinical_fulfillment",
};

export type CareClinicalRefusalReason =
  | "unknown_operation"
  | "unknown_review_action"
  | "capability_disabled";

/**
 * The request the gate is asked about. `operation` and `reviewAction` are
 * typed as unknown-friendly strings on purpose: a caller that passes a value
 * outside the closed set must be refused, not accepted by a type assertion.
 */
export interface CareClinicalWriteRequest {
  operation: string;
  reviewAction?: unknown;
}

export interface CareClinicalWriteDecision {
  allowed: boolean;
  operation: string;
  capability: CareClinicalCapability | null;
  reason: CareClinicalRefusalReason | null;
}

/** One refusal, recorded. Deliberately carries no patient or clinical content. */
export interface CareClinicalRefusalEvent {
  operation: string;
  reviewAction: string | null;
  capability: CareClinicalCapability | null;
  reason: CareClinicalRefusalReason;
  actorSubjectId: string | null;
  surface: "http" | "background";
  occurredAt: string;
}

export interface CareClinicalWriteGateOptions {
  /** Swappable only for tests. Production reads the real environment. */
  readFlags?: () => CareClinicalCapabilityFlags;
  recordRefusal?: (event: CareClinicalRefusalEvent) => void;
  now?: () => Date;
}

export const CARE_CLINICAL_REFUSED_STATUS = 403;
export const CARE_CLINICAL_REFUSED_CODE = "care_clinical_capability_disabled";
export const CARE_CLINICAL_REFUSED_MESSAGE =
  "This clinical capability is turned off, so the request was not carried out.";

/** The audit line for a refusal. One line, no patient or clinical content. */
export const CARE_CLINICAL_REFUSAL_LOG_PREFIX = "care_clinical_write_refused";

function isReviewAction(value: unknown): value is CareClinicianReviewAction {
  return (
    typeof value === "string" &&
    (CARE_CLINICIAN_REVIEW_ACTIONS as readonly string[]).includes(value)
  );
}

function isKnownOperation(value: string): value is CareClinicalOperation {
  return (CARE_CLINICAL_OPERATIONS as readonly string[]).includes(value);
}

/**
 * The one decision function. Pure, deterministic, and total: every input
 * produces a decision, and every input that is not explicitly allowed is
 * refused.
 */
export function evaluateCareClinicalWrite(
  input: CareClinicalWriteRequest,
  flags: CareClinicalCapabilityFlags,
): CareClinicalWriteDecision {
  const refuse = (
    reason: CareClinicalRefusalReason,
    capability: CareClinicalCapability | null,
  ): CareClinicalWriteDecision => ({
    allowed: false,
    operation: input.operation,
    capability,
    reason,
  });

  if (!isKnownOperation(input.operation)) {
    return refuse("unknown_operation", null);
  }

  let capability: CareClinicalCapability;
  if (input.operation === "review.action") {
    if (!isReviewAction(input.reviewAction)) {
      return refuse("unknown_review_action", null);
    }
    capability = CARE_REVIEW_ACTION_CAPABILITY[input.reviewAction];
  } else {
    capability = OPERATION_CAPABILITY[input.operation];
  }

  // A capability that is absent from the flag object is treated as off, so a
  // partially built flag object cannot open a gate. The check is on an OWN
  // property and against the boolean `true` exactly, so a value inherited
  // through the prototype chain cannot open a gate either: neither a polluted
  // `Object.prototype` nor a flag object built with `Object.create` can make
  // this return allowed, and no truthy-but-not-true value ("true", 1, {}) can.
  if (!Object.prototype.hasOwnProperty.call(flags, capability)) {
    return refuse("capability_disabled", capability);
  }
  if (flags[capability] !== true) {
    return refuse("capability_disabled", capability);
  }

  return {
    allowed: true,
    operation: input.operation,
    capability,
    reason: null,
  };
}

function defaultRecordRefusal(event: CareClinicalRefusalEvent): void {
  // Structured, single line, and free of patient identifiers and clinical
  // content by construction: the event type has no field that could carry any.
  console.warn(
    `${CARE_CLINICAL_REFUSAL_LOG_PREFIX} ${JSON.stringify({
      operation: event.operation,
      reviewAction: event.reviewAction,
      capability: event.capability,
      reason: event.reason,
      actorSubjectId: event.actorSubjectId,
      surface: event.surface,
      occurredAt: event.occurredAt,
    })}`,
  );
}

function buildRefusalEvent(input: {
  decision: CareClinicalWriteDecision;
  reviewAction: unknown;
  actorSubjectId: string | null;
  surface: "http" | "background";
  occurredAt: string;
}): CareClinicalRefusalEvent {
  return {
    operation: input.decision.operation,
    reviewAction: isReviewAction(input.reviewAction) ? input.reviewAction : null,
    capability: input.decision.capability,
    reason: input.decision.reason ?? "unknown_operation",
    actorSubjectId: input.actorSubjectId,
    surface: input.surface,
    occurredAt: input.occurredAt,
  };
}

function emitRefusal(
  event: CareClinicalRefusalEvent,
  options: CareClinicalWriteGateOptions,
): void {
  const record = options.recordRefusal ?? defaultRecordRefusal;
  try {
    record(event);
  } catch {
    // A failing audit sink must never turn a refusal into a permitted write.
    // The refusal already happened; swallowing here keeps it that way.
  }
}

export class CareClinicalCapabilityDisabledError extends Error {
  readonly decision: CareClinicalWriteDecision;

  constructor(decision: CareClinicalWriteDecision) {
    super(`care clinical operation refused: ${decision.reason}`);
    this.name = "CareClinicalCapabilityDisabledError";
    this.decision = decision;
  }
}

/**
 * The chokepoint for any caller that is not an Express route: a background
 * job, a queue consumer, a reconciliation pass, or a service method invoked
 * outside a request. `run` is only ever invoked once the decision allows it,
 * so a refused operation reaches no repository and no RPC.
 *
 * There is no Care background job today. This is the seam any future one has
 * to use, so the flags cannot be bypassed simply by leaving HTTP behind.
 */
export async function runCareClinicalWrite<T>(
  input: CareClinicalWriteRequest & { actorSubjectId?: string | null },
  run: () => Promise<T>,
  options: CareClinicalWriteGateOptions = {},
): Promise<T> {
  const flags = (options.readFlags ?? readCareClinicalCapabilityFlags)();
  const decision = evaluateCareClinicalWrite(input, flags);
  if (!decision.allowed) {
    emitRefusal(
      buildRefusalEvent({
        decision,
        reviewAction: input.reviewAction,
        actorSubjectId: input.actorSubjectId ?? null,
        surface: "background",
        occurredAt: (options.now ?? (() => new Date()))().toISOString(),
      }),
      options,
    );
    throw new CareClinicalCapabilityDisabledError(decision);
  }
  return run();
}

function actorFrom(res: Response): string | null {
  const principal = res.locals.carePrincipal as CarePrincipal | undefined;
  return principal?.subjectId ?? null;
}

/**
 * The registry of middlewares this module actually built, and the operation
 * each one gates.
 *
 * It is module private, has exactly one writer (`requireCareClinicalCapability`,
 * below), and is keyed by the function object itself, so membership is proof of
 * construction rather than proof of resemblance. Nothing outside this file can
 * add an entry, which is the property the route coverage test depends on.
 */
const CARE_CLINICAL_GATES = new WeakMap<object, CareClinicalOperation>();

/**
 * The Express chokepoint. Mount it directly after `requireCarePermission` on
 * every clinical route, so the order is: capability status, then principal and
 * permission, then the clinical capability flag, then the handler. The handler
 * is the only thing that touches a repository, so a refusal here is a refusal
 * to write.
 *
 * `reviewActionFrom` lets the review action route hand the requested action to
 * the gate before the body is parsed. An action that is not a known clinician
 * action is answered 400, because such a request is malformed rather than
 * blocked by a capability, and it still never reaches the repository.
 */
export function requireCareClinicalCapability(
  operation: CareClinicalOperation,
  options: CareClinicalWriteGateOptions = {},
  reviewActionFrom: (req: Request) => unknown = () => null,
): CareClinicalGateMiddleware {
  const middleware = function careClinicalCapabilityGate(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const reviewAction = reviewActionFrom(req);
    const flags = (options.readFlags ?? readCareClinicalCapabilityFlags)();
    const decision = evaluateCareClinicalWrite({ operation, reviewAction }, flags);
    if (decision.allowed) return next();

    emitRefusal(
      buildRefusalEvent({
        decision,
        reviewAction,
        actorSubjectId: actorFrom(res),
        surface: "http",
        occurredAt: (options.now ?? (() => new Date()))().toISOString(),
      }),
      options,
    );

    if (decision.reason === "unknown_review_action") {
      return res.status(400).json({ ok: false, code: "care_invalid_request" });
    }
    return res.status(CARE_CLINICAL_REFUSED_STATUS).json({
      ok: false,
      code: CARE_CLINICAL_REFUSED_CODE,
      capability: decision.capability,
      message: CARE_CLINICAL_REFUSED_MESSAGE,
    });
  } as CareClinicalGateMiddleware;

  // Identity, not a label. The middleware is recorded in the module-private
  // registry above at the moment this factory builds it, and that record is
  // what the coverage test reads back.
  CARE_CLINICAL_GATES.set(middleware, operation);

  // Kept as a readable tag for anyone inspecting a handler in a debugger or a
  // stack dump. It is deliberately NOT what `careClinicalGateOperationOf`
  // answers from: a plain property can be set by anything, and a look-alike
  // middleware that set it would otherwise satisfy the coverage test while
  // enforcing nothing.
  middleware.careClinicalOperation = operation;
  return middleware;
}

/**
 * The Express middleware `requireCareClinicalCapability` returns, tagged with
 * the operation it gates.
 */
export interface CareClinicalGateMiddleware {
  (req: Request, res: Response, next: NextFunction): unknown;
  careClinicalOperation: CareClinicalOperation;
}

/**
 * Which clinical operation a registered Express handler gates, or null when the
 * handler is not the centralized gate. Used by the route coverage test to prove
 * that every clinical route goes through this one guard.
 *
 * The answer comes from `CARE_CLINICAL_GATES`, a module-private WeakMap that
 * only `requireCareClinicalCapability` writes to, so it reports gate IDENTITY
 * rather than a resemblance. This matters because the coverage test is the
 * only thing standing between a newly added clinical route and an unprotected
 * production endpoint: when the answer came from a `careClinicalOperation`
 * property, a three line middleware that set that property and called `next()`
 * satisfied the whole coverage suite while gating nothing at all. A forged
 * marker now answers null, the route reads as ungated, and the classification
 * case fails by name. The registry is not exported and has no writer other
 * than the factory, so there is no way to enroll a handler the factory did not
 * build.
 */
export function careClinicalGateOperationOf(
  handler: unknown,
): CareClinicalOperation | null {
  if (typeof handler !== "function" && (typeof handler !== "object" || handler === null)) {
    return null;
  }
  const operation = CARE_CLINICAL_GATES.get(handler as object);
  return operation !== undefined && isKnownOperation(operation)
    ? operation
    : null;
}

/** Exported for the route table test, so the map cannot drift silently. */
export function careClinicalOperationCapability(
  operation: CareClinicalOperation,
): CareClinicalCapability | null {
  return operation === "review.action" ? null : OPERATION_CAPABILITY[operation];
}
