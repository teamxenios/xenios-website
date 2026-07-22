import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_IDENTITY_UPLOAD_CONFIG,
  FOUNDING_ACTIVATION_FLAG,
  IDENTITY_APPLICANT_GUIDANCE,
  IDENTITY_CASE_STATUSES,
  IDENTITY_CASE_TRANSITIONS,
  IDENTITY_PERMITTED_CONCEALMENT,
  IDENTITY_REJECTED_CONTENT_TYPES,
  IDENTITY_REQUIRED_VISIBLE,
  InMemoryIdentityMediaProvider,
  allowedIdentityContentTypes,
  canTransition,
  confirmIdentityUpload,
  consentGateOpen,
  forbiddenFieldNames,
  foundingActivationEnabled,
  markIdentityUploadExpired,
  openIdentityCase,
  recordIdentityConsent,
  requestIdentityUploadUrl,
  sanitizeIdentityFileName,
  submitIdentityCaseForReview,
  type IdentityDocumentCase,
} from "./identity-documents";

const NOW = new Date("2026-07-22T12:00:00.000Z");

function provider() {
  return new InMemoryIdentityMediaProvider();
}

function consentedCase(): IdentityDocumentCase {
  return recordIdentityConsent(openIdentityCase({ memberId: "member-1", now: NOW }), {
    accepted: true,
    consentVersion: "0.1.0-draft",
    now: NOW,
  });
}

async function uploadedCase(media = provider()): Promise<IdentityDocumentCase> {
  const requested = await requestIdentityUploadUrl(
    consentedCase(),
    { contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg", now: NOW },
    media,
  );
  if (!requested.ok) throw new Error("fixture upload request failed");
  const confirmed = await confirmIdentityUpload(requested.value.kase, media, NOW);
  if (!confirmed.ok) throw new Error("fixture upload confirm failed");
  return confirmed.value;
}

beforeEach(() => {
  process.env[FOUNDING_ACTIVATION_FLAG] = "true";
});

afterEach(() => {
  delete process.env[FOUNDING_ACTIVATION_FLAG];
});

// ---------------------------------------------------------------------------
// The flag
// ---------------------------------------------------------------------------

describe("the founding activation flag", () => {
  it("defaults to OFF and refuses the upload path", async () => {
    delete process.env[FOUNDING_ACTIVATION_FLAG];
    expect(foundingActivationEnabled()).toBe(false);
    const result = await requestIdentityUploadUrl(
      consentedCase(),
      { contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg", now: NOW },
      provider(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DISABLED");
  });

  it("only the exact string true enables it", () => {
    process.env[FOUNDING_ACTIVATION_FLAG] = "1";
    expect(foundingActivationEnabled()).toBe(false);
    process.env[FOUNDING_ACTIVATION_FLAG] = "true";
    expect(foundingActivationEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The twelve statuses
// ---------------------------------------------------------------------------

describe("the case status machine", () => {
  it("has exactly the twelve statuses from the spec", () => {
    expect(IDENTITY_CASE_STATUSES).toHaveLength(12);
    expect(new Set(IDENTITY_CASE_STATUSES).size).toBe(12);
    expect(IDENTITY_CASE_STATUSES).toEqual([
      "awaiting_consent",
      "consent_declined",
      "consent_recorded",
      "upload_url_issued",
      "upload_expired",
      "uploaded",
      "review_pending",
      "under_review",
      "verified",
      "rejected",
      "deletion_scheduled",
      "deleted",
    ]);
  });

  it("covers every status in the transition map and only allows known targets", () => {
    for (const status of IDENTITY_CASE_STATUSES) {
      const targets = IDENTITY_CASE_TRANSITIONS[status];
      expect(Array.isArray(targets)).toBe(true);
      for (const target of targets) {
        expect(IDENTITY_CASE_STATUSES).toContain(target);
      }
    }
  });

  it("makes consent_declined and deleted terminal", () => {
    expect(IDENTITY_CASE_TRANSITIONS.consent_declined).toEqual([]);
    expect(IDENTITY_CASE_TRANSITIONS.deleted).toEqual([]);
  });

  it("never allows skipping consent into the upload path", () => {
    expect(canTransition("awaiting_consent", "upload_url_issued")).toBe(false);
    expect(canTransition("consent_declined", "upload_url_issued")).toBe(false);
    expect(canTransition("consent_recorded", "upload_url_issued")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Consent first
// ---------------------------------------------------------------------------

describe("the consent-first gate", () => {
  it("opens a case awaiting consent, with nothing collected", () => {
    const kase = openIdentityCase({ memberId: "member-1", now: NOW });
    expect(kase.status).toBe("awaiting_consent");
    expect(kase.storagePath).toBeNull();
    expect(kase.consentRecordedAt).toBeNull();
    expect(consentGateOpen(kase)).toBe(false);
  });

  it("refuses to mint an upload URL before consent is recorded", async () => {
    const kase = openIdentityCase({ memberId: "member-1", now: NOW });
    const media = provider();
    const result = await requestIdentityUploadUrl(
      kase,
      { contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg", now: NOW },
      media,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONSENT_REQUIRED");
    // The provider was never even asked.
    expect(media.calls).toHaveLength(0);
  });

  it("declining consent is terminal and keeps the upload path shut forever", async () => {
    const declined = recordIdentityConsent(openIdentityCase({ memberId: "member-1", now: NOW }), {
      accepted: false,
      consentVersion: "0.1.0-draft",
      now: NOW,
    });
    expect(declined.status).toBe("consent_declined");
    expect(consentGateOpen(declined)).toBe(false);
    const result = await requestIdentityUploadUrl(
      declined,
      { contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg", now: NOW },
      provider(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONSENT_REQUIRED");
  });

  it("recording consent opens the gate and stamps version and time", () => {
    const kase = consentedCase();
    expect(kase.status).toBe("consent_recorded");
    expect(kase.consentVersion).toBe("0.1.0-draft");
    expect(kase.consentRecordedAt).toBe(NOW.toISOString());
    expect(consentGateOpen(kase)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Upload constraints
// ---------------------------------------------------------------------------

describe("upload constraints", () => {
  it("allows images only by default: no PDF without explicit configuration", () => {
    expect(allowedIdentityContentTypes(DEFAULT_IDENTITY_UPLOAD_CONFIG)).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    expect(DEFAULT_IDENTITY_UPLOAD_CONFIG.allowPdf).toBe(false);
    expect(
      allowedIdentityContentTypes({ ...DEFAULT_IDENTITY_UPLOAD_CONFIG, allowPdf: true }),
    ).toContain("application/pdf");
  });

  it("rejects SVG even if a misconfigured allowlist could admit it", async () => {
    expect(IDENTITY_REJECTED_CONTENT_TYPES).toContain("image/svg+xml");
    const result = await requestIdentityUploadUrl(
      consentedCase(),
      { contentType: "image/svg+xml", contentLengthBytes: 1000, fileName: "id.svg", now: NOW },
      provider(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REFUSED");
  });

  it("rejects a PDF upload while PDF is off by default", async () => {
    const result = await requestIdentityUploadUrl(
      consentedCase(),
      { contentType: "application/pdf", contentLengthBytes: 1000, fileName: "id.pdf", now: NOW },
      provider(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REFUSED");
  });

  it("enforces the size limit", async () => {
    const result = await requestIdentityUploadUrl(
      consentedCase(),
      {
        contentType: "image/jpeg",
        contentLengthBytes: DEFAULT_IDENTITY_UPLOAD_CONFIG.maxBytes + 1,
        fileName: "id.jpg",
        now: NOW,
      },
      provider(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REFUSED");
  });

  it("sanitizes file names and refuses executables, scripts, and traversal", () => {
    const config = DEFAULT_IDENTITY_UPLOAD_CONFIG;
    expect(sanitizeIdentityFileName("my id.jpg", config)).toBe("my_id.jpg");
    expect(sanitizeIdentityFileName("../../etc/passwd.png", config)).toBe("passwd.png");
    expect(sanitizeIdentityFileName("C:\\Users\\x\\card.webp", config)).toBe("card.webp");
    expect(sanitizeIdentityFileName("card.svg", config)).toBeNull();
    expect(sanitizeIdentityFileName("card.exe", config)).toBeNull();
    expect(sanitizeIdentityFileName("card.jpg.exe", config)).toBeNull();
    expect(sanitizeIdentityFileName("card", config)).toBeNull();
    expect(sanitizeIdentityFileName("card.pdf", config)).toBeNull();
    expect(sanitizeIdentityFileName("card.pdf", { ...config, allowPdf: true })).toBe("card.pdf");
  });

  it("generates a random, unguessable object key; the client names nothing", async () => {
    const media = provider();
    const first = await requestIdentityUploadUrl(
      consentedCase(),
      { contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg", now: NOW },
      media,
    );
    const second = await requestIdentityUploadUrl(
      consentedCase(),
      { contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg", now: NOW },
      media,
    );
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.grant.storagePath).not.toBe(second.value.grant.storagePath);
      expect(first.value.grant.storagePath).toMatch(
        /^identity\/xenios-research\/member-1\/[0-9a-f-]+-[0-9a-f]{24}$/,
      );
      expect(first.value.grant.storagePath).not.toContain("id.jpg");
    }
  });
});

// ---------------------------------------------------------------------------
// The upload lifecycle
// ---------------------------------------------------------------------------

describe("the upload lifecycle", () => {
  it("issues a URL, confirms the landed object, and submits for review", async () => {
    const media = provider();
    const kase = await uploadedCase(media);
    expect(kase.status).toBe("uploaded");
    expect(kase.uploadedAt).toBe(NOW.toISOString());
    const queued = submitIdentityCaseForReview(kase, NOW);
    expect(queued.status).toBe("review_pending");
  });

  it("refuses to confirm when storage says the object never landed", async () => {
    const media = provider();
    const requested = await requestIdentityUploadUrl(
      consentedCase(),
      { contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg", now: NOW },
      media,
      DEFAULT_IDENTITY_UPLOAD_CONFIG,
      () => "missing0000000000000000a",
    );
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    const confirmed = await confirmIdentityUpload(requested.value.kase, media, NOW);
    expect(confirmed.ok).toBe(false);
    if (!confirmed.ok) expect(confirmed.code).toBe("REFUSED");
  });

  it("an expired URL clears the pointer and allows a fresh URL without re-asking consent", async () => {
    const media = provider();
    const requested = await requestIdentityUploadUrl(
      consentedCase(),
      { contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg", now: NOW },
      media,
    );
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    const expired = markIdentityUploadExpired(requested.value.kase, NOW);
    expect(expired.status).toBe("upload_expired");
    expect(expired.storagePath).toBeNull();
    const again = await requestIdentityUploadUrl(
      expired,
      { contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg", now: NOW },
      media,
    );
    expect(again.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Applicant guidance and structural minimalism
// ---------------------------------------------------------------------------

describe("applicant guidance", () => {
  it("permits concealing the street address, all but the last 4, and the barcode", () => {
    expect(IDENTITY_PERMITTED_CONCEALMENT).toEqual([
      "street_address",
      "license_number_except_last_4",
      "barcode",
    ]);
  });

  it("requires name, photo, birth date, expiry, jurisdiction, and the last 4 visible", () => {
    expect(IDENTITY_REQUIRED_VISIBLE).toEqual([
      "legal_name",
      "photo",
      "date_of_birth",
      "expiration_date",
      "issuing_jurisdiction",
      "distinguishing_digits_last_4",
    ]);
  });

  it("tells the applicant, in words, that SSN is never requested", () => {
    const text = IDENTITY_APPLICANT_GUIDANCE.join(" ");
    expect(text).toMatch(/never ask for your Social Security number/);
  });

  it("never describes the review as forensic or KYC", () => {
    const text = IDENTITY_APPLICANT_GUIDANCE.join(" ");
    expect(text).not.toMatch(/kyc|forensic/i);
  });

  it("the case record has no field that could carry an SSN or document content", () => {
    const kase = openIdentityCase({ memberId: "member-1", now: NOW });
    expect(forbiddenFieldNames(kase)).toEqual([]);
    // The guard itself works: a smuggled field is caught.
    expect(forbiddenFieldNames({ ...kase, ssnLast4: "1234" } as object)).toEqual(["ssnLast4"]);
    expect(forbiddenFieldNames({ ...kase, licenseNumber: "full" } as object)).toEqual([
      "licenseNumber",
    ]);
  });
});
