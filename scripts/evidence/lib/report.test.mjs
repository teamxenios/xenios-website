import { describe, expect, it } from "vitest";
import { aggregateAccessibility, analyseFocusWalk, applyReviewedAssertionNotes, artifactName, evaluateAudit, runVerdict, slug, targetFindingFingerprint } from "./report.mjs";

const cleanAudit = () => ({
  lang: "en",
  overflow: { documentScrollWidth: 390, clientWidth: 390, horizontalOverflow: false, offenders: [], clippedText: [] },
  targets: { total: 4, undersized: [], undersizedCount: 0, minimum: 44 },
  landmarks: { mainCount: 1, nestedMainCount: 0, mainSelectors: ["main"] },
  headings: { h1Count: 1, outline: [] },
  duplicateIds: [],
  forms: { unlabelledControls: [] },
  images: { missingAlt: [] },
  invalidAriaRefs: [],
});

describe("evaluateAudit", () => {
  it("passes a clean audit with a complete focus walk", () => {
    const a = evaluateAudit(cleanAudit(), { focusWalk: { stops: [{ indicator: true }], cycled: true, trapped: false, truncated: false, identityComplete: true, completeSetCovered: true, expectedIdentityCount: 1 } });
    expect(a.every((x) => x.result === "PASS")).toBe(true);
    expect(a.map((x) => x.id)).toContain("FOCUS_VISIBLE_PRESENT");
  });

  it("fails horizontal overflow, undersized targets, nested and duplicate main, duplicate ids", () => {
    const audit = cleanAudit();
    audit.overflow = { documentScrollWidth: 412, clientWidth: 390, horizontalOverflow: true, offenders: [{ selector: "div.wide", right: 412 }], clippedText: [] };
    audit.targets = { total: 2, undersized: [{ selector: "a.tiny", width: 30, height: 17, text: "x" }], undersizedCount: 1 };
    audit.landmarks = { mainCount: 2, nestedMainCount: 1, mainSelectors: ["main", "main > main"] };
    audit.duplicateIds = [{ id: "email", count: 2 }];
    const a = Object.fromEntries(evaluateAudit(audit).map((x) => [x.id, x]));
    expect(a.NO_HORIZONTAL_OVERFLOW.result).toBe("FAIL");
    expect(a.NO_HORIZONTAL_OVERFLOW.detail).toContain("412 > viewport 390");
    expect(a.TARGETS_44x44.result).toBe("FAIL");
    expect(a.TARGETS_44x44.detail).toContain("a.tiny 30x17");
    expect(a.SINGLE_MAIN_LANDMARK.result).toBe("FAIL");
    expect(a.NO_NESTED_MAIN.result).toBe("FAIL");
    expect(a.NO_DUPLICATE_IDS.detail).toContain("#email x2");
    expect(a.FOCUS_ORDER_REACHABLE.result).toBe("NOT_RUN");
  });

  it("treats console warnings as clean and 4xx/failed network as unclean unless allowlisted", () => {
    const base = cleanAudit();
    const warn = evaluateAudit(base, { console: [{ level: "warning", text: "w" }], network: [{ url: "http://x/api", status: 200 }] });
    expect(warn.find((x) => x.id === "CONSOLE_CLEAN").result).toBe("PASS");
    const bad = evaluateAudit(base, { console: [{ level: "error", text: "boom" }], network: [{ url: "http://x/api/config", status: 500 }, { url: "http://x/img", status: 0, failed: true, canceled: true }] });
    expect(bad.find((x) => x.id === "CONSOLE_CLEAN").result).toBe("FAIL");
    expect(bad.find((x) => x.id === "NETWORK_CLEAN").count).toBe(1);
    const allowed = evaluateAudit(base, { network: [{ url: "http://x/api/config", status: 500 }], allowNetwork: [/\/api\/config$/] });
    expect(allowed.find((x) => x.id === "NETWORK_CLEAN").result).toBe("PASS");
  });

  it("blocks every attempted escape from the preview network boundary", () => {
    const assertions = evaluateAudit(cleanAudit(), {
      networkBoundaryViolations: [{
        method: "GET",
        url: "https://xeniostechnology.com/api/customer",
        reason: "off-origin request blocked before dispatch",
      }],
    });
    const boundary = assertions.find((assertion) => assertion.id === "SAME_ORIGIN_NETWORK_BOUNDARY");
    expect(boundary).toMatchObject({ result: "FAIL", count: 1 });
    expect(boundary.detail).toContain("https://xeniostechnology.com/api/customer");
    expect(runVerdict(assertions)).toBe("AUTOMATED_FAIL");
  });

  it("records exact declared fail-closed HTTP responses as pass-with-notes", () => {
    const expected = {
      url: "http://x/api/care/appointments",
      method: "GET",
      status: 503,
      count: 1,
      responseBodySha256: "a".repeat(64),
      consoleText: "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
    };
    const assertions = evaluateAudit(cleanAudit(), {
      console: [{ level: "log:error", url: expected.url, text: expected.consoleText }],
      network: [{ url: expected.url, method: "GET", status: 503, bodySha256: expected.responseBodySha256 }],
      expectedHttpFailures: [expected],
    });
    const byId = Object.fromEntries(assertions.map((assertion) => [assertion.id, assertion]));
    expect(byId.EXPECTED_HTTP_FAILURES_OBSERVED.result).toBe("PASS");
    expect(byId.CONSOLE_CLEAN.result).toBe("PASS_WITH_NOTES");
    expect(byId.NETWORK_CLEAN.result).toBe("PASS_WITH_NOTES");
    expect(runVerdict(assertions)).toBe("AUTOMATED_PASS_WITH_NOTES");
  });

  it("keeps a status or count drift in a declared HTTP failure blocking", () => {
    const assertions = evaluateAudit(cleanAudit(), {
      network: [{ url: "http://x/api/care/appointments", method: "GET", status: 500, bodySha256: "b".repeat(64) }],
      expectedHttpFailures: [{ url: "http://x/api/care/appointments", method: "GET", status: 503, count: 1, responseBodySha256: "a".repeat(64) }],
    });
    const byId = Object.fromEntries(assertions.map((assertion) => [assertion.id, assertion]));
    expect(byId.EXPECTED_HTTP_FAILURES_OBSERVED.result).toBe("FAIL");
    expect(byId.NETWORK_CLEAN.result).toBe("FAIL");
  });

  it("blocks an additional undeclared failure beside an exact declared response", () => {
    const url = "http://x/api/care/appointments";
    const expected = { url, method: "GET", status: 503, count: 1, responseBodySha256: "a".repeat(64) };
    const assertions = evaluateAudit(cleanAudit(), {
      network: [
        { url, method: "GET", status: 503, bodySha256: expected.responseBodySha256 },
        { url, method: "GET", status: 500, bodySha256: "b".repeat(64) },
      ],
      expectedHttpFailures: [expected],
    });
    expect(assertions.find((assertion) => assertion.id === "EXPECTED_HTTP_FAILURES_OBSERVED").result).toBe("FAIL");
    expect(runVerdict(assertions)).toBe("AUTOMATED_FAIL");
  });

  it.each([0, 2])("blocks a declared response with %i matching console signals", (consoleCount) => {
    const url = "http://x/api/care/appointments";
    const expected = {
      url,
      method: "GET",
      status: 503,
      count: 1,
      responseBodySha256: "a".repeat(64),
      consoleText: "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
    };
    const assertions = evaluateAudit(cleanAudit(), {
      network: [{ url, method: "GET", status: 503, bodySha256: expected.responseBodySha256 }],
      console: Array.from({ length: consoleCount }, () => ({ level: "log:error", url, text: expected.consoleText })),
      expectedHttpFailures: [expected],
    });
    expect(assertions.find((assertion) => assertion.id === "EXPECTED_HTTP_FAILURES_OBSERVED").result).toBe("FAIL");
    expect(runVerdict(assertions)).toBe("AUTOMATED_FAIL");
  });
});

describe("reviewed historical target findings", () => {
  it("only converts an exact target-finding fingerprint to pass-with-notes", () => {
    const audit = cleanAudit();
    audit.targets = {
      total: 1,
      undersizedCount: 1,
      undersized: [{ selector: "a.legacy", tag: "a", role: null, text: "Legacy", width: 40, height: 20, inlineText: false, offscreen: false }],
    };
    const original = evaluateAudit(audit);
    const fingerprint = targetFindingFingerprint(audit);
    const reviewed = applyReviewedAssertionNotes(original, audit, [{
      id: "TARGETS_44x44",
      allowedFindingFingerprints: [fingerprint],
      reason: "byte-identical protected microsite matches live production",
      productionCommit: "3daa",
      productionEvidence: "evidence/live-hino.json",
      sourceBindingVerified: true,
      candidateSourceBinding: { candidateSha: "c".repeat(40), path: "client/public/hino" },
    }]);
    expect(reviewed.find((assertion) => assertion.id === "TARGETS_44x44")).toMatchObject({
      result: "PASS_WITH_NOTES",
      originalResult: "FAIL",
      findingFingerprint: fingerprint,
    });
    const notReviewed = applyReviewedAssertionNotes(original, audit, [{
      id: "TARGETS_44x44",
      allowedFindingFingerprints: ["0".repeat(64)],
      reason: "wrong fingerprint",
      sourceBindingVerified: true,
    }]);
    expect(notReviewed.find((assertion) => assertion.id === "TARGETS_44x44").result).toBe("FAIL");
  });
});

describe("runVerdict", () => {
  it("treats every failed assertion as release-blocking", () => {
    expect(runVerdict([{ id: "TARGETS_44x44", result: "PASS" }])).toBe("AUTOMATED_PASS");
    expect(runVerdict([{ id: "CONSOLE_CLEAN", result: "FAIL" }])).toBe("AUTOMATED_FAIL");
    expect(runVerdict([{ id: "TARGETS_44x44", result: "FAIL" }])).toBe("AUTOMATED_FAIL");
  });
  it("never yields a bare PASS string", () => {
    expect(runVerdict([])).not.toBe("PASS");
  });
});

describe("analyseFocusWalk", () => {
  const stop = (s, indicator = true, identity = s) => ({
    body: false,
    identity,
    selector: s,
    text: s,
    indicator,
    baselineCaptured: true,
    focusVisible: true,
    focusVisualDelta: indicator,
  });
  const expected = (...identities) => ({ maxStops: 10, expectedIdentities: identities });
  it("records stops until the walk cycles back to body", () => {
    const w = analyseFocusWalk([stop("a"), stop("b"), { body: true }], expected("a", "b"));
    expect(w.stops).toHaveLength(2);
    expect(w.cycled).toBe(true);
    expect(w.trapped).toBe(false);
    expect(w.completeSetCovered).toBe(true);
  });
  it("detects a focus trap when the same element repeats", () => {
    const w = analyseFocusWalk([stop("a"), stop("b"), stop("b"), stop("b"), stop("b")], expected("a", "b"));
    expect(w.trapped).toBe(true);
    expect(w.trappedAt).toBe("b");
  });
  it("detects a cycle when a previously seen stop recurs", () => {
    const w = analyseFocusWalk([stop("a"), stop("b"), stop("a")], expected("a", "b"));
    expect(w.cycled).toBe(true);
    expect(w.stops.map((s) => s.selector)).toEqual(["a", "b"]);
  });
  it("rejects an A,B,A cycle when a baseline C tab stop was never reached", () => {
    const w = analyseFocusWalk(
      [stop("a"), stop("b"), stop("a")],
      expected("a", "b", "c"),
    );
    expect(w).toMatchObject({
      cycled: false,
      earlyCycle: true,
      completeSetCovered: false,
      missingIdentities: ["c"],
      missingIdentityCount: 1,
    });
    const assertion = evaluateAudit(cleanAudit(), { focusWalk: w })
      .find((candidate) => candidate.id === "FOCUS_ORDER_REACHABLE");
    expect(assertion).toMatchObject({ result: "FAIL" });
    expect(assertion.detail).toContain("1 baseline tab stops were never reached");
  });
  it("does not confuse distinct duplicate-looking controls with a completed cycle", () => {
    const duplicateLooking = (identity) => stop("a.nav-link", true, identity);
    const w = analyseFocusWalk([
      duplicateLooking("focusable-1@html>body>nav>a"),
      duplicateLooking("focusable-2@html>body>footer>a"),
    ], { maxStops: 2, expectedIdentities: [
      "focusable-1@html>body>nav>a",
      "focusable-2@html>body>footer>a",
    ] });
    expect(w).toMatchObject({ cycled: false, truncated: true, identityComplete: true });
    expect(w.stops).toHaveLength(2);
  });
  it("makes a missing deterministic identity release-blocking", () => {
    const w = analyseFocusWalk([
      { ...stop("a"), identity: null },
      { ...stop("a"), identity: null },
      { body: true },
    ], expected("a"));
    expect(w).toMatchObject({ identityComplete: false, completeSetCovered: false });
    const assertion = evaluateAudit(cleanAudit(), { focusWalk: w })
      .find((candidate) => candidate.id === "FOCUS_ORDER_REACHABLE");
    expect(assertion).toMatchObject({ result: "FAIL" });
    expect(assertion.detail).toContain("deterministic DOM identity");
  });
  it("rejects a permanent visual style with no focus-induced delta", () => {
    const w = analyseFocusWalk([
      { ...stop("button", false), focusVisible: true, baselineCaptured: true, focusVisualDelta: false },
      { body: true },
    ], expected("button"));
    const assertion = evaluateAudit(cleanAudit(), { focusWalk: w })
      .find((candidate) => candidate.id === "FOCUS_VISIBLE_PRESENT");
    expect(assertion).toMatchObject({ result: "FAIL", count: 1 });
    expect(assertion.detail).toContain("no focus-induced visual delta");
  });
  it("makes a max-stop truncation release-blocking instead of accepting a partial walk", () => {
    const w = analyseFocusWalk([stop("a")], { maxStops: 1, expectedIdentities: ["a"] });
    expect(w).toMatchObject({ cycled: false, trapped: false, truncated: true, maxStops: 1 });
    const assertions = evaluateAudit(cleanAudit(), { focusWalk: w });
    const focus = assertions.find((assertion) => assertion.id === "FOCUS_ORDER_REACHABLE");
    expect(focus).toMatchObject({ result: "FAIL", count: 1 });
    expect(focus.detail).toContain("1-stop limit");
    expect(runVerdict(assertions)).toBe("AUTOMATED_FAIL");
  });
});

describe("artifactName / slug", () => {
  it("follows the packet convention <surface>--<state>--<browser>--<width|200pct>--<seq>.png", () => {
    expect(artifactName({ surface: "research-home", state: "default", width: 1440 })).toBe("research-home--default--chromium--1440--01.png");
    expect(artifactName({ surface: "Account Overview", state: "unauthorized", width: 720, zoomPercent: 200, variant: "forced-colors", sequence: 3 })).toBe("account-overview--unauthorized--chromium--200pct-forced-colors--03.png");
  });
  it("slugs never carry characters outside [a-z0-9-]", () => {
    expect(slug("/research/lots/XR-EVIDENCE")).toBe("research-lots-xr-evidence");
  });
});

describe("aggregateAccessibility", () => {
  it("rolls runs up into the manifest block without ever emitting a bare PASS", () => {
    const runs = [
      { mediaVariant: "default", zoomPercent: 100, assertions: [{ id: "TARGETS_44x44", result: "PASS" }, { id: "FOCUS_VISIBLE_PRESENT", result: "PASS" }, { id: "SINGLE_MAIN_LANDMARK", result: "FAIL" }] },
      { mediaVariant: "reduced-motion", zoomPercent: 100, reducedMotionApplied: true, assertions: [] },
      { mediaVariant: "forced-colors", zoomPercent: 100, forcedColorsActive: true, assertions: [] },
      { mediaVariant: "default", zoomPercent: 200, assertions: [{ id: "NO_HORIZONTAL_OVERFLOW", result: "PASS" }] },
    ];
    const agg = aggregateAccessibility(runs);
    expect(agg.targetSize44x44).toBe("AUTOMATED_PASS");
    expect(agg.singleMainLandmark).toBe("AUTOMATED_FAIL");
    expect(agg.reducedMotion).toBe("AUTOMATED_RENDERED");
    expect(agg.forcedColors).toBe("AUTOMATED_RENDERED");
    expect(agg.zoom200Percent).toBe("AUTOMATED_PASS");
    expect(agg.manualReview).toBe("PENDING");
    expect(Object.values(agg)).not.toContain("PASS");
  });
  it("is PENDING with no runs", () => {
    expect(aggregateAccessibility([]).keyboard).toBe("PENDING");
  });
});
