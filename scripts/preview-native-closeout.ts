/**
 * Local synthetic qualification ONLY; never imported by the application.
 * Real: SPA, Supabase-verifying admin/member guards, questions registrar,
 * commerce registrar and order lifecycle service. Synthetic: GoTrue identity,
 * two PostgREST tables, pre-paid fixture order, memory repository/notifier.
 * No charge, carrier, mail, hosted database or production evidence is claimed.
 */
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import net from "node:net";
import type { OrderRecord, OrderRepository } from "../server/research/commerce/orders";
import type { CommerceDependencies } from "../server/research/commerce/routes";

export const FIXTURE = Object.freeze({
  password: "native-preview-password", adminEmail: "admin@preview.invalid",
  memberEmail: "member@preview.invalid", otherEmail: "other@preview.invalid",
  questionId: "question-preview-one", orderId: "order-preview-one",
});
const STAMP = "2026-09-14T12:00:00.000Z";
const PERSONAS = [
  { email: FIXTURE.adminEmail, token: "native-preview-admin", id: "preview-auth-admin", member: "preview-member-admin" },
  { email: FIXTURE.memberEmail, token: "native-preview-member", id: "preview-auth-member", member: "preview-member-one" },
  { email: FIXTURE.otherEmail, token: "native-preview-other", id: "preview-auth-other", member: "preview-member-other" },
];

export async function buildNativeCloseoutPreview(port: number, distDir?: string) {
  if (process.env.NODE_ENV === "production") throw new Error("Native closeout preview refuses production");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Explicit local port required");
  const origin = `http://127.0.0.1:${port}`;
  // Remove every ambient application secret before importing application code.
  const keep = new Set(["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "APPDATA", "PATHEXT", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS"]);
  for (const key of Object.keys(process.env)) if (!keep.has(key.toUpperCase())) delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test", RESEARCH_PUBLIC: "true", RESEARCH_ACCESS_PASSWORD: "local-only",
    RESEARCH_SESSION_SECRET: "native-preview-session-not-production",
    SUPABASE_URL: `${origin}/preview-backend`, SUPABASE_ANON_KEY: "native-preview-anon",
    SUPABASE_SERVICE_ROLE_KEY: "native-preview-service", ADMIN_EMAIL: FIXTURE.adminEmail,
  });
  const originalFetch = globalThis.fetch;
  const originalConnect = net.Socket.prototype.connect;
  let blockedExternalRequests = 0;
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (target.origin !== origin) {
      blockedExternalRequests += 1;
      return Promise.reject(new Error("Native preview denied off-origin server fetch"));
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: any[]) {
    const normalized = Array.isArray(args[0]) ? args[0] : args;
    const options = normalized[0];
    const host = typeof options === "object" ? options.host ?? "localhost" : normalized[1] ?? "localhost";
    const targetPort = Number(typeof options === "object" ? options.port : options);
    if (!["127.0.0.1", "localhost", "::1"].includes(host) || targetPort !== port || typeof options === "string" && !/^\d+$/.test(options)) {
      blockedExternalRequests += 1; throw new Error("Native preview denied off-origin socket");
    }
    return originalConnect.apply(this, args as any);
  } as typeof originalConnect;

  const [{ requireSupabaseAdmin }, { requireActiveMember, requireMember }, { registerQuestionsApi },
    { registerCommerceApi }, { createOrderService }, { DisabledPaymentProvider }, { createInMemoryAdminQueuesStore }] = await Promise.all([
    import("../server/routes"), import("../server/research/member-auth"), import("../server/research/questions"),
    import("../server/research/commerce/routes"), import("../server/research/commerce/orders"),
    import("../server/research/providers/payment"), import("../server/research/commerce/persistence/admin-queues-store"),
  ]);
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const activeTokens = new Set<string>();
  const personaFor = (token: string) => activeTokens.has(token) ? PERSONAS.find((p) => p.token === token) : undefined;
  const bearer = (req: express.Request) => String(req.headers.authorization ?? "").replace(/^Bearer /, "");
  const user = (p: typeof PERSONAS[number]) => ({ id: p.id, email: p.email, aud: "authenticated", role: "authenticated", email_confirmed_at: STAMP, created_at: STAMP, updated_at: STAMP, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [] });
  const session = (p: typeof PERSONAS[number]) => ({ access_token: p.token, token_type: "bearer", refresh_token: `refresh-${p.token}`, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user(p) });
  const members = PERSONAS.map((p) => ({ id: p.member, auth_user_id: p.id, email: p.email, first_name: "Preview", status: "active", application_id: `application-${p.member}`, created_at: STAMP }));
  let questionsUnavailable = false;
  let ordersUnavailable = false;
  const questions: Record<string, unknown>[] = [{ id: FIXTURE.questionId, member_id: "preview-member-one", category: "general", status: "pending", source: "web", body_text: "Synthetic QA question: where can I find my order tracking?", answer_text: null, answered_at: null, answered_by: null, rating: null, follow_up_of_question_id: null, sla_target_at: null, created_at: STAMP, updated_at: STAMP }];
  const notifications: string[] = [];
  app.get("/api/config", (_req, res) => res.json({ metaPixelId: null, turnstileSiteKey: null, calendlyUrl: null, supabaseUrl: `${origin}/preview-backend`, supabaseAnonKey: "native-preview-anon" }));
  app.post("/preview-backend/auth/v1/token", (req, res) => {
    const p = req.query.grant_type === "refresh_token"
      ? PERSONAS.find((p) => activeTokens.has(p.token) && req.body.refresh_token === `refresh-${p.token}`)
      : PERSONAS.find((p) => p.email === req.body.email && req.body.password === FIXTURE.password);
    if (!p) return res.status(400).json({ error: "invalid_grant", error_description: "Invalid preview credentials" });
    activeTokens.add(p.token); return res.json(session(p));
  });
  app.get("/preview-backend/auth/v1/user", (req, res) => {
    const p = personaFor(bearer(req));
    return p ? res.json(user(p)) : res.status(401).json({ message: "Invalid preview session" });
  });
  app.post("/preview-backend/auth/v1/logout", (req, res) => { activeTokens.delete(bearer(req)); res.status(204).end(); });
  app.get("/preview-backend/auth/v1/admin/users", (req, res) => bearer(req) === "native-preview-service" ? res.json({ users: [], aud: "authenticated", next_page: null }) : res.status(403).json({ message: "Forbidden" }));
  // The real SDK queries this local-only table adapter. Filtering and guarded
  // PATCH are applied, including member ownership and prior status predicates.
  app.all("/preview-backend/rest/v1/:table", (req, res) => {
    if (bearer(req) !== "native-preview-service") return res.status(403).json({ message: "Forbidden" });
    const rows = req.params.table === "research_members" ? members : req.params.table === "research_member_questions" ? questions : null;
    if (!rows || !["GET", "PATCH"].includes(req.method)) return res.status(403).json({ message: "Preview operation not admitted" });
    if (rows === questions && questionsUnavailable) return res.status(503).json({ message: "Synthetic source unavailable" });
    let selected = (rows as Record<string, unknown>[]).filter((row) => Object.entries(req.query).every(([key, value]) => {
      if (["select", "order", "limit"].includes(key)) return true;
      return typeof value === "string" && value.startsWith("eq.") && String(row[key]) === value.slice(3);
    }));
    if (req.method === "PATCH") {
      if (rows !== questions || Object.keys(req.body).some((key) => !["answer_text", "status", "answered_at", "answered_by", "updated_at"].includes(key))) return res.status(403).json({ message: "Preview write not admitted" });
      selected.forEach((row) => Object.assign(row, req.body));
    }
    const projection = String(req.query.select ?? "*");
    if (projection !== "*") selected = selected.map((row) => Object.fromEntries(projection.split(",").map((key) => [key, row[key]])));
    if (String(req.headers.accept ?? "").includes("vnd.pgrst.object")) return res.json(selected[0] ?? null);
    return res.json(selected);
  });
  const order: OrderRecord = {
    orderId: FIXTURE.orderId, memberId: "preview-member-one", state: "payment_captured",
    lines: [{ sku: "PREVIEW-ONLY", displayName: "Synthetic QA product", quantity: 2, lineTotalCents: 19800 }],
    totals: { subtotalCents: 19800, shippingCents: 1295, storeCreditAppliedCents: 0, totalCents: 21095 },
    providerReference: "synthetic-seeded-payment-not-real", capturedAmountCents: 21095, refundedCents: 0,
    checkoutIdempotencyKey: "synthetic-checkout", lastIdempotencyKey: null, reviewTriggers: [], createdAt: STAMP, updatedAt: STAMP,
    shipments: [{ owner: "xenios", status: "pending", trackingNumber: null, carrier: null }],
  };
  const orders = new Map([[order.orderId, order]]);
  const repository: OrderRepository = {
    get: async (id) => orders.get(id) ?? null,
    save: async (row) => { orders.set(row.orderId, row); },
    listAll: async () => { if (ordersUnavailable) throw new Error("Synthetic order source unavailable"); return [...orders.values()]; },
    listByMember: async (id) => [...orders.values()].filter((row) => row.memberId === id),
    findByCheckoutIdempotencyKey: async (id, key) => [...orders.values()].find((row) => row.memberId === id && row.checkoutIdempotencyKey === key) ?? null,
    findByIdempotencyKey: async (id, key) => [...orders.values()].find((row) => row.memberId === id && row.lastIdempotencyKey === key) ?? null,
  };
  const service = createOrderService({ repository, payment: new DisabledPaymentProvider(), commerceEnabled: true, durablePaymentExecutionAvailable: false });
  app.get("/api/admin/me", requireSupabaseAdmin, (_req, res) => res.json({ success: true, email: FIXTURE.adminEmail }));
  app.get("/api/research/me", (_req, res) => res.json({ ok: true, authenticated: true }));
  app.get("/api/research/member/me", requireActiveMember, (req, res) => res.json({ ok: true, member: { firstName: "Preview", status: "active", applicationStatus: "approved", id: (req as express.Request & { researchMember: { id: string } }).researchMember.id } }));
  app.get("/api/research/catalog", requireActiveMember, (_req, res) => res.json({ products: [], commerce: { research: false, consumer: false }, email: "research@preview.invalid" }));
  app.get("/__native_preview", (_req, res) => res.json({ kind: "native-closeout-synthetic", scope: "LOCAL_SYNTHETIC_ONLY", externalMutations: 0, blockedExternalRequests, notificationIntents: notifications.length }));
  app.post("/__native_preview/questions-source", requireSupabaseAdmin, (req, res) => { questionsUnavailable = req.body.available !== true; res.json({ ok: true }); });
  app.post("/__native_preview/orders-source", requireSupabaseAdmin, (req, res) => { ordersUnavailable = req.body.available !== true; res.json({ ok: true }); });
  // Only these workflow doors may reach production registrars. No checkout,
  // refund, capture, authorization, generic table write or provider webhook.
  app.use("/api", (req, res, next) => {
    const key = `${req.method} ${req.path}`;
    if (/^GET \/(?:admin\/)?research\/(?:questions|orders)(?:\/[A-Za-z0-9-]+)?$/.test(key)
      || /^POST \/admin\/research\/questions\/[A-Za-z0-9-]+\/answer$/.test(key)
      || /^POST \/admin\/research\/orders\/[A-Za-z0-9-]+\/(?:processing|fulfilled|shipments)$/.test(key)
      || key === "GET /admin/research/commerce/queues") return next();
    return res.status(404).json({ code: "native_preview_route_not_admitted" });
  });
  registerQuestionsApi(app, { clock: { now: () => new Date("2026-09-21T12:00:00Z") }, notifier: { notify: async (input) => { notifications.push(input.eventType); return true; } } });
  // Other injected surfaces are unreachable through the closed wall above.
  const deps = {
    orders: service,
    ordersAdmin: {
      roster: () => service.adminRoster(), detail: (id: string) => service.adminDetail(id),
      beginProcessing: (id: string, _actor: string, now: Date) => service.beginProcessing(id, "admin", now),
      markFulfilled: (id: string, _actor: string, now: Date) => service.markFulfilled(id, "admin", now),
      recordTracking: (id: string, _actor: string, input: Parameters<typeof service.recordShipmentTracking>[2], now: Date) => service.recordShipmentTracking(id, "admin", input, now),
    },
    adminQueues: createInMemoryAdminQueuesStore(), now: () => new Date("2026-09-21T12:00:00Z"),
  } as unknown as CommerceDependencies;
  registerCommerceApi(app, deps, { requireAdmin: requireSupabaseAdmin, requireActiveMember, requireMember });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const distribution = path.resolve(distDir ?? path.join(root, "dist"));
  const provenanceFile = path.join(distribution, "evidence-provenance.json");
  app.get("/__native_preview/build", (_req, res) => res.json({ scope: "LOCAL_SYNTHETIC_ONLY", provenance: existsSync(provenanceFile) ? JSON.parse(readFileSync(provenanceFile, "utf8")) : null }));
  app.use(express.static(path.join(distribution, "public")));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(distribution, "public", "index.html")));
  return { app, repository, restoreFetch: () => { globalThis.fetch = originalFetch; net.Socket.prototype.connect = originalConnect; } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 52941);
  const { app } = await buildNativeCloseoutPreview(port, process.env.DIST_DIR);
  app.listen(port, "127.0.0.1", () => console.log(`[native-closeout-preview] LOCAL SYNTHETIC ONLY on http://127.0.0.1:${port}`));
}
