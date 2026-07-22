import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FOUNDING_ACTIVATION_FLAG,
  InMemoryIdentityMediaProvider,
  confirmIdentityUpload,
  openIdentityCase,
  recordIdentityConsent,
  requestIdentityUploadUrl,
  submitIdentityCaseForReview,
  type IdentityDocumentCase,
} from "./identity-documents";
import {
  IDENTITY_AGE_THRESHOLD_YEARS,
  IDENTITY_REJECTION_CATEGORIES,
  IDENTITY_REVIEW_PERSISTED_FIELDS,
  IDENTITY_REVIEW_TYPE,
  assertMinimalVerificationRecord,
  completeIdentityReview,
  deriveReviewOutcome,
  identityActivationGate,
  isMaskedLast4,
  startIdentityReview,
  type IdentityReviewFindings,
  type IdentityVerificationRecord,
} from "./identity-reviews";

const NOW = new Date("2026-07-22T12:00:00.000Z");

beforeEach(() => {
  process.env[FOUNDING_ACTIVATION_FLAG] = "true";
});

afterEach(() => {
  delete process.env[FOUNDING_ACTIVATION_FLAG];
});

async function queuedCase(): Promise<IdentityDocumentCase> {
  const media = new InMemoryIdentityMediaProvider();
  const consented = recordIdentityConsent(openIdentityCase({ memberId: "member-1", now: NOW }), {
    accepted: true,
    consentVersion: "0.1.0-draft",
    now: NOW,
  });
  const requested = await requestIdentityUploadUrl(
    consented,
    { contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg", now: NOW },
    media,
  );
  if (!requested.ok) throw new Error("fixture request failed");
  const confirmed = await confirmIdentityUpload(requested.value.kase, media, NOW);
  if (!confirmed.ok) throw new Error("fixture confirm failed");
  return submitIdentityCaseForReview(confirmed.value, NOW);
}

const passingFindings: IdentityReviewFindings = {
  nameMatch: "match",
  ageThresholdMet: true,
  documentNotExpired: true,
  jurisdiction: "TX",
  licenseLast4: "4821",
};

// ---------------------------------------------------------------------------
// The review type and vocabulary
// ---------------------------------------------------------------------------

describe("the review vocabulary", () => {
  it("is a manual name and age review, nothing else", () => {
    expect(IDENTITY_REVIEW_TYPE).toBe("manual_name_age");
    expect(IDENTITY_AGE_THRESHOLD_YEARS).toBe(21);
  });

  it("never describes itself as forensic or KYC anywhere in its vocabulary", () => {
    const vocabulary = JSON.stringify({
      type: IDENTITY_REVIEW_TYPE,
      categories: IDENTITY_REJECTION_CATEGORIES,
      fields: IDENTITY_REVIEW_PERSISTED_FIELDS,
    });
    expect(vocabulary).not.toMatch(/kyc|forensic/i);
  });
});

// ---------------------------------------------------------------------------
// Running a review
// ---------------------------------------------------------------------------

describe("running a review", () => {
  it("requires a named reviewer and spends the queue state", async () => {
    const kase = await queuedCase();
    expect(() => startIdentityReview(kase, "", NOW)).toThrow(/named reviewer/);
    const { kase: open, start } = startIdentityReview(kase, "admin-sam", NOW);
    expect(open.status).toBe("under_review");
    expect(open.reviewId).toBe(start.reviewId);
    // A second reviewer cannot open the same case again.
    expect(() => startIdentityReview(open, "admin-two", NOW)).toThrow();
  });

  it("verifies when every check passes and writes the minimal record", async () => {
    const kase = await queuedCase();
    const { kase: open, start } = startIdentityReview(kase, "admin-sam", NOW);
    const { kase: done, record } = completeIdentityReview(open, start, passingFindings, NOW);
    expect(done.status).toBe("verified");
    expect(record.outcome).toBe("verified");
    expect(record.rejectionCategory).toBeNull();
    expect(record.reviewType).toBe("manual_name_age");
    expect(record.licenseLast4).toBe("4821");
    expect(record.jurisdiction).toBe("TX");
    expect(record.reviewerId).toBe("admin-sam");
    expect(record.rawSourceDeletedAt).toBeNull();
  });

  it("derives rejection from the findings, never from a reviewer's mood", () => {
    expect(deriveReviewOutcome({ ...passingFindings, nameMatch: "mismatch" })).toEqual({
      outcome: "rejected",
      rejectionCategory: "name_mismatch",
    });
    expect(deriveReviewOutcome({ ...passingFindings, ageThresholdMet: false })).toEqual({
      outcome: "rejected",
      rejectionCategory: "age_threshold_not_met",
    });
    expect(deriveReviewOutcome({ ...passingFindings, documentNotExpired: false })).toEqual({
      outcome: "rejected",
      rejectionCategory: "document_expired",
    });
    expect(
      deriveReviewOutcome({ ...passingFindings, nameMatch: "mismatch", rejectionCategory: "unreadable" }),
    ).toEqual({ outcome: "rejected", rejectionCategory: "unreadable" });
  });

  it("only the review that opened the case can complete it", async () => {
    const kase = await queuedCase();
    const { kase: open, start } = startIdentityReview(kase, "admin-sam", NOW);
    const forged = { ...start, reviewId: "some-other-review" };
    expect(() => completeIdentityReview(open, forged, passingFindings, NOW)).toThrow(
      /Only the review that opened/,
    );
  });
});

// ---------------------------------------------------------------------------
// The full-number contract
// ---------------------------------------------------------------------------

describe("the license fragment contract", () => {
  it("accepts exactly four characters and nothing longer", () => {
    expect(isMaskedLast4("4821")).toBe(true);
    expect(isMaskedLast4("AB12")).toBe(true);
    expect(isMaskedLast4("48215")).toBe(false);
    expect(isMaskedLast4("482")).toBe(false);
    expect(isMaskedLast4("12345678")).toBe(false);
  });

  it("refuses a full license number at review completion", async () => {
    const kase = await queuedCase();
    const { kase: open, start } = startIdentityReview(kase, "admin-sam", NOW);
    expect(() =>
      completeIdentityReview(open, start, { ...passingFindings, licenseLast4: "TX12345678" }, NOW),
    ).toThrow(/last four/);
  });

  it("the record type has no field for a full number, an image, a name, or an SSN", async () => {
    const kase = await queuedCase();
    const { kase: open, start } = startIdentityReview(kase, "admin-sam", NOW);
    const { record } = completeIdentityReview(open, start, passingFindings, NOW);
    // Structural: every persisted key is on the pinned list, and the pinned
    // list carries nothing that smells like document content.
    expect(Object.keys(record).sort()).toEqual([...IDENTITY_REVIEW_PERSISTED_FIELDS].sort());
    expect(() => assertMinimalVerificationRecord(record)).not.toThrow();
  });

  it("the structural guard catches a record that grew a forbidden field", async () => {
    const kase = await queuedCase();
    const { kase: open, start } = startIdentityReview(kase, "admin-sam", NOW);
    const { record } = completeIdentityReview(open, start, passingFindings, NOW);
    const smuggledSsn = { ...record, ssn: "000-00-0000" } as unknown as IdentityVerificationRecord;
    expect(() => assertMinimalVerificationRecord(smuggledSsn)).toThrow(/forbidden/);
    const smuggledNumber = {
      ...record,
      documentNumber: "TX12345678",
    } as unknown as IdentityVerificationRecord;
    expect(() => assertMinimalVerificationRecord(smuggledNumber)).toThrow(/forbidden/);
    const smuggledImage = { ...record, imageData: "base64" } as unknown as IdentityVerificationRecord;
    expect(() => assertMinimalVerificationRecord(smuggledImage)).toThrow(/forbidden/);
    const unknownField = { ...record, note: "hello" } as unknown as IdentityVerificationRecord;
    expect(() => assertMinimalVerificationRecord(unknownField)).toThrow(/unknown fields/);
    const overlong = { ...record, licenseLast4: "48215" } as unknown as IdentityVerificationRecord;
    expect(() => assertMinimalVerificationRecord(overlong)).toThrow(/four characters/);
  });
});

// ---------------------------------------------------------------------------
// The activation gate
// ---------------------------------------------------------------------------

describe("the activation gate", () => {
  async function completedRecord(findings: IdentityReviewFindings) {
    const kase = await queuedCase();
    const { kase: open, start } = startIdentityReview(kase, "admin-sam", NOW);
    return completeIdentityReview(open, start, findings, NOW).record;
  }

  it("blocks activation with no review at all", () => {
    expect(identityActivationGate(null)).toEqual({ blocked: true, reason: "identity_not_verified" });
  });

  it("a rejected review blocks activation outright", async () => {
    const record = await completedRecord({ ...passingFindings, ageThresholdMet: false });
    expect(identityActivationGate(record)).toEqual({ blocked: true, reason: "identity_rejected" });
  });

  it("only a verified manual_name_age review opens the gate", async () => {
    const record = await completedRecord(passingFindings);
    expect(identityActivationGate(record)).toEqual({ blocked: false, reviewId: record.reviewId });
    const otherLane = {
      ...record,
      reviewType: "vendor_automated",
    } as unknown as IdentityVerificationRecord;
    expect(identityActivationGate(otherLane)).toEqual({
      blocked: true,
      reason: "identity_not_verified",
    });
  });
});
