import type { Express, Request, RequestHandler } from "express";
import type { CareAccessDependencies } from "../../../care/access";
import { requestIp } from "../../rate-limit";
import { reviewedHeldSpecifications } from "../../master-offerings/reviewed-holds";
import type { AssistedOrderProductionWiring } from "../production-deps";
import type { AssistedOrderViewer } from "../ports";
import { sha256AssistedOrderHasher, systemAssistedOrderClock, systemAssistedOrderIds } from "../defaults";
import { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair } from "../../../../shared/research/assisted-order/form";
import { createRequestIntentCatalog } from "./catalog";
import { createRequestIntentRouter } from "./express";
import { REQUEST_INTENT_STAFF_READ_ENABLED_ENV } from "./staff-read-authority";
import { RequestIntentError, RequestIntentService } from "./service";
import { requestIntentRepository, requestIntentStaffReader, type RequestIntentRpcClient } from "./rpc-repository";

export const REQUEST_INTENT_ENABLED_ENV = "RESEARCH_REQUEST_INTENT_ENABLED";

/** The same exact-origin JSON/Fetch-Metadata policy used by Referral V1.
 * The referral visitor cookie is NOT reused as customer or CSRF authority.
 * SITE_URL is trusted configuration; Host/forwarded headers never establish it.
 */
export function requestIntentOrigin(raw: string | undefined): string | null {
  try {
    const url = new URL(raw ?? "");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ? url.origin : null;
  } catch { return null; }
}
export function requestIntentMutationGuard(origin: string | null): RequestHandler {
  return (req, res, next) => {
    if (!origin || req.get("origin") !== origin || !req.is("application/json")
      || (req.get("sec-fetch-site") && req.get("sec-fetch-site") !== "same-origin")) {
      res.status(403).json({ error: "request_origin_not_authorized" }); return;
    }
    next();
  };
}
/** Reuse the canonical atomic limiter RPC and trusted proxy-derived requestIp.
 * No process-memory fallback, raw address/key logging, or clinical payload.
 */
export function requestIntentRateLimit(rpc: RequestIntentRpcClient | null, action: "read" | "write"): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      const ip = requestIp(req);
      if (!rpc || ip === "unknown") { res.status(503).json({ error: "request_intent_unavailable" }); return; }
      try {
        const result = await rpc.rpc("research_rate_limit_hit", {
          p_key: "request-intent:" + action + ":" + sha256AssistedOrderHasher.hash(ip),
          p_window_seconds: action === "read" ? 60 : 600,
          p_max_hits: action === "read" ? 120 : 20,
        });
        if (result.error || typeof result.data !== "boolean") {
          res.status(503).json({ error: "request_intent_unavailable" }); return;
        }
        if (!result.data) { res.status(429).json({ error: "rate_limited" }); return; }
        next();
      } catch { res.status(503).json({ error: "request_intent_unavailable" }); }
    })();
  };
}
export function registerRequestIntentApi(
  app: Express, wiring: AssistedOrderProductionWiring,
  viewers: Readonly<{ customer(req: Request): Promise<AssistedOrderViewer> }>,
  care: CareAccessDependencies,
): void {
  const origin = requestIntentOrigin(wiring.env.SITE_URL);
  const legalPairs = wiring.requiredAgreements?.map(({ kind, version }) => ({ kind, version })) ?? [];
  const rpc = wiring.supabaseRpc;
  const enabled = () => wiring.env[REQUEST_INTENT_ENABLED_ENV] === "true" && origin !== null
    && rpc !== null && wiring.agreementGate !== null && legalPairs.length > 0
    && legalPairs.every(({ kind, version }) => !!kind && !!version && !kind.startsWith("assisted_order_form_v1:"));
  const secure: RequestHandler = (_req, res, next) => {
    res.set({ "Cache-Control": "private, no-store", Pragma: "no-cache",
      "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" });
    next();
  };
  const readRateLimit = requestIntentRateLimit(rpc, "read");
  const unavailable: RequestHandler = (_req, res) => {
    res.status(503).json({ error: "request_intent_unavailable" });
  };
  // Public config publishes canonical versions and D005 request facts only.
  // It asserts configuration, not schema qualification or clinical readiness.
  app.get("/api/research/early-access/request-intents/config", secure, (req, res, next) => {
    // Distinguish default/explicit off from broken or unknown readiness.
    // Only this exact response admits the existing assisted-order fallback.
    const flag = wiring.env[REQUEST_INTENT_ENABLED_ENV];
    if (flag === undefined || flag === "false") {
      res.status(503).json({ enabled: false, error: "request_intent_disabled" }); return;
    }
    if (!enabled()) { res.status(503).json({ enabled: false, error: "request_intent_unavailable" }); return; }
    next();
  }, readRateLimit, (_req, res) => {
    res.json({ enabled: true, requiredAgreements: legalPairs,
      formAcknowledgments: ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((ack) => ({
        id: ack.id, scope: ack.scope, ...assistedOrderFormPair(ack), copy: ack.copy,
      })) });
  });
  if (!rpc) {
    app.use("/api/research/early-access/request-intents", secure, unavailable);
    return;
  }
  const service = new RequestIntentService({
    catalog: createRequestIntentCatalog({
      serviceFor: wiring.masterOfferingServiceFor, bindingFor: wiring.bindingFor,
      offeringVariantFor: wiring.offeringVariantFor, catalogVersion: wiring.catalogVersion,
      reviewedFormulationHolds: reviewedHeldSpecifications(),
    }),
    repository: requestIntentRepository(rpc),
    legal: { requiredAgreements: async () => legalPairs },
    // Identical standing contract to the existing bridge. No browser checkbox
    // substitutes for the durable session/customer/member binding.
    standing: { accepted: async (viewer) => {
      const customerRef = viewer.earlyAccessCustomerRef?.trim() ?? "";
      const live = (viewer.actorType === "member" || viewer.actorType === "early_access_session")
        && (viewer.earlyAccessSessionHash?.length ?? 0) > 0;
      return live && customerRef.length > 0 && wiring.agreementGate !== null
        ? wiring.agreementGate.accepted(customerRef) : false;
    } },
    hasher: sha256AssistedOrderHasher, ids: systemAssistedOrderIds, clock: systemAssistedOrderClock,
  });
  app.use("/api/research/early-access/request-intents", secure, createRequestIntentRouter({
    service, care, staffReader: requestIntentStaffReader(rpc), enabled,
    staffReadEnabled: () => wiring.env[REQUEST_INTENT_STAFF_READ_ENABLED_ENV] === "true",
    resolveCustomer: async (req) => {
      const viewer = await viewers.customer(req);
      // A rejected/recovery bearer must not silently become a cookie owner.
      if (req.headers.authorization && (viewer.actorType !== "member" || !viewer.authUserId)) {
        throw new RequestIntentError("authentication_required", 401);
      }
      return viewer;
    },
    mutationGuard: requestIntentMutationGuard(origin), readRateLimit,
    writeRateLimit: requestIntentRateLimit(rpc, "write"),
  }));
  // No outbox/mirror/payment/provider/supplier writer is composed.
}
