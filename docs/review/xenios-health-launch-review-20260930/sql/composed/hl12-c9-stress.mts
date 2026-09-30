// Claude HL-12 composed probe (review-only, local, disposable).
// Real: Express door + route table + createAssistedOrderProductionComposition + AssistedOrderService
//       + SupabaseAssistedOrderRepository + @supabase/postgrest-js -> PostgREST v14.13 -> PG 17.6 (service_role JWT).
// Substituted (stated in output): requireSupabaseAdmin -> header stand-in; outbox/audit -> in-memory capture;
//       catalog/documents unused by status transitions (fail if called).
import crypto from "node:crypto";
import express from "file:///C:/xenios-wt/closeout-review/node_modules/express/index.js";
import { PostgrestClient } from "file:///C:/xenios-wt/closeout-review/node_modules/@supabase/postgrest-js/dist/index.mjs";
import { SupabaseAssistedOrderRepository } from "file:///C:/xenios-wt/closeout-review/server/research/assisted-order/supabase-repository.ts";
import { createAssistedOrderProductionComposition } from "file:///C:/xenios-wt/closeout-review/server/research/assisted-order/production.ts";
import { createAssistedOrderRouteTable } from "file:///C:/xenios-wt/closeout-review/server/research/assisted-order/http.ts";
import { assistedOrderExpressHandler, createAssistedOrderViewerResolvers } from "file:///C:/xenios-wt/closeout-review/server/research/assisted-order/express.ts";
import fs from "node:fs";

console.error("[probe] modules loaded");
const REST = "http://127.0.0.1:55431";
const SECRET = fs.readFileSync(process.argv[2], "utf8").trim();
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(role: string): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ role, iat: now, exp: now + 3600 });
  const sig = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
const client = (role: string) => new PostgrestClient(REST, { headers: { Authorization: `Bearer ${jwt(role)}` } });
const service_role = client("service_role");

const outbox: unknown[] = []; const audit: unknown[] = [];
const composition = createAssistedOrderProductionComposition({
  enabled: true,
  auditMode: "log_line_nondurable",
  legal: { requiredAgreements: async () => [] } as never,
  submissionStanding: { accepted: async () => true } as never,
  catalog: { list: async () => { throw new Error("catalog unused"); }, resolveLine: async () => { throw new Error("catalog unused"); } } as never,
  repository: new SupabaseAssistedOrderRepository(service_role as never),
  outbox: { enqueue: async (i: unknown) => { outbox.push(i); } } as never,
  audit: { record: async (e: unknown) => { audit.push(e); } } as never,
  documents: { } as never,
  adminNotificationEmail: "founder@example.invalid",
} as never);
if (!composition.service) throw new Error(`composition refused: ${String(composition.refusalReason)}`);
const viewers = createAssistedOrderViewerResolvers({
  resolveMember: async () => null,
  earlyAccess: () => null,
  earlyAccessBindings: () => null,
  adminEmail: () => "founder@example.invalid",
} as never);
const routes = createAssistedOrderRouteTable(composition.service as never, viewers as never);
const door = (method: string, path: string) => {
  const d = routes.find((r: { method: string; path: string }) => r.method === method && r.path === path);
  if (!d) throw new Error(`missing ${method} ${path}`);
  return assistedOrderExpressHandler(d as never);
};
const app = express();
app.use(express.json());
// STAND-IN for requireSupabaseAdmin (server/index.ts:1051). Real guard: Supabase getUser + ADMIN_EMAIL + recovery-purpose denial.
app.use("/api/admin", (req: any, res: any, next: any) => (req.headers["x-probe-admin"] === "yes" ? next() : res.status(401).json({ error: "admin_required" })));
app.patch("/api/admin/research/assisted-orders/:requestId/status", door("PATCH", "/api/admin/research/assisted-orders/:requestId/status"));
app.get("/api/admin/research/assisted-orders/:requestId", door("GET", "/api/admin/research/assisted-orders/:requestId"));
console.error("[probe] app composed");
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

console.error("[probe] listening");
async function seed(ref: string, totalCents: number): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await service_role.rpc("research_assisted_order_submit", { p_request: {
    requestId: id, publicReference: ref, idempotencyKeyHash: `hash-${ref}`, requestFingerprint: `fp-${ref}`,
    earlyAccessSessionHash: "a".repeat(64), normalizedEmail: "probe@example.invalid", fullLegalName: "Probe Customer",
    mobilePhone: "+15125550100",
    shippingAddress: { line1: "1 Test", city: "Austin", region: "TX", postalCode: "78704", countryCode: "US" },
    billingAddress: { line1: "1 Test", city: "Austin", region: "TX", postalCode: "78704", countryCode: "US" },
    ageConfirmed: true, agreements: [], estimatedTotalCents: totalCents, currency: "USD",
    source: "early_access_manual_order_bridge", statusTokenHash: `tok-${ref}`, createdAt: new Date().toISOString(),
    lines: [{ lineId: crypto.randomUUID(), productId: "pc-prod-1", variantId: "pc-var-1", productName: "BPC-157",
      quantity: 2, minimumQuantity: 1, quantityIncrement: 1, workflowMode: "direct_order_request",
      customerActionLabel: "Request order", unitPriceCents: totalCents / 2, lineEstimateCents: totalCents,
      currency: "USD", catalogVersion: "v1", authoritativeFingerprint: `fp-line-${ref}` }],
  } });
  if (error) throw new Error(`seed ${ref}: ${error.code} ${error.message}`);
  return id;
}
async function patch(id: string, body: unknown, admin = true) {
  const r = await fetch(`${base}/api/admin/research/assisted-orders/${id}/status`, {
    method: "PATCH", signal: AbortSignal.timeout(20000), headers: { "content-type": "application/json", ...(admin ? { "x-probe-admin": "yes" } : {}) }, body: JSON.stringify(body),
  });
  let j: any = null; try { j = await r.json(); } catch { /* */ }
  console.error("[probe] PATCH", id.slice(0,8), JSON.stringify(body).slice(0,60), "->", r.status);
  return { status: r.status, code: j?.code ?? j?.error ?? null, newStatus: j?.status ?? null };
}
async function toReview(id: string) {
  for (const s of ["reviewing", "payment_pending", "payment_review"]) {
    const r = await patch(id, { status: s });
    if (r.status !== 200) throw new Error(`walk ${s}: ${JSON.stringify(r)}`);
  }
}
let n = 900; const ref = () => "XRR-20260930-" + (0xC900000000 + ++n).toString(16).toUpperCase();
const settle = (p) => p.then((v) => v, (e) => ({ error: String(e?.name || e) + ": " + String(e?.cause?.code || e?.message || "") }));
const tally = {}; const hangs = [];
for (let i = 0; i < 15; i++) {
  const id = await seed(ref(), 10000); await toReview(id);
  const [a, b] = await Promise.all([settle(patch(id, { status: "paid", evidence: { paymentVerificationId: "c9-a-" + i } })), settle(patch(id, { status: "paid", evidence: { paymentVerificationId: "c9-b-" + i } }))]);
  const key = [a, b].map((r) => r.error ? "TIMEOUT/ERR" : String(r.status) + (r.code ? ":" + r.code : "")).sort().join(" + ");
  tally[key] = (tally[key] || 0) + 1; if (/TIMEOUT|ERR/.test(key)) hangs.push({ i, id, a, b });
}
console.log("C9STRESS", JSON.stringify({ tally, hangs }));
server.close(); server.closeAllConnections?.(); process.exit(0);
