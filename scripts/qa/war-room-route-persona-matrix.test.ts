import { beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  EXPECTED_ROUTE_CALL_SITES,
  EXPECTED_ROUTE_REGISTRATIONS,
  buildRoutePersonaMatrix,
  buildManualPaymentAcceptanceEvidence,
  buildSyntheticCommerceJourney,
  classifyPersona,
  validateMatrix,
  validateManualPaymentAcceptanceEvidence,
  validateSyntheticCommerceJourney,
  type RoutePersonaMatrix,
} from "./war-room-route-persona-matrix.mts";

const ROOT = resolve(import.meta.dirname, "../..");
let currentMatrix: ReturnType<typeof buildRoutePersonaMatrix>;

beforeAll(() => {
  currentMatrix = buildRoutePersonaMatrix(ROOT);
}, 30_000);

describe("war-room route/persona matrix", () => {
  it("classifies the protected namespaces without relying on aggregate counts", () => {
    expect(classifyPersona("/api/admin/research/capabilities")).toBe("research-admin");
    expect(classifyPersona("/api/admin/waitlist")).toBe("platform-admin");
    expect(classifyPersona("/api/research/applications")).toBe("research-applicant");
    expect(classifyPersona("/api/research/partner/dashboard")).toBe("research-partner");
    expect(classifyPersona("/api/research/documents")).toBe("research-member");
    expect(classifyPersona("/api/care/appointments")).toBe("care-private");
    expect(classifyPersona("/api/health")).toBe("public-or-system");
  });

  it("binds the exact-main route inventory to 307 registrations and 298 call sites", () => {
    const matrix = currentMatrix;
    expect(matrix.scannerIssues).toEqual([]);
    expect(matrix.registrations).toBe(EXPECTED_ROUTE_REGISTRATIONS);
    expect(matrix.callSites).toBe(EXPECTED_ROUTE_CALL_SITES);
    expect(validateMatrix(matrix)).toEqual([]);
    expect(matrix.rows.every((row) => row.file && row.line > 0 && row.persona)).toBe(true);
  }, 20_000);

  it("does not let a numerically green aggregate hide duplicate or missing persona evidence", () => {
    const matrix = currentMatrix;
    const falseGreen: RoutePersonaMatrix = {
      ...matrix,
      rows: matrix.rows.map((row, index) => index === 1 ? { ...row, identity: matrix.rows[0].identity } : row),
      personaCounts: { ...matrix.personaCounts, "care-private": 0 },
    };
    expect(validateMatrix(falseGreen)).toEqual(expect.arrayContaining([
      expect.stringContaining("duplicate route"),
      "persona coverage is incomplete",
    ]));
  }, 20_000);

  it("reports route-level false-green candidates for independent manual verification", () => {
    const matrix = currentMatrix;
    expect(matrix.falseGreenRows.length).toBeGreaterThan(0);
    expect(matrix.falseGreenRows.every((row) => row.falseGreenReasons.length > 0)).toBe(true);
    expect(matrix.falseGreenRows.every((row) => row.identity && row.file && row.line)).toBe(true);
  }, 20_000);

  it("proves the complete synthetic commerce journey with causal server evidence", () => {
    const journey = buildSyntheticCommerceJourney();
    expect(journey.map((row) => row.stage)).toEqual([
      "production-attestation", "account", "email-verification", "application", "approval", "eligible-variant",
      "affiliate-referral", "attribution", "cart", "reservation", "payment-tokenization", "test-payment",
      "signed-webhook", "immutable-order", "supplier-assignment", "tracking", "customer-order-history", "refund",
      "commission-adjustment", "super-admin", "reporting-mirror", "browser-qa", "release-candidate",
      "production-safe-smoke",
    ]);
    expect(validateSyntheticCommerceJourney(journey)).toEqual([]);
  });

  it("fails closed on skipped, vacuous, UI-only, live-provider, or broken causal evidence", () => {
    const journey = buildSyntheticCommerceJourney();
    const index = (stage: (typeof journey)[number]["stage"]) => journey.findIndex((row) => row.stage === stage);
    journey[index("cart")] = { ...journey[index("cart")], status: "SKIPPED", proofKinds: ["ui-only"] };
    journey[index("test-payment")] = { ...journey[index("test-payment")], providerMode: "live" };
    journey[index("signed-webhook")] = { ...journey[index("signed-webhook")], signatureVerified: false };
    journey[index("supplier-assignment")] = {
      ...journey[index("supplier-assignment")], predecessorId: journey[index("signed-webhook")].artifactId,
    };
    expect(validateSyntheticCommerceJourney(journey)).toEqual(expect.arrayContaining([
      "cart is skipped",
      "cart lacks causal non-UI evidence",
      "payment evidence is not test-mode only",
      "webhook signature is not verified",
      "supplier-assignment has a broken causal predecessor",
    ]));
  });

  it("rejects order mutation, over-refund, incorrect commission, and incomplete admin reconciliation", () => {
    const journey = buildSyntheticCommerceJourney();
    const index = (stage: (typeof journey)[number]["stage"]) => journey.findIndex((row) => row.stage === stage);
    journey[index("tracking")] = { ...journey[index("tracking")], immutableOrderDigest: "sha256:tampered" };
    journey[index("refund")] = { ...journey[index("refund")], refundCents: 20_000 };
    journey[index("commission-adjustment")] = {
      ...journey[index("commission-adjustment")], commissionBaseCents: 12_500,
    };
    journey[index("super-admin")] = { ...journey[index("super-admin")], referencedArtifactIds: [] };
    expect(validateSyntheticCommerceJourney(journey)).toEqual(expect.arrayContaining([
      "immutable order digest changes downstream",
      "refund amount is invalid",
      "commission base ignores refund-adjusted payment",
      "admin evidence does not reconcile every prior artifact",
    ]));
  });

  it("rejects Product Control, attribution, reporting, and production-smoke lineage gaps", () => {
    const journey = buildSyntheticCommerceJourney();
    const index = (stage: (typeof journey)[number]["stage"]) => journey.findIndex((row) => row.stage === stage);
    journey[index("cart")] = { ...journey[index("cart")], selectionDigest: "sha256:wrong-selection" };
    journey[index("immutable-order")] = { ...journey[index("immutable-order")], attributionId: "qa-wrong-attribution" };
    journey[index("reporting-mirror")] = { ...journey[index("reporting-mirror")], sanitized: false };
    journey[index("production-safe-smoke")] = {
      ...journey[index("production-safe-smoke")], readOnly: false, referencedArtifactIds: [],
    };
    expect(validateSyntheticCommerceJourney(journey)).toEqual(expect.arrayContaining([
      "product/variant/price/readiness selection lineage changes downstream",
      "affiliate attribution lineage changes downstream",
      "reporting mirror is not explicitly sanitized",
      "production-safe smoke is not read-only or does not reconcile all prior evidence",
    ]));
  });

  it("proves the manual-order-payment boundary without promoting or executing it", () => {
    const evidence = buildManualPaymentAcceptanceEvidence();
    expect(validateManualPaymentAcceptanceEvidence(evidence)).toEqual([]);
    expect(evidence.reportState).toBe("reported_unverified");
    expect(evidence.invoicePaid).toBe(false);
    expect(evidence.plannedEffects.every((effect) => effect.execution === "not_executed")).toBe(true);
    expect(evidence.supplierReleased).toBe(false);
  });

  it("fails closed on every material manual-payment authority and accounting regression", () => {
    const evidence = buildManualPaymentAcceptanceEvidence();
    evidence.evidenceKinds = ["ui-only"];
    evidence.reportState = "paid";
    evidence.invoicePaid = true;
    evidence.authorizedRoles = [...evidence.authorizedRoles, "member"];
    evidence.readsBeforeAuthorization = 1;
    evidence.exactReplayPlanEqual = false;
    evidence.changedReplayFailureCode = "accepted";
    evidence.reservationLineKeys = ["line_alpha", "line_alpha"];
    evidence.reservationIds = ["reservation_1", "reservation_1"];
    evidence.duplicateTransactionFailureCode = "accepted";
    evidence.duplicateProofFailureCode = "accepted";
    evidence.proposedRefundCents.line_alpha = 5_501;
    evidence.plannedEffects = evidence.plannedEffects.map((effect) =>
      effect.kind === "order_paid" || effect.kind === "supplier_release"
        ? { ...effect, execution: "executed" }
        : effect,
    );
    evidence.supplierReleased = true;
    expect(validateManualPaymentAcceptanceEvidence(evidence)).toEqual(expect.arrayContaining([
      "manual-payment evidence is skipped, vacuous, or UI-only",
      "payment proof or report marks the invoice paid",
      "manual-payment verification role authority is not exact",
      "manual-payment state was read before role authorization",
      "exact idempotent replay does not return the identical plan",
      "changed idempotency payload does not fail with idempotency_conflict",
      "reservation evidence is not exactly one unique hold per invoice line",
      "duplicate transaction evidence is not denied",
      "duplicate proof evidence is not denied",
      "refund exceeds verified line amount: line_alpha",
      "manual-payment plan contains an executed effect",
      "supplier release is absent from the held plan or has executed",
    ]));
  });
});
