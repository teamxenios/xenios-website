// Composed LOCAL proof only. The parent creates a no-network/no-port PG17
// container and accepted/payment_review synthetic fixtures base..base+9.
// Express, viewer/route/service, canonical audit and service_role SQL are real.
// Auth stamps and independent evidence are synthetic: this does NOT prove bank
// or provider authentication. It never sends email or starts a container.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import express from "express";
import request from "supertest";
import { createAssistedOrderRouteTable } from "../../server/research/assisted-order/http";
import { assistedOrderExpressHandler, createAssistedOrderViewerResolvers, type ExpressAssistedOrderRequest } from "../../server/research/assisted-order/express";
import { AssistedOrderDispositionService, type AssistedOrderNoFundsEvidenceAuthority, type AssistedOrderNoFundsSourceReceipt } from "../../server/research/assisted-order/financial-disposition";
import { dispositionEffectDispatchAllowed, resolveDispositionEffectsRecovery, type DispositionEffectsRecovery } from "../../server/research/assisted-order/disposition-effects";
import {
  resolveAssistedOrderAuditAuthority, ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_ENV_VAR,
  ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID_ENV_VAR, ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR,
  ASSISTED_ORDER_AUDIT_SCHEMA_ENV_VAR, ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
  ASSISTED_ORDER_AUDIT_ATTESTATION_ENV_VAR, ASSISTED_ORDER_AUDIT_ATTESTATION,
} from "../../server/research/assisted-order/audit-store";
import type { AssistedOrderService } from "../../server/research/assisted-order/service";
import type { SupabaseRpcClient } from "../../server/research/assisted-order/supabase-repository";

assert.equal(process.version, "v20.19.0", "Use the isolated pinned Node runtime");
const container = process.argv[2];
assert.match(container ?? "", /^[a-f0-9]{64}$/, "Exact disposable container ID is required");
const base = Number(process.argv[3] ?? "500");
assert.ok(Number.isInteger(base) && base >= 500 && base <= 590, "Only reserved local fixtures 500..599 are permitted");
const runFile = promisify(execFile);
const inspected = JSON.parse((await runFile("docker", ["inspect", container, "--format", "{{json .}}"], { windowsHide: true })).stdout);
assert.equal(inspected.State.Running, true);
assert.match(inspected.Config.Image, /^postgres:17(?:-alpine)?$/);
assert.equal(inspected.HostConfig.NetworkMode, "none");
assert.equal(Object.keys(inspected.HostConfig.PortBindings ?? {}).length, 0, "No host database port is allowed");

const id = (prefix: number, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const requestId = (offset: number) => id(1, base + offset);
const actorId = (offset: number) => id(4, base + offset);
const reference = (offset: number) => `XRR-20261001-ABCDEF${String(base + offset).padStart(4, "0")}`;
const quote = (value: unknown) => value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const scope = "synthetic-bank-import";
const label = "synthetic-disposition-http@example.test";
const routePath = "/api/admin/research/assisted-orders/:requestId/financial-dispositions/no-funds/cancel";
const input = { evidenceHandle: "synthetic-independent-source-handle", intent: "cancel" };
let sqlCalls = 0;
let assertions = 0;

async function psql(sql: string): Promise<string> {
  sqlCalls += 1;
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { windowsHide: true });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill(), 30_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(Object.assign(new Error("Disposable SQL operation refused"), { stderr, exitCode: code }));
    });
    child.stdin.end(`\\set VERBOSITY verbose\n${sql}\n`);
  });
}
const signatures: Record<string, Readonly<Record<string, string>>> = {
  research_assisted_order_audit_authority: {},
  research_assisted_order_disposition_context: { p_request_id: "uuid", p_actor_auth_user_id: "uuid", p_source_namespace: "text" },
  research_assisted_order_disposition_commit_cancel: { p_request_id: "uuid", p_quote_id: "uuid", p_expected_graph_fingerprint: "text", p_actor_auth_user_id: "uuid", p_idempotency_key: "text", p_intent: "text", p_receipt: "jsonb" },
  research_assisted_order_disposition_effects_authority: {},
  research_assisted_order_disposition_effects_context: { p_disposition_id: "uuid" },
  research_assisted_order_disposition_effects_complete: { p_disposition_id: "uuid", p_schema_version: "text", p_attestation: "text", p_event: "jsonb" },
  research_assisted_order_disposition_effects_pending: { p_after_created_at: "timestamptz", p_after_id: "uuid", p_limit: "integer" },
  research_assisted_order_disposition_effects_outbox_ready: { p_outbox_id: "uuid", p_disposition_id: "uuid", p_event_key: "text", p_recipient: "text", p_template_key: "text", p_payload: "jsonb" },
};
const rpcNames: string[] = [];
const rpc: SupabaseRpcClient = { rpc: async (name, args = {}) => {
  const types = signatures[name];
  assert.ok(types, "Only proof RPCs may be called");
  assert.deepEqual(Object.keys(args).sort(), Object.keys(types).sort());
  rpcNames.push(name);
  const parameters = Object.entries(types).map(([key, type]) => {
    const value = args[key];
    return `${key} => ${quote(value === null ? null : type === "jsonb" ? JSON.stringify(value) : value)}::${type}`;
  }).join(",");
  try {
    const output = await psql(`set role service_role; select public.${name}(${parameters})::text;`);
    return { data: output.length ? JSON.parse(output) : null, error: null };
  } catch (error) {
    const diagnostic = (error as { stderr?: string }).stderr;
    if (diagnostic === undefined) throw error;
    return { data: null, error: {
      code: /ERROR:\s+([A-Z0-9]{5}):/.exec(diagnostic)?.[1] ?? "LOCAL_SQL_ERROR",
      details: /DETAIL:\s+([^\r\n]+)/.exec(diagnostic)?.[1], message: "Disposable SQL authority refused",
    } };
  }
} };

async function recovery(client = rpc, keyId = "synthetic-http-1"): Promise<DispositionEffectsRecovery> {
  const audit = await resolveAssistedOrderAuditAuthority({ rpc: client, env: {
    [ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR]: "true",
    [ASSISTED_ORDER_AUDIT_SCHEMA_ENV_VAR]: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
    [ASSISTED_ORDER_AUDIT_ATTESTATION_ENV_VAR]: ASSISTED_ORDER_AUDIT_ATTESTATION,
    [ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID_ENV_VAR]: keyId,
    [ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_ENV_VAR]: Buffer.alloc(32, keyId.endsWith("2") ? 2 : 1).toString("base64url"),
  } });
  assert.equal(audit.available, true, "Real SQL canonical audit authority must resolve");
  if (!audit.available) throw new Error("Audit authority unavailable");
  const effects = await resolveDispositionEffectsRecovery({ enabled: true, rpc: client, audit: audit.authority });
  assert.ok(effects, "Real SQL disposition authority must resolve");
  return effects;
}
type SourceInput = Parameters<AssistedOrderNoFundsEvidenceAuthority["resolve"]>[0];
const sourceReceipts = new Map<string, AssistedOrderNoFundsSourceReceipt>();
function sourceReceipt(ctx: SourceInput["context"]): AssistedOrderNoFundsSourceReceipt {
  const existing = sourceReceipts.get(ctx.requestId);
  if (existing) return existing;
  // The synthetic source fixture is created after the graph exists. Its time
  // and contents then remain immutable, including repeated/replay lookups.
  const receipt: AssistedOrderNoFundsSourceReceipt = Object.freeze({
    schemaVersion: "assisted_order_no_funds_receipt_v1", sourceNamespace: scope,
    sourceReceiptId: `synthetic-http-receipt:${ctx.requestId}`, requestId: ctx.requestId,
    quoteId: ctx.quoteId, graphFingerprint: ctx.graphFingerprint,
    outcome: "never_received", finality: "terminal", checkedAt: new Date().toISOString(),
  });
  sourceReceipts.set(ctx.requestId, receipt);
  return receipt;
}
function mounted(actor: string, effects: DispositionEffectsRecovery,
  resolve: AssistedOrderNoFundsEvidenceAuthority["resolve"] = async ({ context }) => sourceReceipt(context), configuredSource = scope) {
  const seen: SourceInput[] = [];
  const service = new AssistedOrderDispositionService(rpc, { sourceNamespace: configuredSource, resolve: async (value) => {
    assert.equal(value.context.totalCents, 5000, "Immutable quote total comes from effective SQL");
    assert.equal(value.context.currency, "USD");
    assert.equal(value.context.fromStatus, "payment_review");
    assert.ok(Object.isFrozen(value.context));
    seen.push(value);
    return resolve(value);
  } });
  const viewers = createAssistedOrderViewerResolvers({ resolveMember: async () => null,
    earlyAccess: () => null, earlyAccessBindings: () => null, adminEmail: () => label });
  const descriptors = createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(
    {} as AssistedOrderService, viewers, null, null, null, { service, effects });
  const descriptor = descriptors.find((row) => row.method === "POST" && row.path === routePath);
  assert.ok(descriptor);
  assert.equal(descriptor.auth, "admin");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers.authorization === "Bearer synthetic-local-admin") Object.assign(req, { adminAuthUserId: actor });
    next();
  });
  app.post(routePath, assistedOrderExpressHandler(descriptor));
  return { app, seen, post: (offset: number, body: Record<string, unknown> = input) => request(app)
    .post(routePath.replace(":requestId", requestId(offset))).set("authorization", "Bearer synthetic-local-admin").send(body) };
}
async function state(offset: number) {
  return JSON.parse(await psql(`select json_build_object(
    'status',(select status from public.research_assisted_order_requests where id=${quote(requestId(offset))}),
    'dispositions',(select count(*) from public.research_assisted_order_financial_dispositions where request_id=${quote(requestId(offset))}),
    'evidence',(select count(*) from public.research_assisted_order_no_funds_evidence where request_id=${quote(requestId(offset))}),
    'audit',(select count(*) from public.research_assisted_order_audit_events_v1 where request_id=${quote(requestId(offset))}),
    'cancelEvents',(select count(*) from public.research_assisted_order_events where request_id=${quote(requestId(offset))} and status='cancelled'),
    'outbox',(select count(*) from public.research_notification_outbox where assisted_order_disposition_id in
      (select id from public.research_assisted_order_financial_dispositions where request_id=${quote(requestId(offset))})))::text;`));
}
async function job(dispositionId: string): Promise<Record<string, unknown>> {
  return JSON.parse(await psql(`select row_to_json(o)::text from public.research_notification_outbox o where assisted_order_disposition_id=${quote(dispositionId)}::uuid;`));
}
async function financial(offset: number) {
  return JSON.parse(await psql(`set role service_role;select public.research_assisted_order_financial_state_by_reference(${quote(reference(offset))})::text;`));
}
const unchanged = { status: "payment_review", dispositions: 0, evidence: 0, audit: 0, cancelEvents: 0, outbox: 0 };
const pass = (message: string) => { assertions += 1; process.stdout.write(`HTTP_SQL PASS ${message}\n`); };

await psql(`insert into public.research_assisted_order_no_funds_grants(auth_user_id,source_namespace,actor_label,granted_by) values
  ${[0, 1, 2].map((n) => `(${quote(actorId(n))},${quote(scope)},${quote(label)},'synthetic-local-proof')`).join(",")};`);
for (const offset of [0, 1, 2, 3, 4, 5, 6]) assert.deepEqual(await state(offset), unchanged);
const effects = await recovery();
const healthy = mounted(actorId(0), effects);
const factsBefore = await financial(0);
const success = await healthy.post(0);
assert.equal(success.status, 200);
assert.equal(success.headers["cache-control"], "no-store");
assert.deepEqual(Object.keys(success.body).sort(), ["dispositionId", "requestId", "kind", "state", "resolvedAt", "replayed"].sort());
assert.equal(success.body.requestId, requestId(0));
assert.equal(success.body.kind, "no_funds");
assert.equal(success.body.state, "cancelled");
assert.equal(success.body.replayed, false);
assert.doesNotMatch(JSON.stringify(success.body), /sourceReceipt|sourceNamespace|graphFingerprint|resolvedBy|synthetic-disposition-http/);
assert.deepEqual(await state(0), { status: "cancelled", dispositions: 1, evidence: 1, audit: 1, cancelEvents: 1, outbox: 1 });
assert.deepEqual(await financial(0), factsBefore, "Historical financial facts are not cleared or promoted");
assert.equal(await dispositionEffectDispatchAllowed(rpc, await job(success.body.dispositionId)), true);
pass("mounted cancellation commits once, preserves financial facts, appends canonical audit and releases exact SQL-ready outbox");

const replay = await healthy.post(0);
assert.equal(replay.status, 200);
assert.equal(replay.body.dispositionId, success.body.dispositionId);
assert.equal(replay.body.replayed, true);
assert.deepEqual(await state(0), { status: "cancelled", dispositions: 1, evidence: 1, audit: 1, cancelEvents: 1, outbox: 1 });
assert.deepEqual(healthy.seen[0].context, { ...healthy.seen[1].context, existingDispositionId: null });
pass("HTTP replay uses frozen original context and private receipt without duplicate effects");

await psql(`insert into public.research_assisted_order_no_funds_grants(auth_user_id,source_namespace,actor_label,granted_by)
  values(${quote(actorId(0))},'synthetic-second-authorized-source',${quote(label)},'synthetic-local-proof');`);
const switchedReplaySource = mounted(actorId(0), effects, async ({ context }) => sourceReceipt(context), "synthetic-second-authorized-source");
assert.equal((await switchedReplaySource.post(0)).status, 403);
assert.equal(switchedReplaySource.seen.length, 0, "An active alternate-source grant cannot access the original receipt replay graph");
pass("replay stays bound to its original source namespace even with an active alternate-source grant");

const callsBefore = rpcNames.length;
assert.equal((await healthy.post(1, { ...input, amountCents: 0, currency: "EUR" })).status, 400);
assert.equal(rpcNames.length, callsBefore);
assert.deepEqual(await state(1), unchanged);
const unauthenticated = await request(healthy.app).post(routePath.replace(":requestId", requestId(1))).send(input);
assert.equal(unauthenticated.status, 403);
assert.equal(rpcNames.length, callsBefore);
pass("browser amount/currency and unstamped authority cannot reach SQL or evidence source");

const wrongRequest = mounted(actorId(0), effects, async ({ context }) => ({ ...sourceReceipt(context), requestId: requestId(9) }));
assert.equal((await wrongRequest.post(1)).status, 409);
assert.deepEqual(await state(1), unchanged);
const wrongGraph = mounted(actorId(0), effects, async ({ context }) => ({ ...sourceReceipt(context), graphFingerprint: "b".repeat(64) }));
assert.equal((await wrongGraph.post(2)).status, 409);
assert.deepEqual(await state(2), unchanged);
const wrongScope = mounted(actorId(0), effects, async ({ context }) => ({ ...sourceReceipt(context), sourceNamespace: "synthetic-ungranted-source" }));
assert.equal((await wrongScope.post(2)).status, 409);
assert.deepEqual(await state(2), unchanged);
const wrongConfiguredScope = mounted(actorId(0), effects, async ({ context }) => sourceReceipt(context), "synthetic-ungranted-source");
assert.equal((await wrongConfiguredScope.post(2)).status, 403);
assert.equal(wrongConfiguredScope.seen.length, 0, "Another-source grant must not permit configured source access");
assert.deepEqual(await state(2), unchanged);
pass("wrong independent source request, graph and scoped namespace refuse without financial writes");

await psql(`update public.research_assisted_order_no_funds_grants set revoked_at=clock_timestamp() where auth_user_id=${quote(actorId(0))};`);
const seenBefore = healthy.seen.length;
assert.equal((await healthy.post(3)).status, 403);
assert.equal((await healthy.post(0)).status, 403, "Replay source lookup still requires the active scoped grant");
assert.equal(healthy.seen.length, seenBefore);
assert.deepEqual(await state(3), unchanged);
pass("revoked context grant blocks both new and replay source lookup before source access");

const stale = mounted(actorId(1), effects, async ({ context }) => {
  await psql(`update public.research_assisted_order_requests set updated_at=updated_at+interval '1 millisecond' where id=${quote(context.requestId)};`);
  return sourceReceipt(context);
});
const staleResponse = await stale.post(4);
assert.equal(staleResponse.status, 409);
assert.equal(staleResponse.body.error, "financial_disposition_stale");
assert.deepEqual(await state(4), unchanged);
pass("graph changed during source lookup is refused by the locked effective SQL commit");

let interruption = true;
const interruptedRpc: SupabaseRpcClient = { rpc: async (name, args) => {
  if (name === "research_assisted_order_disposition_effects_complete" && interruption) {
    interruption = false;
    return { data: null, error: { code: "SYNTHETIC_INTERRUPTION", message: "Synthetic local interruption before audit release" } };
  }
  return rpc.rpc(name, args);
} };
const interrupted = mounted(actorId(1), await recovery(interruptedRpc));
const pending = await interrupted.post(5);
assert.equal(pending.status, 503);
assert.equal(pending.body.error, "financial_disposition_effects_pending");
assert.match(pending.body.message, /^Cancellation was recorded\./);
assert.doesNotMatch(pending.body.message, /Payment verification/);
assert.deepEqual(await state(5), { status: "cancelled", dispositions: 1, evidence: 1, audit: 0, cancelEvents: 1, outbox: 1 });
const durableId = JSON.parse(await psql(`select to_json(id)::text from public.research_assisted_order_financial_dispositions where request_id=${quote(requestId(5))};`));
assert.equal((await job(durableId)).status, "held");
assert.equal(await dispositionEffectDispatchAllowed(rpc, await job(durableId)), false);
await psql(`update public.research_assisted_order_no_funds_grants set revoked_at=clock_timestamp() where auth_user_id=${quote(actorId(1))};`);
const restarted = await recovery(rpc, "synthetic-http-2");
await restarted.recover(durableId, requestId(5));
await restarted.recover(durableId, requestId(5));
assert.deepEqual(await state(5), { status: "cancelled", dispositions: 1, evidence: 1, audit: 1, cancelEvents: 1, outbox: 1 });
assert.equal(await dispositionEffectDispatchAllowed(rpc, await job(durableId)), true);
pass("postcommit interruption gives truthful503, durable held obligation restarts after grant revocation with rotated audit key, replay is harmless");

const lateRevocation = mounted(actorId(2), effects, async ({ context }) => {
  await psql(`update public.research_assisted_order_no_funds_grants set revoked_at=clock_timestamp() where auth_user_id=${quote(actorId(2))};`);
  return sourceReceipt(context);
});
assert.equal((await lateRevocation.post(6)).status, 403);
assert.deepEqual(await state(6), unchanged);
pass("SQL rechecks a grant revoked between scoped context and commit");
process.stdout.write(`HTTP_SQL COMPLETE ${JSON.stringify({ assertions, sqlCalls, node: process.version, syntheticAuth: true, syntheticEvidence: true, emailSent: false, managedStateMutated: false })}\n`);
