import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createServer, request, type IncomingHttpHeaders, type Server } from "node:http";
import { createRequire } from "node:module";
import net, { type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// SOURCE ONLY until separately granted an exclusive execution reservation.
// This boots the actual server/index.ts, without importing/reconstructing its
// Express composition in the test. Static HTML and the Kairos transport are
// synthetic. Storage/Auth/provider credentials are deliberately unavailable;
// this cannot qualify durable persistence, authentication or provider delivery.
// All probes/dependency fixtures use loopback. The unchanged root listener binds
// 0.0.0.0, so this is NOT a loopback-bound root or an outbound network sandbox.
// These receipts are separate from the mandatory historical HTTP red/green pair.
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const TEMP_PARENT = path.resolve(os.tmpdir());
const TEMP_PREFIX = "xenios-quick-order-root-";
const OUTPUT_LIMIT = 16 * 1024;
const RESPONSE_LIMIT = 128 * 1024;
const BOOT_TIMEOUT = 120_000;
const DISABLED = {
  code: "feature_disabled",
  message: "Quick Order is not available for customer requests yet.",
};
const SHELL = `<!doctype html><html><head><title>Synthetic root build</title>
<meta name="robots" content="index,follow" />
<link rel="canonical" href="https://example.invalid/inherited" />
<meta property="og:title" content="synthetic inherited social" />
<script type="application/ld+json">{"@type":"Organization","name":"synthetic inherited schema"}</script>
</head><body><!-- synthetic-root-build --><div id="root"></div></body></html>`;
type ExitReceipt = { code: number | null; signal: NodeJS.Signals | null };
type Reply = { status: number | undefined; headers: IncomingHttpHeaders; body: string };
type OutputTail = { totalBytes: number; tail: Buffer };
const stdout: OutputTail = { totalBytes: 0, tail: Buffer.alloc(0) };
const stderr: OutputTail = { totalBytes: 0, tail: Buffer.alloc(0) };
const dependencySockets = new Set<Socket>();
const dependencyReceipts: { method: string; target: string; allowed: boolean }[] = [];
const probeReceipts: { method: string; target: string; status: number | undefined }[] = [];
let dependencyOverflow = false;
let fixtureRoot: string | undefined;
let dependencies: Server | undefined;
let child: ChildProcess | undefined;
let childClosed: Promise<ExitReceipt> | undefined;
let exitReceipt: ExitReceipt | undefined;
let spawnError: Error | undefined;
let shutdownRequested = false;
let unexpectedExit = false;
let appPort = 0;

function capture(output: OutputTail, chunk: Buffer | string): void {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  output.totalBytes += bytes.length;
  output.tail = Buffer.concat([output.tail, bytes]).subarray(-OUTPUT_LIMIT);
}

async function bounded<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function unusedPort(): Promise<number> {
  const socket = net.createServer();
  try {
    return await bounded(new Promise<number>((resolve, reject) => {
      socket.once("error", reject);
      socket.listen(0, "127.0.0.1", () => {
        const address = socket.address();
        if (!address || typeof address === "string") {
          socket.close();
          reject(new Error("No loopback port was allocated"));
          return;
        }
        socket.close(error => error ? reject(error) : resolve(address.port));
      });
    }), 5_000, "Owned port allocation");
  } finally {
    if (socket.listening) socket.close();
  }
}

async function startDependencies(): Promise<number> {
  dependencies = createServer((req, res) => {
    // Only this exact synthetic read is useful to the root proxy control.
    // Any accidental Auth/storage call or mutation is recorded and refused.
    const allowed = req.method === "GET" && req.url === "/kairos/__qo_composition_probe";
    if (dependencyReceipts.length < 64) {
      dependencyReceipts.push({ method: req.method ?? "", target: (req.url ?? "").slice(0, 512), allowed });
    } else dependencyOverflow = true;
    req.resume();
    res.writeHead(allowed ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify(allowed ? { synthetic: "loopback-kairos" } : { error: "synthetic_dependency_unavailable" }));
  });
  dependencies.on("connection", socket => {
    dependencySockets.add(socket);
    socket.once("close", () => dependencySockets.delete(socket));
  });
  await bounded(new Promise<void>((resolve, reject) => {
    dependencies!.once("error", reject);
    dependencies!.listen(0, "127.0.0.1", resolve);
  }), 5_000, "Dependency fixture listen");
  const address = dependencies.address();
  if (!address || typeof address === "string") throw new Error("No dependency fixture port");
  return address.port;
}

function syntheticEnvironment(dist: string, dependencyPort: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const osKeys = new Set(["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR",
    "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"]);
  for (const [key, value] of Object.entries(process.env)) {
    if (osKeys.has(key.toUpperCase()) && value !== undefined) env[key] = value;
  }
  // Never inherit provider credentials, proxy settings, NODE_OPTIONS, loaders or
  // the historical production fixture's enabled flags / dummy RESEND_API_KEY.
  Object.assign(env, {
    NODE_ENV: "production", PORT: String(appPort), XENIOS_STATIC_DIST_DIR: dist,
    SITE_URL: `http://127.0.0.1:${appPort}`,
    KAIROS_PROXY_TARGET: `http://127.0.0.1:${dependencyPort}`,
    SUPABASE_URL: `http://127.0.0.1:${dependencyPort}`,
    // No Supabase keys: storage and its timer remain unconfigured. The loopback
    // URL is a defensive synthetic destination, not a configured DB assertion.
    ADMIN_EMAIL: "synthetic-root@example.invalid",
    RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL: "synthetic-root@example.invalid",
    RESEARCH_SESSION_SECRET: "synthetic-root-session-not-a-real-secret",
    RESEARCH_EARLY_ACCESS_SESSION_SECRET: "synthetic-root-early-access-not-a-real-secret",
    RESEARCH_PARTNER_LINK_SECRET: "synthetic-root-partner-not-a-real-secret",
    RESEARCH_PUBLIC: "true", RESEARCH_INDEXABLE: "false",
    RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED: "false",
    RESEARCH_EARLY_ACCESS_ENABLED: "false", RESEARCH_EARLY_ACCESS_OPEN_ACCESS: "false",
    RESEARCH_EARLY_ACCESS_CART_ENABLED: "false",
    RESEARCH_EARLY_ACCESS_SESSION_IDENTITY_ENABLED: "false",
    RESEARCH_ESIGN_ENABLED: "false", RESEARCH_FOUNDING_ACTIVATION_ENABLED: "false",
    RESEARCH_KRIS_LAUNCH_A_ENABLED: "false", RESEARCH_MASTER_OFFERINGS_ENABLED: "false",
    AFFILIATE_CODES_ENABLED: "false", AFFILIATE_PORTAL_ENABLED: "false",
    AFFILIATE_PROGRAM_ENABLED: "false", AFFILIATE_SYSTEM_ENABLED: "false",
    XENIOS_BUYER_SCOPED_PRICING: "false",
  });
  return env;
}

function rawProbe(target: string, method = "GET", body?: string, receipt = true): Promise<Reply> {
  return new Promise((resolve, reject) => {
    // Absolute-form targets remain literal bytes in `path`; the socket's host
    // is always loopback. Do not use fetch/URL, which normalize dot segments.
    const outgoing = request({ hostname: "127.0.0.1", port: appPort, path: target,
      method, agent: false,
      headers: { Connection: "close", ...(body === undefined ? {} : {
        "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body),
      }) },
    }, incoming => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      incoming.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > RESPONSE_LIMIT) incoming.destroy(new Error("Response exceeded bounded receipt size"));
        else chunks.push(chunk);
      });
      incoming.once("error", reject);
      incoming.once("aborted", () => reject(new Error("Root response aborted")));
      incoming.once("end", () => {
        if (receipt && probeReceipts.length < 128) probeReceipts.push({ method, target, status: incoming.statusCode });
        resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    const deadline = setTimeout(() => outgoing.destroy(new Error("Root request deadline exceeded")), 5_000);
    outgoing.once("close", () => clearTimeout(deadline));
    outgoing.once("error", reject);
    outgoing.end(body);
  });
}

async function waitUntilReady(): Promise<void> {
  const deadline = Date.now() + BOOT_TIMEOUT;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (exitReceipt) throw new Error(`Actual root exited during boot: ${JSON.stringify(exitReceipt)}`);
    try {
      const health = await rawProbe("/api/health", "GET", undefined, false);
      if (health.status === 200 && JSON.parse(health.body).status === "Xenios API is running") return;
    } catch { /* A not-yet-listening child is expected during bounded startup. */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("Actual server/index.ts did not become ready within the startup deadline");
}

beforeAll(async () => {
  fixtureRoot = fs.mkdtempSync(path.join(TEMP_PARENT, TEMP_PREFIX));
  const dist = path.join(fixtureRoot, "public");
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dist, "index.html"), SHELL);
  const dependencyPort = await startDependencies();
  appPort = await unusedPort();
  const loader = createRequire(import.meta.url).resolve("tsx");
  // Direct Node avoids introducing a tsx CLI wrapper as the owned child.
  // Loader/platform compatibility and any helper lifecycle remain NOT RUN.
  child = spawn(process.execPath, ["--max-old-space-size=1024", "--import", pathToFileURL(loader).href,
    path.join(ROOT, "server", "index.ts")], {
    cwd: ROOT, env: syntheticEnvironment(dist, dependencyPort),
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  childClosed = new Promise(resolve => {
    child!.once("error", error => { spawnError = error; });
    child!.once("exit", () => { if (!shutdownRequested) unexpectedExit = true; });
    child!.once("close", (code, signal) => { exitReceipt = { code, signal }; resolve(exitReceipt); });
  });
  child.stdout!.on("data", chunk => capture(stdout, chunk));
  child.stderr!.on("data", chunk => capture(stderr, chunk));
  await waitUntilReady();
}, BOOT_TIMEOUT + 10_000);

afterAll(async () => {
  const cleanupErrors: string[] = [];
  try {
    if (child && childClosed && !exitReceipt) {
      shutdownRequested = true;
      child.kill("SIGTERM");
      try { await bounded(childClosed, 5_000, "Owned root termination"); }
      catch {
        child.kill("SIGKILL");
        await bounded(childClosed, 5_000, "Owned root forced termination");
      }
    }
  } catch (error) { cleanupErrors.push(String(error)); }
  try {
    for (const socket of dependencySockets) socket.destroy();
    if (dependencies?.listening) await bounded(new Promise<void>((resolve, reject) => {
      dependencies!.close(error => error ? reject(error) : resolve());
    }), 5_000, "Owned dependency fixture close");
  } catch (error) { cleanupErrors.push(String(error)); }
  try {
    if (fixtureRoot && (!child || exitReceipt)) {
      const resolved = fs.realpathSync(fixtureRoot);
      if (path.dirname(resolved) !== fs.realpathSync(TEMP_PARENT) || !path.basename(resolved).startsWith(TEMP_PREFIX)) {
        throw new Error("Refusing removal outside the owned temporary fixture");
      }
      fs.rmSync(resolved, { recursive: true, force: true });
    } else if (fixtureRoot) cleanupErrors.push("Fixture retained because root exit was not confirmed");
  } catch (error) { cleanupErrors.push(String(error)); }
  const outputReceipt = (output: OutputTail) => ({ totalBytes: output.totalBytes,
    truncated: output.totalBytes > OUTPUT_LIMIT, tail: output.tail.toString("utf8") });
  console.info("QUICK_ORDER_ROOT_COMPOSITION_RECEIPT", JSON.stringify({
    entry: "server/index.ts", environment: "explicit allowlist; synthetic; storage unavailable",
    rootBind: "0.0.0.0 (unchanged runtime)", probeHost: "127.0.0.1",
    exit: exitReceipt ?? null, shutdownRequested, unexpectedExit, spawnError: spawnError?.message ?? null,
    stdout: outputReceipt(stdout), stderr: outputReceipt(stderr),
    probes: probeReceipts, dependencies: dependencyReceipts, dependencyOverflow, cleanupErrors,
  }));
  expect(cleanupErrors).toEqual([]);
  expect(spawnError).toBeUndefined();
  expect(unexpectedExit).toBe(false);
  if (child) {
    expect(exitReceipt).toBeDefined();
    expect(exitReceipt!.code !== null || exitReceipt!.signal !== null).toBe(true);
  }
  expect(dependencyOverflow).toBe(false);
  expect(dependencyReceipts.filter(row => !row.allowed)).toEqual([]);
}, 20_000);

function expectDisabled(reply: Reply, head = false): void {
  expect(reply.status).toBe(503);
  expect(reply.headers["content-type"]).toMatch(/^application\/json/);
  expect(reply.headers["cache-control"]).toBe("no-store, private");
  expect(reply.headers["referrer-policy"]).toBe("no-referrer");
  expect(reply.headers["x-content-type-options"]).toBe("nosniff");
  expect(reply.headers["x-request-id"]).toBeTruthy();
  if (head) expect(reply.body).toBe("");
  else expect(JSON.parse(reply.body)).toEqual(DISABLED);
}

describe("Quick Order through the actual production composition root", () => {
  it.each(["/api/health/quick-order", "/api/health/quick-order/config", "/api/health/quick-order/requests"])(
    "refuses direct GET/HEAD before any fallback at %s", async target => {
      expectDisabled(await rawProbe(target));
      expectDisabled(await rawProbe(target, "HEAD"), true);
    });

  it.each([
    "//api/health/quick-order/requests", "////api/health/quick-order/requests?source=synthetic",
    "/API/HEALTH/QUICK-ORDER/requests", "/api//health/quick-order/requests",
    "/api/health/x/../quick-order/requests", "/api/health/x/%2e%2e/quick-order/requests",
    "/api/health/%2E/quick-order/requests", "/api\\health\\quick-order\\requests",
    "/api/health/quick-order%2Frequests", "/api%2Fhealth%2Fquick-order/requests",
    "/api/health/quick-order%5crequests", "/api/health/quick-order/../other",
    "/api/health/quick-order/%2e%2e/other",
    "http://quick-order.invalid/api/health/quick-order/requests",
    "http:////quick-order.invalid/api/health/quick-order/../other",
    "/api/health/quick-order#synthetic-fragment",
  ])("refuses literal owned raw target %s before JSON parsing", async target => {
    expectDisabled(await rawProbe(target, "POST", '{"synthetic":'));
  });

  it("refuses malformed and greater-than-2MiB owned bodies while the unrelated parser remains active", async () => {
    const oversized = JSON.stringify({ synthetic: "x".repeat(2 * 1024 * 1024) });
    expect(Buffer.byteLength(oversized)).toBeGreaterThan(2 * 1024 * 1024);
    for (const body of ['{"synthetic":', oversized]) {
      expectDisabled(await rawProbe("/api/health/quick-order/requests", "POST", body));
    }
    // The malformed400/oversized413 controls distinguish early refusal from an
    // app where JSON parsing was globally removed. Black-box HTTP cannot itself
    // inspect req.rawBody allocation; the unchanged mount-order source supplies
    // that structural evidence and the separate containment unit test spies it.
    const neighboring = "/api/health/quick-order-other";
    expect((await rawProbe(neighboring, "POST", '{"synthetic":')).status).toBe(400);
    expect((await rawProbe(neighboring, "POST", oversized)).status).toBe(413);
    const ordinary = await rawProbe(neighboring, "POST", '{"synthetic":true}');
    expect(ordinary.status).toBe(404);
    expect(JSON.parse(ordinary.body)).toEqual({ message: "Not Found" });
  }, 30_000);

  it("preserves health, public document, redirect and owned loopback proxy controls", async () => {
    const health = await rawProbe("/api/health");
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body).status).toBe("Xenios API is running");
    const publicDocument = await rawProbe("/");
    expect(publicDocument.status).toBe(200);
    expect(publicDocument.body).toContain("<!-- synthetic-root-build -->");
    expect(publicDocument.headers["x-robots-tag"]).toMatch(/^index,follow/);
    const gateway = await rawProbe("/health");
    expect(gateway.status).toBe(301);
    expect(gateway.headers.location).toBe("/");
    const unknown = await rawProbe("/__synthetic_unknown_public_document");
    expect(unknown.status).toBe(404);
    expect(unknown.headers["content-type"]).toMatch(/^text\/html/);
    const proxy = await rawProbe("/kairos/__qo_composition_probe");
    expect(proxy.status).toBe(200);
    expect(JSON.parse(proxy.body)).toEqual({ synthetic: "loopback-kairos" });
    expect(dependencyReceipts).toContainEqual({ method: "GET", target: "/kairos/__qo_composition_probe", allowed: true });
  });

  it("serves the disabled intake as private HTML through the real static root", async () => {
    const document = await rawProbe("/health/quick-order?ref=SYNTHETIC_ROOT_REFERRAL");
    expect(document.status).toBe(200);
    expect(document.headers["content-type"]).toMatch(/^text\/html/);
    expect(document.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(document.headers.link).toBeUndefined();
    expect(document.body).toContain("<!-- synthetic-root-build -->");
    expect(document.body).not.toMatch(/application\/ld\+json|rel="canonical"|property="og:|name="twitter:/);
    expect(document.body).not.toContain("SYNTHETIC_ROOT_REFERRAL");
  });
});

describe("Proposed Quick Order root document-header hardening pending Samuel's 8392d243 disposition", () => {
  it("requires the proposed private cache headers alongside the existing Helmet referrer policy", async () => {
    const document = await rawProbe("/health/quick-order?ref=SYNTHETIC_ROOT_REFERRAL");
    // Separate from the sixth pin above. Only Cache-Control and Pragma are
    // predicted absent here: root Helmet already supplies no-referrer. These
    // unskipped expectations remain source predictions, not executed results
    // or an approved runtime header requirement.
    expect(document.headers["cache-control"]).toBe("no-store, private");
    expect(document.headers.pragma).toBe("no-cache");
    expect(document.headers["referrer-policy"]).toBe("no-referrer");
  });
});
