import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const sourceVariant = "mov_ca3e45ae9712aee91430";
export const artwork = "/research/product-media/bpc-157-packshot.webp";
export const fixturePrice = 1250;
export const fixtureCurrency = "USD";
export const fixtureUnit = "10 mg per vial";
const family = "research_peptides_materials";
const catalogVersion = "qo-visual-synthetic-v1";
const agreement = { kind: "early_access_terms", version: "v1" };
const intent = "/api/research/early-access/request-intents";

export async function fixtureResponses(candidate) {
  const form = await import(pathToFileURL(join(candidate, "shared/research/assisted-order/form.ts")));
  const formAcknowledgments = form.ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((entry) => ({
    id: entry.id, scope: entry.scope, copy: entry.copy, ...form.assistedOrderFormPair(entry),
  }));
  const item = {
    productId: "qa-bpc-157-product",
    variantId: "qa-bpc-157-order-variant",
    productName: "BPC-157",
    family,
    sourceSelection: { family, slug: "qa-bpc-157", variantId: sourceVariant },
    specification: fixtureUnit + " · synthetic USD fixture",
    format: "Lyophilized vial",
    packBasis: "One vial (synthetic fixture)",
    minimumQuantity: 1, maximumQuantity: 10, quantityIncrement: 1,
    unitPriceCents: fixturePrice, currency: fixtureCurrency,
    selectableForReview: true, clinicalReviewRequired: false, researchUseOnly: true,
    intentExclusion: null, sourceRefusal: null, workflowMode: "direct_order_request",
    sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access",
    channel: "Synthetic visual QA", catalogVersion, priceVersion: "synthetic-price-v1",
  };
  return new Map([
    ["/api/config", { metaPixelId: null, turnstileSiteKey: null, calendlyUrl: "", supabaseUrl: null, supabaseAnonKey: null }],
    ["/api/research/me", { configured: true, authed: true }],
    ["/api/research/policies", { policies: [] }],
    ["/api/research/early-access/session", { authenticated: true, expiresAt: null }],
    ["/api/research/early-access/agreements", { ok: true, required: [agreement], accepted: true }],
    ["/api/research/early-access/assisted-orders/config", { enabled: false }],
    [intent + "/config", { enabled: true, requiredAgreements: [agreement], formAcknowledgments }],
    [intent + "/catalog", { items: [item], total: 1, page: 1, pageSize: 24, families: [family], channels: [], workflowModes: [] }],
  ]);
}
