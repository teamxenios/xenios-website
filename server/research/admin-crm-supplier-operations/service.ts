import type {
  AdminCrmSupplierOperationsSnapshot,
  QueueAdminCrmActionInput,
  QueuedAdminCrmAction,
  TrustDialMode,
} from "@shared/research/admin-crm-supplier-operations";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:_.\/-]{0,199}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9:_.\/-]{7,199}$/;
const FORBIDDEN_OPERATIONAL_TERMS = [
  "diagnos", "medication", "prescription", "biometric", "assessment", "blueprint", "clinical", "health",
] as const;

export class AdminCrmRefusal extends Error {
  constructor(
    public readonly code: "invalid_request" | "trust_dial_never" | "unsafe_projection",
    message: string,
  ) {
    super(message);
  }
}

export interface QueueActionRecord {
  actorId: string;
  trustDial: TrustDialMode;
  input: QueueAdminCrmActionInput;
  state: QueuedAdminCrmAction["state"];
  createdAt: string;
}

/**
 * Storage implementations must create the queue item and its audit event in
 * one transaction. The service has no unaudited write method by design.
 */
export interface AdminCrmSupplierOperationsRepository {
  readSnapshot(actorId: string): Promise<AdminCrmSupplierOperationsSnapshot>;
  readTrustDial(actorId: string, action: QueueAdminCrmActionInput["action"]): Promise<TrustDialMode>;
  queueActionWithAudit(record: QueueActionRecord): Promise<QueuedAdminCrmAction>;
}

export interface AdminCrmSupplierOperationsService {
  readSnapshot(actorId: string): Promise<AdminCrmSupplierOperationsSnapshot>;
  queueAction(actorId: string, input: QueueAdminCrmActionInput): Promise<QueuedAdminCrmAction>;
}

function assertIdentifier(value: string, label: string): void {
  if (!IDENTIFIER.test(value)) throw new AdminCrmRefusal("invalid_request", `${label} is invalid.`);
}

function assertNoRestrictedProjection(value: unknown, path = "snapshot"): void {
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

function validateInput(input: QueueAdminCrmActionInput): void {
  assertIdentifier(input.targetType, "targetType");
  assertIdentifier(input.targetId, "targetId");
  if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
    throw new AdminCrmRefusal("invalid_request", "idempotencyKey is invalid.");
  }
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 1000) {
    throw new AdminCrmRefusal("invalid_request", "reason must contain 8 to 1000 characters.");
  }
}

export function createAdminCrmSupplierOperationsService(
  repository: AdminCrmSupplierOperationsRepository,
  now: () => string = () => new Date().toISOString(),
): AdminCrmSupplierOperationsService {
  return {
    async readSnapshot(actorId) {
      assertIdentifier(actorId, "actorId");
      const snapshot = await repository.readSnapshot(actorId);
      assertNoRestrictedProjection(snapshot);
      return snapshot;
    },

    async queueAction(actorId, input) {
      assertIdentifier(actorId, "actorId");
      validateInput(input);
      const trustDial = await repository.readTrustDial(actorId, input.action);
      if (trustDial === "never") {
        throw new AdminCrmRefusal("trust_dial_never", "This action is disabled by the Trust Dial.");
      }

      // Pack 05 never executes a consequential action. Even "auto" is queued
      // because outbound, money, supplier, and fulfillment actions require the
      // existing human approval gate at the integration boundary.
      const state: QueuedAdminCrmAction["state"] = trustDial === "ask" ? "awaiting_approval" : "queued";
      return repository.queueActionWithAudit({
        actorId,
        trustDial,
        input: { ...input, reason: input.reason.trim() },
        state,
        createdAt: now(),
      });
    },
  };
}
