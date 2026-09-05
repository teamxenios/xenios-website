import { z } from "zod";

export const APPROVED_USER_ACCESS_PATH = "/api/admin/research/access/inspect";
export const ApprovedUserAccessInput = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
}).strict();
const id = z.string().uuid();
const binding = z.enum(["verified", "unverified", "missing", "conflict"]);
const action = z.object({
  label: z.string(), href: z.string().nullable(), consequence: z.string(),
  notification: z.enum(["none", "application_email", "not_available"]),
}).strict();

/** Read-only admin projection. No token, provider metadata, tax document or clinical data. */
export const ApprovedUserAccessSchema = z.object({
  schemaVersion: z.literal(1), observedAt: z.string().datetime({ offset: true }), email: z.string().email(),
  identityState: z.enum(["absent", "unverified", "verified", "conflict"]),
  authAccounts: z.array(z.object({ authUserId: id, emailVerified: z.boolean(), signInRecorded: z.boolean() }).strict()).max(2),
  applications: z.array(z.object({ id, status: z.string(), href: z.string() }).strict()).max(25),
  members: z.array(z.object({ id, status: z.string(), authUserId: id.nullable(), binding, href: z.string() }).strict()).max(25),
  partners: z.array(z.object({
    id, memberId: id, role: z.string(), state: z.string(), binding,
    missingRequirements: z.array(z.string()),
  }).strict()).max(25),
  organizationRelationships: z.object({
    state: z.enum(["available", "unavailable"]),
    records: z.array(z.object({ organizationId: id, state: z.string(), roles: z.array(z.string()) }).strict()).max(25),
  }).strict(),
  boundaries: z.object({
    care: z.literal("separate_authority"), membershipBillingEnabled: z.boolean(),
    partnerLifecycleReview: z.enum(["unavailable", "available"]),
    referralEligibility: z.literal("checked_by_referral_authority"),
  }).strict(),
  nextActions: z.array(action),
}).strict();
export type ApprovedUserAccess = z.infer<typeof ApprovedUserAccessSchema>;
