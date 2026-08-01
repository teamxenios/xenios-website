import type { NextFunction, Request, Response } from "express";
import {
  OPERATING_GROWTH_ROLE,
  hasOperatingPermission,
  isOperatingGrowthPrincipal,
  isOperatingPermission,
  redactOperatingPayload,
  type OperatingDeniedCapability,
  type OperatingPermission,
} from "@shared/research/operating-role";

// ---------------------------------------------------------------------------
// The guard for the scoped operating and growth role.
//
// Two properties this file exists to hold:
//
// 1. The acting principal comes ONLY from `deps.resolvePrincipal`. Nothing in
//    the request body, query string, path parameters, or headers is ever read
//    as identity or authority. A caller supplied claim is inert.
//
// 2. A refused permission produces 403 BEFORE the route handler runs, so no
//    repository, service, or provider call happens on a refused request. The
//    guard is the only thing between the request and the handler, and it does
//    not call into the domain.
// ---------------------------------------------------------------------------

export interface OperatingPrincipal {
  subjectId: string;
  roles: readonly string[];
}

export interface OperatingAccessDecision {
  actorSubjectId: string | null;
  permission: OperatingPermission | null;
  capability: OperatingDeniedCapability | null;
  outcome: "allowed" | "unauthenticated" | "forbidden";
  occurredAt: string;
}

export interface OperatingAccessDependencies {
  /** The ONLY source of the acting principal. */
  resolvePrincipal: (req: Request) => Promise<OperatingPrincipal | null>;
  recordAccessDecision: (decision: OperatingAccessDecision) => Promise<void>;
  now?: () => Date;
}

/** The one place a downstream handler may read the actor from. */
export const OPERATING_PRINCIPAL_LOCALS_KEY = "operatingPrincipal" as const;

export const OPERATING_UNAVAILABLE_RESPONSE = {
  ok: false,
  code: "operating_temporarily_unavailable",
  message: "Operating access is temporarily unavailable.",
} as const;

function noStore(res: Response): void {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

/**
 * Clears the principal channel this module owns before the resolver runs.
 *
 * Upstream middleware, a merged params object, or a hand written test app could
 * all leave something in `res.locals.operatingPrincipal` or on the request
 * object. Whatever is there is discarded. The only value that survives is the
 * one this guard writes after a successful resolve.
 */
function clearPrincipalChannel(req: Request, res: Response): void {
  res.locals[OPERATING_PRINCIPAL_LOCALS_KEY] = undefined;
  delete (req as Request & { operatingPrincipal?: unknown }).operatingPrincipal;
}

/**
 * Normalizes a resolved principal down to the operating role alone.
 *
 * If the identity source ever returns a subject carrying `operating_growth`
 * alongside a more powerful name, the downstream handler still sees only
 * `operating_growth`. The role cannot be widened by what else happens to be on
 * the record, and a handler cannot accidentally branch on an elevated claim.
 */
function scopedPrincipal(principal: OperatingPrincipal): OperatingPrincipal {
  return {
    subjectId: principal.subjectId,
    roles: [OPERATING_GROWTH_ROLE],
  };
}

/**
 * Reads the acting principal. This is the only supported accessor; a handler
 * that reaches into the request for identity is a defect.
 */
export function readOperatingPrincipal(res: Response): OperatingPrincipal {
  const value = res.locals[OPERATING_PRINCIPAL_LOCALS_KEY];
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as OperatingPrincipal).subjectId !== "string" ||
    !isOperatingGrowthPrincipal(value as OperatingPrincipal)
  ) {
    throw new Error("operating principal is not present on this response");
  }
  return value as OperatingPrincipal;
}

/**
 * Requires one explicitly granted operating permission.
 *
 * Order is deliberate: an unknown permission is refused before anything else,
 * an unresolved principal is 401, and a principal without the permission is 403.
 * In every refusal path `next()` is never called, so the handler and everything
 * it would touch stays unreached.
 */
export function requireOperatingPermission(
  permission: OperatingPermission,
  deps: OperatingAccessDependencies,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    noStore(res);
    clearPrincipalChannel(req, res);
    const now = () => (deps.now ? deps.now() : new Date());

    try {
      // Defensive: a permission string that is not in the closed set is not a
      // new capability, it is a mistake. Refuse without resolving anyone.
      if (!isOperatingPermission(permission)) {
        await deps.recordAccessDecision({
          actorSubjectId: null,
          permission: null,
          capability: null,
          outcome: "forbidden",
          occurredAt: now().toISOString(),
        });
        return res
          .status(403)
          .json({ ok: false, code: "operating_forbidden" });
      }

      const principal = await deps.resolvePrincipal(req);
      if (!principal || typeof principal.subjectId !== "string") {
        await deps.recordAccessDecision({
          actorSubjectId: null,
          permission,
          capability: null,
          outcome: "unauthenticated",
          occurredAt: now().toISOString(),
        });
        return res
          .status(401)
          .json({ ok: false, code: "operating_auth_required" });
      }

      if (!hasOperatingPermission(principal, permission)) {
        await deps.recordAccessDecision({
          actorSubjectId: principal.subjectId,
          permission,
          capability: null,
          outcome: "forbidden",
          occurredAt: now().toISOString(),
        });
        return res
          .status(403)
          .json({ ok: false, code: "operating_forbidden" });
      }

      await deps.recordAccessDecision({
        actorSubjectId: principal.subjectId,
        permission,
        capability: null,
        outcome: "allowed",
        occurredAt: now().toISOString(),
      });
      res.locals[OPERATING_PRINCIPAL_LOCALS_KEY] = scopedPrincipal(principal);
      return next();
    } catch {
      // Identity provider and audit failures stay inside this boundary. A
      // request whose access decision could not be recorded is never
      // authorized, and no adapter error text reaches the caller.
      return res.status(503).json(OPERATING_UNAVAILABLE_RESPONSE);
    }
  };
}

/**
 * Refuses the operating role on a named capability it must never hold.
 *
 * The primary protection is that this role simply holds no permission for these
 * surfaces. This guard is defense in depth for the case where the role is later
 * added to a broader guard by mistake: mounted ahead of such a surface, it
 * refuses the operating role explicitly and names the capability in the audit
 * record, so the wiring error is visible rather than silent.
 *
 * A principal that does not carry the operating role passes through untouched;
 * this guard is not an authorization decision for anybody else.
 */
export function refuseOperatingRole(
  capability: OperatingDeniedCapability,
  deps: OperatingAccessDependencies,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    noStore(res);
    clearPrincipalChannel(req, res);
    const now = () => (deps.now ? deps.now() : new Date());

    try {
      const principal = await deps.resolvePrincipal(req);
      if (principal && isOperatingGrowthPrincipal(principal)) {
        await deps.recordAccessDecision({
          actorSubjectId: principal.subjectId,
          permission: null,
          capability,
          outcome: "forbidden",
          occurredAt: now().toISOString(),
        });
        return res
          .status(403)
          .json({ ok: false, code: "operating_forbidden" });
      }
      return next();
    } catch {
      return res.status(503).json(OPERATING_UNAVAILABLE_RESPONSE);
    }
  };
}

/**
 * Writes a payload for the operating role with the confidential commercial
 * fields removed. Wholesale source cost, landed cost, margin, markup, and
 * supplier or vendor identity never leave through this helper, whatever the
 * upstream service happened to include.
 */
export function sendOperatingJson(res: Response, payload: unknown): Response {
  noStore(res);
  return res.json(redactOperatingPayload(payload));
}
