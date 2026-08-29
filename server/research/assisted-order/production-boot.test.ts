// PRODUCTION COMPOSITION BOOT TEST (2026-08-29 incident).
//
// The assisted-order bridge disappeared from production because the REAL
// composition root (server/index.ts) refused the composition under the real
// environment shape while every lower test built its own inputs. This test
// boots server/index.ts itself, as a child process, with the production
// env-var NAME SET (placeholder values, no secrets) and asserts what a customer
// would receive on every assisted-order door. Against 679564fc it fails
// (config answered a generic 404); against the recut it must pass.
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, "production-env-shape.fixture.json"), "utf8"),
) as { env: Record<string, string> };

const CONFIG_DOOR = "/api/research/early-access/assisted-orders/config";
const CATALOG_DOOR = "/api/research/early-access/assisted-orders/catalog";
const SUBMIT_DOOR = "/api/research/early-access/assisted-orders";
const ADMIN_LIST_DOOR = "/api/admin/research/assisted-orders";
const PROBE_REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const PROBE_DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const PROBE_PUBLIC_REFERENCE = "XRR-20260829-A1B2C3D4E5";
// Every door with the method it is registered for. A probe with the wrong
// method is a legitimate 404 (no such registration); the contract under test is
// that the REGISTERED method never falls through to the generic API 404.
type DoorMethod = "GET" | "POST" | "PATCH";
type Door = Readonly<{
  method: DoorMethod;
  registrationPath: string;
  probePath: string;
  admin: boolean;
}>;
const DOORS: readonly Door[] = [
  { method: "GET", registrationPath: CONFIG_DOOR, probePath: CONFIG_DOOR, admin: false },
  { method: "GET", registrationPath: CATALOG_DOOR, probePath: CATALOG_DOOR, admin: false },
  { method: "POST", registrationPath: SUBMIT_DOOR, probePath: SUBMIT_DOOR, admin: false },
  {
    method: "GET",
    registrationPath: "/api/research/early-access/assisted-orders/:publicReference",
    probePath: `/api/research/early-access/assisted-orders/${PROBE_PUBLIC_REFERENCE}`,
    admin: false,
  },
  {
    method: "POST",
    registrationPath: "/api/research/early-access/assisted-orders/:requestId/documents/upload-url",
    probePath: `/api/research/early-access/assisted-orders/${PROBE_REQUEST_ID}/documents/upload-url`,
    admin: false,
  },
  {
    method: "POST",
    registrationPath: "/api/research/early-access/assisted-orders/:requestId/documents/:documentId/complete",
    probePath: `/api/research/early-access/assisted-orders/${PROBE_REQUEST_ID}/documents/${PROBE_DOCUMENT_ID}/complete`,
    admin: false,
  },
  { method: "GET", registrationPath: ADMIN_LIST_DOOR, probePath: ADMIN_LIST_DOOR, admin: true },
  {
    method: "GET",
    registrationPath: "/api/admin/research/assisted-orders/:requestId",
    probePath: `/api/admin/research/assisted-orders/${PROBE_REQUEST_ID}`,
    admin: true,
  },
  {
    method: "PATCH",
    registrationPath: "/api/admin/research/assisted-orders/:requestId/status",
    probePath: `/api/admin/research/assisted-orders/${PROBE_REQUEST_ID}/status`,
    admin: true,
  },
  {
    method: "POST",
    registrationPath: "/api/admin/research/assisted-orders/:requestId/documents/:documentId/download-url",
    probePath: `/api/admin/research/assisted-orders/${PROBE_REQUEST_ID}/documents/${PROBE_DOCUMENT_ID}/download-url`,
    admin: true,
  },
];

const BOOT_TIMEOUT_MS = 120_000;
const temps: string[] = [];
const children: ChildProcess[] = [];

afterAll(() => {
  for (const child of children) child.kill("SIGKILL");
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function builtShellFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xr-boot-dist-"));
  temps.push(dir);
  fs.writeFileSync(
    path.join(dir, "index.html"),
    "<!doctype html><html lang=\"en\"><head><title>boot</title></head><body><div id=\"root\"></div></body></html>",
    "utf8",
  );
  fs.mkdirSync(path.join(dir, "hino"), { recursive: true });
  fs.writeFileSync(path.join(dir, "hino", "index.html"), "<!doctype html><html><head><title>hino</title></head><body>hino</body></html>", "utf8");
  return dir;
}

type Probe = Readonly<{ status: number; body: string; json: unknown }>;
type Boot = Readonly<{
  port: number;
  log: () => string;
  request: (method: DoorMethod, route: string) => Promise<Probe>;
  get: (route: string) => Promise<Probe>;
  stop: () => void;
}>;

async function bootProductionRoot(envOverrides: Record<string, string | undefined>): Promise<Boot> {
  const port = await freePort();
  const env: Record<string, string> = {
    // The child inherits ONLY what the fixture states plus the process basics,
    // so an ambient developer variable can never make the bridge look enabled.
    PATH: process.env.PATH ?? "",
    SYSTEMROOT: process.env.SYSTEMROOT ?? "",
    TEMP: process.env.TEMP ?? os.tmpdir(),
    TMP: process.env.TMP ?? os.tmpdir(),
    HOME: process.env.HOME ?? os.homedir(),
    ...FIXTURE.env,
    NODE_ENV: "production",
    PORT: String(port),
    XENIOS_STATIC_DIST_DIR: builtShellFixture(),
  };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  const cli = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const child = spawn(process.execPath, [cli, "server/index.ts"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let output = "";
  child.stdout?.on("data", (chunk) => { output += String(chunk); });
  child.stderr?.on("data", (chunk) => { output += String(chunk); });
  const base = `http://127.0.0.1:${port}`;
  const request = async (method: DoorMethod, route: string): Promise<Probe> => {
    const carriesJsonBody = method !== "GET";
    const response = await fetch(base + route, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: carriesJsonBody ? { "content-type": "application/json" } : undefined,
      body: carriesJsonBody ? "{}" : undefined,
    });
    const body = await response.text();
    let json: unknown = null;
    try { json = JSON.parse(body); } catch { json = null; }
    return { status: response.status, body, json };
  };
  const get = (route: string) => request("GET", route);
  const startedAt = Date.now();
  let ready = false;
  while (Date.now() - startedAt < BOOT_TIMEOUT_MS - 10_000) {
    if (child.exitCode !== null) break;
    try {
      const health = await get("/api/health");
      if (health.status === 200) { ready = true; break; }
    } catch { /* not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) {
    child.kill("SIGKILL");
    throw new Error(`server/index.ts did not become ready on ${port}; exit=${child.exitCode}; output tail:\n${output.slice(-2000)}`);
  }
  return {
    port,
    log: () => output,
    request,
    get,
    stop: () => child.kill("SIGKILL"),
  };
}

async function expectNoGenericDoor404(boot: Boot): Promise<void> {
  for (const door of DOORS) {
    const probe = await boot.request(door.method, door.probePath);
    expect(probe.status, `${door.method} ${door.registrationPath} must never fall through to the generic API 404`).not.toBe(404);
    expect(probe.body, `${door.method} ${door.registrationPath} answered the generic API fallback body`).not.toBe("{\"message\":\"Not Found\"}");
  }
}

describe("the real production composition root (server/index.ts) under the production env shape", () => {
  it("keeps the browser-evidence preview isolated from ambient external credentials", () => {
    const source = fs.readFileSync(path.join(ROOT, "scripts", "preview-research.mjs"), "utf8");
    const fixtureSource = fs.readFileSync(
      path.join(ROOT, "scripts", "evidence", "lib", "preview-supabase-fixture.mjs"),
      "utf8",
    );
    const scrubIndex = source.indexOf("for (const key of Object.keys(process.env))");
    const loopbackIndex = source.indexOf("placeholderSupabase.listen(0, \"127.0.0.1\"");
    const allowListStart = source.indexOf("const SAFE_RUNTIME_ENV = new Set([");
    const allowListEnd = source.indexOf("]);", allowListStart);
    const allowListSource = source.slice(allowListStart, allowListEnd);
    expect(allowListStart).toBeGreaterThan(-1);
    expect(allowListEnd).toBeGreaterThan(allowListStart);
    expect(scrubIndex).toBeGreaterThan(-1);
    expect(loopbackIndex).toBeGreaterThan(scrubIndex);
    expect(source).toContain(
      'process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_preview_placeholder";',
    );
    expect(source).toContain(
      'from "./evidence/lib/preview-supabase-fixture.mjs";',
    );
    expect(fixtureSource).toContain('code: "preview_write_refused"');
    expect(source).toContain(
      'process.env.ADMIN_EMAIL = "preview-admin@example.invalid";',
    );
    expect(source).toContain('process.env.RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED = "true";');
    expect(source).toContain('process.env.RESEARCH_EARLY_ACCESS_OWNER_ID =');
    expect(source).not.toMatch(/SUPABASE_(?:URL|SERVICE_ROLE_KEY|ANON_KEY)\s*=\s*process\.env\./);
    for (const key of [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_ANON_KEY",
      "DATABASE_URL",
      "ADMIN_EMAIL",
      "RESEND_API_KEY",
      "ORDER_WEBHOOK_URL",
    ]) {
      expect(allowListSource, `${key} must not survive the preview allow-list`).not.toContain(`"${key}"`);
    }
  });

  it("keeps exactly ten literal registrations in their guarded, collision-safe source order", () => {
    const source = fs.readFileSync(path.join(ROOT, "server", "index.ts"), "utf8");
    let previousIndex = -1;
    for (const door of DOORS) {
      const expressMethod = door.method.toLowerCase();
      const guard = door.admin ? "requireSupabaseAdmin, " : "";
      const literal = `app.${expressMethod}("${door.registrationPath}", ${guard}assistedOrderDoor("${door.method}", "${door.registrationPath}"));`;
      expect(source.split(literal).length - 1, literal).toBe(1);
      const sourceIndex = source.indexOf(literal);
      expect(sourceIndex, `${literal} must follow the preceding assisted-order registration`).toBeGreaterThan(previousIndex);
      previousIndex = sourceIndex;
    }
    expect(DOORS.filter((door) => door.admin)).toHaveLength(4);
    expect(DOORS.filter((door) => !door.admin)).toHaveLength(6);
  });

  it("mounts the assisted-order bridge with the production-baseline audit mode and answers the config door 200 enabled:true", async () => {
    const boot = await bootProductionRoot({});
    try {
      expect(boot.log()).toContain("assisted order bridge mounted (audit mode: log_line_nondurable)");
      const config = await boot.get(CONFIG_DOOR);
      expect(config.status).toBe(200);
      const body = config.json as Record<string, unknown>;
      expect(body.enabled).toBe(true);
      expect(body.code).toBeNull();
      expect(body.formId).toBe("assisted_order_form_v1");
      expect(body.requiredAgreements).toEqual([{ kind: "early_access_terms", version: "v1" }]);
      // catalog and submission need a session: a refusal, never a missing route
      expect([401, 403]).toContain((await boot.get(CATALOG_DOOR)).status);
      expect([400, 401, 403]).toContain((await boot.request("POST", SUBMIT_DOOR)).status);
      // admin doors refuse without the admin session
      expect([401, 403]).toContain((await boot.get(ADMIN_LIST_DOOR)).status);
      // The in-memory HTTP E2E suite exercises all ten enabled handlers. This
      // real-root test keeps the enabled smoke on the four non-mutating/guarded
      // probes above so placeholder production dependencies are never queried;
      // all ten real registrations are probed below in every unavailable state,
      // which is the incident mode this regression test exists to lock down.
      // the production shell still serves and the health door is up
      expect((await boot.get("/")).status).toBe(200);
      expect((await boot.get("/hino/")).status).toBe(200);
    } finally {
      boot.stop();
    }
  }, BOOT_TIMEOUT_MS);

  it("answers an EXPLICIT disabled state, not a generic 404, when the bridge flag is off", async () => {
    const boot = await bootProductionRoot({ RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED: "false" });
    try {
      expect(boot.log()).toContain("assisted order bridge not mounted: assisted_order_bridge_disabled");
      const config = await boot.get(CONFIG_DOOR);
      expect(config.status).toBe(200);
      expect(config.json).toMatchObject({ enabled: false, code: "assisted_order_unavailable", reason: "assisted_order_bridge_disabled" });
      const catalog = await boot.get(CATALOG_DOOR);
      expect(catalog.status).toBe(503);
      expect(catalog.json).toMatchObject({ error: "assisted_order_unavailable", reason: "assisted_order_bridge_disabled" });
      // nothing can be submitted while disabled: the refusal is explicit
      const submit = await boot.request("POST", SUBMIT_DOOR);
      expect([401, 403, 503]).toContain(submit.status);
      await expectNoGenericDoor404(boot);
    } finally {
      boot.stop();
    }
  }, BOOT_TIMEOUT_MS);

  it("refuses explicitly (never a generic 404) when durable audit is demanded but its authority is absent", async () => {
    const boot = await bootProductionRoot({ RESEARCH_ASSISTED_ORDER_AUDIT_ENABLED: "true" });
    try {
      expect(boot.log()).toContain("assisted-order bridge refused: assisted_order_dependencies_missing:audit (audit mode: unavailable)");
      const config = await boot.get(CONFIG_DOOR);
      expect(config.status).toBe(200);
      expect(config.json).toMatchObject({ enabled: false, code: "assisted_order_unavailable" });
      expect(String((config.json as Record<string, unknown>).reason)).toContain("audit");
      expect((await boot.get(CATALOG_DOOR)).status).toBe(503);
      await expectNoGenericDoor404(boot);
    } finally {
      boot.stop();
    }
  }, BOOT_TIMEOUT_MS);

  it("fails safely on a malformed required-agreements list: explicit unavailable state, no submission possible, no generic 404", async () => {
    // Without a valid agreement list the durable agreement gate is not built,
    // so the composition refuses on the missing submission standing rather
    // than mounting a bridge that could accept an order nobody agreed to.
    const boot = await bootProductionRoot({ RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS: "not-json" });
    try {
      const config = await boot.get(CONFIG_DOOR);
      expect(config.status).toBe(200);
      expect(config.json).toMatchObject({ enabled: false, code: "assisted_order_unavailable" });
      expect(String((config.json as Record<string, unknown>).reason)).toContain("submissionStanding");
      expect([401, 403, 503]).toContain((await boot.request("POST", SUBMIT_DOOR)).status);
      await expectNoGenericDoor404(boot);
    } finally {
      boot.stop();
    }
  }, BOOT_TIMEOUT_MS);
});
