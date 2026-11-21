import { PARTNER_SDK_PROBE_SOURCE, isPartnerSdkCapabilityProbe, verifyPartnerSdkProbeBytes } from './owned-runner-browser-qa.mjs';
import { PARTNER_COMPONENT_SCENARIO, PARTNER_COMPONENT_SCOPE, PARTNER_COMPONENT_CASES, PARTNER_COMPONENT_CONFIGURATIONS,
  PARTNER_COMPONENT_PNG_CAP, PARTNER_COMPONENT_BOOTSTRAP, partnerGalleryRoute, partnerGallerySelection,
  partnerRoutesForConfiguration, partnerCaptureMatrix, ownedArtifactRelativeRoot, installPartnerStorageObservation, partnerStorageCensus,
  installPartnerPrelude, partnerPreludeSource, partnerSafeNetworkTarget, validatePartnerSnapshot, PARTNER_EPOCH_MS,
  PARTNER_READ_PATHS, partnerExpectedResponse, assertPartnerReadCensus, partnerUiReady, partnerUiAssertions,
  collectPartnerView, collectPartnerQrScope, partnerNativeTarget, PARTNER_NATIVE_TARGETS, partnerQrProof, partnerFocusAccepted } from "./owned-runner-browser-qa.mjs";
import { DISPLAY_SCENARIO, DISPLAY_SOURCE, DISPLAY_SOURCE_PINS, DISPLAY_ROW_STUBS, DISPLAY_CONFIGURATIONS,
  DISPLAY_GET_PATHS, DISPLAY_CATALOG_PATH, DISPLAY_UNMATCHED_SEARCH, DISPLAY_MEDIA_PINS, DISPLAY_PNG_CAP,
  displayCatalogQuery, displayCatalogPage, sourceDerivedDisplayRows, displayCatalogAssertions,
  nativeDisplayTarget, DISPLAY_DETAILS_TARGET, displayDetailsProof, DISPLAY_DIALOG_PRESENT,
  DISPLAY_DIALOG_FOCUS, DISPLAY_DIALOG_CLOSED_AND_RETURNED, displayCapturePlan,
  DISPLAY_NO_ATTEMPT_SOURCE, assertNoDisplayAttempt, collectDisplayCatalogGeometry, collectDisplayDialogScope, collectDisplaySummaryContrast,
  DISPLAY_DIALOG_BASELINE_SOURCE, DISPLAY_DIALOG_FOCUS_PROBE_SOURCE } from "./owned-runner-browser-qa.mjs";
import { createSyntheticDisplayData } from "./owned-runner-preview.ts";
import { policies as displayPolicies, EARLY_ACCESS_PRODUCT_POLICY_SLUG as displayPolicySlug,
  EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT as displayPolicyPair } from "../../server/research/policies-data.ts";
import { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS as displayAcknowledgments, assistedOrderFormPair as displayFormPair } from "../../shared/research/assisted-order/form.ts";
import { HCG_STRENGTH_REVIEW as displayHcg } from "../../shared/research/master-offerings/hcg-strength-review.ts";
import { parseAssistedOrderConfig as parseDisplayConfig } from "../../client/src/research/assisted-order/wizard-state.ts";
import { dirname as displayDirname } from "node:path";
// Run only on the owned Actions allocation:
// node --import tsx --test scripts/evidence/owned-runner-browser-qa.node-test.mjs
// This filename deliberately avoids the application's Vitest discovery.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyRequest, validateSourceBinding, validateIsolation, validateFontCalibration,
  assertInventorySafe, safeNetworkUrl, validateProfileReceipts, CONFIGURATIONS, ownedStartupBudget,
  READ_ONLY_GET_FIXTURES, WHOLESALE_ROUTE, rawDocumentMetadata, runPageCheck, pageCheckFailureCode,
  failureObservationBudget, pageFailureMetrics, inflightFailureSnapshot, dispatchActivationKey,
  hasInfinityDevelopmentBadge, visitConfigurationPage, configurationBoundaryOptions, ROUTES,
  observeOwnedCdpEvents, tabWithFreshFocusBaseline, keyboardProof, settlePostInteractionNetwork,
  assertNetworkBoundaryComplete, homeInstallDismissalProof, HOME_DISMISS_STATE_SOURCE,
  homeContinuationDiagnostic, roundedControlHitPoints, scenarioDefinition, PUBLIC_SCENARIO,
  PREMIUM_ENTRY_SCENARIO, PREMIUM_ENTRY_ROUTE, PREMIUM_ENTRY_EXPECTED, PREMIUM_ENTRY_GET_FIXTURES,
  PREMIUM_ENTRY_CONFIGURATIONS, PREMIUM_ARTWORK, PREMIUM_CONTACT_HREFS, observedMethodAllowed,
  assertScenarioFixtureCensus, premiumEntryAssertions, premiumTabSuccessor, premiumEntryKeyboardProof,
  PREMIUM_PRIMARY_FOCUSED_SOURCE, PREMIUM_ENTRY_VIEW_SOURCE } from "./owned-runner-browser-qa.mjs";
import { startOwnedPreview, UNAVAILABLE_FIXTURE } from "./owned-runner-preview.ts";
import { launchChromium, chromeLaunchDiagnosticCodes, chromeStartupExcerpt, waitForDevToolsPort } from "./lib/chrome.mjs";
import { FOCUS_BASELINE_SOURCE, FOCUS_PROBE_SOURCE } from "./lib/page-audit.js";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assets = new Map([["assets/app.js", {}], ["index.html", {}], ["offline.html", {}], ["PREVIEW-SOURCE.json", {}]]);

// These controls exercise the actual native-input orchestration and refusal paths,
// not browser geometry, real installation prompts or visual acceptance.
function homeDismissControl(options = {}) {
  const events = [], nativeEvents = [], baselineCollections = [];
  let present = options.present !== false, active = "body", afterActivation = false;
  const actualOrder = options.actualOrder ?? ["prior", "wordmark", "cta"];
  const identity = (key) => options.canonicalIdentities
    ? `focusable-${{ prior: 4, wordmark: 10, cta: 11, dismiss: 12 }[key]}@html:nth-of-type(1)>body:nth-of-type(1)>a:nth-of-type(1)`
    : `${key}-identity`;
  const visible = { present: true, rendered: true, inViewport: true, fullyInViewport: true,
    unobscured: true, indicatorUnclipped: true, width: 80, height: 44 };
  const probe = () => active === "body" ? { body: true } : {
    body: false, identity: identity(active),
    indicator: true, inViewport: true, baselineCaptured: true, ...options[`${active}Probe`],
  };
  const state = () => ({ atHome: true, positiveTabIndexCount: 0, bannerCount: present ? 1 : 0,
    dismissCount: present ? 1 : 0, banner: { ...visible }, dismiss: { ...visible, ...options.dismiss },
    activeIsDismiss: present && active === "dismiss", activeIsHeroCta: active === "cta",
    activeKind: active === "body" ? "BODY" : active === "dismiss" ? "DISMISS" : active === "cta" ? "HERO_CTA" : "OTHER_CONTROL",
    active: { ...visible, ...(active === "wordmark" ? options.next : active === "prior" ? options.restored : {}) },
    heading: { ...visible, ...options.heading }, cta: { ...visible, ...options.cta } });
  const page = {
    currentMainFrameLoaderId: "same-document",
    evaluate: async (source) => {
      if (source === HOME_DISMISS_STATE_SOURCE) { events.push(`state:${active}:${present}`); return state(); }
      if (source === FOCUS_PROBE_SOURCE) { events.push(`probe:${active}`); return probe(); }
      if (source === FOCUS_BASELINE_SOURCE) {
        events.push("baseline");
        const order = present ? ["wordmark", "cta", "dismiss"].map(identity)
          : options.observedOrder ?? ["prior", "wordmark", "cta"].map(identity);
        baselineCollections.push({ active, present, order });
        return { tabbableIdentities: order };
      }
      assert.equal(source, "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))");
      events.push("paint-observation");
      return true;
    },
    pressTab: async ({ shift = false }) => {
      assert.equal(events.at(-1), "baseline", "ACTUAL_BASELINE_MUST_PRECEDE_NATIVE_TAB");
      events.push(shift ? "native:ShiftTab" : "native:Tab");
      if (shift) { assert.equal(present, true); active = "dismiss"; }
      else active = active === "body" ? "wordmark" : actualOrder[(actualOrder.indexOf(active) + 1) % actualOrder.length];
      if (afterActivation && options.changeLoader) page.currentMainFrameLoaderId = "different-document";
    },
    send: async (method, params) => {
      assert.equal(method, "Input.dispatchKeyEvent");
      assert.equal(active, "dismiss", "ONLY_EXACT_DISMISS_MAY_BE_ACTIVATED");
      nativeEvents.push(params); events.push(`native:${params.type}`);
      if (params.type === "keyUp") {
        afterActivation = true;
        if (!options.keepHint) { present = false; active = options.returnTo ?? "prior"; }
      }
    },
  };
  return { page, events, nativeEvents, baselineCollections };
}

test("actual Home200 helper uses native Dismiss activation, observes removal/focus, then real successor and CTA in order", async () => {
  for (const name of ["phone200", "desktop200"]) {
    const control = homeDismissControl(), progress = {};
    const proof = await homeInstallDismissalProof(control.page, { name, font: 32 }, (work) => work, progress);
    const space = name === "desktop200";
    assert.deepEqual(control.nativeEvents, [
      { type: "keyDown", key: space ? " " : "Enter", code: space ? "Space" : "Enter", windowsVirtualKeyCode: space ? 32 : 13,
        text: space ? " " : "\r", unmodifiedText: space ? " " : "\r" },
      { type: "keyUp", key: space ? " " : "Enter", code: space ? "Space" : "Enter", windowsVirtualKeyCode: space ? 32 : 13 },
    ]);
    assert.ok(control.events.indexOf("native:ShiftTab") < control.events.indexOf("native:keyDown"));
    assert.ok(control.events.indexOf("native:keyUp") < control.events.indexOf("paint-observation"));
    assert.ok(control.events.indexOf("paint-observation") < control.events.indexOf("state:prior:false"));
    assert.ok(control.events.indexOf("probe:prior") < control.events.indexOf("native:Tab"));
    assert.equal(proof.state, "NATIVE_DISMISS_AND_FOCUS_OBSERVED");
    assert.equal(proof.nativeDismissExecuted, true);
    assert.equal(proof.afterRemovalFocus.body, false);
    assert.equal(proof.afterRemovalFocus.identity, "prior-identity");
    assert.equal(proof.next.fromIdentity, "prior-identity");
    assert.equal(proof.next.orderObservedAfterRemoval, true);
    assert.ok(control.baselineCollections.some((entry) => !entry.present && entry.active === "prior"
      && entry.order.includes(proof.afterRemovalFocus.identity)));
    assert.equal(proof.next.sample.identity, "wordmark-identity");
    assert.equal(proof.cta.focus.identity, "cta-identity");
    assert.equal(proof.navigationUnchanged, true);
    assert.equal(proof.acceptedRouteCaptureCountAdded, 0);
    assert.equal(proof.installPromptTelemetry, "NOT_INSTRUMENTED_EXISTING_SOURCE_TESTS_SEPARATE");
  }
});

test("absent Home install hint is never a native-dismiss PASS and still requires unobscured heading and native CTA focus", async () => {
  const control = homeDismissControl({ present: false });
  const proof = await homeInstallDismissalProof(control.page, { name: "phone200", font: 32 }, (work) => work);
  assert.equal(proof.state, "BANNER_ABSENT_NATIVE_DISMISS_NOT_EXECUTED");
  assert.equal(proof.nativeDismissExecuted, false);
  assert.equal(proof.key, null); assert.equal(proof.afterRemovalFocus, null); assert.equal(proof.next, null);
  assert.deepEqual(control.nativeEvents, []);
  assert.equal(control.events.includes("native:ShiftTab"), false);
  assert.equal(proof.cta.state.activeIsHeroCta, true);
  const obscured = homeDismissControl({ present: false, heading: { unobscured: false } });
  await assert.rejects(homeInstallDismissalProof(obscured.page, { name: "phone200", font: 32 }, (work) => work),
    { message: "HOME_POST_DISMISS_HERO_OBSCURED" });
  assert.equal(obscured.events.some((event) => event.startsWith("native:")), false);
});

test("Dismiss cannot activate when its actual focus,44px,unclipped or hit-test observations fail", async () => {
  for (const options of [{ dismiss: { width: 43 } }, { dismiss: { height: 43 } }, { dismiss: { rendered: false } },
    { dismiss: { fullyInViewport: false } }, { dismiss: { unobscured: false } }, { dismiss: { indicatorUnclipped: false } },
    { dismissProbe: { indicator: false } }, { dismissProbe: { inViewport: false } }]) {
    const control = homeDismissControl(options);
    await assert.rejects(homeInstallDismissalProof(control.page, { name: "phone200", font: 32 }, (work) => work),
      { message: "HOME_DISMISS_FOCUS_OR_TARGET_NOT_VISIBLE" });
    assert.deepEqual(control.nativeEvents, []);
  }
});

test("a native activation that does not remove the hint fails before continuation and retains incomplete observations", async () => {
  const control = homeDismissControl({ keepHint: true }), progress = {};
  await assert.rejects(homeInstallDismissalProof(control.page, { name: "desktop200", font: 32 }, (work) => work, progress),
    { message: "HOME_INSTALL_HINT_NOT_REMOVED" });
  assert.equal(control.nativeEvents.length, 2);
  assert.equal(control.events.includes("native:Tab"), false);
  assert.equal(progress.afterRemoval.bannerCount, 1);
  assert.equal(progress.accepted, false);
  assert.equal(progress.state, "INCOMPLETE_DIAGNOSTIC");
});

test("post-dismiss native focus must match the observed successor and remain visibly unoccluded", async () => {
  for (const options of [{ wordmarkProbe: { identity: "unrelated-identity" } }, { wordmarkProbe: { indicator: false } },
    { next: { fullyInViewport: false } }, { next: { unobscured: false } }, { next: { indicatorUnclipped: false } }]) {
    const control = homeDismissControl(options);
    await assert.rejects(homeInstallDismissalProof(control.page, { name: "phone200", font: 32 }, (work) => work),
      { message: "HOME_DISMISS_CONTINUATION_FOCUS_NOT_VISIBLE_OR_LOGICAL" });
    assert.equal(control.events.includes("probe:cta"), false);
  }
});

test("actual BODY after Dismiss refuses before any continuation Tab instead of fishing for a focus PASS", async () => {
  const control = homeDismissControl({ returnTo: "body" }), progress = {};
  await assert.rejects(homeInstallDismissalProof(control.page, { name: "phone200", font: 32 }, (work) => work, progress),
    { message: "HOME_POST_DISMISS_FOCUS_NOT_RESTORED" });
  assert.deepEqual(progress.afterRemovalFocus, { body: true });
  assert.equal(progress.afterRemoval.activeKind, "BODY");
  assert.equal(control.events.filter((event) => event === "native:Tab").length, 0);
  assert.equal(control.nativeEvents.length, 2);
  assert.equal(progress.accepted, false);
});

test("restored app focus still needs an actual identity,visible indicator and unoccluded unclipped target", async () => {
  for (const options of [{ priorProbe: { identity: null } }, { priorProbe: { indicator: false } },
    { priorProbe: { inViewport: false } }, { restored: { rendered: false } },
    { restored: { fullyInViewport: false } }, { restored: { unobscured: false } }, { restored: { indicatorUnclipped: false } }]) {
    const control = homeDismissControl(options);
    await assert.rejects(homeInstallDismissalProof(control.page, { name: "desktop200", font: 32 }, (work) => work),
      { message: "HOME_POST_DISMISS_FOCUS_NOT_RESTORED" });
    assert.equal(control.events.includes("native:Tab"), false);
  }
});

test("next Tab derives only from actual post-removal focus/current order and incorrect native order fails on the first Tab", async () => {
  const alternate = homeDismissControl({ returnTo: "wordmark" });
  const proof = await homeInstallDismissalProof(alternate.page, { name: "phone200", font: 32 }, (work) => work);
  assert.equal(proof.afterRemovalFocus.identity, "wordmark-identity");
  assert.equal(proof.next.fromIdentity, "wordmark-identity");
  assert.equal(proof.next.expectedIdentity, "cta-identity");
  assert.equal(proof.next.sample.identity, "cta-identity");
  assert.equal(alternate.events.filter((event) => event === "native:Tab").length, 1);
  const wrong = homeDismissControl({ actualOrder: ["prior", "cta", "wordmark"] });
  await assert.rejects(homeInstallDismissalProof(wrong.page, { name: "phone200", font: 32 }, (work) => work),
    { message: "HOME_DISMISS_CONTINUATION_FOCUS_NOT_VISIBLE_OR_LOGICAL" });
  assert.equal(wrong.events.filter((event) => event === "native:Tab").length, 1);
  const unbound = homeDismissControl({ observedOrder: ["wordmark-identity", "cta-identity"] });
  await assert.rejects(homeInstallDismissalProof(unbound.page, { name: "phone200", font: 32 }, (work) => work),
    { message: "HOME_DISMISS_TAB_SUCCESSOR_UNAVAILABLE" });
  assert.equal(unbound.events.includes("native:Tab"), false);
});

test("unchanged continuation guard retains expected/current order and active state before every rejected conjunct", async () => {
  const other = "focusable-99@html:nth-of-type(1)>a:nth-of-type(1)";
  for (const [failed, options] of [["nonbody", { wordmarkProbe: { body: true } }],
    ["identityMatches", { wordmarkProbe: { identity: other } }], ["indicator", { wordmarkProbe: { indicator: false } }],
    ["inViewport", { wordmarkProbe: { inViewport: false } }], ["fullyInViewport", { next: { fullyInViewport: false } }],
    ["unobscured", { next: { unobscured: false } }], ["indicatorUnclipped", { next: { indicatorUnclipped: false } }]]) {
    const control = homeDismissControl({ canonicalIdentities: true, ...options }), progress = {};
    await assert.rejects(homeInstallDismissalProof(control.page, { name: "phone200", font: 32 }, (work) => work, progress),
      { message: "HOME_DISMISS_CONTINUATION_FOCUS_NOT_VISIBLE_OR_LOGICAL" });
    const evidence = progress.continuation;
    assert.equal(evidence.accepted, false); assert.equal(evidence.state, "INCOMPLETE_DIAGNOSTIC");
    assert.equal(evidence.conjuncts[failed], false);
    assert.equal(evidence.expectedIdentity, control.baselineCollections.find((entry) => !entry.present).order[1]);
    assert.deepEqual(evidence.order.identities, control.baselineCollections.find((entry) => !entry.present).order);
    assert.equal(evidence.nextState.active.width, 80); assert.equal(evidence.nextState.active.height, 44);
    assert.equal(control.events.filter((event) => event === "native:Tab").length, 1);
    assert.equal(control.events.filter((event) => event === "paint-observation").length, 1);
  }
});

test("continuation projection excludes arbitrary content/accessors and restricts hit relations to closed enums", () => {
  let getterCalls = 0;
  const id = "focusable-4@html:nth-of-type(1)>body:nth-of-type(1)>a:nth-of-type(1)";
  const secret = "UNIQUE_PRIVATE_SENTINEL_7";
  const active = { rendered: true, fullyInViewport: true, unobscured: false, indicatorUnclipped: true, width: 192, height: 88,
    hitRelations: [{ point: "CENTER", relation: "SELF", onTarget: true }, { point: "TOP_LEFT", relation: "ANCESTOR", onTarget: false },
      { point: secret, relation: secret, onTarget: "not-a-boolean" }], arbitrary: secret };
  Object.defineProperty(active, "present", { get() { getterCalls++; throw new Error(secret); } });
  const evidence = homeContinuationDiagnostic({ tabbableIdentities: [id, `https://private.invalid/${secret}`] },
    { identity: id }, id, { identity: id, body: false, indicator: true, inViewport: true, text: secret },
    { atHome: true, activeKind: "OTHER_CONTROL", active, arbitrary: secret });
  assert.equal(getterCalls, 0); assert.equal(evidence.nextState.active.present, null);
  assert.equal(evidence.order.identities[1], null);
  assert.deepEqual(evidence.nextState.active.hitRelations, [
    { point: "CENTER", relation: "SELF", onTarget: true }, { point: "TOP_LEFT", relation: "ANCESTOR", onTarget: false },
    { point: null, relation: null, onTarget: null },
  ]);
  assert.doesNotMatch(JSON.stringify(evidence), /UNIQUE_PRIVATE_SENTINEL_7|https:|arbitrary|private\.invalid/);
});

test("continuation order and hit receipts stay capped with explicit truncation and do not mutate inputs", () => {
  const id = "focusable-4@html:nth-of-type(1)>body:nth-of-type(1)>a:nth-of-type(1)";
  const order = Object.freeze(Array.from({ length: 150 }, () => id));
  const hit = Object.freeze({ point: "CENTER", relation: "SELF", onTarget: true });
  const hits = Object.freeze(Array.from({ length: 12 }, () => hit));
  const state = Object.freeze({ activeKind: "OTHER_CONTROL", active: Object.freeze({ hitRelations: hits, width: Infinity, height: -1 }) });
  const evidence = homeContinuationDiagnostic({ tabbableIdentities: order }, { identity: id }, id, { identity: id }, state);
  assert.equal(evidence.order.identities.length, 128); assert.equal(evidence.order.total, 150);
  assert.equal(evidence.order.dropped, 22); assert.equal(evidence.order.truncated, true);
  assert.equal(evidence.nextState.active.hitRelations.length, 9);
  assert.equal(evidence.nextState.active.width, null); assert.equal(evidence.nextState.active.height, null);
  assert.equal(order.length, 150); assert.equal(hits.length, 12); assert.equal(state.active.hitRelations, hits);
  assert.ok(JSON.stringify(evidence).length < 70000);
});

test("observed rounded Menu dimensions normalize99rem radii and retain nine painted center,edge and corner samples", () => {
  const shape = roundedControlHitPoints({ left: 20, top: 120, width: 192.0625, height: 88, radii: Array(4).fill("3168px") });
  assert.equal(shape.supported, true); assert.deepEqual(shape.radii, Array.from({ length: 4 }, () => [44, 44]));
  assert.equal(shape.points.length, 9); assert.equal(new Set(shape.points.map((point) => point.point)).size, 9);
  const painted = (x, y) => {
    const px = x - 20, py = y - 120;
    if (px < 0 || px > 192.0625 || py < 0 || py > 88) return false;
    const cx = px < 44 ? 44 : px > 148.0625 ? 148.0625 : px;
    return (px - cx) ** 2 + (py - 44) ** 2 < 44 ** 2;
  };
  assert.equal(painted(21, 121), false, "OLD_BOUNDING_CORNER_IS_OUTSIDE_PAINT");
  for (const point of shape.points) assert.equal(painted(point.x, point.y), true, point.point);
});

test("elliptical percentage and rectangular shapes keep edge and corner coverage, unsupported radius/bounds refuse", () => {
  const ellipse = roundedControlHitPoints({ left: 0, top: 0, width: 200, height: 88, radii: Array(4).fill("50% 50%") });
  assert.equal(ellipse.supported, true); assert.deepEqual(ellipse.radii[0], [100, 44]);
  for (const { x, y } of ellipse.points) assert.ok(((x - 100) / 100) ** 2 + ((y - 44) / 44) ** 2 < 1);
  const rectangle = roundedControlHitPoints({ left: 0, top: 0, width: 200, height: 88, radii: Array(4).fill("0px") });
  assert.equal(rectangle.supported, true); assert.equal(rectangle.points.length, 9);
  const corner = rectangle.points.find((point) => point.point === "TOP_LEFT");
  assert.ok(corner.x > 0 && corner.x < 2 && corner.y > 0 && corner.y < 2);
  for (const radii of [Array(4).fill("calc(50% - 1px)"), Array(4).fill("-1px"), Array(4).fill("1px 0px"), ["0px"]]) {
    assert.deepEqual(roundedControlHitPoints({ left: 0, top: 0, width: 200, height: 88, radii }), { supported: false, points: [] });
  }
  assert.equal(roundedControlHitPoints({ left: 0, top: 0, width: Infinity, height: 88, radii: Array(4).fill("0px") }).supported, false);
});

async function roundedProbeControl(rounded) {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM('<header><details><summary tabindex="0">Menu +</summary></details></header>'
    + '<main><section class="xh-hero"><h1 id="xh-hero-title">Public heading</h1><a data-destination="healthRequest" href="/earlyaccess">Browse</a></section></main><div id="overlay"></div>',
  { url: "http://127.0.0.1/", runScripts: "outside-only" });
  const { window } = dom, target = window.document.querySelector("summary"), parent = target.parentElement;
  const overlay = window.document.getElementById("overlay"), changes = new Map();
  let rect = { left: 20, top: 120, width: 192.0625, height: 88 }, blocked = null, ancestorBlock = false;
  const box = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height });
  for (const element of window.document.querySelectorAll("*")) {
    element.getClientRects = () => [element.getBoundingClientRect()];
    element.getBoundingClientRect = () => element === target ? box() : ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 });
  }
  // Synthetic CSS/geometry boundary only: actual browser qualification remains separate.
  window.getComputedStyle = (element) => ({ opacity: "1", display: "block", visibility: "visible", transform: "none", perspective: "none",
    clipPath: "none", maskImage: "none", clip: "auto", rotate: "none", scale: "none", zoom: "1", outlineStyle: "solid", outlineWidth: "3px",
    outlineOffset: "5px", overflowX: "visible", overflowY: "visible", borderTopLeftRadius: rounded && element === target ? "3168px" : "0px",
    borderTopRightRadius: rounded && element === target ? "3168px" : "0px", borderBottomLeftRadius: rounded && element === target ? "3168px" : "0px",
    borderBottomRightRadius: rounded && element === target ? "3168px" : "0px", ...changes.get(element) });
  window.document.elementFromPoint = (x, y) => {
    if (blocked && Math.hypot(x - blocked.x, y - blocked.y) < 0.001) return ancestorBlock ? parent : overlay;
    const px = x - rect.left, py = y - rect.top;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight || px < 0 || py < 0 || px > rect.width || py > rect.height) return null;
    if (rounded) {
      const cx = px < 44 ? 44 : px > rect.width - 44 ? rect.width - 44 : px;
      if ((px - cx) ** 2 + (py - 44) ** 2 >= 44 ** 2) return parent;
    }
    return target;
  };
  target.focus();
  return { dom, window, target, parent, changes, read: () => window.eval(HOME_DISMISS_STATE_SOURCE).active,
    block: (point, ancestor = false) => { blocked = point; ancestorBlock = ancestor; },
    move: (value) => { rect = { ...rect, ...value }; } };
}

test("actual Home observer denies overlays at every rounded/rectangular painted point and never accepts ancestor hits", async () => {
  for (const rounded of [true, false]) {
    const fixture = await roundedProbeControl(rounded);
    try {
      const accepted = fixture.read();
      assert.equal(accepted.geometrySupported, true); assert.equal(accepted.unobscured, true);
      assert.equal(accepted.hitRelations.length, 9);
      const shape = roundedControlHitPoints({ left: 20, top: 120, width: 192.0625, height: 88, radii: Array(4).fill(rounded ? "3168px" : "0px") });
      for (const point of shape.points) {
        fixture.block(point);
        const rejected = fixture.read();
        assert.equal(rejected.unobscured, false, point.point);
        assert.equal(rejected.hitRelations.find((hit) => hit.point === point.point).relation, "OTHER");
      }
      fixture.block(shape.points[1], true);
      const ancestor = fixture.read();
      assert.equal(ancestor.unobscured, false); assert.equal(ancestor.hitRelations[1].relation, "ANCESTOR");
    } finally { fixture.dom.window.close(); }
  }
});

test("actual geometry observer refuses unsupported transforms/masks/fragments and retains clipped viewport/outline denial", async () => {
  const fixture = await roundedProbeControl(true);
  try {
    for (const change of [{ transform: "matrix(2,0,0,2,0,0)" }, { clipPath: "circle(50%)" }, { maskImage: "fixture-mask" }]) {
      fixture.changes.set(fixture.target, change);
      const refused = fixture.read(); assert.equal(refused.geometrySupported, false); assert.equal(refused.unobscured, false);
    }
    fixture.changes.set(fixture.target, { transform: "matrix(1,0,0,1,10,0)" });
    assert.equal(fixture.read().geometrySupported, true, "PURE_TRANSLATION_REMAINS_SUPPORTED");
    const original = fixture.target.getClientRects;
    fixture.target.getClientRects = () => [fixture.target.getBoundingClientRect(), fixture.target.getBoundingClientRect()];
    assert.equal(fixture.read().unobscured, false);
    fixture.target.getClientRects = original; fixture.changes.clear(); fixture.move({ left: -8 });
    assert.equal(fixture.read().fullyInViewport, false); assert.equal(fixture.read().indicatorUnclipped, false);
    fixture.move({ left: 20 }); fixture.changes.set(fixture.parent, { overflowX: "hidden" });
    fixture.parent.getBoundingClientRect = () => ({ left: 25, top: 110, right: 220, bottom: 220, width: 195, height: 110 });
    assert.equal(fixture.read().indicatorUnclipped, false);
  } finally { fixture.dom.window.close(); }
});

test("post-dismiss CTA occlusion,missing indicator and changed document still refuse qualification", async () => {
  for (const options of [{ cta: { unobscured: false } }, { cta: { fullyInViewport: false } },
    { cta: { height: 43 } }, { ctaProbe: { indicator: false } }]) {
    const control = homeDismissControl(options);
    await assert.rejects(homeInstallDismissalProof(control.page, { name: "desktop200", font: 32 }, (work) => work),
      { message: "HOME_POST_DISMISS_CTA_NOT_UNOBSTRUCTED" });
  }
  const changed = homeDismissControl({ changeLoader: true });
  await assert.rejects(homeInstallDismissalProof(changed.page, { name: "phone200", font: 32 }, (work) => work),
    { message: "HOME_DISMISS_NAVIGATION_CHANGED" });
});

test("actual read-only Home probe scopes Dismiss to the known install status, refusing hidden/duplicate controls", async () => {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM('<main><section class="xh-hero"><h1 id="xh-hero-title">Public heading</h1><a data-destination="healthRequest" href="/earlyaccess">Browse</a></section></main>'
    + '<button aria-label="Dismiss" id="unrelated">Dismiss unrelated</button><div role="status" id="hint">Add xenios to your home screen.<button aria-label="Dismiss" id="close">×</button></div>',
  { url: "http://127.0.0.1/", runScripts: "outside-only" });
  const { window } = dom;
  try {
    // Deterministic DOM geometry only; this test makes no actual visible-focus/browser claim.
    for (const element of window.document.querySelectorAll("*")) {
      element.style.opacity = "1";
      element.getClientRects = () => [{ left: 20, top: 20, right: 100, bottom: 64, width: 80, height: 44 }];
      element.getBoundingClientRect = () => ({ left: 20, top: 20, right: 100, bottom: 64, width: 80, height: 44 });
    }
    const close = window.document.getElementById("close");
    window.document.elementFromPoint = () => close;
    close.focus();
    const before = window.document.body.innerHTML, sample = window.eval(HOME_DISMISS_STATE_SOURCE);
    assert.equal(sample.bannerCount, 1); assert.equal(sample.dismissCount, 1); assert.equal(sample.activeIsDismiss, true);
    assert.equal(window.document.body.innerHTML, before, "PROBE_MUST_NOT_WRITE_DOM_OR_STYLE");
    window.document.getElementById("hint").style.visibility = "hidden";
    assert.equal(window.eval(HOME_DISMISS_STATE_SOURCE).dismiss.rendered, false);
    window.document.getElementById("hint").style.visibility = "visible";
    const duplicate = close.cloneNode(true); duplicate.removeAttribute("id"); close.parentElement.append(duplicate);
    const ambiguous = window.eval(HOME_DISMISS_STATE_SOURCE);
    assert.equal(ambiguous.dismissCount, 2); assert.equal(ambiguous.activeIsDismiss, false);
  } finally { window.close(); }
});

test("actual post-interaction wait reaches document idle and worker flush before the receipt boundary", async () => {
  const order = [], ceilings = [];
  let completeIdle;
  const idle = new Promise((resolve) => { completeIdle = resolve; });
  const page = {
    settle: (options) => { assert.deepEqual(options, { quietMs: 150, maxSettleMs: 5000 }); order.push("settle"); return idle; },
    waitForBoundaryTargets: async () => { order.push("workers"); },
  };
  const waiting = settlePostInteractionNetwork(page, (operation, ceiling) => { ceilings.push(ceiling); return operation; })
    .then(() => { order.push("receipt"); });
  await Promise.resolve();
  assert.deepEqual(order, ["settle"]);
  completeIdle({ reachedIdle: true, pendingRequests: 0 });
  await waiting;
  assert.deepEqual(order, ["settle", "workers", "receipt"]);
  assert.deepEqual(ceilings, [5000, undefined]);
});

test("post-interaction bounded rejection prevents worker/receipt progress and does not retire requests", async () => {
  const request = Object.freeze({ responseStatus: 503 }), pending = new Map([["actual-pending", request]]), order = [];
  const page = {
    inflight: pending,
    settle: () => { order.push("settle"); return new Promise(() => {}); },
    waitForBoundaryTargets: async () => { order.push("workers"); },
  };
  await assert.rejects(settlePostInteractionNetwork(page, (_operation, ceiling) => {
    assert.equal(ceiling, 5000);
    return Promise.reject(new Error("BOUNDED_OPERATION_TIMEOUT"));
  }), { message: "BOUNDED_OPERATION_TIMEOUT" });
  assert.deepEqual(order, ["settle"]);
  assert.equal(pending.size, 1);
  assert.equal(pending.get("actual-pending"), request);
});

test("the actual final zero gate still rejects any pending, fulfillment, worker or setup state regardless of response", () => {
  const empty = Object.freeze({ fulfillmentCount: 0, pending: 0, pendingTargets: 0, setupErrors: 0 });
  assert.doesNotThrow(() => assertNetworkBoundaryComplete(empty));
  for (const field of Object.keys(empty)) {
    for (const responseStatus of [200, 503]) {
      const receipt = Object.freeze({ ...empty, [field]: 1, responseStatus });
      assert.throws(() => assertNetworkBoundaryComplete(receipt), { message: "NETWORK_BOUNDARY_INCOMPLETE" });
      assert.equal(receipt[field], 1);
    }
  }
});

test("actual incremental collector precedes Tab after retry replaces nodes and never overwrites a focused baseline", async () => {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM('<section id="error"><button id="retry">Try again</button><a id="next" href="/health">Explore</a></section>', { runScripts: "outside-only" });
  const { window } = dom, calls = [];
  let target = window.document.getElementById("retry");
  const page = {
    evaluate: async (source) => { assert.equal(source, FOCUS_BASELINE_SOURCE); calls.push("collect"); return window.eval(source); },
    pressTab: async ({ shift = false } = {}) => {
      calls.push(shift ? "tab:reverse" : "tab:forward");
      assert.equal(window.__xeniosEvidenceFocusStateV2?.baselines.has(target), true, "UNREFRESHED_CONTROL_HAS_NO_BASELINE");
      target.focus();
    },
  };
  try {
    await tabWithFreshFocusBaseline(page, (promise) => promise);
    const state = window.__xeniosEvidenceFocusStateV2, originalNode = target, originalBaseline = state.baselines.get(target);
    window.document.getElementById("error").outerHTML = '<section id="error"><button id="retry">Try again</button><a id="next" href="/health">Explore</a></section>';
    target = window.document.getElementById("next");
    assert.notEqual(window.document.getElementById("retry"), originalNode);
    assert.equal(state.baselines.has(target), false);
    // This is the original once-only collection sequence: replacement has no baseline.
    await assert.rejects(page.pressTab(), { name: "AssertionError" });
    calls.length = 0;
    await tabWithFreshFocusBaseline(page, (promise) => promise);
    assert.deepEqual(calls, ["collect", "tab:forward"]);
    const replacementBaseline = state.baselines.get(target);
    assert.ok(replacementBaseline);
    assert.equal(state.baselines.get(originalNode), originalBaseline);
    const alreadyFocused = window.document.createElement("button");
    window.document.body.append(alreadyFocused); alreadyFocused.focus();
    await page.evaluate(FOCUS_BASELINE_SOURCE);
    assert.equal(state.baselines.has(alreadyFocused), false);
    target = window.document.getElementById("retry");
    calls.length = 0;
    await tabWithFreshFocusBaseline(page, (promise) => promise, { shift: true });
    assert.deepEqual(calls, ["collect", "tab:reverse"]);
    assert.equal(window.__xeniosEvidenceFocusStateV2, state);
    assert.equal(state.baselines.get(window.document.getElementById("next")), replacementBaseline);
    assert.equal(state.baselines.has(alreadyFocused), false);
    // No geometry or visible-focus PASS is asserted: this control is DOM identity/order only.
  } finally { window.close(); }
});

test("actual keyboard failure retains the sampled desired control as incomplete diagnostics before rejecting", async () => {
  const progress = {}, calls = [], sample = Object.freeze({ body: false, indicator: false, inViewport: true, baselineCaptured: false, tag: "button" });
  const page = {
    evaluate: async (source) => {
      if (source === FOCUS_BASELINE_SOURCE) { calls.push("collect"); return {}; }
      if (source === FOCUS_PROBE_SOURCE) { calls.push("probe"); return sample; }
      return "Try again";
    },
    pressTab: async () => { calls.push("tab"); },
    send: async () => { throw new Error("FAILED_FOCUS_MUST_NOT_ACTIVATE"); },
  };
  await assert.rejects(keyboardProof(page, "/r/SAMPLE-CODE", (promise) => promise, progress), { message: "KEYBOARD_FOCUS_NOT_VISIBLE" });
  assert.deepEqual(calls, ["collect", "tab", "probe"]);
  assert.equal(progress.state, "INCOMPLETE_DIAGNOSTIC");
  assert.equal(progress.accepted, false);
  assert.equal(progress.phase, "CHECK_FOCUS");
  assert.equal(progress.lastStep.sample, sample);
  assert.equal(progress.lastStep.desiredIndex, 0);
  assert.equal(progress.lastStep.expectedControl, "Try again");
  assert.equal(progress.steps.length, 1);
});

test("raw fixed routes and inventoried assets are admitted without generic SPA or metadata bypass", () => {
  assert.equal(classifyRequest("GET", "/", assets).kind, "document");
  assert.equal(classifyRequest("HEAD", "/r/SAMPLE-CODE", assets).kind, "document");
  assert.deepEqual(classifyRequest("GET", "/assets/app.js", assets), { kind: "asset", path: "assets/app.js" });
  assert.deepEqual(classifyRequest("GET", "/offline.html", assets), { kind: "asset", path: "offline.html" });
  for (const target of ["/r/OTHER", "/r/SAMPLE-CODE/", "/r/SAMPLE-CODE/x", "/r/%53AMPLE-CODE", "/R/SAMPLE-CODE",
    "/r/SAMPLE-CODE?ref=x", "/r/SAMPLE-CODE#x", "/r/SAMPLE CODE", "/r\\SAMPLE-CODE", "/assets/../index.html",
    "//example.com/", "/index.html", "/PREVIEW-SOURCE.json", "/unlisted.js"]) {
    assert.equal(classifyRequest("GET", target, assets).kind, "refused", target);
  }
});

test("only the synthetic local resolve POST is in contract; no capture, assent, claim or other write", () => {
  assert.equal(classifyRequest("POST", "/api/research/referral/resolve", assets).kind, "resolve_fixture");
  for (const target of ["/", "/r/SAMPLE-CODE", "/api/research/referral/bootstrap", "/api/research/referral/capture",
    "/api/research/account-identity/history-claims/confirm", "/api/research/referral/resolve?code=other"]) {
    assert.equal(classifyRequest("POST", target, assets).kind, "refused");
  }
  for (const method of ["PATCH", "PUT", "DELETE", "OPTIONS", "CONNECT"]) assert.equal(classifyRequest(method, "/", assets).kind, "refused");
});

test("Wholesale admits exactly one public document and three GET fixtures, no API/static/query/method bypass", () => {
  assert.equal(classifyRequest("GET", WHOLESALE_ROUTE, assets).kind, "document");
  for (const path of Object.keys(READ_ONLY_GET_FIXTURES)) {
    assert.deepEqual(classifyRequest("GET", path, assets), { kind: "readonly_fixture", path });
    for (const method of ["POST", "PATCH", "DELETE", "HEAD"]) assert.equal(classifyRequest(method, path, assets).kind, "refused");
    for (const suffix of ["?ready=true", "/extra", "/"]) assert.equal(classifyRequest("GET", path + suffix, assets).kind, "refused");
  }
  for (const path of ["/research/wholesale", "/research/wholesale?ref=synthetic", WHOLESALE_ROUTE + "/private",
    WHOLESALE_ROUTE + "?ref=synthetic", "/api/research/member/me", "/api/research/catalog"]) {
    assert.equal(classifyRequest("GET", path, new Map([...assets, [path.slice(1), {}]])).kind, "refused");
  }
});

test("raw metadata observation decodes public text independently of attribute order and refuses absent values", () => {
  assert.deepEqual(rawDocumentMetadata('<html><head><title>Wholesale &amp; organizations</title><meta content="A &amp; B." NAME="description"></head></html>'),
    { title: "Wholesale & organizations", description: "A & B." });
  assert.deepEqual(rawDocumentMetadata('<html><head><meta name="different" content="not a description"></head></html>'), { title: "", description: "" });
  assert.deepEqual(rawDocumentMetadata('<html><head><meta data-name="description" content="not authority"></head></html>'), { title: "", description: "" });
});

test("page-check receipts distinguish actual frozen navigation load and idle rejection without recording their URLs", async () => {
  for (const [message, expected] of [
    ["navigate http://127.0.0.1:12345/: load event not fired within 8000 ms", "PAGE_DOCUMENT_LOAD_TIMEOUT"],
    ["network did not remain idle through paint within 5000 ms; 1 request(s) pending [Other]", "PAGE_DOCUMENT_IDLE_TIMEOUT"],
    ["network did not remain idle through paint within 5000 ms; 0 request(s) pending []", "PAGE_DOCUMENT_IDLE_TIMEOUT"],
  ]) {
    const receipts = [];
    let calls = 0, clock = 100;
    await assert.rejects(runPageCheck("DOCUMENT_NAVIGATE", async () => {
      calls++; clock = 125; throw new Error(message);
    }, receipts, () => clock), { message: expected });
    assert.equal(calls, 1);
    assert.deepEqual(receipts, [{ check: "DOCUMENT_NAVIGATE", state: "FAILED", elapsedMs: 25, failure: expected }]);
    assert.ok(!JSON.stringify(receipts).includes(message));
    assert.ok(!JSON.stringify(receipts).includes("127.0.0.1"));
  }
  assert.equal(pageCheckFailureCode("PAGE_VIEW", new Error("navigate http://127.0.0.1/: load event not fired within 8000 ms")), "PAGE_CHECK_PAGE_VIEW_FAILED");
  assert.equal(pageCheckFailureCode("DOCUMENT_NAVIGATE", new Error("network did not remain idle: password p7")), "PAGE_CHECK_DOCUMENT_NAVIGATE_FAILED");
});

test("page-check success is genuine and unrecognised errors cannot leak credentials or invoke invalid checks", async () => {
  const receipts = [], value = { synthetic: true };
  assert.equal(await runPageCheck("PAGE_AUDIT", () => value, receipts, () => 10), value);
  assert.deepEqual(receipts, [{ check: "PAGE_AUDIT", state: "PASS", elapsedMs: 0 }]);
  for (const message of ["password p7", "token abc123", "cookie sid=shortsecret", "https://private.invalid/?credential=smallsecret"]) {
    const failure = [];
    await assert.rejects(runPageCheck("SCREENSHOT", () => Promise.reject(new Error(message)), failure), { message: "PAGE_CHECK_SCREENSHOT_FAILED" });
    const serialized = JSON.stringify(failure);
    for (const secret of ["p7", "abc123", "shortsecret", "smallsecret", "private.invalid"]) assert.ok(!serialized.includes(secret));
  }
  let invoked = false;
  await assert.rejects(runPageCheck("password p7", () => { invoked = true; }, []), { message: "PAGE_CHECK_INVALID" });
  assert.equal(invoked, false);
  assert.equal(pageCheckFailureCode("SCREENSHOT", new Error("BOUNDED_OPERATION_TIMEOUT")), "BOUNDED_OPERATION_TIMEOUT");
});

test("failure observations omit all text and reject malformed or excessive numeric and boolean metrics", () => {
  const projection = pageFailureMetrics({ width: 375, height: 812, root: 16, rem: 16, loaded: false, expectedTextPresent: true,
    h1Count: 1, mainCount: 1, inflightCount: 2, boundaryTargetCount: 0, boundarySetupErrorCount: 0,
    dpr: "p7", scale: Infinity, scrollWidth: -1, clientWidth: 10000001, domReady: "token abc123",
    bodyText: "cookie sid=shortsecret", url: "https://private.invalid/?token=smallsecret", error: new Error("password p7") });
  assert.equal(projection.width, 375);
  assert.equal(projection.loaded, false);
  assert.equal(projection.expectedTextPresent, true);
  for (const key of ["dpr", "scale", "scrollWidth", "clientWidth", "domReady", "bodyPresent"]) assert.equal(projection[key], null);
  for (const secret of ["p7", "abc123", "shortsecret", "smallsecret", "private.invalid", "bodyText", "url", "error"]) {
    assert.ok(!JSON.stringify(projection).includes(secret));
  }
});

test("each optional failure observation gets only remaining absolute time beyond cleanup and tail reserves", () => {
  const deadline = 300000;
  assert.equal(failureObservationBudget(deadline, 100000, 750), 750);
  assert.equal(failureObservationBudget(deadline, 100750, 1500), 1500);
  assert.equal(failureObservationBudget(deadline, 274200, 1500), 300);
  assert.equal(failureObservationBudget(deadline, 274500, 750), 0);
  assert.equal(failureObservationBudget(deadline, 274501, 1500), 0);
  assert.equal(failureObservationBudget(deadline, 300001, 750), 0);
  assert.equal(failureObservationBudget(NaN, 100000, 750), 0);
  assert.throws(() => failureObservationBudget(deadline, 0, 15000), /DIAGNOSTIC_CEILING_INVALID/);
});

const pendingSnapshot = (pending, overrides = {}) => inflightFailureSnapshot({ inflight: pending, sessionId: "page-session",
  recordsGeneration: 2, mainFrameId: "frame-current", currentMainFrameLoaderId: "loader-current",
  mainFrameLoaderTransition: { previousLoaderId: "loader-old" } }, {
  origin: "http://127.0.0.1:12345", assets: new Set(["assets/app.js"]), ledger: [], now: 10000, ...overrides,
});

test("real activation dispatch includes canonical Enter and Space character data only on keyDown", async () => {
  const sent = [], page = { send: async (method, params) => { sent.push({ method, params }); } };
  const bounded = (promise) => promise;
  await dispatchActivationKey(page, "Enter", bounded);
  await dispatchActivationKey(page, " ", bounded);
  assert.deepEqual(sent, [
    { method: "Input.dispatchKeyEvent", params: { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" } },
    { method: "Input.dispatchKeyEvent", params: { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 } },
    { method: "Input.dispatchKeyEvent", params: { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " ", unmodifiedText: " " } },
    { method: "Input.dispatchKeyEvent", params: { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 } },
  ]);
  await assert.rejects(dispatchActivationKey(page, "Escape", bounded), { message: "ACTIVATION_KEY_INVALID" });
  assert.equal(sent.length, 4);
});

test("Infinity availability requires the scoped rendered badge with exact case/whitespace-normalized label", () => {
  for (const text of ["In development", "IN DEVELOPMENT", "  in\n development  "]) {
    assert.equal(hasInfinityDevelopmentBadge({ text, rendered: true }), true);
  }
  for (const sample of [undefined, null, {}, { text: "In development", rendered: false },
    { text: "IN DEVELOPMENT", rendered: "true" }, { text: "In development" },
    { text: "Infinity is in development.", rendered: true }, { text: "Not in development", rendered: true },
    { text: "In development — available now", rendered: true }, { text: "", rendered: true },
    { bodyText: "Infinity is in development.", rendered: true }]) {
    assert.equal(hasInfinityDevelopmentBadge(sample), false);
  }
});

test("the actual configuration lifecycle retains one page and boundary through every route, then leaves one owned close", async () => {
  const pages = [];
  for (const config of CONFIGURATIONS) {
    const order = [], instance = { boundaryActive: false, closed: false };
    let owned, created = 0, configured = 0, closes = 0;
    try {
      await visitConfigurationPage({
        create: async () => { created++; order.push("create"); pages.push(instance); return instance; },
        own: (page) => { owned = page; order.push("own"); },
        configure: async (page) => { assert.equal(page, owned); configured++; page.boundaryActive = true; order.push("configure"); },
        visit: async (page, route) => {
          assert.equal(page, instance);
          assert.equal(page, owned);
          assert.equal(page.boundaryActive, true);
          assert.equal(page.closed, false);
          assert.equal(closes, 0);
          order.push(route);
          await Promise.resolve();
        },
      });
      assert.deepEqual(order, ["create", "own", "configure", ...ROUTES]);
      assert.equal(created, 1);
      assert.equal(configured, 1);
      assert.equal(owned, instance, config.name);
      assert.equal(instance.boundaryActive, true);
    } finally {
      if (owned) { owned.boundaryActive = false; owned.closed = true; closes++; }
    }
    assert.equal(closes, 1);
    assert.equal(instance.closed, true);
  }
  assert.equal(new Set(pages).size, CONFIGURATIONS.length);
});

test("configuration setup or route failure preserves captured ownership and never visits a later route", async () => {
  for (const failure of ["create", "configure", ROUTES[1]]) {
    const page = { closed: false }, order = [];
    let owned;
    await assert.rejects(visitConfigurationPage({
      create: async () => { order.push("create"); if (failure === "create") throw new Error("synthetic"); return page; },
      own: (created) => { owned = created; order.push("own"); },
      configure: async (created) => {
        assert.equal(created, owned); order.push("configure");
        if (failure === "configure") throw new Error("synthetic");
      },
      visit: async (created, route) => {
        assert.equal(created, owned); assert.equal(created.closed, false); order.push(route);
        if (route === failure) throw new Error("synthetic");
      },
    }), { message: "synthetic" });
    assert.deepEqual(order, failure === "create" ? ["create"] : failure === "configure"
      ? ["create", "own", "configure"] : ["create", "own", "configure", ROUTES[0], ROUTES[1]]);
    assert.equal(owned, failure === "create" ? undefined : page);
    assert.equal(page.closed, false);
    if (owned) owned.closed = true;
    assert.equal(page.closed, failure !== "create");
  }
});

test("actual configuration boundary callback survives route-local resets without relaxing options or echoing arbitrary data", () => {
  const violations = [], localRecords = [], origin = "http://127.0.0.1:12345";
  const options = configurationBoundaryOptions(origin, violations);
  assert.deepEqual(options.fulfillments, []);
  assert.deepEqual(options.allowedOrigins, [origin]);
  assert.deepEqual(options.allowedWebSocketOrigins, []);
  options.onViolation({ url: "https://private.invalid/?token=shortsecret", body: "password p7" });
  localRecords.push("synthetic route observation");
  localRecords.length = 0;
  options.onViolation({ url: "https://private.invalid/?cookie=sid", reason: "sensitive-data" });
  assert.deepEqual(violations, [{ reason: "PROFILE_NETWORK_BOUNDARY_VIOLATION" }, { reason: "PROFILE_NETWORK_BOUNDARY_VIOLATION" }]);
  for (const secret of ["private.invalid", "shortsecret", "p7", "sid", "sensitive-data"]) assert.ok(!JSON.stringify(violations).includes(secret));
});

function traceFixture() {
  const listeners = new Map(), commands = [];
  const conn = {
    on(method, callback, sessionId) {
      const key = `${sessionId ?? ""}|${method}`;
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(callback);
      return () => listeners.get(key).delete(callback);
    },
    emit(method, params, sessionId) {
      for (const callback of [...(listeners.get(`${sessionId ?? ""}|${method}`) ?? [])]) callback(params);
    },
    send(...args) { commands.push(args); throw new Error("PASSIVE_TRACE_MUST_NOT_SEND"); },
  };
  const page = { sessionId: "page-private", boundarySessionIds: new Set(["page-private"]), inflight: new Map(),
    recordsGeneration: 1, currentMainFrameLoaderId: "old-loader", mainFrameId: "frame-private" };
  const options = { origin: "http://127.0.0.1:12345", assets: new Set(["favicon.png"]), now: () => 1000 };
  return { conn, page, options, commands, listeners,
    emit: (method, params, session = "page-private") => conn.emit(method, params, session) };
}

test("actual passive callbacks correlate favicon terminals and main-frame reload order without changing pending state", () => {
  const fixture = traceFixture(), { page, emit } = fixture;
  const liveRequest = { sessionId: page.sessionId, url: "http://127.0.0.1:12345/favicon.png" };
  page.inflight.set("favicon-private", liveRequest);
  const trace = observeOwnedCdpEvents(fixture.conn, page, fixture.options);
  emit("Page.frameNavigated", { frame: { id: "frame-private", loaderId: "old-loader", url: "http://127.0.0.1:12345/" } });
  emit("Network.requestWillBeSent", { requestId: "favicon-private", frameId: "frame-private", loaderId: "old-loader",
    request: { url: "http://127.0.0.1:12345/favicon.png", method: "GET" }, type: "Other", initiator: { type: "other" } });
  const initial = trace.snapshot();
  page.currentMainFrameLoaderId = "new-loader";
  page.mainFrameLoaderTransition = { previousLoaderId: "old-loader" };
  emit("Page.frameNavigated", { frame: { id: "frame-private", loaderId: "new-loader", url: "http://127.0.0.1:12345/" } });
  emit("Network.responseReceived", { requestId: "favicon-private", type: "Other",
    response: { url: "http://127.0.0.1:12345/favicon.png", status: 200, fromServiceWorker: false } });
  emit("Network.loadingFinished", { requestId: "favicon-private" });
  emit("Page.loadEventFired", {});
  const snapshot = trace.snapshot();
  assert.deepEqual(snapshot.events.map((event) => event.kind), ["SESSION", "FRAME", "REQUEST", "FRAME", "RESPONSE", "FINISHED", "LOAD"]);
  const request = snapshot.events[2], reload = snapshot.events[3];
  assert.equal(request.pathSha256, hash("/favicon.png"));
  assert.equal(request.pathClass, "INVENTORIED_ASSET");
  assert.equal(reload.pathClass, "HOME_DOCUMENT");
  assert.equal(reload.previousLoaderOrdinal, request.loaderOrdinal);
  assert.notEqual(reload.currentLoaderOrdinal, request.loaderOrdinal);
  assert.equal(snapshot.events[4].requestOrdinal, request.requestOrdinal);
  assert.equal(snapshot.events[5].requestOrdinal, request.requestOrdinal);
  assert.deepEqual(snapshot.pending, [{ pendingOrdinal: 0, sessionOrdinal: 0, requestOrdinal: request.requestOrdinal }]);
  assert.equal(initial.events.length, 3);
  assert.equal(initial.pending[0].requestOrdinal, request.requestOrdinal);
  assert.equal(page.inflight.size, 1);
  assert.equal(page.inflight.get("favicon-private"), liveRequest);
  assert.deepEqual(fixture.commands, []);
  for (const secret of ["favicon-private", "page-private", "frame-private", "old-loader", "new-loader", "127.0.0.1", "/favicon.png"]) assert.ok(!JSON.stringify(snapshot).includes(secret));
  assert.equal(trace.stop().stopped, true);
});

test("trace follows only instrumented child ownership including same-dispatch ordering, and stop defeats queued late attachment", async () => {
  const fixture = traceFixture(), trace = observeOwnedCdpEvents(fixture.conn, fixture.page, fixture.options);
  const nativeOff = fixture.conn.on("Target.attachedToTarget", (params) => {
    if (params.sessionId === "owned-child" || params.sessionId === "queued-child") fixture.page.boundarySessionIds.add(params.sessionId);
  });
  fixture.conn.emit("Target.attachedToTarget", { sessionId: "unowned-private" });
  fixture.conn.emit("Target.attachedToTarget", { sessionId: "owned-child" });
  await Promise.resolve();
  fixture.emit("Network.requestWillBeSent", { requestId: "child-request", request: { url: "http://127.0.0.1:12345/sw.js", method: "GET" }, type: "Script" }, "owned-child");
  fixture.emit("Network.requestWillBeSent", { requestId: "foreign", request: { url: "https://private.invalid/" } }, "unowned-private");
  const before = trace.snapshot();
  assert.equal(before.sessions, 2);
  assert.equal(before.events.at(-1).targetClass, "CHILD");
  assert.equal(before.events.at(-1).pathClass, "SERVICE_WORKER_SCRIPT");
  fixture.conn.emit("Target.attachedToTarget", { sessionId: "queued-child" });
  const stopped = trace.stop();
  assert.equal(stopped.unsubscribeErrors, 0);
  await Promise.resolve();
  fixture.emit("Network.loadingFinished", { requestId: "child-request" }, "owned-child");
  assert.equal(trace.snapshot().capturedEvents, before.capturedEvents);
  assert.equal(trace.snapshot().sessions, 2);
  assert.equal(trace.stop().stopped, true);
  assert.equal([...fixture.listeners.values()].reduce((count, set) => count + set.size, 0), 1);
  assert.deepEqual(fixture.commands, []);
  nativeOff();
});

test("trace callbacks project only enums/public fingerprints and never invoke payload getters or echo private values", () => {
  const fixture = traceFixture(), trace = observeOwnedCdpEvents(fixture.conn, fixture.page, fixture.options);
  let getters = 0;
  const wire = { method: { toString() { throw new Error("password p7"); } } };
  Object.defineProperty(wire, "url", { get() { getters++; return "https://private.invalid/?token=shortsecret"; } });
  fixture.emit("Network.requestWillBeSent", { requestId: "secret-id", type: "arbitrary-private-type", request: wire, loaderId: {}, frameId: {} });
  const response = { url: "http://127.0.0.1:12345/private/customer-secret" };
  Object.defineProperty(response, "status", { get() { getters++; return 200; } });
  Object.defineProperty(response, "fromServiceWorker", { get() { getters++; return true; } });
  fixture.emit("Network.responseReceived", { requestId: "secret-id", type: "Other", response });
  const failed = { requestId: "secret-id", type: "Other", canceled: true };
  Object.defineProperty(failed, "errorText", { get() { getters++; return "cookie sid=x"; } });
  fixture.emit("Network.loadingFailed", failed);
  fixture.emit("Network.responseReceived", { requestId: "query-id", response: { url: "http://127.0.0.1:12345/?token=shortsecret", status: 200 } });
  const snapshot = trace.snapshot();
  assert.equal(getters, 0);
  assert.equal(snapshot.observerErrors, 0);
  assert.ok(snapshot.events.filter((event) => Object.hasOwn(event, "pathSha256")).every((event) => event.pathSha256 === null));
  assert.equal(snapshot.events.find((event) => event.kind === "FAILED").canceled, true);
  for (const secret of ["p7", "shortsecret", "private.invalid", "customer-secret", "secret-id", "sid=x", "arbitrary-private-type"]) assert.ok(!JSON.stringify(snapshot).includes(secret));
  assert.deepEqual(fixture.commands, []);
  trace.stop();
});

test("trace caps identities and sessions while bounded head/tail retention preserves late terminal evidence", () => {
  const fixture = traceFixture();
  for (let i = 0; i < 20; i++) fixture.page.boundarySessionIds.add(`owned-${i}`);
  fixture.page.inflight.set("id-0", { sessionId: fixture.page.sessionId });
  const trace = observeOwnedCdpEvents(fixture.conn, fixture.page, fixture.options);
  for (let i = 0; i < 300; i++) fixture.emit("Network.requestWillBeSent", { requestId: `id-${i}`, frameId: `frame-${i}`, loaderId: `loader-${i}`,
    type: "Other", request: { url: "http://127.0.0.1:12345/favicon.png", method: "GET" } });
  for (let i = 0; i < 100; i++) fixture.emit("Page.loadEventFired", {});
  fixture.emit("Network.loadingFailed", { requestId: "id-0", type: "Other", canceled: true });
  const snapshot = trace.snapshot();
  assert.equal(snapshot.sessions, 16);
  assert.equal(snapshot.requests, 128);
  assert.equal(snapshot.events.length, 384);
  assert.equal(snapshot.retention, "FIRST_192_LAST_192");
  assert.equal(snapshot.droppedEvents, snapshot.eventsSeen - 384);
  assert.deepEqual(snapshot.truncated, { sessions: true, requests: true, events: true, lineage: true });
  assert.equal(snapshot.events.at(-1).kind, "FAILED");
  assert.equal(snapshot.events.at(-1).requestOrdinal, snapshot.events.find((event) => event.kind === "REQUEST").requestOrdinal);
  assert.equal(snapshot.pending[0].requestOrdinal, snapshot.events.at(-1).requestOrdinal);
  assert.ok(snapshot.events.every((event, i) => i === 0 || event.sequence > snapshot.events[i - 1].sequence));
  assert.equal(fixture.page.inflight.size, 1);
  assert.deepEqual(fixture.commands, []);
  trace.stop();
});

test("pending snapshot distinguishes page/child lineage and observed server responses without mutating live requests", () => {
  const first = { url: "http://127.0.0.1:12345/assets/app.js", method: "GET", type: "Script", sessionId: "page-session",
    generation: 2, frameId: "frame-current", loaderId: "loader-old", observedAtMs: 9000, initiatorType: "parser" };
  const second = { url: "http://127.0.0.1:12345/sw.js", method: "GET", type: "Other", sessionId: "child-session",
    targetType: "worker-or-child", responseRecord: { status: 200 }, responseFromServiceWorker: false };
  const pending = new Map([["private-request-one", first], ["private-request-two", second]]);
  const before = [...pending.entries()];
  const snapshot = pendingSnapshot(pending, { ledger: [
    { target: "/assets/app.js", method: "GET", status: 200 }, { target: "/assets/app.js", method: "GET", status: 200 },
    { target: "/assets/app.js", method: "POST", status: 200 }, { target: "/sw.js", method: "GET", status: 200 },
  ] });
  assert.equal(snapshot.state, "OBSERVED_READ_ONLY");
  assert.equal(snapshot.pendingCount, 2);
  assert.equal(snapshot.serverRecordsAreNotCdpCompletionProof, true);
  assert.deepEqual(snapshot.entries[0], { ordinal: 0, pathClass: "INVENTORIED_ASSET", pathSha256: hash("/assets/app.js"),
    method: "GET", resourceType: "Script", targetClass: "PAGE", sessionRelation: "SAME", generationRelation: "SAME",
    frameRelation: "SAME", currentLoaderRelation: "DIFFERENT", previousLoaderRelation: "SAME", initiatorType: "parser",
    responsePresent: false, responseStatus: null, responseFromServiceWorker: null, ageMsCapped: 1000, ageCapped: false,
    samePathServerResponseRecordCount: 2 });
  assert.equal(snapshot.entries[1].pathClass, "SERVICE_WORKER_SCRIPT");
  assert.equal(snapshot.entries[1].targetClass, "CHILD");
  assert.equal(snapshot.entries[1].generationRelation, "UNKNOWN");
  assert.equal(snapshot.entries[1].responseStatus, 200);
  assert.equal(snapshot.entries[1].responseFromServiceWorker, false);
  assert.equal(snapshot.entries[1].ageMsCapped, null);
  assert.deepEqual([...pending.entries()], before);
  assert.equal(pending.get("private-request-one"), first);
  for (const secret of ["private-request-one", "page-session", "child-session", "frame-current", "loader-old", "127.0.0.1", "/assets/app.js", "/sw.js"]) {
    assert.ok(!JSON.stringify(snapshot).includes(secret));
  }
});

test("pending snapshot never invokes record accessors or serializes arbitrary values and sensitive paths", () => {
  let getters = 0;
  const pending = new Map();
  Object.defineProperty(pending, "entries", { get() { getters++; throw new Error("password p7"); } });
  Object.defineProperty(pending, "size", { get() { getters++; throw new Error("token abc123"); } });
  const guarded = { method: { token: "abc123" }, type: "arbitrary-resource", sessionId: { secret: "sid=shortsecret" },
    generation: "2", frameId: null, loaderId: null, initiatorType: "password p7" };
  Object.defineProperty(guarded, "url", { get() { getters++; return "https://private.invalid/?token=smallsecret"; } });
  Object.defineProperty(guarded, "responseRecord", { get() { getters++; return { status: 200 }; } });
  pending.set("opaque-id", guarded);
  for (const url of ["http://127.0.0.1:12345/api/research/private/customer-secret", "http://127.0.0.1:12345/r/private-token",
    "http://127.0.0.1:12345/assets/app.js?token=smallsecret", "http://127.0.0.1:12345/#private-fragment",
    "http://p7:abc123@127.0.0.1:12345/", "https://private.invalid/secret", "blob:http://127.0.0.1/private-blob"]) {
    pending.set(url, { url, method: "GET", type: "Other", arbitrarySecret: "shortsecret", headers: { cookie: "sid=x" } });
  }
  const snapshot = pendingSnapshot(pending);
  assert.equal(getters, 0);
  assert.equal(snapshot.entries[0].method, "UNKNOWN");
  assert.equal(snapshot.entries[0].resourceType, "UNKNOWN");
  assert.equal(snapshot.entries[0].responsePresent, null);
  assert.ok(snapshot.entries.every((entry) => entry.pathSha256 === null));
  for (const secret of ["p7", "abc123", "sid=", "smallsecret", "shortsecret", "customer-secret", "private-token", "private-fragment", "private.invalid", "private-blob", "opaque-id"]) {
    assert.ok(!JSON.stringify(snapshot).includes(secret));
  }
  const page = {};
  Object.defineProperty(page, "inflight", { get() { getters++; return pending; } });
  assert.equal(inflightFailureSnapshot(page, { origin: "http://127.0.0.1:12345", assets: new Set(), ledger: [], now: 10000 }).state, "UNAVAILABLE");
  const response = {};
  Object.defineProperty(response, "status", { get() { getters++; return 200; } });
  const nested = pendingSnapshot(new Map([["nested", { responseRecord: response }]]));
  assert.equal(nested.entries[0].responsePresent, true);
  assert.equal(nested.entries[0].responseStatus, null);
  assert.equal(getters, 0);
});

test("pending snapshot caps entries/ledger/age and keeps future or malformed observations explicitly unknown", () => {
  const pending = new Map(Array.from({ length: 12 }, (_, i) => [String(i), { url: "http://127.0.0.1:12345/assets/app.js",
    method: "GET", type: "Script", observedAtMs: i === 0 ? 0 : i === 1 ? 600001 : "secret-age" }]));
  const snapshot = pendingSnapshot(pending, { now: 600000, ledger: Array(300).fill({ target: "/assets/app.js", method: "GET", status: 200 }) });
  assert.equal(snapshot.pendingCount, 12);
  assert.equal(snapshot.entries.length, 8);
  assert.equal(snapshot.truncated, true);
  assert.equal(snapshot.serverRecordsConsidered, 256);
  assert.equal(snapshot.serverRecordsTruncated, true);
  assert.equal(snapshot.entries[0].ageMsCapped, 300000);
  assert.equal(snapshot.entries[0].ageCapped, true);
  assert.equal(snapshot.entries[0].samePathServerResponseRecordCount, 256);
  assert.equal(snapshot.entries[1].ageMsCapped, null);
  assert.equal(snapshot.entries[2].ageMsCapped, null);
  assert.equal(pending.size, 12);
});

const source = "a".repeat(40), runner = "b".repeat(40), tree = "c".repeat(40), base = "d".repeat(40);
const binding = () => ({ sourceHead: source, sourceTree: tree, runnerHead: runner, runnerTree: tree,
  runnerParents: [base, source], preview: { sourceHead: source, sourceTree: tree, baseHead: base,
    executedCommit: runner, executedTree: tree, executedParents: [base, source], node: "v20.19.0" } });
test("equal-tree merge preserves distinct source/runner identities and exact marker binding", () => {
  assert.equal(validateSourceBinding(binding()).sourceAndRunnerTreeEqual, true);
  assert.throws(() => validateSourceBinding({ ...binding(), runnerTree: "e".repeat(40) }), /PREVIEW_SOURCE_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...binding(), sourceHead: "HEAD" }), /IDENTITY_INVALID/);
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, executedCommit: source } }), /PREVIEW_SOURCE_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, node: "v22.0.0" } }), /PREVIEW_SOURCE_MISMATCH/);
});

test("valid unequal-tree merge qualifies only the actual executed composition", () => {
  const input = binding(), composedTree = "e".repeat(40);
  input.runnerTree = composedTree; input.preview.executedTree = composedTree;
  const receipt = validateSourceBinding(input);
  assert.equal(receipt.sourceAndRunnerTreeEqual, false);
  assert.equal(receipt.evidenceScope, "EXECUTED_COMPOSITION_ONLY");
  assert.equal(receipt.evidenceCommit, runner);
  assert.equal(receipt.evidenceTree, composedTree);
  assert.equal(receipt.sourceTree, tree);
});

test("forged, missing or misordered actual/marker merge parents and wrong base fail closed", () => {
  for (const parents of [[source, base], [base], [base, source, "e".repeat(40)]]) {
    const input = binding(); input.runnerParents = parents; input.preview.executedParents = parents;
    assert.throws(() => validateSourceBinding(input), /RUNNER_GRAPH_MISMATCH/);
  }
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, executedParents: [source, base] } }), /PARENT_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, executedParents: undefined } }), /PARENT_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, baseHead: "e".repeat(40) } }), /RUNNER_GRAPH_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, baseHead: null } }), /BASE_IDENTITY_INVALID/);
});

test("direct checkout requires exact source commit/tree and its real parents", () => {
  const direct = { ...binding(), runnerHead: source, runnerParents: [base], preview: { ...binding().preview,
    executedCommit: source, executedParents: [base] } };
  assert.equal(validateSourceBinding(direct).checkoutKind, "DIRECT_SOURCE_CHECKOUT");
  assert.equal(validateSourceBinding({ ...direct, preview: { ...direct.preview, baseHead: null } }).baseHead, null);
  assert.throws(() => validateSourceBinding({ ...direct, preview: { ...direct.preview, baseHead: undefined } }), /BASE_IDENTITY_INVALID/);
  assert.throws(() => validateSourceBinding({ ...direct, runnerTree: "e".repeat(40),
    preview: { ...direct.preview, executedTree: "e".repeat(40) } }), /RUNNER_GRAPH_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...direct, preview: { ...direct.preview, executedCommit: runner } }), /PREVIEW_SOURCE_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...direct, preview: { ...direct.preview, executedParents: [source] } }), /PARENT_MISMATCH/);
});

const isolated = () => ({ uid: 1001, netNamespace: "net:[12]", parentNetNamespace: "net:[11]", interfaces: ["lo"],
  routes: [], effectiveCaps: "0000000000000000", noNewPrivs: "1" });
test("host network, privileged UID/capabilities, external interface or route and missing NNP fail closed", () => {
  assert.equal(validateIsolation(isolated()).uid, 1001);
  for (const change of [{ uid: 0 }, { netNamespace: "net:[11]" }, { parentNetNamespace: undefined }, { interfaces: ["lo", "eth0"] },
    { routes: [{ dst: "default" }] }, { effectiveCaps: "0000000000000001" }, { noNewPrivs: "0" }]) {
    assert.throws(() => validateIsolation({ ...isolated(), ...change }));
  }
});

test("font proof requires actual root/rem and flipped em media, never DPR or half viewport", () => {
  const sample = { width: 375, dpr: 1, scale: 1, root: 32, rem: 32, emMedia: false };
  assert.equal(validateFontCalibration(sample, { width: 375, font: 32 }).root, 32);
  for (const change of [{ root: 16 }, { rem: 16 }, { emMedia: true }, { dpr: 2 }, { scale: 2 }, { width: 187 }]) {
    assert.throws(() => validateFontCalibration({ ...sample, ...change }, { width: 375, font: 32 }), /FONT_CAPABILITY_NOT_EXECUTED/);
  }
});

test("network telemetry drops URL query/fragment/credentials and rejects malformed values", () => {
  assert.equal(safeNetworkUrl("/r/SAMPLE-CODE?token=hidden#hidden"), "/r/SAMPLE-CODE");
  assert.equal(safeNetworkUrl("https://name:secret@example.invalid/api?token=hidden"), "https://example.invalid/api");
});

test("configuration proof rejects shared profiles/processes, overlapping lifetimes and missing real close receipts", () => {
  // Pure negative controls only; these objects are NOT real browser evidence.
  const complete = () => CONFIGURATIONS.map((config, i) => ({ configuration: config.name, profile: `/owned/profile-${i}`,
    browserPid: 20 + i, browserStartTicks: String(100 + i), startedMs: i * 100 + 1, closedMs: i * 100 + 90,
    cleanup: { page: true, cdp: true, browserExit: true, profileRemoved: true } }));
  assert.equal(validateProfileReceipts(complete()), true);
  const reused = complete(); reused[1].profile = reused[0].profile;
  assert.throws(() => validateProfileReceipts(reused), /IDENTITY_REUSED_OR_MISSING/);
  const sameProcess = complete(); sameProcess[1].browserPid = sameProcess[0].browserPid; sameProcess[1].browserStartTicks = sameProcess[0].browserStartTicks;
  assert.throws(() => validateProfileReceipts(sameProcess), /IDENTITY_REUSED_OR_MISSING/);
  const overlap = complete(); overlap[1].startedMs = overlap[0].closedMs - 1;
  assert.throws(() => validateProfileReceipts(overlap), /LIFETIME_OVERLAP/);
  const unclosed = complete(); unclosed[2].cleanup.profileRemoved = false;
  assert.throws(() => validateProfileReceipts(unclosed), /CLEANUP_UNCONFIRMED/);
  assert.throws(() => validateProfileReceipts(complete().slice(0, 3)), /CONFIGURATION_INCOMPLETE/);
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "owned-preview-node-test-"));
  const html = '<!doctype html><html><head><title>Fixture template</title><meta property="og:title" content="stale"><link rel="canonical" href="https://xeniostechnology.com/"><script type="application/ld+json">{"@type":"Organization"}</script></head><body><div id="root"></div></body></html>';
  const script = "globalThis.__ownedStaticAsset=true;";
  writeFileSync(join(root, "index.html"), html);
  writeFileSync(join(root, "test.js"), script);
  const inventory = [{ path: "index.html", bytes: Buffer.byteLength(html), sha256: hash(html) },
    { path: "test.js", bytes: Buffer.byteLength(script), sha256: hash(script) }];
  return { root, inventory, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

test("actual loopback HTTP host serves neutral private recipient and an honest404 fixture without cookie or authority code", async () => {
  const f = fixture(), ledger = [];
  const host = await startOwnedPreview({ ...f, ledger });
  try {
    const recipient = await fetch(host.origin + "/r/SAMPLE-CODE");
    assert.equal(recipient.status, 200);
    assert.match(recipient.headers.get("x-robots-tag"), /noindex/);
    assert.equal(recipient.headers.get("referrer-policy"), "no-referrer");
    const html = await recipient.text();
    assert.doesNotMatch(html, /rel="canonical"|property="og:title"|application\/ld\+json/);
    const denied = await fetch(host.origin + "/api/research/referral/resolve", { method: "POST", headers: {
      Origin: host.origin, "Content-Type": "application/json",
    }, body: JSON.stringify({ code: "SAMPLE-CODE" }) });
    assert.equal(denied.status, 404);
    assert.equal(denied.headers.get("set-cookie"), null);
    assert.deepEqual(await denied.json(), UNAVAILABLE_FIXTURE);
    assert.equal(host.counters.resolve404, 1);
    for (const path of ["/r/SAMPLE-CODE/extra", "/api/research/referral/capture"]) {
      const response = await fetch(host.origin + path, { method: "POST" });
      assert.equal(response.status, 404);
    }
    assert.equal(host.counters.resolve404, 1);
    assert.equal(ledger.filter((r) => r.kind === "STATIC_404_UNAVAILABLE_FIXTURE").length, 1);
  } finally { await host.close(); f.dispose(); }
});

test("actual readonly bootstrap fixtures keep gate locked, provider/Auth disabled and Business config503 without cookies or nonce", async () => {
  const f = fixture(), ledger = [], host = await startOwnedPreview({ ...f, ledger });
  try {
    for (const [path, expected] of Object.entries(READ_ONLY_GET_FIXTURES)) {
      const response = await fetch(host.origin + path);
      assert.equal(response.status, expected.status);
      assert.deepEqual(await response.json(), expected.body);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.match(response.headers.get("x-robots-tag"), /noindex/);
      assert.equal(host.counters.readOnlyGET[path], 1);
    }
    assert.equal(READ_ONLY_GET_FIXTURES["/api/config"].body.supabaseUrl, null);
    assert.equal(READ_ONLY_GET_FIXTURES["/api/config"].body.supabaseAnonKey, null);
    assert.equal(READ_ONLY_GET_FIXTURES["/api/research/me"].body.authed, false);
    assert.deepEqual(READ_ONLY_GET_FIXTURES["/api/research/business-inquiries/config"].body, { enabled: false });
    for (const path of Object.keys(READ_ONLY_GET_FIXTURES)) {
      assert.equal((await fetch(host.origin + path, { headers: { Origin: "https://example.invalid" } })).status, 403);
      assert.equal((await fetch(host.origin + path, { method: "POST", body: "{}" })).status, 404);
      assert.equal(host.counters.readOnlyGET[path], 1);
    }
    assert.equal((await fetch(host.origin + "/api/research/me", { headers: { Authorization: "Bearer synthetic-only" } })).status, 403);
    assert.equal(ledger.filter((r) => r.kind === "STATIC_READONLY_UNAVAILABLE_FIXTURE").length, 3);
    assert.equal(host.counters.resolve404, 0);
  } finally { await host.close(); f.dispose(); }
});

test("Wholesale raw document is noindex/read-only; aliases, intake writes and near misses remain closed", async () => {
  const f = fixture(), host = await startOwnedPreview({ ...f, ledger: [] });
  try {
    const response = await fetch(host.origin + WHOLESALE_ROUTE);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-robots-tag"), /noindex/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.doesNotMatch(await response.text(), /rel="canonical"/);
    for (const path of ["/research/wholesale?ref=synthetic", WHOLESALE_ROUTE + "/private", "/api/research/business-inquiries"]) {
      assert.equal((await fetch(host.origin + path)).status, 404);
      assert.equal((await fetch(host.origin + path, { method: "POST", body: "{}" })).status, 404);
    }
    assert.equal(Object.values(host.counters.readOnlyGET).reduce((sum, count) => sum + count, 0), 0);
    assert.equal(host.counters.resolve404, 0);
  } finally { await host.close(); f.dispose(); }
});

test("credential-bearing/wrong-origin/foreign-selector requests are refused and cannot become referral success", async () => {
  const f = fixture(), host = await startOwnedPreview({ ...f, ledger: [] });
  try {
    assert.equal((await fetch(host.origin + "/", { headers: { Cookie: "synthetic=1" } })).status, 403);
    const send = (code, origin) => fetch(host.origin + "/api/research/referral/resolve", { method: "POST", headers: {
      Origin: origin, "Content-Type": "application/json",
    }, body: JSON.stringify({ code }) });
    assert.equal((await send("SAMPLE-CODE", "https://example.invalid")).status, 403);
    assert.equal((await send("NOT-A-REAL-CODE", host.origin)).status, 400);
    assert.equal(host.counters.resolve404, 0);
  } finally { await host.close(); f.dispose(); }
});

test("changed asset bytes fail integrity rather than being served under old provenance", async () => {
  const f = fixture(), host = await startOwnedPreview({ ...f, ledger: [] });
  try {
    assert.equal((await fetch(host.origin + "/test.js")).status, 200);
    writeFileSync(join(f.root, "test.js"), "changed");
    assert.equal((await fetch(host.origin + "/test.js")).status, 500);
    assert.equal(host.counters.unexpected, 1);
  } finally { await host.close(); f.dispose(); }
});

test("snapshot source refuses symlinks before inventory traversal", () => {
  const f = fixture();
  try {
    assertInventorySafe(f.root);
    symlinkSync(join(f.root, "test.js"), join(f.root, "link.js"));
    assert.throws(() => assertInventorySafe(f.root), /SYMLINK_REFUSED/);
  } finally { f.dispose(); }
});

test("launch diagnostics emit fixed observed codes without raw stderr, URLs or synthetic secrets", () => {
  const codes = chromeLaunchDiagnosticCodes("FATAL: No usable sandbox! token=synthetic-secret https://name:secret@example.invalid/private\nFailed to connect to the bus");
  assert.deepEqual(codes, ["SANDBOX_REJECTION_REPORTED", "DBUS_DIAGNOSTIC_PRESENT"]);
  assert.doesNotMatch(JSON.stringify(codes), /synthetic-secret|example\.invalid|name:secret/);
});

test("startup uses at most45seconds of the same remaining global budget and preserves cleanup reserve", () => {
  assert.equal(ownedStartupBudget(300000, 1000), 45000);
  assert.equal(ownedStartupBudget(70000, 30000), 13500);
  assert.equal(ownedStartupBudget(70000, 44000), 0);
  assert.equal(ownedStartupBudget(70000, 70000), 0);
});

test("private diagnostic excerpts redact URLs, debug/credential values, process metadata and cap content", () => {
  const input = [
    "Failure at https://name:password@example.invalid/private?token=hidden ws://127.0.0.1:123/devtools/browser/opaque-id",
    "debug_token=hidden-small sessionKey='hidden-session' Authorization: Bearer hidden-access user@example.invalid",
    "MY_PRIVATE_VALUE=hidden-env raw environment dump",
    "argv --user-data-dir /home/runner/private-directory hidden-argument",
    "debug /devtools/browser/another-debug-id data:secret-payload file:///home/secret-token",
    "Long " + "q".repeat(4000),
    "seventh line is outside the diagnostic cap",
  ].join("\n");
  const excerpt = chromeStartupExcerpt(input);
  assert.equal(excerpt.length, 6);
  assert.ok(excerpt.every((line) => line.length <= 160 && /^[\x20-\x7e]*$/.test(line)));
  assert.ok(Buffer.byteLength(JSON.stringify(excerpt)) < 2048);
  assert.doesNotMatch(JSON.stringify(excerpt), /example\.invalid|hidden-|hidden-small|opaque-id|another-debug-id|secret-payload|hidden-env|hidden-argument|private-directory|seventh/);
});

test("serialized diagnostic excerpts omit entire whitespace credential/cookie/session lines, including short values", () => {
  for (const [line, shortValue] of [["password p7", "p7"], ["token abc123", "abc123"], ["cookie sid=x", "sid=x"],
    ["session s4", "s4"], ["credential q9", "q9"], ["api key k8", "k8"], ["refreshToken rt4", "rt4"],
    ["AUTH_TOKEN t5", "t5"], ["sid tiny7", "tiny7"]]) {
    const excerpt = chromeStartupExcerpt(line);
    assert.deepEqual(excerpt, ["[OMITTED_SENSITIVE_DIAGNOSTIC]"]);
    assert.equal(JSON.stringify(excerpt).includes(shortValue), false, line);
  }
  assert.deepEqual(chromeStartupExcerpt("ordinary diagnostic (status 2)\ntoken abc123\nnext ordinary diagnostic"),
    ["ordinary diagnostic (status 2)", "[OMITTED_SENSITIVE_DIAGNOSTIC]", "next ordinary diagnostic"]);
});

test("signal exit ends readiness immediately while an absent optional signal field preserves old callers", async () => {
  let waited = 0;
  const signaled = await waitForDevToolsPort({ child: { exitCode: null, signalCode: "SIGTRAP" }, portFile: "unused",
    timeoutMs: 100, now: () => 0, wait: async () => { waited++; },
    fileExists: () => { throw new Error("READ_AFTER_OBSERVED_SIGNAL_EXIT"); } });
  assert.equal(signaled, null);
  assert.equal(waited, 0);
  const oldShape = await waitForDevToolsPort({ child: { exitCode: null }, portFile: "unused",
    timeoutMs: 100, now: () => 0, wait: async () => {}, fileExists: () => true, readText: () => "12345\n/devtools/browser/synthetic" });
  assert.equal(oldShape, 12345);
});

test("real failed child is handed off before readiness rejects, with bounded diagnostics and owned cleanup", async () => {
  // Deliberate fake executable, NOT Chromium or a browser-capability result.
  const root = mkdtempSync(join(tmpdir(), "owned-launch-control-"));
  const fake = join(root, "fake-browser");
  const payload = "FATAL: No usable sandbox! synthetic-secret https://name:secret@example.invalid/private " + "x".repeat(10000);
  writeFileSync(fake, `#!/bin/sh\nprintf '%s\\n' '${payload}' >&2\nexit 42\n`, { mode: 0o700 });
  let owned;
  const pending = launchChromium({ chromePath: fake, timeoutMs: 2500, onSpawned(handle) { owned = handle; } });
  try {
    assert.ok(owned?.process.pid, "synchronous lifecycle custody exists before awaiting readiness");
    assert.ok(existsSync(owned.userDataDir));
    await assert.rejects(pending, /CHROME_EXIT_BEFORE_DEVTOOLS/);
    const diagnostic = owned.diagnostics();
    assert.equal(diagnostic.exitCode, 42);
    assert.equal(diagnostic.portPublished, false);
    assert.equal(diagnostic.stderrBytes, Buffer.byteLength(payload + "\n"));
    assert.equal(diagnostic.capturedStderrBytes, 8192);
    assert.equal(diagnostic.stderrTruncated, true);
    assert.equal(diagnostic.stderrSha256, hash(payload + "\n"));
    assert.ok(diagnostic.observedDiagnosticCodes.includes("SANDBOX_REJECTION_REPORTED"));
    assert.doesNotMatch(JSON.stringify(diagnostic), /synthetic-secret|example\.invalid|name:secret/);
  } finally {
    void pending.catch(() => {});
    if (owned) { await owned.close(); assert.equal(existsSync(owned.userDataDir), false); }
    rmSync(root, { recursive: true, force: true });
  }
});

test("one actual synthetic process may publish delayed readiness without a relaunch and exposes bounded proc state", async () => {
  // This process is an HTTP fixture, NOT Chromium or actual browser evidence.
  const root = mkdtempSync(join(tmpdir(), "owned-delayed-control-"));
  const fake = join(root, "fake-browser");
  writeFileSync(fake, `#!${process.execPath}
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const profile = process.argv.find(x => x.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
const server = http.createServer((req, res) => res.end(JSON.stringify({ Browser:'HeadlessChrome/synthetic',
  'Protocol-Version':'1.3', webSocketDebuggerUrl:'ws://127.0.0.1:'+server.address().port+'/devtools/browser/synthetic' })));
server.listen(0,'127.0.0.1',()=>setTimeout(()=>fs.writeFileSync(path.join(profile,'DevToolsActivePort'),
  server.address().port+'\\n/devtools/browser/synthetic\\n'),250));
`, { mode: 0o700 });
  let owned, spawned = 0;
  try {
    const ready = await launchChromium({ chromePath: fake, timeoutMs: 2500, onSpawned(handle) { owned = handle; spawned++; } });
    assert.equal(spawned, 1);
    assert.equal(ready.process.pid, owned.process.pid);
    const diagnostic = ready.diagnostics();
    assert.equal(diagnostic.outcome, "READY");
    assert.ok(diagnostic.elapsedMs >= 250);
    assert.ok(diagnostic.startupObservations.length > 0 && diagnostic.startupObservations.length <= 8);
    assert.ok(diagnostic.startupObservations.some((o) => o.available && /^\d+$/.test(o.startTicks)));
    assert.ok(diagnostic.startupObservations.some((o) => o.label === "readiness_result_before_cleanup" && o.exitCode === null && o.signalCode === null));
  } finally {
    if (owned) { await owned.close(); assert.equal(existsSync(owned.userDataDir), false); }
    rmSync(root, { recursive: true, force: true });
  }
});

function outerEvidenceControl(observed) {
  const root = mkdtempSync(join(tmpdir(), "owned-outer-control-"));
  const artifact = join(root, "xenios-owned-browser.control");
  mkdirSync(join(artifact, "home"), { recursive: true });
  mkdirSync(join(artifact, "tmp"));
  writeFileSync(join(artifact, "tmp", "synthetic-cache"), "synthetic");
  const shell = fileURLToPath(new URL("./owned-runner-browser-qa.sh", import.meta.url));
  const code = `source "$1"
set -Eeuo pipefail
trap 'printf ERR_TRAP_FIRED >&2; exit 99' ERR
runner_temp="$2"
artifact_dir="$runner_temp/xenios-owned-browser.control"
started_ms=$(date +%s%3N)
parent_net=$(readlink /proc/self/ns/net)
isolated_started=true; isolated_command_exited=false; controller_status=null
trap 'finish_owned_evidence "$?"' EXIT
${observed ? "capture_isolated_exit /bin/sh -c 'exit 17'\nisolated_command_exited=true\nexit 0" : "exit 1"}
`;
  const child = spawnSync("/bin/bash", ["-c", code, "owned-outer-test", shell, root], {
    encoding: "utf8", timeout: 5000, env: { PATH: "/usr/bin:/bin" },
  });
  return { root, artifact, child, receipt: JSON.parse(readFileSync(join(artifact, "namespace-result.json"), "utf8")) };
}

test("actual wrapper conditional survives nonzero with ERR enabled and writes observed removal/status", () => {
  const control = outerEvidenceControl(true);
  try {
    assert.equal(control.child.status, 1);
    assert.doesNotMatch(control.child.stderr, /ERR_TRAP_FIRED/);
    assert.equal(control.receipt.exitCode, 17);
    assert.equal(control.receipt.isolatedCommandExited, true);
    assert.equal(control.receipt.temporaryDirsRemovalAttempted, true);
    assert.equal(control.receipt.temporaryDirsRemoved, true);
    assert.equal(existsSync(join(control.artifact, "tmp")), false);
    assert.equal(existsSync(join(control.artifact, "home")), false);
  } finally { rmSync(control.root, { recursive: true, force: true }); }
});

test("wrapper never deletes or claims cleanup when launched command exit was not observed", () => {
  const control = outerEvidenceControl(false);
  try {
    assert.equal(control.child.status, 1);
    assert.equal(control.receipt.exitCode, null);
    assert.equal(control.receipt.isolatedCommandExited, false);
    assert.equal(control.receipt.temporaryDirsRemovalAttempted, false);
    assert.equal(control.receipt.temporaryDirsRemoved, false);
    assert.equal(existsSync(join(control.artifact, "tmp", "synthetic-cache")), true);
  } finally { rmSync(control.root, { recursive: true, force: true }); }
});

test("entry scenario is a closed selection; omitted selection preserves the original public contract", () => {
  const original = scenarioDefinition();
  assert.equal(original.name, PUBLIC_SCENARIO);
  assert.equal(original.routes, ROUTES); assert.equal(original.configurations, CONFIGURATIONS);
  assert.equal(original.fixtures, READ_ONLY_GET_FIXTURES); assert.equal(original.resolveCount, 5);
  assert.equal(original.captureCount, 12);
  const entry = scenarioDefinition(PREMIUM_ENTRY_SCENARIO);
  assert.deepEqual(entry.routes, ["/earlyaccess"]);
  assert.equal(entry.resolveCount, 0); assert.equal(entry.captureCount, 6);
  assert.equal(entry.configurations, PREMIUM_ENTRY_CONFIGURATIONS);
  for (const value of ["", null, {}, "premium-entry", "/earlyaccess", "https://example.invalid", "__proto__"])
    assert.throws(() => scenarioDefinition(value), { message: "SCENARIO_INVALID" });
});

test("premium request admission rejects every mutation and route/query alias even when inventoried", () => {
  const inventory = new Map([...assets, ["earlyaccess/", {}], ["earlyaccess-other", {}],
    ["research/product-media/not-approved.webp", {}], [PREMIUM_ARTWORK.path.slice(1), {}]]);
  const classify = (method, path) => classifyRequest(method, path, inventory, PREMIUM_ENTRY_SCENARIO);
  assert.deepEqual(classify("GET", "/earlyaccess"), { kind: "document" });
  assert.deepEqual(classify("HEAD", "/earlyaccess"), { kind: "document" });
  assert.equal(classify("GET", PREMIUM_ARTWORK.path).kind, "asset");
  assert.equal(classifyRequest("GET", PREMIUM_ARTWORK.path, new Map(), PREMIUM_ENTRY_SCENARIO).kind, "refused");
  assert.equal(classifyRequest("GET", PREMIUM_ARTWORK.path, inventory).kind, "refused");
  for (const method of ["POST", "PATCH", "PUT", "DELETE", "OPTIONS"])
    for (const path of ["/earlyaccess", "/api/research/referral/resolve", "/api/research/early-access/unlock",
      "/api/research/early-access/logout", "/api/research/early-access/agreements/accept",
      "/api/research/early-access/request-intents/admission", "/api/research/early-access/request-intents"])
      assert.equal(classify(method, path).kind, "refused", method + " " + path);
  for (const path of ["/", "/r/SAMPLE-CODE", "/research/organizations", "/earlyaccess/", "/Earlyaccess",
    "/earlyaccess-other", "/earlyaccess?category=clinical", "/earlyaccess#intake", "/%65arlyaccess",
    "/earlyaccess//", "/earlyaccess/../", "/api/research/early-access/session?accepted=true",
    "/api/research/early-access/agreements", "/research/product-media/not-approved.webp"])
    assert.equal(classify("GET", path).kind, "refused", path);
  assert.equal(classifyRequest("POST", "/api/research/referral/resolve", inventory).kind, "resolve_fixture");
});

test("network observers permit no premium POST and preserve the existing public synthetic resolve only", () => {
  const origin = "http://127.0.0.1:38123", url = new URL(origin + "/api/research/referral/resolve");
  assert.equal(observedMethodAllowed("POST", url, origin), true);
  assert.equal(observedMethodAllowed("POST", url, origin, PREMIUM_ENTRY_SCENARIO), false);
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    assert.equal(observedMethodAllowed(method, new URL(origin + "/earlyaccess"), origin, PREMIUM_ENTRY_SCENARIO), false);
  assert.equal(observedMethodAllowed("GET", new URL("https://example.invalid/earlyaccess"), origin, PREMIUM_ENTRY_SCENARIO), false);
});

async function withPremiumPreview(operation) {
  const root = mkdtempSync(join(tmpdir(), "owned-premium-control-"));
  const template = '<!doctype html><html><head><title>Static test template</title></head><body>Not an executed app</body></html>';
  writeFileSync(join(root, "index.html"), template);
  const ledger = [];
  let preview;
  try {
    preview = await startOwnedPreview({ root, inventory: [{ path: "index.html", bytes: Buffer.byteLength(template), sha256: hash(template) }],
      ledger, scenario: PREMIUM_ENTRY_SCENARIO });
    await operation(preview, ledger);
  } finally {
    if (preview) await preview.close();
    rmSync(root, { recursive: true, force: true });
  }
}

test("actual premium static server serves four inert GETs and a private entry document without cookies", async () => {
  await withPremiumPreview(async (preview) => {
    for (const [path, expected] of Object.entries(PREMIUM_ENTRY_GET_FIXTURES)) {
      const response = await fetch(preview.origin + path, { redirect: "error" });
      assert.equal(response.status, expected.status);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = await response.json();
      assert.deepEqual(body, expected.body);
      assert.notEqual(body.authenticated, true); assert.notEqual(body.openAccess, true);
      assert.notEqual(body.accepted, true); assert.notEqual(body.admitted, true);
      assert.equal(preview.counters.readOnlyGET[path], 1);
    }
    const response = await fetch(preview.origin + "/earlyaccess", { redirect: "error" });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-robots-tag"), /noindex/u);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("set-cookie"), null);
    await response.text();
    assert.equal(preview.counters.resolve404, 0);
    assert.equal(preview.counters.unexpected, 0);
  });
});

test("actual premium server refuses unlock, assent, admission, request, resolve and extra reads without effects", async () => {
  await withPremiumPreview(async (preview, ledger) => {
    for (const path of ["/api/research/early-access/unlock", "/api/research/early-access/agreements/accept",
      "/api/research/early-access/request-intents/admission", "/api/research/early-access/request-intents",
      "/api/research/referral/resolve"]) {
      const response = await fetch(preview.origin + path, { method: "POST", redirect: "error",
        headers: { origin: preview.origin, "content-type": "application/json" }, body: '{"code":"SAMPLE-CODE"}' });
      assert.equal(response.status, 404); assert.equal(response.headers.get("set-cookie"), null);
      await response.text();
    }
    for (const path of ["/earlyaccess?category=clinical", "/earlyaccess/", "/api/research/early-access/agreements",
      "/api/research/early-access/request-intents/catalog", "/api/research/early-access/session?admitted=true"]) {
      const response = await fetch(preview.origin + path, { redirect: "error" });
      assert.equal(response.status, 404); await response.text();
    }
    assert.equal(preview.counters.resolve404, 0);
    assert.equal(Object.values(preview.counters.readOnlyGET).reduce((sum, n) => sum + n, 0), 0);
    assert.ok(ledger.every((record) => record.kind === "off_contract_refused"));
  });
});

test("premium actual GET fixture rejects credentials and cross-origin fetch metadata", async () => {
  await withPremiumPreview(async (preview) => {
    for (const headers of [{ cookie: "synthetic=not-authority" }, { authorization: "Bearer synthetic-not-authority" },
      { cookie: "" }, { authorization: "" },
      { origin: "https://example.invalid" }, { "sec-fetch-site": "cross-site" }]) {
      const response = await fetch(preview.origin + "/api/research/early-access/session", { headers, redirect: "error" });
      assert.equal(response.status, 403); assert.equal(response.headers.get("set-cookie"), null); await response.text();
    }
    assert.equal(preview.counters.readOnlyGET["/api/research/early-access/session"], 0);
    assert.equal(preview.counters.credentialAttempts, 4); assert.equal(preview.counters.refused, 2);
  });
});

test("entry census requires actual closed reads and zero mutation/credential/refusal counters", () => {
  const counts = { "/api/config": 1, "/api/research/me": 6, "/api/research/early-access/session": 6,
    "/api/research/early-access/assisted-orders/config": 6 };
  const counters = { readOnlyGET: counts, resolve404: 0, refused: 0, unexpected: 0, credentialAttempts: 0 };
  assertScenarioFixtureCensus(counters, PREMIUM_ENTRY_SCENARIO);
  for (const name of ["resolve404", "refused", "unexpected", "credentialAttempts"])
    assert.throws(() => assertScenarioFixtureCensus({ ...counters, [name]: 1 }, PREMIUM_ENTRY_SCENARIO),
      { message: "PREVIEW_REQUEST_CONTRACT_FAILED" });
  for (const count of [0, 13, NaN, "6"])
    assert.throws(() => assertScenarioFixtureCensus({ ...counters, readOnlyGET: { ...counts,
      "/api/research/early-access/session": count } }, PREMIUM_ENTRY_SCENARIO), { message: "READONLY_BOOTSTRAP_CENSUS_FAILED" });
});

test("entry lifetime visits only the fixed entry using its one owned page", async () => {
  const page = {}, calls = [];
  await visitConfigurationPage({ scenario: PREMIUM_ENTRY_SCENARIO,
    create: async () => { calls.push("create"); return page; }, own: (actual) => { assert.equal(actual, page); calls.push("own"); },
    configure: async (actual) => { assert.equal(actual, page); calls.push("configure"); },
    visit: async (actual, route) => { assert.equal(actual, page); calls.push(route); } });
  assert.deepEqual(calls, ["create", "own", "configure", "/earlyaccess"]);
});

test("premium exact six profiles require distinct completed lifetimes; the public four and absolute budget remain separate", () => {
  assert.deepEqual(PREMIUM_ENTRY_CONFIGURATIONS.map(({ name, width, height, font }) => [name, width, height, font]), [
    ["phone320", 320, 844, 16], ["phone375", 375, 844, 16], ["phone390", 390, 844, 16],
    ["tablet768", 768, 1024, 16], ["desktop1440", 1440, 900, 16], ["phone320-200", 320, 844, 32],
  ]);
  const profiles = PREMIUM_ENTRY_CONFIGURATIONS.map((config, i) => ({ configuration: config.name,
    profile: `/synthetic-profile-${i}`, browserPid: 100 + i, browserStartTicks: String(200 + i),
    startedMs: i * 2000, closedMs: i * 2000 + 1000,
    cleanup: { page: true, cdp: true, browserExit: true, profileRemoved: true } }));
  assert.equal(validateProfileReceipts(profiles, PREMIUM_ENTRY_SCENARIO), true);
  assert.throws(() => validateProfileReceipts(profiles.slice(0, 4), PREMIUM_ENTRY_SCENARIO), { message: "PROFILE_CONFIGURATION_INCOMPLETE" });
  assert.throws(() => validateProfileReceipts(profiles), { message: "PROFILE_CONFIGURATION_INCOMPLETE" });
  assert.throws(() => validateProfileReceipts(profiles.map((p, i) => i === 5 ? { ...p, profile: profiles[0].profile } : p), PREMIUM_ENTRY_SCENARIO),
    { message: "PROFILE_IDENTITY_REUSED_OR_MISSING" });
  assert.throws(() => validateProfileReceipts(profiles.map((p, i) => i === 5 ? { ...p, cleanup: { ...p.cleanup, profileRemoved: false } } : p), PREMIUM_ENTRY_SCENARIO),
    { message: "PROFILE_CLEANUP_UNCONFIRMED" });
  // Same unchanged allowance: a final profile cannot borrow the cleanup tail.
  assert.equal(ownedStartupBudget(300000, 280000), 0);
  assert.equal(ownedStartupBudget(300000, 200000), 45000);
  assert.equal(failureObservationBudget(300000, 280000, 750), 0);
  assert.equal(CONFIGURATIONS.length, 4); assert.equal(scenarioDefinition().captureCount, 12);
});

function validPremiumSample() {
  const rendered = { rendered: true, inViewport: true };
  return { atExactEntry: true, rootCount: 1, heading: { ...rendered, text: PREMIUM_ENTRY_EXPECTED.heading },
    primary: { ...rendered, text: "Explore products", href: "#xenios-ea-request-start" },
    secondary: { ...rendered, text: "Book the team (opens in a new tab)", href: PREMIUM_CONTACT_HREFS[2] },
    secondaryTarget: "_blank", secondaryRel: "noopener noreferrer", gate: { ...rendered, text: PREMIUM_ENTRY_EXPECTED.unavailable },
    privateFields: 0, privateMounts: 0, contacts: PREMIUM_CONTACT_HREFS.map((href) => ({ ...rendered, href })),
    entranceArtworkCount: 0, entranceArtworkCaptionCount: 0, conversationGridCount: 0 };
}

test("entry semantic checks reject missing/hidden hero, misleading gate, changed destinations and private mounts", () => {
  const sample = validPremiumSample();
  assert.ok(premiumEntryAssertions(sample).every((entry) => entry.passed));
  for (const change of [{ heading: { ...sample.heading, rendered: false } }, { rootCount: 0 },
    { heading: { ...sample.heading, text: "Explore a different catalog." } }, { gate: { ...sample.gate, text: "You are admitted" } },
    { privateFields: 1 }, { privateMounts: 1 }, { primary: { ...sample.primary, href: "/checkout" } },
    { secondaryRel: "noopener" }, { contacts: sample.contacts.slice(1) }, { atExactEntry: false }])
    assert.ok(premiumEntryAssertions({ ...sample, ...change }).some((entry) => !entry.passed), JSON.stringify(change));
});

test("entry absence checks refuse artwork, captions and conversation-grid remnants rather than requiring a promotion", () => {
  const sample = validPremiumSample();
  assert.ok(premiumEntryAssertions(sample).every((entry) => entry.passed));
  for (const field of ["entranceArtworkCount", "entranceArtworkCaptionCount", "conversationGridCount"])
    for (const value of [1, 2, -1, null, undefined, NaN, "0"])
      assert.equal(premiumEntryAssertions({ ...sample, [field]: value })
        .find((entry) => entry.name === (field === "conversationGridCount"
          ? "premium_entrance_conversation_grid_absent" : "premium_entrance_artwork_and_captions_absent")).passed,
      false, `${field}:${String(value)}`);
});

test("actual entry collector refuses hidden entrance remnants while retaining a catalog BPC image and caption", async () => {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM('<main data-testid="quick-order-request-only"><section class="xenios-premium-hero"><h2>Factual introduction</h2></section>'
    + '<section class="xenios-order-cards"><article><h2>BPC-157</h2><figure><img src="/research/product-media/bpc-157-xenios-10mg-render.webp">'
    + '<figcaption>Packaging design shown. Current packaging may differ.</figcaption></figure></article></section></main>',
  { url: "http://127.0.0.1/earlyaccess", runScripts: "outside-only" });
  try {
    const { window } = dom, doc = window.document, root = doc.querySelector("main"), hero = root.querySelector(".xenios-premium-hero");
    const read = () => window.eval(PREMIUM_ENTRY_VIEW_SOURCE);
    let sample = read();
    assert.equal(sample.entranceArtworkCount, 0); assert.equal(sample.entranceArtworkCaptionCount, 0);
    assert.equal(sample.conversationGridCount, 0);
    const artwork = doc.createElement("div"); artwork.className = "xenios-premium-hero-art"; artwork.hidden = true;
    hero.append(artwork);
    sample = read(); assert.equal(sample.entranceArtworkCount, 1);
    assert.equal(premiumEntryAssertions({ ...validPremiumSample(), ...sample })
      .find((entry) => entry.name === "premium_entrance_artwork_and_captions_absent").passed, false);
    artwork.remove();
    const caption = doc.createElement("p"); caption.textContent = "Artwork preview. Check the exact listing."; caption.hidden = true;
    hero.append(caption); sample = read(); assert.equal(sample.entranceArtworkCaptionCount, 1);
    caption.remove();
    const interests = doc.createElement("section"); interests.setAttribute("aria-label", "Start a conversation by interest"); interests.hidden = true;
    root.append(interests); sample = read(); assert.equal(sample.conversationGridCount, 1);
    interests.remove();
    sample = read();
    assert.equal(sample.entranceArtworkCount, 0); assert.equal(sample.entranceArtworkCaptionCount, 0);
    assert.equal(sample.conversationGridCount, 0);
    assert.equal(doc.querySelectorAll(".xenios-order-cards article img").length, 1);
  } finally { dom.window.close(); }
});

function premiumKeyboardControl(failure = null, noPrimary = false) {
  const events = [], order = ["first", "second", "third"], sample = () => active === null
    ? { body: true } : { body: false, identity: active, indicator: true, inViewport: true,
      ...(failure && tabs === 2 ? failure : {}) };
  let active = null, tabs = 0;
  return { events, page: {
    evaluate: async (source) => {
      if (source === FOCUS_BASELINE_SOURCE) { events.push("baseline"); return { tabbableIdentities: order }; }
      if (source === PREMIUM_PRIMARY_FOCUSED_SOURCE) return !noPrimary && active === "third";
      assert.equal(source, FOCUS_PROBE_SOURCE); events.push("probe"); return sample();
    },
    pressTab: async ({ shift }) => {
      assert.deepEqual(events.slice(-2), ["baseline", "probe"]);
      events.push(shift ? "ShiftTab" : "Tab"); tabs++;
      active = premiumTabSuccessor(order, active, shift);
    },
    send: async () => { assert.fail("ENTRY_KEYBOARD_MUST_NOT_ACTIVATE_OR_DISPATCH_A_COMMAND"); },
  } };
}

test("entry keyboard helper uses only four native Tabs with current order/baseline and no activation", async () => {
  const control = premiumKeyboardControl(), progress = {};
  let focusCaptures = 0;
  const proof = await premiumEntryKeyboardProof(control.page, (work) => work, progress, async () => {
    focusCaptures++;
    assert.equal(progress.steps.at(-1).actual.identity, "third");
    assert.equal(progress.steps.at(-1).actualPrimaryLink, true);
    assert.equal(control.events.includes("ShiftTab"), false);
    return { file: "synthetic-focus.png", sha256: "0".repeat(64) };
  });
  assert.deepEqual(control.events.filter((entry) => ["Tab", "ShiftTab"].includes(entry)), ["Tab", "Tab", "Tab", "ShiftTab"]);
  assert.deepEqual(proof.steps.map((step) => step.actual.identity), ["first", "second", "third", "second"]);
  assert.equal(proof.activationExecuted, false); assert.equal(proof.destinationsVisited, false);
  assert.equal(proof.primaryReached, true);
  assert.equal(focusCaptures, 1); assert.equal(proof.primaryFocusScreenshot.file, "synthetic-focus.png");
  assert.equal(proof.authPolicyIntakeSubmitted, false); assert.equal(proof.state, "NATIVE_TAB_ONLY_OBSERVED");
});

test("entry keyboard rejects BODY, invisible/wrong order and keeps partial failure evidence without extra inputs", async () => {
  for (const failure of [{ body: true }, { identity: "foreign" }, { indicator: false }, { inViewport: false }]) {
    const control = premiumKeyboardControl(failure), progress = {};
    await assert.rejects(premiumEntryKeyboardProof(control.page, (work) => work, progress),
      { message: "PREMIUM_KEYBOARD_FOCUS_NOT_VISIBLE_OR_LOGICAL" });
    assert.equal(progress.state, "INCOMPLETE"); assert.equal(progress.steps.length, 2);
    assert.deepEqual(progress.steps[1].actual, { body: false, identity: "second", indicator: true, inViewport: true, ...failure });
    assert.equal(control.events.filter((entry) => entry === "Tab").length, 2);
  }
  for (const order of [[], ["one", "one"], Array.from({ length: 129 }, (_, i) => String(i))])
    assert.throws(() => premiumTabSuccessor(order, null), { message: "PREMIUM_KEYBOARD_ORDER_UNSUPPORTED" });
  assert.throws(() => premiumTabSuccessor(["one"], "foreign"), { message: "PREMIUM_KEYBOARD_ACTIVE_NOT_IN_ORDER" });
  const inaccessible = premiumKeyboardControl(null, true), progress = {};
  await assert.rejects(premiumEntryKeyboardProof(inaccessible.page, (work) => work, progress),
    { message: "PREMIUM_PRIMARY_NOT_KEYBOARD_REACHABLE" });
  assert.equal(progress.steps.length, 32); assert.equal(progress.state, "INCOMPLETE");
});

test("actual shell scenario validator accepts only two fixed modes without starting its namespace", () => {
  const shell = fileURLToPath(new URL("./owned-runner-browser-qa.sh", import.meta.url));
  for (const [value, expected] of [[PUBLIC_SCENARIO, 0], [PREMIUM_ENTRY_SCENARIO, 0], ["", 1], ["/earlyaccess", 1],
    ["https://example.invalid", 1], ["premium-entry-unavailable extra", 1]]) {
    const child = spawnSync("/bin/bash", ["-c", 'source "$1"; validate_owned_scenario "$2"', "owned-scenario-test", shell, value],
      { encoding: "utf8", timeout: 2000, env: { PATH: "/usr/bin:/bin" } });
    assert.equal(child.status, expected); assert.equal(child.stdout, ""); assert.equal(child.stderr, "");
  }
});

// Synthetic display controls are fixtures/transport/orchestration, never actual
// guest authentication, assent, contact, request or browser-geometry evidence.
const displayRepo = fileURLToPath(new URL("../../", import.meta.url));
function displayModels() {
  const source = (name) => JSON.parse(readFileSync(join(displayRepo, "server/research/master-offerings/data", name), "utf8"));
  return { catalog: source("member-safe-master-offerings.generated.json"), bindings: source("master-offering-bindings.generated.json"),
    media: source("reviewed-public-media.json"), content: source("reviewed-public-content.json"), hcg: displayHcg };
}

test("synthetic display is explicit, has only six reviewed profiles, and does not replace either previous mode", () => {
  const mode = scenarioDefinition(DISPLAY_SCENARIO);
  assert.equal(mode.resolveCount, 0); assert.equal(mode.captureCount, 6); assert.deepEqual(mode.routes, ["/earlyaccess"]);
  assert.deepEqual(DISPLAY_CONFIGURATIONS.map(({ width, height, font }) => [width, height, font]), [
    [1440, 900, 16], [768, 1024, 16], [375, 812, 16], [320, 812, 16], [375, 812, 32], [320, 812, 32],
  ]);
  assert.equal(DISPLAY_SOURCE_PINS.length, 22); assert.equal(new Set(DISPLAY_SOURCE_PINS.map((pin) => pin.path)).size, 22);
  assert.equal(scenarioDefinition().captureCount, 12); assert.equal(scenarioDefinition().resolveCount, 5);
  assert.equal(scenarioDefinition(PREMIUM_ENTRY_SCENARIO).captureCount, 6);
  assert.equal(classifyRequest("GET", "/api/research/early-access/agreements", assets, PREMIUM_ENTRY_SCENARIO).kind, "refused");
});

test("synthetic exact query parser matches MOTS-c but only the intentional sentinel may produce empty success", () => {
  const items = sourceDerivedDisplayRows(displayModels());
  const base = DISPLAY_CATALOG_PATH + "?page=1&pageSize=24";
  const all = displayCatalogPage(displayCatalogQuery(base), items);
  assert.equal(all.items.length, 8); assert.equal(all.total, 8); assert.equal(all.page, 1); assert.equal(all.pageSize, 24);
  const mots = displayCatalogPage(displayCatalogQuery(DISPLAY_CATALOG_PATH + "?search=MOTS-c&page=1&pageSize=24"), items);
  assert.equal(mots.total, 1); assert.equal(mots.items[0].productName, "MOTS-C");
  for (const name of ["BPC-157", "TB-500", "MOTS-c", "Semaglutide", "Tirzepatide"]) {
    const query = new URLSearchParams({ search: name, page: "1", pageSize: "24" });
    const page = displayCatalogPage(displayCatalogQuery(DISPLAY_CATALOG_PATH + "?" + query), items);
    assert.equal(page.total, 1); assert.equal(page.items[0].productName.toLowerCase(), name.toLowerCase());
  }
  const sentinel = displayCatalogPage(displayCatalogQuery(DISPLAY_CATALOG_PATH + "?search=" + DISPLAY_UNMATCHED_SEARCH + "&page=1&pageSize=24"), items);
  assert.equal(sentinel.total, 0); assert.deepEqual(sentinel.items, []);
  const clinical = displayCatalogPage(displayCatalogQuery(DISPLAY_CATALOG_PATH + "?family=clinical_formulations_503a&page=1&pageSize=24"), items);
  assert.equal(clinical.total, 1); assert.equal(clinical.items[0].productName, "Anastrozole");
  assert.equal(all.availableRankSorts, undefined); assert.deepEqual(all.channels, []);
});

test("synthetic query/method boundary refuses unknown, duplicate, malformed, ranking and incompatible filter input", () => {
  for (const query of ["", "page=1", "page=0&pageSize=24", "page=2&pageSize=24", "page=01&pageSize=24",
    "page=1&pageSize=100", "page=1&pageSize=24&page=1", "page=1&pageSize=24&search=MOTS-c&search=MOTS-c",
    "page=1&pageSize=24&sort=name_asc", "page=1&pageSize=24&presentation=topicals",
    "page=1&pageSize=24&actor=someone", "search=HCG&page=1&pageSize=24", "search=unknown&page=1&pageSize=24",
    "family=unknown&page=1&pageSize=24", "search=BPC-157&family=clinical_formulations_503a&page=1&pageSize=24",
    "search=%ZZ&page=1&pageSize=24", "search=%42PC-157&page=1&pageSize=24", "page=1&pageSize=24#fragment"])
    assert.equal(displayCatalogQuery(DISPLAY_CATALOG_PATH + "?" + query), null, query);
  const valid = DISPLAY_CATALOG_PATH + "?page=1&pageSize=24";
  assert.equal(classifyRequest("GET", valid, assets, DISPLAY_SCENARIO).kind, "catalog_fixture");
  for (const method of ["HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    assert.equal(classifyRequest(method, valid, assets, DISPLAY_SCENARIO).kind, "refused");
  for (const path of ["/api/research/early-access/request-intents/recover", "/api/research/early-access/request-intents/prepare-fixture",
    "/api/research/early-access/unlock", "/api/research/early-access/agreements/accept", "/api/research/early-access/request-intents/admission"])
    assert.equal(classifyRequest("POST", path, assets, DISPLAY_SCENARIO).kind, "refused");
});

test("synthetic rows join current canonical identities and preserve null prices, HCG hold and FedEx non-merchandise", () => {
  const rows = sourceDerivedDisplayRows(displayModels());
  assert.equal(rows.length, 8); assert.equal(new Set(rows.map((row) => row.sourceSelection.variantId)).size, 8);
  assert.ok(rows.every((row) => row.unitPriceCents === null && row.priceVersion === null));
  const hcg = rows.find((row) => row.productName === "HCG");
  assert.equal(hcg.specification, displayHcg.specification); assert.equal(hcg.selectableForReview, true);
  assert.equal(hcg.intentExclusion, "specification_review"); assert.equal(hcg.sourceRefusal, "formulation_hold");
  assert.equal(hcg.reviewedMedia, undefined); assert.equal(hcg.reviewedContent, undefined);
  assert.doesNotMatch(JSON.stringify(hcg), /120000|120,000/u);
  const fedex = rows.find((row) => row.productName === "FedEx Standard Overnight");
  assert.equal(fedex.selectableForReview, false); assert.equal(fedex.intentExclusion, "non_merchandise");
  assert.equal(fedex.reviewedMedia, undefined); assert.match(fedex.productId, /^unbound:mo_/u);
  assert.match(fedex.variantId, /^unbound:mov_/u);
  const proposed = rows.find((row) => row.productName === "Anastrozole");
  assert.equal(proposed.clinicalReviewRequired, true); assert.equal(proposed.reviewedMedia.representation, "proposed_carton");
  assert.ok(rows.every((row) => row.catalogVersion.endsWith(DISPLAY_SOURCE.source.slice(0, 8))));
});

test("synthetic joins fail closed for stale binding, missing variant, changed media or canonical identity", () => {
  for (const change of [
    (models) => { models.bindings.bindings.find((b) => b.offeringVariantId === DISPLAY_ROW_STUBS[0].identity.sourceVariantId).variantId = "different"; },
    (models) => { models.catalog.products.find((p) => p.id === DISPLAY_ROW_STUBS[0].identity.offeringId).variants = []; },
    (models) => { models.media.records.find((p) => p.offeringId === DISPLAY_ROW_STUBS[0].identity.offeringId).primarySha256 = "0".repeat(64); },
    (models) => { models.catalog.products.find((p) => p.id === DISPLAY_ROW_STUBS[0].identity.offeringId).family = "shipping_and_fulfillment"; },
  ]) {
    const models = displayModels(); change(models); assert.throws(() => sourceDerivedDisplayRows(models), /DISPLAY_/u);
  }
});

async function withDisplayPreview(operation, badInventory = false) {
  const root = mkdtempSync(join(tmpdir(), "owned-synthetic-display-"));
  const template = '<!doctype html><html><head><title>Transport test only</title></head><body>Not an executed app</body></html>';
  writeFileSync(join(root, "index.html"), template);
  const inventory = [{ path: "index.html", bytes: Buffer.byteLength(template), sha256: hash(template) }];
  for (const pin of DISPLAY_MEDIA_PINS) {
    const relative = pin.path.slice(1), bytes = readFileSync(join(displayRepo, "client/public", relative));
    mkdirSync(join(root, displayDirname(relative)), { recursive: true }); writeFileSync(join(root, relative), bytes);
    inventory.push({ path: relative, bytes: bytes.length, sha256: badInventory ? "0".repeat(64) : hash(bytes) });
  }
  const ledger = []; let preview;
  try { preview = await startOwnedPreview({ root, inventory, ledger, scenario: DISPLAY_SCENARIO }); await operation(preview, ledger); }
  finally { if (preview) await preview.close(); rmSync(root, { recursive: true, force: true }); }
}

test("synthetic actual HTTP policy/config wrappers use canonical wire pairs and never issue a cookie/contact record", async () => {
  await withDisplayPreview(async (preview) => {
    const get = async (path) => { const response = await fetch(preview.origin + path, { redirect: "error" });
      assert.equal(response.headers.get("set-cookie"), null); assert.equal(response.headers.get("cache-control"), "no-store");
      return { status: response.status, body: await response.json() }; };
    const policy = (await get("/api/research/policies")).body;
    assert.deepEqual(policy, { policies: { [displayPolicySlug]: displayPolicies[displayPolicySlug] } });
    const config = (await get("/api/research/early-access/request-intents/config")).body;
    assert.deepEqual(config.requiredAgreements, [displayPolicyPair]);
    assert.deepEqual(config.formAcknowledgments, displayAcknowledgments.map((ack) => ({ id: ack.id, scope: ack.scope, copy: ack.copy, ...displayFormPair(ack) })));
    assert.ok(parseDisplayConfig(config)); assert.equal(config.optionalIntakeEnabled, undefined); assert.equal(config.referralEnabled, undefined);
    assert.deepEqual((await get("/api/research/early-access/agreements")).body, { accepted: true, required: [displayPolicyPair] });
    const admission = (await get("/api/research/early-access/request-intents/admission")).body;
    assert.deepEqual(Object.keys(admission).sort(), ["admitted", "policyRevision", "retentionSeconds"]);
    assert.equal(admission.admitted, true); assert.equal(admission.retentionSeconds, 7200);
    assert.deepEqual((await get("/api/research/early-access/session")).body, { authenticated: true, expiresAt: null });
    assert.equal((await get("/api/config")).body.supabaseAnonKey, null); assert.equal((await get("/api/research/me")).body.authed, false);
    assert.deepEqual(await get("/api/research/early-access/assisted-orders/config"), { status: 503, body: { enabled: false } });
    assert.equal(preview.displayReceipt.actualActor, false); assert.equal(preview.displayReceipt.actualAssent, false);
    assert.equal(preview.displayReceipt.contactRecord, false); assert.equal(preview.displayReceipt.persisted, false);
    assert.equal(Object.keys(preview.counters.readOnlyGET).length, 9);
  });
});

test("synthetic actual HTTP catalog echoes finite query and refuses malformed reads/writes/credentials", async () => {
  await withDisplayPreview(async (preview, ledger) => {
    const response = await fetch(preview.origin + DISPLAY_CATALOG_PATH + "?search=MOTS-c&page=1&pageSize=24");
    const body = await response.json(); assert.equal(response.status, 200); assert.equal(body.total, 1);
    assert.equal(body.items[0].productName, "MOTS-C"); assert.equal(body.items[0].unitPriceCents, null);
    const empty = await fetch(preview.origin + DISPLAY_CATALOG_PATH + "?search=" + DISPLAY_UNMATCHED_SEARCH + "&page=1&pageSize=24");
    const emptyBody = await empty.json(); assert.equal(empty.status, 200); assert.equal(emptyBody.total, 0); assert.deepEqual(emptyBody.items, []);
    const business = await fetch(preview.origin + "/api/research/business-inquiries/config");
    assert.equal(business.status, 404); await business.text();
    for (const suffix of ["?page=1&pageSize=24&page=1", "?search=unknown&page=1&pageSize=24", "?sort=name_asc&page=1&pageSize=24"])
      { const refused = await fetch(preview.origin + DISPLAY_CATALOG_PATH + suffix); assert.equal(refused.status, 404); await refused.text(); }
    for (const path of ["/api/research/business-inquiries/config", "/api/research/early-access/request-intents/recover",
      "/api/research/early-access/request-intents/prepare-fixture", "/api/research/early-access/unlock",
      "/api/research/early-access/agreements/accept", "/api/research/early-access/request-intents/admission"]) {
      const refused = await fetch(preview.origin + path, { method: "POST", body: "{}" });
      assert.equal(refused.status, 404); assert.equal(refused.headers.get("set-cookie"), null); await refused.text();
    }
    for (const headers of [{ cookie: "" }, { authorization: "Bearer synthetic-not-authority" }, { origin: "https://example.invalid" }]) {
      const refused = await fetch(preview.origin + "/api/research/early-access/session", { headers });
      assert.equal(refused.status, 403); await refused.text();
    }
    assert.equal(preview.counters.resolve404, 0); assert.equal(preview.catalogQueryReceipts().length, 2);
    assert.ok(ledger.filter((row) => row.status === 200).every((row) => row.kind.includes("SYNTHETIC_DISPLAY")));
  });
});

test("synthetic source/media inventory validation refuses drift before starting its server", async () => {
  await assert.rejects(withDisplayPreview(async () => assert.fail("BAD_INVENTORY_MUST_NOT_START"), true), { message: "DISPLAY_ASSET_PIN_MISMATCH" });
  const data = createSyntheticDisplayData(displayRepo);
  assert.equal(data.items.length, 8); assert.equal(data.assetPins.length, 11);
  assert.ok(data.items.every((row) => row.unitPriceCents === null && row.priceVersion === null));
});

test("synthetic DOM decision rejects disputed strength, imagery, truncated summary, non-merchandise Add and prices", () => {
  const data = createSyntheticDisplayData(displayRepo);
  const sample = { cardCount: 8, cartText: "Quote cart (0)", contactInputs: 0, stepContact: false, dialogOpen: false,
    hcgImages: 0, fedexImages: 0, cards: data.expectations.map((item) => ({ name: item.name, specification: item.specification,
      summary: item.summary, representation: item.representation, canAdd: item.selectableForReview,
      text: item.name === "HCG" ? "Strength and formulation are being verified" : item.name === "FedEx Standard Overnight" ? "Shipping or service entry, not a product request" : item.name,
      media: item.media ? [{ path: item.media, alt: "Source alt", fit: "contain", rendered: true, inViewport: true, complete: true, naturalWidth: 1024 }] : [] })) };
  assert.ok(displayCatalogAssertions(sample, data.expectations).every((a) => a.passed));
  for (const change of [
    (s) => { s.cards[6].specification = "HCG 120000iu"; }, (s) => { s.hcgImages = 1; },
    (s) => { s.cards[7].canAdd = true; }, (s) => { s.cards[0].summary = "Truncated"; },
    (s) => { s.cards[0].media[0].fit = "cover"; }, (s) => { s.cards[0].text = "$123.45 Buy now"; },
    (s) => { s.cards[0].media[0].rendered = false; },
    (s) => { s.contactInputs = 1; }, (s) => { s.cartText = "Quote cart (1)"; },
  ]) { const mutated = structuredClone(sample); change(mutated); assert.ok(displayCatalogAssertions(mutated, data.expectations).some((a) => !a.passed)); }
});

test("synthetic native traversal refuses an unapproved expression before any page input", async () => {
  const page = { evaluate: () => assert.fail("UNAPPROVED_EVALUATION"), pressTab: () => assert.fail("UNAPPROVED_INPUT") };
  await assert.rejects(nativeDisplayTarget(page, "document.body.click()", (work) => work, []), { message: "DISPLAY_NATIVE_TARGET_NOT_APPROVED" });
});

test("synthetic source validation catches actual file drift before any display source is used", () => {
  const root = mkdtempSync(join(tmpdir(), "owned-display-source-drift-"));
  try {
    for (const pin of DISPLAY_SOURCE_PINS) {
      const file = join(root, pin.path); mkdirSync(displayDirname(file), { recursive: true });
      writeFileSync(file, readFileSync(join(displayRepo, pin.path)));
    }
    const route = join(root, "client/src/research/early-access/EarlyAccessRoute.tsx");
    writeFileSync(route, readFileSync(route, "utf8") + "\n// synthetic drift\n");
    assert.throws(() => createSyntheticDisplayData(root), { message: "DISPLAY_SOURCE_PIN_MISMATCH" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function syntheticDetailsControl(failure = {}) {
  const events = [], order = ["back", "documentation", "contacts", "close-x"];
  if (failure.largeOrder) order.push(...Array.from({ length: 140 }, (_, i) => "extra-" + i));
  let open = false, active = null, backProbes = 0;
  const probe = () => {
    if (open && active === "back") backProbes++;
    const wrongIdentity = open && active === "back" && (failure.wrongFirstIdentity && backProbes === 1
      || failure.wrongWrappedIdentity && backProbes === 2)
      || open && active === "close-x" && failure.wrongLastIdentity
      || !open && events.includes("keyUp:Escape") && failure.wrongReturnedIdentity;
    return { body: active === null, identity: wrongIdentity ? "foreign" : open && failure.wrongInsideIdentity && backProbes === 1 ? "documentation" : active,
      indicator: true, inViewport: true, ...(open && failure.invisible ? { indicator: false } : {}),
      ...(open && failure.outside ? { inViewport: false } : {}) };
  };
  const scopedBaseline = () => {
    const nodes = order.map((identity) => ({ identity })), background = { identity: "background" }, baselines = new WeakMap();
    for (const node of [...nodes, background]) baselines.set(node, { identity: node.identity });
    const dialog = { classList: { contains: (name) => name === "xenios-premium-product-dialog" },
      querySelector: () => ({ textContent: "BPC-157" }), querySelectorAll: () => nodes,
      contains: (node) => nodes.includes(node) };
    const doc = { activeElement: nodes.find((node) => node.identity === active) ?? background,
      querySelectorAll: () => failure.missingScope ? [] : failure.ambiguousScope ? [dialog, dialog] : [dialog] };
    const localOrder = failure.wrongScopedOrder ? [order[1], order[0], ...order.slice(2)] : order;
    const globalOrder = failure.backgroundFirst ? ["background", ...localOrder] : localOrder;
    return { tabbableIdentities: globalOrder,
      dialogScope: collectDisplayDialogScope(doc, failure.unobservableScope ? {} : { baselines }, globalOrder) };
  };
  const page = {
    evaluate: async (source) => {
      if (source === FOCUS_BASELINE_SOURCE) { events.push("baseline"); return { tabbableIdentities: open ? order : ["trigger"] }; }
      if (source === DISPLAY_DIALOG_BASELINE_SOURCE) { events.push("scoped-baseline"); return scopedBaseline(); }
      if (source === FOCUS_PROBE_SOURCE || source === DISPLAY_DIALOG_FOCUS_PROBE_SOURCE) {
        events.push("probe:" + active); const sample = probe();
        return source === FOCUS_PROBE_SOURCE ? sample : { ...sample, dialogCount: 1,
          insideDialog: open && order.includes(active) && !failure.outsideDialog
            && !(failure.outsideLast && active === "close-x") && !(failure.outsideWrapped && active === "back" && backProbes === 2) };
      }
      if (source === DISPLAY_DETAILS_TARGET) return active === "trigger";
      if (source === DISPLAY_DIALOG_PRESENT) return open;
      if (source === `!(${DISPLAY_DIALOG_PRESENT})`) return !open;
      if (source === DISPLAY_DIALOG_CLOSED_AND_RETURNED) return !open && active === "trigger";
      if (source === DISPLAY_DIALOG_FOCUS) return !failure.escaped && open && order.includes(active);
      assert.ok(source.includes("Final quantities, prices and availability")); events.push("read-dialog");
      return { title: failure.wrongTitle ? "Different" : "BPC-157", description: true, caption: true, contacts: true, inViewport: true };
    },
    pressTab: async ({ shift = false }) => {
      events.push(shift ? "ShiftTab" : "Tab");
      if (!open) active = "trigger";
      else active = order[(order.indexOf(active) + (shift ? order.length - 1 : 1)) % order.length];
    },
    send: async (method, params) => {
      assert.equal(method, "Input.dispatchKeyEvent"); events.push(params.type + ":" + params.key);
      if (params.type === "keyUp" && params.key === "Enter") { assert.equal(active, "trigger"); open = true; active = "back"; }
      if (params.type === "keyUp" && params.key === "Escape") { open = false; active = failure.wrongReturn ? "foreign" : "trigger"; }
    },
  };
  return { page, events, isOpen: () => open };
}
test("synthetic Details helper performs actual native open/trap/capture/escape/return orchestration only", async () => {
  const control = syntheticDetailsControl(), progress = {}; let captures = 0;
  const proof = await displayDetailsProof(control.page, (work) => work, async () => {
    captures++; assert.equal(control.isOpen(), true); assert.equal(progress.focus.wrapped.identity, "back");
    assert.equal(control.events.includes("keyUp:Escape"), false); return { file: "synthetic-details.png" };
  }, progress);
  assert.equal(captures, 1); assert.equal(control.isOpen(), false);
  assert.equal(proof.state, "NATIVE_DETAILS_DISPLAY_ONLY_OBSERVED"); assert.equal(proof.returned.identity, "trigger");
  assert.ok(control.events.indexOf("keyUp:Enter") < control.events.indexOf("read-dialog"));
  assert.ok(control.events.indexOf("read-dialog") < control.events.indexOf("keyDown:Escape"));
  assert.equal(control.events.filter((event) => event === "keyDown:Enter").length, 1);
});

test("synthetic capture matrix selects all four mobile width/font pairs within the exact thirteen-image cap", () => {
  const plan = displayCapturePlan();
  assert.equal(DISPLAY_PNG_CAP, 13);
  assert.equal(plan.length, 36); assert.equal(plan.filter((entry) => entry.selected).length, DISPLAY_PNG_CAP);
  assert.ok(plan.every((entry) => entry.state === "NOT_RUN"));
  assert.equal(plan.filter((entry) => entry.selected && entry.section === "catalog").length, 6);
  assert.equal(plan.filter((entry) => entry.selected && entry.section === "details").length, 2);
  assert.equal(plan.filter((entry) => !entry.selected).length, 23);
  for (const [width, font] of [[320, 16], [320, 32], [375, 16], [375, 32]]) {
    const configurations = DISPLAY_CONFIGURATIONS.filter((entry) => entry.width === width && entry.font === font);
    assert.equal(configurations.length, 1);
    assert.equal(plan.filter((entry) => entry.configuration === configurations[0].name && entry.section === "catalog" && entry.selected).length, 1);
  }
  const newProfile = plan.filter((entry) => entry.configuration === "display-phone320-200");
  assert.equal(newProfile.length, 6);
  assert.deepEqual(newProfile.filter((entry) => entry.selected).map((entry) => entry.section), ["catalog"]);
});

test("synthetic Details rejects wrong content, escaped/invisible focus and wrong return without claiming a capture pass", async () => {
  for (const failure of [{ wrongTitle: true }, { escaped: true }, { invisible: true }, { wrongReturn: true }]) {
    const control = syntheticDetailsControl(failure), progress = {};
    await assert.rejects(displayDetailsProof(control.page, (work) => work, async () => ({ file: "unaccepted-synthetic.png" }), progress), /DISPLAY_/u);
    assert.equal(progress.state, "INCOMPLETE");
  }
});

test("actual shell accepts only explicit synthetic-display mode, not arbitrary display destinations or fallback values", () => {
  const shell = fileURLToPath(new URL("./owned-runner-browser-qa.sh", import.meta.url));
  for (const [value, status] of [[DISPLAY_SCENARIO, 0], ["synthetic", 1], [DISPLAY_SCENARIO + "/earlyaccess", 1]]) {
    const child = spawnSync("/bin/bash", ["-c", 'source "$1"; validate_owned_scenario "$2"', "display-shell-test", shell, value],
      { encoding: "utf8", timeout: 2000, env: { PATH: "/usr/bin:/bin" } });
    assert.equal(child.status, status); assert.equal(child.stdout, ""); assert.equal(child.stderr, "");
  }
});

test("synthetic display does not accept an existing attempt/receipt or unavailable storage as clean", async () => {
  let reads = 0;
  for (const value of [false, null, undefined, 0, {}]) {
    const page = { evaluate: async (source) => { assert.equal(source, DISPLAY_NO_ATTEMPT_SOURCE); reads++; return value; } };
    await assert.rejects(assertNoDisplayAttempt(page, (work) => work), { message: "DISPLAY_ATTEMPT_OR_RECEIPT_PRESENT" });
  }
  assert.equal(reads, 5);
  assert.equal(await assertNoDisplayAttempt({ evaluate: async () => true }, (work) => work), true);
});

test("synthetic final census requires all nine reads and refuses missing, extra, mutation or credential evidence", () => {
  const counters = { resolve404: 0, refused: 0, unexpected: 0, credentialAttempts: 0,
    readOnlyGET: Object.fromEntries(DISPLAY_GET_PATHS.map((path) => [path, 5])) };
  assertScenarioFixtureCensus(counters, DISPLAY_SCENARIO);
  for (const altered of [
    { ...counters, resolve404: 1 }, { ...counters, credentialAttempts: 1 },
    { ...counters, readOnlyGET: { ...counters.readOnlyGET, [DISPLAY_CATALOG_PATH]: 0 } },
    { ...counters, readOnlyGET: { ...counters.readOnlyGET, "/api/research/business-inquiries/config": 5 } },
  ]) assert.throws(() => assertScenarioFixtureCensus(altered, DISPLAY_SCENARIO), /(?:DISPLAY_BOOTSTRAP|PREVIEW_REQUEST)_/u);
});

test("synthetic first-focus rejection retains each original predicate and bounded baseline before the unchanged gate", async () => {
  for (const [failure, predicates] of [
    [{ wrongFirstIdentity: true, largeOrder: true }, { identity: false, indicator: true, inViewport: true }],
    [{ invisible: true }, { identity: true, indicator: false, inViewport: true }],
    [{ outside: true }, { identity: true, indicator: true, inViewport: false }],
  ]) {
    const control = syntheticDetailsControl(failure), progress = {}; let captures = 0;
    await assert.rejects(displayDetailsProof(control.page, (work) => work, async () => { captures++; }, progress),
      { message: "DISPLAY_DETAILS_FIRST_FOCUS_INVALID" });
    assert.equal(progress.state, "INCOMPLETE"); assert.equal(progress.focus.state, "INCOMPLETE");
    assert.equal(progress.focus.expectedFirst, "back"); assert.deepEqual(progress.focus.firstPredicates, predicates);
    assert.equal(progress.focus.first.identity, failure.wrongFirstIdentity ? "foreign" : "back");
    assert.equal(progress.focus.first.indicator, !failure.invisible); assert.equal(progress.focus.first.inViewport, !failure.outside);
    assert.equal(progress.focus.baseline.tabbableIdentities.length, failure.largeOrder ? 128 : 4);
    assert.equal(progress.focus.baseline.total, failure.largeOrder ? 144 : 4);
    assert.equal(progress.focus.baseline.dropped, failure.largeOrder ? 16 : 0);
    assert.equal(progress.focus.baseline.truncated, Boolean(failure.largeOrder));
    assert.deepEqual(control.events.filter((event) => event === "Tab" || event === "ShiftTab"), ["Tab", "Tab", "ShiftTab"]);
    assert.equal(captures, 0); assert.equal(control.events.includes("keyDown:Escape"), false);
    assert.equal(progress.focus.last, undefined); assert.equal(progress.focus.wrapped, undefined);
  }
});

test("synthetic later focus rejections retain raw last, wrapped or returned observations before the same gate", async () => {
  for (const [failure, message, field] of [
    [{ wrongLastIdentity: true }, "DISPLAY_DETAILS_REVERSE_TRAP_FAILED", "last"],
    [{ wrongWrappedIdentity: true }, "DISPLAY_DETAILS_FORWARD_TRAP_FAILED", "wrapped"],
    [{ wrongReturnedIdentity: true }, "DISPLAY_DETAILS_FOCUS_RETURN_FAILED", "returned"],
  ]) {
    const control = syntheticDetailsControl(failure), progress = {};
    await assert.rejects(displayDetailsProof(control.page, (work) => work, async () => ({ file: "unaccepted-synthetic.png" }), progress), { message });
    assert.equal(progress.state, "INCOMPLETE");
    assert.equal((field === "returned" ? progress.returned : progress.focus[field]).identity, "foreign");
    assert.equal(progress.focus.firstPredicates.identity, true);
  }
});
function catalogGeometryControl() {
  const rect = (top, height) => ({ left: 20, top, right: 460, bottom: top + height, width: 440, height });
  const style = { display: "block", visibility: "visible", overflowY: "visible", overflowX: "visible", maxHeight: "none", webkitLineClamp: "none" };
  const node = (top, height) => ({ _rect: rect(top, height), _style: { ...style }, clientHeight: height, scrollHeight: height,
    parentElement: null, tagName: "DIV", getBoundingClientRect() { return this._rect; }, getClientRects() { return [this._rect]; } });
  const identities = DISPLAY_ROW_STUBS.map((stub) => ({ identity: stub.identity, name: stub.item.productName, specification: stub.item.specification }));
  const cards = identities.map((identity, index) => {
    const card = node(index === 1 ? 2000 : 100, 420), summary = node(180, 60);
    summary.clientHeight = 60; summary.scrollHeight = 190;
    summary._ranges = Array.from({ length: 40 }, (_, i) => rect(180 + i * 18, 18));
    let ancestor = null;
    for (let i = 0; i < 20; i++) { const next = node(140, 160); next._style.overflowY = "hidden"; next.parentElement = ancestor; ancestor = next; }
    summary.parentElement = ancestor;
    card._name = identity.name; card._specification = identity.specification; card._summary = summary;
    card.querySelector = (selector) => selector === "h2" ? { textContent: card._name }
      : selector === ".xenios-order-card-identity > p" ? { textContent: card._specification }
      : selector === ".xenios-order-card-description--reviewed" ? card._summary : null;
    return card;
  });
  const doc = { documentElement: { scrollHeight: 9000 }, body: { scrollHeight: 8800 },
    querySelectorAll: (selector) => { assert.equal(selector, ".xenios-order-cards > article"); return cards; },
    createRange: () => { let selected; return { selectNodeContents: (node) => { selected = node; },
      getBoundingClientRect: () => rect(180, 720), getClientRects: () => selected._ranges }; } };
  const view = { innerWidth: 1440, innerHeight: 900, getComputedStyle: (node) => node._style };
  return { doc, view, cards, identities };
}

test("synthetic catalog metrics read actual page/card/range geometry with bounded clipping evidence and no offscreen paint claim", () => {
  const control = catalogGeometryControl();
  const metrics = collectDisplayCatalogGeometry(control.doc, control.view, control.identities);
  assert.deepEqual(metrics.viewport, { width: 1440, height: 900 });
  assert.deepEqual(metrics.page, { documentScrollHeight: 9000, bodyScrollHeight: 8800, pageLength: 9000 });
  assert.equal(metrics.cards.length, 8); assert.deepEqual(metrics.cards.map((card) => card.fixtureIdentity), control.identities.map((entry) => entry.identity));
  assert.equal(metrics.cards[0].card.rect.height, 420); assert.equal(metrics.cards[0].summary.clientHeight, 60);
  assert.equal(metrics.cards[0].summary.scrollHeight, 190); assert.equal(metrics.cards[0].summary.range.bounds.height, 720);
  assert.equal(metrics.cards[0].summary.range.rects.length, 32); assert.equal(metrics.cards[0].summary.range.droppedRects, 8);
  assert.equal(metrics.cards[0].summary.clippingAncestors.length, 8); assert.equal(metrics.cards[0].summary.droppedAncestors, 8);
  assert.equal(metrics.cards[0].summary.ancestorScanTruncated, true);
  assert.equal(metrics.cards[1].card.inViewport, false); assert.equal(metrics.cards[1].card.rendered, true);
  assert.equal(metrics.cards[1].card.paintedOrUnobscured, "NOT_ESTABLISHED_GEOMETRY_ONLY");
  control.cards[0]._rect.height = 937;
  assert.equal(collectDisplayCatalogGeometry(control.doc, control.view, control.identities).cards[0].card.rect.height, 937);
});

test("synthetic catalog geometry reports unavailable/range/identity limits without substituting style thresholds or success", () => {
  const control = catalogGeometryControl(); control.doc.body = null;
  control.cards[0]._name = "Different row"; control.cards[0]._rect.width = NaN;
  control.cards[1]._summary = null; control.doc.createRange = () => { throw new Error("PRIVATE_RANGE_FAILURE_MUST_NOT_BE_SERIALIZED"); };
  const metrics = collectDisplayCatalogGeometry(control.doc, control.view, control.identities);
  assert.equal(metrics.state, "UNAVAILABLE_OR_PARTIAL"); assert.equal(metrics.page.bodyScrollHeight, null);
  assert.equal(metrics.cards[0].fixtureIdentity, null); assert.equal(metrics.cards[0].identityStatus, "UNMATCHED_OR_AMBIGUOUS");
  assert.equal(metrics.cards[0].card.state, "UNAVAILABLE_OR_PARTIAL"); assert.equal(metrics.cards[0].card.rect.width, null);
  assert.equal(metrics.cards[0].summary.range.state, "UNAVAILABLE"); assert.equal(metrics.cards[1].summary.state, "NOT_PRESENT");
  assert.equal(metrics.cards[1].summary.range.state, "NOT_PRESENT");
  assert.equal(JSON.stringify(metrics).includes("PRIVATE_RANGE_FAILURE"), false);
  control.doc.querySelectorAll = () => { throw new Error("UNAVAILABLE_CATALOG_QUERY"); };
  assert.equal(collectDisplayCatalogGeometry(control.doc, control.view, control.identities).state, "UNAVAILABLE_OR_PARTIAL");
});
test("actual versioned focus collector scopes modal order without treating the observed background-first node as modal first", async () => {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM('<button id="background">Background</button><div role="dialog" data-state="open" class="xenios-premium-product-dialog"><h2>BPC-157</h2><button id="back">Back to catalog</button><button disabled>Disabled</button><button style="display:none">Hidden</button><a id="documentation" href="#docs">Documentation</a><button id="close">Close</button></div>', { runScripts: "outside-only" });
  try {
    const { window } = dom, doc = window.document;
    window.HTMLElement.prototype.getClientRects = () => [{ width: 100, height: 44 }];
    const baseline = window.eval(FOCUS_BASELINE_SOURCE), state = window.__xeniosEvidenceFocusStateV2;
    const back = doc.getElementById("back"), backgroundId = state.baselines.get(doc.getElementById("background")).identity;
    const backBaseline = state.baselines.get(back), nextOrdinal = state.nextOrdinal;
    back.focus(); // Synthetic DOM setup only; the owned browser harness never calls focus().
    const actual = window.eval(DISPLAY_DIALOG_BASELINE_SOURCE), scope = actual.dialogScope;
    assert.equal(actual.tabbableIdentities[0], backgroundId); assert.equal(scope.order[0], backBaseline.identity);
    assert.equal(scope.order.at(-1), state.baselines.get(doc.getElementById("close")).identity);
    assert.equal(scope.excludedBackgroundCount, 1); assert.equal(scope.order.length, 3);
    assert.equal(scope.state, "OBSERVED_SAME_BASELINE_DIALOG_ORDER"); assert.equal(scope.activeInside, true);
    assert.equal(state.nextOrdinal, nextOrdinal); assert.equal(state.baselines.get(back), backBaseline);
    assert.deepEqual([...scope.order], [...baseline.tabbableIdentities].filter((id) => id !== backgroundId));
    const sample = window.eval(DISPLAY_DIALOG_FOCUS_PROBE_SOURCE);
    assert.equal(sample.identity, backBaseline.identity); assert.equal(sample.insideDialog, true);
  } finally { dom.window.close(); }
});

test("actual modal scope refuses absent, ambiguous, wrong-title and unobservable baseline rather than inventing a tab order", async () => {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM('<div role="dialog" data-state="open" class="xenios-premium-product-dialog"><h2>BPC-157</h2><button>Back</button><button>Close</button></div>', { runScripts: "outside-only" });
  try {
    const { window } = dom, doc = window.document;
    window.HTMLElement.prototype.getClientRects = () => [{ width: 100, height: 44 }];
    const baseline = window.eval(FOCUS_BASELINE_SOURCE), state = window.__xeniosEvidenceFocusStateV2;
    const dialog = doc.querySelector('[role="dialog"]');
    assert.equal(collectDisplayDialogScope(doc, state, baseline.tabbableIdentities).state, "OBSERVED_SAME_BASELINE_DIALOG_ORDER");
    assert.equal(collectDisplayDialogScope(doc, {}, baseline.tabbableIdentities).state, "UNOBSERVABLE_DIALOG_SCOPE");
    assert.equal(collectDisplayDialogScope(doc, state, [...baseline.tabbableIdentities, baseline.tabbableIdentities[0]]).state, "UNOBSERVABLE_DIALOG_SCOPE");
    dialog.querySelector("h2").textContent = "Different";
    assert.equal(collectDisplayDialogScope(doc, state, baseline.tabbableIdentities).state, "UNOBSERVABLE_DIALOG_SCOPE");
    dialog.querySelector("h2").textContent = "BPC-157";
    const duplicate = dialog.cloneNode(true); doc.body.append(duplicate);
    assert.equal(collectDisplayDialogScope(doc, state, baseline.tabbableIdentities).reason, "ABSENT_OR_AMBIGUOUS");
    duplicate.remove(); dialog.remove();
    assert.equal(collectDisplayDialogScope(doc, state, baseline.tabbableIdentities).reason, "ABSENT_OR_AMBIGUOUS");
  } finally { dom.window.close(); }
});

test("actual Details orchestration accepts the observed background-first regression but still denies outside, wrong-inside and wrong-order focus", async () => {
  const control = syntheticDetailsControl({ backgroundFirst: true }), progress = {};
  await displayDetailsProof(control.page, (work) => work, async () => ({ file: "synthetic-modal-not-browser-proof.png" }), progress);
  assert.equal(progress.state, "NATIVE_DETAILS_DISPLAY_ONLY_OBSERVED");
  assert.equal(progress.focus.expectedGlobalFirst, "background"); assert.equal(progress.focus.expectedFirst, "back");
  assert.equal(progress.focus.dialogScope.excludedBackgroundCount, 1); assert.equal(progress.focus.firstPredicates.identity, true);
  for (const [failure, message] of [
    [{ outsideDialog: true }, "DISPLAY_DETAILS_FIRST_FOCUS_INVALID"],
    [{ wrongInsideIdentity: true }, "DISPLAY_DETAILS_FIRST_FOCUS_INVALID"],
    [{ wrongScopedOrder: true }, "DISPLAY_DETAILS_FIRST_FOCUS_INVALID"],
    [{ missingScope: true }, "DISPLAY_DETAILS_DIALOG_SCOPE_UNOBSERVABLE"],
    [{ ambiguousScope: true }, "DISPLAY_DETAILS_DIALOG_SCOPE_UNOBSERVABLE"],
    [{ unobservableScope: true }, "DISPLAY_DETAILS_DIALOG_SCOPE_UNOBSERVABLE"],
    [{ outsideLast: true }, "DISPLAY_DETAILS_REVERSE_TRAP_FAILED"],
    [{ outsideWrapped: true }, "DISPLAY_DETAILS_FORWARD_TRAP_FAILED"],
  ]) {
    const rejected = syntheticDetailsControl({ backgroundFirst: true, ...failure }), facts = {}; let captures = 0;
    await assert.rejects(displayDetailsProof(rejected.page, (work) => work, async () => { captures++; }, facts), { message });
    assert.equal(facts.state, "INCOMPLETE"); assert.equal(facts.focus.expectedGlobalFirst, "background"); assert.equal(captures, 0);
  }
});

test("summary contrast evidence reads actual computed values and absent/ambiguous states without a literal-derived contrast pass", () => {
  const rect = { left: 0, top: 20, right: 400, bottom: 100, width: 400, height: 80 };
  const style = { color: "rgb(230, 230, 230)", backgroundColor: "rgb(21, 24, 30)", opacity: "0.8", visibility: "visible", display: "block", backgroundImage: "none" };
  const node = (textContent) => ({ textContent, getBoundingClientRect: () => rect, getClientRects: () => [rect] });
  const samples = { h2: [node("Your request")], 'p[role="status"]': [node("0 products")],
    ".xenios-order-summary-content > p:not([role]):not(.xenios-order-small)": [node("No products selected")],
    "p.xenios-order-small": [node("A request is not an approved order.")] };
  const panel = { ...node(""), querySelectorAll: (selector) => samples[selector], parentElement: null };
  const doc = { querySelectorAll: () => [panel] }, view = { innerWidth: 1440, innerHeight: 900, getComputedStyle: () => style };
  const first = collectDisplaySummaryContrast(doc, view);
  assert.equal(first.panel.background, style.backgroundColor); assert.equal(first.observations.heading.samples[0].foreground, style.color);
  assert.equal(first.observations.status.samples[0].opacity, "0.8"); assert.equal(first.panel.paintedOrContrastPass, "NOT_ESTABLISHED_COMPUTED_VALUES_ONLY");
  style.color = "rgb(11, 12, 13)"; samples.h2 = [];
  const changed = collectDisplaySummaryContrast(doc, view);
  assert.equal(changed.observations.heading.state, "NOT_PRESENT"); assert.equal(changed.observations.emptyState.samples[0].foreground, style.color);
  doc.querySelectorAll = () => [panel, panel]; assert.equal(collectDisplaySummaryContrast(doc, view).state, "AMBIGUOUS");
  doc.querySelectorAll = () => [panel]; view.getComputedStyle = () => { throw new Error("PRIVATE_STYLE_ERROR"); };
  const unavailable = collectDisplaySummaryContrast(doc, view);
  assert.equal(unavailable.panel.state, "UNAVAILABLE"); assert.equal(JSON.stringify(unavailable).includes("PRIVATE_STYLE_ERROR"), false);
});
test("partner DEV scenario has exact closed gallery/case routes, five profiles and thirteen selected images without changing three production modes", () => {
  const mode = scenarioDefinition(PARTNER_COMPONENT_SCENARIO);
  assert.equal(mode.scope, PARTNER_COMPONENT_SCOPE); assert.equal(mode.captureCount, 31); assert.equal(mode.resolveCount, 0);
  assert.deepEqual(PARTNER_COMPONENT_CONFIGURATIONS.map(({ width, height, font }) => [width, height, font]), [[1440,900,16],[320,812,16],[320,812,32],[375,812,16],[375,812,32]]);
  assert.equal(mode.routes.length, 23); assert.equal(partnerRoutesForConfiguration(PARTNER_COMPONENT_CONFIGURATIONS[1]).length, 2);
  assert.equal(ownedArtifactRelativeRoot(PARTNER_COMPONENT_SCENARIO), "dist/owned-partner-component-dev");
  for (const scenario of [PUBLIC_SCENARIO, PREMIUM_ENTRY_SCENARIO, DISPLAY_SCENARIO]) assert.equal(ownedArtifactRelativeRoot(scenario), "dist/public");
  assert.throws(() => ownedArtifactRelativeRoot("../other"), { message: "SCENARIO_INVALID" });
  assert.throws(() => partnerRoutesForConfiguration({ ...PARTNER_COMPONENT_CONFIGURATIONS[0], width: 999 }), { message: "PARTNER_CONFIGURATION_NOT_APPROVED" });
  const matrix = partnerCaptureMatrix(); assert.equal(matrix.length, 120); assert.equal(matrix.filter((entry) => entry.selected).length, PARTNER_COMPONENT_PNG_CAP);
  assert.equal(matrix.filter((entry) => entry.scene === "enlarged-qr" && entry.selected).length, 1);
  assert.equal(matrix.filter((entry) => entry.scene === "enlarged-qr" && !entry.selected).length, 4);
  for (const page of Object.keys(PARTNER_COMPONENT_CASES)) for (const config of PARTNER_COMPONENT_CONFIGURATIONS)
    assert.equal(matrix.filter((entry) => entry.page === page && entry.configuration === config.name && entry.selected && entry.scene === "primary").length,
      config.name === "partner-desktop1440" ? 2 : 1);
});

test("partner raw boundary rejects unknown/duplicate/encoded cases, every write, credential-bearing HTTP and canonical portal/API access", async () => {
  for (const target of ["/research/__gallery/partner-links", "/research/__gallery/partner-links?case=ready&case=empty", "/research/__gallery/partner-links?case=ready&actor=x", "/research/__gallery/partner-links?case=%72eady", "/research/__gallery/partner-links/?case=ready", "/research/__gallery/partner-links?case=READY", "/research/__gallery/partner-dashboard?case=ready"]) assert.equal(partnerGallerySelection(target), null);
  assert.deepEqual(partnerGallerySelection(partnerGalleryRoute("partner-links", "empty")), { page: "partner-links", selectedCase: "empty" });
  assert.equal(PARTNER_COMPONENT_BOOTSTRAP["/api/research/me"].body.authed, true);
  assert.equal(READ_ONLY_GET_FIXTURES["/api/research/me"].body.authed, false);
  const root = mkdtempSync(join(tmpdir(), "partner-dev-http-")); let preview;
  try {
    writeFileSync(join(root, "index.html"), '<html><head><title>Test</title></head><body></body></html>');
    const inventory = [{ path: "index.html", bytes: readFileSync(join(root,"index.html")).length, sha256: hash(readFileSync(join(root,"index.html"))) }];
    preview = await startOwnedPreview({ root, inventory, ledger: [], scenario: PARTNER_COMPONENT_SCENARIO });
    const document = await fetch(preview.origin + partnerGalleryRoute("partner-links", "ready"));
    assert.equal(document.status, 200); assert.equal(document.headers.get("cache-control"), "no-store"); assert.equal(document.headers.get("set-cookie"), null); await document.text();
    const me = await fetch(preview.origin + "/api/research/me"); assert.deepEqual(await me.json(), { configured: true, authed: true });
    for (const path of ["/api/research/partner/dashboard", "/api/research/partner/links", "/api/research/partner/readable-codes", "/research/partners/links", "/research/__gallery/partner-links?case=ready&extra=1"]) {
      const response = await fetch(preview.origin + path); assert.equal(response.status, 404); await response.text();
    }
    for (const method of ["HEAD", "POST", "PATCH", "DELETE"]) { const response = await fetch(preview.origin + partnerGalleryRoute("partner-links", "ready"), { method }); assert.equal(response.status, 404); await response.text(); }
    for (const headers of [{ Authorization: "Bearer invalid-test-value" }, { Authorization: "" }, { Cookie: "" }]) {
      const response = await fetch(preview.origin + "/api/research/me", { headers }); assert.equal(response.status, 403); await response.text();
    }
  } finally { await preview?.close(); rmSync(root, { recursive: true, force: true }); }
});

test("partner Storage observer delegates canonical removals unchanged, records their real vector and restores native descriptors", async () => {
  const { JSDOM } = await import("jsdom");
  const route = partnerGalleryRoute("partner-links", "ready"), dom = new JSDOM("", { url: "http://127.0.0.1:9999" + route });
  try {
    const { window } = dom, original = window.Storage.prototype.removeItem;
    const observer = installPartnerStorageObservation(window, [route]); assert.ok(observer);
    assert.equal(window.sessionStorage.removeItem("xenios.research.memberCart.v2"), undefined);
    window.sessionStorage.removeItem("xenios-research-cart-v1"); window.localStorage.removeItem("xenios-research-cart-v1");
    window.sessionStorage.removeItem("xenios-research-cart-v1"); window.localStorage.removeItem("xenios-research-cart-v1");
    const snapshot = observer.snapshot(), proof = partnerStorageCensus(snapshot);
    assert.equal(snapshot.counts.removeItem, 5); assert.deepEqual(proof.expectedVectorFromObservedCanonicalSequences, { currentSession: 1, legacySession: 2, legacyLocal: 2 });
    assert.ok(snapshot.events.every((event) => event.beforePresent === false && event.afterPresent === false));
    assert.equal(observer.restore(), true); assert.equal(window.Storage.prototype.removeItem, original); assert.equal(observer.snapshot().restored, true);
  } finally { dom.window.close(); }
});

test("partner Storage observer preserves forbidden write/throw behavior while refusing persistence, unknown removal, dropped or incomplete lifecycle evidence", async () => {
  const { JSDOM } = await import("jsdom"), route = partnerGalleryRoute("partner-links", "ready");
  const dom = new JSDOM("", { url: "http://127.0.0.1:9999" + route });
  try {
    const { window } = dom, observer = installPartnerStorageObservation(window, [route]);
    window.localStorage.setItem("synthetic-negative-key", "negative-control-only"); assert.equal(window.localStorage.getItem("synthetic-negative-key"), "negative-control-only");
    assert.throws(() => partnerStorageCensus(observer.snapshot()), { message: "PARTNER_STORAGE_UNEXPECTED_OPERATION" });
    assert.throws(() => window.Storage.prototype.removeItem.call({}, "x"), TypeError);
    assert.ok(observer.snapshot().counts.unknownReceiver > 0); assert.equal(JSON.stringify(observer.snapshot()).includes("negative-control-only"), false);
    assert.equal(observer.restore(), true);
    const empty = { sessionStorage: { available: true, length: 0 }, localStorage: { available: true, length: 0 } };
    const base = { initial: empty, current: empty, counts: { setItem: 0, clear: 0, unknownReceiver: 0, unknownRemoval: 0, dropped: 0, removeItem: 1 }, events: [{ method: "removeItem", area: "sessionStorage", keyClass: "CURRENT_SESSION_CART", beforePresent: false, afterPresent: false, threw: false }] };
    assert.throws(() => partnerStorageCensus(base), { message: "PARTNER_STORAGE_LIFECYCLE_INCOMPLETE" });
    assert.throws(() => partnerStorageCensus({ ...base, counts: { ...base.counts, dropped: 1 } }), { message: "PARTNER_STORAGE_UNEXPECTED_OPERATION" });
  } finally { dom.window.close(); }
});

test('partner pre-app focus observer captures BEFORE the actual call and preserves receiver, arguments, return, throw and restoration', async () => {
  const {JSDOM}=await import('jsdom'),route=partnerGalleryRoute('partner-links','ready'),dom=new JSDOM('<button>Read only</button>',{url:'http://127.0.0.1:9999'+route});
  try{
    const win=dom.window,proto=win.HTMLElement.prototype,original=Object.getOwnPropertyDescriptor(proto,'focus'),calls=[],failure=new Error('negative-focus');
    const delegated=function(...args){calls.push({kind:'native',receiver:this,args});if(this===null)throw failure;return 17;};
    Object.defineProperty(proto,'focus',{...original,value:delegated});
    const priorDate=win.Date,priorTimer=win.setTimeout,node=win.document.querySelector('button');
    const prelude=installPartnerPrelude(win,[route],installPartnerStorageObservation,()=>calls.push({kind:'baseline'}));
    const options={preventScroll:true};assert.equal(node.focus(options),17);assert.deepEqual(calls.map(c=>c.kind),['baseline','native']);
    assert.equal(calls[1].receiver,node);assert.equal(calls[1].args[0],options);
    assert.throws(()=>proto.focus.call(null),e=>e===failure);assert.deepEqual(calls.slice(2).map(c=>c.kind),['baseline','native']);
    const snapshot=prelude.snapshot();assert.equal(snapshot.focus.calls,2);assert.equal(snapshot.focus.beforeCaptures,2);assert.equal(snapshot.focus.nativeThrows,1);
    assert.equal(snapshot.hostTimersUnmodified,true);assert.equal(win.setTimeout,priorTimer);assert.equal(win.Date.now(),PARTNER_EPOCH_MS);
    assert.equal(new win.Date().getTime(),PARTNER_EPOCH_MS);assert.equal(new win.Date('2026-11-18T12:00:00Z').toISOString(),'2026-11-18T12:00:00.000Z');
    assert.deepEqual(prelude.restore(),{focus:true,clock:true,storage:true});assert.equal(proto.focus,delegated);assert.equal(win.Date,priorDate);
    assert.throws(()=>prelude.restore(),/PARTNER_PRELUDE_RESTORE_NOT_CURRENT/);Object.defineProperty(proto,'focus',original);
  }finally{dom.window.close();}
});

test('partner prelude records reentrant app focus and refuses false Storage restoration while a mounted fixture still owns its guard', async () => {
  const {JSDOM}=await import('jsdom'),route=partnerGalleryRoute('partner-links','ready'),dom=new JSDOM('<button>A</button><button>B</button>',{url:'http://127.0.0.1:9999'+route});
  try{
    const win=dom.window,nodes=win.document.querySelectorAll('button'),proto=win.HTMLElement.prototype,descriptor=Object.getOwnPropertyDescriptor(proto,'focus');
    Object.defineProperty(proto,'focus',{...descriptor,value:function(){if(this===nodes[0])return nodes[1].focus();return 'nested';}});
    const prelude=installPartnerPrelude(win,[route],installPartnerStorageObservation,()=>{});assert.equal(nodes[0].focus(),'nested');
    assert.equal(prelude.snapshot().focus.reentrantCalls,1);assert.equal(prelude.snapshot().focus.maxDepth,2);
    const guarded=()=>{throw new Error('mounted-guard');};win.Storage.prototype.setItem=guarded;
    assert.deepEqual(prelude.restore(),{focus:true,clock:true,storage:false});assert.equal(win.Storage.prototype.setItem,guarded);
    assert.throws(()=>win.localStorage.setItem('not-stored','short-value'),/mounted-guard/);assert.equal(win.localStorage.length,0);
  }finally{dom.window.close();}
});

function partnerTestSnapshot(selection,reads=[]){return {schemaVersion:1,mode:PARTNER_COMPONENT_SCOPE,page:selection.page,case:selection.selectedCase,generation:1,active:true,provider:'NOT_OBSERVED',reads,pending:0,held:0,violations:[],droppedRecords:0,restore:{fetch:null,storage:null,hook:null},clock:{expectedEpochMs:PARTNER_EPOCH_MS,observedEpochMs:PARTNER_EPOCH_MS},storage:{coverage:'gallery-only',before:{session:0,local:0},after:{session:0,local:0},cleanup:[],setItemAttempts:0}};}
test('partner typed snapshot rejects unknown credential fields, wrong identity/clock, persistence, drops and false provider restoration',()=>{
  const selection={page:'partner-links',selectedCase:'signed-out'},base=partnerTestSnapshot(selection);
  assert.equal(validatePartnerSnapshot(base,selection),base);
  for(const bad of [{...base,credential:'short-sentinel'},{...base,page:'partner-dashboard'},{...base,provider:'UNMOUNTED'},{...base,clock:{...base.clock,observedEpochMs:0}},{...base,droppedRecords:1},{...base,storage:{...base.storage,setItemAttempts:1}},{...base,storage:{...base.storage,after:{session:1,local:0}}}])assert.throws(()=>validatePartnerSnapshot(bad,selection));
  const retired={...base,active:false};assert.equal(validatePartnerSnapshot(retired,selection,{retired:true}),retired);
  assert.throws(()=>validatePartnerSnapshot({...retired,restore:{...retired.restore,storage:false}},selection,{retired:true}));
});
test('partner automatic eligible-empty alias census is required and every GET is bound to exact independent response bytes',()=>{
  const selection={page:'partner-links',selectedCase:'empty'},origin='http://127.0.0.1:9999';
  const read=path=>({method:'GET',path,ordinal:1,...partnerExpectedResponse(selection,path,1,origin)});
  const base=partnerTestSnapshot(selection,[read(PARTNER_READ_PATHS[1]),read(PARTNER_READ_PATHS[2])]);
  assert.equal(assertPartnerReadCensus(base,selection,origin).automaticAliasReads,1);
  assert.throws(()=>assertPartnerReadCensus({...base,reads:base.reads.slice(0,1)},selection,origin),/ALIAS/);
  assert.throws(()=>assertPartnerReadCensus({...base,reads:[{...base.reads[0],responseSha256:'f'.repeat(64)},base.reads[1]]},selection,origin),/RESPONSE_BYTES/);
  assert.throws(()=>assertPartnerReadCensus({...base,pending:1},selection,origin),/UNSETTLED/);
  assert.throws(()=>assertPartnerReadCensus({...base,reads:[...base.reads,{method:'GET',path:PARTNER_READ_PATHS[0],ordinal:1,...partnerExpectedResponse(selection,PARTNER_READ_PATHS[0],1,origin)}]},selection,origin),/PATH_CENSUS/);
  const signed={page:'partner-links',selectedCase:'signed-out'};assert.equal(assertPartnerReadCensus(partnerTestSnapshot(signed),signed,origin).count,0);
});
test('partner read diagnostics never retain unknown paths, query secrets, credential markers or external URL fingerprints',()=>{
  const origin='http://127.0.0.1:9999',asset=new Set(['assets/fixed.js']);
  assert.equal(partnerSafeNetworkTarget(origin+'/assets/fixed.js',origin,asset),'/assets/fixed.js');
  assert.equal(partnerSafeNetworkTarget(origin+partnerGalleryRoute('partner-links','ready'),origin,asset),partnerGalleryRoute('partner-links','ready'));
  const outputs=['https://private.invalid/x',origin+'/DISPLAY-NOT-A-CREDENTIAL.short.NO-SIGNATURE',origin+'/api/config?token=p7',origin+'/assets/unknown.js',origin+'/api/config#secret'].map(v=>partnerSafeNetworkTarget(v,origin,asset));
  assert.ok(outputs.every(v=>v==='OFF_CONTRACT_REDACTED'));for(const secret of ['private.invalid','short','p7','NO-SIGNATURE','unknown.js'])assert.equal(JSON.stringify(outputs).includes(secret),false);
});
test('partner same-baseline QR scope excludes background and refuses absent/ambiguous modal, missing scope and foreign active focus',async()=>{
  const {JSDOM}=await import('jsdom'),dom=new JSDOM('<button id="background">Outside</button><dialog open aria-label="Enlarged referral QR"><button id="close">Close QR</button></dialog>');
  try{const doc=dom.window.document,background=doc.querySelector('#background'),close=doc.querySelector('#close'),baselines=new WeakMap([[background,{identity:'background'}],[close,{identity:'close'}]]);
    close.focus();const observed=collectPartnerQrScope(doc,{baselines},['background','close']);assert.deepEqual(observed.order,['close']);assert.equal(observed.inside,true);
    background.focus();assert.equal(collectPartnerQrScope(doc,{baselines},['background','close']).inside,false);
    assert.equal(collectPartnerQrScope(doc,{baselines},['background']).state,'UNOBSERVABLE');
    const extra=doc.querySelector('dialog').cloneNode(true);doc.body.append(extra);assert.equal(collectPartnerQrScope(doc,{baselines},['close']).state,'UNOBSERVABLE');extra.remove();doc.querySelector('dialog').remove();assert.equal(collectPartnerQrScope(doc,{baselines},['close']).state,'UNOBSERVABLE');
  }finally{dom.window.close();}
});
test('partner native action allowlist rejects all mutation/export/clipboard targets before any native input',async()=>{
  let calls=0;const page={evaluate:async()=>{calls++;throw new Error('must not execute');},pressTab:async()=>{calls++;}};
  assert.deepEqual(Object.keys(PARTNER_NATIVE_TARGETS),['assign','cancel','refresh','share','qr']);
  for(const action of ['create','revoke','submit','reassign','copy','download','print','sign-in'])await assert.rejects(partnerNativeTarget(page,action,p=>p,[]),/NOT_APPROVED/);
  assert.equal(calls,0);
});
test('partner full-document cleanup retains exact attribution privacy removals as pass-through facts distinct from cart generations',async()=>{
  const {JSDOM}=await import('jsdom'),route=partnerGalleryRoute('partner-links','ready'),dom=new JSDOM('',{url:'http://127.0.0.1:9999'+route});
  try{const win=dom.window,observer=installPartnerStorageObservation(win,[route]);
    for(const key of ['xen_landing_page','xen_utm','xen_referrer','xen_attribution_schema'])win.sessionStorage.removeItem(key);
    win.sessionStorage.removeItem('xenios.research.memberCart.v2');win.sessionStorage.removeItem('xenios-research-cart-v1');win.localStorage.removeItem('xenios-research-cart-v1');win.sessionStorage.removeItem('xenios-research-cart-v1');win.localStorage.removeItem('xenios-research-cart-v1');
    const facts=observer.snapshot(),proof=partnerStorageCensus(facts);assert.equal(facts.counts.removeItem,9);assert.equal(proof.privacyRemovals.length,4);assert.equal(proof.clearGenerations,1);assert.equal(proof.mountPurgeGenerations,1);
    const bad=structuredClone(facts);[bad.events[0],bad.events[1]]=[bad.events[1],bad.events[0]];assert.throws(()=>partnerStorageCensus(bad),/PRIVACY_CLEANUP_ORDER/);observer.restore();
  }finally{dom.window.close();}
});

test('partner actual native-focus decision rejects wrong identity, background, body, indicator, viewport, occlusion, clipping and small controls',()=>{
  const sample={identity:'real-modal-close',body:false,inside:true,indicator:true,inViewport:true,geometry:{rendered:true,fullyInViewport:true,unobscured:true,indicatorUnclipped:true,width:44,height:46}};
  assert.equal(partnerFocusAccepted(sample,'real-modal-close',{inside:true}),true);
  for(const [key,value] of [['identity','background'],['body',true],['inside',false],['indicator',false],['inViewport',false]])assert.equal(partnerFocusAccepted({...sample,[key]:value},'real-modal-close',{inside:true}),false);
  for(const key of ['rendered','fullyInViewport','unobscured','indicatorUnclipped'])assert.equal(partnerFocusAccepted({...sample,geometry:{...sample.geometry,[key]:false}},'real-modal-close',{inside:true}),false);
  for(const key of ['width','height'])assert.equal(partnerFocusAccepted({...sample,geometry:{...sample.geometry,[key]:43}},'real-modal-close',{inside:true}),false);
});
test('partner actual reporting oracle distinguishes explicit disconnected, omitted/unconfirmed, confirmed zero and positive-context401 from signed-out',()=>{
  const common={h1:['Partner dashboard'],mainCount:1,overflow:false,textTruncated:false,text:'Commission reporting is not connected yet.',loading:false,denial:false,metricError:false,cards:[],signInHrefs:[],alert:[],navs:[{links:[['My account','/research/account'],['Browse catalog','/research/member/catalog'],['Referral links','/research/partners/links'],['Account support','/research/account/support']].map(([text,href])=>({text,href}))}],conversionRows:[]};
  const metrics=[{label:'Leads',value:'Not reported',summary:'This is not a zero count.'},...['Commission-linked conversions','Net recorded commissions','Payable balance'].map(label=>({label,value:'Unavailable',summary:'Commission reporting is not connected yet. This is not a zero count.'}))];
  const disconnected={...common,metrics,identity:'Affiliate active',training:'referral basics (version 1.0)'};assert.ok(partnerUiAssertions(disconnected,{page:'partner-dashboard',selectedCase:'disconnected'}).every(a=>a.passed));
  assert.ok(partnerUiAssertions(disconnected,{page:'partner-dashboard',selectedCase:'unconfirmed'}).some(a=>!a.passed));
  assert.ok(partnerUiAssertions(disconnected,{page:'partner-dashboard',selectedCase:'confirmed-zero'}).some(a=>!a.passed));
  const signedOut={...common,h1:['Referral links'],metrics:[],signInHrefs:['/research/sign-in?returnTo=%2Fresearch%2Fpartners%2Flinks'],cards:[],linksSection:false,codesSection:false};
  assert.equal(partnerUiReady(signedOut,{page:'partner-links',selectedCase:'signed-out'}),true);
  assert.equal(partnerUiReady(signedOut,{page:'partner-links',selectedCase:'api401'}),false);
  assert.equal(partnerUiReady({...signedOut,signInHrefs:[],alert:['Your session has ended. Sign in again to continue.']},{page:'partner-links',selectedCase:'api401'}),true);
});

test('partner native target traverses the actual approved path through baseline, native Tab, resolved identity and measured geometry',async()=>{
  for(const kind of Object.keys(PARTNER_NATIVE_TARGETS)){
    const events=[],progress=[],geometry={rendered:true,fullyInViewport:true,unobscured:true,indicatorUnclipped:true,width:88,height:46};let tabs=0;
    const page={
      async evaluate(expression){
        if(expression===FOCUS_BASELINE_SOURCE){events.push('baseline');return {captured:2};}
        if(expression===FOCUS_PROBE_SOURCE){events.push('probe');return {identity:tabs===2?'approved-'+kind:'intervening-control',body:false,indicator:true,inViewport:true};}
        if(expression===PARTNER_NATIVE_TARGETS[kind]){events.push('resolve');return tabs===2;}
        if(expression===HOME_DISMISS_STATE_SOURCE){events.push('geometry');return {active:geometry};}
        assert.fail('OUT_OF_SCOPE_EVALUATION');
      },
      async pressTab(options){assert.equal(options.shift,false);events.push('native-Tab');tabs++;},
    };
    const result=await partnerNativeTarget(page,kind,work=>work,progress);
    assert.equal(result.identity,'approved-'+kind);assert.equal(result.geometry,geometry);assert.equal(tabs,2);
    assert.deepEqual(events,['baseline','native-Tab','probe','resolve','baseline','native-Tab','probe','resolve','geometry']);
    assert.deepEqual(progress.map(item=>item.matched),[false,true]);assert.equal(progress[1].sample,result);
  }
});
test('partner native entrypoint keeps independent expression scope and retains rejected target geometry without further input',async()=>{
  let calls=0;const noInput={evaluate:async()=>{calls++;assert.fail('OUT_OF_SCOPE_EVALUATION');},pressTab:async()=>{calls++;assert.fail('OUT_OF_SCOPE_INPUT');}};
  for(const kind of [DISPLAY_DETAILS_TARGET,'document.body.click()','toString',{toString(){assert.fail('KEY_COERCION');}}])await assert.rejects(partnerNativeTarget(noInput,kind,work=>work,[]),{message:'PARTNER_NATIVE_ACTION_NOT_APPROVED'});
  for(const expression of Object.values(PARTNER_NATIVE_TARGETS))await assert.rejects(nativeDisplayTarget(noInput,expression,work=>work,[]),{message:'DISPLAY_NATIVE_TARGET_NOT_APPROVED'});
  assert.equal(calls,0);
  const progress=[],geometry={rendered:true,fullyInViewport:true,unobscured:false,indicatorUnclipped:true,width:88,height:46};let tabs=0;
  const page={async evaluate(expression){if(expression===FOCUS_BASELINE_SOURCE)return {};if(expression===FOCUS_PROBE_SOURCE)return {identity:'actual-covered-target',body:false,indicator:true,inViewport:true};if(expression===PARTNER_NATIVE_TARGETS.assign)return true;if(expression===HOME_DISMISS_STATE_SOURCE)return {active:geometry};assert.fail('OUT_OF_SCOPE_EVALUATION');},async pressTab(){tabs++;}};
  await assert.rejects(partnerNativeTarget(page,'assign',work=>work,progress),{message:'PARTNER_NATIVE_TARGET_OBSCURED_CLIPPED_OR_SMALL'});
  assert.equal(tabs,1);assert.equal(progress.length,1);assert.equal(progress[0].matched,true);assert.equal(progress[0].sample.geometry,geometry);
});

test('SDK capability recognition accepts only primitive equal two-Number nonce strings without key/value coercion',()=>{
  for(const nonce of ['lswt-0.1250.5','lswt-00','lswt-1e-70.25','lswt-0.10'])assert.equal(isPartnerSdkCapabilityProbe(nonce,nonce),true);
  let coerced=0;const object={toString(){coerced++;return 'lswt-0.1250.5';},get length(){coerced++;return 1;}};
  for(const [key,value] of [[object,object],['lswt-0.1250.5',object],['lswt-0.1250.5','synthetic-short-secret'],['lswt-nonce','lswt-nonce'],['lswt-1.10','lswt-1.10'],['lswt-0.100.5','lswt-0.100.5'],['lswt-NaN0','lswt-NaN0'],['lswt-0.5'.repeat(20),'lswt-0.5'.repeat(20)]])assert.equal(isPartnerSdkCapabilityProbe(key,value),false);
  assert.equal(coerced,0);
});
function sdkProbePrivacyCleanup(win){for(const key of ['xen_landing_page','xen_utm','xen_referrer','xen_attribution_schema'])win.sessionStorage.removeItem(key);}
function sdkProbeCartCleanup(win){win.sessionStorage.removeItem('xenios-research-cart-v1');win.localStorage.removeItem('xenios-research-cart-v1');win.sessionStorage.removeItem('xenios.research.memberCart.v2');win.sessionStorage.removeItem('xenios-research-cart-v1');win.localStorage.removeItem('xenios-research-cart-v1');}
test('actual prelude delegates one synchronous SDK-shaped capability pair, proves transient effects/caller and preserves total method counts without nonce disclosure',async()=>{
  const {JSDOM}=await import('jsdom'),route=partnerGalleryRoute('partner-links','ready'),origin='http://127.0.0.1:9999';
  const dom=new JSDOM('',{url:origin+route,runScripts:'outside-only'});
  try{
    const win=dom.window,proto=win.Storage.prototype,set=Object.getOwnPropertyDescriptor(proto,'setItem'),remove=Object.getOwnPropertyDescriptor(proto,'removeItem'),nativeCalls=[];
    Object.defineProperty(proto,'setItem',{...set,value:function(...args){nativeCalls.push({method:'setItem',receiver:this,args});return Reflect.apply(set.value,this,args);}});
    Object.defineProperty(proto,'removeItem',{...remove,value:function(...args){nativeCalls.push({method:'removeItem',receiver:this,args});return Reflect.apply(remove.value,this,args);}});
    const beforeTimer=win.setTimeout,prelude=installPartnerPrelude(win,[route],installPartnerStorageObservation,()=>{});sdkProbePrivacyCleanup(win);
    win.eval(`function sdkCapabilityWitness(){const nonce='lswt-0.1250.5';const setResult=localStorage.setItem(nonce,nonce);if(setResult!==undefined||localStorage.length!==1||localStorage.getItem(nonce)!==nonce)throw new Error('NATIVE_SET_EFFECT_INVALID');const removeResult=localStorage.removeItem(nonce);if(removeResult!==undefined||localStorage.length!==0)throw new Error('NATIVE_REMOVE_EFFECT_INVALID');}sdkCapabilityWitness();\n//# sourceURL=${origin}/assets/sdk-capability-unit.js`);
    sdkProbeCartCleanup(win);const observation=prelude.snapshot(),facts=observation.storage,proof=partnerStorageCensus(facts);
    assert.equal(facts.counts.setItem,1);assert.equal(facts.counts.removeItem,10);assert.equal(facts.counts.unknownRemoval,0);
    assert.equal(proof.noSetItem,false);assert.equal(proof.noOrdinaryWrites,true);assert.equal(proof.capabilityProbe.pairs,1);assert.equal(proof.totalRemoveItemCalls,10);
    assert.deepEqual(facts.events.slice(4,6).map(e=>[e.method,e.beforePresent,e.afterPresent,e.beforeLocalLength,e.afterLocalLength]),[['setItem',false,true,0,1],['removeItem',true,false,1,0]]);
    assert.equal(facts.capabilityProbe.caller.setSupported,true);assert.equal(facts.capabilityProbe.caller.removeSupported,true);assert.equal(facts.capabilityProbe.caller.ancestryEqual,true);assert.equal(facts.capabilityProbe.nonceRetained,false);
    const actualSet=nativeCalls.find(c=>c.method==='setItem');assert.equal(actualSet.receiver,win.localStorage);assert.deepEqual(actualSet.args,['lswt-0.1250.5','lswt-0.1250.5']);
    for(const secret of ['lswt-0.1250.5','sdkCapabilityWitness','sdk-capability-unit.js',origin,'at captureCaller'])assert.equal(JSON.stringify(observation).includes(secret),false);
    assert.equal(win.setTimeout,beforeTimer);assert.equal(observation.hostTimersUnmodified,true);assert.deepEqual(prelude.restore(),{focus:true,clock:true,storage:true});
  }finally{dom.window.close();}
});
test('actual storage observation rejects prequeued removal before expiry and all asynchronous, mismatched, repeated, retained, late or throwing probe variants',async()=>{
  const {JSDOM}=await import('jsdom'),route=partnerGalleryRoute('partner-links','ready'),origin='http://127.0.0.1:9999';
  for(const variant of ['prequeued','asynchronous','mismatched','session','unknown','repeated','retained','interleaved','late','nonempty','throwing','unobservable']){
    const dom=new JSDOM('',{url:origin+route,runScripts:'outside-only'});
    try{
      const win=dom.window,proto=win.Storage.prototype;
      if(variant==='unobservable'){const OriginalError=win.Error;win.Error=class extends OriginalError{constructor(){super();this.stack='unsupported';}};}
      if(variant==='nonempty')win.localStorage.setItem('preexisting-synthetic-key','preexisting-synthetic-value');
      const failure=new Error('native-negative');
      if(variant==='throwing'){const original=Object.getOwnPropertyDescriptor(proto,'setItem');Object.defineProperty(proto,'setItem',{...original,value:function(){throw failure;}});}
      const observer=installPartnerStorageObservation(win,[route]);sdkProbePrivacyCleanup(win);
      if(variant==='late')Object.defineProperty(win,'__xeniosPartnerComponentDisplayV1',{value:{},configurable:true});
      const basic=`function capabilityAction(){const nonce='lswt-0.1250.5';localStorage.setItem(nonce,${variant==='mismatched'?"'synthetic-short-secret'":'nonce'});${variant==='interleaved'?"sessionStorage.removeItem('xenios-research-cart-v1');":''}${variant==='retained'?'':'localStorage.removeItem(nonce);'}}`;
      let script=basic+'capabilityAction();';
      if(variant==='prequeued')script=`function sameSdkFunction(action){const nonce='lswt-0.1250.5';if(action==='set')localStorage.setItem(nonce,nonce);else localStorage.removeItem(nonce);}queueMicrotask(function earlierRemoval(){sameSdkFunction('remove');});sameSdkFunction('set');`;
      if(variant==='asynchronous')script=`function capabilityAction(){const nonce='lswt-0.1250.5';localStorage.setItem(nonce,nonce);Promise.resolve().then(function laterRemoval(){localStorage.removeItem(nonce);});}capabilityAction();`;
      if(variant==='session')script=script.replaceAll('localStorage','sessionStorage');
      if(variant==='unknown')script=script.replaceAll('lswt-0.1250.5','ordinary-synthetic-key');
      if(variant==='repeated')script+='capabilityAction();';
      if(variant==='throwing')assert.throws(()=>win.eval(script+`\n//# sourceURL=${origin}/assets/sdk-capability-unit.js`),error=>error===failure);
      else win.eval(script+`\n//# sourceURL=${origin}/assets/sdk-capability-unit.js`);
      await Promise.resolve();sdkProbeCartCleanup(win);const facts=observer.snapshot();assert.throws(()=>partnerStorageCensus(facts));
      assert.equal(facts.capabilityProbe.nonceRetained,false);
      if(variant==='prequeued'){assert.equal(facts.capabilityProbe.caller.setSupported,true);assert.equal(facts.capabilityProbe.caller.removeSupported,true);assert.equal(facts.capabilityProbe.caller.ancestryEqual,false);assert.equal(win.localStorage.length,0);assert.equal(facts.counts.setItem,1);}
      if(variant==='retained')assert.equal(win.localStorage.length,1);
      if(variant==='unobservable'){assert.equal(facts.capabilityProbe.caller.setSupported,false);assert.equal(facts.capabilityProbe.state,'CALLER_WITNESS_UNAVAILABLE');assert.equal(win.localStorage.length,0);}
      for(const secret of ['lswt-0.1250.5','synthetic-short-secret','ordinary-synthetic-key','preexisting-synthetic-value',origin,'earlierRemoval'])assert.equal(JSON.stringify(facts).includes(secret),false);
      observer.restore();
    }finally{dom.window.close();}
  }
});
test('SDK capability source gate binds actual installed bytes and frozen lock; changed/missing bytes cannot provide probe authority',()=>{
  const inputs=new Map(['package-lock.json',...PARTNER_SDK_PROBE_SOURCE.files.map(pin=>pin.path)].map(path=>[path,readFileSync(join(displayRepo,path))]));
  const proof=verifyPartnerSdkProbeBytes(inputs);assert.equal(proof.packageVersion,'2.108.2');assert.equal(proof.files.length,10);assert.match(proof.registryTarballIntegrity,/NOT_RECORDED/);
  const modified=new Map(inputs),path='node_modules/@supabase/auth-js/dist/module/lib/helpers.js';modified.set(path,Buffer.concat([inputs.get(path),Buffer.from('\n// source drift')]));assert.throws(()=>verifyPartnerSdkProbeBytes(modified),/SOURCE_BYTES_MISMATCH/);
  const missing=new Map(inputs);missing.delete(path);assert.throws(()=>verifyPartnerSdkProbeBytes(missing),/SOURCE_INPUTS_INVALID/);
  const lock=new Map(inputs);lock.set('package-lock.json',Buffer.from('{}'));assert.throws(()=>verifyPartnerSdkProbeBytes(lock),/LOCK_MISMATCH/);
});

test('real deep common caller prefix cannot prove a prequeued removal when the native default stack omits the differing entry',async()=>{
  const {JSDOM}=await import('jsdom'),route=partnerGalleryRoute('partner-links','ready'),origin='http://127.0.0.1:9999';
  const dom=new JSDOM('',{url:origin+route,runScripts:'outside-only'});
  try{
    const win=dom.window,nativeLimit=Object.getOwnPropertyDescriptor(win.Error,'stackTraceLimit');
    assert.equal(nativeLimit?.value,10); // Observe V8's real default; never set it.
    const observer=installPartnerStorageObservation(win,[route]);sdkProbePrivacyCleanup(win);
    win.eval(`
      function namedSdkAction(kind){const nonce='lswt-0.1250.5';if(kind==='set')localStorage.setItem(nonce,nonce);else localStorage.removeItem(nonce);}
      function forwardSeven(kind){return namedSdkAction(kind);}
      function forwardSix(kind){return forwardSeven(kind);}
      function forwardFive(kind){return forwardSix(kind);}
      function forwardFour(kind){return forwardFive(kind);}
      function forwardThree(kind){return forwardFour(kind);}
      function forwardTwo(kind){return forwardThree(kind);}
      function forwardOne(kind){return forwardTwo(kind);}
      queueMicrotask(function prequeuedEntry(){forwardOne('remove');});
      forwardOne('set');
      //# sourceURL=${origin}/assets/sdk-deep-common-chain-unit.js`);
    await Promise.resolve();sdkProbeCartCleanup(win);const facts=observer.snapshot();
    assert.equal(win.localStorage.length,0);assert.equal(facts.counts.setItem,1);assert.equal(facts.counts.removeItem,10);
    assert.equal(facts.capabilityProbe.caller.setSupported,true);assert.equal(facts.capabilityProbe.caller.removeSupported,true);
    assert.equal(facts.capabilityProbe.caller.atLimit,true);assert.equal(facts.capabilityProbe.caller.framesCompared,8);
    assert.equal(facts.capabilityProbe.caller.ancestryEqual,false);assert.equal(facts.capabilityProbe.pairs,0);
    assert.equal(facts.capabilityProbe.state,'CALLER_EVIDENCE_TRUNCATED');assert.equal(facts.capabilityProbe.nonceRetained,false);
    assert.throws(()=>partnerStorageCensus(facts));
    // Even a claimed result with otherwise repaired counters must be refused
    // at the final proof gate when its ACTUAL caller evidence was truncated.
    const claimed=structuredClone(facts);claimed.counts.unknownRemoval=0;
    Object.assign(claimed.capabilityProbe,{state:'PROVEN_BALANCED_NONPERSONAL_CAPABILITY',removeItemCalls:1,pairs:1,violations:0,keyEqualsValue:true,sameTurn:true});
    claimed.capabilityProbe.caller.ancestryEqual=true;
    assert.throws(()=>partnerStorageCensus(claimed),{message:'PARTNER_SDK_PROBE_NOT_PROVEN'});
    for(const secret of ['lswt-0.1250.5',origin,'namedSdkAction','forwardOne','prequeuedEntry','sdk-deep-common-chain-unit.js'])assert.equal(JSON.stringify(facts).includes(secret),false);
    assert.equal(Object.getOwnPropertyDescriptor(win.Error,'stackTraceLimit').value,nativeLimit.value);observer.restore();
  }finally{dom.window.close();}
});

test('actual partner collector isolates owned sign-in from desktop/mobile/footer chrome and refuses missing, duplicated, foreign or ambiguous ownership',async()=>{
  const {JSDOM}=await import('jsdom'),target='/research/sign-in?returnTo=%2Fresearch%2Fpartners%2Flinks';
  const nav='<nav aria-label="Partner tools">'+[['Partner dashboard','/research/partners/dashboard'],['Referral links','/research/partners/links'],['Partner resources','/research/partners/resources'],['My account','/research/account'],['Account support','/research/account/support']].map(([text,href])=>`<a href="${href}">${text}</a>`).join('')+'</nav>';
  const rules='<p>An open or linked account does not mean an order, payment, clinical relationship, or earned commission.</p><p>Share only approved content and disclose your partner relationship in the message itself.</p>';
  const shell=main=>`<header><nav><a href="/research/sign-in">Sign in</a></nav><details><summary>Explore Xenios</summary><nav><a href="/research/sign-in">Sign in</a></nav></details></header>${main}<footer><a href="/research/sign-in">Sign in</a></footer>`;
  const content=owned=>`<h1>Referral links</h1>${nav}<h2>Sign in to manage your links</h2>${owned}`;
  const owned=`<a href="${target}">Sign in</a>`,selection={page:'partner-links',selectedCase:'signed-out'};
  for(const variant of ['owned','shell-only','wrong-returnTo','duplicate-owned','missing-main','ambiguous-main','positive-context401']){
    let main=`<main>${content(variant==='shell-only'?'':variant==='wrong-returnTo'?'<a href="/research/sign-in?returnTo=%2Fresearch%2Faccount">Sign in</a>':variant==='duplicate-owned'?owned+owned:owned)}</main>`;
    if(variant==='missing-main')main=`<section>${content(owned)}</section>`;
    if(variant==='ambiguous-main')main+=`<main>${owned}</main>`;
    if(variant==='positive-context401')main=`<main><h1>Referral links</h1>${nav}<div role="alert"><p>Your session has ended. Sign in again to continue.</p><button id="recommendation-refresh-error">Refresh links</button></div>${rules}</main>`;
    const dom=new JSDOM(shell(main),{url:'http://127.0.0.1:9999/research/__gallery/partner-links?case=ready'});
    try{
      const view=collectPartnerView(dom.window.document,dom.window);
      if(variant==='owned'){
        assert.deepEqual(view.signInHrefs,[target]);assert.deepEqual(view.signInScope,{state:'UNIQUE_COMPONENT_MAIN',documentCount:4,componentCount:1,outsideComponentCount:3});
        assert.equal(partnerUiReady(view,selection),true);assert.ok(partnerUiAssertions(view,selection).every(a=>a.passed));
      }else if(variant==='positive-context401'){
        const positive={page:'partner-links',selectedCase:'api401'};assert.deepEqual(view.signInHrefs,[]);assert.equal(view.signInScope.documentCount,3);assert.equal(view.signInScope.outsideComponentCount,3);
        assert.equal(partnerUiReady(view,positive),true);assert.ok(partnerUiAssertions(view,positive).every(a=>a.passed));
      }else if(variant==='wrong-returnTo'){
        assert.equal(partnerUiReady(view,selection),true);assert.equal(partnerUiAssertions(view,selection).find(a=>a.name==='context_or_dashboard401_signin_no_data').passed,false);
      }else{
        assert.equal(partnerUiReady(view,selection),false);assert.ok(view.signInScope.documentCount>=3);
        if(variant==='duplicate-owned')assert.equal(view.signInHrefs.length,2);
        else assert.equal(view.signInHrefs.length,0);
        if(variant==='missing-main')assert.equal(view.signInScope.state,'MISSING_COMPONENT_MAIN');
        if(variant==='ambiguous-main')assert.equal(view.signInScope.state,'AMBIGUOUS_COMPONENT_MAIN');
      }
    }finally{dom.window.close();}
  }
});

// MC10 controls are authored source. Running them requires Root's owned CI slot.
import {LEGACY_DISPLAY_CONTRACT,MC10_DISPLAY_CONTRACT,MC10_SCOPE,MC10_REFERENCE,MC10_CANONICAL_PINS,
  MC10_UI_BINDING,MC10_CONFIGURATIONS,MC10_PNG_CAP,MC10_CONTACT,MC10_CONTACT_WIRE,MC10_POLICY_REVISION,
  MC10_ADMISSION_PATH,MC10_GET_PATHS,selectedDisplayContract,mc10CapturePlan,mc10CatalogQuery,
  requireMC10UiBinding,collectMC10View,assertMC10Stage,assertMC10Dock,mc10NativeTargetSource,
  mc10TransitionProof,mc10NativeTarget,mc10ActiveGeometrySource,mc10SelectUnitedStates,mc10LastRemovalContinuation,installMC10FocusObservation} from './owned-runner-browser-qa.mjs';
import {createMC10DisplayData,verifyMC10CanonicalInputs,createMC10AdmissionFixture} from './owned-runner-preview.ts';
import {createCatalogAdmissionApi} from '../../client/src/research/early-access/catalog-admission-api.ts';
import {catalogPriceFields} from '../../shared/research/early-access/quote-only.ts';

let mc10CanonicalData;
const actualMC10Data=()=>mc10CanonicalData??=createMC10DisplayData(displayRepo);

test('MC10 closed version keeps legacy-eight default and rejects unknown, empty and cross-scenario selections',()=>{
  assert.equal(selectedDisplayContract(DISPLAY_SCENARIO),LEGACY_DISPLAY_CONTRACT);
  assert.deepEqual(scenarioDefinition(DISPLAY_SCENARIO).configurations,DISPLAY_CONFIGURATIONS);
  assert.deepEqual(scenarioDefinition(DISPLAY_SCENARIO,LEGACY_DISPLAY_CONTRACT),scenarioDefinition(DISPLAY_SCENARIO));
  assert.equal(scenarioDefinition(DISPLAY_SCENARIO,MC10_DISPLAY_CONTRACT).scope,MC10_SCOPE);
  for(const value of ['',null,'mc10','mc10-476-v2',' legacy-eight-v1'])assert.throws(()=>selectedDisplayContract(DISPLAY_SCENARIO,value),/DISPLAY_CONTRACT_/u);
  for(const scenario of [PUBLIC_SCENARIO,PREMIUM_ENTRY_SCENARIO,PARTNER_COMPONENT_SCENARIO])assert.throws(()=>scenarioDefinition(scenario,MC10_DISPLAY_CONTRACT),/SCENARIO_MISMATCH/u);
  assert.throws(()=>requireMC10UiBinding({state:'AWAITING_ROOT_ACCEPTED_UI'}),/MC10_UI_BINDING_UNRESOLVED/u);
});

test('MC10 exact six width/font profiles select only twelve images and retain the unchanged absolute startup reserve',()=>{
  assert.deepEqual(MC10_CONFIGURATIONS.map(({width,font})=>[width,font]),[[320,16],[375,16],[390,16],[320,32],[375,32],[390,32]]);
  assert.ok(MC10_CONFIGURATIONS.every(config=>config.height===844));
  const plan=mc10CapturePlan();assert.equal(plan.length,24);assert.equal(plan.filter(item=>item.selected).length,MC10_PNG_CAP);assert.equal(MC10_PNG_CAP,12);
  assert.equal(plan.filter(item=>item.scene==='catalog-empty-dock'&&item.selected).length,6);
  assert.equal(plan.filter(item=>item.scene==='pre-intake'&&item.selected).length,2);
  assert.equal(plan.filter(item=>item.scene==='populated-dock'&&item.selected).length,2);
  assert.equal(plan.filter(item=>item.scene==='post-last-removal'&&item.selected).length,2);
  assert.ok(plan.every(item=>item.state==='NOT_RUN'));
  assert.equal(ownedStartupBudget(300000,275001),0);assert.equal(ownedStartupBudget(300000,0),45000);
});

test('actual wrapper sources only the closed display-version validator without setup or scenario laundering',()=>{
  const shell=fileURLToPath(new URL('./owned-runner-browser-qa.sh',import.meta.url));
  for(const [scenario,value,status]of [[DISPLAY_SCENARIO,LEGACY_DISPLAY_CONTRACT,0],[DISPLAY_SCENARIO,MC10_DISPLAY_CONTRACT,0],
    [PUBLIC_SCENARIO,LEGACY_DISPLAY_CONTRACT,0],[PUBLIC_SCENARIO,MC10_DISPLAY_CONTRACT,1],[PREMIUM_ENTRY_SCENARIO,MC10_DISPLAY_CONTRACT,1],
    [PARTNER_COMPONENT_SCENARIO,MC10_DISPLAY_CONTRACT,1],[DISPLAY_SCENARIO,'',1],[DISPLAY_SCENARIO,'mc10-476-v1 --run',1]]){
    const child=spawnSync('/bin/bash',['-c','source "$1"; validate_display_contract "$2" "$3"','mc10-version-control',shell,scenario,value],
      {encoding:'utf8',timeout:2000,env:{PATH:'/usr/bin:/bin'}});
    assert.equal(child.status,status);assert.equal(child.stdout,'');assert.equal(child.stderr,'');
  }
});

test('MC10 raw target/version boundary allows one exact admission route and canonical pagination, refusing all other writes and query aliases',()=>{
  const options={displayContract:MC10_DISPLAY_CONTRACT,projectedTotal:476,mc10MediaPaths:[]};
  const classify=(method,target,scenario=DISPLAY_SCENARIO)=>classifyRequest(method,target,assets,scenario,options);
  assert.equal(classify('POST',MC10_ADMISSION_PATH).kind,'mc10_admission');
  assert.equal(classifyRequest('POST',MC10_ADMISSION_PATH,assets,DISPLAY_SCENARIO).kind,'refused');
  for(const target of [MC10_ADMISSION_PATH+'?x=1',MC10_ADMISSION_PATH+'/',MC10_ADMISSION_PATH.replace('/admission','/%61dmission'),
    '/api/research/early-access/request-intents','/api/research/early-access/request-intents/recover',
    '/api/research/early-access/request-intents/prepare','/api/research/early-access/assisted-orders',
    '/api/research/early-access/agreements','/api/research/sign-in','/api/auth/token','https://provider.invalid/action'])
    assert.equal(classify('POST',target).kind,'refused');
  const query=DISPLAY_CATALOG_PATH+'?page=20&pageSize=24';assert.deepEqual(mc10CatalogQuery(query,476),{page:20,pageSize:24});
  assert.equal(classify('GET',DISPLAY_CATALOG_PATH).kind,'refused');assert.equal(classify('GET',query).kind,'catalog_fixture');assert.equal(classify('GET',DISPLAY_CATALOG_PATH+'?search=MOTS-c&page=1&pageSize=24').kind,'catalog_fixture');
  for(const suffix of ['?page=21&pageSize=24','?page=01&pageSize=24','?pageSize=24&page=1','?page=1&pageSize=24&page=1',
    '?page=1&pageSize=24&x=1','?search=BPC%2D157&page=1&pageSize=24','?search=MOTS%2Dc&page=1&pageSize=24','?page=1&pageSize=100'])
    assert.equal(classify('GET',DISPLAY_CATALOG_PATH+suffix).kind,'refused');
  assert.equal(observedMethodAllowed('POST',new URL(MC10_ADMISSION_PATH,'http://127.0.0.1:9999'),'http://127.0.0.1:9999',DISPLAY_SCENARIO,MC10_DISPLAY_CONTRACT),true);
  assert.equal(observedMethodAllowed('POST',new URL(MC10_ADMISSION_PATH,'https://provider.invalid'),'http://127.0.0.1:9999',DISPLAY_SCENARIO,MC10_DISPLAY_CONTRACT),false);
});

test('real canonical MC10 reader and production inquiry projection audit actual rows, finite pages, holds, media and source exclusions separately',async()=>{
  const data=await actualMC10Data(),receipt=data.receipt;
  assert.equal(receipt.declaredProducts,476);assert.equal(receipt.declaredVariants,476);
  assert.ok(receipt.canonicalReaderSelectionTotal>0&&receipt.canonicalReaderSelectionTotal<=476);
  assert.equal(receipt.projectedTotal,data.items.length);assert.equal(receipt.uniqueSourceVariants,data.items.length);
  assert.equal(receipt.projectedTotal+receipt.sourceNotProjected.length,476);
  assert.equal(catalogPriceFields(data.items).length,0);assert.ok(data.items.every(row=>row.unitPriceCents===null&&row.priceVersion===null));
  const walked=[];for(let page=1;page<=Math.ceil(receipt.projectedTotal/24);page++){
    const actual=await data.readPage({page,pageSize:24});assert.equal(actual.total,receipt.projectedTotal);assert.equal(actual.page,page);assert.equal(actual.pageSize,24);
    assert.deepEqual(catalogPriceFields(actual),[]);walked.push(...actual.items);
  }
  assert.deepEqual(walked.map(row=>row.sourceSelection.variantId),data.items.map(row=>row.sourceSelection.variantId));
  assert.equal(new Set(walked.map(row=>JSON.stringify([row.productId,row.variantId]))).size,walked.length);
  const hcg=data.items.find(row=>row.sourceSelection.variantId===displayHcg.variantId);assert.ok(hcg);assert.equal(hcg.reviewedMedia,undefined);
  assert.equal(hcg.intentExclusion,'specification_review');assert.equal(hcg.selectableForReview,true);
  assert.ok(data.items.filter(row=>row.intentExclusion==='non_merchandise').every(row=>row.selectableForReview===false));
  assert.ok(data.assetPins.every(pin=>/^\/research\/product-media\//u.test(pin.path)&&/^[a-f0-9]{64}$/u.test(pin.sha256)));
  assert.ok(Object.values(receipt.representatives).every(identity=>data.items.some(row=>row.productId===identity.productId&&row.variantId===identity.variantId)));
  const search=await data.readPage({search:'BPC-157',page:1,pageSize:24});
  assert.ok(search.items.some(row=>row.productId===data.selection.productId&&row.variantId===data.selection.variantId&&row.selectableForReview&&!row.clinicalReviewRequired));
  assert.equal(receipt.sourceCoverageIsNotPaintedCoverage,true);assert.equal(receipt.actualAssent,false);assert.equal(receipt.persisted,false);
});

test('MC10 refuses a real canonical source-byte drift and a later reconciliation record before importing the projector',()=>{
  const root=mkdtempSync(join(tmpdir(),'owned-mc10-source-'));
  try{
    for(const pin of MC10_CANONICAL_PINS){const path=join(root,pin.path);mkdirSync(displayDirname(path),{recursive:true});writeFileSync(path,readFileSync(join(displayRepo,pin.path)));}
    assert.equal(verifyMC10CanonicalInputs(root).length,MC10_CANONICAL_PINS.length);
    const dataset=join(root,MC10_CANONICAL_PINS[0].path),original=readFileSync(dataset);writeFileSync(dataset,Buffer.concat([original,Buffer.from('\n')]));
    assert.throws(()=>verifyMC10CanonicalInputs(root),/MC10_CANONICAL_SOURCE_MISMATCH/u);writeFileSync(dataset,original);
    writeFileSync(join(root,'config/research/master-catalog-reconciliation-20990101.json'),'{}');
    assert.throws(()=>verifyMC10CanonicalInputs(root),/MC10_HOLD_SOURCE_CHANGED/u);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('MC10 admission generation holds the one exact body, refuses duplicates and retires pending work before successor or expiry',async()=>{
  const fixture=createMC10AdmissionFixture(),abort=new AbortController();
  fixture.begin(MC10_CONFIGURATIONS[0].name);assert.equal(fixture.status().body.admitted,false);
  assert.throws(()=>fixture.catalog(),/BEFORE_ADMISSION/u);
  for(const wire of [MC10_CONTACT_WIRE+' ',JSON.stringify({...MC10_CONTACT,actor:'invented'}),MC10_CONTACT_WIRE.replace(MC10_POLICY_REVISION,'0'.repeat(64))])
    assert.throws(()=>fixture.record(wire,abort.signal,fixture.snapshot().generation),/ADMISSION_REFUSED/u);
  const pending=fixture.record(MC10_CONTACT_WIRE,abort.signal,fixture.snapshot().generation);
  assert.equal(fixture.snapshot().phase,'PENDING_HELD');assert.equal(fixture.status().body.admitted,false);assert.throws(()=>fixture.release('unexpected'),/RELEASE_REFUSED/u);
  assert.throws(()=>fixture.record(MC10_CONTACT_WIRE,abort.signal,fixture.snapshot().generation),/ADMISSION_REFUSED/u);fixture.release(fixture.snapshot().generation);
  assert.equal((await pending).body.admitted,true);fixture.catalog();fixture.expire(fixture.snapshot().generation);assert.equal(fixture.status().body.admitted,false);
  fixture.retire();fixture.begin(MC10_CONFIGURATIONS[1].name);
  const stale=fixture.record(MC10_CONTACT_WIRE,abort.signal,fixture.snapshot().generation);fixture.retire();fixture.begin(MC10_CONFIGURATIONS[2].name);
  assert.equal((await stale).status,409);assert.equal(fixture.status().body.admitted,false);assert.equal(fixture.snapshot().catalogReads,0);
  const nextAbort=new AbortController(),aborted=fixture.record(MC10_CONTACT_WIRE,nextAbort.signal,fixture.snapshot().generation);nextAbort.abort();assert.equal((await aborted).body.admitted,false);
  assert.equal(fixture.snapshot().phase,'EXPIRED');assert.throws(()=>fixture.release(),/RELEASE_REFUSED/u);fixture.retire();
  assert.equal(fixture.census().length,3);assert.equal(fixture.census()[0].posts,1);assert.equal(fixture.census()[2].phase,'EXPIRED');
  assert.ok(!JSON.stringify(fixture.census()).includes(MC10_CONTACT.email));
});

async function mc10HttpControl(run){
  const data=await actualMC10Data(),root=mkdtempSync(join(tmpdir(),'owned-mc10-http-')),ledger=[];
  const inventory=[];
  try{
    const html='<!doctype html><html><head></head><body><div id="root"></div></body></html>';writeFileSync(join(root,'index.html'),html);
    inventory.push({path:'index.html',bytes:Buffer.byteLength(html),sha256:hash(html)});
    for(const pin of data.assetPins){const source=join(displayRepo,'client/public',pin.path.slice(1)),bytes=readFileSync(source);
      const target=join(root,pin.path.slice(1));mkdirSync(displayDirname(target),{recursive:true});writeFileSync(target,bytes);
      inventory.push({path:pin.path.slice(1),bytes:bytes.length,sha256:hash(bytes)});}
    const preview=await startOwnedPreview({root,inventory,ledger,scenario:DISPLAY_SCENARIO,displayContract:MC10_DISPLAY_CONTRACT});
    try{await run(preview,ledger);}finally{await preview.close();}
  }finally{rmSync(root,{recursive:true,force:true});}
}
async function mc10WaitHeld(preview){
  const end=Date.now()+2000;while(Date.now()<end){if(preview.mc10.snapshot().phase==='PENDING_HELD')return;await new Promise(resolve=>setImmediate(resolve));}
  assert.fail('MC10_TEST_HELD_NOT_OBSERVED');
}

test('actual MC10 HTTP handler and actual admission adapter bind exact wire bytes, held confirmation, query DTOs and credential refusals',async()=>{
  await mc10HttpControl(async(preview,ledger)=>{
    const current=preview.mc10.beginCase(MC10_CONFIGURATIONS[0].name);let actualWire=null;
    const api=createCatalogAdmissionApi(()=>null,async(path,init)=>{
      assert.equal(path,MC10_ADMISSION_PATH);assert.equal(init.credentials,'include');assert.equal(init.cache,'no-store');
      if(init.method==='POST')actualWire=init.body;
      return fetch(preview.origin+path,{...init,headers:{...init.headers,Origin:preview.origin},redirect:'error'});
    });
    const signal=new AbortController().signal;assert.equal((await api.status(signal)).admitted,false);
    const early=await fetch(preview.origin+DISPLAY_CATALOG_PATH+'?page=1&pageSize=24');assert.equal(early.status,403);await early.arrayBuffer();
    const pending=api.record(MC10_CONTACT,signal);await mc10WaitHeld(preview);
    assert.ok(actualWire===MC10_CONTACT_WIRE,'MC10_WIRE_BYTES_MISMATCH');assert.equal(preview.mc10.snapshot().catalogReads,0);current.releaseAdmission();
    assert.equal((await pending).admitted,true);assert.equal(preview.counters.admissionPOST,1);
    const response=await fetch(preview.origin+DISPLAY_CATALOG_PATH+'?page=1&pageSize=24');assert.equal(response.status,200);
    const page=await response.json();assert.deepEqual(page,await current.expectedPage(1));assert.deepEqual(catalogPriceFields(page),[]);
    for(const headers of [{Authorization:''},{Cookie:''},{Authorization:'Bearer not-an-identity'}]){
      const denied=await fetch(preview.origin+MC10_ADMISSION_PATH,{headers});assert.equal(denied.status,403);assert.equal(denied.headers.has('set-cookie'),false);await denied.arrayBuffer();
    }
    for(const path of [MC10_ADMISSION_PATH+'?actor=1','/api/research/early-access/request-intents','/api/research/early-access/request-intents/recover']){
      const denied=await fetch(preview.origin+path,{method:'POST',headers:{Origin:preview.origin,'content-type':'application/json'},body:MC10_CONTACT_WIRE});assert.equal(denied.status,404);await denied.arrayBuffer();
    }
    assert.equal(preview.counters.admissionPOST,1);
    assert.ok(ledger.every(row=>!JSON.stringify(row).includes(MC10_CONTACT.email)&&!Object.keys(row.headers).some(key=>key.toLowerCase()==='set-cookie')));
    current.retireCase();const successor=preview.mc10.beginCase(MC10_CONFIGURATIONS[1].name);
    assert.throws(()=>current.releaseAdmission(),/CASE_HANDLE_RETIRED/u);assert.throws(()=>current.expectedPage(1),/CASE_HANDLE_RETIRED/u);
    assert.equal(successor.snapshot().phase,'REQUIRED');assert.equal(successor.snapshot().posts,0);successor.retireCase();
  });
});

test('actual PreCatalogContact gate with actual serializer holds children and refuses drift, malformed and non-OK responses; changed owner cannot revive',async()=>{
  const {JSDOM}=await import('jsdom'),React=await import('react');
  const {act}=React;const names=['React','window','document','navigator','HTMLElement','HTMLFormElement','FormData','IS_REACT_ACT_ENVIRONMENT'];
  const descriptors=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const dom=new JSDOM('<!doctype html><div id="mount"></div>',{url:'http://127.0.0.1/earlyaccess'});
  let root;
  try{
    // Node-tsx's classic JSX factory is supplied only in this saved/restored test context.
    for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='React'?React:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});
    const {PreCatalogContact}=await import('../../client/src/research/early-access/PreCatalogContact.tsx');
    const {createRoot}=await import('react-dom/client');
    for(const outcome of ['valid','drift','malformed','503','changed-owner']){
      const mount=dom.window.document.getElementById('mount');let finish,posts=0,epoch='first';
      const api=createCatalogAdmissionApi(()=>null,async(_path,init)=>{
        if(init.method==='GET')return new Response(JSON.stringify({admitted:false,policyRevision:MC10_POLICY_REVISION}),{status:200});
        posts++;assert.ok(init.body===MC10_CONTACT_WIRE,'MC10_WIRE_BYTES_MISMATCH');return new Promise(resolve=>{finish=resolve;});
      });
      root=createRoot(mount);const render=()=>React.createElement(PreCatalogContact,{sessionEpoch:epoch,api},React.createElement('div',{'data-testid':'actual-child'},'Admitted synthetic child'));
      await act(async()=>root.render(render()));
      const form=mount.querySelector('form[aria-label="Contact information for catalog access"]');assert.ok(form);assert.equal(mount.querySelector('[data-testid="actual-child"]'),null);
      const country=form.querySelector('[name="countryCode"]');country.value='US';await act(async()=>country.dispatchEvent(new dom.window.Event('change',{bubbles:true})));
      for(const [name,value]of Object.entries({fullLegalName:MC10_CONTACT.fullLegalName,email:MC10_CONTACT.email,...MC10_CONTACT.postalAddress}))form.querySelector(`[name="${name}"]`).value=value;
      await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
      assert.equal(posts,1);assert.equal(form.getAttribute('aria-busy'),'true');assert.equal(mount.querySelector('[data-testid="actual-child"]'),null);
      if(outcome==='changed-owner'){epoch='successor';await act(async()=>root.render(render()));}
      const body=outcome==='malformed'?[]:{admitted:true,policyRevision:outcome==='drift'?'0'.repeat(64):MC10_POLICY_REVISION};
      await act(async()=>finish(new Response(JSON.stringify(body),{status:outcome==='503'?503:200})));
      if(outcome==='valid')assert.ok(mount.querySelector('[data-testid="actual-child"]'));
      else assert.equal(mount.querySelector('[data-testid="actual-child"]'),null);
      if(['drift','malformed','503'].includes(outcome))assert.ok(mount.querySelector('[role="alert"]'));
      assert.equal(posts,1);await act(async()=>root.unmount());root=null;
    }
  }finally{
    try{if(root)await act(async()=>root.unmount());}
    finally{
      try{dom.window.close();}
      finally{
        for(const name of names){const descriptor=descriptors.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
        assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'React'),descriptors.get('React'));
      }
    }
  }
});

function mc10NodeBinding(){return {selectors:{intake:'#intake',fullLegalName:'[name="fullLegalName"]',email:'[name="email"]',line1:'[name="line1"]',city:'[name="city"]',region:'[name="region"]',postalCode:'[name="postalCode"]',countryCode:'[name="countryCode"]',confirm:'#confirm',products:'#products',productsHeading:'.products-heading',family:'#family',blocking:'[role="alert"]',rows:'.row',rowName:'.name',rowSpecification:'.specification',rowSummary:'.summary',rowQualifier:'.qualifier',nextPage:'#next',previousPage:'#previous',search:'#search',add:'.add',remove:'.remove',dock:'#dock',dockStatus:'.dock-status',spacer:'#spacer',continue:'#continue',contact:'#contact',back:'#back'},productsSignal:'ACTUAL_VISIBLE_PRODUCTS_BRANCH',productsHeading:'Browse the catalog',rowIdentity:{productId:'data-product-id',variantId:'data-variant-id'}};}

test('actual MC10 DOM collector records raw row/page/qualifier geometry and refuses hidden, pre-admission, ambiguous or incorrect identity surfaces',async()=>{
  const {JSDOM}=await import('jsdom'),binding=mc10NodeBinding(),expected=[{productId:'p',variantId:'v',productName:'Public name',specification:'10 mg',reviewedContent:{summary:'Public summary'}}];
  const dom=new JSDOM('<main data-testid="quick-order-request-only"><section id="products"><h2 class="products-heading">Browse the catalog</h2><input id="search"><select id="family"></select><article class="row" data-product-id="p" data-variant-id="v"><h2 class="name">Public name</h2><p class="specification">10 mg</p><p class="summary">Public summary</p><p class="qualifier">Nonclinical use only</p></article></section></main>',{url:'http://127.0.0.1/earlyaccess'});
  const win=dom.window;win.matchMedia=()=>({matches:true});
  const computed=win.getComputedStyle.bind(win);win.getComputedStyle=node=>new Proxy(computed(node),{get:(target,key)=>key==='opacity'?(target.opacity||'1'):Reflect.get(target,key)});
  Object.defineProperty(win.HTMLElement.prototype,'getClientRects',{value(){return this.closest('[hidden]')?[]:[this.getBoundingClientRect()];}});
  Object.defineProperty(win.HTMLElement.prototype,'getBoundingClientRect',{value(){return {x:0,y:10,width:280,height:this.classList.contains('row')?180:44,top:10,right:280,bottom:190,left:0};}});
  win.Range.prototype.getBoundingClientRect=()=>({x:0,y:10,width:250,height:44,top:10,right:250,bottom:54,left:0});
  try{
    const view=collectMC10View(win.document,win,binding,expected);assertMC10Stage(view,'CONFIRMED_PRODUCTS',expected);assertMC10Dock(view,{empty:true});
    assert.equal(view.rows[0].card.height,180);assert.equal(view.rows[0].qualifier.rendered,true);assert.equal(typeof view.pageLength,'number');
    assert.throws(()=>assertMC10Stage(view,'CONFIRMED_PRODUCTS',[{...expected[0],productId:'wrong'}]),/IDENTITIES_MISMATCH/u);
    const visibleProducts=win.document.getElementById('products');visibleProducts.hidden=true;
    assert.throws(()=>assertMC10Stage(collectMC10View(win.document,win,binding,expected),'CONFIRMED_PRODUCTS',expected),/STAGE_OR_LAYOUT_INVALID/u);
    visibleProducts.hidden=false;visibleProducts.querySelector('.products-heading').textContent='Different stage';assert.throws(()=>assertMC10Stage(collectMC10View(win.document,win,binding,expected),'CONFIRMED_PRODUCTS'),/STAGE_OR_LAYOUT_INVALID/u);
    visibleProducts.querySelector('.products-heading').textContent='Browse the catalog';visibleProducts.insertAdjacentHTML('beforebegin','<form id="intake"></form>');
    assert.throws(()=>assertMC10Stage(collectMC10View(win.document,win,binding,expected),'CONFIRMED_PRODUCTS',expected),/STAGE_OR_LAYOUT_INVALID/u);
  }finally{dom.window.close();}
});

test('MC10 actual native-target loop preserves baseline/Tab/probe/geometry and refuses arbitrary, cross-scope, missing or obscured targets before activation',async()=>{
  const binding=mc10NodeBinding(),events=[],expected=[{productId:'p',variantId:'v',productName:'Public name',specification:'10 mg',reviewedContent:{summary:'Public summary'}}];
  const source=mc10NativeTargetSource(binding,'add',{productId:'p',variantId:'v'},expected);
  for(const kind of ['fullLegalName','countryCode','confirm','search','nextPage','previousPage','continue','back','add','remove']){
    let geometryOk=true;const identity=['add','remove'].includes(kind)?{productId:'p',variantId:'v'}:null;
    const expression=mc10NativeTargetSource(binding,kind,identity,expected);
    const page={pressTab:async()=>events.push('Tab'),evaluate:async text=>{
      if(text===FOCUS_BASELINE_SOURCE){events.push('baseline');return {tabbableIdentities:['target']};}
      if(text===FOCUS_PROBE_SOURCE){events.push('probe');return {body:false,identity:'target',indicator:true,inViewport:true};}
      if(text===expression){events.push('match');return {unique:true,safeKind:true,matched:true};}
      if(text===mc10ActiveGeometrySource()){events.push('geometry');return {active:{rendered:true,fullyInViewport:true,unobscured:geometryOk,indicatorUnclipped:true,width:44,height:44}};}
      assert.fail('UNAPPROVED_MC10_EVALUATION');
    }};
    await mc10NativeTarget(page,binding,kind,identity,work=>work,[],expected);
    assert.deepEqual(events.splice(0),['baseline','Tab','probe','match','geometry']);geometryOk=false;
    await assert.rejects(mc10NativeTarget(page,binding,kind,identity,work=>work,[],expected),/OBSCURED_CLIPPED_OR_SMALL/u);events.length=0;
  }
  assert.ok(source.includes('identity.productId'));assert.throws(()=>mc10NativeTargetSource(binding,'add',{productId:'foreign',variantId:'v'},expected),/CANONICAL_ROW_UNBOUND/u);
  for(const kind of ['submit','request','DISPLAY_DETAILS_TARGET','document.body.click()']){
    const page={pressTab:()=>assert.fail('UNAPPROVED_INPUT'),evaluate:()=>assert.fail('UNAPPROVED_EVALUATION')};
    await assert.rejects(mc10NativeTarget(page,binding,kind,null,work=>work,[]),/NOT_APPROVED/u);
  }
});

test('MC10 last-removal continuation derives actual current order and rejects BODY, wrong successor or occlusion after one native Tab',async()=>{
  for(const mutation of ['none','body','wrong','obscured']){
    const events=[];let after=false;
    const page={pressTab:async()=>{events.push('Tab');after=true;},evaluate:async source=>{
      if(source===FOCUS_BASELINE_SOURCE){events.push('baseline');return {tabbableIdentities:['returned','next','other']};}
      if(source===FOCUS_PROBE_SOURCE)return {body:mutation==='body'&&!after,identity:after?(mutation==='wrong'?'other':'next'):'returned',indicator:true,inViewport:true};
      if(source===mc10ActiveGeometrySource())return {active:{rendered:true,fullyInViewport:true,unobscured:mutation!=='obscured',indicatorUnclipped:true,width:44,height:44}};
      assert.fail('UNAPPROVED_EVALUATION');
    }};
    const progress={};if(mutation==='none'){await mc10LastRemovalContinuation(page,work=>work,progress);assert.equal(progress.expected,'next');assert.equal(progress.next.identity,'next');}
    else await assert.rejects(mc10LastRemovalContinuation(page,work=>work,progress),/MC10_LAST_REMOVAL_/u);
    assert.ok(events.filter(event=>event==='Tab').length<2);assert.ok(progress.returned);
  }
});

test('MC10 pre-app focus observation captures before native call and preserves receiver, args, return, throws and exact descriptor restoration',()=>{
  const calls=[],error=new Error('synthetic native throw');class Element{focus(...args){calls.push(['native',this,args]);if(args[0]==='throw')throw error;return 'native-result';}}
  const native=Object.getOwnPropertyDescriptor(Element.prototype,'focus');const win={location:{pathname:'/earlyaccess',search:'',hash:''},HTMLElement:Element};
  const observer=installMC10FocusObservation(win,()=>calls.push(['baseline'])),element=new Element();
  assert.equal(element.focus({preventScroll:true}),'native-result');assert.deepEqual(calls.map(row=>row[0]),['baseline','native']);assert.equal(calls[1][1],element);
  assert.throws(()=>element.focus('throw'),caught=>caught===error);assert.equal(observer.snapshot().throws,1);assert.equal(observer.snapshot().baselines,2);
  assert.equal(observer.restore(),true);assert.deepEqual(Object.getOwnPropertyDescriptor(Element.prototype,'focus'),native);assert.equal(observer.restore(),false);
});
test('actual MC10 transition orchestrator observes the empty gate before native contact, holds one confirm and stops a pre-admission read before input',async()=>{
  for(const unexpectedRead of [false,true]){
    const binding={...mc10NodeBinding(),state:'ROOT_SELECTED_FROZEN_UI_SOURCE',source:'1'.repeat(40),tree:'2'.repeat(40),selectionReceiptSha256:'3'.repeat(64),
      composedSource:'4'.repeat(40),composedTree:'5'.repeat(40),pins:[{path:'node-control-only',blob:'6'.repeat(40),sha256:'7'.repeat(64),bytes:0}],
      focusContract:'ACTUAL_RETURN_AND_CURRENT_NATIVE_SUCCESSOR'};
    const events=[];let phase='REQUIRED',activeKind=null,country='',catalogReads=unexpectedRead?1:0,confirm=0;
    const item={productId:'node-p',variantId:'node-v',productName:'Node public item',specification:'10 mg',unitPriceCents:null,priceVersion:null};
    const row={productId:item.productId,variantId:item.variantId,identityBound:true,rendered:true,media:[],mediaCount:0,summaryText:'',forbiddenCommercialCopy:false,controlsTruncated:false};
    const view=()=>({stage:phase==='CONFIRMED'?'CONFIRMED_PRODUCTS':'REQUIRED_INTAKE',noAttempt:true,reducedMotion:true,rowsTruncated:false,
      rows:phase==='CONFIRMED'?[row]:[],counts:{products:phase==='CONFIRMED'?1:0,intake:phase==='CONFIRMED'?0:1,rows:phase==='CONFIRMED'?1:0,dock:0,spacer:0},
      viewport:{scrollWidth:390,clientWidth:390},entranceArtworkCount:0,entranceCaptions:0,conversationGridCount:0,confirmBusy:phase==='PENDING_HELD'});
    const nativeKinds=['countryCode','fullLegalName','email','line1','city','region','postalCode','confirm'];
    // Exact real producer expressions, not a regex assumption about serialization.
    const nativeExpressions=new Map(nativeKinds.map(kind=>[mc10NativeTargetSource(binding,kind),kind]));
    assert.equal(nativeExpressions.size,nativeKinds.length);
    const countrySelectProbe="({select:document.activeElement?.tagName==='SELECT',count:[...document.activeElement?.options??[]].filter(option=>option.value==='US').length})";
    const countrySelectedProbe="document.activeElement?.tagName==='SELECT'&&document.activeElement.value==='US'";
    const focusSnapshotProbe='window.__xeniosMC10FocusObservationV1?.snapshot()??null';
    const page={pressTab:async({shift=false}={})=>events.push(shift?'Shift+Tab':'Tab'),settle:async()=>events.push('terminal-idle'),waitForBoundaryTargets:async()=>events.push('boundary-settled'),
      evaluate:async source=>{
        if(source===DISPLAY_NO_ATTEMPT_SOURCE)return true;
        if(source===FOCUS_BASELINE_SOURCE){events.push('baseline');return {tabbableIdentities:['node-control']};}
        if(source===FOCUS_PROBE_SOURCE)return {body:false,identity:'node-control',indicator:true,inViewport:true};
        if(source===mc10ActiveGeometrySource())return {active:{rendered:true,fullyInViewport:true,unobscured:true,indicatorUnclipped:true,width:44,height:44}};
        if(nativeExpressions.has(source)){activeKind=nativeExpressions.get(source);events.push('acquire:'+activeKind);return {unique:true,safeKind:true,matched:true};}
        if(source.startsWith('(function collectMC10View')){events.push('observe:'+phase);return view();}
        if(source===countrySelectProbe)return {select:true,count:1};
        if(source===countrySelectedProbe)return country==='United States';
        if(source===focusSnapshotProbe)return {failures:0,reentrant:0};
        assert.fail('MC10_UNAPPROVED_READ_ONLY_EVALUATION');
      },
      send:async(method,params)=>{
        assert.ok(['Input.dispatchKeyEvent','Input.insertText','Runtime.evaluate'].includes(method));
        if(method==='Input.insertText'){events.push('type:'+activeKind);return;}
        if(method==='Input.dispatchKeyEvent'&&activeKind==='countryCode'&&params.type==='keyDown'&&params.text)country+=params.text;
        if(method==='Input.dispatchKeyEvent'&&params.type==='keyUp'&&params.key==='Enter'){
          assert.equal(activeKind,'confirm');confirm++;phase='PENDING_HELD';events.push('native-confirm');
        }
      },
    };
    // The same mock must reject altered and arbitrary sources, not silently route them.
    await assert.rejects(page.evaluate(nativeExpressions.keys().next().value+'\n'),/MC10_UNAPPROVED_READ_ONLY_EVALUATION/u);
    await assert.rejects(page.evaluate('document.body.click()'),/MC10_UNAPPROVED_READ_ONLY_EVALUATION/u);
    const fixture={snapshot:()=>({phase,catalogReads}),releaseAdmission:()=>{assert.equal(phase,'PENDING_HELD');phase='CONFIRMED';catalogReads++;events.push('release');},expectedPage:async()=>({items:[item],total:1})};
    const progress={},captured=[];
    const operation=mc10TransitionProof({page,binding,config:MC10_CONFIGURATIONS[2],bounded:work=>work,fixture,progress,
      save:async scene=>{captured.push(scene);events.push('save:'+scene);}});
    if(unexpectedRead){await assert.rejects(operation,/MC10_INITIAL_FIXTURE_NOT_REQUIRED/u);assert.equal(confirm,0);assert.equal(events.some(event=>event==='Tab'||event==='Shift+Tab'),false);assert.deepEqual(captured,[]);}
    else{
      const result=await operation;assert.equal(result.state,'OBSERVED_SYNTHETIC_TRANSITIONS_ONLY');assert.equal(confirm,1);
      assert.deepEqual(captured,['catalog-empty-dock']);assert.ok(events.indexOf('native-confirm')<events.indexOf('release'));
      assert.ok(events.indexOf('release')<events.indexOf('save:catalog-empty-dock'));assert.ok(events.indexOf('type:region')>events.indexOf('type:line1'));
      assert.equal(country,'United States');assert.equal(events.at(-1),'boundary-settled');assert.equal(progress.held.fixture.catalogReads,0);
      assert.equal(events.filter(event=>event==='Shift+Tab').length,1);
      const nameAcquired=events.indexOf('acquire:fullLegalName');
      assert.equal(events[nameAcquired-1],'Shift+Tab');assert.ok(events.indexOf('acquire:countryCode')<nameAcquired);
      for(const kind of ['email','line1','city','region','postalCode','confirm'])assert.equal(events[events.indexOf('acquire:'+kind)-1],'Tab');
    }
  }
});
import {legacyAdmittedChromeAssertions,displaySearchProof,displayCatalogDisclosureProofs,DISPLAY_MOTS_TARGET,DISPLAY_SEARCH_TARGET,DISPLAY_FAQ_TARGET} from './owned-runner-browser-qa.mjs';
test('current actual legacy admitted DOM requires its visible catalog branch and absent introduction/dock rather than a removed hero',async()=>{
  const {JSDOM}=await import('jsdom'),booking=PREMIUM_CONTACT_HREFS[2];
  const dom=new JSDOM(`<main data-testid="quick-order-request-only"><section class="xenios-order-page--guest-catalog"><header><h2 class="xenios-order-catalog-start">Browse the catalog</h2></header><label>Search catalog<input data-testid="request-catalog-search"></label><header class="xenios-premium-catalog-header"><a href="${booking}" target="_blank" rel="noopener noreferrer">Book the team</a></header></section></main>`,{url:'http://127.0.0.1/earlyaccess',runScripts:'outside-only'});
  const win=dom.window,computed=win.getComputedStyle.bind(win);
  win.getComputedStyle=node=>new Proxy(computed(node),{get:(target,key)=>key==='opacity'?(target.opacity||'1'):Reflect.get(target,key)});
  Object.defineProperty(win.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
  win.HTMLElement.prototype.getClientRects=function(){return [this.getBoundingClientRect()];};
  win.HTMLElement.prototype.getBoundingClientRect=function(){return {x:0,y:0,left:0,top:0,right:200,bottom:44,width:200,height:44};};
  const read=()=>win.eval(PREMIUM_ENTRY_VIEW_SOURCE);
  try{
    assert.ok(legacyAdmittedChromeAssertions(read()).every(result=>result.passed));
    const h=win.document.querySelector('.xenios-order-catalog-start');h.textContent='Other heading';assert.ok(legacyAdmittedChromeAssertions(read()).some(result=>!result.passed));h.textContent='Browse the catalog';
    const root=win.document.querySelector('main');root.insertAdjacentHTML('beforeend','<div class="xenios-premium-introduction" hidden></div>');
    assert.equal(legacyAdmittedChromeAssertions(read()).find(result=>result.name==='legacy_no_entrance_or_empty_products_dock').passed,false);root.lastElementChild.remove();
    root.insertAdjacentHTML('beforeend','<div data-testid="request-action-bar" hidden></div>');assert.ok(legacyAdmittedChromeAssertions(read()).some(result=>!result.passed));root.lastElementChild.remove();
    win.document.querySelector('a').href='https://unapproved.invalid';assert.ok(legacyAdmittedChromeAssertions(read()).some(result=>!result.passed));
  }finally{dom.window.close();}
});

test('legacy search uses the actual native Search field, observes MOTS canonical result then clears with native keys; no shortcut Enter or POST',async()=>{
  const events=[];let inserted=false,reset=false;
  const page={pressTab:async()=>events.push('Tab'),evaluate:async source=>{
    if(source===FOCUS_BASELINE_SOURCE){events.push('baseline');return {tabbableIdentities:['search']};}
    if(source===FOCUS_PROBE_SOURCE)return {identity:'search',body:false,indicator:true,inViewport:true};
    if(source===DISPLAY_MOTS_TARGET||source===DISPLAY_SEARCH_TARGET)return true;
    if(source===DISPLAY_NO_ATTEMPT_SOURCE)return true;
    if(source.includes('Quote cart (0)'))return true;
    if(source.includes("==='MOTS-C'"))return inserted&&!reset;
    if(source.includes('.length===8'))return reset;
    assert.fail('LEGACY_SEARCH_UNKNOWN_EVALUATION');
  },send:async(method,params)=>{
    assert.ok(['Input.insertText','Input.dispatchKeyEvent'].includes(method));
    if(method==='Input.insertText'){assert.equal(params.text,'MOTS-c');inserted=true;events.push('native-MOTS');}
    else{assert.notEqual(params.key,'Enter');events.push(params.key);if(params.type==='keyDown'&&params.key==='Backspace')reset=true;}
  }};
  const progress=await displaySearchProof(page,work=>work,{});assert.equal(progress.state,'NATIVE_FINITE_SEARCH_DISPLAY_ONLY_OBSERVED');
  assert.ok(events.indexOf('native-MOTS')<events.indexOf('Backspace'));assert.ok(events.indexOf('baseline')<events.indexOf('Tab'));
  const {JSDOM}=await import('jsdom');const dom=new JSDOM('<label>Search catalog<input data-testid="request-catalog-search"></label><details class="xenios-order-optional-guide"><summary tabindex="0">Help me browse (optional)</summary></details><details class="xenios-premium-faq"><summary tabindex="0">Old FAQ</summary></details>',{runScripts:'outside-only'});
  try{const doc=dom.window.document;doc.querySelector('input').focus();assert.equal(dom.window.eval(DISPLAY_MOTS_TARGET),true);
    doc.querySelector('.xenios-order-optional-guide summary').focus();assert.equal(dom.window.eval(DISPLAY_FAQ_TARGET),true);
    doc.querySelector('.xenios-premium-faq summary').focus();assert.equal(dom.window.eval(DISPLAY_FAQ_TARGET),false);
  }finally{dom.window.close();}
});
test('legacy search retains its genuinely native-acquired target for reset and refuses lost, invisible, unproven or mismatched focus before clear keys',async()=>{
  const valid={identity:'native-search',body:false,indicator:true,inViewport:true};
  const cases=[
    {name:'retained',sample:valid,matched:true,accepted:true},
    {name:'body',sample:{body:true},matched:false},
    {name:'no-real-indicator',sample:{...valid,indicator:false},matched:true},
    {name:'outside-viewport',sample:{...valid,inViewport:false},matched:true},
    {name:'different-node',sample:{...valid,identity:'replacement-search'},matched:true},
    {name:'unproven-identity',sample:{...valid,identity:null},matched:true},
    {name:'different-target',sample:valid,matched:false},
  ];
  for(const item of cases){
    const events=[];let tabs=0,typed=false,reset=false;
    const progress={};
    const page={
      async pressTab(){events.push('Tab');tabs++;},
      async evaluate(source){
        if(source===DISPLAY_NO_ATTEMPT_SOURCE)return true;
        if(source===FOCUS_BASELINE_SOURCE){events.push('baseline');return {tabbableIdentities:['native-search']};}
        if(source===FOCUS_PROBE_SOURCE){events.push(typed?'retained-probe':'native-probe');return tabs===1?(typed?item.sample:valid):{body:true};}
        if(source===DISPLAY_MOTS_TARGET||source===DISPLAY_SEARCH_TARGET){events.push(typed?'retained-match':'native-match');return tabs===1&&(typed?item.matched:true);}
        if(source.includes("==='MOTS-C'"))return typed&&!reset;
        if(source.includes('Quote cart (0)'))return true;
        if(source.includes('.length===8'))return reset;
        assert.fail('LEGACY_RETAINED_FOCUS_UNKNOWN_EVALUATION');
      },
      async send(method,params){
        if(method==='Input.insertText'){assert.equal(params.text,'MOTS-c');assert.equal(tabs,1);typed=true;events.push('type');return;}
        assert.equal(method,'Input.dispatchKeyEvent');assert.ok(['a','Backspace'].includes(params.key));
        events.push('clear:'+params.type+':'+params.key);if(params.type==='keyDown'&&params.key==='Backspace')reset=true;
      },
    };
    if(item.accepted){
      await displaySearchProof(page,work=>work,progress);
      assert.equal(progress.state,'NATIVE_FINITE_SEARCH_DISPLAY_ONLY_OBSERVED');
      assert.equal(reset,true);assert.equal(progress.walk.length,1);
      assert.ok(events.indexOf('retained-match')<events.findIndex(event=>event.startsWith('clear:')));
    }else{
      await assert.rejects(displaySearchProof(page,work=>work,progress),{message:'DISPLAY_SEARCH_NATIVE_FOCUS_NOT_RETAINED'},item.name);
      assert.equal(progress.state,'INCOMPLETE');assert.equal(reset,false);assert.equal(events.some(event=>event.startsWith('clear:')),false);
    }
    assert.equal(tabs,1,item.name);assert.ok(events.indexOf('baseline')<events.indexOf('Tab'));
    assert.ok(events.indexOf('Tab')<events.indexOf('type'));
    assert.ok(events.indexOf('native-probe')<events.indexOf('type'));
    assert.ok(events.indexOf('native-match')<events.indexOf('type'));
    assert.equal(progress.acquired,valid);assert.equal(progress.casefoldMotsCanonical,true);
    assert.equal(progress.retainedTarget.sample,item.sample);assert.equal(progress.retainedTarget.matched,item.matched);
  }
});

test('catalog disclosure ordering natively reaches the earlier guide before Details; old reverse order and invalid guide focus still stop at the unchanged gate',async()=>{
  const {JSDOM}=await import('jsdom');
  const makeControl=(failure={})=>{
    const dom=new JSDOM('<label>Search catalog<input data-testid="request-catalog-search"></label><select aria-label="Product family"><option>All families</option></select><select aria-label="Sort"><option>Catalog order</option></select><details class="xenios-order-optional-guide"><summary tabindex="0">Help me browse (optional)</summary><h2>Optional guide</h2></details><article><button aria-label="View details for BPC-157, BPC-157 10 mg">View details</button><button>Add BPC</button></article><a href="#privacy">Privacy</a>',{runScripts:'outside-only'});
    const win=dom.window,doc=win.document,events=[],walks={guide:[],details:[]};
    if(failure.missingGuide)doc.querySelector('details').remove();
    const nodes=[...doc.querySelectorAll('input,select,summary,button,a')];
    const identities=new Map(nodes.map((node,index)=>[node,'native-order-'+index]));
    doc.querySelector('input').focus(); // Unit fixture starts where actual search/reset leaves focus.
    const page={
      async pressTab({shift=false}={}){
        assert.equal(shift,false);events.push('Tab');
        const next=nodes[nodes.indexOf(doc.activeElement)+1];
        if(next)next.focus();else doc.activeElement.blur();
      },
      async evaluate(source){
        if(source===FOCUS_BASELINE_SOURCE){events.push('baseline');return {tabbableIdentities:[...identities.values()]};}
        if(source===FOCUS_PROBE_SOURCE){
          const active=doc.activeElement;if(active===doc.body)return {body:true};
          const guide=active.matches('.xenios-order-optional-guide > summary');
          return {body:false,identity:identities.get(active),indicator:!(guide&&failure.noIndicator),inViewport:!(guide&&failure.outside)};
        }
        if(source===DISPLAY_FAQ_TARGET||source===DISPLAY_DETAILS_TARGET)return win.eval(source);
        assert.fail('CATALOG_ORDER_UNAPPROVED_EVALUATION');
      },
    };
    const actions={
      async guide(){events.push('guide-start');await nativeDisplayTarget(page,DISPLAY_FAQ_TARGET,work=>work,walks.guide);events.push('guide-acquired');},
      async details(){events.push('details-start');await nativeDisplayTarget(page,DISPLAY_DETAILS_TARGET,work=>work,walks.details);events.push('details-acquired');},
    };
    return {dom,events,walks,actions};
  };
  const actual=makeControl();
  try{
    await displayCatalogDisclosureProofs('display-phone375',actual.actions);
    assert.ok(actual.events.indexOf('guide-acquired')<actual.events.indexOf('details-start'));
    assert.equal(actual.walks.guide.at(-1).matched,true);assert.equal(actual.walks.details.at(-1).matched,true);
    assert.ok([...actual.walks.guide,...actual.walks.details].every(entry=>!entry.sample.body&&entry.sample.indicator&&entry.sample.inViewport));
    assert.ok(actual.events.indexOf('baseline')<actual.events.indexOf('Tab'));
  }finally{actual.dom.window.close();}
  const oldOrder=makeControl();
  try{
    await oldOrder.actions.details();
    await assert.rejects(oldOrder.actions.guide(),{message:'DISPLAY_NATIVE_FOCUS_NOT_VISIBLE'});
    assert.equal(oldOrder.walks.guide.at(-1).sample.body,true);
    assert.equal(oldOrder.events.includes('guide-acquired'),false);
  }finally{oldOrder.dom.window.close();}
  for(const failure of [{noIndicator:true},{outside:true},{missingGuide:true}]){
    const rejected=makeControl(failure);
    try{
      await assert.rejects(displayCatalogDisclosureProofs('display-phone375',rejected.actions),{message:'DISPLAY_NATIVE_FOCUS_NOT_VISIBLE'});
      assert.equal(rejected.events.includes('details-start'),false);assert.equal(rejected.events.includes('guide-acquired'),false);
    }finally{rejected.dom.window.close();}
  }
  for(const config of DISPLAY_CONFIGURATIONS){
    const calls=[];await displayCatalogDisclosureProofs(config.name,{guide:async()=>calls.push('guide'),details:async()=>calls.push('details')});
    assert.deepEqual(calls,config.name==='display-phone375'?['guide','details']:config.name==='display-desktop1440'?['details']:[]);
  }
  let calls=0;
  await assert.rejects(displayCatalogDisclosureProofs('not-approved',{guide:async()=>calls++,details:async()=>calls++}),{message:'DISPLAY_CONFIGURATION_NOT_APPROVED'});
  assert.equal(calls,0);
});

test('MC10 country-first return uses the actual strict reverse native walker and refuses old forward BODY, invalid focus, geometry and unapproved directions',async()=>{
  const binding=mc10NodeBinding();
  // Source order of the real contact form: Country follows Name/Email and
  // precedes its remaining address fields. This is a deterministic input model,
  // not an executed browser or synthetic visible-focus PASS.
  const order=['fullLegalName','email','countryCode','line1','line2','city','region','postalCode','confirm','footer','BODY'];
  function fixture({start='countryCode',mutation='none'}={}){
    let index=order.indexOf(start);const events=[],progress=[];
    const expression=mc10NativeTargetSource(binding,'fullLegalName');
    const page={pressTab:async({shift=false}={})=>{events.push(shift?'Shift+Tab':'Tab');index+=shift?-1:1;assert.ok(index>=0&&index<order.length,'MODEL_TAB_OUTSIDE_DOCUMENT');},
      evaluate:async source=>{
        if(source===FOCUS_BASELINE_SOURCE){events.push('baseline');return {tabbableIdentities:order.slice(0,-1)};}
        if(source===FOCUS_PROBE_SOURCE){events.push('probe');return {body:order[index]==='BODY'||mutation==='body',identity:order[index],indicator:mutation!=='indicator',inViewport:mutation!=='viewport'};}
        if(source===expression){events.push('match');return {unique:mutation!=='missing',safeKind:mutation!=='unsafe',matched:order[index]==='fullLegalName'};}
        if(source===mc10ActiveGeometrySource()){events.push('geometry');return {active:{rendered:mutation!=='hidden',fullyInViewport:true,unobscured:mutation!=='occluded',indicatorUnclipped:mutation!=='clipped',width:mutation==='small'?43:44,height:44}};}
        assert.fail('UNAPPROVED_MC10_WALK_EVALUATION');
      }};
    return {page,events,progress};
  }
  const oldForward=fixture();
  await assert.rejects(mc10NativeTarget(oldForward.page,binding,'fullLegalName',null,work=>work,oldForward.progress),/MC10_NATIVE_FOCUS_INVALID/u);
  assert.equal(oldForward.progress.at(-1).sample.body,true);assert.equal(oldForward.progress.at(-1).sample.identity,'BODY');
  assert.equal(oldForward.events.includes('Shift+Tab'),false);assert.equal(oldForward.events.includes('geometry'),false);
  const reverse=fixture();
  const acquired=await mc10NativeTarget(reverse.page,binding,'fullLegalName',null,work=>work,reverse.progress,[],'reverse');
  assert.equal(acquired.identity,'fullLegalName');
  assert.deepEqual(reverse.progress.map(row=>[row.direction,row.sample.identity]),[['reverse','email'],['reverse','fullLegalName']]);
  assert.deepEqual(reverse.events,['baseline','Shift+Tab','probe','match','baseline','Shift+Tab','probe','match','geometry']);
  for(const mutation of ['body','indicator','viewport','missing','unsafe','hidden','occluded','clipped','small']){
    const adverse=fixture({mutation});
    await assert.rejects(mc10NativeTarget(adverse.page,binding,'fullLegalName',null,work=>work,adverse.progress,[],'reverse'),/MC10_NATIVE_(?:FOCUS_INVALID|TARGET_ABSENT_AMBIGUOUS_OR_UNSAFE_KIND|TARGET_OBSCURED_CLIPPED_OR_SMALL)/u);
    assert.ok(adverse.progress.length>0);assert.ok(adverse.events.includes('Shift+Tab'));assert.ok(!adverse.events.includes('Tab'));
    for(let i=0;i<adverse.events.length;i++)if(adverse.events[i]==='Shift+Tab')assert.equal(adverse.events[i-1],'baseline');
  }
  for(const [kind,direction]of [['fullLegalName','wrap'],['fullLegalName',true],['fullLegalName',null],['countryCode','reverse'],['confirm','reverse']]){
    const forbidden={pressTab:()=>assert.fail('UNAPPROVED_NATIVE_INPUT'),evaluate:()=>assert.fail('UNAPPROVED_EVALUATION')};
    await assert.rejects(mc10NativeTarget(forbidden,binding,kind,null,work=>work,[],[],direction),/MC10_NATIVE_DIRECTION_NOT_APPROVED/u);
  }
});

import {mc10SearchTarget} from './owned-runner-browser-qa.mjs';
test('MC10 earlier pager and repeated Search preserve genuine native acquisition, reverse lower-row return and strict current-focus revalidation',async()=>{
  const binding=mc10NodeBinding(),rows=[{productId:'p',variantId:'v',productName:'Public name',specification:'10 mg'}];
  const expressions=new Map(['search','previousPage','nextPage','add'].map(kind=>[mc10NativeTargetSource(binding,kind,kind==='add'?{productId:'p',variantId:'v'}:null,kind==='add'?rows:[]),kind]));
  function fixture(){
    const order=['header','search','previousPage','nextPage','add','footer','BODY'],events=[],progress=[];
    let index=0,mutation='none';
    return {events,progress,setMutation:value=>{mutation=value;},page:{
      pressTab:async({shift=false}={})=>{events.push(shift?'Shift+Tab':'Tab');index+=shift?-1:1;assert.ok(index>=0&&index<order.length,'MODEL_TAB_OUTSIDE_DOCUMENT');},
      evaluate:async source=>{
        if(source===FOCUS_BASELINE_SOURCE){events.push('baseline');return {tabbableIdentities:order.slice(0,-1)};}
        if(source===FOCUS_PROBE_SOURCE){events.push('probe');return {body:order[index]==='BODY'||mutation==='body',identity:mutation==='identity'?'foreign':order[index],indicator:mutation!=='indicator',inViewport:mutation!=='viewport'};}
        if(source===mc10CurrentOrderSource(binding,'search')){events.push('order');return {unique:true,safeKind:true,enabled:true,targetIdentity:'search',currentIdentity:order[index],currentBody:order[index]==='BODY',currentConnected:true,currentTabIndex:0,targetTabIndex:0,relation:index>1?'AFTER_TARGET':index<1?'BEFORE_TARGET':'ON_TARGET'};}
        if(expressions.has(source)){events.push('match:'+expressions.get(source));return {unique:mutation!=='missing',safeKind:mutation!=='unsafe',matched:expressions.get(source)===order[index]};}
        if(source===mc10ActiveGeometrySource()){events.push('geometry');return {active:{rendered:true,fullyInViewport:true,unobscured:mutation!=='occluded',indicatorUnclipped:mutation!=='clipped',width:44,height:44}};}
        assert.fail('UNAPPROVED_MC10_READ_ONLY_EVALUATION');
      }}};
  }
  const f=fixture(),bounded=work=>work;
  const first=await mc10SearchTarget(f.page,binding,bounded,f.progress);
  assert.equal(first.identity,'search');assert.deepEqual(f.events,['baseline','Tab','probe','match:search','geometry']);
  f.events.length=0;
  const retained=await mc10SearchTarget(f.page,binding,bounded,f.progress,first);
  assert.equal(retained.identity,first.identity);
  assert.deepEqual(f.events,['baseline','probe','match:search','geometry']);
  assert.equal(f.progress.at(-1).observation,'CURRENT_FOCUS_REVALIDATION');
  await mc10NativeTarget(f.page,binding,'add',{productId:'p',variantId:'v'},bounded,f.progress,rows);
  f.events.length=0;
  const returned=await mc10SearchTarget(f.page,binding,bounded,f.progress,retained);
  assert.equal(returned.identity,first.identity);
  assert.equal(f.events.filter(event=>event==='Shift+Tab').length,3);assert.equal(f.events.includes('Tab'),false);
  for(let i=0;i<f.events.length;i++)if(f.events[i]==='Shift+Tab')assert.equal(f.events[i-1],'baseline');
  await mc10NativeTarget(f.page,binding,'nextPage',null,bounded,f.progress);
  await mc10NativeTarget(f.page,binding,'previousPage',null,bounded,f.progress,[],'reverse');
  assert.equal(f.progress.at(-1).sample.identity,'previousPage');
  const old=fixture();await mc10NativeTarget(old.page,binding,'nextPage',null,bounded,old.progress);
  await assert.rejects(mc10NativeTarget(old.page,binding,'previousPage',null,bounded,old.progress),/MC10_NATIVE_FOCUS_INVALID/u);
  assert.equal(old.progress.at(-1).sample.body,true);
  for(const mutation of ['body','indicator','viewport','identity','missing','unsafe','occluded','clipped']){
    const adverse=fixture(),native=await mc10SearchTarget(adverse.page,binding,bounded,adverse.progress);
    adverse.events.length=0;adverse.setMutation(mutation);
    await assert.rejects(mc10SearchTarget(adverse.page,binding,bounded,adverse.progress,native),/MC10_(?:NATIVE_FOCUS_INVALID|NATIVE_TARGET_ABSENT_AMBIGUOUS_OR_UNSAFE_KIND|SEARCH_RETAINED_FOCUS_INVALID)/u);
    assert.equal(adverse.events.some(event=>event==='Tab'||event==='Shift+Tab'),false);
  }
  const noNativeProof=fixture();
  await assert.rejects(mc10SearchTarget(noNativeProof.page,binding,bounded,noNativeProof.progress,{body:false,identity:'search',indicator:true,inViewport:true}),/MC10_SEARCH_NATIVE_PROOF_REQUIRED/u);
  assert.deepEqual(noNativeProof.events,[]);
  const cloned=fixture(),native=await mc10SearchTarget(cloned.page,binding,bounded,cloned.progress);cloned.events.length=0;
  await assert.rejects(mc10SearchTarget(cloned.page,binding,bounded,cloned.progress,{...native}),/MC10_SEARCH_NATIVE_PROOF_REQUIRED/u);
  assert.deepEqual(cloned.events,[]);
});

import {mc10ReviewedRowDiagnostics} from './owned-runner-browser-qa.mjs';
test('MC10 reviewed-row refusal retains bounded per-field facts before the unchanged guard and never serializes row text or diagnostic errors',()=>{
  const item={productId:'public-p',variantId:'public-v',reviewedContent:{brand:'Approved brand',summary:'Approved summary'},reviewedMedia:{primary:{href:'/research/product-media/known.png'},representation:'artwork'}};
  const valid={stage:'CONFIRMED_PRODUCTS',noAttempt:true,rowsTruncated:false,reducedMotion:true,viewport:{scrollWidth:320,clientWidth:320},
    entranceArtworkCount:0,entranceCaptions:0,conversationGridCount:0,counts:{products:1,intake:0},rows:[{productId:item.productId,variantId:item.variantId,rendered:true,forbiddenCommercialCopy:false,controlsTruncated:false,
      summaryText:'Approved brand · Approved summary',mediaCount:1,representation:'artwork',
      media:[{path:item.reviewedMedia.primary.href,fit:'contain',rendered:true,alt:'Known public image',inViewport:true,complete:true,naturalWidth:200}]}]};
  const cases=[
    ['SUMMARY_EXACT',row=>{row.summaryText='private-row-text-sentinel';}],
    ['MEDIA_COUNT',row=>{row.mediaCount=2;}],
    ['PRIMARY_OBSERVATION_COUNT',row=>{row.media.push({...row.media[0]});}],
    ['PRIMARY_PATH',row=>{row.media[0].path='https://private-url-sentinel.invalid/?secret';}],
    ['PRIMARY_FIT',row=>{row.media[0].fit='cover';}],
    ['PRIMARY_RENDERED',row=>{row.media[0].rendered=false;}],
    ['PRIMARY_ALT_NONEMPTY',row=>{row.media[0].alt='';}],
    ['VISIBLE_PRIMARY_LOADED',row=>{row.media[0].complete=false;}],
    ['VISIBLE_PRIMARY_LOADED',row=>{row.media[0].naturalWidth=0;}],
    ['REPRESENTATION',row=>{row.representation='unexpected-private-label-sentinel';}],
  ];
  assert.equal(assertMC10Stage(valid,'CONFIRMED_PRODUCTS',[item]),valid);
  for(const [field,mutate]of cases){
    const view=structuredClone(valid),progress={};mutate(view.rows[0]);
    assert.throws(()=>assertMC10Stage(view,'CONFIRMED_PRODUCTS',[item],progress),/MC10_REVIEWED_CONTENT_OR_IMAGE_MISMATCH/u);
    const retained=progress.reviewedRowFailure;
    assert.equal(retained.accepted,false);assert.equal(retained.state,'OBSERVED_BOUNDED_COMPARISON_FACTS');assert.equal(retained.failures[0].rowIndex,0);
    assert.equal(retained.failures[0].checks[field],false);assert.ok(retained.failures[0].failedFields.includes(field));
    const text=JSON.stringify(retained);for(const secret of ['private-row-text-sentinel','private-url-sentinel','unexpected-private-label-sentinel','Known public image','Approved summary'])assert.equal(text.includes(secret),false);
    assert.throws(()=>assertMC10Stage(view,'CONFIRMED_PRODUCTS',[item]),/MC10_REVIEWED_CONTENT_OR_IMAGE_MISMATCH/u);
  }
  const withoutMedia=structuredClone(valid),plain={...item,reviewedMedia:null};withoutMedia.rows[0].mediaCount=0;withoutMedia.rows[0].media=[];
  assert.equal(assertMC10Stage(withoutMedia,'CONFIRMED_PRODUCTS',[plain]),withoutMedia);
  const below=structuredClone(valid);below.rows[0].media[0].inViewport=false;below.rows[0].media[0].complete=false;
  assert.equal(assertMC10Stage(below,'CONFIRMED_PRODUCTS',[item]),below);
  const many={rows:Array.from({length:30},()=>{const row=structuredClone(valid.rows[0]);row.summaryText='different';return row;})},expected=Array.from({length:30},()=>item);
  Object.defineProperty(many.rows[24],'summaryText',{get(){assert.fail('BEYOND_ROW_CAP_READ');}});
  Object.defineProperty(many,'unknown',{get(){assert.fail('UNKNOWN_FIELD_READ');}});
  const bounded=mc10ReviewedRowDiagnostics(many,expected);
  assert.equal(bounded.rowsScanned,24);assert.equal(bounded.failedRows,24);assert.equal(bounded.failures.length,8);assert.equal(bounded.truncated,true);
  const broken=structuredClone(valid),progress={};let reads=0;
  Object.defineProperty(broken.rows[0],'summaryText',{get(){if(++reads===1)return 'mismatch';throw new Error('private-diagnostic-error-sentinel');}});
  assert.throws(()=>assertMC10Stage(broken,'CONFIRMED_PRODUCTS',[item],progress),/MC10_REVIEWED_CONTENT_OR_IMAGE_MISMATCH/u);
  assert.equal(progress.reviewedRowFailure.state,'UNAVAILABLE');assert.equal(JSON.stringify(progress).includes('private-diagnostic-error-sentinel'),false);
});

import {settleMC10VisibleImages,waitForMC10Condition} from './owned-runner-browser-qa.mjs';
test('MC10 visible canonical image readiness uses the existing bounded wait and still refuses broken, mismatched, forever-pending and deadline cases',async()=>{
  const item={productId:'p',variantId:'v',reviewedContent:{summary:'Public summary'},reviewedMedia:{primary:{href:'/research/product-media/known.png'},representation:'artwork'}};
  const loaded={stage:'CONFIRMED_PRODUCTS',noAttempt:true,rowsTruncated:false,reducedMotion:true,viewport:{scrollWidth:320,clientWidth:320},entranceArtworkCount:0,entranceCaptions:0,conversationGridCount:0,
    counts:{products:1,intake:0},rows:[{productId:'p',variantId:'v',rendered:true,forbiddenCommercialCopy:false,controlsTruncated:false,summaryText:'Public summary',mediaCount:1,representation:'artwork',
      media:[{path:item.reviewedMedia.primary.href,fit:'contain',rendered:true,alt:'Public image',inViewport:true,complete:true,naturalWidth:200}]}]};
  const pending=structuredClone(loaded);pending.rows[0].media[0].complete=false;pending.rows[0].media[0].naturalWidth=0;
  function driver(views,{rejectPause=null}={}){
    const events=[];let reads=0;
    const observe=async()=>{events.push('snapshot');return views[Math.min(reads++,views.length-1)];};
    const page={send:async(method,params)=>{assert.equal(method,'Runtime.evaluate');assert.deepEqual(params,{expression:'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',awaitPromise:true,returnByValue:true});events.push('double-RAF');if(rejectPause)throw rejectPause;}};
    const wait=(predicate,code)=>waitForMC10Condition(page,work=>work,observe,predicate,code);
    return {wait,events,get reads(){return reads;}};
  }
  const sequence=driver([pending,loaded]),progress={};
  const ready=await settleMC10VisibleImages(pending,[item],sequence.wait,progress);
  assert.equal(ready,loaded);assert.equal(assertMC10Stage(ready,'CONFIRMED_PRODUCTS',[item]),loaded);
  assert.deepEqual(sequence.events,['snapshot','double-RAF','snapshot']);
  assert.equal(progress.visibleImageReadiness[0].state,'READY');assert.equal(progress.visibleImageReadiness[0].pendingSnapshots,2);assert.equal(progress.visibleImageReadiness[0].waited,true);
  assert.equal(pending.rows[0].media[0].complete,false);assert.equal(pending.rows[0].media[0].naturalWidth,0);
  for(const mutation of ['broken','path','summary','rendered']){
    const bad=structuredClone(pending);if(mutation==='broken')bad.rows[0].media[0].complete=true;
    if(mutation==='path')bad.rows[0].media[0].path='/research/product-media/wrong.png';
    if(mutation==='summary')bad.rows[0].summaryText='Wrong';if(mutation==='rendered')bad.rows[0].media[0].rendered=false;
    const never=driver([loaded]),p={};
    await assert.rejects(settleMC10VisibleImages(bad,[item],never.wait,p),/MC10_REVIEWED_CONTENT_OR_IMAGE_MISMATCH/u);
    assert.equal(never.reads,0);assert.equal(p.visibleImageReadiness[0].state,'REFUSED');assert.ok(p.reviewedRowFailure);
  }
  const all=structuredClone(pending);all.rows=Array.from({length:24},()=>structuredClone(pending.rows[0]));all.rows[23].media[0].path='/research/product-media/wrong.png';
  const never=driver([loaded]);
  await assert.rejects(settleMC10VisibleImages(all,Array.from({length:24},()=>item),never.wait,{}),/MC10_REVIEWED_CONTENT_OR_IMAGE_MISMATCH/u);
  assert.equal(never.reads,0,'a hard mismatch beyond the eight retained diagnostic rows must not wait');
  const stuck=driver([pending]),stuckProgress={};
  await assert.rejects(settleMC10VisibleImages(pending,[item],stuck.wait,stuckProgress),/MC10_REVIEWED_CONTENT_OR_IMAGE_MISMATCH/u);
  assert.equal(stuck.reads,40);assert.equal(stuck.events.filter(x=>x==='double-RAF').length,40);
  assert.equal(stuckProgress.visibleImageReadiness[0].state,'REFUSED');assert.equal(stuckProgress.reviewedRowFailure.failures[0].checks.VISIBLE_PRIMARY_LOADED,false);
  const deadline=new Error('OVERALL_DEADLINE'),interrupted=driver([pending],{rejectPause:deadline}),p={};
  await assert.rejects(settleMC10VisibleImages(pending,[item],interrupted.wait,p),error=>error===deadline);
  assert.equal(interrupted.reads,1);assert.equal(p.visibleImageReadiness[0].state,'REFUSED');
  const below=structuredClone(pending);below.rows[0].media[0].inViewport=false;const unused=driver([loaded]);
  assert.equal(await settleMC10VisibleImages(below,[item],unused.wait,{}),below);assert.equal(unused.reads,0);
});

import {mc10CurrentOrderSource,mc10CurrentOrderTarget} from './owned-runner-browser-qa.mjs';
test('MC10 current-order native acquisition follows fresh heading/body/after-target state and refuses BODY, stale, missing or unobservable targets',async()=>{
  const binding=mc10NodeBinding(),{JSDOM}=await import('jsdom');
  const dom=new JSDOM('<a href="/header">Header</a><h2 id="heading" tabindex="-1">Catalog</h2><input id="search"><button id="previous" type="button">Previous</button><button id="next" type="button">Next</button>',{url:'http://127.0.0.1/earlyaccess',runScripts:'outside-only'});
  const win=dom.window,readBinding={...binding,selectors:{...binding.selectors,previousPage:'#previous',search:'#search'}};
  win.HTMLElement.prototype.getClientRects=function(){return [this.getBoundingClientRect()];};
  win.HTMLElement.prototype.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:100,bottom:44,width:100,height:44});
  try{
    win.eval(FOCUS_BASELINE_SOURCE);win.document.getElementById('heading').focus();
    const source=mc10CurrentOrderSource(readBinding,'previousPage'),before=win.eval(source);
    assert.equal(before.relation,'BEFORE_TARGET');assert.equal(before.currentTabIndex,-1);assert.equal(before.enabled,true);assert.equal(typeof before.targetIdentity,'string');
    win.document.getElementById('next').focus();assert.equal(win.eval(source).relation,'AFTER_TARGET');
    win.document.getElementById('previous').disabled=true;assert.equal(win.eval(source).enabled,false);
    win.document.body.insertAdjacentHTML('beforeend','<button id="previous" type="button">Ambiguous</button>');assert.equal(win.eval(source).unique,false);
    // These are real DOM relation/baseline controls, not a jsdom painted focus claim.
  }finally{win.close();}
  const order=['BODY_START','brand','back','explore','policy','cart','book','heading','search','previousPage','nextPage','footer','BODY_END'];
  function fixture({start='heading',jump=false,mutation='none'}={}){
    let index=order.indexOf(start),keys=0;const events=[],progress=[];
    const targetSource=mc10NativeTargetSource(binding,'previousPage'),relationSource=mc10CurrentOrderSource(binding,'previousPage');
    return {events,progress,page:{pressTab:async({shift=false}={})=>{events.push(shift?'Shift+Tab':'Tab');keys++;index=mutation==='postbody'?order.length-1:jump&&keys===1?order.indexOf('footer'):index+(shift?-1:1);assert.ok(index>=0&&index<order.length);},
      evaluate:async source=>{
        const body=order[index].startsWith('BODY');
        if(source===FOCUS_BASELINE_SOURCE){events.push('baseline');return {tabbableIdentities:mutation==='order'?[]:order.filter(x=>!x.startsWith('BODY')&&x!=='heading')};}
        if(source===FOCUS_PROBE_SOURCE){events.push('probe');return {body,identity:body?null:mutation==='stale'&&order[index]==='previousPage'?'new-target':order[index],indicator:mutation!=='indicator',inViewport:mutation!=='viewport'};}
        if(source===relationSource){events.push('relation');return {unique:mutation!=='missing',safeKind:true,enabled:mutation!=='disabled',targetIdentity:'previousPage',currentIdentity:mutation==='identity'?'foreign':body?null:order[index],
          currentBody:body,currentConnected:true,currentTabIndex:order[index]==='heading'?-1:0,targetTabIndex:0,relation:body?'UNFOCUSED':index<order.indexOf('previousPage')?'BEFORE_TARGET':index>order.indexOf('previousPage')?'AFTER_TARGET':'ON_TARGET'};}
        if(source===targetSource){events.push('match');return {unique:true,safeKind:true,matched:order[index]==='previousPage'};}
        if(source===mc10ActiveGeometrySource()){events.push('geometry');return {active:{rendered:true,fullyInViewport:true,unobscured:mutation!=='occluded',indicatorUnclipped:mutation!=='clipped',width:mutation==='small'?43:44,height:44}};}
        assert.fail('UNAPPROVED_CURRENT_ORDER_READ');
      }}};
  }
  const old=fixture();await assert.rejects(mc10NativeTarget(old.page,binding,'previousPage',null,p=>p,old.progress,[],'reverse'),/MC10_NATIVE_FOCUS_INVALID/u);
  assert.equal(old.progress.at(-1).sample.body,true);assert.equal(old.events.filter(x=>x==='Shift+Tab').length,7);
  const heading=fixture(),reached=await mc10CurrentOrderTarget(heading.page,binding,'previousPage',p=>p,heading.progress);
  assert.equal(reached.identity,'previousPage');assert.deepEqual(heading.progress.map(x=>x.direction),['forward','forward']);
  assert.equal(heading.progress[0].start.sample.identity,'heading');assert.ok(heading.events.indexOf('relation')<heading.events.indexOf('Tab'));
  const after=fixture({start:'nextPage'});await mc10CurrentOrderTarget(after.page,binding,'previousPage',p=>p,after.progress);assert.deepEqual(after.progress.map(x=>x.direction),['reverse']);
  const jump=fixture({start:'BODY_START',jump:true});await mc10CurrentOrderTarget(jump.page,binding,'previousPage',p=>p,jump.progress);
  assert.deepEqual(jump.progress.map(x=>x.direction),['forward','reverse','reverse']);assert.equal(jump.progress[0].start.initialUnfocused,true);
  assert.ok(jump.progress.every(x=>x.sample.body===false),'BODY was only an initial observation, never an accepted post-key sample');
  for(const mutation of ['postbody','indicator','viewport','missing','disabled','identity','order','occluded','clipped','small','stale']){
    const bad=fixture({mutation});await assert.rejects(mc10CurrentOrderTarget(bad.page,binding,'previousPage',p=>p,bad.progress),/MC10_/u);
    if(mutation==='postbody')assert.equal(bad.events.filter(x=>x==='Tab'||x==='Shift+Tab').length,1);
    if(['missing','disabled','identity','order'].includes(mutation))assert.equal(bad.events.some(x=>x==='Tab'||x==='Shift+Tab'),false);
  }
  assert.throws(()=>mc10CurrentOrderSource(binding,'confirm'),/KIND_NOT_APPROVED/u);
});
