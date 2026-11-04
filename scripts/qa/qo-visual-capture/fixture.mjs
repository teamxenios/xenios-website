import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const sourceVariant = "mov_ca3e45ae9712aee91430";
export const artwork = "/research/product-media/bpc-157-packshot.webp";
export const fixturePrice = 1250;
export const fixtureCurrency = "USD";
export const fixtureUnit = "10 mg per vial";
export const alternateSourceVariant = "mov_09db3e866424b64994d3";
export const orderVariant = "qa-bpc-157-order-variant";
export const alternateArtwork = "/research/product-media/vial.svg";
export const guestRoute = "/research/early-access/order-request";
export const memberRoute = "/research/member/catalog";
export const memberOffering = "mo_af289f611c02b3fcef01";
const family = "research_peptides_materials";
const catalogVersion = "qo-visual-synthetic-v1";
export const fixtureAgreement = Object.freeze({ kind: "early_access_terms", version: "qa-visual-v2" });
const researchUsePolicy = {
  title: "Synthetic Research Use Policy",
  agreement: fixtureAgreement,
  sections: [{
    heading: "Isolated visual capture",
    paragraphs: ["This synthetic fixture demonstrates the nonclinical research request screen only. It records no agreement or request."],
  }],
};
const intent = "/api/research/early-access/request-intents";
const slug = "research-peptides-materials-bpc-157-bpc-157-10-mg";
const catalogApi = "/api/research/catalog-display/v2";
const memberSessionExpiry = 4102444800;
const mockMember = { firstName: "Synthetic", status: "active", applicationStatus: "approved", cartScope: "a".repeat(64) };
export const agreementStatus = "/api/research/early-access/agreements";
export const agreementAccept = agreementStatus + "/accept";
export const memberDetailRoute = memberRoute + "/" + family + "/" + slug;
export const memberDetailApi = catalogApi + "/products/" + family + "/" + slug;

const jwtPart = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const memberUser = { id: "00000000-0000-4000-8000-000000000003", aud: "authenticated", role: "authenticated", email: "member@example.invalid" };
const accessToken = [
  jwtPart({ alg: "HS256", typ: "JWT" }),
  jwtPart({ sub: memberUser.id, exp: memberSessionExpiry, amr: [{ method: "password" }] }),
  "synthetic-signature",
].join(".");
export const memberBearer = "Bearer " + accessToken;
export const memberSession = {
  access_token: accessToken, token_type: "bearer", expires_at: memberSessionExpiry,
  expires_in: 3600, refresh_token: "synthetic-unused-refresh-token", user: memberUser,
};
export const fixtureContact = {
  name: "Synthetic Browser Tester", email: "customer@example.invalid", phone: "+12025550123",
  shippingLine1: "100 Example Street", shippingCity: "Austin", shippingRegion: "TX",
  shippingPostalCode: "78701", shippingCountryCode: "US",
};

export async function fixtureResponses(candidate, origin, member) {
  const form = await import(pathToFileURL(join(candidate, "shared/research/assisted-order/form.ts")));
  const contract = await import(pathToFileURL(join(candidate, "shared/research/master-offerings/contract.ts")));
  const formAcknowledgments = form.ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((entry) => ({
    id: entry.id, scope: entry.scope, copy: entry.copy, ...form.assistedOrderFormPair(entry),
  }));
  const item = {
    productId: "qa-bpc-157-product",
    variantId: orderVariant,
    productName: "BPC-157",
    family,
    sourceSelection: { family, slug, variantId: sourceVariant },
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
  const price = {
    state: "priced", basis: "exact_listed_unit", amountCents: fixturePrice, currency: fixtureCurrency, display: "$12.50",
    priceId: "synthetic-price", priceVersion: 1, effectiveAt: "2026-10-01T00:00:00.000Z", expiresAt: null,
  };
  const variant = (id, label) => ({
    id, label, displayState: "request_access", displayLabel: "Request access", price,
    action: { kind: "request_access", label: "Request Access", href: "/research/member/product-requests/new" },
  });
  const tenMg = variant(sourceVariant, "BPC-157 10 mg");
  const fiveMg = variant(alternateSourceVariant, "BPC-157 5 mg");
  const card = {
    id: memberOffering, slug, family, displayName: "BPC-157", canonicalName: "BPC-157",
    familyLabel: "Research Peptides & Materials", category: "Research Peptides & Materials",
    subcategory: "Lyophilized Vial", brand: null, displayState: "request_access", displayLabel: "Request access",
    stateExplanation: "Research Use Only. Nonclinical use only. Synthetic USD fixture.", copyState: "draft",
    variantCount: 1, variants: [tenMg],
    priceSummary: { state: "single", variantCount: 1, pricedVariantCount: 1, currency: fixtureCurrency,
      fromCents: fixturePrice, toCents: fixturePrice, display: price.display },
  };
  const memberEnvelope = { ok: true, audience: "member", launchScope: "founder_admin" };
  return new Map([
    ["/api/config", {
      metaPixelId: null, turnstileSiteKey: null, calendlyUrl: "",
      supabaseUrl: member ? origin : null, supabaseAnonKey: member ? "synthetic-loopback-only" : null,
    }],
    ["/api/research/me", { configured: true, authed: !member }],
    ["/api/research/policies", { policies: { "research-use": researchUsePolicy } }],
    ["/api/research/early-access/session", { authenticated: true, expiresAt: null }],
    [agreementStatus, { ok: true, required: [fixtureAgreement], accepted: false }],
    ["/api/research/early-access/assisted-orders/config", { enabled: false }],
    [intent + "/config", { enabled: true, requiredAgreements: [fixtureAgreement], formAcknowledgments }],
    [intent + "/catalog", { items: [item], total: 1, page: 1, pageSize: 24, families: [family], channels: [], workflowModes: [] }],
    ...(member ? [
      ["/api/research/member/me", { ok: true, member: mockMember }],
      ["/api/research/catalog", { products: [], commerce: { research: false, consumer: false }, email: "catalog@example.invalid" }],
      [catalogApi + "/catalog", { ...memberEnvelope, catalog: {
        ok: true, page: 1, pageSize: 24, total: 1, totalPages: 1, sort: contract.DEFAULT_MASTER_OFFERING_SORT,
        products: [card], facets: contract.EMPTY_MASTER_OFFERING_FACETS,
      } }],
      [memberDetailApi, { ...memberEnvelope, product: {
        ...card, variantCount: 2, variants: [tenMg, fiveMg],
        priceSummary: { ...card.priceSummary, variantCount: 2, pricedVariantCount: 2 },
        overview: "Synthetic two-strength selector fixture. The source catalog lists these strengths separately.",
        disclosures: ["Synthetic catalog presentation. No production availability or approved price is represented."],
      } }],
    ] : []),
  ]);
}
