import { z } from "zod";

/** Demand intake is deliberately wider than today's direct-commerce authority. */
export const BUYER_REQUEST_MAX_QUANTITY = 50;
export const BUYER_REQUEST_MAX_DISTINCT_VARIANTS = 250;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const BuyerIdentitySchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    phone: optionalTrimmed(32).refine(
      (value) => value === undefined || value.replace(/\D/g, "").length >= 7,
      "Phone must contain at least seven digits.",
    ),
    company: optionalTrimmed(160),
  })
  .strict();

export const BuyerAddressSchema = z
  .object({
    line1: z.string().trim().min(2).max(160),
    line2: optionalTrimmed(160),
    city: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().min(3).max(24),
    country: z.string().trim().length(2).transform((value) => value.toUpperCase()).default("US"),
  })
  .strict();

export const BuyerLineSchema = z
  .object({
    offeringId: z.string().trim().min(1).max(200),
    variantId: z.string().trim().min(1).max(200),
    requestedQuantity: z.number().int().min(1).max(BUYER_REQUEST_MAX_QUANTITY),
  })
  .strict();

export const BuyerOrderRequestSchema = z
  .object({
    identity: BuyerIdentitySchema,
    shipping: BuyerAddressSchema,
    billing: BuyerAddressSchema.optional(),
    lines: z.array(BuyerLineSchema).min(1).max(BUYER_REQUEST_MAX_DISTINCT_VARIANTS),
    notes: optionalTrimmed(4_000),
    requestedInvoice: z.boolean().default(true),
    source: z.enum(["buyer_quick_order", "email_bridge", "admin_created"]).default("buyer_quick_order"),
    idempotencyKey: z
      .string()
      .trim()
      .min(20)
      .max(140)
      .regex(/^xbr_[A-Za-z0-9_-]+$/),
  })
  .strict()
  .superRefine((value, context) => {
    const variants = new Set<string>();
    value.lines.forEach((line, index) => {
      if (variants.has(line.variantId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lines", index, "variantId"],
          message: "Each exact variant may appear only once.",
        });
      }
      variants.add(line.variantId);
    });
  });

export type BuyerIdentity = z.infer<typeof BuyerIdentitySchema>;
export type BuyerAddress = z.infer<typeof BuyerAddressSchema>;
export type BuyerLineInput = z.infer<typeof BuyerLineSchema>;
export type BuyerOrderRequestInput = z.infer<typeof BuyerOrderRequestSchema>;

export type BuyerDirectAuthorityBasis = "product_control" | "founder_release";

/** A display-safe exact variant projected from the existing Product Control catalog. */
export interface BuyerCatalogVariant {
  offeringId: string;
  variantId: string;
  sku: string;
  slug: string;
  productName: string;
  category: string;
  strengthLabel?: string;
  presentation?: string;
  displayPriceCents?: number;
  currency: string;
  displayState: string;
  directPurchaseAuthorized: boolean;
  directQuantityLimit: number | null;
  directAuthorityBasis: BuyerDirectAuthorityBasis | null;
  carePathway: boolean;
}

export type BuyerCommerceDisposition =
  | "direct_cart_eligible"
  | "manual_early_access_request"
  | "care_pathway"
  | "unavailable";

export interface ResolvedBuyerLine extends BuyerLineInput {
  sku?: string;
  productName: string;
  strengthLabel?: string;
  disposition: BuyerCommerceDisposition;
  displayPriceCents?: number;
  currency: string;
  directQuantityLimit: number | null;
  reason?:
    | "VARIANT_NOT_FOUND"
    | "CARE_PATHWAY_REQUIRED"
    | "QUANTITY_REQUIRES_MANUAL_REVIEW"
    | "PRODUCT_CONTROL_REVIEW_REQUIRED";
}

export interface BuyerOrderRequestRecord {
  requestRef: string;
  customerRef: string;
  idempotencyKey: string;
  payload: BuyerOrderRequestInput;
  resolvedLines: readonly ResolvedBuyerLine[];
  createdAt: string;
}

export type BuyerRequestCommit =
  | Readonly<{ committed: true; record: BuyerOrderRequestRecord }>
  | Readonly<{
      committed: false;
      reason: "idempotency_key_taken" | "request_ref_taken";
      record: BuyerOrderRequestRecord;
    }>;

export interface BuyerRequestReceipt {
  requestRef: string;
  customerRef: string;
  status: "submitted_for_review";
  replayed: boolean;
  lines: readonly ResolvedBuyerLine[];
  createdAt: string;
  nextStep: string;
}
