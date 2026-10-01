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
import { resolveAssistedOrderAuditAuthority, ASSISTED_ORDER_AUDIT_SCHEMA_VERSION, ASSISTED_ORDER_AUDIT_ATTESTATION } from "file:///C:/xenios-wt/closeout-review/server/research/assisted-order/audit-store.ts";
import { resolvePaymentEffectsRecovery, paymentEffectDispatchAllowed } from "file:///C:/xenios-wt/closeout-review/server/research/assisted-order/payment-effects.ts";
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
const verificationEffects = (requestId) => { const r = psql(`select coalesce(string_agg(o.status || ':' || (public.research_assisted_order_payment_effects_audit_receipt(v.id) is not null)::text, ',' order by v.verified_at), 'none') from public.research_assisted_order_payment_verifications v left join public.research_notification_outbox o on o.assisted_order_verification_id = v.id where v.request_id = '${requestId}'`); return { outboxStatus_auditReceipt: r, message: psql(`select coalesce(max(o.payload->>'customerMessage'), max(o.payload->>'status'), '-') from public.research_assisted_order_payment_verifications v join public.research_notification_outbox o on o.assisted_order_verification_id = v.id where v.request_id = '${requestId}'`) }; };

let failEffectsCompleteOnce = false;
const effectsRpc = { rpc: (name, args) => { if (failEffectsCompleteOnce && name === "research_assisted_order_payment_effects_complete") { failEffectsCompleteOnce = false; return Promise.resolve({ data: null, error: { code: "XX000", message: "injected completion outage", details: null } }); } return sr.rpc(name, args); } };
async function auditAuthority(keyId) {
  const r = await resolveAssistedOrderAuditAuthority({ env: { RESEARCH_ASSISTED_ORDER_AUDIT_ENABLED: "true", RESEARCH_ASSISTED_ORDER_AUDIT_SCHEMA_VERSION: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION, RESEARCH_ASSISTED_ORDER_AUDIT_ATTESTATION: ASSISTED_ORDER_AUDIT_ATTESTATION, RESEARCH_ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID: keyId, RESEARCH_ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_B64URL: crypto.randomBytes(32).toString("base64url") }, rpc: sr });
  if (!r.authority) throw new Error("durable audit authority unavailable: " + r.refusalReason);
  return r.authority;
}
const AUDIT_A = await auditAuthority("claude-probe-a");
const paymentEffects = await resolvePaymentEffectsRecovery({ enabled: true, rpc: effectsRpc, audit: AUDIT_A });
if (!paymentEffects) throw new Error("payment effects recovery unavailable");
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
  const routes = createAssistedOrderRouteTable(composition.service, viewers, null, finance, paymentEffects);
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
let n = 0; const ref = () => "XRR-20260930-" + (0xF600000000 + ++n).toString(16).toUpperCase();
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
console.log("F4 durable effects probe at 8f24082 (real durable audit authority + real payment-effects recovery)");
const heldJob = (o) => psql(`select row_to_json(x)::text from (select o.id, o.assisted_order_verification_id, o.event_key, o.recipient, o.template_key, o.payload, o.status from public.research_notification_outbox o join public.research_assisted_order_payment_verifications v on v.id = o.assisted_order_verification_id where v.request_id = '${o.id}') x`);
// E1: happy path
{ const { o, quoteId } = await accepted(); const x = await observe(o, quoteId); const v = await verify(o, x.data?.observationId);
  rec("E1 verify -> paid; obligation + audit + release in one flow", { status: v.status, state: v.data?.state, counts: counts(o.id), effects: verificationEffects(o.id) });
  const v2 = await verify(o, x.data?.observationId); rec("E1b identical replay", { status: v2.status, replayed: v2.data?.replayed, counts: counts(o.id), effects: verificationEffects(o.id) }); }
// E2: completion outage after commit, then grant revoked, then NEW recovery instance with ROTATED audit key runs the bounded worker
{ const G = crypto.randomUUID(); psql(`insert into public.research_assisted_order_payment_verifier_grants(auth_user_id, actor_label, granted_by) values ('${G}','finance-e@example.invalid','claude-probe')`);
  const { o, quoteId } = await accepted(); const x = await observe(o, quoteId, 10000, "USD", null, G);
  failEffectsCompleteOnce = true; const v1 = await verify(o, x.data?.observationId, G);
  const before = verificationEffects(o.id);
  const job = JSON.parse(heldJob(o));
  const dispatchWhileHeld = await paymentEffectDispatchAllowed(sr, job);
  psql(`update public.research_assisted_order_payment_verifier_grants set revoked_at = now() where auth_user_id='${G}'`);
  const AUDIT_B = await auditAuthority("claude-probe-b-rotated");
  const restarted = await resolvePaymentEffectsRecovery({ enabled: true, rpc: sr, audit: AUDIT_B });
  let batch = null; for (let i = 0; i < 20 && verificationEffects(o.id).outboxStatus_auditReceipt.startsWith("held"); i++) batch = await restarted.runBatch();
  const after = verificationEffects(o.id);
  const job2 = JSON.parse(heldJob(o));
  rec("E2 completion outage -> 503; grant revoked; restarted worker with rotated key completes", { first: [v1.status, v1.code], requestStatus: status(o.id), counts: counts(o.id), before, dispatchAllowedWhileHeld: dispatchWhileHeld, lastBatch: batch, after, dispatchAllowedAfter: await paymentEffectDispatchAllowed(sr, job2) }); }
// E3: forged paid notification rows cannot dispatch
{ const o = await seed(MEMBER);
  const forged = psqlTry(`insert into public.research_notification_outbox(event_key, event_type, template_key, recipient, payload) values ('assisted-order:${o.id}:payment-verification:${crypto.randomUUID()}','assisted_order.status_changed','research.assisted_order.status_changed.customer','probe@example.invalid','{"status":"paid","publicReference":"${o.ref}"}'::jsonb)`);
  const plain = { id: crypto.randomUUID(), assisted_order_verification_id: null, event_key: `assisted-order:${o.id}:status:paid`, recipient: "probe@example.invalid", template_key: "research.assisted_order.status_changed.customer", payload: { status: "paid" }, status: "pending" };
  const padded = { ...plain, payload: { status: " paid " } };
  rec("E3 forged/legacy paid notices", { ownerInsertForgedPaymentNotice: forged, dispatchPlainPaid: await paymentEffectDispatchAllowed(sr, plain), dispatchPaddedStatus: await paymentEffectDispatchAllowed(sr, padded) }); }
// E4: effects outbox row immutability / deletion
{ const { o, quoteId } = await accepted(); const x = await observe(o, quoteId); await verify(o, x.data?.observationId);
  const oid = psql(`select o.id from public.research_notification_outbox o join public.research_assisted_order_payment_verifications v on v.id = o.assisted_order_verification_id where v.request_id='${o.id}'`);
  rec("E4 owner tampering with a payment-effects outbox row", { changePayload: psqlTry(`update public.research_notification_outbox set payload = payload || '{"status":"shipped"}'::jsonb where id='${oid}'`), backToHeld: psqlTry(`update public.research_notification_outbox set status='held' where id='${oid}'`), delete: psqlTry(`delete from public.research_notification_outbox where id='${oid}'`), deleteAuditRow: psqlTry(`delete from public.research_assisted_order_audit_events_v1 where event_id='${psql(`select id from public.research_assisted_order_payment_verifications where request_id='${o.id}'`)}'`) }); }
rec("Z rollback delta", rollbacks() - r0);
for (const x of [prod, synth]) { x.s.close(); x.s.closeAllConnections?.(); }
process.exit(0);
