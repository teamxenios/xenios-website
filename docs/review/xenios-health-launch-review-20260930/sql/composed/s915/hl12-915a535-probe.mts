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
let n = 0; const ref = () => "XRR-20260930-" + (0xF300000000 + ++n).toString(16).toUpperCase();
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
console.log("915a535 targeted cases (same substitutions as the successor probe)");
const legacy = (o, finalStatus, events) => psql(`alter table public.research_assisted_order_requests disable trigger user; alter table public.research_assisted_order_events disable trigger user; update public.research_assisted_order_requests set status='${finalStatus}' where id='${o.id}'; ${events.map((e) => `insert into public.research_assisted_order_events(request_id,status,actor_type,actor_id,customer_message) values ('${o.id}','${e}','admin','legacy',null);`).join(" ")} alter table public.research_assisted_order_requests enable trigger user; alter table public.research_assisted_order_events enable trigger user;`);
const sqlSet = (o, from, to, evidence = {}) => sr.rpc("research_assisted_order_set_status", { p_request_id: o.id, p_expected_status: from, p_new_status: to, p_actor_id: "x", p_actor_type: "admin", p_evidence: evidence }).then((r) => r.error ? "REFUSED " + (r.error.details || r.error.code) : "ACCEPTED");
const NEXT = { paid: ["supplier_processing", { supplierAssignmentId: "assign-h" }], supplier_processing: ["shipped", { trackingId: "TRACK-H" }], shipped: ["delivered", {}], delivered: ["closed", {}] };

// ---- A. historical progression (no verification) --------------------------------------------------------------
for (const [start, events] of [["paid", ["paid"]], ["supplier_processing", ["paid", "supplier_processing"]], ["shipped", ["paid", "supplier_processing", "shipped"]], ["delivered", ["paid", "supplier_processing", "shipped", "delivered"]], ["closed", ["paid", "supplier_processing", "shipped", "delivered", "closed"]]]) {
  const o = await seed(MEMBER); legacy(o, start, events);
  const res = { start };
  if (NEXT[start]) { const [to, ev] = NEXT[start]; const h = await patch(o, to, ev); res.forwardHttp = `${to}: ${h.status} ${h.code ?? ""}`.trim(); res.forwardSql = await sqlSet(o, start, to, ev); }
  const c = await patch(o, "cancelled", { cancellationReason: "legacy cleanup" }); res.cancelHttp = `${c.status} ${c.code ?? ""}`.trim();
  res.finalStatus = status(o.id);
  rec(`A-${start} historical ${start} without verification`, res);
}
{ const o = await seed(MEMBER); legacy(o, "supplier_processing", []);
  rec("A-lost-events supplier_processing with NO events, forward", { http: await patch(o, "shipped", { trackingId: "T" }).then((r) => `${r.status} ${r.code ?? ""}`), sql: await sqlSet(o, "supplier_processing", "shipped", { trackingId: "T" }) }); }
{ const o = await seed(MEMBER); legacy(o, "payment_review", ["paid"]);
  rec("A-regressed payment_review label with a prior paid event", { backToPending: await patch(o, "payment_pending").then((r) => `${r.status} ${r.code ?? ""}`), cancel: await patch(o, "cancelled", { cancellationReason: "x" }).then((r) => `${r.status} ${r.code ?? ""}`), sqlBack: await sqlSet(o, "payment_review", "payment_pending") }); }

// ---- B. verified progression to closed, with surfaces ---------------------------------------------------------
{ const vp = await paidOrder(); const o = vp.o; const steps = {};
  for (const [to, ev] of [["supplier_processing", { supplierAssignmentId: "assign-v" }], ["shipped", { trackingId: "TRACK-V" }], ["delivered", {}], ["closed", {}]]) { const r = await patch(o, to, ev); steps[to] = `${r.status} ${r.code ?? ""}`.trim(); if (to === "shipped") await surfaces("B-F7 verified order at shipped", o); }
  rec("B verified paid -> supplier_processing -> shipped -> delivered -> closed (HTTP)", { verify: vp.v.status, steps, finalStatus: status(o.id) });
  await surfaces("B-F7 verified order at closed", o); }

// ---- C. quote immutability -------------------------------------------------------------------------------------
{ const o = await seed(MEMBER); const q1 = await toQuoted(o); const qid = q1.data?.quoteId;
  const res = {};
  res.issuedTotal = psqlTry(`update public.research_assisted_order_quotes set total_cents = total_cents + 1 where id='${qid}'`);
  res.issuedSupersedeWithAcceptance = psqlTry(`update public.research_assisted_order_quotes set state='superseded', acceptance_id=gen_random_uuid(), accepted_at=now() where id='${qid}'`);
  res.issuedDelete = psqlTry(`delete from public.research_assisted_order_quotes where id='${qid}'`);
  const q = (await custQuote(o, { member: MEMBER })).data; const acc = await custAccept(o, q, { member: MEMBER });
  res.accept = acc.status;
  res.acceptedTotal = psqlTry(`update public.research_assisted_order_quotes set total_cents = 1 where id='${qid}'`);
  res.acceptedToSuperseded = psqlTry(`update public.research_assisted_order_quotes set state='superseded', accepted_at=null, acceptance_id=null where id='${qid}'`);
  res.acceptedAcceptedAt = psqlTry(`update public.research_assisted_order_quotes set accepted_at = accepted_at - interval '1 day' where id='${qid}'`);
  res.acceptedDelete = psqlTry(`delete from public.research_assisted_order_quotes where id='${qid}'`);
  res.serviceRoleUpdate = (await sr.from("research_assisted_order_quotes").update({ total_cents: 1 }).eq("id", qid)).error?.code ?? "ALLOWED";
  res.serviceRoleDelete = (await sr.from("research_assisted_order_quotes").delete().eq("id", qid)).error?.code ?? "ALLOWED";
  res.reissueAfterAcceptance = await admin("POST", `/${o.id}/quote`, { lineDecisions: [{ lineId: o.lineId }], validUntil: inFuture(86400) }).then((r) => `${r.status} ${r.code ?? ""}`.trim());
  res.quoteRowAfter = psql(`select state||' total='||total_cents||' acceptance='||(acceptance_id is not null) from public.research_assisted_order_quotes where id='${qid}'`);
  rec("C quote snapshot immutability (owner role via psql, service_role via PostgREST)", res); }
{ const o = await seed(MEMBER); const q1 = await toQuoted(o); const q2 = await admin("POST", `/${o.id}/quote`, { lineDecisions: [{ lineId: o.lineId }], validUntil: inFuture(86400) });
  rec("C2 legitimate re-issue supersedes v1 (issued -> superseded still allowed)", { v2: [q2.status, q2.data?.version], states: psql(`select string_agg(version||':'||state, ',' order by version) from public.research_assisted_order_quotes where request_id='${o.id}'`) }); }
{ const o = await seed(MEMBER); await toQuoted(o); await patch(o, "payment_pending"); const q = (await custQuote(o, { member: MEMBER })).data;
  await patch(o, "cancelled", { cancellationReason: "customer withdrew" });
  const acc = await custAccept(o, q, { member: MEMBER });
  const sqlAcc = await sr.rpc("research_assisted_order_quote_accept", { p_quote_id: q.quoteId, p_version: q.version, p_expected_total_cents: q.totalCents, p_member_id: MEMBER, p_early_access_session_hash: null, p_status_token_hash: null });
  rec("C3/SQL-13 accept an issued quote on a CANCELLED request", { http: [acc.status, acc.code], sql: sqlAcc.error ? "REFUSED " + sqlAcc.error.details : "ACCEPTED", quoteState: psql(`select state from public.research_assisted_order_quotes where id='${q.quoteId}'`) }); }

// ---- D. accept vs cancel races ---------------------------------------------------------------------------------
{ const outcomes = [];
  for (let i = 0; i < 8; i++) {
    const o = await seed(MEMBER); await toQuoted(o); await patch(o, "payment_pending"); const q = (await custQuote(o, { member: MEMBER })).data;
    const [acc, can] = await Promise.all([custAccept(o, q, { member: MEMBER }), patch(o, "cancelled", { cancellationReason: "race" })]);
    const row = psql(`select r.status||'|'||q.state||'|'||coalesce(to_char(q.accepted_at,'HH24:MI:SS.US'),'-')||'|'||coalesce((select to_char(min(e.occurred_at),'HH24:MI:SS.US') from public.research_assisted_order_events e where e.request_id=r.id and e.status='cancelled'),'-') from public.research_assisted_order_requests r join public.research_assisted_order_quotes q on q.request_id=r.id where r.id='${o.id}'`);
    const [rs, qs, at, ct] = row.split("|");
    outcomes.push({ accept: acc.status, cancel: can.status, request: rs, quote: qs, acceptedBeforeCancel: qs === "accepted" && rs === "cancelled" ? at < ct : null });
  }
  rec("D accept vs cancel concurrent x8", { outcomes, anyAcceptedAfterCancelCommit: outcomes.some((x) => x.acceptedBeforeCancel === false) }); }

// ---- E. HIST-02 first quote for payment-stage rows ---------------------------------------------------------------
for (const stage of ["payment_pending", "payment_review"]) {
  const o = await seed(MEMBER); await patch(o, "reviewing"); await patch(o, "payment_pending"); if (stage === "payment_review") await patch(o, "payment_review");
  const qi = await admin("POST", `/${o.id}/quote`, { lineDecisions: [{ lineId: o.lineId }], validUntil: inFuture(86400) });
  rec(`E/HIST-02 first quote for an existing ${stage} order`, { status: qi.status, code: qi.code, requestStatus: status(o.id) });
}

// ---- F. F4 with a revoked grant ----------------------------------------------------------------------------------
{ const G = crypto.randomUUID(); psql(`insert into public.research_assisted_order_payment_verifier_grants(auth_user_id, actor_label, granted_by) values ('${G}','finance-d@example.invalid','claude-probe')`);
  const { o, quoteId } = await accepted(); const x = await observe(o, quoteId, 10000, "USD", null, G);
  failOutboxOnce = true; const v1 = await verify(o, x.data?.observationId, G);
  psql(`update public.research_assisted_order_payment_verifier_grants set revoked_at = now() where auth_user_id='${G}'`);
  const v2 = await verify(o, x.data?.observationId, G); const v3 = await verify(o, x.data?.observationId, ADMIN);
  rec("F/F4 effects interrupted then observer grant revoked", { first: [v1.status, v1.code], retryRevoked: [v2.status, v2.code], retryOtherAdmin: [v3.status, v3.code], requestStatus: status(o.id), effects: verificationEffects(o.id), durableObligationTables: psql(`select coalesce(string_agg(table_name, ','), 'none') from information_schema.tables where table_schema='public' and table_name ~ '(effect|pending_effect|reconcil)'`) }); }

// ---- G. app-before-024018-and-230541 (financial_state absent) -----------------------------------------------------
{ const c = await seed(MEMBER); await patch(c, "reviewing"); await patch(c, "payment_pending");
  psql("alter function public.research_assisted_order_financial_state(uuid) rename to research_assisted_order_financial_state_hidden");
  psql("notify pgrst, 'reload schema'"); await new Promise((r) => setTimeout(r, 3000));
  const cx = await patch(c, "cancelled", { cancellationReason: "customer withdrew" });
  rec("G/ROLL-06 cancel payment_pending when financial_state is absent", { status: cx.status, code: cx.code, requestStatus: status(c.id) });
  psql("alter function public.research_assisted_order_financial_state_hidden(uuid) rename to research_assisted_order_financial_state"); psql("notify pgrst, 'reload schema'"); await new Promise((r) => setTimeout(r, 2000)); }

// ---- H. TRUNCATE (last: destructive if unguarded) ----------------------------------------------------------------
rec("H1 owner TRUNCATE quotes", psqlTry("truncate public.research_assisted_order_quotes"));
rec("H2 owner TRUNCATE requests CASCADE", psqlTry("truncate public.research_assisted_order_requests cascade"));
rec("H3 quote rows still present", psql("select count(*) from public.research_assisted_order_quotes"));
rec("Z rollback delta", rollbacks() - r0);
for (const x of [prod, synth]) { x.s.close(); x.s.closeAllConnections?.(); }
process.exit(0);
