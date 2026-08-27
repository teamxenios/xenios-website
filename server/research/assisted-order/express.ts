// The Express adapter over the assisted-order route descriptors, plus the
// production viewer resolver. One resolver, three identities:
//
//   member                the same silent member resolution every member door
//                         uses; carries the master-offerings pricing grant
//                         derived from the SAME member row
//   early-access session  the ONE composed identity directory observed from
//                         registerPrivateEarlyAccessApi; the shared entry
//                         password proves entry, never customer identity
//   admin                 requireSupabaseAdmin runs BEFORE these handlers;
//                         the viewer carries manage capabilities and the
//                         admin email as its actor label, no member row
//
// An unresolvable viewer still reaches the service, which refuses with its
// own authorization error; admission is not authorization.

import { createHash } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import type {
  AssistedOrderHttpRequest,
  AssistedOrderRouteDescriptor,
} from "./http";
import type { AssistedOrderViewer } from "./ports";

/**
 * The descriptor table takes ONE viewer resolver, so the express request rides
 * along and the resolver dispatches on it: admin descriptors resolve the admin
 * viewer (their guard already ran), everything else resolves the customer.
 */
export type ExpressAssistedOrderRequest = AssistedOrderHttpRequest &
  Readonly<{ express: Request }>;

const CUSTOMER_CAPABILITIES: ReadonlySet<string> = new Set([
  "assisted_orders:submit",
  "assisted_orders:read_own",
]);

const ADMIN_CAPABILITIES: ReadonlySet<string> = new Set([
  "assisted_orders:read_all",
  "assisted_orders:manage",
  "assisted_orders:documents_manage",
]);

export type AssistedOrderViewerWiring = Readonly<{
  resolveMember(req: Request): Promise<{
    id: string;
    email: string | null;
    /**
     * Opaque server-derived pricing viewer for the canonical master-offerings
     * price authority, derived from the SAME member row as this identity —
     * never from browser input. Absent means no price grant, and every price
     * truthfully fails closed to "Price on request".
     */
    pricingViewer?: unknown;
  } | null>;
  /** The observed Early Access door sources, or null before registration. */
  earlyAccess(): Readonly<{
    identity: { resolve(input: Readonly<{ cookieHeader: unknown }>): Promise<unknown> };
    resolveSession: (
      cookieHeader: unknown,
    ) => Promise<{ authenticated: boolean }>;
    readSessionId: (cookieHeader: unknown) => string | null;
  }> | null;
  /**
   * The durable, server-owned member/customer binding directory. The Early
   * Access route projection intentionally exposes no email address, so a member
   * may borrow a session's agreement standing only when this directory binds
   * that exact opaque customer handle to the authenticated member id.
   */
  earlyAccessBindings(): Readonly<{
    forCustomer(customerRef: string): Promise<
      | Readonly<{ ok: true; binding: Readonly<{ memberId: string }> }>
      | Readonly<{ ok: false }>
    >;
  }> | null;
  adminEmail(): string;
}>;

function customerRefOf(candidate: unknown): string | null {
  if (typeof candidate !== "object" || candidate === null) return null;
  const customerRef = (candidate as Record<string, unknown>).customerRef;
  return typeof customerRef === "string" && customerRef.trim().length > 0
    ? customerRef.trim()
    : null;
}

export function createAssistedOrderViewerResolvers(wiring: AssistedOrderViewerWiring): Readonly<{
  resolve(request: ExpressAssistedOrderRequest): Promise<AssistedOrderViewer>;
  customer(req: Request): Promise<AssistedOrderViewer>;
  admin(req: Request): Promise<AssistedOrderViewer>;
}> {
  const resolvers = {
    async customer(req: Request): Promise<AssistedOrderViewer> {
      const member = await wiring.resolveMember(req);
      const doors = wiring.earlyAccess();
      const cookieHeader = req.headers.cookie;
      let sessionId: string | null = null;
      let earlyAccessCustomer: unknown = null;
      if (doors) {
        try {
          const session = await doors.resolveSession(cookieHeader);
          if (session.authenticated) {
            sessionId = doors.readSessionId(cookieHeader);
            if (sessionId !== null && sessionId.length > 0) {
              earlyAccessCustomer = await doors.identity.resolve({ cookieHeader });
            }
          }
        } catch {
          // A member may still browse through their authenticated member row,
          // but cannot submit without a resolvable Early Access customer and
          // the durable agreement standing attached to it. Non-members fail
          // closed to the capability-free viewer below.
          earlyAccessCustomer = null;
        }
      }
      if (member) {
        const memberEmail = member.email?.trim().toLowerCase() ?? null;
        const earlyAccessCustomerRef = customerRefOf(earlyAccessCustomer);
        let identitiesBound = false;
        if (earlyAccessCustomerRef !== null && sessionId !== null) {
          try {
            const directory = wiring.earlyAccessBindings();
            const resolution = directory
              ? await directory.forCustomer(earlyAccessCustomerRef)
              : null;
            identitiesBound =
              resolution?.ok === true &&
              resolution.binding.memberId === member.id;
          } catch {
            // Binding infrastructure is authorization infrastructure. An
            // unreadable answer is never treated as a match; the member may
            // still browse with their own pricing grant, but submission stays
            // closed and performs no write or notification.
            identitiesBound = false;
          }
        }
        return Object.freeze({
          actorType: "member",
          memberId: member.id,
          earlyAccessSessionHash:
            identitiesBound && sessionId
              ? createHash("sha256").update(sessionId, "utf8").digest("hex")
              : null,
          earlyAccessCustomerRef: identitiesBound
            ? earlyAccessCustomerRef
            : null,
          normalizedEmail: memberEmail,
          capabilities: CUSTOMER_CAPABILITIES,
          // Carried, never derived here: the wiring built this from the same
          // member row it resolved above. Early Access and anonymous viewers
          // below deliberately carry none, so their prices fail closed.
          pricingViewer: member.pricingViewer ?? null,
        }) as AssistedOrderViewer;
      }
      if (doors && sessionId !== null && sessionId.length > 0) {
        if (earlyAccessCustomer !== null) {
          return Object.freeze({
            actorType: "early_access_session",
            memberId: null,
            earlyAccessSessionHash: createHash("sha256")
              .update(sessionId, "utf8")
              .digest("hex"),
            earlyAccessCustomerRef: customerRefOf(earlyAccessCustomer),
            // The EarlyAccessCustomer contract deliberately exposes no email.
            // Contact email is validated from the request body later; it is
            // never an identity or authorization input here.
            normalizedEmail: null,
            capabilities: CUSTOMER_CAPABILITIES,
          }) as AssistedOrderViewer;
        }
      }
      // Anonymous: a real viewer object with no capabilities, so the service
      // refuses with its own authorization error and the response shape stays
      // uniform. Status-token reads still work because the token authorizes
      // the exact request on its own.
      return Object.freeze({
        actorType: "early_access_session",
        memberId: null,
        earlyAccessSessionHash: null,
        earlyAccessCustomerRef: null,
        normalizedEmail: null,
        capabilities: new Set<string>(),
      }) as AssistedOrderViewer;
    },

    async admin(_req: Request): Promise<AssistedOrderViewer> {
      // requireSupabaseAdmin has already verified the bearer against the
      // configured admin identity before this runs; these handlers are never
      // registered without that guard in front.
      return Object.freeze({
        actorType: "admin",
        memberId: null,
        earlyAccessSessionHash: null,
        earlyAccessCustomerRef: null,
        normalizedEmail: wiring.adminEmail() || null,
        actorLabel: wiring.adminEmail() || "admin",
        capabilities: ADMIN_CAPABILITIES,
      }) as AssistedOrderViewer;
    },
  };
  return Object.freeze({
    ...resolvers,
    resolve(request: ExpressAssistedOrderRequest): Promise<AssistedOrderViewer> {
      return request.path.startsWith("/api/admin/")
        ? resolvers.admin(request.express)
        : resolvers.customer(request.express);
    },
  });
}

/** One descriptor handler as one Express handler; JSON only, never SPA HTML. */
export function assistedOrderExpressHandler(
  descriptor: AssistedOrderRouteDescriptor,
): RequestHandler {
  return (req: Request, res: Response) => {
    const request: ExpressAssistedOrderRequest = {
      method: req.method,
      // The descriptor's own path, not req.path: an Express handler mounted on
      // a parameterized route sees the concrete path, and the resolver's admin
      // dispatch must key off the registered shape.
      path: descriptor.path,
      headers: req.headers as Readonly<Record<string, string | undefined>>,
      query: req.query as Readonly<Record<string, string | undefined>>,
      params: req.params as Readonly<Record<string, string | undefined>>,
      body: req.body,
      express: req,
    };
    void descriptor
      .handler(request)
      .then((response) => {
        for (const [name, value] of Object.entries(response.headers ?? {})) {
          res.setHeader(name, value);
        }
        res.status(response.status).json(response.body);
      })
      .catch(() => {
        res.status(500).json({
          error: "assisted_order_unavailable",
          message: "The assisted order service is temporarily unavailable.",
        });
      });
  };
}
