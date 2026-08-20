import express, { type Request, type RequestHandler, Response, NextFunction } from "express";
import helmet from "helmet";
import { createProxyMiddleware } from "http-proxy-middleware";
import { registerRoutes } from "./routes";
import {
  registerLegacyResearchOrderContainment,
  researchPageGate,
  registerResearchApi,
} from "./research";
import { registerMembershipApi } from "./research/membership";
import { registerPrivateEarlyAccessApi } from "./research/early-access/register";
import { buildEarlyAccessPersistence } from "./research/early-access/persistence/production-deps";
import { registerMemberApi } from "./research/members";
import { registerMemberAccessApi } from "./research/guards";
import { registerOutboxAdmin, startOutboxWorker } from "./research/outbox";
import { registerReferralFraudAdmin } from "./research/fraud-admin";
import { registerMemberPlatformApi } from "./research/member-platform";
import { defaultDeps as defaultMemberPlatformDeps } from "./research/member-platform-deps";
import { registerMemberCapabilityApi } from "./research/capabilities";
import { registerCommerceApi } from "./research/commerce/routes";
import { buildCommerceDependencies } from "./research/commerce/production-deps";
import { registerMemberCatalogApi } from "./research/catalog/member-catalog-routes";
import { registerProductionAccountIdentityApi } from "./research/account-identity/production-mount";
import { buildKrisBuyerScopedPricingFromEnv } from "./research/account-identity/kris-buyer-price-sheet-production";
import { createOutboxLegacyOrderNotifier } from "./research/early-access/notifications/legacy-order-notifier";
import { createOutboxTrackingNotifier } from "./research/early-access/notifications/tracking-notifier";
import type {
  KrisDoorCatalogSource,
  KrisDoorReleaseLedger,
} from "./research/kris-launch-a/legacy-order-production";
import {
  buildMemberCatalogProductionService,
  buildProductionVariantInventoryFactsReader,
  memberAudienceSourceVersion,
} from "./research/catalog/member-catalog-service";
import type { AdminProductDetail } from "@shared/research/product-admin";
import type { DomainReadiness, RequiredInput } from "@shared/research/required-inputs";
import {
  createProductControlSelectionAuthority,
  masterOfferingSelectionAuthorityFromEnv,
  type CartSelectionFactsReader,
} from "./research/master-offerings/direct-commerce-selections";
import { createProductionProductControlReader } from "./research/catalog/product-control-reader";
import {
  CatalogPricingProductSource,
  createAuthoritativePriceResolver,
} from "./research/pricing/authoritative-price-resolver";
import {
  pricingEnabledFromCommerceEnv,
  registerPricingApi,
  type PricingAudienceGrant,
} from "./research/pricing/routes";
import {
  buildWebsite3ProductionDependencies,
  registerProductsDiagnosticsApi,
  toTrainerSafeBiomarkerSummary,
} from "./research/products-diagnostics";
import { ProductAdminService } from "./research/products-diagnostics/product-admin";
import { buildProductAdminProductionService } from "./research/products-diagnostics/product-admin-integration";
import { registerProductAdminApi } from "./research/products-diagnostics/product-admin-routes";
import { buildInventoryLotAdminIntegrationDependencies } from "./research/inventory-admin/integration";
import { registerInventoryLotAdminApi } from "./research/inventory-admin/routes";
import {
  buildPrelaunchGuard,
  buildPrelaunchProductionDependencies,
  registerPrelaunchApi,
} from "./research/prelaunch";
import {
  buildRequiredInputProductionRepository,
  registerRequiredInputApi,
} from "./research/required-inputs";
import { registerAssessmentRequiredInputPlanApi } from "./research/assessment-required-inputs";
import {
  buildCareAppointmentRepository,
  buildCareEligibilityRepository,
  buildCareIntakeRepository,
  buildCarePrescriptionRepository,
  buildCareProductionDependencies,
  carePageGate,
  registerCareApi,
  registerCareAppointmentApi,
  registerCareEligibilityApi,
  registerCareIntakeApi,
  registerCarePrescriptionApi,
} from "./care";
import { registerFoundingActivationApi } from "./research/membership-activation/routes";
import { buildFoundingActivationDependencies } from "./research/membership-activation/production-deps";
import {
  createPrivateEarlyAccessPaymentOptionsContainmentMiddleware,
} from "./research/early-access/private-access-route";
import {
  createProofBodyErrorHandler,
  isProofUploadPath,
} from "./research/early-access/proof/route";
import { EARLY_ACCESS_PROOF_CONTENT_TYPES } from "./research/early-access/commerce/payment-proof";
import { TRANSIENT_PROOF_MAX_BYTES } from "./research/early-access/proof/transient-proof";
import { requireActiveMember, requireMember, type MemberRow } from "./research/member-auth";
import {
  KRIS_CATALOG_ERROR_BASE_PATH,
  buildKrisCatalogProductionDependencies,
  krisCatalogErrorHandler,
  krisCatalogRouteTable,
} from "./research/kris-launch-a";
import {
  MASTER_OFFERING_CATALOG_ERROR_BASE_PATH,
  masterOfferingCatalogErrorHandler,
  masterOfferingCatalogRouteTable,
} from "./research/master-offerings/mount";
import type { MasterOfferingCatalogViewer } from "./research/master-offerings/routes";
import { createMasterOfferingCatalogDependencies } from "./research/master-offerings/composition";
import { mayViewMasterOfferings } from "./research/master-offerings/visibility-policy";
import {
  masterOfferingViewerForMember,
  pricingIdentityFromViewer,
  type MasterOfferingViewerWithGrant,
} from "./research/master-offerings/member-pricing-viewer";
import {
  bindingsByOfferingVariantId,
  loadBindingIndex,
  masterOfferingProductionBindings,
  MASTER_OFFERING_COMMITTED_BINDINGS_PATH,
} from "./research/master-offerings/production-bindings";
import {
  affiliateCodesEnabled,
  affiliatePortalEnabled,
} from "./research/affiliates/v2/feature-flags";
import {
  createReferralCaptureRouteTable,
  referralCaptureExpressHandler,
} from "./research/partners/referral-capture-routes";
import {
  createAttributionService,
  createInMemoryAttributionRepository,
} from "./research/partners/attribution";
import { verifiedAttributionRefFromCookieHeader } from "./research/partners/attribution-cookie";
import {
  resolveAttributionTouchStore,
  resolvePartnerLinkStore,
} from "./research/commerce/persistence/partners-store";
import {
  DEFAULT_LAUNCH_PROGRAM,
  resolveAffiliateProgram,
} from "@shared/research/affiliate-program/config";
import { registerPartnerPortalApi } from "./research/partners/portal-routes";
import {
  partnerSubmissionsEnabled,
  resolvePartnerPortalPort,
} from "./research/partners/portal-production";
import { buildAssistedOrderProduction } from "./research/assisted-order/production-deps";
import {
  assistedOrderExpressHandler,
  createAssistedOrderViewerResolvers,
  type ExpressAssistedOrderRequest,
} from "./research/assisted-order/express";
import { createAssistedOrderRouteTable } from "./research/assisted-order/http";
import type { SupabaseRpcClient as AssistedOrderRpcClient } from "./research/assisted-order/supabase-repository";
import type { SupabaseStorageClient as AssistedOrderStorageClient } from "./research/assisted-order/supabase-document-store";
import { requireSupabaseAdmin } from "./routes";
import { getSupabaseAdmin, supabaseConfigured } from "./supabase";
import { promoteHeldRewards } from "./research/referrals";
import { sweepExpiredApprovals } from "./research/expiry";
import { runProductionFoundingSchedulerTick } from "./research/membership-activation/scheduler";
import { logEmailStartupDiagnostics } from "./services/email-config";
import { serveStatic } from "./static";
import { formatWithRequestId, requestId, shouldLogApiResponseBody } from "./request-logging";
import { createServer } from "http";

const app = express();
// Behind the deployment's reverse proxy, req.ip must be the CLIENT address,
// not the proxy's, or every unlock attempt shares one rate-limit bucket and a
// single scripted attacker can lock the door for everyone (QA R9).
//
// TWO hops, verified from production response headers on 2026-08-20: one
// response carries both Cloudflare markers (Server: cloudflare, CF-RAY,
// cf-cache-status) and Render markers (x-render-origin-server, rndr-id), so the
// chain is client -> Cloudflare -> Render -> Node. This said 1 because the
// original handoff described Render as the only hop; Cloudflare appears nowhere
// in the docs and was never in view. At 1, Express skipped a single hop from
// the socket and handed back the Cloudflare EGRESS address, so req.ip was the
// CDN edge shared by every customer in that colo — and the Early Access unlock
// lockout keys on exactly that value. Five mistyped passwords from any mix of
// customers behind one edge locked the shared bucket for fifteen minutes, and
// every correct password after that was refused with the same message a wrong
// one produces. The guard added to prevent a shared bucket was creating one.
//
// 2 is also the safe ceiling, not merely the working one: an attacker who sends
// their own X-Forwarded-For gets it appended to, not honoured, so the value
// Express returns is the address Cloudflare recorded. 3 would hand back the
// attacker's own string.
app.set("trust proxy", 2);
// Collapse duplicate slashes FIRST, before any gate or wall: a later rewrite
// would let //api/research/... slip past the research wall (which matched the
// un-normalized path) and reach a normalized route unguarded. Mounted here,
// every gate below sees the same canonical path the router will match, and
// //api/... is the API's own answer, never fallback HTML with a 200 (QA R8).
app.use((req, _res, next) => {
  if (req.url.startsWith("//")) {
    req.url = req.url.replace(/^\/{2,}/, "/");
  }
  next();
});
const httpServer = createServer(app);

// Serve the Kairos MVP in place at xeniostechnology.com/kairos by reverse-proxying to the deployed
// Kairos app (which is built with basePath /kairos, so /kairos/_next and /kairos/api resolve there).
// Registered FIRST, before helmet and the body parsers, so request/response streams pass through
// untouched. Only /kairos* is proxied; the rest of the site is unaffected. Synthetic, no-send app.
const KAIROS_TARGET = process.env.KAIROS_PROXY_TARGET || "https://kairos-lime-one.vercel.app";
app.use(
  createProxyMiddleware({
    pathFilter: (path) => path === "/kairos" || path.startsWith("/kairos/"),
    target: KAIROS_TARGET,
    changeOrigin: true,
    xfwd: true,
    secure: true,
  }),
);

// Request correlation ids: one id per request (an inbound X-Request-Id is
// reused only when it is unambiguous and log-safe), stamped on the response
// header. Mounted after the /kairos proxy (whose streams pass through
// untouched) and before helmet and the body parsers, so every request,
// including a body-parse failure, carries an id.
app.use(requestId());

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

// The held legacy order endpoint must terminate before any application body
// parser or rawBody verifier can retain customer-supplied bytes.
registerLegacyResearchOrderContainment(app);

// Private Early Access stays unavailable, but its exact raw payment-options
// boundary terminates before JSON/urlencoded parsing and rawBody capture. The
// contained adapter has no session, registry, provider, or payment dependency;
// a later separately reviewed unit must supply those before any 200 is possible.
app.use(createPrivateEarlyAccessPaymentOptionsContainmentMiddleware());

// THE EARLY ACCESS PAYMENT-PROOF RAW UPLOAD SEAM, and nothing else.
//
// The proof door takes a file, not JSON, so it needs the raw bytes and a larger
// ceiling than the site's 2mb JSON limit. Both are scoped as narrowly as this
// server can express:
//
//   - the predicate is `isProofUploadPath`, the door's OWN anchored regex over
//     the exact `/api/research/early-access/cart/<number>/payment-proof` shape,
//     so no other path, and no path below it, enters this parser;
//   - only POST, because the parser exists for an upload and nothing else on
//     that path is one;
//   - only the four reviewed proof content types, so any other type falls
//     through unparsed and the door answers its own 415;
//   - 8 MB, the limit the door already enforces on the decoded bytes, applied
//     here so an oversized upload is refused by the transport rather than after
//     it has been held in memory.
//
// It is a predicate middleware rather than `app.use(path, ...)` on purpose. A
// mounted path is a PREFIX match, which would have admitted every future path
// under `.../payment-proof/`, and it is not `app.post(...)` because that would
// be a second registration of a path the Early Access API already registers.
//
// The global JSON limit below is UNCHANGED at 2mb, and no `req.rawBody` is
// retained for this path: the raw parser sets `req.body` and the door hands
// those bytes straight to validation and the attachment. Nothing is written
// down.
const earlyAccessProofRawBody = express.raw({
  type: [...EARLY_ACCESS_PROOF_CONTENT_TYPES],
  limit: TRANSIENT_PROOF_MAX_BYTES,
});
app.use((req, res, next) => {
  if (req.method !== "POST" || !isProofUploadPath(req.path)) {
    next();
    return;
  }
  earlyAccessProofRawBody(req, res, next);
});

app.use(
  express.json({
    // Explicit limit. A native drawn-signature is a small trimmed-canvas PNG
    // (capped at 1MB decoded server-side, ~1.37MB base64); 2mb accommodates it
    // with headroom while still rejecting a genuinely oversized body with 413.
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// The body-error boundary for the proof path only.
//
// Registered after the body parsers so it catches a failure from either of
// them, and scoped by the same anchored predicate so it cannot change the error
// behaviour of any other route. Without it an oversized or aborted upload
// surfaces as the framework's HTML error page and an upload client receives
// HTML where it expected JSON. It never logs or echoes the error: a body parser
// error object holds a reference to the request, and the request holds the file.
app.use(createProofBodyErrorHandler(isProofUploadPath));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  // Response bodies are private by default. Only deliberately small,
  // non-sensitive diagnostics may be rendered into request logs, so current
  // and future member/admin/config routes cannot leak through a missed prefix.
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && shouldLogApiResponseBody(path)) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(formatWithRequestId(logLine, req));
    }
  });

  next();
});

// xenios research: noindex + fail-closed page gate for /research*, and the
// gated research APIs (catalog, policies, access, orders). Registered before
// the SPA catch-all so the gate always runs first.
app.use(researchPageGate);
registerResearchApi(app);
registerProductionAccountIdentityApi(app);
/**
 * The active member behind a request, or null, without writing a response.
 *
 * The canonical active-member guard is run against a silent response stub: any
 * denial (missing or invalid JWT, recovery-purpose session, inactive
 * membership, billing hold) reads as null and the caller answers its own closed
 * response. The real response is never written here.
 *
 * Shared by the pricing adapter and Private Early Access so both resolve the
 * same member from the same guard.
 */
async function resolveActiveMemberSilently(req: Request): Promise<MemberRow | null> {
  let authorized = false;
  const silenced: unknown = {
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
  await requireActiveMember(req, silenced as Response, (() => {
    authorized = true;
  }) as NextFunction);
  if (!authorized) return null;
  return ((req as any).researchMember as MemberRow | undefined) ?? null;
}

// Private Early Access API. Registered after the Research API so the shared
// Research wall and its private headers still run first, and before the SPA
// catch-all so these paths never resolve to fallback HTML.
//
// The catalog source is not passed, so registration resolves the live Product
// Control adapter when this deployment is configured for it and a refusing
// source when it is not. It never falls back to an empty catalog: "we cannot
// reach the catalog" and "there is nothing to sell" are different answers.
//
// The founder release routes mount behind the same Supabase admin guard the
// rest of research operations uses, and the actor is whatever that guard
// authenticated.
// The durable Early Access composition (QA R3). In production-like deployments
// with the feature enabled and configuration missing, these options are the
// REFUSING stores, so nothing can quietly fall back to memory; the warnings
// and the refusal reason are logged so a misconfigured deployment says why.
const earlyAccessPersistence = buildEarlyAccessPersistence();
for (const warning of earlyAccessPersistence.warnings) {
  // eslint-disable-next-line no-console
  console.warn(`[early-access] ${warning}`);
}
if (earlyAccessPersistence.reason !== null) {
  // eslint-disable-next-line no-console
  console.error(`[early-access] ${earlyAccessPersistence.reason}`);
}
// The order door's composed catalog and release ledger, observed at
// registration so the Kris Buy Now handoff prices from the door's own
// sources. Null until registration runs; Buy Now stays closed without it.
const earlyAccessDoorSources: {
  current: {
    catalog: KrisDoorCatalogSource;
    releases: KrisDoorReleaseLedger;
    identity: { resolve(input: Readonly<{ cookieHeader: unknown }>): Promise<unknown> };
    readSessionId: (cookieHeader: unknown) => string | null;
  } | null;
} = { current: null };
// Buyer-scoped pricing (XENIOS_BUYER_SCOPED_PRICING = the exact profile name;
// absent by default, so every deployment without the flag is byte-identical).
// Composed only when the durable persistence exists, because the provider
// resolves customers through the SAME M62 binding directory order recovery
// reads; without it there is no entitled buyer to price. The one provider
// instance serves BOTH the order door and the Kris Buy Now shelf below, so
// the offered price and the authorized price cannot come from two reads.
const buyerScopedPrices =
  earlyAccessPersistence.orderHistory === undefined
    ? undefined
    : buildKrisBuyerScopedPricingFromEnv({
        memberDirectory: earlyAccessPersistence.orderHistory.bindings,
      });
// Order-lifecycle mail for the legacy single-order flow, over the ONE durable
// notification outbox. The notifier is fire-and-forget by contract and the
// outbox itself refuses gracefully when unconfigured, so this wiring is safe
// everywhere and mails only where the outbox actually runs.
const legacyOrderNotifications = createOutboxLegacyOrderNotifier({
  ...(process.env.SITE_URL ? { siteUrl: process.env.SITE_URL } : {}),
});
const earlyAccessTrackingNotifications = createOutboxTrackingNotifier({
  ...(process.env.SITE_URL ? { siteUrl: process.env.SITE_URL } : {}),
});
registerPrivateEarlyAccessApi(app, {
  ...earlyAccessPersistence.options,
  resolveMember: resolveActiveMemberSilently,
  requireAdmin: requireSupabaseAdmin,
  ...(buyerScopedPrices === undefined ? {} : { buyerScopedPrices }),
  orderNotifications: legacyOrderNotifications,
  // Customer tracking mail over the same durable outbox; fire-and-forget,
  // enqueue-only — the outbox worker owns delivery and idempotency.
  trackingNotifications: earlyAccessTrackingNotifications,
  onDoorSources: (sources) => {
    earlyAccessDoorSources.current = sources;
  },
});
app.use(carePageGate);
const careAccess = buildCareProductionDependencies();
const careEligibility = buildCareEligibilityRepository();
const careIntake = buildCareIntakeRepository();
const careAppointments = buildCareAppointmentRepository();
const carePrescriptions = buildCarePrescriptionRepository();
registerCareApi(app, careAccess);
registerCareEligibilityApi(app, careAccess, careEligibility);
registerCareIntakeApi(app, careAccess, careEligibility, careIntake);
registerCareAppointmentApi(app, careAccess, careAppointments);
registerCarePrescriptionApi(app, careAccess, carePrescriptions);
registerMembershipApi(app);
registerMemberApi(app);
registerMemberAccessApi(app);
// Member platform (G2-G5 + G10): agreements, profile, assessment, Blueprint,
// plans, documents, tracker, private media, questions, Telegram, Samuel
// queues, SLA. Every external capability defaults to a truthful disabled
// state, so this is safe to register before any provider credential exists.
// This is the one-line wiring the member-platform lane deliberately left for
// the integration session (it never edits this file itself).
const website3Dependencies = buildWebsite3ProductionDependencies();
// The Early Access half of a member's order history rides the ONE existing
// member orders service (GET /api/research/orders). Wired only when the
// durable Early Access persistence exists; absent means unchanged behaviour.
const commerceDependencies = buildCommerceDependencies(
  undefined,
  undefined,
  earlyAccessPersistence.orderHistory === undefined
    ? undefined
    : { earlyAccessOrderHistory: earlyAccessPersistence.orderHistory },
);
registerMemberPlatformApi(app, {
  ...defaultMemberPlatformDeps(),
  getTrainerSafeBiomarkerSummary: async (memberId) => {
    const record = await website3Dependencies.biomarkers.getExisting(memberId);
    return record ? toTrainerSafeBiomarkerSummary(record) : null;
  },
});
registerMemberCapabilityApi(app, () => commerceDependencies.capabilities.memberVisible());
// Commerce surface (G6-G8): catalog and goal reads are live and provenance-
// gated; every stateful surface (cart writes, checkout, orders, subscriptions,
// claims, partners) fails closed with commerce_disabled until the production
// repository layer and a payment provider are wired and the commerce flag is
// turned on. Guards are the merged ones, injected: no parallel auth.
// The merged guards use the Express NextFunction signature and may return a
// Response; the commerce lane's injected-guard type is the simpler
// (req, res, next: () => void) => void | Promise<void>. This adapter bridges
// the two without changing behavior: same guard, awaited, return discarded.
const adaptGuard =
  (guard: (req: Request, res: Response, next: NextFunction) => unknown) =>
  async (req: Request, res: Response, next: () => void): Promise<void> => {
    await guard(req, res, next as unknown as NextFunction);
  };
registerCommerceApi(app, commerceDependencies, {
  requireActiveMember: adaptGuard(requireActiveMember),
  requireMember: adaptGuard(requireMember),
  requireAdmin: adaptGuard(requireSupabaseAdmin),
});

// The affiliate attribution capture doors (Lane B integration, 2026-08-19).
// Double-gated by env; with the flags off, no route exists at all. The secret
// is the fail-closed core: without RESEARCH_PARTNER_LINK_SECRET the doors
// still answer (302 / 204) but capture nothing.
const partnerLinkSecret = process.env.RESEARCH_PARTNER_LINK_SECRET ?? null;
if (affiliateCodesEnabled(process.env)) {
  // verifyCode and deriveSubjectKey are pure over the secret; this service
  // instance never touches its repository, so the in-memory one is only a
  // constructor requirement. Durable state lives in the two stores below.
  const referralAttribution = createAttributionService({
    repository: createInMemoryAttributionRepository(),
    linkSecret: partnerLinkSecret,
    linkBaseUrl:
      process.env.RESEARCH_PARTNER_LINK_BASE_URL ?? "https://xeniostechnology.com",
  });
  const referralRoutes = createReferralCaptureRouteTable({
    linkSecret: partnerLinkSecret,
    attribution: referralAttribution,
    links: resolvePartnerLinkStore(),
    touches: resolveAttributionTouchStore(),
    // Cookie lifetime and attribution window only. Money stays behind
    // AFFILIATE_PROGRAM_ENABLED inside the accrual bridge; an inactive
    // program still captures honest touches under the seed's window.
    program: resolveAffiliateProgram(process.env) ?? DEFAULT_LAUNCH_PROGRAM,
  });
  // Keep these two registrations explicit and literal: the release scanner
  // must see every reachable door, while paths and handler bodies still come
  // from the one authoritative descriptor table.
  const referralDoor = (path: string): RequestHandler => {
    const descriptor = referralRoutes.find((candidate) => candidate.path === path);
    if (!descriptor) throw new Error(`referral descriptor missing: ${path}`);
    return referralCaptureExpressHandler(descriptor);
  };
  // The short link mounts under /api because the route census accepts only
  // explicit /api/ paths; the descriptor's handler reads :code from params,
  // so the registration path may differ from the descriptor's canonical one.
  // The pretty public /r/CODE form needs an App.tsx SPA redirect page (a
  // pinned-seam change of its own) and is recorded as a follow-up; the
  // canonical marketing entry today is /research?ref=CODE, captured by the
  // client landing hook calling the capture door below.
  app.get("/api/r/:code", referralDoor("/r/:code"));
  // Deliberately OUTSIDE /api/research: the research wall (mounted at that
  // prefix in server/research/index.ts) refuses anonymous callers, and a
  // referral click is exactly an anonymous caller. Registered at line ~327's
  // wall prefix boundary; admission here is harmless — the door verifies the
  // signed code itself and an invalid code captures nothing.
  app.get("/api/referral/capture", referralDoor("/api/research/referral/capture"));
  log("affiliate referral capture doors mounted", "affiliates");
}

// The Gen 2 partner portal read surface: 16 authenticated, member-guarded
// read paths. Mount-gated twice (system AND portal flags); the guard is the
// SAME merged member guard the commerce lane injects — no parallel auth.
if (affiliatePortalEnabled(process.env)) {
  registerPartnerPortalApi(
    app,
    { port: resolvePartnerPortalPort(), submissionsEnabled: partnerSubmissionsEnabled() },
    { requireMember: adaptGuard(requireMember) },
  );
  log("partner portal mounted", "affiliates");
}
registerMemberCatalogApi(
  app,
  buildMemberCatalogProductionService(),
  requireActiveMember,
);

// Launch A is a private, read-only partner catalog. The route table contributes
// only GET and OPTIONS descriptors; canonical member authentication resolves
// the viewer server-side, and the profile entitlement then narrows that member
// to KRIS_VOLUME_PARTNER. The indexed artifact source is shared while the
// service is request-scoped. Missing data fails closed as 503, and this surface
// has no purchase route or commerce adapter.
// Buy Now opens only when the door's own sources and the member-to-customer
// directory both exist; anything less keeps the catalog read-only, which is
// the truthful state for a deployment that could not place the order either.
const krisDoorSources = earlyAccessDoorSources.current;
const krisCatalogDependencies = buildKrisCatalogProductionDependencies(
  resolveActiveMemberSilently,
  krisDoorSources !== null && earlyAccessPersistence.orderHistory !== undefined
    ? {
        legacyOrders: {
          catalog: krisDoorSources.catalog,
          releases: krisDoorSources.releases,
          customers: earlyAccessPersistence.orderHistory.bindings,
          ...(buyerScopedPrices === undefined ? {} : { buyerScopedPrices }),
        },
      }
    : {},
);
const [
  krisCatalogListRoute,
  krisCatalogDetailRoute,
  krisCatalogListOptionsRoute,
  krisCatalogDetailOptionsRoute,
] = krisCatalogRouteTable(krisCatalogDependencies);
// Keep these four registrations explicit: the release scanner must see every
// reachable door, while their paths and handler order still come from the one
// authoritative descriptor table.
app.get("/api/research/kris-launch-a/v1/catalog", ...krisCatalogListRoute.handlers);
app.get("/api/research/kris-launch-a/v1/products/:slug", ...krisCatalogDetailRoute.handlers);
app.options("/api/research/kris-launch-a/v1/catalog", ...krisCatalogListOptionsRoute.handlers);
app.options("/api/research/kris-launch-a/v1/products/:slug", ...krisCatalogDetailOptionsRoute.handlers);
app.use(
  KRIS_CATALOG_ERROR_BASE_PATH,
  krisCatalogErrorHandler(krisCatalogDependencies),
);

// Pricing reads (the frozen pricing core behind its smallest adapter). Wiring
// per the routes.ts header: the resolver reads the canonical Product Control
// catalog; the audience authorizer is built on the same requireActiveMember
// guard as the member catalog, with the memberAudience sourceVersion
// fingerprint from member-catalog-service.ts; enablement rides the shared
// research commerce env flag (disabled answers a uniform 503
// pricing_disabled). The /api/research gateway wall bypasses GET/HEAD
// /pricing/* reads to this adapter's own guard chain (the
// downstreamMemberGuardedRead predicate in server/research/index.ts).
const pricingResolver = createAuthoritativePriceResolver(
  new CatalogPricingProductSource(createProductionProductControlReader()),
);
const authorizePricingAudience = async (
  req: Request,
): Promise<PricingAudienceGrant | null> => {
  // The shared silent guard run, so pricing and Early Access resolve the same
  // member from the same guard and cannot disagree about who is asking.
  const member = await resolveActiveMemberSilently(req);
  if (!member) return null;
  // The exported derivation from member-catalog-service.ts, not a copy of it.
  // A second fingerprint written here would drift the first time either side
  // gained a field, and the catalog and the price it quotes would then claim
  // different authorizations for the same member.
  return {
    audience: "member",
    sourceVersion: memberAudienceSourceVersion(member),
  };
};
registerPricingApi(app, {
  resolver: pricingResolver,
  authorizeAudience: authorizePricingAudience,
  enabled: pricingEnabledFromCommerceEnv,
});

// The general member catalog (master offerings v2): the 420-row canonical
// selection, display-only. Serving is dark until RESEARCH_MASTER_OFFERINGS_ENABLED
// is exactly "true", and scope then fails closed to founder/admin until the
// all-members decision. Prices are now REAL for bound variants: the reviewed
// committed binding artifact joins each offering variant to its Product
// Control identity, the request identity below carries the server-authorized
// member audience, and the price a viewer sees is one approved in-window
// Product Control row resolved by the same authoritative resolver the member
// catalog uses. The three unbound rows (the shipping service row and the two
// price-pending rows) truthfully render "Price on request". Purchase stays
// OFF on this surface: the selection authority answers a truthful not-ok
// (the general units carry no commerce approval), so a price view never
// becomes a cart selection here.
const authorizeMasterOfferingViewer = async (
  req: Request,
): Promise<MasterOfferingCatalogViewer | null> => {
  const member = await resolveActiveMemberSilently(req);
  if (!member) return null;
  // The viewer carries the pricing grant derived from the SAME member row the
  // guard authenticated, through the one shared derivation the assisted-order
  // bridge also uses, so identityFor below never re-derives authorization
  // from anything a browser could influence.
  const viewer: MasterOfferingViewerWithGrant = masterOfferingViewerForMember(
    member,
    process.env.ADMIN_EMAIL || "",
  );
  if (!mayViewMasterOfferings({ audience: viewer.audience, email: viewer.email })) {
    return null;
  }
  return viewer;
};
// Product Control facts for one exact selection request. The reader owns only
// facts Product Control can state (product, variants, prices, media, required
// inputs, readiness, inventory); the viewer's audience eligibility arrives
// through the composition's session context and is validated by the
// evaluation like every other fact. One instant (request.evaluatedAt) keys a
// small memo so a page of cards costs one catalog read, not one per variant.
const masterOfferingSelectionInputs = buildRequiredInputProductionRepository();
const masterOfferingSelectionInventory = buildProductionVariantInventoryFactsReader();
const masterOfferingSelectionReads = new Map<
  string,
  Promise<{
    products: AdminProductDetail[];
    requiredInputs: RequiredInput[];
    readiness: DomainReadiness[];
  }>
>();
function masterOfferingSelectionFactsAt(evaluatedAt: string) {
  const cached = masterOfferingSelectionReads.get(evaluatedAt);
  if (cached !== undefined) return cached;
  const read = (async () => {
    const [products, requiredInputs, readiness] = await Promise.all([
      createProductionProductControlReader().readCatalog(),
      masterOfferingSelectionInputs.list(),
      masterOfferingSelectionInputs.readinessAll(),
    ]);
    return {
      products,
      requiredInputs: requiredInputs as RequiredInput[],
      readiness: readiness as DomainReadiness[],
    };
  })();
  masterOfferingSelectionReads.set(evaluatedAt, read);
  // The instant is one request's clock, so entries die quickly; the bound
  // keeps a slow trickle of instants from growing the map forever.
  if (masterOfferingSelectionReads.size > 64) {
    const oldest = masterOfferingSelectionReads.keys().next().value;
    if (oldest !== undefined) masterOfferingSelectionReads.delete(oldest);
  }
  return read;
}
const masterOfferingSelectionFacts: CartSelectionFactsReader = {
  async readSelectionSource(request) {
    const { products, requiredInputs, readiness } =
      await masterOfferingSelectionFactsAt(request.evaluatedAt);
    const product = products.find((candidate) => candidate.id === request.productId);
    if (product === undefined) return null;
    const variant = product.variants.find(
      (candidate) => candidate.id === request.variantId,
    );
    if (variant === undefined) return null;
    const inventory = await masterOfferingSelectionInventory.readVariantInventoryFacts({
      productId: product.id,
      variant,
      evaluatedAt: request.evaluatedAt,
    });
    return {
      products: [product],
      variants: product.variants,
      prices: product.prices,
      media: product.media,
      requiredInputs,
      readiness,
      // Deliberately empty: the viewer's authorization is a session fact the
      // composition supplies, and the authority seats it only into this empty
      // seat. The evaluation then validates it (identity, instant, non-blank
      // provenance) exactly as it validates every Product Control fact.
      audienceEligibility: null,
      inventoryEligibility: inventory.inventory,
    };
  },
};
const masterOfferingCatalogDependencies = createMasterOfferingCatalogDependencies(
  {
    bindings: masterOfferingProductionBindings,
    // Purchase stays OFF until RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE is
    // exactly "true": the gate answers the identical hard-wired refusal the
    // catalog has always answered, and the real authority is the existing
    // selectCartProduct gauntlet over live Product Control facts. Turning the
    // flag on in production requires Samuel's current explicit approval.
    selections: masterOfferingSelectionAuthorityFromEnv(
      process.env,
      createProductControlSelectionAuthority(masterOfferingSelectionFacts),
    ),
    pricingSource: new CatalogPricingProductSource(
      createProductionProductControlReader(),
    ),
    // Null-safe: a viewer without a grant (an Early Access session, an
    // anonymous probe through the assisted-order seam) is a null identity and
    // every price truthfully fails closed to "Price on request".
    identityFor: (viewer) => pricingIdentityFromViewer(viewer),
  },
  authorizeMasterOfferingViewer,
);
const [
  masterOfferingListRoute,
  masterOfferingDetailRoute,
  masterOfferingPriceListRoute,
  masterOfferingListOptionsRoute,
  masterOfferingDetailOptionsRoute,
  masterOfferingPriceListOptionsRoute,
] = masterOfferingCatalogRouteTable(masterOfferingCatalogDependencies);
// Keep these six registrations explicit: the release scanner must see every
// reachable door, while their paths and handler order still come from the one
// authoritative descriptor table.
app.get("/api/research/catalog-display/v2/catalog", ...masterOfferingListRoute.handlers);
app.get("/api/research/catalog-display/v2/products/:family/:slug", ...masterOfferingDetailRoute.handlers);
app.get("/api/research/catalog-display/v2/price-list", ...masterOfferingPriceListRoute.handlers);
app.options("/api/research/catalog-display/v2/catalog", ...masterOfferingListOptionsRoute.handlers);
app.options("/api/research/catalog-display/v2/products/:family/:slug", ...masterOfferingDetailOptionsRoute.handlers);
app.options("/api/research/catalog-display/v2/price-list", ...masterOfferingPriceListOptionsRoute.handlers);
app.use(
  MASTER_OFFERING_CATALOG_ERROR_BASE_PATH,
  masterOfferingCatalogErrorHandler(masterOfferingCatalogDependencies),
);

// THE ASSISTED ORDER BRIDGE (founder directive 2026-08-15, dark by default).
//
// Composed over canonical authorities only: the same master-offerings service
// and reviewed binding artifact the v2 doors serve, the Early Access required
// agreements as the ONE legal authority, the certified M71 RPC persistence,
// the private document bucket, and the one durable outbox. Every dependency is
// fail-closed: without RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED=true, or with a
// missing dependency, every door below answers the composition's named refusal
// rather than serving a half-built feature.
const assistedOrderBindingIndex = loadBindingIndex().index;
// `loadBindingIndex` keys its map `offeringId|offeringVariantId`, but this seam
// is handed an offering VARIANT id on its own, so the composite-keyed map could
// never answer it and every one of the 417 lookups missed. The whole consequence
// chain was customer-visible: each catalog line projected as `unbound:…`, an
// approved price was suppressed to "Price pending", the truthful action degraded
// from direct_order_request to request_pricing, and submitting returned HTTP 500
// out of resolveLine. A forward map keyed by the variant id alone is built in
// the same pass below; the loader already refuses a duplicate offering variant
// id, so the map is total and unambiguous.
const assistedOrderBindingsByVariant = bindingsByOfferingVariantId(
  assistedOrderBindingIndex,
);
const assistedOrderReverseBindings = new Map<string, string>();
for (const binding of Array.from(assistedOrderBindingIndex.values())) {
  assistedOrderReverseBindings.set(
    `${binding.productId}\u0000${binding.variantId}`,
    binding.offeringVariantId,
  );
}
const assistedOrderComposition = buildAssistedOrderProduction({
  env: process.env,
  requiredAgreements: earlyAccessPersistence.options.requiredAgreements,
  masterOfferingServiceFor: (viewer) => {
    try {
      // The pricing viewer rides on the assisted-order viewer, set only by the
      // member resolver below from the authenticated member row. A viewer
      // without one (Early Access session, anonymous probe) still gets the
      // catalog; identityFor resolves null and prices stay "Price on request".
      const service = masterOfferingCatalogDependencies.serviceForViewer(
        viewer.pricingViewer as MasterOfferingViewerWithGrant,
      );
      // The composition's factory is synchronous today. A promise here would
      // mean a future async factory, which this seam does not support, so
      // refuse rather than hand the bridge a pending object.
      return service instanceof Promise ? null : service;
    } catch {
      return null;
    }
  },
  bindingFor: (offeringVariantId) => {
    const binding = assistedOrderBindingsByVariant.get(offeringVariantId);
    return binding
      ? { productId: binding.productId, variantId: binding.variantId }
      : null;
  },
  offeringVariantFor: (identity) =>
    assistedOrderReverseBindings.get(
      `${identity.productId}\u0000${identity.variantId}`,
    ) ?? null,
  catalogVersion: MASTER_OFFERING_COMMITTED_BINDINGS_PATH,
  supabaseRpc: supabaseConfigured()
    ? (getSupabaseAdmin() as unknown as AssistedOrderRpcClient)
    : null,
  supabaseStorage: supabaseConfigured()
    ? (getSupabaseAdmin().storage as unknown as AssistedOrderStorageClient)
    : null,
  auditWrite: async (event) => {
    log(`assisted-order audit ${JSON.stringify(event)}`, "assisted-order");
  },
  log,
});
if (assistedOrderComposition.service) {
  const assistedOrderViewers = createAssistedOrderViewerResolvers({
    resolveMember: async (req) => {
      const member = await resolveActiveMemberSilently(req);
      if (!member) return null;
      return {
        id: member.id,
        email: member.email ?? null,
        // The SAME derivation the v2 catalog doors price through, from the
        // SAME member row this resolver authenticated. Never browser input.
        pricingViewer: masterOfferingViewerForMember(
          member,
          process.env.ADMIN_EMAIL || "",
        ),
      };
    },
    earlyAccess: () => earlyAccessDoorSources.current,
    adminEmail: () => (process.env.ADMIN_EMAIL || "").toLowerCase().trim(),
  });
  const assistedOrderRoutes = createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(
    assistedOrderComposition.service,
    assistedOrderViewers,
    // Server-derived affiliate attribution: the verified xr_aff cookie is the
    // ONLY source of affiliateAttributionRef. No secret configured -> always
    // null. The body never participates; the service ignores it outright.
    {
      resolve: (cookieHeader) =>
        verifiedAttributionRefFromCookieHeader(partnerLinkSecret, cookieHeader, new Date()),
    },
  );
  const assistedOrderDoor = (
    method: "GET" | "POST" | "PATCH",
    path: string,
  ): RequestHandler => {
    const descriptor = assistedOrderRoutes.find(
      (candidate) => candidate.method === method && candidate.path === path,
    );
    if (!descriptor) {
      throw new Error(`assisted order descriptor missing: ${method} ${path}`);
    }
    return assistedOrderExpressHandler(descriptor);
  };
  // Keep these nine registrations explicit and literal: the release scanner
  // must see every reachable door, while their paths and handler bodies still
  // come from the one authoritative descriptor table. Literal paths precede
  // the parameterized ones so /config and /catalog can never be captured by
  // :publicReference. OPTIONS descriptors are deliberately NOT registered:
  // the wall admits GET/HEAD and POST only, so an OPTIONS door would be a
  // dead registration on the customer side and an unguarded one on the admin
  // side.
  app.get("/api/research/early-access/assisted-orders/config", assistedOrderDoor("GET", "/api/research/early-access/assisted-orders/config"));
  app.get("/api/research/early-access/assisted-orders/catalog", assistedOrderDoor("GET", "/api/research/early-access/assisted-orders/catalog"));
  app.post("/api/research/early-access/assisted-orders", assistedOrderDoor("POST", "/api/research/early-access/assisted-orders"));
  app.get("/api/research/early-access/assisted-orders/:publicReference", assistedOrderDoor("GET", "/api/research/early-access/assisted-orders/:publicReference"));
  app.post("/api/research/early-access/assisted-orders/:requestId/documents/upload-url", assistedOrderDoor("POST", "/api/research/early-access/assisted-orders/:requestId/documents/upload-url"));
  app.post("/api/research/early-access/assisted-orders/:requestId/documents/:documentId/complete", assistedOrderDoor("POST", "/api/research/early-access/assisted-orders/:requestId/documents/:documentId/complete"));
  // The admin doors answer to requireSupabaseAdmin FIRST, outside the research
  // wall entirely. The viewer resolver grants manage capabilities only because
  // this guard has already verified the bearer against the configured admin.
  app.get("/api/admin/research/assisted-orders", requireSupabaseAdmin, assistedOrderDoor("GET", "/api/admin/research/assisted-orders"));
  app.get("/api/admin/research/assisted-orders/:requestId", requireSupabaseAdmin, assistedOrderDoor("GET", "/api/admin/research/assisted-orders/:requestId"));
  app.patch("/api/admin/research/assisted-orders/:requestId/status", requireSupabaseAdmin, assistedOrderDoor("PATCH", "/api/admin/research/assisted-orders/:requestId/status"));
  app.post("/api/admin/research/assisted-orders/:requestId/documents/:documentId/download-url", requireSupabaseAdmin, assistedOrderDoor("POST", "/api/admin/research/assisted-orders/:requestId/documents/:documentId/download-url"));
  log("assisted order bridge mounted", "assisted-order");
} else {
  log(
    `assisted order bridge not mounted: ${assistedOrderComposition.refusalReason}`,
    "assisted-order",
  );
}

// Website 3 products and diagnostics. Uses the same active-member/admin guards,
// canonical catalog readiness, canonical lot/quality tables, private Supabase
// Storage, and durable production repositories. External/data-gated surfaces
// remain server-authoritatively unavailable until their real gates pass.
registerProductsDiagnosticsApi(
  app,
  website3Dependencies,
  {
    requireActiveMember,
    requireAdmin: requireSupabaseAdmin,
  },
);

// Product Control Center. The shared registration is always present before the
// API/SPA fallbacks. Missing persistence fails closed with stable JSON; when
// configured, every mutation uses the reviewed SECURITY DEFINER command RPCs,
// durable idempotency, and canonical required-input readiness.
const productAdminService: ProductAdminService =
  buildProductAdminProductionService();
registerProductAdminApi(app, {
  service: productAdminService,
  requireAdmin: requireSupabaseAdmin,
});

// Canonical private pre-launch access. This is server-authoritative and has no
// client-only bypass: every internal request verifies Supabase Auth, resolves a
// persisted active role, validates an optional seed namespace, and commits an
// access-audit record before the protected handler runs. No namespace or role
// is seeded by application startup.
const prelaunchDependencies = buildPrelaunchProductionDependencies();
registerPrelaunchApi(app, prelaunchDependencies, requireSupabaseAdmin);
registerRequiredInputApi(
  app,
  buildRequiredInputProductionRepository(),
  {
    read: buildPrelaunchGuard(
      prelaunchDependencies,
      [
        "super_admin",
        "internal_team",
        "product_admin",
        "operations_admin",
        "clinical_admin",
        "approved_internal_reviewer",
      ],
      { allowSeedContext: false },
    ),
    edit: buildPrelaunchGuard(
      prelaunchDependencies,
      [
        "super_admin",
        "internal_team",
        "product_admin",
        "operations_admin",
        "clinical_admin",
      ],
      { allowSeedContext: false },
    ),
    review: buildPrelaunchGuard(
      prelaunchDependencies,
      ["super_admin", "approved_internal_reviewer"],
      { allowSeedContext: false },
    ),
    release: buildPrelaunchGuard(
      prelaunchDependencies,
      ["super_admin", "internal_team"],
      { allowSeedContext: false },
    ),
  },
);
registerAssessmentRequiredInputPlanApi(app, prelaunchDependencies);

// Research Commerce Wave 2 inventory and exact-lot COA administration.
// Registration is unconditional so missing persistence returns stable JSON
// instead of a 404. Every protected request still resolves a durable prelaunch
// role before repository access, and the Product Control reader is an atomic
// service-only SQL projection.
registerInventoryLotAdminApi(
  app,
  buildInventoryLotAdminIntegrationDependencies(),
  {
    read: buildPrelaunchGuard(
      prelaunchDependencies,
      [
        "super_admin",
        "operations_admin",
        "product_admin",
        "approved_internal_reviewer",
      ],
      { allowSeedContext: false },
    ),
    mutateInventory: buildPrelaunchGuard(
      prelaunchDependencies,
      ["super_admin", "operations_admin"],
      { allowSeedContext: false },
    ),
    reviewQuality: buildPrelaunchGuard(
      prelaunchDependencies,
      ["super_admin", "product_admin", "approved_internal_reviewer"],
      { allowSeedContext: false },
    ),
  },
);

// Founding membership activation (three-state: capability_disabled by default,
// not_provisioned without storage, live only when flag + storage exist).
registerFoundingActivationApi(app, buildFoundingActivationDependencies(), {
  requireMember: adaptGuard(requireMember),
  requireSupabaseAdmin: adaptGuard(requireSupabaseAdmin),
});

// Startup config diagnostic (booleans only, never values): makes a fail-closed
// 503 on /research immediately explainable from the deploy logs.
log(
  `research config: password=${process.env.RESEARCH_ACCESS_PASSWORD ? "set" : "MISSING"} ` +
    `sessionSecret=${process.env.RESEARCH_SESSION_SECRET ? "set" : "MISSING"} ` +
    `publicMode=${process.env.RESEARCH_PUBLIC === "true"} nodeEnv=${process.env.NODE_ENV || "unset"}`,
  "research",
);

// Email provider diagnostics (booleans only) + the durable notification worker.
registerOutboxAdmin(app);
registerReferralFraudAdmin(app);

// Referral reward promotion: held rewards become available once their hold
// window passes. Without this tick nothing ever called promoteHeldRewards, so
// a held reward could never become credit (found by the account-email-systems
// audit). Flag-gated inside: a no-op while RESEARCH_REFERRALS_ENABLED=false.
const rewardPromotionTimer = setInterval(() => {
  promoteHeldRewards(new Date())
    .then((promoted) => {
      if (promoted > 0) log(`promoted ${promoted} referral reward(s) past their hold window`, "referrals");
    })
    .catch((err) => console.error("[referrals] reward promotion tick failed:", err));
}, 5 * 60 * 1000);
rewardPromotionTimer.unref?.();

// Approval-expiry sweep: lapsed approvals (approved_pending_payment or
// stalled payment_pending past approval_expires_at) flip to "expired" with an
// audit event. Hourly; status-guarded so a concurrent claim/activation wins.
const approvalExpiryTimer = setInterval(() => {
  sweepExpiredApprovals(new Date())
    .then((count) => {
      if (count > 0) log(`expired ${count} lapsed approval(s)`, "research");
    })
    .catch((err) => console.error("[research expiry] sweep tick failed:", err));
}, 60 * 60 * 1000);
approvalExpiryTimer.unref?.();

// Founding-membership scheduler: the renewal overdue/grace/suspension sweep,
// due renewal notices, suspension/reinstatement emails, and the identity
// raw-source retention deletions. Hourly; the flag and storage are read at
// tick time inside the runner, so this is a no-op until
// RESEARCH_FOUNDING_ACTIVATION_ENABLED is true, and every enqueue rides the
// durable outbox with deterministic event keys (a repeated tick sends nothing
// twice).
const foundingSchedulerTimer = setInterval(() => {
  runProductionFoundingSchedulerTick(new Date())
    .then((summary) => {
      if (
        summary.ran &&
        (summary.scheduleAdvanced > 0 ||
          summary.renewalNoticesEnqueued > 0 ||
          summary.identityRawDeletions > 0)
      ) {
        log(
          `founding scheduler: advanced ${summary.scheduleAdvanced}, notices ${summary.renewalNoticesEnqueued}, identity deletions ${summary.identityRawDeletions}`,
          "research",
        );
      }
    })
    .catch((err) => console.error("[founding scheduler] tick failed:", err));
}, 60 * 60 * 1000);
foundingSchedulerTimer.unref?.();
void logEmailStartupDiagnostics(log).catch(() => {});
startOutboxWorker(log);

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // API 404 guard: any /api request that reached here matched no registered
  // route, so it must return a JSON 404 and NOT fall through to the SPA
  // catch-all below (which would answer an unknown API path with index.html at
  // status 200, masking a wrong path as success). Placed after every real API
  // route (module-load registrations + registerRoutes) and before serveStatic /
  // vite, so it never shadows a real endpoint and covers both prod and dev.
  app.use("/api/{*rest}", (_req: Request, res: Response) => {
    res.status(404).json({ message: "Not Found" });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      // SO_REUSEPORT is not supported on Windows (listen throws ENOTSUP), so it
      // is enabled only elsewhere. Production (Linux) behavior is unchanged.
      reusePort: process.platform !== "win32",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
