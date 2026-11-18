import { z } from "zod";

const shortText = (max: number) => z.string().trim().min(1).max(max);
export const businessInquiryInputSchema = z.object({
  contactName: shortText(120),
  contactEmail: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  organizationName: shortText(180),
  organizationType: z.enum(["clinic", "pharmacy", "research", "retailer", "distributor", "other"]),
  location: shortText(180),
  serviceArea: shortText(240).optional(),
  categories: z.array(z.enum(["clinical", "research", "supplements", "topicals", "other"])).min(1).max(5)
    .refine((v) => new Set(v).size === v.length, "Categories must be distinct"),
  selections: z.array(z.object({
    description: shortText(240),
    variant: shortText(180),
    quantity: z.number().finite().positive().max(1_000_000),
    unit: z.enum(["vial", "bottle", "tube", "jar", "kit", "unit"]),
  }).strict()).max(40),
  packagingPreference: z.enum(["supplier_brand", "organization_brand", "not_sure"]),
  siteCount: z.number().int().min(1).max(10_000),
  replenishment: z.enum(["one_time", "recurring", "not_sure"]),
  services: z.array(z.enum(["sourcing", "labeling", "fulfillment", "consultation", "other"])).max(5)
    .refine((v) => new Set(v).size === v.length, "Services must be distinct"),
  timing: shortText(240).optional(),
  documentationNeeds: shortText(500).optional(),
  context: shortText(1000).optional(),
  referral: shortText(200).optional(),
}).strict();
export type BusinessInquiryInput = z.infer<typeof businessInquiryInputSchema>;

export const businessInquiryReceiptSchema = z.object({
  reference: z.string().regex(/^BE-[A-F0-9]{24}$/),
  receivedAt: z.string().datetime({ offset: true }),
  state: z.literal("needs_human_review"),
  replayed: z.boolean(),
}).strict();
export type BusinessInquiryReceipt = z.infer<typeof businessInquiryReceiptSchema>;

export const businessInquiryRecordSchema = z.object({
  id: z.string().uuid(),
  reference: z.string().regex(/^BE-[A-F0-9]{24}$/),
  receivedAt: z.string().datetime({ offset: true }),
  provenance: z.literal("web"),
  category: z.literal("b2b_organization"),
  state: z.enum(["needs_human_review", "linked", "closed"]),
  revision: z.number().int().positive(),
  assignedTo: z.string().uuid().nullable(),
  organizationId: z.string().uuid().nullable(),
  policyVersion: shortText(200),
  enquiry: businessInquiryInputSchema,
}).strict();
export type BusinessInquiryRecord = z.infer<typeof businessInquiryRecordSchema>;
export const businessInquiryPageSchema = z.object({
  items: z.array(businessInquiryRecordSchema).max(50),
  nextBefore: z.string().uuid().nullable(),
}).strict();
export type BusinessInquiryPage = z.infer<typeof businessInquiryPageSchema>;

export const businessInquiryAssignmentSchema = z.object({
  commandId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  assignedTo: z.string().uuid().nullable(),
}).strict();
export type BusinessInquiryAssignment = z.infer<typeof businessInquiryAssignmentSchema>;
export const businessInquiryAssignmentResultSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  assignedTo: z.string().uuid().nullable(),
  replayed: z.boolean(),
}).strict();
export type BusinessInquiryAssignmentResult = z.infer<typeof businessInquiryAssignmentResultSchema>;
