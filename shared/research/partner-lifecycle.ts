import { z } from "zod";
import { PARTNER_ROLES } from "./distribution";

export const PARTNER_LIFECYCLE_SCHEMA_VERSION = "partner_lifecycle_20260905";
export const PARTNER_ADMIN_OPERATION_PATH = "/api/admin/research/partners/operations";
const requirement = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/), version: z.string().regex(/^\d+\.\d+\.\d+$/) }).strict();
export const PartnerLifecycleRequirements = z.object({ agreements: z.array(requirement).max(30), trainingModules: z.array(requirement).max(50) }).strict();
const id = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const base = { reason: z.string().trim().min(8).max(1000), idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/) };
const selected = { ...base, partnerId: id, expectedUpdatedAt: timestamp };
const evidence = { evidenceReference: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/), reviewedEvidence: z.literal(true) };
const version = z.string().regex(/^\d+\.\d+\.\d+$/).max(30);
const key = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/);
export const PartnerOperationInput = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("prepare"), memberId: id, role: z.enum([PARTNER_ROLES[0], ...PARTNER_ROLES.slice(1)] as const), legalName: z.string().trim().min(2).max(160) }).strict(),
  z.object({ ...selected, ...evidence, action: z.literal("record_clearance"), kind: z.enum(["identity", "tax", "payout"]), decision: z.enum(["verified", "rejected"]) }).strict(),
  z.object({ ...selected, ...evidence, action: z.literal("record_agreement"), agreementKey: key, version, contentHash: z.string().regex(/^[a-f0-9]{64}$/), acceptedAt: timestamp }).strict(),
  z.object({ ...selected, ...evidence, action: z.literal("record_training"), moduleKey: key, version, completedAt: timestamp }).strict(),
  z.object({ ...selected, action: z.literal("certify") }).strict(),
  z.object({ ...selected, action: z.literal("activate") }).strict(),
  z.object({ ...selected, action: z.literal("suspend") }).strict(),
  z.object({ ...selected, action: z.literal("terminate") }).strict(),
  z.object({ ...selected, action: z.literal("reinstate") }).strict(),
]);
export type PartnerOperation = z.infer<typeof PartnerOperationInput>;
export const PartnerOperationResult = z.object({
  ok: z.literal(true), partnerId: id, memberId: id, action: z.enum(["prepare", "record_clearance", "record_agreement", "record_training", "certify", "activate", "suspend", "terminate", "reinstate"]),
  state: z.enum(["application", "identity_verification_pending", "tax_status_pending", "payout_status_pending", "agreement_pending", "training_pending", "certification_pending", "active", "quality_review", "suspended", "terminated"]),
  updatedAt: timestamp, replayed: z.boolean(),
}).strict();
export const PartnerOperationDenial = z.object({
  ok: z.literal(false), code: z.enum(["invalid_input", "stale_inspection", "identity_review_required", "partner_not_found", "partner_already_exists", "invalid_state", "requirements_missing", "evidence_conflict", "idempotency_conflict"]),
  missingRequirements: z.array(z.string().max(180)).max(30).optional(),
}).strict();
