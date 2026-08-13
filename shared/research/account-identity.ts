import { z } from "zod";

// Pack 02 account contracts. Authentication remains Supabase Auth; these
// contracts only describe account authorization, profiles, and projections of
// the existing order systems.

export const AccountSubjectTypeSchema = z.enum(["personal", "organization"]);
export type AccountSubjectType = z.infer<typeof AccountSubjectTypeSchema>;

export const OrganizationRoleSchema = z.enum([
  "organization_owner",
  "organization_admin",
  "business_buyer",
  "billing_viewer",
]);
export type OrganizationRole = z.infer<typeof OrganizationRoleSchema>;

export const OrganizationStatusSchema = z.enum(["active", "suspended", "closed"]);
export type OrganizationStatus = z.infer<typeof OrganizationStatusSchema>;

export const AddressSchema = z.object({
  recipient: z.string().trim().min(1).max(160),
  company: z.string().trim().max(160).nullable().optional(),
  line1: z.string().trim().min(1).max(160),
  line2: z.string().trim().max(160).nullable().optional(),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(32),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  phone: z.string().trim().max(32).nullable().optional(),
});
export type AccountAddress = z.infer<typeof AddressSchema>;

export const BusinessProfileSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(160),
  purchasingEmail: z.string().trim().email().transform((value) => value.toLowerCase()),
  billingEmail: z.string().trim().email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(32).nullable(),
  taxIdLast4: z.string().regex(/^\d{4}$/).nullable(),
  purchaseOrderRequired: z.boolean(),
  billingAddress: AddressSchema.nullable(),
  shippingAddress: AddressSchema.nullable(),
});
export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

export const UpdateBusinessProfileSchema = BusinessProfileSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one business profile field is required.",
);
export type UpdateBusinessProfileInput = z.infer<typeof UpdateBusinessProfileSchema>;

export type OrganizationSummary = {
  id: string;
  slug: string;
  legalName: string;
  displayName: string;
  status: OrganizationStatus;
  roles: OrganizationRole[];
  passwordChangeRequired: boolean;
};

export type AccountContextDto = {
  auth: {
    userId: string;
    email: string;
    emailVerified: true;
  };
  personal: null | {
    memberId: string;
    firstName: string;
    lastName: string;
    status: string;
  };
  organizations: OrganizationSummary[];
  security: {
    passwordChangeRequired: boolean;
    mfaAvailable: boolean;
    passkeyAvailable: boolean;
  };
};

export const OrderSourceSchema = z.enum([
  "research_order",
  "early_access_placement",
  "early_access_cart_checkout",
]);
export type AccountOrderSource = z.infer<typeof OrderSourceSchema>;

export type AccountInvoiceDto = {
  invoiceNumber: string;
  status: string;
  issuedAt: string;
  totalCents: number;
  currency: string;
};

export type AccountTrackingDto = {
  carrier: string | null;
  trackingNumber: string | null;
  status: string;
  updatedAt: string | null;
};

export type AccountPaymentDto = {
  status: string;
  amountCents: number;
  currency: string;
  recordedAt: string;
  referenceLabel: string | null;
};

export type AccountOrderLineDto = {
  sku: string;
  displayName: string;
  quantity: number;
  lineTotalCents: number | null;
};

export type AccountOrderDto = {
  ownership: {
    organizationId: string;
    basis: "organization_checkout" | "verified_customer_claim";
  };
  source: AccountOrderSource;
  sourceOrderId: string;
  orderNumber: string;
  state: string;
  placedAt: string;
  totalCents: number;
  currency: string;
  lines: AccountOrderLineDto[];
  invoice: AccountInvoiceDto | null;
  payments: AccountPaymentDto[];
  tracking: AccountTrackingDto[];
  canRequestAgain: boolean;
};

export type AccountRequestAgainDto = {
  requestId: string;
  organizationId: string;
  source: AccountOrderSource;
  sourceOrderId: string;
  state: "requested" | "reviewing" | "converted" | "closed";
  requestedAt: string;
  note: string | null;
};

export type OrganizationDashboardDto = {
  organization: OrganizationSummary;
  profile: BusinessProfile;
  users: OrganizationUserDto[];
  orders: AccountOrderDto[];
  requests: AccountRequestAgainDto[];
  openRequestAgainCount: number;
};

export type OrganizationUserDto = {
  membershipId: string;
  email: string;
  roles: OrganizationRole[];
  state: "active" | "invited" | "revoked";
  boundAt: string | null;
};

export const SubjectTargetSchema = z.discriminatedUnion("subjectType", [
  z.object({ subjectType: z.literal("personal") }),
  z.object({ subjectType: z.literal("organization"), organizationId: z.string().uuid() }),
]);
export type SubjectTarget = z.infer<typeof SubjectTargetSchema>;

export const RequestCustomerClaimSchema = z.object({
  customerRef: z.string().regex(/^eac_[a-f0-9]{32}$/),
  target: SubjectTargetSchema,
});
export type RequestCustomerClaimInput = z.infer<typeof RequestCustomerClaimSchema>;

export const ConfirmCustomerClaimSchema = z.object({
  claimId: z.string().uuid(),
  challengeToken: z.string().min(20).max(4096),
});
export type ConfirmCustomerClaimInput = z.infer<typeof ConfirmCustomerClaimSchema>;

export const InviteOrganizationUserSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  roles: z.array(OrganizationRoleSchema).min(1).max(4).transform((roles) => Array.from(new Set(roles))),
});
export type InviteOrganizationUserInput = z.infer<typeof InviteOrganizationUserSchema>;

export const AcceptOrganizationInvitationSchema = z.object({
  invitationId: z.string().uuid(),
  invitationToken: z.string().min(20).max(4096),
});
export type AcceptOrganizationInvitationInput = z.infer<typeof AcceptOrganizationInvitationSchema>;

export const RequestAgainSchema = z.object({
  organizationId: z.string().uuid(),
  source: OrderSourceSchema,
  sourceOrderId: z.string().trim().min(1).max(160),
  note: z.string().trim().max(1000).nullable().optional(),
});
export type RequestAgainInput = z.infer<typeof RequestAgainSchema>;

export type AccountApiErrorCode =
  | "AUTH_REQUIRED"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "ACCOUNT_NOT_FOUND"
  | "ORGANIZATION_NOT_FOUND"
  | "ORGANIZATION_ACCESS_DENIED"
  | "ORGANIZATION_ROLE_REQUIRED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "CUSTOMER_NOT_FOUND"
  | "CUSTOMER_EMAIL_MISMATCH"
  | "CLAIM_CHALLENGE_INVALID"
  | "CLAIM_ALREADY_BOUND"
  | "INVITATION_INVALID"
  | "ORDER_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "SERVICE_UNAVAILABLE";

export type AccountApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: AccountApiErrorCode; message: string };
