import { z } from "zod";

export const CATALOG_INTEREST_PATH = "/api/catalog-interest";
export const CATALOG_INTEREST_NOTICE_VERSION = "catalog_delivery_notice_v1";
export const CATALOG_MARKETING_NOTICE_VERSION = "catalog_marketing_opt_in_v1";
export const CATALOG_INTEREST_CUSTOMER_EVENT = "catalog_interest_customer";
export const CATALOG_INTEREST_TEAM_EVENT = "catalog_interest_team";

export const CatalogInterestRequest = z.object({
  requestId: z.string().uuid(),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  marketingConsent: z.boolean().optional().default(false),
  confirmEmpty: z.string().max(200).optional().default(""),
  turnstileToken: z.string().max(4096).optional(),
}).strict();

export type CatalogInterestRequest = z.infer<typeof CatalogInterestRequest>;

export const CatalogInterestReceipt = z.object({
  ok: z.literal(true),
  receipt: z.string().regex(/^XHC-[A-Z0-9]{12}$/u),
  status: z.enum(["queued", "manual_review"]),
  catalogRevision: z.string().min(1).max(100),
  replayed: z.boolean(),
}).strict();

export type CatalogInterestReceipt = z.infer<typeof CatalogInterestReceipt>;

export const CatalogInterestError = z.object({
  ok: z.literal(false),
  code: z.enum([
    "invalid_request",
    "verification_failed",
    "too_many_requests",
    "request_conflict",
    "temporarily_unavailable",
  ]),
  message: z.string().min(1).max(240),
}).strict();

export type CatalogInterestError = z.infer<typeof CatalogInterestError>;
