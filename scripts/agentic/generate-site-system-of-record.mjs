#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIRECTORY, "../..");

export const STATUS_VOCABULARY = Object.freeze([
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

export const OUTPUT_PATHS = Object.freeze({
  json: "docs/platform/XENIOS_SITE_SYSTEM_OF_RECORD.generated.json",
  markdown: "docs/platform/XENIOS_SITE_SYSTEM_OF_RECORD.generated.md",
  csv: "docs/platform/XENIOS_SITE_ROUTE_INVENTORY.generated.csv",
});

const REGISTRY_PATH = "docs/platform/XENIOS_SITE_SYSTEM_OF_RECORD.registry.json";
const PROJECT_STATE_PATH = ".xenios/PROJECT_STATE.json";
const RELEASE_STATE_PATH = ".xenios/RELEASE_STATE.json";
const ACTIVE_TASKS_PATH = ".xenios/ACTIVE_TASKS.json";
const OWNERSHIP_PATH = ".xenios/CODE_OWNERSHIP.json";
const GENERATED_PATH_SET = new Set(Object.values(OUTPUT_PATHS));
const CAPABILITY_REQUIRED_FIELDS = Object.freeze([
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
]);

function normalizePath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//, "");
}

function gitRaw(root, args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error
      ? String(error.stderr).trim()
      : "";
    throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
}

function git(root, args) {
  return gitRaw(root, args).trim();
}

function sourcePathspecExclusions() {
  return [
    ...Object.values(OUTPUT_PATHS).map((path) => `:(exclude)${path}`),
    ":(exclude).xenios/**",
  ];
}

export function parsePorcelainPaths(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      const payload = line.slice(3).trim();
      if (!payload) return [];
      const renameParts = payload.split(" -> ");
      return renameParts.map((part) => normalizePath(part.replace(/^"|"$/g, "")));
    });
}

export function isRecordOnlyPath(path) {
  const normalized = normalizePath(path);
  return GENERATED_PATH_SET.has(normalized) || normalized.startsWith(".xenios/");
}

export function nonRecordDirtyPaths(output) {
  return parsePorcelainPaths(output).filter((path) => !isRecordOnlyPath(path));
}

function currentSourceSha(root) {
  const value = git(root, [
    "log",
    "-1",
    "--format=%H",
    "--",
    ".",
    ...sourcePathspecExclusions(),
  ]);
  if (!/^[a-f0-9]{40}$/i.test(value)) {
    throw new Error("Could not resolve a committed non-record source SHA");
  }
  return value;
}

function readGitText(root, sha, path) {
  return gitRaw(root, ["show", `${sha}:${normalizePath(path)}`]);
}

function readGitJson(root, sha, path) {
  try {
    return JSON.parse(readGitText(root, sha, path));
  } catch (error) {
    throw new Error(`${path} is missing or invalid at ${sha}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function gitPathExists(root, sha, path) {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}:${normalizePath(path)}`], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function clientSourceFiles(root, sha) {
  const output = git(root, ["ls-tree", "-r", "--name-only", sha, "--", "client/src"]);
  return output
    .split(/\r?\n/)
    .map(normalizePath)
    .filter((path) => path.endsWith(".tsx"))
    .filter((path) => !/\.(?:test|spec)\.tsx$/i.test(path))
    .sort((a, b) => a.localeCompare(b));
}

export function extractClientRouteRegistrations(source, file = "fixture.tsx") {
  const registrations = [];
  const routeTag = /<Route\b[^>]*>/g;
  for (const match of source.matchAll(routeTag)) {
    const tag = match[0];
    const pathMatch = /\bpath\s*=\s*(["'])([^"']+)\1/.exec(tag);
    if (!pathMatch) continue;
    const before = source.slice(0, match.index ?? 0);
    registrations.push({
      path: pathMatch[2].replace(/\/{2,}/g, "/"),
      source: normalizePath(file),
      line: before.split(/\r?\n/).length,
    });
  }
  return registrations;
}

function routePersona(path) {
  if (path.startsWith("/admin")) return "founder_admin_operations";
  if (path === "/health") return "public_health_visitor";
  if (path.startsWith("/care")) return "care_requester";
  if (path.startsWith("/r/")) return "referral_recipient";
  if (path.includes("/partners") || path.includes("/affiliates")) return "partner_affiliate";
  if (path.includes("/organizations") || path.includes("/wholesale")) return "organization_buyer";
  if (path.includes("/supplier")) return "supplier_fulfillment";
  if (path.includes("/account")) return "research_customer";
  if (path.includes("/member")) return "research_member";
  if (path.includes("/early-access")) return "quick_early_access_customer";
  if (path.startsWith("/research")) return "public_research_visitor";
  return "public_visitor";
}

function routeDomain(path) {
  if (path.startsWith("/admin")) return "operations";
  if (path === "/health" || path.startsWith("/care")) return "care";
  if (path.startsWith("/r/") || path.includes("/partners") || path.includes("/affiliates")) return "referrals_partners";
  if (path.includes("/organizations") || path.includes("/wholesale")) return "organizations";
  if (path.includes("/supplier")) return "supplier_fulfillment";
  if (/(?:order|cart|checkout|early-access)/.test(path)) return "commerce";
  if (/(?:account|member|sign-in|reset-password|activate)/.test(path)) return "identity_accounts";
  if (path.startsWith("/research")) return "research_experience";
  return "corporate_site";
}

export function buildRouteInventory(registrations, capabilities = []) {
  const byPath = new Map();
  for (const registration of registrations) {
    if (!registration.path.startsWith("/")) continue;
    const values = byPath.get(registration.path) ?? [];
    values.push({ source: normalizePath(registration.source), line: Number(registration.line) });
    byPath.set(registration.path, values);
  }
  return [...byPath.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, values]) => {
      const related = capabilities.filter((capability) => capability.route === path);
      return {
        path,
        persona: related[0]?.persona ?? routePersona(path),
        domain: routeDomain(path),
        sourceStatus: "mounted",
        testStatus: related[0]?.testStatus ?? "unknown",
        browserStatus: related[0]?.browserStatus ?? "unknown",
        productionStatus: related[0]?.productionStatus ?? "unknown",
        registrations: values.sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line),
        capabilities: related.map((capability) => capability.id).sort((a, b) => a.localeCompare(b)),
      };
    });
}

function exactKeys(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["must be an object"];
  const allowed = new Set([...required, ...optional]);
  const errors = [];
  for (const key of required) if (!(key in value)) errors.push(`missing ${key}`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`unexpected ${key}`);
  return errors;
}

function validStatus(value) {
  return STATUS_VOCABULARY.includes(value);
}

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("..") && !value.includes("\\");
}

export function validateRegistry(registry) {
  const errors = exactKeys(registry, ["schemaVersion", "repository", "productionEvidence", "capabilities"]);
  if (registry?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof registry?.repository !== "string" || registry.repository.length === 0) errors.push("repository is required");
  errors.push(...exactKeys(
    registry?.productionEvidence,
    ["sha", "deployId", "verificationStatus", "observedAt", "evidenceSource"],
  ).map((error) => `productionEvidence ${error}`));
  if (!/^[a-f0-9]{40}$/i.test(registry?.productionEvidence?.sha ?? "")) errors.push("productionEvidence sha must be full length");
  if (!validStatus(registry?.productionEvidence?.verificationStatus)) errors.push("productionEvidence verificationStatus is invalid");
  if (!Array.isArray(registry?.capabilities) || registry.capabilities.length === 0) {
    errors.push("capabilities must be a non-empty array");
    return errors;
  }
  const ids = new Set();
  const required = [
    "id", "capability", "persona", "route", "owningClientComponent", "owningServerRoute",
    "authorizationBoundary", "dataSource", "sourceStatus", "testStatus", "browserStatus",
    "productionStatus", "ownerTaskId", "blocker", "founderAction", "nextExactAction",
    "evidence", "verification",
  ];
  registry.capabilities.forEach((capability, index) => {
    const prefix = `capabilities[${index}]`;
    errors.push(...exactKeys(capability, required).map((error) => `${prefix} ${error}`));
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(capability?.id ?? "")) errors.push(`${prefix} id is invalid`);
    if (ids.has(capability?.id)) errors.push(`${prefix} duplicates id ${capability.id}`);
    ids.add(capability?.id);
    for (const key of ["capability", "persona", "authorizationBoundary", "dataSource", "nextExactAction"]) {
      if (typeof capability?.[key] !== "string" || capability[key].trim() === "") errors.push(`${prefix} ${key} is required`);
    }
    for (const key of ["route", "owningClientComponent", "owningServerRoute", "ownerTaskId", "blocker", "founderAction"]) {
      if (capability?.[key] !== null && typeof capability?.[key] !== "string") errors.push(`${prefix} ${key} must be string or null`);
    }
    for (const key of ["sourceStatus", "testStatus", "browserStatus", "productionStatus"]) {
      if (!validStatus(capability?.[key])) errors.push(`${prefix} ${key} is invalid`);
    }
    errors.push(...exactKeys(capability?.evidence, ["source", "tests", "browser", "production"])
      .map((error) => `${prefix} evidence ${error}`));
    for (const key of ["source", "tests", "browser", "production"]) {
      if (!Array.isArray(capability?.evidence?.[key]) || capability.evidence[key].some((item) => typeof item !== "string")) {
        errors.push(`${prefix} evidence.${key} must be a string array`);
      }
    }
    errors.push(...exactKeys(
      capability?.verification,
      ["requiredClientRoute", "requiredFiles", "serverRouteEvidenceFiles"],
    ).map((error) => `${prefix} verification ${error}`));
    if (typeof capability?.verification?.requiredClientRoute !== "boolean") errors.push(`${prefix} requiredClientRoute must be boolean`);
    for (const key of ["requiredFiles", "serverRouteEvidenceFiles"]) {
      if (!Array.isArray(capability?.verification?.[key]) || capability.verification[key].some((path) => !safeRelativePath(path))) {
        errors.push(`${prefix} verification.${key} contains an unsafe path`);
      }
    }
  });
  return errors;
}

function leaseForCapability(capability, tasks, leases) {
  const task = capability.ownerTaskId
    ? tasks.find((entry) => entry.id === capability.ownerTaskId)
    : null;
  const candidates = capability.ownerTaskId
    ? leases.filter((entry) => entry.task === capability.ownerTaskId)
    : [];
  const lease = candidates.at(-1) ?? null;
  return {
    taskId: capability.ownerTaskId,
    owner: typeof task?.owner === "string" ? task.owner : (typeof lease?.session === "string" ? lease.session : null),
    leaseState: typeof lease?.state === "string" ? lease.state : "unavailable",
  };
}

function capabilityRecord(capability, sourceSha, productionSha, tasks, leases) {
  return {
    id: capability.id,
    capability: capability.capability,
    persona: capability.persona,
    route: capability.route,
    owningClientComponent: capability.owningClientComponent,
    owningServerRoute: capability.owningServerRoute,
    authorizationBoundary: capability.authorizationBoundary,
    dataSource: capability.dataSource,
    sourceStatus: capability.sourceStatus,
    testStatus: capability.testStatus,
    browserStatus: capability.browserStatus,
    productionStatus: capability.productionStatus,
    currentSourceSha: sourceSha,
    productionSha,
    ownerAndLease: leaseForCapability(capability, tasks, leases),
    blocker: capability.blocker,
    founderAction: capability.founderAction,
    nextExactAction: capability.nextExactAction,
    evidence: capability.evidence,
  };
}

function countBy(values, key) {
  const counts = {};
  for (const value of values) counts[value[key]] = (counts[value[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function productionIdentity(project, release, registry) {
  const projectSha = project?.currentRelease?.sha ?? null;
  const releaseSha = release?.lastDocumentedProductionRelease?.sha ?? null;
  const registrySha = registry.productionEvidence.sha;
  if (!projectSha || !releaseSha || projectSha !== releaseSha || projectSha !== registrySha) {
    throw new Error(`Production identity mismatch: project=${projectSha ?? "missing"}, release=${releaseSha ?? "missing"}, registry=${registrySha}`);
  }
  const recordedDeploy = release?.lastDocumentedProductionRelease?.deployId ?? null;
  if (recordedDeploy !== registry.productionEvidence.deployId) {
    throw new Error(`Production deploy mismatch: release=${recordedDeploy ?? "missing"}, registry=${registry.productionEvidence.deployId}`);
  }
  return {
    sha: registrySha,
    deployId: registry.productionEvidence.deployId,
    verificationStatus: registry.productionEvidence.verificationStatus,
    observedAt: registry.productionEvidence.observedAt,
    evidenceSource: registry.productionEvidence.evidenceSource,
  };
}

function assertCapabilityEvidence(root, sha, registry, routePaths) {
  const errors = [];
  for (const capability of registry.capabilities) {
    if (capability.verification.requiredClientRoute && (!capability.route || !routePaths.has(capability.route))) {
      errors.push(`${capability.id}: required client route ${capability.route ?? "missing"} is not registered`);
    }
    for (const path of capability.verification.requiredFiles) {
      if (!gitPathExists(root, sha, path)) errors.push(`${capability.id}: required source file disappeared: ${path}`);
    }
    if (capability.owningServerRoute && capability.verification.serverRouteEvidenceFiles.length === 0) {
      errors.push(`${capability.id}: owningServerRoute has no evidence file`);
    }
    if (capability.owningServerRoute && capability.verification.serverRouteEvidenceFiles.length > 0) {
      const found = capability.verification.serverRouteEvidenceFiles.some((path) => {
        if (!gitPathExists(root, sha, path)) return false;
        return readGitText(root, sha, path).includes(capability.owningServerRoute);
      });
      if (!found) errors.push(`${capability.id}: server route evidence disappeared: ${capability.owningServerRoute}`);
    }
  }
  if (errors.length) throw new Error(`Capability evidence validation failed:\n${errors.join("\n")}`);
}

export function sensitiveRecordFindings(value) {
  const findings = [];
  const visit = (item, path) => {
    if (typeof item === "string") {
      const patterns = [
        [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
        [/\b(?:sk|pk)_(?:live|prod)_[A-Za-z0-9_-]{12,}\b/, "live credential"],
        [/\bsbp_[A-Za-z0-9_-]{12,}\b/, "provider token"],
        [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/, "JWT"],
        [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, "email address"],
      ];
      for (const [pattern, label] of patterns) if (pattern.test(item)) findings.push(`${path}: ${label}`);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }
    if (item && typeof item === "object") {
      for (const [key, child] of Object.entries(item)) visit(child, `${path}.${key}`);
    }
  };
  visit(value, "$record");
  return findings;
}

export function validateSnapshot(snapshot) {
  const errors = exactKeys(snapshot, [
    "schemaVersion", "generatedAt", "repository", "source", "production", "statusVocabulary",
    "routeSummary", "routes", "capabilitySummary", "capabilities", "sources", "invariants",
  ]);
  if (snapshot?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!/^[a-f0-9]{40}$/i.test(snapshot?.source?.sha ?? "")) errors.push("source.sha must be full length");
  if (!/^[a-f0-9]{40}$/i.test(snapshot?.source?.tree ?? "")) errors.push("source.tree must be full length");
  if (snapshot?.source?.clean !== true) errors.push("source.clean must be true");
  if (!/^[a-f0-9]{40}$/i.test(snapshot?.production?.sha ?? "")) errors.push("production.sha must be full length");
  if (!validStatus(snapshot?.production?.verificationStatus)) errors.push("production.verificationStatus is invalid");
  if (JSON.stringify(snapshot?.statusVocabulary) !== JSON.stringify(STATUS_VOCABULARY)) errors.push("statusVocabulary drifted");
  if (!Array.isArray(snapshot?.routes) || snapshot.routes.length === 0) errors.push("routes must be non-empty");
  if (!Array.isArray(snapshot?.capabilities) || snapshot.capabilities.length === 0) errors.push("capabilities must be non-empty");
  const routePaths = new Set();
  for (const route of snapshot?.routes ?? []) {
    if (routePaths.has(route.path)) errors.push(`duplicate route ${route.path}`);
    routePaths.add(route.path);
    for (const key of ["sourceStatus", "testStatus", "browserStatus", "productionStatus"]) {
      if (!validStatus(route[key])) errors.push(`${route.path} ${key} is invalid`);
    }
    if (!Array.isArray(route.registrations) || route.registrations.length === 0) errors.push(`${route.path} has no registration evidence`);
  }
  const capabilityIds = new Set();
  for (const capability of snapshot?.capabilities ?? []) {
    const requiredErrors = exactKeys(capability, ["id", ...CAPABILITY_REQUIRED_FIELDS, "evidence"]);
    errors.push(...requiredErrors.map((error) => `${capability.id ?? "capability"} ${error}`));
    if (capabilityIds.has(capability.id)) errors.push(`duplicate capability ${capability.id}`);
    capabilityIds.add(capability.id);
    for (const key of ["sourceStatus", "testStatus", "browserStatus", "productionStatus"]) {
      if (!validStatus(capability[key])) errors.push(`${capability.id} ${key} is invalid`);
    }
    if (capability.currentSourceSha !== snapshot?.source?.sha) errors.push(`${capability.id} source SHA drifted`);
    if (capability.productionSha !== snapshot?.production?.sha) errors.push(`${capability.id} production SHA drifted`);
  }
  errors.push(...sensitiveRecordFindings(snapshot));
  return errors;
}

export async function buildSnapshot(root = DEFAULT_ROOT) {
  const absoluteRoot = resolve(root);
  const top = normalizePath(git(absoluteRoot, ["rev-parse", "--show-toplevel"]));
  if (top.toLowerCase() !== normalizePath(absoluteRoot).toLowerCase()) {
    throw new Error(`Expected repository root ${normalizePath(absoluteRoot)}, got ${top}`);
  }
  const dirty = nonRecordDirtyPaths(gitRaw(absoluteRoot, ["status", "--porcelain=v1", "--untracked-files=all"]));
  if (dirty.length) {
    throw new Error(`Commit non-record source changes before generating the exact-SHA record:\n${dirty.join("\n")}`);
  }
  const sha = currentSourceSha(absoluteRoot);
  const tree = git(absoluteRoot, ["rev-parse", `${sha}^{tree}`]);
  const generatedAt = git(absoluteRoot, ["show", "-s", "--format=%cI", sha]);
  const branch = git(absoluteRoot, ["branch", "--show-current"]);
  const registry = readGitJson(absoluteRoot, sha, REGISTRY_PATH);
  const registryErrors = validateRegistry(registry);
  if (registryErrors.length) throw new Error(`Registry validation failed:\n${registryErrors.join("\n")}`);
  const project = readGitJson(absoluteRoot, sha, PROJECT_STATE_PATH);
  const release = readGitJson(absoluteRoot, sha, RELEASE_STATE_PATH);
  const taskBoard = readGitJson(absoluteRoot, sha, ACTIVE_TASKS_PATH);
  const ownership = readGitJson(absoluteRoot, sha, OWNERSHIP_PATH);
  const production = productionIdentity(project, release, registry);

  const registrations = [];
  const sourceFiles = clientSourceFiles(absoluteRoot, sha);
  for (const file of sourceFiles) {
    registrations.push(...extractClientRouteRegistrations(readGitText(absoluteRoot, sha, file), file));
  }
  const routePaths = new Set(registrations.map((entry) => entry.path));
  assertCapabilityEvidence(absoluteRoot, sha, registry, routePaths);
  const capabilities = registry.capabilities.map((capability) => capabilityRecord(
    capability,
    sha,
    production.sha,
    taskBoard.tasks ?? [],
    ownership.leases ?? [],
  ));
  const routes = buildRouteInventory(registrations, registry.capabilities);

  const snapshot = {
    schemaVersion: 1,
    generatedAt,
    repository: registry.repository,
    source: {
      branch,
      sha,
      tree,
      clean: true,
      provenance: "Latest commit changing non-generated, non-.xenios source paths",
    },
    production,
    statusVocabulary: [...STATUS_VOCABULARY],
    routeSummary: {
      uniqueRoutes: routes.length,
      registrations: registrations.length,
      byPersona: countBy(routes, "persona"),
      byDomain: countBy(routes, "domain"),
      productionStatus: countBy(routes, "productionStatus"),
    },
    routes,
    capabilitySummary: {
      count: capabilities.length,
      sourceStatus: countBy(capabilities, "sourceStatus"),
      testStatus: countBy(capabilities, "testStatus"),
      browserStatus: countBy(capabilities, "browserStatus"),
      productionStatus: countBy(capabilities, "productionStatus"),
    },
    capabilities,
    sources: {
      registry: REGISTRY_PATH,
      projectState: PROJECT_STATE_PATH,
      releaseState: RELEASE_STATE_PATH,
      activeTasks: ACTIVE_TASKS_PATH,
      codeOwnership: OWNERSHIP_PATH,
      clientRouteFiles: sourceFiles.filter((file) => registrations.some((entry) => entry.source === file)),
    },
    invariants: [
      "Production status is explicit evidence tied to an exact production SHA; it is never inferred from source presence.",
      "A mounted route is not proof of deployment, authentication, data readiness, payment, fulfillment, or clinical action.",
      "One canonical identity, catalog, pricing, order, referral, Care, notification, and audit authority is extended rather than duplicated.",
      "Requests are not paid orders; payment is not fulfillment; Care access requests are not appointments, treatment, prescriptions, or clinical decisions.",
      "Generated records contain technical coordination facts only: no credentials, customer exports, patient data, clinical narratives, or raw payment evidence.",
    ],
  };
  const errors = validateSnapshot(snapshot);
  if (errors.length) throw new Error(`System-of-record validation failed:\n${errors.join("\n")}`);
  return snapshot;
}

function markdownCell(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function markdownTable(rows, columns) {
  return [
    `| ${columns.map((column) => column.label).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${columns.map((column) => markdownCell(row[column.key])).join(" | ")} |`),
  ].join("\n");
}

export function toMarkdown(snapshot) {
  const capabilityRows = snapshot.capabilities.map((capability) => ({
    capability: capability.capability,
    persona: capability.persona,
    route: capability.route ?? "—",
    source: capability.sourceStatus,
    tests: capability.testStatus,
    browser: capability.browserStatus,
    production: capability.productionStatus,
    owner: capability.ownerAndLease.taskId ?? "unassigned",
    next: capability.nextExactAction,
  }));
  const routeRows = snapshot.routes.map((route) => ({
    route: route.path,
    persona: route.persona,
    domain: route.domain,
    source: route.sourceStatus,
    tests: route.testStatus,
    browser: route.browserStatus,
    production: route.productionStatus,
    files: route.registrations.map((entry) => `${entry.source}:${entry.line}`).join("; "),
  }));
  return [
    "# Xenios Site System of Record",
    "",
    `Generated from source commit: \`${snapshot.source.sha}\` (${snapshot.generatedAt})`,
    "",
    `Source tree: \`${snapshot.source.tree}\` on \`${snapshot.source.branch}\``,
    "",
    `Recorded production: \`${snapshot.production.sha}\` / \`${snapshot.production.deployId}\` (${snapshot.production.verificationStatus})`,
    "",
    "> Source, test, browser, and production status are independent evidence axes. A mounted route is never treated as deployment proof.",
    "",
    "## Important capabilities",
    "",
    markdownTable(capabilityRows, [
      { key: "capability", label: "Capability" },
      { key: "persona", label: "Persona" },
      { key: "route", label: "Route" },
      { key: "source", label: "Source" },
      { key: "tests", label: "Tests" },
      { key: "browser", label: "Browser" },
      { key: "production", label: "Production" },
      { key: "owner", label: "Owner task" },
      { key: "next", label: "Next exact action" },
    ]),
    "",
    "## Site route inventory",
    "",
    markdownTable(routeRows, [
      { key: "route", label: "Route" },
      { key: "persona", label: "Persona" },
      { key: "domain", label: "Domain" },
      { key: "source", label: "Source" },
      { key: "tests", label: "Tests" },
      { key: "browser", label: "Browser" },
      { key: "production", label: "Production" },
      { key: "files", label: "Registration evidence" },
    ]),
    "",
    "## Status vocabulary",
    "",
    ...snapshot.statusVocabulary.map((status) => `- \`${status}\``),
    "",
    "## Invariants",
    "",
    ...snapshot.invariants.map((invariant) => `- ${invariant}`),
    "",
  ].join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(snapshot) {
  return [
    ["path", "persona", "domain", "source_status", "test_status", "browser_status", "production_status", "capabilities", "registrations"],
    ...snapshot.routes.map((route) => [
      route.path,
      route.persona,
      route.domain,
      route.sourceStatus,
      route.testStatus,
      route.browserStatus,
      route.productionStatus,
      route.capabilities.join(" | "),
      route.registrations.map((entry) => `${entry.source}:${entry.line}`).join(" | "),
    ]),
  ].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function renderArtifacts(snapshot) {
  return {
    [OUTPUT_PATHS.json]: `${JSON.stringify(snapshot, null, 2)}\n`,
    [OUTPUT_PATHS.markdown]: `${toMarkdown(snapshot).trimEnd()}\n`,
    [OUTPUT_PATHS.csv]: toCsv(snapshot),
  };
}

export async function artifactMismatches(root, artifacts) {
  const mismatches = [];
  for (const [path, expected] of Object.entries(artifacts)) {
    try {
      const actual = await readFile(resolve(root, path), "utf8");
      if (actual !== expected) mismatches.push(`${path}: stale`);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        mismatches.push(`${path}: missing`);
      } else {
        throw error;
      }
    }
  }
  return mismatches;
}

async function assertSafeOutput(root, path) {
  const absoluteRoot = await realpath(root);
  const target = resolve(root, path);
  const parent = await realpath(dirname(target));
  const prefix = absoluteRoot.endsWith(sep) ? absoluteRoot : `${absoluteRoot}${sep}`;
  if (!parent.startsWith(prefix)) throw new Error(`Output escapes repository root: ${path}`);
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) throw new Error(`Refusing to overwrite symbolic link: ${path}`);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
}

async function writeArtifactsAtomically(root, artifacts) {
  const entries = Object.entries(artifacts);
  const token = `${process.pid}-${Date.now()}`;
  const prepared = [];
  for (const [path, content] of entries) {
    const target = resolve(root, path);
    await mkdir(dirname(target), { recursive: true });
    await assertSafeOutput(root, path);
    const temporary = `${target}.tmp-${token}`;
    const backup = `${target}.bak-${token}`;
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    prepared.push({ path, target, temporary, backup, backedUp: false, installed: false });
  }
  try {
    for (const entry of prepared) {
      try {
        await rename(entry.target, entry.backup);
        entry.backedUp = true;
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
      }
    }
    for (const entry of prepared) {
      await rename(entry.temporary, entry.target);
      entry.installed = true;
    }
  } catch (error) {
    for (const entry of [...prepared].reverse()) {
      if (entry.installed) await rm(entry.target, { force: true });
      if (entry.backedUp) await rename(entry.backup, entry.target).catch(() => undefined);
      await rm(entry.temporary, { force: true });
    }
    throw error;
  }
  for (const entry of prepared) if (entry.backedUp) await rm(entry.backup, { force: true });
}

export async function writeSnapshot(root = DEFAULT_ROOT) {
  const snapshot = await buildSnapshot(root);
  const artifacts = renderArtifacts(snapshot);
  await writeArtifactsAtomically(resolve(root), artifacts);
  return { snapshot, artifacts };
}

function cliRoot() {
  const index = process.argv.indexOf("--root");
  return index >= 0 && process.argv[index + 1] ? resolve(process.argv[index + 1]) : DEFAULT_ROOT;
}

async function main() {
  const root = cliRoot();
  const checkOnly = process.argv.includes("--check");
  const snapshot = await buildSnapshot(root);
  const artifacts = renderArtifacts(snapshot);
  if (checkOnly) {
    const mismatches = await artifactMismatches(root, artifacts);
    if (mismatches.length) throw new Error(`Generated Site System of Record is not current:\n${mismatches.join("\n")}\nRun npm run site:record after committing source changes.`);
  } else {
    await writeArtifactsAtomically(root, artifacts);
  }
  console.log(JSON.stringify({
    ok: true,
    mode: checkOnly ? "check" : "write",
    sourceSha: snapshot.source.sha,
    productionSha: snapshot.production.sha,
    routes: snapshot.routes.length,
    capabilities: snapshot.capabilities.length,
    outputs: Object.values(OUTPUT_PATHS).map((path) => normalizePath(relative(root, resolve(root, path)))),
  }));
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
