import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { createProxyMiddleware } from "http-proxy-middleware";
import { registerRoutes } from "./routes";
import { researchPageGate, registerResearchApi } from "./research";
import { registerMembershipApi } from "./research/membership";
import { registerMemberApi } from "./research/members";
import { registerMemberAccessApi } from "./research/guards";
import { registerOutboxAdmin, startOutboxWorker } from "./research/outbox";
import { registerReferralFraudAdmin } from "./research/fraud-admin";
import { registerMemberPlatformApi } from "./research/member-platform";
import { registerCommerceApi } from "./research/commerce/routes";
import { buildCommerceDependencies } from "./research/commerce/production-deps";
import { registerFoundingActivationApi } from "./research/membership-activation/routes";
import { buildFoundingActivationDependencies } from "./research/membership-activation/production-deps";
import { requireActiveMember, requireMember } from "./research/member-auth";
import { requireSupabaseAdmin } from "./routes";
import { promoteHeldRewards } from "./research/referrals";
import { sweepExpiredApprovals } from "./research/expiry";
import { runProductionFoundingSchedulerTick } from "./research/membership-activation/scheduler";
import { logEmailStartupDiagnostics } from "./services/email-config";
import { serveStatic } from "./static";
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

  // Routes whose response bodies may contain PII (emails, messages, tokens)
  // — log only status + duration, never the body. All research endpoints are
  // included so status tokens and applicant data never reach the logs.
  const PII_PATHS = ["/api/waitlist", "/api/research", "/api/admin/research"];
  const isPiiPath = (p: string) =>
    PII_PATHS.some((prefix) => p === prefix || p.startsWith(prefix + "/"));

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && !isPiiPath(path)) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

// xenios research: noindex + fail-closed page gate for /research*, and the
// gated research APIs (catalog, policies, access, orders). Registered before
// the SPA catch-all so the gate always runs first.
app.use(researchPageGate);
registerResearchApi(app);
registerMembershipApi(app);
registerMemberApi(app);
registerMemberAccessApi(app);
// Member platform (G2-G5 + G10): agreements, profile, assessment, Blueprint,
// plans, documents, tracker, private media, questions, Telegram, Samuel
// queues, SLA. Every external capability defaults to a truthful disabled
// state, so this is safe to register before any provider credential exists.
// This is the one-line wiring the member-platform lane deliberately left for
// the integration session (it never edits this file itself).
registerMemberPlatformApi(app);
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
registerCommerceApi(app, buildCommerceDependencies(), {
  requireActiveMember: adaptGuard(requireActiveMember),
  requireMember: adaptGuard(requireMember),
  requireAdmin: adaptGuard(requireSupabaseAdmin),
});

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
