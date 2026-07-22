// xenios research: the commerce, catalog, evidence, and distribution HTTP surface (G6, G7, G8).
//
// This module is registered by the integration lane, not by itself. It does not touch
// server/research/index.ts, per the coordinator file claim.
//
// Two authorization defects were left open by the domain reviews because they can only
// be closed at this layer. Both are closed here, structurally rather than by discipline:
//
//   1. IDENTITY IS NEVER READ FROM THE CLIENT. `subjectOf` derives the acting member
//      from the authenticated request only. No handler reads a member id or partner id
//      from a body, query, or path parameter. A route therefore cannot be pointed at
//      another member's data by changing a request, because there is nothing in the
//      request to change.
//
//   2. RICH DOMAIN RECORDS ARE NEVER SERIALIZED. `PartnerRecord` carries legal name,
//      contact email, internal notes, admin ids, and a lifecycle history containing
//      suspension and termination reasons. `toPartnerSelfDto` builds the response by
//      explicit construction, so a field added to the record later cannot appear in a
//      response by default.

import type { Express, Request, Response } from "express";
import type {
  AddCartLineRequest,
  Api,
  CheckoutRequest,
  CommerceDenialCode,
  CreateClaimRequest,
  GoalDto,
  GuideDetailDto,
  GuideSummaryDto,
  MemberCapabilityStatus,
  PartnerLinkDto,
  ProductDetailDto,
  ProductSummaryDto,
  SubscriptionActionRequest,
} from "@shared/research/commerce-api";
import type { PartnerRole, PartnerState } from "@shared/research/distribution";

// ---------------------------------------------------------------------------
// Injected surface
// ---------------------------------------------------------------------------

/**
 * Everything the routes need, injected so the surface is testable without a database,
 * a network, or a provider credential.
 */
export interface CommerceDependencies {
  catalog: {
    listProducts(): ProductSummaryDto[];
    getProduct(slug: string): ProductDetailDto | null;
    listGoals(): GoalDto[];
  };
  guides: {
    listForMember(): Promise<GuideSummaryDto[]>;
    getForMember(slug: string): Promise<GuideDetailDto | { denied: "guide_not_published" } | null>;
  };
  cart: {
    getCart(memberId: string, asOf: Date): Promise<unknown>;
    addLine(memberId: string, req: AddCartLineRequest, asOf: Date): Promise<unknown>;
    updateLine(memberId: string, sku: string, quantity: number, asOf: Date): Promise<unknown>;
    removeLine(memberId: string, sku: string, asOf: Date): Promise<unknown>;
  };
  checkout: {
    submit(memberId: string, req: CheckoutRequest, asOf: Date): Promise<unknown>;
  };
  orders: {
    listForMember(memberId: string): Promise<unknown[]>;
    getForMember(memberId: string, orderId: string): Promise<unknown | null>;
  };
  subscriptions: {
    listForMember(memberId: string): Promise<unknown[]>;
    apply(memberId: string, subscriptionId: string, req: SubscriptionActionRequest, asOf: Date): Promise<unknown>;
  };
  claims: {
    submitClaim(memberId: string, req: CreateClaimRequest, asOf: Date): Promise<unknown>;
    listForMember(memberId: string): Promise<unknown[]>;
  };
  storeCredit: {
    forMember(memberId: string): Promise<unknown>;
  };
  partners: {
    /** Resolves the partner owned by this member, or null. Never takes a partner id. */
    findByMemberId(memberId: string): Promise<PartnerSelfSource | null>;
    dashboardFor(partnerId: string): Promise<unknown>;
    listLinks(partnerId: string): Promise<PartnerLinkDto[]>;
  };
  capabilities: {
    memberVisible(): Record<string, MemberCapabilityStatus>;
  };
  adminQueues: {
    commerce(): Promise<unknown>;
  };
  /** Injected so handlers are deterministic under test. */
  now(): Date;
}

/** The subset of a partner record this layer is permitted to see. */
export interface PartnerSelfSource {
  partnerId: string;
  role: PartnerRole;
  state: PartnerState;
  certifiedAt: string | null;
  activatedAt: string | null;
  training: Array<{ moduleKey: string; moduleVersion: string; completedAt: string }>;
  agreements: Array<{ agreementKey: string; agreementVersion: string; decidedAt: string }>;
}

/**
 * What a partner may see about themselves.
 *
 * Deliberately absent: legalName, contactEmail, internalNotes, certifiedByAdminId,
 * activatedByAdminId, and the lifecycle history, which carries suspension and
 * termination reasons written for Samuel rather than for the partner.
 */
export interface PartnerSelfDto {
  partnerId: string;
  role: PartnerRole;
  state: PartnerState;
  certified: boolean;
  active: boolean;
  training: Array<{ moduleKey: string; moduleVersion: string; completedAt: string }>;
  agreements: Array<{ agreementKey: string; agreementVersion: string; decidedAt: string }>;
}

/**
 * Built by explicit construction, never by spreading or deleting keys from the record.
 * A field added to PartnerRecord later cannot reach a partner through this function.
 */
export function toPartnerSelfDto(source: PartnerSelfSource): PartnerSelfDto {
  return {
    partnerId: source.partnerId,
    role: source.role,
    state: source.state,
    certified: source.certifiedAt !== null,
    active: source.activatedAt !== null && source.state === "active",
    training: source.training.map((t) => ({
      moduleKey: t.moduleKey,
      moduleVersion: t.moduleVersion,
      completedAt: t.completedAt,
    })),
    agreements: source.agreements.map((a) => ({
      agreementKey: a.agreementKey,
      agreementVersion: a.agreementVersion,
      decidedAt: a.decidedAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * The acting member, taken ONLY from what the guard authenticated.
 *
 * This is the whole of the viewer-enforcement fix. Because no handler accepts an
 * identity from the request, there is no parameter an attacker can change to read
 * another member. A missing identity fails closed rather than defaulting.
 */
export function subjectOf(req: Request): string | null {
  const member = (req as unknown as { researchMember?: Record<string, unknown> }).researchMember;
  if (!member) return null;
  const id = member.id ?? member.member_id ?? member.memberId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/** Member and admin JSON is never cached, matching the merged research routes. */
function secure(res: Response): Response {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  return res;
}

function ok<T extends object>(res: Response, payload: T): void {
  secure(res).json({ ok: true, ...payload } satisfies Api<T>);
}

function deny(res: Response, status: number, code: CommerceDenialCode | "forbidden", message?: string): void {
  secure(res).status(status).json({ ok: false, code, ...(message ? { message } : {}) });
}

/** A handler that needs an authenticated subject. Fails closed when there is none. */
function withSubject(handler: (memberId: string, req: Request, res: Response) => void | Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    const memberId = subjectOf(req);
    if (!memberId) {
      deny(res, 403, "forbidden", "This area requires an active membership.");
      return;
    }
    await handler(memberId, req, res);
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export interface CommerceGuards {
  requireActiveMember: (req: Request, res: Response, next: () => void) => void | Promise<void>;
  requireMember: (req: Request, res: Response, next: () => void) => void | Promise<void>;
  requireAdmin: (req: Request, res: Response, next: () => void) => void | Promise<void>;
}

/**
 * Registers the commerce surface.
 *
 * Guards are injected rather than imported so this module has no opinion about how
 * authentication works and cannot accidentally define a parallel auth path. The
 * integration lane passes the merged guards.
 */
export function registerCommerceApi(app: Express, deps: CommerceDependencies, guards: CommerceGuards): void {
  const active = guards.requireActiveMember;
  const member = guards.requireMember;
  const admin = guards.requireAdmin;

  // ---- G0 capabilities -----------------------------------------------------
  app.get("/api/research/capabilities", active, (_req, res) => {
    ok(res, { capabilities: deps.capabilities.memberVisible() });
  });

  // ---- G6 catalog, goals, guides -------------------------------------------
  app.get("/api/research/products", active, (_req, res) => {
    ok(res, { products: deps.catalog.listProducts() });
  });

  app.get("/api/research/products/:slug", active, (req, res) => {
    const product = deps.catalog.getProduct(String(req.params.slug));
    if (!product) {
      deny(res, 404, "product_not_found");
      return;
    }
    ok(res, { product });
  });

  app.get("/api/research/goals", active, (_req, res) => {
    ok(res, { goals: deps.catalog.listGoals() });
  });

  app.get("/api/research/guides", active, async (_req, res) => {
    ok(res, { guides: await deps.guides.listForMember() });
  });

  app.get("/api/research/guides/:slug", active, async (req, res) => {
    const guide = await deps.guides.getForMember(String(req.params.slug));
    if (guide === null) {
      deny(res, 404, "guide_not_found");
      return;
    }
    // An unpublished Guide is denied rather than partially rendered, so no body,
    // claim, or source of an unapproved Guide can reach a member.
    if ("denied" in guide) {
      deny(res, 403, "guide_not_published", "This Guide has not completed review.");
      return;
    }
    ok(res, { guide });
  });

  // ---- G7 cart --------------------------------------------------------------
  app.get(
    "/api/research/cart",
    active,
    withSubject(async (memberId, _req, res) => {
      ok(res, { cart: await deps.cart.getCart(memberId, deps.now()) });
    }),
  );

  app.post(
    "/api/research/cart/lines",
    active,
    withSubject(async (memberId, req, res) => {
      const body = req.body as AddCartLineRequest;
      const result = await deps.cart.addLine(memberId, body, deps.now());
      relay(res, result, "cart");
    }),
  );

  app.patch(
    "/api/research/cart/lines/:sku",
    active,
    withSubject(async (memberId, req, res) => {
      const quantity = Number((req.body as { quantity?: unknown })?.quantity);
      const result = await deps.cart.updateLine(memberId, String(req.params.sku), quantity, deps.now());
      relay(res, result, "cart");
    }),
  );

  app.delete(
    "/api/research/cart/lines/:sku",
    active,
    withSubject(async (memberId, req, res) => {
      const result = await deps.cart.removeLine(memberId, String(req.params.sku), deps.now());
      relay(res, result, "cart");
    }),
  );

  // ---- G7 checkout, orders, subscriptions, claims ---------------------------
  app.post(
    "/api/research/checkout",
    active,
    withSubject(async (memberId, req, res) => {
      const result = await deps.checkout.submit(memberId, req.body as CheckoutRequest, deps.now());
      relay(res, result, "order");
    }),
  );

  app.get(
    "/api/research/orders",
    active,
    withSubject(async (memberId, _req, res) => {
      ok(res, { orders: await deps.orders.listForMember(memberId) });
    }),
  );

  app.get(
    "/api/research/orders/:orderId",
    active,
    withSubject(async (memberId, req, res) => {
      // The service enforces ownership; a foreign order returns null and 404s here,
      // so a probe cannot distinguish another member's order from a missing one.
      const order = await deps.orders.getForMember(memberId, String(req.params.orderId));
      if (!order) {
        deny(res, 404, "order_not_found");
        return;
      }
      ok(res, { order });
    }),
  );

  app.get(
    "/api/research/subscriptions",
    active,
    withSubject(async (memberId, _req, res) => {
      ok(res, { subscriptions: await deps.subscriptions.listForMember(memberId) });
    }),
  );

  app.post(
    "/api/research/subscriptions/:subscriptionId",
    active,
    withSubject(async (memberId, req, res) => {
      const result = await deps.subscriptions.apply(
        memberId,
        String(req.params.subscriptionId),
        req.body as SubscriptionActionRequest,
        deps.now(),
      );
      relay(res, result, "subscription");
    }),
  );

  app.post(
    "/api/research/claims",
    active,
    withSubject(async (memberId, req, res) => {
      const result = await deps.claims.submitClaim(memberId, req.body as CreateClaimRequest, deps.now());
      relay(res, result, "claim");
    }),
  );

  app.get(
    "/api/research/claims",
    active,
    withSubject(async (memberId, _req, res) => {
      ok(res, { claims: await deps.claims.listForMember(memberId) });
    }),
  );

  app.get(
    "/api/research/store-credit",
    active,
    withSubject(async (memberId, _req, res) => {
      ok(res, { storeCredit: await deps.storeCredit.forMember(memberId) });
    }),
  );

  // ---- G8 partner portal ----------------------------------------------------
  //
  // Every route below resolves the partner FROM THE AUTHENTICATED MEMBER. None accepts
  // a partner id, so partner A cannot address partner B by editing a request.

  app.get(
    "/api/research/partner/me",
    member,
    withSubject(async (memberId, _req, res) => {
      const partner = await deps.partners.findByMemberId(memberId);
      if (!partner) {
        deny(res, 404, "partner_not_found");
        return;
      }
      ok(res, { partner: toPartnerSelfDto(partner) });
    }),
  );

  app.get(
    "/api/research/partner/dashboard",
    member,
    withSubject(async (memberId, _req, res) => {
      const partner = await deps.partners.findByMemberId(memberId);
      if (!partner) {
        deny(res, 404, "partner_not_found");
        return;
      }
      ok(res, { partner: await deps.partners.dashboardFor(partner.partnerId) });
    }),
  );

  app.get(
    "/api/research/partner/links",
    member,
    withSubject(async (memberId, _req, res) => {
      const partner = await deps.partners.findByMemberId(memberId);
      if (!partner) {
        deny(res, 404, "partner_not_found");
        return;
      }
      ok(res, { links: await deps.partners.listLinks(partner.partnerId) });
    }),
  );

  // ---- G10 admin ------------------------------------------------------------
  app.get("/api/admin/research/commerce/queues", admin, async (_req, res) => {
    ok(res, { queues: await deps.adminQueues.commerce() });
  });
}

/**
 * Relays a service result that is already a discriminated union.
 *
 * A denial keeps its machine code so the UI can route on it, and a service that returns
 * no recognizable shape produces a generic refusal rather than leaking an internal
 * object. Unknown shapes fail closed.
 */
function relay(res: Response, result: unknown, key: string): void {
  if (result && typeof result === "object" && "ok" in result) {
    const shaped = result as { ok: boolean; code?: string; codes?: string[]; message?: string };
    if (shaped.ok) {
      const { ok: _ok, ...rest } = shaped as Record<string, unknown> & { ok: boolean };
      ok(res, Object.keys(rest).length > 0 ? rest : { [key]: null });
      return;
    }
    const code = shaped.code ?? shaped.codes?.[0] ?? "forbidden";
    const status = code === "commerce_disabled" ? 503 : 400;
    deny(res, status, code as CommerceDenialCode, shaped.message);
    return;
  }
  deny(res, 500, "forbidden", "The request could not be completed.");
}
