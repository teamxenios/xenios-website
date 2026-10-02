// Capture exact-source, dev-only synthetic account and commerce presentation.
//
// This does not authenticate a member, contact a hosted service, or prove API,
// Product Control, pricing, payment, fulfillment, or production behavior. It
// renders the frozen Core review harness with repository-owned synthetic data.
//
// Usage:
//   node scripts/product-imagery/capture-core-account-reference.mjs \
//     --core-root <detached exact-Core worktree> --out-dir <evidence directory>

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { launchChromium } from "../evidence/lib/chrome.mjs";
import { CdpConnection, PageSession, pngDimensions, sleep } from "../evidence/lib/cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const CORE_SHA = "c0e25c73a0d789829ea213e2ee040c68e06f0a75";
const CORE_TREE = "1771d18bad91b89e95414bebb8b574dc32729687";
const DEFAULT_NODE = "C:\\Users\\sboad\\.codex\\tmp\\node-v20.19.0-win-x64\\node.exe";

const SCREENS = Object.freeze([
  Object.freeze({
    key: "account-overview",
    query: "overview",
    requiredText: Object.freeze(["Your account, clearly organized.", "Membership"]),
    requiredSelectors: Object.freeze(["#account-main-content", ".account-page-title", "#account-identity-heading", ".account-surface"]),
  }),
  Object.freeze({
    key: "orders",
    query: "orders",
    requiredText: Object.freeze([
      "Commerce history, without ambiguity.",
      "Research commerce history",
      "XRR-20260820-TESTFIX01",
      "XRR-20260811-TESTFIX02",
    ]),
    requiredSelectors: Object.freeze(["#account-main-content", ".account-page-title", "#research-orders-heading", ".account-list-card"]),
  }),
  Object.freeze({
    key: "order-detail",
    query: "order-detail",
    requiredText: Object.freeze(["Commerce record details.", "Payment"]),
    requiredSelectors: Object.freeze(["#account-main-content", ".account-page-title"]),
  }),
]);

const VIEWPORTS = Object.freeze([
  Object.freeze({ key: "desktop", width: 1440, height: 900 }),
  Object.freeze({ key: "mobile", width: 390, height: 844 }),
]);

function parseArgs(argv) {
  const parsed = { coreRoot: null, outDir: null, node: DEFAULT_NODE };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      index += 1;
      assert.ok(argv[index], `${arg} requires a value`);
      return argv[index];
    };
    if (arg === "--core-root") parsed.coreRoot = resolve(value());
    else if (arg === "--out-dir") parsed.outDir = resolve(value());
    else if (arg === "--node") parsed.node = resolve(value());
    else throw new Error(`Unknown argument: ${arg}`);
  }
  assert.ok(parsed.coreRoot, "--core-root is required");
  assert.ok(parsed.outDir, "--out-dir is required");
  return parsed;
}

function git(coreRoot, ...args) {
  return execFileSync("git", args, { cwd: coreRoot, encoding: "utf8" }).trim();
}

function assertExactCore(coreRoot) {
  assert.equal(git(coreRoot, "rev-parse", "HEAD"), CORE_SHA, "Core checkout SHA changed");
  assert.equal(git(coreRoot, "rev-parse", "HEAD^{tree}"), CORE_TREE, "Core checkout tree changed");
  assert.equal(
    git(coreRoot, "status", "--porcelain", "--untracked-files=no"),
    "",
    "Core checkout has tracked modifications",
  );
}

async function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const { port } = address;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function waitForServer(origin, child, tail) {
  const url = `${origin}/src/research/account-portal/review/index.html?screen=overview`;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Vite exited early (${child.exitCode}): ${tail()}`);
    try {
      const response = await fetch(url, { redirect: "error" });
      if (response.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Vite did not become ready: ${tail()}`);
}

async function waitForContent(page, requiredText, requiredSelectors) {
  let lastState = null;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const state = await page.evaluate(`(() => ({
      main: Boolean(document.querySelector("#account-main-content")),
      selectors: ${JSON.stringify(requiredSelectors)}.map((selector) => Boolean(document.querySelector(selector))),
      text: document.body.innerText,
    }))()`);
    lastState = state;
    const normalizedText = state.text.toLocaleLowerCase("en-US");
    if (
      state.main &&
      state.selectors.every(Boolean) &&
      requiredText.every((text) => normalizedText.includes(text.toLocaleLowerCase("en-US")))
    ) return state.text;
    await sleep(50);
  }
  throw new Error(
    `Synthetic Core account content did not settle: ${requiredText.join(" | ")}; ` +
    `last=${JSON.stringify(lastState?.text?.slice(0, 1200) ?? null)}`,
  );
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sanitizeSyntheticEvidenceText(value) {
  return String(value)
    .replaceAll(/test\.customer@example\.invalid/giu, "SYNTHETIC-EMAIL-REDACTED")
    .replaceAll(/fixture\d+@preview\.invalid/giu, "SYNTHETIC-EMAIL-REDACTED");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertExactCore(args.coreRoot);
  mkdirSync(args.outDir, { recursive: true });

  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const viteCli = join(args.coreRoot, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(
    args.node,
    [viteCli, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: args.coreRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: process.env.PATH,
        PATHEXT: process.env.PATHEXT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        NODE_ENV: "development",
      },
    },
  );
  const output = [];
  const collect = (chunk) => {
    output.push(String(chunk));
    if (output.length > 80) output.shift();
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const tail = () => output.join("").slice(-4000);

  let browser;
  let connection;
  const captures = [];
  try {
    await waitForServer(origin, child, tail);
    browser = await launchChromium({
      extraArgs: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"],
    });
    connection = await new CdpConnection(browser.wsUrl).open();

    for (const screen of SCREENS) {
      for (const viewport of VIEWPORTS) {
        const page = await PageSession.create(connection);
        try {
          await page.enforceNetworkBoundary(origin, {
            allowedOrigins: [origin],
            allowedWebSocketOrigins: [origin.replace(/^http/u, "ws")],
            fulfillments: [{
              url: `${origin}/favicon.ico`,
              body: "",
              contentType: "image/x-icon",
              reason: "empty loopback favicon avoids an incidental Vite 404",
            }],
          });
          await page.setViewport({
            width: viewport.width,
            height: viewport.height,
            mobile: viewport.width < 600,
          });
          await page.setMedia({ reducedMotion: true, colorScheme: "light" });
          const url = `${origin}/src/research/account-portal/review/index.html?screen=${screen.query}`;
          await page.navigate(url, { quietMs: 350, maxSettleMs: 12_000 });
          const bodyText = await waitForContent(page, screen.requiredText, screen.requiredSelectors);
          const audit = await page.evaluate(`(() => ({
            title: document.title,
            pathname: location.pathname,
            search: location.search,
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            syntheticFixtureMarker: document.body.innerText.includes("test.customer@example.invalid"),
          }))()`);
          const screenshot = await page.screenshot({ fullPage: true });
          const fileStem = `${screen.key}-synthetic--default--chromium--${viewport.width}--01`;
          const pngPath = join(args.outDir, `${fileStem}.png`);
          const textPath = join(args.outDir, `${fileStem}.text.txt`);
          writeFileSync(pngPath, screenshot.bytes);
          writeFileSync(textPath, `${sanitizeSyntheticEvidenceText(bodyText).trim()}\n`, "utf8");

          const severeConsole = page.console.filter((entry) =>
            ["error", "exception", "assert", "log:error"].includes(entry.level),
          );
          const badResponses = page.network.filter((entry) => entry.status >= 400 || entry.failed);
          assert.equal(audit.horizontalOverflow, false, `${fileStem} has horizontal overflow`);
          assert.equal(page.networkBoundaryViolations.length, 0, `${fileStem} crossed the loopback boundary`);
          assert.deepEqual(severeConsole, [], `${fileStem} emitted severe console messages`);
          assert.deepEqual(badResponses, [], `${fileStem} received a failed response`);
          captures.push({
            name: fileStem,
            screen: screen.query,
            viewport,
            urlPath: audit.pathname + audit.search,
            png: pngPath.slice(REPO_ROOT.length + 1).replaceAll("\\", "/"),
            text: textPath.slice(REPO_ROOT.length + 1).replaceAll("\\", "/"),
            pngSha256: sha256(screenshot.bytes),
            pngBytes: screenshot.bytes.length,
            dimensions: pngDimensions(screenshot.bytes),
            coverage: screenshot.coverage,
            assertions: {
              exactCoreSha: true,
              exactCoreTree: true,
              loopbackOnly: true,
              syntheticRepositoryFixturesOnly: true,
              authenticatedSessionProven: false,
              liveApiProven: false,
              horizontalOverflow: false,
              severeConsoleMessages: 0,
              failedResponses: 0,
              networkBoundaryViolations: 0,
            },
          });
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    if (connection) await connection.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (child.exitCode === null) child.kill();
  }

  assert.equal(captures.length, 6);
  assertExactCore(args.coreRoot);
  const receipt = {
    schemaVersion: 1,
    kind: "exact-core-dev-only-synthetic-account-order-ui-evidence",
    capturedAt: new Date().toISOString(),
    claimScope: "UI_PRESENTATION_ONLY",
    source: {
      commit: CORE_SHA,
      tree: CORE_TREE,
      harness: "client/src/research/account-portal/review/index.html",
      fixture: "shared/research/customer-account/fixtures.ts",
      captureHelper: {
        path: "scripts/product-imagery/capture-core-account-reference.mjs",
        sha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
      },
    },
    execution: {
      loopbackOnly: true,
      coreSourceEdited: false,
      realCredentialsUsed: false,
      realCustomerDataUsed: false,
      hostedReadsOrWrites: false,
      productionMutation: false,
    },
    limitations: {
      provesUiPresentationOnly: true,
      provesAuthentication: false,
      provesLiveApiAdapters: false,
      provesProductControl: false,
      provesPricingAvailabilityOrCommerce: false,
      provesDependencyInstallSeal: false,
      grantsRuntimePublicationDeploymentOrProductionApproval: false,
    },
    counts: {
      screens: SCREENS.length,
      viewports: VIEWPORTS.length,
      captures: captures.length,
      horizontalOverflow: 0,
      severeConsoleMessages: 0,
      failedResponses: 0,
      networkBoundaryViolations: 0,
    },
    captures,
  };
  const receiptPath = join(args.outDir, "synthetic-account-order-evidence.json");
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ receiptPath, counts: receipt.counts }, null, 2)}\n`);
}

await main();
