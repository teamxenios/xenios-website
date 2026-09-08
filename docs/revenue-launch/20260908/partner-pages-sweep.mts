// Rendered sweep of every partner page in its real empty/pending state, on the
// candidate's built client, as an active affiliate. The REAL partner portal
// registrar runs over an in-memory port with no rows, mounted in front of the
// existing preview composition so the preview's route boundary does not mask
// the pages with 404s. Evidence-only; not part of the candidate.
import express from "express";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildResourceHubPreviewApp, RESOURCE_HUB_PREVIEW_PASSWORD, RESOURCE_HUB_PREVIEW_PERSONAS } from "./scripts/preview-resource-hub";
import { registerPartnerPortalApi } from "./server/research/partners/portal-routes";
import { createInMemoryPartnerPortalPort, type PortalPartnerIdentity } from "./server/research/partners/portal";
import { launchChromium } from "./scripts/evidence/lib/chrome.mjs";
import { CdpConnection, PageSession, sleep } from "./scripts/evidence/lib/cdp.mjs";

const PORT = 5241;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const root = process.cwd();
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const OUT = path.resolve("C:/Users/sboad/projects/xenios-qa-evidence-resource-hub-20260906", `partner-pages-sweep-${head.slice(0, 7)}`);
mkdirSync(OUT, { recursive: true });
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const AFFILIATE = RESOURCE_HUB_PREVIEW_PERSONAS.find((p) => p.partner?.role === "affiliate" && p.partner.state === "active")!;

const partners: PortalPartnerIdentity[] = RESOURCE_HUB_PREVIEW_PERSONAS.filter((p) => p.partner).map((p) => ({
  partnerId: p.partner!.partnerId, memberId: p.memberKey, role: p.partner!.role, state: p.partner!.state,
  identityVerified: true, taxStatus: "verified", payoutStatus: "verified", certifiedAt: "2026-08-01T00:00:00.000Z", activatedAt: "2026-08-01T00:00:00.000Z",
}));
const outer = express();
outer.use(express.json({ limit: "2mb" }));
const bearerOf = (req: express.Request) => { const h = req.get("authorization") ?? ""; return h.startsWith("Bearer ") ? h.slice(7) : null; };
const requireMember: express.RequestHandler = (req, res, next) => {
  const t = bearerOf(req); const persona = t ? RESOURCE_HUB_PREVIEW_PERSONAS.find((p) => p.token === t) : null;
  if (!persona) { res.status(401).json({ ok: false, code: "member_required" }); return; }
  (req as express.Request & { researchMember?: unknown }).researchMember = { id: persona.memberKey, status: "active" };
  next();
};
registerPartnerPortalApi(outer, { port: createInMemoryPartnerPortalPort({ partners }), submissionsEnabled: false }, { requireMember });
const inner = buildResourceHubPreviewApp(PORT);
outer.use(inner.app);
const server = await new Promise<import("node:http").Server>((resolve) => { const s = outer.listen(PORT, "127.0.0.1", () => resolve(s)); });

const PAGES = ["dashboard", "links", "campaigns", "events", "leads", "conversions", "commissions", "payouts", "organizations", "training", "resources", "compliance", "support", "security"] as const;
const steps: { step: string; passed: boolean; detail?: unknown; at: string }[] = [];
const record = (step: string, passed: boolean, detail?: unknown) => { steps.push({ step, passed, detail, at: new Date().toISOString() }); if (!passed) console.error("FAIL", step, JSON.stringify(detail)); };
async function center(page: PageSession, expr: string) {
  const box = await page.evaluate(`(() => { const el = (${expr}); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!box) throw new Error(`no element for ${expr}`); return box as { x: number; y: number };
}
async function click(page: PageSession, expr: string) { const { x, y } = await center(page, expr); await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); }
async function type(page: PageSession, expr: string, text: string) { await click(page, expr); await page.send("Input.insertText", { text }); }
async function waitFor(page: PageSession, expr: string, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(`Boolean(${expr})`)) return true; await sleep(100); } return false; }
const pendingAfterNavigate: { url: string; pending: string[] }[] = [];
async function nav(page: PageSession, url: string) { try { await page.navigate(url); } catch (error) { if (!String(error).includes("did not remain idle")) throw error; pendingAfterNavigate.push({ url, pending: [...page.inflight.values()].map((r: { url: string; type?: string }) => `${r.type ?? "?"} ${r.url}`) }); } }
async function shot(page: PageSession, name: string) { const s = await page.screenshot({ fullPage: true }); writeFileSync(path.join(OUT, `${name}.png`), s.bytes); return { file: `${name}.png`, sha256: sha256(s.bytes) }; }

const chrome = await launchChromium();
const conn = await new CdpConnection(chrome.wsUrl).open();
const pages: unknown[] = [];
try {
  const page = await PageSession.create(conn);
  await page.enforceNetworkBoundary(ORIGIN);
  await page.setViewport({ width: 1440, height: 900 });
  await nav(page, `${ORIGIN}/research/sign-in?returnTo=%2Fresearch%2Fpartners%2Fdashboard`);
  record("sign-in form rendered", await waitFor(page, `document.querySelector("#ms-email") && document.querySelector("#ms-password")`));
  await type(page, `document.querySelector("#ms-email")`, AFFILIATE.email);
  await type(page, `document.querySelector("#ms-password")`, RESOURCE_HUB_PREVIEW_PASSWORD);
  await click(page, `document.querySelector('[data-testid="button-member-signin"]')`);
  record("sign-in returns to the partner dashboard", await waitFor(page, `location.pathname === "/research/partners/dashboard"`, 15000), { pathname: await page.evaluate("location.pathname") });

  for (const name of PAGES) {
    const url = `${ORIGIN}/research/partners/${name}`;
    const per: Record<string, unknown> = { page: name, url };
    for (const width of [1440, 320] as const) {
      await page.setViewport({ width, height: 900, mobile: width < 768 });
      page.resetRecords();
      await nav(page, url);
      await sleep(600); await page.settle({ maxSettleMs: 8000 }).catch(() => {});
      const facts = await page.evaluate(`(() => ({
        pathname: location.pathname,
        sw: document.documentElement.scrollWidth, iw: window.innerWidth,
        main: document.querySelectorAll("main").length,
        h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()).slice(0, 3),
        alerts: [...document.querySelectorAll('[role="alert"]')].map((n) => n.textContent.trim()).slice(0, 3),
        status: [...document.querySelectorAll('[role="status"]')].map((n) => n.textContent.trim()).slice(0, 3),
        text: document.body.innerText.slice(0, 400),
      }))()`);
      const api = page.network.filter((r: { url: string }) => r.url.includes("/api/")).map((r: { url: string; status: number; method?: string }) => `${r.method ?? "GET"} ${new URL(r.url).pathname} ${r.status}`);
      const errors = page.console.filter((c: { level: string }) => c.level === "exception" || c.level === "error").map((c: { text: string }) => c.text);
      const s = await shot(page, `${name}-${width}`);
      const server5xx = page.network.some((r: { url: string; status: number }) => r.url.includes("/api/") && r.status >= 500);
      const passed = facts.pathname === `/research/partners/${name}` && facts.sw === facts.iw && facts.main === 1 && facts.h1.length >= 1 && errors.length === 0 && !server5xx;
      per[String(width)] = { ...facts, api, errors, screenshot: s };
      record(`${name} @${width}: renders one main landmark, an h1, no overflow, no page errors, no API 5xx`, passed, { pathname: facts.pathname, sw: facts.sw, iw: facts.iw, main: facts.main, h1: facts.h1, errors, api });
    }
    pages.push(per);
  }
  const report = {
    schemaVersion: 1,
    claimScope: "UI_PRESENTATION_EMPTY_STATES_OVER_REAL_PARTNER_PORTAL_ROUTES_WITH_EMPTY_IN_MEMORY_PORT",
    status: steps.every((s) => s.passed) ? "PASS" : "FAIL",
    observedAt: new Date().toISOString(),
    origin: ORIGIN,
    binding: { candidateHead: head, runtimeFreeze: "bf7b5fee78102289bcc6c68e9e336bb0ea0c9d5e", harnessSha256: sha256(readFileSync(new URL(import.meta.url))), node: process.version },
    browser: { chromePath: chrome.chromePath, revision: chrome.revision, version: chrome.browserVersion },
    persona: AFFILIATE.email,
    steps, pages, pendingAfterNavigate,
    limitations: [
      "Every partner table is empty by construction; this proves the pages' empty and pending states render, not their populated states.",
      "The preview's own fixtures answer /partner/me and /partner/dashboard; the other partner APIs are the real registrar over an empty in-memory port.",
      "Synthetic persona, no real account, no database, no production system.",
    ],
  };
  writeFileSync(path.join(OUT, "partner-pages-sweep.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ status: report.status, steps: steps.length, failed: steps.filter((s) => !s.passed).map((s) => s.step), out: OUT }, null, 2));
  process.exitCode = report.status === "PASS" ? 0 : 1;
  await page.close();
} catch (error) {
  writeFileSync(path.join(OUT, "partner-pages-sweep.partial.json"), JSON.stringify({ status: "ABORTED", error: String(error), steps, pages, pendingAfterNavigate }, null, 2) + "\n");
  throw error;
} finally {
  await conn.close().catch(() => {});
  await chrome.close();
  server.close();
}
