import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateReleaseManifest,
  type OwnershipRule,
} from "../scripts/acceptance/verify-release-manifest.ts";
import {
  validateMigrationDag,
  type MigrationDag,
} from "../scripts/acceptance/verify-migration-dag.ts";
import {
  extractExpressRoutes,
  findDuplicateRoutes,
  validateRouteUniqueness,
} from "../scripts/acceptance/verify-route-uniqueness.ts";
import {
  validateProductionState,
  type FileOwnership,
  type ProductionState,
  type ReleaseGraph,
} from "../scripts/acceptance/verify-production-state.ts";

const ROOT = process.cwd();
const NOW = new Date("2026-07-27T03:05:00.000Z");
const PRODUCTION_SHA = "d494150668de2ede8a61fd0d28bc9ff9a75def26";
const HEAD_SHA = "12759c2567246ee83ed71aad9ffa4b517d31e8aa";

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
    expect(validateMigrationDag(migrationDag(), { checkFiles: false })).toEqual([]);
  });

  it("detects cycles, missing prerequisites, and missing rollback evidence", () => {
    const dag = migrationDag();
    dag.migrations[0].dependsOn = ["two", "missing"];
    dag.migrations[1].rollback.evidence = "";
    const codes = validateMigrationDag(dag, { checkFiles: false }).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining(["MIGRATION_CYCLE", "MISSING_PREREQUISITE", "MIGRATION_ROLLBACK"]),
    );
  });

  it("verifies the checked-in canonical migration checksums", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    expect(dag.productionSha).toBe(PRODUCTION_SHA);
    expect(
      validateMigrationDag(dag, {
        repoRoot: ROOT,
        canonicalBytes: (_productionSha, path) =>
          execFileSync("git", ["show", `HEAD:${path}`], {
            cwd: ROOT,
            encoding: "buffer",
          }),
      }),
    ).toEqual([]);
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
        expectedProductionSha: PRODUCTION_SHA,
        repoFiles,
      }),
    ).toEqual([]);
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
      expectedProductionSha: PRODUCTION_SHA,
    }).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "STALE_PRODUCTION_SHA",
        "PRODUCTION_IDENTITY_CONTRADICTION",
        "DATA_POSTURE_CONTRADICTION",
      ]),
    );
  });
});
