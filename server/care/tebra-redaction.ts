import { TEBRA_FAILURE_CODES, type TebraFailureCode, type TebraSyncEntity } from "@shared/care/tebra";

/**
 * One chokepoint for everything the connector is allowed to say out loud.
 *
 * Upstream SOAP faults routinely quote the record that failed, which for a
 * practice system means a name, a date of birth, or a contact detail. Anything
 * derived from an upstream error is therefore reduced to a fixed code before it
 * can reach a log, an audit row, an HTTP body, or a handoff.
 */

const SAFE_CODES = new Set<string>(TEBRA_FAILURE_CODES);

/**
 * Fields that must never appear in an audit detail or an error envelope. The
 * allowlist below is the real defense; this list exists so the guard can name
 * what it rejected without echoing the value.
 */
const FORBIDDEN_DETAIL_KEYS = [
  "firstname",
  "lastname",
  "name",
  "dateofbirth",
  "dob",
  "birthdate",
  "email",
  "phone",
  "address",
  "ssn",
  "mrn",
  "diagnosis",
  "medication",
  "prescription",
  "note",
  "reason",
  "password",
  "customerkey",
  "username",
  "token",
  "secret",
  "authorization",
] as const;

export interface TebraAuditDetail {
  operation: string;
  entity: TebraSyncEntity;
  localId: string | null;
  externalId: string | null;
  tebraId: string | null;
  success: boolean;
  code: TebraFailureCode | null;
  attempts: number | null;
}

/**
 * Reduce any thrown value to a code the connector is willing to publish. A
 * client implementation opts into a specific code by throwing an Error whose
 * message is exactly that code. Everything else, including a fault that quotes
 * patient data, collapses to tebra_unavailable.
 */
export function safeTebraErrorCode(error: unknown): TebraFailureCode {
  const message = error instanceof Error ? error.message : "";
  return SAFE_CODES.has(message) ? (message as TebraFailureCode) : "tebra_unavailable";
}

/**
 * Whether a failure is worth another attempt. Payload, configuration, and
 * linkage problems will fail identically on a retry, so only genuine
 * availability failures are retried.
 */
export function isRetryableTebraCode(code: TebraFailureCode): boolean {
  return code === "tebra_unavailable";
}

/**
 * Build an audit detail from an explicit allowlist. Callers cannot widen it,
 * because the returned object is constructed field by field rather than spread
 * from the input.
 */
export function tebraAuditDetail(input: {
  operation: string;
  entity: TebraSyncEntity;
  localId?: string | null;
  externalId?: string | null;
  tebraId?: string | null;
  success: boolean;
  code?: TebraFailureCode | null;
  attempts?: number | null;
}): TebraAuditDetail {
  return {
    operation: input.operation,
    entity: input.entity,
    localId: input.localId ?? null,
    externalId: input.externalId ?? null,
    tebraId: input.tebraId ?? null,
    success: input.success,
    code: input.code ?? null,
    attempts: input.attempts ?? null,
  };
}

/**
 * A defense in depth check for the audit sink. The allowlist above already
 * limits the shape, so a hit here means a caller bypassed the builder, and the
 * write is refused rather than quietly recorded.
 */
export function assertTebraDetailIsSafe(detail: Record<string, unknown>): void {
  for (const key of Object.keys(detail)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
    if ((FORBIDDEN_DETAIL_KEYS as readonly string[]).includes(normalized)) {
      throw new Error("tebra_audit_detail_rejected");
    }
  }
}

/**
 * The only body shape an admin route returns on failure. It carries a code and
 * nothing derived from the upstream response.
 */
export function tebraErrorEnvelope(code: TebraFailureCode) {
  return { ok: false as const, code };
}
