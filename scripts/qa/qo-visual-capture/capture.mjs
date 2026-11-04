import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { artwork, fixtureCurrency, fixturePrice, fixtureResponses, fixtureUnit, sourceVariant } from "./fixture.mjs";

const [candidate, output, candidateSha, candidateTree, harnessRevision] = process.argv.slice(2);
const origin = "http://127.0.0.1:5199";
const route = "/research/early-access/order-request";
const artworkHash = "d4518341767b9de04d3fa6fb6bf1cbcaa3456884005e68621042839aed01cf42";
const result = {
  scope: "non-production synthetic; price and quantity are fixture values",
  candidateSha, candidateTree, harnessRevision,
  upstreamHarness: "scripts/evidence/build-candidate-preview.mjs + scripts/preview-research.mjs",
  fixture: { sourceVariant, orderVariant: "qa-bpc-157-order-variant", fixturePrice, fixtureCurrency, fixtureUnit },
  artwork: { file: artwork, sha256: artworkHash },
  network: { loopbackOnly: false, serviceWorkers: "blocked", externalRequests: "blocked" },
  captures: [],
};
const report = (entry, name, pass, detail) => {
  entry.assertions.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });
};

async function waitForPreview(process) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (process.exitCode !== null) throw new Error("Existing loopback preview exited before startup");
    try {
      const response = await fetch(origin + "/__xenios_evidence_provenance", { signal: AbortSignal.timeout(500) });
      if (response.ok) return await response.json();
    } catch {}
    await delay(250);
  }
  throw new Error("Existing loopback preview did not become ready");
}

async function capture(browser, fixtures, name, viewport, mobile) {
  const entry = { name, viewport, mobile, assertions: [], screenshots: [], externalBlocked: 0,
    webSocketsBlocked: 0, localApiBlocked: 0, writeRequestsBlocked: 0 };
  result.captures.push(entry);
  const context = await browser.newContext({
    viewport, screen: viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    locale: "en-US", serviceWorkers: "block", acceptDownloads: false,
  });
  await context.routeWebSocket("**/*", (socket) => {
    entry.webSocketsBlocked += 1;
    return socket.close();
  });
  await context.route("**/*", async (intercept) => {
    const request = intercept.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      entry.externalBlocked += 1;
      return intercept.abort("blockedbyclient");
    }
    if (request.method() !== "GET") {
      entry.writeRequestsBlocked += 1;
      return intercept.abort("blockedbyclient");
    }
    if (fixtures.has(url.pathname)) {
      return intercept.fulfill({ json: fixtures.get(url.pathname), headers: { "cache-control": "no-store" } });
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/preview-auth")) {
      entry.localApiBlocked += 1;
      return intercept.abort("blockedbyclient");
    }
    return intercept.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const card = page.locator('[data-testid="request-door-mixed"] article.xenios-order-card')
    .filter({ has: page.getByRole("heading", { name: "BPC-157", exact: true }) });
  try {
    await page.goto(origin + route, { waitUntil: "domcontentloaded" });
    await card.waitFor();
    const image = card.getByTestId("product-media-image");
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(async (node) => {
      await Promise.race([node.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error("image timeout")), 5000))]);
    });
    await page.evaluate(async () => {
      await Promise.race([document.fonts.ready, new Promise((_, reject) => setTimeout(() => reject(new Error("font timeout")), 5000))]);
    });
    const add = card.getByRole("button", { name: "Add BPC-157 to request", exact: true });
    report(entry, "add action available", await add.isEnabled());
    await add.click();
    const increase = card.getByRole("button", { name: "Increase requested quantity for BPC-157" });
    await increase.click();
    const quantity = card.getByRole("spinbutton");
    const action = page.getByRole("button", { name: "Continue to contact", exact: true });
    await card.scrollIntoViewIfNeeded();
    await card.evaluate((node) => window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - 45));
    const display = await card.evaluate((node) => {
      const img = node.querySelector("img");
      const bounds = node.getBoundingClientRect();
      const qty = node.querySelector("input[type=number]");
      const target = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Continue to contact");
      const actionBounds = target?.getBoundingClientRect();
      const qtyBounds = qty?.getBoundingClientRect();
      return {
        width: window.innerWidth,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 || node.scrollWidth > node.clientWidth + 1,
        cardClippedHorizontally: bounds.left < -1 || bounds.right > window.innerWidth + 1,
        imageLoaded: img?.complete && img.naturalWidth > 0,
        imagePath: img ? new URL(img.currentSrc).pathname : null,
        displayedImageWidth: img ? Math.round(img.getBoundingClientRect().width) : 0,
        fontStatus: document.fonts.status,
        quantityInViewport: Boolean(qtyBounds && qtyBounds.top >= 0 && qtyBounds.bottom <= window.innerHeight),
        actionInViewport: Boolean(actionBounds && actionBounds.top >= 0 && actionBounds.bottom <= window.innerHeight),
        actionScrollDistance: actionBounds ? Math.max(0, Math.ceil(actionBounds.bottom - window.innerHeight)) : null,
      };
    });
    entry.display = display;
    const content = await card.innerText();
    report(entry, "viewport and horizontal layout", display.width === viewport.width && !display.horizontalOverflow && !display.cardClippedHorizontally);
    report(entry, "exact raster decoded", display.imageLoaded && display.imagePath === artwork);
    report(entry, "fonts settled", display.fontStatus === "loaded");
    report(entry, "name, conceptual disclosure, fixture unit and USD price", ["BPC-157", "Conceptual packaging", fixtureUnit, "synthetic USD fixture", "$12.50"].every((value) => content.includes(value)));
    report(entry, "quantity responds to control", await quantity.inputValue() === "2");
    report(entry, "request action enabled and reachable within one viewport", await action.isEnabled() && display.actionScrollDistance !== null && display.actionScrollDistance <= viewport.height);
  } catch (error) {
    report(entry, "mount and exercise actual card", false, String(error.message).split("\n")[0]);
  } finally {
    for (const [suffix, write] of [
      ["viewport", (path) => page.screenshot({ path, timeout: 5000 })],
      ["card", (path) => card.screenshot({ path, timeout: 5000 })],
    ]) {
      const file = name + "-" + suffix + ".png";
      try {
        await write(join(output, file));
        entry.screenshots.push(file);
      } catch (error) {
        report(entry, suffix + " screenshot", false, String(error.message).split("\n")[0]);
      }
    }
    report(entry, "no write or recovery requests", entry.writeRequestsBlocked === 0);
    await context.close();
  }
}

let preview;
let browser;
let previewLog = "";
try {
  const interfaces = JSON.parse(execFileSync("ip", ["-json", "link", "show"], { encoding: "utf8" }));
  result.network.loopbackOnly = interfaces.length === 1 && interfaces[0].ifname === "lo" && interfaces[0].flags.includes("UP");
  if (!result.network.loopbackOnly) throw new Error("Capture requires a loopback-only network namespace");
  const fixture = await fixtureResponses(candidate);
  const servedAsset = join(candidate, "dist", "public", artwork.slice(1));
  await access(servedAsset);
  if (createHash("sha256").update(await readFile(servedAsset)).digest("hex") !== artworkHash) {
    throw new Error("Candidate build does not contain the pinned WebP");
  }
  preview = spawn(process.execPath, ["scripts/preview-research.mjs"], {
    cwd: candidate, env: { HOME: process.env.HOME, PATH: process.env.PATH, PORT: "5199" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [preview.stdout, preview.stderr]) {
    stream.on("data", (chunk) => { previewLog = (previewLog + chunk.toString()).slice(-3000); });
  }
  const provenance = await waitForPreview(preview);
  if (provenance.candidateSha !== candidateSha || provenance.sourceTree !== candidateTree) {
    throw new Error("Loopback preview provenance does not match the pinned candidate");
  }
  browser = await chromium.launch({ headless: true, timeout: 12000 });
  result.browser = { name: "Chromium", version: browser.version() };
  await capture(browser, fixture, "phone", { width: 390, height: 844 }, true);
  await capture(browser, fixture, "desktop", { width: 1280, height: 900 }, false);
} catch (error) {
  result.captureError = String(error.message).split("\n")[0];
  console.error(result.captureError, previewLog);
} finally {
  try {
    await browser?.close();
  } finally {
    preview?.kill();
    result.status = !result.captureError && result.captures.length === 2 &&
      result.captures.every((entry) => entry.screenshots.length === 2 && entry.assertions.every((item) => item.pass))
      ? "passed" : "failed";
    await writeFile(join(output, "result.json"), JSON.stringify(result, null, 2) + "\n");
    if (result.status !== "passed") process.exitCode = 1;
  }
}
