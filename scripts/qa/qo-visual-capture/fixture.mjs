import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const sourceVariant = "mov_ca3e45ae9712aee91430";
export const artwork = "/research/product-media/bpc-157-packshot.webp";
export const fixturePrice = 1250;
export const fixtureCurrency = "USD";
export const fixtureUnit = "10 mg per vial";
export const alternateSourceVariant = "mov_09db3e866424b64994d3";
export const alternateMemberOffering = "mo_e4de11c77d16c4c3b83d";
export const alternateOrderVariant = "qa-bpc-157-5mg-order-variant";
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

/** Separate 320px SVG-card fixtures; the reviewed four-width fixture stays unchanged. */
export async function svgCardFixtureResponses(candidate, origin, member) {
  const fixtures = await fixtureResponses(candidate, origin, member);
  const fiveMgSlug = "research-peptides-materials-bpc-157-bpc-157-5-mg";
  const guestCatalog = fixtures.get(intent + "/catalog");
  fixtures.set(intent + "/catalog", {
    ...guestCatalog,
    items: [{
      ...guestCatalog.items[0],
      variantId: alternateOrderVariant,
      sourceSelection: { family, slug: fiveMgSlug, variantId: alternateSourceVariant },
      specification: "5 mg per vial · synthetic USD fixture",
    }],
  });
  if (member) {
    const envelope = fixtures.get(catalogApi + "/catalog");
    const fiveMg = fixtures.get(memberDetailApi).product.variants.find((entry) => entry.id === alternateSourceVariant);
    if (!fiveMg) throw new Error("The reviewed fixture must supply the exact 5 mg variant");
    const card = envelope.catalog.products[0];
    fixtures.set(catalogApi + "/catalog", {
      ...envelope,
      catalog: { ...envelope.catalog, products: [{
        ...card, id: alternateMemberOffering, slug: fiveMgSlug, variants: [fiveMg],
      }] },
    });
  }
  return fixtures;
}

export const guestCatalogPath = intent + "/catalog";
export const guestMobilePageMarkers = ["BPC-157", "Synthetic page 2 marker", "Synthetic page 3 marker"];
export const guestMobileOtherFamily = "shipping_and_fulfillment";
const guestMobileMitoOffering = "mo_5050cf525ec249ebf0bf";
const guestMobileMitoVariant = "mov_199a0126b086cc43cb1b";

export async function guestMobileCatalogFixtures(candidate, seed) {
  const load = async (file) => JSON.parse(await readFile(join(candidate, "server/research/master-offerings/data", file), "utf8"));
  const [catalog, copy, media] = await Promise.all([
    load("member-safe-master-offerings.generated.json"),
    load("reviewed-public-content.json"),
    load("reviewed-public-media.json"),
  ]);
  const get = (records, offeringId, variantId) =>
    records.find((record) => record.offeringId === offeringId && record.sourceVariantId === variantId);
  const project = (offeringId, variantId) => {
    const product = catalog.products.find((item) => item.id === offeringId);
    const variant = product?.variants.find((item) => item.id === variantId);
    const reviewed = get(media.records, offeringId, variantId);
    if (!variant || !reviewed?.media?.primary || !/^[0-9a-f]{64}$/.test(reviewed.primarySha256)) {
      throw new Error("Guest mobile fixture did not resolve the exact offering, variant and artwork");
    }
    return {
      ...seed.items[0],
      productName: product.displayName,
      family: product.family,
      sourceSelection: { family: product.family, slug: product.slug, variantId },
      specification: variant.label,
      reviewedMedia: reviewed.media,
    };
  };
  const bpc = project(memberOffering, sourceVariant);
  const bpcMedia = get(media.records, memberOffering, sourceVariant);
  const mito = {
    ...project(guestMobileMitoOffering, guestMobileMitoVariant),
    productId: "qa-mobile-mito-product",
    variantId: "qa-mobile-mito-variant",
    format: null,
    packBasis: null,
    unitPriceCents: null,
    researchUseOnly: false,
    reviewedContent: get(copy.records, guestMobileMitoOffering, guestMobileMitoVariant)?.content,
  };
  const mitoMedia = get(media.records, guestMobileMitoOffering, guestMobileMitoVariant);
  if (bpc.productName !== guestMobilePageMarkers[0] || bpc.family !== family ||
      bpc.sourceSelection.variantId === bpc.variantId || !bpcMedia.media.packagingDesign ||
      !bpcMedia.media.labelPreview || !/^[0-9a-f]{64}$/.test(bpcMedia.labelPreviewSha256) ||
      mito.productName !== "Mito Recharge" || mito.family !== "supplements" ||
      !mito.reviewedContent?.summary || !mito.reviewedContent?.overview || mitoMedia.media.labelPreview) {
    throw new Error("Guest mobile fixture requires exact BPC-157 artwork/label and independent Mito Recharge content");
  }
  return {
    bpc, mito,
    assets: {
      [sourceVariant]: { file: bpcMedia.media.primary.href, sha256: bpcMedia.primarySha256 },
      [sourceVariant + "-label"]: { file: bpcMedia.media.labelPreview.href, sha256: bpcMedia.labelPreviewSha256 },
      [guestMobileMitoVariant]: { file: mitoMedia.media.primary.href, sha256: mitoMedia.primarySha256 },
    },
  };
}

export function guestMobileCatalogResponse(seed, { bpc, mito }, params) {
  const page = Number(params.get("page"));
  if (!Number.isSafeInteger(page) || page < 1 || params.get("pageSize") !== "24") {
    throw new Error("Unexpected guest mobile catalog paging query");
  }
  const requestedFamily = params.get("family");
  const search = (params.get("search") || "").trim().toLowerCase();
  const families = [family, mito.family, guestMobileOtherFamily];
  if (requestedFamily && !families.includes(requestedFamily)) throw new Error("Unexpected fixture family");
  const first = seed.items[0];
  const rows = Array.from({ length: 49 }, (_, index) => {
    if (index === 0) return bpc;
    if (index === 25) return mito;
    const otherFamily = index >= 47;
    return {
      ...first,
      productId: "qa-mobile-product-" + index,
      variantId: "qa-mobile-variant-" + index,
      productName: index === 24 ? guestMobilePageMarkers[1] : index === 48 ? guestMobilePageMarkers[2]
        : "Synthetic mobile catalog row " + index,
      family: otherFamily ? guestMobileOtherFamily : family,
      sourceSelection: undefined,
      specification: "Synthetic exact specification " + index,
      selectableForReview: !otherFamily,
      intentExclusion: otherFamily ? "non_merchandise" : null,
      researchUseOnly: !otherFamily,
    };
  });
  const matched = rows.filter((item) =>
    (!requestedFamily || item.family === requestedFamily) &&
    (!search || (item.productName + " " + item.specification).toLowerCase().includes(search)));
  return { ...seed, items: matched.slice((page - 1) * 24, page * 24), total: matched.length, page, families };
}
