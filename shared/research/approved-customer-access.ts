import { z } from "zod";

export const APPROVED_CUSTOMER_SCHEMA_VERSION = "approved_customer_access_20260905";
export const APPROVE_CUSTOMER_ACCESS_PATH = "/api/admin/research/access/approve-customer";
export const ApprovedCustomerApprovalInput = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(8).max(1000),
  expectedApplicationId: z.string().uuid().nullable(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
}).strict().refine((v) => (v.expectedApplicationId === null) === (v.expectedUpdatedAt === null));
export type CustomerApprovalInput = z.infer<typeof ApprovedCustomerApprovalInput>;
export const CustomerApprovalResult = z.object({
  ok: z.literal(true), applicationId: z.string().uuid(), approvalVersion: z.number().int().positive(),
  state: z.literal("approved_customer"), delivery: z.literal("queued"),
  expiresAt: z.string().datetime({ offset: true }), replayed: z.boolean(),
}).strict();
export const CustomerClaimResult = z.object({
  ok: z.literal(true), applicationId: z.string().uuid(), memberId: z.string().uuid(),
  state: z.literal("active"), replayed: z.boolean(),
}).strict();
export const CustomerAccessDenial = z.object({
  ok: z.literal(false), code: z.enum(["invalid_input", "idempotency_conflict", "identity_review_required",
    "stale_inspection", "verified_sign_in_required", "claim_not_available"]),
}).strict();
