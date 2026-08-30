// Pure evaluation of audit results into assertions. No I/O, unit-tested.
import { createHash } from "node:crypto";

export const ASSERTION_IDS = [
  "NO_HORIZONTAL_OVERFLOW",
  "NO_CLIPPED_TEXT",
  "TARGETS_44x44",
  "SINGLE_MAIN_LANDMARK",
  "NO_NESTED_MAIN",
  "NO_DUPLICATE_IDS",
  "SINGLE_H1",
  "FORM_CONTROLS_LABELLED",
  "IMAGES_HAVE_ALT",
  "ARIA_REFERENCES_RESOLVE",
  "DOCUMENT_LANG",
  "FOCUS_ORDER_REACHABLE",
  "FOCUS_VISIBLE_PRESENT",
  "EXPECTED_HTTP_FAILURES_OBSERVED",
  "SAME_ORIGIN_NETWORK_BOUNDARY",
  "CONSOLE_CLEAN",
  "NETWORK_CLEAN",
];

/** Evaluate one page audit (plus optional focus walk, console, network) into assertions. */
export function evaluateAudit(audit, {
  focusWalk = null,
  console: consoleRecords = [],
  network = [],
  networkBoundaryViolations = [],
  networkBoundaryFulfillments = [],
  allowNetwork = [],
  expectedHttpFailures = [],
} = {}) {
  const assertions = [];
  const push = (id, pass, detail, count) => assertions.push({ id, result: pass ? "PASS" : "FAIL", detail, ...(count !== undefined ? { count } : {}) });
  const pushResult = (id, result, detail, count) => assertions.push({ id, result, detail, ...(count !== undefined ? { count } : {}) });

  const o = audit.overflow ?? {};
  push(
    "NO_HORIZONTAL_OVERFLOW",
    !o.horizontalOverflow,
    o.horizontalOverflow ? `document scrollWidth ${o.documentScrollWidth} > viewport ${o.clientWidth}` : `scrollWidth ${o.documentScrollWidth} <= viewport ${o.clientWidth}`,
    (o.offenders ?? []).length,
  );
  push("NO_CLIPPED_TEXT", (o.clippedText ?? []).length === 0, summarise(o.clippedText, (c) => `${c.selector} (${c.scrollWidth}>${c.clientWidth})`), (o.clippedText ?? []).length);

  const t = audit.targets ?? {};
  push("TARGETS_44x44", (t.undersizedCount ?? 0) === 0, summarise(t.undersized, (u) => `${u.selector} ${u.width}x${u.height} "${u.text}"`), t.undersizedCount ?? 0);

  const l = audit.landmarks ?? {};
  push("SINGLE_MAIN_LANDMARK", l.mainCount === 1, `main landmark count = ${l.mainCount} [${(l.mainSelectors ?? []).join(", ")}]`, l.mainCount);
  push("NO_NESTED_MAIN", (l.nestedMainCount ?? 0) === 0, `nested main count = ${l.nestedMainCount ?? 0}`, l.nestedMainCount ?? 0);

  push("NO_DUPLICATE_IDS", (audit.duplicateIds ?? []).length === 0, summarise(audit.duplicateIds, (d) => `#${d.id} x${d.count}`), (audit.duplicateIds ?? []).length);
  push("SINGLE_H1", audit.headings?.h1Count === 1, `h1 count = ${audit.headings?.h1Count}`, audit.headings?.h1Count);
  push("FORM_CONTROLS_LABELLED", (audit.forms?.unlabelledControls ?? []).length === 0, summarise(audit.forms?.unlabelledControls, (u) => `${u.selector} [${u.type}]`), (audit.forms?.unlabelledControls ?? []).length);
  push("IMAGES_HAVE_ALT", (audit.images?.missingAlt ?? []).length === 0, summarise(audit.images?.missingAlt, (i) => i.selector), (audit.images?.missingAlt ?? []).length);
  push("ARIA_REFERENCES_RESOLVE", (audit.invalidAriaRefs ?? []).length === 0, summarise(audit.invalidAriaRefs, (r) => `${r.selector} ${r.attr}=${r.id}`), (audit.invalidAriaRefs ?? []).length);
  push("DOCUMENT_LANG", Boolean(audit.lang), `html lang = ${audit.lang ?? "(missing)"}`);

  if (focusWalk) {
    const stops = focusWalk.stops ?? [];
    const withoutIndicator = stops.filter((s) => !s.indicator);
    const focusComplete = stops.length > 0
      && focusWalk.cycled === true
      && !focusWalk.trapped
      && !focusWalk.truncated
      && focusWalk.identityComplete === true
      && focusWalk.completeSetCovered === true;
    push(
      "FOCUS_ORDER_REACHABLE",
      focusComplete,
      focusWalk.trapped
        ? `focus trapped at ${focusWalk.trappedAt}`
        : focusWalk.truncated
          ? `${stops.length} tab stops reached but the walk hit its ${focusWalk.maxStops ?? "configured"}-stop limit before cycling`
          : focusWalk.identityComplete !== true
            ? `${stops.length} tab stops reached but one or more lacked a deterministic DOM identity`
          : focusWalk.completeSetCovered !== true
            ? `${stops.length} tab stops reached but ${focusWalk.missingIdentityCount ?? "unknown"} baseline tab stops were never reached`
            : `${stops.length} of ${focusWalk.expectedIdentityCount} baseline tab stops reached (cycled: ${focusWalk.cycled === true})`,
      stops.length,
    );
    push(
      "FOCUS_VISIBLE_PRESENT",
      withoutIndicator.length === 0,
      summarise(withoutIndicator, (s) => {
        const reason = s.baselineCaptured !== true
          ? "unfocused baseline missing"
          : s.focusVisible !== true
            ? ":focus-visible did not match"
            : s.focusVisualDelta !== true
              ? "no focus-induced visual delta"
              : "indicator missing";
        return `${s.selector} "${s.text}" (${reason})`;
      }),
      withoutIndicator.length,
    );
  } else {
    assertions.push({ id: "FOCUS_ORDER_REACHABLE", result: "NOT_RUN", detail: "focus walk not executed" });
    assertions.push({ id: "FOCUS_VISIBLE_PRESENT", result: "NOT_RUN", detail: "focus walk not executed" });
  }

  const consoleErrors = consoleRecords.filter((c) => c.level !== "warning" && c.level !== "log:warning");
  const failedNetwork = network.filter((n) => (n.failed && !n.canceled) || n.status >= 400);
  const matchesExpectedNetwork = (record, expected) =>
    record.url === expected.url
    && Number(record.status) === Number(expected.status)
    && String(record.method ?? "GET").toUpperCase() === String(expected.method ?? "GET").toUpperCase()
    && record.bodySha256 === expected.responseBodySha256
    && (expected.resourceType === undefined || record.type === expected.resourceType)
    && (expected.targetType === undefined || record.targetType === expected.targetType);
  const observations = expectedHttpFailures.map((expected) => ({
    expected,
    networkCount: failedNetwork.filter((record) => matchesExpectedNetwork(record, expected)).length,
    consoleCount: expected.consoleText
      ? consoleErrors.filter((record) =>
        record.url === expected.url && record.text === expected.consoleText).length
      : 0,
  }));
  const mismatchedExpectations = observations.filter(({ expected, networkCount, consoleCount }) =>
    networkCount !== Number(expected.count ?? 1)
    || consoleCount !== Number(expected.consoleCount ?? expected.count ?? 1));
  const expectedNetwork = failedNetwork.filter((record) => expectedHttpFailures.some((expected) => matchesExpectedNetwork(record, expected)));
  const unexpectedNetwork = failedNetwork
    .filter((record) => !expectedNetwork.includes(record))
    .filter((record) => !allowNetwork.some((re) => re.test(record.url)));

  const expectedConsoleErrors = consoleErrors.filter((record) =>
    expectedHttpFailures.some((expected) =>
      expected.consoleText
      && record.url === expected.url
      && record.text === expected.consoleText));
  const unexpectedConsoleErrors = consoleErrors.filter((record) => !expectedConsoleErrors.includes(record));

  const exactDeclarationDrift = expectedHttpFailures.length > 0
    ? mismatchedExpectations.length + unexpectedNetwork.length + unexpectedConsoleErrors.length
    : mismatchedExpectations.length;
  push(
    "EXPECTED_HTTP_FAILURES_OBSERVED",
    exactDeclarationDrift === 0,
    expectedHttpFailures.length === 0
      ? "none declared"
      : exactDeclarationDrift === 0
        ? `${expectedHttpFailures.length} declared failure(s) observed with exact URL, method, status, network count, body hash, resource/target type, and console count`
        : [
            summarise(mismatchedExpectations, ({ expected, networkCount, consoleCount }) => `${expected.method ?? "GET"} ${expected.status} ${expected.url} body=${expected.responseBodySha256}: expected network=${expected.count ?? 1} console=${expected.consoleCount ?? expected.count ?? 1}, observed network=${networkCount} console=${consoleCount}`),
            unexpectedNetwork.length ? `unexpected network: ${summarise(unexpectedNetwork, (record) => `${record.method ?? "GET"} ${record.status || record.error} ${record.url} body=${record.bodySha256 ?? "unavailable"}`)}` : null,
            unexpectedConsoleErrors.length ? `unexpected console: ${summarise(unexpectedConsoleErrors, (record) => `[${record.level}] ${record.text}`)}` : null,
          ].filter(Boolean).join("; "),
    observations.reduce((sum, observation) => sum + observation.networkCount, 0),
  );

  push(
    "SAME_ORIGIN_NETWORK_BOUNDARY",
    networkBoundaryViolations.length === 0,
    networkBoundaryViolations.length === 0
      ? networkBoundaryFulfillments.length === 0
        ? "all page traffic remained on the evidence preview origin; WebSockets disabled"
        : `all dispatched traffic remained on origin; ${networkBoundaryFulfillments.length} exact external resource request(s) fulfilled locally without dispatch: ${summarise(networkBoundaryFulfillments, (record) => `${record.url} body=${record.responseBodySha256}`)}`
      : summarise(
          networkBoundaryViolations,
          (record) => `${record.method ?? "GET"} ${record.url ?? "(missing URL)"}: ${record.reason ?? "blocked"}`,
        ),
    networkBoundaryViolations.length,
  );

  if (unexpectedConsoleErrors.length > 0) {
    push("CONSOLE_CLEAN", false, summarise(unexpectedConsoleErrors, (c) => `[${c.level}] ${c.text}`), unexpectedConsoleErrors.length);
  } else if (expectedConsoleErrors.length > 0) {
    pushResult("CONSOLE_CLEAN", "PASS_WITH_NOTES", summarise(expectedConsoleErrors, (c) => `[declared] ${c.text} @ ${c.url}`), expectedConsoleErrors.length);
  } else {
    push("CONSOLE_CLEAN", true, "none", 0);
  }

  if (unexpectedNetwork.length > 0) {
    push("NETWORK_CLEAN", false, summarise(unexpectedNetwork, (n) => `${n.status || n.error} ${n.url}`), unexpectedNetwork.length);
  } else if (expectedNetwork.length > 0) {
    pushResult("NETWORK_CLEAN", "PASS_WITH_NOTES", summarise(expectedNetwork, (n) => `[declared] ${n.method ?? "GET"} ${n.status} ${n.url}`), expectedNetwork.length);
  } else {
    push("NETWORK_CLEAN", true, "none", 0);
  }

  return assertions;
}

/** Stable fingerprint for a route's complete raw target-size finding set. */
export function targetFindingFingerprint(audit) {
  const findings = (audit?.targets?.undersized ?? []).map((finding) => ({
    selector: finding.selector,
    tag: finding.tag,
    role: finding.role ?? null,
    text: finding.text,
    width: finding.width,
    height: finding.height,
    inlineText: Boolean(finding.inlineText),
    offscreen: Boolean(finding.offscreen),
  }));
  const payload = {
    viewport: {
      width: audit?.viewport?.width ?? null,
      height: audit?.viewport?.height ?? null,
      devicePixelRatio: audit?.viewport?.devicePixelRatio ?? null,
    },
    reducedMotionApplied: Boolean(audit?.reducedMotionApplied),
    forcedColorsActive: Boolean(audit?.forcedColorsActive),
    findings,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Convert only an exact, reviewed historical target-size finding fingerprint
 * into a pass-with-notes result. The raw audit and original failure remain in
 * the run artifact; any added, removed, or resized finding changes the hash
 * and stays blocking.
 */
export function applyReviewedAssertionNotes(assertions, audit, notes = []) {
  return assertions.map((assertion) => {
    if (assertion.result !== "FAIL") return assertion;
    const note = notes.find((candidate) => candidate.id === assertion.id);
    if (!note || assertion.id !== "TARGETS_44x44" || note.sourceBindingVerified !== true) return assertion;
    const findingFingerprint = targetFindingFingerprint(audit);
    if (!(note.allowedFindingFingerprints ?? []).includes(findingFingerprint)) return assertion;
    return {
      ...assertion,
      result: "PASS_WITH_NOTES",
      originalResult: assertion.result,
      originalDetail: assertion.detail,
      findingFingerprint,
      reviewedNote: {
        reason: note.reason,
        productionCommit: note.productionCommit,
        productionEvidence: note.productionEvidence,
        candidateSourceBinding: note.candidateSourceBinding,
      },
      detail: `exact reviewed historical-parity finding ${findingFingerprint}; ${note.reason}`,
    };
  });
}

export function summarise(items, fmt, limit = 8) {
  const arr = items ?? [];
  if (arr.length === 0) return "none";
  const head = arr.slice(0, limit).map(fmt);
  return `${arr.length}: ${head.join("; ")}${arr.length > limit ? "; …" : ""}`;
}

/** Roll a run's assertion list into a coarse per-run verdict. Never a release verdict. */
export function runVerdict(assertions, { informational = [] } = {}) {
  const failing = assertions.filter((a) => a.result === "FAIL");
  const blocking = failing.filter((a) => !informational.includes(a.id));
  if (blocking.length) return "AUTOMATED_FAIL";
  if (failing.length) return "AUTOMATED_PASS_WITH_NOTES";
  if (assertions.some((a) => a.result === "PASS_WITH_NOTES")) return "AUTOMATED_PASS_WITH_NOTES";
  return "AUTOMATED_PASS";
}

/** Aggregate all runs of one matrix into the manifest's accessibilityEvidence block. */
export function aggregateAccessibility(runs) {
  const byId = (id) => {
    const seen = runs.flatMap((r) => (r.assertions ?? []).filter((a) => a.id === id));
    if (seen.length === 0) return "PENDING";
    if (seen.some((a) => a.result === "FAIL")) return "AUTOMATED_FAIL";
    if (seen.every((a) => a.result === "NOT_RUN")) return "PENDING";
    if (seen.some((a) => a.result === "PASS_WITH_NOTES")) return "AUTOMATED_PASS_WITH_NOTES";
    return "AUTOMATED_PASS";
  };
  const reduced = runs.filter((r) => r.mediaVariant === "reduced-motion");
  const zoom = runs.filter((r) => r.zoomPercent === 200);
  const zoomOverflow = zoom.flatMap((r) => (r.assertions ?? []).filter((a) => a.id === "NO_HORIZONTAL_OVERFLOW"));
  return {
    keyboard: byId("FOCUS_ORDER_REACHABLE"),
    visibleFocus: byId("FOCUS_VISIBLE_PRESENT"),
    singleMainLandmark: byId("SINGLE_MAIN_LANDMARK"),
    headings: byId("SINGLE_H1"),
    targetSize44x44: byId("TARGETS_44x44"),
    reducedMotion: reduced.length === 0
      ? "PENDING"
      : reduced.every((r) => r.reducedMotionApplied ?? r.audit?.reducedMotionApplied)
        ? "AUTOMATED_RENDERED"
        : "AUTOMATED_FAIL",
    forcedColors: runs.filter((r) => r.mediaVariant === "forced-colors").length === 0
      ? "PENDING"
      : runs
          .filter((r) => r.mediaVariant === "forced-colors")
          .every((r) => r.forcedColorsActive ?? r.audit?.forcedColorsActive)
        ? "AUTOMATED_RENDERED"
        : "AUTOMATED_FAIL",
    zoom200Percent: zoomOverflow.length === 0 ? "PENDING" : zoomOverflow.some((a) => a.result === "FAIL") ? "AUTOMATED_FAIL" : "AUTOMATED_PASS",
    automatedScan: runs.length ? "RUN" : "PENDING",
    manualReview: "PENDING",
  };
}

/** Deterministic artifact file name per the packet convention. */
export function artifactName({ surface, state = "default", browser = "chromium", width, zoomPercent = 100, variant = "", sequence = 1 }) {
  const size = zoomPercent === 100 ? String(width) : `${zoomPercent}pct`;
  const tail = variant ? `-${variant}` : "";
  return `${slug(surface)}--${slug(state)}--${slug(browser)}--${size}${tail}--${String(sequence).padStart(2, "0")}.png`;
}

export function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Analyse a focus walk (list of probes after each Tab). */
export function analyseFocusWalk(probes, { maxStops, expectedIdentities }) {
  const stops = [];
  const seen = new Set();
  const expectedInputValid = Array.isArray(expectedIdentities)
    && expectedIdentities.length > 0
    && expectedIdentities.every((identity) => typeof identity === "string" && identity.length > 0);
  const expected = expectedInputValid ? [...new Set(expectedIdentities)] : [];
  let identityComplete = expectedInputValid;
  let cycled = false;
  let earlyCycle = false;
  let trapped = false;
  let trappedAt = null;
  let repeat = 0;
  let last = null;
  for (const [probeIndex, p] of probes.entries()) {
    if (p.body) {
      if (stops.length && expected.every((identity) => seen.has(identity))) cycled = true;
      else if (stops.length) earlyCycle = true;
      break;
    }
    const hasIdentity = typeof p.identity === "string" && p.identity.length > 0;
    if (!hasIdentity) identityComplete = false;
    // A missing identity must never collapse two distinct controls into a
    // false cycle. Its per-probe sentinel instead forces a conservative
    // incomplete/truncated result.
    const key = hasIdentity ? p.identity : `__missing_identity_${probeIndex}`;
    if (last === key) {
      // Same element after another Tab: a trap once it repeats three times.
      repeat++;
      if (repeat >= 3) {
        trapped = true;
        trappedAt = p.identity ?? p.selector;
        break;
      }
      continue;
    }
    repeat = 0;
    last = key;
    if (seen.has(key) && stops.length > 1) {
      if (expected.every((identity) => seen.has(identity))) cycled = true;
      else earlyCycle = true;
      break;
    }
    seen.add(key);
    stops.push(p);
  }
  const missingIdentities = expected.filter((identity) => !seen.has(identity));
  const completeSetCovered = identityComplete && missingIdentities.length === 0;
  return {
    stops,
    cycled,
    earlyCycle,
    trapped,
    trappedAt,
    maxStops,
    identityComplete,
    expectedIdentities: expected,
    expectedIdentityCount: expected.length,
    visitedIdentityCount: expected.length - missingIdentities.length,
    missingIdentities,
    missingIdentityCount: missingIdentities.length,
    completeSetCovered,
    truncated: !cycled && !trapped && !earlyCycle && probes.length >= maxStops,
  };
}
