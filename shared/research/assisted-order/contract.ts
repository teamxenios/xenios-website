/**
 * Shared, browser-safe contract for the Xenios assisted order bridge.
 *
 * This contract intentionally carries no supplier, cost, margin, internal QA,
 * raw identity-document, or payment-proof fields.
 */

export const ASSISTED_ORDER_SOURCE = "early_access_manual_order_bridge" as const;
export const ASSISTED_ORDER_CURRENCY = "USD" as const;
export const ASSISTED_ORDER_MAX_LINES = 200;
export const ASSISTED_ORDER_MAX_NOTE_LENGTH = 2_000;
export const ASSISTED_ORDER_MAX_QUANTITY = 100_000;

export const assistedOrderWorkflowModes = [
  "direct_order_request",
  "provider_request",
  "request_pricing",
  "request_activation",
  "availability_review",
] as const;

export type AssistedOrderWorkflowMode =
  (typeof assistedOrderWorkflowModes)[number];

export const assistedOrderStatuses = [
  "submitted",
  "reviewing",
  "waiting_on_customer",
  "identity_requested",
  "identity_received",
  "agreements_pending",
  "agreements_complete",
  "payment_pending",
  "payment_review",
  "paid",
  "supplier_processing",
  "shipped",
  "delivered",
  "closed",
  "cancelled",
] as const;

export type AssistedOrderStatus = (typeof assistedOrderStatuses)[number];

export const assistedOrderDocumentTypes = [
  "government_id",
  "business_document",
  "other",
] as const;

export type AssistedOrderDocumentType =
  (typeof assistedOrderDocumentTypes)[number];

export const assistedOrderDocumentSides = ["front", "back", "single"] as const;
export type AssistedOrderDocumentSide =
  (typeof assistedOrderDocumentSides)[number];

export const assistedOrderDocumentStatuses = [
  "upload_pending",
  "uploaded",
  "scan_pending",
  "accepted",
  "rejected",
  "expired",
  "deleted",
] as const;

export type AssistedOrderDocumentStatus =
  (typeof assistedOrderDocumentStatuses)[number];

export type AssistedOrderAddressInput = Readonly<{
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
}>;

export type AssistedOrderContactInput = Readonly<{
  fullLegalName: string;
  email: string;
  mobilePhone: string;
  organizationName?: string;
  ageConfirmed: true;
  shippingAddress: AssistedOrderAddressInput;
  billingSameAsShipping: boolean;
  billingAddress?: AssistedOrderAddressInput;
}>;

export type AssistedOrderAgreementAcceptance = Readonly<{
  kind: string;
  version: string;
  acceptedAt: string;
}>;

/**
 * The config the wizard renders from. When the canonical legal set cannot be
 * resolved the feature reports itself disabled up front (D-005): the customer
 * is told before filling the form, and submission stays refused server-side.
 * requiredAgreements are exact published (kind, version) pairs from the legal
 * authority; formAcknowledgments are the operational request facts persisted
 * under the assisted_order_form_v1 namespace, never legal-registry entries.
 */
export type AssistedOrderConfigView = Readonly<{
  enabled: boolean;
  code: "legal_requirements_unavailable" | null;
  formId: string;
  requiredAgreements: readonly Readonly<{ kind: string; version: string }>[];
  formAcknowledgments: readonly Readonly<{
    id: string;
    /** "always", or the condition that makes this one required. */
    scope: "always" | "research_use_only";
    kind: string;
    version: string;
    copy: string;
  }>[];
}>;

/**
 * The client sends product and variant identity plus quantity. Any client price
 * is advisory only and is never used as authority.
 */
export type AssistedOrderLineInput = Readonly<{
  productId: string;
  variantId: string;
  quantity: number;
  expectedCatalogVersion?: string;
  expectedPriceVersion?: string;
  expectedUnitPriceCents?: number;
  customerNotes?: string;
}>;

export type AssistedOrderSubmitInput = Readonly<{
  idempotencyKey: string;
  contact: AssistedOrderContactInput;
  agreements: readonly AssistedOrderAgreementAcceptance[];
  lines: readonly AssistedOrderLineInput[];
  generalNotes?: string;
  affiliateAttributionRef?: string;
  /**
   * An affiliate code the CUSTOMER TYPED. A claim, never attribution.
   *
   * Deliberately a different field from `affiliateAttributionRef`, which the
   * service ignores from the body on purpose so a browser cannot choose which
   * partner an order pays. This one is accepted from the browser precisely
   * because it grants nothing: it is normalized, stored as its own fact, and
   * stays unmatched until a human matches it.
   */
  declaredAffiliateCode?: string;
}>;

export type AssistedOrderLineSnapshot = Readonly<{
  lineId: string;
  productId: string;
  variantId: string;
  productName: string;
  specification: string | null;
  format: string | null;
  packBasis: string | null;
  quantity: number;
  minimumQuantity: number;
  maximumQuantity: number | null;
  quantityIncrement: number;
  workflowMode: AssistedOrderWorkflowMode;
  customerActionLabel: string;
  unitPriceCents: number | null;
  lineEstimateCents: number | null;
  currency: typeof ASSISTED_ORDER_CURRENCY;
  catalogVersion: string;
  priceVersion: string | null;
  accessNotice: string | null;
  researchUseOnly: boolean;
}>;

export type AssistedOrderReceipt = Readonly<{
  requestId: string;
  publicReference: string;
  statusToken: string;
  status: "submitted";
  createdAt: string;
  estimatedTotalCents: number | null;
  currency: typeof ASSISTED_ORDER_CURRENCY;
  lines: readonly AssistedOrderLineSnapshot[];
  nextSteps: readonly string[];
}>;

export type AssistedOrderStatusEventView = Readonly<{
  status: AssistedOrderStatus;
  occurredAt: string;
  customerMessage: string | null;
}>;

export type AssistedOrderDocumentView = Readonly<{
  documentId: string;
  documentType: AssistedOrderDocumentType;
  side: AssistedOrderDocumentSide;
  fileName: string;
  status: AssistedOrderDocumentStatus;
  uploadedAt: string | null;
}>;

export type AssistedOrderStatusView = Readonly<{
  requestId: string;
  publicReference: string;
  status: AssistedOrderStatus;
  createdAt: string;
  updatedAt: string;
  estimatedTotalCents: number | null;
  currency: typeof ASSISTED_ORDER_CURRENCY;
  lines: readonly AssistedOrderLineSnapshot[];
  timeline: readonly AssistedOrderStatusEventView[];
  documents: readonly AssistedOrderDocumentView[];
  actionRequired: string | null;
}>;

export type AssistedOrderCatalogItem = Readonly<{
  productId: string;
  variantId: string;
  productName: string;
  family: string;
  channel: string;
  specification: string | null;
  format: string | null;
  packBasis: string | null;
  minimumQuantity: number;
  maximumQuantity: number | null;
  quantityIncrement: number;
  unitPriceCents: number | null;
  currency: typeof ASSISTED_ORDER_CURRENCY;
  workflowMode: AssistedOrderWorkflowMode;
  actionLabel: string;
  accessNotice: string | null;
  researchUseOnly: boolean;
  catalogVersion: string;
  priceVersion: string | null;
}>;

export type AssistedOrderCatalogPage = Readonly<{
  items: readonly AssistedOrderCatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  families: readonly string[];
  channels: readonly string[];
  workflowModes: readonly AssistedOrderWorkflowMode[];
}>;

export type AssistedOrderCatalogQuery = Readonly<{
  search?: string;
  family?: string;
  channel?: string;
  workflowMode?: AssistedOrderWorkflowMode;
  page?: number;
  pageSize?: number;
}>;

export type AssistedOrderUploadRequest = Readonly<{
  publicReference: string;
  statusToken?: string;
  documentType: AssistedOrderDocumentType;
  side: AssistedOrderDocumentSide;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}>;

export type AssistedOrderUploadCompleteInput = Readonly<{
  publicReference: string;
  statusToken?: string;
}>;

export type AssistedOrderUploadTicket = Readonly<{
  documentId: string;
  uploadUrl: string;
  objectPath: string;
  expiresAt: string;
  requiredHeaders: Readonly<Record<string, string>>;
}>;

export type AssistedOrderAdminListItem = Readonly<{
  requestId: string;
  publicReference: string;
  status: AssistedOrderStatus;
  fullLegalName: string;
  email: string;
  mobilePhone: string;
  organizationName: string | null;
  lineCount: number;
  totalQuantity: number;
  estimatedTotalCents: number | null;
  workflowModes: readonly AssistedOrderWorkflowMode[];
  identityDocumentStatus: AssistedOrderDocumentStatus | null;
  createdAt: string;
  updatedAt: string;
}>;

export type AssistedOrderAdminDetail = Readonly<{
  requestId: string;
  publicReference: string;
  status: AssistedOrderStatus;
  source: typeof ASSISTED_ORDER_SOURCE;
  actorMemberId: string | null;
  fullLegalName: string;
  email: string;
  mobilePhone: string;
  organizationName: string | null;
  shippingAddress: AssistedOrderAddressInput;
  billingAddress: AssistedOrderAddressInput;
  lines: readonly AssistedOrderLineSnapshot[];
  estimatedTotalCents: number | null;
  currency: typeof ASSISTED_ORDER_CURRENCY;
  generalNotes: string | null;
  agreements: readonly AssistedOrderAgreementAcceptance[];
  affiliateAttributionRef: string | null;
  /**
   * The affiliate code the CUSTOMER TYPED, for the operator to match by hand.
   *
   * Shown to an authorized admin only, and always beside its state so nobody
   * reads an unmatched claim as a proven relationship. It is never part of any
   * customer-facing projection.
   */
  declaredAffiliateCode: string | null;
  declaredAffiliateCodeState:
    | "not_provided"
    | "captured_unmatched"
    | "matched_manual"
    | "invalid_ignored";
  timeline: readonly AssistedOrderStatusEventView[];
  documents: readonly AssistedOrderDocumentView[];
  createdAt: string;
  updatedAt: string;
}>;

export type AssistedOrderStatusEvidence = Readonly<{
  agreementAttestationId?: string;
  paymentVerificationId?: string;
  supplierAssignmentId?: string;
  trackingId?: string;
  cancellationReason?: string;
}>;

export type AssistedOrderStatusUpdateInput = Readonly<{
  status: AssistedOrderStatus;
  customerMessage?: string;
  internalNote?: string;
  evidence?: AssistedOrderStatusEvidence;
}>;

export class AssistedOrderValidationError extends Error {
  public readonly field: string;

  public constructor(field: string, message: string) {
    super(message);
    this.name = "AssistedOrderValidationError";
    this.field = field;
  }
}

export function isAssistedOrderWorkflowMode(
  value: unknown,
): value is AssistedOrderWorkflowMode {
  return (
    typeof value === "string" &&
    (assistedOrderWorkflowModes as readonly string[]).includes(value)
  );
}

export function isAssistedOrderStatus(
  value: unknown,
): value is AssistedOrderStatus {
  return (
    typeof value === "string" &&
    (assistedOrderStatuses as readonly string[]).includes(value)
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, "").trim();
}

export function normalizeRequiredText(
  field: string,
  value: unknown,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new AssistedOrderValidationError(field, `${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new AssistedOrderValidationError(field, `${field} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new AssistedOrderValidationError(
      field,
      `${field} must be ${maxLength} characters or fewer.`,
    );
  }
  return normalized;
}

export function normalizeOptionalText(
  field: string,
  value: unknown,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return normalizeRequiredText(field, value, maxLength);
}

export function validateAddress(
  field: string,
  input: AssistedOrderAddressInput,
): AssistedOrderAddressInput {
  return Object.freeze({
    line1: normalizeRequiredText(`${field}.line1`, input.line1, 200),
    line2: normalizeOptionalText(`${field}.line2`, input.line2, 200),
    city: normalizeRequiredText(`${field}.city`, input.city, 120),
    region: normalizeRequiredText(`${field}.region`, input.region, 120),
    postalCode: normalizeRequiredText(
      `${field}.postalCode`,
      input.postalCode,
      40,
    ),
    countryCode: normalizeRequiredText(
      `${field}.countryCode`,
      input.countryCode,
      2,
    ).toUpperCase(),
  });
}

export function validateSubmitInput(
  input: AssistedOrderSubmitInput,
): AssistedOrderSubmitInput {
  const idempotencyKey = normalizeRequiredText(
    "idempotencyKey",
    input.idempotencyKey,
    160,
  );
  const email = normalizeEmail(
    normalizeRequiredText("contact.email", input.contact.email, 320),
  );
  if (!email.includes("@")) {
    throw new AssistedOrderValidationError(
      "contact.email",
      "A valid email is required.",
    );
  }
  const mobilePhone = normalizePhone(
    normalizeRequiredText("contact.mobilePhone", input.contact.mobilePhone, 50),
  );
  if (mobilePhone.length < 7) {
    throw new AssistedOrderValidationError(
      "contact.mobilePhone",
      "A valid mobile phone is required.",
    );
  }
  if (input.contact.ageConfirmed !== true) {
    throw new AssistedOrderValidationError(
      "contact.ageConfirmed",
      "Age confirmation is required.",
    );
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new AssistedOrderValidationError(
      "lines",
      "Select at least one product.",
    );
  }
  if (input.lines.length > ASSISTED_ORDER_MAX_LINES) {
    throw new AssistedOrderValidationError(
      "lines",
      `A request can contain at most ${ASSISTED_ORDER_MAX_LINES} lines.`,
    );
  }

  const seen = new Set<string>();
  const lines = input.lines.map((line, index) => {
    const productId = normalizeRequiredText(
      `lines.${index}.productId`,
      line.productId,
      160,
    );
    const variantId = normalizeRequiredText(
      `lines.${index}.variantId`,
      line.variantId,
      160,
    );
    const key = `${productId}\u0000${variantId}`;
    if (seen.has(key)) {
      throw new AssistedOrderValidationError(
        `lines.${index}`,
        "Duplicate product variants must be combined into one line.",
      );
    }
    seen.add(key);
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new AssistedOrderValidationError(
        `lines.${index}.quantity`,
        "Quantity must be a positive whole number.",
      );
    }
    if (line.quantity > ASSISTED_ORDER_MAX_QUANTITY) {
      throw new AssistedOrderValidationError(
        `lines.${index}.quantity`,
        "Quantity exceeds the assisted-order request ceiling.",
      );
    }
    if (
      line.expectedUnitPriceCents !== undefined &&
      (!Number.isSafeInteger(line.expectedUnitPriceCents) ||
        line.expectedUnitPriceCents < 1)
    ) {
      throw new AssistedOrderValidationError(
        `lines.${index}.expectedUnitPriceCents`,
        "Expected price must be a positive integer when supplied.",
      );
    }
    return Object.freeze({
      productId,
      variantId,
      quantity: line.quantity,
      expectedCatalogVersion: normalizeOptionalText(
        `lines.${index}.expectedCatalogVersion`,
        line.expectedCatalogVersion,
        160,
      ),
      expectedPriceVersion: normalizeOptionalText(
        `lines.${index}.expectedPriceVersion`,
        line.expectedPriceVersion,
        160,
      ),
      expectedUnitPriceCents: line.expectedUnitPriceCents,
      customerNotes: normalizeOptionalText(
        `lines.${index}.customerNotes`,
        line.customerNotes,
        500,
      ),
    });
  });

  const shippingAddress = validateAddress(
    "contact.shippingAddress",
    input.contact.shippingAddress,
  );
  const billingAddress = input.contact.billingSameAsShipping
    ? shippingAddress
    : validateAddress(
        "contact.billingAddress",
        input.contact.billingAddress as AssistedOrderAddressInput,
      );

  return Object.freeze({
    idempotencyKey,
    contact: Object.freeze({
      fullLegalName: normalizeRequiredText(
        "contact.fullLegalName",
        input.contact.fullLegalName,
        200,
      ),
      email,
      mobilePhone,
      organizationName: normalizeOptionalText(
        "contact.organizationName",
        input.contact.organizationName,
        200,
      ),
      ageConfirmed: true as const,
      shippingAddress,
      billingSameAsShipping: input.contact.billingSameAsShipping,
      billingAddress,
    }),
    agreements: Object.freeze(
      (input.agreements ?? []).map((agreement, index) =>
        Object.freeze({
          kind: normalizeRequiredText(
            `agreements.${index}.kind`,
            agreement.kind,
            80,
          ),
          version: normalizeRequiredText(
            `agreements.${index}.version`,
            agreement.version,
            80,
          ),
          acceptedAt: normalizeRequiredText(
            `agreements.${index}.acceptedAt`,
            agreement.acceptedAt,
            60,
          ),
        }),
      ),
    ),
    lines: Object.freeze(lines),
    generalNotes: normalizeOptionalText(
      "generalNotes",
      input.generalNotes,
      ASSISTED_ORDER_MAX_NOTE_LENGTH,
    ),
    affiliateAttributionRef: normalizeOptionalText(
      "affiliateAttributionRef",
      input.affiliateAttributionRef,
      160,
    ),
    // Carried through validation as free text and normalized to a code by the
    // affiliate domain at the service. It is bounded here only so an enormous
    // string cannot ride along; a value that is not a usable code is dropped
    // later rather than refused, because an unknown code must never cost a
    // customer their order.
    declaredAffiliateCode: normalizeOptionalText(
      "declaredAffiliateCode",
      input.declaredAffiliateCode,
      160,
    ),
  });
}

export function lineEstimate(
  unitPriceCents: number | null,
  quantity: number,
): number | null {
  if (unitPriceCents === null) {
    return null;
  }
  const estimate = unitPriceCents * quantity;
  if (!Number.isSafeInteger(estimate) || estimate < 1) {
    throw new AssistedOrderValidationError(
      "lines",
      "Line estimate is outside the supported range.",
    );
  }
  return estimate;
}

export function totalEstimate(
  lines: readonly Pick<
    AssistedOrderLineSnapshot,
    "lineEstimateCents" | "workflowMode"
  >[],
): number | null {
  let total = 0;
  let pricedLineCount = 0;
  for (const line of lines) {
    if (line.lineEstimateCents !== null) {
      total += line.lineEstimateCents;
      pricedLineCount += 1;
    }
  }
  return pricedLineCount === 0 ? null : total;
}
