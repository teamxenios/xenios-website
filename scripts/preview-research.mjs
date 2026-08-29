// Local preview launcher for the research gateway (screenshots + QA only).
// Boots the PRODUCTION build with throwaway placeholder credentials so the
// password gate, the gateway and the Early Access surface render locally.
// Never used in deployment; every value here is a fixture, not a secret.
//
// WHY THE SUPABASE PLACEHOLDERS ARE HERE. This script previously set only the
// research password and session secret, and the header claimed it booted
// locally. It did not: the composition root builds the Supabase admin client
// eagerly, so `node scripts/preview-research.mjs` died at module load with
// "Supabase admin not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// missing)" before the server ever listened. Nobody could open the launch
// journey locally, which is why a visual check of the customer flow kept being
// deferred. The placeholders below only have to be present and well-formed for
// the client to construct.
//
// READ THIS BEFORE TRUSTING WHAT YOU SEE. The Supabase host below is not real,
// so every data-backed surface is running against an unreachable upstream:
//
//   * The catalogue does NOT show the canonical product set. It falls back to
//     a small declared set, and it does so with NO error banner, so the page
//     LOOKS healthy while showing a fraction of the catalog. Do not use this
//     harness to judge catalog completeness, pricing, or product pathways.
//   * Outbox and email are unconfigured, so nothing is sent. That is
//     deliberate: a preview must never email a real customer.
//
// It IS good for: page boots, layout and responsive widths, gate behaviour,
// stepper navigation, form fields and validation, and client-side console or
// network errors. It deliberately refuses every ambient external credential;
// use a separately reviewed harness for any data-dependent verification.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createImmutableDistSnapshot,
  importImmutableDistEntry,
  inventoryDirectory,
  inventorySha256,
} from "./evidence/lib/immutable-dist.mjs";
import {
  assertCleanCandidateCheckout,
  assertPinnedExecutingRuntime,
  validatePreviewProvenance,
} from "./evidence/lib/provenance.mjs";

const requestedPort = process.env.PORT || "5199";
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const distRoot = join(repoRoot, "dist");
const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
const candidateSha = git("rev-parse", "HEAD");
const checkout = assertCleanCandidateCheckout({ sha: candidateSha, cwd: repoRoot });
const executingRuntime = assertPinnedExecutingRuntime();
const provenance = JSON.parse(readFileSync(join(distRoot, "evidence-provenance.json"), "utf8"));
const validatedProvenance = validatePreviewProvenance(provenance, checkout);
if (
  validatedProvenance.nodeVersion !== executingRuntime.nodeVersion ||
  validatedProvenance.npmVersion !== executingRuntime.npmVersion
) {
  throw new Error("preview-research executing runtime differs from the verified build runtime");
}
const currentDistInventory = inventoryDirectory(distRoot, new Set(["evidence-provenance.json"]));
const currentDistHash = inventorySha256(currentDistInventory);
if (
  provenance.distFileCount !== currentDistInventory.length ||
  provenance.distInventorySha256 !== currentDistHash ||
  JSON.stringify(provenance.fileInventory) !== JSON.stringify(currentDistInventory)
) {
  throw new Error("preview-research distribution is not bound to the clean exact checkout");
}
// Serve an immutable copy. `dist/` is ignored and a concurrent build can replace
// an asset after the startup inventory check; express.static reads assets on
// demand, so serving the authoring directory would make cached provenance lie.
const immutableDist = createImmutableDistSnapshot({
  repoRoot,
  sourceDistRoot: distRoot,
  expectedInventory: provenance.fileInventory,
  expectedInventorySha256: provenance.distInventorySha256,
});
process.once("exit", () => {
  try {
    immutableDist.dispose();
  } catch {}
});
const portReservation = createServer();
await new Promise((resolveListen, reject) => {
  portReservation.once("error", reject);
  portReservation.listen(0, "127.0.0.1", resolveListen);
});
const reservationAddress = portReservation.address();
if (!reservationAddress || typeof reservationAddress === "string") {
  throw new Error("preview-research could not reserve an internal port");
}
const innerPort = reservationAddress.port;
await new Promise((resolveClose) => portReservation.close(resolveClose));

// Treat the launching shell as hostile input. Retain only operating-system
// process basics; every application/service variable is removed before the
// explicit fixtures below are installed. This is intentionally an allow-list:
// a newly added provider credential cannot silently escape an old deny-list.
const SAFE_RUNTIME_ENV = new Set([
  "APPDATA",
  "COMMONPROGRAMFILES",
  "COMMONPROGRAMFILES(X86)",
  "COMSPEC",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "NUMBER_OF_PROCESSORS",
  "PATH",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "TZ",
  "USERPROFILE",
  "WINDIR",
]);
for (const key of Object.keys(process.env)) {
  if (!SAFE_RUNTIME_ENV.has(key.toUpperCase())) delete process.env[key];
}

process.env.NODE_ENV = "production";
process.env.PORT = String(innerPort);
process.env.RESEARCH_ACCESS_PASSWORD = "preview";
process.env.RESEARCH_SESSION_SECRET = "preview-secret-not-production";
// Keep unauthenticated admin-boundary probes production-shaped (401 rather
// than "admin not configured" 503) without granting a session or supplying a
// deliverable address. The invalid TLD cannot receive external mail.
process.env.ADMIN_EMAIL = "preview-admin@example.invalid";

// Early Access is the launch surface, so the preview opens it rather than
// leaving it switched off. OPEN_ACCESS skips the code prompt entirely, which
// keeps the real access code out of this file and out of shell history.
process.env.RESEARCH_EARLY_ACCESS_ENABLED = "true";
process.env.RESEARCH_EARLY_ACCESS_OPEN_ACCESS = "true";
// PRODUCTION PARITY FOR THE ASSISTED-ORDER BRIDGE (2026-08-29 incident). The
// live service runs with the bridge ENABLED, an admin notification address and
// a required-agreements list; without these three the composition refuses and
// the Early Access order-request doors look "dark", which is exactly how the
// missing-dependency regression hid inside the evidence run. The values below
// are placeholders; the SHAPE is what matters. A 404 on
// /api/research/early-access/assisted-orders/config is a defect, never noise.
process.env.RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED = "true";
process.env.RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL =
  "preview-assisted-orders@example.invalid";
process.env.RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS =
  JSON.stringify([{ kind: "early_access_terms", version: "v1" }]);
process.env.RESEARCH_EARLY_ACCESS_SESSION_SECRET =
  "preview-early-access-secret-not-production";
process.env.RESEARCH_EARLY_ACCESS_OWNER_ID =
  "00000000-0000-4000-8000-000000000001";

// Own the placeholder upstream rather than assuming a conventional local port
// is unused. GET/HEAD return empty, non-sensitive fixtures; every mutation is
// refused. Binding an ephemeral loopback port first makes it impossible for a
// real local Supabase instance to receive a preview request or write.
const placeholderSupabase = createServer((req, res) => {
  const method = (req.method || "GET").toUpperCase();
  const requestPath = req.url || "/";
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (method !== "GET" && method !== "HEAD") {
    res.statusCode = 503;
    res.end(JSON.stringify({
      code: "preview_write_refused",
      message: "The isolated preview never accepts persistence mutations.",
    }));
    return;
  }
  const payload = requestPath.startsWith("/auth/v1/admin/users")
    ? { users: [] }
    : requestPath.startsWith("/auth/v1/")
      ? { user: null }
      : [];
  res.statusCode = 200;
  res.setHeader("Content-Range", "*/0");
  res.end(method === "HEAD" ? "" : JSON.stringify(payload));
});
placeholderSupabase.on("clientError", (_error, socket) => socket.destroy());
await new Promise((resolve, reject) => {
  placeholderSupabase.once("error", reject);
  placeholderSupabase.listen(0, "127.0.0.1", resolve);
});
const placeholderAddress = placeholderSupabase.address();
if (!placeholderAddress || typeof placeholderAddress === "string") {
  throw new Error("preview placeholder upstream did not bind a TCP port");
}
process.env.SUPABASE_URL = `http://127.0.0.1:${placeholderAddress.port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_preview_placeholder";
process.env.SUPABASE_ANON_KEY = "sb_publishable_preview_placeholder";

console.warn(
  "[preview] Supabase is an isolated READ-EMPTY/WRITE-REFUSING fixture.\n" +
    "[preview] The catalogue shown is NOT the canonical product set and carries no error\n" +
    "[preview] banner. Use this preview for layout, gating and form behaviour only.",
);

await importImmutableDistEntry(immutableDist);

let applicationReady = false;
for (let attempt = 0; attempt < 200; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${innerPort}/api/config`, {
      signal: AbortSignal.timeout(500),
    });
    if (response.status > 0) {
      applicationReady = true;
      break;
    }
  } catch {}
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
}
if (!applicationReady) throw new Error("preview-research application did not become ready");

const evidenceProxy = createServer((req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `127.0.0.1:${requestedPort}`}`);
  if (requestUrl.pathname === "/__xenios_evidence_provenance") {
    try {
      immutableDist.assertUnchanged();
    } catch (error) {
      res.statusCode = 409;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ code: "preview_snapshot_changed" }));
      return;
    }
    res.statusCode = 200;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      kind: provenance.kind,
      candidateSha: provenance.candidateSha,
      sourceTree: provenance.sourceTree,
      distInventorySha256: provenance.distInventorySha256,
      distFileCount: provenance.distFileCount,
      builtAtUtc: provenance.builtAtUtc,
      nodeVersion: provenance.nodeVersion,
      npmVersion: provenance.npmVersion,
      packageLockSha256: provenance.packageLockSha256,
      installMethod: provenance.installMethod,
    }));
    return;
  }
  const upstream = httpRequest({
    hostname: "127.0.0.1",
    port: innerPort,
    method: req.method,
    path: req.url,
    headers: req.headers,
  }, (upstreamResponse) => {
    res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });
  upstream.on("error", (error) => {
    if (res.headersSent) return res.destroy(error);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ code: "preview_upstream_unavailable" }));
  });
  req.pipe(upstream);
});
evidenceProxy.on("clientError", (_error, socket) => socket.destroy());
await new Promise((resolveListen, reject) => {
  evidenceProxy.once("error", reject);
  evidenceProxy.listen(Number(requestedPort), "127.0.0.1", resolveListen);
});
console.log(
  `[preview] evidence-bound candidate ${candidateSha} on http://127.0.0.1:${requestedPort} ` +
    `(inner application port ${innerPort}, dist inventory ${currentDistHash})`,
);
