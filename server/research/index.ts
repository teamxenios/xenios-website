import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { CatalogResponse, CommerceLane, Product } from "@shared/research/types";
import { products } from "./products-data";
import { policies } from "./policies-data";
import { requireActiveMember } from "./member-auth";

// ---------------------------------------------------------------------------
// xenios research: Express gate + APIs.
//
// Security model: this is a Vite SPA, so anything bundled into client JS is
// publicly fetchable. Therefore the catalog (products, prices), policies, and
// ordering live ONLY behind these gated APIs; the client bundle carries no
// product data. The gate is a shared password (RESEARCH_ACCESS_PASSWORD)
// exchanged for a signed, HTTP-only cookie. Fail closed: with no password set,
// /research and its APIs serve nothing.
//
// Commerce stays off unless the lane's flag is explicitly "true". Orders are
// validated server-side and totals are computed from the server catalog; prices
// submitted by a browser are never trusted (the schema does not accept prices).
// ---------------------------------------------------------------------------

const COOKIE_NAME = "xr_access";
const SESSION_HOURS = 12;

const password = () => process.env.RESEARCH_ACCESS_PASSWORD || "";
// Launch switch: RESEARCH_PUBLIC="true" opens the public research experience
// without the review password. Default is the private, password-gated mode.
export const publicMode = () => process.env.RESEARCH_PUBLIC === "true";
// RESEARCH_SESSION_SECRET is REQUIRED in production for every signed artifact
// (gate cookies, status tokens). It is never derived from the access password.
// Without it in production, the research surface fails closed.
export const sessionSecretOk = () =>
  Boolean(process.env.RESEARCH_SESSION_SECRET) || process.env.NODE_ENV !== "production";
const configured = () => (Boolean(password()) || publicMode()) && sessionSecretOk();
const indexable = () => process.env.RESEARCH_INDEXABLE === "true";

const researchCommerceEnabled = () => process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED === "true";
const consumerCommerceEnabled = () => process.env.NEXT_PUBLIC_CONSUMER_COMMERCE_ENABLED === "true";
const laneEnabled = (lane: CommerceLane) => (lane === "research" ? researchCommerceEnabled() : consumerCommerceEnabled());

// Signing key. Production requires the dedicated secret (configured() already
// fails closed without it); development falls back to a fixed dev-only string,
// never the password. Never sent to the client.
function signingKey(): Buffer {
  const secret = process.env.RESEARCH_SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEARCH_SESSION_SECRET is required in production");
    }
    return crypto.createHash("sha256").update("xenios-research-dev-only-secret").digest();
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function sign(value: string): string {
  return crypto.createHmac("sha256", signingKey()).update(value).digest("base64url");
}

// The signed payload carries a "cookie." domain label so the gate-cookie MAC
// can never collide with the applicant status/claim token MAC, which shares
// the same signing secret (both derive sha256(RESEARCH_SESSION_SECRET)).
function makeToken(): string {
  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  return `${expires}.${sign(`cookie.${expires}`)}`;
}

function tokenValid(token: string | undefined): boolean {
  if (!token || !configured()) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const expires = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(`cookie.${expires}`);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(expires) > Date.now();
}

function readCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function setSessionCookie(res: Response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(makeToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${secure}`,
  );
}

function clearSessionCookie(res: Response) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function isAuthed(req: Request): boolean {
  return tokenValid(readCookie(req));
}

// Small fixed-window limiter on password attempts (per IP).
const attempts = new Map<string, { count: number; resetAt: number }>();
function allowAttempt(req: Request): boolean {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = attempts.get(ip);
  if (!bucket || bucket.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (bucket.count >= 20) return false;
  bucket.count += 1;
  return true;
}

// ---------------------------------------------------------------------------
// Page-level middleware for /research*: noindex while gated, and fail closed
// when the gate is unconfigured. Register BEFORE the SPA catch-all.
// ---------------------------------------------------------------------------
export function researchPageGate(req: Request, res: Response, next: NextFunction) {
  // The xenios homepage stays at the root domain in every mode. Research is a
  // private, password-gated section at /research and never takes over the
  // root (canonical decision, 2026-07-18).
  const isResearchPath = req.path === "/research" || req.path.startsWith("/research/");
  if (!isResearchPath) return next();
  if (!indexable()) res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!configured()) {
    return res
      .status(503)
      .type("text/plain")
      .send("The research section is not configured.");
  }
  next();
}

// ---------------------------------------------------------------------------
// APIs
// ---------------------------------------------------------------------------
const passwordSchema = z.object({ password: z.string().min(1).max(200) });

const orderItemSchema = z.object({
  slug: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(25),
});

const orderRequestSchema = z.object({
  lane: z.enum(["research", "consumer"]),
  items: z.array(orderItemSchema).min(1).max(50),
  customer: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email(),
    phone: z.string().max(40).optional().default(""),
    organization: z.string().max(160).optional().default(""),
    address1: z.string().min(3).max(180),
    address2: z.string().max(180).optional().default(""),
    city: z.string().min(2).max(100),
    state: z.string().min(2).max(60),
    postalCode: z.string().min(3).max(20),
    country: z.string().min(2).max(60).default("United States"),
  }),
  researchAttestation: z.boolean().optional(),
  notes: z.string().max(1500).optional().default(""),
});

function referenceId(): string {
  return `XR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function saleable(product: Product): boolean {
  return laneEnabled(product.lane) && (product.status === "live" || product.status === "professional-only");
}

export function registerResearchApi(app: Express) {
  // Every /api/research/* route: fail closed when unconfigured.
  app.use("/api/research", (_req, res, next) => {
    if (!configured()) return res.status(503).json({ ok: false, message: "The research section is not configured." });
    next();
  });

  // Open: gate state (never reveals anything but booleans).
  app.get("/api/research/me", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ configured: configured(), authed: publicMode() || isAuthed(req), publicMode: publicMode() });
  });

  // Open: exchange the password for the signed session cookie.
  app.post("/api/research/access", (req, res) => {
    if (!allowAttempt(req)) {
      return res.status(429).json({ ok: false, message: "Too many attempts. Try again in a few minutes." });
    }
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, message: "Enter the access password." });
    const provided = crypto.createHash("sha256").update(parsed.data.password).digest();
    const expected = crypto.createHash("sha256").update(password()).digest();
    if (!crypto.timingSafeEqual(provided, expected)) {
      return res.status(401).json({ ok: false, message: "That password is not correct." });
    }
    setSessionCookie(res);
    res.json({ ok: true });
  });

  app.post("/api/research/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Access architecture (canonical): the shared password unlocks the private
  // GATEWAY and the application/status flows only. Member content (catalog,
  // orders, member routes) requires the member's own Supabase JWT, verified
  // server-side by requireMember, and an authenticated member bypasses the
  // shared password on exactly those member-authed endpoints (the Bearer
  // token is the stronger credential; every bypassed path still enforces it).
  // Everything else keeps the session-cookie wall.
  const MEMBER_AUTHED_PREFIXES = ["/member", "/catalog", "/orders"];
  app.use("/api/research", (req, res, next) => {
    if (publicMode()) return next();
    const bearer = (req.headers.authorization ?? "").startsWith("Bearer ");
    if (bearer && MEMBER_AUTHED_PREFIXES.some((p) => req.path === p || req.path.startsWith(p + "/"))) {
      return next();
    }
    if (!isAuthed(req)) return res.status(401).json({ ok: false, message: "Access required." });
    next();
  });

  // The catalog is ACTIVE-member content: the shared gateway password does
  // not unlock products, and neither does an approved-but-not-activated
  // membership. requireActiveMember verifies the JWT, the membership, and
  // the active status server-side.
  app.get("/api/research/catalog", requireActiveMember, (_req, res) => {
    res.set("Cache-Control", "no-store");
    const body: CatalogResponse = {
      products,
      commerce: { research: researchCommerceEnabled(), consumer: consumerCommerceEnabled() },
      email: "research@xeniostechnology.com",
    };
    res.json(body);
  });

  // Policies (privacy, terms, research-use) stay behind the shared password
  // only: the gateway footer links them and every applicant may read them.
  app.get("/api/research/policies", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ policies });
  });

  app.post("/api/research/orders", requireActiveMember, async (req, res) => {
    try {
      const parsed = orderRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, message: "Please review the order information.", issues: parsed.error.flatten() });
      }
      const order = parsed.data;

      // Commerce gate: the lane must be explicitly enabled, or nothing is accepted.
      if (!laneEnabled(order.lane)) {
        return res.status(503).json({ ok: false, message: "Ordering is not open for this catalog yet." });
      }

      const resolved = order.items.map((item) => ({
        item,
        product: products.find((product) => product.slug === item.slug),
      }));
      if (resolved.some((entry) => !entry.product)) {
        return res.status(400).json({ ok: false, message: "One or more products could not be found." });
      }
      const line = resolved as Array<{ item: { slug: string; quantity: number }; product: Product }>;

      // Lane separation is enforced in code: mixed carts are rejected.
      if (line.some((entry) => entry.product.lane !== order.lane)) {
        return res.status(400).json({ ok: false, message: "Research and consumer items must be submitted separately." });
      }
      if (line.some((entry) => !saleable(entry.product))) {
        return res.status(400).json({ ok: false, message: "One or more products are not available to order." });
      }
      if (order.lane === "research" && order.researchAttestation !== true) {
        return res.status(400).json({ ok: false, message: "Research attestation is required." });
      }

      // Totals are computed here, from the server catalog. Browser-submitted
      // prices do not exist in the schema and would be ignored if sent.
      const items = line.map((entry) => ({
        slug: entry.product.slug,
        name: entry.product.name,
        quantity: entry.item.quantity,
        unitPriceCents: entry.product.priceCents ?? 0,
        lineTotalCents: (entry.product.priceCents ?? 0) * entry.item.quantity,
      }));
      const totalCents = items.reduce((sum, entry) => sum + entry.lineTotalCents, 0);

      const orderId = referenceId();
      const payload = {
        orderId,
        receivedAt: new Date().toISOString(),
        lane: order.lane,
        items,
        totalCents,
        customer: order.customer,
        researchAttestation: order.researchAttestation === true,
        notes: order.notes,
      };

      const webhookUrl = process.env.ORDER_WEBHOOK_URL;
      if (!webhookUrl) {
        return res.status(503).json({ ok: false, message: "Order dispatch is not configured yet. Please contact research support." });
      }
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.ORDER_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.ORDER_WEBHOOK_SECRET}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.error(`[research orders] webhook rejected order ${orderId}: HTTP ${response.status}`);
        return res.status(502).json({ ok: false, message: "The order system did not accept the request. Please contact support." });
      }

      // Log the order id only; never customer details.
      console.log(`[research orders] accepted ${orderId} (${order.lane}, ${items.length} lines)`);
      res.json({ ok: true, orderId, totalCents });
    } catch (error) {
      console.error("[research orders] error:", error);
      res.status(500).json({ ok: false, message: "The order could not be processed. Please try again." });
    }
  });
}
