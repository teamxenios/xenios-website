import { createServer } from "node:http";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.XENIOS_ACCEPTANCE_PORT || 5011);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST_ROOT = resolve(REPO_ROOT, "dist", "public");
const OUTPUT_ROOT = resolve(
  process.env.XENIOS_ACCEPTANCE_OUTPUT ||
    join(homedir(), "Downloads", "XENIOS-LAUNCH", "browser-evidence"),
);

const ROUTES = [
  ["company-home", "/"],
  ["health-gateway", "/health"],
  ["care-home", "/care"],
  ["care-request", "/care/schedule"],
  ["research-home", "/research"],
  ["research-access", "/research/access-hub"],
  ["research-order", "/research/order"],
  ["research-sign-in", "/research/sign-in"],
  ["research-recovery", "/research/reset-password"],
  ["research-apply", "/research/apply"],
  ["research-early-access", "/research/early-access"],
  ["research-about", "/research/about"],
  ["research-how", "/research/how-it-works"],
  ["research-faq", "/research/faq"],
  ["research-quality", "/research/quality"],
  ["research-testing", "/research/testing"],
  ["research-documents", "/research/documents"],
  ["research-support", "/research/support"],
  ["research-contact", "/research/contact"],
  ["research-policies", "/research/policies"],
];

const VIEWPORTS = [
  ["phone", { width: 390, height: 844 }],
  ["tablet", { width: 768, height: 1024 }],
  ["desktop", { width: 1440, height: 1000 }],
];

const SCREENSHOT_ROUTES = new Set([
  "health-gateway",
  "care-home",
  "care-request",
  "research-home",
  "research-access",
  "research-order",
  "research-sign-in",
]);

const ROUTE_FILTER = new Set(
  (process.env.XENIOS_ACCEPTANCE_ROUTES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const VIEWPORT_FILTER = new Set(
  (process.env.XENIOS_ACCEPTANCE_VIEWPORTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const ACTIVE_ROUTES = ROUTE_FILTER.size
  ? ROUTES.filter(([name, route]) => ROUTE_FILTER.has(name) || ROUTE_FILTER.has(route))
  : ROUTES;
const ACTIVE_VIEWPORTS = VIEWPORT_FILTER.size
  ? VIEWPORTS.filter(([name]) => VIEWPORT_FILTER.has(name))
  : VIEWPORTS;

const MIME = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

async function exists(path) {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "playwright",
    pathToFileURL(
      join(
        homedir(),
        ".cache",
        "codex-runtimes",
        "codex-primary-runtime",
        "dependencies",
        "node",
        "node_modules",
        "playwright",
        "index.mjs",
      ),
    ).href,
  ].filter(Boolean);
  let lastError;
  for (const candidate of candidates) {
    try {
      return await import(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Playwright could not be loaded: ${lastError?.message || "no candidate worked"}`);
}

async function createPreviewServer() {
  const indexPath = join(DIST_ROOT, "index.html");
  if (!(await exists(indexPath))) {
    throw new Error(`Built client not found at ${indexPath}. Run npm run build first.`);
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
      if (url.pathname.startsWith("/api/")) {
        response.writeHead(503, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(JSON.stringify({ ok: false, code: "local_api_unavailable" }));
        return;
      }

      const decoded = decodeURIComponent(url.pathname);
      const candidate = resolve(DIST_ROOT, `.${decoded}`);
      const staysInside = candidate === DIST_ROOT || candidate.startsWith(`${DIST_ROOT}${sep}`);
      let filePath = staysInside ? candidate : indexPath;
      try {
        if (!(await stat(filePath)).isFile()) filePath = indexPath;
      } catch {
        filePath = indexPath;
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": MIME.get(extname(filePath).toLowerCase()) || "application/octet-stream",
        "cache-control": "no-store",
      });
      if (request.method === "HEAD") response.end();
      else response.end(body);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(PORT, HOST, resolveListen);
  });
  return server;
}

function chromeExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => {
    try {
      return Boolean(candidate) && statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

async function openCustomerRoute(page, baseUrl, route) {
  const response = await page.goto(`${baseUrl}${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  if (response?.status() !== 200) throw new Error(`${route} returned ${response?.status() ?? "no response"}`);
  await page.waitForSelector("h1", { state: "attached", timeout: 10_000 });
}

async function runCustomerJourneys(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const results = [];

  async function run(name, execute, expectedResult = "PASS") {
    const page = await context.newPage();
    try {
      await execute(page);
      results.push({ name, result: expectedResult, error: null });
    } catch (error) {
      results.push({
        name,
        result: "FAIL",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await page.close();
    }
  }

  await run("Health → Care request", async (page) => {
    await openCustomerRoute(page, baseUrl, "/health");
    await page.getByRole("link", { name: "Start Care request" }).first().click();
    await page.waitForURL(`${baseUrl}/care/schedule`);
    await page.waitForSelector("h1");
    if (!(await page.locator("h1").innerText()).includes("Start your Care request")) {
      throw new Error("Care request heading did not appear after the primary CTA.");
    }
  });

  await run("Health → Research access", async (page) => {
    await openCustomerRoute(page, baseUrl, "/health");
    await page.getByRole("link", { name: "Explore Research" }).first().click();
    await page.waitForURL(`${baseUrl}/research/access-hub`);
    await page.waitForSelector("h1");
  });

  await run("Research access → order-entry hub", async (page) => {
    await openCustomerRoute(page, baseUrl, "/research/access-hub");
    await page.getByRole("link", { name: "Choose how to order" }).click();
    await page.waitForURL(`${baseUrl}/research/order`);
    await page.waitForSelector("h1");
  });

  await run("Order-entry hub → sign in → recovery", async (page) => {
    await openCustomerRoute(page, baseUrl, "/research/order");
    const memberAction = page.locator('[data-testid="order-mode-action-member_account"]');
    await memberAction.waitFor({ state: "visible" });
    await memberAction.click();
    await page.waitForURL((url) => url.pathname === "/research/sign-in");
    await page.waitForSelector("h1");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await page.waitForURL((url) => url.pathname === "/research/reset-password");
    await page.waitForSelector("h1");
  });

  await run("Care request capability fails closed without local API", async (page) => {
    const writes = [];
    page.on("request", (request) => {
      if (request.method() !== "GET" && request.method() !== "HEAD") writes.push(`${request.method()} ${request.url()}`);
    });
    await openCustomerRoute(page, baseUrl, "/care/schedule");
    await page.locator("#care-access-name").fill("Browser Acceptance");
    await page.locator("#care-access-email").fill("qa@example.test");
    await page.locator("#care-access-state").selectOption({ index: 1 });
    await page.locator("#care-access-goal").selectOption({ index: 1 });
    await page.locator("#care-access-contact-method").selectOption({ index: 1 });
    await page.locator("#care-access-contact-window").selectOption({ index: 1 });
    await page.locator("#care-access-adult").check();
    await page.locator("#care-access-boundary").check();
    if ((await page.locator("textarea").count()) !== 0) throw new Error("Public Care form exposed a free-text medical field.");
    if (!(await page.locator('[data-testid="care-access-submit"]').isDisabled())) {
      throw new Error("Care request submission was enabled without a verified local capability response.");
    }
    if ((await page.locator("#care-access-name").inputValue()) !== "Browser Acceptance") {
      throw new Error("Care form did not retain the entered synthetic name.");
    }
    if (writes.length > 0) throw new Error(`Form field check unexpectedly wrote data: ${writes.join(", ")}`);
  }, "BLOCKED (expected local API boundary)");

  await run("FAQ accordion", async (page) => {
    await openCustomerRoute(page, baseUrl, "/research/faq");
    const second = page.locator('[data-testid="button-faq-1"]');
    await second.click();
    if ((await second.getAttribute("aria-expanded")) !== "true") {
      throw new Error("FAQ panel did not open or announce its expanded state.");
    }
  });

  await run("Application legal gate", async (page) => {
    await openCustomerRoute(page, baseUrl, "/research/apply");
    const body = await page.locator("body").innerText();
    if (!/documents complete review|under review|applications will open/i.test(body)) {
      throw new Error("Application route did not disclose its legal-pending state.");
    }
    if ((await page.locator("form").count()) !== 0) {
      throw new Error("Application route exposed a form before approved legal versions exist.");
    }
  });

  await context.close();
  return results;
}

async function main() {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  let server;
  let browser;
  const results = [];
  const baseUrl = `http://${HOST}:${PORT}`;
  let journeys = [];

  try {
    const { chromium } = await loadPlaywright();
    const executablePath = chromeExecutable();
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
    server = await createPreviewServer();
    for (const [viewportName, viewport] of ACTIVE_VIEWPORTS) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      for (const [routeName, route] of ACTIVE_ROUTES) {
        const page = await context.newPage();
        const consoleErrors = [];
        const pageErrors = [];
        const failedRequests = [];
        const blockedApi = [];

        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("requestfailed", (request) => {
          failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "failed"}`);
        });
        page.on("response", (response) => {
          if (response.url().includes("/api/") && response.status() >= 400) {
            blockedApi.push(`${response.status()} ${new URL(response.url()).pathname}`);
          }
        });

        const response = await page.goto(`${baseUrl}${route}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        // The production bundle code-splits most customer routes. DOM content
        // loaded only proves index.html arrived; wait for the route's own
        // accessible heading before measuring or taking evidence.
        await page.waitForSelector("h1", { state: "attached", timeout: 10_000 }).catch(() => undefined);
        await page.waitForTimeout(250);
        const measurement = await page.evaluate(() => ({
          title: document.title,
          h1: Array.from(document.querySelectorAll("h1"), (entry) => entry.textContent?.trim() || ""),
          bodyText: document.body.innerText.slice(0, 500),
          bodyWidth: document.body.scrollWidth,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          emptyHrefs: document.querySelectorAll('a[href=""], a[href="#"]').length,
          disabledButtons: document.querySelectorAll("button:disabled").length,
        }));
        const horizontalOverflow = Math.max(measurement.bodyWidth, measurement.documentWidth) > measurement.viewportWidth + 1;
        const appError = /page not found|something went wrong|application error/i.test(measurement.bodyText);

        if (SCREENSHOT_ROUTES.has(routeName) && viewportName !== "tablet") {
          await page.screenshot({
            path: join(OUTPUT_ROOT, `${routeName}-${viewportName}.png`),
            fullPage: true,
          });
        }

        results.push({
          route,
          routeName,
          viewport: viewportName,
          status: response?.status() ?? null,
          ...measurement,
          horizontalOverflow,
          appError,
          consoleErrors,
          pageErrors,
          failedRequests,
          blockedApi: [...new Set(blockedApi)],
        });
        await page.close();
      }
      await context.close();
    }
    // Interaction checks are run once at a desktop viewport. They follow the
    // actual links and exercise client behavior but deliberately do not submit
    // customer data or call a production service.
    if (ROUTE_FILTER.size === 0 && VIEWPORT_FILTER.size === 0) {
      journeys = await runCustomerJourneys(browser, baseUrl);
    }
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
  }

  const expectedResultCount = ACTIVE_ROUTES.length * ACTIVE_VIEWPORTS.length;
  const integrityDefects = [];
  if (results.length !== expectedResultCount) {
    integrityDefects.push(`Expected ${expectedResultCount} route/viewport results but recorded ${results.length}.`);
  }
  if (ROUTE_FILTER.size === 0 && VIEWPORT_FILTER.size === 0 && results.length !== ROUTES.length * VIEWPORTS.length) {
    integrityDefects.push(`Full acceptance must record exactly ${ROUTES.length * VIEWPORTS.length} results.`);
  }
  if (ACTIVE_ROUTES.length === 0 || ACTIVE_VIEWPORTS.length === 0) {
    integrityDefects.push("Acceptance filters selected no routes or no viewports.");
  }
  const defects = results.filter(
    (entry) =>
      entry.status !== 200 ||
      entry.h1.length !== 1 ||
      entry.horizontalOverflow ||
      entry.appError ||
      entry.emptyHrefs > 0 ||
      entry.pageErrors.length > 0 ||
      entry.failedRequests.length > 0 ||
      entry.consoleErrors.some((message) => !/503 \(Service Unavailable\)/i.test(message)),
  );
  const journeyDefects = journeys.filter((entry) => entry.result === "FAIL");
  const journeyBlocks = journeys.filter((entry) => entry.result.startsWith("BLOCKED"));
  const blockedApi = [...new Set(results.flatMap((entry) => entry.blockedApi))].sort();
  const report = {
    generatedAt: new Date().toISOString(),
    source: relative(REPO_ROOT, DIST_ROOT),
    baseUrl,
    resultCount: results.length,
    defects: defects.length + journeyDefects.length + integrityDefects.length,
    integrityDefects,
    blockedApi,
    journeys,
    results,
  };
  await writeFile(join(OUTPUT_ROOT, "browser-acceptance.json"), `${JSON.stringify(report, null, 2)}\n`);

  const markdown = [
    "# Xenios customer browser acceptance",
    "",
    `- Routes × viewports: ${results.length}`,
    `- UI defects: ${defects.length + journeyDefects.length + integrityDefects.length}`,
    `- Click/form journeys: ${journeys.length ? `${journeys.length - journeyDefects.length - journeyBlocks.length} passed, ${journeyBlocks.length} blocked, ${journeyDefects.length} failed` : "not run (filtered audit)"}`,
    `- API status: ${blockedApi.length ? "BLOCKED in static preview (local Supabase configuration unavailable)" : "No blocked API calls observed"}`,
    "",
    "| Route | Viewport | HTTP | H1 | Overflow | UI result | API result |",
    "| --- | --- | ---: | ---: | --- | --- | --- |",
    ...results.map((entry) =>
      `| \`${entry.route}\` | ${entry.viewport} | ${entry.status ?? "—"} | ${entry.h1.length} | ${entry.horizontalOverflow ? "YES" : "NO"} | ${defects.includes(entry) ? "FAIL" : "PASS"} | ${entry.blockedApi.length ? "BLOCKED (local API)" : "No call observed"} |`,
    ),
    ...(integrityDefects.length ? ["", "## Harness integrity", "", ...integrityDefects.map((entry) => `- FAIL: ${entry}`)] : []),
    "",
    "## Click and form journeys",
    "",
    ...(journeys.length
      ? journeys.map((entry) => `- ${entry.result}: ${entry.name}${entry.error ? ` — ${entry.error}` : ""}`)
      : ["- Not run because a route or viewport filter was supplied."]),
    "",
    "## Local API boundary",
    "",
    blockedApi.length
      ? "The browser run used the production client bundle with a static local preview. API requests were answered fail-closed because this machine does not have the required Supabase environment variables; no credentials were invented or printed."
      : "No API request was blocked during these public-route checks.",
    "",
  ].join("\n");
  await writeFile(join(OUTPUT_ROOT, "browser-acceptance.md"), markdown);

  const defectCount = defects.length + journeyDefects.length + integrityDefects.length;
  process.stdout.write(`${JSON.stringify({ output: OUTPUT_ROOT, results: results.length, journeys: journeys.length, defects: defectCount, blockedApi }, null, 2)}\n`);
  if (defectCount > 0) process.exitCode = 1;
}

await main();
