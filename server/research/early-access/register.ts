import { randomBytes } from "node:crypto";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";

import { requireSupabaseAdmin } from "../../routes";
import { resolveEarlyAccessConfig, type EarlyAccessConfig } from "./private-access-config";
import {
  PRIVATE_ACCESS_PRIVATE_HEADERS,
  createEarlyAccessSessionIdReader,
  createEarlyAccessSessionResolver,
  createLogoutRoute,
  createSessionRoute,
  createUnlockRoute,
  type EarlyAccessSessionCheck,
  type PrivateAccessRouteDependencies,
} from "./private-access-routes";
import {
  createEarlyAccessCatalogRoute,
  createFounderReleaseReviewRoute,
  createFounderReleaseRoute,
  createReleaseHistoryRoute,
  type EarlyAccessCatalogSource,
} from "./release/release-routes";
import { createEarlyAccessCatalogSourceForDeployment } from "./catalog/product-control-source";
import { REVIEW_AUDIENCE_SOURCE } from "./catalog/declared-facts-source";
import { supabaseConfigured } from "../../supabase";
import type { MemberRow } from "../member-auth";
import {
  InMemoryEarlyAccessReleaseLedger,
  type EarlyAccessReleaseLedger,
} from "./release/founder-release";
import {
  InMemoryPrivateAccessSessionRepository,
  type PrivateAccessSessionRepository,
} from "./private-access-session-repository";
import {
  decideEarlyAccessAdapter,
  isGrantIssuingRepository,
  mintDurableSession,
} from "./durable-session";
import {
  createEarlyAccessConfirmPaymentRoute,
  createEarlyAccessPaymentQueueRoute,
  createEarlyAccessSupplierAcknowledgementRoute,
  createEarlyAccessSupplierNotificationRoute,
  createEarlyAccessSupplierOrderEnsureRoute,
  createEarlyAccessSupplierOrderReadRoute,
  createEarlyAccessSupplierPackingRoute,
  createEarlyAccessSupplierShippedRoute,
  createEarlyAccessSupplierTrackingRoute,
  type EarlyAccessAdminRouteDependencies,
} from "./routes/admin-routes";
import {
  createEarlyAccessInvoiceRoute,
  createEarlyAccessOrderLookupRoute,
  createEarlyAccessOrderPlacementRoute,
  createEarlyAccessPaymentProofRoute,
  type EarlyAccessOrderRouteDependencies,
} from "./routes/order-routes";
import { generateEarlyAccessOrderNumber } from "./routes/order-number";
import {
  ConfiguredEarlyAccessAdminDirectory,
  InMemoryEarlyAccessAuditSink,
  NoEarlyAccessAgreements,
  NoEarlyAccessReferrals,
  NoEarlyAccessShipping,
  NoEarlyAccessSuppliers,
  SyntheticEarlyAccessProofStorage,
  type EarlyAccessAdminDirectory,
  type EarlyAccessAgreementGate,
  type EarlyAccessAuditSink,
  type EarlyAccessIdentityDirectory,
  type EarlyAccessProofStorage,
  type EarlyAccessReferralResolver,
  type EarlyAccessShippingPolicy,
  type EarlyAccessSupplierDirectory,
} from "./routes/ports";
import {
  InMemoryEarlyAccessCommerceStore,
  type EarlyAccessCommerceStore,
} from "./routes/store";
import {
  InMemoryEarlyAccessCustomerRepository,
  type EarlyAccessCustomerRepository,
} from "./identity/early-access-customer";
import {
  EarlyAccessCustomerDirectory,
  InMemorySessionBindingStore,
  type SessionBindingStore,
} from "./identity/identity-verification";

// Registration seam for the Private Early Access gate.
//
// The handlers are pure and injected; this file is the only place that binds
// them to Express, to the process clock, and to real randomness. Keeping the
// binding here means the handlers stay unit-testable with no server.

export const EARLY_ACCESS_UNLOCK_PATH = "/api/research/early-access/unlock";
export const EARLY_ACCESS_SESSION_PATH = "/api/research/early-access/session";
export const EARLY_ACCESS_LOGOUT_PATH = "/api/research/early-access/logout";
export const EARLY_ACCESS_CATALOG_PATH = "/api/research/early-access/catalog";
export const EARLY_ACCESS_ORDERS_PATH = "/api/research/early-access/orders";
export const EARLY_ACCESS_ORDER_PATH = "/api/research/early-access/orders/:orderNumber";
export const EARLY_ACCESS_ORDER_INVOICE_PATH =
  "/api/research/early-access/orders/:orderNumber/invoice";
export const EARLY_ACCESS_ORDER_PROOF_PATH =
  "/api/research/early-access/orders/:orderNumber/payment-proof";

export const EARLY_ACCESS_API_PATHS = Object.freeze([
  EARLY_ACCESS_UNLOCK_PATH,
  EARLY_ACCESS_SESSION_PATH,
  EARLY_ACCESS_LOGOUT_PATH,
  EARLY_ACCESS_CATALOG_PATH,
  EARLY_ACCESS_ORDERS_PATH,
  EARLY_ACCESS_ORDER_PATH,
  EARLY_ACCESS_ORDER_INVOICE_PATH,
  EARLY_ACCESS_ORDER_PROOF_PATH,
] as const);

/**
 * The operator surface.
 *
 * Deliberately NOT under /api/research. The shared research wall decides who may
 * reach a customer surface, and an admin surface is not one: it sits behind the
 * existing Supabase admin guard instead. Two gates arguing about one door is how
 * the weaker one ends up answering first.
 */
export const EARLY_ACCESS_ADMIN_PAYMENTS_PATH = "/api/admin/research/payments";
export const EARLY_ACCESS_ADMIN_PAYMENT_CONFIRM_PATH =
  "/api/admin/research/payments/:orderNumber/confirm";
export const EARLY_ACCESS_ADMIN_SUPPLIER_ORDER_PATH =
  "/api/admin/research/supplier-orders/:orderNumber";
export const EARLY_ACCESS_ADMIN_SUPPLIER_NOTIFICATION_PATH =
  "/api/admin/research/supplier-orders/:orderNumber/notification";
export const EARLY_ACCESS_ADMIN_SUPPLIER_ACKNOWLEDGEMENT_PATH =
  "/api/admin/research/supplier-orders/:orderNumber/acknowledgement";
export const EARLY_ACCESS_ADMIN_SUPPLIER_PACKING_PATH =
  "/api/admin/research/supplier-orders/:orderNumber/packing";
export const EARLY_ACCESS_ADMIN_SUPPLIER_TRACKING_PATH =
  "/api/admin/research/supplier-orders/:orderNumber/tracking";
export const EARLY_ACCESS_ADMIN_SUPPLIER_SHIPPED_PATH =
  "/api/admin/research/supplier-orders/:orderNumber/shipped";

export const EARLY_ACCESS_ADMIN_API_PATHS = Object.freeze([
  EARLY_ACCESS_ADMIN_PAYMENTS_PATH,
  EARLY_ACCESS_ADMIN_PAYMENT_CONFIRM_PATH,
  EARLY_ACCESS_ADMIN_SUPPLIER_ORDER_PATH,
  EARLY_ACCESS_ADMIN_SUPPLIER_NOTIFICATION_PATH,
  EARLY_ACCESS_ADMIN_SUPPLIER_ACKNOWLEDGEMENT_PATH,
  EARLY_ACCESS_ADMIN_SUPPLIER_PACKING_PATH,
  EARLY_ACCESS_ADMIN_SUPPLIER_TRACKING_PATH,
  EARLY_ACCESS_ADMIN_SUPPLIER_SHIPPED_PATH,
] as const);

/**
 * The founder release admin surface. Under /api/admin so it sits behind the
 * same Supabase admin guard the rest of research operations uses, and so no
 * customer-session route can ever be mistaken for it.
 */
export const EARLY_ACCESS_RELEASES_PATH = "/api/admin/research/early-access/releases";
export const EARLY_ACCESS_RELEASE_HISTORY_PATH =
  "/api/admin/research/early-access/releases/history";

/** A 43-character base64url encoding of 32 random bytes. */
function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The rate-limit identity.
 *
 * Deciding which header is trustworthy is a deployment question, so it is
 * answered here rather than inside the handler. Express's `req.ip` already
 * honours the app's configured `trust proxy` setting, which is the only source
 * that reflects what the deployment actually trusts. A spoofable
 * `X-Forwarded-For` is deliberately NOT read directly.
 *
 * Returning a stable fallback rather than nothing matters: a missing key fails
 * closed in the handler, which would refuse every unlock. Callers behind an
 * unusual proxy get one shared bucket, which is strict rather than open.
 */
function clientKeyFor(request: Request): string {
  const ip = typeof request.ip === "string" && request.ip.length > 0 ? request.ip : null;
  return ip ?? "private-early-access:unknown-client";
}

export interface EarlyAccessRegistrationOptions {
  readonly config?: EarlyAccessConfig;
  readonly repository?: PrivateAccessSessionRepository;
  readonly now?: () => number;
  /**
   * Where the catalog comes from. Defaults to the LIVE Product Control source
   * when this deployment is configured for it, and to a source that REFUSES
   * when it is not.
   *
   * It deliberately does not default to an empty catalog. An empty catalog is a
   * statement ("there is nothing available"), and a deployment that cannot
   * reach Product Control is not in a position to make it. The refusing source
   * turns into a 503 at the route, which a surface can tell apart from a 200
   * with no units in it.
   */
  readonly catalog?: EarlyAccessCatalogSource;
  readonly releases?: EarlyAccessReleaseLedger;

  // The commerce seams. Every default that touches money, identity, or shipment
  // fails closed, for the same reason the catalog defaults to a refusal: an
  // unwired deployment should refuse with a truthful reason rather than sell on
  // assumptions. Each one is the exact place a real source is injected.
  readonly store?: EarlyAccessCommerceStore;
  readonly identity?: EarlyAccessIdentityDirectory;
  /**
   * The Early Access customer roster and the session-to-customer bindings the
   * DEFAULT identity directory resolves through. Injected together, they are
   * the durable-store seam; defaulted, they are in-memory and hold nothing,
   * so identity resolves nobody until a verification door writes a binding
   * and the shared password alone still buys no orders.
   */
  readonly customers?: EarlyAccessCustomerRepository;
  readonly sessionBindings?: SessionBindingStore;
  readonly agreements?: EarlyAccessAgreementGate;
  readonly suppliers?: EarlyAccessSupplierDirectory;
  readonly shipping?: EarlyAccessShippingPolicy;
  readonly referrals?: EarlyAccessReferralResolver;
  readonly proofStorage?: EarlyAccessProofStorage;
  readonly audit?: EarlyAccessAuditSink;
  readonly orderNumber?: () => string;
  readonly proofId?: () => string;
  /**
   * Who may accept money, resolved from the address the admin guard verified.
   * Defaults to the configured ADMIN_EMAIL as founder, which is not a widening:
   * the guard has already refused every other address.
   */
  readonly admins?: EarlyAccessAdminDirectory;
  /**
   * THE admin gate, for the operator routes and the founder release routes
   * alike. Defaults to the EXISTING `requireSupabaseAdmin`, so production is
   * correct with no extra wiring; injectable so a route test can exercise the
   * handlers without a Supabase JWT.
   *
   * Deliberately ONE option rather than two. An earlier pair (`adminGuard` for
   * the operator routes, `requireAdmin` for the founder release) meant a caller
   * could satisfy one and leave the other defaulted, which is precisely how a
   * surface ends up mounted behind a guard nobody chose. The surviving name is
   * `requireAdmin` because that is what the mounting seam in server/index.ts
   * already passes, so consolidating costs no change to a file this lane does
   * not own; the type is Express's RequestHandler, which is what the operator
   * routes wanted.
   */
  readonly requireAdmin?: RequestHandler;
  /**
   * The member the server-side guard authenticated for a request, when there is
   * one. Early Access resolves its audience from that row and from nothing
   * else; absent, every unit blocks on AUDIENCE_NOT_PERMITTED.
   */
  readonly resolveMember?: (request: Request) => Promise<MemberRow | null>;
  /** The authenticated admin identity, read from the request the guard passed. */
  readonly adminActor?: (request: Request) => string | null;
}

/**
 * Register the Early Access API: the gate, the catalog, the customer commerce
 * routes, and the operator routes behind them.
 *
 * Returns the resolved configuration so the caller can report deployment
 * status without re-reading the environment.
 */
export function registerPrivateEarlyAccessApi(
  app: Express,
  options: EarlyAccessRegistrationOptions = {},
): EarlyAccessConfig {
  const config = options.config ?? resolveEarlyAccessConfig();
  const repository = options.repository ?? new InMemoryPrivateAccessSessionRepository();

  // An in-memory session vanishes on restart, on redeploy, and whenever a
  // request lands on another instance, which would sign a customer out in the
  // middle of an order. Production with the gate OPEN therefore requires a
  // durable store; rather than degrade silently, the gate stays shut and says
  // why. Production with the gate closed is fine, because nobody can reach it.
  const decision = decideEarlyAccessAdapter({
    isProduction: process.env.NODE_ENV === "production",
    earlyAccessEnabled: config.enabled,
    durableAvailable: isGrantIssuingRepository(repository),
  });
  if (!decision.ok) {
    // eslint-disable-next-line no-console
    console.error(`[early-access] ${decision.reason}`);
  } else if (decision.warning !== null) {
    // eslint-disable-next-line no-console
    console.warn(`[early-access] ${decision.warning}`);
  }
  // A refused decision forces the gate closed for this process regardless of
  // the flag, so no unlock can mint a session the deployment cannot keep.
  const effectiveConfig: EarlyAccessConfig = decision.ok
    ? config
    : Object.freeze({ ...config, enabled: false });
  const now = options.now ?? (() => Date.now());

  // A durable repository cannot mint a session from a password alone. The
  // accepted migration exposes no standalone minting function on purpose, so a
  // session exists only as the atomic exchange of a one-time grant nonce. When
  // the configured store can register a grant, unlock goes through that
  // exchange; otherwise it writes a row directly, which is the local path.
  const durable = isGrantIssuingRepository(repository);
  const deps: PrivateAccessRouteDependencies = {
    config: effectiveConfig,
    repository,
    now,
    randomToken,
    mintSession: durable
      ? ({ ownerId, now: issuedAt, ttlSeconds }) =>
          mintDurableSession({ repository, ownerId, now: issuedAt, ttlSeconds, randomToken })
      : undefined,
  };

  const unlock = createUnlockRoute(deps);
  const session = createSessionRoute(deps);
  const logout = createLogoutRoute(deps);

  app.post(EARLY_ACCESS_UNLOCK_PATH, (req: Request, res: Response) => {
    void unlock({ body: req.body, clientKey: clientKeyFor(req) }, res);
  });

  app.get(EARLY_ACCESS_SESSION_PATH, (req: Request, res: Response) => {
    void session({ cookieHeader: req.headers.cookie }, res);
  });

  app.post(EARLY_ACCESS_LOGOUT_PATH, (req: Request, res: Response) => {
    void logout({ cookieHeader: req.headers.cookie }, res);
  });

  // The catalog reuses the SAME session resolver the session endpoint uses, so
  // the two can never disagree about whether a cookie is good.
  const resolveSession = createEarlyAccessSessionResolver(deps);
  const configured = supabaseConfigured();
  // The catalog default is a REFUSAL, not an empty catalog. An unwired
  // deployment answers a truthful 503 instead of 200-with-no-units, which a
  // customer cannot tell apart from "we sell nothing".
  const catalog =
    options.catalog ?? createEarlyAccessCatalogSourceForDeployment(configured);
  const releases = options.releases ?? new InMemoryEarlyAccessReleaseLedger();
  const routeDependencies = {
    resolveSession,
    // The CUSTOMER source. Its audience comes from the member row the guard
    // authenticated and from nothing else, so a review actor reaching this
    // context authorizes nothing.
    catalog,
    ledger: releases,
    now,
  };
  const catalogRoute = createEarlyAccessCatalogRoute(routeDependencies);
  const resolveMember = options.resolveMember ?? (async () => null);
  app.get(EARLY_ACCESS_CATALOG_PATH, (req: Request, res: Response) => {
    void resolveMember(req)
      .then((member) =>
        catalogRoute({ cookieHeader: req.headers.cookie, member }, res as never),
      )
      .catch(() => {
        // A member lookup that threw is not "no member": it is a broken read,
        // and answering it as an anonymous catalog would quietly downgrade a
        // signed-in customer. It answers unavailable instead.
        res.status(503).json({ ok: false, code: "unavailable" });
      });
  });

  // The commerce routes read the catalog and the ledger through the SAME two
  // sources the storefront does, and validate the session through the SAME
  // resolver. A customer therefore cannot be shown one price and charged
  // against another picture of the world.
  const store = options.store ?? new InMemoryEarlyAccessCommerceStore();
  const audit = options.audit ?? new InMemoryEarlyAccessAuditSink();
  // THE customer identity, resolved through the real directory rather than a
  // hardwired nobody. The reader yields the same hashed session id the session
  // repository stores, and the roster and bindings are the injectable stores
  // above. An empty store resolves nobody, so the fail-closed behaviour of the
  // old NoEarlyAccessIdentity default is preserved exactly; what changed is
  // that the seam a durable roster mounts into now exists, in one place.
  const customers = options.customers ?? new InMemoryEarlyAccessCustomerRepository();
  const sessionBindings = options.sessionBindings ?? new InMemorySessionBindingStore();
  const identity =
    options.identity ??
    new EarlyAccessCustomerDirectory({
      readSessionId: createEarlyAccessSessionIdReader(deps),
      bindings: sessionBindings,
      customers,
    });
  const commerce: EarlyAccessOrderRouteDependencies = {
    resolveSession,
    catalog,
    releases,
    store,
    identity,
    agreements: options.agreements ?? new NoEarlyAccessAgreements(),
    suppliers: options.suppliers ?? new NoEarlyAccessSuppliers(),
    shipping: options.shipping ?? new NoEarlyAccessShipping(),
    referrals: options.referrals ?? new NoEarlyAccessReferrals(),
    proofStorage: options.proofStorage ?? new SyntheticEarlyAccessProofStorage(),
    audit,
    now,
    orderNumber: options.orderNumber ?? (() => generateEarlyAccessOrderNumber()),
    proofId: options.proofId ?? (() => `eaproofid.${randomBytes(16).toString("hex")}`),
  };

  const placeOrder = createEarlyAccessOrderPlacementRoute(commerce);
  const readOrder = createEarlyAccessOrderLookupRoute(commerce);
  const readInvoice = createEarlyAccessInvoiceRoute(commerce);
  const submitProof = createEarlyAccessPaymentProofRoute(commerce);

  app.post(EARLY_ACCESS_ORDERS_PATH, (req: Request, res: Response) => {
    void placeOrder({ cookieHeader: req.headers.cookie, body: req.body }, res);
  });

  app.get(EARLY_ACCESS_ORDER_PATH, (req: Request, res: Response) => {
    void readOrder({ cookieHeader: req.headers.cookie, orderNumber: req.params.orderNumber }, res);
  });

  app.get(EARLY_ACCESS_ORDER_INVOICE_PATH, (req: Request, res: Response) => {
    void readInvoice(
      { cookieHeader: req.headers.cookie, orderNumber: req.params.orderNumber },
      res,
    );
  });

  app.post(EARLY_ACCESS_ORDER_PROOF_PATH, (req: Request, res: Response) => {
    void submitProof(
      { cookieHeader: req.headers.cookie, orderNumber: req.params.orderNumber, body: req.body },
      res,
    );
  });

  // THE admin guard, resolved once and shared by both admin surfaces. Two
  // resolution sites would let the operator routes and the founder release end
  // up behind different gates.
  const adminGuard: RequestHandler = options.requireAdmin ?? requireSupabaseAdmin;

  registerEarlyAccessAdminApi(app, {
    store,
    admins: options.admins ?? new ConfiguredEarlyAccessAdminDirectory(),
    audit,
    now,
    guard: adminGuard,
  });

  registerEarlyAccessFounderReleaseApi(
    app,
    {
      ...routeDependencies,
      // The FOUNDER source. Separate from the customer one because its audience
      // comes from the admin identity the guard authenticated, which is a
      // question about the unit ("could a member be sold this") and never an
      // authorization to sell anything to anybody.
      catalog:
        options.catalog ??
        createEarlyAccessCatalogSourceForDeployment(configured, REVIEW_AUDIENCE_SOURCE),
    },
    { guard: adminGuard, adminActor: options.adminActor },
  );

  return effectiveConfig;
}

/**
 * The operator routes.
 *
 * The acting admin's email is read from what the guard PUT ON THE REQUEST, never
 * from a body or a header, because an audit trail that records the name the
 * caller typed is not an audit trail.
 */
function registerEarlyAccessAdminApi(
  app: Express,
  deps: EarlyAccessAdminRouteDependencies & { readonly guard: RequestHandler },
): void {
  const guard: RequestHandler = (req: Request, res: Response, next: NextFunction) =>
    deps.guard(req, res, next);
  const adminEmailOf = (req: Request): unknown => (req as unknown as { adminEmail?: unknown }).adminEmail;

  const queue = createEarlyAccessPaymentQueueRoute(deps);
  const confirm = createEarlyAccessConfirmPaymentRoute(deps);
  const readSupplierOrder = createEarlyAccessSupplierOrderReadRoute(deps);
  const ensureSupplierOrder = createEarlyAccessSupplierOrderEnsureRoute(deps);
  const notification = createEarlyAccessSupplierNotificationRoute(deps);
  const acknowledgement = createEarlyAccessSupplierAcknowledgementRoute(deps);
  const packing = createEarlyAccessSupplierPackingRoute(deps);
  const tracking = createEarlyAccessSupplierTrackingRoute(deps);
  const shipped = createEarlyAccessSupplierShippedRoute(deps);

  app.get(EARLY_ACCESS_ADMIN_PAYMENTS_PATH, guard, (req: Request, res: Response) => {
    void queue({ adminEmail: adminEmailOf(req) }, res);
  });

  app.post(EARLY_ACCESS_ADMIN_PAYMENT_CONFIRM_PATH, guard, (req: Request, res: Response) => {
    void confirm(
      { adminEmail: adminEmailOf(req), orderNumber: req.params.orderNumber, body: req.body },
      res,
    );
  });

  app.get(EARLY_ACCESS_ADMIN_SUPPLIER_ORDER_PATH, guard, (req: Request, res: Response) => {
    void readSupplierOrder({ adminEmail: adminEmailOf(req), orderNumber: req.params.orderNumber }, res);
  });

  app.post(EARLY_ACCESS_ADMIN_SUPPLIER_ORDER_PATH, guard, (req: Request, res: Response) => {
    void ensureSupplierOrder(
      { adminEmail: adminEmailOf(req), orderNumber: req.params.orderNumber },
      res,
    );
  });

  app.post(EARLY_ACCESS_ADMIN_SUPPLIER_NOTIFICATION_PATH, guard, (req: Request, res: Response) => {
    void notification(
      { adminEmail: adminEmailOf(req), orderNumber: req.params.orderNumber, body: req.body },
      res,
    );
  });

  app.post(
    EARLY_ACCESS_ADMIN_SUPPLIER_ACKNOWLEDGEMENT_PATH,
    guard,
    (req: Request, res: Response) => {
      void acknowledgement(
        { adminEmail: adminEmailOf(req), orderNumber: req.params.orderNumber, body: req.body },
        res,
      );
    },
  );

  app.post(EARLY_ACCESS_ADMIN_SUPPLIER_PACKING_PATH, guard, (req: Request, res: Response) => {
    void packing(
      { adminEmail: adminEmailOf(req), orderNumber: req.params.orderNumber, body: req.body },
      res,
    );
  });

  app.post(EARLY_ACCESS_ADMIN_SUPPLIER_TRACKING_PATH, guard, (req: Request, res: Response) => {
    void tracking(
      { adminEmail: adminEmailOf(req), orderNumber: req.params.orderNumber, body: req.body },
      res,
    );
  });

  app.post(EARLY_ACCESS_ADMIN_SUPPLIER_SHIPPED_PATH, guard, (req: Request, res: Response) => {
    void shipped({ adminEmail: adminEmailOf(req), orderNumber: req.params.orderNumber }, res);
  });
}

/**
 * Mount the founder release surface behind THE admin guard.
 *
 * A founder release is the one place a named human overrides Product Control,
 * so it never mounts unguarded. The guard is resolved once by the caller and
 * passed in, so this surface and the operator routes can never end up behind
 * two different gates. When nothing is injected that resolved guard is
 * `requireSupabaseAdmin`, which itself refuses with 503 when ADMIN_EMAIL is
 * unset, so a misconfigured deployment gets a truthful refusal rather than a
 * silently absent surface.
 */
function registerEarlyAccessFounderReleaseApi(
  app: Express,
  routeDependencies: {
    resolveSession: (cookieHeader: unknown) => Promise<EarlyAccessSessionCheck>;
    catalog: EarlyAccessCatalogSource;
    ledger: EarlyAccessReleaseLedger;
    now: () => number;
  },
  options: {
    readonly guard: RequestHandler;
    readonly adminActor?: (request: Request) => string | null;
  },
): void {
  const requireAdmin: RequestHandler = (req, res, next) => options.guard(req, res, next);
  const adminActor = options.adminActor ?? defaultAdminActor;

  const review = createFounderReleaseReviewRoute(routeDependencies);
  const record = createFounderReleaseRoute(routeDependencies);
  const history = createReleaseHistoryRoute(routeDependencies);

  // The history path is registered BEFORE the collection path so Express does
  // not have to disambiguate them; they differ by suffix, not by parameter, but
  // ordering makes that independent of future edits.
  app.get(EARLY_ACCESS_RELEASE_HISTORY_PATH, requireAdmin, (req: Request, res: Response) => {
    void history({ query: req.query as Record<string, unknown> }, res as never);
  });
  app.get(EARLY_ACCESS_RELEASES_PATH, requireAdmin, (req: Request, res: Response) => {
    void review({ actor: adminActor(req) }, res as never);
  });
  app.post(EARLY_ACCESS_RELEASES_PATH, requireAdmin, (req: Request, res: Response) => {
    // The actor is read from what the guard authenticated and never from the
    // body, even if the body carries a field of the same name.
    void record({ body: req.body, actor: adminActor(req) }, res as never);
  });
}

/**
 * The named human behind an admin request.
 *
 * Read from what the guard attached to the request, in the same order the rest
 * of this server reads it. A request the guard did not annotate yields null,
 * and the route refuses, because a release recorded against nobody is not an
 * audit trail.
 */
function defaultAdminActor(request: Request): string | null {
  // `requireSupabaseAdmin` writes the verified address here after checking the
  // JWT against ADMIN_EMAIL (server/routes.ts). Reading it anywhere else, or
  // reading a header, would be reading something the caller controls.
  const email = (request as unknown as { adminEmail?: unknown }).adminEmail;
  return typeof email === "string" && email.trim().length > 0 ? email.trim() : null;
}

/** Re-exported so the caller can assert the header set without a literal. */
export { PRIVATE_ACCESS_PRIVATE_HEADERS };
