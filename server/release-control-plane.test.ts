import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  trustedOwnershipPolicy,
  trustedReleaseIdentityFromEnvironment,
  validateReleaseManifest,
  type OwnershipRule,
} from "../scripts/acceptance/verify-release-manifest.ts";
import {
  managedMigrationPathsFromLedger,
  validateMigrationDag,
  type MigrationDag,
} from "../scripts/acceptance/verify-migration-dag.ts";
import {
  extractExpressRoutes,
  findDuplicateRoutes,
  validateRouteUniqueness,
} from "../scripts/acceptance/verify-route-uniqueness.ts";
import {
  loadCurrentOwnershipSnapshot,
  productionAcceptanceMessage,
  validateObservedDeployment,
  validateProductionState,
  type FileOwnership,
  type ProductionState,
  type ReleaseGraph,
} from "../scripts/acceptance/verify-production-state.ts";

const ROOT = process.cwd();
const NOW = new Date("2026-07-27T04:15:34.000Z");
const PRODUCTION_SHA = "b729c8ee1a357e0af95fe50a05989b2f662f7270";
const HEAD_SHA = "12759c2567246ee83ed71aad9ffa4b517d31e8aa";
const CONTROL_PLANE_FILES = [
  "docs/coordination/ACTIVE_RELEASE_GRAPH.json",
  "docs/coordination/ACTIVE_RELEASE_GRAPH.mmd",
  "docs/coordination/CURRENT_PRODUCTION_STATE.json",
  "docs/coordination/CURRENT_PRODUCTION_STATE.md",
  "docs/coordination/EXTERNAL_INPUTS_REQUIRED.md",
  "docs/coordination/FILE_OWNERSHIP.json",
  "docs/coordination/MAIN_SESSION_EXECUTION_LOG.md",
  "docs/coordination/MIGRATION_DAG.json",
  "docs/coordination/PR_85_INTEGRATION_PREFLIGHT.json",
  "docs/coordination/release-manifest.schema.json",
  "package-lock.json",
  "package.json",
  "scripts/acceptance/verify-migration-dag.ts",
  "scripts/acceptance/verify-production-state.ts",
  "scripts/acceptance/verify-release-manifest.ts",
  "scripts/acceptance/verify-route-uniqueness.ts",
  "server/release-control-plane.test.ts",
  "supabase/MIGRATIONS.md",
];

function ownershipFixture(
  productionBaseSha: string,
  patterns: string[],
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    generatedAt: NOW.toISOString(),
    productionBaseSha,
    lanes: [{
      owner: "Website 2",
      lane: "release-manager",
      state: "ACTIVE",
      activeUnit: "Release control-plane validation.",
      branch: "chore/release-control-plane",
      headSha: null,
    }],
    rules: [{
      id: "base-release-manager",
      owner: "Website 2",
      lane: "release-manager",
      mode: "write",
      state: "active",
      patterns,
    }],
    invariants: ["Candidate rules cannot authorize their own diff."],
  };
}

function validManifest(): Record<string, unknown> {
  const pass = {
    status: "PASS",
    command: "npm test",
    checkedAt: NOW.toISOString(),
  };
  return {
    schemaVersion: 1,
    releaseId: "release-test",
    domain: "catalog",
    lane: "wave3-member-catalog",
    owner: "Website 3",
    createdAt: NOW.toISOString(),
    baseSha: PRODUCTION_SHA,
    headSha: HEAD_SHA,
    currentProductionSha: PRODUCTION_SHA,
    files: ["server/research/catalog/unit.ts"],
    routes: [],
    migrations: [],
    tables: [],
    functions: [],
    rls: [],
    privileges: [],
    environmentNames: [],
    sharedWiring: [],
    tests: {
      focused: pass,
      fullSuite: pass,
      typecheck: pass,
      build: pass,
      diffCheck: pass,
    },
    rollback: {
      strategy: "revert commit",
      steps: ["Revert the exact release commit."],
      verification: ["Run the focused suite."],
    },
    smoke: {
      steps: ["GET /api/health"],
      expected: ["HTTP 200"],
    },
    evidence: [
      {
        kind: "ci",
        checkedAt: NOW.toISOString(),
        reference: "https://example.test/check",
      },
    ],
  };
}

describe("release manifest validator", () => {
  const ownership: OwnershipRule[] = [
    {
      id: "catalog",
      owner: "Website 3",
      lane: "wave3-member-catalog",
      mode: "write",
      state: "active",
      patterns: ["server/research/catalog/**"],
    },
  ];

  it("accepts a complete current manifest", () => {
    expect(
      validateReleaseManifest(validManifest(), {
        now: NOW,
        expectedProductionSha: PRODUCTION_SHA,
        ownershipRules: ownership,
      }),
    ).toEqual([]);
  });

  it("enforces the canonical closed schema at top-level and nested objects", () => {
    const topLevel = validManifest();
    topLevel.unexpected = true;
    const nested = validManifest();
    (nested.tests as Record<string, unknown>).focused = {
      status: "PASS",
      command: "npm test",
      checkedAt: NOW.toISOString(),
      unexpected: true,
    };
    const incomplete = validManifest();
    (incomplete.rollback as Record<string, unknown>).verification = undefined;
    delete (incomplete.rollback as Record<string, unknown>).verification;

    for (const manifest of [topLevel, nested, incomplete]) {
      expect(
        validateReleaseManifest(manifest, {
          now: NOW,
          expectedProductionSha: PRODUCTION_SHA,
          ownershipRules: ownership,
        }).map((issue) => issue.code),
      ).toContain("SCHEMA_VALIDATION");
    }
  });

  it("binds exact commits and the claimed file set to the computed Git diff", () => {
    const manifest = validManifest();
    const matchingBinding = {
      baseExists: true,
      headExists: true,
      headSha: HEAD_SHA,
      resolvedBaseSha: PRODUCTION_SHA,
      resolvedHeadSha: HEAD_SHA,
      files: ["server/research/catalog/unit.ts"],
    };
    expect(
      validateReleaseManifest(manifest, {
        now: NOW,
        expectedProductionSha: PRODUCTION_SHA,
        expectedHeadSha: HEAD_SHA,
        ownershipRules: ownership,
        gitBinding: matchingBinding,
      }),
    ).toEqual([]);

    const omitted = structuredClone(manifest);
    omitted.files = [];
    const extra = structuredClone(manifest);
    extra.files = ["server/research/catalog/unit.ts", "server/research/catalog/extra.ts"];
    const nonexistent = structuredClone(manifest);
    nonexistent.headSha = "a".repeat(40);
    const mismatch = structuredClone(manifest);
    mismatch.headSha = "b".repeat(40);

    expect(
      validateReleaseManifest(omitted, {
        now: NOW,
        expectedProductionSha: PRODUCTION_SHA,
        expectedHeadSha: HEAD_SHA,
        ownershipRules: ownership,
        gitBinding: matchingBinding,
      }).map((issue) => issue.code),
    ).toContain("MANIFEST_FILE_OMITTED");
    expect(
      validateReleaseManifest(extra, {
        now: NOW,
        expectedProductionSha: PRODUCTION_SHA,
        expectedHeadSha: HEAD_SHA,
        ownershipRules: ownership,
        gitBinding: matchingBinding,
      }).map((issue) => issue.code),
    ).toContain("MANIFEST_FILE_EXTRA");
    expect(
      validateReleaseManifest(nonexistent, {
        now: NOW,
        expectedProductionSha: PRODUCTION_SHA,
        expectedHeadSha: HEAD_SHA,
        ownershipRules: ownership,
        gitBinding: { ...matchingBinding, headExists: false },
      }).map((issue) => issue.code),
    ).toEqual(expect.arrayContaining(["HEAD_COMMIT_UNRESOLVED", "HEAD_SHA_MISMATCH"]));
    expect(
      validateReleaseManifest(manifest, {
        now: NOW,
        expectedProductionSha: PRODUCTION_SHA,
        expectedHeadSha: HEAD_SHA,
        ownershipRules: ownership,
        gitBinding: { ...matchingBinding, baseExists: false, resolvedBaseSha: undefined },
      }).map((issue) => issue.code),
    ).toContain("BASE_COMMIT_UNRESOLVED");
    expect(
      validateReleaseManifest(mismatch, {
        now: NOW,
        expectedProductionSha: PRODUCTION_SHA,
        expectedHeadSha: HEAD_SHA,
        ownershipRules: ownership,
        gitBinding: matchingBinding,
      }).map((issue) => issue.code),
    ).toContain("HEAD_SHA_MISMATCH");
  });

  it("requires an external trusted base and head and prefers pull-request event identity", () => {
    const eventBase = PRODUCTION_SHA;
    const eventHead = HEAD_SHA;
    const event = trustedReleaseIdentityFromEnvironment(
      {
        GITHUB_EVENT_PATH: "event.json",
        XENIOS_EXPECTED_PRODUCTION_SHA: "a".repeat(40),
        XENIOS_EXPECTED_HEAD_SHA: "b".repeat(40),
      },
      () => ({
        pull_request: {
          base: { sha: eventBase },
          head: { sha: eventHead },
        },
      }),
    );
    expect(event).toEqual({
      identity: {
        baseSha: eventBase,
        headSha: eventHead,
        source: "github_pull_request",
      },
      issues: [],
    });

    const explicit = trustedReleaseIdentityFromEnvironment({
      XENIOS_EXPECTED_PRODUCTION_SHA: eventBase,
      XENIOS_EXPECTED_HEAD_SHA: eventHead,
    });
    expect(explicit.identity).toEqual({
      baseSha: eventBase,
      headSha: eventHead,
      source: "explicit_environment",
    });
    expect(trustedReleaseIdentityFromEnvironment({}).issues.map((issue) => issue.code)).toContain(
      "TRUSTED_RELEASE_IDENTITY_REQUIRED",
    );
  });

  it("cannot use candidate production or ownership edits to truncate and self-certify the trusted diff", () => {
    const manifest = validManifest();
    manifest.baseSha = "c".repeat(40);
    manifest.currentProductionSha = "c".repeat(40);
    const codes = validateReleaseManifest(manifest, {
      now: NOW,
      expectedProductionSha: PRODUCTION_SHA,
      expectedHeadSha: HEAD_SHA,
      ownershipRules: [{
        id: "candidate-self-authorization",
        owner: "candidate-self-authorization",
        lane: "catalog",
        mode: "write",
        state: "active",
        patterns: ["**"],
      }],
      gitBinding: {
        baseExists: true,
        headExists: true,
        headSha: HEAD_SHA,
        resolvedBaseSha: "c".repeat(40),
        resolvedHeadSha: HEAD_SHA,
        files: ["server/research/catalog/unit.ts", "package.json"],
      },
    }).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "STALE_PRODUCTION_SHA",
        "STALE_BASE_SHA",
        "MANIFEST_FILE_OMITTED",
      ]),
    );
  });

  it("uses trusted-base ownership instead of a candidate wildcard for an exact bound diff", () => {
    const basePolicy = Buffer.from(JSON.stringify(ownershipFixture(
      PRODUCTION_SHA,
      ["docs/coordination/FILE_OWNERSHIP.json"],
    )));
    const candidateWildcard = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      productionBaseSha: PRODUCTION_SHA,
      rules: [{
        id: "candidate-wildcard",
        owner: "Website 2",
        lane: "release-manager",
        mode: "write",
        state: "active",
        patterns: ["**"],
      }],
    }));
    const trustedPolicy = trustedOwnershipPolicy(
      ROOT,
      PRODUCTION_SHA,
      HEAD_SHA,
      {},
      () => basePolicy,
      () => candidateWildcard,
    );
    expect(trustedPolicy.issues).toEqual([]);
    expect(trustedPolicy.policy?.source).toBe("trusted_base_commit");

    const manifest = validManifest();
    manifest.domain = "release-control-plane";
    manifest.lane = "release-manager";
    manifest.owner = "Website 2";
    manifest.files = [
      "docs/coordination/FILE_OWNERSHIP.json",
      "server/research/runtime-bypass.ts",
    ];
    const codes = validateReleaseManifest(manifest, {
      now: NOW,
      expectedProductionSha: PRODUCTION_SHA,
      expectedHeadSha: HEAD_SHA,
      ownershipRules: trustedPolicy.policy?.rules ?? [],
      gitBinding: {
        baseExists: true,
        headExists: true,
        headSha: HEAD_SHA,
        resolvedBaseSha: PRODUCTION_SHA,
        resolvedHeadSha: HEAD_SHA,
        files: manifest.files as string[],
      },
    }).map((issue) => issue.code);
    expect(codes).toContain("UNOWNED_FILE");
  });

  it("fails closed without base ownership or an external digest and accepts the exact pinned bootstrap", () => {
    const candidateOwnership = readFileSync(
      resolve(ROOT, "docs/coordination/FILE_OWNERSHIP.json"),
    );
    const digest = createHash("sha256").update(candidateOwnership).digest("hex");
    expect(
      trustedOwnershipPolicy(ROOT, PRODUCTION_SHA, HEAD_SHA, {}, () => null, () => candidateOwnership)
        .issues.map((issue) => issue.code),
    ).toContain("TRUSTED_OWNERSHIP_REQUIRED");
    expect(
      trustedOwnershipPolicy(
        ROOT,
        PRODUCTION_SHA,
        HEAD_SHA,
        { XENIOS_EXPECTED_OWNERSHIP_SHA256: "0".repeat(64) },
        () => null,
        () => candidateOwnership,
      ).issues.map((issue) => issue.code),
    ).toContain("TRUSTED_OWNERSHIP_DIGEST_MISMATCH");

    const pinned = trustedOwnershipPolicy(
      ROOT,
      PRODUCTION_SHA,
      HEAD_SHA,
      { XENIOS_EXPECTED_OWNERSHIP_SHA256: digest },
      () => null,
      () => candidateOwnership,
    );
    expect(pinned.issues).toEqual([]);
    expect(pinned.policy?.source).toBe("externally_pinned_snapshot");

    const manifest = validManifest();
    manifest.domain = "release-control-plane";
    manifest.lane = "release-manager";
    manifest.owner = "Website 2";
    manifest.files = CONTROL_PLANE_FILES;
    expect(
      validateReleaseManifest(manifest, {
        now: NOW,
        expectedProductionSha: PRODUCTION_SHA,
        expectedHeadSha: HEAD_SHA,
        ownershipRules: pinned.policy?.rules ?? [],
        gitBinding: {
          baseExists: true,
          headExists: true,
          headSha: HEAD_SHA,
          resolvedBaseSha: PRODUCTION_SHA,
          resolvedHeadSha: HEAD_SHA,
          files: CONTROL_PLANE_FILES,
        },
      }),
    ).toEqual([]);
  });

  it("runs ownership collision checks on the computed Git diff", () => {
    const manifest = validManifest();
    const issues = validateReleaseManifest(manifest, {
      now: NOW,
      expectedProductionSha: PRODUCTION_SHA,
      expectedHeadSha: HEAD_SHA,
      ownershipRules: [
        ...ownership,
        {
          ...ownership[0],
          id: "collision",
          owner: "Website 2",
          lane: "release-manager",
        },
      ],
      gitBinding: {
        baseExists: true,
        headExists: true,
        headSha: HEAD_SHA,
        files: ["server/research/catalog/unit.ts"],
      },
    });
    expect(issues.map((issue) => issue.code)).toContain("OWNERSHIP_CONFLICT");
  });

  it("rejects unsafe and duplicate paths returned by the computed Git diff", () => {
    const manifest = validManifest();
    const codes = validateReleaseManifest(manifest, {
      now: NOW,
      expectedProductionSha: PRODUCTION_SHA,
      expectedHeadSha: HEAD_SHA,
      ownershipRules: ownership,
      gitBinding: {
        baseExists: true,
        headExists: true,
        headSha: HEAD_SHA,
        resolvedBaseSha: PRODUCTION_SHA,
        resolvedHeadSha: HEAD_SHA,
        files: [
          "server/research/catalog/unit.ts",
          "../outside.ts",
          "server/research/catalog/unit.ts",
        ],
      },
    }).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining(["GIT_DIFF_UNSAFE_PATH", "GIT_DIFF_DUPLICATE_PATH"]),
    );
  });

  it("rejects literal backslashes without aliasing them into owned POSIX paths", () => {
    const manifest = validManifest();
    const aliasCodes = validateReleaseManifest(manifest, {
      now: NOW,
      expectedProductionSha: PRODUCTION_SHA,
      expectedHeadSha: HEAD_SHA,
      ownershipRules: ownership,
      gitBinding: {
        baseExists: true,
        headExists: true,
        headSha: HEAD_SHA,
        resolvedBaseSha: PRODUCTION_SHA,
        resolvedHeadSha: HEAD_SHA,
        files: ["server\\research\\catalog\\unit.ts"],
      },
    }).map((issue) => issue.code);
    expect(aliasCodes).toEqual(
      expect.arrayContaining([
        "GIT_DIFF_UNSAFE_PATH",
        "MANIFEST_FILE_OMITTED",
        "MANIFEST_FILE_EXTRA",
        "UNOWNED_FILE",
      ]),
    );

    const manifestBackslash = validManifest();
    manifestBackslash.files = ["server\\research\\catalog\\unit.ts"];
    const manifestCodes = validateReleaseManifest(manifestBackslash, {
      now: NOW,
      expectedProductionSha: PRODUCTION_SHA,
      ownershipRules: ownership,
    }).map((issue) => issue.code);
    expect(manifestCodes).toEqual(
      expect.arrayContaining(["SCHEMA_VALIDATION", "UNSAFE_FILE_PATH", "UNOWNED_FILE"]),
    );
  });

  it("detects stale identity, stale evidence, and ownership conflicts", () => {
    const manifest = validManifest();
    manifest.currentProductionSha = "0000000000000000000000000000000000000000";
    manifest.evidence = [
      {
        kind: "ci",
        checkedAt: "2026-07-01T00:00:00.000Z",
        reference: "stale",
      },
    ];
    const issues = validateReleaseManifest(manifest, {
      now: NOW,
      expectedProductionSha: PRODUCTION_SHA,
      ownershipRules: [
        ...ownership,
        {
          ...ownership[0],
          id: "collision",
          owner: "Website 2",
          lane: "release-manager",
        },
      ],
    });
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["STALE_PRODUCTION_SHA", "STALE_EVIDENCE", "OWNERSHIP_CONFLICT"]),
    );
  });
});

describe("migration DAG validator", () => {
  function migrationDag(): MigrationDag {
    return {
      schemaVersion: 1,
      identitySemantics: "TRUSTED_RELEASE_BASELINE",
      generatedAt: NOW.toISOString(),
      productionSha: PRODUCTION_SHA,
      checksumScope: "canonical Git blob bytes at productionSha",
      migrations: [
        {
          id: "one",
          path: "supabase/migrations/one.sql",
          dependsOn: [],
          checksum: { algorithm: "sha256", value: "a".repeat(64) },
          appliedToProduction: true,
          managedMigrationId: "one",
          applyTwiceVerified: true,
          rollback: {
            strategy: "compensating",
            procedure: "rollback.md",
            evidence: "rollback-zero",
          },
        },
        {
          id: "two",
          path: "supabase/migrations/two.sql",
          dependsOn: ["one"],
          checksum: { algorithm: "sha256", value: "b".repeat(64) },
          appliedToProduction: true,
          managedMigrationId: "two",
          applyTwiceVerified: true,
          rollback: {
            strategy: "compensating",
            procedure: "rollback.md",
            evidence: "rollback-zero",
          },
        },
      ],
    };
  }

  it("accepts an acyclic, complete DAG when file checks are disabled", () => {
    expect(validateMigrationDag(migrationDag(), {
      checkFiles: false,
      expectedBaselineSha: PRODUCTION_SHA,
    })).toEqual([]);
  });

  it("rejects a migration baseline that differs from the canonical release baseline", () => {
    const dag = migrationDag();
    dag.productionSha = "d494150668de2ede8a61fd0d28bc9ff9a75def26";
    expect(validateMigrationDag(dag, {
      checkFiles: false,
      expectedBaselineSha: PRODUCTION_SHA,
    }).map((issue) => issue.code)).toContain("DAG_BASELINE_IDENTITY_CONTRADICTION");
  });

  it("detects cycles, missing prerequisites, and missing rollback evidence", () => {
    const dag = migrationDag();
    dag.migrations[0].dependsOn = ["two", "missing"];
    dag.migrations[1].rollback.evidence = "";
    const codes = validateMigrationDag(dag, {
      checkFiles: false,
      expectedBaselineSha: PRODUCTION_SHA,
    }).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining(["MIGRATION_CYCLE", "MISSING_PREREQUISITE", "MIGRATION_ROLLBACK"]),
    );
  });

  it("verifies the checked-in canonical migration checksums", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    const managedMigrationPaths = managedMigrationPathsFromLedger(
      readFileSync(resolve(ROOT, "supabase/MIGRATIONS.md"), "utf8"),
    );
    expect(dag.productionSha).toBe(PRODUCTION_SHA);
    expect(
      validateMigrationDag(dag, {
        repoRoot: ROOT,
        expectedBaselineSha: PRODUCTION_SHA,
        expectedManagedMigrationPaths: managedMigrationPaths,
        canonicalBytes: (sourceSha, path) => {
          if (
            path ===
            "supabase/migrations/20260727120000_research_inventory_lot_coa_admin.sql"
          ) {
            expect(sourceSha).toBe(
              "2542f8da508792f39abe7dea5a5686ade5c9e5a3",
            );
          } else if (
            path === "supabase/research-inventory-reservation-commands.sql"
          ) {
            expect(sourceSha).toBe(
              "d9107eb69355513ab89c82b6ff48c2bfe6174895",
            );
            return execFileSync(
              "git",
              ["cat-file", "blob", `${sourceSha}:${path}`],
              { cwd: ROOT, encoding: "buffer" },
            );
          } else {
            expect(sourceSha).toBe(PRODUCTION_SHA);
          }
          return execFileSync("git", ["cat-file", "blob", `HEAD:${path}`], {
            cwd: ROOT,
            encoding: "buffer",
          });
        },
        managedBytes: (path) =>
          execFileSync("git", ["show", `:${path}`], {
            cwd: ROOT,
            encoding: "buffer",
          }),
      }),
    ).toEqual([]);
  });

  it("requires every managed ledger migration exactly once in the DAG", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    const managedMigrationPaths = managedMigrationPathsFromLedger(
      readFileSync(resolve(ROOT, "supabase/MIGRATIONS.md"), "utf8"),
    );
    const missing = structuredClone(dag);
    missing.migrations = missing.migrations.filter(
      (migration) => migration.id !== "research_inventory_lot_coa_admin",
    );
    expect(
      validateMigrationDag(missing, {
        checkFiles: false,
        expectedBaselineSha: PRODUCTION_SHA,
        expectedManagedMigrationPaths: managedMigrationPaths,
      }).map((issue) => issue.code),
    ).toContain("MANAGED_MIGRATION_MISSING_FROM_DAG");

    const duplicate = structuredClone(dag);
    duplicate.migrations.push({
      ...structuredClone(duplicate.migrations.at(-1)!),
      id: "duplicate_wave_2",
    });
    expect(
      validateMigrationDag(duplicate, {
        checkFiles: false,
        expectedBaselineSha: PRODUCTION_SHA,
        expectedManagedMigrationPaths: managedMigrationPaths,
      }).map((issue) => issue.code),
    ).toContain("DUPLICATE_MIGRATION_PATH");
  });

  it("hashes canonical raw Git blobs and rejects newline-normalized bytes", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    const wave2 = dag.migrations.find(
      (migration) => migration.id === "research_inventory_lot_coa_admin",
    );
    expect(wave2?.sourceSha).toBe(
      "2542f8da508792f39abe7dea5a5686ade5c9e5a3",
    );
    expect(wave2?.checksum.value).toBe(
      "65a98ccdb43c4adb541d0e21c1cc54b7bfb618755dc37f679414e3dba7a48524",
    );

    const issues = validateMigrationDag(dag, {
      repoRoot: ROOT,
      expectedBaselineSha: PRODUCTION_SHA,
      canonicalBytes: (sourceSha, path) => {
        if (path === wave2?.path) {
          expect(sourceSha).toBe(wave2.sourceSha);
        }
        const raw = execFileSync("git", ["cat-file", "blob", `HEAD:${path}`], {
          cwd: ROOT,
          encoding: "buffer",
        });
        if (path !== wave2?.path) return raw;
        return Buffer.from(raw.toString("utf8").replace(/\r?\n/g, "\r\n"));
      },
    });
    expect(issues.map((issue) => issue.code)).toContain(
      "MIGRATION_CHECKSUM_MISMATCH",
    );
  });

  it("fails closed when a pinned migration source is unavailable", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    const wave2 = dag.migrations.find(
      (migration) => migration.id === "research_inventory_lot_coa_admin",
    );
    expect(wave2).toBeDefined();
    wave2!.sourceSha = PRODUCTION_SHA;
    expect(
      validateMigrationDag(dag, {
        repoRoot: ROOT,
        expectedBaselineSha: PRODUCTION_SHA,
      }).map((issue) => issue.code),
    ).toContain("MIGRATION_SOURCE_UNAVAILABLE");
  });

  it("binds a distinct managed migration path to the reviewed source blob", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    const reservation = dag.migrations.find(
      (migration) => migration.id === "research_inventory_reservation_commands",
    );
    expect(reservation).toMatchObject({
      path: "supabase/migrations/20260727160000_research_inventory_reservation_commands.sql",
      sourceSha: "d9107eb69355513ab89c82b6ff48c2bfe6174895",
      sourcePath: "supabase/research-inventory-reservation-commands.sql",
      appliedToProduction: false,
      managedMigrationId: "PENDING",
    });
    expect(reservation?.checksum.value).toBe(
      "4dbb183f367e6dcd847cba3048a37f132ab4cc559791c2719baf7e05c42767f7",
    );

    const source = execFileSync(
      "git",
      [
        "cat-file",
        "blob",
        `${reservation!.sourceSha}:${reservation!.sourcePath}`,
      ],
      { cwd: ROOT, encoding: "buffer" },
    );
    const managed = execFileSync("git", ["show", `:${reservation!.path}`], {
      cwd: ROOT,
      encoding: "buffer",
    });
    expect(managed.equals(source)).toBe(true);

    const mismatchIssues = validateMigrationDag(dag, {
      repoRoot: ROOT,
      expectedBaselineSha: PRODUCTION_SHA,
      canonicalBytes: (sourceSha, path) =>
        execFileSync("git", ["cat-file", "blob", `${sourceSha}:${path}`], {
          cwd: ROOT,
          encoding: "buffer",
        }),
      managedBytes: (path) =>
        path === reservation!.path
          ? Buffer.from("not-the-reviewed-migration")
          : execFileSync("git", ["show", `:${path}`], {
              cwd: ROOT,
              encoding: "buffer",
            }),
    });
    expect(mismatchIssues.map((issue) => issue.code)).toContain(
      "MANAGED_MIGRATION_SOURCE_MISMATCH",
    );
  });

  it("rejects unsafe or unpinned migration source paths", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    const reservation = dag.migrations.find(
      (migration) => migration.id === "research_inventory_reservation_commands",
    )!;
    reservation.sourcePath = "..\\candidate.sql";
    delete reservation.sourceSha;
    expect(
      validateMigrationDag(dag, {
        checkFiles: false,
        expectedBaselineSha: PRODUCTION_SHA,
      }).map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining([
        "MIGRATION_SOURCE_PATH",
        "MIGRATION_SOURCE_PATH_WITHOUT_SHA",
        "PENDING_MIGRATION_SOURCE_SHA",
      ]),
    );
  });

  it("records reservation release evidence without changing the accepted source", () => {
    const managed = execFileSync(
      "git",
      [
        "show",
        ":supabase/migrations/20260727160000_research_inventory_reservation_commands.sql",
      ],
      { cwd: ROOT, encoding: "buffer" },
    );
    const source = execFileSync(
      "git",
      [
        "cat-file",
        "blob",
        "d9107eb69355513ab89c82b6ff48c2bfe6174895:supabase/research-inventory-reservation-commands.sql",
      ],
      { cwd: ROOT, encoding: "buffer" },
    );
    const verifier = readFileSync(
      resolve(ROOT, "supabase/verify-research-inventory-reservation-commands.sql"),
      "utf8",
    );
    const rollback = readFileSync(
      resolve(
        ROOT,
        "supabase/production/research-inventory-reservation-commands-rollback-notes.md",
      ),
      "utf8",
    );

    expect(managed.equals(source)).toBe(true);
    expect(verifier).toContain("reservation forced-RLS count mismatch");
    expect(verifier).toContain("reservation service RPC grant mismatch");
    expect(verifier).toContain("reservation rows found before enablement");
    expect(rollback).toContain(
      "4dbb183f367e6dcd847cba3048a37f132ab4cc559791c2719baf7e05c42767f7",
    );
  });
});

describe("route uniqueness validator", () => {
  it("extracts and rejects duplicate method+path registrations", () => {
    const first = extractExpressRoutes(
      'app.get("/api/research/capabilities", guard, handler);',
      "first.ts",
    );
    const second = extractExpressRoutes(
      'router.get("/api/research/capabilities/", guard, handler);',
      "second.ts",
    );
    const routes = [...first, ...second];
    expect(findDuplicateRoutes(routes).has("GET /api/research/capabilities")).toBe(true);
    expect(validateRouteUniqueness(routes)[0]?.code).toBe("DUPLICATE_ROUTE");
  });

  it("detects the superseded capabilities-route duplicate as a self-contained negative control", () => {
    const productionRoutes = [
      ...extractExpressRoutes(
        'app.get("/api/research/capabilities", privateHeaders, requireMember, handler);',
        "server/research/capabilities.ts",
      ),
      ...extractExpressRoutes(
        'app.get("/api/research/capabilities", sharedPassword, commerceHandler);',
        "server/research/commerce/routes.ts",
      ),
    ];
    const duplicates = findDuplicateRoutes(productionRoutes);
    const registrations = duplicates.get("GET /api/research/capabilities");
    expect(registrations?.map((route) => route.file)).toEqual(
      expect.arrayContaining([
        "server/research/capabilities.ts",
        "server/research/commerce/routes.ts",
      ]),
    );
  });

  it("accepts a canonical single-owner capability route fixture", () => {
    const routes = extractExpressRoutes(
      'app.get("/api/research/capabilities", privateHeaders, requireMember, handler);',
      "server/research/capabilities.ts",
    );
    expect(validateRouteUniqueness(routes)).toEqual([]);
  });
});

describe("production state validator", () => {
  function checkedInState(): {
    state: ProductionState;
    graph: ReleaseGraph;
    ownership: FileOwnership;
  } {
    return {
      state: JSON.parse(
        readFileSync(resolve(ROOT, "docs/coordination/CURRENT_PRODUCTION_STATE.json"), "utf8"),
      ) as ProductionState,
      graph: JSON.parse(
        readFileSync(resolve(ROOT, "docs/coordination/ACTIVE_RELEASE_GRAPH.json"), "utf8"),
      ) as ReleaseGraph,
      ownership: JSON.parse(
        readFileSync(resolve(ROOT, "docs/coordination/FILE_OWNERSHIP.json"), "utf8"),
      ) as FileOwnership,
    };
  }

  it("accepts the internally consistent checked-in production snapshot", () => {
    const { state, graph, ownership } = checkedInState();
    const repoFiles = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
    expect(
      validateProductionState(state, graph, ownership, {
        now: NOW,
        trustedReleaseBaseSha: PRODUCTION_SHA,
        migrationBaselineSha: PRODUCTION_SHA,
        repoFiles,
      }),
    ).toEqual([]);
  });

  it("separates trusted-base diff authorization from the current production ownership snapshot", () => {
    const { state, graph, ownership: currentOwnership } = checkedInState();
    const policyOriginSha = "d494150668de2ede8a61fd0d28bc9ff9a75def26";
    const basePolicy = Buffer.from(JSON.stringify(ownershipFixture(
      policyOriginSha,
      [
        "docs/coordination/CURRENT_PRODUCTION_STATE.json",
        "docs/coordination/ACTIVE_RELEASE_GRAPH.json",
        "docs/coordination/MIGRATION_DAG.json",
        "docs/coordination/FILE_OWNERSHIP.json",
      ],
    )));
    const candidateWildcard = Buffer.from(JSON.stringify({
      ...currentOwnership,
      rules: [{
        id: "candidate-wildcard",
        owner: "Website 2",
        lane: "release-manager",
        mode: "write",
        state: "active",
        patterns: ["**"],
      }],
    }));
    const trustedPolicy = trustedOwnershipPolicy(
      ROOT,
      policyOriginSha,
      HEAD_SHA,
      {},
      () => basePolicy,
      () => candidateWildcard,
    );
    expect(trustedPolicy.issues).toEqual([]);
    expect(currentOwnership.productionBaseSha).toBe(PRODUCTION_SHA);
    expect(
      validateProductionState(state, graph, currentOwnership, {
        now: NOW,
        trustedReleaseBaseSha: PRODUCTION_SHA,
        migrationBaselineSha: PRODUCTION_SHA,
      }),
    ).toEqual([]);

    const manifest = validManifest();
    manifest.domain = "release-control-plane";
    manifest.lane = "release-manager";
    manifest.owner = "Website 2";
    manifest.files = [
      "docs/coordination/CURRENT_PRODUCTION_STATE.json",
      "server/research/runtime-bypass.ts",
    ];
    const codes = validateReleaseManifest(manifest, {
      now: NOW,
      expectedProductionSha: PRODUCTION_SHA,
      expectedHeadSha: HEAD_SHA,
      ownershipRules: trustedPolicy.policy?.rules ?? [],
      gitBinding: {
        baseExists: true,
        headExists: true,
        headSha: HEAD_SHA,
        resolvedBaseSha: PRODUCTION_SHA,
        resolvedHeadSha: HEAD_SHA,
        files: manifest.files as string[],
      },
    }).map((issue) => issue.code);
    expect(codes).toContain("UNOWNED_FILE");
  });

  it("fails closed when the current ownership snapshot is missing or invalid", () => {
    expect(
      loadCurrentOwnershipSnapshot(ROOT, () => {
        throw new Error("missing");
      }).issues.map((issue) => issue.code),
    ).toContain("CURRENT_OWNERSHIP_SNAPSHOT_INVALID");
    expect(
      loadCurrentOwnershipSnapshot(ROOT, () => "{not-json").issues.map((issue) => issue.code),
    ).toContain("CURRENT_OWNERSHIP_SNAPSHOT_INVALID");
    for (const invalid of [
      {},
      { schemaVersion: 1, generatedAt: NOW.toISOString(), productionBaseSha: PRODUCTION_SHA },
      {
        ...ownershipFixture(PRODUCTION_SHA, ["docs/coordination/**"]),
        rules: "not-an-array",
      },
      {
        ...ownershipFixture(PRODUCTION_SHA, ["docs/coordination/**"]),
        lanes: [{ owner: "Website 2", lane: "release-manager" }],
      },
      {
        ...ownershipFixture(PRODUCTION_SHA, ["docs/coordination/**"]),
        rules: [{ id: "malformed", patterns: [] }],
      },
      {
        ...ownershipFixture(PRODUCTION_SHA, ["docs/coordination/**"]),
        unexpected: true,
      },
    ]) {
      expect(
        loadCurrentOwnershipSnapshot(ROOT, () => JSON.stringify(invalid)).issues.map(
          (issue) => issue.code,
        ),
      ).toContain("CURRENT_OWNERSHIP_SNAPSHOT_INVALID");
    }
    expect(
      loadCurrentOwnershipSnapshot(
        ROOT,
        () => JSON.stringify(ownershipFixture(PRODUCTION_SHA, ["docs/coordination/**"])),
      ).issues,
    ).toEqual([]);
  });

  it("validates a distinct observed merge without requiring it in the checked-in baseline", () => {
    const { state } = checkedInState();
    const candidateSha = "5d5561807fb359356e8af89d99a19f2c08b572a3";
    const deployedSha = "a".repeat(40);
    const observation = {
      baselineSha: PRODUCTION_SHA,
      acceptedCandidateSha: candidateSha,
      observedMainSha: deployedSha,
      observedRenderSha: deployedSha,
      renderDeploymentId: "dep-postdeploy123",
      expectedObservedTreeSha: "c".repeat(40),
    };
    const binding = {
      baselineExists: true,
      candidateExists: true,
      observedExists: true,
      resolvedBaselineSha: PRODUCTION_SHA,
      resolvedCandidateSha: candidateSha,
      resolvedObservedSha: deployedSha,
      resolvedObservedTreeSha: "c".repeat(40),
      checkoutHeadSha: deployedSha,
      baselineAncestorOfObserved: true,
      candidateAncestorOfObserved: true,
      scopedFilesMatch: true,
      runtimeEvidencePassed: true,
      routeEvidencePassed: true,
      healthStatus: 200,
    };
    expect(validateObservedDeployment(state, observation, binding)).toEqual([]);
    expect(productionAcceptanceMessage(state, observation)).toBe(
      `Observed deployment accepted: ${deployedSha} / dep-postdeploy123 (baseline ${PRODUCTION_SHA}).`,
    );
    expect(productionAcceptanceMessage(state)).toBe(
      `Trusted release baseline accepted: ${PRODUCTION_SHA} / dep-d9jdiuf41pts73b4p02g.`,
    );
    expect(
      validateObservedDeployment(
        state,
        { ...observation, observedRenderSha: "b".repeat(40) },
        { ...binding, candidateAncestorOfObserved: false },
      ).map((issue) => issue.code),
    ).toEqual(expect.arrayContaining([
      "OBSERVED_DEPLOYMENT_IDENTITY_MISMATCH",
      "OBSERVED_CANDIDATE_NOT_ANCESTOR",
    ]));
  });

  it("requires one trusted baseline across state, graph, ownership, and migration DAG", () => {
    const ancestor = "d494150668de2ede8a61fd0d28bc9ff9a75def26";
    const checked = checkedInState();
    const validate = (
      state: ProductionState,
      graph: ReleaseGraph,
      ownership: FileOwnership,
      migrationBaselineSha: string,
    ) => validateProductionState(state, graph, ownership, {
      now: NOW,
      trustedReleaseBaseSha: PRODUCTION_SHA,
      migrationBaselineSha,
    }).map((issue) => issue.code);

    expect(validate(
      structuredClone(checked.state),
      structuredClone(checked.graph),
      structuredClone(checked.ownership),
      PRODUCTION_SHA,
    )).not.toContain("BASELINE_IDENTITY_CONTRADICTION");

    const stateDrift = structuredClone(checked.state);
    stateDrift.production.gitSha = ancestor;
    expect(validate(
      stateDrift,
      structuredClone(checked.graph),
      structuredClone(checked.ownership),
      PRODUCTION_SHA,
    )).toContain("BASELINE_IDENTITY_CONTRADICTION");

    const graphDrift = structuredClone(checked.graph);
    graphDrift.productionSha = ancestor;
    expect(validate(
      structuredClone(checked.state),
      graphDrift,
      structuredClone(checked.ownership),
      PRODUCTION_SHA,
    )).toContain("BASELINE_IDENTITY_CONTRADICTION");

    const ownershipDrift = structuredClone(checked.ownership);
    ownershipDrift.productionBaseSha = ancestor;
    expect(validate(
      structuredClone(checked.state),
      structuredClone(checked.graph),
      ownershipDrift,
      PRODUCTION_SHA,
    )).toContain("BASELINE_IDENTITY_CONTRADICTION");

    expect(validate(
      structuredClone(checked.state),
      structuredClone(checked.graph),
      structuredClone(checked.ownership),
      ancestor,
    )).toContain("BASELINE_IDENTITY_CONTRADICTION");
  });

  it("detects production identity and data-posture contradictions", () => {
    const { state, graph, ownership } = checkedInState();
    state.production.gitSha = "0000000000000000000000000000000000000000";
    if (state.dataPosture) {
      state.dataPosture.fabricatedDataCount = 1;
    } else if (state.productionCounts) {
      state.productionCounts.productControlRows = 1;
    }
    const codes = validateProductionState(state, graph, ownership, {
      now: NOW,
      trustedReleaseBaseSha: PRODUCTION_SHA,
      migrationBaselineSha: PRODUCTION_SHA,
    }).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "STALE_PRODUCTION_BASELINE",
        "BASELINE_IDENTITY_CONTRADICTION",
        "DATA_POSTURE_CONTRADICTION",
      ]),
    );
  });
});
