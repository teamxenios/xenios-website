import type {
  CareClinicalIntake,
  CareIntakeDefinition,
  CareIntakeResponseValue,
  CareIntakeStartContext,
} from "@shared/care/intake";
import type { CareRecordId } from "@shared/care/contracts";

export type CareIntakeStartGate =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "eligibility_not_ready"
        | "definition_unavailable"
        | "telehealth_consent_mismatch"
        | "privacy_consent_mismatch";
    };

export function authorizeCareIntakeStart(
  context: CareIntakeStartContext,
): CareIntakeStartGate {
  if (
    context.eligibility.outcome !== "intake_available" ||
    context.eligibility.careEligibilityCleared
  ) {
    return { allowed: false, reason: "eligibility_not_ready" };
  }
  if (
    !context.definition ||
    context.definition.status !== "approved" ||
    !context.definition.approvedAt
  ) {
    return { allowed: false, reason: "definition_unavailable" };
  }
  if (
    !context.telehealthConsent.satisfied ||
    !context.telehealthConsent.activeEvent ||
    context.telehealthConsent.activeEvent.patientId !==
      context.eligibility.patientId
  ) {
    return { allowed: false, reason: "telehealth_consent_mismatch" };
  }
  if (
    !context.privacyConsent.satisfied ||
    !context.privacyConsent.activeEvent ||
    context.privacyConsent.activeEvent.patientId !==
      context.eligibility.patientId
  ) {
    return { allowed: false, reason: "privacy_consent_mismatch" };
  }
  return { allowed: true };
}

export function createCareClinicalIntake(input: {
  id: string;
  patientId: CareRecordId;
  context: CareIntakeStartContext;
  createdAt: Date;
}): CareClinicalIntake {
  const gate = authorizeCareIntakeStart(input.context);
  if (!gate.allowed) throw new Error(`care_intake_blocked:${gate.reason}`);

  const definition = input.context.definition!;
  return {
    id: input.id as CareRecordId,
    patientId: input.patientId,
    definitionId: definition.id,
    definitionVersion: definition.version,
    telehealthConsentEventId:
      input.context.telehealthConsent.activeEvent!.id,
    privacyConsentEventId: input.context.privacyConsent.activeEvent!.id,
    status: "draft",
    version: 0,
    createdAt: input.createdAt.toISOString(),
    submittedAt: null,
  };
}

export type CareIntakeValidationResult =
  | { valid: true }
  | {
      valid: false;
      code:
        | "unknown_field"
        | "invalid_value"
        | "required_field_missing";
      field: string;
    };

function valueMatches(
  kind: CareIntakeDefinition["fields"][number]["kind"],
  options: readonly string[],
  value: CareIntakeResponseValue,
): boolean {
  if (kind === "boolean") return typeof value === "boolean";
  if (kind === "multi_select") {
    return (
      Array.isArray(value) &&
      value.every(
        (item) => typeof item === "string" && options.includes(item),
      )
    );
  }
  if (typeof value !== "string") return false;
  if (kind === "single_select") return options.includes(value);
  if (kind === "date") return /^\d{4}-\d{2}-\d{2}$/.test(value);
  return value.length <= 4_000;
}

export function validateCareIntakeResponses(
  definition: CareIntakeDefinition,
  responses: Readonly<Record<string, CareIntakeResponseValue>>,
  requireComplete: boolean,
): CareIntakeValidationResult {
  const fields = new Map(definition.fields.map((field) => [field.key, field]));
  for (const [key, value] of Object.entries(responses)) {
    const field = fields.get(key);
    if (!field) return { valid: false, code: "unknown_field", field: key };
    if (!valueMatches(field.kind, field.options, value)) {
      return { valid: false, code: "invalid_value", field: key };
    }
  }
  if (requireComplete) {
    for (const field of definition.fields) {
      if (field.required && !(field.key in responses)) {
        return {
          valid: false,
          code: "required_field_missing",
          field: field.key,
        };
      }
    }
  }
  return { valid: true };
}
