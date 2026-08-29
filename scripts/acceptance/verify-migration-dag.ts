import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ValidationIssue } from "./verify-release-manifest.ts";

type MigrationChecksum = {
  algorithm: string;
  value: string;
};

type MigrationRollback = {
  strategy: string;
  procedure: string;
  evidence: string;
};

export type MigrationNode = {
  id: string;
  path: string;
  sourceSha?: string;
  upstreamReviewedSourceSha?: string;
  sourcePath?: string;
  dependsOn: string[];
  checksum: MigrationChecksum;
  appliedToProduction: boolean;
  managedMigrationId: string;
  applyTwiceVerified: boolean;
  rollback: MigrationRollback;
};

export type MigrationDag = {
  schemaVersion: number;
  identitySemantics: "TRUSTED_RELEASE_BASELINE";
  generatedAt: string;
  productionBaselineReconciledAt?: string;
  productionSha: string;
  checksumScope: string;
  migrations: MigrationNode[];
};

export type MigrationDagValidationOptions = {
  repoRoot?: string;
  checkFiles?: boolean;
  expectedBaselineSha?: string;
  expectedManagedMigrationPaths?: string[];
  canonicalBytes?: (sourceSha: string, path: string) => Buffer;
  managedBytes?: (path: string) => Buffer;
  sourceIsReleaseAncestor?: (sourceSha: string) => boolean;
};

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function canonicalGitBytes(repoRoot: string, sourceSha: string, path: string): Buffer {
  return execFileSync("git", ["cat-file", "blob", `${sourceSha}:${path}`], {
    cwd: repoRoot,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function currentGitBytes(repoRoot: string, path: string): Buffer {
  return execFileSync("git", ["cat-file", "blob", `HEAD:${path}`], {
    cwd: repoRoot,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function isReleaseAncestor(repoRoot: string, sourceSha: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sourceSha, "HEAD"], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function isUnsafePath(path: string): boolean {
  return !path || path.startsWith("/") || path.includes("\\") ||
    /(^|\/)\.\.(\/|$)/.test(path);
}

export function managedMigrationPathsFromLedger(source: string): string[] {
  const paths: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(
      /^\|\s*\d+\s*\|\s*(migrations\/[^|]+?)\s*\|/,
    );
    if (match?.[1]) paths.push(`supabase/${match[1].trim()}`);
  }
  return paths;
}

export function validateMigrationDag(
  dag: MigrationDag,
  options: MigrationDagValidationOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!dag || typeof dag !== "object") {
    return [{ code: "DAG_NOT_OBJECT", message: "Migration DAG must be an object." }];
  }
  if (dag.schemaVersion !== 1) {
    issues.push({ code: "DAG_SCHEMA_VERSION", message: "Migration DAG schemaVersion must equal 1." });
  }
  if (dag.identitySemantics !== "TRUSTED_RELEASE_BASELINE") {
    issues.push({
      code: "DAG_IDENTITY_SEMANTICS",
      message: "Migration DAG productionSha must be an immutable trusted release baseline.",
    });
  }
  if (!SHA_PATTERN.test(dag.productionSha ?? "")) {
    issues.push({ code: "DAG_PRODUCTION_SHA", message: "Migration DAG productionSha must be a lowercase Git SHA." });
  }
  if (
    options.expectedBaselineSha !== undefined &&
    dag.productionSha !== options.expectedBaselineSha
  ) {
    issues.push({
      code: "DAG_BASELINE_IDENTITY_CONTRADICTION",
      message: `Migration DAG baseline ${dag.productionSha} does not match expected ${options.expectedBaselineSha}.`,
    });
  }
  if (!Array.isArray(dag.migrations)) {
    return [...issues, { code: "DAG_MIGRATIONS_ARRAY", message: "migrations must be an array." }];
  }

  const byId = new Map<string, MigrationNode>();
  const byPath = new Map<string, MigrationNode>();
  for (const migration of dag.migrations) {
    if (!migration.id || typeof migration.id !== "string") {
      issues.push({ code: "MIGRATION_ID", message: "Every migration requires an id." });
      continue;
    }
    if (byId.has(migration.id)) {
      issues.push({ code: "DUPLICATE_MIGRATION_ID", message: `Duplicate migration id: ${migration.id}` });
    } else {
      byId.set(migration.id, migration);
    }
    if (isUnsafePath(migration.path)) {
      issues.push({ code: "MIGRATION_PATH", message: `${migration.id} has an unsafe path.` });
    } else if (byPath.has(migration.path)) {
      issues.push({
        code: "DUPLICATE_MIGRATION_PATH",
        message: `Duplicate migration path: ${migration.path}`,
      });
    } else {
      byPath.set(migration.path, migration);
    }
    if (
      migration.sourceSha !== undefined &&
      !SHA_PATTERN.test(migration.sourceSha)
    ) {
      issues.push({
        code: "MIGRATION_SOURCE_SHA",
        message: `${migration.id} sourceSha must be a lowercase Git SHA.`,
      });
    }
    if (
      migration.upstreamReviewedSourceSha !== undefined &&
      !SHA_PATTERN.test(migration.upstreamReviewedSourceSha)
    ) {
      issues.push({
        code: "MIGRATION_UPSTREAM_REVIEW_SHA",
        message: `${migration.id} upstreamReviewedSourceSha must be a lowercase Git SHA.`,
      });
    }
    if (
      migration.sourcePath !== undefined &&
      isUnsafePath(migration.sourcePath)
    ) {
      issues.push({
        code: "MIGRATION_SOURCE_PATH",
        message: `${migration.id} has an unsafe sourcePath.`,
      });
    }
    if (
      migration.sourcePath !== undefined &&
      migration.sourceSha === undefined
    ) {
      issues.push({
        code: "MIGRATION_SOURCE_PATH_WITHOUT_SHA",
        message: `${migration.id} sourcePath requires a pinned sourceSha.`,
      });
    }
    if (
      migration.appliedToProduction === false &&
      !SHA_PATTERN.test(migration.sourceSha ?? "")
    ) {
      issues.push({
        code: "PENDING_MIGRATION_SOURCE_SHA",
        message: `${migration.id} must pin the externally reviewed source SHA while pending.`,
      });
    }
    if (!Array.isArray(migration.dependsOn)) {
      issues.push({ code: "MIGRATION_DEPENDS_ON", message: `${migration.id} dependsOn must be an array.` });
    }
    if (
      migration.checksum?.algorithm !== "sha256" ||
      !SHA256_PATTERN.test(migration.checksum?.value ?? "")
    ) {
      issues.push({ code: "MIGRATION_CHECKSUM_FORMAT", message: `${migration.id} requires a lowercase SHA-256 checksum.` });
    }
    if (!migration.rollback?.strategy?.trim() || !migration.rollback?.procedure?.trim() || !migration.rollback?.evidence?.trim()) {
      issues.push({ code: "MIGRATION_ROLLBACK", message: `${migration.id} lacks rollback strategy, procedure, or evidence.` });
    }
    if (!migration.applyTwiceVerified) {
      issues.push({ code: "MIGRATION_APPLY_TWICE", message: `${migration.id} lacks apply-twice evidence.` });
    }
    if (!migration.managedMigrationId?.trim()) {
      issues.push({ code: "MANAGED_MIGRATION_ID", message: `${migration.id} lacks a managed migration identity.` });
    } else if (
      migration.appliedToProduction === false &&
      migration.managedMigrationId !== "PENDING"
    ) {
      issues.push({
        code: "PENDING_MANAGED_MIGRATION_ID",
        message: `${migration.id} must use managedMigrationId PENDING before production application.`,
      });
    }
  }

  if (options.expectedManagedMigrationPaths) {
    const expected = new Set(options.expectedManagedMigrationPaths);
    for (const path of expected) {
      if (!byPath.has(path)) {
        issues.push({
          code: "MANAGED_MIGRATION_MISSING_FROM_DAG",
          message: `${path} appears in the managed migration ledger but not the formal DAG.`,
        });
      }
    }
    for (const path of byPath.keys()) {
      if (!expected.has(path)) {
        issues.push({
          code: "DAG_MIGRATION_MISSING_FROM_LEDGER",
          message: `${path} appears in the formal DAG but not the managed migration ledger.`,
        });
      }
    }
  }

  for (const migration of dag.migrations) {
    for (const dependency of migration.dependsOn ?? []) {
      if (dependency === migration.id) {
        issues.push({ code: "SELF_DEPENDENCY", message: `${migration.id} depends on itself.` });
      } else if (!byId.has(dependency)) {
        issues.push({ code: "MISSING_PREREQUISITE", message: `${migration.id} depends on missing ${dependency}.` });
      } else if (migration.appliedToProduction && !byId.get(dependency)?.appliedToProduction) {
        issues.push({
          code: "UNAPPLIED_PREREQUISITE",
          message: `${migration.id} is applied while prerequisite ${dependency} is not.`,
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, stack: string[]): void => {
    if (visiting.has(id)) {
      issues.push({ code: "MIGRATION_CYCLE", message: `Migration cycle: ${[...stack, id].join(" -> ")}` });
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      if (byId.has(dependency)) visit(dependency, [...stack, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id, []);

  if (options.checkFiles !== false && SHA_PATTERN.test(dag.productionSha ?? "")) {
    const root = options.repoRoot ?? process.cwd();
    const readCanonical = options.canonicalBytes ?? ((sha, path) => canonicalGitBytes(root, sha, path));
    const readManaged = options.managedBytes ?? ((path) => currentGitBytes(root, path));
    const checkReleaseAncestor = options.sourceIsReleaseAncestor ??
      ((sha) => isReleaseAncestor(root, sha));
    const sourceAncestorCache = new Map<string, boolean>();
    for (const migration of dag.migrations) {
      const sourceSha = migration.sourceSha ?? dag.productionSha;
      const sourcePath = migration.sourcePath ?? migration.path;
      let sourceIsAncestor = sourceAncestorCache.get(sourceSha);
      if (sourceIsAncestor === undefined) {
        sourceIsAncestor = checkReleaseAncestor(sourceSha);
        sourceAncestorCache.set(sourceSha, sourceIsAncestor);
      }
      if (!sourceIsAncestor) {
        issues.push({
          code: "MIGRATION_SOURCE_NOT_RELEASE_ANCESTOR",
          message: `${migration.id} sourceSha ${sourceSha} is not an ancestor of release HEAD; an ordinary single-branch clone cannot reproduce the canonical read.`,
        });
      }
      let sourceBytes: Buffer | undefined;
      try {
        sourceBytes = readCanonical(sourceSha, sourcePath);
        const actual = createHash("sha256").update(sourceBytes).digest("hex");
        if (actual !== migration.checksum.value) {
          issues.push({
            code: "MIGRATION_CHECKSUM_MISMATCH",
            message: `${migration.id} checksum ${migration.checksum.value} does not match canonical ${actual}.`,
          });
        }
      } catch (error) {
        issues.push({
          code: "MIGRATION_SOURCE_UNAVAILABLE",
          message: `${migration.id} cannot be read at ${sourceSha}:${sourcePath}: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      if (migration.sourcePath !== undefined && sourceBytes !== undefined) {
        try {
          const managed = readManaged(migration.path);
          if (!managed.equals(sourceBytes)) {
            issues.push({
              code: "MANAGED_MIGRATION_SOURCE_MISMATCH",
              message: `${migration.id} managed migration does not byte-match ${sourceSha}:${sourcePath}.`,
            });
          }
        } catch (error) {
          issues.push({
            code: "MANAGED_MIGRATION_UNAVAILABLE",
            message: `${migration.id} managed migration cannot be read at HEAD:${migration.path}: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      if (migration.rollback?.procedure) {
        try {
          readFileSync(resolve(root, migration.rollback.procedure), "utf8");
        } catch {
          issues.push({
            code: "ROLLBACK_PROCEDURE_MISSING",
            message: `${migration.id} rollback procedure does not exist: ${migration.rollback.procedure}`,
          });
        }
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

if (isCli()) {
  const root = process.cwd();
  const path = resolve(root, process.argv[2] ?? "docs/coordination/MIGRATION_DAG.json");
  const dag = JSON.parse(readFileSync(path, "utf8")) as MigrationDag;
  const state = JSON.parse(
    readFileSync(resolve(root, "docs/coordination/CURRENT_PRODUCTION_STATE.json"), "utf8"),
  ) as { production?: { gitSha?: string } };
  const issues = validateMigrationDag(dag, {
    repoRoot: root,
    expectedBaselineSha: state.production?.gitSha,
    expectedManagedMigrationPaths: managedMigrationPathsFromLedger(
      readFileSync(resolve(root, "supabase/MIGRATIONS.md"), "utf8"),
    ),
  });
  if (issues.length > 0) {
    for (const issue of issues) console.error(`${issue.code}: ${issue.message}`);
    process.exitCode = 1;
  } else {
    console.log(`Migration DAG accepted: ${dag.migrations.length} nodes, canonical checksums verified.`);
  }
}
