import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  OwnershipDocument,
  OwnershipRule,
  ValidationIssue,
} from "./verify-release-manifest.ts";
import {
  ownersForFile,
  parseOwnershipDocument,
  trustedOwnershipPolicy,
  trustedReleaseIdentityFromEnvironment,
} from "./verify-release-manifest.ts";

type ProductionCandidate = {
  pullRequest?: number;
  lane?: string;
  headSha?: string;
  baseSha?: string;
  sourceBaseSha?: string;
  integrationBaseSha?: string;
  currentMainMergeTree?: string;
  state: string;
  reason?: string;
  prohibitedPredecessor?: string;
  requiredBaseSha?: string;
  scope?: string;
};

type ProductionEvidence = {
  id: string;
  kind: string;
  observedSha: string;
  checkedAt: string;
  detail: string;
};

type AvailableDataPosture = {
  availability: "available";
  fabricatedDataCount: number;
  seededProductCount: number;
  seededPriceCount: number;
  seededInventoryCount: number;
  seededOrderCount: number;
  careEnabled: boolean;
  statement: string;
};

type UnavailableDataPosture = {
  availability: "unavailable";
  fabricatedDataCount: null;
  seededProductCount: null;
  seededPriceCount: null;
  seededInventoryCount: null;
  seededOrderCount: null;
  careEnabled: null;
  statement: string;
};

export type ProductionState = {
  schemaVersion: number;
  identitySemantics: "TRUSTED_RELEASE_BASELINE";
  generatedAt: string;
  production: {
    gitSha: string;
    renderWorkspaceId?: string;
    renderServiceId?: string;
    renderDeploymentId: string;
    status: string;
    verifiedAt?: string;
    branch: string;
    autoDeploy?: boolean;
    publicOrigin: string;
  };
  releaseCandidates: ProductionCandidate[];
  knownHighFindings?: Array<{
    id: string;
    severity: string;
    state: string;
    summary: string;
    evidence: string[];
    smallestCorrection: string;
  }>;
  dataPosture?: AvailableDataPosture | UnavailableDataPosture;
  evidence?: ProductionEvidence[];
  externalInputsDocument?: string;
  productionCounts?: {
    productControlRows?: number;
    productControlStorageObjects?: number;
    [key: string]: unknown;
  };
  securityPosture?: {
    careEnabled?: boolean;
    [key: string]: unknown;
  };
  knownRisks?: Array<{
    id: string;
    state: string;
    summary: string;
  }>;
  lastSuccessfulValidation?: {
    kind: string;
    release: string;
    sourceSha: string;
    deployedSha: string;
    renderDeploymentId: string;
  };
};

export type ReleaseGraph = {
  schemaVersion: number;
  identitySemantics: "TRUSTED_RELEASE_BASELINE";
  generatedAt: string;
  productionSha: string;
  nodes: Array<{
    id: string;
    type: string;
    owner: string;
    state: string;
    sha: string | null;
    pullRequest?: number;
    label: string;
  }>;
  edges: Array<{ from: string; to: string; relation: string }>;
};

export type FileOwnership = OwnershipDocument;

export type ProductionValidationOptions = {
  now?: Date;
  maxEvidenceAgeMs?: number;
  trustedReleaseBaseSha?: string;
  baselineAncestorOfTrustedBase?: boolean;
  migrationBaselineSha?: string;
  expectedProductionBranch?: string;
  repoFiles?: string[];
};

export type ObservedDeployment = {
  baselineSha: string;
  acceptedCandidateSha: string;
  observedMainSha: string;
  observedRenderSha: string;
  renderDeploymentId: string;
  expectedObservedTreeSha: string;
};

export type ObservedDeploymentBinding = {
  baselineExists: boolean;
  candidateExists: boolean;
  observedExists: boolean;
  resolvedBaselineSha?: string;
  resolvedCandidateSha?: string;
  resolvedObservedSha?: string;
  resolvedObservedTreeSha?: string;
  checkoutHeadSha?: string;
  baselineAncestorOfObserved: boolean;
  candidateAncestorOfObserved: boolean;
  scopedFilesMatch: boolean;
  runtimeEvidencePassed: boolean;
  routeEvidencePassed: boolean;
  healthStatus: number;
};

export type CurrentOwnershipSnapshotResult = {
  ownership: FileOwnership | null;
  issues: ValidationIssue[];
};

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RENDER_DEPLOYMENT_PATTERN = /^dep-[a-z0-9]+$/;
const DEFAULT_MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

function parsedDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function loadCurrentOwnershipSnapshot(
  root: string,
  readSnapshot: (path: string) => string = (path) => readFileSync(path, "utf8"),
): CurrentOwnershipSnapshotResult {
  let raw: string;
  try {
    raw = readSnapshot(resolve(root, "docs/coordination/FILE_OWNERSHIP.json"));
  } catch {
    return {
      ownership: null,
      issues: [{
        code: "CURRENT_OWNERSHIP_SNAPSHOT_INVALID",
        message: "The current FILE_OWNERSHIP snapshot is missing or invalid JSON.",
      }],
    };
  }
  const parsed = parseOwnershipDocument(raw);
  if (!parsed.document || parsed.issues.length > 0) {
    return {
      ownership: null,
      issues: [{
        code: "CURRENT_OWNERSHIP_SNAPSHOT_INVALID",
        message: "The current FILE_OWNERSHIP snapshot does not match the complete canonical structure.",
      }],
    };
  }
  return { ownership: parsed.document, issues: [] };
}

function findGraphCycles(graph: ReleaseGraph): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) adjacency.get(edge.from)?.push(edge.to);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[][] = [];
  const visit = (id: string, stack: string[]): void => {
    if (visiting.has(id)) {
      cycles.push([...stack.slice(stack.indexOf(id)), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) visit(next, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of adjacency.keys()) visit(id, []);
  return cycles;
}

export function validateFileOwnership(
  ownership: FileOwnership,
  repoFiles: string[] = [],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (ownership.schemaVersion !== 1) {
    issues.push({ code: "OWNERSHIP_SCHEMA_VERSION", message: "FILE_OWNERSHIP schemaVersion must equal 1." });
  }
  if (!SHA_PATTERN.test(ownership.productionBaseSha ?? "")) {
    issues.push({ code: "OWNERSHIP_BASE_SHA", message: "FILE_OWNERSHIP productionBaseSha is invalid." });
  }
  const ruleIds = new Set<string>();
  for (const rule of ownership.rules ?? []) {
    if (ruleIds.has(rule.id)) {
      issues.push({ code: "DUPLICATE_OWNERSHIP_RULE", message: `Duplicate ownership rule ${rule.id}.` });
    }
    ruleIds.add(rule.id);
    if (!rule.owner || !rule.lane || !Array.isArray(rule.patterns) || rule.patterns.length === 0) {
      issues.push({ code: "INVALID_OWNERSHIP_RULE", message: `${rule.id} requires owner, lane, and patterns.` });
    }
  }

  for (const lane of ownership.lanes ?? []) {
    if (lane.state === "REVIEW_ONLY") {
      const writeRules = ownership.rules.filter((rule) => rule.lane === lane.lane && rule.mode === "write");
      if (writeRules.length > 0) {
        issues.push({ code: "REVIEW_LANE_HAS_WRITES", message: `${lane.lane} is review-only but owns write patterns.` });
      }
    }
    if (lane.headSha !== null && !SHA_PATTERN.test(lane.headSha)) {
      issues.push({ code: "INVALID_LANE_HEAD", message: `${lane.lane} has invalid headSha.` });
    }
  }

  for (const file of repoFiles) {
    const owners = ownersForFile(file, ownership.rules ?? []);
    if (owners.length > 1) {
      issues.push({
        code: "OWNERSHIP_CONFLICT",
        message: `${file} matches multiple writers: ${owners.map((owner) => owner.id).join(", ")}.`,
      });
    }
  }
  return issues;
}

export function validateProductionState(
  state: ProductionState,
  graph: ReleaseGraph,
  ownership: FileOwnership,
  options: ProductionValidationOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const now = options.now ?? new Date();
  const maxAge = options.maxEvidenceAgeMs ?? DEFAULT_MAX_EVIDENCE_AGE_MS;

  if (![1, 2, 3].includes(state.schemaVersion) || graph.schemaVersion !== 1) {
    issues.push({ code: "STATE_SCHEMA_VERSION", message: "Production state schemaVersion must be 1, 2, or 3 and release graph schemaVersion must be 1." });
  }
  if (
    state.identitySemantics !== "TRUSTED_RELEASE_BASELINE" ||
    graph.identitySemantics !== "TRUSTED_RELEASE_BASELINE"
  ) {
    issues.push({
      code: "PRODUCTION_IDENTITY_SEMANTICS",
      message: "Production state and release graph must describe a trusted release baseline.",
    });
  }
  if (!SHA_PATTERN.test(state.production?.gitSha ?? "")) {
    issues.push({ code: "PRODUCTION_SHA", message: "Production gitSha must be a lowercase 40-character SHA." });
  }
  if (!RENDER_DEPLOYMENT_PATTERN.test(state.production?.renderDeploymentId ?? "")) {
    issues.push({ code: "RENDER_DEPLOYMENT_ID", message: "Render deployment identity is invalid." });
  }
  if (state.production?.status !== "LIVE") {
    issues.push({ code: "PRODUCTION_NOT_LIVE", message: "Production status must be LIVE." });
  }
  const productionBranch = state.production?.branch ?? "";
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(productionBranch) ||
    productionBranch.startsWith("/") ||
    productionBranch.endsWith("/") ||
    productionBranch.includes("\\") ||
    /(^|\/)\.\.(\/|$)/.test(productionBranch)
  ) {
    issues.push({
      code: "PRODUCTION_BRANCH",
      message: "Production branch must be a non-empty, repository-safe Git branch name.",
    });
  }
  if (
    options.expectedProductionBranch !== undefined &&
    productionBranch !== options.expectedProductionBranch
  ) {
    issues.push({
      code: "PRODUCTION_BRANCH_MISMATCH",
      message: `Recorded production branch ${productionBranch || "<missing>"} does not match expected ${options.expectedProductionBranch}.`,
    });
  }
  if (
    options.trustedReleaseBaseSha &&
    state.production.gitSha !== options.trustedReleaseBaseSha &&
    options.baselineAncestorOfTrustedBase !== true
  ) {
    issues.push({
      code: "STALE_PRODUCTION_BASELINE",
      message: `Recorded baseline ${state.production.gitSha} is not the trusted release base ${options.trustedReleaseBaseSha} or its ancestor.`,
    });
  }
  if (
    graph.productionSha !== state.production.gitSha ||
    ownership.productionBaseSha !== state.production.gitSha ||
    options.migrationBaselineSha !== state.production.gitSha
  ) {
    issues.push({
      code: "BASELINE_IDENTITY_CONTRADICTION",
      message: "Trusted release baseline differs across production state, release graph, ownership policy origin, or migration DAG.",
    });
  }

  const verifiedAt = parsedDate(state.production.verifiedAt ?? state.generatedAt);
  if (!verifiedAt) {
    issues.push({ code: "PRODUCTION_VERIFIED_AT", message: "Production verifiedAt is invalid." });
  } else {
    const age = now.getTime() - verifiedAt.getTime();
    if (age > maxAge) issues.push({ code: "STALE_PRODUCTION_EVIDENCE", message: "Production verification is stale." });
    if (age < -5 * 60_000) issues.push({ code: "FUTURE_PRODUCTION_EVIDENCE", message: "Production verification is future-dated." });
  }

  const dataPosture = state.dataPosture;
  const dataPostureContradiction =
    dataPosture === undefined ||
    (dataPosture.availability === "available"
      ? dataPosture.fabricatedDataCount !== 0 ||
        dataPosture.seededProductCount !== 0 ||
        dataPosture.seededPriceCount !== 0 ||
        dataPosture.seededInventoryCount !== 0 ||
        dataPosture.seededOrderCount !== 0 ||
        dataPosture.careEnabled !== false
      : dataPosture.availability === "unavailable"
        ? dataPosture.fabricatedDataCount !== null ||
          dataPosture.seededProductCount !== null ||
          dataPosture.seededPriceCount !== null ||
          dataPosture.seededInventoryCount !== null ||
          dataPosture.seededOrderCount !== null ||
          dataPosture.careEnabled !== null
        : true);
  if (dataPostureContradiction) {
    issues.push({
      code: "DATA_POSTURE_CONTRADICTION",
      message: "Data posture must be authoritative available zero/disabled facts or explicit unavailable/null facts; unavailable may never masquerade as zero.",
    });
  }

  if (state.evidence) {
    const evidenceIds = new Set<string>();
    for (const evidence of state.evidence) {
      if (evidenceIds.has(evidence.id)) {
        issues.push({ code: "DUPLICATE_EVIDENCE_ID", message: `Duplicate evidence id ${evidence.id}.` });
      }
      evidenceIds.add(evidence.id);
      if (evidence.observedSha !== state.production.gitSha) {
        issues.push({
          code: "EVIDENCE_SHA_CONTRADICTION",
          message: `${evidence.id} observes ${evidence.observedSha}, not production ${state.production.gitSha}.`,
        });
      }
      const checkedAt = parsedDate(evidence.checkedAt);
      if (!checkedAt || now.getTime() - checkedAt.getTime() > maxAge) {
        issues.push({ code: "STALE_EVIDENCE", message: `${evidence.id} is invalid or stale.` });
      }
    }
    if (evidenceIds.size === 0) {
      issues.push({ code: "EVIDENCE_REQUIRED", message: "At least one production evidence record is required." });
    }
  } else if (
    !state.lastSuccessfulValidation ||
    state.lastSuccessfulValidation.deployedSha !== state.production.gitSha ||
    state.lastSuccessfulValidation.renderDeploymentId !== state.production.renderDeploymentId
  ) {
    issues.push({
      code: "LAST_VALIDATION_CONTRADICTION",
      message: "lastSuccessfulValidation must match the production SHA and Render deployment.",
    });
  }

  const deployed = graph.nodes.filter((node) => node.state === "AUDITED_BASELINE");
  if (
    deployed.length !== 1 ||
    deployed[0].type !== "production_baseline" ||
    deployed[0].sha !== state.production.gitSha
  ) {
    issues.push({
      code: "BASELINE_NODE_CONTRADICTION",
      message: "Release graph must contain exactly one audited production baseline node matching the state baseline.",
    });
  }

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({ code: "GRAPH_EDGE_TARGET", message: `Release edge ${edge.from} -> ${edge.to} references a missing node.` });
    }
  }
  for (const cycle of findGraphCycles(graph)) {
    issues.push({ code: "RELEASE_GRAPH_CYCLE", message: `Release graph cycle: ${cycle.join(" -> ")}` });
  }

  for (const candidate of state.releaseCandidates ?? []) {
    if (candidate.headSha && !SHA_PATTERN.test(candidate.headSha)) {
      issues.push({ code: "CANDIDATE_SHA", message: `PR #${candidate.pullRequest ?? "unassigned"} has invalid head SHA.` });
    }
    if (candidate.baseSha && !SHA_PATTERN.test(candidate.baseSha)) {
      issues.push({ code: "CANDIDATE_SHA", message: `PR #${candidate.pullRequest ?? "unassigned"} has invalid base SHA.` });
    }
    if (candidate.sourceBaseSha && !SHA_PATTERN.test(candidate.sourceBaseSha)) {
      issues.push({ code: "CANDIDATE_SHA", message: `PR #${candidate.pullRequest ?? "unassigned"} has invalid source base SHA.` });
    }
    if (candidate.integrationBaseSha && !SHA_PATTERN.test(candidate.integrationBaseSha)) {
      issues.push({ code: "CANDIDATE_SHA", message: `PR #${candidate.pullRequest ?? "unassigned"} has invalid integration base SHA.` });
    }
    if (candidate.currentMainMergeTree && !SHA_PATTERN.test(candidate.currentMainMergeTree)) {
      issues.push({ code: "CANDIDATE_SHA", message: `PR #${candidate.pullRequest ?? "unassigned"} has invalid current-main merge tree.` });
    }
    if (candidate.baseSha && candidate.baseSha !== state.production.gitSha) {
      issues.push({
        code: "STALE_CANDIDATE_BASE",
        message: `PR #${candidate.pullRequest} base ${candidate.baseSha} is not current production.`,
      });
    }
    if (candidate.requiredBaseSha && candidate.requiredBaseSha !== state.production.gitSha) {
      issues.push({
        code: "STALE_CANDIDATE_BASE",
        message: `${candidate.lane ?? "Unassigned lane"} requires stale base ${candidate.requiredBaseSha}.`,
      });
    }
    if (candidate.integrationBaseSha && candidate.integrationBaseSha !== state.production.gitSha) {
      issues.push({
        code: "STALE_CANDIDATE_BASE",
        message: `PR #${candidate.pullRequest} integration base ${candidate.integrationBaseSha} is not current production.`,
      });
    }
    if (candidate.headSha && candidate.headSha === state.production.gitSha) {
      issues.push({ code: "CANDIDATE_EQUALS_PRODUCTION", message: `PR #${candidate.pullRequest} head equals production.` });
    }
    if (candidate.prohibitedPredecessor && !SHA_PATTERN.test(candidate.prohibitedPredecessor)) {
      issues.push({
        code: "PROHIBITED_PREDECESSOR_SHA",
        message: `PR #${candidate.pullRequest ?? "unassigned"} has invalid prohibited predecessor.`,
      });
    }
    if (!candidate.pullRequest || !candidate.headSha) continue;
    const node = graph.nodes.find(
      (entry) => entry.pullRequest === candidate.pullRequest && entry.sha === candidate.headSha,
    );
    if (!node || node.state !== candidate.state) {
      issues.push({
        code: "CANDIDATE_GRAPH_CONTRADICTION",
        message: `PR #${candidate.pullRequest} does not match its release-graph node.`,
      });
    }
    if (candidate.prohibitedPredecessor) {
      const predecessor = graph.nodes.find(
        (entry) =>
          entry.pullRequest === candidate.pullRequest &&
          entry.sha === candidate.prohibitedPredecessor &&
          entry.state === "PROHIBITED",
      );
      if (!predecessor) {
        issues.push({
          code: "PROHIBITED_PREDECESSOR_GRAPH_CONTRADICTION",
          message: `PR #${candidate.pullRequest} prohibited predecessor is absent from the release graph.`,
        });
      }
    }
  }

  for (const finding of state.knownHighFindings ?? []) {
    if (finding.severity !== "HIGH" || finding.state !== "OPEN" || !finding.evidence?.length) {
      issues.push({ code: "HIGH_FINDING_INVALID", message: `${finding.id} must be OPEN HIGH with evidence.` });
    }
  }
  for (const risk of state.knownRisks ?? []) {
    if (!risk.id?.trim() || !risk.state?.trim() || !risk.summary?.trim()) {
      issues.push({ code: "KNOWN_RISK_INVALID", message: "Every known risk requires id, state, and summary." });
    }
  }

  issues.push(...validateFileOwnership(ownership, options.repoFiles ?? []));
  return issues;
}

export function validateObservedDeployment(
  state: ProductionState,
  observation: ObservedDeployment,
  binding: ObservedDeploymentBinding,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [field, sha] of [
    ["baselineSha", observation.baselineSha],
    ["acceptedCandidateSha", observation.acceptedCandidateSha],
    ["observedMainSha", observation.observedMainSha],
    ["observedRenderSha", observation.observedRenderSha],
    ["expectedObservedTreeSha", observation.expectedObservedTreeSha],
  ] as const) {
    if (!SHA_PATTERN.test(sha)) {
      issues.push({
        code: "OBSERVED_DEPLOYMENT_SHA_INVALID",
        message: `${field} must be a lowercase 40-character SHA.`,
      });
    }
  }
  if (!RENDER_DEPLOYMENT_PATTERN.test(observation.renderDeploymentId)) {
    issues.push({
      code: "OBSERVED_RENDER_DEPLOYMENT_INVALID",
      message: "Observed Render deployment identity is invalid.",
    });
  }
  if (observation.baselineSha !== state.production.gitSha) {
    issues.push({
      code: "OBSERVED_BASELINE_MISMATCH",
      message: "Observed deployment baseline does not match the checked-in trusted release baseline.",
    });
  }
  if (observation.observedMainSha !== observation.observedRenderSha) {
    issues.push({
      code: "OBSERVED_DEPLOYMENT_IDENTITY_MISMATCH",
      message: "Observed Git-branch and Render deployment identities differ.",
    });
  }
  if (binding.checkoutHeadSha !== observation.observedMainSha) {
    issues.push({
      code: "OBSERVED_CHECKOUT_MISMATCH",
      message: "The validator checkout HEAD does not equal the externally observed branch identity.",
    });
  }
  if (
    !binding.baselineExists ||
    binding.resolvedBaselineSha !== observation.baselineSha ||
    !binding.candidateExists ||
    binding.resolvedCandidateSha !== observation.acceptedCandidateSha ||
    !binding.observedExists ||
    binding.resolvedObservedSha !== observation.observedMainSha
  ) {
    issues.push({
      code: "OBSERVED_DEPLOYMENT_UNRESOLVED",
      message: "Baseline, accepted candidate, and observed deployment must resolve to their exact commits.",
    });
  }
  if (binding.resolvedObservedTreeSha !== observation.expectedObservedTreeSha) {
    issues.push({
      code: "OBSERVED_TREE_MISMATCH",
      message: "Observed deployment tree does not match the externally reviewed merge tree.",
    });
  }
  if (!binding.baselineAncestorOfObserved) {
    issues.push({
      code: "OBSERVED_BASELINE_NOT_ANCESTOR",
      message: "Observed deployment does not descend from the trusted release baseline.",
    });
  }
  if (!binding.candidateAncestorOfObserved) {
    issues.push({
      code: "OBSERVED_CANDIDATE_NOT_ANCESTOR",
      message: "Observed deployment does not contain the accepted candidate.",
    });
  }
  if (!binding.scopedFilesMatch) {
    issues.push({
      code: "OBSERVED_SCOPED_BLOB_MISMATCH",
      message: "Accepted candidate scoped files are not byte-identical in the observed deployment.",
    });
  }
  if (
    binding.healthStatus !== 200 ||
    !binding.runtimeEvidencePassed ||
    !binding.routeEvidencePassed
  ) {
    issues.push({
      code: "OBSERVED_RUNTIME_EVIDENCE_FAILED",
      message: "Observed deployment requires passing health, runtime, and route evidence.",
    });
  }
  return issues;
}

export function productionAcceptanceMessage(
  state: ProductionState,
  observation: ObservedDeployment | null = null,
): string {
  if (observation) {
    return `Observed deployment accepted: ${observation.observedMainSha} / ${observation.renderDeploymentId} (baseline ${state.production.gitSha}).`;
  }
  return `Trusted release baseline accepted: ${state.production.gitSha} / ${state.production.renderDeploymentId}.`;
}

function isCli(): boolean {
  return Boolean(
    process.argv[1] &&
      resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(),
  );
}

function resolveCommit(root: string, sha: string): string | null {
  if (!SHA_PATTERN.test(sha)) return null;
  try {
    return execFileSync("git", ["rev-parse", "--verify", `${sha}^{commit}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function isAncestor(root: string, ancestor: string, descendant: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function candidateScopedFilesMatch(
  root: string,
  baselineSha: string,
  candidateSha: string,
  observedSha: string,
): boolean {
  try {
    const files = execFileSync(
      "git",
      ["diff", "--name-only", "--no-renames", "-z", `${baselineSha}..${candidateSha}`, "--"],
      { cwd: root, encoding: "buffer" },
    )
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    if (files.length === 0) return false;
    execFileSync("git", ["diff", "--quiet", candidateSha, observedSha, "--", ...files], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

if (isCli()) {
  const root = process.cwd();
  const state = JSON.parse(
    readFileSync(resolve(root, "docs/coordination/CURRENT_PRODUCTION_STATE.json"), "utf8"),
  ) as ProductionState;
  const graph = JSON.parse(
    readFileSync(resolve(root, "docs/coordination/ACTIVE_RELEASE_GRAPH.json"), "utf8"),
  ) as ReleaseGraph;
  const migrationDag = JSON.parse(
    readFileSync(resolve(root, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
  ) as { productionSha?: string };
  const trusted = trustedReleaseIdentityFromEnvironment();
  const authorizationPolicy = trustedOwnershipPolicy(
    root,
    trusted.identity?.baseSha ?? "",
    trusted.identity?.headSha ?? "",
  );
  const currentOwnership = loadCurrentOwnershipSnapshot(root);
  const ownership = currentOwnership.ownership ?? {
    schemaVersion: 0,
    generatedAt: "",
    productionBaseSha: "",
    lanes: [],
    rules: [],
    invariants: [],
  };
  const repoFiles = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
  const issues = [
    ...trusted.issues,
    ...authorizationPolicy.issues,
    ...currentOwnership.issues,
    ...validateProductionState(state, graph, ownership, {
      trustedReleaseBaseSha: trusted.identity?.baseSha,
      baselineAncestorOfTrustedBase:
        Boolean(trusted.identity) &&
        state.production.gitSha !== trusted.identity?.baseSha &&
        isAncestor(root, state.production.gitSha, trusted.identity?.baseSha ?? ""),
      migrationBaselineSha: migrationDag.productionSha,
      expectedProductionBranch: process.env.XENIOS_EXPECTED_PRODUCTION_BRANCH,
      repoFiles,
    }),
  ];
  let observedAcceptance: ObservedDeployment | null = null;
  // XENIOS_OBSERVED_MAIN_SHA is retained as a compatibility name for the
  // previously main-only post-deploy interface. It now means the exact SHA at
  // the externally observed configured production branch.
  const observedMainSha =
    process.env.XENIOS_OBSERVED_BRANCH_SHA ?? process.env.XENIOS_OBSERVED_MAIN_SHA;
  const observedRenderSha = process.env.XENIOS_OBSERVED_RENDER_SHA;
  const observedRenderDeploymentId = process.env.XENIOS_OBSERVED_RENDER_DEPLOYMENT_ID;
  const acceptedCandidateSha = process.env.XENIOS_ACCEPTED_CANDIDATE_SHA;
  const expectedObservedTreeSha = process.env.XENIOS_EXPECTED_OBSERVED_TREE_SHA;
  const observedHealthStatus = process.env.XENIOS_OBSERVED_HEALTH_STATUS;
  const observedRuntimeEvidence = process.env.XENIOS_OBSERVED_RUNTIME_EVIDENCE;
  const observedRouteEvidence = process.env.XENIOS_OBSERVED_ROUTE_EVIDENCE;
  const observedInputs = [
    observedMainSha,
    observedRenderSha,
    observedRenderDeploymentId,
    acceptedCandidateSha,
    expectedObservedTreeSha,
    observedHealthStatus,
    observedRuntimeEvidence,
    observedRouteEvidence,
  ];
  if (observedInputs.some((value) => value !== undefined)) {
    if (observedInputs.some((value) => value === undefined)) {
      issues.push({
        code: "OBSERVED_DEPLOYMENT_INPUTS_REQUIRED",
        message: "Post-deploy validation requires observed branch SHA, Render SHA, deployment id, and accepted candidate SHA.",
      });
    } else {
      const baselineSha = state.production.gitSha;
      const candidateSha = acceptedCandidateSha ?? "";
      const deployedSha = observedMainSha ?? "";
      const resolvedBaselineSha = resolveCommit(root, baselineSha);
      const resolvedCandidateSha = resolveCommit(root, candidateSha);
      const resolvedObservedSha = resolveCommit(root, deployedSha);
      const resolvedObservedTreeSha = resolvedObservedSha
        ? execFileSync("git", ["rev-parse", `${deployedSha}^{tree}`], {
            cwd: root,
            encoding: "utf8",
          }).trim()
        : undefined;
      const checkoutHeadSha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim();
      observedAcceptance = {
        baselineSha,
        acceptedCandidateSha: candidateSha,
        observedMainSha: deployedSha,
        observedRenderSha: observedRenderSha ?? "",
        renderDeploymentId: observedRenderDeploymentId ?? "",
        expectedObservedTreeSha: expectedObservedTreeSha ?? "",
      };
      issues.push(...validateObservedDeployment(
        state,
        observedAcceptance,
        {
          baselineExists: resolvedBaselineSha === baselineSha,
          candidateExists: resolvedCandidateSha === candidateSha,
          observedExists: resolvedObservedSha === deployedSha,
          resolvedBaselineSha: resolvedBaselineSha ?? undefined,
          resolvedCandidateSha: resolvedCandidateSha ?? undefined,
          resolvedObservedSha: resolvedObservedSha ?? undefined,
          resolvedObservedTreeSha,
          checkoutHeadSha,
          baselineAncestorOfObserved: isAncestor(root, baselineSha, deployedSha),
          candidateAncestorOfObserved: isAncestor(root, candidateSha, deployedSha),
          scopedFilesMatch: candidateScopedFilesMatch(root, baselineSha, candidateSha, deployedSha),
          runtimeEvidencePassed: observedRuntimeEvidence === "PASS",
          routeEvidencePassed: observedRouteEvidence === "PASS",
          healthStatus: Number(observedHealthStatus),
        },
      ));
    }
  }
  if (issues.length > 0) {
    for (const issue of issues) console.error(`${issue.code}: ${issue.message}`);
    process.exitCode = 1;
  } else {
    console.log(productionAcceptanceMessage(state, observedAcceptance));
  }
}
