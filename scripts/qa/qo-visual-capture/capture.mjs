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
if (!["legacy", "guest-catalog-details", "reviewed-catalog", "c1-catalog", "pr393-catalog"].includes(profile)) throw new Error("Unknown capture profile");
const guestDetailsOnly = profile === "guest-catalog-details";
const pr393Catalog = profile === "pr393-catalog";
const c1Catalog = profile === "c1-catalog" || pr393Catalog;
const reviewedCatalog = profile === "reviewed-catalog";
const c1ManifestSha = "d134d7000e8cddb1d89b5346bc8275e6eb6a7d60736897f734bcf0494147eb1c";
const c1DatasetSha = "76b9bf6ffe908450d31e15900ee9aa1a5467068fd3dfecb2d28624a49c97c4d5";
const c1Negative = { offering: "mo_ffeecca340b02f400868", variant: "mov_a4b4118c4d23b1546c8b" };
const c1Disclosure = "Packaging design shown. Current packaging may differ.";

function c1RequestAccessHref(productName) {
  return "/research/member/product-requests/new?" + new URLSearchParams({ source: "products", product: productName.trim() });
}
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
const maximumAttempts = c1Catalog ? 1 : 2;
if (allowance.currentRunId !== runId || allowance.attempt !== allowance.distinctRunIds.length ||
    allowance.maximumAttempts !== maximumAttempts || allowance.remainingAfterThisRun !== maximumAttempts - allowance.attempt) {
  throw new Error("Capture allowance does not match this dispatch");
}
const origin = "http://127.0.0.1:5199";
const artworkHash = "202bee1aceaf841438001afa93b8e56a9643866e16c563ef8ad9a2d412853df1";
const viewports = pr393Catalog ? [{ width: 390, height: 844, mobile: true }] : [
  { width: 320, height: 800, mobile: true },
  { width: guestDetailsOnly || reviewedCatalog || c1Catalog ? 390 : 375, height: 844, mobile: true },
  { width: 768, height: 1024, mobile: false },
  { width: 1280, height: 900, mobile: false },
];
const result = {
  scope: "NON-PRODUCTION SYNTHETIC BROWSER EVIDENCE",
  limits: [
    "Fixture prices are synthetic. No approved price, live identity, product authorization or persistence is tested.",
    c1Catalog ? "This exact-pair fixture mounts application routes with intercepted catalog projections and synthetic member identity. The guest has a fixture-recorded agreement; Add and Remove change only local selection." :
      "The source catalog has separate 10 mg and 5 mg listings. Detail intentionally groups their exact media IDs only in the fixture.",
    "Layout checks establish decoded media and geometry. Inspect screenshots for label, cap and base readability.",
    ...(pr393Catalog ? ["Checks preserve existing copy and capsule documentation notices. No production identity or ordering is tested."] : []),
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
    if (!c1Catalog && request.method() === "POST" && !member && url.pathname === agreementAccept && !url.search && traffic.accepted === 0) {
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
        json: url.pathname === agreementStatus ? { ...json, accepted: (c1Catalog && !member) || traffic.accepted === 1 } : json,
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
  const selectedRecords = c1Catalog ? [
    ...media.records.slice(10), { offeringId: c1Negative.offering, sourceVariantId: c1Negative.variant },
  ] : [...content.records, ...media.records];
  for (const record of selectedRecords) {
    const product = dataset.products.find((entry) => entry.id === record.offeringId);
    const variant = product?.variants.find((entry) => entry.id === record.sourceVariantId);
    if (!variant || product.variants.length !== 1) throw new Error("Reviewed fixture did not resolve one exact source variant");
    const row = rows.get(variant.id) ?? { product, variant };
    if (c1Catalog && (rows.has(variant.id) || product.family !== "research_peptides_materials" ||
        product.displayState !== "request_access" || variant.displayState !== "request_access")) {
      throw new Error("Unexpected C1 source pair or access state");
    }
    if (record.content) row.reviewedContent = record.content;
    if (record.media) {
      row.reviewedMedia = record.media;
      if (c1Catalog) {
        row.primarySha256 = record.primarySha256;
        row.labelSha256 = record.labelPreviewSha256;
      }
    }
    rows.set(variant.id, row);
  }
  if (c1Catalog) {
    if (media.records.length !== 29 || rows.size !== 20 ||
        media.records.some(({ sourceVariantId }) => sourceVariantId === c1Negative.variant) ||
        [...rows.values()].filter((row) => row.reviewedMedia?.packagingDesign && row.reviewedMedia.labelPreview).length !== 19) {
      throw new Error("C1 requires 19 exact reviewed designs and a separate unillustrated KPV 5 mg control");
    }
  } else {
    for (const id of reviewedVialCaptures.keys()) {
      const media = rows.get(id)?.reviewedMedia;
      if (!media?.packagingDesign || !media.labelPreview) throw new Error("Missing reviewed vial artwork for " + id);
    }
    const capsule = rows.get(capsuleControl);
    if (!capsule?.reviewedContent || capsule.reviewedMedia) throw new Error("Expected copy-only BPC capsule control");
  }
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
      ...(c1Catalog ? { sourceDisplayState: product.displayState, sourceVariantDisplayState: variant.displayState, priceVersion: null } : {}),
      reviewedContent, reviewedMedia,
    });
    if (!member) continue;
    const card = seed.catalog.products[0];
    const entry = {
      ...card, id: product.id, slug: product.slug, family: product.family,
      familyLabel: product.family.replaceAll("_", " "), displayName: product.displayName,
      canonicalName: product.canonicalName, category: product.category,
      stateExplanation: "Synthetic customer presentation fixture.",
      ...(c1Catalog ? { displayState: product.displayState, priceSummary: {
        state: "none", variantCount: 1, pricedVariantCount: 0, currency: null,
        fromCents: null, toCents: null, display: "Price on request",
      } } : {}),
      variants: [{ ...card.variants[0], id, label: variant.label,
        ...(c1Catalog ? {
          displayState: variant.displayState, price: { state: "on_request" },
          action: { kind: "request_access", label: "Request Access", href: c1RequestAccessHref(product.displayName) },
        } : {}),
        reviewedContent, reviewedMedia }],
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


function c1WebpResponse(response) {
  const mime = (response.headers()["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  const status = response.status();
  if (status !== 200 || mime !== "image/webp") return Promise.resolve({ status, mime, sha256: null });
  return response.body().then(
    (body) => ({ status, mime, sha256: createHash("sha256").update(body).digest("hex") }),
    () => ({ status, mime, sha256: null }),
  );
}

function c1ExactWebp(proof, asset, digest) {
  return proof?.status === 200 && proof.mime === "image/webp" && proof.sha256 === digest &&
    proof.naturalWidth === asset.width && proof.naturalHeight === asset.height;
}

async function followC1Label(page, label, asset) {
  const { href } = asset;
  const url = origin + href;
  if (await label.getAttribute("href") !== href || await label.getAttribute("target") !== "_blank") return null;
  let popup;
  try {
    const responsePromise = page.context().waitForEvent("response", {
      predicate: (response) => response.url() === url && response.request().isNavigationRequest(),
      timeout: 6500,
    });
    const popupPromise = page.waitForEvent("popup", { timeout: 6500 }).then((opened) => {
      popup = opened;
      return opened;
    });
    const [response] = await Promise.all([responsePromise, popupPromise, label.click()]);
    await popup.waitForURL(url, { waitUntil: "domcontentloaded", timeout: 6500 });
    const [served, rendered] = await Promise.all([
      c1WebpResponse(response),
      popup.locator("img").evaluate(async (node) => {
        await node.decode();
        return { currentSrc: node.currentSrc, naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight };
      }),
    ]);
    if (rendered.currentSrc !== url) return null;
    return { ...served, naturalWidth: rendered.naturalWidth, naturalHeight: rendered.naturalHeight };
  } finally {
    await popup?.close();
  }
}

async function exerciseC1GuestSelection(page, card, productName, variantLabel) {
  const summary = page.getByRole("complementary", { name: "Selected request items", exact: true });
  const next = summary.getByRole("button", { name: "Continue to contact", exact: true });
  const add = card.getByRole("button", { name: "Add " + productName + " to request", exact: true });
  const empty = summary.getByText("No products selected yet. Add an eligible item from the catalog.", { exact: true });
  const initialEmpty = await empty.isVisible() && await next.isDisabled();
  await add.click();
  const row = summary.getByRole("listitem");
  const remove = row.getByRole("button", { name: "Remove selected " + productName + " " + variantLabel, exact: true });
  await remove.waitFor();
  const selectedProduct = await row.locator("strong").textContent();
  const selectedVariant = await row.locator("span").first().textContent();
  const selectedQuantity = await row.getByText("Requested quantity: 1", { exact: true }).isVisible();
  const singleSelection = await summary.getByRole("status").textContent() === "1 products | 1 exact variants | 1 requested units";
  const continueEnabled = await next.isEnabled();
  await remove.click();
  await empty.waitFor();
  const reset = await row.count() === 0 && await next.isDisabled() && await add.isEnabled();
  return { initialEmpty, selectedProduct, selectedVariant, selectedQuantity, singleSelection, continueEnabled, reset };
}

async function c1ActionHref(link) {
  await link.waitFor();
  return link.getAttribute("href");
}


async function loadPr393Fixture() {
  const bytes = await readFile(join(output, "pr393-fixture.json"));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fixture = JSON.parse(bytes);
  if (sha256 !== "2422a3fc89049d8686470b5e1f330c98771b3dd56150ccc76498cb37c7f7f651" || fixture.tree !== candidateTree || fixture.guestRoute !== guestRoute ||
      fixture.identities.length !== 9 || Object.keys(fixture.responses).length !== 11) {
    throw new Error("PR393 fixture does not match the exact candidate tree");
  }
  result.fixture = { sha256, policy: { agreement: fixtureAgreement, acceptance: "synthetic GET only" } };
  return fixture;
}

async function pr393Fixtures(fixture, member) {
  const base = await fixtureResponses(candidate, origin, member);
  const guestApi = "/api/research/early-access/request-intents/catalog";
  const memberApi = "/api/research/catalog-display/v2/catalog";
  const guest = fixture.responses[guestApi];
  if (member) base.set(memberApi, fixture.responses[memberApi]);
  else base.set(guestApi, guest);
  const rows = new Map();
  for (const identity of fixture.identities) {
    const detail = fixture.responses[identity.memberDetailApi];
    const product = detail.product;
    const variant = product.variants.find((entry) => entry.id === identity.sourceVariantId);
    const item = guest.items.find((entry) => entry.sourceSelection?.variantId === identity.sourceVariantId);
    if (!variant || product.id !== identity.offeringId || !item ||
        item.sourceSelection.family !== product.family || item.sourceSelection.slug !== product.slug ||
        item.productName !== product.displayName || item.specification !== variant.label || rows.has(variant.id)) {
      throw new Error("Projected PR393 identity does not match the exact fixture");
    }
    if (member) base.set(identity.memberDetailApi, detail);
    rows.set(variant.id, { product, variant, identity, reviewedMedia: variant.reviewedMedia,
      reviewedContent: variant.reviewedContent, detailRoute: identity.memberRoute,
      primarySha256: identity.assetHashes?.primary, labelSha256: identity.assetHashes?.labelPreview });
  }
  return { base, rows };
}

async function readPr393ProductInformation(scope, copy) {
  const region = scope.getByRole("region", { name: "Product information", exact: true });
  if (!copy) {
    const regionPresent = await region.count() !== 0;
    return { regionPresent, exactRegion: !regionPresent, documentHrefs: [] };
  }
  await region.waitFor();
  const actual = await region.evaluate((node) => ({
    brand: node.querySelector(":scope > p")?.textContent ?? null,
    sections: [...node.querySelectorAll(":scope > div")].map((section) => {
      const title = section.querySelector(":scope > h2, :scope > h3")?.textContent ?? null;
      if (title === "Specifications") return { title, rows: [...section.querySelectorAll("dl > div")].map((row) => ({
        label: row.querySelector("dt")?.textContent ?? null, value: row.querySelector("dd")?.textContent ?? null,
      })) };
      if (title === "Documentation") return { title, rows: [...section.querySelectorAll("ul > li > a")].map((link) => ({
        label: link.textContent, href: link.getAttribute("href"),
      })) };
      return { title, text: section.querySelector(":scope > p")?.textContent ?? null };
    }),
  }));
  const sections = [{ title: "Overview", text: copy.overview }];
  if (copy.specifications?.length) sections.push({ title: "Specifications",
    rows: copy.specifications.map(({ label, value }) => ({ label, value })) });
  for (const [title, text] of [["Purpose", copy.purpose], ["Ingredients", copy.ingredients], ["Label information", copy.label],
    ["Cautions", copy.cautions], ["Storage", copy.storage]]) {
    if (text) sections.push({ title, text });
  }
  if (copy.documentation?.length) sections.push({ title: "Documentation",
    rows: copy.documentation.map(({ label, href }) => ({ label, href })) });
  return { regionPresent: true, exactRegion: JSON.stringify(actual) === JSON.stringify({ brand: copy.brand || null, sections }),
    documentHrefs: actual.sections.find((section) => section.title === "Documentation")?.rows.map((row) => row.href) ?? [] };
}


async function captureC1Catalog(page, entry, rows, member) {
  const entryUrl = origin + (member ? memberRoute : guestRoute);
  const admittedPrimaries = new Set([...rows.values()].filter((row) => row.reviewedMedia)
    .map((row) => origin + row.reviewedMedia.primary.href));
  const primaryResponses = new Map();
  // Image nodes can share one browser response. Bind its bytes per context,
  // and measure the natural dimensions separately on every card/detail node.
  page.on("response", (response) => {
    const url = response.url();
    if (admittedPrimaries.has(url) && response.request().method() === "GET" && response.request().resourceType() === "image") {
      primaryResponses.set(url, c1WebpResponse(response));
    }
  });
  const primaryProof = async (image) => ({
    ...await primaryResponses.get(origin + image.path),
    naturalWidth: image.naturalImage.width,
    naturalHeight: image.naturalImage.height,
  });
  await page.goto(entryUrl, { waitUntil: "domcontentloaded" });
  if (!member) await page.locator('[data-testid="early-access-agreement"][data-state="accepted"]').waitFor();
  entry.pairs = [];
  const genericSvg = /^\/research\/product-media\/(?:vial|capsule|tablet|topical|liquid|unknown)\.svg$/;
  const genericOnly = async (scope) => {
    const src = await scope.getByTestId("product-media-image").getAttribute("src");
    return genericSvg.test(src ?? "") &&
      await scope.getByRole("link", { name: "View front label artwork", exact: true }).count() === 0 &&
      await scope.getByText(c1Disclosure, { exact: true }).count() === 0;
  };
  for (const { product, variant, identity, reviewedMedia, reviewedContent, primarySha256, labelSha256, detailRoute } of rows.values()) {
    const pair = { offeringId: product.id, variantId: variant.id, entryRoute: new URL(entryUrl).pathname,
      detailRoute: member ? detailRoute : guestRoute, requestAccess: false, wrongStrength: !reviewedMedia };
    if (identity) Object.assign(pair, { sku: identity.sku, art: identity.art });
    entry.pairs.push(pair);
    const card = member
      ? page.locator('[data-testid="mo-card"][data-offering-id="' + product.id + '"]')
      : page.locator('[data-testid="request-door-mixed"] article.xenios-order-card')
        .filter({ has: page.getByRole("heading", { name: product.displayName, exact: true }) })
        .filter({ has: page.getByText(variant.label, { exact: true }) });
    await card.waitFor();
    const exactVariant = card.locator('[data-testid="mo-variant-row"][data-variant-id="' + variant.id + '"]');
    pair.requestAccess = member ?
      (await exactVariant.getByTestId("mo-variant-label").textContent()) === variant.label &&
        await exactVariant.getByText(identity ? variant.displayLabel : "Request access", { exact: true }).first().isVisible() &&
        await exactVariant.getByTestId("mo-card-buy-now").count() === 0 :
      await card.getByText(variant.label, { exact: true }).isVisible() &&
        await card.getByRole("button", { name: "Add " + product.displayName + " to request", exact: true }).isEnabled();
    report(entry, variant.id + " preserves exact request-access presentation", pair.requestAccess);
    if (member) {
      pair.cardRequestHref = await c1ActionHref(exactVariant.getByRole("link", {
        name: "Request Access, " + product.displayName + ", " + variant.label, exact: true,
      }));
      report(entry, variant.id + " card Request Access uses the exact product destination",
        pair.cardRequestHref === c1RequestAccessHref(product.displayName));
    } else {
      pair.guestSelection = await exerciseC1GuestSelection(page, card, product.displayName, variant.label);
      const proof = pair.guestSelection;
      report(entry, variant.id + " locally selects the exact variant, enables Continue and resets on removal",
        proof.initialEmpty && proof.selectedProduct === product.displayName && proof.selectedVariant === variant.label &&
        proof.selectedQuantity && proof.singleSelection && proof.continueEnabled && proof.reset);
    }
    if (identity && !member) {
      const summary = reviewedContent && card.locator(":scope > p").filter({ hasText: reviewedContent.summary });
      pair.copySummary = !summary || await summary.count() === 1 &&
        await summary.textContent() === ((reviewedContent.brand ? reviewedContent.brand + " · " : "") + reviewedContent.summary);
      report(entry, variant.id + " guest card preserves the exact approved summary", pair.copySummary);
      if (capsuleEvidenceVariants.has(variant.id)) {
        pair.capsuleNotice = await card.getByText("Research Use Only. Nonclinical use only.", { exact: true }).isVisible();
        report(entry, variant.id + " guest capsule retains research-use notice", pair.capsuleNotice);
      }
    }
    if (reviewedMedia) {
      const cardImage = await imageEvidence(page, card, reviewedMedia.primary.href, null);
      checkImage(entry, variant.id + " card", cardImage, reviewedMedia.primary.href, false, reviewedMedia.primary.altText);
      pair.cardSource = cardImage.path;
      pair.cardPrimary = await primaryProof(cardImage);
      report(entry, variant.id + " card uses the actual served WebP and exact natural dimensions",
        c1ExactWebp(pair.cardPrimary, reviewedMedia.primary, primarySha256));
      pair.cardDisclosure = await card.getByText(c1Disclosure, { exact: true }).isVisible();
      report(entry, variant.id + " card retains design disclosure without a label link",
        pair.cardDisclosure && await card.getByRole("link", { name: "View front label artwork", exact: true }).count() === 0);
    } else {
      pair.cardGeneric = await genericOnly(card);
      report(entry, variant.id + " card never borrows reviewed artwork from another variant", pair.cardGeneric);
    }

    let scope;
    if (member) {
      await card.getByTestId("mo-card-link").click();
      await page.waitForURL(origin + detailRoute);
      await page.getByRole("heading", { level: 1, name: product.displayName, exact: true }).waitFor();
      scope = page;
      pair.detailIdentity = await page.getByTestId("mo-variant-selector")
        .locator('input[value="' + variant.id + '"]').isChecked();
    } else {
      await card.getByRole("button", { name: "View details for " + product.displayName + ", " + variant.label, exact: true }).click();
      scope = page.getByRole("dialog", { name: product.displayName, exact: true });
      await scope.waitFor();
      pair.detailIdentity = await scope.getByText(variant.label, { exact: true }).isVisible();
    }
    report(entry, variant.id + " detail preserves the exact selected identity", pair.detailIdentity);
    if (member) {
      pair.detailRequestHref = await c1ActionHref(scope.getByTestId("mo-cta").and(scope.getByRole("link", {
        name: "Request Access, " + product.displayName + ", " + variant.label, exact: true,
      })));
      report(entry, variant.id + " detail Request Access uses the exact product destination",
        pair.detailRequestHref === c1RequestAccessHref(product.displayName));
    }

    if (identity) {
      pair.copyRegion = await readPr393ProductInformation(scope, reviewedContent);
      report(entry, variant.id + " detail has exact approved copy or its deliberate omission",
        pair.copyRegion.regionPresent === identity.reviewedCopy && pair.copyRegion.exactRegion);
      if (member && capsuleEvidenceVariants.has(variant.id)) {
        const notice = await scope.getByTestId("catalog-evidence-notice").textContent();
        pair.capsuleNotice = notice.includes("This catalog view does not publish product-specific documents.") &&
          !notice.includes("The product documents shown above apply to the selected variant.");
        report(entry, variant.id + " capsule does not claim product-specific documents", pair.capsuleNotice);
      }
    }
    if (reviewedMedia) {
      const detailImage = await imageEvidence(page, scope, reviewedMedia.primary.href, null);
      checkImage(entry, variant.id + " detail", detailImage, reviewedMedia.primary.href, false, reviewedMedia.primary.altText);
      pair.detailSource = detailImage.path;
      pair.detailPrimary = await primaryProof(detailImage);
      report(entry, variant.id + " detail uses the actual served WebP and exact natural dimensions",
        c1ExactWebp(pair.detailPrimary, reviewedMedia.primary, primarySha256));
      pair.detailDisclosure = await scope.getByText(c1Disclosure, { exact: true }).isVisible();
      pair.labelPath = reviewedMedia.labelPreview.href;
      pair.label = await followC1Label(page,
        scope.getByRole("link", { name: "View front label artwork", exact: true }), reviewedMedia.labelPreview);
      report(entry, variant.id + " detail keeps disclosure and opens the exact app-served label at its natural dimensions",
        pair.detailDisclosure && c1ExactWebp(pair.label, reviewedMedia.labelPreview, labelSha256));
      if (entry.representativeVariant === undefined) {
        entry.representativeVariant = variant.id;
        if (member) await frameMemberImage(entry, "representative member detail", scope, reviewedMedia.primary.href);
        await screenshot(entry, "detail", page);
      }
    } else {
      pair.detailGeneric = await genericOnly(scope);
      report(entry, variant.id + " detail has no wrong-strength artwork, disclosure or label", pair.detailGeneric);
    }
    if (member) {
      await page.goto(entryUrl, { waitUntil: "domcontentloaded" });
    } else {
      await scope.getByRole("button", { name: "Back to catalog", exact: true }).click();
      await scope.waitFor({ state: "hidden" });
      const backToCatalog = page.url() === entryUrl;
      if (identity) pair.backToCatalog = backToCatalog;
      report(entry, variant.id + " returns to the same guest catalog", backToCatalog);
    }
  }
}

async function capture(browser, fixtures, kind, size, rows) {
  const { mobile, ...viewport } = size;
  const entry = { name: kind + "-" + viewport.width, viewport, mobile, assertions: [], screenshots: [] };
  result.captures.push(entry);
  const member = kind === "member" || kind === "member-reviewed-catalog" || kind === "member-c1-catalog";
  const { context, page } = await captureContext(browser, fixtures, viewport, mobile, member, entry);
  try {
    if (c1Catalog) await captureC1Catalog(page, entry, rows, member);
    else if (rows) await captureReviewedCatalog(page, entry, rows, member);
    else if (kind === "member") await captureMember(page, entry);
    else if (kind === "guest-details") await captureGuestDetails(page, entry);
    else await captureGuest(page, entry);
  } catch (error) {
    report(entry, "mount and exercise " + kind + " route", false, briefError(error));
    if (!c1Catalog) await screenshot(entry, "failure", page);
  } finally {
    report(entry, "no unmocked writes or recovery attempted",
      entry.network.deniedWrites === 0 && entry.network.deniedRecovery === 0);
    if (c1Catalog) report(entry, "C1 stays read-only without an agreement POST", entry.network.accepted === 0);
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
  const pr393 = pr393Catalog ? await loadPr393Fixture() : null;
  const guestFixtures = await fixtureResponses(candidate, origin, false);
  const memberFixtures = await fixtureResponses(candidate, origin, true);
  const fixtureRows = [...guestFixtures.values()].find((value) => Array.isArray(value.items))?.items;
  if (fixtureRows?.length !== 1 || fixtureRows[0].sourceSelection?.variantId !== sourceVariant ||
    fixtureRows[0].variantId !== orderVariant || sourceVariant === orderVariant) {
    throw new Error("Guest fixture must preserve separate exact media and order identities");
  }
  result.fixture.identitiesDistinct = true;
  let guestSvgFixtures, memberSvgFixtures;
  if (!c1Catalog) {
    guestSvgFixtures = await svgCardFixtureResponses(candidate, origin, false);
    memberSvgFixtures = await svgCardFixtureResponses(candidate, origin, true);
    const svgRows = [...guestSvgFixtures.values()].find((value) => Array.isArray(value.items))?.items;
    if (svgRows?.length !== 1 || svgRows[0].sourceSelection?.variantId !== alternateSourceVariant ||
        svgRows[0].variantId !== alternateOrderVariant || alternateSourceVariant === alternateOrderVariant) {
      throw new Error("SVG guest fixture must preserve distinct exact media and order identities");
    }
  }
  if (reviewedCatalog || c1Catalog) {
    const manifestBytes = await readFile(join(candidate, "server/research/master-offerings/data/reviewed-public-media.json"));
    const manifest = JSON.parse(manifestBytes);
    if (c1Catalog) {
      const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
      const dataset = await readFile(join(candidate, "server/research/master-offerings/data/member-safe-master-offerings.generated.json"));
      result.inputHashes = { manifest: hash(manifestBytes), dataset: hash(dataset) };
      if (pr393) {
        const copy = await readFile(join(candidate, "server/research/master-offerings/data/reviewed-public-content.json"));
        result.inputHashes.copy = hash(copy);
        if (result.inputHashes.manifest !== pr393.mediaSha256 || result.inputHashes.dataset !== pr393.datasetSha256 ||
            result.inputHashes.copy !== pr393.copySha256 || manifest.records.length !== 35) {
          throw new Error("PR393 manifest, dataset or copy bytes differ");
        }
      } else if (result.inputHashes.manifest !== c1ManifestSha || result.inputHashes.dataset !== c1DatasetSha ||
          manifest.records.length !== 29) throw new Error("C1 inputs do not match exact source");
    }
    result.assets = {};
    const records = pr393 ? manifest.records.filter((record) => pr393.identities.some((identity) =>
      identity.sourceVariantId === record.sourceVariantId && identity.offeringId === record.offeringId)) :
      c1Catalog ? manifest.records.slice(10) : manifest.records;
    if (pr393 && records.length !== 7) throw new Error("PR393 fixture must have exactly seven authored/retained media pairs");
    for (const record of records) {
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
  if (reviewedCatalog || c1Catalog) {
    const guest = pr393 ? await pr393Fixtures(pr393, false) : await reviewedCatalogFixtures(candidate, false);
    const member = pr393 ? await pr393Fixtures(pr393, true) : await reviewedCatalogFixtures(candidate, true);
    for (const size of viewports) {
      await capture(browser, guest.base, c1Catalog ? "guest-c1-catalog" : "guest-reviewed-catalog", size, guest.rows);
      await capture(browser, member.base, c1Catalog ? "member-c1-catalog" : "member-reviewed-catalog", size, member.rows);
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
    const expectedContexts = reviewedCatalog || c1Catalog ? viewports.length * 2 : guestDetailsOnly ? viewports.length : viewports.length * 2 + 2;
    result.status = !result.captureError && result.captures.length === expectedContexts &&
      result.captures.every((entry) => entry.screenshots.length === (c1Catalog ? 1 : guestDetailsOnly || reviewedCatalog ? 2 : entry.kind === "svg-card" ? 1 : entry.name.startsWith("guest-") ? 3 : 4)
        && entry.assertions.every((item) => item.pass)) ? "passed" : "failed";
    await writeFile(join(output, "result.json"), JSON.stringify(result, null, 2) + "\n");
    if (result.status !== "passed") process.exitCode = 1;
  }
}
