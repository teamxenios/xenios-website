import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scanExpressRouteResult,
  type RouteRegistration,
} from "../acceptance/verify-route-uniqueness.ts";

export const EXPECTED_ROUTE_REGISTRATIONS = 307;
export const EXPECTED_ROUTE_CALL_SITES = 298;

export type RoutePersona =
  | "public-or-system"
  | "platform-admin"
  | "research-admin"
  | "research-applicant"
  | "research-member"
  | "research-partner"
  | "care-private";

export type RouteMatrixRow = RouteRegistration & {
  identity: string;
  persona: RoutePersona;
  mutating: boolean;
  authEvidence: string[];
  falseGreenReasons: string[];
};

export type RoutePersonaMatrix = {
  registrations: number;
  callSites: number;
  rows: RouteMatrixRow[];
  personaCounts: Record<RoutePersona, number>;
  falseGreenRows: RouteMatrixRow[];
  scannerIssues: string[];
};

export const SYNTHETIC_JOURNEY_STAGES = [
  "production-attestation",
  "account",
  "email-verification",
  "application",
  "approval",
  "eligible-variant",
  "affiliate-referral",
  "attribution",
  "cart",
  "reservation",
  "payment-tokenization",
  "test-payment",
  "signed-webhook",
  "immutable-order",
  "supplier-assignment",
  "tracking",
  "customer-order-history",
  "refund",
  "commission-adjustment",
  "super-admin",
  "reporting-mirror",
  "browser-qa",
  "release-candidate",
  "production-safe-smoke",
] as const;

export type SyntheticJourneyStage = (typeof SYNTHETIC_JOURNEY_STAGES)[number];

export type SyntheticJourneyEvidence = {
  stage: SyntheticJourneyStage;
  taskKey: `E2E-${string}`;
  artifactId: string;
  predecessorId: string | null;
  principalId: string;
  evidenceMode: "synthetic";
  status: "PASS" | "FAIL" | "SKIPPED";
  proofKinds: string[];
  amountCents?: number;
  refundCents?: number;
  commissionBaseCents?: number;
  providerMode?: "test" | "live";
  signatureVerified?: boolean;
  immutableOrderDigest?: string;
  selectionDigest?: string;
  attributionId?: string;
  sanitized?: boolean;
  readOnly?: boolean;
  referencedArtifactIds?: string[];
};

export const MANUAL_PAYMENT_ACCEPTANCE_GATES = [
  "proof-never-marks-paid",
  "exact-role-authority",
  "zero-reads-before-auth",
  "exact-idempotent-replay",
  "changed-replay-conflicts",
  "reservation-cardinality",
  "duplicate-transaction-denied",
  "duplicate-proof-denied",
  "cumulative-line-refund-cap",
  "effects-remain-planned",
  "supplier-release-held",
] as const;

export type ManualPaymentAcceptanceGate = (typeof MANUAL_PAYMENT_ACCEPTANCE_GATES)[number];

export type ManualPaymentAcceptanceEvidence = {
  sourceMode: "uncommitted-local-snapshot" | "frozen-exact-sha";
  evidenceKinds: string[];
  reportState: string;
  invoicePaid: boolean;
  authorizedRoles: string[];
  readsBeforeAuthorization: number;
  exactReplayAccepted: boolean;
  exactReplayPlanEqual: boolean;
  changedReplayFailureCode: string;
  invoiceLineKeys: string[];
  reservationLineKeys: string[];
  reservationIds: string[];
  duplicateTransactionFailureCode: string;
  duplicateProofFailureCode: string;
  verifiedLineAmountCents: Record<string, number>;
  priorRefundCents: Record<string, number>;
  proposedRefundCents: Record<string, number>;
  plannedEffects: Array<{ kind: string; execution: string }>;
  supplierReleased: boolean;
};

export function buildManualPaymentAcceptanceEvidence(): ManualPaymentAcceptanceEvidence {
  return {
    sourceMode: "uncommitted-local-snapshot",
    evidenceKinds: ["source-contract", "focused-unit-tests", "causal-port-spies"],
    reportState: "reported_unverified",
    invoicePaid: false,
    authorizedRoles: ["admin", "operations_admin", "owner"],
    readsBeforeAuthorization: 0,
    exactReplayAccepted: true,
    exactReplayPlanEqual: true,
    changedReplayFailureCode: "idempotency_conflict",
    invoiceLineKeys: ["line_alpha", "line_beta"],
    reservationLineKeys: ["line_alpha", "line_beta"],
    reservationIds: ["reservation_1", "reservation_2"],
    duplicateTransactionFailureCode: "duplicate_transaction",
    duplicateProofFailureCode: "duplicate_proof",
    verifiedLineAmountCents: { line_alpha: 7_500, line_beta: 5_000 },
    priorRefundCents: { line_alpha: 2_000, line_beta: 0 },
    proposedRefundCents: { line_alpha: 5_000, line_beta: 0 },
    plannedEffects: [
      "payment_verified",
      "order_paid",
      "receipt_issue",
      "reservation_finalize",
      "supplier_release",
      "audit_append",
      "notification_enqueue",
      "commission_evaluate",
    ].map((kind) => ({ kind, execution: "not_executed" })),
    supplierReleased: false,
  };
}

export function validateManualPaymentAcceptanceEvidence(
  evidence: ManualPaymentAcceptanceEvidence,
): string[] {
  const issues: string[] = [];
  if (
    evidence.evidenceKinds.length === 0 ||
    evidence.evidenceKinds.some((kind) => /ui[-_ ]?only|skipped|vacuous/i.test(kind))
  ) {
    issues.push("manual-payment evidence is skipped, vacuous, or UI-only");
  }
  if (evidence.reportState !== "reported_unverified" || evidence.invoicePaid) {
    issues.push("payment proof or report marks the invoice paid");
  }
  const expectedRoles = ["admin", "operations_admin", "owner"];
  if (JSON.stringify([...evidence.authorizedRoles].sort()) !== JSON.stringify(expectedRoles)) {
    issues.push("manual-payment verification role authority is not exact");
  }
  if (evidence.readsBeforeAuthorization !== 0) {
    issues.push("manual-payment state was read before role authorization");
  }
  if (!evidence.exactReplayAccepted || !evidence.exactReplayPlanEqual) {
    issues.push("exact idempotent replay does not return the identical plan");
  }
  if (evidence.changedReplayFailureCode !== "idempotency_conflict") {
    issues.push("changed idempotency payload does not fail with idempotency_conflict");
  }
  const invoiceLines = [...evidence.invoiceLineKeys].sort();
  const reservationLines = [...evidence.reservationLineKeys].sort();
  if (
    invoiceLines.length === 0 ||
    new Set(invoiceLines).size !== invoiceLines.length ||
    reservationLines.length !== invoiceLines.length ||
    new Set(reservationLines).size !== reservationLines.length ||
    JSON.stringify(reservationLines) !== JSON.stringify(invoiceLines) ||
    new Set(evidence.reservationIds).size !== evidence.reservationIds.length ||
    evidence.reservationIds.length !== invoiceLines.length
  ) {
    issues.push("reservation evidence is not exactly one unique hold per invoice line");
  }
  if (evidence.duplicateTransactionFailureCode !== "duplicate_transaction") {
    issues.push("duplicate transaction evidence is not denied");
  }
  if (evidence.duplicateProofFailureCode !== "duplicate_proof") {
    issues.push("duplicate proof evidence is not denied");
  }
  const refundLineKeys = new Set([
    ...Object.keys(evidence.priorRefundCents),
    ...Object.keys(evidence.proposedRefundCents),
  ]);
  for (const lineKey of refundLineKeys) {
    const verified = evidence.verifiedLineAmountCents[lineKey];
    const prior = evidence.priorRefundCents[lineKey] ?? 0;
    const proposed = evidence.proposedRefundCents[lineKey] ?? 0;
    if (
      !Number.isSafeInteger(verified) || verified < 0 ||
      !Number.isSafeInteger(prior) || prior < 0 ||
      !Number.isSafeInteger(proposed) || proposed < 0 ||
      prior + proposed > verified
    ) {
      issues.push(`refund exceeds verified line amount: ${lineKey}`);
    }
  }
  if (
    evidence.plannedEffects.length === 0 ||
    evidence.plannedEffects.some((effect) => effect.execution !== "not_executed")
  ) {
    issues.push("manual-payment plan contains an executed effect");
  }
  const supplierRelease = evidence.plannedEffects.find((effect) => effect.kind === "supplier_release");
  if (!supplierRelease || supplierRelease.execution !== "not_executed" || evidence.supplierReleased) {
    issues.push("supplier release is absent from the held plan or has executed");
  }
  return issues;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const GUARD_MARKERS = [
  "requireActiveMember",
  "requireMember",
  "requireAdmin",
  "requireResearchAdmin",
  "requirePartner",
  "requireCare",
  "requireCapability",
  "requireSamuel",
  "verifyWebhook",
  "webhookSecret",
] as const;

const APPLICANT_PREFIXES = [
  "/api/research/access",
  "/api/research/applications",
  "/api/research/invite/",
  "/api/research/member/claim",
  "/api/research/member/forgot-password",
] as const;

export function classifyPersona(path: string): RoutePersona {
  if (path.startsWith("/api/admin/research")) return "research-admin";
  if (path.startsWith("/api/admin")) return "platform-admin";
  if (path.startsWith("/api/care")) return "care-private";
  if (path.startsWith("/api/research/partner")) return "research-partner";
  if (APPLICANT_PREFIXES.some((prefix) => path.startsWith(prefix))) return "research-applicant";
  if (path.startsWith("/api/research")) return "research-member";
  return "public-or-system";
}

function evidenceWindow(repoRoot: string, route: RouteRegistration): string {
  const lines = readFileSync(resolve(repoRoot, route.file), "utf8").split(/\r?\n/);
  const start = Math.max(0, route.line - 18);
  const end = Math.min(lines.length, route.line + 8);
  return lines.slice(start, end).join("\n");
}

export function routeAuthEvidence(repoRoot: string, route: RouteRegistration): string[] {
  const source = evidenceWindow(repoRoot, route);
  return GUARD_MARKERS.filter((marker) => source.includes(marker));
}

function reasonsFor(row: Omit<RouteMatrixRow, "falseGreenReasons">): string[] {
  const reasons: string[] = [];
  const privatePersona = row.persona !== "public-or-system" && row.persona !== "research-applicant";
  if (privatePersona && row.authEvidence.length === 0) {
    reasons.push("private persona has no nearby static auth/authorization marker");
  }
  if (row.mutating && row.persona === "public-or-system" && row.authEvidence.length === 0) {
    reasons.push("public/system mutation has no nearby static webhook/auth marker");
  }
  return reasons;
}

export function buildRoutePersonaMatrix(repoRoot: string): RoutePersonaMatrix {
  const scan = scanExpressRouteResult(repoRoot);
  const rows = scan.routes.map((route): RouteMatrixRow => {
    const partial = {
      ...route,
      identity: `${route.method} ${route.path}`,
      persona: classifyPersona(route.path),
      mutating: MUTATING_METHODS.has(route.method),
      authEvidence: routeAuthEvidence(repoRoot, route),
    };
    return { ...partial, falseGreenReasons: reasonsFor(partial) };
  });
  const personaCounts = Object.fromEntries(
    [
      "public-or-system",
      "platform-admin",
      "research-admin",
      "research-applicant",
      "research-member",
      "research-partner",
      "care-private",
    ].map((persona) => [persona, rows.filter((row) => row.persona === persona).length]),
  ) as Record<RoutePersona, number>;
  return {
    registrations: rows.length,
    callSites: scan.callSites,
    rows,
    personaCounts,
    falseGreenRows: rows.filter((row) => row.falseGreenReasons.length > 0),
    scannerIssues: scan.issues.map((issue) => `${issue.code}: ${issue.message}`),
  };
}

export function validateMatrix(matrix: RoutePersonaMatrix): string[] {
  const issues = [...matrix.scannerIssues];
  if (matrix.registrations !== EXPECTED_ROUTE_REGISTRATIONS) {
    issues.push(`registration drift: expected ${EXPECTED_ROUTE_REGISTRATIONS}, received ${matrix.registrations}`);
  }
  if (matrix.callSites !== EXPECTED_ROUTE_CALL_SITES) {
    issues.push(`call-site drift: expected ${EXPECTED_ROUTE_CALL_SITES}, received ${matrix.callSites}`);
  }
  const identities = new Set<string>();
  for (const row of matrix.rows) {
    if (identities.has(row.identity)) issues.push(`duplicate route: ${row.identity}`);
    identities.add(row.identity);
  }
  if (matrix.rows.length === 0 || Object.values(matrix.personaCounts).some((count) => count === 0)) {
    issues.push("persona coverage is incomplete");
  }
  return issues;
}

export function buildSyntheticCommerceJourney(): SyntheticJourneyEvidence[] {
  const principalId = "qa-principal-00000000-0000-4000-8000-000000000001";
  const orderDigest = "sha256:qa-immutable-order-snapshot-v1";
  const selectionDigest = "sha256:qa-product-variant-price-readiness-v1";
  const attributionId = "qa-attribution-00000000-0000-4000-8000-000000000001";
  const ids = SYNTHETIC_JOURNEY_STAGES.map((stage, index) => `qa-${String(index + 1).padStart(2, "0")}-${stage}`);
  const evidence = SYNTHETIC_JOURNEY_STAGES.map((stage, index): SyntheticJourneyEvidence => ({
    stage,
    taskKey: `E2E-${String(index + 1).padStart(3, "0")}`,
    artifactId: ids[index],
    predecessorId: index === 0 ? null : ids[index - 1],
    principalId,
    evidenceMode: "synthetic",
    status: "PASS",
    proofKinds: [`server-contract:${stage}`, `causal-link:${stage}`],
  }));

  const stageIndex = (stage: SyntheticJourneyStage): number => SYNTHETIC_JOURNEY_STAGES.indexOf(stage);
  for (let index = stageIndex("eligible-variant"); index < evidence.length; index += 1) {
    evidence[index] = { ...evidence[index], selectionDigest };
  }
  for (let index = stageIndex("affiliate-referral"); index < evidence.length; index += 1) {
    evidence[index] = { ...evidence[index], attributionId };
  }
  evidence[stageIndex("payment-tokenization")] = {
    ...evidence[stageIndex("payment-tokenization")], providerMode: "test",
  };
  evidence[stageIndex("test-payment")] = {
    ...evidence[stageIndex("test-payment")], providerMode: "test", amountCents: 12_500,
  };
  evidence[stageIndex("signed-webhook")] = {
    ...evidence[stageIndex("signed-webhook")], providerMode: "test", signatureVerified: true, amountCents: 12_500,
  };
  for (let index = stageIndex("immutable-order"); index < evidence.length; index += 1) {
    evidence[index] = { ...evidence[index], immutableOrderDigest: orderDigest };
  }
  evidence[stageIndex("refund")] = { ...evidence[stageIndex("refund")], providerMode: "test", refundCents: 2_500 };
  evidence[stageIndex("commission-adjustment")] = {
    ...evidence[stageIndex("commission-adjustment")], commissionBaseCents: 10_000,
  };
  evidence[stageIndex("super-admin")] = {
    ...evidence[stageIndex("super-admin")],
    referencedArtifactIds: evidence.slice(0, stageIndex("super-admin")).map((entry) => entry.artifactId),
  };
  evidence[stageIndex("reporting-mirror")] = {
    ...evidence[stageIndex("reporting-mirror")], sanitized: true,
  };
  evidence[stageIndex("browser-qa")] = { ...evidence[stageIndex("browser-qa")], readOnly: true };
  evidence[stageIndex("release-candidate")] = { ...evidence[stageIndex("release-candidate")], readOnly: true };
  evidence[stageIndex("production-safe-smoke")] = {
    ...evidence[stageIndex("production-safe-smoke")], readOnly: true,
    referencedArtifactIds: evidence.slice(0, stageIndex("production-safe-smoke")).map((entry) => entry.artifactId),
  };
  return evidence;
}

export function validateSyntheticCommerceJourney(evidence: SyntheticJourneyEvidence[]): string[] {
  const issues: string[] = [];
  if (evidence.length !== SYNTHETIC_JOURNEY_STAGES.length) {
    issues.push(`journey stage count mismatch: expected ${SYNTHETIC_JOURNEY_STAGES.length}, received ${evidence.length}`);
  }
  const ids = new Set<string>();
  for (let index = 0; index < SYNTHETIC_JOURNEY_STAGES.length; index += 1) {
    const row = evidence[index];
    const expectedStage = SYNTHETIC_JOURNEY_STAGES[index];
    if (!row) {
      issues.push(`missing stage: ${expectedStage}`);
      continue;
    }
    if (row.stage !== expectedStage) issues.push(`stage order mismatch at ${index}: expected ${expectedStage}, received ${row.stage}`);
    if (row.taskKey !== `E2E-${String(index + 1).padStart(3, "0")}`) issues.push(`${row.stage} has the wrong task key`);
    const expectedPredecessor = index === 0 ? null : evidence[index - 1]?.artifactId ?? null;
    if (row.predecessorId !== expectedPredecessor) issues.push(`${row.stage} has a broken causal predecessor`);
    if (ids.has(row.artifactId)) issues.push(`duplicate artifact id: ${row.artifactId}`);
    ids.add(row.artifactId);
    if (row.evidenceMode !== "synthetic") issues.push(`${row.stage} attempts non-synthetic evidence`);
    if (row.status !== "PASS") issues.push(`${row.stage} is ${row.status.toLowerCase()}`);
    if (row.proofKinds.length === 0 || row.proofKinds.some((proof) => /ui[-_ ]?only|vacuous|skipped/i.test(proof))) {
      issues.push(`${row.stage} lacks causal non-UI evidence`);
    }
    if (row.principalId !== evidence[0]?.principalId) issues.push(`${row.stage} changes principal identity`);
  }

  const payment = evidence.find((row) => row.stage === "test-payment");
  const tokenization = evidence.find((row) => row.stage === "payment-tokenization");
  const webhook = evidence.find((row) => row.stage === "signed-webhook");
  const order = evidence.find((row) => row.stage === "immutable-order");
  const refund = evidence.find((row) => row.stage === "refund");
  const commission = evidence.find((row) => row.stage === "commission-adjustment");
  const admin = evidence.find((row) => row.stage === "super-admin");
  const reporting = evidence.find((row) => row.stage === "reporting-mirror");
  const smoke = evidence.find((row) => row.stage === "production-safe-smoke");
  if (tokenization?.providerMode !== "test" || payment?.providerMode !== "test" || webhook?.providerMode !== "test" || refund?.providerMode !== "test") {
    issues.push("payment evidence is not test-mode only");
  }
  if (!webhook?.signatureVerified) issues.push("webhook signature is not verified");
  const eligible = evidence.find((row) => row.stage === "eligible-variant");
  if (!eligible?.selectionDigest || evidence.slice(SYNTHETIC_JOURNEY_STAGES.indexOf("eligible-variant")).some((row) => row.selectionDigest !== eligible.selectionDigest)) {
    issues.push("product/variant/price/readiness selection lineage changes downstream");
  }
  const affiliate = evidence.find((row) => row.stage === "affiliate-referral");
  if (!affiliate?.attributionId || evidence.slice(SYNTHETIC_JOURNEY_STAGES.indexOf("affiliate-referral")).some((row) => row.attributionId !== affiliate.attributionId)) {
    issues.push("affiliate attribution lineage changes downstream");
  }
  if (!order?.immutableOrderDigest) issues.push("immutable order digest is missing");
  if (order?.immutableOrderDigest && evidence.slice(SYNTHETIC_JOURNEY_STAGES.indexOf("immutable-order")).some((row) => row.immutableOrderDigest !== order.immutableOrderDigest)) {
    issues.push("immutable order digest changes downstream");
  }
  const paid = payment?.amountCents;
  const refunded = refund?.refundCents;
  if (!Number.isSafeInteger(paid) || (paid ?? 0) <= 0) issues.push("test payment amount is invalid");
  if (!Number.isSafeInteger(refunded) || (refunded ?? -1) < 0 || (refunded ?? 0) > (paid ?? 0)) issues.push("refund amount is invalid");
  if (commission?.commissionBaseCents !== (paid ?? 0) - (refunded ?? 0)) issues.push("commission base ignores refund-adjusted payment");
  const expectedAdminRefs = evidence.slice(0, SYNTHETIC_JOURNEY_STAGES.indexOf("super-admin")).map((row) => row.artifactId);
  if (JSON.stringify(admin?.referencedArtifactIds) !== JSON.stringify(expectedAdminRefs)) {
    issues.push("admin evidence does not reconcile every prior artifact");
  }
  if (!reporting?.sanitized) issues.push("reporting mirror is not explicitly sanitized");
  const expectedSmokeRefs = evidence.slice(0, SYNTHETIC_JOURNEY_STAGES.indexOf("production-safe-smoke")).map((row) => row.artifactId);
  if (!smoke?.readOnly || JSON.stringify(smoke.referencedArtifactIds) !== JSON.stringify(expectedSmokeRefs)) {
    issues.push("production-safe smoke is not read-only or does not reconcile all prior evidence");
  }
  return issues;
}

function isCli(): boolean {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url));
}

if (isCli()) {
  const root = process.cwd();
  const matrix = buildRoutePersonaMatrix(root);
  const issues = validateMatrix(matrix);
  console.log(JSON.stringify(matrix, null, 2));
  if (issues.length > 0) {
    for (const issue of issues) console.error(`MATRIX_ERROR: ${issue}`);
    process.exitCode = 1;
  }
}
