import type {
  AdminCrmActionRecommendation,
  AdminCrmSupplierOperationsSnapshot,
  AdminCrmRecommendationInput,
  TrustDialMode,
} from "@shared/research/admin-crm-supplier-operations";
import {
  ADMIN_CRM_ACTIONS,
  ADMIN_CRM_ACTION_EVIDENCE,
  ADMIN_CRM_ACTION_TARGETS,
  ADMIN_OPERATIONAL_CONTROL_AREAS,
  ADMIN_OPERATIONS_AVAILABILITY,
  ADMIN_OPERATIONS_SOURCE_KEYS,
} from "@shared/research/admin-crm-supplier-operations";
import { parseAdminOperationsItems } from "./source-schemas";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:_.\/-]{0,199}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9:_.\/-]{7,199}$/;
const FORBIDDEN_OPERATIONAL_TERMS = [
  "diagnos", "medication", "prescription", "biometric", "assessment", "blueprint", "clinical", "health",
  "password", "secret", "accesstoken", "refreshtoken", "apikey", "privatekey", "paymentproof", "cardnumber",
  "bankaccount", "routingnumber", "patient",
] as const;
const SAFE_SOURCE_CODES = [
  "source_partial",
  "source_unavailable",
  "source_not_configured",
  "source_read_failed",
  "source_contract_invalid",
  "controls_evidence_partial",
  "controls_evidence_ambiguous",
] as const;
const TRUST_DIAL_MODES = ["auto", "queue", "ask", "never"] as const;
const SAFE_RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9:_.\/-]{0,199}$/;
const RESTRICTED_REASON_PATTERNS = [
  /\bdiagnos(?:is|es|tic)\b/i,
  /\b(?:patient|medication|prescription|biometric|assessment|clinical)\b/i,
  /\b(?:password|secret|access token|refresh token|api key|private key|card number|bank account|routing number)\b/i,
] as const;

export class AdminCrmRefusal extends Error {
  constructor(
    public readonly code:
      | "invalid_request"
      | "unsafe_request"
      | "trust_dial_never"
      | "unsafe_projection"
      | "source_evidence_invalid"
      | "operation_unavailable",
    message: string,
  ) {
    super(message);
  }
}

export interface AdminCrmRecommendationRecord {
  actorId: string;
  configuredTrustDial: TrustDialMode;
  input: AdminCrmRecommendationInput;
  recordState: AdminCrmActionRecommendation["recordState"];
  executionState: "not_executed";
  externalEffect: false;
  executor: null;
  requiresHumanApproval: true;
  evidenceSource: AdminCrmActionRecommendation["evidenceSource"];
  evidenceCheckedAt: string;
  createdAt: string;
}

/**
 * Storage implementations must record the non-executing recommendation and
 * its audit event in one transaction. No worker or executor port exists here.
 */
export interface AdminCrmSupplierOperationsRepository {
  readSnapshot(actorId: string): Promise<AdminCrmSupplierOperationsSnapshot>;
  readTrustDial(actorId: string, action: AdminCrmRecommendationInput["action"]): Promise<TrustDialMode>;
  recordRecommendationWithAudit(record: AdminCrmRecommendationRecord): Promise<AdminCrmActionRecommendation>;
}

export interface AdminCrmSupplierOperationsService {
  readSnapshot(actorId: string): Promise<AdminCrmSupplierOperationsSnapshot>;
  recordRecommendation(actorId: string, input: AdminCrmRecommendationInput): Promise<AdminCrmActionRecommendation>;
}

function assertIdentifier(value: string, label: string): void {
  if (!IDENTIFIER.test(value)) throw new AdminCrmRefusal("invalid_request", `${label} is invalid.`);
}

function assertNoRestrictedProjection(value: unknown, path = "snapshot"): void {
  if (typeof value === "string") {
    if (RESTRICTED_REASON_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new AdminCrmRefusal("unsafe_projection", `Restricted content refused at ${path}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRestrictedProjection(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    if (FORBIDDEN_OPERATIONAL_TERMS.some((term) => normalizedKey.includes(term))) {
      throw new AdminCrmRefusal("unsafe_projection", `Restricted field refused at ${path}.${key}.`);
    }
    assertNoRestrictedProjection(item, `${path}.${key}`);
  }
}

function isNormalizedIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function invalidSource(message: string): never {
  throw new AdminCrmRefusal("source_evidence_invalid", message);
}

function assertSourceEvidence(snapshot: AdminCrmSupplierOperationsSnapshot): void {
  if (!isNormalizedIsoTimestamp(snapshot.generatedAt)) {
    invalidSource("Snapshot timestamp is invalid.");
  }
  if (!(TRUST_DIAL_MODES as readonly string[]).includes(snapshot.trustDial)) {
    invalidSource("Trust Dial evidence is invalid.");
  }
  if (!snapshot.sources || typeof snapshot.sources !== "object" || Array.isArray(snapshot.sources)) {
    invalidSource("Source evidence is missing.");
  }

  const actualKeys = Object.keys(snapshot.sources).sort();
  const expectedKeys = [...ADMIN_OPERATIONS_SOURCE_KEYS].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    invalidSource("Source status evidence is incomplete or ambiguous.");
  }

  for (const key of ADMIN_OPERATIONS_SOURCE_KEYS) {
    const source = snapshot.sources[key];
    if (!source || typeof source !== "object") invalidSource(`Source evidence is missing for ${key}.`);
    if (!(ADMIN_OPERATIONS_AVAILABILITY as readonly string[]).includes(source.availability)) {
      invalidSource(`Source availability is invalid for ${key}.`);
    }
    if (!isNormalizedIsoTimestamp(source.checkedAt)) invalidSource(`Source timestamp is invalid for ${key}.`);
    const expectedMessage = source.availability === "available"
      ? `${key} source is available.`
      : source.availability === "partial"
        ? `${key} source returned partial evidence.`
        : `${key} source is unavailable in this environment.`;
    if (source.message !== expectedMessage) {
      invalidSource(`Source message is invalid for ${key}.`);
    }
    if (source.provenance !== `admin_ops.${key}`) invalidSource(`Source provenance is invalid for ${key}.`);
    if (source.availability === "available") {
      if (source.code !== null) invalidSource(`Available source ${key} cannot carry a failure code.`);
    } else if (!(SAFE_SOURCE_CODES as readonly string[]).includes(source.code)) {
      invalidSource(`Non-authoritative source ${key} requires a safe machine code.`);
    }

    if (source.availability === "unavailable") {
      if (source.items !== null) invalidSource(`Unavailable source ${key} cannot carry records.`);
    } else {
      try {
        parseAdminOperationsItems(key, source.items);
      } catch {
        invalidSource(`Source records are invalid for ${key}.`);
      }
    }
  }

  const seenAreas = new Set<string>();
  for (const control of snapshot.sources.controls.items ?? []) {
    if (!control || typeof control !== "object") invalidSource("Operational control evidence is invalid.");
    if (!(ADMIN_OPERATIONAL_CONTROL_AREAS as readonly string[]).includes(control.area) || seenAreas.has(control.area)) {
      invalidSource("Operational control evidence is missing, duplicate, or ambiguous.");
    }
    seenAreas.add(control.area);
  }
  if (
    snapshot.sources.controls.availability === "available" &&
    seenAreas.size !== ADMIN_OPERATIONAL_CONTROL_AREAS.length
  ) {
    invalidSource("A complete controls source must report every canonical control area.");
  }
}

function validateInput(input: AdminCrmRecommendationInput): void {
  if (!(ADMIN_CRM_ACTIONS as readonly string[]).includes(input.action)) {
    throw new AdminCrmRefusal("invalid_request", "action is invalid.");
  }
  assertIdentifier(input.targetType, "targetType");
  assertIdentifier(input.targetId, "targetId");
  if (ADMIN_CRM_ACTION_TARGETS[input.action] !== input.targetType) {
    throw new AdminCrmRefusal("invalid_request", "targetType does not match action.");
  }
  if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
    throw new AdminCrmRefusal("invalid_request", "idempotencyKey is invalid.");
  }
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 1000) {
    throw new AdminCrmRefusal("invalid_request", "reason must contain 8 to 1000 characters.");
  }
  if (RESTRICTED_REASON_PATTERNS.some((pattern) => pattern.test(reason))) {
    throw new AdminCrmRefusal("unsafe_request", "Restricted content is not permitted in an operations reason.");
  }
}

export function createAdminCrmSupplierOperationsService(
  repository: AdminCrmSupplierOperationsRepository,
  now: () => string = () => new Date().toISOString(),
): AdminCrmSupplierOperationsService {
  const readValidatedSnapshot = async (actorId: string): Promise<AdminCrmSupplierOperationsSnapshot> => {
    assertIdentifier(actorId, "actorId");
    const snapshot = await repository.readSnapshot(actorId);
    assertSourceEvidence(snapshot);
    assertNoRestrictedProjection(snapshot);
    return snapshot;
  };

  return {
    readSnapshot: readValidatedSnapshot,

    async recordRecommendation(actorId, input) {
      assertIdentifier(actorId, "actorId");
      validateInput(input);
      const trustDial = await repository.readTrustDial(actorId, input.action);
      if (trustDial === "never") {
        throw new AdminCrmRefusal("trust_dial_never", "This action is disabled by the Trust Dial.");
      }

      const snapshot = await readValidatedSnapshot(actorId);
      if (snapshot.trustDial === "never") {
        throw new AdminCrmRefusal(
          "trust_dial_never",
          "This workspace is disabled by the Trust Dial.",
        );
      }
      const evidence = ADMIN_CRM_ACTION_EVIDENCE[input.action];
      const evidenceSource = snapshot.sources[evidence.source];
      if (evidenceSource.availability === "unavailable") {
        throw new AdminCrmRefusal("operation_unavailable", "Authoritative target evidence is unavailable.");
      }
      const visibleEvidence = evidenceSource.items as unknown as Array<Record<string, unknown>>;
      const targetExists = visibleEvidence.some((item) => item[evidence.idField] === input.targetId);
      if (!targetExists) {
        throw new AdminCrmRefusal("operation_unavailable", "The target is absent from the visible source evidence.");
      }

      // Every mode except `never` records research for human review only.
      // `auto` is configuration evidence, never execution permission.
      const recordState: AdminCrmActionRecommendation["recordState"] = trustDial === "ask"
        ? "awaiting_human_review"
        : "recorded";
      const createdAt = now();
      if (!isNormalizedIsoTimestamp(createdAt)) {
        throw new AdminCrmRefusal("operation_unavailable", "Recommendation clock is unavailable.");
      }
      const persisted = await repository.recordRecommendationWithAudit({
        actorId,
        configuredTrustDial: trustDial,
        input: { ...input, reason: input.reason.trim() },
        recordState,
        executionState: "not_executed",
        externalEffect: false,
        executor: null,
        requiresHumanApproval: true,
        evidenceSource: evidence.source,
        evidenceCheckedAt: evidenceSource.checkedAt,
        createdAt,
      });
      if (
        !persisted ||
        !SAFE_RECORD_ID.test(persisted.recordId) ||
        !isNormalizedIsoTimestamp(persisted.createdAt) ||
        typeof persisted.idempotentReplay !== "boolean" ||
        persisted.action !== input.action ||
        persisted.targetType !== input.targetType ||
        persisted.targetId !== input.targetId ||
        !(TRUST_DIAL_MODES as readonly string[]).includes(persisted.configuredTrustDial) ||
        persisted.configuredTrustDial === "never" ||
        !(["recorded", "awaiting_human_review"] as const).includes(persisted.recordState) ||
        persisted.executionState !== "not_executed" ||
        persisted.externalEffect !== false ||
        persisted.executor !== null ||
        persisted.requiresHumanApproval !== true ||
        persisted.evidenceSource !== evidence.source ||
        !isNormalizedIsoTimestamp(persisted.evidenceCheckedAt) ||
        (!persisted.idempotentReplay && (
          persisted.configuredTrustDial !== trustDial ||
          persisted.recordState !== recordState ||
          persisted.evidenceCheckedAt !== evidenceSource.checkedAt ||
          persisted.createdAt !== createdAt
        ))
      ) {
        throw new AdminCrmRefusal("operation_unavailable", "Recommendation receipt is invalid.");
      }
      return {
        recordId: persisted.recordId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        recordState: persisted.recordState,
        executionState: "not_executed",
        externalEffect: false,
        executor: null,
        requiresHumanApproval: true,
        configuredTrustDial: persisted.configuredTrustDial,
        evidenceSource: persisted.evidenceSource,
        evidenceCheckedAt: persisted.evidenceCheckedAt,
        createdAt: persisted.createdAt,
        idempotentReplay: persisted.idempotentReplay,
      };
    },
  };
}
