import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

export type ValidationIssue = {
  code: string;
  message: string;
};

export type OwnershipRule = {
  id: string;
  owner: string;
  lane: string;
  mode: string;
  state: string;
  patterns: string[];
};

export type OwnershipLane = {
  owner: string;
  lane: string;
  state: string;
  activeUnit: string;
  branch: string | null;
  headSha: string | null;
};

export type OwnershipDocument = {
  schemaVersion: number;
  generatedAt: string;
  productionBaseSha: string;
  lanes: OwnershipLane[];
  rules: OwnershipRule[];
  invariants: string[];
};

export type ReleaseManifestValidationOptions = {
  now?: Date;
  maxEvidenceAgeMs?: number;
  expectedProductionSha?: string;
  expectedHeadSha?: string;
  ownershipRules?: OwnershipRule[];
  gitBinding?: {
    baseExists: boolean;
    headExists: boolean;
    headSha: string;
    resolvedBaseSha?: string;
    resolvedHeadSha?: string;
    files: string[];
  };
};

export type TrustedReleaseIdentity = {
  baseSha: string;
  headSha: string;
  source: "github_pull_request" | "explicit_environment";
};

export type TrustedReleaseIdentityResult = {
  identity: TrustedReleaseIdentity | null;
  issues: ValidationIssue[];
};

export type TrustedOwnershipPolicy = {
  document: Record<string, unknown>;
  rules: OwnershipRule[];
  sha256: string;
  source: "trusted_base_commit" | "externally_pinned_snapshot";
};

export type TrustedOwnershipPolicyResult = {
  policy: TrustedOwnershipPolicy | null;
  issues: ValidationIssue[];
};

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ENV_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const ROUTE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const DEFAULT_MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
type SchemaError = { instancePath: string; message?: string };
type CompiledSchema = ((input: unknown) => boolean) & { errors?: SchemaError[] | null };
const Ajv2020 = Ajv2020Module as unknown as new (options: object) => {
  compile: (schema: object) => CompiledSchema;
};
const addFormats = addFormatsModule as unknown as (validator: object) => void;
const CANONICAL_SCHEMA = JSON.parse(
  readFileSync(
    resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "../../docs/coordination/release-manifest.schema.json",
    ),
    "utf8",
  ),
) as object;
const schemaValidator = new Ajv2020({ allErrors: true, strict: true });
addFormats(schemaValidator);
const validateCanonicalSchema = schemaValidator.compile(CANONICAL_SCHEMA);

export function trustedReleaseIdentityFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
  readEvent: (path: string) => unknown = (path) => JSON.parse(readFileSync(path, "utf8")) as unknown,
): TrustedReleaseIdentityResult {
  const eventPath = environment.GITHUB_EVENT_PATH;
  if (eventPath) {
    try {
      const event = objectValue(readEvent(eventPath));
      const pullRequest = objectValue(event?.pull_request);
      if (pullRequest) {
        const baseSha = objectValue(pullRequest.base)?.sha;
        const headSha = objectValue(pullRequest.head)?.sha;
        if (
          typeof baseSha === "string" &&
          SHA_PATTERN.test(baseSha) &&
          typeof headSha === "string" &&
          SHA_PATTERN.test(headSha)
        ) {
          return {
            identity: { baseSha, headSha, source: "github_pull_request" },
            issues: [],
          };
        }
        return {
          identity: null,
          issues: [{
            code: "TRUSTED_GITHUB_IDENTITY_INVALID",
            message: "GitHub pull_request event must contain valid base.sha and head.sha.",
          }],
        };
      }
    } catch {
      return {
        identity: null,
        issues: [{
          code: "TRUSTED_GITHUB_EVENT_INVALID",
          message: "GITHUB_EVENT_PATH could not be parsed as a trusted event.",
        }],
      };
    }
  }

  const baseSha = environment.XENIOS_EXPECTED_PRODUCTION_SHA;
  const headSha = environment.XENIOS_EXPECTED_HEAD_SHA;
  if (
    typeof baseSha === "string" &&
    SHA_PATTERN.test(baseSha) &&
    typeof headSha === "string" &&
    SHA_PATTERN.test(headSha)
  ) {
    return {
      identity: { baseSha, headSha, source: "explicit_environment" },
      issues: [],
    };
  }
  return {
    identity: null,
    issues: [{
      code: "TRUSTED_RELEASE_IDENTITY_REQUIRED",
      message: "Outside pull-request CI, XENIOS_EXPECTED_PRODUCTION_SHA and XENIOS_EXPECTED_HEAD_SHA are required.",
    }],
  };
}

const OWNERSHIP_TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "productionBaseSha",
  "lanes",
  "rules",
  "invariants",
]);
const OWNERSHIP_LANE_KEYS = new Set([
  "owner",
  "lane",
  "state",
  "activeUnit",
  "branch",
  "headSha",
]);
const OWNERSHIP_RULE_KEYS = new Set([
  "id",
  "owner",
  "lane",
  "mode",
  "state",
  "patterns",
]);
const OWNERSHIP_LANE_STATES = new Set([
  "REPLACEMENT_IN_PROGRESS",
  "ACTIVE",
  "FROZEN_ACCEPTED_INTEGRATION_PENDING",
  "FROZEN_PROHIBITED_CHANGES_REQUIRED",
  "WAITING_FOR_WEBSITE_2_ASSIGNMENT",
  "REVIEW_ONLY",
]);
const OWNERSHIP_RULE_STATES = new Set(["active", "reserved", "deployed", "frozen"]);

function exactKeys(record: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(record).every((key) => allowed.has(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeOwnershipPattern(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes("\\") &&
    !value.startsWith("/") &&
    !value.split("/").includes("..") &&
    value !== "*" &&
    value !== "**" &&
    value !== "**/*"
  );
}

export function parseOwnershipDocument(raw: Buffer | string): {
  document: OwnershipDocument | null;
  rules: OwnershipRule[];
  issues: ValidationIssue[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8")) as unknown;
  } catch {
    return {
      document: null,
      rules: [],
      issues: [{
        code: "TRUSTED_OWNERSHIP_INVALID",
        message: "Trusted ownership policy is not valid JSON.",
      }],
    };
  }
  const document = objectValue(parsed);
  if (
    !document ||
    !exactKeys(document, OWNERSHIP_TOP_LEVEL_KEYS) ||
    document.schemaVersion !== 1 ||
    !nonEmptyString(document.generatedAt) ||
    !Number.isFinite(new Date(document.generatedAt).getTime()) ||
    typeof document.productionBaseSha !== "string" ||
    !SHA_PATTERN.test(document.productionBaseSha) ||
    !Array.isArray(document.lanes) ||
    document.lanes.length === 0 ||
    !Array.isArray(document.rules) ||
    document.rules.length === 0 ||
    !Array.isArray(document.invariants) ||
    document.invariants.length === 0 ||
    !document.invariants.every(nonEmptyString)
  ) {
    return {
      document: null,
      rules: [],
      issues: [{
        code: "TRUSTED_OWNERSHIP_INVALID",
        message: "Ownership policy has an invalid or incomplete top-level structure.",
      }],
    };
  }

  const parsedLanes: OwnershipLane[] = [];
  for (const laneValue of document.lanes) {
    const lane = objectValue(laneValue);
    if (
      !lane ||
      !exactKeys(lane, OWNERSHIP_LANE_KEYS) ||
      !nonEmptyString(lane.owner) ||
      !nonEmptyString(lane.lane) ||
      typeof lane.state !== "string" ||
      !OWNERSHIP_LANE_STATES.has(lane.state) ||
      !nonEmptyString(lane.activeUnit) ||
      !(lane.branch === null || nonEmptyString(lane.branch)) ||
      !(lane.headSha === null || (typeof lane.headSha === "string" && SHA_PATTERN.test(lane.headSha)))
    ) {
      return {
        document: null,
        rules: [],
        issues: [{
          code: "TRUSTED_OWNERSHIP_INVALID",
          message: "Every ownership lane must match the canonical lane structure.",
        }],
      };
    }
    parsedLanes.push({
      owner: lane.owner,
      lane: lane.lane,
      state: lane.state,
      activeUnit: lane.activeUnit,
      branch: lane.branch,
      headSha: lane.headSha,
    });
  }

  const rules = document?.rules;
  const parsedRules: OwnershipRule[] = [];
  for (const ruleValue of rules) {
    const rule = objectValue(ruleValue);
    const patterns = rule ? stringArray(rule.patterns) : null;
    if (
      !rule ||
      !exactKeys(rule, OWNERSHIP_RULE_KEYS) ||
      !nonEmptyString(rule.id) ||
      !nonEmptyString(rule.owner) ||
      !nonEmptyString(rule.lane) ||
      rule.mode !== "write" ||
      typeof rule.state !== "string" ||
      !OWNERSHIP_RULE_STATES.has(rule.state) ||
      !patterns ||
      patterns.length === 0 ||
      !patterns.every(safeOwnershipPattern)
    ) {
      return {
        document: null,
        rules: [],
        issues: [{
          code: "TRUSTED_OWNERSHIP_INVALID",
          message: "Every ownership rule must match the canonical rule structure and use safe patterns.",
        }],
      };
    }
    parsedRules.push({
      id: rule.id,
      owner: rule.owner,
      lane: rule.lane,
      mode: rule.mode,
      state: rule.state,
      patterns,
    });
  }
  return {
    document: {
      schemaVersion: document.schemaVersion,
      generatedAt: document.generatedAt,
      productionBaseSha: document.productionBaseSha,
      lanes: parsedLanes,
      rules: parsedRules,
      invariants: document.invariants,
    },
    rules: parsedRules,
    issues: [],
  };
}

export function trustedOwnershipPolicy(
  root: string,
  baseSha: string,
  headSha: string,
  environment: Record<string, string | undefined> = process.env,
  readBaseBlob: (root: string, sha: string) => Buffer | null = (repositoryRoot, sha) => {
    try {
      return execFileSync(
        "git",
        ["show", `${sha}:docs/coordination/FILE_OWNERSHIP.json`],
        { cwd: repositoryRoot, encoding: "buffer", stdio: ["ignore", "pipe", "ignore"] },
      );
    } catch {
      return null;
    }
  },
  readPinnedSnapshot: (root: string, sha: string) => Buffer = (repositoryRoot, sha) =>
    execFileSync(
      "git",
      ["show", `${sha}:docs/coordination/FILE_OWNERSHIP.json`],
      { cwd: repositoryRoot, encoding: "buffer", stdio: ["ignore", "pipe", "ignore"] },
    ),
): TrustedOwnershipPolicyResult {
  if (!SHA_PATTERN.test(baseSha) || !SHA_PATTERN.test(headSha)) {
    return {
      policy: null,
      issues: [{
        code: "TRUSTED_OWNERSHIP_BASE_INVALID",
        message: "Trusted ownership policy requires valid external base and head SHAs.",
      }],
    };
  }

  const expectedDigest = environment.XENIOS_EXPECTED_OWNERSHIP_SHA256;
  if (expectedDigest !== undefined && !SHA256_PATTERN.test(expectedDigest)) {
    return {
      policy: null,
      issues: [{
        code: "TRUSTED_OWNERSHIP_DIGEST_INVALID",
        message: "XENIOS_EXPECTED_OWNERSHIP_SHA256 must be a lowercase SHA-256 digest.",
      }],
    };
  }

  const baseBlob = readBaseBlob(root, baseSha);
  let raw: Buffer;
  let source: TrustedOwnershipPolicy["source"];
  if (baseBlob) {
    raw = baseBlob;
    source = "trusted_base_commit";
  } else {
    if (!expectedDigest) {
      return {
        policy: null,
        issues: [{
          code: "TRUSTED_OWNERSHIP_REQUIRED",
          message: "Trusted base has no ownership policy; an externally pinned ownership SHA-256 is required.",
        }],
      };
    }
    try {
      raw = readPinnedSnapshot(root, headSha);
    } catch {
      return {
        policy: null,
        issues: [{
          code: "TRUSTED_OWNERSHIP_UNAVAILABLE",
          message: "Externally pinned ownership snapshot could not be read.",
        }],
      };
    }
    source = "externally_pinned_snapshot";
  }

  const actualDigest = createHash("sha256").update(raw).digest("hex");
  if (expectedDigest && actualDigest !== expectedDigest) {
    return {
      policy: null,
      issues: [{
        code: "TRUSTED_OWNERSHIP_DIGEST_MISMATCH",
        message: `Trusted ownership SHA-256 ${actualDigest} does not match expected ${expectedDigest}.`,
      }],
    };
  }
  const parsed = parseOwnershipDocument(raw);
  if (!parsed.document || parsed.issues.length > 0) {
    return { policy: null, issues: parsed.issues };
  }
  return {
    policy: {
      document: parsed.document,
      rules: parsed.rules,
      sha256: actualDigest,
      source,
    },
    issues: [],
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((entry) => stringValue(entry) === null)) return null;
  return value as string[];
}

function validDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function duplicateValues(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

function exactSetDifference(left: string[], right: string[]): { missing: string[]; extra: string[] } {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return {
    missing: right.filter((entry) => !leftSet.has(entry)),
    extra: left.filter((entry) => !rightSet.has(entry)),
  };
}

function globToRegExp(glob: string): RegExp {
  let source = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    const next = glob[index + 1];
    if (character === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}

export function ownersForFile(file: string, rules: OwnershipRule[]): OwnershipRule[] {
  return rules.filter(
    (rule) =>
      rule.mode === "write" &&
      rule.state !== "retired" &&
      rule.patterns.some((pattern) => globToRegExp(pattern).test(file)),
  );
}

export function validateReleaseManifest(
  input: unknown,
  options: ReleaseManifestValidationOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const manifest = objectValue(input);
  if (!manifest) return [{ code: "MANIFEST_NOT_OBJECT", message: "Manifest must be a JSON object." }];
  if (!validateCanonicalSchema(input)) {
    for (const error of validateCanonicalSchema.errors ?? []) {
      issues.push({
        code: "SCHEMA_VALIDATION",
        message: `${error.instancePath || "$"} ${error.message ?? "failed canonical schema validation"}.`,
      });
    }
  }

  if (manifest.schemaVersion !== 1) {
    issues.push({ code: "SCHEMA_VERSION", message: "schemaVersion must equal 1." });
  }

  for (const field of ["releaseId", "domain", "lane", "owner"] as const) {
    if (!stringValue(manifest[field])) {
      issues.push({ code: `REQUIRED_${field.toUpperCase()}`, message: `${field} is required.` });
    }
  }

  for (const field of ["baseSha", "headSha", "currentProductionSha"] as const) {
    const value = manifest[field];
    if (typeof value !== "string" || !SHA_PATTERN.test(value)) {
      issues.push({ code: `INVALID_${field.toUpperCase()}`, message: `${field} must be a lowercase 40-character Git SHA.` });
    }
  }

  if (manifest.baseSha === manifest.headSha) {
    issues.push({ code: "UNCHANGED_HEAD", message: "headSha must differ from baseSha." });
  }

  if (
    options.expectedProductionSha &&
    manifest.currentProductionSha !== options.expectedProductionSha
  ) {
    issues.push({
      code: "STALE_PRODUCTION_SHA",
      message: `Manifest production SHA ${String(manifest.currentProductionSha)} does not match expected ${options.expectedProductionSha}.`,
    });
  }
  if (options.expectedProductionSha && manifest.baseSha !== options.expectedProductionSha) {
    issues.push({
      code: "STALE_BASE_SHA",
      message: `Manifest base SHA ${String(manifest.baseSha)} does not match expected production ${options.expectedProductionSha}.`,
    });
  }
  if (options.expectedHeadSha && manifest.headSha !== options.expectedHeadSha) {
    issues.push({
      code: "HEAD_SHA_MISMATCH",
      message: `Manifest head SHA ${String(manifest.headSha)} does not match reviewed head ${options.expectedHeadSha}.`,
    });
  }

  const now = options.now ?? new Date();
  const createdAt = validDate(manifest.createdAt);
  if (!createdAt) {
    issues.push({ code: "INVALID_CREATED_AT", message: "createdAt must be a valid ISO date-time." });
  } else if (createdAt.getTime() > now.getTime() + 5 * 60_000) {
    issues.push({ code: "FUTURE_CREATED_AT", message: "createdAt cannot be materially in the future." });
  }

  const files = stringArray(manifest.files);
  let ownershipFiles = files ?? [];
  if (!files || files.length === 0) {
    issues.push({ code: "FILES_REQUIRED", message: "files must contain at least one repository path." });
  } else {
    for (const file of files) {
      if (
        file.includes("\\") ||
        file.startsWith("/") ||
        /^[A-Za-z]:[\\/]/.test(file) ||
        /(^|\/)\.\.(\/|$)/.test(file)
      ) {
        issues.push({ code: "UNSAFE_FILE_PATH", message: `Unsafe repository path: ${file}` });
      }
    }
    for (const duplicate of duplicateValues(files)) {
      issues.push({ code: "DUPLICATE_FILE", message: `Duplicate file entry: ${duplicate}` });
    }

  }
  if (options.gitBinding) {
    if (!options.gitBinding.baseExists) {
      issues.push({ code: "BASE_COMMIT_UNRESOLVED", message: `Manifest base commit ${String(manifest.baseSha)} cannot be resolved.` });
    }
    if (!options.gitBinding.headExists) {
      issues.push({ code: "HEAD_COMMIT_UNRESOLVED", message: `Manifest head commit ${String(manifest.headSha)} cannot be resolved.` });
    }
    if (
      typeof manifest.baseSha === "string" &&
      options.gitBinding.resolvedBaseSha &&
      manifest.baseSha !== options.gitBinding.resolvedBaseSha
    ) {
      issues.push({ code: "BASE_COMMIT_MISMATCH", message: `Manifest base ${manifest.baseSha} resolves to ${options.gitBinding.resolvedBaseSha}.` });
    }
    if (
      typeof manifest.headSha === "string" &&
      options.gitBinding.resolvedHeadSha &&
      manifest.headSha !== options.gitBinding.resolvedHeadSha
    ) {
      issues.push({ code: "HEAD_COMMIT_MISMATCH", message: `Manifest head ${manifest.headSha} resolves to ${options.gitBinding.resolvedHeadSha}.` });
    }
    if (typeof manifest.headSha === "string" && manifest.headSha !== options.gitBinding.headSha) {
      issues.push({ code: "HEAD_SHA_MISMATCH", message: `Manifest head ${manifest.headSha} does not match resolved ${options.gitBinding.headSha}.` });
    }
    const exactDiffFiles = options.gitBinding.files;
    for (const file of exactDiffFiles) {
      if (
        file.includes("\\") ||
        file.startsWith("/") ||
        /^[A-Za-z]:\//.test(file) ||
        /(^|\/)\.\.(\/|$)/.test(file)
      ) {
        issues.push({ code: "GIT_DIFF_UNSAFE_PATH", message: `Git diff contains unsafe path: ${file}` });
      }
    }
    for (const duplicate of duplicateValues(exactDiffFiles)) {
      issues.push({ code: "GIT_DIFF_DUPLICATE_PATH", message: `Git diff contains duplicate path: ${duplicate}` });
    }
    if (files) {
      const difference = exactSetDifference(files, exactDiffFiles);
      for (const file of difference.missing) {
        issues.push({ code: "MANIFEST_FILE_OMITTED", message: `${file} is changed in Git but omitted from manifest.files.` });
      }
      for (const file of difference.extra) {
        issues.push({ code: "MANIFEST_FILE_EXTRA", message: `${file} is claimed in manifest.files but absent from the Git diff.` });
      }
    }
    ownershipFiles = exactDiffFiles;
  }
  if (options.ownershipRules) {
    const lane = stringValue(manifest.lane);
    for (const file of ownershipFiles) {
      const owners = ownersForFile(file, options.ownershipRules);
      if (owners.length === 0) {
        issues.push({ code: "UNOWNED_FILE", message: `${file} has no write owner.` });
      } else if (owners.length > 1) {
        issues.push({
          code: "OWNERSHIP_CONFLICT",
          message: `${file} is owned by ${owners.map((owner) => owner.id).join(", ")}.`,
        });
      } else if (lane && owners[0].lane !== lane) {
        issues.push({
          code: "WRONG_LANE_OWNER",
          message: `${file} belongs to ${owners[0].lane}, not manifest lane ${lane}.`,
        });
      }
    }
  }

  const routes = Array.isArray(manifest.routes) ? manifest.routes : null;
  if (!routes) {
    issues.push({ code: "ROUTES_ARRAY", message: "routes must be an array." });
  } else {
    const identities: string[] = [];
    for (const route of routes) {
      const record = objectValue(route);
      const method = record?.method;
      const path = record?.path;
      if (typeof method !== "string" || !ROUTE_METHODS.has(method)) {
        issues.push({ code: "INVALID_ROUTE_METHOD", message: `Invalid route method: ${String(method)}` });
      }
      if (typeof path !== "string" || !path.startsWith("/")) {
        issues.push({ code: "INVALID_ROUTE_PATH", message: `Invalid route path: ${String(path)}` });
      }
      if (typeof method === "string" && typeof path === "string") identities.push(`${method} ${path}`);
    }
    for (const duplicate of duplicateValues(identities)) {
      issues.push({ code: "DUPLICATE_MANIFEST_ROUTE", message: `Duplicate manifest route: ${duplicate}` });
    }
  }

  for (const field of ["tables", "functions", "rls", "privileges", "sharedWiring"] as const) {
    const values = stringArray(manifest[field]);
    if (!values) {
      issues.push({ code: `INVALID_${field.toUpperCase()}`, message: `${field} must be an array of non-empty strings.` });
    } else {
      for (const duplicate of duplicateValues(values)) {
        issues.push({ code: `DUPLICATE_${field.toUpperCase()}`, message: `${field} contains duplicate ${duplicate}.` });
      }
    }
  }

  const environmentNames = stringArray(manifest.environmentNames);
  if (!environmentNames) {
    issues.push({ code: "INVALID_ENVIRONMENT_NAMES", message: "environmentNames must be an array." });
  } else {
    for (const name of environmentNames) {
      if (!ENV_PATTERN.test(name)) {
        issues.push({ code: "INVALID_ENVIRONMENT_NAME", message: `Environment name is not canonical: ${name}` });
      }
    }
    for (const duplicate of duplicateValues(environmentNames)) {
      issues.push({ code: "DUPLICATE_ENVIRONMENT_NAME", message: `Duplicate environment name: ${duplicate}` });
    }
  }

  const migrations = Array.isArray(manifest.migrations) ? manifest.migrations : null;
  if (!migrations) {
    issues.push({ code: "MIGRATIONS_ARRAY", message: "migrations must be an array." });
  } else {
    for (const migration of migrations) {
      const record = objectValue(migration);
      if (!record || !stringValue(record.id) || !stringValue(record.path)) {
        issues.push({ code: "INVALID_MIGRATION", message: "Every migration requires id and path." });
        continue;
      }
      if (typeof record.checksum !== "string" || !SHA256_PATTERN.test(record.checksum)) {
        issues.push({ code: "INVALID_MIGRATION_CHECKSUM", message: `${record.id} checksum must be lowercase SHA-256.` });
      }
      if (!stringArray(record.dependsOn)) {
        issues.push({ code: "INVALID_MIGRATION_DEPENDENCIES", message: `${record.id} dependsOn must be an array.` });
      }
      if (!objectValue(record.rollback)) {
        issues.push({ code: "MIGRATION_ROLLBACK_REQUIRED", message: `${record.id} requires rollback evidence.` });
      }
    }
  }

  const tests = objectValue(manifest.tests);
  if (!tests) {
    issues.push({ code: "TESTS_REQUIRED", message: "tests evidence is required." });
  } else {
    for (const name of ["focused", "fullSuite", "typecheck", "build", "diffCheck"] as const) {
      const test = objectValue(tests[name]);
      if (!test || test.status !== "PASS" || !stringValue(test.command) || !validDate(test.checkedAt)) {
        issues.push({ code: "INVALID_TEST_EVIDENCE", message: `${name} must record PASS, command, and checkedAt.` });
      }
    }
  }

  const rollback = objectValue(manifest.rollback);
  if (
    !rollback ||
    !stringValue(rollback.strategy) ||
    !stringArray(rollback.steps)?.length ||
    !stringArray(rollback.verification)?.length
  ) {
    issues.push({ code: "ROLLBACK_REQUIRED", message: "rollback requires strategy, steps, and verification." });
  }

  const smoke = objectValue(manifest.smoke);
  if (!smoke || !stringArray(smoke.steps)?.length || !stringArray(smoke.expected)?.length) {
    issues.push({ code: "SMOKE_REQUIRED", message: "smoke requires non-empty steps and expected arrays." });
  }

  const evidence = Array.isArray(manifest.evidence) ? manifest.evidence : null;
  if (!evidence || evidence.length === 0) {
    issues.push({ code: "EVIDENCE_REQUIRED", message: "At least one evidence item is required." });
  } else {
    const maxAge = options.maxEvidenceAgeMs ?? DEFAULT_MAX_EVIDENCE_AGE_MS;
    for (const item of evidence) {
      const record = objectValue(item);
      const checkedAt = validDate(record?.checkedAt);
      if (!record || !stringValue(record.kind) || !stringValue(record.reference) || !checkedAt) {
        issues.push({ code: "INVALID_EVIDENCE", message: "Evidence requires kind, reference, and checkedAt." });
        continue;
      }
      const age = now.getTime() - checkedAt.getTime();
      if (age > maxAge) {
        issues.push({ code: "STALE_EVIDENCE", message: `Evidence ${record.reference} is older than the allowed window.` });
      }
      if (age < -5 * 60_000) {
        issues.push({ code: "FUTURE_EVIDENCE", message: `Evidence ${record.reference} is dated in the future.` });
      }
    }
  }

  return issues;
}

function isCli(): boolean {
  return Boolean(
    process.argv[1] &&
      resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(),
  );
}

function resolveGitCommit(root: string, sha: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--verify", `${sha}^{commit}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    try {
      execFileSync("git", ["fetch", "--no-tags", "--depth=1", "origin", sha], {
        cwd: root,
        stdio: "ignore",
      });
      return execFileSync("git", ["rev-parse", "--verify", `${sha}^{commit}`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return null;
    }
  }
}

if (isCli()) {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error("Usage: tsx scripts/acceptance/verify-release-manifest.ts <manifest.json>");
    process.exitCode = 2;
  } else {
    const root = process.cwd();
    const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), "utf8")) as unknown;
    const record = objectValue(manifest);
    const baseSha = typeof record?.baseSha === "string" ? record.baseSha : "";
    const headSha = typeof record?.headSha === "string" ? record.headSha : "";
    const resolvedBaseSha = SHA_PATTERN.test(baseSha) ? resolveGitCommit(root, baseSha) : null;
    const resolvedHeadSha = SHA_PATTERN.test(headSha) ? resolveGitCommit(root, headSha) : null;
    const baseExists = resolvedBaseSha === baseSha;
    const headExists = resolvedHeadSha === headSha;
    const trusted = trustedReleaseIdentityFromEnvironment();
    const reviewedBase = trusted.identity?.baseSha ?? "";
    const reviewedHead = trusted.identity?.headSha ?? "";
    const trustedOwnership = trustedOwnershipPolicy(root, reviewedBase, reviewedHead);
    const changedFiles =
      baseExists && headExists
        ? execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", `${baseSha}..${headSha}`, "--"], {
            cwd: root,
            encoding: "buffer",
          })
            .toString("utf8")
            .split("\0")
            .filter(Boolean)
        : [];
    const issues = [
      ...trusted.issues,
      ...trustedOwnership.issues,
      ...validateReleaseManifest(manifest, {
      expectedProductionSha: reviewedBase,
      expectedHeadSha: reviewedHead,
      ownershipRules: trustedOwnership.policy?.rules ?? [],
      gitBinding: {
        baseExists,
        headExists,
        headSha: reviewedHead,
        resolvedBaseSha: resolvedBaseSha ?? undefined,
        resolvedHeadSha: resolvedHeadSha ?? undefined,
        files: changedFiles,
      },
    })];
    if (issues.length > 0) {
      for (const issue of issues) console.error(`${issue.code}: ${issue.message}`);
      process.exitCode = 1;
    } else {
      console.log(`Release manifest accepted: ${manifestPath}`);
    }
  }
}
