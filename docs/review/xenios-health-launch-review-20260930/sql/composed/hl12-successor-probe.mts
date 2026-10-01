// Claude HL-12 composed successor probe for 268e691 (review-only, local, disposable).
// Real: registerResearchApi gateway (non-public mode) + assisted-order route table + production composition
//       + AssistedOrderService + AssistedOrderFinanceService + SupabaseAssistedOrderRepository
//       + SupabaseStatusRecoveryStore (/status) + postgrest-js -> PostgREST v14.13 -> PG 17.6 (service_role JWT).
// Substitutions (printed): requireSupabaseAdmin -> header stand-in stamping adminAuthUserId; member auth -> header
//   stand-in; manual ledger authority -> SYNTHETIC ledger (production composes null); outbox/audit -> in-memory sinks
//   that copy production dedupe semantics (outbox: duplicate event key = already queued; durable audit: identical
//   replay ok, conflicting duplicate throws), with one-shot failure injection; verifier grants inserted via SQL.
process.env.RESEARCH_ACCESS_PASSWORD = "review-local-gateway";
process.env.RESEARCH_SESSION_SECRET = "review-local-session-secret-0123456789";
delete process.env.RESEARCH_PUBLIC;
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
import { SupabaseStatusRecoveryStore } from "file:///C:/xenios-wt/closeout-review/server/research/status-recovery/supabase-store.ts";
import { assistedOrderPaymentStatusCopy } from "file:///C:/xenios-wt/closeout-review/shared/research/assisted-order/payment-status-copy.ts";
const { registerResearchApi } = await import("file:///C:/xenios-wt/closeout-review/server/research/index.ts");

const REST = "http://127.0.0.1:38431";
const SECRET = fs.readFileSync(process.argv[2], "utf8").trim();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(role) { const n = Math.floor(Date.now() / 1000); const h = b64({ alg: "HS256", typ: "JWT" }); const p = b64({ role, iat: n, exp: n + 3600 }); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; }
const client = (role) => new PostgrestClient(REST, { headers: { Authorization: `Bearer ${jwt(role)}` } });
const sr = client("service_role");
const psql = (sql) => execSync(`docker exec claude-hl12-pg psql -U supabase_admin -h 127.0.0.1 -d postgres -tAc ${JSON.stringify(sql)}`, { env: { ...process.env, MSYS_NO_PATHCONV: "1" } }).toString().trim();
const psqlTry = (sql) => { try { return "OK " + psql(sql); } catch (e) { return "ERR " + String(e.stderr ?? e.message).split("\n").filter((l) => /ERROR|DETAIL/.test(l)).join(" | ").slice(0, 240); } };
const rollbacks = () => Number(psql("select xact_rollback from pg_stat_database where datname='postgres'"));
const hex = () => crypto.randomBytes(32).toString("hex");

// SYNTHETIC independent ledger. permissive=true simulates an adapter that does not bind evidence to one request.
const ledger = new Map(); let permissive = false;
const synthLedger = { verify: async (i) => { const e = ledger.get(i.evidenceRef); if (!e) return null; if (permissive) return { observedAt: e.observedAt }; const ok = e.requestId === i.requestId && e.quoteId === i.quoteId && e.amount === i.observedAmountCents && e.currency === i.observedCurrency && e.reference === i.paymentReference; return ok ? { observedAt: e.observedAt } : null; } };

const outbox = new Map(); const audit = new Map(); let failOutboxOnce = false; let failAuditOnce = false;
const outboxSink = { enqueue: async (i) => { if (failOutboxOnce) { failOutboxOnce = false; throw new Error("injected outbox outage"); } if (!outbox.has(i.dedupeKey)) outbox.set(i.dedupeKey, i); } };
const auditSink = { record: async (e) => { if (failAuditOnce) { failAuditOnce = false; throw new Error("injected audit outage"); } const s = JSON.stringify(e); if (audit.has(e.eventId)) { if (audit.get(e.eventId) !== s) throw new Error("conflicting_duplicate"); return; } audit.set(e.eventId, s); } };
const verificationEffects = (requestId) => ({ outbox: [...outbox.values()].filter((i) => i.requestId === requestId && i.dedupeKey.includes(":payment-verification:")).length, audit: [...audit.values()].map((s) => JSON.parse(s)).filter((e) => e.requestId === requestId && e.evidence?.authorityEvidenceKinds?.includes?.("payment_verification")).length, message: [...outbox.values()].find((i) => i.requestId === requestId && i.dedupeKey.includes(":payment-verification:"))?.payload?.customerMessage ?? null });

function build(manualEvidence) {
  const composition = createAssistedOrderProductionComposition({
    enabled: true, auditMode: "log_line_nondurable",
    legal: { requiredAgreements: async () => [] }, submissionStanding: { accepted: async () => true },
    catalog: { list: async () => { throw new Error("unused"); }, resolveLine: async () => { throw new Error("unused"); } },
    repository: new SupabaseAssistedOrderRepository(sr), outbox: outboxSink,
    audit: auditSink, documents: {}, adminNotificationEmail: "founder@example.invalid",
  });
  const finance = new AssistedOrderFinanceService(sr, manualEvidence);
  const viewers = createAssistedOrderViewerResolvers({
    resolveMember: async (req) => { const id = req.headers["x-probe-member"]; return typeof id === "string" ? { id, authUserId: crypto.randomUUID(), email: "member@example.invalid" } : null; },
    earlyAccess: () => null, earlyAccessBindings: () => null, adminEmail: () => "founder@example.invalid",
  });
  const routes = createAssistedOrderRouteTable(composition.service, viewers, null, finance);
  const app = express(); app.use(express.json());
  registerResearchApi(app); // REAL /api/research gateway wall, registered before the assisted-order doors as in server/index.ts
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
  return { status: r.status, code: j?.code ?? j?.error ?? (j?.message === "Access required." ? "WALLED" : null), data: j };
}
const out = []; const rec = (c, r) => { out.push({ case: c, result: r }); console.log("CASE", JSON.stringify({ case: c, result: r })); };
let n = 0; const ref = () => "XRR-20260930-" + (0xF100000000 + ++n).toString(16).toUpperCase();
async function seed(member, { unit = 5000, qty = 2, guestHash = null } = {}) {
  const id = crypto.randomUUID(); const r = ref();
  const { error } = await sr.rpc("research_assisted_order_submit", { p_request: {
    requestId: id, publicReference: r, idempotencyKeyHash: "h-" + r, requestFingerprint: "fp-" + r, actorMemberId: member, earlyAccessSessionHash: guestHash,
    normalizedEmail: "probe@example.invalid", fullLegalName: "Probe Customer", mobilePhone: "+15125550100",
    shippingAddress: { line1: "1 Test", city: "Austin", region: "TX", postalCode: "78704", countryCode: "US" },
    billingAddress: { line1: "1 Test", city: "Austin", region: "TX", postalCode: "78704", countryCode: "US" },
    ageConfirmed: true, agreements: [], estimatedTotalCents: unit * qty, currency: "USD", source: "early_access_manual_order_bridge",
    statusTokenHash: crypto.createHash("sha256").update("tok-" + r).digest("hex"), createdAt: new Date().toISOString(),
    lines: [{ lineId: crypto.randomUUID(), productId: "pc-prod-1", variantId: "pc-var-1", productName: "BPC-157", quantity: qty, minimumQuantity: 1, quantityIncrement: 1,
      workflowMode: "direct_order_request", customerActionLabel: "Request order", unitPriceCents: unit, lineEstimateCents: unit * qty,
      currency: "USD", catalogVersion: "v1", authoritativeFingerprint: "fp-line-" + r }] } });
  if (error) throw new Error("seed " + error.code + " " + error.message);
  return { id, ref: r, member, lineId: psql(`select id from public.research_assisted_order_lines where request_id='${id}'`) };
}
const status = (id) => psql(`select status from public.research_assisted_order_requests where id='${id}'`);
const counts = (id) => psql(`select (select count(*) from public.research_assisted_order_payment_verifications where request_id='${id}')||'/'||(select count(*) from public.research_assisted_order_events where request_id='${id}' and status='paid')`);
const inFuture = (s) => new Date(Date.now() + s * 1000).toISOString();

const MEMBER = crypto.randomUUID(), OTHER = crypto.randomUUID(), ADMIN = crypto.randomUUID(), ADMIN_NOGRANT = crypto.randomUUID(), ADMIN_B = crypto.randomUUID();
psql(`insert into public.research_assisted_order_payment_verifier_grants(auth_user_id, actor_label, granted_by) values ('${ADMIN}','finance-a@example.invalid','claude-probe'),('${ADMIN_B}','finance-b@example.invalid','claude-probe')`);
const prod = await listen(build(null));
const synth = await listen(build(synthLedger));
const B = synth.base;
const admin = (method, path, body, who = ADMIN, base = B) => call(base, method, `/api/admin/research/assisted-orders${path}`, { admin: who, body });
const patch = (o, st, evidence) => admin("PATCH", `/${o.id}/status`, { status: st, ...(evidence ? { evidence } : {}) });
async function toQuoted(o, base = B) { await admin("PATCH", `/${o.id}/status`, { status: "reviewing" }, ADMIN, base); return admin("POST", `/${o.id}/quote`, { lineDecisions: [{ lineId: o.lineId }], validUntil: inFuture(7 * 86400) }, ADMIN, base); }
const custQuote = (o, opts) => call(B, "GET", `/api/research/early-access/assisted-orders/${o.ref}/quote`, opts);
const custAccept = (o, q, opts) => call(B, "POST", `/api/research/early-access/assisted-orders/${o.ref}/quote/accept`, { ...opts, body: { quoteId: q.quoteId, version: q.version, expectedTotalCents: q.totalCents } });
async function toReview(o) { for (const st of ["payment_pending", "payment_review"]) await patch(o, st); }
function ledgerEntry(o, quoteId, amount = 10000, currency = "USD", ev = null) { const key = ev ?? "ledger-" + o.ref; if (!ledger.has(key)) ledger.set(key, { requestId: o.id, quoteId, amount, currency, reference: o.ref, observedAt: new Date(Date.now() - 60000).toISOString() }); return key; }
async function observe(o, quoteId, amount = 10000, currency = "USD", ev = null, who = ADMIN, extra = {}) {
  const key = ledgerEntry(o, quoteId, amount, currency, ev);
  return admin("POST", `/${o.id}/payment-observations/manual`, { quoteId, observedAmountCents: amount, observedCurrency: currency, paymentReference: o.ref, sourceEvidenceRef: key, ...extra }, who);
}
const verify = (o, obsId, who = ADMIN) => admin("POST", `/${o.id}/payment-observations/${obsId}/verify`, undefined, who);
async function accepted(member = MEMBER) { const o = await seed(member); await toQuoted(o); const q = (await custQuote(o, { member })).data; await custAccept(o, q, { member }); await toReview(o); return { o, quoteId: q.quoteId }; }
async function paidOrder() { const { o, quoteId } = await accepted(); const x = await observe(o, quoteId); const v = await verify(o, x.data?.observationId); return { o, quoteId, obsId: x.data?.observationId, v }; }

// Surfaces: assisted-order status API (as the page renders it) and /status (P-17 store view).
function pageCopy(view) {
  const cur = assistedOrderPaymentStatusCopy(view.status, view.paymentVerified)?.label ?? `[non-financial:${view.status}]`;
  const paidEntry = (view.timeline ?? []).filter((e) => e.status === "paid").map((e) => assistedOrderPaymentStatusCopy(e.status, view.paymentVerified)?.label);
  return { status: view.status, paymentVerified: view.paymentVerified ?? "(absent)", current: cur, paidTimelineEntry: paidEntry[0] ?? null, actionRequiredShown: assistedOrderPaymentStatusCopy(view.status, view.paymentVerified) ? null : (view.actionRequired ?? null) };
}
async function recovery(o) {
  const store = new SupabaseStatusRecoveryStore(sr); const tok = hex(), sess = hex(); const now = new Date();
  const b = await store.prepareDelivery({ subjectType: "assisted_order", subjectId: o.id, ownerId: o.member, idempotencyKey: hex(), tokenDigest: tok, createdAt: now.toISOString(), expiresAt: new Date(+now + 600000).toISOString(), source: "public_status_recovery" });
  if (!b) return "prepare refused";
  const ok = await store.exchange({ tokenDigest: tok, sessionDigest: sess, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() });
  if (!ok) return "exchange refused";
  const v = await store.getStatus(sess, new Date().toISOString());
  const paidEntry = (v?.timeline ?? []).find((t) => /Payment/.test(t.status) && /verif|record/i.test(t.status + (t.customerMessage ?? "")));
  return { current: v?.label ?? v?.statusLabel ?? null, timeline: (v?.timeline ?? []).map((t) => t.status) };
}
async function surfaces(label, o) {
  const page = await call(B, "GET", `/api/research/early-access/assisted-orders/${o.ref}`, { member: o.member });
  rec(label, { assistedOrderPage: page.status === 200 ? pageCopy(page.data) : { http: page.status, code: page.code }, statusRecovery: await recovery(o), notification: verificationEffects(o.id).message });
}

const r0 = rollbacks();
console.log("SUBSTITUTIONS", JSON.stringify(["requireSupabaseAdmin -> header stand-in stamping adminAuthUserId", "member auth -> header stand-in", "manual ledger authority -> SYNTHETIC ledger (production composes null)", "outbox/audit -> in-memory sinks with production dedupe semantics + one-shot failure injection", "verifier grants inserted directly in SQL (no grant route exists)", "gateway REAL, non-public mode, no review cookie/bearer"]));

// ---- S / F2 / F10: successful composed path through the real gateway ------------------------------------------
const s = await seed(MEMBER);
const q = await toQuoted(s); rec("S1 admin issues quote", { status: q.status, total: q.data?.totalCents, version: q.data?.version });
const g = await custQuote(s, { member: MEMBER }); rec("S2/F10 owner GET quote via real gateway (non-public)", { status: g.status, code: g.code, total: g.data?.totalCents });
const gt = await custQuote(s, { token: "tok-" + s.ref }); rec("S2b/F10 status-token holder GET quote via gateway", { status: gt.status, code: gt.code });
const a = await custAccept(s, g.data, { member: MEMBER }); rec("S3/F10 owner POST accept via gateway", { status: a.status, code: a.code, acceptanceId: Boolean(a.data?.acceptanceId), replayed: a.data?.replayed });
await toReview(s); await surfaces("F7-a payment_review, no observation", s);
const ob = await observe(s, g.data?.quoteId); rec("S4 granted admin records manual observation", { status: ob.status, replayed: ob.data?.replayed });
await surfaces("F7-b payment_review, unverified observation", s);
const v = await verify(s, ob.data?.observationId);
rec("S5/F4 verify -> paid", { status: v.status, state: v.data?.state, replayed: v.data?.replayed, requestStatus: status(s.id), verifications_paidEvents: counts(s.id), effects: verificationEffects(s.id) });
const v2 = await verify(s, ob.data?.observationId);
rec("S6/F4 identical retry", { status: v2.status, replayed: v2.data?.replayed, verifications_paidEvents: counts(s.id), effects: verificationEffects(s.id) });
await surfaces("F7-c verified paid", s);
const f = await patch(s, "supplier_processing", { supplierAssignmentId: "assign-1" });
rec("S7/F2 verified paid -> supplier_processing via mounted route", { status: f.status, code: f.code, requestStatus: status(s.id) });
await surfaces("F7-d supplier_processing after VERIFIED paid", s);
const v3 = await verify(s, ob.data?.observationId);
rec("S8/F4 verify replay after fulfillment progression", { status: v3.status, state: v3.data?.state, replayed: v3.data?.replayed, effects: verificationEffects(s.id) });

// ---- F2 historical ---------------------------------------------------------------------------------------------
const h = await seed(MEMBER);
psql(`alter table public.research_assisted_order_requests disable trigger user; alter table public.research_assisted_order_events disable trigger user; update public.research_assisted_order_requests set status='paid' where id='${h.id}'; insert into public.research_assisted_order_events(request_id,status,actor_type,actor_id,customer_message) values ('${h.id}','paid','admin','legacy','Payment received. Thank you!'); alter table public.research_assisted_order_requests enable trigger user; alter table public.research_assisted_order_events enable trigger user;`);
rec("H1/F2 historical paid (no verification) -> supplier_processing (HTTP)", await patch(h, "supplier_processing", { supplierAssignmentId: "assign-h" }).then((r) => ({ status: r.status, code: r.code, requestStatus: status(h.id) })));
const hs = await sr.rpc("research_assisted_order_set_status", { p_request_id: h.id, p_expected_status: "paid", p_new_status: "supplier_processing", p_actor_id: "x", p_actor_type: "admin", p_evidence: { supplierAssignmentId: "a" } });
rec("H1b same at SQL", hs.error ? "REFUSED " + hs.error.code + " " + (hs.error.details || "") : "ACCEPTED");
rec("H1c historical paid -> cancelled (HTTP)", await patch(h, "cancelled", { cancellationReason: "refund issued" }).then((r) => ({ status: r.status, code: r.code })));
await surfaces("F7-e historical paid label, no verification", h);
const h2 = await seed(MEMBER);
psql(`alter table public.research_assisted_order_requests disable trigger user; alter table public.research_assisted_order_events disable trigger user; update public.research_assisted_order_requests set status='supplier_processing' where id='${h2.id}'; insert into public.research_assisted_order_events(request_id,status,actor_type,actor_id,customer_message) values ('${h2.id}','paid','admin','legacy','Payment received.'),('${h2.id}','supplier_processing','admin','legacy',null); alter table public.research_assisted_order_requests enable trigger user; alter table public.research_assisted_order_events enable trigger user;`);
await surfaces("F7-f historical supplier_processing that passed through UNVERIFIED paid", h2);

// ---- F4 interruption -------------------------------------------------------------------------------------------
{ const { o, quoteId } = await accepted(); const x = await observe(o, quoteId);
  failOutboxOnce = true; const i1 = await verify(o, x.data?.observationId);
  rec("I1/F4 outbox outage after SQL paid commit", { status: i1.status, code: i1.code, requestStatus: status(o.id), verifications_paidEvents: counts(o.id), effects: verificationEffects(o.id) });
  const i2 = await verify(o, x.data?.observationId);
  rec("I2/F4 explicit admin retry repairs effects once", { status: i2.status, replayed: i2.data?.replayed, verifications_paidEvents: counts(o.id), effects: verificationEffects(o.id) });
  const i2b = await verify(o, x.data?.observationId); rec("I2b/F4 further retry, no duplicate", { status: i2b.status, effects: verificationEffects(o.id) }); }
{ const { o, quoteId } = await accepted(); const x = await observe(o, quoteId);
  failAuditOnce = true; const i3 = await verify(o, x.data?.observationId);
  rec("I3/F4 audit outage after SQL paid commit (nobody retries yet)", { status: i3.status, code: i3.code, requestStatus: status(o.id), effects: verificationEffects(o.id) });
  const i4 = await verify(o, x.data?.observationId); rec("I4/F4 retry", { status: i4.status, effects: verificationEffects(o.id) }); }

// ---- F3 correction ---------------------------------------------------------------------------------------------
{ const { o, quoteId } = await accepted(); const bad = await observe(o, quoteId, 9999, "USD", "ledger-bad-" + o.ref);
  const bv = await verify(o, bad.data?.observationId);
  const fix = await observe(o, quoteId, 10000, "USD", "ledger-fix-" + o.ref, ADMIN, { supersedesObservationId: bad.data?.observationId, correctionReason: "Keyed the wrong amount from the statement" });
  rec("F3-a wrong-amount observation, verify refused, governed correction", { badObserve: bad.status, badVerify: [bv.status, bv.code], correction: { status: fix.status, code: fix.code, supersedes: fix.data?.supersedes === bad.data?.observationId, replayed: fix.data?.replayed } });
  const fixReplay = await observe(o, quoteId, 10000, "USD", "ledger-fix-" + o.ref, ADMIN, { supersedesObservationId: bad.data?.observationId, correctionReason: "Keyed the wrong amount from the statement" });
  const fixConflict = await observe(o, quoteId, 10000, "USD", "ledger-fix-" + o.ref, ADMIN, { supersedesObservationId: bad.data?.observationId, correctionReason: "A different reason" });
  rec("F3-b correction replay / changed replay", { replay: [fixReplay.status, fixReplay.data?.replayed], changed: [fixConflict.status, fixConflict.code] });
  const oldV = await verify(o, bad.data?.observationId); const newV = await verify(o, fix.data?.observationId);
  rec("F3-c verify superseded vs replacement", { superseded: [oldV.status, oldV.code], replacement: [newV.status, newV.data?.state], verifications_paidEvents: counts(o.id),
    history: psql(`select (select count(*) from public.research_assisted_order_payment_observations where request_id='${o.id}')||' observations, '||(select count(*) from public.research_assisted_order_observation_corrections c join public.research_assisted_order_payment_observations p on p.id=c.observation_id where p.request_id='${o.id}')||' corrections'`) });
  const again = await observe(o, quoteId, 10000, "USD", "ledger-fix2-" + o.ref, ADMIN, { supersedesObservationId: fix.data?.observationId, correctionReason: "Try to rewrite the verified record" });
  rec("F3-d correct a VERIFIED observation", { status: again.status, code: again.code });
  rec("F3-e owner UPDATE of verified observation (DB immutability)", psqlTry(`update public.research_assisted_order_payment_observations set observed_amount_cents=1 where id='${fix.data?.observationId}'`));
  rec("F3-f owner DELETE of correction row", psqlTry(`delete from public.research_assisted_order_observation_corrections where replacement_id='${fix.data?.observationId}'`)); }
{ const { o, quoteId } = await accepted(); const bad = await observe(o, quoteId, 9999, "USD", "ledger-bad2-" + o.ref);
  const byB = await observe(o, quoteId, 10000, "USD", "ledger-fixB-" + o.ref, ADMIN_B, { supersedesObservationId: bad.data?.observationId, correctionReason: "Other admin corrects" });
  const short = await observe(o, quoteId, 10000, "USD", "ledger-fixS-" + o.ref, ADMIN, { supersedesObservationId: bad.data?.observationId, correctionReason: "ab" });
  rec("F3-g correction by a different granted admin / 2-char reason", { otherAdmin: [byB.status, byB.code], shortReason: [short.status, short.code] }); }

// ---- F5 single-use evidence -------------------------------------------------------------------------------------
{ const one = await accepted(); const two = await accepted(); const shared = "BANK-TXN-SHARED-0001";
  ledger.set(shared, { requestId: one.o.id, quoteId: one.quoteId, amount: 10000, currency: "USD", reference: one.o.ref, observedAt: new Date(Date.now() - 60000).toISOString() });
  const x1 = await observe(one.o, one.quoteId, 10000, "USD", shared);
  permissive = true;
  const x2 = await admin("POST", `/${two.o.id}/payment-observations/manual`, { quoteId: two.quoteId, observedAmountCents: 10000, observedCurrency: "USD", paymentReference: two.o.ref, sourceEvidenceRef: shared });
  permissive = false;
  rec("F5-a same evidence on a second order through HTTP (permissive ledger)", { first: x1.status, second: [x2.status, x2.code] });
  const sqlObs = (ev) => sr.rpc("research_assisted_order_payment_observe", { p_request_id: two.o.id, p_quote_id: two.quoteId, p_method: "manual", p_observed_amount_cents: 10000, p_observed_currency: "USD", p_payment_reference: two.o.ref, p_source_evidence_ref: ev, p_observed_at: new Date().toISOString(), p_actor_auth_user_id: ADMIN }).then((r) => r.error ? "REFUSED " + r.error.code + " " + (r.error.details || "") : "ACCEPTED");
  rec("F5-b SQL alone, exact same evidence", await sqlObs(shared));
  rec("F5-c SQL, surrounding whitespace", await sqlObs("  " + shared + "  "));
  rec("F5-d SQL, lowercase variant", await sqlObs(shared.toLowerCase()));
  rec("F5-e SQL, internal whitespace variant (fresh order)", await (async () => { const t = await accepted(); return sr.rpc("research_assisted_order_payment_observe", { p_request_id: t.o.id, p_quote_id: t.quoteId, p_method: "manual", p_observed_amount_cents: 10000, p_observed_currency: "USD", p_payment_reference: t.o.ref, p_source_evidence_ref: "BANK-TXN-SHARED- 0001", p_observed_at: new Date().toISOString(), p_actor_auth_user_id: ADMIN }).then((r) => r.error ? "REFUSED " + r.error.code + " " + (r.error.details || "") : "ACCEPTED"); })()); }
{ const A = await accepted(); const Bo = await accepted(); const wrong = "BANK-TXN-BELONGS-TO-B";
  const eA = await sr.rpc("research_assisted_order_payment_observe", { p_request_id: A.o.id, p_quote_id: A.quoteId, p_method: "manual", p_observed_amount_cents: 10000, p_observed_currency: "USD", p_payment_reference: A.o.ref, p_source_evidence_ref: wrong, p_observed_at: new Date().toISOString(), p_actor_auth_user_id: ADMIN });
  const cA = await sr.rpc("research_assisted_order_payment_correct_manual", { p_request_id: A.o.id, p_observation_id: eA.data?.observationId, p_actor_auth_user_id: ADMIN, p_quote_id: A.quoteId, p_payment_reference: A.o.ref, p_observed_amount_cents: 10000, p_observed_currency: "USD", p_source_evidence_ref: "BANK-TXN-REALLY-A", p_observed_at: new Date().toISOString(), p_reason: "Evidence was assigned to the wrong order" });
  const bB = await sr.rpc("research_assisted_order_payment_observe", { p_request_id: Bo.o.id, p_quote_id: Bo.quoteId, p_method: "manual", p_observed_amount_cents: 10000, p_observed_currency: "USD", p_payment_reference: Bo.o.ref, p_source_evidence_ref: wrong, p_observed_at: new Date().toISOString(), p_actor_auth_user_id: ADMIN });
  rec("F5-f claim from a CORRECTED mis-assignment still blocks the rightful order", { wrongOnA: eA.error ? eA.error.details : "recorded", correctedOnA: cA.error ? cA.error.details : "replacement recorded", rightfulOrderB: bB.error ? "REFUSED " + bB.error.details : "ACCEPTED" }); }

// ---- F6 / F8 cancellation --------------------------------------------------------------------------------------
{ const c1 = await seed(MEMBER); await patch(c1, "reviewing"); await patch(c1, "payment_pending");
  rec("C1 payment_pending, no observation -> cancel", (await patch(c1, "cancelled", { cancellationReason: "customer withdrew" })).status);
  const { o, quoteId } = await accepted(); await observe(o, quoteId);
  rec("C2/F6 payment_review with observation -> cancel (HTTP free text)", await patch(o, "cancelled", { cancellationReason: "changed mind" }).then((r) => ({ status: r.status, code: r.code, requestStatus: status(o.id) })));
  const c2s = await sr.rpc("research_assisted_order_set_status", { p_request_id: o.id, p_expected_status: "payment_review", p_new_status: "cancelled", p_actor_id: "x", p_actor_type: "admin", p_evidence: { cancellationReason: "changed mind" } });
  rec("C2b/F6 same at SQL", c2s.error ? "REFUSED " + c2s.error.code + " " + (c2s.error.details || "") : "ACCEPTED");
  const r = await seed(MEMBER); const rq = await toQuoted(r); const rg = (await custQuote(r, { member: MEMBER })).data; await custAccept(r, rg, { member: MEMBER });
  const robs = await observe(r, rg.quoteId);
  rec("C2c/F6 observation recorded while still 'reviewing', then cancel from reviewing (HTTP)", await patch(r, "cancelled", { cancellationReason: "free text" }).then((x) => ({ observe: robs.status, status: x.status, code: x.code, requestStatus: status(r.id) })));
  rec("C3/F6/F8 cancel verified supplier_processing order (HTTP)", await patch(s, "cancelled", { cancellationReason: "refund issued" }).then((x) => ({ status: x.status, code: x.code })));
  const vp = await paidOrder(); rec("C3b/F6 cancel verified PAID order (HTTP)", await patch(vp.o, "cancelled", { cancellationReason: "refund issued" }).then((x) => ({ status: x.status, code: x.code }))); }

// ---- F9 policy / verifier checks -------------------------------------------------------------------------------
{ const { o, quoteId } = await accepted(); const x = await observe(o, quoteId);
  rec("F9 different granted admin verifies (observer != verifier)", await verify(o, x.data?.observationId, ADMIN_B).then((r) => ({ status: r.status, code: r.code })));
  rec("N11 guarded admin without grant verifies", await verify(o, x.data?.observationId, ADMIN_NOGRANT).then((r) => ({ status: r.status, code: r.code })));
  const rb = rollbacks(); const [c1, c2] = await Promise.all([1, 2].map(() => verify(o, x.data?.observationId)));
  rec("N20 two concurrent identical verifies", { a: [c1.status, c1.data?.replayed], b: [c2.status, c2.data?.replayed], verifications_paidEvents: counts(o.id), effects: verificationEffects(o.id), rollbackDelta: rollbacks() - rb }); }
{ const { o, quoteId } = await accepted(); const x = await observe(o, quoteId); ledgerEntry(o, quoteId, 10000, "USD", "ledger-race-" + o.ref);
  const [vr, cr] = await Promise.all([verify(o, x.data?.observationId), observe(o, quoteId, 10000, "USD", "ledger-race-" + o.ref, ADMIN, { supersedesObservationId: x.data?.observationId, correctionReason: "Race the verification" })]);
  rec("N22 concurrent verify(original) vs correct(original)", { verify: [vr.status, vr.code], correct: [cr.status, cr.code], verifications_paidEvents: counts(o.id), requestStatus: status(o.id) }); }

// ---- F10 gateway negatives (non-public mode, no review credential) -------------------------------------------
{ const o = await seed(MEMBER); await toQuoted(o); const base = `/api/research/early-access/assisted-orders/${o.ref}`;
  const probes = [["GET", base + "/quote/"], ["GET", base.toLowerCase() + "/quote"], ["GET", base + "/QUOTE"], ["GET", base + "//quote"], ["GET", base + "%2Fquote"], ["POST", base + "/quote"], ["GET", base + "/quote/accept"], ["POST", base + "/quote/accept/x"], ["POST", base + "/quote/accept/"], ["GET", base + "/quote?x=1"], ["GET", base + "/quote/../quote"], ["PUT", base + "/quote/accept"]];
  const res = {}; for (const [m, p] of probes) { const r = await call(B, m, p, { member: MEMBER }); res[`${m} ${p.replace(o.ref, "<REF>").replace(o.ref.toLowerCase(), "<ref>")}`] = `${r.status} ${r.code ?? ""}`.trim(); }
  rec("F10-neg gateway admission of lookalike paths (member header only)", res);
  rec("F10-own foreign member / no credential via gateway", { foreignGet: (await custQuote(o, { member: OTHER })).status, noCredGet: (await custQuote(o, {})).status, foreignAccept: (await call(B, "POST", base + "/quote/accept", { member: OTHER, body: { quoteId: crypto.randomUUID(), version: 1, expectedTotalCents: 10000 } })).status }); }

// ---- AUTH-01 --------------------------------------------------------------------------------------------------
{ const guestHash = hex(); const gq = await seed(null, { guestHash }); await toQuoted(gq); const quoteId = psql(`select id from public.research_assisted_order_quotes where request_id='${gq.id}'`);
  const acc = (m, sess) => sr.rpc("research_assisted_order_quote_accept", { p_quote_id: quoteId, p_version: 1, p_expected_total_cents: 10000, p_member_id: m, p_early_access_session_hash: sess, p_status_token_hash: null }).then((r) => r.error ? "ERR " + r.error.code : (r.data === null ? "NULL (refused)" : "ACCEPTED " + (r.data.replayed ? "replay" : "new")));
  rec("AUTH-01 SQL: unrelated member id on guest (NULL-owner) request", { unrelatedMember: await acc(OTHER, null), wrongSession: await acc(null, hex()), quoteState: psql(`select state from public.research_assisted_order_quotes where id='${quoteId}'`), ownerSession: await acc(null, guestHash) });
  rec("AUTH-01 HTTP: unrelated member via gateway", (await call(B, "POST", `/api/research/early-access/assisted-orders/${gq.ref}/quote/accept`, { member: OTHER, body: { quoteId, version: 1, expectedTotalCents: 10000 } })).status); }

// ---- SQL-01 ---------------------------------------------------------------------------------------------------
{ const { o, quoteId } = await accepted();
  const po = await sr.rpc("research_assisted_order_payment_observe", { p_request_id: o.id, p_quote_id: quoteId, p_method: "provider", p_observed_amount_cents: 10000, p_observed_currency: "USD", p_payment_reference: "pi_forged_by_claude_2", p_source_evidence_ref: "no-real-evidence", p_observed_at: new Date().toISOString(), p_actor_auth_user_id: null, p_provider_name: "anything", p_provider_event_id: "evt_forged_by_claude_2", p_provider_payment_id: "pi_forged_by_claude_2" });
  const pv = po.error ? null : await sr.rpc("research_assisted_order_payment_verify_bound", { p_request_id: o.id, p_observation_id: po.data?.observationId, p_verifier_auth_user_id: null });
  rec("SQL-01 forged provider observe + verify_bound as service_role, 0 grants involved", { observe: po.error ? "REFUSED " + po.error.code + " " + (po.error.details || "") : "ACCEPTED observed_by=" + psql(`select observed_by from public.research_assisted_order_payment_observations where id='${po.data?.observationId}'`), verify: pv ? (pv.error ? "REFUSED " + pv.error.code + " " + (pv.error.details || "") : JSON.stringify(pv.data)) : "n/a", requestStatus: status(o.id), attemptTables: psql(`select coalesce(string_agg(table_name, ','), 'none') from information_schema.tables where table_schema='public' and table_name ~ '(attempt|provider_event|inbox|quarantine)'`) });
  await surfaces("SQL-01 customer surfaces after the forged provider verification", o); }

// ---- ACLs of new projection functions --------------------------------------------------------------------------
for (const role of ["anon", "authenticated"]) {
  const a1 = await client(role).rpc("research_assisted_order_financial_state", { p_request_id: s.id });
  const a2 = await client(role).rpc("research_assisted_order_financial_state_by_reference", { p_public_reference: s.ref });
  const a3 = await client(role).rpc("research_assisted_order_payment_correct_manual", { p_request_id: s.id, p_observation_id: s.id, p_actor_auth_user_id: ADMIN, p_quote_id: s.id, p_payment_reference: s.ref, p_observed_amount_cents: 1, p_observed_currency: "USD", p_source_evidence_ref: "x", p_observed_at: new Date().toISOString(), p_reason: "xyz" });
  rec(`ACL ${role}`, { financial_state: a1.error ? a1.error.code : "ALLOWED", by_reference: a2.error ? a2.error.code : "ALLOWED", correct_manual: a3.error ? a3.error.code : "ALLOWED" });
}
rec("ACL direct table read as service_role (claims/corrections)", { claims: (await sr.from("research_assisted_order_evidence_claims").select("*").limit(1)).error?.code ?? "READABLE", corrections: (await sr.from("research_assisted_order_observation_corrections").select("*").limit(1)).error?.code ?? "READABLE" });

rec("Z rollback delta for whole run", rollbacks() - r0);
for (const x of [prod, synth]) { x.s.close(); x.s.closeAllConnections?.(); }
process.exit(0);
