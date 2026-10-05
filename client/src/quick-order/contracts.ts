import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "@shared/research/assisted-order/form";

/** Browser projections only. The server owns identity, visibility, prices and writes. */
export const SOURCE_OPTIONS = [
  ["person", "A person or referral partner"], ["collective", "A collective or creator"],
  ["organization", "An organization, gym or clinic"], ["social", "Social media"],
  ["search", "Search engine"], ["direct", "Direct / no referrer"], ["other", "Other source"],
] as const;
export const AFFILIATION_OPTIONS = [
  ["none", "No affiliation"], ["collective", "Collective"], ["gym", "Gym"],
  ["team", "Sports team"], ["clinic", "Clinic / practice"], ["other", "Other organization"],
] as const;
export const US_REGIONS = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");
export const WORKFLOW_LABELS = {
  direct_order_request: "Order request", provider_request: "Clinical review required",
  request_pricing: "Price on request", request_activation: "Review required",
  availability_review: "Currently unavailable",
} as const;
export interface Agreement {
  kind: string; version: string; label: string; url: string | null;
  type?: "legal" | "form_acknowledgment";
}
export interface Config { enabled: boolean; csrfToken: string; agreements: Agreement[]; }
export interface CatalogItem {
  productId: string; variantId: string; productName: string; specification: string | null;
  family: string; workflowMode: keyof typeof WORKFLOW_LABELS; unitPriceCents: number | null;
  currency: "USD"; catalogVersion: string; priceVersion: string | null;
  minimumQuantity: number; maximumQuantity: number; quantityIncrement: number;
  researchUseOnly: boolean; requestable: boolean; accessNotice: string | null;
}
export interface CatalogPage { items: CatalogItem[]; total: number; page: number; pageSize: 24; }
export interface SelectedItem extends CatalogItem { quantity: number; }
export interface Address { line1: string; line2: string; city: string; region: string; postalCode: string; countryCode: "US"; }
export interface Submission {
  schemaVersion: "quick-order-v1"; idempotencyKey: string;
  contact: { fullLegalName: string; email: string; mobilePhone: string; organizationName: string;
    ageConfirmed: boolean; shippingAddress: Address; billingSameAsShipping: boolean; billingAddress?: Address; };
  referral: { kind: string; detail: string; declaredCode: string; confirmed: boolean; };
  affiliation: { kind: string; detail: string; };
  lines: { productId: string; variantId: string; quantity: number; expectedCatalogVersion: string; expectedPriceVersion: string | null; }[];
  agreements: { kind: string; version: string; }[]; requestAcknowledged: boolean;
}
export interface Receipt {
  requestId: string; publicReference: string; status: "submitted"; paymentStatus: "not_collected";
  commissionState: "not_authorized"; attributionState: "direct_no_referrer" | "captured_unmatched";
  estimate: { knownSubtotalCents: number; estimateComplete: boolean; currency: "USD"; excludes: string; };
  replayed: boolean;
}
export type FieldErrors = Record<string, string>;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const cleanText = (value: unknown, max: number, optional = false): value is string =>
  typeof value === "string" && (optional || value.trim().length > 0) && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const integer = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && (value as number) >= minimum;
export const itemKey = (item: Pick<CatalogItem, "productId" | "variantId">) => JSON.stringify([item.productId, item.variantId]);
export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** Closed field aliases from the server contract. Never display a server's
 * arbitrary message or turn its field string into a DOM selector/path. */
export function serverFieldErrors(value: unknown, agreements: readonly Agreement[]): FieldErrors {
  if (!record(value) || value.code !== "invalid_input" || typeof value.field !== "string") return {};
  const aliases: Record<string, readonly [string, string]> = {
    "full name": ["fullLegalName", "Check your full legal name."], fullLegalName: ["fullLegalName", "Check your full legal name."],
    email: ["email", "Check your email address."], phone: ["mobilePhone", "Check your US phone number."],
    "organization name": ["organizationName", "Check your business name."], ageConfirmed: ["ageConfirmed", "Confirm that you are 18 or older."],
    billingSameAsShipping: ["billingChoice", "Check your billing-address choice."],
    "shipping address": ["shipping.line1", "Check your shipping / contact address."], "billing address": ["billingChoice", "Check your billing address."],
    referral: ["sourceKind", "Check your referral source."], "referral source": ["sourceKind", "Choose your referral source."],
    "referrer/source detail": ["sourceDetail", "Check the referrer or source name."],
    "referral code": ["declaredCode", "Check your declared referral code."], "referral.declaredCode": ["declaredCode", "Check your declared referral code."],
    "referral.confirmed": ["referralConfirmed", "Confirm your referral and affiliation details."],
    affiliation: ["affiliationKind", "Check your affiliation choice."], "affiliation name": ["affiliationDetail", "Check the affiliation name."],
    lines: ["selection", "Review your item selection."], quantity: ["selection", "Review the quantity limits for your selected items."],
    "product ID": ["selection", "Review your item selection."], "variant ID": ["selection", "Review your exact variant selection."],
    "catalog version": ["selection", "Review the current catalog selection."], "price version": ["selection", "Review the current item pricing."],
    requestAcknowledged: ["requestAcknowledged", "Acknowledge that this is a request for review."],
  };
  if (Object.hasOwn(aliases, value.field)) { const [field, message] = aliases[value.field]; return { [field]: message }; }
  const address = /^(shipping|billing) address\.(line1|line2|city|region|postalCode|countryCode)$/.exec(value.field);
  if (address) return { [`${address[1]}.${address[2] === "countryCode" ? "region" : address[2]}`]: "Check this address field." };
  if (["agreements", "agreement kind", "agreement version"].includes(value.field)) return Object.fromEntries(agreements.map((agreement, index) => [`agreement-${index}`, `Review and accept: ${agreement.label}`]));
  return {};
}

export function safeAgreementUrl(value: unknown): value is string {
  if (!cleanText(value, 2000) || /\s|\\/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
export function parseConfig(value: unknown): Config | null {
  if (!record(value) || value.demo === true || typeof value.enabled !== "boolean" || !cleanText(value.csrfToken, 4096) || !Array.isArray(value.agreements)) return null;
  if (value.enabled && (!value.agreements.length || value.agreements.length > 30)) return null;
  const seen = new Set<string>();
  const agreements: Agreement[] = [];
  for (const entry of value.agreements) {
    if (!record(entry) || !cleanText(entry.kind, 100) || !cleanText(entry.version, 100) || !cleanText(entry.label, 2000)) return null;
    if (entry.type !== undefined && entry.type !== "legal" && entry.type !== "form_acknowledgment") return null;
    if (entry.type === "form_acknowledgment" ? entry.url !== null : !safeAgreementUrl(entry.url)) return null;
    const key = entry.kind;
    if (seen.has(key)) return null;
    seen.add(key);
    agreements.push({ kind: entry.kind, version: entry.version, label: entry.label, url: entry.url as string | null,
      ...(entry.type ? { type: entry.type } : {}) });
  }
  if (value.enabled) {
    const required = requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: false });
    if (!agreements.some(entry => entry.type !== "form_acknowledgment") || required.some(ack => {
      const pair = assistedOrderFormPair(ack);
      return !agreements.some(entry => entry.kind === pair.kind && entry.version === pair.version && entry.label === ack.copy && entry.type === "form_acknowledgment");
    })) return null;
  }
  return { enabled: value.enabled, csrfToken: value.csrfToken, agreements };
}
export function parseCatalog(value: unknown, requestedPage: number): CatalogPage | null {
  if (!record(value) || value.page !== requestedPage || value.pageSize !== 24 || !integer(value.total) || !Array.isArray(value.items)) return null;
  if (value.items.length !== Math.min(24, Math.max(0, value.total - (requestedPage - 1) * 24))) return null;
  const items: CatalogItem[] = [], seen = new Set<string>();
  for (const row of value.items) {
    if (!record(row) || !cleanText(row.productId, 200) || !cleanText(row.variantId, 200) || !cleanText(row.productName, 250)
      || !cleanText(row.family, 100) || !cleanText(row.catalogVersion, 160)
      || (row.specification !== null && !cleanText(row.specification, 250, true))
      || (row.accessNotice !== null && !cleanText(row.accessNotice, 500, true))
      || typeof row.workflowMode !== "string" || !Object.hasOwn(WORKFLOW_LABELS, row.workflowMode)
      || row.currency !== "USD" || typeof row.researchUseOnly !== "boolean" || typeof row.requestable !== "boolean"
      || (row.unitPriceCents !== null && !integer(row.unitPriceCents, 1))
      || (row.priceVersion !== null && !cleanText(row.priceVersion, 160))
      || !integer(row.minimumQuantity, 1) || !integer(row.maximumQuantity, row.minimumQuantity) || row.maximumQuantity > 100000 || !integer(row.quantityIncrement, 1)) return null;
    const hidden = row.workflowMode === "provider_request" || row.workflowMode === "request_activation";
    if (hidden && (row.unitPriceCents !== null || row.priceVersion !== null)) return null;
    if (!hidden && ((row.unitPriceCents === null) !== (row.priceVersion === null))) return null;
    if (row.requestable && (row.researchUseOnly || hidden || row.workflowMode === "availability_review")) return null;
    const key = itemKey({ productId: row.productId, variantId: row.variantId });
    if (seen.has(key)) return null;
    seen.add(key);
    // Explicit public projection: transport extras never enter component state.
    items.push({ productId: row.productId, variantId: row.variantId, productName: row.productName,
      specification: row.specification, family: row.family, catalogVersion: row.catalogVersion,
      workflowMode: row.workflowMode as CatalogItem["workflowMode"], currency: "USD",
      unitPriceCents: row.unitPriceCents as number | null, priceVersion: row.priceVersion as string | null,
      minimumQuantity: row.minimumQuantity, maximumQuantity: row.maximumQuantity, quantityIncrement: row.quantityIncrement,
      researchUseOnly: row.researchUseOnly, requestable: row.requestable, accessNotice: row.accessNotice });
  }
  return { items, total: value.total, page: requestedPage, pageSize: 24 };
}
export function parseReceipt(value: unknown): Receipt | null {
  if (!record(value) || value.demo === true || typeof value.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)
    || typeof value.publicReference !== "string" || !/^XRR-\d{8}-[A-F0-9]{10}$/.test(value.publicReference)
    || value.status !== "submitted" || value.paymentStatus !== "not_collected" || value.commissionState !== "not_authorized"
    || !["direct_no_referrer", "captured_unmatched"].includes(String(value.attributionState)) || typeof value.replayed !== "boolean"
    || !record(value.estimate) || !integer(value.estimate.knownSubtotalCents)
    || typeof value.estimate.estimateComplete !== "boolean" || value.estimate.currency !== "USD" || !cleanText(value.estimate.excludes, 500)) return null;
  return { requestId: value.requestId, publicReference: value.publicReference, status: "submitted", paymentStatus: "not_collected",
    commissionState: "not_authorized", attributionState: value.attributionState as Receipt["attributionState"], replayed: value.replayed,
    estimate: { knownSubtotalCents: value.estimate.knownSubtotalCents, estimateComplete: value.estimate.estimateComplete,
      currency: "USD", excludes: value.estimate.excludes } };
}

export function formSubmission(form: HTMLFormElement, selected: SelectedItem[], config: Config, idempotencyKey: string): Submission {
  const data = new FormData(form), read = (name: string) => String(data.get(name) ?? "").trim().normalize("NFC");
  const address = (prefix: string): Address => ({ line1: read(`${prefix}.line1`), line2: read(`${prefix}.line2`), city: read(`${prefix}.city`),
    region: read(`${prefix}.region`), postalCode: read(`${prefix}.postalCode`), countryCode: "US" });
  const billingSameAsShipping = read("billingChoice") === "same";
  return { schemaVersion: "quick-order-v1", idempotencyKey,
    contact: { fullLegalName: read("fullLegalName"), email: read("email"), mobilePhone: read("mobilePhone"), organizationName: read("organizationName"),
      ageConfirmed: data.has("ageConfirmed"), shippingAddress: address("shipping"), billingSameAsShipping,
      ...(!billingSameAsShipping ? { billingAddress: address("billing") } : {}) },
    referral: { kind: read("sourceKind"), detail: read("sourceDetail"), declaredCode: read("declaredCode"), confirmed: data.has("referralConfirmed") },
    affiliation: { kind: read("affiliationKind"), detail: read("affiliationKind") === "none" ? "" : read("affiliationDetail") },
    lines: selected.map(item => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity,
      expectedCatalogVersion: item.catalogVersion, expectedPriceVersion: item.priceVersion })),
    agreements: config.agreements.filter((_, index) => data.has(`agreement-${index}`)).map(({ kind, version }) => ({ kind, version })),
    requestAcknowledged: data.has("requestAcknowledged") };
}
export function validateForm(input: Submission, config: Config, selected: SelectedItem[], billingChoice: string): FieldErrors {
  const errors: FieldErrors = {}, required = (name: string, value: string, label: string, max: number) => {
    if (!cleanText(value, max)) errors[name] = `Enter ${label}.`;
  };
  required("fullLegalName", input.contact.fullLegalName, "your full legal name", 150);
  if (!cleanText(input.contact.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact.email)) errors.email = "Enter a valid email address.";
  let digits = input.contact.mobilePhone.replace(/\D/g, ""); if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (!/^[+\d\s().-]+$/.test(input.contact.mobilePhone) || !/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) errors.mobilePhone = "Enter a valid US phone number.";
  if (!cleanText(input.contact.organizationName, 160, true)) errors.organizationName = "Check the business name.";
  const checkAddress = (address: Address | undefined, prefix: string) => {
    required(`${prefix}.line1`, address?.line1 ?? "", "address line 1", 200);
    if (!cleanText(address?.line2 ?? "", 120, true)) errors[`${prefix}.line2`] = "Check address line 2.";
    required(`${prefix}.city`, address?.city ?? "", "the city", 100);
    if (!US_REGIONS.includes(address?.region ?? "")) errors[`${prefix}.region`] = "Choose a US state or DC.";
    if (!/^\d{5}(-\d{4})?$/.test(address?.postalCode ?? "")) errors[`${prefix}.postalCode`] = "Enter a valid ZIP code.";
  };
  checkAddress(input.contact.shippingAddress, "shipping");
  if (!["same", "different"].includes(billingChoice)) errors.billingChoice = "Choose your billing-address option.";
  if (billingChoice === "different") checkAddress(input.contact.billingAddress, "billing");
  if (!input.contact.ageConfirmed) errors.ageConfirmed = "Confirm that you are 18 or older.";
  if (!SOURCE_OPTIONS.some(([kind]) => kind === input.referral.kind)) errors.sourceKind = "Choose how you heard about us.";
  if (input.referral.kind && input.referral.kind !== "direct") required("sourceDetail", input.referral.detail, "the referrer or source name", 180);
  if (input.referral.declaredCode && !/^[a-zA-Z0-9_-]{1,64}$/.test(input.referral.declaredCode)) errors.declaredCode = "Use letters, numbers, underscores or hyphens in the referral code.";
  if (!AFFILIATION_OPTIONS.some(([kind]) => kind === input.affiliation.kind)) errors.affiliationKind = "Choose an affiliation or No affiliation.";
  if (input.affiliation.kind && input.affiliation.kind !== "none") required("affiliationDetail", input.affiliation.detail, "the affiliation name", 180);
  if (!input.referral.confirmed) errors.referralConfirmed = "Confirm your referral and affiliation details.";
  if (!selected.length || selected.length > 100) errors.selection = "Choose between 1 and 100 available variants.";
  for (const item of selected) if (!item.requestable || item.researchUseOnly || ["availability_review", "provider_request", "request_activation"].includes(item.workflowMode)
    || !Number.isSafeInteger(item.quantity) || item.quantity < item.minimumQuantity || item.quantity > item.maximumQuantity
    || (item.quantity - item.minimumQuantity) % item.quantityIncrement !== 0) errors.selection = "Review your selection and each item's quantity limits.";
  const accepted = new Set(input.agreements.map(agreement => JSON.stringify([agreement.kind, agreement.version])));
  config.agreements.forEach((agreement, index) => { if (!accepted.has(JSON.stringify([agreement.kind, agreement.version]))) errors[`agreement-${index}`] = `Review and accept: ${agreement.label}`; });
  if (!input.requestAcknowledged) errors.requestAcknowledged = "Acknowledge that this is a request for review.";
  return errors;
}
