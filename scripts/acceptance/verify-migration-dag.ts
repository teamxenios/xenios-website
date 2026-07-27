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
  dependsOn: string[];
  checksum: MigrationChecksum;
  appliedToProduction: boolean;
  managedMigrationId: string;
  applyTwiceVerified: boolean;
  rollback: MigrationRollback;
};

export type MigrationDag = {
  schemaVersion: number;
  generatedAt: string;
  productionSha: string;
  checksumScope: string;
  migrations: MigrationNode[];
};

export type MigrationDagValidationOptions = {
  repoRoot?: string;
  checkFiles?: boolean;
  canonicalBytes?: (productionSha: string, path: string) => Buffer;
};

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function canonicalGitBytes(repoRoot: string, productionSha: string, path: string): Buffer {
  return execFileSync("git", ["show", `${productionSha}:${path}`], {
    cwd: repoRoot,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
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
  if (!SHA_PATTERN.test(dag.productionSha ?? "")) {
    issues.push({ code: "DAG_PRODUCTION_SHA", message: "Migration DAG productionSha must be a lowercase Git SHA." });
  }
  if (!Array.isArray(dag.migrations)) {
    return [...issues, { code: "DAG_MIGRATIONS_ARRAY", message: "migrations must be an array." }];
  }

  const byId = new Map<string, MigrationNode>();
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
    if (!migration.path || migration.path.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(migration.path)) {
      issues.push({ code: "MIGRATION_PATH", message: `${migration.id} has an unsafe path.` });
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
    for (const migration of dag.migrations) {
      try {
        const bytes = readCanonical(dag.productionSha, migration.path);
        const actual = createHash("sha256").update(bytes).digest("hex");
        if (actual !== migration.checksum.value) {
          issues.push({
            code: "MIGRATION_CHECKSUM_MISMATCH",
            message: `${migration.id} checksum ${migration.checksum.value} does not match canonical ${actual}.`,
          });
        }
      } catch (error) {
        issues.push({
          code: "MIGRATION_SOURCE_UNAVAILABLE",
          message: `${migration.id} cannot be read at ${dag.productionSha}:${migration.path}: ${error instanceof Error ? error.message : String(error)}`,
        });
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
  const issues = validateMigrationDag(dag, { repoRoot: root });
  if (issues.length > 0) {
    for (const issue of issues) console.error(`${issue.code}: ${issue.message}`);
    process.exitCode = 1;
  } else {
    console.log(`Migration DAG accepted: ${dag.migrations.length} nodes, canonical checksums verified.`);
  }
}
