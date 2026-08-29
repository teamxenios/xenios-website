import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
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
  extractExpressRouteScan,
  extractExpressRoutes,
  findDuplicateRoutes,
  scanExpressRouteResult,
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
const NOW = new Date("2026-08-28T04:05:00.000Z");

function gitBlobSha(bytes: Buffer): string {
  const header = Buffer.from(`blob ${bytes.byteLength}\0`, "utf8");
  return createHash("sha1").update(header).update(bytes).digest("hex");
}
const PRODUCTION_SHA = "3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212";
const PRODUCTION_BRANCH = "release/early-access-code-session-checkout";
const PROTECTED_PENDING_SOURCE_SHA =
  "4a45b89856df3104de498c7124d27b608e52b34d";
const HEAD_SHA = "adb3df5f4a431b73087c2ce1f13b197d830216fe";
const RESERVATION_SOURCE_SHA = "31b91f107cd2a54140d007267bb4cc02549e8404";
const RESERVATION_SOURCE_PATH =
  "supabase/research-inventory-reservation-commands.sql";
const RESERVATION_SOURCE_BLOB =
  "97b304881eb65c9517beae1b91e8dc39982a8e34";
const WAVE2_SOURCE_SHA = "7007be2a8cfaad147d3846267040cef52dc82793";
const WAVE2_UPSTREAM_REVIEW_SHA =
  "2542f8da508792f39abe7dea5a5686ade5c9e5a3";
const STRENGTH_GATE_SOURCE_SHA =
  "2b445aa425dfb9a5d656ecb1216ec15bc1bb65f6";
const STRENGTH_GATE_UPSTREAM_REVIEW_SHA =
  "0b835c7d7fa6fb633b269cd64665a0338c7bf163";
const STRENGTH_GATE_PATH =
  "supabase/migrations/20260801120000_research_variant_strength_write_gate.sql";
const STRENGTH_GATE_BLOB = "30e3550db2c37e64fb16a348076fd40fcec77f65";
const STRENGTH_GATE_CHECKSUM =
  "6cd11e07eb764d0f803db4baa308ae397c23aacb8ff5d29306c8797be60b4818";
const PROTECTED_PENDING_SOURCE_PATHS = new Set([
  "supabase/migrations/20260727200000_research_persistent_cart.sql",
  "supabase/migrations/20260728010000_research_fulfillment_supplier_operations.sql",
  "supabase/migrations/20260728020000_research_affiliate_professional_operations.sql",
  "supabase/migrations/20260729000000_research_pricing_lineage.sql",
  "supabase/migrations/20260729100000_research_rls_retro_hardening.sql",
]);
// The Early Access durable-persistence chain (ledger rows 50-53), pending,
// pinned to the reviewed source commits on claude/f5-ea-durable-persistence.
const EA_PERSISTENCE_SOURCE_SHA = "8739b433e5a1588a72bfed3eae649e38e416fe0f";
const EA_PERSISTENCE_SOURCE_PATHS = new Set([
  "supabase/migrations/20260804120000_research_early_access_identity_persistence.sql",
  "supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql",
  "supabase/migrations/20260804122000_research_early_access_supplier_operations.sql",
]);
const EA_RESERVATION_SOURCE_SHA = "a2698a56b1a56cb46ffe1a89220eef4da3de92dc";
const EA_RESERVATION_PATH =
  "supabase/migrations/20260804123000_research_early_access_reservation_holds.sql";
const EA_UNIT_HOLDS_SOURCE_SHA = "eafb8288ca2227d79dde545dfe2499d3dadb739e";
const EA_UNIT_HOLDS_PATH =
  "supabase/migrations/20260804130000_research_early_access_unit_holds.sql";
const EA_SETTLED_REFS_SOURCE_SHA = "da8385371b750d99026d88d3b7ce4e1e56bd8407";
const EA_SETTLED_REFS_PATH =
  "supabase/migrations/20260804140000_research_early_access_settled_transaction_refs.sql";
const EA_BUCKET_PRIVACY_SOURCE_SHA = "44145cb66b56340de219fa9f826d3196a4193403";
const EA_BUCKET_PRIVACY_PATH =
  "supabase/migrations/20260804150000_research_early_access_proof_bucket_privacy.sql";
const EA_STRENGTH_MIRROR_SOURCE_SHA = "5bee236b996d839f71e148a416efeaa22c366810";
/** The cart and affiliate schema, introduced together in one commit. */
const CART_AFFILIATE_SOURCE_SHA = "f718a6f6b0154d9d4afd1a5f5f65c16595a0944f";
const CART_CHECKOUT_PATH =
  "supabase/migrations/20260807193000_research_early_access_cart_checkout.sql";
const AFFILIATE_V2_PATH =
  "supabase/migrations/20260807200000_research_affiliate_access_and_portal_v2.sql";
/**
 * The cart completion schema (proofs, receipts, child releases, supplier
 * outbox, settlement RPCs). It is a LOCAL branch migration that has not been
 * deployed, so its source commit is this branch's, not PRODUCTION_SHA. Listed
 * for the same reason the cart and affiliate paths above are: an undeployed
 * migration cannot be readable at the production commit.
 */
const CART_COMPLETION_SOURCE_SHA = "2b9d789ba705f79977a0130fc909b87aba8b6e5c";
const CART_COMPLETION_PATH =
  "supabase/migrations/20260808100000_research_early_access_cart_completion.sql";
const CART_DUPLICATE_GUARD_SOURCE_SHA =
  "4031cace41eba98f283e63b8ed3a14f555f6d79a";
const CART_DUPLICATE_GUARD_PATH =
  "supabase/migrations/20260809120000_research_early_access_cart_duplicate_guard.sql";
const EA_HARDENING_SOURCE_SHA = "f259a1b672cba1fab56d06b190b6102d0fd5aae8";
const EA_HARDENING_PATH =
  "supabase/migrations/20260809130000_research_early_access_hardening.sql";
// M63: the legal document category widening, pinned to its own reviewed source.
const FM_CATEGORY_EXPANSION_SOURCE_SHA = "b1762be49307b71768428e3c7886dfc5517d7635";
const FM_CATEGORY_EXPANSION_PATH =
  "supabase/migrations/20260810120000_research_fm_document_category_expansion.sql";
// M64: the read-only shipping-commitment work list, pinned to the commit that
// introduced it together with the application half it exists to drive.
const CART_SHIPPING_COMMITMENTS_SOURCE_SHA =
  "e6770852a28fc7badc4ba02f0b3632b07ae0ece8";
const CART_SHIPPING_COMMITMENTS_PATH =
  "supabase/migrations/20260810130000_research_early_access_cart_shipping_commitments.sql";
// M65: the one-through-twenty quantity band, pinned to the commit that
// introduced it together with the application half it exists to serve. Neither
// is meaningful alone: the widened constraint with a server that still refuses
// four is inert, and the widened server without it is a checkout the database
// rejects after the customer has been quoted.
const CART_QUANTITY_BAND_SOURCE_SHA =
  "6e26fd9d757d99a03f9d1821254857126ecf1f55";
const CART_QUANTITY_BAND_PATH =
  "supabase/migrations/20260811120000_research_early_access_cart_quantity_band.sql";
// M66: candidate-only one-through-fifty database band. The source is pinned,
// but applyTwiceVerified deliberately stays false until the separately gated
// PG16/PG17 rehearsal is authorized and run.
const CART_QUANTITY_BAND_50_SOURCE_SHA =
  "afe9b82336ede44c6a667342c85b04c5a3e0ed18";
const CART_QUANTITY_BAND_50_PATH =
  "supabase/migrations/20260812120000_research_early_access_cart_quantity_band_50.sql";
// M67: the member order-history read (placementsForCustomers + the
// customer-refs-for-member routine). Candidate-only, explicitly unapplied to
// production; pinned to the harness-corrected source commit.
const MEMBER_ORDER_HISTORY_SOURCE_SHA =
  "9624ba26aab056d4982da1d098f6c1c554b195da";
const MEMBER_ORDER_HISTORY_PATH =
  "supabase/migrations/20260813120000_research_early_access_member_order_history.sql";
// Search-path hardening: applied to production 2026-08-14 (managed id
// 20260814060630); pinned to the commit that added the managed mirror.
const SEARCH_PATH_HARDENING_SOURCE_SHA =
  "b91d30de9db8033e53ccfe46ddb3e01e5e88fd42";
const SEARCH_PATH_HARDENING_PATH =
  "supabase/migrations/20260814061500_research_function_search_path_hardening.sql";
// The assisted order bridge (M71): pending, never applied to production, and
// pinned to the commit that introduced the certified migration bytes. The
// bytes at that commit hash to the DAG's recorded checksum and are unchanged
// at HEAD, which is what this pin asserts. Without a branch here the node
// falls to the fallback below and is asked to match the release baseline,
// which it never can: it did not exist at the baseline.
// Moved 2026-08-19: the first production apply was refused by the
// migration's own post-condition (managed Supabase default privileges
// grant new functions to client roles), and the corrected artifact
// revokes service_role on the six internal helpers.
const ASSISTED_ORDER_BRIDGE_SOURCE_SHA =
  "310ef190fd7136828ee6fcace7ec3bfb7567896f";
const ASSISTED_ORDER_BRIDGE_PATH =
  "supabase/migrations/20260815150000_research_assisted_order_bridge.sql";
// Registered 2026-08-20 with M75, the customer-typed affiliate code. Its submit
// routine was regenerated from the definition running in production rather than
// from an older copy of the file, so the pinned bytes are the ones reviewed
// against live behaviour.
const DECLARED_AFFILIATE_CODE_SOURCE_SHA =
  "0bda86909d61fd33ef18dd92acb7856eaee662ea";
const DECLARED_AFFILIATE_CODE_PATH =
  "supabase/migrations/20260820190000_research_assisted_order_declared_affiliate_code.sql";
// The bulk unit-fact reads (ledger row 76): the set-valued twins of the
// per-unit hold-kinds and live-confirmation RPCs, OPTIONAL for the code RC
// because the server falls back to the per-unit functions when absent.
// Pinned at the launch-integration commit that introduced the file.
const BULK_UNIT_FACTS_SOURCE_SHA =
  "7d409a648a315f31637d75150917459af41948b4";
const BULK_UNIT_FACTS_PATH =
  "supabase/migrations/20260821170000_research_early_access_bulk_unit_facts.sql";
// The three 2026-08-19 launch cart migrations (commission settlement, member
// cart history, canonical settlement txn), promoted from candidates after
// adversarial review and a two-engine disposable apply-twice rehearsal
// (scripts/verify-20260819-cart-migrations.sh). One promotion commit holds
// all three canonical blobs.
const LAUNCH_CART_MIGRATIONS_SOURCE_SHA =
  "3b07ecb773e885d2c385c2601eadde25fec6a8a8";
const LAUNCH_CART_MIGRATION_PATHS = new Set([
  "supabase/migrations/20260819170000_research_ea_cart_commission_settlement.sql",
  "supabase/migrations/20260819170100_research_ea_cart_member_order_history.sql",
  "supabase/migrations/20260819170200_research_ea_cart_settlement_canonical_txn.sql",
]);
const EA_STRENGTH_MIRROR_PATH =
  "supabase/migrations/20260804160000_research_early_access_strength_registry_mirror.sql";
const pg16It =
  process.env.CI || process.env.XENIOS_RUN_PG16_VERIFIER === "1" ? it : it.skip;
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

function checkedInReservationSourceBytes(): Buffer {
  const blob = execFileSync(
    "git",
    ["rev-parse", `HEAD:${RESERVATION_SOURCE_PATH}`],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  expect(blob).toBe(RESERVATION_SOURCE_BLOB);
  return execFileSync(
    "git",
    ["cat-file", "blob", `HEAD:${RESERVATION_SOURCE_PATH}`],
    { cwd: ROOT, encoding: "buffer" },
  );
}

function checkedInStrengthGateSourceBytes(): Buffer {
  const blob = execFileSync(
    "git",
    ["rev-parse", `:${STRENGTH_GATE_PATH}`],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  expect(blob).toBe(STRENGTH_GATE_BLOB);
  return execFileSync(
    "git",
    ["show", `:${STRENGTH_GATE_PATH}`],
    { cwd: ROOT, encoding: "buffer" },
  );
}

function checkedInManagedMigrationPaths(): string[] {
  const names = readdirSync(resolve(ROOT, "supabase/migrations"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    expect(name).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  }
  const paths = names.map((name) => `supabase/migrations/${name}`);
  expect(new Set(paths).size).toBe(paths.length);
  return paths;
}

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
            expect(sourceSha).toBe(WAVE2_SOURCE_SHA);
          } else if (
            path === RESERVATION_SOURCE_PATH
          ) {
            expect(sourceSha).toBe(RESERVATION_SOURCE_SHA);
            return checkedInReservationSourceBytes();
          } else if (path === STRENGTH_GATE_PATH) {
            expect(sourceSha).toBe(STRENGTH_GATE_SOURCE_SHA);
            return checkedInStrengthGateSourceBytes();
          } else if (PROTECTED_PENDING_SOURCE_PATHS.has(path)) {
            expect(sourceSha).toBe(PROTECTED_PENDING_SOURCE_SHA);
          } else if (EA_PERSISTENCE_SOURCE_PATHS.has(path)) {
            expect(sourceSha).toBe(EA_PERSISTENCE_SOURCE_SHA);
          } else if (path === EA_RESERVATION_PATH) {
            expect(sourceSha).toBe(EA_RESERVATION_SOURCE_SHA);
          } else if (path === EA_UNIT_HOLDS_PATH) {
            expect(sourceSha).toBe(EA_UNIT_HOLDS_SOURCE_SHA);
          } else if (path === EA_SETTLED_REFS_PATH) {
            expect(sourceSha).toBe(EA_SETTLED_REFS_SOURCE_SHA);
          } else if (path === EA_BUCKET_PRIVACY_PATH) {
            expect(sourceSha).toBe(EA_BUCKET_PRIVACY_SOURCE_SHA);
          } else if (path === EA_STRENGTH_MIRROR_PATH) {
            expect(sourceSha).toBe(EA_STRENGTH_MIRROR_SOURCE_SHA);
          } else if (path === CART_CHECKOUT_PATH || path === AFFILIATE_V2_PATH) {
            expect(sourceSha).toBe(CART_AFFILIATE_SOURCE_SHA);
          } else if (path === CART_COMPLETION_PATH) {
            expect(sourceSha).toBe(CART_COMPLETION_SOURCE_SHA);
          } else if (path === CART_DUPLICATE_GUARD_PATH) {
            expect(sourceSha).toBe(CART_DUPLICATE_GUARD_SOURCE_SHA);
          } else if (path === EA_HARDENING_PATH) {
            expect(sourceSha).toBe(EA_HARDENING_SOURCE_SHA);
          } else if (path === FM_CATEGORY_EXPANSION_PATH) {
            expect(sourceSha).toBe(FM_CATEGORY_EXPANSION_SOURCE_SHA);
          } else if (path === CART_SHIPPING_COMMITMENTS_PATH) {
            expect(sourceSha).toBe(CART_SHIPPING_COMMITMENTS_SOURCE_SHA);
          } else if (path === CART_QUANTITY_BAND_PATH) {
            expect(sourceSha).toBe(CART_QUANTITY_BAND_SOURCE_SHA);
          } else if (path === CART_QUANTITY_BAND_50_PATH) {
            expect(sourceSha).toBe(CART_QUANTITY_BAND_50_SOURCE_SHA);
          } else if (path === MEMBER_ORDER_HISTORY_PATH) {
            expect(sourceSha).toBe(MEMBER_ORDER_HISTORY_SOURCE_SHA);
          } else if (path === SEARCH_PATH_HARDENING_PATH) {
            expect(sourceSha).toBe(SEARCH_PATH_HARDENING_SOURCE_SHA);
          } else if (path === ASSISTED_ORDER_BRIDGE_PATH) {
            expect(sourceSha).toBe(ASSISTED_ORDER_BRIDGE_SOURCE_SHA);
          } else if (path === BULK_UNIT_FACTS_PATH) {
            expect(sourceSha).toBe(BULK_UNIT_FACTS_SOURCE_SHA);
          } else if (path === DECLARED_AFFILIATE_CODE_PATH) {
            expect(sourceSha).toBe(DECLARED_AFFILIATE_CODE_SOURCE_SHA);
          } else if (LAUNCH_CART_MIGRATION_PATHS.has(path)) {
            expect(sourceSha).toBe(LAUNCH_CART_MIGRATIONS_SOURCE_SHA);
          } else {
            expect(sourceSha).toBe(PRODUCTION_SHA);
            return execFileSync("git", ["cat-file", "blob", `${sourceSha}:${path}`], {
              cwd: ROOT,
              encoding: "buffer",
            });
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
    // This performs one immutable Git-blob read per DAG node. The current DAG
    // is substantially larger than the original 16-node fixture and Windows
    // worktree Git reads can exceed 30 s under fleet contention. This timeout
    // is execution headroom, not a performance assertion.
  }, 120_000);

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

  it("records every direct migration exactly once in the directory, ledger, and DAG", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    const managedMigrationPaths = managedMigrationPathsFromLedger(
      readFileSync(resolve(ROOT, "supabase/MIGRATIONS.md"), "utf8"),
    );
    const directoryPaths = checkedInManagedMigrationPaths();
    const dagPaths = dag.migrations.map((migration) => migration.path);
    expect(new Set(managedMigrationPaths).size).toBe(managedMigrationPaths.length);
    expect(new Set(dagPaths).size).toBe(dagPaths.length);
    expect([...managedMigrationPaths].sort()).toEqual(directoryPaths);
    expect([...dagPaths].sort()).toEqual(directoryPaths);

    const protectedNodes = dag.migrations.filter((migration) =>
      PROTECTED_PENDING_SOURCE_PATHS.has(migration.path),
    );
    expect(protectedNodes).toHaveLength(PROTECTED_PENDING_SOURCE_PATHS.size);
    expect(
      protectedNodes.map((migration) => ({
        id: migration.id,
        appliedToProduction: migration.appliedToProduction,
        managedMigrationId: migration.managedMigrationId,
        sourceSha: migration.sourceSha,
      })),
    ).toEqual([
      {
        id: "research_persistent_cart",
        appliedToProduction: false,
        managedMigrationId: "PENDING",
        sourceSha: PROTECTED_PENDING_SOURCE_SHA,
      },
      {
        id: "research_fulfillment_supplier_operations",
        appliedToProduction: false,
        managedMigrationId: "PENDING",
        sourceSha: PROTECTED_PENDING_SOURCE_SHA,
      },
      {
        id: "research_affiliate_professional_operations",
        appliedToProduction: false,
        managedMigrationId: "PENDING",
        sourceSha: PROTECTED_PENDING_SOURCE_SHA,
      },
      {
        id: "research_pricing_lineage",
        appliedToProduction: false,
        managedMigrationId: "PENDING",
        sourceSha: PROTECTED_PENDING_SOURCE_SHA,
      },
      {
        id: "research_rls_retro_hardening",
        appliedToProduction: false,
        managedMigrationId: "PENDING",
        sourceSha: PROTECTED_PENDING_SOURCE_SHA,
      },
    ]);

    const strengthGate = dag.migrations.find(
      (migration) => migration.id === "research_variant_strength_write_gate",
    );
    expect(strengthGate).toMatchObject({
      path: STRENGTH_GATE_PATH,
      sourceSha: STRENGTH_GATE_SOURCE_SHA,
      upstreamReviewedSourceSha: STRENGTH_GATE_UPSTREAM_REVIEW_SHA,
      dependsOn: [
        "research_product_control_center",
        "research_product_control_center_privilege_hardening",
      ],
      checksum: { algorithm: "sha256", value: STRENGTH_GATE_CHECKSUM },
      appliedToProduction: true,
      managedMigrationId: "20260801120000 research_variant_strength_write_gate",
      applyTwiceVerified: true,
      rollback: {
        strategy: "drop_gate_triggers_functions_and_registry_only_after_explicit_approval",
        procedure: "supabase/verification/research-variant-strength-write-gate.verify.sql",
      },
    });
    expect(strengthGate?.rollback.evidence).toContain("PostgreSQL 16.14 and 17.10");
    const strengthBytes = checkedInStrengthGateSourceBytes();
    expect(createHash("sha256").update(strengthBytes).digest("hex")).toBe(
      STRENGTH_GATE_CHECKSUM,
    );
    expect(
      dag.migrations.find((migration) => migration.id === "research_persistent_cart")
        ?.dependsOn,
    ).toEqual([
      "research_inventory_reservation_commands",
      "research_variant_strength_write_gate",
    ]);
  });

  it("rejects missing pending migration nodes and broken protected release order", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    const managedMigrationPaths = managedMigrationPathsFromLedger(
      readFileSync(resolve(ROOT, "supabase/MIGRATIONS.md"), "utf8"),
    );

    const missingPersistentCart = structuredClone(dag);
    missingPersistentCart.migrations = missingPersistentCart.migrations.filter(
      (migration) => migration.id !== "research_persistent_cart",
    );
    expect(
      validateMigrationDag(missingPersistentCart, {
        checkFiles: false,
        expectedBaselineSha: PRODUCTION_SHA,
        expectedManagedMigrationPaths: managedMigrationPaths,
      }).map((issue) => issue.code),
    ).toEqual(expect.arrayContaining([
      "MANAGED_MIGRATION_MISSING_FROM_DAG",
      "MISSING_PREREQUISITE",
    ]));

    const missingStrengthGate = structuredClone(dag);
    missingStrengthGate.migrations = missingStrengthGate.migrations.filter(
      (migration) => migration.id !== "research_variant_strength_write_gate",
    );
    expect(
      validateMigrationDag(missingStrengthGate, {
        checkFiles: false,
        expectedBaselineSha: PRODUCTION_SHA,
        expectedManagedMigrationPaths: managedMigrationPaths,
      }).map((issue) => issue.code),
    ).toEqual(expect.arrayContaining([
      "MANAGED_MIGRATION_MISSING_FROM_DAG",
      "MISSING_PREREQUISITE",
    ]));

    const brokenOrder = structuredClone(dag);
    const persistentCart = brokenOrder.migrations.find(
      (migration) => migration.id === "research_persistent_cart",
    );
    expect(persistentCart).toBeDefined();
    persistentCart!.dependsOn = ["research_inventory_reservation_commands"];
    expect(persistentCart!.dependsOn).not.toContain(
      "research_variant_strength_write_gate",
    );
    const requiredEdges = [
      ["research_variant_strength_write_gate", "research_product_control_center"],
      [
        "research_variant_strength_write_gate",
        "research_product_control_center_privilege_hardening",
      ],
      ["research_persistent_cart", "research_inventory_reservation_commands"],
      ["research_persistent_cart", "research_variant_strength_write_gate"],
      ["research_fulfillment_supplier_operations", "research_persistent_cart"],
      [
        "research_affiliate_professional_operations",
        "research_fulfillment_supplier_operations",
      ],
      ["research_pricing_lineage", "research_affiliate_professional_operations"],
      ["research_rls_retro_hardening", "research_pricing_lineage"],
    ] as const;
    const dependencyByNode = new Map(
      brokenOrder.migrations.map((migration) => [migration.id, migration.dependsOn]),
    );
    expect(
      requiredEdges.every(([id, dependency]) =>
        dependencyByNode.get(id)?.includes(dependency),
      ),
    ).toBe(false);
  });

  it("hashes canonical raw Git blobs and rejects newline-normalized bytes", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    const wave2 = dag.migrations.find(
      (migration) => migration.id === "research_inventory_lot_coa_admin",
    );
    expect(wave2).toMatchObject({
      sourceSha: WAVE2_SOURCE_SHA,
      upstreamReviewedSourceSha: WAVE2_UPSTREAM_REVIEW_SHA,
    });
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
        const raw = path === STRENGTH_GATE_PATH
          ? checkedInStrengthGateSourceBytes()
          : execFileSync("git", ["cat-file", "blob", `HEAD:${path}`], {
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
    // Spawns git once per pinned migration, so it grows with the chain and
    // breaches the 5s default under a full-repo parallel run. Same headroom
    // the other git-spawning control-plane tests carry: a timeout, not a
    // performance assertion.
  }, 30_000);

  it("rejects a canonical source pin that is not in release HEAD ancestry", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    const wave2 = dag.migrations.find(
      (migration) => migration.id === "research_inventory_lot_coa_admin",
    );
    expect(wave2).toBeDefined();
    wave2!.sourceSha = WAVE2_UPSTREAM_REVIEW_SHA;
    expect(
      validateMigrationDag(dag, {
        repoRoot: ROOT,
        expectedBaselineSha: PRODUCTION_SHA,
      }).map((issue) => issue.code),
    ).toContain("MIGRATION_SOURCE_NOT_RELEASE_ANCESTOR");
  }, 30_000);

  it("fails closed when a pinned migration source is unavailable", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    const wave2 = dag.migrations.find(
      (migration) => migration.id === "research_inventory_lot_coa_admin",
    );
    expect(wave2).toBeDefined();
    wave2!.sourceSha = "d494150668de2ede8a61fd0d28bc9ff9a75def26";
    expect(
      validateMigrationDag(dag, {
        repoRoot: ROOT,
        expectedBaselineSha: PRODUCTION_SHA,
      }).map((issue) => issue.code),
    ).toContain("MIGRATION_SOURCE_UNAVAILABLE");
    // Third member of the git-spawning family (one process per DAG node);
    // the 18-node DAG outgrew the 5 s default under full-suite parallelism.
  }, 30_000);

  it("binds a distinct managed migration path to the reviewed source blob", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    const reservation = dag.migrations.find(
      (migration) => migration.id === "research_inventory_reservation_commands",
    );
    expect(reservation).toMatchObject({
      path: "supabase/migrations/20260727160000_research_inventory_reservation_commands.sql",
      sourceSha: RESERVATION_SOURCE_SHA,
      sourcePath: RESERVATION_SOURCE_PATH,
      appliedToProduction: true,
      managedMigrationId: "20260727160000 research_inventory_reservation_commands",
    });
    expect(reservation?.checksum.value).toBe(
      "4e30807c7f58abc2d819abf509914364b55cba029586b3492329bacb7eef6005",
    );

    const source = checkedInReservationSourceBytes();
    const managed = execFileSync("git", ["show", `:${reservation!.path}`], {
      cwd: ROOT,
      encoding: "buffer",
    });
    expect(managed.equals(source)).toBe(true);

    const mismatchIssues = validateMigrationDag(dag, {
      repoRoot: ROOT,
      expectedBaselineSha: PRODUCTION_SHA,
      canonicalBytes: (sourceSha, path) => {
        if (path === RESERVATION_SOURCE_PATH) {
          expect(sourceSha).toBe(RESERVATION_SOURCE_SHA);
          return checkedInReservationSourceBytes();
        }
        return execFileSync("git", ["cat-file", "blob", `${sourceSha}:${path}`], {
          cwd: ROOT,
          encoding: "buffer",
        });
      },
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
    // Same git-spawning family as the canonical-checksum test: one process
    // per DAG node no longer fits the 5 s default under full-suite
    // parallelism on a loaded machine.
  }, 30_000);

  it("rejects unsafe or unpinned migration source paths", () => {
    const dag = JSON.parse(
      readFileSync(resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"), "utf8"),
    ) as MigrationDag;
    const reservation = dag.migrations.find(
      (migration) => migration.id === "research_inventory_reservation_commands",
    )!;
    reservation.appliedToProduction = false;
    reservation.managedMigrationId = "PENDING";
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
    const source = checkedInReservationSourceBytes();
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
      "4e30807c7f58abc2d819abf509914364b55cba029586b3492329bacb7eef6005",
    );
  });

  pg16It(
    "executes the complete production verifier against canonical production-shaped PostgreSQL",
    () => {
      const container = `xenios-pr95-verifier-${process.pid}`;
      const applySql = (source: string | Buffer): string =>
        execFileSync(
          "docker",
          [
            "exec",
            "-i",
            container,
            "psql",
            "-X",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
          ],
          {
            input: source,
            encoding: "utf8",
            maxBuffer: 32 * 1024 * 1024,
            stdio: ["pipe", "pipe", "pipe"],
          },
        );

      try {
        execFileSync(
          "docker",
          [
            "run",
            "--rm",
            "-d",
            "--name",
            container,
            "-e",
            "POSTGRES_PASSWORD=postgres",
            "postgres:16",
          ],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
        execFileSync(
          "docker",
          [
            "exec",
            container,
            "sh",
            "-c",
            "until pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done",
          ],
          { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] },
        );

        applySql(
          readFileSync(
            resolve(
              ROOT,
              "supabase/verification/research-inventory-lot-coa-disposable-bootstrap.sql",
            ),
          ),
        );
        applySql(`
          create schema if not exists storage;
          create table if not exists storage.buckets (
            id text primary key,
            name text not null,
            public boolean not null default false,
            file_size_limit bigint,
            allowed_mime_types text[]
          );
          alter table public.research_product_variants
            add column if not exists shipping_class text;
          create table if not exists public.research_members (
            id uuid primary key default gen_random_uuid()
          );
          create table if not exists public.research_applications (
            id uuid primary key default gen_random_uuid()
          );
          create table if not exists public.research_notification_outbox (
            id uuid primary key default gen_random_uuid()
          );
          create table if not exists public.research_required_inputs (
            id uuid primary key default gen_random_uuid()
          );
          create table if not exists public.research_domain_launch_controls (
            id uuid primary key default gen_random_uuid()
          );
          create table if not exists public.care_capabilities (
            capability_key text primary key,
            state text not null
          );
          insert into public.care_capabilities (capability_key, state)
          values ('care', 'disabled')
          on conflict (capability_key) do update set state = excluded.state;
        `);
        applySql(
          readFileSync(
            resolve(ROOT, "supabase/research-inventory-lot-coa-admin.sql"),
          ),
        );
        const beforeMigration = applySql(`
          select
            (to_regclass('public.research_lot_reservations') is null)::int
              as reservations_absent,
            (to_regclass('public.research_lot_reservation_allocations') is null)::int
              as allocations_absent;
        `);
        expect(beforeMigration).toContain("reservations_absent");
        expect(beforeMigration).toMatch(/\b1\s+\|\s+1\b/);
        const migration = readFileSync(
          resolve(
            ROOT,
            "supabase/migrations/20260727160000_research_inventory_reservation_commands.sql",
          ),
        );
        applySql(migration);
        applySql(migration);

        const afterMigration = applySql(`
          select
            count(*) filter (
              where to_regclass(format('public.%I', table_name)) is not null
            )::int as reservation_tables_present
          from (
            values
              ('research_lot_reservations'),
              ('research_lot_reservation_allocations'),
              ('research_inventory_reservation_events')
          ) as expected(table_name);

          select
            (select count(*) from public.research_lot_reservations)::int
              as reservation_rows,
            (select count(*) from public.research_lot_reservation_allocations)::int
              as allocation_rows,
            (select count(*) from public.research_inventory_reservation_events)::int
              as event_rows;
        `);
        expect(afterMigration).toMatch(/\b3\b/);
        expect(afterMigration).toMatch(/\b0\s+\|\s+0\s+\|\s+0\b/);

        const verifier = readFileSync(
          resolve(ROOT, "supabase/verify-research-inventory-reservation-commands.sql"),
        );
        const output = applySql(verifier);
        expect(output).toContain("research_lot_reservations");
        expect(output).toContain("applications");
        expect(output).toContain("care_disabled_rows");
        expect(verifier.toString("utf8")).not.toContain(
          "research_membership_applications",
        );
        expect(verifier.toString("utf8")).not.toContain("enabled = false");
      } finally {
        try {
          execFileSync("docker", ["rm", "-f", container], {
            stdio: ["ignore", "ignore", "ignore"],
          });
        } catch {
          // The container may already be gone after a startup failure.
        }
      }
    },
    120_000,
  );
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

  it("resolves constant-backed, templated, helper-joined, and finite-loop registrations", () => {
    const result = extractExpressRouteScan(
      `
        const ROUTES = { status: "/api/status", base: "/api/items" } as const;
        function route(base: string, suffix: string) { return base + suffix; }
        app.get(ROUTES.status, handler);
        app.post(\`${"${ROUTES.base}"}/:itemId\`, handler);
        for (const action of ["approve", "deny"] as const) {
          app.post(route(ROUTES.base, \`/${"${action}"}\`), handler);
        }
      `,
      "fixture.ts",
    );
    expect(result.issues).toEqual([]);
    expect(result.callSites).toBe(3);
    expect(result.routes.map((route) => `${route.method} ${route.path}`)).toEqual([
      "GET /api/status",
      "POST /api/items/:itemId",
      "POST /api/items/approve",
      "POST /api/items/deny",
    ]);
  });

  it("fails closed when an app/router route path is not statically resolvable", () => {
    const result = extractExpressRouteScan(
      `const dynamicPath = process.env.DYNAMIC_PATH; app.get(dynamicPath, handler);`,
      "unresolved.ts",
    );
    expect(result.routes).toEqual([]);
    expect(result.callSites).toBe(1);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "UNRESOLVED_ROUTE_PATH" }),
    ]);
  });

  it("covers every current Express API call site and finite registration", () => {
    const result = scanExpressRouteResult(ROOT);
    expect(result.issues).toEqual([]);
    // 338/347 as of the Early Access completion successor. Nine additions over
    // the frozen UX base, each deliberate:
    //   POST /api/admin/research/payments/:orderNumber/external-proof
    //   GET  /api/admin/research/payments/:orderNumber
    //   POST /api/research/early-access/cart/quote
    //   POST /api/research/early-access/cart/checkout
    //   GET  /api/research/early-access/cart/:cartCheckoutNumber
    // and, with the completion package:
    //   GET  /api/research/early-access/cart/capability
    //   GET  /api/research/early-access/cart/:cartCheckoutNumber/status
    //   POST /api/admin/research/cart/:cartCheckoutNumber/external-proof
    //   POST /api/admin/research/cart/:cartCheckoutNumber/confirm-payment
    //
    // The capability door is what lets the browser tell "cart off" (404) apart
    // from "cart broken", so the accepted single-product journey stays the
    // fallback rather than being replaced by an error state. The two admin
    // doors sit behind the SAME Supabase admin guard as every other operator
    // route and deliberately outside /api/research.
    //
    // All cart doors are registered only when
    // RESEARCH_EARLY_ACCESS_CART_ENABLED is exactly "true"; the scanner is a
    // SOURCE scan, so it counts the call sites either way, which is the
    // honest number to pin.
    // 339/348 with the payment lane integrated. The single addition:
    //   GET  /api/research/early-access/cart/:cartCheckoutNumber/payment-instructions
    //
    // Where the money actually goes. Registered inside the cart-enabled branch
    // like every other cart door, under /api/research so the research wall
    // answers an unauthenticated caller first, and GET-only because reading
    // payment instructions is not an action: nothing on that path can settle,
    // release or mark an order paid. Ownership is re-checked in the handler and
    // a checkout belonging to someone else gets the same 404 an unknown one
    // does, so the door discloses nothing by existing.
    //
    // 340/349 with the customer payment-proof door mounted. The single
    // addition, MEASURED rather than assumed:
    //   POST /api/research/early-access/cart/:cartCheckoutNumber/payment-proof
    //
    // The last step of the customer journey. Registered inside the same
    // cart-enabled branch, and additionally only when the DURABLE proof
    // dependencies were supplied, so a deployment that cannot persist a
    // submission has no door rather than one that forgets. The scanner is a
    // SOURCE scan, so it counts this call site whatever the flag and the
    // dependencies say at runtime, which is again the honest number to pin.
    //
    // The raw-body seam this door needs in server/index.ts is a predicate
    // middleware, not `app.use(path, ...)` and not a second `app.post`, so it
    // adds no registration here and cannot: a second registration of this path
    // would fail the uniqueness check below.
    //
    // 343/352 with the B2 and B3 compositions mounted. THREE additions, each
    // MEASURED rather than assumed, and each explained here because a route
    // count that moves without a reason in this file is the thing this pin
    // exists to catch:
    //
    //   GET  /api/admin/research/cart/:cartCheckoutNumber/confirm-payment
    //
    // B2's read-only payment review, on the SAME path as the one settlement
    // action rather than a second path of its own. GET decides nothing: it
    // reports the checkout, the settlement, the customer's submission
    // projection, the agreement standing and every blocker. Mounted only when
    // the durable review authority exists.
    //
    //   POST /api/admin/research/cart/:cartCheckoutNumber/fulfilment-event
    //
    // B3's named-admin shipment door. Every write goes through M62's
    // `research_early_access_record_cart_fulfilment_event`; there is no second
    // fulfilment mutation path and there could not be one, because the events
    // table is revoked from service_role.
    //
    //   POST /api/admin/research/cart/shipping-sla/sweep
    //
    // B3's manual drain for the 72-hour monitor, mirroring the notification
    // outbox's own `/api/admin/research/outbox/run`. A LITERAL path registered
    // before the parameterized cart admin routes, so `:cartCheckoutNumber`
    // cannot swallow `shipping-sla`. It runs the sweep and answers counters
    // only; it settles nothing and names no order.
    //
    // All three sit under /api/admin behind the SAME Supabase admin guard as
    // every other operator route, deliberately NOT under /api/research: the
    // research wall decides who may reach a CUSTOMER surface, and none of
    // these is one.
    //
    // 355/364 after the F-013 Early Access fusion. TWELVE additions, ZERO
    // removals, every one MEASURED with `scanGitTreeRouteResult` at the fusion
    // base against the fused head, never by reading diffs.
    //
    // AN EARLIER PIN HERE SAID 357/366 AND WAS WRONG, which is worth recording
    // because of how it was wrong. Two extra call sites came from
    // server/research/authenticated-landing.ts, a file that exists in NO lane
    // head and in no base. It was swept into the tree by a `git add -A` during
    // integration, after a `git stash -u` round trip left it in the worktree.
    // It was never anyone's feature. The pin was then raised to accommodate it,
    // and the two routes were mis-attributed to Pack02 in this very comment.
    //
    // That is the failure mode this guard exists for, arriving from the one
    // direction nobody watches: not an unintended route slipped in by a lane,
    // but by the integrator, and then legitimised by the integrator widening
    // the guard. Rebuilding the fusion without Pack04 branch ancestry dropped
    // the stray file, and the honest count fell by exactly two.
    //
    // Pack02 accounts and organizations, NINE:
    //   GET   /api/research/account/context
    //   POST  /api/research/account/claims/request
    //   POST  /api/research/account/claims/confirm
    //   POST  /api/research/account/security/password-change-complete
    //   POST  /api/research/account/organization-invitations/accept
    //   GET   /api/research/account/organizations/:organizationId/dashboard
    //   PATCH /api/research/account/organizations/:organizationId/profile
    //   POST  /api/research/account/organizations/:organizationId/users/invitations
    //   POST  /api/research/account/organizations/:organizationId/orders/request-again
    //
    // Buyer Commerce, ONE:
    //   POST  /api/research/buyer/order-requests
    //
    // Pack05 admin CRM and supplier operations, TWO, both under /api/admin
    // behind the same Supabase admin guard as every other operator route:
    //   GET   /api/admin/research/crm-supplier-operations
    //   POST  /api/admin/research/crm-supplier-operations/actions
    //
    // The catalog lane added ZERO. `registerMemberCatalogApi` was already
    // mounted at the fusion base, so the member catalog is reachable in the
    // fused tree without the catalog lane having registered anything. Two
    // reports disagreed about whether the catalog was "mounted"; both were
    // right, about different subjects.
    //
    // Pack04 added ZERO route call sites: its work is storage, persistence and
    // the customer order history projection, none of which is a new door.
    //
    // The 355/364 -> 359/368 move is MEASURED by the route scanner and
    // matches the accepted Buy Now client handoff's census. The four new call
    // sites are the Kris Launch A catalog registrations (the explicit route
    // table in server/index.ts); the pack02 account-identity mount registers
    // through its own registrar and adds ZERO scanner call sites, as does the
    // M67 order-history merge (legacy orders ride the existing member orders
    // service).
    //
    // The payment-rejection door (top-right, 2026-08-14) added ONE:
    //   POST /api/admin/research/payments/:orderNumber/reject
    // behind the same Supabase admin guard as the confirm door beside it.
    //
    // The 360/369 -> 366/375 move is the master-offerings v2 catalog mount
    // (Phase 0 of the general platform build, 2026-08-14): six explicit
    // read-only registrations in server/index.ts from the lane's own route
    // table, GET and OPTIONS for /api/research/catalog-display/v2/catalog,
    // /products/:family/:slug, and /price-list. Serving stays dark behind
    // RESEARCH_MASTER_OFFERINGS_ENABLED with a fail-closed founder/admin
    // launch scope, and the composition carries zero commerce authority
    // (no bindings, no identity, a throwing selection seam), so the census
    // records six reachable read doors and no new way to buy anything.
    // +10 (the assisted order bridge, founder directive 2026-08-15): the ten
    // real descriptors from the bridge's own route table, registered as
    // literal paths in server/index.ts. Six customer doors (config, catalog,
    // submit, status by public reference, and the two document steps) reach
    // the research wall's method-exact assisted-order admissions; four admin
    // doors sit behind requireSupabaseAdmin, outside that wall entirely. The
    // table's OPTIONS descriptors are deliberately not registered, so the
    // count is ten and not twenty. Serving stays dark behind
    // RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED, and a missing dependency keeps
    // the whole family unmounted with a named refusal in the log.
    // +6 (the minimum fulfillment + tracking engine, 2026-08-20): the lane's own
    // register() route table under server/research/fulfillment/register.ts —
    // GET and POST /api/research/fulfillment/admin/assignments, POST
    // .../admin/assignments/:assignmentId/transition, GET
    // .../supplier/assignments, POST .../supplier/assignments/:assignmentId/transition,
    // and GET /api/research/fulfillment/orders/:orderReference/status. The census
    // counts them because it scans server/**, but NOTHING IS MOUNTED: register()
    // is not called from server/index.ts, so none of these are reachable in any
    // deployment. They are counted here so that mounting them later is a visible
    // move rather than a silent one.
    // +12 (the customer-account release integration, 2026-08-27): nine
    // member-guarded customer-account registrations under
    // server/research/customer-account/routes.ts — GET overview/orders/
    // subscription/care/documents/support/catalog-priority, GET
    // documents/:documentId (ownership-scoped bytes), POST support — and the
    // three requireSupabaseAdmin client-import doors under
    // server/research/client-import/admin-routes.ts (POST dry-run, GET
    // :batchId, GET list). The nine customer-account registrations are
    // mounted from server/index.ts (catalog-priority behind the injected
    // requireActiveMember since the 2026-08-27 P1 remediation); the three
    // client-import doors are counted but PRODUCTION-DISABLED — their
    // registrar call is gated on RESEARCH_CLIENT_IMPORT_ADMIN_ENABLED ===
    // "true", so with the flag absent no client-import route exists in any
    // deployment (the census scans source, not a booted app). The member
    // surface is additionally admitted through the research wall's exact-path
    // customer-account entries (member-session-wall.test.ts pins both
    // directions).
    // +1 net (the Research full-site release candidate, 2026-08-28; scanner
    // diff of the pin commit 07fd479a against the candidate): +GET
    // /api/care/tebra/configuration (server/care/index.ts — the Lane 05 public
    // Care configuration read, mounted; fail-closed pending state until the
    // practice supplies real Tebra values); +GET /api/research/quality/lots/
    // :lotCode and +GET .../lots/:lotCode/documents/:documentId
    // (server/research/quality/public-lot-api.ts — counted because the census
    // scans server/**, but NOT MOUNTED: registerPublicQualityApi is never
    // called from server/index.ts, so no public lot API exists in any
    // deployment); −GET /api/r/:code and −GET /api/referral/capture
    // (server/index.ts — the referral-capture endpoints removed by the
    // attribution-privacy correction). 408 − 2 + 3 = 409 registrations across
    // 400 call sites.
    expect(result.callSites).toBe(400);
    expect(result.routes).toHaveLength(409);
    expect(validateRouteUniqueness(result.routes)).toEqual([]);
  }, 15_000);
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
        expectedProductionBranch: PRODUCTION_BRANCH,
        repoFiles,
      }),
    ).toEqual([]);
    // Ownership validation is O(repo files x rules) and already measures
    // 4.7s to 6.8s on current main, so the 5s default timeout makes this
    // assertion machine dependent. The assertion itself is unchanged.
    // 15 s and 120 s were both breached on the Windows integration machine
    // under a concurrent fleet run (the validator continues to make progress;
    // only the pin fires). This carries bounded execution headroom and is not
    // a performance assertion.
  }, 300_000);

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
  }, 30_000);

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
      {
        ...ownershipFixture(PRODUCTION_SHA, ["docs/coordination/**"]),
        productionBaselineReconciledAt: "not-a-date",
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
  }, 30_000);

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
      `Trusted release baseline accepted: ${PRODUCTION_SHA} / dep-da6vorqfngtc73brb0gg.`,
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
  }, 30_000);

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
  }, 30_000);

  it("accepts the externally attested release branch and rejects an exact-branch mismatch", () => {
    const { state, graph, ownership } = checkedInState();
    const acceptedCodes = validateProductionState(state, graph, ownership, {
      now: NOW,
      trustedReleaseBaseSha: PRODUCTION_SHA,
      migrationBaselineSha: PRODUCTION_SHA,
      expectedProductionBranch: PRODUCTION_BRANCH,
    }).map((issue) => issue.code);
    expect(acceptedCodes).not.toEqual(
      expect.arrayContaining(["PRODUCTION_BRANCH", "PRODUCTION_BRANCH_MISMATCH"]),
    );

    const mismatchCodes = validateProductionState(state, graph, ownership, {
      now: NOW,
      trustedReleaseBaseSha: PRODUCTION_SHA,
      migrationBaselineSha: PRODUCTION_SHA,
      expectedProductionBranch: "main",
    }).map((issue) => issue.code);
    expect(mismatchCodes).toContain("PRODUCTION_BRANCH_MISMATCH");
  }, 30_000);

  it("preserves the exact schema-2 data-posture semantics in the dated archive", () => {
    const legacyState = JSON.parse(readFileSync(
      resolve(ROOT, "docs/coordination/history/CURRENT_PRODUCTION_STATE_2026-07-30.json"),
      "utf8",
    )) as ProductionState;
    const legacyGraph = JSON.parse(readFileSync(
      resolve(ROOT, "docs/coordination/history/ACTIVE_RELEASE_GRAPH_2026-07-30.json"),
      "utf8",
    )) as ReleaseGraph;
    const { ownership } = checkedInState();
    const legacyOwnership = {
      ...ownership,
      productionBaseSha: legacyState.production.gitSha,
    };
    const codes = validateProductionState(legacyState, legacyGraph, legacyOwnership, {
      now: new Date("2026-07-30T21:30:00Z"),
      trustedReleaseBaseSha: legacyState.production.gitSha,
      migrationBaselineSha: legacyState.production.gitSha,
    }).map((issue) => issue.code);
    expect(codes).toEqual([]);
  }, 30_000);

  it("requires schema-3 dataPosture and runtimeConfig and rejects legacy current fields", () => {
    const checked = checkedInState();
    const legacyMixed = structuredClone(checked.state) as unknown as Record<string, unknown>;
    legacyMixed.productionCounts = {
      productControlRows: 0,
      productControlStorageObjects: 0,
    };
    legacyMixed.securityPosture = { careEnabled: false };
    expect(validateProductionState(
      legacyMixed as unknown as ProductionState,
      checked.graph,
      checked.ownership,
      {
        now: NOW,
        trustedReleaseBaseSha: PRODUCTION_SHA,
        migrationBaselineSha: PRODUCTION_SHA,
      },
    ).map((issue) => issue.code)).toContain("LEGACY_DATA_POSTURE_FIELDS");

    const missing = structuredClone(checked.state) as unknown as Record<string, unknown>;
    delete missing.dataPosture;
    delete missing.runtimeConfig;
    const missingCodes = validateProductionState(
      missing as unknown as ProductionState,
      checked.graph,
      checked.ownership,
      {
        now: NOW,
        trustedReleaseBaseSha: PRODUCTION_SHA,
        migrationBaselineSha: PRODUCTION_SHA,
      },
    ).map((issue) => issue.code);
    expect(missingCodes).toEqual(expect.arrayContaining([
      "DATA_POSTURE_CONTRADICTION",
      "RUNTIME_CONFIG_EVIDENCE_INVALID",
    ]));
  }, 30_000);

  it("requires available schema-3 posture to bind to dated database evidence", () => {
    const checked = checkedInState();
    const databaseEvidence = {
      id: "database-aggregates-20260828",
      kind: "database_aggregate_read",
      observedSha: PRODUCTION_SHA,
      checkedAt: NOW.toISOString(),
      detail: "Test-only authoritative database aggregate evidence.",
    };
    const available = structuredClone(checked.state);
    available.evidence = [...(available.evidence ?? []), databaseEvidence];
    available.dataPosture = {
      availability: "available",
      fabricatedDataCount: 0,
      seededProductCount: 0,
      seededPriceCount: 0,
      seededInventoryCount: 0,
      seededOrderCount: 0,
      careEnabled: false,
      evidenceId: databaseEvidence.id,
      checkedAt: databaseEvidence.checkedAt,
      statement: "Authoritative test fixture reports zero rows and disabled Care.",
    };
    const validate = (state: ProductionState) => validateProductionState(
      state,
      checked.graph,
      checked.ownership,
      {
        now: NOW,
        trustedReleaseBaseSha: PRODUCTION_SHA,
        migrationBaselineSha: PRODUCTION_SHA,
      },
    ).map((issue) => issue.code);
    expect(validate(available)).not.toEqual(expect.arrayContaining([
      "DATA_POSTURE_CONTRADICTION",
      "DATA_POSTURE_EVIDENCE_CONTRADICTION",
    ]));

    const unbound = structuredClone(available);
    if (unbound.dataPosture?.availability === "available") {
      unbound.dataPosture.evidenceId = "missing-database-evidence";
    }
    expect(validate(unbound)).toContain("DATA_POSTURE_EVIDENCE_CONTRADICTION");

    const timestampMismatch = structuredClone(available);
    if (timestampMismatch.dataPosture?.availability === "available") {
      timestampMismatch.dataPosture.checkedAt = "2026-08-28T04:04:00Z";
    }
    expect(validate(timestampMismatch)).toContain("DATA_POSTURE_EVIDENCE_CONTRADICTION");
  }, 30_000);

  it("binds every schema-3 candidate to a graph node by id, SHA, and state", () => {
    const checked = checkedInState();
    expect(checked.state.releaseCandidates.every(
      (candidate) => !candidate.headSha || Boolean(candidate.graphNodeId),
    )).toBe(true);
    expect(validateProductionState(checked.state, checked.graph, checked.ownership, {
      now: NOW,
      trustedReleaseBaseSha: PRODUCTION_SHA,
      migrationBaselineSha: PRODUCTION_SHA,
    }).map((issue) => issue.code)).not.toContain("CANDIDATE_GRAPH_CONTRADICTION");

    const missingNodeId = structuredClone(checked.state);
    delete missingNodeId.releaseCandidates[0].graphNodeId;
    expect(validateProductionState(missingNodeId, checked.graph, checked.ownership, {
      now: NOW,
      trustedReleaseBaseSha: PRODUCTION_SHA,
      migrationBaselineSha: PRODUCTION_SHA,
    }).map((issue) => issue.code)).toContain("CANDIDATE_GRAPH_CONTRADICTION");

    const shaMismatch = structuredClone(checked.graph);
    const failedNode = shaMismatch.nodes.find((node) => node.id === "failed-rc-a1bbc2a1");
    if (!failedNode) throw new Error("checked-in failed RC graph node is missing");
    failedNode.sha = "b".repeat(40);
    expect(validateProductionState(checked.state, shaMismatch, checked.ownership, {
      now: NOW,
      trustedReleaseBaseSha: PRODUCTION_SHA,
      migrationBaselineSha: PRODUCTION_SHA,
    }).map((issue) => issue.code)).toContain("CANDIDATE_GRAPH_CONTRADICTION");
  }, 30_000);

  it("preserves dated authority and lineage without re-attesting it as current", () => {
    const checked = checkedInState();
    const archivedStatePath = resolve(
      ROOT,
      "docs/coordination/history/CURRENT_PRODUCTION_STATE_2026-07-30.json",
    );
    const archivedGraphPath = resolve(
      ROOT,
      "docs/coordination/history/ACTIVE_RELEASE_GRAPH_2026-07-30.json",
    );
    expect(gitBlobSha(readFileSync(archivedStatePath))).toBe(
      "322df6d9feb008acc834df2ec0e87e008993e3dc",
    );
    expect(gitBlobSha(readFileSync(archivedGraphPath))).toBe(
      "3915f85c82ed05fcdfc7d43232364c4c0ca7d990",
    );
    expect(checked.state.historicalSnapshots?.every(
      (snapshot) => snapshot.classification === "HISTORICAL_SNAPSHOT_DO_NOT_TREAT_AS_CURRENT",
    )).toBe(true);
    expect(checked.graph.nodes.filter((node) => node.state === "AUDITED_BASELINE")).toEqual([
      expect.objectContaining({ sha: PRODUCTION_SHA, id: "production-3daa3f4a" }),
    ]);
    for (const id of [
      "founder-decision-lock-20260730",
      "founder-workaround-addendum-20260730",
      "founder-final-full-website-directive-20260730",
      "immutable-paid-order-evidence",
      "commission-payout-activation",
      "pr117-persistent-cart",
      "pr106-operations-affiliates",
      "pr144-pricing-model",
    ]) {
      expect(checked.graph.nodes.some((node) => node.id === id)).toBe(true);
    }

    const dag = JSON.parse(readFileSync(
      resolve(ROOT, "docs/coordination/MIGRATION_DAG.json"),
      "utf8",
    )) as MigrationDag;
    expect(checked.ownership.generatedAt).toBe("2026-08-03T16:00:00Z");
    expect(checked.ownership.productionBaselineReconciledAt).toBe("2026-08-28T04:01:00Z");
    expect(dag.generatedAt).toBe("2026-08-02T02:02:07Z");
    expect(dag.productionBaselineReconciledAt).toBe("2026-08-28T04:01:00Z");
  }, 30_000);

  it("accepts unavailable/null data posture without treating it as zero", () => {
    const checked = checkedInState();
    expect(checked.state.dataPosture).toEqual({
      availability: "unavailable",
      fabricatedDataCount: null,
      seededProductCount: null,
      seededPriceCount: null,
      seededInventoryCount: null,
      seededOrderCount: null,
      careEnabled: null,
      statement: expect.stringContaining("Null means unavailable"),
    });
    expect(validateProductionState(checked.state, checked.graph, checked.ownership, {
      now: NOW,
      trustedReleaseBaseSha: PRODUCTION_SHA,
      migrationBaselineSha: PRODUCTION_SHA,
    }).map((issue) => issue.code)).not.toContain("DATA_POSTURE_CONTRADICTION");

    const mixed = structuredClone(checked.state);
    mixed.dataPosture = {
      availability: "unavailable",
      fabricatedDataCount: 0,
      seededProductCount: null,
      seededPriceCount: null,
      seededInventoryCount: null,
      seededOrderCount: null,
      careEnabled: null,
      statement: "Invalid: unavailable cannot carry an authoritative zero.",
    } as unknown as ProductionState["dataPosture"];
    expect(validateProductionState(mixed, checked.graph, checked.ownership, {
      now: NOW,
      trustedReleaseBaseSha: PRODUCTION_SHA,
      migrationBaselineSha: PRODUCTION_SHA,
    }).map((issue) => issue.code)).toContain("DATA_POSTURE_CONTRADICTION");
  }, 30_000);

  it("rejects a contradictory available data posture", () => {
    const checked = checkedInState();
    const contradictory = structuredClone(checked.state);
    contradictory.dataPosture = {
      availability: "available",
      fabricatedDataCount: 1,
      seededProductCount: 0,
      seededPriceCount: 0,
      seededInventoryCount: 0,
      seededOrderCount: 0,
      careEnabled: false,
      evidenceId: "public-health-runtime-config-20260828",
      checkedAt: "2026-08-28T04:01:00Z",
      statement: "Invalid authoritative data for the zero-data invariant.",
    };
    expect(validateProductionState(
      contradictory,
      checked.graph,
      checked.ownership,
      {
        now: NOW,
        trustedReleaseBaseSha: PRODUCTION_SHA,
        migrationBaselineSha: PRODUCTION_SHA,
      },
    ).map((issue) => issue.code)).toContain("DATA_POSTURE_CONTRADICTION");
  }, 30_000);

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
  }, 30_000);
});
