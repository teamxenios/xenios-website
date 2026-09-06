// Evidence manifest generator (schemaVersion 2, same shape as the draft packet's
// docs/review/xenios-research-full-site-20260829/evidence-manifest.json).
//
//   node scripts/evidence/generate-evidence-manifest.mjs --out-dir <dir> [--template <existing-manifest.json>]
//        [--sha <sha>] [--reviewer <name>] [--artifact-root docs/review/xenios-research-full-site-20260829/browser]
//        [--output <path>]
//
// Reads browser-matrix.json, http-evidence.json and pii-scan.json from --out-dir
// (whichever exist) and merges them into the template: candidate SHA, tool
// versions, browserMatrix.runs, captures, httpHeadEvidence.records,
// accessibilityEvidence, and the accessibility / responsive / seo gates.
//
// It NEVER sets finalVerdict, readyForSamuelDeployReview or any lane verdict:
// gate results it writes are AUTOMATED_* values, distinct from a reviewer PASS.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateAccessibility } from "./lib/report.mjs";
import {
  classifyEvidenceArtifact,
  validateEvidenceArtifactBytes,
} from "./lib/evidence-artifact-scan-policy.mjs";
import {
  EXACT_HINO_ROBOTS,
  EXACT_INDEX_ROBOTS,
  EXACT_NOINDEX_ROBOTS,
  EXACT_OPEN_GRAPH_IMAGE,
  PRODUCTION_SITE_ORIGIN,
  evaluateHttpHead,
  evaluateRobotsTxt,
  evaluateSitemapLocs,
  extractHtmlMetadata,
  hasCompleteDeclaredOpenGraph,
  isExactProductionRouteUrl,
  parseSitemapLocs,
} from "./lib/html-metadata.mjs";
import {
  assertCleanCandidateCheckout,
  assertPinnedExecutingRuntime,
  REQUIRED_NODE_VERSION,
  REQUIRED_NPM_VERSION,
  validatePreviewProvenance,
} from "./lib/provenance.mjs";
import {
  externalMicrositeInventoryIsScoped,
  isExternalHinoMicrosite,
} from "./lib/route-contract.mjs";
import {
  EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS,
  evaluatePwaWarmupNetworkRecords,
  gitSha,
} from "./capture-browser-matrix.mjs";
import { MAX_FULL_PAGE_HEIGHT_CSS_PX } from "./lib/cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

export function parseArgs(argv) {
  const out = { template: join(here, "evidence-manifest.template.json"), reviewer: null, artifactRoot: "docs/review/xenios-research-full-site-20260829/browser" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--out-dir") out.outDir = next();
    else if (a === "--template") out.template = next();
    else if (a === "--sha") out.sha = next();
    else if (a === "--reviewer") out.reviewer = next();
    else if (a === "--artifact-root") out.artifactRoot = next();
    else if (a === "--output") out.output = next();
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

const PASS_VERDICTS = new Set(["AUTOMATED_PASS", "AUTOMATED_PASS_WITH_NOTES"]);
const INFORMATIONAL_FAILURE_IDS = new Set();
const EXACT_SHA = /^[a-f0-9]{40}$/u;
const REQUIRED_BROWSER_ASSERTIONS = [
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
  "PWA_CONTROLLER_STABLE",
  "EVIDENCE_PHASE_SETTLED",
  "CONSOLE_CLEAN",
  "NETWORK_CLEAN",
  "SAME_ORIGIN_NETWORK_BOUNDARY",
  "SELF_HOSTED_FONTS_LOADED",
  "ROUTE_LOCATION",
  "ROUTE_STATE_CONTRACT",
];
const REQUIRED_SYNTHETIC_ASSERTIONS = [
  ...REQUIRED_BROWSER_ASSERTIONS.filter((id) =>
    ![
      "SAME_ORIGIN_NETWORK_BOUNDARY",
      "PWA_CONTROLLER_STABLE",
      "EVIDENCE_PHASE_SETTLED",
      "SELF_HOSTED_FONTS_LOADED",
    ].includes(id),
  ),
  "EXPECTED_SYNTHETIC_VIEW",
  "LOCAL_ORIGIN_NETWORK_BOUNDARY",
  "EXTERNAL_MUTATIONS",
];
const REQUIRED_HTTP_ASSERTIONS = [
  "STATUS_CODE",
  "CONTENT_TYPE_HTML",
  "X_ROBOTS_TAG",
  "ROBOTS_META",
  "RAW_HTML_TITLE",
  "CANONICAL",
  "OPEN_GRAPH",
  "SITEMAP_PARITY",
  "STRUCTURED_DATA_SCOPE",
  "AUTHORITATIVE_404",
  "PUBLIC_TO_PRIVATE_METADATA_RESTORATION",
];
const EXPECTED_FORGED_STATUS_BODY_SHA256 = createHash("sha256")
  .update('{"error":"not_found","message":"The request was not found."}')
  .digest("hex");
const EXPECTED_PARTNER_NOT_FOUND_BODY_SHA256 = createHash("sha256")
  .update('{"ok":false,"code":"partner_not_found"}')
  .digest("hex");
const EXPECTED_404_CONSOLE_TEXT =
  "Failed to load resource: the server responded with a status of 404 (Not Found)";
const PARTNER_ABSENCE_EVIDENCE_KEYS = [
  "consoleCount",
  "consoleText",
  "declaredExpectedFailure",
  "externalMutations",
  "fixture",
  "kind",
  "localServerBodySha256",
  "localServerErrorCode",
  "localServerMethod",
  "localServerStatus",
  "localServerUrl",
  "networkCount",
  "resourceType",
];
const NEUTRAL_STATUS_TRUTH_KEYS = [
  "credentialPresent",
  "credentialSource",
  "credentialTransport",
  "declaredExpectedFailure",
  "externalMutations",
  "kind",
  "localServerBodySha256",
  "localServerErrorCode",
  "localServerMethod",
  "localServerStatus",
  "referenceRendered",
  "referenceShape",
  "requestDetailsRendered",
];
const VERIFIED_STATUS_TRUTH_KEYS = [
  "credentialPresent",
  "credentialSource",
  "credentialTransport",
  "externalMutations",
  "kind",
  "lineCount",
  "localServerMethod",
  "localServerStatus",
  "referenceShape",
  "responseReferenceMatchedPath",
  "serverStatus",
  "statusDetailsRendered",
];
const SUPPLEMENTAL_HARNESS_KEYS = ["catalog", "account", "step1"];
const SUPPLEMENTAL_SERVER_HARNESS_TO_ORIGIN_KEY = Object.freeze({
  "catalog-component-vite-harness": "catalog",
  "account-portal-preview": "account",
  "step1-hotfix-preview": "step1",
});

const EXPECTED_EXTERNAL_RESOURCE_CONTRACT = {
  result: "PASS",
  discoveredUrls: EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS
    .map((fixture) => new URL(fixture.url).toString())
    .sort(),
  substitutions: EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS.map((fixture) => ({
    url: new URL(fixture.url).toString(),
    contentType: fixture.contentType,
    reason: fixture.reason,
    responseBodySha256: createHash("sha256").update(fixture.body).digest("hex"),
  })),
};

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const hasExactKeys = (value, keys) =>
  value && Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000");
const validTimestamp = (value) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value ?? "") &&
  Number.isFinite(Date.parse(value));
const orderedTimestamps = (started, finished) =>
  validTimestamp(started) && validTimestamp(finished) && Date.parse(finished) >= Date.parse(started);
const captureAfterBuild = (captured, provenance) =>
  validTimestamp(captured) && validTimestamp(provenance?.builtAtUtc) &&
  Date.parse(captured) >= Date.parse(provenance.builtAtUtc);
const timestampWithin = (value, started, finished) =>
  validTimestamp(value) && validTimestamp(started) && validTimestamp(finished) &&
  Date.parse(value) >= Date.parse(started) && Date.parse(value) <= Date.parse(finished);

function loopbackOrigin(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.port ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function assertCanonicalMinimumPolicy(selected, canonical) {
  const failures = [];
  const requireSuperset = (label, actual, required) => {
    const actualSet = new Set(Array.isArray(actual) ? actual : []);
    const missing = (Array.isArray(required) ? required : []).filter((value) => !actualSet.has(value));
    if (missing.length) failures.push(`${label} missing [${missing.join(", ")}]`);
  };
  requireSuperset("requiredSurfaces", selected?.requiredSurfaces, canonical?.requiredSurfaces);
  requireSuperset(
    "requiredRepresentativeSurfaces",
    selected?.requiredRepresentativeSurfaces,
    canonical?.requiredRepresentativeSurfaces,
  );
  requireSuperset("requiredStates", selected?.requiredStates, canonical?.requiredStates);
  requireSuperset(
    "browserMatrix.requiredWidthsCssPx",
    selected?.browserMatrix?.requiredWidthsCssPx,
    canonical?.browserMatrix?.requiredWidthsCssPx,
  );
  requireSuperset(
    "browserRunSchema.requiredFields",
    selected?.browserRunSchema?.requiredFields,
    canonical?.browserRunSchema?.requiredFields,
  );
  requireSuperset(
    "captureSchema.requiredFields",
    selected?.captureSchema?.requiredFields,
    canonical?.captureSchema?.requiredFields,
  );
  requireSuperset(
    "httpHeadEvidence.requiredAssertions",
    selected?.httpHeadEvidence?.requiredAssertions,
    canonical?.httpHeadEvidence?.requiredAssertions,
  );
  for (const required of canonical?.requiredRepresentativeJourneys ?? []) {
    const actual = (selected?.requiredRepresentativeJourneys ?? []).find(
      (candidate) => candidate?.surface === required.surface && candidate?.state === required.state,
    );
    if (!actual) {
      failures.push(`requiredRepresentativeJourneys missing ${required.surface}/${required.state}`);
      continue;
    }
    requireSuperset(
      `requiredRepresentativeJourneys ${required.surface}/${required.state} widthsCssPx`,
      actual.widthsCssPx,
      required.widthsCssPx,
    );
  }
  for (const field of [
    ["browserMatrix.requiresTwoHundredPercentZoomEquivalent", true],
    ["browserRunSchema.candidateShaMustEqualFrozenCandidate", true],
    ["browserRunSchema.realCustomerDataAllowed", false],
    ["captureSchema.realCustomerDataAllowed", false],
  ]) {
    const [path, expected] = field;
    const actual = path.split(".").reduce((value, key) => value?.[key], selected);
    if (actual !== expected) failures.push(`${path} must remain ${expected}`);
  }
  if (selected?.captureSchema?.artifactPathMustBeUnder !== canonical?.captureSchema?.artifactPathMustBeUnder) {
    failures.push("captureSchema.artifactPathMustBeUnder must match the canonical evidence root");
  }
  for (const required of canonical?.testBackedStates ?? []) {
    const actual = (selected?.testBackedStates ?? []).find((candidate) => candidate?.state === required.state);
    if (
      !actual ||
      actual.evidenceClass !== required.evidenceClass ||
      actual.claimScope !== required.claimScope
    ) {
      failures.push(`testBackedStates missing exact ${required.state} policy`);
      continue;
    }
    requireSuperset(
      `testBackedStates ${required.state} evidenceRefs`,
      actual.evidenceRefs,
      required.evidenceRefs,
    );
  }
  if (failures.length) {
    throw new Error(`selected template weakens the canonical minimum policy: ${failures.join("; ")}`);
  }
  return selected;
}

function normalizeSupplementalHarnessOrigins(value) {
  if (!hasExactKeys(value, SUPPLEMENTAL_HARNESS_KEYS)) return null;
  const normalized = Object.fromEntries(
    SUPPLEMENTAL_HARNESS_KEYS.map((key) => [key, loopbackOrigin(value[key])]),
  );
  if (
    SUPPLEMENTAL_HARNESS_KEYS.some((key) => !normalized[key]) ||
    new Set(Object.values(normalized)).size !== SUPPLEMENTAL_HARNESS_KEYS.length
  ) {
    return null;
  }
  return normalized;
}

function validSupplementalSafetyBoundary(value, harnessOrigins) {
  if (
    !value || value.environment !== "DEV_ONLY" ||
    value.productionDeploymentContacted !== false ||
    value.externalHttpRequestPolicy !== "BLOCK_ALL; NO_SUBSTITUTIONS_OR_FULFILLMENTS" ||
    value.backendAdapters !== "SYNTHETIC_IN_MEMORY" ||
    !Array.isArray(value.blockedBrowserRequests) ||
    value.blockedBrowserRequests.length !== 0 ||
    !Array.isArray(value.observedWebSockets)
  ) return false;
  const catalogWsOrigin = harnessOrigins?.catalog
    ?.replace(/^http:/u, "ws:")
    .replace(/^https:/u, "wss:");
  return Boolean(catalogWsOrigin) && value.observedWebSockets.every((entry) => {
    if (!entry || entry.allowed !== true) return false;
    try {
      const url = new URL(entry.url);
      return url.origin === catalogWsOrigin && !url.username && !url.password;
    } catch {
      return false;
    }
  });
}

function expectedSupplementalArtifactInventory(captures, candidateSha) {
  const files = captures.flatMap((capture) => [
    {
      path: capture.artifactPath,
      kind: "screenshot",
      bytes: capture.artifactBytes,
      sha256: capture.artifactSha256,
      candidateSha,
    },
    {
      path: capture.textArtifactPath,
      kind: "rendered-page-text",
      bytes: capture.textArtifactBytes,
      sha256: capture.textArtifactSha256,
      candidateSha,
    },
  ]).sort((left, right) => left.path.localeCompare(right.path));
  return {
    scope: "synthetic capture artifacts; this JSON envelope is excluded to avoid a self-hash",
    candidateSha,
    fileCount: files.length,
    inventorySha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    files,
  };
}

function validSupplementalArtifactInventory(value, captures, candidateSha, artifactVerifier) {
  const expected = expectedSupplementalArtifactInventory(captures, candidateSha);
  if (JSON.stringify(value) !== JSON.stringify(expected)) return false;
  const paths = expected.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length) return false;
  return expected.files.every((file) =>
    Number.isInteger(file.bytes) && file.bytes > 0 &&
    /^[a-f0-9]{64}$/u.test(file.sha256 ?? "") &&
    artifactVerifier(file.path, file.sha256, { byteLength: file.bytes }),
  );
}

function inspectPreviewProvenance({ provenance, sha, sourceTree, packageLockSha256 }) {
  try {
    const validated = validatePreviewProvenance(provenance, {
      candidateSha: sha,
      sourceTree,
      packageLockSha256,
    });
    return { result: "AUTOMATED_PASS", failures: [], ...validated };
  } catch (error) {
    return {
      result: "INVALID_EVIDENCE",
      failures: [String(error?.message ?? error)],
      candidateSha: provenance?.candidateSha ?? null,
      sourceTree: provenance?.sourceTree ?? null,
      distInventorySha256: provenance?.distInventorySha256 ?? null,
      distFileCount: provenance?.distFileCount ?? null,
      builtAtUtc: provenance?.builtAtUtc ?? null,
      nodeVersion: provenance?.nodeVersion ?? null,
      npmVersion: provenance?.npmVersion ?? null,
      packageLockSha256: provenance?.packageLockSha256 ?? null,
      installMethod: provenance?.installMethod ?? null,
    };
  }
}

const provenanceFingerprint = (provenance) => JSON.stringify({
  kind: provenance?.kind ?? null,
  candidateSha: provenance?.candidateSha ?? null,
  sourceTree: provenance?.sourceTree ?? null,
  distInventorySha256: provenance?.distInventorySha256 ?? null,
  distFileCount: provenance?.distFileCount ?? null,
  builtAtUtc: provenance?.builtAtUtc ?? null,
  nodeVersion: provenance?.nodeVersion ?? null,
  npmVersion: provenance?.npmVersion ?? null,
  packageLockSha256: provenance?.packageLockSha256 ?? null,
  installMethod: provenance?.installMethod ?? null,
});
const validCaptureRuntime = (tool) =>
  tool?.node === REQUIRED_NODE_VERSION && tool?.npm === REQUIRED_NPM_VERSION;
const validExternalResourceContract = (value) =>
  JSON.stringify(value ?? null) === JSON.stringify(EXPECTED_EXTERNAL_RESOURCE_CONTRACT);
const validRunNetworkBoundary = (record, routeContract = null) => {
  if (!Array.isArray(record?.networkBoundaryViolations) || record.networkBoundaryViolations.length) {
    return false;
  }
  if (!Array.isArray(record?.networkBoundaryFulfillments)) return false;
  if (isExternalHinoMicrosite(routeContract)) {
    return record.networkBoundaryFulfillments.length === 0;
  }
  if (record.networkBoundaryFulfillments.length !== EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS.length) {
    return false;
  }
  return EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS.every((fixture) => {
    const expectedUrl = new URL(fixture.url).toString();
    const expectedHash = createHash("sha256").update(fixture.body).digest("hex");
    const expectedBytes = Buffer.byteLength(fixture.body, "utf8");
    const matches = record.networkBoundaryFulfillments.filter(
      (fulfillment) => fulfillment?.url === expectedUrl,
    );
    return matches.length === 1 &&
      matches[0].method === "GET" &&
      nonEmpty(matches[0].resourceType) &&
      matches[0].responseBodySha256 === expectedHash &&
      matches[0].responseBytes === expectedBytes &&
      matches[0].reason === fixture.reason;
  });
};
const validAssertions = (assertions, required) =>
  Array.isArray(assertions) &&
  required.every((id) => assertions.filter((assertion) => assertion?.id === id).length === 1) &&
  new Set(assertions.map((assertion) => assertion?.id)).size === assertions.length &&
  assertions.every(
    (assertion) =>
      nonEmpty(assertion?.id) &&
      ["PASS", "PASS_WITH_NOTES", "FAIL", "NOT_RUN", "NOT_APPLICABLE"].includes(
        assertion.result,
      ),
  );
const blockingAssertionFailures = (record) =>
  (record?.assertions ?? []).filter(
    (assertion) => assertion.result === "FAIL" && !INFORMATIONAL_FAILURE_IDS.has(assertion.id),
  );
const assertionResult = (record, id) =>
  record?.assertions?.find((assertion) => assertion.id === id)?.result ?? null;
const passingResult = (result) => ["PASS", "PASS_WITH_NOTES"].includes(result);
const validSignalSummary = (record) => {
  const consoleAssertion = assertionResult(record, "CONSOLE_CLEAN");
  const networkAssertion = assertionResult(record, "NETWORK_CLEAN");
  const consoleMatches = consoleAssertion === "PASS"
    ? record.consoleResult === "CLEAN"
    : consoleAssertion === "PASS_WITH_NOTES" && /^ERRORS:[1-9]\d*$/u.test(record.consoleResult ?? "");
  const networkMatches = networkAssertion === "PASS"
    ? record.networkResult === "CLEAN"
    : networkAssertion === "PASS_WITH_NOTES" && /^FAILURES:[1-9]\d*$/u.test(record.networkResult ?? "");
  return consoleMatches && networkMatches;
};
const focusApplicable = (record) =>
  record.zoomPercent === 100 &&
  record.mediaVariant !== "reduced-motion" &&
  (record.mediaVariant === "forced-colors" ||
    (record.mediaVariant === "default" && [1440, 390].includes(record.widthCssPx)));

function validMatrixAssertionResults(record, routeContract) {
  const explicitlyNonFocusVariant = !focusApplicable(record);
  for (const assertion of record.assertions) {
    if (["EXPECTED_HTTP_FAILURES_OBSERVED", "SAME_ORIGIN_NETWORK_BOUNDARY"].includes(assertion.id)) {
      if (assertion.result === "PASS") continue;
      return false;
    }
    if (["FOCUS_ORDER_REACHABLE", "FOCUS_VISIBLE_PRESENT"].includes(assertion.id)) {
      if (assertion.result === "NOT_RUN" && explicitlyNonFocusVariant) continue;
      if (passingResult(assertion.result)) continue;
      return false;
    }
    if (assertion.id === "ROUTE_STATE_CONTRACT") {
      if (assertion.result === "PASS") continue;
      return false;
    }
    if (assertion.id === "SELF_HOSTED_FONTS_LOADED") {
      const expected = isExternalHinoMicrosite(routeContract) ? "NOT_APPLICABLE" : "PASS";
      if (assertion.result === expected) continue;
      return false;
    }
    if (!passingResult(assertion.result)) return false;
  }
  return true;
}

function validRouteMetadataContract(record, routeContract) {
  const expected = routeContract?.metadataContract;
  if (expected === undefined) return true;
  if (
    !expected ||
    typeof expected !== "object" ||
    Array.isArray(expected) ||
    Object.keys(expected).sort().join(",") !== "description,title" ||
    !nonEmpty(expected.title) ||
    !nonEmpty(expected.description)
  ) return false;
  return Boolean(
    record?.documentMetadata &&
    Object.keys(record.documentMetadata).sort().join(",") === "canonical,description,openGraph,title" &&
    record.documentMetadata.title === expected.title &&
    record.documentMetadata.description === expected.description &&
    (routeContract.indexable !== true || (
      record.documentMetadata.canonical === new URL(
        routeContract.path,
        `${PRODUCTION_SITE_ORIGIN}/`,
      ).toString() &&
      record.documentMetadata.openGraph?.title === expected.title &&
      record.documentMetadata.openGraph?.description === expected.description &&
      record.documentMetadata.openGraph?.image === EXACT_OPEN_GRAPH_IMAGE &&
      record.documentMetadata.openGraph?.url === new URL(
        routeContract.path,
        `${PRODUCTION_SITE_ORIGIN}/`,
      ).toString() &&
      record.documentMetadata.openGraph?.type === "website" &&
      Object.keys(record.documentMetadata.openGraph).sort().join(",") ===
        "description,image,title,type,url"
    ))
  );
}

function validFocusWalk(record) {
  if (!focusApplicable(record)) {
    return record.focusWalk === null || record.focusWalk === undefined;
  }
  return validCompletedFocusWalk(record);
}

function validCompletedFocusWalk(record) {
  const stops = record?.focusWalk?.stops;
  const identities = Array.isArray(stops)
    ? stops.map((stop) => stop?.identity)
    : [];
  const expectedIdentities = record?.focusWalk?.expectedIdentities;
  const privacySafeIdentity = /^focusable-[1-9]\d*@[a-z][a-z0-9-]*:nth-of-type\([1-9]\d*\)(?:>[a-z][a-z0-9-]*:nth-of-type\([1-9]\d*\))*$/u;
  const expectedSet = new Set(Array.isArray(expectedIdentities) ? expectedIdentities : []);
  const visitedSet = new Set(identities);
  const missingIdentities = Array.isArray(expectedIdentities)
    ? expectedIdentities.filter((identity) => !visitedSet.has(identity))
    : [];
  return Boolean(
    record.focusWalk &&
    Array.isArray(stops) &&
    stops.length > 0 &&
    record.focusWalk.identityComplete === true &&
    Array.isArray(expectedIdentities) &&
    expectedIdentities.length > 0 &&
    expectedSet.size === expectedIdentities.length &&
    expectedIdentities.every((identity) => privacySafeIdentity.test(identity)) &&
    record.focusWalk.expectedIdentityCount === expectedIdentities.length &&
    record.focusWalk.visitedIdentityCount === expectedIdentities.length &&
    Array.isArray(record.focusWalk.missingIdentities) &&
    JSON.stringify(record.focusWalk.missingIdentities) === JSON.stringify(missingIdentities) &&
    record.focusWalk.missingIdentityCount === 0 &&
    record.focusWalk.completeSetCovered === true &&
    new Set(identities).size === stops.length &&
    stops.every((stop) =>
      privacySafeIdentity.test(stop?.identity ?? "") &&
      expectedSet.has(stop.identity) &&
      stop?.baselineCaptured === true &&
      stop?.focusVisible === true &&
      stop?.focusVisualDelta === true &&
      stop?.indicator === true &&
      Array.isArray(stop?.changedVisualProperties) &&
      stop.changedVisualProperties.length > 0 &&
      stop.changedVisualProperties.every((property) =>
        /^(?:self|ancestor-[1-3])\.[A-Za-z][A-Za-z0-9]*$/u.test(property),
      )
    ) &&
    record.focusWalk.cycled === true &&
    record.focusWalk.earlyCycle === false &&
    typeof record.focusWalk.trapped === "boolean" &&
    record.focusWalk.trapped === false &&
    record.focusWalk.truncated === false,
  );
}

function validStatusTruthEvidence(record) {
  const statusState = `${record?.surface ?? ""}|${record?.state ?? ""}`;
  const isNeutralDenial = statusState === "order-status|neutral-error";
  const isServerVerified = statusState === "order-status|server-verified";
  if (!isNeutralDenial && !isServerVerified) {
    return record?.statusTruthEvidence === null || record?.statusTruthEvidence === undefined;
  }

  let actualUrl;
  try {
    actualUrl = new URL(record.actualUrl);
  } catch {
    return false;
  }
  if (
    actualUrl.search ||
    actualUrl.hash ||
    actualUrl.pathname !==
      "/research/early-access/order-request/SYNTHETIC-REFERENCE-REDACTED" ||
    record.logicalRoute !== "/research/early-access/order-request/:publicReference"
  ) {
    return false;
  }
  const expectedFixtureId = isNeutralDenial
    ? "step1-valid-shaped-forged-reference-without-status-token"
    : "step1-same-session-status-token-server-verified";
  if (record.syntheticFixtureId !== expectedFixtureId) {
    return false;
  }

  const proof = record.statusTruthEvidence;
  if (!proof || proof.referenceShape !== "XRR-YYYYMMDD-10_HEX" || proof.externalMutations !== 0) {
    return false;
  }
  if (isNeutralDenial) {
    return Boolean(
      hasExactKeys(proof, NEUTRAL_STATUS_TRUTH_KEYS) &&
      proof.kind === "VALID_SHAPED_REFERENCE_DENIED" &&
      proof.credentialSource === "ABSENT" &&
      proof.credentialTransport === "NONE" &&
      proof.credentialPresent === false &&
      proof.localServerMethod === "GET" &&
      proof.localServerStatus === 404 &&
      proof.localServerErrorCode === "not_found" &&
      proof.localServerBodySha256 === EXPECTED_FORGED_STATUS_BODY_SHA256 &&
      proof.referenceRendered === false &&
      proof.requestDetailsRendered === false &&
      proof.declaredExpectedFailure === true
    );
  }
  return Boolean(
    hasExactKeys(proof, VERIFIED_STATUS_TRUTH_KEYS) &&
    proof.kind === "SAME_SESSION_SERVER_VERIFIED" &&
    proof.credentialSource === "SESSION_STORAGE_SEPARATE_TOKEN_KEY" &&
    proof.credentialTransport === "x-xenios-order-status-token request header" &&
    proof.credentialPresent === true &&
    proof.localServerMethod === "GET" &&
    proof.localServerStatus === 200 &&
    proof.responseReferenceMatchedPath === true &&
    proof.serverStatus === "submitted" &&
    Number.isInteger(proof.lineCount) &&
    proof.lineCount >= 1 &&
    proof.statusDetailsRendered === true
  );
}

function validPartnerAbsenceEvidence(record, harnessOrigins) {
  const isOrdersEmpty = record?.surface === "orders" && record?.state === "empty";
  if (!isOrdersEmpty) {
    return record?.partnerAbsenceEvidence === null ||
      record?.partnerAbsenceEvidence === undefined;
  }

  let actualUrl;
  let localServerUrl;
  try {
    actualUrl = new URL(record.actualUrl);
    localServerUrl = new URL(record.partnerAbsenceEvidence?.localServerUrl);
  } catch {
    return false;
  }
  const proof = record.partnerAbsenceEvidence;
  const accountOrigin = harnessOrigins?.account;
  return Boolean(
    accountOrigin &&
    record.serverHarness === "account-portal-preview" &&
    record.syntheticFixtureId === "account-portal-empty-persona" &&
    record.logicalRoute === "/research/account/orders" &&
    actualUrl.origin === accountOrigin &&
    actualUrl.pathname === "/research/account/orders" &&
    !actualUrl.search &&
    !actualUrl.hash &&
    localServerUrl.toString() === `${accountOrigin}/api/research/partner/me` &&
    hasExactKeys(proof, PARTNER_ABSENCE_EVIDENCE_KEYS) &&
    proof.kind === "OWNED_PARTNER_RELATION_ABSENT" &&
    proof.fixture === record.syntheticFixtureId &&
    proof.localServerMethod === "GET" &&
    proof.localServerStatus === 404 &&
    proof.localServerErrorCode === "partner_not_found" &&
    proof.localServerBodySha256 === EXPECTED_PARTNER_NOT_FOUND_BODY_SHA256 &&
    proof.resourceType === "Fetch" &&
    proof.networkCount === 1 &&
    proof.consoleCount === 1 &&
    proof.consoleText === EXPECTED_404_CONSOLE_TEXT &&
    proof.declaredExpectedFailure === true &&
    proof.externalMutations === 0
  );
}

const supplementalCaptureHasDeclaredDenial = (record) =>
  (record.surface === "order-status" &&
    record.state === "neutral-error" &&
    record.statusTruthEvidence?.kind === "VALID_SHAPED_REFERENCE_DENIED") ||
  (record.surface === "orders" &&
    record.state === "empty" &&
    record.partnerAbsenceEvidence?.kind === "OWNED_PARTNER_RELATION_ABSENT");

function validSupplementalAssertionResults(record) {
  const expectedDenial = supplementalCaptureHasDeclaredDenial(record);
  for (const assertion of record.assertions) {
    if (["CONSOLE_CLEAN", "NETWORK_CLEAN"].includes(assertion.id)) {
      const expected = expectedDenial ? "PASS_WITH_NOTES" : "PASS";
      if (assertion.result !== expected) return false;
      continue;
    }
    if (assertion.result !== "PASS") return false;
  }
  return record.verdict === (expectedDenial
    ? "AUTOMATED_PASS_WITH_NOTES"
    : "AUTOMATED_PASS");
}

function validSupplementalSignalSummary(record) {
  const expectedDenial = supplementalCaptureHasDeclaredDenial(record);
  const matches = (assertionId, summary) => {
    const result = assertionResult(record, assertionId);
    return expectedDenial
      ? result === "PASS_WITH_NOTES" && summary === "DECLARED_EXPECTED_FAILURE"
      : result === "PASS" && summary === "CLEAN";
  };
  return matches("CONSOLE_CLEAN", record.consoleResult) &&
    matches("NETWORK_CLEAN", record.networkResult);
}

function validFontSnapshot(record, routeContract) {
  const snapshot = record?.fontSnapshot;
  if (isExternalHinoMicrosite(routeContract)) {
    return Boolean(
      snapshot &&
      snapshot.applicable === false &&
      snapshot.reason === "external microsite owns its static typography" &&
      Object.keys(snapshot).sort().join(",") === "applicable,reason",
    );
  }
  const exactWeights = (value, weights) =>
    value &&
    Object.keys(value).sort().join(",") === [...weights].sort().join(",") &&
    weights.every((weight) => value[weight] === true);
  return Boolean(
    snapshot &&
    snapshot.applicable === true &&
    nonEmpty(snapshot.bodyFontFamily) &&
    /inter tight/iu.test(snapshot.bodyFontFamily) &&
    exactWeights(snapshot.interTight, ["500", "600", "700", "800", "900"]) &&
    exactWeights(snapshot.jetBrainsMono, ["500", "600"]) &&
    Object.keys(snapshot).sort().join(",") ===
      "applicable,bodyFontFamily,interTight,jetBrainsMono",
  );
}

function validHttpAssertionResults(record, route, sitemapLocs) {
  const externalMicrosite = isExternalHinoMicrosite(route);
  const expectedStatus = route.expectStatus ?? 200;
  const metadataAuthority = !externalMicrosite && route.indexable === true && expectedStatus === 200;
  const expectedRobots = route.indexable ? EXACT_INDEX_ROBOTS : EXACT_NOINDEX_ROBOTS;
  const expectedMetaRobots = externalMicrosite ? EXACT_HINO_ROBOTS : expectedRobots;
  if (route.metadataContract !== undefined) {
    const contract = route.metadataContract;
    if (
      !contract ||
      typeof contract !== "object" ||
      Array.isArray(contract) ||
      Object.keys(contract).sort().join(",") !== "description,title" ||
      !nonEmpty(contract.title) ||
      !nonEmpty(contract.description) ||
      record?.metadata?.title !== contract.title ||
      record?.metadata?.description !== contract.description ||
      (metadataAuthority && (
        record?.metadata?.openGraph?.title !== contract.title ||
        record?.metadata?.openGraph?.description !== contract.description
      ))
    ) return false;
  }
  if (
    record?.metadata?.robotsMetaCount !== 1 ||
    !Array.isArray(record?.metadata?.robotsMetaEntries) ||
    record.metadata.robotsMetaEntries.length !== 1 ||
    record.metadata.robotsMetaEntries[0] !== expectedMetaRobots
  ) return false;
  if (externalMicrosite) {
    if (record?.metadata?.robotsMeta !== EXACT_HINO_ROBOTS) return false;
  } else if (
    record?.headers?.["x-robots-tag"] !== expectedRobots ||
    record?.metadata?.robotsMeta !== expectedRobots
  ) {
    return false;
  }
  if (metadataAuthority) {
    if (
      record?.metadata?.canonicalLinkCount !== 1 ||
      !isExactProductionRouteUrl(record?.metadata?.canonical, route.path) ||
      !hasCompleteDeclaredOpenGraph(
        record?.metadata?.openGraph,
        route.path,
        record?.metadata?.openGraphEntries,
      )
    ) return false;
  } else if (!externalMicrosite && (
    record?.metadata?.canonical !== null ||
    record?.metadata?.canonicalLinkCount !== 0 ||
    !Array.isArray(record?.metadata?.openGraphEntries) ||
    record.metadata.openGraphEntries.length !== 0
  )) {
    return false;
  }
  if (!externalMicrosite) {
    const expectedUrl = new URL(route.path, `${PRODUCTION_SITE_ORIGIN}/`).toString();
    const present = Array.isArray(sitemapLocs) && sitemapLocs.includes(expectedUrl);
    if (present !== (route.indexable === true)) return false;
  }
  const expected = {
    X_ROBOTS_TAG: externalMicrosite ? "NOT_APPLICABLE" : "APPLICABLE",
    ROBOTS_META: "APPLICABLE",
    CANONICAL: externalMicrosite ? "NOT_APPLICABLE" : "APPLICABLE",
    OPEN_GRAPH: externalMicrosite ? "NOT_APPLICABLE" : "APPLICABLE",
    SITEMAP_PARITY: externalMicrosite ? "NOT_APPLICABLE" : "APPLICABLE",
    STRUCTURED_DATA_SCOPE: externalMicrosite ? "NOT_APPLICABLE" : "APPLICABLE",
    AUTHORITATIVE_404: route.surface === "not-found-error" ? "APPLICABLE" : "NOT_APPLICABLE",
    PUBLIC_TO_PRIVATE_METADATA_RESTORATION: "NOT_APPLICABLE",
  };
  return record.assertions.every((assertion) => {
    const applicability = expected[assertion.id] ?? "APPLICABLE";
    return applicability === "NOT_APPLICABLE"
      ? assertion.result === "NOT_APPLICABLE"
      : passingResult(assertion.result);
  });
}

function validHttpLocation(record, route, expectedOrigin) {
  if (!expectedOrigin || !Array.isArray(record?.redirects)) return false;
  try {
    const expected = new URL(route.path, expectedOrigin);
    const finalUrl = new URL(record.finalUrl);
    const normalizePath = (value) => value.replace(/\/$/u, "") || "/";
    if (
      finalUrl.origin !== expectedOrigin ||
      normalizePath(finalUrl.pathname) !== normalizePath(expected.pathname) ||
      finalUrl.search !== expected.search ||
      finalUrl.hash
    ) {
      return false;
    }
    return record.redirects.every((redirect) => {
      const from = new URL(redirect.from);
      const to = new URL(redirect.to);
      return from.origin === expectedOrigin &&
        to.origin === expectedOrigin &&
        Number.isInteger(redirect.status) &&
        redirect.status >= 300 && redirect.status < 400;
    });
  } catch {
    return false;
  }
}

function validEvidencePhaseTelemetry(telemetry, expectedNetworkRecordCount = null) {
  return telemetry?.result === "PASS" &&
    telemetry.count === 0 &&
    telemetry.telemetrySourceErrorCount === 0 &&
    Number.isInteger(telemetry.networkRecordCount) && telemetry.networkRecordCount >= 0 &&
    telemetry.expectedNetworkRecordCount === expectedNetworkRecordCount &&
    telemetry.networkRecordCountMismatchCount === 0 &&
    (expectedNetworkRecordCount === null ||
      telemetry.networkRecordCount === expectedNetworkRecordCount) &&
    telemetry.networkFailureCount === 0 &&
    telemetry.consoleErrorCount === 0 &&
    telemetry.childConsoleErrorCount === 0 &&
    telemetry.networkBoundaryViolationCount === 0 &&
    telemetry.networkBoundaryFulfillmentCount === 0 &&
    telemetry.pendingRequestCount === 0 &&
    telemetry.pendingBodyTelemetryCount === 0 &&
    telemetry.pendingBoundaryTargetCount === 0 &&
    telemetry.boundarySetupErrorCount === 0;
}

function validRunPhaseBoundaryTelemetry(telemetry) {
  return telemetry?.id === "EVIDENCE_PHASE_SETTLED" &&
    telemetry.result === "PASS" &&
    nonEmpty(telemetry.detail) &&
    telemetry.count === 0 &&
    telemetry.telemetrySourceErrorCount === 0 &&
    telemetry.pendingRequestCount === 0 &&
    telemetry.pendingBodyTelemetryCount === 0 &&
    telemetry.pendingBoundaryTargetCount === 0 &&
    telemetry.boundarySetupErrorCount === 0;
}

function validMetadataRestoration(expected, actual, baseUrlOrigin) {
  if (!actual ||
    actual.public !== expected.public ||
    actual.private !== expected.private ||
    actual.backTo !== expected.backTo ||
    actual.result !== "PASS" ||
    actual.pathsMatched !== true ||
    actual.publicIdentityMatched !== true ||
    actual.privateSignalsNoindex !== true ||
    actual.privateIdentityMatched !== true ||
    actual.metadataChangedDuring !== true ||
    actual.restored !== true ||
    !Array.isArray(actual.failures) ||
    actual.failures.length !== 0 ||
    !validPwaControllerSnapshot(actual.pwaControllerSnapshot, baseUrlOrigin) ||
    !validEvidencePhaseTelemetry(actual.telemetry)
  ) {
    return false;
  }
  const expectedPath = (value) => new URL(value, "https://evidence.invalid").pathname;
  const expectedPrivatePath = expected.privateExpectedPath ?? expected.private;
  const requiredPresence = (required, presence) =>
    Array.isArray(required) && required.length > 0 &&
    presence && typeof presence === "object" &&
    required.every((value) => presence[value] === true);
  if (
    actual.before?.path !== expectedPath(expected.public) ||
    actual.during?.path !== expectedPath(expectedPrivatePath) ||
    actual.after?.path !== expectedPath(expected.backTo) ||
    (expected.privateExpectedReturnTo &&
      actual.during?.searchParams?.returnTo !== expected.privateExpectedReturnTo) ||
    !/\bnoindex\b/iu.test(actual.during?.robots ?? "") ||
    !requiredPresence(expected.publicRequiredSelectors, actual.before?.selectorPresence) ||
    !requiredPresence(expected.publicRequiredText, actual.before?.requiredTextPresence) ||
    !requiredPresence(expected.privateRequiredSelectors, actual.during?.selectorPresence) ||
    !requiredPresence(expected.privateRequiredText, actual.during?.requiredTextPresence) ||
    !requiredPresence(expected.publicRequiredSelectors, actual.after?.selectorPresence) ||
    !requiredPresence(expected.publicRequiredText, actual.after?.requiredTextPresence)
  ) {
    return false;
  }
  const metadata = (entry) => ({
    title: entry?.title ?? null,
    canonical: entry?.canonical ?? null,
    robots: entry?.robots ?? null,
  });
  const before = metadata(actual.before);
  const during = metadata(actual.during);
  const after = metadata(actual.after);
  return JSON.stringify(before) === JSON.stringify(after) &&
    JSON.stringify(before) !== JSON.stringify(during);
}
const artifactsVerified = (record, artifactVerifier, pairs) =>
  pairs.every(([pathField, hashField]) =>
    nonEmpty(record?.[pathField]) &&
    (!hashField || /^[a-f0-9]{64}$/u.test(record?.[hashField] ?? "")) &&
    artifactVerifier(record[pathField], hashField ? record[hashField] : null),
  );

function validPwaControllerSnapshot(snapshot, baseUrlOrigin, expectedControllerChangeCount = 0) {
  if (!snapshot || !baseUrlOrigin) return false;
  const expectedScriptUrl = new URL("/sw.js", `${baseUrlOrigin}/`).toString();
  const expectedScope = new URL("/", `${baseUrlOrigin}/`).toString();
  return snapshot.supported === true &&
    snapshot.registrationScope === expectedScope &&
    snapshot.activeScriptUrl === expectedScriptUrl &&
    snapshot.activeState === "activated" &&
    snapshot.controllerScriptUrl === expectedScriptUrl &&
    snapshot.controllerState === "activated" &&
    snapshot.controllerMatchesActive === true &&
    snapshot.controllerChangeCounterValue === String(expectedControllerChangeCount) &&
    snapshot.controllerChangeCount === expectedControllerChangeCount;
}

function validPwaServiceWorkerWarmup(warmup, baseUrlOrigin) {
  if (!warmup || !baseUrlOrigin) return false;
  const warmupUrl = new URL("/offline.html", `${baseUrlOrigin}/`).toString();
  const expectedScriptUrl = new URL("/sw.js", `${baseUrlOrigin}/`).toString();
  const expectedScope = new URL("/", `${baseUrlOrigin}/`).toString();
  const lifecycle = warmup.lifecycle;
  const telemetry = warmup.telemetry;
  const networkRecordAudit = evaluatePwaWarmupNetworkRecords(
    warmup.networkRecords,
    baseUrlOrigin,
  );
  return warmup.result === "PASS" &&
    warmup.warmupUrl === warmupUrl &&
    warmup.expectedScriptUrl === expectedScriptUrl &&
    warmup.expectedScope === expectedScope &&
    Number.isFinite(warmup.navigationMs) && warmup.navigationMs >= 0 &&
    lifecycle?.supported === true &&
    lifecycle.pathname === "/offline.html" &&
    lifecycle.registrationScope === expectedScope &&
    lifecycle.activeScriptUrl === expectedScriptUrl &&
    ["activating", "activated"].includes(lifecycle.activeState) &&
    lifecycle.controllerScriptUrl === expectedScriptUrl &&
    ["activating", "activated"].includes(lifecycle.controllerState) &&
    lifecycle.controllerState === lifecycle.activeState &&
    lifecycle.controllerMatchesActive === true &&
    lifecycle.controllerChangeCounterValue === "1" &&
    lifecycle.controllerChangeCount === 1 &&
    telemetry?.networkRecordCount === 3 &&
    telemetry.networkRecordMultisetResult === "PASS" &&
    telemetry.networkRecordMismatchCount === 0 &&
    networkRecordAudit.result === "PASS" &&
    JSON.stringify(warmup.networkRecords) === JSON.stringify(networkRecordAudit.networkRecords) &&
    telemetry.networkFailureCount === 0 &&
    telemetry.unexpectedNetworkRecordCount === 0 &&
    telemetry.consoleErrorCount === 0 &&
    telemetry.networkBoundaryViolationCount === 0 &&
    telemetry.networkBoundaryFulfillmentCount === 0 &&
    telemetry.pendingRequestCount === 0 &&
    telemetry.pendingBodyTelemetryCount === 0 &&
    telemetry.pendingBoundaryTargetCount === 0 &&
    telemetry.boundarySetupErrorCount === 0 &&
    validPwaControllerSnapshot(warmup.postSettleSnapshot, baseUrlOrigin, 1) &&
    validPwaControllerSnapshot(warmup.preResetSnapshot, baseUrlOrigin, 1) &&
    warmup.controllerCounterResetApplied === true &&
    warmup.controllerCounterValueAfterReset === "0" &&
    validPwaControllerSnapshot(warmup.recordedRunBaselineSnapshot, baseUrlOrigin) &&
    warmup.recordedRunControllerChangeBaseline === 0;
}

function readJsonArtifact(artifactRead, path) {
  try {
    const bytes = artifactRead(path);
    if (bytes === null || bytes === undefined) return null;
    return JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes));
  } catch {
    return null;
  }
}

function validFullRunArtifact(record, routeContract, artifactRead) {
  const full = readJsonArtifact(artifactRead, record?.runFile);
  if (!full || typeof full !== "object" || Array.isArray(full)) return false;
  const summaryOnly = new Set([
    "runFile",
    "runFileSha256",
    "reducedMotionApplied",
    "forcedColorsActive",
  ]);
  for (const [key, value] of Object.entries(record)) {
    if (summaryOnly.has(key)) continue;
    if (JSON.stringify(full[key]) !== JSON.stringify(value)) return false;
  }
  return Boolean(
    full.audit && typeof full.audit === "object" &&
    record.reducedMotionApplied === Boolean(full.audit.reducedMotionApplied) &&
    record.forcedColorsActive === Boolean(full.audit.forcedColorsActive) &&
    validAssertions(full.assertions, REQUIRED_BROWSER_ASSERTIONS) &&
    validMatrixAssertionResults(full, routeContract) &&
    validRouteMetadataContract(full, routeContract) &&
    validSignalSummary(full) &&
    validFocusWalk(full) &&
    validFontSnapshot(full, routeContract) &&
    validRunNetworkBoundary(full, routeContract) &&
    assertionResult(full, "ROUTE_LOCATION") === "PASS" &&
    (full.state === "default" || assertionResult(full, "ROUTE_STATE_CONTRACT") === "PASS")
  );
}

function validRawHtmlArtifact(record, route, sitemapLocs, origin, artifactRead) {
  let html;
  try {
    const bytes = artifactRead(record?.rawHtmlPath);
    if (bytes === null || bytes === undefined) return false;
    html = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes);
  } catch {
    return false;
  }
  const metadata = extractHtmlMetadata(html);
  const assertions = evaluateHttpHead({
    route,
    status: record.status,
    headers: record.headers,
    meta: metadata,
    sitemapLocs,
    origin,
  });
  const result = assertions.some((assertion) => assertion.result === "FAIL")
    ? "AUTOMATED_FAIL"
    : "AUTOMATED_PASS";
  const metadataFingerprint = (value) => JSON.stringify({
    title: value?.title ?? null,
    description: value?.description ?? null,
    robotsMeta: value?.robotsMeta ?? null,
    robotsMetaEntries: value?.robotsMetaEntries ?? null,
    robotsMetaCount: value?.robotsMetaCount ?? null,
    canonical: value?.canonical ?? null,
    canonicalLinks: value?.canonicalLinks ?? null,
    canonicalLinkCount: value?.canonicalLinkCount ?? null,
    openGraph: value?.openGraph ?? null,
    openGraphEntries: value?.openGraphEntries ?? null,
    jsonLd: value?.jsonLd ?? null,
  });
  const assertionFingerprint = (value) => JSON.stringify(
    (value ?? []).map((assertion) => ({ id: assertion.id, result: assertion.result })),
  );
  return metadataFingerprint(metadata) === metadataFingerprint(record.metadata) &&
    assertionFingerprint(assertions) === assertionFingerprint(record.assertions) &&
    result === record.result;
}

function validScreenshotCoverage(record, artifactVerifier) {
  const coverage = record?.screenshotCoverage;
  if (!coverage || coverage.fullPage !== true || coverage.truncated !== false) return false;
  if (
    coverage.layoutStable !== true ||
    !Number.isInteger(coverage.contentWidthCssPx) || coverage.contentWidthCssPx < 1 ||
    !Number.isInteger(coverage.contentHeightCssPx) || coverage.contentHeightCssPx < 1 ||
    coverage.postContentWidthCssPx !== coverage.contentWidthCssPx ||
    coverage.postContentHeightCssPx !== coverage.contentHeightCssPx ||
    coverage.contentHeightCssPx < record.heightCssPx ||
    coverage.maxHeightCssPx !== MAX_FULL_PAGE_HEIGHT_CSS_PX ||
    coverage.contentHeightCssPx > coverage.maxHeightCssPx ||
    !Number.isFinite(coverage.devicePixelRatio) || coverage.devicePixelRatio <= 0 ||
    coverage.devicePixelRatio !== record.deviceScaleFactor ||
    coverage.capturedWidthPx !== Math.round(coverage.contentWidthCssPx * coverage.devicePixelRatio) ||
    coverage.capturedHeightPx !== Math.round(coverage.contentHeightCssPx * coverage.devicePixelRatio)
  ) {
    return false;
  }
  return artifactVerifier(record.artifactPath, record.artifactSha256, {
    pngDimensions: {
      width: coverage.capturedWidthPx,
      height: coverage.capturedHeightPx,
    },
  });
}

function isValidMatrixRecord(
  record,
  expectedSha,
  artifactExists,
  baseUrlOrigin,
  routeContract = null,
  artifactRead = () => null,
) {
  return Boolean(
    record &&
      record.candidateSha === expectedSha &&
      nonEmpty(record.route) &&
      nonEmpty(record.surface) &&
      nonEmpty(record.state) &&
      nonEmpty(record.browserName) &&
      nonEmpty(record.browserVersion) &&
      Number.isInteger(record.widthCssPx) &&
      record.widthCssPx > 0 &&
      Number.isInteger(record.heightCssPx) &&
      record.heightCssPx > 0 &&
      Number.isFinite(record.deviceScaleFactor) &&
      record.deviceScaleFactor > 0 &&
      Number.isInteger(record.zoomPercent) &&
      record.zoomPercent >= 100 &&
      nonEmpty(record.colorScheme) &&
      nonEmpty(record.mediaVariant) &&
      nonEmpty(record.syntheticFixtureId) &&
      nonEmpty(record.coverageScope) &&
      validTimestamp(record.timestampUtc) &&
      nonEmpty(record.reviewer) &&
      nonEmpty(record.consoleResult) &&
      nonEmpty(record.networkResult) &&
      nonEmpty(record.piiPhiReview) &&
      ["AUTOMATED_PASS", "AUTOMATED_PASS_WITH_NOTES", "AUTOMATED_FAIL"].includes(
        record.verdict,
      ) &&
      validAssertions(record.assertions, REQUIRED_BROWSER_ASSERTIONS) &&
      validMatrixAssertionResults(record, routeContract) &&
      validRouteMetadataContract(record, routeContract) &&
      validSignalSummary(record) &&
      validPwaControllerSnapshot(record.pwaControllerSnapshot, baseUrlOrigin) &&
      validRunPhaseBoundaryTelemetry(record.phaseTelemetry) &&
      validScreenshotCoverage(record, artifactExists) &&
      validFocusWalk(record) &&
      validFontSnapshot(record, routeContract) &&
      validRunNetworkBoundary(record, routeContract) &&
      /^[a-f0-9]{64}$/u.test(record.runFileSha256 ?? "") &&
      validFullRunArtifact(record, routeContract, artifactRead) &&
      assertionResult(record, "ROUTE_LOCATION") === "PASS" &&
      (record.state === "default" || assertionResult(record, "ROUTE_STATE_CONTRACT") === "PASS") &&
      artifactsVerified(record, artifactExists, [
        ["artifactPath", "artifactSha256"],
        ["textArtifactPath", "textArtifactSha256"],
        ["runFile", "runFileSha256"],
      ]),
  );
}

function isPassingMatrixRecord(
  record,
  expectedSha,
  artifactExists,
  baseUrlOrigin,
  routeContract = null,
  artifactRead = () => null,
) {
  return (
    isValidMatrixRecord(
      record,
      expectedSha,
      artifactExists,
      baseUrlOrigin,
      routeContract,
      artifactRead,
    ) &&
    PASS_VERDICTS.has(record.verdict) &&
    blockingAssertionFailures(record).length === 0
  );
}

function isValidSupplementalCapture(
  record,
  expectedSha,
  artifactExists,
  harnessOrigins,
) {
  let localUrl = false;
  let actualOrigin = null;
  try {
    const url = new URL(record?.actualUrl);
    localUrl = url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      Boolean(url.port) && !url.username && !url.password;
    actualOrigin = url.origin;
  } catch {}
  const harnessOriginKey =
    SUPPLEMENTAL_SERVER_HARNESS_TO_ORIGIN_KEY[record?.serverHarness] ?? null;
  const expectedHarnessOrigin = harnessOriginKey ? harnessOrigins?.[harnessOriginKey] : null;
  return Boolean(
    record &&
      record.candidateSha === expectedSha &&
      nonEmpty(record.surface) &&
      nonEmpty(record.state) &&
      record.evidenceClass === "synthetic-production-shape" &&
      record.coverageScope === "representative" &&
      nonEmpty(record.syntheticFixtureId) &&
      nonEmpty(record.serverHarness) &&
      nonEmpty(record.logicalRoute) &&
      localUrl &&
      expectedHarnessOrigin &&
      actualOrigin === expectedHarnessOrigin &&
      nonEmpty(record.browserName) &&
      nonEmpty(record.browserVersion) &&
      Number.isInteger(record.widthCssPx) &&
      record.widthCssPx > 0 &&
      Number.isInteger(record.heightCssPx) &&
      record.heightCssPx > 0 &&
      Number.isFinite(record.deviceScaleFactor) &&
      record.deviceScaleFactor > 0 &&
      Number.isInteger(record.zoomPercent) &&
      record.zoomPercent === 100 &&
      validTimestamp(record.timestampUtc) &&
      nonEmpty(record.consoleResult) &&
      nonEmpty(record.networkResult) &&
      record.claimScope === "UI_PRESENTATION_ONLY" &&
      record.externalMutations === 0 &&
      record.piiPhiReview === "MANUAL_PENDING" &&
      Number.isInteger(record.artifactBytes) &&
      record.artifactBytes > 0 &&
      Number.isInteger(record.textArtifactBytes) &&
      record.textArtifactBytes > 0 &&
      PASS_VERDICTS.has(record.verdict) &&
      validAssertions(record.assertions, REQUIRED_SYNTHETIC_ASSERTIONS) &&
      assertionResult(record, "ROUTE_LOCATION") === "PASS" &&
      assertionResult(record, "ROUTE_STATE_CONTRACT") === "PASS" &&
      assertionResult(record, "EXPECTED_HTTP_FAILURES_OBSERVED") === "PASS" &&
      assertionResult(record, "EXPECTED_SYNTHETIC_VIEW") === "PASS" &&
      assertionResult(record, "LOCAL_ORIGIN_NETWORK_BOUNDARY") === "PASS" &&
      assertionResult(record, "EXTERNAL_MUTATIONS") === "PASS" &&
      validCompletedFocusWalk(record) &&
      validStatusTruthEvidence(record) &&
      validPartnerAbsenceEvidence(record, harnessOrigins) &&
      validSupplementalSignalSummary(record) &&
      validSupplementalAssertionResults(record) &&
      validScreenshotCoverage(record, artifactExists) &&
      artifactsVerified(record, artifactExists, [
        ["artifactPath", "artifactSha256"],
        ["textArtifactPath", "textArtifactSha256"],
      ]),
  );
}

const evidenceKey = (record) =>
  `${record.route}|${record.widthCssPx}|${record.zoomPercent}|${record.mediaVariant}`;
const supplementalEvidenceKey = (record) =>
  `${record.surface}|${record.state}|${record.widthCssPx}`;

function inspectMatrix({ template, matrix, inventory, routesInventory, sha, sourceTree, packageLockSha256, artifactExists, artifactRead }) {
  if (!matrix) return { result: "NOT_RUN", missingRunKeys: [], invalidRuns: [], failedRuns: [] };
  if (!inventory?.routes?.length) {
    return { result: "INVENTORY_MISSING", missingRunKeys: [], invalidRuns: [], failedRuns: [] };
  }
  const provenance = inspectPreviewProvenance({
    provenance: matrix.provenance,
    sha,
    sourceTree,
    packageLockSha256,
  });
  const baseUrlOrigin = loopbackOrigin(matrix.baseUrl);
  const runs = Array.isArray(matrix.runs) ? matrix.runs : [];
  const routeByPath = new Map(inventory.routes.map((route) => [route.path, route]));
  const requiredWidths = template.browserMatrix?.requiredWidthsCssPx ?? [];
  const mediaWidth = requiredWidths.includes(390) ? 390 : null;
  const expectedKeys = [];
  for (const route of inventory.routes) {
    for (const width of requiredWidths) {
      expectedKeys.push(`${route.path}|${width}|100|default`);
    }
    for (const zoom of inventory.zoomEquivalents ?? []) {
      expectedKeys.push(`${route.path}|${zoom.widthCssPx}|${zoom.zoomPercent}|default`);
    }
    if (mediaWidth !== null) {
      expectedKeys.push(`${route.path}|${mediaWidth}|100|reduced-motion`);
      expectedKeys.push(`${route.path}|${mediaWidth}|100|forced-colors`);
    }
  }
  const counts = new Map();
  for (const run of runs) counts.set(evidenceKey(run), (counts.get(evidenceKey(run)) ?? 0) + 1);
  const expectedSet = new Set(expectedKeys);
  const missingRunKeys = expectedKeys.filter((key) => !counts.has(key));
  const duplicateRunKeys = [...counts].filter(([, count]) => count !== 1).map(([key]) => key);
  const unexpectedRunKeys = [...counts.keys()].filter((key) => !expectedSet.has(key));
  const invalidRuns = runs
    .map((run, index) => ({ run, index }))
    .filter(({ run }) =>
      !isValidMatrixRecord(
        run,
        sha,
        artifactExists,
        baseUrlOrigin,
        routeByPath.get(run.route),
        artifactRead,
      ) || !timestampWithin(run.timestampUtc, matrix.startedAtUtc, matrix.finishedAtUtc),
    )
    .map(({ index }) => index);
  const artifactPathCounts = new Map();
  for (const artifactPath of runs.flatMap(
    (run) => [run.artifactPath, run.textArtifactPath, run.runFile],
  )) {
    artifactPathCounts.set(artifactPath, (artifactPathCounts.get(artifactPath) ?? 0) + 1);
  }
  const duplicateArtifactPaths = [...artifactPathCounts]
    .filter(([artifactPath, count]) => !nonEmpty(artifactPath) || count !== 1)
    .map(([artifactPath]) => artifactPath ?? null);
  const failedRuns = runs
    .filter((run) => run.verdict === "AUTOMATED_FAIL" || blockingAssertionFailures(run).length > 0)
    .map((run) => evidenceKey(run));
  const routeMetadataMismatches = runs
    .filter((run) => {
      const route = routeByPath.get(run.route);
      return !route || route.surface !== run.surface || route.state !== run.state ||
        (route.coverageScope ?? "representative") !== (run.coverageScope ?? "representative");
    })
    .map((run) => evidenceKey(run));
  const actualWidths = [...new Set(matrix.widthsCssPx ?? [])].sort((a, b) => b - a);
  const expectedWidths = [...new Set(requiredWidths)].sort((a, b) => b - a);
  const widthsMatch = JSON.stringify(actualWidths) === JSON.stringify(expectedWidths);
  const zoomsMatch = JSON.stringify(matrix.zoomEquivalents ?? []) ===
    JSON.stringify(inventory.zoomEquivalents ?? []);
  const missingFocusRuns = [];
  for (const route of inventory.routes) {
    for (const width of [requiredWidths[0], 390].filter((value, index, all) =>
      Number.isInteger(value) && all.indexOf(value) === index,
    )) {
      const run = runs.find((candidate) =>
        candidate.route === route.path && candidate.widthCssPx === width &&
        candidate.zoomPercent === 100 && candidate.mediaVariant === "default",
      );
      const focus = run?.assertions?.filter((assertion) =>
        ["FOCUS_ORDER_REACHABLE", "FOCUS_VISIBLE_PRESENT"].includes(assertion.id),
      ) ?? [];
      if (focus.length !== 2 || focus.some((assertion) => assertion.result !== "PASS")) {
        missingFocusRuns.push(`${route.path}@${width}`);
      }
    }
  }
  const invalidMediaRuns = runs
    .filter((run) =>
      (run.mediaVariant === "reduced-motion" && run.reducedMotionApplied !== true) ||
      (run.mediaVariant === "forced-colors" && run.forcedColorsActive !== true),
    )
    .map((run) => evidenceKey(run));
  const expectedRestoration = inventory.metadataRestoration ?? [];
  const restoration = matrix.metadataRestoration ?? [];
  const restorationKey = (entry) => `${entry.public}->${entry.private}->${entry.backTo}`;
  const restorationCounts = new Map();
  for (const entry of restoration) {
    const key = restorationKey(entry);
    restorationCounts.set(key, (restorationCounts.get(key) ?? 0) + 1);
  }
  const expectedRestorationKeys = new Set(expectedRestoration.map(restorationKey));
  const missingRestoration = expectedRestoration
    .filter((expected) => !restoration.some((actual) =>
      validMetadataRestoration(expected, actual, baseUrlOrigin),
    ))
    .map((entry) => `${entry.public}->${entry.private}->${entry.backTo}`);
  const invalidRestoration = restoration
    .filter((actual) => {
      const expected = expectedRestoration.find((candidate) =>
        restorationKey(candidate) === restorationKey(actual),
      );
      return expected && !validMetadataRestoration(expected, actual, baseUrlOrigin);
    })
    .map(restorationKey);
  const duplicateRestoration = [...restorationCounts]
    .filter(([, count]) => count !== 1)
    .map(([key]) => key);
  const unexpectedRestoration = [...restorationCounts.keys()]
    .filter((key) => !expectedRestorationKeys.has(key));
  const shaMismatch = matrix.candidateSha !== sha;
  const envelopeInvalid =
    matrix.schemaVersion !== 3 ||
    matrix.kind !== "browser-matrix" ||
    !routesInventory ||
    JSON.stringify(matrix.routesInventory ?? null) !== JSON.stringify(routesInventory) ||
    !orderedTimestamps(matrix.startedAtUtc, matrix.finishedAtUtc) ||
    !captureAfterBuild(matrix.startedAtUtc, matrix.provenance) ||
    !externalMicrositeInventoryIsScoped(inventory.routes) ||
    !nonEmpty(matrix.tool?.browserName) ||
    !nonEmpty(matrix.tool?.browserVersion) ||
    !validCaptureRuntime(matrix.tool) ||
    !validPwaServiceWorkerWarmup(matrix.pwaServiceWorkerWarmup, baseUrlOrigin) ||
    !validPwaControllerSnapshot(matrix.finalPwaControllerSnapshot, baseUrlOrigin) ||
    !validEvidencePhaseTelemetry(matrix.finalizationTelemetry, 0) ||
    !validExternalResourceContract(matrix.externalResourceContract);
  const incomplete =
    missingRunKeys.length || duplicateRunKeys.length || unexpectedRunKeys.length ||
    routeMetadataMismatches.length || !widthsMatch || !zoomsMatch ||
    missingFocusRuns.length || invalidMediaRuns.length || missingRestoration.length ||
    invalidRestoration.length || duplicateRestoration.length || unexpectedRestoration.length;
  const result = shaMismatch
    ? "SHA_MISMATCH"
    : provenance.result !== "AUTOMATED_PASS" || !baseUrlOrigin
      ? "PROVENANCE_INVALID"
      : envelopeInvalid || invalidRuns.length || duplicateArtifactPaths.length
      ? "INVALID_EVIDENCE"
      : failedRuns.length
        ? "AUTOMATED_FAIL"
        : incomplete
          ? "COVERAGE_INCOMPLETE"
          : "AUTOMATED_PASS";
  return {
    result,
    provenance,
    baseUrlOrigin,
    envelopeInvalid,
    expectedRuns: expectedKeys.length,
    actualRuns: runs.length,
    missingRunKeys,
    duplicateRunKeys,
    unexpectedRunKeys,
    invalidRuns,
    duplicateArtifactPaths,
    failedRuns,
    routeMetadataMismatches,
    widthsMatch,
    zoomsMatch,
    missingFocusRuns,
    invalidMediaRuns,
    missingRestoration,
    invalidRestoration,
    duplicateRestoration,
    unexpectedRestoration,
  };
}

function validRawAssetEvidence(actual, expected, artifactExists, { sitemap = false, robots = false } = {}) {
  if (
    !actual || !expected ||
    actual.status !== 200 ||
    actual.error != null ||
    actual.bodyPath !== expected.bodyPath ||
    actual.bodySha256 !== expected.sha256 ||
    actual.bodyBytes !== expected.bytes ||
    actual.sourcePath !== expected.sourcePath ||
    actual.sourceSha256 !== expected.sha256 ||
    actual.exactSourceMatch !== true ||
    !artifactExists(actual.bodyPath, actual.bodySha256)
  ) return false;
  if (robots) {
    return expected.directivesValidation?.result === "PASS" &&
      JSON.stringify(actual.directivesValidation) ===
        JSON.stringify(expected.directivesValidation);
  }
  if (!sitemap) return true;
  const validation = evaluateSitemapLocs(actual.locs);
  return actual.count === expected.locs.length &&
    JSON.stringify(actual.locs) === JSON.stringify(expected.locs) &&
    validation.result === "PASS" &&
    JSON.stringify(actual.locsValidation) === JSON.stringify(validation);
}

function inspectHttp({ http, inventory, sha, sourceTree, packageLockSha256, rawAssetContract, artifactExists, artifactRead }) {
  if (!http) return { result: "NOT_RUN", missingRoutes: [], invalidRecords: [] };
  if (!inventory?.routes?.length) return { result: "INVENTORY_MISSING", missingRoutes: [], invalidRecords: [] };
  const provenance = inspectPreviewProvenance({
    provenance: http.provenance,
    sha,
    sourceTree,
    packageLockSha256,
  });
  const baseUrlOrigin = loopbackOrigin(http.baseUrl);
  const records = Array.isArray(http.records) ? http.records : [];
  const expected = inventory.routes.map((route) => route.path);
  const counts = new Map();
  for (const record of records) counts.set(record.route, (counts.get(record.route) ?? 0) + 1);
  const missingRoutes = expected.filter((route) => !counts.has(route));
  const duplicateRoutes = [...counts].filter(([, count]) => count !== 1).map(([route]) => route);
  const unexpectedRoutes = [...counts.keys()].filter((route) => !expected.includes(route));
  const routeByPath = new Map(inventory.routes.map((route) => [route.path, route]));
  const invalidRecords = records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => {
      const route = routeByPath.get(record.route);
      const expectedStatus = route?.expectStatus ??
        (route?.surface === "not-found-error" ? 404 : 200);
      return !record || record.candidateSha !== sha || !route ||
        record.surface !== route.surface || record.indexable !== route.indexable ||
        record.status !== expectedStatus || !validTimestamp(record.timestampUtc) ||
        !timestampWithin(record.timestampUtc, http.provenance?.builtAtUtc, http.capturedAtUtc) ||
        !validAssertions(record.assertions, REQUIRED_HTTP_ASSERTIONS) ||
        !validHttpAssertionResults(record, route, rawAssetContract?.sitemap?.locs) ||
        !validRawHtmlArtifact(
          record,
          route,
          rawAssetContract?.sitemap?.locs,
          baseUrlOrigin,
          artifactRead,
        ) ||
        !validHttpLocation(record, route, baseUrlOrigin) ||
        record.result !== "AUTOMATED_PASS" ||
        !artifactsVerified(record, artifactExists, [["rawHtmlPath", "rawHtmlSha256"]]);
    })
    .map(({ index }) => index);
  const rawHtmlPathCounts = new Map();
  for (const record of records) {
    rawHtmlPathCounts.set(
      record.rawHtmlPath,
      (rawHtmlPathCounts.get(record.rawHtmlPath) ?? 0) + 1,
    );
  }
  const duplicateRawHtmlPaths = [...rawHtmlPathCounts]
    .filter(([rawHtmlPath, count]) => !nonEmpty(rawHtmlPath) || count !== 1)
    .map(([rawHtmlPath]) => rawHtmlPath ?? null);
  const shaMismatch = http.candidateSha !== sha;
  const infrastructureInvalid =
    !validRawAssetEvidence(http.sitemap, rawAssetContract?.sitemap, artifactExists, { sitemap: true }) ||
    !validRawAssetEvidence(
      http.robots,
      rawAssetContract?.robots,
      artifactExists,
      { robots: true },
    );
  const envelopeInvalid = http.schemaVersion !== 2 ||
    http.kind !== "http-evidence" ||
    !validCaptureRuntime(http.tool) ||
    !externalMicrositeInventoryIsScoped(inventory.routes) ||
    !captureAfterBuild(http.capturedAtUtc, http.provenance);
  const result = shaMismatch
    ? "SHA_MISMATCH"
    : provenance.result !== "AUTOMATED_PASS" || !baseUrlOrigin
      ? "PROVENANCE_INVALID"
      : envelopeInvalid || invalidRecords.length || duplicateRawHtmlPaths.length || infrastructureInvalid
      ? "INVALID_EVIDENCE"
      : missingRoutes.length || duplicateRoutes.length || unexpectedRoutes.length
        ? "COVERAGE_INCOMPLETE"
        : "AUTOMATED_PASS";
  return {
    result,
    provenance,
    baseUrlOrigin,
    envelopeInvalid,
    expectedRecords: expected.length,
    actualRecords: records.length,
    missingRoutes,
    duplicateRoutes,
    unexpectedRoutes,
    invalidRecords,
    duplicateRawHtmlPaths,
    sitemapStatus: http.sitemap?.status ?? null,
    robotsStatus: http.robots?.status ?? null,
  };
}

/** Pure merge; exported for tests. */
export function buildManifest({ template, matrix, supplemental, http, pii, inventory, routesInventory, rawAssetContract, actualEvidenceFiles = [], sha, sourceTree, packageLockSha256, reviewer, artifactRoot, artifactExists = () => false, artifactRead = () => null, generatedAtUtc = new Date().toISOString() }) {
  if (!EXACT_SHA.test(sha ?? "")) {
    throw new Error("manifest generation requires an exact 40-character candidate SHA");
  }
  if (!EXACT_SHA.test(sourceTree ?? "")) {
    throw new Error("manifest generation requires the candidate's exact 40-character source tree");
  }
  if (!/^[a-f0-9]{64}$/u.test(packageLockSha256 ?? "")) {
    throw new Error("manifest generation requires the clean candidate package-lock SHA-256");
  }
  if (template.candidate?.sha && template.candidate.sha !== sha) {
    throw new Error(`template candidate SHA ${template.candidate.sha} does not match ${sha}`);
  }
  const m = JSON.parse(JSON.stringify(template));
  m.schemaVersion = 2;
  m.status = "PENDING";
  m.candidate = {
    ...(m.candidate ?? {}),
    sha,
    sourceTree: null,
    distInventorySha256: null,
    distFileCount: null,
    nodeVersion: null,
    npmVersion: null,
    packageLockSha256: null,
    installMethod: null,
    frozenAt: null,
    originVerified: "PENDING",
  };
  for (const lane of Object.values(m.lanes ?? {})) {
    lane.finalLaneSha = null;
    lane.finalVerdict = "PENDING";
  }
  if (m.gates?.adversarialReview) {
    m.gates.adversarialReview = {
      ...m.gates.adversarialReview,
      result: "PENDING",
      reviewedSha: null,
      artifact: null,
      p0: null,
      p1: null,
      p2: null,
    };
  }
  m.generated = { atUtc: generatedAtUtc, by: "scripts/evidence/generate-evidence-manifest.mjs", reviewer: reviewer ?? "automated", note: "Automated evidence merge. finalVerdict, lane verdicts and readiness are never set by this tool." };
  m.captures = [];
  m.browserMatrix = {
    ...(m.browserMatrix ?? {}),
    result: "NOT_RUN",
    browserVersions: [],
    runs: [],
  };
  m.httpHeadEvidence = {
    ...(m.httpHeadEvidence ?? {}),
    result: "NOT_RUN",
    records: [],
  };
  m.syntheticJourneyEvidence = { result: "NOT_RUN", captures: [] };
  m.accessibilityEvidence = Object.fromEntries(
    Object.keys(m.accessibilityEvidence ?? {}).map((key) => [key, "PENDING"]),
  );
  m.gates = m.gates ?? {};
  m.gates.browserMatrixCompleteness = { result: "NOT_RUN" };
  m.gates.httpEvidenceCompleteness = { result: "NOT_RUN" };
  m.gates.responsive = { result: "NOT_RUN", failingRuns: [], artifact: null };
  m.gates.accessibility = {
    result: "NOT_RUN",
    failingAssertionIds: [],
    artifact: null,
    note: "Automated output alone is not an accessibility pass; manualReview remains PENDING.",
  };
  m.gates.seo = {
    ...(m.gates.seo ?? {}),
    result: "NOT_RUN",
    actualPublicRouteComposition: "NOT_RUN",
    serverXRobotsTag: "PENDING",
    documentRobotsMeta: "PENDING",
    rawHtmlTitleCanonicalOpenGraph: "PENDING",
    sitemapParity: "PENDING",
    routeScopedStructuredData: "PENDING",
    authoritative404: "PENDING",
    publicToPrivateMetadataRestoration: "PENDING",
    artifact: null,
  };
  m.gates.evidencePiiScan = {
    result: "NOT_RUN",
    findings: null,
    artifact: null,
  };
  const matrixInspection = inspectMatrix({
    template: m,
    matrix,
    inventory,
    routesInventory,
    sha,
    sourceTree,
    packageLockSha256,
    artifactExists,
    artifactRead,
  });
  const httpInspection = inspectHttp({
    http,
    inventory,
    sha,
    sourceTree,
    packageLockSha256,
    rawAssetContract,
    artifactExists,
    artifactRead,
  });
  const matrixHttpProvenance = (() => {
    if (!matrix || !http) {
      return {
        result: "NOT_RUN",
        provenanceMatches: false,
        baseUrlOriginMatches: false,
        matrixBaseUrlOrigin: matrixInspection.baseUrlOrigin ?? null,
        httpBaseUrlOrigin: httpInspection.baseUrlOrigin ?? null,
      };
    }
    const individuallyValid =
      matrixInspection.provenance?.result === "AUTOMATED_PASS" &&
      httpInspection.provenance?.result === "AUTOMATED_PASS" &&
      Boolean(matrixInspection.baseUrlOrigin) &&
      Boolean(httpInspection.baseUrlOrigin);
    const provenanceMatches = individuallyValid &&
      provenanceFingerprint(matrix.provenance) === provenanceFingerprint(http.provenance);
    const baseUrlOriginMatches = individuallyValid &&
      matrixInspection.baseUrlOrigin === httpInspection.baseUrlOrigin;
    return {
      result: !individuallyValid
        ? "INVALID_EVIDENCE"
        : provenanceMatches && baseUrlOriginMatches
          ? "AUTOMATED_PASS"
          : "PROVENANCE_MISMATCH",
      provenanceMatches,
      baseUrlOriginMatches,
      matrixBaseUrlOrigin: matrixInspection.baseUrlOrigin ?? null,
      httpBaseUrlOrigin: httpInspection.baseUrlOrigin ?? null,
      candidateSha: sha,
      sourceTree,
      distInventorySha256: provenanceMatches
        ? matrix.provenance.distInventorySha256
        : null,
    };
  })();
  if (matrixHttpProvenance.result === "AUTOMATED_PASS") {
    m.candidate.nodeVersion = matrix.provenance.nodeVersion.replace(/^v/u, "");
    m.candidate.npmVersion = matrix.provenance.npmVersion;
    m.candidate.sourceTree = matrix.provenance.sourceTree;
    m.candidate.distInventorySha256 = matrix.provenance.distInventorySha256;
    m.candidate.distFileCount = matrix.provenance.distFileCount;
    m.candidate.packageLockSha256 = matrix.provenance.packageLockSha256;
    m.candidate.installMethod = matrix.provenance.installMethod;
    m.candidate.runtimeEvidence = "MATCHED_MATRIX_HTTP_BUILD_PROVENANCE";
  } else {
    m.candidate.runtimeEvidence = "PENDING_MATCHED_MATRIX_HTTP_BUILD_PROVENANCE";
  }

  if (matrix) {
    const shaMismatch = matrix.candidateSha !== sha;
    const derivedSummary = {
      runs: matrix.runs?.length ?? 0,
      automatedPass: (matrix.runs ?? []).filter((run) => run.verdict === "AUTOMATED_PASS").length,
      automatedPassWithNotes: (matrix.runs ?? []).filter((run) => run.verdict === "AUTOMATED_PASS_WITH_NOTES").length,
      automatedFail: (matrix.runs ?? []).filter((run) =>
        run.verdict === "AUTOMATED_FAIL" || blockingAssertionFailures(run).length > 0,
      ).length,
      failingAssertionIds: [...new Set((matrix.runs ?? []).flatMap((run) =>
        (run.assertions ?? []).filter((assertion) => assertion.result === "FAIL").map((assertion) => assertion.id),
      ))],
      sourceSummaryMatches: JSON.stringify(matrix.summary ?? null) === JSON.stringify({
        runs: matrix.runs?.length ?? 0,
        automatedPass: (matrix.runs ?? []).filter((run) => run.verdict === "AUTOMATED_PASS").length,
        automatedPassWithNotes: (matrix.runs ?? []).filter((run) => run.verdict === "AUTOMATED_PASS_WITH_NOTES").length,
        automatedFail: (matrix.runs ?? []).filter((run) => run.verdict === "AUTOMATED_FAIL").length,
        failingAssertionIds: [...new Set((matrix.runs ?? []).flatMap((run) =>
          (run.assertions ?? []).filter((assertion) => assertion.result === "FAIL").map((assertion) => assertion.id),
        ))],
      }),
    };
    const runs = (matrix.runs ?? []).map((r) => ({
      candidateSha: r.candidateSha,
      artifactPath: r.artifactPath,
      artifactSha256: r.artifactSha256,
      textArtifactPath: r.textArtifactPath,
      textArtifactSha256: r.textArtifactSha256,
      route: r.route,
      surface: r.surface,
      state: r.state,
      browserName: r.browserName,
      browserVersion: r.browserVersion,
      widthCssPx: r.widthCssPx,
      heightCssPx: r.heightCssPx,
      deviceScaleFactor: r.deviceScaleFactor,
      zoomPercent: r.zoomPercent,
      colorScheme: r.colorScheme,
      mediaVariant: r.mediaVariant,
      reducedMotionApplied: r.reducedMotionApplied,
      forcedColorsActive: r.forcedColorsActive,
      syntheticFixtureId: r.syntheticFixtureId,
      coverageScope: r.coverageScope ?? "representative",
      assertions: r.assertions,
      timestampUtc: r.timestampUtc,
      reviewer: reviewer ?? r.reviewer,
      consoleResult: r.consoleResult,
      networkResult: r.networkResult,
      networkBoundaryViolations: r.networkBoundaryViolations,
      networkBoundaryFulfillments: r.networkBoundaryFulfillments,
      screenshotCoverage: r.screenshotCoverage,
      focusWalk: r.focusWalk,
      fontSnapshot: r.fontSnapshot,
      pwaControllerSnapshot: r.pwaControllerSnapshot,
      phaseTelemetry: r.phaseTelemetry,
      piiPhiReview: r.piiPhiReview,
      verdict: r.verdict,
      runFile: r.runFile,
    }));
    m.browserMatrix = {
      ...(m.browserMatrix ?? {}),
      result: matrixInspection.result,
      candidateSha: matrix.candidateSha,
      candidateShaMatchesManifest: !shaMismatch,
      tool: matrix.tool,
      baseUrl: matrix.baseUrl,
      provenance: matrix.provenance,
      provenanceInspection: matrixInspection.provenance,
      pwaServiceWorkerWarmup: matrix.pwaServiceWorkerWarmup,
      finalPwaControllerSnapshot: matrix.finalPwaControllerSnapshot,
      finalizationTelemetry: matrix.finalizationTelemetry,
      externalResourceContract: matrix.externalResourceContract,
      routesInventory: matrix.routesInventory,
      widthsCoveredCssPx: [...new Set((matrix.runs ?? []).map((r) => r.widthCssPx).filter((w) => (matrix.runs ?? []).some((r) => r.widthCssPx === w && r.zoomPercent === 100)))].sort((a, b) => b - a),
      twoHundredPercentZoomEquivalent: matrix.zoomEquivalents?.[0] ?? null,
      browserVersions: matrix.tool?.browserName && matrix.tool?.browserVersion
        ? [`${matrix.tool.browserName} ${matrix.tool.browserVersion}`]
        : [],
      metadataRestoration: matrix.metadataRestoration ?? [],
      summary: derivedSummary,
      completeness: matrixInspection,
      runs,
    };
    m.captures = (matrix.runs ?? [])
      .filter((r) => r.artifactPath)
      .map((r) => ({
        candidateSha: r.candidateSha,
        artifactPath: `${artifactRoot.replace(/\/$/, "")}/${r.artifactPath.replace(/^captures\//, "")}`,
        localPath: r.artifactPath,
        artifactSha256: r.artifactSha256,
        textArtifactPath: r.textArtifactPath,
        textArtifactSha256: r.textArtifactSha256,
        route: r.route,
        surface: r.surface,
        state: r.state,
        browserName: r.browserName,
        browserVersion: r.browserVersion,
        widthCssPx: r.widthCssPx,
        heightCssPx: r.heightCssPx,
        deviceScaleFactor: r.deviceScaleFactor,
        zoomPercent: r.zoomPercent,
        colorScheme: r.colorScheme,
        mediaVariant: r.mediaVariant,
        screenshotCoverage: r.screenshotCoverage,
        syntheticFixtureId: r.syntheticFixtureId,
        coverageScope: r.coverageScope ?? "representative",
        assertions: r.assertions.map((a) => `${a.id}=${a.result}`),
        timestampUtc: r.timestampUtc,
        reviewer: reviewer ?? r.reviewer,
        consoleResult: r.consoleResult,
        networkResult: r.networkResult,
        phaseTelemetry: r.phaseTelemetry,
        piiPhiReview: r.piiPhiReview,
      }));
    m.accessibilityEvidence = { ...(m.accessibilityEvidence ?? {}), ...aggregateAccessibility(matrix.runs ?? []) };
    const overflowFails = (matrix.runs ?? []).filter((r) => (r.assertions ?? []).some((a) => a.id === "NO_HORIZONTAL_OVERFLOW" && a.result === "FAIL"));
    m.gates = m.gates ?? {};
    m.gates.browserMatrixCompleteness = matrixInspection;
    m.gates.responsive = { result: overflowFails.length ? "AUTOMATED_FAIL" : matrixInspection.result === "AUTOMATED_PASS" ? "AUTOMATED_PASS" : matrixInspection.result, failingRuns: overflowFails.map((r) => `${r.route}@${r.widthCssPx}/${r.zoomPercent}%`), artifact: "browser-matrix.json" };
    m.gates.accessibility = { result: matrixInspection.result === "AUTOMATED_PASS" ? "AUTOMATED_PASS_MANUAL_REVIEW_PENDING" : matrixInspection.result, failingAssertionIds: derivedSummary.failingAssertionIds, artifact: "browser-matrix.json", note: "Automated output alone is not an accessibility pass; manualReview remains PENDING." };
  }

  const supplementalHarnessOrigins = normalizeSupplementalHarnessOrigins(
    supplemental?.harnessOrigins,
  );
  let supplementalInspectionResult = supplemental ? "INVALID_EVIDENCE" : "NOT_RUN";
  if (supplemental) {
    const supplementalShaMismatch = supplemental.candidateSha !== sha;
    const supplementalProvenance = inspectPreviewProvenance({
      provenance: supplemental.provenance,
      sha,
      sourceTree,
      packageLockSha256,
    });
    const supplementalCaptures = Array.isArray(supplemental.captures) ? supplemental.captures : [];
    const supplementalCaptureValid = (capture) =>
      isValidSupplementalCapture(
        capture,
        sha,
        artifactExists,
        supplementalHarnessOrigins,
      ) &&
      timestampWithin(
        capture.timestampUtc,
        supplemental.startedAtUtc,
        supplemental.generatedAtUtc,
      );
    const invalidCaptureIndices = supplementalCaptures
      .map((capture, index) => ({ capture, index }))
      .filter(({ capture }) => !supplementalCaptureValid(capture))
      .map(({ index }) => index);
    const expectedCaptureKeys = (m.requiredRepresentativeJourneys ?? []).flatMap(
      (requirement) => requirement.widthsCssPx.map(
        (width) => `${requirement.surface}|${requirement.state}|${width}`,
      ),
    );
    const captureKeyCounts = new Map();
    for (const capture of supplementalCaptures) {
      const key = supplementalEvidenceKey(capture);
      captureKeyCounts.set(key, (captureKeyCounts.get(key) ?? 0) + 1);
    }
    const expectedCaptureSet = new Set(expectedCaptureKeys);
    const missingCaptureKeys = expectedCaptureKeys.filter((key) => !captureKeyCounts.has(key));
    const duplicateCaptureKeys = [...captureKeyCounts]
      .filter(([, count]) => count !== 1)
      .map(([key]) => key);
    const unexpectedCaptureKeys = [...captureKeyCounts.keys()]
      .filter((key) => !expectedCaptureSet.has(key));
    const artifactPathCounts = new Map();
    for (const artifactPath of supplementalCaptures.flatMap(
      (capture) => [capture.artifactPath, capture.textArtifactPath],
    )) {
      artifactPathCounts.set(artifactPath, (artifactPathCounts.get(artifactPath) ?? 0) + 1);
    }
    const duplicateArtifactPaths = [...artifactPathCounts]
      .filter(([artifactPath, count]) => !nonEmpty(artifactPath) || count !== 1)
      .map(([artifactPath]) => artifactPath ?? null);
    const supplementalEnvelopeValid =
      supplemental.schemaVersion === 1 &&
      supplemental.kind === "synthetic-production-shape-journeys" &&
      orderedTimestamps(supplemental.startedAtUtc, supplemental.generatedAtUtc) &&
      captureAfterBuild(supplemental.startedAtUtc, supplemental.provenance) &&
      supplemental.claimScope === "UI_PRESENTATION_ONLY" &&
      supplemental.externalMutations === 0 &&
      validCaptureRuntime(supplemental.tool) &&
      Boolean(supplementalHarnessOrigins) &&
      validSupplementalSafetyBoundary(
        supplemental.safetyBoundary,
        supplementalHarnessOrigins,
      ) &&
      validSupplementalArtifactInventory(
        supplemental.artifactInventory,
        supplementalCaptures,
        sha,
        artifactExists,
      ) &&
      supplementalProvenance.result === "AUTOMATED_PASS" &&
      supplementalCaptures.length > 0;
    const supplementalResult = supplementalShaMismatch
      ? "SHA_MISMATCH"
      : !supplementalEnvelopeValid || invalidCaptureIndices.length
        ? "INVALID_EVIDENCE"
        : missingCaptureKeys.length || duplicateCaptureKeys.length ||
            unexpectedCaptureKeys.length || duplicateArtifactPaths.length
          ? "COVERAGE_INCOMPLETE"
          : "AUTOMATED_PASS";
    supplementalInspectionResult = supplementalResult;
    m.syntheticJourneyEvidence = {
      ...supplemental,
      candidateShaMatchesManifest: !supplementalShaMismatch,
      provenanceInspection: supplementalProvenance,
      harnessOriginsInspection: {
        result: supplementalHarnessOrigins ? "AUTOMATED_PASS" : "INVALID_EVIDENCE",
        normalized: supplementalHarnessOrigins,
      },
      result: supplementalResult,
      summary: {
        captures: supplementalCaptures.length,
        automatedPass: supplementalCaptures.filter((capture) =>
          supplementalCaptureValid(capture),
        ).length,
        automatedFail: invalidCaptureIndices.length,
        invalidCaptureIndices,
        expectedCaptures: expectedCaptureKeys.length,
        missingCaptureKeys,
        duplicateCaptureKeys,
        unexpectedCaptureKeys,
        duplicateArtifactPaths,
        sourceSummary: supplemental.summary ?? null,
      },
    };
  }

  const matrixRuns = matrix?.runs ?? [];
  const matrixBaseUrlOrigin = loopbackOrigin(matrix?.baseUrl);
  const supplementalCaptures = supplemental?.captures ?? [];
  const inventoryRouteByPath = new Map(
    (inventory?.routes ?? []).map((route) => [route.path, route]),
  );
  const representativeRequired = new Set(m.requiredRepresentativeSurfaces ?? []);
  m.surfaceCoverage = (m.requiredSurfaces ?? []).map((surface) => {
    const routeRuns = matrixRuns.filter((run) => run.surface === surface);
    const journeyCaptures = supplementalCaptures.filter((capture) => capture.surface === surface);
    const routeCovered = routeRuns.some((run) => isPassingMatrixRecord(
      run,
      sha,
      artifactExists,
      matrixBaseUrlOrigin,
      inventoryRouteByPath.get(run.route),
      artifactRead,
    ));
    const supplementalCovered = journeyCaptures.some((capture) =>
      isValidSupplementalCapture(capture, sha, artifactExists, supplementalHarnessOrigins),
    );
    const representativeCovered = routeRuns.some(
      (run) => run.coverageScope !== "boundary-only" &&
        isPassingMatrixRecord(
          run,
          sha,
          artifactExists,
          matrixBaseUrlOrigin,
          inventoryRouteByPath.get(run.route),
          artifactRead,
        ),
    ) || journeyCaptures.some((capture) =>
      capture.coverageScope !== "boundary-only" &&
        isValidSupplementalCapture(capture, sha, artifactExists, supplementalHarnessOrigins),
    );
    return {
      surface,
      covered: routeCovered || supplementalCovered,
      routeCovered,
      representativeRequired: representativeRequired.has(surface),
      representativeCovered: representativeRequired.has(surface) ? representativeCovered : true,
      states: [...new Set([
        ...routeRuns.map((run) => run.state),
        ...journeyCaptures.map((capture) => capture.state),
      ])],
      routeRunCount: routeRuns.length,
      supplementalCaptureCount: journeyCaptures.length,
    };
  });
  m.stateCoverage = (m.requiredStates ?? []).map((state) => {
    const routeRuns = matrixRuns.filter((run) => run.state === state);
    const journeyCaptures = supplementalCaptures.filter((capture) => capture.state === state);
    return {
      state,
      covered: routeRuns.some((run) => isPassingMatrixRecord(
        run,
        sha,
        artifactExists,
        matrixBaseUrlOrigin,
        inventoryRouteByPath.get(run.route),
        artifactRead,
      )) ||
        journeyCaptures.some((capture) => isValidSupplementalCapture(
          capture,
          sha,
          artifactExists,
          supplementalHarnessOrigins,
        )),
      routeRunCount: routeRuns.length,
      supplementalCaptureCount: journeyCaptures.length,
    };
  });
  const missingSurfaces = m.surfaceCoverage
    .filter((entry) => !entry.covered)
    .map((entry) => entry.surface);
  const missingRepresentativeSurfaces = m.surfaceCoverage
    .filter((entry) => entry.representativeRequired && !entry.representativeCovered)
    .map((entry) => entry.surface);
  const missingStates = m.stateCoverage
    .filter((entry) => !entry.covered)
    .map((entry) => entry.state);
  const representativeJourneyCoverage = (m.requiredRepresentativeJourneys ?? []).map((requirement) => {
    const missingWidthsCssPx = requirement.widthsCssPx.filter((width) =>
      !supplementalCaptures.some((capture) =>
        capture.surface === requirement.surface &&
        capture.state === requirement.state &&
        capture.widthCssPx === width &&
        isValidSupplementalCapture(capture, sha, artifactExists, supplementalHarnessOrigins),
      ),
    );
    return { ...requirement, covered: missingWidthsCssPx.length === 0, missingWidthsCssPx };
  });
  const missingRepresentativeJourneys = representativeJourneyCoverage
    .filter((entry) => !entry.covered)
    .map((entry) => `${entry.surface}/${entry.state}@${entry.missingWidthsCssPx.join(",")}`);
  const coverageShaMismatch = Boolean(matrix && matrix.candidateSha !== sha) ||
    Boolean(supplemental && supplemental.candidateSha !== sha);
  const coverageResult = coverageShaMismatch
    ? "SHA_MISMATCH"
    : matrixHttpProvenance.result === "PROVENANCE_MISMATCH"
      ? "PROVENANCE_MISMATCH"
      : matrixHttpProvenance.result === "INVALID_EVIDENCE"
        ? "INVALID_EVIDENCE"
        : missingSurfaces.length || missingRepresentativeSurfaces.length || missingStates.length ||
        missingRepresentativeJourneys.length || matrixInspection.result !== "AUTOMATED_PASS" ||
          supplementalInspectionResult !== "AUTOMATED_PASS" ||
          matrixHttpProvenance.result !== "AUTOMATED_PASS"
          ? "COVERAGE_INCOMPLETE"
          : "AUTOMATED_PASS";
  m.gates = m.gates ?? {};
  m.gates.evidenceProvenance = matrixHttpProvenance;
  m.gates.evidenceCoverage = {
    result: coverageResult,
    missingSurfaces,
    missingRepresentativeSurfaces,
    missingRepresentativeJourneys,
    missingStates,
    representativeJourneyCoverage,
    browserMatrixCompleteness: matrixInspection.result,
    syntheticJourneyEvidence: supplementalInspectionResult,
    matrixHttpProvenance: matrixHttpProvenance.result,
    testBackedStates: m.testBackedStates ?? [],
  };
  if (http) {
    const byId = (id) => {
      const seen = (http.records ?? []).flatMap((r) => (r.assertions ?? []).filter((a) => a.id === id && a.result !== "NOT_APPLICABLE"));
      if (seen.length === 0) return "NOT_APPLICABLE";
      if (seen.some((a) => ["NOT_RUN", "PENDING"].includes(a.result))) return "PENDING";
      return seen.some((a) => a.result === "FAIL") ? "AUTOMATED_FAIL" : "AUTOMATED_PASS";
    };
    const groupedResult = (ids) => {
      const results = ids.map(byId);
      if (results.includes("AUTOMATED_FAIL")) return "AUTOMATED_FAIL";
      if (results.some((result) => ["PENDING", "NOT_APPLICABLE"].includes(result))) return "PENDING";
      return "AUTOMATED_PASS";
    };
    m.httpHeadEvidence = {
      ...(m.httpHeadEvidence ?? {}),
      result: httpInspection.result,
      candidateSha: http.candidateSha,
      candidateShaMatchesManifest: http.candidateSha === sha,
      baseUrl: http.baseUrl,
      provenance: http.provenance,
      provenanceInspection: httpInspection.provenance,
      tool: http.tool,
      sitemap: http.sitemap,
      robots: http.robots,
      completeness: httpInspection,
      records: (http.records ?? []).map((r) => ({ candidateSha: r.candidateSha, route: r.route, surface: r.surface, indexable: r.indexable, status: r.status, finalUrl: r.finalUrl, redirects: r.redirects, xRobotsTag: r.headers?.["x-robots-tag"] ?? null, title: r.metadata?.title ?? null, canonical: r.metadata?.canonical ?? null, jsonLdTypes: (r.metadata?.jsonLd ?? []).map((j) => j.type), assertions: r.assertions, result: r.result, rawHtmlPath: r.rawHtmlPath, rawHtmlSha256: r.rawHtmlSha256, timestampUtc: r.timestampUtc })),
    };
    m.gates = m.gates ?? {};
    const restoration = matrix?.metadataRestoration ?? [];
    m.gates.seo = {
      ...(m.gates.seo ?? {}),
      result: httpInspection.result !== "AUTOMATED_PASS"
        ? httpInspection.result
        : matrixInspection.result !== "AUTOMATED_PASS"
          ? matrixInspection.result
          : matrixHttpProvenance.result !== "AUTOMATED_PASS"
            ? matrixHttpProvenance.result
          : "AUTOMATED_PASS",
      actualPublicRouteComposition: httpInspection.result,
      serverXRobotsTag: byId("X_ROBOTS_TAG"),
      documentRobotsMeta: byId("ROBOTS_META"),
      rawHtmlTitleCanonicalOpenGraph: groupedResult(["RAW_HTML_TITLE", "CANONICAL", "OPEN_GRAPH"]),
      sitemapParity: byId("SITEMAP_PARITY"),
      routeScopedStructuredData: byId("STRUCTURED_DATA_SCOPE"),
      authoritative404: byId("AUTHORITATIVE_404"),
      publicToPrivateMetadataRestoration: restoration.length === 0 ? "PENDING" : restoration.every((r) => r.result === "PASS") ? "AUTOMATED_PASS" : "AUTOMATED_FAIL",
      artifact: "http-evidence.json",
    };
    m.gates.httpEvidenceCompleteness = httpInspection;
  }

  if (pii) {
    m.gates = m.gates ?? {};
    const expectedScreenshots = [
      ...(matrix?.runs ?? []).map((run) => run.artifactPath),
      ...(supplemental?.captures ?? []).map((capture) => capture.artifactPath),
    ].filter(nonEmpty);
    const scannedScreenshots = new Set(pii.screenshots ?? []);
    const missingScreenshots = expectedScreenshots.filter((path) => !scannedScreenshots.has(path));
    const findings = Array.isArray(pii.findings) ? pii.findings : [];
    const declaredInventory = Array.isArray(pii.fileInventory)
      ? [...pii.fileInventory].sort((a, b) => a.path.localeCompare(b.path))
      : [];
    const normalizedActualInventory = [...actualEvidenceFiles].sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    const expectedTextArtifacts = [];
    const expectedManualImages = [];
    const actualUnscannableArtifacts = [];
    for (const entry of normalizedActualInventory) {
      const classification = classifyEvidenceArtifact(entry.path);
      if (classification.kind === "TEXT") expectedTextArtifacts.push(entry.path);
      else if (classification.kind === "MANUAL_IMAGE") expectedManualImages.push(entry.path);
      else actualUnscannableArtifacts.push({ path: entry.path, reason: classification.reason });
    }
    const declaredTextArtifacts = Array.isArray(pii.textArtifacts) ? pii.textArtifacts : [];
    const declaredScreenshots = Array.isArray(pii.screenshots) ? pii.screenshots : [];
    const declaredUnscannableArtifacts = Array.isArray(pii.unscannableArtifacts)
      ? pii.unscannableArtifacts
      : null;
    const scanCoverageMatches =
      actualUnscannableArtifacts.length === 0 &&
      JSON.stringify(declaredTextArtifacts) === JSON.stringify(expectedTextArtifacts) &&
      JSON.stringify(declaredScreenshots) === JSON.stringify(expectedManualImages) &&
      JSON.stringify(declaredUnscannableArtifacts) === "[]" &&
      pii.scanCoverage?.result === "COMPLETE" &&
      pii.scanCoverage?.classifiedFiles === normalizedActualInventory.length &&
      pii.scanCoverage?.totalFiles === normalizedActualInventory.length &&
      pii.scanCoverage?.textFiles === expectedTextArtifacts.length &&
      pii.scanCoverage?.manualImageFiles === expectedManualImages.length &&
      pii.scanCoverage?.unscannableFiles === 0;
    const inventoryHash = createHash("sha256")
      .update(JSON.stringify(declaredInventory))
      .digest("hex");
    const inventoryMatches =
      JSON.stringify(declaredInventory) === JSON.stringify(normalizedActualInventory) &&
      pii.inventorySha256 === inventoryHash &&
      declaredInventory.every((entry) =>
        nonEmpty(entry.path) && /^[a-f0-9]{64}$/u.test(entry.sha256 ?? "") &&
        artifactExists(entry.path, entry.sha256, {
          piiScanKind: classifyEvidenceArtifact(entry.path).kind,
        }),
      );
    const validCleanScan =
      pii.schemaVersion === 4 &&
      pii.kind === "evidence-pii-scan" &&
      pii.candidateSha === sha &&
      pii.summary?.result === "CLEAN" &&
      pii.summary?.total === 0 &&
      findings.length === 0 &&
      missingScreenshots.length === 0 &&
      inventoryMatches &&
      scanCoverageMatches &&
      pii.textFilesScanned === expectedTextArtifacts.length &&
      pii.textFilesScanned > 0;
    m.gates.evidencePiiScan = {
      result: validCleanScan ? "AUTOMATED_CLEAN_MANUAL_SCREENSHOT_REVIEW_PENDING" : findings.length ? "FINDINGS" : "INVALID_EVIDENCE",
      findings: findings.length,
      byId: pii.summary?.byId ?? {},
      screenshotsRequiringManualReview: pii.screenshots?.length ?? 0,
      missingScreenshots,
      inventoryMatches,
      scanCoverageMatches,
      unscannableArtifacts: actualUnscannableArtifacts,
      candidateShaMatchesManifest: pii.candidateSha === sha,
      artifact: "pii-scan.json",
    };
  }

  // Guard: never let the generator flip these.
  m.status = "PENDING";
  m.finalVerdict = "PENDING";
  m.readyForSamuelDeployReview = false;
  return m;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.outDir) {
    console.log("usage: generate-evidence-manifest.mjs --out-dir <dir> [--template <manifest.json>] [--sha <sha>] [--reviewer <name>] [--artifact-root <repo-relative dir>] [--output <path>]");
    process.exit(args.help ? 0 : 2);
  }
  const outDir = resolve(args.outDir);
  const template = readJson(resolve(args.template));
  if (!template) throw new Error(`template not found: ${args.template}`);
  const canonicalTemplate = readJson(join(here, "evidence-manifest.template.json"));
  assertCanonicalMinimumPolicy(template, canonicalTemplate);
  const matrix = readJson(join(outDir, "browser-matrix.json"));
  const supplemental = readJson(join(outDir, "synthetic-journey-evidence.json"));
  const http = readJson(join(outDir, "http-evidence.json"));
  const pii = readJson(join(outDir, "pii-scan.json"));
  const inventoryPath = join(here, "routes.public.json");
  const inventorySource = readFileSync(inventoryPath);
  const inventory = JSON.parse(inventorySource.toString("utf8"));
  const routesInventory = {
    id: "scripts/evidence/routes.public.json",
    sha256: createHash("sha256").update(inventorySource).digest("hex"),
  };
  const robotsSource = readFileSync(join(repoRoot, "client", "public", "robots.txt"));
  const sitemapSource = readFileSync(join(repoRoot, "client", "public", "sitemap.xml"));
  const expectedRobotsValidation = evaluateRobotsTxt(robotsSource.toString("utf8"));
  if (expectedRobotsValidation.result !== "PASS") {
    throw new Error("candidate client/public/robots.txt violates the exact reviewed directives");
  }
  const expectedSitemapLocs = parseSitemapLocs(sitemapSource.toString("utf8"));
  if (evaluateSitemapLocs(expectedSitemapLocs).result !== "PASS") {
    throw new Error("candidate client/public/sitemap.xml violates the exact production URL contract");
  }
  assertPinnedExecutingRuntime();
  const rawAssetContract = {
    robots: {
      bodyPath: "raw-html/robots.txt",
      sourcePath: "client/public/robots.txt",
      bytes: robotsSource.length,
      sha256: createHash("sha256").update(robotsSource).digest("hex"),
      directivesValidation: expectedRobotsValidation,
    },
    sitemap: {
      bodyPath: "raw-html/sitemap.xml",
      sourcePath: "client/public/sitemap.xml",
      bytes: sitemapSource.length,
      sha256: createHash("sha256").update(sitemapSource).digest("hex"),
      locs: expectedSitemapLocs,
    },
  };
  const sha = args.sha ?? matrix?.candidateSha ?? supplemental?.candidateSha ?? http?.candidateSha ?? gitSha() ?? "UNKNOWN";
  if (!EXACT_SHA.test(sha)) {
    throw new Error("manifest generation requires --sha to resolve to an exact 40-character commit SHA");
  }
  const checkout = assertCleanCandidateCheckout({ sha, cwd: repoRoot });
  const sourceTree = checkout.sourceTree;
  const artifactExists = (artifactPath, expectedSha256 = null, expectation = null) => {
    if (!nonEmpty(artifactPath)) return false;
    const fullPath = resolve(outDir, artifactPath);
    const rel = relative(outDir, fullPath);
    if (!rel || rel.startsWith("..") || isAbsolute(rel) || !existsSync(fullPath)) return false;
    try {
      if (!statSync(fullPath).isFile()) return false;
      const bytes = readFileSync(fullPath);
      if (expectedSha256 !== null) {
        if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) return false;
        const actual = createHash("sha256").update(bytes).digest("hex");
        if (actual !== expectedSha256) return false;
      }
      if (expectation?.pngDimensions) {
        if (
          bytes.length < 24 ||
          bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
        ) return false;
        if (
          bytes.readUInt32BE(16) !== expectation.pngDimensions.width ||
          bytes.readUInt32BE(20) !== expectation.pngDimensions.height
        ) return false;
      }
      if (
        expectation?.byteLength !== undefined &&
        bytes.length !== expectation.byteLength
      ) return false;
      if (expectation?.piiScanKind) {
        const validation = validateEvidenceArtifactBytes(artifactPath, bytes);
        if (!validation.valid || validation.kind !== expectation.piiScanKind) return false;
      }
      return true;
    } catch {
      return false;
    }
  };
  const artifactRead = (artifactPath) => {
    if (!nonEmpty(artifactPath)) return null;
    const fullPath = resolve(outDir, artifactPath);
    const rel = relative(outDir, fullPath);
    if (!rel || rel.startsWith("..") || isAbsolute(rel) || !existsSync(fullPath)) return null;
    try {
      if (!statSync(fullPath).isFile()) return null;
      return readFileSync(fullPath);
    } catch {
      return null;
    }
  };
  const actualEvidenceFiles = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const fullPath = join(dir, name);
      if (statSync(fullPath).isDirectory()) {
        visit(fullPath);
        continue;
      }
      const path = relative(outDir, fullPath).replace(/\\/gu, "/");
      if (["pii-scan.json", "evidence-manifest.json"].includes(path)) continue;
      const bytes = readFileSync(fullPath);
      actualEvidenceFiles.push({
        path,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  };
  visit(outDir);
  const manifest = buildManifest({ template, matrix, supplemental, http, pii, inventory, routesInventory, rawAssetContract, actualEvidenceFiles, sha, sourceTree, packageLockSha256: checkout.packageLockSha256, reviewer: args.reviewer, artifactRoot: args.artifactRoot, artifactExists, artifactRead });
  const output = resolve(args.output ?? join(outDir, "evidence-manifest.json"));
  writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`manifest -> ${output}\n  browserMatrix: ${manifest.browserMatrix?.result ?? "absent"} (${manifest.browserMatrix?.runs?.length ?? 0} runs)\n  syntheticJourneyEvidence: ${manifest.syntheticJourneyEvidence?.result ?? "absent"} (${manifest.syntheticJourneyEvidence?.captures?.length ?? 0} captures)\n  evidenceCoverage: ${manifest.gates?.evidenceCoverage?.result ?? "absent"}\n  httpHeadEvidence: ${manifest.httpHeadEvidence?.result ?? "absent"} (${manifest.httpHeadEvidence?.records?.length ?? 0} records)\n  evidencePiiScan: ${manifest.gates?.evidencePiiScan?.result ?? "absent"}\n  finalVerdict: ${manifest.finalVerdict}`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
