/**
 * Dedicated loopback application for managed qualification.
 * Started ONLY by qualification-launch.ts. Not imported by the production entry point.
 * Uses native registrars, native member authentication, canonical database stores and real Stripe test mode.
 * It does NOT seed products/members, approve inventory, send email or bypass catalog/legal eligibility.
 */
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { assertChildIdentity, QualificationFaults, startQualificationControl } from "./qualification-control";
import { fail, objectOf, requiredString } from "./managed-runtime";

async function main(message: unknown) {
  const m = objectOf(message);
  if (!m || m.type !== "qualification-init" || !process.send || !process.connected || process.env.XENIOS_QUALIFY_CHILD !== "owned") fail("qualification_parent_missing");
  const identity = { runId: requiredString(m!.runId, "run_id_missing"), projectRef: requiredString(m!.projectRef, "project_missing"),
    sourceSha: requiredString(m!.sourceSha, "source_missing"), mode: "test" as const, pid: process.pid, bootId: randomUUID() };
  assertChildIdentity(identity, process.env);
  const actual = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (actual !== identity.sourceSha) fail("qualification_source_mismatch");
  // No tracked or untracked application changes may be silently tested under somebody else's SHA.
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal", "--", "server", "shared", "client", "supabase"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (dirty) fail("qualification_application_tree_dirty");
  const { readManagedJourneyConfig } = await import("./managed-journey-config");
  const config = readManagedJourneyConfig({ ...process.env, XENIOS_QUALIFY_BASE_URL: "http://127.0.0.1:1" });
  if (config.projectRef !== identity.projectRef) fail("qualification_project_mismatch");
  if (process.env.SUPABASE_URL && process.env.SUPABASE_URL !== config.databaseUrl) fail("qualification_database_environment_mismatch");
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== config.secrets.serviceRoleKey()) fail("qualification_database_key_environment_mismatch");
  process.env.SUPABASE_URL = config.databaseUrl; process.env.SUPABASE_SERVICE_ROLE_KEY = config.secrets.serviceRoleKey();
  if (process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED !== "true") fail("qualification_commerce_flag_not_enabled");

  // Dynamic imports happen only after validating the actual target and source.
  const [{ default: express }, depsModule, commerceRoutes, durableRoutes, auth, paymentModule, storesModule, supabaseModule] = await Promise.all([
    import("express"), import("../production-deps"), import("../routes"), import("../durable-checkout-composition"),
    import("../../member-auth"), import("../../providers/payment"), import("../persistence/checkout-executions-store"), import("../../../supabase"),
  ]);
  const members = new Set(config.members); const faults = new QualificationFaults(members);
  const db = supabaseModule.getSupabaseAdmin();
  // A READ proves the required relation/projection exists. It does not replace the approved SQL rehearsal.
  for (const table of ["research_checkout_executions", "research_payment_webhook_inbox"]) {
    const { error } = await db.from(table).select(table === "research_checkout_executions" ? "id,authorization_first_attempted_at,local_commit_failure" : "event_id").limit(0);
    if (error) fail("qualification_execution_schema_unavailable");
  }
  const transport = faults.wrapTransport(paymentModule.buildFetchStripeTransport(config.secrets.secretKey()));
  const provider = new paymentModule.StripePaymentAdapter({ secretKey: config.secrets.secretKey(), webhookSecret: config.secrets.webhookSecret(), transport });
  const canonical = storesModule.createSupabaseCheckoutExecutionStore();
  const executions = faults.wrapExecutionStore(canonical, async id => {
    const { data, error } = await db.from("research_checkout_executions").select("member_id").eq("id", id).maybeSingle();
    if (error) fail("qualification_execution_scope_read_failed");
    return data !== null && members.has(String(data.member_id));
  });
  const wiring: Partial<import("../production-deps").CommerceWiring> = {};
  // Optional, reviewed fixture bindings: useful when staging holds approved synthetic product data.
  // They must use native repositories and may not override money stores, the provider or member auth.
  const fixturePath = process.env.XENIOS_QUALIFY_FIXTURE_WIRING_MODULE;
  if (fixturePath) {
    const root = await realpath(resolve("server/research/commerce/qualification"));
    const file = await realpath(resolve(fixturePath)); const rel = relative(root, file);
    if (isAbsolute(rel) || rel.startsWith("..")) fail("fixture_module_outside_qualification_tree");
    const hash = createHash("sha256").update(await readFile(file)).digest("hex");
    if (hash !== process.env.XENIOS_QUALIFY_FIXTURE_WIRING_SHA256) fail("fixture_wiring_hash_mismatch");
    const module = await import(pathToFileURL(file).href);
    if (typeof module.buildFixtureWiring !== "function") fail("fixture_wiring_export_missing");
    const supplied = await module.buildFixtureWiring({ projectRef: identity.projectRef, memberIds: [...members] });
    if (!supplied || typeof supplied !== "object") fail("fixture_wiring_invalid");
    const allowed = new Set(["catalogProducts", "resolveProductVariantActivationLedger", "resolveProductVariantActivationBindings"]);
    if (Object.keys(supplied).some(k => !allowed.has(k))) fail("fixture_wiring_exceeds_scope");
    Object.assign(wiring, supplied);
  }
  const dependencies = depsModule.buildCommerceDependencies(() => new Date(), process.env, {
    ...wiring,
    resolvePaymentProvider: () => provider,
    resolveDurableCheckoutStores: () => ({ executions: { store: executions, durable: true },
      webhookInbox: { store: storesModule.createSupabaseWebhookExecutionInbox(), durable: true } }),
  });
  if (!dependencies.durableCheckout.ready) fail("qualification_composition_not_ready");
  const app = express(); app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb", verify(req, _res, bytes) { Object.assign(req, { rawBody: Buffer.from(bytes) }); } }));
  const tokenOwners = new Map(config.members.map(id => [`Bearer ${config.secrets.accessTokenFor(id)}`, id]));
  const guard: import("../routes").CommerceGuards["requireActiveMember"] = async (req, res, next) => {
    const expected = tokenOwners.get(String(req.headers.authorization ?? ""));
    if (!expected) { res.status(403).json({ ok: false, code: "qualification_principal_refused" }); return; }
    await auth.requireActiveMember(req, res, () => {
      if (commerceRoutes.subjectOf(req) !== expected) { res.status(403).json({ ok: false, code: "qualification_principal_mismatch" }); return; }
      next();
    });
  };
  const denyAdmin: import("../routes").CommerceGuards["requireAdmin"] = (_req, res) => { res.status(403).json({ ok: false, code: "qualification_admin_not_in_scope" }); };
  const guards = { requireActiveMember: guard, requireMember: guard, requireAdmin: denyAdmin };
  commerceRoutes.registerCommerceApi(app, dependencies, guards);
  durableRoutes.registerDurableCheckoutSurface(app, guards, dependencies.durableCheckout, { now: dependencies.now });
  // This page carries no account, secret or payment information. Stripe inputs arrive later via private CDP.
  app.get("/api/__qualification/auth", (_req, res) => {
    res.set("Cache-Control", "no-store"); res.set("Referrer-Policy", "no-referrer");
    res.type("html").send('<!doctype html><html><head><meta charset="utf-8"><title>Isolated payment authentication</title><script src="https://js.stripe.com/v3/"></script></head><body><main>Provider sandbox authentication</main></body></html>');
  });
  app.use((_req, res) => { res.status(404).json({ ok: false, code: "not_found" }); });
  app.use((_error: unknown, _req: import("express").Request, res: import("express").Response, _next: import("express").NextFunction) => {
    if (!res.headersSent) res.status(503).json({ ok: false, code: "qualification_request_failed" });
  });
  const appPort = Number(m!.appPort), controlPort = Number(m!.controlPort);
  if (![appPort, controlPort].every(p => Number.isInteger(p) && p >= 0 && p <= 65535)) fail("qualification_port_invalid");
  const server = await new Promise<import("node:http").Server>((resolve, reject) => {
    const s = app.listen(appPort, "127.0.0.1", () => resolve(s)); s.once("error", reject);
  });
  const address = server.address(); if (!address || typeof address === "string") fail("qualification_listener_invalid");
  const control = await startQualificationControl({ identity, token: requiredString(m!.token, "control_token_missing"), faults, port: controlPort });
  let closing = false;
  const close = async () => {
    if (closing) return; closing = true;
    await control.close().catch(() => {});
    await new Promise<void>(r => { server.close(() => r()); server.closeAllConnections(); });
    process.exit(0);
  };
  process.once("disconnect", () => { void close(); }); process.once("SIGTERM", () => { void close(); }); process.once("SIGINT", () => { void close(); });
  process.send!({ type: "qualification-ready", ...identity, appOrigin: `http://127.0.0.1:${address.port}`, controlOrigin: control.origin });
}
if (!process.send || process.env.XENIOS_QUALIFY_CHILD !== "owned") {
  process.exitCode = 2;
} else {
  process.once("message", msg => {
    void main(msg).catch(() => {
      process.send?.({ type: "qualification-not-run" }, () => process.exit(2));
    });
  });
}
