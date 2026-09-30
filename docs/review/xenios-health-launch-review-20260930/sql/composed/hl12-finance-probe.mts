// Claude HL-12 composed finance probe (review-only, local, disposable).
// Real: route table + createAssistedOrderProductionComposition + AssistedOrderService + AssistedOrderFinanceService
//       + SupabaseAssistedOrderRepository + postgrest-js -> PostgREST v14.13 -> PG 17.6 (service_role JWT).
// Substitutions (printed): requireSupabaseAdmin -> header stand-in that stamps adminAuthUserId like the real guard;
//   Supabase member auth -> header stand-in resolveMember; manual ledger authority -> SYNTHETIC in-memory ledger
//   (production composes null); outbox/audit -> in-memory capture.
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";
import express from "file:///C:/xenios-wt/closeout-review/node_modules/express/index.js";
import { PostgrestClient } from "file:///C:/xenios-wt/closeout-review/node_modules/@supabase/postgrest-js/dist/index.mjs";
import { SupabaseAssistedOrderRepository } from "file:///C:/xenios-wt/closeout-review/server/research/assisted-order/supabase-repository.ts";
import { createAssistedOrderProductionComposition } from "file:///C:/xenios-wt/closeout-review/server/research/assisted-order/production.ts";
import { createAssistedOrderRouteTable } from "file:///C:/xenios-wt/closeout-review/server/research/assisted-order/http.ts";
import { assistedOrderExpressHandler, createAssistedOrderViewerResolvers } from "file:///C:/xenios-wt/closeout-review/server/research/assisted-order/express.ts";
import { AssistedOrderFinanceService } from "file:///C:/xenios-wt/closeout-review/server/research/assisted-order/finance.ts";

const REST = "http://127.0.0.1:55431";
const SECRET = fs.readFileSync(process.argv[2], "utf8").trim();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(role) { const n = Math.floor(Date.now() / 1000); const h = b64({ alg: "HS256", typ: "JWT" }); const p = b64({ role, iat: n, exp: n + 3600 }); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; }
const client = (role) => new PostgrestClient(REST, { headers: { Authorization: `Bearer ${jwt(role)}` } });
const sr = client("service_role");
const psql = (sql) => execSync(`docker exec claude-hl12-pg psql -U supabase_admin -h 127.0.0.1 -d postgres -tAc ${JSON.stringify(sql)}`, { env: { ...process.env, MSYS_NO_PATHCONV: "1" } }).toString().trim();
const rollbacks = () => Number(psql("select xact_rollback from pg_stat_database where datname='postgres'"));

// SYNTHETIC independent ledger: evidenceRef -> the exact payment it proves. Stands in for the missing adapter.
const ledger = new Map();
const synthLedger = { verify: async (i) => { const e = ledger.get(i.evidenceRef); if (!e) return null; const ok = e.requestId === i.requestId && e.quoteId === i.quoteId && e.amount === i.observedAmountCents && e.currency === i.observedCurrency && e.reference === i.paymentReference; return ok ? { observedAt: e.observedAt } : null; } };

const outbox = [];
function build(manualEvidence) {
  const composition = createAssistedOrderProductionComposition({
    enabled: true, auditMode: "log_line_nondurable",
    legal: { requiredAgreements: async () => [] }, submissionStanding: { accepted: async () => true },
    catalog: { list: async () => { throw new Error("unused"); }, resolveLine: async () => { throw new Error("unused"); } },
    repository: new SupabaseAssistedOrderRepository(sr), outbox: { enqueue: async (i) => { outbox.push(i); } },
    audit: { record: async () => {} }, documents: {}, adminNotificationEmail: "founder@example.invalid",
  });
  const finance = new AssistedOrderFinanceService(sr, manualEvidence);
  const viewers = createAssistedOrderViewerResolvers({
    resolveMember: async (req) => { const id = req.headers["x-probe-member"]; return typeof id === "string" ? { id, authUserId: crypto.randomUUID(), email: "member@example.invalid" } : null; },
    earlyAccess: () => null, earlyAccessBindings: () => null, adminEmail: () => "founder@example.invalid",
  });
  const routes = createAssistedOrderRouteTable(composition.service, viewers, null, finance);
  const app = express(); app.use(express.json());
  // STAND-IN for requireSupabaseAdmin: admits x-probe-admin-uid and stamps adminAuthUserId exactly as server/routes.ts:149 does.
  app.use("/api/admin", (req, res, next) => { const uid = req.headers["x-probe-admin-uid"]; if (typeof uid !== "string") return res.status(401).json({ error: "admin_required" }); req.adminAuthUserId = uid; next(); });
  for (const r of routes) { const m = r.method.toLowerCase(); app[m](r.path, assistedOrderExpressHandler(r)); }
  return app;
}
async function listen(app) { const s = app.listen(0, "127.0.0.1"); await new Promise((r) => s.once("listening", r)); return { s, base: `http://127.0.0.1:${s.address().port}` }; }
async function call(base, method, path, { body, member, admin, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (member) headers["x-probe-member"] = member; if (admin) headers["x-probe-admin-uid"] = admin; if (token) headers["x-xenios-order-status-token"] = token;
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, code: j?.code ?? j?.error ?? null, data: j };
}
const out = []; const rec = (c, r) => { out.push({ case: c, result: r }); console.log("CASE", JSON.stringify({ case: c, result: r })); };
let n = 0; const ref = () => "XRR-20260930-" + (0xE100000000 + ++n).toString(16).toUpperCase();
async function seed(member, unit = 5000, qty = 2) {
  const id = crypto.randomUUID(); const r = ref(); const lineId = crypto.randomUUID();
  const { error } = await sr.rpc("research_assisted_order_submit", { p_request: {
    requestId: id, publicReference: r, idempotencyKeyHash: "h-" + r, requestFingerprint: "fp-" + r, actorMemberId: member,
    normalizedEmail: "probe@example.invalid", fullLegalName: "Probe Customer", mobilePhone: "+15125550100",
    shippingAddress: { line1: "1 Test", city: "Austin", region: "TX", postalCode: "78704", countryCode: "US" },
    billingAddress: { line1: "1 Test", city: "Austin", region: "TX", postalCode: "78704", countryCode: "US" },
    ageConfirmed: true, agreements: [], estimatedTotalCents: unit * qty, currency: "USD", source: "early_access_manual_order_bridge",
    statusTokenHash: crypto.createHash("sha256").update("tok-" + r).digest("hex"), createdAt: new Date().toISOString(),
    lines: [{ lineId, productId: "pc-prod-1", variantId: "pc-var-1", productName: "BPC-157", quantity: qty, minimumQuantity: 1, quantityIncrement: 1,
      workflowMode: "direct_order_request", customerActionLabel: "Request order", unitPriceCents: unit, lineEstimateCents: unit * qty,
      currency: "USD", catalogVersion: "v1", authoritativeFingerprint: "fp-line-" + r }] } });
  if (error) throw new Error("seed " + error.code + " " + error.message);
  const line = psql(`select id from public.research_assisted_order_lines where request_id='${id}'`);
  return { id, ref: r, lineId: line };
}
const status = (id) => psql(`select status from public.research_assisted_order_requests where id='${id}'`);
const counts = (id) => psql(`select (select count(*) from public.research_assisted_order_payment_verifications where request_id='${id}')||'/'||(select count(*) from public.research_assisted_order_events where request_id='${id}' and status='paid')`);
const inFuture = (s) => new Date(Date.now() + s * 1000).toISOString();

const MEMBER = crypto.randomUUID(), OTHER = crypto.randomUUID(), ADMIN = crypto.randomUUID(), ADMIN_NOGRANT = crypto.randomUUID(), ADMIN_B = crypto.randomUUID();
psql(`insert into public.research_assisted_order_payment_verifier_grants(auth_user_id, actor_label, granted_by) values ('${ADMIN}','finance-a@example.invalid','claude-probe'),('${ADMIN_B}','finance-b@example.invalid','claude-probe')`);

const prod = await listen(build(null));
const synth = await listen(build(synthLedger));
const B = synth.base;
async function toQuoted(o, api = B) {
  await call(api, "PATCH", `/api/admin/research/assisted-orders/${o.id}/status`, { admin: ADMIN, body: { status: "reviewing" } });
  return call(api, "POST", `/api/admin/research/assisted-orders/${o.id}/quote`, { admin: ADMIN, body: { lineDecisions: [{ lineId: o.lineId }], validUntil: inFuture(7 * 86400) } });
}
async function toReview(o) { for (const s of ["payment_pending", "payment_review"]) await call(B, "PATCH", `/api/admin/research/assisted-orders/${o.id}/status`, { admin: ADMIN, body: { status: s } }); }
async function observe(o, quoteId, amount = 10000, currency = "USD", evidence = null, admin = ADMIN) {
  const ev = evidence ?? "ledger-" + o.ref; if (!ledger.has(ev)) ledger.set(ev, { requestId: o.id, quoteId, amount, currency, reference: o.ref, observedAt: new Date().toISOString() });
  return call(B, "POST", `/api/admin/research/assisted-orders/${o.id}/payment-observations/manual`, { admin, body: { quoteId, observedAmountCents: amount, observedCurrency: currency, paymentReference: o.ref, sourceEvidenceRef: ev } });
}
const r0 = rollbacks();
console.log("SUBSTITUTIONS", JSON.stringify(["requireSupabaseAdmin -> header stand-in stamping adminAuthUserId", "member auth -> header stand-in", "manual ledger authority -> SYNTHETIC in-memory ledger (production composes null)", "outbox/audit -> in-memory capture", "verifier grants inserted directly in SQL (no grant route exists)"]));

// ---- S: successful composed path -------------------------------------------------------------
const s = await seed(MEMBER);
const q = await toQuoted(s); rec("S1 admin issues quote (server-derived total)", { status: q.status, total: q.data?.totalCents, version: q.data?.version, priceSource: q.data?.lines?.[0]?.priceSource });
const g = await call(B, "GET", `/api/research/early-access/assisted-orders/${s.ref}/quote`, { member: MEMBER });
rec("S2 owner reads quote", { status: g.status, total: g.data?.totalCents, hasPricingBasis: JSON.stringify(g.data ?? {}).includes("pricingBasis") || JSON.stringify(g.data ?? {}).includes("pricing_basis") });
const a = await call(B, "POST", `/api/research/early-access/assisted-orders/${s.ref}/quote/accept`, { member: MEMBER, body: { quoteId: g.data?.quoteId, version: g.data?.version, expectedTotalCents: g.data?.totalCents } });
rec("S3 owner accepts exact quote", { status: a.status, acceptanceId: Boolean(a.data?.acceptanceId), replayed: a.data?.replayed });
await toReview(s); const ob = await observe(s, g.data?.quoteId);
rec("S4 granted admin records independent manual observation", { status: ob.status, replayed: ob.data?.replayed });
const outboxBefore = outbox.length;
const v = await call(B, "POST", `/api/admin/research/assisted-orders/${s.id}/payment-observations/${ob.data?.observationId}/verify`, { admin: ADMIN });
rec("S5 verify -> paid", { status: v.status, state: v.data?.state, replayed: v.data?.replayed, requestStatus: status(s.id), verifications_paidEvents: counts(s.id), customerNotificationIntents: outbox.length - outboxBefore });
const v2 = await call(B, "POST", `/api/admin/research/assisted-orders/${s.id}/payment-observations/${ob.data?.observationId}/verify`, { admin: ADMIN });
rec("S6 identical retry", { status: v2.status, replayed: v2.data?.replayed, verifications_paidEvents: counts(s.id) });
const f = await call(B, "PATCH", `/api/admin/research/assisted-orders/${s.id}/status`, { admin: ADMIN, body: { status: "supplier_processing", evidence: { supplierAssignmentId: "assign-1" } } });
rec("S7 verified paid -> supplier_processing through mounted route", { status: f.status, code: f.code, requestStatus: status(s.id) });
const fsql = await sr.rpc("research_assisted_order_set_status", { p_request_id: s.id, p_expected_status: "paid", p_new_status: "supplier_processing", p_actor_id: "finance-a@example.invalid", p_actor_type: "admin", p_evidence: { supplierAssignmentId: "assign-1" } });
rec("S8 same transition at SQL layer", fsql.error ? "REFUSED " + fsql.error.code + " " + (fsql.error.details || "") : "ACCEPTED -> " + status(s.id));

// ---- production composition (manualEvidence = null) ----------------------------------------
const p = await seed(MEMBER); const pq = await toQuoted(p, prod.base);
const pg = await call(prod.base, "GET", `/api/research/early-access/assisted-orders/${p.ref}/quote`, { member: MEMBER });
await call(prod.base, "POST", `/api/research/early-access/assisted-orders/${p.ref}/quote/accept`, { member: MEMBER, body: { quoteId: pg.data?.quoteId, version: pg.data?.version, expectedTotalCents: pg.data?.totalCents } });
for (const st of ["payment_pending", "payment_review"]) await call(prod.base, "PATCH", `/api/admin/research/assisted-orders/${p.id}/status`, { admin: ADMIN, body: { status: st } });
const pob = await call(prod.base, "POST", `/api/admin/research/assisted-orders/${p.id}/payment-observations/manual`, { admin: ADMIN, body: { quoteId: pg.data?.quoteId, observedAmountCents: 10000, observedCurrency: "USD", paymentReference: p.ref, sourceEvidenceRef: "ledger-x" } });
rec("P1 PRODUCTION composition (manualEvidence=null): manual observation", { quoteIssue: pq.status, status: pob.status, code: pob.code });

// ---- N: refusals ------------------------------------------------------------------------------
const w = await seed(MEMBER); const wq = await toQuoted(w);
rec("N1 foreign member reads quote", (await call(B, "GET", `/api/research/early-access/assisted-orders/${w.ref}/quote`, { member: OTHER })).status);
rec("N1b no credential reads quote", (await call(B, "GET", `/api/research/early-access/assisted-orders/${w.ref}/quote`)).status);
rec("N1c status-token holder reads quote", (await call(B, "GET", `/api/research/early-access/assisted-orders/${w.ref}/quote`, { token: "tok-" + w.ref })).status);
rec("N1d foreign member accepts", (await call(B, "POST", `/api/research/early-access/assisted-orders/${w.ref}/quote/accept`, { member: OTHER, body: { quoteId: wq.data?.quoteId, version: 1, expectedTotalCents: 10000 } })).status);
rec("N2 accept with wrong total", await call(B, "POST", `/api/research/early-access/assisted-orders/${w.ref}/quote/accept`, { member: MEMBER, body: { quoteId: wq.data?.quoteId, version: 1, expectedTotalCents: 9999 } }).then((r) => ({ status: r.status, code: r.code })));
const wq2 = await call(B, "POST", `/api/admin/research/assisted-orders/${w.id}/quote`, { admin: ADMIN, body: { lineDecisions: [{ lineId: w.lineId }], validUntil: inFuture(86400) } });
rec("N3 accept superseded v1 after v2 issued", await call(B, "POST", `/api/research/early-access/assisted-orders/${w.ref}/quote/accept`, { member: MEMBER, body: { quoteId: wq.data?.quoteId, version: 1, expectedTotalCents: 10000 } }).then((r) => ({ status: r.status, code: r.code, v2: wq2.data?.version })));
rec("N4 admin tries to reprice a priced line", await call(B, "POST", `/api/admin/research/assisted-orders/${w.id}/quote`, { admin: ADMIN, body: { lineDecisions: [{ lineId: w.lineId, unitPriceCents: 1 }], validUntil: inFuture(86400) } }).then((r) => ({ status: r.status, code: r.code })));
await call(B, "POST", `/api/research/early-access/assisted-orders/${w.ref}/quote/accept`, { member: MEMBER, body: { quoteId: wq2.data?.quoteId, version: 2, expectedTotalCents: 10000 } });
rec("N5 re-issue after acceptance (accepted quote immutable)", await call(B, "POST", `/api/admin/research/assisted-orders/${w.id}/quote`, { admin: ADMIN, body: { lineDecisions: [{ lineId: w.lineId }], validUntil: inFuture(86400) } }).then((r) => ({ status: r.status, code: r.code })));
const e = await seed(MEMBER); const eq = await toQuoted(e);
psql(`update public.research_assisted_order_quotes set valid_until = issued_at + interval '1 second' where id='${eq.data?.quoteId}'`);
await new Promise((r) => setTimeout(r, 1500));
rec("N6 accept expired quote", await call(B, "POST", `/api/research/early-access/assisted-orders/${e.ref}/quote/accept`, { member: MEMBER, body: { quoteId: eq.data?.quoteId, version: 1, expectedTotalCents: 10000 } }).then((r) => ({ status: r.status, code: r.code })));
// unaccepted quote payment
const u = await seed(MEMBER); const uq = await toQuoted(u); await toReview(u); const uob = await observe(u, uq.data?.quoteId);
rec("N7 verify against unaccepted quote", await call(B, "POST", `/api/admin/research/assisted-orders/${u.id}/payment-observations/${uob.data?.observationId}/verify`, { admin: ADMIN }).then((r) => ({ observe: uob.status, status: r.status, code: r.code, requestStatus: status(u.id), verifications_paidEvents: counts(u.id) })));
async function accepted() { const o = await seed(MEMBER); const oq = await toQuoted(o); const og = await call(B, "GET", `/api/research/early-access/assisted-orders/${o.ref}/quote`, { member: MEMBER }); await call(B, "POST", `/api/research/early-access/assisted-orders/${o.ref}/quote/accept`, { member: MEMBER, body: { quoteId: og.data?.quoteId, version: og.data?.version, expectedTotalCents: og.data?.totalCents } }); await toReview(o); return { o, quoteId: og.data?.quoteId }; }
for (const [label, amt, cur] of [["N8 1c underpayment", 9999, "USD"], ["N9 1c overpayment", 10001, "USD"], ["N10 wrong currency EUR", 10000, "EUR"], ["N10b lowercase usd", 10000, "usd"]]) {
  const { o, quoteId } = await accepted(); const x = await observe(o, quoteId, amt, cur);
  const y = await call(B, "POST", `/api/admin/research/assisted-orders/${o.id}/payment-observations/${x.data?.observationId}/verify`, { admin: ADMIN });
  const corrected = await observe(o, quoteId, 10000, "USD", "ledger-corrected-" + o.ref);
  rec(label, { observe: x.status, verify: y.status, code: y.code, requestStatus: status(o.id), correctedObservation: { status: corrected.status, code: corrected.code } });
}
{ const { o, quoteId } = await accepted(); const x = await observe(o, quoteId);
  rec("N11 verifier without grant (guarded admin uid, no grant)", await call(B, "POST", `/api/admin/research/assisted-orders/${o.id}/payment-observations/${x.data?.observationId}/verify`, { admin: ADMIN_NOGRANT }).then((r) => ({ status: r.status, code: r.code, requestStatus: status(o.id) })));
  rec("N12 different granted admin verifies (not the observer)", await call(B, "POST", `/api/admin/research/assisted-orders/${o.id}/payment-observations/${x.data?.observationId}/verify`, { admin: ADMIN_B }).then((r) => ({ status: r.status, code: r.code, requestStatus: status(o.id) })));
  rec("N13 body injects verifier identity", await call(B, "POST", `/api/admin/research/assisted-orders/${o.id}/payment-observations/${x.data?.observationId}/verify`, { admin: ADMIN_NOGRANT, body: { verifierAuthUserId: ADMIN, p_verifier_auth_user_id: ADMIN } }).then((r) => ({ status: r.status, code: r.code })));
  const other = await seed(MEMBER);
  rec("N14 valid observation under a different request path", await call(B, "POST", `/api/admin/research/assisted-orders/${other.id}/payment-observations/${x.data?.observationId}/verify`, { admin: ADMIN }).then((r) => ({ status: r.status, code: r.code, requestStatus: status(o.id) })));
  const direct = await sr.rpc("research_assisted_order_payment_verify", { p_observation_id: x.data?.observationId, p_verifier_auth_user_id: ADMIN });
  rec("N15 direct PostgREST call to obsolete unbound verify (service_role)", direct.error ? "REFUSED " + direct.error.code : "ACCEPTED");
  for (const role of ["anon", "authenticated"]) { const d = await client(role).rpc("research_assisted_order_payment_verify_bound", { p_request_id: o.id, p_observation_id: x.data?.observationId, p_verifier_auth_user_id: ADMIN }); rec(`N16 verify_bound as ${role}`, d.error ? "REFUSED " + d.error.code : "ACCEPTED"); }
  const forged = await sr.rpc("research_assisted_order_set_status", { p_request_id: o.id, p_expected_status: "payment_review", p_new_status: "paid", p_actor_id: "x", p_actor_type: "admin", p_evidence: { paymentVerificationId: psql(`select id from public.research_assisted_order_payment_verifications where request_id='${s.id}'`) } });
  rec("N17 set_status paid with ANOTHER order's verification id", forged.error ? "REFUSED " + forged.error.code + " " + (forged.error.details || "") : "ACCEPTED");
  rec("N18 HTTP PATCH status paid", await call(B, "PATCH", `/api/admin/research/assisted-orders/${o.id}/status`, { admin: ADMIN, body: { status: "paid", evidence: { paymentVerificationId: "x" } } }).then((r) => ({ status: r.status, code: r.code })));
}
{ const one = await accepted(); const two = await accepted(); const shared = "ledger-SHARED-BANK-TXN";
  ledger.set(shared, { requestId: one.o.id, quoteId: one.quoteId, amount: 10000, currency: "USD", reference: one.o.ref, observedAt: new Date().toISOString() });
  const x1 = await observe(one.o, one.quoteId, 10000, "USD", shared); const v1 = await call(B, "POST", `/api/admin/research/assisted-orders/${one.o.id}/payment-observations/${x1.data?.observationId}/verify`, { admin: ADMIN });
  const x2raw = await call(B, "POST", `/api/admin/research/assisted-orders/${two.o.id}/payment-observations/manual`, { admin: ADMIN, body: { quoteId: two.quoteId, observedAmountCents: 10000, observedCurrency: "USD", paymentReference: two.o.ref, sourceEvidenceRef: shared } });
  rec("N19 same bank evidence ref for a second order (synthetic ledger rejects mismatched request)", { first: v1.status, second: { status: x2raw.status, code: x2raw.code } });
  const sqlReuse = await sr.rpc("research_assisted_order_payment_observe", { p_request_id: two.o.id, p_quote_id: two.quoteId, p_method: "manual", p_observed_amount_cents: 10000, p_observed_currency: "USD", p_payment_reference: two.o.ref, p_source_evidence_ref: shared, p_observed_at: new Date().toISOString(), p_actor_auth_user_id: ADMIN });
  rec("N19b SQL alone: same source_evidence_ref accepted for a second order?", sqlReuse.error ? "REFUSED " + sqlReuse.error.code + " " + (sqlReuse.error.details || "") : "ACCEPTED (source_evidence_ref not unique)");
}
{ const { o, quoteId } = await accepted(); const x = await observe(o, quoteId); const rb = rollbacks();
  const [c1, c2] = await Promise.all([1, 2].map(() => call(B, "POST", `/api/admin/research/assisted-orders/${o.id}/payment-observations/${x.data?.observationId}/verify`, { admin: ADMIN }).catch((err) => ({ status: "ERR " + err.name }))));
  rec("N20 two concurrent identical verifies", { a: [c1.status, c1.data?.replayed], b: [c2.status, c2.data?.replayed], verifications_paidEvents: counts(o.id), rollbackDelta: rollbacks() - rb });
}
{ const { o, quoteId } = await accepted(); await call(B, "PATCH", `/api/admin/research/assisted-orders/${o.id}/status`, { admin: ADMIN, body: { status: "payment_pending" } });
  const x = await observe(o, quoteId);
  rec("N21 verify while not in payment_review (atomicity)", await call(B, "POST", `/api/admin/research/assisted-orders/${o.id}/payment-observations/${x.data?.observationId}/verify`, { admin: ADMIN }).then((r) => ({ status: r.status, code: r.code, requestStatus: status(o.id), verifications_paidEvents: counts(o.id) })));
}
// cancellations
{ const a1 = await seed(MEMBER); await call(B, "PATCH", `/api/admin/research/assisted-orders/${a1.id}/status`, { admin: ADMIN, body: { status: "reviewing" } }); for (const st of ["payment_pending"]) await call(B, "PATCH", `/api/admin/research/assisted-orders/${a1.id}/status`, { admin: ADMIN, body: { status: st } });
  rec("C1 cancel from payment_pending (free text)", (await call(B, "PATCH", `/api/admin/research/assisted-orders/${a1.id}/status`, { admin: ADMIN, body: { status: "cancelled", evidence: { cancellationReason: "customer withdrew" } } })).status);
  const { o, quoteId } = await accepted(); await observe(o, quoteId);
  rec("C2 cancel from payment_review AFTER money observed (free text only)", await call(B, "PATCH", `/api/admin/research/assisted-orders/${o.id}/status`, { admin: ADMIN, body: { status: "cancelled", evidence: { cancellationReason: "changed mind" } } }).then((r) => ({ status: r.status, code: r.code, requestStatus: status(o.id) })));
  rec("C3 cancel verified paid order (HTTP)", await call(B, "PATCH", `/api/admin/research/assisted-orders/${s.id}/status`, { admin: ADMIN, body: { status: "cancelled", evidence: { cancellationReason: "refund issued" } } }).then((r) => ({ status: r.status, code: r.code })));
  const c3s = await sr.rpc("research_assisted_order_set_status", { p_request_id: s.id, p_expected_status: status(s.id), p_new_status: "cancelled", p_actor_id: "x", p_actor_type: "admin", p_evidence: { cancellationReason: "refund issued" } });
  rec("C3b cancel verified paid/supplier_processing order (SQL)", c3s.error ? "REFUSED " + c3s.error.code + " " + (c3s.error.details || "") : "ACCEPTED");
  const h = await seed(MEMBER); psql(`alter table public.research_assisted_order_requests disable trigger research_assisted_order_paid_hold; update public.research_assisted_order_requests set status='paid' where id='${h.id}'; alter table public.research_assisted_order_requests enable trigger research_assisted_order_paid_hold;`);
  const hs = await sr.rpc("research_assisted_order_set_status", { p_request_id: h.id, p_expected_status: "paid", p_new_status: "supplier_processing", p_actor_id: "x", p_actor_type: "admin", p_evidence: { supplierAssignmentId: "a" } });
  rec("C4 historical paid (no verification) -> supplier_processing (SQL)", hs.error ? "REFUSED " + hs.error.code + " " + (hs.error.details || "") : "ACCEPTED");
}
rec("Z rollback delta for whole run", rollbacks() - r0);
for (const x of [prod, synth]) { x.s.close(); x.s.closeAllConnections?.(); }
process.exit(0);
