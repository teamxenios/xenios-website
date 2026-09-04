/** Local-only, actual-bundle referral QA. No core API response is fulfilled by CDP. */
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CdpConnection, PageSession, sleep } from "../evidence/lib/cdp.mjs";
import { launchChromium } from "../evidence/lib/chrome.mjs";

export const WIDTHS = Object.freeze([1440, 1366, 1024, 768, 430, 390, 375, 360, 320]);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EVIDENCE_ROOT = resolve(REPO, "docs/ux/referral-v1-20260904");
const assert = (value, message) => { if (!value) throw new Error(message); };

export function localOrigin(value) {
  const url = new URL(value);
  assert(url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port && !url.username && !url.password
    && url.pathname === "/" && !url.search && !url.hash, "Preview origin must be exact HTTP 127.0.0.1 with an explicit port");
  return url.origin;
}
export function safeEvidenceUrl(value) {
  try {
    const url = new URL(value);
    url.username = ""; url.password = "";
    if (url.search) url.search = "?REDACTED";
    if (url.hash) url.hash = "#REDACTED";
    if (/^\/r\//.test(url.pathname)) url.pathname = "/r/OPAQUE-REDACTED";
    return url.href;
  } catch { return "INVALID"; }
}
export function evidenceDirectory(suffix) {
  assert(/^[a-z0-9][a-z0-9-]{0,60}$/.test(suffix), "Evidence suffix must be a short lowercase identifier");
  const target = resolve(EVIDENCE_ROOT, `browser-${suffix}`);
  assert(dirname(target) === EVIDENCE_ROOT, "Evidence path escaped its owned directory");
  return target;
}
export function parseOptions(args) {
  const options = { origin: "http://127.0.0.1:5238", suffix: new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 18), widths: [...WIDTHS], previewScript: resolve(REPO, "scripts/referral-v1/preview.ts") };
  for (const arg of args) {
    if (arg === "--only-320") options.widths = [320];
    else if (arg.startsWith("--origin=")) options.origin = localOrigin(arg.slice(9));
    else if (arg.startsWith("--output-suffix=")) options.suffix = arg.slice(16);
    else if (arg.startsWith("--preview-script=")) options.previewScript = resolve(REPO, arg.slice(17));
    else throw new Error(`Unknown browser QA option: ${arg}`);
  }
  options.origin = localOrigin(options.origin);
  options.out = evidenceDirectory(options.suffix);
  assert(dirname(options.previewScript) === resolve(REPO, "scripts/referral-v1"), "Preview script must be in the owned local harness directory");
  return options;
}

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? filesIn(resolve(directory, entry.name)) : [resolve(directory, entry.name)]);
}
export function candidateFingerprint() {
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "client", "server", "shared", "supabase/candidates", "scripts/referral-v1", "scripts/evidence/lib", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json"], { cwd: REPO, encoding: "utf8" })
    .split(/\r?\n/).filter(Boolean).sort();
  const source = createHash("sha256");
  for (const path of paths) { source.update(path); source.update("\0"); source.update(readFileSync(resolve(REPO, path))); }
  const bundle = createHash("sha256");
  const bundleFiles = filesIn(resolve(REPO, "dist/public")).sort();
  for (const path of bundleFiles) { bundle.update(relative(REPO, path)); bundle.update("\0"); bundle.update(readFileSync(path)); }
  return { sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim(), sourceTreeSha256: source.digest("hex"), sourceFileCount: paths.length, bundleSha256: bundle.digest("hex"), bundleFileCount: bundleFiles.length };
}

/** Only browser capability branches are synthetic. It never replaces fetch or auth. */
export function browserCapabilitiesSource() {
  return `(() => {
    const state = { shareMode: 'absent', clipboardMode: 'success', shares: [], copies: [] };
    Object.defineProperty(window, '__referralBrowserCapabilities', { value: state });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => {
      if (state.clipboardMode === 'failure') throw new DOMException('Synthetic clipboard unavailable', 'NotAllowedError');
      state.copies.push(value);
    } } });
    Object.defineProperty(navigator, 'share', { configurable: true, get() {
      if (state.shareMode === 'absent') return undefined;
      return async payload => {
        if (state.shareMode === 'cancel') throw new DOMException('Synthetic user cancellation', 'AbortError');
        if (state.shareMode === 'failure') throw new DOMException('Synthetic sharing unavailable', 'NotAllowedError');
        state.shares.push(payload);
      };
    } });
  })();`;
}

export class ReferralBrowser {
  constructor(origin, out, report) { this.origin = localOrigin(origin); this.out = out; this.report = report; }
  async open(width) {
    this.browser = await launchChromium({ chromePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
    this.report.browserVersion = this.browser.browserVersion;
    this.conn = await new CdpConnection(this.browser.wsUrl).open();
    this.page = await PageSession.create(this.conn);
    await this.page.enforceNetworkBoundary(this.origin, { onViolation: value => this.report.boundaryViolations.push({ ...value, url: safeEvidenceUrl(value.url) }) });
    await this.page.send("Page.addScriptToEvaluateOnNewDocument", { source: browserCapabilitiesSource() });
    this.conn.on("Network.requestWillBeSent", event => {
      let url; try { url = new URL(event.request.url); } catch { return; }
      this.report.network.requestCount++;
      this.report.network.origins[url.origin] = (this.report.network.origins[url.origin] ?? 0) + 1;
      if (["http:", "https:"].includes(url.protocol) && url.origin !== this.origin) this.report.network.externalHttpRequestCount++;
      if (url.pathname.startsWith("/api/research/referral/")) this.report.network.referralMethods.push({ method: event.request.method, path: url.pathname });
    }, this.page.sessionId);
    this.conn.on("Runtime.exceptionThrown", event => this.report.runtimeExceptions.push(String(event.exceptionDetails?.text ?? "runtime exception")), this.page.sessionId);
    // Do not bypass, unregister, replace, or warm up the candidate service worker.
    await this.page.setViewport({ width, height: 900, mobile: width <= 430 });
  }
  async close() {
    if (this.page) await this.page.close().catch(() => {});
    if (this.conn) await this.conn.close().catch(() => {});
    if (this.browser) {
      const profile = resolve(this.browser.userDataDir);
      assert(dirname(profile) === resolve(tmpdir()) && basename(profile).startsWith("xr-evidence-chrome-"), "Unexpected profile path; refusing recursive cleanup");
      await this.browser.close();
      const process = this.browser.process;
      if (process.exitCode === null && process.signalCode === null) {
        await new Promise((resolveExit, reject) => {
          const timer = setTimeout(() => reject(new Error("Owned browser process exit was not confirmed")), 10000);
          process.once("exit", () => { clearTimeout(timer); resolveExit(); });
        });
      }
      assert(process.exitCode !== null || process.signalCode !== null, "Owned browser process is still running");
      if (existsSync(profile)) await this.browser.close();
      assert(!existsSync(profile), "Owned temporary browser profile cleanup was not confirmed");
    }
  }
  async wait(expression, timeout = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeout) { const result = await this.page.evaluate(expression); if (result) return result; await sleep(100); }
    throw new Error(`Timed out waiting for browser condition: ${expression}`);
  }
  async navigate(path) {
    const url = new URL(path, this.origin);
    assert(url.origin === this.origin, "Off-origin navigation refused");
    return this.page.navigate(url.href, { maxSettleMs: 30000 });
  }
  async clickExpression(expression) {
    const point = await this.page.evaluate(`(() => { const e = ${expression}; if (!e || e.disabled) throw new Error('Missing or disabled target'); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await this.page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
    await this.page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
  }
  click(selector) { return this.clickExpression(`document.querySelector(${JSON.stringify(selector)})`); }
  clickText(text) { return this.clickExpression(`[...document.querySelectorAll('button,a')].find(e => e.textContent.trim() === ${JSON.stringify(text)})`); }
  async enter(selector, value) {
    await this.click(selector);
    await this.page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
    await this.page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
    await this.page.send("Input.insertText", { text: value });
  }
  async chooseDestination(path) {
    const index = await this.page.evaluate(`[...document.querySelector('#recommendation-destination').options].findIndex(option => option.value === ${JSON.stringify(path)})`);
    assert(index >= 0, "Destination is not a rendered option");
    await this.click("#recommendation-destination");
    for (const key of ["Home", ...Array(index).fill("ArrowDown"), "Enter"]) {
      await this.page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key });
      await this.page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
    }
    await this.wait(`document.querySelector('#recommendation-destination').value === ${JSON.stringify(path)}`);
  }
  async clearIdentity() {
    await this.page.evaluate("localStorage.clear(); sessionStorage.clear();");
    await this.page.send("Network.clearBrowserCookies");
    await this.navigate("/health");
  }
  async layout(scope = "main") {
    return this.page.evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(scope)}) || document.body;
      const visible = e => { const r=e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
      const geometry = e => { const r=e.getBoundingClientRect(); return {tag:e.tagName,id:e.id,label:(e.getAttribute('aria-label') || e.textContent || e.getAttribute('type') || '').trim().slice(0,100),left:r.left,right:r.right,width:r.width,height:r.height}; };
      const targets = [...root.querySelectorAll('button, a.btn, select, input:not([type=radio]):not([type=checkbox]), label:has(input[type=radio])')].filter(visible).map(geometry);
      return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
        overflows:[...root.querySelectorAll('input,button,form,section,article')].filter(visible).map(geometry).filter(r=>r.left < -1 || r.right > innerWidth+1),
        touchTargets:targets,smallTargets:targets.filter(r=>r.width < 43.5 || r.height < 43.5)};
    })()`);
  }
  async snapshot(name, { scope = "main", assertTouch = true } = {}) {
    await this.page.settle({ quietMs: 800, maxSettleMs: 30000 });
    await this.page.evaluate("Promise.race([document.fonts.ready.then(() => true),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Fonts did not settle')),5000))])");
    let previous = "", stable = 0;
    const started = Date.now();
    while (stable < 4) {
      const shape = await this.page.evaluate("JSON.stringify({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,bodyWidth:document.body.scrollWidth,bodyHeight:document.body.scrollHeight})");
      stable = shape === previous ? stable + 1 : 0; previous = shape;
      assert(Date.now() - started < 5000, "Geometry failed to settle before screenshot");
      await sleep(200);
    }
    const layout = await this.layout(scope);
    const shot = await this.page.screenshot({ fullPage: true });
    const path = resolve(this.out, `${name}.png`);
    writeFileSync(path, shot.bytes);
    const evidence = { name, path, coverage: shot.coverage, layout };
    assert(layout.documentWidth <= layout.width + 1 && layout.bodyWidth <= layout.width + 1 && layout.overflows.length === 0, `Horizontal overflow at ${name}`);
    if (assertTouch) assert(layout.smallTargets.length === 0, `Touch target below 44px at ${name}: ${JSON.stringify(layout.smallTargets)}`);
    return evidence;
  }
}

const buttonExpression = (text, scope = "document") => `[...${scope}.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)})`;
const articleExpression = url => `[...document.querySelectorAll('article')].find(e => e.querySelector('input[readonly]')?.value === ${JSON.stringify(url)})`;
const signInPath = destination => `/research/sign-in?returnTo=${encodeURIComponent(destination)}`;

export async function memberSignIn(browser, persona, destination, screenshotPrefix, row, expectedDestination = destination, navigate = true) {
  if (navigate) await browser.navigate(signInPath(destination));
  else assert(await browser.page.evaluate(`location.pathname + location.search === ${JSON.stringify(signInPath(destination))}`), "Observed sign-in URL did not preserve the safe destination");
  await browser.wait("!!document.querySelector('[data-testid=\"form-member-signin\"]')");
  if (screenshotPrefix) row.screenshots.push(await browser.snapshot(`${screenshotPrefix}-signin-${row.width}`));
  await browser.enter("#ms-email", persona.email);
  await browser.enter("#ms-password", persona.password);
  await browser.click('[data-testid="button-member-signin"]');
  await browser.wait(`location.pathname + location.search === ${JSON.stringify(expectedDestination)} && !document.querySelector('[data-testid="form-member-signin"]')`);
  return browser.page.evaluate("location.pathname + location.search");
}
async function createLink(browser, destination) {
  const before = await browser.page.evaluate("[...document.querySelectorAll('input[readonly]')].map(e=>e.value)");
  await browser.chooseDestination(destination);
  await browser.clickText("Create recommendation link");
  const url = await browser.wait(`(() => { const before = ${JSON.stringify(before)}; return [...document.querySelectorAll('input[readonly]')].map(e=>e.value).find(value => !before.includes(value)); })()`);
  assert(new URL(url).origin === browser.origin && /^\/r\/r1_[A-Za-z0-9_-]{43}$/.test(new URL(url).pathname), "Browser received a noncanonical share link");
  return url;
}
async function clickLinkButton(browser, url, text) {
  await browser.clickExpression(buttonExpression(text, `(${articleExpression(url)})`));
}
async function waitLinkNotice(browser, url, text) {
  return browser.wait(`(${articleExpression(url)})?.textContent.includes(${JSON.stringify(text)})`);
}
export async function ownerJourney(browser, fixture, row) {
  row.checks.ownerDestination = await memberSignIn(browser, fixture.personas.owner, "/research/partners/links", "owner", row);
  await browser.wait("!!document.querySelector('#recommendation-destination')");
  const links = { health: await createLink(browser, "/health"), care: await createLink(browser, "/care"), research: await createLink(browser, "/research/member/catalog"), healthChoice: await createLink(browser, "/health") };
  row.checks.createdDestinations = ["/health", "/care", "/research/member/catalog", "/health"];
  row.createdLinkIds = await browser.page.evaluate(`Object.fromEntries(Object.entries(${JSON.stringify(links)}).map(([name,url])=>{ const input=[...document.querySelectorAll('input[readonly]')].find(e=>e.value===url); return [name,input?.id.replace(/^recommendation-url-/, '')]; }))`);
  assert(Object.values(row.createdLinkIds).every(id => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id)), "Created link IDs were not present in the rendered owner controls");
  row.screenshots.push(await browser.snapshot(`owner-links-${row.width}`));
  await clickLinkButton(browser, links.health, "Copy link");
  await waitLinkNotice(browser, links.health, "Link copied");
  assert(await browser.page.evaluate(`window.__referralBrowserCapabilities.copies.at(-1) === ${JSON.stringify(links.health)}`), "Copy did not receive the rendered canonical link");
  await browser.page.evaluate("window.__referralBrowserCapabilities.shareMode = 'success'");
  await clickLinkButton(browser, links.health, "Share");
  await waitLinkNotice(browser, links.health, "does not know whether a message was delivered");
  assert(await browser.page.evaluate(`window.__referralBrowserCapabilities.shares.at(-1)?.url === ${JSON.stringify(links.health)}`), "Share did not receive the rendered canonical link");
  row.screenshots.push(await browser.snapshot(`owner-native-share-simulated-${row.width}`));
  await browser.page.evaluate("window.__referralBrowserCapabilities.shareMode = 'absent'");
  await clickLinkButton(browser, links.health, "Share");
  await waitLinkNotice(browser, links.health, "Link copied");
  await browser.page.evaluate("window.__referralBrowserCapabilities.clipboardMode = 'failure'");
  await clickLinkButton(browser, links.health, "Copy link");
  await waitLinkNotice(browser, links.health, "Copy is unavailable");
  row.screenshots.push(await browser.snapshot(`owner-copy-failure-${row.width}`));
  row.checks.browserCapabilities = { simulatedNativeShare: true, simulatedClipboardSuccess: true, nativeShareAbsentFallback: true, simulatedClipboardFailureVisible: true, realOsShareOrClipboardNotExercised: true };
  await clickLinkButton(browser, links.health, "Revoke link");
  await waitLinkNotice(browser, links.health, "Existing attribution is not removed");
  row.screenshots.push(await browser.snapshot(`owner-revoke-confirmation-${row.width}`));
  await clickLinkButton(browser, links.health, "Confirm revoke");
  await browser.wait("document.body.textContent.includes('Link revoked. New recipients cannot use it.')");
  await browser.wait(`![...document.querySelectorAll('input[readonly]')].some(e => e.value === ${JSON.stringify(links.health)})`);
  row.checks.revokeConfirmed = true;
  return links;
}

async function assertRecipientPrivacy(browser) {
  const privacy = await browser.page.evaluate(`({robots:document.querySelector('meta[name="robots"]')?.content,canonical:document.querySelector('link[rel="canonical"]')?.href ?? null,referralInHead:/r1_[A-Za-z0-9_-]{43}/.test(document.head.innerHTML),researchSupport:!!document.querySelector('a[href="/research/support"]'),careSupport:!!document.querySelector('a[href="/care/support"]')})`);
  assert(privacy.robots === "noindex, nofollow" && privacy.canonical === null && !privacy.referralInHead && privacy.researchSupport && privacy.careSupport, "Recipient privacy/support document checks failed");
  return privacy;
}
export async function recipientJourney(browser, links, row, fixture = {}) {
  await browser.clearIdentity();
  const invalidLinks = [["invalid", `${browser.origin}/r/r1_${"Z".repeat(43)}`], ["revoked", links.health]];
  if (fixture.fixtureLinks?.expired) invalidLinks.push(["expired", fixture.fixtureLinks.expired]);
  for (const [kind, url] of invalidLinks) {
    const before = browser.report.network.referralMethods.filter(entry => entry.path.endsWith("/capture")).length;
    await browser.navigate(url);
    await browser.wait("!!document.querySelector('[role=\"alert\"]')");
    assert(await browser.page.evaluate("![...document.querySelectorAll('button')].some(e => e.textContent === 'Continue with recommendation')"), `${kind} invitation offered a capture action`);
    row.checks[`${kind}RecipientPrivacy`] = await assertRecipientPrivacy(browser);
    row.screenshots.push(await browser.snapshot(`recipient-${kind}-${row.width}`));
    assert(browser.report.network.referralMethods.filter(entry => entry.path.endsWith("/capture")).length === before, `${kind} invitation attempted automatic capture`);
  }
  const capturesBeforeChoice = browser.report.network.referralMethods.filter(entry => entry.path.endsWith("/capture")).length;
  await browser.navigate(links.healthChoice);
  await browser.wait("!!document.querySelector('input[name=\"recommendation-pathway\"]')");
  assert(await browser.page.evaluate(`${buttonExpression("Continue with recommendation")}.disabled`), "Health invitation did not require a pathway choice");
  row.screenshots.push(await browser.snapshot(`recipient-health-choice-${row.width}`));
  await browser.click('input[value="/research"]');
  await browser.clickText("Continue without confirming referral");
  await browser.wait("location.pathname === '/research'");
  assert(browser.report.network.referralMethods.filter(entry => entry.path.endsWith("/capture")).length === capturesBeforeChoice, "Continue without referral captured attribution");
  row.checks.healthChoice = { choiceRequired: true, explicitResearchPath: true, browseWithoutCapture: true };
  const capturesBeforeContext = browser.report.network.referralMethods.filter(entry => entry.path.endsWith("/capture")).length;
  await browser.navigate(links.care);
  await browser.wait("document.body.textContent.includes('Explore the Care pathway')");
  row.checks.careRecipientPrivacy = await assertRecipientPrivacy(browser);
  row.screenshots.push(await browser.snapshot(`recipient-care-${row.width}`));
  assert(browser.report.network.referralMethods.filter(entry => entry.path.endsWith("/capture")).length === capturesBeforeContext, "Context page captured a referral without Continue");
  row.checks.contextDidNotCapture = true;
  await browser.clickText("Continue with recommendation");
  await browser.wait("location.pathname === '/care'");
  row.checks.careExplicitContinue = true;
  const capturesBeforeResearch = browser.report.network.referralMethods.filter(entry => entry.path.endsWith("/capture")).length;
  await browser.navigate(links.research);
  await browser.wait("document.body.textContent.includes('Explore nonclinical Research')");
  row.screenshots.push(await browser.snapshot(`recipient-research-${row.width}`));
  assert(browser.report.network.referralMethods.filter(entry => entry.path.endsWith("/capture")).length === capturesBeforeResearch, "Research context captured before Continue");
  await browser.clickText("Continue with recommendation");
  // The member guard may send an anonymous recipient to sign-in, but may not
  // use the legacy review password wall or replace the safe destination.
  await browser.wait(`location.pathname + location.search === ${JSON.stringify(signInPath("/research/member/catalog"))}`);
  assert(await browser.page.evaluate("!document.querySelector('[data-testid=\"form-research-access\"]')"), "Recipient hit the unrelated legacy review wall");
  row.checks.researchDestination = await browser.page.evaluate("location.pathname + location.search");
  return links.care;
}

export async function authContinuityJourney(browser, fixture, row, verifyBinding) {
  const destination = "/research/member/catalog";
  assert(await browser.page.evaluate(`location.pathname + location.search === ${JSON.stringify(signInPath(destination))}`), "Actual recipient redirect lost safe returnTo");
  await browser.wait("!!document.querySelector('[data-testid=\"form-member-signin\"]')");
  const resetPath = `/research/reset-password?returnTo=${encodeURIComponent(destination)}`;
  assert(await browser.page.evaluate(`document.querySelector('[data-testid="link-forgot-password"]').getAttribute('href') === ${JSON.stringify(resetPath)}`), "Forgot password lost the referral's safe destination");
  await browser.click('[data-testid="link-forgot-password"]');
  await browser.wait("!!document.querySelector('[data-testid=\"form-request-reset\"]')");
  row.screenshots.push(await browser.snapshot(`recipient-reset-request-${row.width}`));
  assert(await browser.page.evaluate(`document.querySelector('[data-testid="link-member-login"]').getAttribute('href') === ${JSON.stringify(signInPath(destination))}`), "Reset back link lost the safe destination");
  row.checks.authSafeReturn = { destination, resetPath };
  await browser.click('[data-testid="link-member-login"]');
  await verifyBinding("recipient", null, "before-normal-sign-in");
  row.checks.memberDestination = await memberSignIn(browser, fixture.personas.recipient, destination, "recipient", row, destination, false);
  await verifyBinding("recipient", row.createdLinkIds.care, "after-normal-sign-in");
  row.screenshots.push(await browser.snapshot(`recipient-signed-in-${row.width}`));
  await browser.navigate("/research/partners/links");
  await browser.wait("document.body.textContent.includes('Referral access is not active') || document.body.textContent.includes('not authorized to manage referral links')");
  assert(await browser.page.evaluate("!document.querySelector('#recommendation-destination') && !document.querySelector('input[readonly]')"), "Ordinary recipient received link-management authority or an owner's share URL");
  row.screenshots.push(await browser.snapshot(`recipient-link-management-denied-${row.width}`));
  await browser.navigate("/admin/research/referral-lifecycle");
  await browser.wait("document.body.textContent.includes('not authorized to read referral lifecycle records')");
  assert(await browser.page.evaluate("!document.querySelector('[aria-label=\"Verified account bindings\"]') && !document.querySelector('[aria-label=\"Referral touches\"]')"), "Ordinary recipient received admin lifecycle rows");
  row.screenshots.push(await browser.snapshot(`recipient-admin-denied-${row.width}`));
  row.checks.principalIsolation = { ordinaryMemberHasNoLinkIssuance: true, ownerUrlsNotShown: true, adminLifecycleDenied: true };
}

export async function recoveryJourney(browser, fixture, row, link, verifyBinding) {
  if (!fixture.recovery) {
    row.checks.passwordReset = { state: "not_run", reason: "The local preview supplied no synthetic recovery fixture." };
    return;
  }
  const destination = "/research/member/catalog";
  await browser.clearIdentity();
  await browser.navigate(link);
  await browser.wait("document.body.textContent.includes('Explore the Care pathway')");
  await browser.clickText("Continue with recommendation");
  await browser.wait("location.pathname === '/care'");
  await browser.navigate(`/research/reset-password?returnTo=${encodeURIComponent(destination)}`);
  await browser.wait("!!document.querySelector('[data-testid=\"form-request-reset\"]')");
  await browser.enter("#rp-email", fixture.recovery.email);
  await browser.click('[data-testid="button-request-reset"]');
  await browser.wait("!!document.querySelector('[data-testid=\"text-reset-notice\"]')");
  await browser.navigate(fixture.recovery.path);
  await browser.wait("!!document.querySelector('[data-testid=\"form-reset-password\"]')");
  await verifyBinding("recovery", null, "during-recovery-session");
  const scrub = await browser.page.evaluate(`({path:location.pathname+location.search,hash:location.hash,storage:[...Array(sessionStorage.length)].map((_,i)=>sessionStorage.key(i))})`);
  assert(scrub.hash === "" && scrub.path === `/research/reset-password?returnTo=${encodeURIComponent(destination)}`, "Recovery credential was not scrubbed or lost safe return");
  await browser.enter("#rp-password", fixture.recovery.newPassword);
  await browser.enter("#rp-confirm", fixture.recovery.newPassword);
  row.screenshots.push(await browser.snapshot(`recipient-password-recovery-${row.width}`));
  await browser.click('[data-testid="button-set-password"]');
  await browser.wait(`location.pathname + location.search === ${JSON.stringify(signInPath(destination))}`);
  await verifyBinding("recovery", null, "after-reset-before-fresh-sign-in");
  row.checks.passwordReset = { state: "exercised", recoveryCredentialScrubbed: true, mandatoryFreshSignIn: true, safeReturnPreserved: true };
  row.checks.passwordResetDestination = await memberSignIn(browser, { email: fixture.recovery.email, password: fixture.recovery.newPassword }, destination, null, row, destination, false);
  await verifyBinding("recovery", row.createdLinkIds.care, "after-recovery-fresh-sign-in");
}

export async function claimJourney(browser, fixture, link, row, verifyBinding) {
  if (!fixture.claim) {
    row.checks.accountClaim = { state: "not_run", reason: "The local preview supplied no synthetic approved-applicant fixture." };
    return;
  }
  await browser.clearIdentity();
  await browser.navigate(link);
  await browser.wait("document.body.textContent.includes('Explore nonclinical Research')");
  await browser.clickText("Continue with recommendation");
  await browser.wait("location.pathname === '/research/sign-in' || location.pathname === '/research/member/catalog'");
  await browser.navigate(fixture.claim.path);
  await browser.wait("!!document.querySelector('[data-testid=\"form-claim-account\"]')");
  assert(await browser.page.evaluate(`location.pathname + location.search === ${JSON.stringify(`/research/apply/status?returnTo=${encodeURIComponent("/research/member/catalog")}`)}`), "Claim credential was not scrubbed or lost safe return");
  await browser.enter("#ca-password", fixture.claim.password);
  await browser.enter("#ca-confirm", fixture.claim.password);
  row.screenshots.push(await browser.snapshot(`recipient-account-claim-${row.width}`));
  await browser.click('[data-testid="button-claim-account"]');
  await browser.wait("!!document.querySelector('[data-testid=\"card-claim-success\"]')");
  await verifyBinding("claim", null, "after-claim-before-fresh-sign-in");
  assert(await browser.page.evaluate(`document.querySelector('[data-testid="card-claim-success"] a').getAttribute('href') === ${JSON.stringify(signInPath("/research/member/catalog"))}`), "Claim success lost safe destination");
  await browser.click('[data-testid="card-claim-success"] a');
  row.checks.accountClaimDestination = await memberSignIn(browser, { email: fixture.claim.email, password: fixture.claim.password }, "/research/member/catalog", null, row, "/research/activate", false);
  await verifyBinding("claim", row.createdLinkIds.research, "after-claim-fresh-sign-in");
  row.checks.accountClaim = { state: "exercised", claimCredentialScrubbed: true, safeReturnPreservedInSignInLink: true, activationGateOutranksReturnHint: true, freshSignInRequired: true };
  row.screenshots.push(await browser.snapshot(`recipient-claim-activation-gated-${row.width}`));
}

export async function adminJourney(browser, fixture, row) {
  await browser.clearIdentity();
  await browser.navigate("/admin/research/referral-lifecycle");
  await browser.wait("!!document.querySelector('[data-testid=\"form-adminx-signin\"]')");
  await browser.enter("#adminx-email", fixture.personas.admin.email);
  await browser.enter("#adminx-password", fixture.personas.admin.password);
  await browser.click('[data-testid="form-adminx-signin"] button[type="submit"]');
  await browser.wait("!!document.querySelector('[aria-label=\"Verified account bindings\"]')");
  const visibility = await browser.page.evaluate(`({links:document.querySelector('[aria-label="Recommendation links"]').textContent,touches:document.querySelector('[aria-label="Referral touches"]').textContent,bindings:document.querySelector('[aria-label="Verified account bindings"]').textContent,audit:document.querySelector('[aria-label="Audit events"]').textContent,readonly:document.body.textContent.includes('Attribution corrections are not supported')})`);
  assert(visibility.touches.includes("Current referral availability") && visibility.bindings.includes("Current referral availability") && visibility.audit.includes("Account linked") && visibility.readonly, "Admin lifecycle did not show actual capture/binding/audit records");
  assert(await browser.page.evaluate("!!document.querySelector('[aria-label=\"Returned lineage records\"] article') && document.body.textContent.includes('do not establish independently verified order-level referral attribution')"), "Admin lineage did not expose the explicitly inserted synthetic account-binding-only records");
  row.checks.adminVisibility = { touchVisible: true, accountBindingVisible: true, auditEventVisible: true, currentAvailabilityVisible: true, correctionsUnsupported: true, syntheticDownstreamLineageVisible: true, independentlyVerifiedOrderAttributionNotClaimed: true };
  row.screenshots.push(await browser.snapshot(`admin-lifecycle-${row.width}`));
}

function validateManifest(manifest, origin) {
  assert(manifest && manifest.origin === origin && manifest.personas, "Preview returned the wrong origin or no personas");
  for (const role of ["owner", "recipient", "admin"]) {
    const value = manifest.personas[role];
    assert(value && typeof value.email === "string" && value.email.endsWith(".invalid") && typeof value.password === "string" && value.password.length >= 10, `Preview ${role} persona is invalid`);
  }
  for (const optional of ["claim", "recovery"]) {
    const value = manifest[optional];
    if (!value) continue;
    assert(typeof value.path === "string" && value.path.startsWith("/") && !value.path.startsWith("//"), `Preview ${optional} path must be local`);
  }
  return manifest;
}
function sanitizedFixtureSummary(fixture) {
  return { origin: fixture.origin, personaRoles: Object.keys(fixture.personas), claimFixture: Boolean(fixture.claim), recoveryFixture: Boolean(fixture.recovery), fixtureLinks: Object.keys(fixture.fixtureLinks ?? {}) };
}
function childEnvironment(origin) {
  const env = Object.fromEntries(["SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "COMSPEC", "LOCALAPPDATA"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  env.NODE_ENV = "development";
  env.TSX_TSCONFIG_PATH = resolve(REPO, "tsconfig.json");
  env.XR_REFERRAL_PREVIEW_PORT = new URL(origin).port;
  env.XR_REFERRAL_V1_PG_RUNTIME = "/var/tmp/xenios-referral-v1-pg-GeksRtB0/runtime";
  return env;
}
async function startPreview(options) {
  assert(existsSync(options.previewScript), `Preview script is missing: ${options.previewScript}`);
  const child = spawn(process.execPath, ["--import", pathToFileURL(resolve(REPO, "node_modules/tsx/dist/loader.mjs")).href, options.previewScript], { cwd: REPO, env: childEnvironment(options.origin), stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true });
  let buffer = "", diagnostic = "";
  const append = chunk => { buffer += String(chunk); diagnostic = (diagnostic + String(chunk)).slice(-8000); };
  child.stdout.on("data", append); child.stderr.on("data", append);
  const started = Date.now();
  try {
    while (Date.now() - started < 60000) {
      const lines = buffer.split(/\r?\n/); lines.pop();
      const line = lines.find(value => value.startsWith("REFERRAL_PREVIEW_READY "));
      if (line) return { child, fixture: validateManifest(JSON.parse(line.slice("REFERRAL_PREVIEW_READY ".length)), options.origin) };
      if (child.exitCode !== null) throw new Error(`Preview exited ${child.exitCode} before readiness: ${diagnostic.replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED]")}`);
      await sleep(100);
    }
    throw new Error(`Preview readiness timeout: ${diagnostic.replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED]")}`);
  } catch (error) {
    await stopPreview(child);
    throw error;
  }
}
function previewTelemetry(child) {
  return new Promise((resolveTelemetry, reject) => {
    const timer = setTimeout(() => reject(new Error("Preview telemetry timeout")), 5000);
    child.once("message", value => { clearTimeout(timer); resolveTelemetry(value); });
    child.send({ type: "browser-qa-telemetry" });
  });
}
function seedPreviewLineage(child) {
  return new Promise((resolveSeeded, reject) => {
    const timer = setTimeout(() => reject(new Error("Preview lineage fixture insertion timeout")), 5000);
    child.once("message", value => {
      clearTimeout(timer);
      if (value?.type !== "browser-qa-lineage-seeded" || value.synthetic !== true || !Number.isSafeInteger(value.seededAccounts) || value.seededAccounts < 1) reject(new Error("Preview lineage response did not confirm explicit synthetic fixture insertion"));
      else resolveSeeded({ synthetic: true, seededAccounts: value.seededAccounts, requestSubmissionJourneyExercised: false, actualReferralsUnmodified: true });
    });
    child.send({ type: "browser-qa-seed-lineage" });
  });
}
async function stopPreview(child) {
  if (!child || child.exitCode !== null) return;
  try { child.send({ type: "browser-qa-stop" }); } catch { child.kill(); }
  const exited = await new Promise(resolveExit => {
    const timer = setTimeout(() => resolveExit(false), 15000);
    child.once("exit", () => { clearTimeout(timer); resolveExit(true); });
  });
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    throw new Error("Preview required forced termination; graceful database cleanup was not confirmed");
  }
}
function countRecords(source, key) {
  const value = source?.db?.[key];
  return Array.isArray(value) ? value.length : Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function assertPersonaBinding(telemetry, persona, expectedLinkId) {
  const binding = telemetry?.bindingByPersona?.[persona];
  assert(binding && Number.isSafeInteger(binding.count) && binding.count >= 0, `Missing actual binding telemetry for ${persona}`);
  if (expectedLinkId === null) assert(binding.count === 0 && binding.linkId === null, `${persona} bound before an allowed normal sign-in`);
  else assert(binding.count === 1 && binding.linkId === expectedLinkId, `${persona} is not bound exactly once to its expected referral link`);
  return { persona, count: binding.count, linkId: binding.linkId };
}

export async function runBrowserQa(options) {
  assert(!existsSync(options.out), "Evidence suffix already exists; preserve the earlier run and use a fresh suffix");
  mkdirSync(options.out, { recursive: true });
  const frozen = candidateFingerprint();
  const report = { generatedAt: new Date().toISOString(), classification: "LOCAL SYNTHETIC ACTUAL-BUNDLE QA — NOT PRODUCTION OR OS-SHARE EVIDENCE", source: frozen, environment: "Fresh headless Chromium and fresh disposable PostgreSQL preview per width; localhost-only browser boundary; sanitized server environment; no core API browser mocks", widths: [], boundaryViolations: [], runtimeExceptions: [], errors: [], network: { requestCount: 0, origins: {}, externalHttpRequestCount: 0, referralMethods: [] }, limitations: ["All identities, links and records are synthetic local fixtures.", "Native share and clipboard branches use explicitly declared in-browser capability shims. They do not exercise or alter an OS share sheet or the user's clipboard.", "No real email is sent. Recovery and claim are recorded as not run unless the preview supplies its local provider-backed fixtures.", "Downstream request/order records are explicit synthetic fixtures inserted by a separate local IPC command after actual referral binding; request submission and order conversion are not exercised or inferred.", "No accessibility audit, performance claim, production readiness, deployment or migration approval is implied."], pass: false };
  try {
    for (const width of options.widths) {
      let preview, browser;
      const row = { width, checks: {}, screenshots: [], pass: false };
      report.widths.push(row);
      try {
        preview = await startPreview(options);
        row.fixture = sanitizedFixtureSummary(preview.fixture);
        const initialTelemetry = await previewTelemetry(preview.child);
        const initialCounts = Object.fromEntries(["links", "touches", "bindings", "events"].map(key => [key, countRecords(initialTelemetry, key)]));
        row.checks.initialDatabase = initialCounts;
        assert(Object.values(initialCounts).every(value => value !== null), "Preview did not supply initial real database counts");
        browser = new ReferralBrowser(options.origin, options.out, report);
        await browser.open(width);
        const links = await ownerJourney(browser, preview.fixture, row);
        await recipientJourney(browser, links, row, preview.fixture);
        row.checks.bindingProof = [];
        const verifyBinding = async (persona, expectedLinkId, stage) => {
          const proof = assertPersonaBinding(await previewTelemetry(preview.child), persona, expectedLinkId);
          row.checks.bindingProof.push({ stage, ...proof });
        };
        await authContinuityJourney(browser, preview.fixture, row, verifyBinding);
        await recoveryJourney(browser, preview.fixture, row, links.care, verifyBinding);
        await claimJourney(browser, preview.fixture, links.research, row, verifyBinding);
        row.checks.downstreamLineageFixtures = await seedPreviewLineage(preview.child);
        await adminJourney(browser, preview.fixture, row);
        const telemetry = await previewTelemetry(preview.child);
        const counts = Object.fromEntries(["links", "touches", "bindings", "events"].map(key => [key, countRecords(telemetry, key)]));
        row.checks.database = counts;
        const expectedBindings = 1 + Number(Boolean(preview.fixture.claim)) + Number(Boolean(preview.fixture.recovery));
        assert(counts.links !== null && counts.links >= initialCounts.links + 4 && counts.touches !== null && counts.touches >= initialCounts.touches + expectedBindings && counts.bindings !== null && counts.bindings >= initialCounts.bindings + expectedBindings && counts.events !== null && counts.events >= initialCounts.events + 6, `Real database telemetry lacked new lifecycle records: ${JSON.stringify(counts)}`);
        assert(telemetry?.outboundAttemptsDenied === 0, "Preview attempted outbound access");
        row.checks.serverOutboundAttempts = telemetry.outboundAttemptsDenied;
        row.coreAssertionsPassed = true;
        row.pass = row.checks.passwordReset.state === "exercised" && row.checks.accountClaim.state === "exercised";
        console.log(`REFERRAL_BROWSER_QA_${row.pass ? "PASS" : "PARTIAL"} width=${width}`);
      } catch (error) {
        row.error = String(error?.message ?? error).replace(/[A-Za-z0-9_-]{43}/g, "[REDACTED]");
        if (browser?.page) {
          row.failurePage = await browser.page.evaluate("({path:location.pathname,text:document.body.innerText.slice(0,1800)})").catch(() => null);
          const shot = await browser.page.screenshot({ fullPage: true }).catch(() => null);
          if (shot) {
            const path = resolve(options.out, `failure-${width}.png`); writeFileSync(path, shot.bytes);
            row.failureScreenshot = { path, coverage: shot.coverage };
          }
        }
        throw error;
      } finally {
        try {
          await browser?.close();
          row.browserCleanupConfirmed = true;
        } catch (error) {
          row.pass = false; row.cleanupError = String(error?.message ?? error); throw error;
        } finally {
          try {
            await stopPreview(preview?.child);
            row.previewCleanupConfirmed = true;
          } catch (error) {
            row.pass = false; row.cleanupError = String(error?.message ?? error); throw error;
          } finally {
            writeFileSync(resolve(options.out, "browser-results.json"), JSON.stringify(report, null, 2));
          }
        }
      }
    }
    assert(report.boundaryViolations.length === 0 && report.network.externalHttpRequestCount === 0, "Candidate attempted external browser access");
    assert(report.runtimeExceptions.length === 0, "Candidate raised a browser runtime exception");
    const final = candidateFingerprint();
    assert(JSON.stringify(final) === JSON.stringify(frozen), "Source or built bundle changed during browser QA");
    report.completedAt = new Date().toISOString(); report.finalSource = final;
    report.coreAssertionsPassed = true; report.pass = report.widths.every(row => row.pass);
  } catch (error) {
    report.completedAt = new Date().toISOString(); report.errors.push(String(error?.stack ?? error).replace(/[A-Za-z0-9_-]{43}/g, "[REDACTED]"));
    throw error;
  } finally {
    writeFileSync(resolve(options.out, "browser-results.json"), JSON.stringify(report, null, 2));
  }
  return report;
}

// Importing the safety helpers is inert. The integration lead authorizes the
// browser run only after the full suite and production bundle build complete.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBrowserQa(parseOptions(process.argv.slice(2))).then(report => { if (!report.pass) process.exitCode = 2; }).catch(error => { console.error("REFERRAL_BROWSER_QA_FAIL", String(error?.message ?? error)); process.exitCode = 1; });
}
