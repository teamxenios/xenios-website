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
  createEarlyAccessExternalProofRoute,
  createEarlyAccessPaymentOrderReadRoute,
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
  createEarlyAccessOverpaymentExceptionRoute,
  createEarlyAccessRefundRoute,
} from "./routes/payment-exception-routes";
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
import { InMemorySessionOrderLog, type SessionOrderLog } from "./routes/ports";
import {
  InMemoryEarlyAccessCustomerRepository,
  type EarlyAccessCustomerRepository,
} from "./identity/early-access-customer";
import {
  createEarlyAccessAgreementAcceptRoute,
  createEarlyAccessAgreementStatusRoute,
  NoEarlyAccessAgreementRecorder,
  type EarlyAccessAgreementRecorder,
  type EarlyAccessRequiredAgreementPair,
} from "./routes/agreement-routes";
import {
  EarlyAccessCustomerDirectory,
  InMemoryConsumedTokenStore,
  InMemorySessionBindingStore,
  type ConsumedTokenStore,
  type SessionBindingStore,
} from "./identity/identity-verification";
import { SessionScopedEarlyAccessIdentityDirectory } from "./identity/session-scoped-identity";
import { earlyAccessCartEnabled } from "./cart/feature-flag";
import {
  resolveEarlyAccessCartStore,
  type CartStorePorts,
} from "./cart/store-composition";
import {
  createEarlyAccessCartCapabilityRoute,
  createEarlyAccessCartCheckoutRoute,
  createEarlyAccessCartQuoteRoute,
  createEarlyAccessCartReadRoute,
  createEarlyAccessCartStatusRoute,
  type CartRequest,
  type CartResponsePort,
} from "./cart/routes";
import {
  createEarlyAccessCartConfirmPaymentAdminRoute,
  createEarlyAccessCartExternalProofAdminRoute,
} from "./cart/admin-routes";
import {
  createEarlyAccessCartPaymentReviewAdminRoute,
  type EarlyAccessAdminAgreementReviewPort,
  type EarlyAccessAdminSubmissionReviewPort,
} from "./cart/admin-payment-review";
import type { EarlyAccessAcceptedSubmissionEvidencePort } from "./cart/settlement";
import {
  createEarlyAccessCartFulfilmentEventAdminRoute,
  type EarlyAccessFulfilmentEventWriter,
} from "./cart/fulfilment-routes";
import {
  createEarlyAccessShippingSlaSweepAdminRoute,
  startEarlyAccessShippingSlaWorker,
  type EarlyAccessShippingSlaDeps,
} from "./cart/shipping-sla-composition";
import { InMemoryEarlyAccessCartStore } from "./cart/store";
import {
  EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS_PATH,
  createEarlyAccessCartPaymentInstructionsRoute,
} from "./cart/payment-instructions-route";
import {
  EARLY_ACCESS_CART_PAYMENT_PROOF_PATH,
  createEarlyAccessCartPaymentProofRoute,
} from "./proof/route";
import {
  createProofSubmissionService,
  type ProofSubmissionDeps,
} from "./proof/submission-service";
import { isCartCheckoutNumber } from "./cart/model";
import { createEnvPaymentInstructionsConfigSource } from "./commerce/payment-instructions-config";
import {
  createConfiguredPaymentMethodRegistry,
  createEnvPaymentMethodRegistrySource,
  createSystemPaymentClock,
} from "./commerce/payment-method-registry";
import { createEarlyAccessOutboxNotifier } from "./cart/outbox-notifier";

import {
  DirectoryCartSuppliers,
  FounderReleaseCartPricing,
  GateCartAgreements,
  PolicyCartShipping,
  StorefrontCartCatalog,
} from "./cart/adapters";
import {
  InMemorySupplierConfirmationStore,
  type SupplierConfirmationStore,
} from "./ops/supplier-confirmation";
import { SupplierConsistentCatalogSource } from "./ops/supplier-availability";
import {
  InMemoryUnitHoldRegistry,
  type UnitHoldRegistry,
} from "./ops/unit-holds";
import {
  InMemoryPendingVerificationQueue,
  registerEarlyAccessOpsRoutes,
} from "./routes/ops-routes";

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
export const EARLY_ACCESS_AGREEMENT_ACCEPT_PATH =
  "/api/research/early-access/agreements/accept";
/** This session customer's own agreement standing. Takes no parameter at all. */
export const EARLY_ACCESS_AGREEMENT_STATUS_PATH = "/api/research/early-access/agreements";
export const EARLY_ACCESS_ORDER_PATH = "/api/research/early-access/orders/:orderNumber";
export const EARLY_ACCESS_ORDER_INVOICE_PATH =
  "/api/research/early-access/orders/:orderNumber/invoice";
export const EARLY_ACCESS_ORDER_PROOF_PATH =
  "/api/research/early-access/orders/:orderNumber/payment-proof";

/**
 * The multi-product cart, mounted only when RESEARCH_EARLY_ACCESS_CART_ENABLED
 * is exactly "true". Quote decides nothing durable; checkout writes the parent,
 * every child line and the invoice in one commit; the read is scoped to the
 * purchaser and answers 404 for anyone else's cart exactly as the single-order
 * lookup does.
 */
/**
 * The browser's one question before it renders anything: is the cart on?
 *
 * 404 (route absent) is the disabled answer and is what lets the accepted
 * single-product journey remain the fallback. It is a LITERAL segment, so it
 * must be registered before `:cartCheckoutNumber` or the parameter route
 * swallows it and "capability" is read as a checkout number.
 */
export const EARLY_ACCESS_CART_CAPABILITY_PATH =
  "/api/research/early-access/cart/capability";
export const EARLY_ACCESS_CART_QUOTE_PATH = "/api/research/early-access/cart/quote";
export const EARLY_ACCESS_CART_CHECKOUT_PATH = "/api/research/early-access/cart/checkout";
export const EARLY_ACCESS_CART_READ_PATH =
  "/api/research/early-access/cart/:cartCheckoutNumber";
/** Payment state, child lines and fulfillment, at a customer-safe level. */
export const EARLY_ACCESS_CART_STATUS_PATH =
  "/api/research/early-access/cart/:cartCheckoutNumber/status";

/** Named-admin only, behind the existing Supabase admin guard. */
export const EARLY_ACCESS_ADMIN_CART_PROOF_PATH =
  "/api/admin/research/cart/:cartCheckoutNumber/external-proof";
/**
 * ONE path, two methods, and deliberately not two paths. GET is the read-only
 * review a named admin sees BEFORE approving; POST is the one settlement
 * action. Putting them on the same path is what stops a reviewer having to
 * check whether the screen and the button agree about which order they mean.
 */
export const EARLY_ACCESS_ADMIN_CART_CONFIRM_PATH =
  "/api/admin/research/cart/:cartCheckoutNumber/confirm-payment";
/** Named-admin shipment facts and corrections, through the M62 RPC only. */
export const EARLY_ACCESS_ADMIN_CART_FULFILMENT_PATH =
  "/api/admin/research/cart/:cartCheckoutNumber/fulfilment-event";
/**
 * The manual drain for the 72-hour monitor, mirroring the notification
 * outbox's own `/api/admin/research/outbox/run`. A literal path, registered
 * BEFORE the parameterized cart admin routes so `:cartCheckoutNumber` cannot
 * swallow `shipping-sla`.
 */
export const EARLY_ACCESS_ADMIN_CART_SHIPPING_SLA_PATH =
  "/api/admin/research/cart/shipping-sla/sweep";

export const EARLY_ACCESS_CART_API_PATHS = Object.freeze([
  EARLY_ACCESS_CART_CAPABILITY_PATH,
  EARLY_ACCESS_CART_QUOTE_PATH,
  EARLY_ACCESS_CART_CHECKOUT_PATH,
  EARLY_ACCESS_CART_READ_PATH,
  EARLY_ACCESS_CART_STATUS_PATH,
  EARLY_ACCESS_CART_PAYMENT_PROOF_PATH,
  EARLY_ACCESS_ADMIN_CART_PROOF_PATH,
  EARLY_ACCESS_ADMIN_CART_CONFIRM_PATH,
  EARLY_ACCESS_ADMIN_CART_FULFILMENT_PATH,
  EARLY_ACCESS_ADMIN_CART_SHIPPING_SLA_PATH,
] as const);

/**
 * The two facts the raw upload cannot carry inside its own body.
 *
 * The body is the file. The filename and the payment method the customer chose
 * therefore arrive as headers, which keeps them out of the byte stream (so a
 * crafted file cannot claim its own name) and keeps the transport limit
 * enforceable before anything is parsed. Exported so a client and a test name
 * the same header rather than each writing its own literal.
 */
export const EARLY_ACCESS_PROOF_FILENAME_HEADER = "x-xenios-proof-filename";
export const EARLY_ACCESS_PROOF_METHOD_HEADER = "x-xenios-proof-method";

export const EARLY_ACCESS_API_PATHS = Object.freeze([
  EARLY_ACCESS_UNLOCK_PATH,
  EARLY_ACCESS_SESSION_PATH,
  EARLY_ACCESS_LOGOUT_PATH,
  EARLY_ACCESS_CATALOG_PATH,
  EARLY_ACCESS_ORDERS_PATH,
  EARLY_ACCESS_AGREEMENT_ACCEPT_PATH,
  EARLY_ACCESS_AGREEMENT_STATUS_PATH,
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
/**
 * The per-order operator read, any payment state. Where an operator acting on
 * ONE order (including awaiting_payment, which the review queue deliberately
 * omits) finds everything the queue would show them, contact included.
 */
export const EARLY_ACCESS_ADMIN_PAYMENT_ORDER_PATH =
  "/api/admin/research/payments/:orderNumber";
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
/** The overpayment resolution door and the refund record. */
export const EARLY_ACCESS_ADMIN_OVERPAYMENT_PATH =
  "/api/admin/research/payments/:orderNumber/overpayment-exception";
export const EARLY_ACCESS_ADMIN_REFUND_PATH =
  "/api/admin/research/payments/:orderNumber/refund";
/**
 * The concierge pilot's proof door: a NAMED admin records the metadata and
 * digest of a payment proof received off platform, so the settlement gate's
 * proof requirement can be met without a fake customer uploader.
 */
export const EARLY_ACCESS_ADMIN_EXTERNAL_PROOF_PATH =
  "/api/admin/research/payments/:orderNumber/external-proof";

export const EARLY_ACCESS_ADMIN_API_PATHS = Object.freeze([
  EARLY_ACCESS_ADMIN_PAYMENTS_PATH,
  EARLY_ACCESS_ADMIN_PAYMENT_ORDER_PATH,
  EARLY_ACCESS_ADMIN_PAYMENT_CONFIRM_PATH,
  EARLY_ACCESS_ADMIN_EXTERNAL_PROOF_PATH,
  EARLY_ACCESS_ADMIN_SUPPLIER_ORDER_PATH,
  EARLY_ACCESS_ADMIN_SUPPLIER_NOTIFICATION_PATH,
  EARLY_ACCESS_ADMIN_SUPPLIER_ACKNOWLEDGEMENT_PATH,
  EARLY_ACCESS_ADMIN_SUPPLIER_PACKING_PATH,
  EARLY_ACCESS_ADMIN_SUPPLIER_TRACKING_PATH,
  EARLY_ACCESS_ADMIN_SUPPLIER_SHIPPED_PATH,
  EARLY_ACCESS_ADMIN_OVERPAYMENT_PATH,
  EARLY_ACCESS_ADMIN_REFUND_PATH,
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

/**
 * One header value, or undefined.
 *
 * A repeated header arrives as an array. It is refused rather than joined or
 * first-wins-ed, because two different filenames or two different payment
 * methods in one request is a request that does not know what it is asking for,
 * and the door's own validation should see the absence rather than a choice
 * this function made.
 */
function headerValue(request: Request, name: string): string | undefined {
  const raw = request.headers?.[name];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * The declared content type, normalized but never widened.
 *
 * Parameters are dropped and the type is lowercased, which is what RFC 9110
 * says the type means. The door still compares the result against the closed
 * four-entry allowlist, so normalizing admits nothing new: it only stops a
 * correct upload being refused because a client appended a charset.
 */
function proofContentType(request: Request): string | undefined {
  const raw = headerValue(request, "content-type");
  if (raw === undefined) return undefined;
  return raw.split(";")[0].trim().toLowerCase();
}

/**
 * What the transport SAID the length was, before the body was read.
 *
 * Advisory only. The real enforcement is the parser's own limit and the door's
 * check on the actual bytes; this exists so an oversized upload can be refused
 * without the bytes being held at all.
 */
function declaredLength(request: Request): number | undefined {
  const raw = headerValue(request, "content-length");
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
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

  /**
   * Observe the EXACT catalog source and release ledger the order door will
   * consult, after registration composes them. The Kris Buy Now handoff reads
   * through these same objects so the shelf and the door can never price a
   * unit from two different sources. Called once, synchronously; observation
   * only, never a second registration.
   */
  readonly onDoorSources?: (sources: {
    readonly catalog: EarlyAccessCatalogSource;
    readonly releases: EarlyAccessReleaseLedger;
  }) => void;

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
  /**
   * When true, the shared access code creates an isolated identity for each
   * valid browser session. The customerRef is derived server-side from the
   * signed session and no email or body-supplied identity is trusted.
   */
  readonly sessionIdentity?: boolean;
  /**
   * Injected for tests, so the cart mount can be exercised without touching
   * process.env. Production reads the real environment.
   */
  readonly env?: NodeJS.ProcessEnv;
  /** Injected for tests. Defaults to the in-memory cart store. */
  /**
   * An EPHEMERAL cart store, for tests and local development only.
   * Refused in production: see cart/store-composition.ts (F4).
   */
  readonly cartStore?: InMemoryEarlyAccessCartStore;
  /**
   * The DURABLE cart store a production deployment must supply when the cart
   * flag is on. Persists through research_early_access_commit_cart_checkout.
   */
  readonly cartCheckoutStore?: CartStorePorts;
  /**
   * The DURABLE dependencies of the customer payment-proof door, minus the two
   * this registration owns: `checkouts` is the resolved cart store above, and
   * `now` is this registration's clock, so the proof path can never read a
   * different cart or a different clock from the rest of the cart.
   *
   * Absent means the door is NOT MOUNTED. There is no in-memory default, for
   * the same reason `cartCheckoutStore` has none: a customer told their proof
   * was accepted, whose submission then vanished on the next restart, is worse
   * off than a customer who could not upload at all. Supplied only by the
   * durable branch of persistence/production-deps.ts.
   */
  readonly proofDependencies?: Omit<ProofSubmissionDeps, "checkouts" | "now">;
  /**
   * THE DURABLE PAYMENT-REVIEW AUTHORITY, and the bridge B2 was missing.
   *
   * ONE object satisfying all three ports, because it IS one object:
   * `SupabaseEarlyAccessAdminPaymentReviewStore` implements the admin
   * submission projection, the agreement-standing projection AND the accepted
   * submission evidence port over the same M62 routines. Supplying it here does
   * two things at once, and both must be the same source of truth or the
   * screen an operator reads and the evidence the settlement uses could
   * disagree:
   *
   *   - the read-only review the named admin sees before approving;
   *   - the accepted-submission evidence `settleEarlyAccessCart` bridges into
   *     an M60 metadata proof row, so a customer who uploaded through the
   *     CUSTOMER proof door can actually be settled.
   *
   * Absent means the review door is not mounted and the settlement door keeps
   * its pre-existing behaviour exactly: it settles only against an external
   * proof a named operator recorded, and refuses `evidence_missing` otherwise.
   * Supplied only by the durable branch of persistence/production-deps.ts.
   */
  readonly cartPaymentReview?: EarlyAccessAdminSubmissionReviewPort &
    EarlyAccessAdminAgreementReviewPort &
    EarlyAccessAcceptedSubmissionEvidencePort;
  /**
   * THE DURABLE 72-HOUR SHIPPING SLA PORTS.
   *
   * `store` is M64's read-only work list; `alerts` is the one notification
   * outbox. Present means the monitor runs on an interval and the named-admin
   * manual drain is mounted. Absent means neither exists, which is what every
   * test and every non-durable deployment gets: no timer, no sweep.
   */
  readonly shippingSla?: EarlyAccessShippingSlaDeps;
  /**
   * The durable fulfilment-event writer, over M62's
   * `research_early_access_record_cart_fulfilment_event`. Present means the
   * named-admin shipment door is mounted. There is no in-memory alternative:
   * shipment facts a restart forgets are worse than a door that is not there.
   */
  readonly fulfilmentEvents?: EarlyAccessFulfilmentEventWriter;
  /**
   * SUPPLIER_CONFIRMED_ON_DEMAND records and unit holds. Both feed the
   * catalog projection at every read AND the manual admin doors that record
   * them, through ONE store each, so the door and the projection can never
   * disagree about what was recorded.
   */
  readonly supplierConfirmations?: SupplierConfirmationStore;
  readonly holds?: UnitHoldRegistry;
  /** The admin-visible queue of minted verification tokens for manual delivery. */
  readonly verificationQueue?: InMemoryPendingVerificationQueue;
  /** What each session created, for the email-entry read guard. */
  readonly sessionOrders?: SessionOrderLog;
  /**
   * Units a named human has deliberately NOT released for sale. They render
   * TEMPORARILY_HELD with no price and no purchase action.
   */
  readonly founderHeldUnits?: readonly Readonly<{
    productId: string;
    variantId: string;
  }>[];
  /**
   * Single-use verification-token consumption, for the email-verification
   * doors. ACCEPTED AND HELD: the doors are not mounted yet, so registration
   * stores nothing through this today, but the injection point exists now so
   * the durable composition can pass its store in one place and the door
   * mount changes no caller. Single-use must be backed by a unique constraint
   * in the durable store; application logic alone does not survive
   * concurrency.
   */
  readonly consumed?: ConsumedTokenStore;
  readonly agreements?: EarlyAccessAgreementGate;
  /**
   * Writes an acceptance. Separate from the gate above, which only reads, so
   * the write path cannot manufacture the answer the read path gives.
   */
  readonly agreementRecorder?: EarlyAccessAgreementRecorder;
  /**
   * The exact (kind, version) pairs this deployment requires. The accept route
   * refuses anything else, so the append-only table can only hold pairs a
   * customer was actually shown. Empty means nothing is required yet, and the
   * order gate stays fail-closed exactly as before.
   */
  readonly requiredAgreements?: readonly EarlyAccessRequiredAgreementPair[];
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
    // The customer-continuity credential exists only in the session-identity
    // pilot. Signed with the same deployment secret as the session cookie,
    // so a rotated secret invalidates both together.
    continuitySecret: options.sessionIdentity === true ? effectiveConfig.sessionSecret : null,
    mintSession: durable
      ? ({ ownerId, now: issuedAt, ttlSeconds }) =>
          mintDurableSession({ repository, ownerId, now: issuedAt, ttlSeconds, randomToken })
      : undefined,
  };

  const unlock = createUnlockRoute(deps);
  const session = createSessionRoute(deps);
  const logout = createLogoutRoute(deps);

  app.post(EARLY_ACCESS_UNLOCK_PATH, (req: Request, res: Response) => {
    void unlock(
      { body: req.body, clientKey: clientKeyFor(req), cookieHeader: req.headers?.cookie },
      res,
    );
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
  // The manual-operations stores, resolved once: the projection reads them
  // and the admin doors write them.
  const supplierConfirmations =
    options.supplierConfirmations ?? new InMemorySupplierConfirmationStore();
  const holds = options.holds ?? new InMemoryUnitHoldRegistry();
  const consumed = options.consumed ?? new InMemoryConsumedTokenStore();
  const verificationQueue =
    options.verificationQueue ?? new InMemoryPendingVerificationQueue();
  // THE ONE SUPPLIER AUTHORITY, resolved here rather than beside the commerce
  // routes, because the CATALOGUE has to consult the same one. Composed before
  // the catalog for exactly that reason.
  const suppliers = options.suppliers ?? new NoEarlyAccessSuppliers();
  // The catalog default is a REFUSAL, not an empty catalog. An unwired
  // deployment answers a truthful 503 instead of 200-with-no-units, which a
  // customer cannot tell apart from "we sell nothing".
  const projectedCatalog =
    options.catalog ??
    createEarlyAccessCatalogSourceForDeployment(configured, undefined, {
      supplierConfirmations,
      holds,
    });
  // SUPPLIER TRUTH, APPLIED ONCE, FOR EVERY DOOR.
  //
  // The catalogue used to answer "can this ship" from
  // `fulfillmentOwnerForLane(product.lane)` while the checkout asked the
  // supplier directory. Two sources, and the lane function returns an owner
  // for every research_material product, so the shelf offered units the order
  // door then refused. This decorator re-decides `purchasable` against the
  // SAME directory the order route, the cart quote and the cart checkout use,
  // and it can only ever withdraw a row, never add one.
  //
  // Applied when a supplier authority is actually mounted. `NoEarlyAccessSuppliers`
  // is the "nothing wired" default of a local composition, and a deployment
  // with no supplier authority at all has no better answer to consult, so the
  // projection stands on its own there. Production always mounts the directory
  // (persistence/production-deps.ts), so production is always consistent.
  const releases = options.releases ?? new InMemoryEarlyAccessReleaseLedger();
  const catalog =
    options.suppliers === undefined
      ? projectedCatalog
      : new SupplierConsistentCatalogSource({
          source: projectedCatalog,
          suppliers,
          // Bounds the lookups to the units actually on the shelf. Never
          // widens what may be sold: a scoped row still has to survive the
          // release bridge.
          releases,
        });
  // THE customer identity, resolved through the real directory rather than a
  // hardwired nobody. The reader yields the same hashed session id the session
  // repository stores, and the roster and bindings are the injectable stores
  // above. An empty store resolves nobody, so the fail-closed behaviour of the
  // old NoEarlyAccessIdentity default is preserved exactly; what changed is
  // that the seam a durable roster mounts into now exists, in one place.
  // Composed BEFORE the catalog mount because the catalog's audience is the
  // customer this directory resolves.
  const customers = options.customers ?? new InMemoryEarlyAccessCustomerRepository();
  const sessionBindings = options.sessionBindings ?? new InMemorySessionBindingStore();
  const readSessionId = createEarlyAccessSessionIdReader(deps);
  const boundIdentity = new EarlyAccessCustomerDirectory({
    readSessionId,
    bindings: sessionBindings,
    customers,
  });
  const identity =
    options.identity ??
    (options.sessionIdentity === true
      ? new SessionScopedEarlyAccessIdentityDirectory({
          resolveSession,
          readSessionId,
          primary: boundIdentity,
          continuitySecret: effectiveConfig.sessionSecret,
        })
      : boundIdentity);

  options.onDoorSources?.({ catalog, releases });

  const routeDependencies = {
    resolveSession,
    // Founder-held units stay visible and unsellable rather than vanishing.
    ...(options.founderHeldUnits === undefined
      ? {}
      : { founderHeldUnits: options.founderHeldUnits }),
    // The CUSTOMER source. Its audience comes from the APPROVED Early Access
    // customer the identity directory resolved for this session, and from
    // nothing else: a member row rides along for provenance parity but
    // authorizes nothing, and a review actor reaching this context authorizes
    // nothing.
    catalog,
    ledger: releases,
    now,
  };
  const catalogRoute = createEarlyAccessCatalogRoute(routeDependencies);
  const resolveMember = options.resolveMember ?? (async () => null);
  app.get(EARLY_ACCESS_CATALOG_PATH, (req: Request, res: Response) => {
    void Promise.all([
      resolveMember(req),
      identity.resolve({ cookieHeader: req.headers.cookie }),
    ])
      .then(([member, earlyAccessCustomer]) =>
        catalogRoute(
          { cookieHeader: req.headers.cookie, member, earlyAccessCustomer },
          res as never,
        ),
      )
      .catch(() => {
        // A lookup that threw is not "nobody": it is a broken read, and
        // answering it as an anonymous catalog would quietly downgrade a
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
  const sessionOrders = options.sessionOrders ?? new InMemorySessionOrderLog();
  const commerce: EarlyAccessOrderRouteDependencies = {
    resolveSession,
    catalog,
    releases,
    store,
    identity,
    // The pair that lets an email-entry session read back its OWN new order
    // and nothing older. Absent, such a session reads nothing (fails closed).
    readSessionId,
    sessionOrders,
    agreements: options.agreements ?? new NoEarlyAccessAgreements(),
    // The same instance the catalogue was decided against, so the shelf and
    // the order door cannot answer the supplier question differently.
    suppliers,
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

  // Acceptance, mounted BEFORE orders in this file only for readability; Express
  // matches on the exact path, and the two never overlap.
  const requiredAgreements = options.requiredAgreements ?? [];
  const acceptAgreement = createEarlyAccessAgreementAcceptRoute({
    identity,
    recorder: options.agreementRecorder ?? new NoEarlyAccessAgreementRecorder(),
    required: requiredAgreements,
    now,
  });
  // The read half. It is given `commerce.agreements`, the very object the order
  // route asks, so the screen and the checkout can never disagree about whether
  // this customer has agreed.
  const readAgreementStatus = createEarlyAccessAgreementStatusRoute({
    identity,
    agreements: commerce.agreements,
    required: requiredAgreements,
  });

  app.post(EARLY_ACCESS_AGREEMENT_ACCEPT_PATH, (req: Request, res: Response) => {
    void acceptAgreement(
      {
        cookieHeader: req.headers.cookie,
        body: req.body,
        // req.ip is the server's own, derived from the trusted proxy chain.
        // x-request-id is caller-provided metadata kept only for log
        // correlation; it is bounded, carries no secret, and no decision reads
        // it. Neither comes from the body, which is what actually matters here.
        requestIp: typeof req.ip === "string" ? req.ip : null,
        requestId:
          typeof req.headers["x-request-id"] === "string"
            ? req.headers["x-request-id"]
            : null,
      },
      res,
    );
  });

  // No parameter is read from the request beyond the session cookie, so there is
  // no way to ask this route about anybody but the caller.
  app.get(EARLY_ACCESS_AGREEMENT_STATUS_PATH, (req: Request, res: Response) => {
    void readAgreementStatus({ cookieHeader: req.headers.cookie }, res);
  });

  app.post(EARLY_ACCESS_ORDERS_PATH, (req: Request, res: Response) => {
    void placeOrder({ cookieHeader: req.headers.cookie, body: req.body }, res);
  });

  app.get(EARLY_ACCESS_ORDER_PATH, (req: Request, res: Response) => {
    void readOrder({ cookieHeader: req.headers.cookie, orderNumber: req.params.orderNumber }, res);
  });

  // THE admin guard, resolved once and shared by both admin surfaces. Two
  // resolution sites would let the operator routes and the founder release end
  // up behind different gates.
  const adminGuard: RequestHandler = options.requireAdmin ?? requireSupabaseAdmin;
  // Hoisted above the cart block on purpose. `const` is in the temporal dead
  // zone until its initializer runs, so mounting the named-admin cart doors
  // from inside that block while this still sat below it would have thrown a
  // ReferenceError at registration the moment the flag went true. Still ONE
  // resolution site.
  // The acting admin, taken from what the GUARD put on the request. Never
  // from a body or a header: an audit trail recording the name the caller
  // typed is not an audit trail. A missing or blank identity yields null, and
  // the routes answer 401 rather than settling money for 'someone'.
  const adminActorOf = (req: Request): Readonly<{ id: string }> | null => {
    const email = (req as unknown as { adminEmail?: unknown }).adminEmail;
    if (typeof email !== "string" || email.trim() === "") return null;
    return Object.freeze({ id: email.trim() });
  };

  // THE MULTI-PRODUCT CART, off unless a named human switched it on.
  //
  // It reuses the identity, catalogue, release, promotion, supplier, shipping
  // and agreement seams the single-product path uses (see cart/adapters.ts),
  // so the two paths cannot disagree about what may be sold or at what price.
  // The browser never loops over the single-product door to buy several
  // things: it quotes once and checks out once.
  const cartEnabled = earlyAccessCartEnabled(options.env ?? process.env);
  const cartIdentity = {
    async resolve(cookieHeader: unknown) {
      const customer = await identity.resolve({ cookieHeader });
      if (customer === null) return null;
      return Object.freeze({
        customerRef: customer.customerRef,
        aliases: customer.aliasRefs ?? [],
      });
    },
  };

  // THE CAPABILITY PROBE, REGISTERED EXACTLY ONCE, WHATEVER THE FLAG SAYS.
  //
  // The browser asks this before it renders anything, and falls back to the
  // existing single-product journey on a 404 while deliberately refusing to
  // fall back on anything else, so a MISCONFIGURED cart cannot hide behind the
  // old flow. That contract assumed an unmounted API path answers 404. In this
  // deployment it does not: serveStatic ends with a catch-all that sends
  // index.html for any unmatched path, `/api/...` included, so leaving this
  // route off returned 200 with an HTML page. The browser read a 200 whose
  // body was not the capability object, called it misconfigured, and showed an
  // error card. The flag is false by default and false in production, so that
  // was the DEFAULT state: every Early Access customer seeing an error and no
  // way to order.
  //
  // ONE registration rather than one per branch. Two `app.get` calls on the
  // same path are a duplicate route even when the branches are mutually
  // exclusive, and the route-uniqueness gate is right to refuse them: a reader
  // cannot tell by inspection which one Express will answer with.
  //
  // Registered before `/cart/:cartCheckoutNumber` for the usual reason:
  // "capability" is a literal segment and the parameter route would swallow it.
  const cartCapability = createEarlyAccessCartCapabilityRoute(cartIdentity);
  app.get(EARLY_ACCESS_CART_CAPABILITY_PATH, (req: Request, res: Response) => {
    if (!cartEnabled) {
      res.setHeader("Cache-Control", "no-store, private, max-age=0");
      res.status(404).json({ ok: false, code: "CART_DISABLED" });
      return;
    }
    void cartCapability({ cookieHeader: req.headers?.cookie }, res as never).catch(() => {
      if (!res.headersSent) {
        res.setHeader("Cache-Control", "no-store, private, max-age=0");
        res.status(503).json({ ok: false, code: "UNAVAILABLE" });
      }
    });
  });

  // A COMMITMENT ALREADY MADE IS SUPERVISED WHETHER OR NOT THE CART IS OPEN.
  //
  // Every other cart door lives inside `if (cartEnabled)`, because the flag
  // decides whether a CUSTOMER may transact. These two are deliberately
  // outside it, because they are about orders that already exist:
  //
  //   - the 72-hour SLA monitor, which alerts a human when a settled order
  //     passes its durable ship-by with no shipment recorded;
  //   - the named-admin shipment door, which records that the order shipped.
  //
  // Turning the cart off closes the storefront. It must not also stop us
  // honouring the 72-hour commitments we already made, and it must not leave
  // an operator unable to record a shipment for an order already paid for.
  // Both are mounted only when the DURABLE ports exist, so a memory or refused
  // deployment still has neither, and neither reads the cart store: they speak
  // to M64's read-only work list and M62's fulfilment RPC directly.
  //
  // The literal `shipping-sla` path is registered FIRST, before every
  // parameterized admin cart route below, for the usual reason.
  if (options.shippingSla) {
    const slaWorker = startEarlyAccessShippingSlaWorker(options.shippingSla);
    const sweepShippingSla = createEarlyAccessShippingSlaSweepAdminRoute({ worker: slaWorker });
    app.post(
      EARLY_ACCESS_ADMIN_CART_SHIPPING_SLA_PATH,
      adminGuard,
      (req: Request, res: Response) => {
        void sweepShippingSla({ actor: adminActorOf(req) }, res as never);
      },
    );
  }

  if (options.fulfilmentEvents) {
    const recordFulfilmentEvent = createEarlyAccessCartFulfilmentEventAdminRoute({
      events: options.fulfilmentEvents,
    });
    app.post(
      EARLY_ACCESS_ADMIN_CART_FULFILMENT_PATH,
      adminGuard,
      (req: Request, res: Response) => {
        void recordFulfilmentEvent(
          {
            actor: adminActorOf(req),
            cartCheckoutNumber: req.params.cartCheckoutNumber,
            body: req.body,
          },
          res as never,
        ).catch(() => {
          if (!res.headersSent) {
            res.setHeader("Cache-Control", "no-store, private, max-age=0");
            res.status(503).json({ ok: false, code: "UNAVAILABLE" });
          }
        });
      },
    );
  }

  if (cartEnabled) {
    // F4. Not `?? new InMemoryEarlyAccessCartStore()`. A default reached by
    // omission would let a production deployment boot with the cart on and a
    // checkout store in RAM, and lose paid orders on the next restart.
    const cartStore = resolveEarlyAccessCartStore({
      durable: options.cartCheckoutStore,
      unsafeMemoryStore: options.cartStore,
      env: options.env ?? process.env,
    });
    const cartCatalog = new StorefrontCartCatalog({ catalog, releases });
    const cartPricing = new FounderReleaseCartPricing({ catalog, releases });
    const quoteCart = createEarlyAccessCartQuoteRoute({
      identity: cartIdentity,
      catalog: cartCatalog,
      releases: cartPricing,
      suppliers: new DirectoryCartSuppliers(commerce.suppliers),
      shipping: new PolicyCartShipping(commerce.shipping),
      agreements: new GateCartAgreements(commerce.agreements),
      quotes: cartStore,
      now,
    });
    // ONE notifier for both customer moments, built from the SAME protected
    // configuration and registry the payment route reads, so the amount in the
    // email and the amount on the page cannot come from different places.
    const cartNotifier = createEarlyAccessOutboxNotifier({
      config: createEnvPaymentInstructionsConfigSource(options.env ?? process.env),
      methodRegistry: createConfiguredPaymentMethodRegistry(
        createEnvPaymentMethodRegistrySource(options.env ?? process.env),
      ),
      clock: createSystemPaymentClock(),
    });
    const checkoutCart = createEarlyAccessCartCheckoutRoute({
      identity: cartIdentity,
      quotes: cartStore,
      checkouts: cartStore,
      audit: {
        async record(event) {
          await audit.record(event as never);
        },
      },
      now,
      notify: cartNotifier,
    });
    const readCart = createEarlyAccessCartReadRoute({
      identity: cartIdentity,
      checkouts: cartStore,
    });
    const cartStatus = createEarlyAccessCartStatusRoute({
      identity: cartIdentity,
      checkouts: cartStore,
      settlements: cartStore,
    });

    // WHEN THE DURABLE STORE CANNOT ANSWER, SAY SO. DO NOT HANG.
    //
    // Every cart handler below persists through the durable RPC, and an RPC
    // that is missing, unreachable or malformed throws. A bare `void handler()`
    // turns that throw into an unhandled rejection with no response written,
    // so the browser sees a request that never ends: the worst possible answer
    // during a checkout, because the customer cannot tell an order that failed
    // from one that succeeded.
    //
    // 503 with no detail is the truthful answer. It is also the SAFE one: it
    // is a refusal, so nothing here can be mistaken for a placed order, and it
    // never degrades to an in-process store (see cart/store-composition.ts).
    // The error itself is deliberately not echoed; the persistence layer's
    // opaque error already exists because a driver error carries connection
    // strings and argument values.
    const cartDoor =
      (handler: (input: CartRequest, response: CartResponsePort) => Promise<void>) =>
      (req: Request, res: Response): void => {
        void handler(
          {
            cookieHeader: req.headers?.cookie,
            body: req.body,
            cartCheckoutNumber: req.params?.cartCheckoutNumber,
          },
          res as never,
        ).catch(() => {
          if (!res.headersSent) {
            res.setHeader("Cache-Control", "no-store, private, max-age=0");
            res.status(503).json({ ok: false, code: "UNAVAILABLE" });
          }
        });
      };

    // LITERAL BEFORE PARAMETER. `/cart/quote` is a real segment;
    // `/cart/:cartCheckoutNumber` would otherwise match it first and answer a
    // quote as a malformed checkout number. The capability probe is registered
    // above, once, for both flag states.
    app.post(EARLY_ACCESS_CART_QUOTE_PATH, cartDoor(quoteCart));
    app.post(EARLY_ACCESS_CART_CHECKOUT_PATH, cartDoor(checkoutCart));
    // Status before the bare read, same literal-before-parameter reason: the
    // trailing `/status` segment is part of a longer path, so it is safe, but
    // registering it first keeps the two together and the ordering obvious.
    app.get(EARLY_ACCESS_CART_STATUS_PATH, cartDoor(cartStatus));
    app.get(EARLY_ACCESS_CART_READ_PATH, cartDoor(readCart));

    // WHERE THE MONEY ACTUALLY GOES, AND ONLY HERE.
    //
    // Inside `if (cartEnabled)`, so the door does not exist while the cart is
    // off. Under /api/research, so the research wall answers an unauthenticated
    // caller before the handler runs, and the handler then resolves the
    // customer from the session cookie and refuses a checkout that is not
    // theirs with the SAME 404 an unknown checkout gets.
    //
    // Two independent server-side sources decide what a customer sees: the
    // configuration says where money would go, the protected registry says
    // which methods a named human approved, verified and enabled. Neither is
    // reachable from the request. GET only: reading payment instructions is not
    // an action, and nothing on this path can settle, release or mark paid.
    app.get(
      EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS_PATH,
      cartDoor(
        createEarlyAccessCartPaymentInstructionsRoute({
          identity: cartIdentity,
          checkouts: cartStore,
          config: createEnvPaymentInstructionsConfigSource(options.env ?? process.env),
          methodRegistry: createConfiguredPaymentMethodRegistry(
            createEnvPaymentMethodRegistrySource(options.env ?? process.env),
          ),
          clock: createSystemPaymentClock(),
        }),
      ),
    );

    // THE CUSTOMER PAYMENT-PROOF DOOR, and the last step of the journey.
    //
    // Mounted only when the DURABLE dependencies were supplied, so a memory or
    // refused deployment has no door rather than a door over a store that
    // forgets. Inside the cart flag, under /api/research (the wall admits this
    // exact path, method-exact, over the XEC- grammar), and registered after the
    // literal cart paths for the same reason every other parameterized cart
    // route is.
    //
    // The handler does no deciding. It reads the raw body Express parsed for
    // this path only, the two headers the body cannot carry, and the customer
    // the session resolves; ownership, the legal binding, the agreement
    // checkpoint, the method and the bytes are all decided inside the service.
    // NOTHING here settles a payment, releases a supplier or issues a receipt:
    // the service holds no port that could.
    if (options.proofDependencies !== undefined) {
      const proofDoor = createEarlyAccessCartPaymentProofRoute({
        identity: cartIdentity,
        submit: createProofSubmissionService({
          ...options.proofDependencies,
          // THE cart store, not a second one, so "is this order still awaiting
          // payment" has one answer across quote, checkout, status and proof.
          checkouts: cartStore,
          now,
        }),
        // The same guard every other cart door applies to a checkout number,
        // injected rather than restated so there is one grammar.
        isCheckoutNumber: isCartCheckoutNumber,
      });
      app.post(EARLY_ACCESS_CART_PAYMENT_PROOF_PATH, (req: Request, res: Response) => {
        void proofDoor(
          {
            cookieHeader: req.headers?.cookie,
            cartCheckoutNumber: req.params?.cartCheckoutNumber,
            // A Buffer IS a Uint8Array, and this is the body express.raw parsed
            // for this path alone. An unaccepted content type never reaches the
            // parser, so this stays undefined and the door answers 415.
            bytes: req.body,
            contentType: proofContentType(req),
            filename: headerValue(req, EARLY_ACCESS_PROOF_FILENAME_HEADER),
            method: headerValue(req, EARLY_ACCESS_PROOF_METHOD_HEADER),
            declaredContentLength: declaredLength(req),
          },
          res as never,
        ).catch(() => {
          if (!res.headersSent) {
            res.setHeader("Cache-Control", "no-store, private, max-age=0");
            res.status(503).json({ ok: false, code: "UNAVAILABLE" });
          }
        });
      });
    }

    // THE NAMED-ADMIN DOORS, behind the SAME Supabase admin guard every other
    // operator route uses, and deliberately NOT under /api/research: the
    // research wall decides who may reach a customer surface, and settling a
    // cart is not one.
    //
    // The acting admin comes from what the guard put on the request, never
    // from a body or a header. An audit trail that records the name the caller
    // typed is not an audit trail.
    const cartSettlementDeps = {
      checkouts: cartStore,
      settlements: cartStore,
      audit: {
        async record(event: unknown) {
          await audit.record(event as never);
        },
      },
      // THE BRIDGE THAT WAS MISSING (B2).
      //
      // Without it, a customer who uploaded through the CUSTOMER proof door had
      // a durable, accepted submission row and NO external-proof row, so
      // `settleEarlyAccessCart` refused `evidence_missing` and the canonical
      // settlement door could never be used for the journey the product
      // actually ships. The bridge does not weaken anything: the port only
      // yields evidence for a submission whose internal email was ACCEPTED and
      // which needs no reconciliation, and the database refuses the settlement
      // outright without such a row regardless of what this process believes.
      //
      // Spread from options rather than set to `undefined`, so a deployment
      // that supplies no review authority keeps the previous behaviour exactly.
      ...(options.cartPaymentReview
        ? { submissionEvidence: options.cartPaymentReview }
        : {}),
    };
    const recordCartProof = createEarlyAccessCartExternalProofAdminRoute({
      ...cartSettlementDeps,
      now,
    });
    const confirmCartPayment = createEarlyAccessCartConfirmPaymentAdminRoute({
      ...cartSettlementDeps,
      now,
      notify: cartNotifier,
      checkouts: cartStore,
    });

    app.post(EARLY_ACCESS_ADMIN_CART_PROOF_PATH, adminGuard, (req: Request, res: Response) => {
      void recordCartProof(
        {
          actor: adminActorOf(req),
          cartCheckoutNumber: req.params.cartCheckoutNumber,
          body: req.body,
        },
        res as never,
      );
    });
    app.post(EARLY_ACCESS_ADMIN_CART_CONFIRM_PATH, adminGuard, (req: Request, res: Response) => {
      void confirmCartPayment(
        {
          actor: adminActorOf(req),
          cartCheckoutNumber: req.params.cartCheckoutNumber,
          body: req.body,
        },
        res as never,
      );
    });

    // THE READ-ONLY REVIEW, on the SAME path as the settlement action.
    //
    // GET decides nothing and settles nothing: it reads the checkout, the
    // settlement, the submission projection and the agreement standing, and
    // reports the blockers. It is mounted only when the durable review
    // authority exists, so a deployment without it has no half-answering door.
    // ONE registration, deliberately, not one per branch: two `app.get` calls
    // on one path is a duplicate route even when the branches are exclusive.
    if (options.cartPaymentReview) {
      const reviewCartPayment = createEarlyAccessCartPaymentReviewAdminRoute({
        checkouts: cartStore,
        settlements: cartStore,
        submissions: options.cartPaymentReview,
        agreements: options.cartPaymentReview,
      });
      app.get(EARLY_ACCESS_ADMIN_CART_CONFIRM_PATH, adminGuard, (req: Request, res: Response) => {
        void reviewCartPayment(
          {
            actor: adminActorOf(req),
            cartCheckoutNumber: req.params.cartCheckoutNumber,
          },
          res as never,
        ).catch(() => {
          if (!res.headersSent) {
            res.setHeader("Cache-Control", "no-store, private, max-age=0");
            res.status(503).json({ ok: false, code: "UNAVAILABLE" });
          }
        });
      });
    }

  }

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


  // The manual operations doors: customer verification binding, and the admin
  // records (approve customer, supplier confirmation, unit hold) that the
  // projection consumes on its next read.
  registerEarlyAccessOpsRoutes(app, {
    guard: adminGuard,
    adminActor: options.adminActor ?? defaultAdminActor,
    resolveSession,
    readSessionId: createEarlyAccessSessionIdReader(deps),
    customers,
    sessionBindings,
    consumed,
    confirmations: supplierConfirmations,
    holds,
    verificationQueue,
    secret: effectiveConfig.sessionSecret,
    now,
  });

  registerEarlyAccessAdminApi(app, {
    store,
    admins: options.admins ?? new ConfiguredEarlyAccessAdminDirectory(),
    audit,
    now,
    // The concierge external-proof door reserves against the SAME private
    // bucket and mints ids from the SAME generator as the customer proof
    // route, so one proof chain has one vocabulary.
    proofStorage: commerce.proofStorage,
    proofId: commerce.proofId,
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
        // The SAME recorded facts the customer projection reads: a founder
        // reviewing a unit must see the confirmation and the hold the
        // operator recorded, or review approves against a stale world.
        createEarlyAccessCatalogSourceForDeployment(configured, REVIEW_AUDIENCE_SOURCE, {
          supplierConfirmations,
          holds,
        }),
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

  const externalProof = createEarlyAccessExternalProofRoute(deps);
  app.post(EARLY_ACCESS_ADMIN_EXTERNAL_PROOF_PATH, guard, (req: Request, res: Response) => {
    void externalProof(
      { adminEmail: adminEmailOf(req), orderNumber: req.params.orderNumber, body: req.body },
      res,
    );
  });

  const paymentOrder = createEarlyAccessPaymentOrderReadRoute(deps);
  app.get(EARLY_ACCESS_ADMIN_PAYMENT_ORDER_PATH, guard, (req: Request, res: Response) => {
    void paymentOrder({ adminEmail: adminEmailOf(req), orderNumber: req.params.orderNumber }, res);
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

  // The two doors an overpaying customer's money needs. Both RECORD and
  // neither settles: confirmation stays the only path that verifies a
  // payment, issues a receipt, releases a supplier, or accrues commission.
  const overpayment = createEarlyAccessOverpaymentExceptionRoute(deps);
  const refund = createEarlyAccessRefundRoute(deps);

  app.post(EARLY_ACCESS_ADMIN_OVERPAYMENT_PATH, guard, (req: Request, res: Response) => {
    void overpayment(
      { adminEmail: adminEmailOf(req), orderNumber: req.params.orderNumber, body: req.body },
      res,
    );
  });

  app.post(EARLY_ACCESS_ADMIN_REFUND_PATH, guard, (req: Request, res: Response) => {
    void refund(
      { adminEmail: adminEmailOf(req), orderNumber: req.params.orderNumber, body: req.body },
      res,
    );
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
