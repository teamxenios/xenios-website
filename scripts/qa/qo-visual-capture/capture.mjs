import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import {
  agreementAccept, agreementStatus, alternateArtwork, alternateMemberOffering, alternateOrderVariant, alternateSourceVariant, artwork, fixtureAgreement, fixtureContact,
  fixtureCurrency, fixturePrice, fixtureResponses, svgCardFixtureResponses, fixtureUnit, guestRoute, memberBearer,
  memberDetailRoute, memberOffering, memberRoute, memberSession, orderVariant, sourceVariant,
} from "./fixture.mjs";

const [candidate, output, candidateSha, candidateTree, harnessRevision, runId, runAttempt, allowanceFile, profile = "legacy"] = process.argv.slice(2);
if (!["legacy", "guest-catalog-details", "reviewed-catalog"].includes(profile)) throw new Error("Unknown capture profile");
const guestDetailsOnly = profile === "guest-catalog-details";
const reviewedCatalog = profile === "reviewed-catalog";
const allowance = JSON.parse(await readFile(allowanceFile, "utf8"));
if (allowance.currentRunId !== runId || allowance.attempt !== allowance.distinctRunIds.length ||
    allowance.maximumAttempts !== 2 || allowance.remainingAfterThisRun !== 2 - allowance.attempt) {
  throw new Error("Capture allowance does not match this dispatch");
}
const origin = "http://127.0.0.1:5199";
const artworkHash = "202bee1aceaf841438001afa93b8e56a9643866e16c563ef8ad9a2d412853df1";
const viewports = [
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
    "No submission, recovery, staff readback, production release or operator activation is covered.",
  ],
  candidateSha, candidateTree, harnessRevision, runId, runAttempt: Number(runAttempt), allowance, profile,
  artifacts: `https://github.com/teamxenios/xenios-website/actions/runs/${runId}#artifacts`,
  upstreamHarness: "scripts/evidence/build-candidate-preview.mjs + scripts/preview-research.mjs",
  fixture: {
    sourceVariant, alternateSourceVariant, orderVariant, alternateOrderVariant, memberOffering, alternateMemberOffering, fixturePrice, fixtureCurrency, fixtureUnit,
    policy: { slug: "research-use", agreement: fixtureAgreement, acceptance: "one exact in-memory intercept per guest context" },
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

async function captureContext(browser, fixtures, viewport, mobile, member, entry) {
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
    if (request.method() === "POST" && !member && url.pathname === agreementAccept && !url.search && traffic.accepted === 0) {
      let body;
      try { body = request.postDataJSON(); } catch {}
      if (body && Object.keys(body).length === 2 && body.kind === fixtureAgreement.kind && body.version === fixtureAgreement.version) {
        traffic.accepted += 1;
        return intercept.fulfill({ json: { ok: true, ...fixtureAgreement, alreadyAccepted: false } });
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
      const json = fixtures.get(url.pathname);
      return intercept.fulfill({
        json: url.pathname === agreementStatus ? { ...json, accepted: traffic.accepted === 1 } : json,
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
  const bpc = rows.get(sourceVariant);
  const alternate = dataset.products.find((entry) => entry.id === alternateMemberOffering);
  const alternateVariant = alternate?.variants.find((entry) => entry.id === alternateSourceVariant);
  if (!bpc?.reviewedMedia || !alternateVariant) throw new Error("Expected distinct BPC fixture variants");
  rows.set(alternateVariant.id, { product: alternate, variant: alternateVariant, alternate: true });
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
  const bpc = rows.get(sourceVariant);
  const supplement = [...rows.values()].filter((row) => row.reviewedMedia && row.reviewedContent)
    .sort((a, b) => b.reviewedContent.overview.length - a.reviewedContent.overview.length)[0];
  if (!supplement) throw new Error("No matched official image and description to paint");
  const checkRows = entry.viewport.width === 390 ? [...rows.values()] : [bpc, supplement];
  entry.offeringIds = checkRows.map(({ product }) => product.id);
  const entryUrl = origin + (member ? memberRoute : guestRoute);
  await page.goto(entryUrl, { waitUntil: "domcontentloaded" });
  for (const row of checkRows) {
    const { product, variant, reviewedContent, reviewedMedia } = row;
    const card = member
      ? page.locator('[data-testid="mo-card"][data-offering-id="' + product.id + '"]')
      : page.locator('[data-testid="request-door-mixed"] article.xenios-order-card')
        .filter({ has: page.getByRole("heading", { name: product.displayName, exact: true }) })
        .filter({ hasText: variant.label });
    await card.waitFor();
    if (reviewedContent) {
      const cardText = await card.innerText();
      const packageSize = reviewedContent.specifications?.find(({ label }) => label === "Package")?.value;
      report(entry, product.id + " card has exact summary and visible package size",
        cardText.includes(reviewedContent.summary) && (!packageSize || cardText.includes(packageSize)));
    }
    if (reviewedMedia) checkImage(entry, product.id + " card", await imageEvidence(page, card, reviewedMedia.primary.href, null),
      reviewedMedia.primary.href, false, reviewedMedia.primary.altText);
    if (row.alternate) report(entry, product.id + " alternate uses only generic vial art",
      await card.locator('img[src="/research/product-media/vial.svg"]').count() === 1);

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
    if (row === bpc) {
      const label = scope.getByRole("link", { name: "View front label artwork" });
      report(entry, "BPC keeps explicit packaging design disclosure and the approved label link",
        await scope.getByText("Packaging design shown. Current packaging may differ.", { exact: true }).isVisible() &&
        await label.getAttribute("href") === reviewedMedia.labelPreview.href);
    }
    if (row === bpc || row === supplement) await screenshot(entry, row === bpc ? "bpc" : "supplement", page);
    if (member) {
      await page.goto(entryUrl, { waitUntil: "domcontentloaded" });
    } else {
      await scope.getByRole("button", { name: "Back to catalog", exact: true }).click();
      await scope.waitFor({ state: "hidden" });
      report(entry, product.id + " returns to the same guest catalog", page.url() === entryUrl);
    }
  }
}

async function capture(browser, fixtures, kind, size, rows) {
  const { mobile, ...viewport } = size;
  const entry = { name: kind + "-" + viewport.width, viewport, mobile, assertions: [], screenshots: [] };
  result.captures.push(entry);
  const member = kind === "member" || kind === "member-reviewed-catalog";
  const { context, page } = await captureContext(browser, fixtures, viewport, mobile, member, entry);
  try {
    if (rows) await captureReviewedCatalog(page, entry, rows, member);
    else if (kind === "member") await captureMember(page, entry);
    else if (kind === "guest-details") await captureGuestDetails(page, entry);
    else await captureGuest(page, entry);
  } catch (error) {
    report(entry, "mount and exercise " + kind + " route", false, briefError(error));
    await screenshot(entry, "failure", page);
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
try {
  const interfaces = JSON.parse(execFileSync("ip", ["-json", "link", "show"], { encoding: "utf8" }));
  result.network.loopbackOnly = interfaces.length === 1 && interfaces[0].ifname === "lo" && interfaces[0].flags.includes("UP");
  if (!result.network.loopbackOnly) throw new Error("Capture requires a loopback-only network namespace");
  const guestFixtures = await fixtureResponses(candidate, origin, false);
  const memberFixtures = await fixtureResponses(candidate, origin, true);
  const fixtureRows = [...guestFixtures.values()].find((value) => Array.isArray(value.items))?.items;
  if (fixtureRows?.length !== 1 || fixtureRows[0].sourceSelection?.variantId !== sourceVariant ||
    fixtureRows[0].variantId !== orderVariant || sourceVariant === orderVariant) {
    throw new Error("Guest fixture must preserve separate exact media and order identities");
  }
  result.fixture.identitiesDistinct = true;
  const guestSvgFixtures = await svgCardFixtureResponses(candidate, origin, false);
  const memberSvgFixtures = await svgCardFixtureResponses(candidate, origin, true);
  const svgRows = [...guestSvgFixtures.values()].find((value) => Array.isArray(value.items))?.items;
  if (svgRows?.length !== 1 || svgRows[0].sourceSelection?.variantId !== alternateSourceVariant ||
      svgRows[0].variantId !== alternateOrderVariant || alternateSourceVariant === alternateOrderVariant) {
    throw new Error("SVG guest fixture must preserve distinct exact media and order identities");
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
  for (const asset of Object.values(result.assets)) {
    const servedAsset = join(candidate, "dist", "public", asset.file.slice(1));
    await access(servedAsset);
    const sha256 = createHash("sha256").update(await readFile(servedAsset)).digest("hex");
    if (asset.sha256 && asset.sha256 !== sha256) throw new Error("Candidate build does not contain the pinned WebP");
    asset.sha256 = sha256;
  }
  result.tooling = { node: process.version, npm: "10.8.2",
    playwright: JSON.parse(await readFile(new URL("./node_modules/playwright/package.json", import.meta.url), "utf8")).version };
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
  if (reviewedCatalog) {
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
  result.captureError = briefError(error);
  console.error(result.captureError, previewLog);
} finally {
  try {
    await browser?.close();
  } finally {
    preview?.kill();
    const expectedContexts = reviewedCatalog ? viewports.length * 2 : guestDetailsOnly ? viewports.length : viewports.length * 2 + 2;
    result.status = !result.captureError && result.captures.length === expectedContexts &&
      result.captures.every((entry) => entry.screenshots.length === (guestDetailsOnly || reviewedCatalog ? 2 : entry.kind === "svg-card" ? 1 : entry.name.startsWith("guest-") ? 3 : 4)
        && entry.assertions.every((item) => item.pass)) ? "passed" : "failed";
    await writeFile(join(output, "result.json"), JSON.stringify(result, null, 2) + "\n");
    if (result.status !== "passed") process.exitCode = 1;
  }
}
