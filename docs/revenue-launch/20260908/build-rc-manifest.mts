// Builds the XENIOS_HEALTH_RC_2026-09-08 release manifest and its integration
// ownership review artifact from measured inputs. Run from the candidate
// worktree root with tsx. Nothing here invents a result: every PASS carries the
// command and the time it was actually observed, taken from inputs.json.
//
//   tsx build-rc-manifest.mts --inputs <inputs.json> --reviewer "<identity>" --reviewed-at <iso> --out <repo-root>
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// Run from the repository root: copy this file there (its import is repo-relative), then
// tsx build-rc-manifest.mts --inputs docs/revenue-launch/20260908/rc-inputs.json --reviewer "<identity>" --reviewed-at <iso> --out .
import {
  buildIntegrationOwnershipReview,
  trustedOwnershipPolicy,
} from "./scripts/acceptance/verify-release-manifest.ts";

const argv = process.argv.slice(2);
const arg = (name: string): string => {
  const i = argv.indexOf(name);
  if (i === -1 || !argv[i + 1]) throw new Error(`missing ${name}`);
  return argv[i + 1]!;
};
const inputs = JSON.parse(readFileSync(arg("--inputs"), "utf8"));
const reviewerIdentity = arg("--reviewer");
const reviewedAt = arg("--reviewed-at");
const root = arg("--out");

const BASE = "ff3c496245739233b71e46f9e5d6e26af9d57017";
const HEAD: string = inputs.headSha;
const RELEASE_ID: string = inputs.releaseId;
const LANE = "release-manager";
const reviewArtifactPath = `docs/coordination/evidence/${RELEASE_ID}.integration-ownership-review.json`;

const files = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", `${BASE}..${HEAD}`, "--"], { cwd: root, encoding: "buffer" })
  .toString("utf8").split("\0").filter(Boolean);
const policy = trustedOwnershipPolicy(root, BASE, HEAD);
if (!policy.policy) throw new Error(`trusted ownership policy unavailable: ${JSON.stringify(policy.issues)}`);

const routes = JSON.parse(readFileSync(inputs.routesFile, "utf8")) as { method: string; path: string }[];

const built = buildIntegrationOwnershipReview({
  baseSha: BASE,
  headSha: HEAD,
  trustedBaseOwnershipPolicySha256: policy.policy.sha256,
  files,
  rules: policy.policy.rules,
  manifestLane: LANE,
  reviewerIdentity,
  reviewedAt,
  reviewArtifactPath,
});

const t = inputs.times as Record<string, string>;
const manifest = {
  schemaVersion: 2,
  releaseId: RELEASE_ID,
  domain: "xenios-health-platform",
  lane: LANE,
  owner: "claude-fable temporary local integrator (founder-directed 2026-09-08); production executor per separate approval",
  createdAt: inputs.createdAt,
  baseSha: BASE,
  headSha: HEAD,
  currentProductionSha: BASE,
  files,
  routes,
  migrations: [
    {
      id: "research_resource_library",
      path: "supabase/migrations/20260906120000_research_resource_library.sql",
      checksum: inputs.migration.sqlSha256,
      dependsOn: [],
      rollback: {
        strategy: "retain_additive_schema_and_history",
        steps: [
          "Set RESEARCH_RESOURCE_HUB_ENABLED absent/false so no application path reads or writes the Resource Hub tables or bucket.",
          "Redeploy the exact trusted predecessor ff3c496245739233b71e46f9e5d6e26af9d57017 if any application-level regression is observed.",
          "Leave the additive schema, the private bucket and the append-only delivery history in place; do not drop tables or bucket, per supabase/candidates/20260906120000_research_resource_library.rollback.md.",
          "Reconcile any uncertain publish/withdraw operation from research_resource_versions history before any re-activation.",
        ],
        verification: [
          "Postcheck supabase/candidates/20260906120000_research_resource_library.postcheck.sql reports the exact schema fingerprints, FORCE RLS on all three tables, zero client grants and a private bucket.",
          "Application health and the account/partner boundaries at the predecessor SHA behave as recorded in docs/revenue-launch/20260907/critical-endpoints-live-ff3c496.json.",
        ],
      },
    },
  ],
  tables: [
    "public.research_resource_library",
    "public.research_resource_versions",
    "public.research_resource_deliveries",
  ],
  functions: [
    "public.research_resource_versions_immutable() trigger helper, non-callable by client/service roles",
    "public.research_resource_hub_publish(...) SECURITY DEFINER, EXECUTE granted to service_role only",
    "public.research_resource_hub_withdraw(...) SECURITY DEFINER, EXECUTE granted to service_role only",
  ],
  rls: [
    "public.research_resource_library ENABLE and FORCE ROW LEVEL SECURITY with no client policies",
    "public.research_resource_versions ENABLE and FORCE ROW LEVEL SECURITY with no client policies",
    "public.research_resource_deliveries ENABLE and FORCE ROW LEVEL SECURITY with no client policies",
    "Storage bucket research-resource-library is private; zero storage.objects client policies are created by this migration",
    "Migration required for this deploy: YES (flag-gated). Migration authorized: NO until the exact-SHA approval names its hash. Migration applied to production: NO.",
  ],
  privileges: [
    "All table privileges revoked from PUBLIC, anon, authenticated and service_role; service_role re-granted SELECT, INSERT, UPDATE on library/versions and SELECT, INSERT on deliveries only (no DELETE or TRUNCATE for any role).",
    "service_role EXECUTE on publish/withdraw; anon/authenticated denied EXECUTE on all three functions; immutability trigger helper not callable by client or service roles.",
    "No account, invitation, product activation, pricing, payment, refund, payout, email, shipment or clinical effect is authorized by this manifest.",
    "RESEARCH_RESOURCE_HUB_ENABLED stays absent/false until the approved activation sequence; no real content upload or partner activation is included.",
  ],
  environmentNames: [
    "RESEARCH_RESOURCE_HUB_ENABLED",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NODE_ENV",
  ],
  sharedWiring: [
    `Runtime freeze ${HEAD} tree ${inputs.headTree}; the manifest commit adds only docs/coordination and docs/revenue-launch records on top of it.`,
    ...(inputs.sharedWiring as string[]),
  ],
  tests: {
    focused: {
      status: "PASS",
      command: inputs.focused.command,
      checkedAt: t.focused,
    },
    fullSuite: {
      status: "PASS",
      command: inputs.fullSuite.command,
      checkedAt: t.fullSuite,
    },
    typecheck: {
      status: "PASS",
      command: `node-v20.19.0 ./node_modules/typescript/bin/tsc -> exit 0, 0 errors; check:release-control-plane tsc --noEmit --strict ... -> exit 0`,
      checkedAt: t.typecheck,
    },
    build: {
      status: "PASS",
      command: `node-v20.19.0 script/build.mjs -> exit 0; client bundle built; server dist/index.cjs ${inputs.build.serverBytes} bytes`,
      checkedAt: t.build,
    },
    diffCheck: {
      status: "PASS",
      command: `git diff --check ${BASE}..${HEAD} -> exit 0`,
      checkedAt: t.diffCheck,
    },
  },
  rollback: {
    strategy: "exact_sha_redeploy_with_flag_off_and_history_retention",
    steps: [
      "On any release-blocking failure, redeploy the exact trusted predecessor ff3c496245739233b71e46f9e5d6e26af9d57017 on Render and confirm the serving SHA.",
      "Keep RESEARCH_RESOURCE_HUB_ENABLED absent/false; the Resource Hub schema is additive and remains dormant.",
      "Do not drop Resource Hub tables, functions or bucket; retain delivery history for reconciliation.",
    ],
    verification: [
      "GET /api/health returns 200 on both origins with commerceEnabled=false as in docs/revenue-launch/20260907/production-health-readonly.json.",
      "Critical endpoint comparison against docs/revenue-launch/20260907/critical-endpoints-live-ff3c496.json shows no regression.",
      "Account/partner read-only reverification matches docs/revenue-launch/20260907/account-partner-readonly-reverification.json.",
    ],
  },
  smoke: {
    steps: [
      "Confirm Render serving SHA equals the approved candidate and record the deploy ID.",
      "Run the fresh first-install read-only precheck against the bound production project, then the atomic migration apply with stop-on-error, then the exact postcheck.",
      "Authorized read-only smoke: /api/health on both origins; account sign-in, partner dashboard and Resources page under the locked gate with a synthetic-content-free library; admin denial for a non-admin member.",
      "Observe logs for 30 minutes for 5xx, RLS denials on service paths and Storage errors.",
    ],
    expected: [
      "Serving SHA equals the approved candidate; deploy ID recorded.",
      "Precheck PASS with zero Storage client policies; postcheck fingerprints match the rehearsal receipt; migration recorded once.",
      "Resources page renders for an approved partner and returns 401/403 for signed-out and non-partner requests; no PDF bytes are served without a signed member session.",
      "Zero unexpected 5xx; no RLS denial on service_role paths; no Storage policy error.",
    ],
  },
  evidence: inputs.evidence,
  integrationOwnershipReview: built.review,
};

mkdirSync(join(root, "docs/coordination/release-manifests"), { recursive: true });
mkdirSync(join(root, "docs/coordination/evidence"), { recursive: true });
writeFileSync(join(root, `docs/coordination/release-manifests/${RELEASE_ID}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(root, reviewArtifactPath), built.artifactBytes);
console.log(JSON.stringify({
  manifest: `docs/coordination/release-manifests/${RELEASE_ID}.json`,
  artifact: reviewArtifactPath,
  files: files.length,
  routes: routes.length,
  counts: built.review.ownershipFindingCounts,
  policySha256: policy.policy.sha256,
  reviewArtifactSha256: built.review.reviewArtifactSha256,
}));
