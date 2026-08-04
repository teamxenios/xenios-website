import express, { type Request, Response, NextFunction } from "express";
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
import {
  buildMemberCatalogProductionService,
  memberAudienceSourceVersion,
} from "./research/catalog/member-catalog-service";
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
import { requireActiveMember, requireMember, type MemberRow } from "./research/member-auth";
import { requireSupabaseAdmin } from "./routes";
import { promoteHeldRewards } from "./research/referrals";
import { sweepExpiredApprovals } from "./research/expiry";
import { runProductionFoundingSchedulerTick } from "./research/membership-activation/scheduler";
import { logEmailStartupDiagnostics } from "./services/email-config";
import { serveStatic } from "./static";
import { formatWithRequestId, requestId, shouldLogApiResponseBody } from "./request-logging";
import { createServer } from "http";

const app = express();
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
registerPrivateEarlyAccessApi(app, {
  resolveMember: resolveActiveMemberSilently,
  requireAdmin: requireSupabaseAdmin,
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
const commerceDependencies = buildCommerceDependencies();
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
registerMemberCatalogApi(
  app,
  buildMemberCatalogProductionService(),
  requireActiveMember,
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
