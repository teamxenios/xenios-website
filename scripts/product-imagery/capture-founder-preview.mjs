import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "../evidence/lib/chrome.mjs";
import { PageSession, sleep } from "../evidence/lib/cdp.mjs";
import {
  REVIEWED_PREVIEW_RECORDS_SHA,
  REVIEWED_PREVIEW_SHA,
  REVIEWED_PREVIEW_TREE,
  UI_FIDELITY_REVIEW_SHA,
  UI_FIDELITY_REVIEW_TREE,
  writeFounderPreviewArtifacts,
} from "./build-founder-preview.mjs";
import { startFounderPreviewServer } from "./serve-founder-preview.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const EVIDENCE_ROOT = join(
  REPO_ROOT,
  "docs/product-imagery/evidence/ui-convergence/corrected-preview",
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) =>
  execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();

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
      const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000;
      const timeout = effectiveTimeoutMs > 0
        ? setTimeout(() => {
            const pending = this.pending.get(id);
            if (!pending) return;
            this.pending.delete(id);
            pending.reject(new Error(`${method}: timed out after ${effectiveTimeoutMs}ms`));
          }, effectiveTimeoutMs)
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

async function writeEvidenceFile(path, contents) {
  const retryable = new Set(["EACCES", "EBUSY", "EPERM", "UNKNOWN"]);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      writeFileSync(path, contents);
      return;
    } catch (error) {
      if (!retryable.has(error?.code) || attempt === 19) throw error;
      await sleep(100 + attempt * 50);
    }
  }
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
    { name: "three-way-comparison", path: "/founder-preview/index.html?view=three-way" },
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

async function inspectPreviewState(page) {
  return page.evaluate(String.raw`(() => {
    const text = (element) => String(element?.innerText ?? element?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        left: Number(value.left.toFixed(2)),
        right: Number(value.right.toFixed(2)),
        top: Number(value.top.toFixed(2)),
        bottom: Number(value.bottom.toFixed(2)),
        width: Number(value.width.toFixed(2)),
        height: Number(value.height.toFixed(2)),
      };
    };
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        bounds.width <= 0 ||
        bounds.height <= 0
      ) return false;
      if (bounds.width <= 1.1 && bounds.height <= 1.1 && style.clip !== "auto") return false;
      return true;
    };
    const summarizeElement = (element) => ({
      exists: Boolean(element),
      visible: visible(element),
      text: text(element),
      rect: rect(element),
    });
    const header = document.querySelector(".clarity-nav");
    const headerElements = {
      brand: header?.querySelector(".clarity-brand-link"),
      brandName: header?.querySelector(".clarity-brand-name"),
      desktopNav: header?.querySelector(".clarity-desktop-nav"),
      condensedNav: header?.querySelector(".clarity-condensed-nav"),
      signIn: header?.querySelector(".clarity-header-link"),
      startCare: header?.querySelector(".clarity-header-care"),
      menu: header?.querySelector(".clarity-menu-button"),
    };
    const mark = header?.querySelector(".wordmark-mark");
    const markStyle = mark ? getComputedStyle(mark) : null;
    const visibleHeaderRects = Object.entries(headerElements)
      .map(([name, element]) => ({ name, element, summary: summarizeElement(element) }))
      .filter((entry) => entry.summary.visible && entry.summary.rect);
    const overlapPairs = [];
    for (let leftIndex = 0; leftIndex < visibleHeaderRects.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < visibleHeaderRects.length; rightIndex += 1) {
        const left = visibleHeaderRects[leftIndex];
        const right = visibleHeaderRects[rightIndex];
        if (left.element.contains(right.element) || right.element.contains(left.element)) continue;
        const horizontal = Math.min(left.summary.rect.right, right.summary.rect.right) -
          Math.max(left.summary.rect.left, right.summary.rect.left);
        const vertical = Math.min(left.summary.rect.bottom, right.summary.rect.bottom) -
          Math.max(left.summary.rect.top, right.summary.rect.top);
        if (horizontal > 0.5 && vertical > 0.5) overlapPairs.push([left.name, right.name]);
      }
    }

    const cardSummary = (card) => {
      if (!card) return null;
      const body = card.querySelector("[data-card-content-key]");
      const category = card.querySelector(".core-card-category, .core-care-eyebrow");
      const specification = card.querySelector(".specification, .core-care-specification");
      const title = card.querySelector("[data-card-content-key] h3");
      const actions = Array.from(card.querySelectorAll(".core-card-action"));
      const image = card.querySelector(".product-media img");
      const bodyStyle = body ? getComputedStyle(body) : null;
      const categoryStyle = category ? getComputedStyle(category) : null;
      const specificationStyle = specification ? getComputedStyle(specification) : null;
      const titleStyle = title ? getComputedStyle(title) : null;
      const bodyBounds = body?.getBoundingClientRect();
      return {
        role: card.dataset.cardRole ?? null,
        canonicalId: card.dataset.canonicalId ?? null,
        imageClass: card.dataset.imageClass ?? null,
        availability: card.dataset.coreAvailability ?? null,
        cardSurface: card.dataset.cardSurface ?? null,
        workflowMode: card.dataset.workflowMode ?? null,
        actionAllowed: card.dataset.actionAllowed ?? null,
        assetJob: card.dataset.assetJob ?? null,
        contentKey: body?.dataset.cardContentKey ?? null,
        contentText: text(body),
        imageCount: card.querySelectorAll(".product-media img").length,
        mediaCount: card.querySelectorAll(".product-media").length,
        fallbackCount: card.querySelectorAll("[data-media-policy='safe-fallback']").length,
        policyKickerCount: card.querySelectorAll(".policy-kicker").length,
        quantityCount: card.querySelectorAll(".core-quantity").length,
        actionCount: actions.length,
        actionTexts: actions.map(text),
        actionHrefs: actions.map((action) => action.getAttribute("href")),
        actionHeights: actions.map((action) => Number(action.getBoundingClientRect().height.toFixed(2))),
        actionStyles: actions.map((action) => {
          const style = getComputedStyle(action);
          const bounds = action.getBoundingClientRect();
          return {
            backgroundColor: style.backgroundColor,
            color: style.color,
            display: style.display,
            borderRadius: style.borderRadius,
            fontWeight: style.fontWeight,
            alignSelf: style.alignSelf,
            width: Number(bounds.width.toFixed(2)),
          };
        }),
        interactiveCount: card.querySelectorAll("button, a, input, select, textarea, [role='button']").length,
        assetSha256: card.querySelector(".product-media")?.dataset.assetSha256 ?? null,
        imageSrc: image?.currentSrc ?? null,
        imageObjectFit: image ? getComputedStyle(image).objectFit : null,
        researchNotice: text(body).includes("Research use only: not for human or veterinary use."),
        researchBundleCopyCount: (text(body).match(/Research Bundle/g) || []).length,
        requestAvailabilityCopyCount: (text(body).match(/Request availability/g) || []).length,
        carePathwayLabelCount: card.querySelectorAll(".core-care-mode").length,
        careNoticeTexts: Array.from(card.querySelectorAll(".core-care-notice")).map(text),
        carePriceTexts: Array.from(card.querySelectorAll(".core-care-facts div:last-child dd")).map(text),
        anatomy: bodyStyle ? {
          gap: bodyStyle.rowGap,
          paddingTop: bodyStyle.paddingTop,
          paddingRight: bodyStyle.paddingRight,
          paddingBottom: bodyStyle.paddingBottom,
          paddingLeft: bodyStyle.paddingLeft,
          contentWidth: Number((
            bodyBounds.width - parseFloat(bodyStyle.paddingLeft) - parseFloat(bodyStyle.paddingRight)
          ).toFixed(2)),
          categoryFontFamily: categoryStyle?.fontFamily ?? null,
          categoryFontSize: categoryStyle?.fontSize ?? null,
          categoryFontWeight: categoryStyle?.fontWeight ?? null,
          categoryTextTransform: categoryStyle?.textTransform ?? null,
          specificationFontFamily: specificationStyle?.fontFamily ?? null,
          specificationFontSize: specificationStyle?.fontSize ?? null,
          specificationFontWeight: specificationStyle?.fontWeight ?? null,
          specificationTextTransform: specificationStyle?.textTransform ?? null,
          titleFontFamily: titleStyle?.fontFamily ?? null,
          titleFontSize: titleStyle?.fontSize ?? null,
          titleFontWeight: titleStyle?.fontWeight ?? null,
          titleLineHeight: titleStyle?.lineHeight ?? null,
        } : null,
      };
    };
    const cardPairs = Array.from(document.querySelectorAll("[data-comparison-kind]")).map((section) => {
      const current = cardSummary(section.querySelector("[data-card-role='current']"));
      const proposed = cardSummary(section.querySelector("[data-card-role='proposed']"));
      return {
        kind: section.dataset.comparisonKind,
        canonicalId: section.dataset.comparisonCanonicalId,
        pathway: section.dataset.comparisonPathway,
        disclosure: text(section.querySelector(".comparison-disclosure")),
        currentLabel: text(section.querySelector("[data-decision-role='current'] .comparison-label")),
        proposedLabel: text(section.querySelector("[data-decision-role='proposed'] .comparison-label")),
        current,
        proposed,
        coreContentMatches: Boolean(
          current && proposed &&
          current.contentKey === proposed.contentKey &&
          current.contentText === proposed.contentText
        ),
      };
    });
    const restrictiveCards = Array.from(
      document.querySelectorAll("[data-core-availability='TEMPORARILY_HELD']"),
    ).map(cardSummary);
    const packagingId = window.XENIOS_FOUNDER_PREVIEW_DATA?.representativeCanonicalIds
      ?.packagingUnverified ?? null;
    const packagingRow = window.XENIOS_FOUNDER_PREVIEW_DATA?.rows
      ?.find((row) => row.canonicalId === packagingId) ?? null;
    const careId = window.XENIOS_FOUNDER_PREVIEW_DATA?.representativeCanonicalIds?.care ?? null;
    const careRow = window.XENIOS_FOUNDER_PREVIEW_DATA?.rows
      ?.find((row) => row.canonicalId === careId) ?? null;

    const geometryRoot = document.querySelector(".geometry-three-grid");
    const geometryRoles = geometryRoot
      ? Array.from(geometryRoot.querySelectorAll("[data-geometry-role]")).map((role) => {
          const media = role.querySelector(".product-media");
          const image = role.querySelector(".product-media img");
          const bounds = media?.getBoundingClientRect();
          return {
            role: role.dataset.geometryRole,
            label: text(role.querySelector(".comparison-label")),
            bodyText: text(role),
            imageCount: role.querySelectorAll(".product-media img").length,
            mediaCount: role.querySelectorAll(".product-media").length,
            src: image?.currentSrc ?? null,
            assetSha256: media?.dataset.assetSha256 ?? null,
            objectFit: image ? getComputedStyle(image).objectFit : null,
            measuredRatio: bounds && bounds.height > 0
              ? Number((bounds.width / bounds.height).toFixed(4))
              : null,
          };
        })
      : [];

    const decisionSections = Array.from(document.querySelectorAll("[data-decision]"));
    const coreOrderButton = document.querySelector("[data-decision='B'] .core-order-button");
    const coreOrderStyle = coreOrderButton ? getComputedStyle(coreOrderButton) : null;
    const decisionDCurrent = cardSummary(
      document.querySelector("[data-decision='D'] [data-card-role='current']"),
    );
    const decisionDProposed = cardSummary(
      document.querySelector("[data-decision='D'] [data-card-role='proposed']"),
    );
    const accentRules = Array.from(document.querySelectorAll(".accent-rule"));
    const decisionMarks = Array.from(
      document.querySelectorAll("[data-decision='A'] .wordmark-mark"),
    ).map((element) => {
      const style = getComputedStyle(element);
      return {
        visible: visible(element),
        maskImage: style.maskImage || style.webkitMaskImage,
        backgroundColor: style.backgroundColor,
      };
    });
    const decisionBrandNames = Array.from(
      document.querySelectorAll("[data-decision='A'] .decision-brand-name"),
    ).map(summarizeElement);

    const detailRoot = document.querySelector("[data-detail-policy]");
    const triptychs = Array.from(document.querySelectorAll(".triptych-group")).map((group) => {
      const cards = Array.from(group.querySelectorAll(".triptych-card"));
      return {
        title: text(group.querySelector(".section-heading h2")),
        cards: cards.map((card) => ({
          label: text(card.querySelector(".triptych-label > span")),
          source: card.querySelector(".triptych-shot img")?.getAttribute("src") ?? null,
        })),
      };
    });
    const rawBodyText = document.body.innerText;
    const normalizedBodyText = text(document.body);
    return {
      title: document.title,
      ready: window.__XENIOS_PREVIEW_READY__,
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyText: rawBodyText,
      reviewIds: Array.from(document.querySelectorAll("#qa-body tr")).map((row) => row.dataset.canonicalId),
      catalogCount: document.querySelector("#catalog-count")?.textContent?.trim() ?? null,
      catalogCanonicalIds: Array.from(document.querySelectorAll("#catalog-grid .product-card")).map((card) => card.dataset.canonicalId),
      detailCanonicalId: document.querySelector("[data-detail-canonical-id]")?.dataset.detailCanonicalId ?? null,
      detailAssetJob: document.querySelector("[data-detail-asset-job]")?.dataset.detailAssetJob ?? null,
      header: {
        exists: Boolean(header),
        rect: rect(header),
        mark: {
          tag: mark?.tagName ?? null,
          visible: visible(mark),
          rect: rect(mark),
          maskImage: markStyle ? markStyle.maskImage || markStyle.webkitMaskImage : null,
          backgroundColor: markStyle?.backgroundColor ?? null,
        },
        elements: Object.fromEntries(
          Object.entries(headerElements).map(([name, element]) => [name, summarizeElement(element)]),
        ),
        overlapPairs,
      },
      decisions: {
        sections: decisionSections.map((section) => ({
          id: section.dataset.decision,
          approved: section.dataset.approved,
          currentLabels: Array.from(
            section.querySelectorAll("[data-decision-role='current'] .comparison-label"),
          ).map(text),
          proposedLabels: Array.from(
            section.querySelectorAll("[data-decision-role='proposed'] .comparison-label"),
          ).map(text),
        })),
        approvedTrueCount: document.querySelectorAll("[data-decision][data-approved='true']").length,
        marks: decisionMarks,
        brandNames: decisionBrandNames,
        bButton: coreOrderButton ? {
          text: text(coreOrderButton),
          backgroundColor: coreOrderStyle.backgroundColor,
          color: coreOrderStyle.color,
          height: Number(coreOrderButton.getBoundingClientRect().height.toFixed(2)),
          borderRadius: coreOrderStyle.borderRadius,
          paddingTop: coreOrderStyle.paddingTop,
          paddingRight: coreOrderStyle.paddingRight,
          paddingBottom: coreOrderStyle.paddingBottom,
          paddingLeft: coreOrderStyle.paddingLeft,
          fontWeight: coreOrderStyle.fontWeight,
          fontFamily: coreOrderStyle.fontFamily,
        } : null,
        legacyLabelCount: Array.from(decisionSections)
          .filter((section) => /legacy/i.test(text(section))).length,
        accentRules: accentRules.map((element) => ({
          role: element.closest("[data-decision-role]")?.dataset.decisionRole ?? null,
          backgroundImage: getComputedStyle(element).backgroundImage,
        })),
        dCoreContentMatches: Boolean(
          decisionDCurrent && decisionDProposed &&
          decisionDCurrent.contentKey === decisionDProposed.contentKey &&
          decisionDCurrent.contentText === decisionDProposed.contentText
        ),
      },
      cards: {
        pairs: cardPairs,
        restrictiveCards,
        careRow: careRow ? {
          canonicalId: careRow.canonicalId,
          pathway: careRow.pathway.key,
          imageClass: careRow.imageClass,
          assetJob: careRow.image.jobId,
          outputSha256: careRow.image.outputSha256,
        } : null,
        packagingRow: packagingRow ? {
          canonicalId: packagingRow.canonicalId,
          pathway: packagingRow.pathway.key,
          imageClass: packagingRow.imageClass,
          bindingState: packagingRow.bindingState.state,
          assetJob: packagingRow.image.jobId,
          assetImageClass: packagingRow.image.assetImageClass,
          outputSha256: packagingRow.image.outputSha256,
          reviewerDirective: packagingRow.image.reviewerDirective,
        } : null,
      },
      geometry: {
        canonicalId: geometryRoot?.dataset.geometryCanonicalId ?? null,
        assetSha256: geometryRoot?.dataset.geometryAssetSha256 ?? null,
        roles: geometryRoles,
      },
      detail: detailRoot ? {
        policy: detailRoot.dataset.detailPolicy,
        availability: detailRoot.dataset.coreAvailability,
        actionAllowed: detailRoot.dataset.actionAllowed,
        actionCount: detailRoot.querySelectorAll(".detail-core-action").length,
        interactiveCount: detailRoot.querySelectorAll("button, a, input, select, textarea, [role='button']").length,
        restrictionCopyCount: detailRoot.querySelectorAll(".restriction-copy").length,
      } : null,
      authorityCopy: {
        proposalLabel: /PROPOSED XENIOS HEALTH/.test(normalizedBodyText),
        actualCoreDenial: /not an Actual Core|not Actual Core/i.test(normalizedBodyText),
        actualCoreEvidenceLink: Array.from(document.querySelectorAll("a"))
          .some((link) => /Actual Core evidence/i.test(text(link))),
      },
      triptychs,
      accentRuleCount: accentRules.length,
    };
  })()`);
}

function assertFounderPreviewFidelity(state, planned) {
  const width = planned.width;
  assert.equal(state.header.exists, true, `${planned.name} must render the Core header`);
  assert.equal(state.header.mark.tag, "SPAN", `${planned.name} must use the masked span mark`);
  assert.equal(state.header.mark.visible, true, `${planned.name} must keep the mark visible`);
  assert.equal(state.header.mark.rect.width, 34, `${planned.name} mark width must match Core`);
  assert.equal(state.header.mark.rect.height, 15, `${planned.name} mark height must match Core`);
  assert.match(
    state.header.mark.maskImage,
    /xenios-mark-transparent\.png/,
    `${planned.name} must use the Core currentColor mask asset`,
  );
  assert.notEqual(
    state.header.mark.backgroundColor,
    "rgba(0, 0, 0, 0)",
    `${planned.name} masked mark must inherit a visible currentColor`,
  );
  assert.equal(state.header.elements.signIn.visible, true, `${planned.name} must keep Sign In visible`);
  assert.equal(state.header.elements.startCare.visible, true, `${planned.name} must keep Start Care visible`);
  assert.equal(
    state.header.elements.brandName.visible,
    width >= 520,
    `${planned.name} brand-name visibility must switch at 520px`,
  );
  assert.equal(
    state.header.elements.desktopNav.visible,
    width >= 1280,
    `${planned.name} desktop navigation must switch at 1280px`,
  );
  assert.equal(
    state.header.elements.condensedNav.visible,
    width >= 1024 && width < 1280,
    `${planned.name} condensed navigation must occupy 1024-1279px`,
  );
  assert.equal(
    state.header.elements.menu.visible,
    width < 1280,
    `${planned.name} menu visibility must mirror Core`,
  );
  assert.deepEqual(state.header.overlapPairs, [], `${planned.name} header controls must not overlap`);
  for (const [name, element] of Object.entries(state.header.elements)) {
    if (!element.visible || !element.rect) continue;
    assert.ok(element.rect.left >= -1, `${planned.name} ${name} must remain inside the viewport`);
    assert.ok(element.rect.right <= width + 1, `${planned.name} ${name} must remain inside the viewport`);
  }

  if (state.ready.view === "cards") {
    assert.deepEqual(
      state.cards.pairs.map((pair) => pair.kind),
      ["research", "care", "held", "quote-only", "binding-pending", "packaging-unverified"],
      `${planned.name} must render the six exact comparison witnesses`,
    );
    const expectedActionHeight = width >= 1024 ? 64 : width >= 768 ? 60 : width >= 390 ? 56 : 52;
    for (const pair of state.cards.pairs) {
      const carePair = ["care", "packaging-unverified"].includes(pair.kind);
      assert.equal(pair.coreContentMatches, true, `${planned.name} ${pair.kind} must change only media`);
      assert.equal(pair.current.imageCount, 0, `${planned.name} current ${pair.kind} must be text-only`);
      assert.equal(pair.current.mediaCount, 0, `${planned.name} current ${pair.kind} must have no media slot`);
      assert.equal(pair.current.policyKickerCount, 0, `${planned.name} current ${pair.kind} must not inject preview copy`);
      assert.equal(pair.proposed.imageCount, 1, `${planned.name} proposed ${pair.kind} must use one image`);
      assert.equal(pair.proposed.mediaCount, 1, `${planned.name} proposed ${pair.kind} must use one media slot`);
      assert.equal(pair.proposed.policyKickerCount, 0, `${planned.name} proposed ${pair.kind} must preserve Core card copy`);
      assert.equal(pair.proposed.fallbackCount, 0, `${planned.name} ${pair.kind} must not borrow a fallback`);
      assert.equal(pair.proposed.imageObjectFit, "contain", `${planned.name} ${pair.kind} must preserve contain`);
      for (const card of [pair.current, pair.proposed]) {
        assert.equal(card.anatomy.gap, carePair ? "16px" : "6px", `${planned.name} ${pair.kind} body gap must match Core`);
        assert.deepEqual(
          [
            card.anatomy.paddingTop,
            card.anatomy.paddingRight,
            card.anatomy.paddingBottom,
            card.anatomy.paddingLeft,
          ],
          carePair
            ? ["20px", "20px", "20px", "20px"]
            : ["16px", "16px", "16px", "16px"],
          `${planned.name} ${pair.kind} body padding must match Core`,
        );
        if (carePair) {
          assert.equal(card.anatomy.categoryFontWeight, "700");
          assert.equal(card.anatomy.categoryTextTransform, "uppercase");
          assert.equal(card.anatomy.titleFontWeight, "700");
          assert.ok(
            Math.abs(
              parseFloat(card.anatomy.titleLineHeight) /
                parseFloat(card.anatomy.titleFontSize) -
                1.25,
            ) < 0.01,
            `${planned.name} ${pair.kind} title leading must match assisted-order Core`,
          );
        } else {
          assert.match(card.anatomy.categoryFontFamily, /JetBrains Mono/);
          assert.equal(card.anatomy.categoryFontSize, "12px");
          assert.equal(card.anatomy.categoryFontWeight, "600");
          assert.equal(card.anatomy.categoryTextTransform, "uppercase");
          assert.match(card.anatomy.specificationFontFamily, /JetBrains Mono/);
          assert.equal(card.anatomy.specificationFontSize, "12px");
          assert.equal(card.anatomy.specificationFontWeight, "600");
          assert.equal(card.anatomy.specificationTextTransform, "uppercase");
          assert.match(card.anatomy.titleFontFamily, /Inter Tight/);
          assert.equal(card.anatomy.titleFontWeight, "500");
          assert.ok(
            Math.abs(
              parseFloat(card.anatomy.titleLineHeight) /
                parseFloat(card.anatomy.titleFontSize) -
                1.375,
            ) < 0.01,
            `${planned.name} ${pair.kind} title leading must match Core`,
          );
        }
        for (const height of card.actionHeights) {
          assert.ok(
            Math.abs(height - (carePair ? 44 : expectedActionHeight)) <= 0.5,
            `${planned.name} ${pair.kind} action height must match its Core surface`,
          );
        }
        for (const action of card.actionStyles) {
          assert.equal(action.backgroundColor, carePair ? "rgb(24, 61, 45)" : "rgb(14, 14, 14)", `${planned.name} action color must match Core`);
          assert.equal(action.color, "rgb(255, 255, 255)", `${planned.name} action text must be white`);
          assert.equal(action.display, carePair ? "inline-flex" : "flex", `${planned.name} action must use its Core flex treatment`);
          assert.equal(action.borderRadius, carePair ? "999px" : "4px", `${planned.name} action radius must match Core`);
          assert.equal(action.fontWeight, carePair ? "750" : "700", `${planned.name} action weight must match Core`);
          if (carePair) {
            assert.equal(action.alignSelf, "flex-start", `${planned.name} Care action must align like assisted-order Core`);
          } else {
            assert.ok(
              Math.abs(action.width - card.anatomy.contentWidth) <= 0.5,
              `${planned.name} action must fill the card content width`,
            );
          }
        }
      }
    }
    for (const kind of ["held", "quote-only", "binding-pending"]) {
      const pair = state.cards.pairs.find((candidate) => candidate.kind === kind);
      assert.ok(pair, `${planned.name} must include ${kind}`);
      for (const card of [pair.current, pair.proposed]) {
        assert.equal(card.actionAllowed, "false", `${planned.name} ${kind} must be restrictive`);
        assert.equal(card.actionCount, 0, `${planned.name} ${kind} must render no action`);
        assert.equal(card.quantityCount, 0, `${planned.name} ${kind} must render no quantity control`);
        assert.equal(card.interactiveCount, 0, `${planned.name} ${kind} must render no enabled-looking control`);
      }
    }
    const research = state.cards.pairs.find((pair) => pair.kind === "research");
    assert.equal(research.current.researchNotice, true, `${planned.name} current Research card must retain RUO copy`);
    assert.equal(research.proposed.researchNotice, true, `${planned.name} proposed Research card must retain RUO copy`);
    assert.deepEqual(research.current.actionTexts, ["Select"]);
    assert.deepEqual(research.proposed.actionTexts, ["Select"]);
    for (const card of [research.current, research.proposed]) {
      assert.equal(card.availability, "AVAILABLE");
      assert.equal(card.actionAllowed, "true");
      assert.equal(card.actionCount, 1);
      assert.equal(card.quantityCount, 1);
    }
    const care = state.cards.pairs.find((pair) => pair.kind === "care");
    assert.equal(care.canonicalId, "GRP-0001", `${planned.name} must retain the exact Care witness`);
    assert.equal(care.pathway, "care");
    assert.match(care.disclosure, /Core does not render Care products through this Research product-card surface/);
    assert.match(care.currentLabel, /ACTUAL ASSISTED-ORDER CARE PRESENTATION/);
    assert.match(care.proposedLabel, /SAME CARE PATHWAY PLUS MEDIA/);
    assert.equal(state.cards.careRow.canonicalId, "GRP-0001");
    assert.equal(state.cards.careRow.pathway, "care");
    for (const card of [care.current, care.proposed]) {
      assert.equal(card.availability, "PROVIDER_REVIEW_REQUIRED");
      assert.equal(card.cardSurface, "assisted-order-care");
      assert.equal(card.workflowMode, "provider_request");
      assert.equal(card.actionAllowed, "true");
      assert.deepEqual(card.actionTexts, ["Continue through Care"]);
      assert.deepEqual(card.actionHrefs, ["/care"]);
      assert.equal(card.actionCount, 1);
      assert.equal(card.quantityCount, 0);
      assert.equal(card.researchBundleCopyCount, 0);
      assert.equal(card.requestAvailabilityCopyCount, 0);
      assert.equal(card.carePathwayLabelCount, 1);
      assert.deepEqual(card.carePriceTexts, ["Ask the Care team about pricing"]);
      assert.deepEqual(card.careNoticeTexts, [
        "This product requires provider review through Xenios Care and cannot be added to a research order request.",
      ]);
    }
    const packaging = state.cards.pairs.find((pair) => pair.kind === "packaging-unverified");
    assert.equal(packaging.canonicalId, "GRP-0073", `${planned.name} must use the real packaging witness`);
    assert.equal(packaging.pathway, "care", `${planned.name} packaging witness must remain Care`);
    assert.match(packaging.disclosure, /Core does not render Care products through this Research product-card surface/);
    assert.equal(state.cards.packagingRow.canonicalId, "GRP-0073");
    assert.equal(state.cards.packagingRow.pathway, "care");
    assert.equal(state.cards.packagingRow.imageClass, "packaging_unverified");
    assert.equal(state.cards.packagingRow.bindingState, "retained_binding");
    assert.equal(state.cards.packagingRow.assetJob, "calibration-06-unverified-identity");
    assert.equal(state.cards.packagingRow.assetImageClass, "neutral_product_identity");
    assert.equal(
      state.cards.packagingRow.outputSha256,
      "77069db7b8324baf4780b37c585926a92b432e2fef24cbcdf019d38782cd7d8b",
    );
    assert.equal(state.cards.packagingRow.reviewerDirective, "replace_rejected_unverified_packaging");
    assert.equal(packaging.proposed.assetJob, "calibration-06-unverified-identity");
    assert.equal(packaging.proposed.assetSha256, state.cards.packagingRow.outputSha256);
    for (const card of [packaging.current, packaging.proposed]) {
      assert.equal(card.availability, "PROVIDER_REVIEW_REQUIRED");
      assert.equal(card.cardSurface, "assisted-order-care");
      assert.equal(card.workflowMode, "provider_request");
      assert.equal(card.actionAllowed, "true");
      assert.deepEqual(card.actionTexts, ["Continue through Care"]);
      assert.deepEqual(card.actionHrefs, ["/care"]);
      assert.equal(card.actionCount, 1);
      assert.equal(card.quantityCount, 0);
      assert.equal(card.researchBundleCopyCount, 0);
      assert.equal(card.requestAvailabilityCopyCount, 0);
      assert.equal(card.carePathwayLabelCount, 1);
      assert.deepEqual(card.carePriceTexts, ["Ask the Care team about pricing"]);
      assert.deepEqual(card.careNoticeTexts, [
        "This product requires provider review through Xenios Care and cannot be added to a research order request.",
      ]);
    }
  }

  if (["held", "quote"].includes(state.ready.view)) {
    assert.equal(state.detail.actionAllowed, "false", `${planned.name} detail must remain restrictive`);
    assert.equal(state.detail.actionCount, 0, `${planned.name} detail must have no action`);
    assert.equal(state.detail.interactiveCount, 0, `${planned.name} detail must have no enabled-looking control`);
    assert.equal(state.detail.restrictionCopyCount, 1, `${planned.name} must explain the absent action`);
    assert.ok(state.cards.restrictiveCards.length >= 2, `${planned.name} must retain both restrictive cards`);
    assert.ok(
      state.cards.restrictiveCards.every(
        (card) => card.actionCount === 0 && card.quantityCount === 0 && card.interactiveCount === 0,
      ),
      `${planned.name} restrictive cards must expose no action or quantity control`,
    );
  }

  if (["details", "decisions"].includes(state.ready.view)) {
    assert.deepEqual(
      state.geometry.roles.map((role) => role.role),
      ["public-no-image", "member-4x3", "proposed-1x1"],
      `${planned.name} must expose the three distinct evidence levels`,
    );
    const publicRole = state.geometry.roles[0];
    const memberRole = state.geometry.roles[1];
    const proposedRole = state.geometry.roles[2];
    assert.equal(publicRole.imageCount, 0, `${planned.name} public Core must have no image`);
    assert.equal(publicRole.mediaCount, 0, `${planned.name} public Core must have no media slot`);
    assert.equal(memberRole.imageCount, 1, `${planned.name} member source study must show geometry`);
    assert.equal(proposedRole.imageCount, 1, `${planned.name} proposal must show geometry`);
    assert.equal(memberRole.objectFit, "contain");
    assert.equal(proposedRole.objectFit, "contain");
    assert.equal(memberRole.src, proposedRole.src, `${planned.name} geometry studies must use the same pixels`);
    assert.equal(memberRole.assetSha256, proposedRole.assetSha256, `${planned.name} geometry studies must use one SHA`);
    assert.equal(memberRole.assetSha256, state.geometry.assetSha256);
    assert.ok(Math.abs(memberRole.measuredRatio - 4 / 3) < 0.01, `${planned.name} member frame must be 4:3`);
    assert.ok(Math.abs(proposedRole.measuredRatio - 1) < 0.01, `${planned.name} proposal frame must be 1:1`);
    assert.match(memberRole.bodyText, /SOURCE-VERIFIED/i);
    assert.match(memberRole.bodyText, /NOT LIVE\/OBSERVED RENDER/i);
    assert.match(proposedRole.bodyText, /UNAPPROVED/i);
  }

  if (state.ready.view === "decisions") {
    assert.deepEqual(state.decisions.sections.map((decision) => decision.id), ["A", "B", "C", "D", "E"]);
    assert.ok(state.decisions.sections.every((decision) => decision.approved === "false"));
    assert.equal(state.decisions.approvedTrueCount, 0);
    for (const decision of state.decisions.sections.filter((entry) => entry.id !== "E")) {
      assert.equal(decision.currentLabels.length, 1, `${planned.name} ${decision.id} needs a current label`);
      assert.equal(decision.proposedLabels.length, 1, `${planned.name} ${decision.id} needs a proposed label`);
      assert.match(decision.currentLabels[0], /CURRENT CORE/);
      assert.match(decision.proposedLabels[0], /PROPOSED XENIOS HEALTH/);
    }
    assert.equal(state.decisions.marks.length, 2, `${planned.name} decision A must show two masked marks`);
    assert.ok(state.decisions.marks.every((item) => item.visible));
    assert.ok(state.decisions.marks.every((item) => /xenios-mark-transparent\.png/.test(item.maskImage)));
    assert.ok(
      state.decisions.marks.every((item) => item.backgroundColor !== "rgba(0, 0, 0, 0)"),
      `${planned.name} decision A marks must inherit a visible currentColor`,
    );
    assert.ok(
      state.decisions.brandNames.every((item) => item.visible === (width >= 520)),
      `${planned.name} decision A names must mirror the Core 520px breakpoint`,
    );
    assert.deepEqual(state.decisions.bButton, {
      text: "Request availability",
      backgroundColor: "rgb(24, 61, 45)",
      color: "rgb(255, 255, 255)",
      height: 44,
      borderRadius: "999px",
      paddingTop: "12px",
      paddingRight: "20px",
      paddingBottom: "12px",
      paddingLeft: "20px",
      fontWeight: "750",
      fontFamily: state.decisions.bButton.fontFamily,
    });
    assert.match(state.decisions.bButton.fontFamily, /Inter Tight/);
    assert.equal(state.decisions.legacyLabelCount, 0, `${planned.name} must not invent a Legacy label`);
    assert.equal(state.decisions.accentRules.length, 1, `${planned.name} must isolate the accent proposal`);
    assert.equal(state.decisions.accentRules[0].role, "proposed");
    assert.match(state.decisions.accentRules[0].backgroundImage, /linear-gradient/);
    assert.equal(state.decisions.dCoreContentMatches, true, `${planned.name} decision D must change only media`);
  } else {
    assert.equal(state.accentRuleCount, 0, `${planned.name} must not leak the unapproved gradient`);
  }

  if (state.ready.view === "three-way") {
    assert.equal(state.triptychs.length, 6, `${planned.name} must retain all six A/B/C triptychs`);
    assert.equal(
      state.triptychs.reduce((sum, group) => sum + group.cards.length, 0),
      18,
      `${planned.name} must render exactly 18 authority-labelled comparison cards`,
    );
    for (const group of state.triptychs) {
      assert.deepEqual(
        group.cards.map((card) => card.label),
        ["A · ACTUAL CORE", "B · CURRENT / OLD PREVIEW", "C · PROPOSED XENIOS HEALTH"],
        `${planned.name} ${group.title} must preserve A/B/C authority labels`,
      );
      assert.match(
        group.cards[0].source,
        /^\/evidence\/ui-convergence\/(core-reference|core-synthetic-c0e25c73|core-account-synthetic-c0e25c73)\//,
        `${planned.name} ${group.title} Actual Core must use captured or exact-source evidence`,
      );
      assert.match(
        group.cards[1].source,
        /^\/evidence\/founder-preview\//,
        `${planned.name} ${group.title} old column must use the retained baseline`,
      );
      assert.match(
        group.cards[2].source,
        /^\/evidence\/ui-convergence\/corrected-preview\//,
        `${planned.name} ${group.title} proposal must use corrected-preview evidence`,
      );
    }
  }

  if (["home", "care", "journeys"].includes(state.ready.view)) {
    assert.equal(state.authorityCopy.proposalLabel, true, `${planned.name} must identify preview-authored proposal copy`);
    assert.equal(state.authorityCopy.actualCoreDenial, true, `${planned.name} must deny Actual Core authority`);
    assert.equal(state.authorityCopy.actualCoreEvidenceLink, true, `${planned.name} must link to Actual Core evidence`);
  }
}

export async function captureFounderPreview() {
  const { data } = writeFounderPreviewArtifacts();
  const implementationSource = {
    commit: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
  };
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
      const state = await inspectPreviewState(page);
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
          "three-way",
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
      assertFounderPreviewFidelity(state, planned);
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
      await writeEvidenceFile(screenshotPath, screenshot.bytes);
      const decoded = pngDimensions(screenshot.bytes, fileName);
      const textFileName = `${safeName(planned.name)}.text.txt`;
      const normalizedBodyText = `${state.bodyText}\n`
        .split(/\r?\n/)
        .map((line) => line.replace(/[ \t]+$/u, ""))
        .join("\n")
        .replace(/\n+$/u, "\n");
      await writeEvidenceFile(join(EVIDENCE_ROOT, textFileName), normalizedBodyText);
      const consoleMessages = page.console.slice(consoleStart);
      const severeConsole = consoleMessages.filter((entry) =>
        ["error", "assert"].includes(String(entry.type).toLowerCase()),
      );
      const networkRecords = page.network.slice(networkStart);
      const failedResponses = networkRecords.filter(
        (entry) => (entry.failed && !entry.canceled) || entry.status >= 400,
      );
      const boundaryViolations = page.networkBoundaryViolations.slice(boundaryStart);
      assert.deepEqual(severeConsole, [], `${planned.name} emitted browser errors`);
      assert.deepEqual(failedResponses, [], `${planned.name} emitted failed local responses`);
      assert.deepEqual(boundaryViolations, [], `${planned.name} attempted external network access`);
      assert.equal(screenshot.coverage.truncated, false, `${planned.name} screenshot must not truncate`);
      assert.equal(screenshot.coverage.layoutStable, true, `${planned.name} layout must remain stable during capture`);
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
          failedResponses: failedResponses.length,
          networkBoundaryViolations: boundaryViolations.length,
          screenshotTruncated: screenshot.coverage.truncated,
          layoutStable: screenshot.coverage.layoutStable,
          headerFidelity: true,
          boundedSurfaceFidelity: true,
        },
        fidelity: {
          header: state.header,
          decisions: state.decisions,
          cards: state.cards,
          geometry: state.geometry,
          detail: state.detail,
          authorityCopy: state.authorityCopy,
          triptychs: state.triptychs,
          accentRuleCount: state.accentRuleCount,
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
        networkRequestCount: networkRecords.length,
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
      schemaVersion: 3,
      kind: "private_founder_preview_final_ui_fidelity_browser_evidence",
      generatedAt: data.generatedAt,
      privatePrototype: true,
      productionQualified: false,
      deploymentAuthorized: false,
      partialDebugCapture: Boolean(captureFilter),
      captureFilter: captureFilter || null,
      sourceCoreCommit: data.sources.coreCatalog.commit,
      sourceCoreTree: data.sources.coreCatalog.tree,
      implementationSource,
      coreUiReference: {
        commit: "c0e25c73a0d789829ea213e2ee040c68e06f0a75",
        tree: "1771d18bad91b89e95414bebb8b574dc32729687",
        role: "dominant_public_ui_reference_only",
      },
      reviewedSource: {
        commit: REVIEWED_PREVIEW_SHA,
        tree: REVIEWED_PREVIEW_TREE,
        recordsCommit: REVIEWED_PREVIEW_RECORDS_SHA,
      },
      fidelityReview: {
        commit: UI_FIDELITY_REVIEW_SHA,
        tree: UI_FIDELITY_REVIEW_TREE,
        verdict: "FAIL_NARROW",
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
        failedResponses: records.reduce(
          (sum, record) => sum + record.assertions.failedResponses,
          0,
        ),
        networkBoundaryViolations: records.reduce(
          (sum, record) => sum + record.assertions.networkBoundaryViolations,
          0,
        ),
        truncatedScreenshots: records.filter(
          (record) => record.assertions.screenshotTruncated,
        ).length,
        unstableLayouts: records.filter(
          (record) => !record.assertions.layoutStable,
        ).length,
        decisionCaptures: records.filter(
          (record) => record.fidelity.decisions.sections.length === 5,
        ).length,
        cardComparisonCaptures: records.filter(
          (record) => record.fidelity.cards.pairs.length === 6,
        ).length,
        geometryComparisonCaptures: records.filter(
          (record) => record.fidelity.geometry.roles.length === 3,
        ).length,
        threeWayTriptychCaptures: records.filter(
          (record) => record.fidelity.triptychs.length === 6,
        ).length,
        proposalAuthorityCaptures: records.filter(
          (record) => record.fidelity.authorityCopy.proposalLabel,
        ).length,
      },
      captures: records,
    };
    const evidencePath = join(EVIDENCE_ROOT, "founder-preview-browser-evidence.json");
    await writeEvidenceFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
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
