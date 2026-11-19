import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, RequestHandler, Response } from "express";
import type { CareAccessDependencies } from "../../care/access";
import { requestIp } from "../rate-limit";
import { BusinessInquiryService } from "./business-inquiry";
import { registerBusinessInquiryApi } from "./business-inquiry-routes";
import { createSupabaseBusinessInquiryRepository, type BusinessInquiryRpcClient } from "./business-inquiry-supabase";
import { requestIntentOrigin } from "../assisted-order/request-intent/production";
import { createHash } from "node:crypto";

const COOKIE = "__Host-xr_business_attempt";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Env = Readonly<Record<string, string | undefined>>;
type Context = Readonly<{ nonce: string; expires: number }>;
export interface BusinessInquiryProductionDependencies {
  env: Env;
  rpc: BusinessInquiryRpcClient | null;
  /** Existing ordinary verified JWT resolver. SQL rechecks narrow role/membership, never email/domain. */
  care: Pick<CareAccessDependencies, "resolvePrincipal">;
  now?: () => number;
  nonce?: () => string;
}

function runtimeMatches(env: Env, origin: string | null): boolean {
  if (env.RENDER_PR_NUMBER || env.IS_PULL_REQUEST === "true") return false;
  const project = env.SUPABASE_URL?.replace(/\/$/, "");
  return env.RENDER_SERVICE_ID === "srv-d8s9vej7uimc7384dfcg"
      && project === "https://yvzeduaxbwgcwllhywff.supabase.co" && origin === "https://xeniostechnology.com"
    || env.RENDER_SERVICE_ID === "srv-d9h4f4m7r5hc73ctjng0"
      && project === "https://srcphrgnxreqyirkitxd.supabase.co"
      && env.RENDER_EXTERNAL_URL === "https://xenios-research-staging.onrender.com"
      && origin === "https://xenios-research-staging.onrender.com";
}
function privateHeaders(res: Response): void {
  res.set({ "Cache-Control": "private, no-store", Pragma: "no-cache", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" });
  res.vary("Cookie"); res.vary("Authorization");
}
export function mountBusinessInquiryProduction(app: Express, deps: BusinessInquiryProductionDependencies): void {
  const { env, rpc } = deps;
  const now = deps.now ?? Date.now, nonce = deps.nonce ?? (() => randomBytes(32).toString("hex"));
  const origin = requestIntentOrigin(env.SITE_URL);
  const secret = env.RESEARCH_SESSION_SECRET ?? "";
  const ttlRaw = env.RESEARCH_BUSINESS_INQUIRY_CONTEXT_SECONDS ?? "";
  const ttl = Number(ttlRaw);
  const enabled = () => env.RESEARCH_BUSINESS_INQUIRY_ENABLED === "true" && rpc !== null
    && runtimeMatches(env, origin) && secret.length >= 32
    && /^[1-9][0-9]{1,4}$/.test(ttlRaw) && ttl >= 60 && ttl <= 86400;
  const mac = (payload: string) => createHmac("sha256", secret).update(`business-inquiry-attempt/v1\0${origin}\0${payload}`).digest("hex");
  function context(req: Request): Context | null {
    const entries = (req.headers.cookie ?? "").split(";").map(x => x.trim()).filter(x => x.startsWith(COOKIE + "="));
    if (entries.length !== 1) return null;
    const match = /^v1\.([0-9]{13})\.([0-9a-f]{64})\.([0-9a-f]{64})$/.exec(entries[0].slice(COOKIE.length + 1));
    if (!match) return null;
    const expires = Number(match[1]), payload = `v1.${match[1]}.${match[2]}`;
    const expected = Buffer.from(mac(payload), "hex"), received = Buffer.from(match[3], "hex");
    if (!timingSafeEqual(expected, received) || !Number.isSafeInteger(expires) || expires <= now()
      || expires > now() + ttl * 1000) return null;
    return { nonce: match[2], expires };
  }
  async function limited(req: Request, action: "read" | "write"): Promise<"allowed" | "blocked" | "unavailable"> {
    const ip = requestIp(req);
    if (!rpc || ip === "unknown") return "unavailable";
    try {
      const hit = await rpc.rpc("research_rate_limit_hit", {
        p_key: `business-inquiry:${action}:` + createHash("sha256").update(ip).digest("hex"),
        p_window_seconds: action === "read" ? 60 : 600, p_max_hits: action === "read" ? 60 : 20,
      });
      return hit.error !== null || typeof hit.data !== "boolean" ? "unavailable" : hit.data ? "allowed" : "blocked";
    } catch { return "unavailable"; }
  }
  const rateGuard = (action: "read" | "write"): RequestHandler => (req, res, next) => {
    void limited(req, action).then(result => {
      if (result === "allowed") next();
      else res.status(result === "blocked" ? 429 : 503).json({ error: result === "blocked" ? "rate_limited" : "unavailable" });
    });
  };
  const publicGuard: RequestHandler = (req, res, next) => {
    if (!origin || req.get("Origin") !== origin || req.get("Sec-Fetch-Site") && req.get("Sec-Fetch-Site") !== "same-origin"
      || !req.is("application/json")) { res.status(403).json({ error: "not_permitted" }); return; }
    rateGuard("write")(req, res, next);
  };
  const actors = new WeakMap<Request, string>();
  // Authentication only at HTTP. Each actual SQL read/command independently checks
  // current business-specific role/capability or exact canonical org membership.
  const ordinary: RequestHandler = (req, res, next) => {
    void deps.care.resolvePrincipal(req).then(principal => {
      if (!principal || !UUID.test(principal.subjectId)) { res.status(401).json({ error: "not_permitted" }); return; }
      actors.set(req, principal.subjectId); rateGuard("read")(req, res, next);
    }).catch(() => res.status(503).json({ error: "unavailable" }));
  };
  app.get("/api/research/business-inquiries/config", (req, res) => {
    privateHeaders(res);
    void (async () => {
      if (!enabled()) { res.status(503).json({ enabled: false }); return; }
      if (Object.keys(req.query).length || req.get("Sec-Fetch-Site") && req.get("Sec-Fetch-Site") !== "same-origin") {
        res.status(403).json({ enabled: false }); return;
      }
      const allowed = await limited(req, "read");
      if (allowed !== "allowed") { res.status(allowed === "blocked" ? 429 : 503).json({ enabled: false }); return; }
      const readiness = await rpc!.rpc("research_business_inquiry_readiness", {});
      if (readiness.error !== null || readiness.data !== true) { res.status(503).json({ enabled: false }); return; }
      let current = context(req);
      if (!current) {
        const value = nonce();
        if (!/^[0-9a-f]{64}$/.test(value)) throw Error("nonce_unavailable");
        current = { nonce: value, expires: now() + ttl * 1000 };
        const payload = `v1.${current.expires}.${current.nonce}`;
        res.append("Set-Cookie", `${COOKIE}=${payload}.${mac(payload)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttl}`);
      }
      res.json({ enabled: true, attemptPrefix: current.nonce + "_" });
    })().catch(() => { if (!res.headersSent) res.status(503).json({ enabled: false }); });
  });
  const repositoryClient = rpc ?? { rpc: async () => ({ data: null, error: { message: "business_inquiry_not_ready" } }) };
  registerBusinessInquiryApi(app, {
    service: new BusinessInquiryService(createSupabaseBusinessInquiryRepository(repositoryClient)), enabled,
    publicGuard, requireStaff: ordinary, requireOrganization: ordinary,
    resolveActorId: async req => actors.get(req) ?? null,
    resolveSubmissionContext: async req => {
      // A rejected/recovery bearer never silently degrades to a guest request.
      if (req.headers.authorization && !await deps.care.resolvePrincipal(req)) return null;
      const current = context(req);
      const attempt = typeof req.body?.attemptKey === "string" ? req.body.attemptKey : "";
      if (!current || !attempt.startsWith(current.nonce + "_")) return null;
      // This is a request-attempt custodian, never customer identity or an org claim.
      return { ownerContext: `business-inquiry-attempt/v1:${current.nonce}` };
    },
  });
}
