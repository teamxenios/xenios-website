// Rendered walkthrough: affiliate recommendation links + QR export on the
// candidate's built client, driven by real Chromium input events over CDP.
//
// Server: the REAL registerReferralV1Api + createReferralV1Service + the REAL
// createSupabaseReferralV1Store, over a schema-valid fake RPC that answers
// listOwn for one active affiliate persona. The rest of the app is the
// existing Resource Hub preview composition, untouched. No production, no
// network beyond loopback, no real account.
//
// Evidence-only. This file is copied into the release records after the run;
// it is not part of the candidate.
import express from "express";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import qrcode from "qrcode-generator";
import { buildResourceHubPreviewApp, RESOURCE_HUB_PREVIEW_PASSWORD, RESOURCE_HUB_PREVIEW_PERSONAS } from "./scripts/preview-resource-hub";
import { registerReferralV1Api } from "./server/research/partners/referral-v1-routes";
import { createSupabaseReferralV1Store, REFERRAL_V1_SCHEMA_VERSION } from "./server/research/partners/referral-v1-store";
import { referralDigest, referralPublicToken } from "./server/research/partners/referral-v1-tokens";
import { launchChromium } from "./scripts/evidence/lib/chrome.mjs";
import { CdpConnection, PageSession, sleep } from "./scripts/evidence/lib/cdp.mjs";

const PORT = 5239;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SECRET = "qr-walkthrough-preview-secret-not-production-0123456789abcdef";
const root = process.cwd();
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const OUT = path.resolve("C:/Users/sboad/projects/xenios-qa-evidence-resource-hub-20260906", `qr-links-walkthrough-${head.slice(0, 7)}`);
mkdirSync(OUT, { recursive: true });
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

// --- personas -> canonical auth ids (preview-local, deterministic) -----------
const AFFILIATE = RESOURCE_HUB_PREVIEW_PERSONAS.find((p) => p.partner?.role === "affiliate" && p.partner.state === "active")!;
const PLAIN = RESOURCE_HUB_PREVIEW_PERSONAS.find((p) => !p.admin && p.partner === null)!;
const authIds = new Map(RESOURCE_HUB_PREVIEW_PERSONAS.map((p) => [p.token, randomUUID()]));
const partnerId = randomUUID();
const linkId = randomUUID();
const createdAt = new Date().toISOString();
const expiresAt = new Date(Date.now() + 29 * 86400000).toISOString();
const token = referralPublicToken(SECRET, linkId, 1)!;
const EXPECTED_URL = `${ORIGIN}/r/${token}`;
const fixtureLink = {
  id: linkId, partnerId, internalCode: linkId, tokenKeyVersion: 1, tokenHashHex: referralDigest(token),
  destinationPath: "/health", createdAt, expiresAt, revokedAt: null, availability: "ready", captureCount: 0, bindingCount: 0,
};

// --- expected QR, computed independently of the client bundle ---------------
function expectedQr(url: string) {
  const code = qrcode(0, "M"); code.addData(url, "Byte"); code.make();
  const modules = code.getModuleCount(); const size = modules + 8; let d = "";
  for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) if (code.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 8}" height="${size * 8}" role="img" aria-label="Xenios recommendation QR code"><rect width="${size}" height="${size}" fill="white"/><path d="${d}" fill="black" shape-rendering="crispEdges"/></svg>`;
  return { modules, size, path: d, svg };
}
const EXPECTED = expectedQr(EXPECTED_URL);

// --- server ---------------------------------------------------------------------
const rpcCalls: { name: string; operation: string | null }[] = [];
const fakeRpc = {
  async rpc(name: string, args?: Record<string, unknown>) {
    const operation = typeof args?.p_operation === "string" ? args.p_operation : null;
    rpcCalls.push({ name, operation });
    if (name === "research_referral_v1_authority") return { data: { ok: true, value: { schemaVersion: REFERRAL_V1_SCHEMA_VERSION } }, error: null };
    if (name === "research_referral_v1_execute" && operation === "listOwn") {
      const actor = (args?.p_input as { actorAuthUserId?: string })?.actorAuthUserId;
      const eligible = actor === authIds.get(AFFILIATE.token);
      return { data: { ok: true, value: eligible ? { eligible: true, partnerId, partnerState: "active", links: [fixtureLink] } : { eligible: false, partnerId: null, partnerState: null, links: [] } }, error: null };
    }
    return { data: null, error: { unavailable: true } };
  },
};
const outer = express();
const bearerOf = (req: express.Request) => { const h = req.get("authorization") ?? ""; return h.startsWith("Bearer ") ? h.slice(7) : null; };
const requireMember: express.RequestHandler = (req, res, next) => {
  const t = bearerOf(req); const persona = t ? RESOURCE_HUB_PREVIEW_PERSONAS.find((p) => p.token === t) : null;
  if (!persona) { res.status(401).json({ ok: false, code: "member_required" }); return; }
  (req as express.Request & { researchMember?: unknown }).researchMember = { id: persona.memberKey, auth_user_id: authIds.get(persona.token), status: "active" };
  next();
};
registerReferralV1Api(outer, {
  enabled: true, secret: SECRET, origin: ORIGIN, store: createSupabaseReferralV1Store(fakeRpc),
  async allowed() { return true; }, async lineage() { return { state: "unavailable", records: [] }; },
}, { requireMember, requireAdmin: (_req, res) => { res.status(403).json({ ok: false }); } });
const inner = buildResourceHubPreviewApp(PORT);
outer.use(inner.app);
const server = await new Promise<import("node:http").Server>((resolve) => { const s = outer.listen(PORT, "127.0.0.1", () => resolve(s)); });

// --- bindings ----------------------------------------------------------------------
function hashTree(dir: string): { files: number; sha256: string } {
  const entries: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else entries.push(`${path.relative(dir, p).replace(/\\/g, "/")}:${sha256(readFileSync(p))}`); } };
  walk(dir);
  return { files: entries.length, sha256: sha256(entries.join("\n")) };
}
const binding = {
  candidateHead: head,
  runtimeFreeze: "bf7b5fee78102289bcc6c68e9e336bb0ea0c9d5e",
  builtClient: hashTree(inner.clientDist),
  harnessSha256: sha256(readFileSync(new URL(import.meta.url))),
  linksRouteSha256: sha256(readFileSync(path.join(root, "server/research/partners/referral-v1-routes.ts"))),
  qrExportSha256: sha256(readFileSync(path.join(root, "client/src/research/recommendation/qr-export.ts"))),
  node: process.version,
};

// --- browser helpers ---------------------------------------------------------------
const steps: { step: string; passed: boolean; detail?: unknown; at: string }[] = [];
const record = (step: string, passed: boolean, detail?: unknown) => { steps.push({ step, passed, detail, at: new Date().toISOString() }); if (!passed) console.error("FAIL", step, JSON.stringify(detail)); };
async function center(page: PageSession, expr: string) {
  const box = await page.evaluate(`(() => { const el = (${expr}); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })()`);
  if (!box) throw new Error(`no element for ${expr}`);
  return box as { x: number; y: number; w: number; h: number };
}
async function click(page: PageSession, expr: string) {
  const { x, y } = await center(page, expr);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}
async function type(page: PageSession, expr: string, text: string) { await click(page, expr); await page.send("Input.insertText", { text }); }
const byText = (tag: string, text: string) => `[...document.querySelectorAll(${JSON.stringify(tag)})].find((b) => b.textContent.trim() === ${JSON.stringify(text)})`;
async function waitFor(page: PageSession, expr: string, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(`Boolean(${expr})`)) return true; await sleep(100); } return false; }
// The load event is the navigation gate; a request that never closes after
// load (observed: one Stylesheet) is recorded, not treated as a failure.
const pendingAfterNavigate: { url: string; pending: string[] }[] = [];
async function nav(page: PageSession, url: string) {
  try { await page.navigate(url); }
  catch (error) {
    if (!String(error).includes("did not remain idle")) throw error;
    pendingAfterNavigate.push({ url, pending: [...page.inflight.values()].map((r: { url: string; type?: string }) => `${r.type ?? "?"} ${r.url}`) });
  }
}
async function shot(page: PageSession, name: string) { const s = await page.screenshot({ fullPage: true }); writeFileSync(path.join(OUT, `${name}.png`), s.bytes); return { file: `${name}.png`, sha256: sha256(s.bytes), coverage: s.coverage }; }

const chrome = await launchChromium();
const conn = await new CdpConnection(chrome.wsUrl).open();
const downloads: { file: string; sha256: string; bytes: number }[] = [];
await conn.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: OUT, eventsEnabled: true });
let downloadDone: Promise<string> | null = null;
conn.on("Browser.downloadWillBegin", (p: { guid: string; suggestedFilename: string }) => {
  downloadDone = new Promise((resolve) => {
    const off = conn.on("Browser.downloadProgress", (q: { guid: string; state: string }) => { if (q.guid === p.guid && q.state === "completed") { off(); resolve(p.suggestedFilename); } });
  });
});

try {
  // ---- Journey A: active affiliate --------------------------------------------
  const page = await PageSession.create(conn);
  await page.enforceNetworkBoundary(ORIGIN);
  await page.setViewport({ width: 1440, height: 900 });
  await nav(page, `${ORIGIN}/research/partners/links`);
  const signInLink = `[...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Sign in" && (a.getAttribute("href") ?? "").includes("returnTo=%2Fresearch%2Fpartners%2Flinks"))`;
  const loginHref = await page.evaluate(`(${signInLink})?.getAttribute("href") ?? null`);
  const signedOutCopy = await page.evaluate(`document.body.innerText.includes("Sign in to manage your links") && document.body.innerText.includes("Signing in does not enroll you as an affiliate")`);
  record("signed-out Links page offers Sign in with exact return and the non-enrollment notice", loginHref === "/research/sign-in?returnTo=%2Fresearch%2Fpartners%2Flinks" && signedOutCopy === true, { loginHref, signedOutCopy });
  await shot(page, "01-links-signed-out");
  await click(page, signInLink);
  await page.settle({ maxSettleMs: 8000 }).catch(() => {});
  record("sign-in form rendered", await waitFor(page, `document.querySelector("#ms-email") && document.querySelector("#ms-password")`));
  await type(page, `document.querySelector("#ms-email")`, AFFILIATE.email);
  await type(page, `document.querySelector("#ms-password")`, RESOURCE_HUB_PREVIEW_PASSWORD);
  await click(page, `document.querySelector('[data-testid="button-member-signin"]')`);
  const landed = await waitFor(page, `location.pathname === "/research/partners/links" && ${byText("h2", "Your recommendation links")}`, 15000);
  await page.settle({ maxSettleMs: 8000 }).catch(() => {});
  record("sign-in returns to Links and lists recommendation links", landed, { pathname: await page.evaluate("location.pathname") });
  const shown = await page.evaluate(`(() => { const i = document.querySelector('[id^="recommendation-url-"]'); return i ? (i.value ?? i.textContent) : null; })()`);
  record("rendered shareable link equals the server-derived public URL", shown === EXPECTED_URL, { shown, expected: EXPECTED_URL });
  record("the fake RPC was driven through the real store: authority then listOwn", rpcCalls.some((c) => c.name === "research_referral_v1_authority") && rpcCalls.some((c) => c.operation === "listOwn"), { rpcCalls: rpcCalls.slice(0, 6) });
  await shot(page, "02-links-signed-in-1440");

  await click(page, byText("button", "Preview print card"));
  record("print card dialog opens", await waitFor(page, `document.querySelector('[role="dialog"][aria-modal="true"] svg path')`, 10000));
  await page.settle({ maxSettleMs: 8000 }).catch(() => {});
  const renderedPath = await page.evaluate(`document.querySelector('[role="dialog"] svg path')?.getAttribute("d") ?? null`);
  const renderedViewBox = await page.evaluate(`document.querySelector('[role="dialog"] svg')?.getAttribute("viewBox") ?? null`);
  record("rendered QR modules equal an independently generated QR of the exact URL", renderedPath === EXPECTED.path && renderedViewBox === `0 0 ${EXPECTED.size} ${EXPECTED.size}`, { modules: EXPECTED.modules, viewBox: renderedViewBox, pathLength: renderedPath?.length ?? null, expectedPathLength: EXPECTED.path.length });
  const cardUrl = await page.evaluate(`(() => { const dlg = document.querySelector('[role="dialog"]'); return dlg ? dlg.textContent.includes(${JSON.stringify(EXPECTED_URL)}) : false; })()`);
  record("print card shows the exact URL as text", cardUrl === true);
  // Independent decode: rasterize the rendered SVG and read it back with jsQR.
  await page.evaluate(readFileSync(path.join(root, "node_modules/jsqr/dist/jsQR.js"), "utf8"), { awaitPromise: false });
  const decoded = await page.evaluate(`(async () => { const svg = document.querySelector('[role="dialog"] svg'); const xml = new XMLSerializer().serializeToString(svg); const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("svg image failed")); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml); }); const c = document.createElement("canvas"); c.width = 600; c.height = 600; const ctx = c.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 600, 600); ctx.drawImage(img, 0, 0, 600, 600); const d = ctx.getImageData(0, 0, 600, 600); const r = window.jsQR(d.data, 600, 600); return r ? r.data : null; })()`);
  record("jsQR decodes the rendered QR to the exact URL", decoded === EXPECTED_URL, { decoded });
  await shot(page, "03-print-card-1440");
  await click(page, byText("button", "Close preview"));
  record("print card closes", await waitFor(page, `!document.querySelector('[role="dialog"]')`, 5000));

  await click(page, byText("button", "Download QR (SVG)"));
  const name = await Promise.race([(async () => { const t0 = Date.now(); while (!downloadDone && Date.now() - t0 < 10000) await sleep(50); return downloadDone ? await downloadDone : null; })(), sleep(15000).then(() => null)]);
  const saved = name && existsSync(path.join(OUT, name)) ? readFileSync(path.join(OUT, name)) : null;
  if (saved) downloads.push({ file: name!, sha256: sha256(saved), bytes: saved.length });
  record("Download QR saves an SVG whose bytes equal the expected QR SVG", saved !== null && saved.toString("utf8") === EXPECTED.svg, { file: name, bytes: saved?.length ?? null, expectedBytes: Buffer.byteLength(EXPECTED.svg) });
  const status = await page.evaluate(`[...document.querySelectorAll('[role="status"]')].map((n) => n.textContent.trim()).filter(Boolean)`);
  record("download status message is the honest one", Array.isArray(status) && status.some((s: string) => s.startsWith("QR download requested")), { status });

  // ---- Width sweep: signed-in Links page and open print card ----------------------
  const widths = [320, 390, 768, 1024, 1440];
  const sweep: unknown[] = [];
  for (const w of widths) {
    await page.setViewport({ width: w, height: 900, mobile: w < 768 });
    await sleep(200);
    const m1 = await page.evaluate(`({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })`);
    const s1 = await shot(page, `04-links-${w}`);
    await click(page, byText("button", "Preview print card"));
    await waitFor(page, `document.querySelector('[role="dialog"] svg path')`, 10000);
    const m2 = await page.evaluate(`({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })`);
    const s2 = await shot(page, `05-print-card-${w}`);
    await click(page, byText("button", "Close preview"));
    await waitFor(page, `!document.querySelector('[role="dialog"]')`, 5000);
    sweep.push({ width: w, links: { ...m1, ...s1 }, card: { ...m2, ...s2 } });
    record(`no horizontal overflow at ${w}px (links page and print card)`, m1.sw === m1.iw && m2.sw === m2.iw, { links: m1, card: m2 });
  }
  const consoleA = page.console.slice();
  const violationsA = page.networkBoundaryViolations.slice();

  // ---- Rendered sign-out, then Journey B on the same page ---------------------------
  await page.setViewport({ width: 1440, height: 900, mobile: false });
  await nav(page, `${ORIGIN}/research/account`);
  const hasSignOut = await waitFor(page, byText("button", "Sign out"), 10000);
  record("account page offers a rendered Sign out", hasSignOut);
  await click(page, byText("button", "Sign out"));
  await sleep(1000); await page.settle({ maxSettleMs: 8000 }).catch(() => {});
  await nav(page, `${ORIGIN}/research/partners/links`);
  const signedOutAgain = await waitFor(page, `document.body.innerText.includes("Sign in to manage your links")`, 10000);
  record("after Sign out the Links page is signed out again and shows no links", signedOutAgain && (await page.evaluate(`!document.querySelector('[id^="recommendation-url-"]')`)) === true);

  // ---- Journey B: member without a partner (negative control) --------------------
  const pageB = page;
  await nav(pageB, `${ORIGIN}/research/sign-in?returnTo=%2Fresearch%2Fpartners%2Flinks`);
  await waitFor(pageB, `document.querySelector("#ms-email")`);
  await type(pageB, `document.querySelector("#ms-email")`, PLAIN.email);
  await type(pageB, `document.querySelector("#ms-password")`, RESOURCE_HUB_PREVIEW_PASSWORD);
  await click(pageB, `document.querySelector('[data-testid="button-member-signin"]')`);
  await sleep(1500); await pageB.settle({ maxSettleMs: 8000 }).catch(() => {});
  const bodyB = await pageB.evaluate("document.body.innerText");
  const noExport = await pageB.evaluate(`!(${byText("button", "Download QR (SVG)")}) && !(${byText("button", "Preview print card")})`);
  record("member without a partner is told referral access is not active, with no export controls", (bodyB.includes("Referral access is not active") || bodyB.includes("being prepared") || bodyB.includes("partner platform")) && noExport === true, { pathname: await pageB.evaluate("location.pathname"), noExport });
  await shot(pageB, "06-links-no-partner");
  const consoleB = pageB.console.slice();
  await pageB.close();

  // ---- API denials without a bearer ----------------------------------------------
  const anon = await fetch(`${ORIGIN}/api/research/partner/links`);
  record("GET /api/research/partner/links without a session is 401", anon.status === 401, { status: anon.status });

  const report = {
    schemaVersion: 1,
    claimScope: "UI_PRESENTATION_AND_QR_EXPORT_OVER_REAL_REFERRAL_ROUTE_WITH_FAKE_RPC",
    status: steps.every((s) => s.passed) ? "PASS" : "FAIL",
    observedAt: new Date().toISOString(),
    origin: ORIGIN,
    binding,
    browser: { chromePath: chrome.chromePath, revision: chrome.revision, version: chrome.browserVersion, protocol: chrome.protocolVersion },
    fixture: { affiliatePersona: AFFILIATE.email, plainPersona: PLAIN.email, destinationPath: fixtureLink.destinationPath, expectedUrlSha256: sha256(EXPECTED_URL), qrModules: EXPECTED.modules },
    steps, sweep, downloads,
    console: { journeyA: consoleA, journeyB: consoleB },
    networkBoundaryViolations: violationsA,
    pendingAfterNavigate,
    limitations: [
      "The referral store is the real Supabase adapter over a fake RPC that answers listOwn for one persona; SQL eligibility, issuance and revocation are not exercised here (they have their own 2026-09-04 rehearsal evidence).",
      "Auth is the preview GoTrue stub with synthetic personas; no real account, database, network or production system was touched.",
      "QR download was captured by Chromium's download behaviour on loopback; the save-dialog UX of a real user's browser is not represented.",
    ],
  };
  writeFileSync(path.join(OUT, "qr-links-walkthrough.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ status: report.status, steps: steps.length, failed: steps.filter((s) => !s.passed).map((s) => s.step), out: OUT, downloads }, null, 2));
  process.exitCode = report.status === "PASS" ? 0 : 1;
} catch (error) {
  writeFileSync(path.join(OUT, "qr-links-walkthrough.partial.json"), JSON.stringify({ status: "ABORTED", error: String(error), steps, pendingAfterNavigate, at: new Date().toISOString() }, null, 2) + "\n");
  throw error;
} finally {
  await conn.close().catch(() => {});
  await chrome.close();
  server.close();
}
