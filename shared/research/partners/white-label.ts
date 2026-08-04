export const WHITE_LABEL_BRAND_MODES = [
  "partner_branded",
  "co_branded",
  "powered_by_xenios",
  "backend_only",
] as const;

export type WhiteLabelBrandMode = (typeof WHITE_LABEL_BRAND_MODES)[number];

export const WHITE_LABEL_FULFILLMENT_MODES = [
  "blind_shipping",
  "xenios_drop_shipping",
  "partner_inventory",
  "hybrid",
] as const;

export type WhiteLabelFulfillmentMode = (typeof WHITE_LABEL_FULFILLMENT_MODES)[number];

export type WhiteLabelApplicationState =
  | "under_review"
  | "approved"
  | "changes_required"
  | "rejected"
  | "paused";

export type WhiteLabelQualityState =
  | "documentation_required"
  | "under_review"
  | "verified"
  | "blocked";

export type WhiteLabelPackagingState =
  | "not_started"
  | "draft"
  | "under_review"
  | "approved"
  | "changes_required";

export type WhiteLabelQuoteState =
  | "requested"
  | "under_review"
  | "issued"
  | "accepted"
  | "declined"
  | "expired";

export type WhiteLabelTrackingState =
  | "awaiting_quote"
  | "awaiting_partner"
  | "awaiting_xenios"
  | "ready_for_pilot"
  | "active"
  | "paused";

export interface WhiteLabelBrandProfileView {
  brandName: string | null;
  logoAssetReference: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  mode: WhiteLabelBrandMode | null;
  packagingNotes: string | null;
  packagingState: WhiteLabelPackagingState;
  packagingPreviewReference: string | null;
}

export interface WhiteLabelVariantView {
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  qualityState: WhiteLabelQualityState;
  selectable: boolean;
  unavailableReason: string | null;
}

export interface WhiteLabelSelectionView {
  selectionId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  requestedQuantity: number;
  qualityState: WhiteLabelQualityState;
  createdAt: string;
}

export interface WhiteLabelQuoteView {
  quoteId: string;
  state: WhiteLabelQuoteState;
  selectionIds: readonly string[];
  amountCents: number | null;
  currency: string | null;
  version: number;
  requestedAt: string;
  issuedAt: string | null;
  expiresAt: string | null;
}

export interface WhiteLabelSupportTicketView {
  ticketId: string;
  subject: string;
  topic: "brand" | "product" | "quote" | "quality" | "fulfillment" | "other";
  state: "open" | "awaiting_partner" | "awaiting_xenios" | "resolved";
  updatedAt: string;
}

export interface WhiteLabelWorkspaceView {
  organizationId: string;
  organizationName: string;
  applicationState: WhiteLabelApplicationState;
  version: number;
  trackingState: WhiteLabelTrackingState;
  brand: WhiteLabelBrandProfileView;
  fulfillmentMode: WhiteLabelFulfillmentMode | null;
  variants: readonly WhiteLabelVariantView[];
  selections: readonly WhiteLabelSelectionView[];
  quotes: readonly WhiteLabelQuoteView[];
  supportTickets: readonly WhiteLabelSupportTicketView[];
  updatedAt: string;
}

export interface WhiteLabelApplicationInput {
  organizationName: string;
  organizationWebsite: string | null;
  contactName: string;
  contactEmail: string;
  intendedBrandMode: WhiteLabelBrandMode | null;
  summary: string | null;
  idempotencyKey: string;
}

export interface WhiteLabelBrandInput {
  brandName: string;
  logoAssetReference: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  mode: WhiteLabelBrandMode;
  packagingNotes: string | null;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface WhiteLabelSelectionInput {
  sku: string;
  requestedQuantity: number;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface WhiteLabelQuoteRequestInput {
  selectionIds: readonly string[];
  note: string | null;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface WhiteLabelPackagingReviewInput {
  packagingPreviewReference: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface WhiteLabelFulfillmentInput {
  mode: WhiteLabelFulfillmentMode;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface WhiteLabelSupportInput {
  subject: string;
  topic: WhiteLabelSupportTicketView["topic"];
  detail: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export type WhiteLabelCommandInput =
  | WhiteLabelApplicationInput
  | WhiteLabelBrandInput
  | WhiteLabelSelectionInput
  | WhiteLabelQuoteRequestInput
  | WhiteLabelPackagingReviewInput
  | WhiteLabelFulfillmentInput
  | WhiteLabelSupportInput;

export type WhiteLabelDenialCode =
  | "white_label_not_found"
  | "white_label_forbidden"
  | "white_label_invalid"
  | "white_label_not_approved"
  | "white_label_version_conflict"
  | "white_label_variant_unavailable"
  | "white_label_quality_blocked"
  | "white_label_quote_invalid"
  | "white_label_unavailable";

export interface WhiteLabelCommandResult {
  workspace: WhiteLabelWorkspaceView;
  idempotentReplay: boolean;
}

const INTERNAL_TOKENS = [
  "suppliercost",
  "landedcost",
  "wholesalecost",
  "margin",
  "markup",
  "multiplier",
  "internalnote",
  "commission",
  "payout",
] as const;

export function whiteLabelPartnerPayloadLeaks(value: unknown, path = "$"): string[] {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => whiteLabelPartnerPayloadLeaks(entry, `${path}[${index}]`));
  }
  const leaks: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
    const nextPath = `${path}.${key}`;
    if (INTERNAL_TOKENS.some((token) => normalized.includes(token))) leaks.push(nextPath);
    leaks.push(...whiteLabelPartnerPayloadLeaks(child, nextPath));
  }
  return leaks;
}

export function assertWhiteLabelPartnerPayloadSafe(value: unknown): void {
  const leaks = whiteLabelPartnerPayloadLeaks(value);
  if (leaks.length > 0) throw new Error(`white-label partner payload blocked: ${leaks.join(", ")}`);
}

export function isWhiteLabelBrandMode(value: unknown): value is WhiteLabelBrandMode {
  return typeof value === "string" && (WHITE_LABEL_BRAND_MODES as readonly string[]).includes(value);
}

export function isWhiteLabelFulfillmentMode(value: unknown): value is WhiteLabelFulfillmentMode {
  return typeof value === "string" && (WHITE_LABEL_FULFILLMENT_MODES as readonly string[]).includes(value);
}

export function isWhiteLabelHexColor(value: string | null): boolean {
  return value === null || /^#[0-9a-f]{6}$/i.test(value);
}
