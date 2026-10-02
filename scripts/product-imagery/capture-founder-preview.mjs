import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "../evidence/lib/chrome.mjs";
import { PageSession, sleep } from "../evidence/lib/cdp.mjs";
import { writeFounderPreviewArtifacts } from "./build-founder-preview.mjs";
import { startFounderPreviewServer } from "./serve-founder-preview.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const EVIDENCE_ROOT = join(
  REPO_ROOT,
  "docs/product-imagery/evidence/ui-convergence/corrected-preview",
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function pngDimensions(bytes, label) {
  assert.ok(Buffer.isBuffer(bytes), `${label} must be a Buffer`);
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${label} must be a PNG`,
  );
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.ok(width > 0 && height > 0, `${label} must have positive dimensions`);
  return { width, height };
}

class NativeCdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    assert.equal(typeof WebSocket, "function", "This capture requires the Node native WebSocket client");
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolveOpen, reject) => {
      this.ws.addEventListener("open", resolveOpen, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(JSON.parse(String(event.data))));
    this.ws.addEventListener("close", () => {
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("CDP connection closed"));
      }
      this.pending.clear();
    });
    return this;
  }

  onMessage(message) {
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
      return;
    }
    const key = `${message.sessionId ?? ""}|${message.method}`;
    for (const listener of this.listeners.get(key) ?? []) listener(message.params ?? {});
  }

  send(method, params = {}, sessionId, { timeoutMs } = {}) {
    const id = this.nextId++;
    return new Promise((resolveSend, reject) => {
      const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
        ? setTimeout(() => {
            const pending = this.pending.get(id);
            if (!pending) return;
            this.pending.delete(id);
            pending.reject(new Error(`${method}: timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : null;
      this.pending.set(id, { resolve: resolveSend, reject, method, timeout });
      try {
        this.ws.send(JSON.stringify({ id, method, params, sessionId }));
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  on(method, listener, sessionId) {
    const key = `${sessionId ?? ""}|${method}`;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(listener);
    return () => this.listeners.get(key)?.delete(listener);
  }

  async close() {
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) return;
    await new Promise((resolveClose) => {
      this.ws.addEventListener("close", resolveClose, { once: true });
      this.ws.close();
      setTimeout(resolveClose, 500);
    });
  }
}

function safeName(value) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function plannedCaptures(data) {
  const viewportMatrix = [
    { key: "desktop-1440", width: 1440, height: 1000 },
    { key: "desktop-1280", width: 1280, height: 900 },
    { key: "tablet-1024", width: 1024, height: 768 },
    { key: "tablet-834", width: 834, height: 1112 },
    { key: "tablet-768", width: 768, height: 1024 },
    { key: "mobile-430", width: 430, height: 932 },
    { key: "mobile-390", width: 390, height: 844 },
    { key: "mobile-375", width: 375, height: 812 },
    { key: "mobile-360", width: 360, height: 800 },
    { key: "mobile-320", width: 320, height: 760 },
  ];
  const surfaces = [
    { name: "home", path: "/founder-preview/index.html?view=home" },
    { name: "products", path: "/founder-preview/index.html?view=products" },
    { name: "featured", path: "/founder-preview/index.html?view=featured" },
    { name: "product-card-comparison", path: "/founder-preview/index.html?view=cards" },
    { name: "product-detail-comparison", path: "/founder-preview/index.html?view=details" },
    { name: "care", path: "/founder-preview/index.html?view=care" },
    { name: "held", path: "/founder-preview/index.html?view=held" },
    { name: "quote-only", path: "/founder-preview/index.html?view=quote" },
    { name: "coming-soon", path: "/founder-preview/index.html?view=coming" },
    { name: "account-status", path: "/founder-preview/index.html?view=journeys" },
    { name: "founder-decisions", path: "/founder-preview/index.html?view=decisions" },
    { name: "catalog-qa-grid", path: "/founder-preview/catalog-review.html?page=1&limit=12" },
  ];
  const captures = surfaces.flatMap((surface) =>
    viewportMatrix.map((viewport) => ({
      name: `${surface.name}-${viewport.key}`,
      path: surface.path,
      width: viewport.width,
      height: viewport.height,
      fullPage: true,
      responsiveMatrix: true,
      surface: surface.name,
    })),
  );
  captures.push(
    {
      name: "products-search-bam15-desktop",
      path: "/founder-preview/index.html?view=products",
      width: 1440,
      height: 1000,
      fullPage: true,
      interaction: { control: "catalog-search", value: "BAM15", expectedCount: 1, expectedCanonicalId: "GRP-0244" },
    },
    {
      name: "products-pathway-held-desktop",
      path: "/founder-preview/index.html?view=products",
      width: 1440,
      height: 1000,
      fullPage: true,
      interaction: { control: "catalog-pathway", value: "held", expectedCount: 1, expectedCanonicalId: "GRP-0422" },
    },
    { name: "review-fix-acetic-acid-detail-desktop", path: "/founder-preview/product-detail.html?id=GRP-0362", width: 1440, height: 1000, fullPage: true },
    { name: "review-fix-ghk-cu-detail-desktop", path: "/founder-preview/product-detail.html?id=GRP-0287", width: 1440, height: 1000, fullPage: true },
    { name: "review-fix-supplement-detail-desktop", path: "/founder-preview/product-detail.html?id=GRP-0366", width: 1440, height: 1000, fullPage: true },
  );
  const gridPageSize = 48;
  for (let page = 1; page <= Math.ceil(data.rows.length / gridPageSize); page += 1) {
    captures.push({
      name: `catalog-review-desktop-page-${String(page).padStart(2, "0")}`,
      path: `/founder-preview/catalog-review.html?page=${page}&limit=${gridPageSize}`,
      width: 1440,
      height: 1000,
      fullPage: true,
      gridEvidence: true,
    });
  }
  return captures;
}

async function waitForPreview(page) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await page.evaluate(
      "Boolean(window.__XENIOS_PREVIEW_READY__ && document.documentElement.dataset.previewReady === 'true')",
    );
    if (ready) return;
    await sleep(50);
  }
  throw new Error("Founder preview did not become ready");
}

async function prepareImages(page) {
  await page.evaluate(`(() => {
    for (const image of document.images) image.loading = "eager";
    window.scrollTo(0, document.body.scrollHeight);
    return document.images.length;
  })()`);
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const result = await page.evaluate(`(() => ({
      total: document.images.length,
      complete: Array.from(document.images).filter((image) => image.complete).length,
      broken: Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.currentSrc || image.src),
    }))()`);
    if (result.complete === result.total) {
      assert.deepEqual(result.broken, [], "Every preview image must decode");
      await page.evaluate("(window.scrollTo(0, 0), true)");
      return result;
    }
    await sleep(50);
  }
  throw new Error("Preview images did not finish loading");
}

export async function captureFounderPreview() {
  const { data } = writeFounderPreviewArtifacts();
  const captureFilter = String(process.env.XENIOS_CAPTURE_ONLY ?? "").trim().toLowerCase();
  const planned = plannedCaptures(data).filter(
    (capture) => !captureFilter || capture.name.toLowerCase().includes(captureFilter),
  );
  assert.ok(planned.length > 0, `No founder preview captures matched ${captureFilter}`);
  mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const preview = await startFounderPreviewServer({ port: 0 });
  let browser;
  let connection;
  const records = [];
  const gridIds = new Set();
  try {
    browser = await launchChromium();
    connection = await new NativeCdpConnection(browser.wsUrl).open();
    for (const plannedCapture of planned) {
      const planned = plannedCapture;
      const page = await PageSession.create(connection);
      await page.enforceNetworkBoundary(preview.origin);
      try {
      const consoleStart = page.console.length;
      const networkStart = page.network.length;
      const boundaryStart = page.networkBoundaryViolations.length;
      await page.setViewport({
        width: planned.width,
        height: planned.height,
        deviceScaleFactor: 1,
        mobile: planned.width <= 600,
      });
      await page.setMedia({ reducedMotion: true });
      await page.navigate(`${preview.origin}${planned.path}`, { maxSettleMs: 12000 });
      await waitForPreview(page);
      if (planned.interaction) {
        const interaction = JSON.stringify(planned.interaction);
        await page.evaluate(`(() => {
          const plan = ${interaction};
          const control = document.getElementById(plan.control);
          if (!control) throw new Error(\`Missing interaction control: \${plan.control}\`);
          control.value = plan.value;
          control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
          return true;
        })()`);
      }
      const images = await prepareImages(page);
      await page.settle({ quietMs: 250, maxSettleMs: 5000 });
      const state = await page.evaluate(`(() => ({
        title: document.title,
        ready: window.__XENIOS_PREVIEW_READY__,
        viewport: { width: innerWidth, height: innerHeight },
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyText: document.body.innerText,
        reviewIds: Array.from(document.querySelectorAll("#qa-body tr")).map((row) => row.dataset.canonicalId),
        catalogCount: document.querySelector("#catalog-count")?.textContent?.trim() ?? null,
        catalogCanonicalIds: Array.from(document.querySelectorAll("#catalog-grid .product-card")).map((card) => card.dataset.canonicalId),
        detailCanonicalId: document.querySelector("[data-detail-canonical-id]")?.dataset.detailCanonicalId ?? null,
        detailAssetJob: document.querySelector("[data-detail-asset-job]")?.dataset.detailAssetJob ?? null,
      }))()`);
      assert.equal(state.ready.customerTargets, 423);
      assert.ok(
        [
          "home",
          "products",
          "featured",
          "detail",
          "cards",
          "details",
          "care",
          "held",
          "quote",
          "pending",
          "journeys",
          "coming",
          "decisions",
          "core",
          "review",
          "wireframe",
          "calibration",
        ].includes(
          state.ready.view,
        ),
        `${planned.name} did not expose a recognized preview view`,
      );
      assert.ok(
        state.scrollWidth <= state.clientWidth + 1,
        `${planned.name} horizontally overflows: ${state.scrollWidth} > ${state.clientWidth}`,
      );
      if (planned.gridEvidence) for (const id of state.reviewIds) gridIds.add(id);
      if (planned.interaction) {
        assert.equal(state.catalogCanonicalIds.length, planned.interaction.expectedCount);
        assert.deepEqual(state.catalogCanonicalIds, [planned.interaction.expectedCanonicalId]);
        assert.equal(state.catalogCount, "1 product");
      }
      const screenshot = await page.screenshot({
        fullPage: planned.fullPage,
        maxHeight: 24000,
      });
      const fileName = `${safeName(planned.name)}.png`;
      const screenshotPath = join(EVIDENCE_ROOT, fileName);
      writeFileSync(screenshotPath, screenshot.bytes);
      const decoded = pngDimensions(screenshot.bytes, fileName);
      const textFileName = `${safeName(planned.name)}.text.txt`;
      const normalizedBodyText = `${state.bodyText}\n`
        .split(/\r?\n/)
        .map((line) => line.replace(/[ \t]+$/u, ""))
        .join("\n")
        .replace(/\n+$/u, "\n");
      writeFileSync(join(EVIDENCE_ROOT, textFileName), normalizedBodyText);
      const consoleMessages = page.console.slice(consoleStart);
      const severeConsole = consoleMessages.filter((entry) =>
        ["error", "assert"].includes(String(entry.type).toLowerCase()),
      );
      const boundaryViolations = page.networkBoundaryViolations.slice(boundaryStart);
      assert.deepEqual(severeConsole, [], `${planned.name} emitted browser errors`);
      assert.deepEqual(boundaryViolations, [], `${planned.name} attempted external network access`);
      records.push({
        name: planned.name,
        surface: planned.surface ?? null,
        responsiveMatrix: planned.responsiveMatrix === true,
        path: planned.path,
        viewport: { width: planned.width, height: planned.height, deviceScaleFactor: 1 },
        fullPage: planned.fullPage,
        screenshot: {
          repositoryPath: relative(REPO_ROOT, screenshotPath).replaceAll("\\", "/"),
          sha256: sha256(screenshot.bytes),
          byteSize: screenshot.bytes.length,
          width: decoded.width,
          height: decoded.height,
          coverage: screenshot.coverage,
        },
        text: {
          repositoryPath: relative(REPO_ROOT, join(EVIDENCE_ROOT, textFileName)).replaceAll("\\", "/"),
          sha256: sha256(Buffer.from(normalizedBodyText)),
        },
        assertions: {
          previewReady: true,
          customerTargets: state.ready.customerTargets,
          imagesTotal: images.total,
          imagesBroken: images.broken.length,
          horizontalOverflow: false,
          severeConsoleMessages: severeConsole.length,
          networkBoundaryViolations: boundaryViolations.length,
        },
        reviewCanonicalIds: planned.gridEvidence ? state.reviewIds : undefined,
        interaction: planned.interaction
          ? {
              ...planned.interaction,
              observedCount: state.catalogCanonicalIds.length,
              observedCanonicalIds: state.catalogCanonicalIds,
              observedCountLabel: state.catalogCount,
            }
          : undefined,
        detailCanonicalId: state.detailCanonicalId,
        detailAssetJob: state.detailAssetJob,
        networkRequestCount: page.network.slice(networkStart).length,
      });
      console.log(`captured ${planned.name} ${decoded.width}x${decoded.height}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
    if (!captureFilter) {
      assert.equal(gridIds.size, 423, "Desktop grid evidence must cover all 423 canonical IDs");
      assert.deepEqual([...gridIds].sort(), data.rows.map((row) => row.canonicalId).sort());
    }
    const evidence = {
      schemaVersion: 2,
      kind: "private_founder_preview_core_ui_convergence_browser_evidence",
      generatedAt: data.generatedAt,
      privatePrototype: true,
      productionQualified: false,
      deploymentAuthorized: false,
      partialDebugCapture: Boolean(captureFilter),
      captureFilter: captureFilter || null,
      sourceCoreCommit: data.sources.coreCatalog.commit,
      sourceCoreTree: data.sources.coreCatalog.tree,
      coreUiReference: {
        commit: "c0e25c73a0d789829ea213e2ee040c68e06f0a75",
        tree: "1771d18bad91b89e95414bebb8b574dc32729687",
        role: "dominant_public_ui_reference_only",
      },
      uiReviewBaseline: {
        commit: "ae5c410ab6e5c27df94c5bdc5b6533ab821b6d4c",
        tree: "36dd5df64f5da1caf8a1212c89195caf870a907d",
      },
      imageryReviewTarget: data.sources.imageryReviewTarget.commit,
      browser: {
        name: browser.browserName,
        version: browser.browserVersion,
        revision: browser.revision,
        protocolVersion: browser.protocolVersion,
      },
      serverBoundary: {
        origin: "loopback_ephemeral",
        documentRoot: "docs/product-imagery",
        externalNetworkAllowed: false,
      },
      counts: {
        captures: records.length,
        responsiveMatrixCaptures: records.filter((record) => record.responsiveMatrix).length,
        responsiveWidths: [...new Set(records.filter((record) => record.responsiveMatrix).map((record) => record.viewport.width))],
        responsiveSurfaces: [...new Set(records.filter((record) => record.responsiveMatrix).map((record) => record.surface))],
        customerTargets: data.rows.length,
        gridCanonicalIdsCovered: gridIds.size,
        brokenImages: records.reduce((sum, record) => sum + record.assertions.imagesBroken, 0),
        severeConsoleMessages: records.reduce(
          (sum, record) => sum + record.assertions.severeConsoleMessages,
          0,
        ),
        networkBoundaryViolations: records.reduce(
          (sum, record) => sum + record.assertions.networkBoundaryViolations,
          0,
        ),
      },
      captures: records,
    };
    const evidencePath = join(EVIDENCE_ROOT, "founder-preview-browser-evidence.json");
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(
      `Founder preview browser evidence: ${records.length} captures, ${gridIds.size}/423 QA IDs, 0 broken images.`,
    );
    return evidence;
  } finally {
    if (connection) await connection.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await preview.close().catch(() => {});
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await captureFounderPreview();
}
