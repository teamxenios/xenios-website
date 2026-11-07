import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import {
  agreementAccept, agreementStatus, alternateArtwork, alternateMemberOffering, alternateOrderVariant, alternateSourceVariant, artwork, fixtureAgreement, fixtureContact,
  fixtureCurrency, fixturePrice, fixtureResponses, svgCardFixtureResponses, fixtureUnit, guestRoute, memberBearer,
  guestCatalogPath, guestMobileCatalogFixtures, guestMobileCatalogResponse, guestMobileOtherFamily, guestMobilePageMarkers,
  memberDetailRoute, memberOffering, memberRoute, memberSession, orderVariant, sourceVariant,
} from "./fixture.mjs";

const [candidate, output, candidateSha, candidateTree, harnessRevision, runId, runAttempt, allowanceFile, profile = "legacy"] = process.argv.slice(2);
if (!["legacy", "guest-catalog-details", "reviewed-catalog", "guest-mobile-catalog", "guest-mobile-request-dock", "guest-mobile-request-dock-v2"].includes(profile)) {
  throw new Error("Unknown capture profile");
}
const guestDetailsOnly = profile === "guest-catalog-details";
const reviewedCatalog = profile === "reviewed-catalog";
const combinedRequestDock = profile === "guest-mobile-request-dock-v2";
const guestRequestDock = profile === "guest-mobile-request-dock" || combinedRequestDock;
const requestPolicy = combinedRequestDock ? { kind: "early_access_terms", version: "v2" } : fixtureAgreement;
const dockCopy = combinedRequestDock
  ? { details: "Continue to details", contact: "Continue to submit request", review: "Submit your request",
      submit: "Submit request", summary: "Your request (1)" }
  : { details: "Continue to contact", contact: "Review request", review: "Review your request",
      submit: "Submit for review", summary: "Review request (1)" };
const intentPath = "/api/research/early-access/request-intents";
const receiptOriginPath = "/__xenios_qa_dock_origin";
const attemptStorageKey = "xenios.assisted-order.intent-attempt.v1";
const recoveryFixtureKey = "00000000-0000-4000-8000-000000000026";
const combinedPolicyDigest = "491d2559f05f6201ee0279bbd0fb711ebc7eeb1fd0a826c8d9141373c146fa06";
const guestMobileCatalog = profile === "guest-mobile-catalog" || guestRequestDock;
const reviewedVialCaptures = new Map([
  ["mov_09db3e866424b64994d3", "bpc-5mg"],
  ["mov_257330ea83ecbfc45fae", "bpc-15mg"],
]);
const capsuleControl = "mov_753d3f94385adf791d1e";
const capsuleEvidenceVariants = new Set([
  "mov_2183aa9edb06f34ef3af",
  capsuleControl,
  "mov_a2d32f69681dca2b17fb",
  "mov_fe292b5f03527ec13e5e",
]);
const chondroVariant = "mov_2de19f71e09e8bc3febb";
const allowance = JSON.parse(await readFile(allowanceFile, "utf8"));
if (allowance.currentRunId !== runId || allowance.attempt !== allowance.distinctRunIds.length ||
    ![1, 2].includes(allowance.maximumAttempts) || allowance.attempt < 1 ||
    allowance.attempt > allowance.maximumAttempts || allowance.remainingAfterThisRun !== allowance.maximumAttempts - allowance.attempt) {
  throw new Error("Capture allowance does not match this dispatch");
}
const origin = "http://127.0.0.1:5199";
const artworkHash = "202bee1aceaf841438001afa93b8e56a9643866e16c563ef8ad9a2d412853df1";
const viewports = guestMobileCatalog ? [
  { width: 320, height: 800, mobile: true },
  { width: 375, height: 812, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 430, height: 932, mobile: true },
  { width: 1280, height: 900, mobile: false },
] : [
  { width: 320, height: 800, mobile: true },
  { width: guestDetailsOnly || reviewedCatalog ? 390 : 375, height: 844, mobile: true },
  { width: 768, height: 1024, mobile: false },
  { width: 1280, height: 900, mobile: false },
];
const result = {
  scope: "NON-PRODUCTION SYNTHETIC BROWSER EVIDENCE",
  limits: [
    "Fixture prices are synthetic. No approved price, live identity, product authorization or persistence is tested.",
    "The source catalog has separate 10 mg and 5 mg listings. Detail intentionally groups their exact media IDs only in the fixture.",
    "Layout checks establish decoded media and geometry. Inspect screenshots for label, cap and base readability.",
    combinedRequestDock
      ? "Two explicit fixture-only submissions and one explicit fixture-only recovery exercise receipt presentation and focus."
      : "No submission, recovery, staff readback, production release or operator activation is covered.",
    ...(combinedRequestDock ? ["The enlarged-text check uses a 200% root font size at a fixed Chromium viewport."] : []),
    ...(guestMobileCatalog ? ["Chromium viewport geometry and DOM focus only. Native iPhone Safari keyboard, browser chrome, zoom and safe-area behavior are not measured."] : []),
  ],
  candidateSha, candidateTree, harnessRevision, runId, runAttempt: Number(runAttempt), allowance, profile,
  artifacts: `https://github.com/teamxenios/xenios-website/actions/runs/${runId}#artifacts`,
  upstreamHarness: "scripts/evidence/build-candidate-preview.mjs + scripts/preview-research.mjs",
  fixture: {
    sourceVariant, alternateSourceVariant, orderVariant, alternateOrderVariant, memberOffering, alternateMemberOffering, fixturePrice, fixtureCurrency, fixtureUnit,
    policy: { slug: combinedRequestDock ? "early-access-product-policy" : "research-use",
      agreement: requestPolicy, acceptance: "one exact in-memory intercept per guest context" },
  },
  assets: { packshot: { file: artwork, sha256: artworkHash }, fallback: { file: alternateArtwork } },
  network: { loopbackOnly: false, serviceWorkers: "blocked", externalRequests: "blocked" },
  captures: [],
};
const report = (entry, name, pass, detail) => {
  entry.assertions.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });
};
const briefError = (error) => String(error.message).split("\n")[0];

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

function holdDockReply(flow, phase) {
  let notify, release;
  const started = new Promise((resolve) => { notify = resolve; });
  const resume = new Promise((resolve) => { release = resolve; });
  flow.pause = { phase, notify, resume };
  return {
    wait: () => Promise.race([started, delay(6500).then(() => { throw new Error("Synthetic reply was not reached: " + phase); })]),
    release,
  };
}

async function waitForDockReply(flow, phase) {
  const pause = flow.pause;
  if (pause?.phase !== phase) return;
  flow.pause = null;
  pause.notify();
  await pause.resume;
}

function syntheticDockReceipt(mode) {
  const requestId = mode === "recover"
    ? "00000000-0000-4000-8000-000000000028" : "00000000-0000-4000-8000-000000000027";
  return { kind: "unapproved_selection_request", requestId,
    publicReference: "XRI-" + requestId.replaceAll("-", "").toUpperCase(),
    status: "pending_review", createdAt: "2026-11-06T00:00:00.000Z" };
}

function combinedReceiptReply(flow, path, member, auth, input) {
  if (flow.mode === "recover" && path === intentPath + "/recover" &&
      member && auth === memberBearer && input && Object.keys(input).length === 1 &&
      input.idempotencyKey === recoveryFixtureKey) {
    return { receipt: syntheticDockReceipt("recover") };
  }
  if (flow.mode !== "submit" || path !== intentPath || member || auth !== null) return null;
  const request = flow.validate(input);
  const [line] = request.lines;
  const standing = request.agreements.filter((item) => item.kind === requestPolicy.kind);
  if (request.lines.length !== 1 || line.productId !== "qa-bpc-157-product" ||
      line.variantId !== orderVariant || line.quantity !== 2 ||
      request.contact.fullLegalName !== fixtureContact.name || request.contact.email !== fixtureContact.email ||
      request.contact.shippingAddress.line1 !== fixtureContact.shippingLine1 ||
      standing.length !== 1 || standing[0].version !== requestPolicy.version || standing[0].accepted !== true) {
    return null;
  }
  return syntheticDockReceipt("submit");
}

async function captureContext(browser, fixtures, viewport, mobile, member, entry, receiptFlow) {
  const context = await browser.newContext({
    viewport, screen: viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    locale: "en-US", serviceWorkers: "block", acceptDownloads: false,
  });
  if (member) {
    await context.addInitScript(({ origin, session }) => {
      if (window.location.origin === origin) localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
    }, { origin, session: memberSession });
  }
  const traffic = { accepted: 0, verifiedMember: 0, fallbackAssetAborted: 0, deniedExternal: 0,
    deniedLocalReads: 0, deniedWrites: 0, deniedRecovery: 0, deniedWebSockets: 0 };
  if (combinedRequestDock) Object.assign(traffic, { syntheticSubmit: 0, syntheticRecover: 0 });
  entry.network = traffic;
  await context.routeWebSocket("**/*", (socket) => {
    traffic.deniedWebSockets += 1;
    return socket.close();
  });
  await context.route("**/*", async (intercept) => {
    const request = intercept.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      traffic.deniedExternal += 1;
      if (request.method() !== "GET") traffic.deniedWrites += 1;
      return intercept.abort("blockedbyclient");
    }
    if (receiptFlow?.armed && request.method() === "POST" && !url.search &&
        request.headers()["content-type"]?.split(";")[0] === "application/json") {
      const body = request.postDataBuffer();
      let response;
      try {
        if (body && body.length <= 32768) {
          response = combinedReceiptReply(receiptFlow, url.pathname, member,
            request.headers().authorization ?? null, JSON.parse(body.toString("utf8")));
        }
      } catch { /* The normal write block below handles malformed fixture inputs. */ }
      if (response) {
        receiptFlow.armed = false;
        if (receiptFlow.mode === "recover") {
          traffic.syntheticRecover += 1;
          await waitForDockReply(receiptFlow, "recover");
        } else traffic.syntheticSubmit += 1;
        return intercept.fulfill({ status: 200, json: response, headers: { "cache-control": "no-store" } });
      }
    }
    if (request.method() === "POST" && !member && url.pathname === agreementAccept && !url.search && traffic.accepted === 0) {
      let body;
      try { body = request.postDataJSON(); } catch {}
      if (body && Object.keys(body).length === 2 && body.kind === requestPolicy.kind && body.version === requestPolicy.version) {
        traffic.accepted += 1;
        return intercept.fulfill({ json: { ok: true, ...requestPolicy, alreadyAccepted: false } });
      }
    }
    if (/\/(recover|recovery)(?:\/|$)/.test(url.pathname) && url.pathname.startsWith("/api/")) {
      traffic.deniedRecovery += 1;
      return intercept.abort("blockedbyclient");
    }
    if (request.method() !== "GET") {
      traffic.deniedWrites += 1;
      return intercept.abort("blockedbyclient");
    }
    if (receiptFlow?.mode === "recover" && !url.search) {
      if (url.pathname === receiptOriginPath) {
        return intercept.fulfill({ contentType: "text/html", body: "<!doctype html><title>Synthetic receipt setup</title>" });
      }
      if (url.pathname === intentPath + "/config") {
        await waitForDockReply(receiptFlow, "closed-config");
        return intercept.fulfill({ status: 503, json: { enabled: false, error: "request_intent_disabled" } });
      }
    }
    if (entry.breakPackshot && url.pathname === artwork) {
      traffic.fallbackAssetAborted += 1;
      return intercept.abort("failed");
    }
    if (fixtures.has(url.pathname)) {
      const memberApi = url.pathname === "/api/research/member/me" || url.pathname === "/api/research/catalog"
        || url.pathname.startsWith("/api/research/catalog-display/v2/");
      if (memberApi && (!member || request.headers().authorization !== memberBearer)) {
        traffic.deniedLocalReads += 1;
        return intercept.abort("blockedbyclient");
      }
      if (url.pathname === "/api/research/member/me") traffic.verifiedMember += 1;
      const fixture = fixtures.get(url.pathname);
      let json = fixture;
      if (guestMobileCatalog && !member && url.pathname === guestCatalogPath) {
        try {
          json = fixture(url.searchParams);
        } catch {
          traffic.deniedLocalReads += 1;
          return intercept.abort("blockedbyclient");
        }
      }
      return intercept.fulfill({
        json: url.pathname === agreementStatus
          ? { ...json, accepted: traffic.accepted === 1 || (member && receiptFlow?.mode === "member") } : json,
        headers: { "cache-control": "no-store" },
      });
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/preview-auth")
      || url.pathname.startsWith("/auth/v1/") || ["fetch", "xhr"].includes(request.resourceType())) {
      traffic.deniedLocalReads += 1;
      return intercept.abort("blockedbyclient");
    }
    return intercept.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6500);
  return { context, page };
}

async function screenshot(entry, suffix, locator) {
  const file = entry.name + "-" + suffix + ".png";
  try {
    await locator.screenshot({ path: join(output, file), timeout: 4500, animations: "disabled" });
    entry.screenshots.push(file);
  } catch (error) {
    report(entry, suffix + " screenshot", false, briefError(error));
  }
}

async function imageEvidence(page, scope, expectedPath, headingTag) {
  const image = scope.locator(`img[data-testid="product-media-image"][src="${expectedPath}"]`);
  await image.scrollIntoViewIfNeeded();
  await image.evaluate(async (node) => {
    await Promise.race([node.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error("image timeout")), 4500))]);
  });
  await page.evaluate(async () => {
    await Promise.race([document.fonts.ready, new Promise((_, reject) => setTimeout(() => reject(new Error("font timeout")), 4500))]);
  });
  return image.evaluate((node, headingTag) => {
    const frame = node.closest("figure");
    const media = node.parentElement;
    const mediaRect = media?.getBoundingClientRect();
    const mediaStyle = media ? getComputedStyle(media) : null;
    const card = node.closest("article") ?? frame?.parentElement;
    const box = node.getBoundingClientRect();
    const bounds = card?.getBoundingClientRect();
    const rect = (value) => value && Object.fromEntries(["left", "top", "right", "bottom", "width", "height"].map((key) => [key, value[key]]));
    const padding = Object.fromEntries(["Left", "Top", "Right", "Bottom"].map((side) =>
      [side.toLowerCase(), Number.parseFloat(mediaStyle?.["padding" + side] ?? "0")]));
    const border = Object.fromEntries(["Left", "Top", "Right", "Bottom"].map((side) =>
      [side.toLowerCase(), Number.parseFloat(mediaStyle?.["border" + side + "Width"] ?? "0")]));
    const withinMediaBox = Boolean(media?.parentElement === frame && mediaRect &&
      box.left >= mediaRect.left - 1 && box.right <= mediaRect.right + 1 &&
      box.top >= mediaRect.top - 1 && box.bottom <= mediaRect.bottom + 1);
    const withinPaddedMediaBox = withinMediaBox &&
      box.left >= mediaRect.left + border.left + padding.left - 1 &&
      box.right <= mediaRect.right - border.right - padding.right + 1 &&
      box.top >= mediaRect.top + border.top + padding.top - 1 &&
      box.bottom <= mediaRect.bottom - border.bottom - padding.bottom + 1;
    const heading = headingTag ? card?.querySelector(headingTag)?.getBoundingClientRect() : null;
    const naturalRatio = node.naturalWidth / node.naturalHeight;
    const fit = getComputedStyle(node).objectFit;
    const hasRoom = Boolean(bounds && box.width > 0 && box.height > 0 && box.left >= bounds.left - 1 &&
      box.right <= bounds.right + 1 && box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1);
    return {
      path: new URL(node.currentSrc).pathname,
      alt: node.alt,
      imageLoaded: node.complete && node.naturalWidth > 0 && node.naturalHeight > 0,
      imageBox: rect(box), mediaBox: rect(mediaRect), mediaPadding: padding,
      mediaOverflow: mediaStyle?.overflow, withinMediaBox, withinPaddedMediaBox,
      naturalImage: { width: node.naturalWidth, height: node.naturalHeight },
      objectFit: fit,
      fullAspect: hasRoom && withinPaddedMediaBox && (fit === "contain" || fit === "scale-down" ||
        (fit === "fill" && Math.abs(box.width - box.height * naturalRatio) <= 1)),
      aboveHeading: heading ? box.bottom <= heading.top + 1 : null,
      width: window.innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 ||
        !bounds || bounds.left < -1 || bounds.right > window.innerWidth + 1 ||
        (card?.scrollWidth ?? 0) > (card?.clientWidth ?? 0) + 1,
      fontsLoaded: document.fonts.status === "loaded",
    };
  }, headingTag);
}

function checkImage(entry, label, image, path, aboveHeading = false, expectedAlt) {
  report(entry, label + " exact decoded source and descriptive alt",
    image.imageLoaded && image.path === path && (expectedAlt === undefined ? /\bBPC-157\b/i.test(image.alt) : image.alt === expectedAlt),
    { imageLoaded: image.imageLoaded, path: image.path, alt: image.alt, expectedAlt });
  report(entry, label + " whole aspect, viewport width, no horizontal overflow and settled fonts",
    image.fullAspect && image.width === entry.viewport.width && !image.horizontalOverflow && image.fontsLoaded);
  report(entry, label + " image lies inside the actual clipping media box and its padding",
    image.withinMediaBox && image.withinPaddedMediaBox,
    { image: image.imageBox, media: image.mediaBox, padding: image.mediaPadding });
  if (aboveHeading) report(entry, label + " image above heading", image.aboveHeading);
}
function captionsRetired(content) {
  return !/conceptual packaging|representative illustration/i.test(content);
}

async function captureGuestDetails(page, entry) {
  await page.goto(origin + guestRoute, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-testid="request-door-mixed"] article.xenios-order-card')
    .filter({ has: page.getByRole("heading", { name: "BPC-157", exact: true }) });
  await card.getByRole("button", { name: "Add BPC-157 to request", exact: true }).click();
  await card.getByRole("button", { name: "Increase requested quantity for BPC-157" }).click();
  const quantity = card.getByRole("spinbutton");
  const trigger = card.getByRole("button", { name: /^View details for BPC-157/ });
  const dialog = page.getByRole("dialog", { name: "BPC-157", exact: true });
  const url = page.url();

  await trigger.focus();
  await page.keyboard.press("Enter");
  await dialog.waitFor();
  await page.waitForFunction(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  const image = await imageEvidence(page, dialog, artwork, null);
  checkImage(entry, "guest detail", image, artwork);
  report(entry, "guest detail shows exact fixture specification and the packaging design disclosure",
    (await dialog.innerText()).includes(fixtureUnit) &&
    (await dialog.innerText()).includes("Packaging design shown. Current packaging may differ."));
  const back = dialog.getByRole("button", { name: "Back to catalog", exact: true });
  const paint = await dialog.evaluate((node) => {
    const style = getComputedStyle(node);
    const description = document.getElementById(node.getAttribute("aria-describedby") ?? "");
    const box = node.getBoundingClientRect();
    const returnButton = [...node.querySelectorAll("button")].find((button) => button.textContent.trim() === "Back to catalog");
    const target = returnButton?.getBoundingClientRect();
    const hit = target && document.elementFromPoint(target.x + target.width / 2, target.y + target.height / 2);
    return {
      background: style.backgroundColor, text: style.color,
      description: description && getComputedStyle(description).color,
      contained: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight &&
        node.scrollWidth <= node.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1,
      returnReachable: Boolean(target && target.height >= 44 && hit && returnButton.contains(hit)),
    };
  });
  report(entry, "dialog paints opaque paper and contrasting ink inside the viewport",
    paint.background === "rgb(255, 255, 255)" && paint.text === "rgb(14, 14, 14)" &&
    paint.description === "rgb(107, 107, 107)" && paint.contained && paint.returnReachable, paint);
  await page.keyboard.press("Tab");
  report(entry, "Tab keeps focus within the modal", await dialog.evaluate((node) => node.contains(document.activeElement)));
  await screenshot(entry, "viewport", page);
  await screenshot(entry, "details", dialog);

  const restored = () => page.waitForFunction(() =>
    document.activeElement?.getAttribute("aria-label")?.startsWith("View details for BPC-157"));
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await restored();
  report(entry, "Escape returns focus and preserves requested quantity",
    await trigger.evaluate((node) => node === document.activeElement) && await quantity.inputValue() === "2");
  await trigger.click();
  await back.click();
  await dialog.waitFor({ state: "hidden" });
  await restored();
  report(entry, "Back to catalog keeps focus, selection and route",
    await trigger.evaluate((node) => node === document.activeElement) &&
    await quantity.inputValue() === "2" && page.url() === url);
}

async function captureGuest(page, entry) {
  await page.goto(origin + guestRoute, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-testid="request-door-mixed"] article.xenios-order-card')
    .filter({ has: page.getByRole("heading", { name: "BPC-157", exact: true }) });
  await card.waitFor();
  const agreement = page.getByTestId("early-access-agreement");
  await page.getByTestId("early-access-agreement-checkbox").waitFor();
  const action = page.getByRole("button", { name: "Continue to contact", exact: true });
  await card.getByRole("button", { name: "Add BPC-157 to request", exact: true }).click();
  await card.getByRole("button", { name: "Increase requested quantity for BPC-157" }).click();
  report(entry, "correct fixture policy is offered and an unaccepted policy blocks continuation with selected item",
    (await agreement.getAttribute("data-state")) === "ready" &&
    (await agreement.innerText()).includes(fixtureAgreement.version) && await action.isDisabled());
  const accept = page.getByTestId("early-access-agreement-submit");
  report(entry, "policy accept disabled before explicit checkbox", await accept.isDisabled());
  await page.getByTestId("early-access-agreement-checkbox").check();
  await accept.click();
  await page.getByTestId("early-access-agreement-accepted").waitFor();

  entry.image = await imageEvidence(page, card, artwork, "h2");
  checkImage(entry, "guest card", entry.image, artwork, true);
  const content = await card.innerText();
  report(entry, "guest card shows exact fixture strength, price, research copy and no retired captions",
    ["BPC-157", fixtureUnit, "synthetic USD fixture", "$12.50", "catalog display, not a final quote",
      "Research Use Only. Nonclinical use only."].every((value) => content.includes(value)) && captionsRetired(content));
  report(entry, "guest quantity control updates exact selected units", await card.getByRole("spinbutton").inputValue() === "2");
  await card.evaluate((node) => window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - 45));
  await screenshot(entry, "viewport", page);
  await screenshot(entry, "card", card);

  const precedingButton = page.getByRole("button", { name: /^Remove selected BPC-157 / });
  await precedingButton.focus();
  await page.keyboard.press("Tab");
  const reachable = await action.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    const inViewport = bounds.width > 0 && bounds.height > 0 && bounds.left >= -1 && bounds.right <= window.innerWidth + 1
      && bounds.top >= -1 && bounds.bottom <= window.innerHeight + 1;
    const hit = inViewport && document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return { focused: document.activeElement === button, inViewport, hit: Boolean(hit && button.contains(hit)), enabled: !button.disabled };
  });
  entry.continuation = reachable;
  report(entry, "matched synthetic acceptance enables CTA reachable by keyboard and scroll",
    entry.network.accepted === 1 && Object.values(reachable).every(Boolean));
  if (!reachable.focused || !reachable.enabled) throw new Error("Continue to contact was not safely keyboard reachable");
  await page.keyboard.press("Enter");

  const review = page.getByRole("button", { name: "Review request", exact: true });
  await review.waitFor();
  report(entry, "Continue reaches local contact form", await review.isVisible());
  for (const [field, value] of Object.entries(fixtureContact)) {
    await page.locator(`input[name="${field}"]`).fill(value);
  }
  await page.getByRole("checkbox", { name: "I confirm I am at least 18 years old." }).check();
  await review.click();
  const reviewHeading = page.getByRole("heading", { name: "Review your request", exact: true });
  await reviewHeading.waitFor();
  const reviewSection = page.locator("section.xenios-order-panel").filter({ has: reviewHeading });
  const reviewText = await reviewSection.innerText();
  report(entry, "synthetic review preserves requested product and units, submission remains untouched",
    reviewText.includes("BPC-157") && reviewText.includes(fixtureUnit) && reviewText.includes("Requested quantity: 2")
    && await reviewSection.getByRole("button", { name: "Submit for review", exact: true }).isDisabled());
  await reviewHeading.scrollIntoViewIfNeeded();
  await screenshot(entry, "review", page);
}

async function frameMemberImage(entry, label, scope, path) {
  const image = scope.locator(`img[data-testid="product-media-image"][src="${path}"]`);
  const framing = await image.evaluate((node) => {
    const header = [...document.querySelectorAll("header")].find((element) => {
      const style = getComputedStyle(element);
      return (style.position === "sticky" || style.position === "fixed") && style.top === "0px";
    });
    const inset = header?.getBoundingClientRect().height ?? 0;
    const before = node.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, window.scrollY + before.top - inset - 16), behavior: "instant" });
    const box = node.getBoundingClientRect();
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
    const contained = box.top >= headerBottom && box.bottom <= window.innerHeight &&
      box.left >= 0 && box.right <= window.innerWidth;
    const unobstructed = contained && [0.1, 0.5, 0.9].every((fraction) =>
      document.elementFromPoint(box.left + box.width / 2, box.top + box.height * fraction) === node);
    return { top: box.top, bottom: box.bottom, headerBottom, unobstructed };
  });
  report(entry, label + " fully visible below the sticky header", framing.unobstructed, framing);
}

async function captureMember(page, entry) {
  await page.goto(origin + memberRoute, { waitUntil: "domcontentloaded" });
  const card = page.locator(`[data-testid="mo-card"][data-offering-id="${memberOffering}"]`);
  await card.waitFor();
  entry.image = await imageEvidence(page, card, artwork, "h3");
  checkImage(entry, "member card", entry.image, artwork, true);
  const content = await card.innerText();
  report(entry, "member card binds exact 10 mg variant and preserves fixture price and facts",
    await card.locator(`[data-variant-id="${sourceVariant}"]`).count() === 1 &&
    ["BPC-157", "10 mg", "$12.50", "Synthetic USD fixture"].every((value) => content.includes(value)) && captionsRetired(content));
  await frameMemberImage(entry, "member card", card, artwork);
  await screenshot(entry, "card", page);

  const link = card.getByTestId("mo-card-link");
  report(entry, "member card links to exact family and offering slug", await link.getAttribute("href") === memberDetailRoute);
  await link.click();
  report(entry, "member detail uses the exact listing route", new URL(page.url()).pathname === memberDetailRoute);
  const heading = page.getByRole("heading", { name: "BPC-157", exact: true });
  const media = page.locator('figure:has(img[data-testid="product-media-image"])');
  const selected = page.getByTestId("mo-selected-variant");
  const selector = page.getByTestId("mo-variant-selector");
  await selector.waitFor();
  const states = [
    { suffix: "detail-10", id: sourceVariant, strength: "10 mg", asset: artwork },
    { suffix: "detail-5", id: alternateSourceVariant, strength: "5 mg", asset: alternateArtwork },
    { suffix: "detail-back-10", id: sourceVariant, strength: "10 mg", asset: artwork },
  ];
  entry.detail = [];
  for (const [index, state] of states.entries()) {
    const radio = selector.locator(`input[value="${state.id}"]`);
    if (index !== 0) await radio.check();
    const image = await imageEvidence(page, media, state.asset, null);
    const selection = await selected.innerText();
    entry.detail.push({ ...state, image });
    checkImage(entry, state.suffix, image, state.asset);
    report(entry, state.suffix + " checked identity and visible product facts",
      await heading.isVisible() && await radio.isChecked() && selection.includes(state.strength)
      && selection.includes("$12.50") && captionsRetired(await media.innerText())
      && (state.asset === artwork || !/10 mg/.test(image.alt)));
    await frameMemberImage(entry, state.suffix, media, state.asset);
    await screenshot(entry, state.suffix, page);
  }

  if (entry.viewport.width === 320) {
    entry.breakPackshot = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    const fallback = await imageEvidence(page, media, alternateArtwork, null);
    entry.brokenImageFallback = fallback;
    report(entry, "blocked exact WebP falls back to decoded usable media without changing 10 mg selection",
      entry.network.fallbackAssetAborted > 0 && fallback.imageLoaded && fallback.path === alternateArtwork &&
      fallback.fullAspect && !fallback.horizontalOverflow &&
      (await selected.innerText()).includes("10 mg"));
  }
}

async function reviewedCatalogFixtures(candidate, member) {
  const base = await fixtureResponses(candidate, origin, member);
  const load = async (file) => JSON.parse(await readFile(join(candidate, "server/research/master-offerings/data", file), "utf8"));
  const [dataset, content, media] = await Promise.all([
    load("member-safe-master-offerings.generated.json"),
    load("reviewed-public-content.json"),
    load("reviewed-public-media.json"),
  ]);
  const rows = new Map();
  for (const record of [...content.records, ...media.records]) {
    const product = dataset.products.find((entry) => entry.id === record.offeringId);
    const variant = product?.variants.find((entry) => entry.id === record.sourceVariantId);
    if (!variant || product.variants.length !== 1) throw new Error("Reviewed fixture did not resolve one exact source variant");
    const row = rows.get(variant.id) ?? { product, variant };
    if (record.content) row.reviewedContent = record.content;
    if (record.media) row.reviewedMedia = record.media;
    rows.set(variant.id, row);
  }
  for (const id of reviewedVialCaptures.keys()) {
    const media = rows.get(id)?.reviewedMedia;
    if (!media?.packagingDesign || !media.labelPreview) throw new Error("Missing reviewed vial artwork for " + id);
  }
  const capsule = rows.get(capsuleControl);
  if (!capsule?.reviewedContent || capsule.reviewedMedia) throw new Error("Expected copy-only BPC capsule control");
  const guestKey = "/api/research/early-access/request-intents/catalog";
  const guest = base.get(guestKey);
  const items = [];
  const cards = [];
  const memberKey = "/api/research/catalog-display/v2";
  const seed = base.get(memberKey + "/catalog");
  for (const [id, row] of rows) {
    const { product, variant, reviewedContent, reviewedMedia } = row;
    const service = product.family === "shipping_and_fulfillment";
    items.push({
      ...guest.items[0], productId: "qa-product-" + product.id, variantId: "qa-order-" + id,
      productName: product.displayName, family: product.family,
      sourceSelection: { family: product.family, slug: product.slug, variantId: id },
      specification: variant.label, format: null, packBasis: null, unitPriceCents: null,
      selectableForReview: !service, intentExclusion: service ? "non_merchandise" : null,
      researchUseOnly: product.family === "research_peptides_materials",
      reviewedContent, reviewedMedia,
    });
    if (!member) continue;
    const card = seed.catalog.products[0];
    const entry = {
      ...card, id: product.id, slug: product.slug, family: product.family,
      familyLabel: product.family.replaceAll("_", " "), displayName: product.displayName,
      canonicalName: product.canonicalName, category: product.category,
      stateExplanation: "Synthetic customer presentation fixture.",
      variants: [{ ...card.variants[0], id, label: variant.label, reviewedContent, reviewedMedia }],
    };
    cards.push(entry);
    row.detailRoute = memberRoute + "/" + product.family + "/" + product.slug;
    base.set(memberKey + "/products/" + product.family + "/" + product.slug, {
      ok: true, audience: seed.audience, launchScope: seed.launchScope,
      product: { ...entry, overview: null, disclosures: ["Synthetic catalog presentation."] },
    });
  }
  base.set(guestKey, { ...guest, items, total: items.length, families: [...new Set(items.map((row) => row.family))] });
  if (member) base.set(memberKey + "/catalog", { ...seed, catalog: { ...seed.catalog, products: cards, total: cards.length } });
  return { base, rows };
}

async function captureReviewedCatalog(page, entry, rows, member) {
  const vials = [...reviewedVialCaptures.keys()].map((id) => rows.get(id));
  const checkRows = entry.viewport.width === 390 ? [...rows.values()] : vials;
  entry.offeringIds = checkRows.map(({ product }) => product.id);
  const entryUrl = origin + (member ? memberRoute : guestRoute);
  await page.goto(entryUrl, { waitUntil: "domcontentloaded" });
  for (const row of checkRows) {
    const { product, variant, reviewedContent, reviewedMedia } = row;
    const card = member
      ? page.locator('[data-testid="mo-card"][data-offering-id="' + product.id + '"]')
      : page.locator('[data-testid="request-door-mixed"] article.xenios-order-card')
        .filter({ has: page.getByRole("heading", { name: product.displayName, exact: true }) })
        .filter({ has: page.getByText(variant.label, { exact: true }) });
    await card.waitFor();
    if (reviewedContent) {
      const cardText = await card.innerText();
      const packageSize = reviewedContent.specifications?.find(({ label }) => label === "Package")?.value;
      report(entry, product.id + " card has exact summary and visible package size",
        cardText.includes(reviewedContent.summary) && (!packageSize || cardText.includes(packageSize)));
    }
    if (reviewedMedia) checkImage(entry, product.id + " card", await imageEvidence(page, card, reviewedMedia.primary.href, null),
      reviewedMedia.primary.href, false, reviewedMedia.primary.altText);
    if (variant.id === capsuleControl) report(entry, product.id + " capsule card excludes reviewed vial artwork",
      await card.locator('img[src^="/research/product-media/bpc-157-xenios-"]').count() === 0);

    let scope;
    if (member) {
      await card.getByRole("link", { name: product.displayName, exact: true }).click();
      await page.waitForURL(origin + row.detailRoute);
      await page.getByRole("heading", { level: 1, name: product.displayName, exact: true }).waitFor();
      scope = page;
    } else {
      const trigger = card.getByRole("button", { name: /^View details for / });
      await trigger.click();
      scope = page.getByRole("dialog", { name: product.displayName, exact: true });
      await scope.waitFor();
    }

    if (reviewedContent) {
      const region = scope.getByRole("region", { name: "Product information" });
      const text = await region.textContent();
      report(entry, product.id + " detail has exact overview, available storage and documentation",
        text.includes(reviewedContent.overview) && (!reviewedContent.storage || text.includes(reviewedContent.storage)) &&
        (await region.locator("a").count()) === (reviewedContent.documentation?.length ?? 0));
    }
    if (reviewedMedia) checkImage(entry, product.id + " detail", await imageEvidence(page, scope, reviewedMedia.primary.href, null),
      reviewedMedia.primary.href, false, reviewedMedia.primary.altText);
    if (reviewedMedia?.packagingDesign && reviewedMedia.labelPreview) {
      const label = scope.getByRole("link", { name: "View front label artwork" });
      report(entry, product.id + " keeps packaging design disclosure and the exact label link",
        await scope.getByText("Packaging design shown. Current packaging may differ.", { exact: true }).isVisible() &&
        await label.getAttribute("href") === reviewedMedia.labelPreview.href);
    }
    if (variant.id === capsuleControl) report(entry, product.id + " capsule detail excludes reviewed vial artwork",
      await scope.locator('img[src^="/research/product-media/bpc-157-xenios-"]').count() === 0 &&
      await scope.getByRole("link", { name: "View front label artwork" }).count() === 0);
    if (member && capsuleEvidenceVariants.has(variant.id)) {
      const notice = await scope.getByTestId("catalog-evidence-notice").textContent();
      report(entry, product.id + " does not claim product-specific documentation for compound-level research",
        notice.includes("This catalog view does not publish product-specific documents.") &&
        !notice.includes("The product documents shown above apply to the selected variant."));
    }
    if (member && variant.id === chondroVariant) {
      const notice = await scope.getByTestId("catalog-evidence-notice").textContent();
      const label = scope.getByRole("link", { name: "NutriDyn product label and Supplement Facts", exact: true });
      report(entry, product.id + " retains the selected product label and evidence notice",
        notice.includes("The product documents shown above apply to the selected variant.") &&
        await label.getAttribute("href") === "https://nutridyn.com/sports-nutrition/chondro-jointaide");
    }
    const screenshotName = reviewedVialCaptures.get(variant.id);
    if (screenshotName) await screenshot(entry, screenshotName, page);
    if (member) {
      await page.goto(entryUrl, { waitUntil: "domcontentloaded" });
    } else {
      await scope.getByRole("button", { name: "Back to catalog", exact: true }).click();
      await scope.waitFor({ state: "hidden" });
      report(entry, product.id + " returns to the same guest catalog", page.url() === entryUrl);
    }
  }
}


async function checkRequestDockFooter(page, entry) {
  const footerLinks = page.getByRole("navigation", { name: "Research public footer", exact: true }).getByRole("link");
  await footerLinks.nth(-2).focus();
  await page.keyboard.press("Tab");
  const geometry = await footerLinks.last().evaluate(async (link) => {
    const scrolling = document.scrollingElement;
    window.scrollTo({ top: scrolling.scrollHeight, behavior: "instant" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const dock = document.querySelector('[data-testid="request-action-bar"]').getBoundingClientRect();
    const bounds = link.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return {
      atDocumentEnd: Math.abs(scrollY - (scrolling.scrollHeight - innerHeight)) <= 3,
      keyboardFocused: document.activeElement === link,
      aboveDock: bounds.top >= 0 && bounds.bottom <= dock.top + 1,
      pointerReachable: link.contains(hit),
    };
  });
  report(entry, "last public footer link stays keyboard and pointer reachable at the end of the document",
    Object.values(geometry).every(Boolean), geometry);
}

async function openContactFromRequestDock(page, entry, surface) {
  const trigger = page.getByTestId("request-action-bar-summary");
  const selection = page.getByRole("dialog", { name: "Your selected request items", exact: true });
  if (combinedRequestDock) {
    await trigger.focus();
    await page.keyboard.press("Enter");
  } else await trigger.click();
  await selection.waitFor();
  if (combinedRequestDock) {
    await page.waitForFunction(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
    const openFocus = await selection.evaluate((dialog) => dialog.contains(document.activeElement));
    await page.keyboard.press("Tab");
    const forwardFocus = await selection.evaluate((dialog) => dialog.contains(document.activeElement));
    await page.keyboard.press("Shift+Tab");
    report(entry, "keyboard opens the dock summary and keeps Tab focus in its dialog",
      openFocus && forwardFocus && await selection.evaluate((dialog) => dialog.contains(document.activeElement)));
  }
  await page.keyboard.press("Escape");
  await selection.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "request-action-bar-summary");
  report(entry, "closing dock summary restores its trigger focus",
    await trigger.evaluate((button) => button === document.activeElement));
  await trigger.click();
  await selection.waitFor();
  const continueAction = selection.getByRole("button", { name: dockCopy.details, exact: true });
  report(entry, "dock summary shows the exact selection, quantity and enabled continuation",
    await selection.getByText("BPC-157", { exact: true }).isVisible() &&
    await selection.getByText("Requested quantity: 2", { exact: true }).isVisible() &&
    await continueAction.isEnabled());
  await continueAction.click();
  await selection.waitFor({ state: "hidden" });
  const contactHeading = surface.getByRole("heading", { name: "Contact details", exact: true });
  await page.waitForFunction(() => document.activeElement?.matches("h2") &&
    document.activeElement.textContent?.trim() === "Contact details");
  report(entry, "continuing from the dock dialog transfers focus to the contact heading",
    await contactHeading.evaluate((heading) => heading === document.activeElement));
}

async function checkRequestDockContact(page, entry, surface, enlarged = false) {
  const dockPrimary = page.getByTestId("request-action-bar-primary");
  const contactHeading = surface.getByRole("heading", { name: "Contact details", exact: true });
  const form = surface.locator("form").filter({
    has: page.getByRole("heading", { name: "Contact details", exact: true }),
  });
  for (const [field, value] of Object.entries(fixtureContact)) {
    if (field !== "name") await form.locator(`input[name="${field}"]`).fill(value);
  }
  await form.getByRole("checkbox", { name: "I confirm I am at least 18 years old." }).check();
  const name = form.getByRole("textbox", { name: "Full legal name", exact: true });
  const review = surface.getByRole("heading", { name: dockCopy.review, exact: true });
  const invalidBefore = await form.evaluate((node) => Array.from(node.elements)
    .filter((control) => control.willValidate && !control.validity.valid).map((control) => control.name));
  report(entry, "fixed contact action is associated with the form and name is the only invalid field",
    await dockPrimary.getAttribute("form") === await form.getAttribute("id") &&
    invalidBefore.length === 1 && invalidBefore[0] === "name" &&
    await dockPrimary.isEnabled());
  if (combinedRequestDock) {
    report(entry, "contact dock labels the next step as continuing to submission",
      (await dockPrimary.innerText()).trim() === dockCopy.contact);
    await dockPrimary.focus();
    await page.keyboard.press("Enter");
  } else await dockPrimary.click();
  report(entry, "fixed contact action invokes native required-field validation",
    await contactHeading.isVisible() && await review.count() === 0 &&
    await name.evaluate((input) => input === document.activeElement && input.validity.valueMissing));
  if (enlarged) {
    await name.scrollIntoViewIfNeeded();
    report(entry, "enlarged contact field keeps native focus above the fixed dock",
      await name.evaluate((input, width) => {
        const box = input.getBoundingClientRect();
        const dock = document.querySelector('[data-testid="request-action-bar"]').getBoundingClientRect();
        return document.activeElement === input && box.top >= 0 && box.bottom <= dock.top + 1 &&
          box.left >= -1 && box.right <= width + 1 && document.documentElement.scrollWidth <= width + 1;
      }, entry.viewport.width));
  }

  await name.fill(fixtureContact.name);
  await dockPrimary.click();
  await review.waitFor();
  const reviewPanel = surface.locator("section.xenios-order-panel").filter({
    has: page.getByRole("heading", { name: dockCopy.review, exact: true }),
  });
  const submit = reviewPanel.getByRole("button", { name: dockCopy.submit, exact: true });
  report(entry, "fixed contact action reaches review with the original quantity and no allowed submission",
    (await reviewPanel.innerText()).includes("Requested quantity: 2") &&
    await dockPrimary.isDisabled() && await submit.isDisabled());
  if (enlarged) {
    await submit.evaluate(async (button) => {
      button.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    report(entry, "enlarged final action fits above the dock and wraps its label",
      await submit.evaluate((button, width) => {
        const box = button.getBoundingClientRect();
        const dock = document.querySelector('[data-testid="request-action-bar"]').getBoundingClientRect();
        return box.top >= 0 && box.bottom <= dock.top + 1 && box.left >= -1 && box.right <= width + 1 &&
          button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1 &&
          document.documentElement.scrollWidth <= width + 1;
      }, entry.viewport.width));
  }
}

async function captureGuestMobile(page, entry, { bpc, mito }, receiptFlow) {
  const path = guestRequestDock ? "/earlyaccess" : guestRoute;
  await page.goto(origin + path, { waitUntil: "domcontentloaded" });
  const surface = page.getByTestId("request-door-mixed").locator(".xenios-order-page--guest-catalog");
  const toolbar = surface.locator(".xenios-order-catalog-toolbar");
  const search = toolbar.getByRole("textbox", { name: "Search catalog", exact: true });
  const family = toolbar.getByRole("combobox", { name: "Product family", exact: true });
  const mobilePager = surface.locator(".xenios-order-mobile-pagination").getByRole("navigation", { name: "Catalog pages", exact: true });
  const bottomPager = surface.locator(".xenios-order-bottom-pagination").getByRole("navigation", { name: "Catalog pages", exact: true });
  const pager = entry.mobile ? mobilePager : bottomPager;
  const hiddenPager = entry.mobile ? bottomPager : mobilePager;
  const previous = pager.getByRole("button", { name: "Previous", exact: true });
  const next = pager.getByRole("button", { name: "Next", exact: true });
  const summary = surface.getByRole("complementary", { name: "Selected request items", exact: true });
  const toggle = summary.getByRole("button", { name: dockCopy.summary, exact: true });
  const summaryContent = summary.locator(".xenios-order-summary-content");
  const inlineContinue = summary.getByRole("button", { name: dockCopy.details, exact: true, includeHidden: true });
  const dock = page.getByTestId("request-action-bar");
  const dockPrimary = dock.getByTestId("request-action-bar-primary");
  const card = (name) => surface.locator("article.xenios-order-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  const settledPage = async (number, total, count, marker) => {
    await pager.getByText("Page " + number + " of " + total, { exact: true }).waitFor();
    if (marker) await card(marker).waitFor();
    report(entry, "page " + number + " of " + total + " has exactly " + count + " rows",
      await surface.locator("article.xenios-order-card").count() === count);
  };
  const startInView = () => surface.locator(".xenios-order-catalog-start").evaluate(async (anchor) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const bounds = anchor.getBoundingClientRect();
    const maxScroll = document.scrollingElement.scrollHeight - innerHeight;
    return Math.abs(bounds.top) <= 3 ||
      (bounds.top >= -3 && bounds.top < innerHeight && Math.abs(scrollY - maxScroll) <= 3);
  });
  const alignCatalogStart = () => surface.locator(".xenios-order-catalog-start").evaluate(async (anchor) => {
    anchor.scrollIntoView({ block: "start", behavior: "instant" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const visibleCards = () => toolbar.evaluate((node, countAboveDock) => {
    const top = Math.max(0, node.getBoundingClientRect().bottom);
    const dock = countAboveDock ? document.querySelector('[data-testid="request-action-bar"]') : null;
    const bottom = dock ? Math.min(innerHeight, dock.getBoundingClientRect().top) : innerHeight;
    const cards = [...node.parentElement.querySelectorAll("article.xenios-order-card")].map((card) => card.getBoundingClientRect());
    const fullyVisible = cards.filter((box) => box.top >= top && box.bottom <= bottom).length;
    const intersecting = cards.filter((box) => box.bottom > top && box.top < bottom).length;
    const visibility = { fullyVisible, partlyVisible: intersecting - fullyVisible, toolbarBottom: top, viewportHeight: innerHeight };
    return countAboveDock ? { ...visibility, contentBottom: bottom } : visibility;
  }, guestRequestDock);
  const expectRetained = async (label) => report(entry, label,
    await summaryContent.getByText("BPC-157", { exact: true }).isVisible() &&
    await summaryContent.getByText("Requested quantity: 2", { exact: true }).isVisible());

  await settledPage(1, 3, 24, guestMobilePageMarkers[0]);
  report(entry, "only the expected pager is shown and Previous is disabled on the first page",
    await pager.isVisible() && !await hiddenPager.isVisible() && await previous.isDisabled() && await next.isEnabled());
  const agreement = page.getByTestId("early-access-agreement-submit");
  const acceptFixtureStanding = async () => {
    await page.getByTestId("early-access-agreement-checkbox").check();
    await agreement.click();
    await page.getByTestId("early-access-agreement-accepted").waitFor();
  };
  if (guestRequestDock) {
    await dock.waitFor();
    report(entry, "canonical Early Access route mounts the mixed form and fixed actions",
      new URL(page.url()).pathname === path &&
      await dock.evaluate((node) => getComputedStyle(node).position === "fixed"));
  } else {
    await acceptFixtureStanding();
  }
  if (entry.viewport.width === 390 || (guestRequestDock && entry.viewport.width === 320)) {
    await alignCatalogStart();
    entry.unselectedCatalogStartVisibility = await visibleCards();
    if (guestRequestDock) {
      const { fullyVisible, partlyVisible, toolbarBottom, contentBottom, viewportHeight } = entry.unselectedCatalogStartVisibility;
      report(entry, "visible card area ends above the fixed dock",
        toolbarBottom < contentBottom && contentBottom < viewportHeight, entry.unselectedCatalogStartVisibility);
      if (!combinedRequestDock && entry.viewport.width === 390) report(entry, "typical phone shows two complete cards and at least part of a third",
        fullyVisible >= 2 && fullyVisible + partlyVisible >= 3, entry.unselectedCatalogStartVisibility);
    }
    if (!combinedRequestDock && entry.viewport.width === 390) await screenshot(entry, "catalog", page);
  }
  const first = card(bpc.productName);
  const add = first.getByRole("button", { name: "Add to request: " + bpc.productName + ", " + bpc.specification, exact: true });
  const increase = first.getByRole("button", { name: "Increase requested quantity for BPC-157", exact: true });
  await add.click();
  await increase.click();
  const quantity = first.getByRole("spinbutton", { name: "Requested quantity for BPC-157", exact: true });
  report(entry, "first-page selection keeps the accessible quantity control and exact requested quantity",
    await quantity.inputValue() === "2" &&
    (!entry.mobile || await quantity.evaluate((node) => node.getBoundingClientRect().height >= 44 &&
      Number.parseFloat(getComputedStyle(node).fontSize) >= 16)));
  if (guestRequestDock) {
    let standingReadyAndUnchecked = true;
    if (combinedRequestDock) {
      // The guide requires loaded request configuration and available browser storage.
      await surface.getByTestId("early-access-how-it-works").waitFor();
      const readyPolicy = page.locator('[data-testid="early-access-agreement"][data-state="ready"]');
      await readyPolicy.getByTestId("early-access-agreement-provenance")
        .filter({ hasText: /^Policy version: v2$/ }).waitFor();
      const checkbox = readyPolicy.getByTestId("early-access-agreement-checkbox");
      standingReadyAndUnchecked = await checkbox.isEnabled() && !await checkbox.isChecked() &&
        await quantity.inputValue() === "2";
    }
    report(entry, "selected items cannot continue through either action before standing",
      standingReadyAndUnchecked && entry.network.accepted === 0 && await agreement.isDisabled() &&
      await inlineContinue.isDisabled() && await dockPrimary.isDisabled());
    await acceptFixtureStanding();
    report(entry, "both continuation actions are enabled by the one matched fixture acceptance",
      entry.network.accepted === 1 && await inlineContinue.isEnabled() && await dockPrimary.isEnabled());
    if (combinedRequestDock && entry.viewport.width === 390) {
      const enoughCards = ({ fullyVisible, partlyVisible }) => fullyVisible >= 2 && fullyVisible + partlyVisible >= 3;
      await alignCatalogStart();
      entry.selectedAfterStanding = await visibleCards();
      report(entry, "post-agreement quantity-two view shows two cards and part of a third",
        enoughCards(entry.selectedAfterStanding) && await quantity.inputValue() === "2", entry.selectedAfterStanding);
      await first.getByRole("button", { name: "Remove BPC-157", exact: true }).click();
      await alignCatalogStart();
      entry.ordinaryAfterStanding = await visibleCards();
      report(entry, "post-agreement ordinary view shows two cards and part of a third",
        enoughCards(entry.ordinaryAfterStanding) && await quantity.count() === 0, entry.ordinaryAfterStanding);
      await screenshot(entry, "catalog", page);
      await add.click();
      await increase.click();
    }
  }
  if (entry.mobile) {
    report(entry, "summary starts collapsed behind the labelled count",
      await toggle.getAttribute("aria-expanded") === "false" && !await summaryContent.isVisible());
    await toggle.click();
    report(entry, "summary toggle exposes the existing selection", await toggle.getAttribute("aria-expanded") === "true");
    await toggle.click();
    await toolbar.evaluate((node) => {
      const anchorTop = node.previousElementSibling.getBoundingClientRect().top;
      window.scrollTo({ top: scrollY + anchorTop + 420, behavior: "instant" });
    });
    const geometry = await toolbar.evaluate((node, checkDock) => {
      const box = node.getBoundingClientRect();
      const anchor = node.previousElementSibling.getBoundingClientRect();
      const controls = Array.from(node.querySelectorAll("input, select, button"));
      const dock = checkDock ? document.querySelector('[data-testid="request-action-bar"]') : null;
      const bottom = dock ? dock.getBoundingClientRect().top : innerHeight;
      return {
        sticky: getComputedStyle(node).position === "sticky" && Math.abs(box.top) <= 2 && anchor.top < -250,
        within: box.left >= -1 && box.right <= innerWidth + 1 && box.bottom < bottom &&
          document.documentElement.scrollWidth <= innerWidth + 1,
        controls: controls.length === 4 && controls.every((control) => {
          const rect = control.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return rect.height >= 44 && control.contains(hit) &&
            (!control.matches("input, select") || Number.parseFloat(getComputedStyle(control).fontSize) >= 16);
        }),
      };
    }, guestRequestDock);
    report(entry, "sticky toolbar remains reachable after scrolling through full rows", Object.values(geometry).every(Boolean), geometry);
    await alignCatalogStart();
    if (entry.viewport.width === 390) entry.catalogStartVisibility = await visibleCards();
  } else {
    report(entry, "desktop retains static catalog controls and an expanded request summary",
      await toolbar.evaluate((node) => getComputedStyle(node).position === "static") && await summaryContent.isVisible());
    await toolbar.scrollIntoViewIfNeeded();
  }
  if (entry.viewport.width !== 390) await screenshot(entry, "catalog", page);
  const inspectDetails = async (item, pageNumber, captureImage) => {
    const product = card(item.productName).filter({ has: page.getByText(item.specification, { exact: true }) });
    const trigger = product.getByRole("button", { name: "View details for " + item.productName + ", " + item.specification, exact: true });
    const route = page.url();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: item.productName, exact: true });
    await dialog.waitFor();
    const media = item.reviewedMedia;
    const image = await imageEvidence(page, dialog, media.primary.href, null);
    checkImage(entry, item.productName + " details", image, media.primary.href, false, media.primary.altText);
    const label = dialog.getByRole("link", { name: "View front label artwork", exact: true });
    const copy = await dialog.innerText();
    report(entry, item.productName + " detail retains the exact specification and approved detail fields",
      await dialog.getByText(item.specification, { exact: true }).isVisible() &&
      (media.labelPreview ? await label.getAttribute("href") === media.labelPreview.href &&
        copy.includes("Packaging design shown. Current packaging may differ.") :
        await label.count() === 0 && copy.includes(item.reviewedContent.overview) &&
        item.reviewedContent.specifications.some(({ label, value }) => label === "Package" && copy.includes(value))));
    const back = dialog.getByRole("button", { name: "Back to catalog", exact: true });
    await back.scrollIntoViewIfNeeded();
    report(entry, item.productName + " dialog is within the viewport and its return action sits above the toolbar",
      await back.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const box = button.closest('[role="dialog"]').getBoundingClientRect();
        return box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1 &&
          rect.height >= 44 && button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      }));
    if (captureImage) await screenshot(entry, typeof captureImage === "string" ? captureImage : "details", page);
    await back.click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("View details for "));
    const detailLabel = captureImage === "enlarged-details" ? "enlarged " + item.productName : item.productName;
    report(entry, detailLabel + " detail close restores trigger focus and preserves the catalog URL and page",
      await trigger.evaluate((node) => node === document.activeElement) && page.url() === route &&
      await pager.getByText("Page " + pageNumber + " of 3", { exact: true }).isVisible());
  };
  await inspectDetails(bpc, 1, false);
  report(entry, "BPC detail retains the original selected quantity", await first.getByRole("spinbutton").inputValue() === "2");

  await next.click();
  await settledPage(2, 3, 24, guestMobilePageMarkers[1]);
  if (entry.mobile) {
    report(entry, "next page returns to the catalog controls after rows load", await startInView());
    await toggle.click();
  }
  await expectRetained("page 2 retains the exact first-page selection");

  const detail = card(mito.productName).filter({ has: page.getByText(mito.specification, { exact: true }) });
  report(entry, "Mito Recharge card includes the reviewed short summary",
    (await detail.innerText()).includes(mito.reviewedContent.summary));
  if (entry.mobile) {
    const layout = await detail.evaluate((node) => {
      // The caption spans the card in the compact subgrid; measure the image frame.
      const media = node.querySelector(".xenios-order-card-media > figure > div").getBoundingClientRect();
      const identity = node.querySelector(".xenios-order-card-identity").getBoundingClientRect();
      const description = getComputedStyle(node.querySelector(".xenios-order-card-description"));
      return {
        compactMedia: Math.abs(media.width - 88) <= 1 && media.right <= identity.left && Math.abs(media.top - identity.top) <= 1,
        shortSummary: description.webkitLineClamp === "2",
        noHorizontalOverflow: node.scrollWidth <= node.clientWidth + 1,
      };
    });
    report(entry, "mobile card uses compact artwork beside readable identity and clamps only the short summary",
      Object.values(layout).every(Boolean), layout);
  }
  await inspectDetails(mito, 2, true);
  await expectRetained("return from details retains selection");

  await next.click();
  await settledPage(3, 3, 1, guestMobilePageMarkers[2]);
  report(entry, "last page only allows Previous", await next.isDisabled() && await previous.isEnabled());
  await previous.click();
  await settledPage(2, 3, 24, guestMobilePageMarkers[1]);

  await search.fill("No matching synthetic catalog entry");
  await settledPage(1, 1, 0);
  report(entry, "search resets to page one and keeps DOM focus through an empty result",
    await search.evaluate((node) => node === document.activeElement) &&
    await surface.getByText("0 visible catalog entries. 1 selected.", { exact: true }).isVisible() &&
    await previous.isDisabled() && await next.isDisabled());
  await expectRetained("empty search retains selection");
  await search.fill("");
  await settledPage(1, 3, 24, guestMobilePageMarkers[0]);
  await family.selectOption(guestMobileOtherFamily);
  await settledPage(1, 1, 2, guestMobilePageMarkers[2]);
  report(entry, "family filtering resets paging and retains the selected family",
    await family.inputValue() === guestMobileOtherFamily && await previous.isDisabled() && await next.isDisabled());
  await expectRetained("family filter retains selection");

  let savedRootSize;
  if (combinedRequestDock && entry.viewport.width === 390) {
    await family.selectOption("");
    const longName = "Synthetic mobile catalog row 8";
    await search.fill(longName);
    const longHeading = card(longName).getByRole("heading", { name: longName, exact: true });
    await longHeading.waitFor();
    savedRootSize = await longHeading.evaluate((heading) => {
      const root = document.documentElement;
      const prior = { value: root.style.getPropertyValue("font-size"), priority: root.style.getPropertyPriority("font-size"),
        heading: Number.parseFloat(getComputedStyle(heading).fontSize) };
      root.style.setProperty("font-size", Number.parseFloat(getComputedStyle(root).fontSize) * 2 + "px", "important");
      return prior;
    });
    await alignCatalogStart();
    const geometry = await longHeading.evaluate((heading, expected) => {
      const style = getComputedStyle(heading);
      const box = heading.getBoundingClientRect();
      const product = heading.closest("article");
      const dock = document.querySelector('[data-testid="request-action-bar"]');
      const primary = dock.querySelector('[data-testid="request-action-bar-primary"]');
      return {
        textDoubled: Number.parseFloat(style.fontSize) >= expected.heading * 1.99,
        longNameWraps: box.height > Number.parseFloat(style.lineHeight) * 1.5 &&
          product.scrollWidth <= product.clientWidth + 1,
        noHorizontalOverflow: document.documentElement.scrollWidth <= expected.width + 1,
        dockActionWraps: primary.scrollWidth <= primary.clientWidth + 1 &&
          primary.scrollHeight <= primary.clientHeight + 1 && dock.getBoundingClientRect().bottom <= innerHeight + 1,
      };
    }, { heading: savedRootSize.heading, width: entry.viewport.width });
    report(entry, "doubled text wraps long product and dock labels without horizontal overflow",
      Object.values(geometry).every(Boolean), geometry);
    await screenshot(entry, "enlarged-catalog", page);
    await search.fill("");
    await card(bpc.productName).waitFor();
    await inspectDetails(bpc, 1, "enlarged-details");
    report(entry, "doubled text detail returns without clearing selection", await quantity.inputValue() === "2");
  }

  if (guestRequestDock) {
    await checkRequestDockFooter(page, entry);
    await openContactFromRequestDock(page, entry, surface);
  } else {
    await summary.getByRole("button", { name: "Continue to contact", exact: true }).click();
    await surface.getByRole("button", { name: "Review request", exact: true }).waitFor();
  }
  report(entry, "catalog-only controls are absent after continuing to contact",
    await toolbar.count() === 0 && await summary.count() === 0 && entry.network.accepted === 1 &&
    entry.network.deniedLocalReads === 0);
  if (entry.mobile) report(entry, "mobile contact input stays within the page gutters",
    await surface.locator('input[name="name"]').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left >= 12 && rect.right <= innerWidth - 12 &&
        document.documentElement.scrollWidth <= innerWidth + 1;
    }));
  if (guestRequestDock) await checkRequestDockContact(page, entry, surface, Boolean(savedRootSize));
  if (savedRootSize) await page.evaluate(({ value, priority }) => {
    if (value) document.documentElement.style.setProperty("font-size", value, priority);
    else document.documentElement.style.removeProperty("font-size");
  }, savedRootSize);
  if (receiptFlow?.mode === "submit") await checkFreshDockReceipt(page, entry, surface, receiptFlow);
}

async function checkFreshDockReceipt(page, entry, surface, flow) {
  const acknowledgments = surface.locator("fieldset.xenios-order-acknowledgments input[type=checkbox]");
  await acknowledgments.first().waitFor();
  const boxes = await acknowledgments.all();
  const primary = page.getByTestId("request-action-bar-primary");
  const heading = page.getByRole("heading", { name: "Request submitted", exact: true });
  let fresh = boxes.length > 1 && await primary.isDisabled();
  for (const box of boxes) {
    if (await box.isChecked()) fresh = false;
    await box.check();
  }
  report(entry, "fresh acknowledgments enable the explicit submit control without sending",
    fresh && entry.network.syntheticSubmit === 0 && await primary.isEnabled() &&
      (await primary.innerText()).trim() === dockCopy.submit);
  flow.armed = true;
  await primary.focus();
  await page.keyboard.press("Enter");
  await heading.waitFor();
  await page.waitForFunction(() => document.activeElement?.matches("h2") &&
    document.activeElement.textContent?.trim() === "Request submitted");
  const panel = heading.locator("..");
  const fixture = syntheticDockReceipt("submit");
  const nextSteps = panel.getByTestId("request-next-steps");
  report(entry, "fresh receipt focuses its heading and shows reference and prospective next steps without a dock",
    await heading.evaluate((node) => node === document.activeElement) &&
      await panel.getByText(fixture.publicReference, { exact: true }).isVisible() &&
      await nextSteps.getByRole("heading", { name: "What happens next", exact: true }).isVisible() &&
      await nextSteps.getByRole("listitem").count() === 4 &&
      await page.getByTestId("request-action-bar").count() === 0 &&
      entry.network.syntheticSubmit === 1 && entry.network.syntheticRecover === 0);
  const copy = panel.getByRole("button", { name: "Copy reference", exact: true });
  await page.keyboard.press("Tab");
  report(entry, "Tab from a fresh receipt heading reaches Copy reference first",
    await copy.evaluate((node) => node === document.activeElement));
  if (entry.viewport.width === 390) await screenshot(entry, "fresh-receipt", page);
}

async function checkMemberDockEntry(page, entry) {
  await page.goto(origin + "/earlyaccess", { waitUntil: "domcontentloaded" });
  const surface = page.getByTestId("request-door-mixed").locator(".xenios-order-page");
  await page.getByTestId("early-access-agreement-accepted").waitFor();
  await surface.getByRole("button", { name: "Add BPC-157 to request", exact: true }).click();
  await surface.getByRole("button", { name: "Increase requested quantity for BPC-157", exact: true }).click();
  report(entry, "verified member mounts the fixed dock on the canonical Early Access request entry",
    new URL(page.url()).pathname === "/earlyaccess" && entry.network.verifiedMember > 0 &&
      await page.getByTestId("request-action-bar").evaluate((dock) => getComputedStyle(dock).position === "fixed") &&
      await page.getByTestId("request-action-bar-primary").isEnabled());
  await openContactFromRequestDock(page, entry, surface);
  await checkRequestDockContact(page, entry, surface);
  await screenshot(entry, "review", page);
}

async function checkEarlierDockReceipt(page, entry, flow) {
  await page.goto(origin + receiptOriginPath, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
    key: attemptStorageKey, value: { key: recoveryFixtureKey, acceptedAt: "2026-11-06T00:00:00.000Z", state: "uncertain" },
  });
  await page.goto(origin + "/earlyaccess", { waitUntil: "domcontentloaded" });
  const navigation = page.getByRole("link", { name: "Back to gateway", exact: true });
  const recover = page.getByRole("button", { name: "Check saved request", exact: true });
  const earlier = page.getByRole("heading", { name: "Your submitted request", exact: true });
  const fixture = syntheticDockReceipt("recover");
  const focusBeforeReply = async (phase, act) => {
    const held = holdDockReply(flow, phase);
    try {
      await act();
      await held.wait();
      await navigation.focus();
    } finally { held.release(); }
    await earlier.waitFor();
    await earlier.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
  };
  await recover.focus();
  flow.armed = true;
  await focusBeforeReply("recover", () => page.keyboard.press("Enter"));
  const panel = earlier.locator("..");
  const retainedFocus = () => navigation.evaluate((link) => link === document.activeElement);
  report(entry, "explicit recovery preserves chosen navigation focus and shows the earlier receipt without a dock",
    await retainedFocus() && await panel.getByText(fixture.publicReference, { exact: true }).isVisible() &&
      await panel.getByText("We found the saved request from your earlier attempt. Nothing was sent again.", { exact: true }).isVisible() &&
      await panel.getByTestId("request-next-steps").count() === 0 &&
      await page.getByTestId("request-action-bar").count() === 0 &&
      entry.network.syntheticRecover === 1 && entry.network.syntheticSubmit === 0);
  await screenshot(entry, "recovered-receipt", page);
  await focusBeforeReply("closed-config", () => page.reload({ waitUntil: "domcontentloaded" }));
  report(entry, "same-owner reload preserves chosen navigation focus and reopens the receipt without another call",
    await retainedFocus() && await panel.getByText(fixture.publicReference, { exact: true }).isVisible() &&
      await panel.getByText("This reference was confirmed earlier in this browser tab. Nothing was sent again.", { exact: true }).isVisible() &&
      await panel.getByTestId("request-next-steps").count() === 0 &&
      await page.getByTestId("request-action-bar").count() === 0 &&
      await page.evaluate((key) => sessionStorage.getItem(key), attemptStorageKey) === null &&
      entry.network.syntheticRecover === 1 && entry.network.syntheticSubmit === 0 && entry.network.verifiedMember > 0);
}

async function capture(browser, fixtures, kind, size, rows, validate) {
  const { mobile, ...viewport } = size;
  const entry = { name: kind + "-" + viewport.width, viewport, mobile, assertions: [], screenshots: [] };
  result.captures.push(entry);
  const member = kind === "member" || kind === "member-reviewed-catalog" || kind === "member-request" || kind === "member-receipt";
  const receiptFlow = kind === "member-receipt" ? { mode: "recover" }
    : kind === "member-request" ? { mode: "member" }
    : combinedRequestDock && kind === "guest-mobile" && [390, 1280].includes(viewport.width) ? { mode: "submit", validate }
    : null;
  const { context, page } = await captureContext(browser, fixtures, viewport, mobile, member, entry, receiptFlow);
  try {
    if (kind === "guest-mobile") await captureGuestMobile(page, entry, rows, receiptFlow);
    else if (kind === "member-request") await checkMemberDockEntry(page, entry);
    else if (kind === "member-receipt") await checkEarlierDockReceipt(page, entry, receiptFlow);
    else if (rows) await captureReviewedCatalog(page, entry, rows, member);
    else if (kind === "member") await captureMember(page, entry);
    else if (kind === "guest-details") await captureGuestDetails(page, entry);
    else await captureGuest(page, entry);
  } catch (error) {
    report(entry, "mount and exercise " + kind + " route", false, briefError(error));
    if (!combinedRequestDock && kind !== "guest-mobile") await screenshot(entry, "failure", page);
  } finally {
    report(entry, "no unmocked writes or recovery attempted",
      entry.network.deniedWrites === 0 && entry.network.deniedRecovery === 0);
    if (member) report(entry, "member route verified only through synthetic local member GET", entry.network.verifiedMember > 0);
    await context.close();
  }
}


async function captureSvgCard(browser, fixtures, member) {
  const viewport = { width: 320, height: 800 };
  const entry = {
    name: (member ? "member" : "guest") + "-svg-320", viewport, mobile: true,
    kind: "svg-card", sourceVariant: alternateSourceVariant,
    ...(member ? { memberOffering: alternateMemberOffering } : { orderVariant: alternateOrderVariant }),
    assertions: [], screenshots: [],
  };
  result.captures.push(entry);
  const { context, page } = await captureContext(browser, fixtures, viewport, true, member, entry);
  try {
    await page.goto(origin + (member ? memberRoute : guestRoute), { waitUntil: "domcontentloaded" });
    const card = member
      ? page.locator(`[data-testid="mo-card"][data-offering-id="${alternateMemberOffering}"]`)
      : page.locator('[data-testid="request-door-mixed"] article.xenios-order-card')
        .filter({ has: page.getByRole("heading", { name: "BPC-157", exact: true }) });
    await card.waitFor();
    entry.image = await imageEvidence(page, card, alternateArtwork, member ? "h3" : "h2");
    checkImage(entry, "320px SVG card", entry.image, alternateArtwork, true);
    const text = await card.innerText();
    report(entry, "5 mg SVG is mounted with 12px inset in its clipping frame",
      text.includes("BPC-157") && text.includes("5 mg") &&
      !/10 mg/.test(entry.image.alt) && entry.image.mediaOverflow === "hidden" &&
      Object.values(entry.image.mediaPadding).every((value) => Math.abs(value - 12) < 0.1));
    if (member) report(entry, "member SVG card binds the exact 5 mg variant",
      await card.locator(`[data-variant-id="${alternateSourceVariant}"]`).count() === 1);
    await frameMemberImage(entry, "320px SVG card", card, alternateArtwork);
    await screenshot(entry, "card", page);
  } catch (error) {
    report(entry, "mount and measure 320px SVG card", false, briefError(error));
    await screenshot(entry, "failure", page);
  } finally {
    report(entry, "no unmocked writes or recovery attempted",
      entry.network.deniedWrites === 0 && entry.network.deniedRecovery === 0);
    if (member) report(entry, "member route verified only through synthetic local member GET", entry.network.verifiedMember > 0);
    await context.close();
  }
}

let preview;
let browser;
let previewLog = "";
let setupStage = "loopback-namespace";
try {
  const interfaces = JSON.parse(execFileSync("ip", ["-json", "link", "show"], { encoding: "utf8" }));
  result.network.loopbackOnly = interfaces.length === 1 && interfaces[0].ifname === "lo" && interfaces[0].flags.includes("UP");
  if (!result.network.loopbackOnly) throw new Error("Capture requires a loopback-only network namespace");
  setupStage = "candidate-fixtures";
  const guestFixtures = await fixtureResponses(candidate, origin, false);
  const memberFixtures = guestMobileCatalog && !combinedRequestDock ? null : await fixtureResponses(candidate, origin, true);
  let validate;
  if (combinedRequestDock) {
    const source = (path) => import(pathToFileURL(join(candidate, path)).href);
    const [{ policies, publishedEarlyAccessAgreement }, { policyBodyDigest }, intent] = await Promise.all([
      source("server/research/policies-data.ts"), source("scripts/evidence/lib/policy-fixture-v2.mjs"),
      source("shared/research/assisted-order/request-intent.ts"),
    ]);
    const agreement = publishedEarlyAccessAgreement();
    if (agreement?.kind !== requestPolicy.kind || agreement.version !== requestPolicy.version ||
        policyBodyDigest(policies["early-access-product-policy"]) !== combinedPolicyDigest) {
      throw new Error("The mounted dock fixture requires the exact reviewed v2 policy");
    }
    validate = intent.validateRequestIntentInput;
    for (const fixtures of [guestFixtures, memberFixtures]) {
      fixtures.set("/api/research/policies", { policies });
      fixtures.set(agreementStatus, { ...fixtures.get(agreementStatus), required: [requestPolicy] });
      const configPath = intentPath + "/config";
      fixtures.set(configPath, { ...fixtures.get(configPath), requiredAgreements: [requestPolicy] });
    }
    result.fixture.policy.bodySha256 = combinedPolicyDigest;
  }
  const fixtureRows = [...guestFixtures.values()].find((value) => Array.isArray(value.items))?.items;
  if (fixtureRows?.length !== 1 || fixtureRows[0].sourceSelection?.variantId !== sourceVariant ||
    fixtureRows[0].variantId !== orderVariant || sourceVariant === orderVariant) {
    throw new Error("Guest fixture must preserve separate exact media and order identities");
  }
  result.fixture.identitiesDistinct = true;
  let guestSvgFixtures, memberSvgFixtures, mobileFixtures;
  if (guestMobileCatalog) {
    const seed = guestFixtures.get(guestCatalogPath);
    mobileFixtures = await guestMobileCatalogFixtures(candidate, seed);
    guestFixtures.set(guestCatalogPath, (params) => guestMobileCatalogResponse(seed, mobileFixtures, params));
    result.assets = mobileFixtures.assets;
  } else if (!reviewedCatalog && !guestDetailsOnly) {
    guestSvgFixtures = await svgCardFixtureResponses(candidate, origin, false);
    memberSvgFixtures = await svgCardFixtureResponses(candidate, origin, true);
    const svgRows = [...guestSvgFixtures.values()].find((value) => Array.isArray(value.items))?.items;
    if (svgRows?.length !== 1 || svgRows[0].sourceSelection?.variantId !== alternateSourceVariant ||
        svgRows[0].variantId !== alternateOrderVariant || alternateSourceVariant === alternateOrderVariant) {
      throw new Error("SVG guest fixture must preserve distinct exact media and order identities");
    }
  }
  if (reviewedCatalog) {
    const manifest = JSON.parse(await readFile(join(candidate, "server/research/master-offerings/data/reviewed-public-media.json"), "utf8"));
    result.assets = {};
    for (const record of manifest.records) {
      result.assets[record.sourceVariantId] = { file: record.media.primary.href, sha256: record.primarySha256 };
      if (record.media.labelPreview) result.assets[record.sourceVariantId + "-label"] = {
        file: record.media.labelPreview.href, sha256: record.labelPreviewSha256,
      };
    }
  }
  setupStage = "candidate-assets";
  for (const asset of Object.values(result.assets)) {
    const servedAsset = join(candidate, "dist", "public", asset.file.slice(1));
    await access(servedAsset);
    const sha256 = createHash("sha256").update(await readFile(servedAsset)).digest("hex");
    if (asset.sha256 && asset.sha256 !== sha256) throw new Error("Candidate build does not contain the pinned WebP");
    asset.sha256 = sha256;
  }
  result.tooling = { node: process.version, npm: "10.8.2",
    playwright: JSON.parse(await readFile(new URL("./node_modules/playwright/package.json", import.meta.url), "utf8")).version };
  setupStage = "loopback-preview";
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
  setupStage = "chromium";
  browser = await chromium.launch({ headless: true, timeout: 12000 });
  result.browser = { name: "Chromium", version: browser.version() };
  if (guestMobileCatalog) {
    for (const size of viewports) await capture(browser, guestFixtures, "guest-mobile", size, mobileFixtures, validate);
    if (combinedRequestDock) {
      const mobile = viewports.find((size) => size.width === 390);
      await capture(browser, memberFixtures, "member-request", mobile);
      await capture(browser, memberFixtures, "member-receipt", mobile);
    }
  } else if (reviewedCatalog) {
    const guest = await reviewedCatalogFixtures(candidate, false);
    const member = await reviewedCatalogFixtures(candidate, true);
    for (const size of viewports) {
      await capture(browser, guest.base, "guest-reviewed-catalog", size, guest.rows);
      await capture(browser, member.base, "member-reviewed-catalog", size, member.rows);
    }
  } else if (guestDetailsOnly) {
    for (const size of viewports) await capture(browser, guestFixtures, "guest-details", size);
  } else {
    for (const size of viewports) {
      await capture(browser, guestFixtures, "guest", size);
      await capture(browser, memberFixtures, "member", size);
    }
    await captureSvgCard(browser, guestSvgFixtures, false);
    await captureSvgCard(browser, memberSvgFixtures, true);
  }
} catch (error) {
  result.captureError = combinedRequestDock ? "Combined dock setup failed at " + setupStage : briefError(error);
  if (combinedRequestDock) console.error(result.captureError);
  else console.error(result.captureError, previewLog);
} finally {
  try {
    await browser?.close();
  } finally {
    preview?.kill();
    const expectedContexts = combinedRequestDock ? viewports.length + 2
      : reviewedCatalog ? viewports.length * 2
      : guestDetailsOnly || guestMobileCatalog ? viewports.length : viewports.length * 2 + 2;
    const combinedScreenshots = new Map([["guest-mobile-390", 5], ["member-request-390", 1], ["member-receipt-390", 1]]);
    result.status = !result.captureError && result.captures.length === expectedContexts &&
      result.captures.every((entry) => {
        const count = combinedRequestDock ? (combinedScreenshots.get(entry.name) ?? 2)
          : guestDetailsOnly || reviewedCatalog || guestMobileCatalog ? 2
          : entry.kind === "svg-card" ? 1 : entry.name.startsWith("guest-") ? 3 : 4;
        return entry.screenshots.length === count && entry.assertions.every((item) => item.pass);
      }) ? "passed" : "failed";
    await writeFile(join(output, "result.json"), JSON.stringify(result, null, 2) + "\n");
    if (result.status !== "passed") process.exitCode = 1;
  }
}
