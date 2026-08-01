/**
 * The Tebra care bridge: the referral record and its data boundary.
 *
 * Xenios owns the REFERRAL and a THIN STATUS. Tebra owns the clinical record.
 * Nothing clinical is stored here, and that is enforced three ways rather than
 * asked for in a comment:
 *
 *   1. The field set is CLOSED. `CARE_REFERRAL_FIELDS` is the whole record, and
 *      `careReferralRecord` only accepts an object whose keys are exactly that
 *      set, so an extra key is a compile error at the call site.
 *   2. There is NO free-text field. Every field is an enum, an opaque
 *      identifier, a two-letter state, a timestamp, or an operations handle
 *      that must match a slug pattern. A paragraph of clinical narrative has
 *      nowhere to sit, even in a correctly named field.
 *   3. A runtime guard rejects a payload carrying any forbidden clinical key
 *      before persistence is attempted, and names the category it matched
 *      without ever echoing the value back.
 */

/**
 * Route contracts for the bridge. They live here rather than in the shared
 * care contracts file so this change does not touch a file other lanes hold.
 */
export const CARE_REFERRAL_ROUTES = {
  referrals: "/api/care/referrals",
  concierge: "/api/care/referrals/concierge",
  queue: "/api/care/referrals/queue",
} as const;

/** The complete, closed field set of a Xenios care referral. */
export const CARE_REFERRAL_FIELDS = [
  "referralId",
  "internalUserId",
  "emrVendor",
  "externalEmrId",
  "serviceCategory",
  "stateCode",
  "status",
  "appointmentAt",
  "operationsOwner",
  "createdAt",
  "updatedAt",
  "synchronizedAt",
  "errorCode",
] as const;

export type CareReferralField = (typeof CARE_REFERRAL_FIELDS)[number];

/** The only EMR vendor this bridge speaks to. */
export const CARE_EMR_VENDORS = ["tebra"] as const;
export type CareEmrVendor = (typeof CARE_EMR_VENDORS)[number];

/**
 * Service categories are the coarse reason for the referral. They describe
 * which queue a referral belongs to, never a diagnosis or a treatment.
 */
export const CARE_SERVICE_CATEGORIES = [
  "general_consultation",
  "weight_management",
  "hormone_health",
  "longevity_consultation",
  "follow_up_visit",
] as const;

export type CareServiceCategory = (typeof CARE_SERVICE_CATEGORIES)[number];

export const CARE_SERVICE_CATEGORY_LABELS: Readonly<
  Record<CareServiceCategory, string>
> = {
  general_consultation: "General consultation",
  weight_management: "Weight management",
  hormone_health: "Hormone health",
  longevity_consultation: "Longevity consultation",
  follow_up_visit: "Follow up visit",
};

/**
 * Referral status is workflow state on the Xenios side of the boundary. None
 * of these values report a clinical outcome, and there is deliberately no
 * "treated", "approved", or "prescribed" status.
 */
export const CARE_REFERRAL_STATUSES = [
  "draft",
  "handoff_pending",
  "handoff_sent",
  "scheduled",
  "attended",
  "closed",
  "cancelled",
  "error",
] as const;

export type CareReferralStatus = (typeof CARE_REFERRAL_STATUSES)[number];

export const CARE_REFERRAL_STATUS_LABELS: Readonly<
  Record<CareReferralStatus, string>
> = {
  draft: "Draft",
  handoff_pending: "Handoff pending",
  handoff_sent: "Sent to Tebra",
  scheduled: "Scheduled",
  attended: "Attended",
  closed: "Closed",
  cancelled: "Cancelled",
  error: "Needs attention",
};

/** Error codes are a closed set so no adapter message can leak through. */
export const CARE_REFERRAL_ERROR_CODES = [
  "handoff_not_configured",
  "handoff_unreachable",
  "state_not_supported",
  "service_not_available_in_state",
  "external_record_missing",
  "synchronization_failed",
] as const;

export type CareReferralErrorCode = (typeof CARE_REFERRAL_ERROR_CODES)[number];

/**
 * The referral record. This interface is the boundary. Adding a clinical field
 * here would be a visible, reviewable change to the one type every write path
 * runs through, and the guard below would still have to be widened to allow it.
 */
export interface CareReferral {
  referralId: string;
  internalUserId: string;
  emrVendor: CareEmrVendor;
  /** Opaque. Xenios never parses it and never derives clinical meaning. */
  externalEmrId: string | null;
  serviceCategory: CareServiceCategory;
  stateCode: string;
  status: CareReferralStatus;
  appointmentAt: string | null;
  operationsOwner: string | null;
  createdAt: string;
  updatedAt: string;
  synchronizedAt: string | null;
  errorCode: CareReferralErrorCode | null;
}

/**
 * Compile-time exactness. `T` may not carry a key the referral does not have,
 * because any extra key is mapped to `never` and no value satisfies `never`.
 */
export type CareReferralExact<T> = CareReferral & {
  [K in Exclude<keyof T, CareReferralField>]: never;
};

/**
 * The only constructor. Passing an object literal or a variable with an extra
 * key fails to typecheck, so the closed set is enforced by the compiler and
 * not by review attention.
 */
export function careReferralRecord<T extends CareReferralExact<T>>(
  input: T,
): CareReferral {
  return {
    referralId: input.referralId,
    internalUserId: input.internalUserId,
    emrVendor: input.emrVendor,
    externalEmrId: input.externalEmrId,
    serviceCategory: input.serviceCategory,
    stateCode: input.stateCode,
    status: input.status,
    appointmentAt: input.appointmentAt,
    operationsOwner: input.operationsOwner,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    synchronizedAt: input.synchronizedAt,
    errorCode: input.errorCode,
  };
}

/* ── the runtime boundary ─────────────────────────────────────────────────── */

/** The clinical categories that may never be stored in a Xenios table. */
export const CARE_FORBIDDEN_CLINICAL_CATEGORIES = [
  "medical_history",
  "symptoms",
  "diagnosis",
  "clinical_notes",
  "prescriptions",
  "medication_list",
  "laboratory_results",
  "treatment_plan",
  "telehealth_recording",
  "provider_clinical_judgement",
] as const;

export type CareForbiddenClinicalCategory =
  (typeof CARE_FORBIDDEN_CLINICAL_CATEGORIES)[number];

export const CARE_FORBIDDEN_CATEGORY_LABELS: Readonly<
  Record<CareForbiddenClinicalCategory, string>
> = {
  medical_history: "medical history",
  symptoms: "symptoms",
  diagnosis: "a diagnosis",
  clinical_notes: "clinical notes",
  prescriptions: "a prescription",
  medication_list: "a medication list",
  laboratory_results: "laboratory results",
  treatment_plan: "a treatment plan",
  telehealth_recording: "a telehealth recording",
  provider_clinical_judgement: "provider clinical judgement",
};

/**
 * Longer markers are matched anywhere inside a normalized key, because a real
 * payload writes `patient_medical_history` rather than `medicalhistory`.
 */
const FORBIDDEN_SUBSTRINGS: Readonly<
  Record<CareForbiddenClinicalCategory, readonly string[]>
> = {
  medical_history: [
    "medicalhistory",
    "healthhistory",
    "pasthistory",
    "familyhistory",
    "surgicalhistory",
    "priorconditions",
    "allergy",
    "allergies",
    "comorbid",
  ],
  symptoms: [
    "symptom",
    "chiefcomplaint",
    "complaint",
    "presentingissue",
    "painlevel",
    "painscore",
  ],
  diagnosis: ["diagnosis", "diagnoses", "diagnostic", "icdcode", "icd10", "condition"],
  clinical_notes: [
    "clinicalnote",
    "chartnote",
    "encounternote",
    "visitnote",
    "progressnote",
    "soapnote",
    "clinicalsummary",
    "notes",
    "note",
  ],
  prescriptions: [
    "prescription",
    "prescribed",
    "refill",
    "directions",
    "pharmacyorder",
  ],
  medication_list: [
    "medication",
    "medicine",
    "dosage",
    "dose",
    "strength",
    "drug",
  ],
  laboratory_results: [
    "labresult",
    "labvalue",
    "labpanel",
    "laboratory",
    "biomarker",
    "bloodwork",
    "hba1c",
    "cholesterol",
    "glucose",
    "testresult",
  ],
  treatment_plan: [
    "treatmentplan",
    "careplan",
    "protocolplan",
    "regimen",
    "therapyplan",
    "treatment",
  ],
  telehealth_recording: [
    "recording",
    "transcript",
    "videourl",
    "audiourl",
    "sessionmedia",
  ],
  provider_clinical_judgement: [
    "clinicaljudgement",
    "clinicaljudgment",
    "clinicalopinion",
    "providerassessment",
    "clinicalassessment",
    "assessment",
    "impression",
  ],
};

/**
 * Short markers are matched only as a whole key, because two letters inside a
 * longer word is noise rather than signal.
 */
const FORBIDDEN_EXACT: Readonly<
  Record<CareForbiddenClinicalCategory, readonly string[]>
> = {
  medical_history: ["pmh", "hpi", "history"],
  symptoms: ["cc", "symptoms"],
  diagnosis: ["dx", "icd"],
  clinical_notes: ["soap", "chart"],
  prescriptions: ["rx", "sig"],
  medication_list: ["meds", "med"],
  laboratory_results: ["lab", "labs", "a1c", "panel"],
  treatment_plan: ["plan", "therapy", "protocol"],
  telehealth_recording: ["media"],
  provider_clinical_judgement: ["judgement", "judgment", "opinion"],
};

/** Lowercase and drop separators so `Medical-History` and `medical_history` match. */
export function normalizeCareFieldKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Which forbidden clinical category a field name belongs to, or null. Pure and
 * deterministic, so the same answer is available on the client and the server.
 */
export function forbiddenClinicalCategoryForKey(
  key: string,
): CareForbiddenClinicalCategory | null {
  const normalized = normalizeCareFieldKey(key);
  if (!normalized) return null;
  for (const category of CARE_FORBIDDEN_CLINICAL_CATEGORIES) {
    if (FORBIDDEN_EXACT[category].includes(normalized)) return category;
  }
  for (const category of CARE_FORBIDDEN_CLINICAL_CATEGORIES) {
    if (
      FORBIDDEN_SUBSTRINGS[category].some((marker) =>
        normalized.includes(marker),
      )
    ) {
      return category;
    }
  }
  return null;
}

export type CareReferralRejectionCode =
  | "clinical_field_rejected"
  | "unknown_field_rejected"
  | "invalid_field_value";

export interface CareReferralGuardRejection {
  ok: false;
  code: CareReferralRejectionCode;
  /** The offending field NAME only. The value is never copied anywhere. */
  field: string;
  category: CareForbiddenClinicalCategory | null;
  message: string;
}

export type CareReferralGuardResult =
  | { ok: true; referral: CareReferral }
  | CareReferralGuardRejection;

const ALLOWED = new Set<string>(CARE_REFERRAL_FIELDS);
const OPERATIONS_OWNER = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const OPAQUE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const STATE_CODE = /^[A-Z]{2}$/;

function reject(
  code: CareReferralRejectionCode,
  field: string,
  category: CareForbiddenClinicalCategory | null,
  message: string,
): CareReferralGuardRejection {
  return { ok: false, code, field, category, message };
}

/**
 * Walk a payload, including nested objects and arrays, and report the first
 * forbidden clinical key. Nesting matters: a caller that wraps notes in
 * `metadata: { clinicalNotes: ... }` is doing the same forbidden thing.
 */
export function findForbiddenClinicalKey(
  payload: unknown,
  path: readonly string[] = [],
): { field: string; category: CareForbiddenClinicalCategory } | null {
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const found = findForbiddenClinicalKey(entry, path);
      if (found) return found;
    }
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const category = forbiddenClinicalCategoryForKey(key);
    if (category) return { field: [...path, key].join("."), category };
    const found = findForbiddenClinicalKey(value, [...path, key]);
    if (found) return found;
  }
  return null;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP.test(value);
}

/**
 * THE WRITE CHOKEPOINT. Every persistence path calls this first. It refuses a
 * payload that carries a forbidden clinical key, refuses any key outside the
 * closed set, and refuses a value that does not match the narrow shape of its
 * field. Only on a clean payload does it return a referral to persist.
 */
export function guardCareReferralPayload(
  payload: unknown,
): CareReferralGuardResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return reject(
      "invalid_field_value",
      "referral",
      null,
      "A referral must be an object.",
    );
  }

  const forbidden = findForbiddenClinicalKey(payload);
  if (forbidden) {
    return reject(
      "clinical_field_rejected",
      forbidden.field,
      forbidden.category,
      `Xenios does not store ${CARE_FORBIDDEN_CATEGORY_LABELS[forbidden.category]}. That record stays in Tebra.`,
    );
  }

  const record = payload as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED.has(key)) {
      return reject(
        "unknown_field_rejected",
        key,
        null,
        "A referral may only carry the fields Xenios owns.",
      );
    }
  }

  const bad = (field: CareReferralField, message: string) =>
    reject("invalid_field_value", field, null, message);

  if (typeof record.referralId !== "string" || !OPAQUE_ID.test(record.referralId)) {
    return bad("referralId", "A referral id is required.");
  }
  if (
    typeof record.internalUserId !== "string" ||
    !OPAQUE_ID.test(record.internalUserId)
  ) {
    return bad("internalUserId", "An internal user id is required.");
  }
  if (
    typeof record.emrVendor !== "string" ||
    !(CARE_EMR_VENDORS as readonly string[]).includes(record.emrVendor)
  ) {
    return bad("emrVendor", "The EMR vendor is not recognized.");
  }
  if (
    record.externalEmrId !== null &&
    (typeof record.externalEmrId !== "string" ||
      !OPAQUE_ID.test(record.externalEmrId))
  ) {
    return bad("externalEmrId", "The external record id must be an opaque token.");
  }
  if (
    typeof record.serviceCategory !== "string" ||
    !(CARE_SERVICE_CATEGORIES as readonly string[]).includes(record.serviceCategory)
  ) {
    return bad("serviceCategory", "The service category is not recognized.");
  }
  if (typeof record.stateCode !== "string" || !STATE_CODE.test(record.stateCode)) {
    return bad("stateCode", "A two letter state code is required.");
  }
  if (
    typeof record.status !== "string" ||
    !(CARE_REFERRAL_STATUSES as readonly string[]).includes(record.status)
  ) {
    return bad("status", "The referral status is not recognized.");
  }
  if (record.appointmentAt !== null && !isIsoTimestamp(record.appointmentAt)) {
    return bad("appointmentAt", "The appointment time must be a timestamp.");
  }
  if (
    record.operationsOwner !== null &&
    (typeof record.operationsOwner !== "string" ||
      !OPERATIONS_OWNER.test(record.operationsOwner))
  ) {
    return bad(
      "operationsOwner",
      "The operations owner must be a short handle, so narrative cannot be stored here.",
    );
  }
  if (!isIsoTimestamp(record.createdAt)) {
    return bad("createdAt", "A created timestamp is required.");
  }
  if (!isIsoTimestamp(record.updatedAt)) {
    return bad("updatedAt", "An updated timestamp is required.");
  }
  if (record.synchronizedAt !== null && !isIsoTimestamp(record.synchronizedAt)) {
    return bad("synchronizedAt", "The synchronized time must be a timestamp.");
  }
  if (
    record.errorCode !== null &&
    (typeof record.errorCode !== "string" ||
      !(CARE_REFERRAL_ERROR_CODES as readonly string[]).includes(record.errorCode))
  ) {
    return bad("errorCode", "The error code is not recognized.");
  }

  return {
    ok: true,
    referral: careReferralRecord({
      referralId: record.referralId,
      internalUserId: record.internalUserId,
      emrVendor: record.emrVendor as CareEmrVendor,
      externalEmrId: record.externalEmrId as string | null,
      serviceCategory: record.serviceCategory as CareServiceCategory,
      stateCode: record.stateCode,
      status: record.status as CareReferralStatus,
      appointmentAt: (record.appointmentAt as string | null) ?? null,
      operationsOwner: (record.operationsOwner as string | null) ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      synchronizedAt: (record.synchronizedAt as string | null) ?? null,
      errorCode: (record.errorCode as CareReferralErrorCode | null) ?? null,
    }),
  };
}

/**
 * The read side of the boundary. Even if a stored row somehow gained a
 * clinical column, the value never reaches a rendered surface: only the closed
 * field set is projected, and nothing else is copied.
 */
export function projectCareReferral(row: unknown): CareReferral | null {
  const result = guardCareReferralPayload(pickCareReferralFields(row));
  return result.ok ? result.referral : null;
}

function pickCareReferralFields(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const source = row as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const field of CARE_REFERRAL_FIELDS) {
    picked[field] = field in source ? source[field] : null;
  }
  return picked;
}
