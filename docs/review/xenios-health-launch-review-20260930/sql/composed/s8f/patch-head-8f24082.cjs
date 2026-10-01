// Produces the 8f24082-compatible harness head from hl12-successor-probe.mts:
// composes the REAL durable audit authority (migration 040349) and the REAL payment-effects recovery
// (migration 040351/115512) into the route table, and counts effects from SQL instead of in-memory sinks.
const fs = require("fs");
const [, , src, out, refBase] = process.argv;
let s = fs.readFileSync(src, "utf8");
s = s.slice(0, s.indexOf("const r0 = rollbacks();"));
s = s.replace("0xF100000000", refBase || "0xF600000000");
s = s.replace(
  'const { registerResearchApi } = await import(',
  `import { resolveAssistedOrderAuditAuthority, ASSISTED_ORDER_AUDIT_SCHEMA_VERSION, ASSISTED_ORDER_AUDIT_ATTESTATION } from "file:///C:/xenios-wt/closeout-review/server/research/assisted-order/audit-store.ts";
import { resolvePaymentEffectsRecovery, paymentEffectDispatchAllowed } from "file:///C:/xenios-wt/closeout-review/server/research/assisted-order/payment-effects.ts";
const { registerResearchApi } = await import(`,
);
// effects failure injection on the recovery's own RPC client (not the finance client)
s = s.replace(
  "function build(manualEvidence) {",
  `let failEffectsCompleteOnce = false;
const effectsRpc = { rpc: (name, args) => { if (failEffectsCompleteOnce && name === "research_assisted_order_payment_effects_complete") { failEffectsCompleteOnce = false; return Promise.resolve({ data: null, error: { code: "XX000", message: "injected completion outage", details: null } }); } return sr.rpc(name, args); } };
async function auditAuthority(keyId) {
  const r = await resolveAssistedOrderAuditAuthority({ env: { RESEARCH_ASSISTED_ORDER_AUDIT_ENABLED: "true", RESEARCH_ASSISTED_ORDER_AUDIT_SCHEMA_VERSION: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION, RESEARCH_ASSISTED_ORDER_AUDIT_ATTESTATION: ASSISTED_ORDER_AUDIT_ATTESTATION, RESEARCH_ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID: keyId, RESEARCH_ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_B64URL: crypto.randomBytes(32).toString("base64url") }, rpc: sr });
  if (!r.authority) throw new Error("durable audit authority unavailable: " + r.refusalReason);
  return r.authority;
}
const AUDIT_A = await auditAuthority("claude-probe-a");
const paymentEffects = await resolvePaymentEffectsRecovery({ enabled: true, rpc: effectsRpc, audit: AUDIT_A });
if (!paymentEffects) throw new Error("payment effects recovery unavailable");
function build(manualEvidence) {`,
);
s = s.replace(
  "createAssistedOrderRouteTable(composition.service, viewers, null, finance)",
  "createAssistedOrderRouteTable(composition.service, viewers, null, finance, paymentEffects)",
);
// SQL-backed effects view (canonical outbox row + audit receipt)
s = s.replace(
  /const verificationEffects = \(requestId\) => \(\{[\s\S]*?\}\);\n/,
  `const verificationEffects = (requestId) => { const r = psql(\`select coalesce(string_agg(o.status || ':' || (public.research_assisted_order_payment_effects_audit_receipt(v.id) is not null)::text, ',' order by v.verified_at), 'none') from public.research_assisted_order_payment_verifications v left join public.research_notification_outbox o on o.assisted_order_verification_id = v.id where v.request_id = '\${requestId}'\`); return { outboxStatus_auditReceipt: r, message: psql(\`select coalesce(max(o.payload->>'customerMessage'), max(o.payload->>'status'), '-') from public.research_assisted_order_payment_verifications v join public.research_notification_outbox o on o.assisted_order_verification_id = v.id where v.request_id = '\${requestId}'\`) }; };\n`,
);
if (!s.includes("paymentEffects)") || !s.includes("outboxStatus_auditReceipt")) throw new Error("patch failed");
fs.writeFileSync(out, s);
console.log("patched head written", out, s.length);
