import { describe, expect, it } from "vitest";
import {
  CARE_FORBIDDEN_CLINICAL_CATEGORIES,
  CARE_REFERRAL_FIELDS,
  careReferralRecord,
  findForbiddenClinicalKey,
  forbiddenClinicalCategoryForKey,
  guardCareReferralPayload,
  projectCareReferral,
  type CareForbiddenClinicalCategory,
  type CareReferral,
} from "./referral";
import {
  CARE_CONCIERGE_MAX_LENGTH,
  resolveCareHandoffConfig,
  screenCareConciergeMessage,
} from "./referral-handoff";

const REFERRAL: CareReferral = careReferralRecord({
  referralId: "ref-0001",
  internalUserId: "user-0001",
  emrVendor: "tebra",
  externalEmrId: null,
  serviceCategory: "general_consultation",
  stateCode: "IL",
  status: "handoff_pending",
  appointmentAt: null,
  operationsOwner: null,
  createdAt: "2026-08-01T15:00:00Z",
  updatedAt: "2026-08-01T15:00:00Z",
  synchronizedAt: null,
  errorCode: null,
});

/**
 * One realistic payload per forbidden category. Every value here is invented
 * placeholder text: no real person, record, or clinical detail is used.
 */
const FORBIDDEN_PAYLOADS: Readonly<
  Record<CareForbiddenClinicalCategory, Record<string, unknown>>
> = {
  medical_history: { medicalHistory: "REDACTED" },
  symptoms: { symptoms: "REDACTED" },
  diagnosis: { diagnosis: "REDACTED" },
  clinical_notes: { clinicalNotes: "REDACTED" },
  prescriptions: { prescription: "REDACTED" },
  medication_list: { medicationList: ["REDACTED"] },
  laboratory_results: { labResults: { value: "REDACTED" } },
  treatment_plan: { treatmentPlan: "REDACTED" },
  telehealth_recording: { recordingUrl: "https://example.invalid/x" },
  provider_clinical_judgement: { clinicalJudgement: "REDACTED" },
};

describe("care referral data boundary", () => {
  it("keeps the referral field set closed", () => {
    expect([...CARE_REFERRAL_FIELDS].sort()).toEqual(
      Object.keys(REFERRAL).sort(),
    );
  });

  it("makes an unlisted field a compile error, not a review question", () => {
    const attempt = () =>
      careReferralRecord({
        ...REFERRAL,
        // @ts-expect-error a clinical field has no place on a referral, and
        // the closed field set makes writing one fail to typecheck.
        diagnosis: "REDACTED",
      });
    // The runtime guard is the second line of the same boundary.
    expect(guardCareReferralPayload(attempt()).ok).toBe(true);
  });

  it("refuses every forbidden clinical category and names it", () => {
    for (const category of CARE_FORBIDDEN_CLINICAL_CATEGORIES) {
      const result = guardCareReferralPayload({
        ...REFERRAL,
        ...FORBIDDEN_PAYLOADS[category],
      });
      expect(result.ok, `${category} must be refused`).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe("clinical_field_rejected");
      expect(result.category).toBe(category);
    }
  });

  it("never echoes the offending value in the refusal", () => {
    const result = guardCareReferralPayload({
      ...REFERRAL,
      clinicalNotes: "a-very-distinctive-value",
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("a-very-distinctive-value");
  });

  it("finds a forbidden key nested inside a wrapper object", () => {
    const found = findForbiddenClinicalKey({
      metadata: { extra: [{ labResults: "REDACTED" }] },
    });
    expect(found?.category).toBe("laboratory_results");
    expect(found?.field).toBe("metadata.extra.labResults");
  });

  it("refuses an unlisted field even when it is not clinical", () => {
    const result = guardCareReferralPayload({ ...REFERRAL, marketingSource: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unknown_field_rejected");
  });

  it("leaves the referral's own field names alone", () => {
    for (const field of CARE_REFERRAL_FIELDS) {
      expect(forbiddenClinicalCategoryForKey(field)).toBeNull();
    }
    expect(guardCareReferralPayload(REFERRAL).ok).toBe(true);
  });

  it("refuses narrative in the operations owner, so no field takes free text", () => {
    const result = guardCareReferralPayload({
      ...REFERRAL,
      operationsOwner: "Please note the patient reported feeling unwell.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("operationsOwner");
  });

  it("refuses a status that would claim a clinical outcome", () => {
    const result = guardCareReferralPayload({ ...REFERRAL, status: "treated" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("status");
  });

  it("projects a stored row down to the closed field set on read", () => {
    const projected = projectCareReferral({
      ...REFERRAL,
      diagnosis: "REDACTED",
      clinicalNotes: "REDACTED",
    });
    expect(projected).toEqual(REFERRAL);
    expect(Object.keys(projected ?? {})).not.toContain("diagnosis");
  });

  it("refuses a payload that is not an object", () => {
    expect(guardCareReferralPayload("referral").ok).toBe(false);
    expect(guardCareReferralPayload([REFERRAL]).ok).toBe(false);
    expect(guardCareReferralPayload(null).ok).toBe(false);
  });
});

describe("care handoff configuration", () => {
  it("falls back to concierge when nothing is configured", () => {
    const config = resolveCareHandoffConfig({});
    expect(config.mode).toBe("concierge");
    expect(config.configured).toBe(false);
    expect(config.schedulingUrl).toBeNull();
  });

  it("uses a configured scheduling url and never invents one", () => {
    const config = resolveCareHandoffConfig({
      TEBRA_SCHEDULING_URL: "https://scheduling.example.invalid/book",
    });
    expect(config.mode).toBe("direct_url");
    expect(config.schedulingUrl).toBe("https://scheduling.example.invalid/book");
  });

  it("accepts the widget when only the widget is configured", () => {
    const config = resolveCareHandoffConfig({
      TEBRA_WIDGET_SCRIPT_URL: "https://widget.example.invalid/s.js",
    });
    expect(config.mode).toBe("widget");
  });

  it("refuses a non https or malformed scheduling url", () => {
    expect(
      resolveCareHandoffConfig({ TEBRA_SCHEDULING_URL: "http://insecure.invalid" })
        .mode,
    ).toBe("concierge");
    expect(
      resolveCareHandoffConfig({ TEBRA_SCHEDULING_URL: "not a url" }).mode,
    ).toBe("concierge");
  });
});

describe("concierge content screening", () => {
  it("accepts a plain contact request", () => {
    expect(screenCareConciergeMessage("Please call me weekday mornings.").ok).toBe(
      true,
    );
  });

  it("refuses a message that reads as clinical", () => {
    for (const text of [
      "I was diagnosed last year and want to talk about it",
      "I need a refill of my medication",
      "my lab results came back high",
      "I take 10 mg every morning",
      "I have chest pain when I walk",
    ]) {
      const result = screenCareConciergeMessage(text);
      expect(result.ok, text).toBe(false);
      expect(result.reason).toBe("clinical_content");
    }
  });

  it("refuses an empty or overlong message", () => {
    expect(screenCareConciergeMessage("   ").reason).toBe("empty");
    expect(
      screenCareConciergeMessage("a".repeat(CARE_CONCIERGE_MAX_LENGTH + 1)).reason,
    ).toBe("too_long");
  });
});
