export const PRODUCT_REQUEST_CATEGORIES = [
  "research_vial",
  "blend",
  "supplement",
  "laboratory_supply",
  "program",
  "quantum",
  "other",
] as const;

export type ProductRequestCategory = (typeof PRODUCT_REQUEST_CATEGORIES)[number];

export const PRODUCT_REQUEST_FREQUENCIES = [
  "one_time",
  "occasionally",
  "monthly",
  "not_sure",
] as const;

export type ProductRequestFrequency = (typeof PRODUCT_REQUEST_FREQUENCIES)[number];

export const PRODUCT_REQUEST_TIMINGS = [
  "asap",
  "within_30_days",
  "within_90_days",
  "future_interest",
  "researching",
] as const;

export type ProductRequestTiming = (typeof PRODUCT_REQUEST_TIMINGS)[number];

export const PRODUCT_REQUEST_STATUSES = [
  "submitted",
  "under_review",
  "more_information_requested",
  "accepted_for_diligence",
  "planned",
  "added_to_catalog",
  "currently_unavailable",
  "not_moving_forward",
  "closed",
  "withdrawn",
] as const;

export type ProductRequestStatus = (typeof PRODUCT_REQUEST_STATUSES)[number];

export const MEMBER_PRODUCT_REQUEST_STATUSES: readonly ProductRequestStatus[] =
  PRODUCT_REQUEST_STATUSES;

export const PRODUCT_REQUEST_PRIORITIES = ["low", "normal", "high"] as const;
export type ProductRequestPriority = (typeof PRODUCT_REQUEST_PRIORITIES)[number];

export const PRODUCT_REQUEST_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const PRODUCT_REQUEST_MAX_FILE_BYTES = 10 * 1024 * 1024;

export type ProductRequestEventType =
  | "submitted"
  | "attachment_added"
  | "attachment_removed"
  | "attachment_accessed"
  | "member_message_added"
  | "member_withdrawn"
  | "admin_review_started"
  | "administrator_opened"
  | "status_changed"
  | "owner_changed"
  | "priority_changed"
  | "internal_note_added"
  | "member_update_added"
  | "candidate_linked"
  | "duplicate_linked"
  | "product_linked";

export interface ProductRequestCreateInput {
  productName: string;
  category: ProductRequestCategory;
  description: string;
  brand?: string | null;
  productUrl?: string | null;
  desiredPresentation?: string | null;
  desiredQuantity?: string | null;
  expectedPurchaseFrequency?: ProductRequestFrequency | null;
  interestTiming?: ProductRequestTiming | null;
  additionalNotes?: string | null;
  contactConsent?: boolean;
  idempotencyKey: string;
}

export interface MemberProductRequest {
  reference: string;
  productName: string;
  category: ProductRequestCategory;
  description: string;
  brand: string | null;
  productUrl: string | null;
  desiredPresentation: string | null;
  desiredQuantity: string | null;
  expectedPurchaseFrequency: ProductRequestFrequency | null;
  interestTiming: ProductRequestTiming | null;
  additionalNotes: string | null;
  contactConsent: boolean;
  status: ProductRequestStatus;
  memberVisibleUpdate: string | null;
  createdAt: string;
  updatedAt: string;
  withdrawnAt: string | null;
  version: number;
  files: MemberProductRequestFile[];
  events: MemberProductRequestEvent[];
}

export interface MemberProductRequestFile {
  fileId: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  state: "pending" | "confirmed" | "removed";
  uploadedAt: string | null;
}

export interface MemberProductRequestEvent {
  eventType: ProductRequestEventType;
  createdAt: string;
  memberVisibleMessage: string | null;
  previousStatus: ProductRequestStatus | null;
  nextStatus: ProductRequestStatus | null;
}

export interface AdminProductRequestSummary {
  requestId: string;
  reference: string;
  productName: string;
  category: ProductRequestCategory;
  status: ProductRequestStatus;
  priority: ProductRequestPriority;
  assignedOwner: string | null;
  memberEmail: string;
  desiredQuantity: string | null;
  expectedPurchaseFrequency: ProductRequestFrequency | null;
  interestTiming: ProductRequestTiming | null;
  candidateId: string | null;
  uniqueMemberDemand: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ProductRequestAnalytics {
  total: number;
  uniqueRequesters: number;
  open: number;
  demandCandidates: number;
  catalogAdditionRate: number;
  byStatus: Array<{ status: ProductRequestStatus; count: number }>;
  byCategory: Array<{ category: ProductRequestCategory; count: number }>;
  byBrand: Array<{ brand: string; count: number }>;
  byFrequency: Array<{ frequency: ProductRequestFrequency | "not_provided"; count: number }>;
  byTiming: Array<{ timing: ProductRequestTiming | "not_provided"; count: number }>;
  byAttributionSource: Array<{ source: string; count: number }>;
  topDemand: Array<{
    candidateId: string;
    normalizedName: string;
    category: ProductRequestCategory;
    requestCount: number;
    uniqueMemberCount: number;
    firstRequestedAt: string;
    latestRequestedAt: string;
    frequencyDistribution: Array<{
      frequency: ProductRequestFrequency | "not_provided";
      count: number;
    }>;
    timingDistribution: Array<{
      timing: ProductRequestTiming | "not_provided";
      count: number;
    }>;
  }>;
}
