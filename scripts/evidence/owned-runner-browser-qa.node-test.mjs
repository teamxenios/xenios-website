import { DISPLAY_SCENARIO, DISPLAY_SOURCE, DISPLAY_SOURCE_PINS, DISPLAY_ROW_STUBS, DISPLAY_CONFIGURATIONS,
  DISPLAY_GET_PATHS, DISPLAY_CATALOG_PATH, DISPLAY_UNMATCHED_SEARCH, DISPLAY_MEDIA_PINS, DISPLAY_PNG_CAP,
  displayCatalogQuery, displayCatalogPage, sourceDerivedDisplayRows, displayCatalogAssertions,
  nativeDisplayTarget, DISPLAY_DETAILS_TARGET, displayDetailsProof, DISPLAY_DIALOG_PRESENT,
  DISPLAY_DIALOG_FOCUS, DISPLAY_DIALOG_CLOSED_AND_RETURNED, displayCapturePlan,
  DISPLAY_NO_ATTEMPT_SOURCE, assertNoDisplayAttempt, collectDisplayCatalogGeometry } from "./owned-runner-browser-qa.mjs";
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
  PREMIUM_PRIMARY_FOCUSED_SOURCE } from "./owned-runner-browser-qa.mjs";
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
    artwork: { ...rendered, offeringId: PREMIUM_ARTWORK.offeringId, variantId: PREMIUM_ARTWORK.variantId,
      sha256: PREMIUM_ARTWORK.sha256, path: PREMIUM_ARTWORK.path, alt: PREMIUM_ARTWORK.alt,
      objectFit: "contain", packagingCaption: true, complete: true, naturalWidth: 1024 } };
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

test("entry artwork checks require exact reviewed identity/contain/caption and reject a visible broken/fallback image", () => {
  const sample = validPremiumSample();
  for (const change of [{ offeringId: "wrong" }, { variantId: "wrong" }, { sha256: "0".repeat(64) },
    { path: "/research/product-media/vial.svg" }, { alt: "product" }, { objectFit: "cover" },
    { packagingCaption: false }, { rendered: false }, { naturalWidth: 0 }, { complete: false }])
    assert.equal(premiumEntryAssertions({ ...sample, artwork: { ...sample.artwork, ...change } })
      .find((entry) => entry.name === "premium_exact_reviewed_artwork_mapping").passed, false, JSON.stringify(change));
  const belowViewport = { ...sample, artwork: { ...sample.artwork, inViewport: false, complete: false, naturalWidth: 0 } };
  assert.equal(premiumEntryAssertions(belowViewport).find((entry) => entry.name === "premium_exact_reviewed_artwork_mapping").passed, true);
  assert.equal(belowViewport.artwork.inViewport, false, "OFFSCREEN_DOM_MAPPING_IS_NOT_A_VISIBLE_IMAGE_CLAIM");
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
    return { body: active === null, identity: wrongIdentity ? "foreign" : active, indicator: true, inViewport: true,
      ...(open && failure.invisible ? { indicator: false } : {}),
      ...(open && failure.outside ? { inViewport: false } : {}) };
  };
  const page = {
    evaluate: async (source) => {
      if (source === FOCUS_BASELINE_SOURCE) { events.push("baseline"); return { tabbableIdentities: open ? order : ["trigger"] }; }
      if (source === FOCUS_PROBE_SOURCE) { events.push("probe:" + active); return probe(); }
      if (source === DISPLAY_DETAILS_TARGET) return active === "trigger";
      if (source === DISPLAY_DIALOG_PRESENT) return open;
      if (source === `!(${DISPLAY_DIALOG_PRESENT})`) return !open;
      if (source === DISPLAY_DIALOG_CLOSED_AND_RETURNED) return !open && active === "trigger";
      if (source === DISPLAY_DIALOG_FOCUS) return !failure.escaped && open && order.includes(active);
      assert.ok(source.includes("Final quantities, prices and availability"));
      events.push("read-dialog");
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