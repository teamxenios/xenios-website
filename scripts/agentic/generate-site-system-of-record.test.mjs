import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  OUTPUT_PATHS,
  STATUS_VOCABULARY,
  artifactMismatches,
  buildRouteInventory,
  extractClientRouteRegistrations,
  nonRecordDirtyPaths,
  parsePorcelainPaths,
  renderArtifacts,
  sensitiveRecordFindings,
  validateRegistry,
  validateSnapshot,
} from "./generate-site-system-of-record.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function registryCapability(overrides = {}) {
  return {
    id: "order_entry_hub",
    capability: "Order Entry Hub",
    persona: "research_customer",
    route: "/research/order",
    owningClientComponent: "client/src/research/order/OrderEntryHub.tsx",
    owningServerRoute: null,
    authorizationBoundary: "Public orientation; protected destinations enforce their own authority",
    dataSource: "Curated route registry only",
    sourceStatus: "mounted",
    testStatus: "focused_tests_pass",
    browserStatus: "unknown",
    productionStatus: "built_not_deployed",
    ownerTaskId: "XENIOS-MAJOR-ORDERING-ADMIN-SOR-20260904",
    blocker: null,
    founderAction: null,
    nextExactAction: "Run browser verification",
    evidence: {
      source: ["client/src/research/order/OrderEntryHub.tsx"],
      tests: ["client/src/research/order/OrderEntryHub.test.tsx"],
      browser: [],
      production: [],
    },
    verification: {
      requiredClientRoute: true,
      requiredFiles: ["client/src/research/order/OrderEntryHub.tsx"],
      serverRouteEvidenceFiles: [],
    },
    ...overrides,
  };
}

function registry(overrides = {}) {
  return {
    schemaVersion: 1,
    repository: "xenios",
    productionEvidence: {
      sha: SHA_B,
      deployId: "dep-safe",
      verificationStatus: "live_verified",
      observedAt: "2026-09-04T20:00:00Z",
      evidenceSource: "read-only provider observation",
    },
    capabilities: [registryCapability()],
    ...overrides,
  };
}

function capabilityRecord(overrides = {}) {
  return {
    id: "order_entry_hub",
    capability: "Order Entry Hub",
    persona: "research_customer",
    route: "/research/order",
    owningClientComponent: "client/src/research/order/OrderEntryHub.tsx",
    owningServerRoute: null,
    authorizationBoundary: "Public orientation; protected destinations enforce their own authority",
    dataSource: "Curated route registry only",
    sourceStatus: "mounted",
    testStatus: "focused_tests_pass",
    browserStatus: "unknown",
    productionStatus: "built_not_deployed",
    currentSourceSha: SHA_A,
    productionSha: SHA_B,
    ownerAndLease: {
      taskId: "XENIOS-MAJOR-ORDERING-ADMIN-SOR-20260904",
      owner: "codex-major-ordering-admin-sor-20260904",
      leaseState: "active",
    },
    blocker: null,
    founderAction: null,
    nextExactAction: "Run browser verification",
    evidence: {
      source: ["client/src/research/order/OrderEntryHub.tsx"],
      tests: ["client/src/research/order/OrderEntryHub.test.tsx"],
      browser: [],
      production: [],
    },
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-04T20:00:00Z",
    repository: "xenios",
    source: {
      branch: "codex/example",
      sha: SHA_A,
      tree: "c".repeat(40),
      clean: true,
      provenance: "Committed non-record source",
    },
    production: {
      sha: SHA_B,
      deployId: "dep-safe",
      verificationStatus: "live_verified",
      observedAt: "2026-09-04T20:00:00Z",
      evidenceSource: "read-only provider observation",
    },
    statusVocabulary: [...STATUS_VOCABULARY],
    routeSummary: {
      uniqueRoutes: 1,
      registrations: 1,
      byPersona: { research_customer: 1 },
      byDomain: { commerce: 1 },
      productionStatus: { built_not_deployed: 1 },
    },
    routes: [{
      path: "/research/order",
      persona: "research_customer",
      domain: "commerce",
      sourceStatus: "mounted",
      testStatus: "focused_tests_pass",
      browserStatus: "unknown",
      productionStatus: "built_not_deployed",
      registrations: [{ source: "client/src/App.tsx", line: 10 }],
      capabilities: ["order_entry_hub"],
    }],
    capabilitySummary: {
      count: 1,
      sourceStatus: { mounted: 1 },
      testStatus: { focused_tests_pass: 1 },
      browserStatus: { unknown: 1 },
      productionStatus: { built_not_deployed: 1 },
    },
    capabilities: [capabilityRecord()],
    sources: {
      registry: "docs/platform/XENIOS_SITE_SYSTEM_OF_RECORD.registry.json",
      projectState: ".xenios/PROJECT_STATE.json",
      releaseState: ".xenios/RELEASE_STATE.json",
      activeTasks: ".xenios/ACTIVE_TASKS.json",
      codeOwnership: ".xenios/CODE_OWNERSHIP.json",
      clientRouteFiles: ["client/src/App.tsx"],
    },
    invariants: ["Mounted is not deployed."],
    ...overrides,
  };
}

test("status vocabulary is exact and legacy labels are rejected", () => {
  assert.deepEqual(STATUS_VOCABULARY, [
    "source_present",
    "mounted",
    "focused_tests_pass",
    "full_suite_pass",
    "browser_verified",
    "built_not_deployed",
    "deployed_not_authenticated_smoked",
    "live_verified",
    "feature_gated",
    "blocked_external",
    "superseded",
    "unknown",
  ]);

  const invalid = registry({
    capabilities: [registryCapability({ sourceStatus: "implemented" })],
  });
  assert.match(validateRegistry(invalid).join("\n"), /sourceStatus is invalid/);
});

test("registry validation is closed, unique, and path-safe", () => {
  assert.deepEqual(validateRegistry(registry()), []);

  const invalid = registry({
    extra: true,
    capabilities: [
      registryCapability({
        unexpected: true,
        verification: {
          requiredClientRoute: true,
          requiredFiles: ["../outside"],
          serverRouteEvidenceFiles: [],
        },
      }),
      registryCapability(),
    ],
  });
  const errors = validateRegistry(invalid).join("\n");
  assert.match(errors, /unexpected extra/);
  assert.match(errors, /unexpected unexpected/);
  assert.match(errors, /duplicates id/);
  assert.match(errors, /unsafe path/);
});

test("route extraction records literal registrations without treating password routes as secrets", () => {
  const registrations = extractClientRouteRegistrations(`
    <Route path="/research/reset-password" component={ResetPassword} />
    <Route path='/research/order' component={OrderEntryHub} />
    <Route path={dynamicPath} component={Unknown} />
  `, "client/src/App.tsx");

  assert.deepEqual(registrations.map((entry) => entry.path), [
    "/research/reset-password",
    "/research/order",
  ]);
  assert.deepEqual(sensitiveRecordFindings(registrations), []);
});

test("route inventory deduplicates paths while preserving registration evidence and capability axes", () => {
  const routes = buildRouteInventory([
    { path: "/research/order", source: "client/src/App.tsx", line: 12 },
    { path: "/research/order", source: "client/src/Routes.tsx", line: 4 },
    { path: "/admin/research", source: "client/src/App.tsx", line: 20 },
  ], [registryCapability()]);

  assert.equal(routes.length, 2);
  const order = routes.find((route) => route.path === "/research/order");
  assert.equal(order.registrations.length, 2);
  assert.equal(order.testStatus, "focused_tests_pass");
  assert.deepEqual(order.capabilities, ["order_entry_hub"]);
  assert.equal(routes.find((route) => route.path === "/admin/research").persona, "founder_admin_operations");
});

test("snapshot validation enforces capability shape, exact SHAs, statuses, uniqueness, and privacy", () => {
  assert.deepEqual(validateSnapshot(snapshot()), []);

  const missingField = capabilityRecord();
  delete missingField.nextExactAction;
  const invalid = snapshot({
    routes: [
      snapshot().routes[0],
      { ...snapshot().routes[0], testStatus: "passing" },
    ],
    capabilities: [
      missingField,
      capabilityRecord({ id: "second", currentSourceSha: SHA_B, blocker: "contact person@example.com" }),
    ],
  });
  const errors = validateSnapshot(invalid).join("\n");
  assert.match(errors, /duplicate route/);
  assert.match(errors, /testStatus is invalid/);
  assert.match(errors, /missing nextExactAction/);
  assert.match(errors, /source SHA drifted/);
  assert.match(errors, /email address/);
});

test("snapshot validation rejects nested contract drift and summary mismatches", () => {
  const invalid = snapshot();
  invalid.source.unexpected = true;
  invalid.routes[0].registrations[0].unexpected = true;
  invalid.routes[0].capabilities.push("missing_capability");
  invalid.routeSummary.uniqueRoutes = 99;
  invalid.capabilities[0].ownerAndLease.unexpected = true;
  invalid.capabilities[0].evidence.source.push(invalid.capabilities[0].evidence.source[0]);
  invalid.sources.clientRouteFiles.push("../outside.tsx");

  const errors = validateSnapshot(invalid).join("\n");
  assert.match(errors, /source unexpected unexpected/);
  assert.match(errors, /registration unexpected unexpected/);
  assert.match(errors, /references unknown capability missing_capability/);
  assert.match(errors, /routeSummary\.uniqueRoutes does not match routes/);
  assert.match(errors, /ownerAndLease unexpected unexpected/);
  assert.match(errors, /evidence\.source must be unique strings/);
  assert.match(errors, /sources\.clientRouteFiles must contain unique safe paths/);
});

test("privacy scanner finds credentials and identifiers but ignores ordinary route words", () => {
  const findings = sensitiveRecordFindings({
    route: "/research/reset-password",
    email: "member@example.com",
    token: "eyJabcdefghijk.abcdefghijkl.abcdefghijkl",
    privateKey: "-----BEGIN PRIVATE KEY-----",
    productionKey: "sk_live_abcdefghijklmnop",
  });
  assert.equal(findings.length, 4);
  assert.ok(findings.every((finding) => !finding.includes("route")));
});

test("rendering is deterministic and quotes CSV values safely", () => {
  const value = snapshot();
  value.routes[0].registrations.push({ source: "client/src/File,One.tsx", line: 8 });
  const first = renderArtifacts(value);
  const second = renderArtifacts(value);
  assert.deepEqual(first, second);
  assert.equal(JSON.parse(first[OUTPUT_PATHS.json]).source.sha, SHA_A);
  assert.match(first[OUTPUT_PATHS.markdown], /# Xenios Site System of Record/);
  assert.ok(first[OUTPUT_PATHS.markdown].endsWith("\n"));
  assert.ok(!first[OUTPUT_PATHS.markdown].endsWith("\n\n"));
  assert.match(first[OUTPUT_PATHS.csv], /"client\/src\/App\.tsx:10 \| client\/src\/File,One\.tsx:8"/);
});

test("freshness check identifies missing and byte-stale outputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "xenios-sor-test-"));
  try {
    const artifacts = renderArtifacts(snapshot());
    assert.equal((await artifactMismatches(root, artifacts)).length, 3);

    for (const [path, content] of Object.entries(artifacts)) {
      const target = resolve(root, path);
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, content, "utf8");
    }
    assert.deepEqual(await artifactMismatches(root, artifacts), []);

    await writeFile(resolve(root, OUTPUT_PATHS.markdown), "stale\n", "utf8");
    assert.deepEqual(await artifactMismatches(root, artifacts), [`${OUTPUT_PATHS.markdown}: stale`]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dirty path parsing ignores continuity records and generated outputs only", () => {
  const porcelain = [
    " M client/src/App.tsx",
    " M .xenios/ACTIVE_TASKS.json",
    `?? ${OUTPUT_PATHS.json}`,
    "R  old.ts -> client/src/new.ts",
  ].join("\n");
  assert.deepEqual(parsePorcelainPaths(porcelain), [
    "client/src/App.tsx",
    ".xenios/ACTIVE_TASKS.json",
    OUTPUT_PATHS.json,
    "old.ts",
    "client/src/new.ts",
  ]);
  assert.deepEqual(nonRecordDirtyPaths(porcelain), [
    "client/src/App.tsx",
    "old.ts",
    "client/src/new.ts",
  ]);
});

test("published JSON schema stays aligned with the runtime contract", async () => {
  const schemaPath = resolve(import.meta.dirname, "../../docs/platform/XENIOS_SITE_SYSTEM_OF_RECORD.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  assert.deepEqual(schema.$defs.status.enum, [...STATUS_VOCABULARY]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.capability.additionalProperties, false);
  assert.deepEqual(
    new Set(schema.$defs.capability.required),
    new Set([
      "id",
      "capability",
      "persona",
      "route",
      "owningClientComponent",
      "owningServerRoute",
      "authorizationBoundary",
      "dataSource",
      "sourceStatus",
      "testStatus",
      "browserStatus",
      "productionStatus",
      "currentSourceSha",
      "productionSha",
      "ownerAndLease",
      "blocker",
      "founderAction",
      "nextExactAction",
      "evidence",
    ]),
  );
});
