import { describe, expect, it } from "vitest";
import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "@shared/research/assisted-order/form";
import { parseCatalog, parseConfig, parseReceipt, safeAgreementUrl, serverFieldErrors, validateForm, type Config, type SelectedItem, type Submission } from "./contracts";

export const syntheticConfig: Config = { enabled: true, csrfToken: "synthetic-csrf", agreements: [
  { kind: "terms", version: "synthetic-v1", label: "Synthetic terms", url: "/legal/synthetic-terms" },
  ...requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: false }).map(ack => ({ ...assistedOrderFormPair(ack), label: ack.copy, type: "form_acknowledgment" as const, url: null })),
] };
export const syntheticItem: SelectedItem = { productId: "synthetic-product", variantId: "synthetic-variant", productName: "Synthetic item", specification: "Exact test variant",
  family: "Synthetic", workflowMode: "direct_order_request", unitPriceCents: 2500, currency: "USD", catalogVersion: "synthetic-catalog-v1", priceVersion: "synthetic-price-v1",
  minimumQuantity: 1, maximumQuantity: 50, quantityIncrement: 1, researchUseOnly: false, requestable: true, accessNotice: null, quantity: 1 };
export function syntheticInput(): Submission { return { schemaVersion: "quick-order-v1", idempotencyKey: "synthetic-request-key-01",
  contact: { fullLegalName: "Synthetic Customer", email: "synthetic@example.test", mobilePhone: "2025550123", organizationName: "", ageConfirmed: true,
    shippingAddress: { line1: "123 Example Street", line2: "", city: "Austin", region: "TX", postalCode: "78701", countryCode: "US" }, billingSameAsShipping: true },
  referral: { kind: "direct", detail: "", declaredCode: "", confirmed: true }, affiliation: { kind: "none", detail: "" },
  lines: [{ productId: syntheticItem.productId, variantId: syntheticItem.variantId, quantity: 1, expectedCatalogVersion: syntheticItem.catalogVersion, expectedPriceVersion: syntheticItem.priceVersion }],
  agreements: syntheticConfig.agreements.map(({ kind, version }) => ({ kind, version })), requestAcknowledged: true }; }
export const syntheticReceipt = { requestId: "454b01cd-4ce9-4a45-a5a3-454cef294c48", publicReference: "XRR-20261005-ABCDEF1234",
  status: "submitted", paymentStatus: "not_collected", commissionState: "not_authorized", attributionState: "direct_no_referrer", replayed: false,
  estimate: { knownSubtotalCents: 2500, estimateComplete: true, currency: "USD", excludes: "Synthetic estimate, not a payment quote." } };
const validate = (input = syntheticInput(), items = [syntheticItem], billing = "same") => validateForm(input, syntheticConfig, items, billing);
describe("Quick Order browser contracts", () => {
  it("maps only known server field aliases and never reflects arbitrary messages", () => {
    expect(serverFieldErrors({ code: "invalid_input", field: "phone", message: "private reflected payload" }, syntheticConfig.agreements)).toEqual({ mobilePhone: "Check your US phone number." });
    expect(serverFieldErrors({ code: "invalid_input", field: "shipping address.region" }, syntheticConfig.agreements)).toEqual({ "shipping.region": "Check this address field." });
    for (const field of ["__proto__", "constructor", "#injected-selector", "private-field"]) expect(serverFieldErrors({ code: "invalid_input", field }, syntheticConfig.agreements)).toEqual({});
    expect(Object.keys(serverFieldErrors({ code: "invalid_input", field: "agreements" }, syntheticConfig.agreements))).toEqual(["agreement-0", "agreement-1", "agreement-2", "agreement-3"]);
  });
  it("accepts explicit direct/no-affiliation and optional empty fields", () => expect(validate()).toEqual({}));
  it.each(["fullLegalName", "email", "mobilePhone"] as const)("requires %s", name => { const input = syntheticInput(); input.contact[name] = "  "; expect(validate(input)).toHaveProperty(name); });
  it.each(["line1", "city", "region", "postalCode"] as const)("requires shipping %s", name => { const input = syntheticInput(); input.contact.shippingAddress[name] = ""; expect(validate(input)).toHaveProperty([`shipping.${name}`]); });
  it.each(["person", "collective", "organization", "social", "search", "other"])("requires detail for %s", kind => { const input = syntheticInput(); input.referral.kind = kind; expect(validate(input)).toHaveProperty("sourceDetail"); });
  it.each(["collective", "gym", "team", "clinic", "other"])("requires affiliation detail for %s", kind => { const input = syntheticInput(); input.affiliation.kind = kind; expect(validate(input)).toHaveProperty("affiliationDetail"); });
  it("requires each declaration, billing choice and agreement", () => { const input = syntheticInput(); input.contact.ageConfirmed = false; input.referral.confirmed = false; input.requestAcknowledged = false; input.agreements = []; input.referral.kind = ""; input.affiliation.kind = "";
    expect(Object.keys(validate(input, [syntheticItem], ""))).toEqual(expect.arrayContaining(["ageConfirmed", "billingChoice", "referralConfirmed", "requestAcknowledged", "agreement-0", "agreement-1", "sourceKind", "affiliationKind"])); });
  it("requires all separate billing fields", () => { const input = syntheticInput(); input.contact.billingSameAsShipping = false; const found = validate(input, [syntheticItem], "different");
    expect(Object.keys(found)).toEqual(expect.arrayContaining(["billing.line1", "billing.city", "billing.region", "billing.postalCode"]));
    input.contact.billingAddress = { ...input.contact.shippingAddress }; expect(validate(input, [syntheticItem], "different")).toEqual({}); });
  it.each(["name@example", "a b@example.test", "<script>"])("refuses malformed email %s", email => { const input = syntheticInput(); input.contact.email = email; expect(validate(input)).toHaveProperty("email"); });
  it.each(["123", "1115550123", "2021550123", "2025550123 ext 2"])("refuses malformed US phone %s", mobilePhone => { const input = syntheticInput(); input.contact.mobilePhone = mobilePhone; expect(validate(input)).toHaveProperty("mobilePhone"); });
  it.each([0, 51, 100, 1.5, NaN])("preserves canonical cap and whole quantities: %s", quantity => expect(validate(syntheticInput(), [{ ...syntheticItem, quantity }])).toHaveProperty("selection"));
  it("enforces increment/minimum and excludes held and Research rows", () => { for (const item of [{ ...syntheticItem, quantity: 4, minimumQuantity: 3, quantityIncrement: 2 }, { ...syntheticItem, researchUseOnly: true }, { ...syntheticItem, workflowMode: "availability_review" as const }]) expect(validate(syntheticInput(), [item])).toHaveProperty("selection"); });
  it("rejects false receipt envelopes, identity, money and demo references", () => { expect(parseReceipt(syntheticReceipt)).not.toBeNull(); for (const patch of [{}, { requestId: "" }, { requestId: "not-a-uuid" }, { publicReference: "DEMO-1" }, { publicReference: "XRR-20261005-WRONG" }, { status: "paid" }, { paymentStatus: "paid" }, { commissionState: "authorized" }, { replayed: undefined }, { estimate: { ...syntheticReceipt.estimate, knownSubtotalCents: -1 } }]) {
    expect(parseReceipt(Object.keys(patch).length ? { ...syntheticReceipt, ...patch } : {})).toBeNull(); } });
  it("projects receipt fields without private extras", () => expect(parseReceipt({ ...syntheticReceipt, statusToken: "private", customer: "private" })).toEqual(syntheticReceipt));
  it("validates legal URLs and distinct form acknowledgements", () => { expect(parseConfig(syntheticConfig)).toEqual(syntheticConfig);
    for (const url of ["//evil.test", "javascript:alert(1)", "/\\evil.test", "https://user:password@example.test"]) expect(safeAgreementUrl(url)).toBe(false);
    expect(parseConfig({ ...syntheticConfig, agreements: [{ ...syntheticConfig.agreements[0], url: null }] })).toBeNull();
    expect(parseConfig({ ...syntheticConfig, agreements: [...syntheticConfig.agreements, syntheticConfig.agreements[0]] })).toBeNull(); });
  it("checks exact variant pagination and rejects inflated or partial totals", () => { expect(parseCatalog({ items: [syntheticItem], total: 25, page: 2, pageSize: 24 }, 2)?.total).toBe(25);
    expect(parseCatalog({ items: [syntheticItem], total: 25, page: 1, pageSize: 24 }, 1)).toBeNull();
    expect(parseCatalog({ items: [syntheticItem], total: 1, page: 2, pageSize: 24 }, 1)).toBeNull(); });
  it("fails closed on unknown workflows, missing caps and provider price leaks", () => { for (const patch of [{ workflowMode: "unknown" }, { maximumQuantity: undefined }, { workflowMode: "provider_request" }, { researchUseOnly: true }, { currency: "GBP" }]) expect(parseCatalog({ items: [{ ...syntheticItem, ...patch }], total: 1, page: 1, pageSize: 24 }, 1)).toBeNull(); });
});
