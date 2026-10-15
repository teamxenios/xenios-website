import {
  AssistedOrderValidationError,
  validateSubmitInput,
  type AssistedOrderContactInput,
  type AssistedOrderCatalogItem,
  type AssistedOrderCatalogPage,
} from "./contract";

export const REQUEST_INTENT_KIND = "unapproved_selection_request" as const;
export const REQUEST_INTENT_NOTICE =
  "Submit for review. This saves your requested items only. It does not approve treatment, create a prescription, collect payment or place a supplier order.";
export const REQUEST_INTENT_RECOVERY_NOTICE =
  "We could not confirm the result. Keep this tab and retry the same attempt. After signing out, session expiry or closing the tab, contact support before sending a replacement request.";

export type RequestIntentInput = Readonly<{
  idempotencyKey: string;
  contact: AssistedOrderContactInput;
  agreements: readonly Readonly<{
    kind: string;
    version: string;
    accepted: true;
    acceptedAt: string;
  }>[];
  lines: readonly Readonly<{ productId: string; variantId: string; quantity: number }>[];
}>;

export type RequestIntentCatalogItem = AssistedOrderCatalogItem & Readonly<{
  selectableForReview: boolean;
  intentExclusion: "non_merchandise" | "coming_soon" | null;
  clinicalReviewRequired: boolean;
  sourceDisplayState: string;
  sourceVariantDisplayState: string;
  sourceRefusal: string | null;
}>;
export type RequestIntentCatalogPage = Omit<AssistedOrderCatalogPage, "items"> &
  Readonly<{ items: readonly RequestIntentCatalogItem[] }>;

export type RequestIntentLine = Readonly<{
  productId: string;
  variantId: string;
  sourceVariantId: string;
  productName: string;
  specification: string | null;
  family: string;
  workflowMode: AssistedOrderCatalogItem["workflowMode"];
  quantity: number;
  researchUseOnly: boolean;
  clinicalReviewRequired: boolean;
  sourceDisplayState: string;
  sourceVariantDisplayState: string;
  sourceRefusal: string | null;
  catalogVersion: string;
  reviewState: "pending";
}>;

export type RequestIntentReceipt = Readonly<{
  kind: typeof REQUEST_INTENT_KIND;
  requestId: string;
  publicReference: string;
  status: "pending_review";
  createdAt: string;
}>;
export type RequestIntentDetail = RequestIntentReceipt & Readonly<{
  contact: RequestIntentInput["contact"];
  agreements: RequestIntentInput["agreements"];
  lines: readonly RequestIntentLine[];
}>;

/** No arbitrary notes, documents, payment facts, clinical answers or actor claims. */
export function exactObject(
  value: unknown, allowed: readonly string[], field: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AssistedOrderValidationError(field, "An object is required.");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new AssistedOrderValidationError(field, "Unsupported field.");
  }
  return record;
}

export function validateRequestIntentInput(raw: unknown): RequestIntentInput {
  const root = exactObject(raw, ["idempotencyKey", "contact", "agreements", "lines"], "request");
  if (typeof root.idempotencyKey !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(root.idempotencyKey)) {
    throw new AssistedOrderValidationError("idempotencyKey", "A valid attempt identity is required.");
  }
  const contact = exactObject(root.contact, [
    "fullLegalName", "email", "mobilePhone", "organizationName", "ageConfirmed",
    "shippingAddress", "billingSameAsShipping", "billingAddress",
  ], "contact");
  if (typeof contact.billingSameAsShipping !== "boolean") {
    throw new AssistedOrderValidationError("contact", "Choose a billing address option.");
  }
  for (const name of ["shippingAddress", "billingAddress"]) {
    if (name === "billingAddress" && contact[name] === undefined && contact.billingSameAsShipping) continue;
    exactObject(contact[name], ["line1", "line2", "city", "region", "postalCode", "countryCode"], name);
  }
  if (!Array.isArray(root.lines) || !Array.isArray(root.agreements)
    || root.agreements.length > 64) {
    throw new AssistedOrderValidationError("request", "Lines and acknowledgments are required.");
  }
  for (const line of root.lines) exactObject(line, ["productId", "variantId", "quantity"], "lines");
  const seen = new Set<string>();
  const agreements = root.agreements.map((entry) => {
    const agreement = exactObject(entry, ["kind", "version", "accepted", "acceptedAt"], "agreements");
    if (agreement.accepted !== true || typeof agreement.acceptedAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T/.test(agreement.acceptedAt)
      || !Number.isFinite(Date.parse(agreement.acceptedAt))) {
      throw new AssistedOrderValidationError("agreements", "Explicit dated acceptance is required.");
    }
    const pair = JSON.stringify([agreement.kind, agreement.version]);
    if (seen.has(pair)) throw new AssistedOrderValidationError("agreements", "Duplicate acknowledgment.");
    seen.add(pair);
    return agreement;
  });
  // Reuse the existing canonical contact, address, identity and quantity validator.
  const normalized = validateSubmitInput({
    idempotencyKey: root.idempotencyKey,
    contact: contact as unknown as AssistedOrderContactInput,
    lines: root.lines as RequestIntentInput["lines"],
    agreements: agreements as unknown as RequestIntentInput["agreements"],
  });
  return {
    idempotencyKey: normalized.idempotencyKey,
    contact: normalized.contact,
    lines: normalized.lines.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
    agreements: normalized.agreements.map((agreement) => ({ ...agreement, accepted: true })),
  };
}

export type RequestIntentQueuePage = Readonly<{
  items: readonly (RequestIntentReceipt & Readonly<{ lineCount: number }>)[];
  total: number;
  page: number;
  pageSize: number;
}>;
