// Bounded LOCAL_SYNTHETIC_ONLY workflow evidence, not a full release manifest.
// Start preview-native-closeout.ts first against the exact built distribution.
// node scripts/evidence/native-closeout-browser.mjs --base-url http://127.0.0.1:52941
//   --out-dir <fresh-absolute-external-directory> --dist-dir <absolute-dist> --sha <40-char-build-sha>
// --widths is diagnostic only; normal acceptance uses the full default matrix.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { launchChromium } from "./lib/chrome.mjs";
import { CdpConnection, PageSession, sleep } from "./lib/cdp.mjs";
import { PAGE_AUDIT_SOURCE, FOCUS_BASELINE_RESET_SOURCE, FOCUS_BASELINE_SOURCE, FOCUS_PROBE_SOURCE } from "./lib/page-audit.js";
import { analyseFocusWalk, evaluateAudit, runVerdict } from "./lib/report.mjs";
import { inventoryDirectory, inventorySha256 } from "./lib/immutable-dist.mjs";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  assert.ok(["--base-url", "--out-dir", "--dist-dir", "--sha", "--widths"].includes(process.argv[i]), "Unknown argument");
  args[process.argv[i].slice(2)] = process.argv[i + 1];
}
const origin = args["base-url"];
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin ?? ""), "Explicit loopback origin required");
assert.match(args.sha ?? "", /^[a-f0-9]{40}$/);
assert.ok(args["out-dir"] && args["dist-dir"], "--out-dir and --dist-dir required");
const out = resolve(args["out-dir"]);
assert.ok(!existsSync(out), "Evidence output must be fresh");
const dist = resolve(args["dist-dir"]);
const provenance = JSON.parse(readFileSync(join(dist, "evidence-provenance.json"), "utf8"));
assert.equal(provenance.candidateSha, args.sha);
const inventory = inventoryDirectory(dist, new Set(["evidence-provenance.json"]));
assert.equal(inventorySha256(inventory), provenance.distInventorySha256, "Distribution bytes differ from provenance");
const served = await fetch(`${origin}/__native_preview/build`).then((r) => r.json());
assert.deepEqual(served.provenance, provenance, "Preview must serve the intended distribution");
const fixture = await fetch(`${origin}/__native_preview`).then((r) => r.json());
assert.equal(fixture.kind, "native-closeout-synthetic");
mkdirSync(join(out, "captures"), { recursive: true });
const runs = [], journey = [];
const widths = args.widths ? args.widths.split(",").map(Number) : [1440, 1366, 1024, 768, 430, 390, 375, 360, 320];
const configurations = [...widths.map((width) => ({ width, variant: "default", deviceScaleFactor: 1 })),
  { width: 720, variant: "zoom-200", deviceScaleFactor: 2 }, { width: 390, variant: "reduced-motion", deviceScaleFactor: 1 }, { width: 390, variant: "forced-colors", deviceScaleFactor: 1 }];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const sourcePaths = execFileSync("git", ["ls-files", "server", "shared", "scripts/preview-native-closeout.ts", "scripts/evidence/native-closeout-browser.mjs"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
// The whole server/shared inventory includes every production module transitively
// used by this harness. Bind actual runtime source, independently of SPA bytes.
for (const path of ["scripts/preview-native-closeout.ts", "scripts/evidence/native-closeout-browser.mjs"]) if (!sourcePaths.includes(path)) sourcePaths.push(path);
const sourceInventory = sourcePaths.sort().map((path) => ({ path, sha256: hash(readFileSync(path)) }));
const sourceBinding = { sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sourceTree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim(), cleanCheckout: execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).trim().length === 0, inventorySha256: hash(JSON.stringify(sourceInventory)), files: sourceInventory };
sourceBinding.sameBuildTree = sourceBinding.sourceTree === provenance.sourceTree;
const write = (file, data) => writeFileSync(join(out, file), JSON.stringify(data, null, 2) + "\n");
const api = async (path, token, method = "GET", body) => {
  const response = await fetch(origin + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, bodySha256: hash(text) };
};
const loginApi = async (email) => (await api("/preview-backend/auth/v1/token?grant_type=password", null, "POST", { email, password: "native-preview-password" })).body.access_token;
let browser, connection, page;
let failure = null;
const waitFor = async (source, label) => {
  for (let i = 0; i < 100; i++) { if (await page.evaluate(source)) return; await sleep(100); }
  throw new Error(`Timed out: ${label}`);
};
const fill = async (selector, value) => page.evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw new Error('input missing'); const prototype=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
const click = async (selector) => page.evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el || el.disabled) throw new Error('action unavailable'); el.click(); return true; })()`);
const focusWalk = async () => {
  await page.evaluate("(document.activeElement?.blur(),window.scrollTo(0,0),true)");
  await page.evaluate(FOCUS_BASELINE_RESET_SOURCE);
  const expected = new Set(), probes = [];
  for (let i = 0; i < 120; i++) {
    const baseline = await page.evaluate(FOCUS_BASELINE_SOURCE);
    for (const id of baseline.tabbableIdentities ?? []) expected.add(id);
    await page.pressTab();
    const probe = await page.evaluate(FOCUS_PROBE_SOURCE); probes.push(probe);
    if (probe.body && i > 0) break;
  }
  return analyseFocusWalk(probes, { maxStops: 120, expectedIdentities: [...expected] });
};
async function capture(name, path, config, expectedText, expectedHttpFailures = []) {
  await page.setViewport({ width: config.width, height: config.width < 769 ? 844 : 900, deviceScaleFactor: config.deviceScaleFactor, mobile: config.width < 769 });
  await page.setMedia({ reducedMotion: config.variant === "reduced-motion", forcedColors: config.variant === "forced-colors" });
  if (path) await page.navigate(origin + path);
  await waitFor(`document.body.innerText.toLowerCase().includes(${JSON.stringify(expectedText.toLowerCase())})`, name);
  await page.evaluate("(() => { sessionStorage.setItem('xenios-pwa-hint-dismissed','1'); document.querySelector('[aria-label=\"Dismiss\"]')?.click(); return true; })()");
  await page.settle({ quietMs: 300, maxSettleMs: 4000 });
  const audit = await page.evaluate(PAGE_AUDIT_SOURCE);
  const walk = await focusWalk();
  await page.evaluate("(window.scrollTo(0,0),true)");
  const assertions = evaluateAudit(audit, { focusWalk: walk, console: page.console.slice(), network: page.network.slice(), networkBoundaryViolations: page.networkBoundaryViolations.slice(), expectedHttpFailures });
  assertions.push({ id: "EXPECTED_WORKFLOW_STATE", result: "PASS", detail: expectedText });
  const screenshot = await page.screenshot();
  const key = `${name}-${config.width}-${config.variant}`;
  const imagePath = `captures/${key}.png`;
  writeFileSync(join(out, imagePath), screenshot.bytes);
  writeFileSync(join(out, `captures/${key}.text.txt`), await page.evaluate("document.body.innerText"));
  const result = { name, config, path: await page.evaluate("location.pathname"), assertions, audit, focusWalk: walk, network: page.network, console: page.console, screenshot: imagePath, screenshotSha256: hash(screenshot.bytes), screenshotCoverage: screenshot.coverage, verdict: runVerdict(assertions) };
  write(`${key}.json`, result); runs.push(result);
  console.log(`${result.verdict} ${key}`);
}
try {
  browser = await launchChromium(); connection = await new CdpConnection(browser.wsUrl).open(); page = await PageSession.create(connection);
  await page.enforceNetworkBoundary(origin);
  for (const width of [1440, 320]) for (const [name, path] of [["questions", "/admin/research/questions"], ["orders", "/admin/research/orders"], ["commerce-queues", "/admin/research/commerce-queues"]]) {
    await capture(`${name}-signedout`, path, { width, variant: "signedout", deviceScaleFactor: 1 }, "Sign in required");
  }
  await page.setViewport({ width: 1440, height: 900 });
  await page.navigate(origin + "/admin/research/questions");
  await waitFor("Boolean(document.querySelector('#adminx-email'))", "admin sign-in");
  await fill("#adminx-email", "admin@preview.invalid"); await fill("#adminx-password", "native-preview-password");
  await click('[data-testid="form-adminx-signin"] button[type="submit"]');
  await waitFor("Boolean(document.querySelector('a[href=\"/admin/research/questions/question-preview-one\"]'))", "populated question roster");
  journey.push({ step: "real-admin-ui-sign-in", passed: true });
  for (const config of configurations) {
    await capture("questions-populated", "/admin/research/questions", config, "member@preview.invalid");
    await capture("question-detail", "/admin/research/questions/question-preview-one", config, "Synthetic QA question:");
    await capture("orders-populated", "/admin/research/orders", config, "order-preview-one");
    await capture("order-detail", "/admin/research/orders/order-preview-one", config, "Synthetic QA product");
  }
  const config = { width: 390, variant: "workflow", deviceScaleFactor: 1 };
  await page.navigate(origin + "/admin/research/questions");
  await waitFor("Boolean(document.querySelector('a[href=\"/admin/research/questions/question-preview-one\"]'))", "question link");
  await click('a[href="/admin/research/questions/question-preview-one"]');
  await waitFor("Boolean(document.querySelector('[data-testid=\"question-answer-text\"]'))", "answer composer");
  await fill('[data-testid="question-answer-text"]', "Synthetic QA reply: your recorded tracking appears in your order.");
  await click('[data-testid="question-answer-send"]');
  await waitFor("Boolean(document.querySelector('[data-testid=\"question-answer-sent\"]'))", "answer confirmation");
  journey.push({ step: "roster-link-detail-answer-ui", passed: true });
  await capture("question-answered", null, config, "Answer sent.");
  await page.navigate(origin + "/admin/research/orders");
  await waitFor("Boolean(document.querySelector('a[href=\"/admin/research/orders/order-preview-one\"]'))", "order link");
  await click('a[href="/admin/research/orders/order-preview-one"]');
  await waitFor("Boolean(document.querySelector('[data-testid=\"order-processing\"]'))", "processing action");
  await click('[data-testid="order-processing"]');
  await waitFor("!document.querySelector('[data-testid=\"order-processing\"]') && Boolean(document.querySelector('[data-testid=\"order-tracking-carrier\"]'))", "processing transition");
  await fill('[data-testid="order-tracking-carrier"]', "UPS"); await fill('[data-testid="order-tracking-number"]', "SYNTHETIC123456");
  await click('[data-testid="order-tracking-submit"]');
  await waitFor("document.body.innerText.includes('SYNTHETIC123456')", "recorded tracking");
  const member = await loginApi("member@preview.invalid"), other = await loginApi("other@preview.invalid"), admin = await loginApi("admin@preview.invalid");
  assert.equal((await api("/api/research/orders/order-preview-one", member)).body.order.state, "processing", "Tracking must not advance state");
  await click('[data-testid="order-fulfilled"]');
  await waitFor("!document.querySelector('[data-testid=\"order-fulfilled\"]')", "fulfilled transition");
  await capture("order-fulfilled", null, config, "SYNTHETIC123456");
  const owned = await api("/api/research/orders/order-preview-one", member);
  assert.equal(owned.body.order.state, "fulfilled"); assert.equal(owned.body.order.shipments[0].trackingNumber, "SYNTHETIC123456");
  assert.equal((await api("/api/research/orders/order-preview-one", other)).status, 404);
  assert.deepEqual((await api("/api/research/orders", other)).body.orders, []);
  assert.match((await api("/api/research/questions", member)).body.questions[0].answerText, /Synthetic QA reply/);
  assert.deepEqual((await api("/api/research/questions", other)).body.questions, []);
  assert.equal((await api("/api/admin/research/questions")).status, 401);
  assert.equal((await api("/api/admin/research/orders", other)).status, 403);
  journey.push({ step: "order-ui-processing-tracking-fulfilled-member-readback-and-isolation", passed: true });
  await api("/__native_preview/questions-source", admin, "POST", { available: false });
  const unavailable = await api("/api/admin/research/questions?status=open", admin);
  assert.equal(unavailable.status, 503);
  await capture("questions-unavailable", "/admin/research/questions", config, "The question inbox is unavailable.", [{ url: origin + "/api/admin/research/questions?status=open", method: "GET", status: 503, responseBodySha256: unavailable.bodySha256, resourceType: "Fetch", count: 1, consoleCount: 1, consoleText: "Failed to load resource: the server responded with a status of 503 (Service Unavailable)" }]);
  assert.ok(!await page.evaluate("document.body.innerText.includes('No questions in this queue.')"));
  assert.ok(!await page.evaluate("Boolean(document.querySelector('a[href=\"/admin/research/questions/question-preview-one\"]'))"));
  await api("/__native_preview/questions-source", admin, "POST", { available: true });
  await api("/__native_preview/orders-source", admin, "POST", { available: false });
  const ordersUnavailable = await api("/api/admin/research/orders", admin);
  assert.equal(ordersUnavailable.status, 503);
  await capture("orders-unavailable", "/admin/research/orders", config, "The order queue is unavailable.", [{ url: origin + "/api/admin/research/orders", method: "GET", status: 503, responseBodySha256: ordersUnavailable.bodySha256, resourceType: "Fetch", count: 1, consoleCount: 1, consoleText: "Failed to load resource: the server responded with a status of 503 (Service Unavailable)" }]);
  assert.ok(!await page.evaluate("document.body.innerText.includes('No orders in this queue.') || Boolean(document.querySelector('a[href=\"/admin/research/orders/order-preview-one\"]'))"));
  await api("/__native_preview/orders-source", admin, "POST", { available: true });
  await click('[data-testid="button-adminx-signout"]');
  await waitFor("Boolean(document.querySelector('#adminx-email'))", "UI logout");
  assert.equal((await api("/api/admin/research/orders", admin)).status, 401);
  journey.push({ step: "source-unavailable-not-empty-and-ui-logout", passed: true });
} catch (error) {
  failure = error?.stack ?? String(error); console.error(failure);
  if (page) {
    try {
      write("interrupted-page.json", { failure, url: await page.evaluate("location.href"), text: await page.evaluate("document.body.innerText"), console: page.console, network: page.network, boundary: page.networkBoundaryViolations });
      writeFileSync(join(out, "captures", "interrupted-page.png"), (await page.screenshot()).bytes);
    } catch { /* Retain the original failure even if CDP itself disconnected. */ }
  }
}
finally {
  if (page) await page.close().catch(() => {});
  if (connection) await connection.close().catch(() => {});
  if (browser) await browser.close();
  const safety = await fetch(`${origin}/__native_preview`).then((r) => r.json()).catch(() => null);
  if (!safety || safety.blockedExternalRequests !== 0) failure ??= "Server network boundary recorded attempted external access";
  if (inventorySha256(inventoryDirectory(dist, new Set(["evidence-provenance.json"]))) !== provenance.distInventorySha256) failure ??= "Distribution changed during capture";
  if (sourceInventory.some((file) => hash(readFileSync(file.path)) !== file.sha256)) failure ??= "Server or harness source changed during capture";
  const summary = { scope: "LOCAL_SYNTHETIC_ONLY", productionQualified: false, fullReleaseMatrix: false, candidateSha: args.sha, provenance, sourceBinding, acceptanceEligible: sourceBinding.cleanCheckout && sourceBinding.sameBuildTree, widths, browserVersion: browser?.browserVersion, fixtureSafety: safety, journey, captures: runs.length, failedCaptures: runs.filter((r) => r.verdict === "AUTOMATED_FAIL").length, failure, runs: runs.map(({ name, config, verdict, screenshot, assertions }) => ({ name, config, verdict, screenshot, assertions })) };
  write("native-closeout-browser-results.json", summary);
  if (failure || summary.failedCaptures) process.exitCode = 1;
  console.log(JSON.stringify({ captures: summary.captures, failedCaptures: summary.failedCaptures, journeySteps: journey.length, failure, output: out }));
}
