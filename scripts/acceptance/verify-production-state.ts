import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { OwnershipRule, ValidationIssue } from "./verify-release-manifest.ts";
import {
  ownersForFile,
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

export type ProductionState = {
  schemaVersion: number;
  generatedAt: string;
  production: {
    gitSha: string;
    renderDeploymentId: string;
    status: string;
    verifiedAt?: string;
    branch: string;
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
  dataPosture?: {
    fabricatedDataCount: number;
    seededProductCount: number;
    seededPriceCount: number;
    seededInventoryCount: number;
    seededOrderCount: number;
    careEnabled: boolean;
    statement: string;
  };
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

export type FileOwnership = {
  schemaVersion: number;
  generatedAt: string;
  productionBaseSha: string;
  lanes: Array<{
    owner: string;
    lane: string;
    state: string;
    activeUnit: string;
    branch: string | null;
    headSha: string | null;
  }>;
  rules: OwnershipRule[];
  invariants: string[];
};

export type ProductionValidationOptions = {
  now?: Date;
  maxEvidenceAgeMs?: number;
  expectedProductionSha?: string;
  repoFiles?: string[];
};

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RENDER_DEPLOYMENT_PATTERN = /^dep-[a-z0-9]+$/;
const DEFAULT_MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

function parsedDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
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

  if (![1, 2].includes(state.schemaVersion) || graph.schemaVersion !== 1) {
    issues.push({ code: "STATE_SCHEMA_VERSION", message: "Production state schemaVersion must be 1 or 2 and release graph schemaVersion must be 1." });
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
  if (state.production?.branch !== "main") {
    issues.push({ code: "PRODUCTION_BRANCH", message: "Production branch must be main." });
  }
  if (options.expectedProductionSha && state.production.gitSha !== options.expectedProductionSha) {
    issues.push({
      code: "STALE_PRODUCTION_SHA",
      message: `Recorded production ${state.production.gitSha} does not match expected ${options.expectedProductionSha}.`,
    });
  }
  if (graph.productionSha !== state.production.gitSha || ownership.productionBaseSha !== state.production.gitSha) {
    issues.push({
      code: "PRODUCTION_IDENTITY_CONTRADICTION",
      message: "Production SHA differs across CURRENT_PRODUCTION_STATE, ACTIVE_RELEASE_GRAPH, and FILE_OWNERSHIP.",
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

  const v1DataContradiction =
    state.dataPosture !== undefined &&
    (state.dataPosture.fabricatedDataCount !== 0 ||
      state.dataPosture.seededProductCount !== 0 ||
      state.dataPosture.seededPriceCount !== 0 ||
      state.dataPosture.seededInventoryCount !== 0 ||
      state.dataPosture.seededOrderCount !== 0 ||
      state.dataPosture.careEnabled !== false);
  const v2DataContradiction =
    state.dataPosture === undefined &&
    (state.productionCounts?.productControlRows !== 0 ||
      state.productionCounts?.productControlStorageObjects !== 0 ||
      state.securityPosture?.careEnabled !== false);
  if (v1DataContradiction || v2DataContradiction) {
    issues.push({
      code: "DATA_POSTURE_CONTRADICTION",
      message: "Control-plane snapshot must preserve zero fabricated commerce data and disabled Care.",
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

  const deployed = graph.nodes.filter((node) => node.state === "DEPLOYED");
  if (
    deployed.length !== 1 ||
    deployed[0].type !== "production" ||
    deployed[0].sha !== state.production.gitSha
  ) {
    issues.push({
      code: "DEPLOYED_NODE_CONTRADICTION",
      message: "Release graph must contain exactly one deployed production node matching current production.",
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

function isCli(): boolean {
  return Boolean(
    process.argv[1] &&
      resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(),
  );
}

if (isCli()) {
  const root = process.cwd();
  const state = JSON.parse(
    readFileSync(resolve(root, "docs/coordination/CURRENT_PRODUCTION_STATE.json"), "utf8"),
  ) as ProductionState;
  const graph = JSON.parse(
    readFileSync(resolve(root, "docs/coordination/ACTIVE_RELEASE_GRAPH.json"), "utf8"),
  ) as ReleaseGraph;
  const ownership = JSON.parse(
    readFileSync(resolve(root, "docs/coordination/FILE_OWNERSHIP.json"), "utf8"),
  ) as FileOwnership;
  const trusted = trustedReleaseIdentityFromEnvironment();
  const repoFiles = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
  const issues = [...trusted.issues, ...validateProductionState(state, graph, ownership, {
    expectedProductionSha: trusted.identity?.baseSha,
    repoFiles,
  })];
  if (issues.length > 0) {
    for (const issue of issues) console.error(`${issue.code}: ${issue.message}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Production state accepted: ${state.production.gitSha} / ${state.production.renderDeploymentId}.`,
    );
  }
}
