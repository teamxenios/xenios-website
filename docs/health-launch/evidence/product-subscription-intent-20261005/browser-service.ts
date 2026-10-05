import { createInMemorySubscriptionRepository, createSubscriptionService } from "../../../../server/research/commerce/subscriptions";
import type { CatalogProduct, ProvenancedFact } from "../../../../shared/research/catalog";
const fact = <T,>(value: T): ProvenancedFact<T> => ({ value, confirmation: "confirmed", source: { kind: "supplier_document", reference: "SYNTHETIC-ONLY" } });
const product: CatalogProduct = {
  sku: "SYNTHETIC-RUO-01", slug: "synthetic-product", displayName: "Synthetic research product",
  lane: "research_material", laneDecision: "decided", nameAliases: [], availability: "in_stock",
  commerceApproval: "approved", fulfillmentOwner: "mitch",
  facts: { composition: fact("Synthetic composition"), strength: fact("Synthetic strength"), format: fact("Synthetic format"),
    priceCents: fact(1250), shelfLife: fact("Synthetic"), storage: fact("Synthetic"), coa: fact("Synthetic") },
  guideState: "guide_published", qualityDocumentState: "approved", storageDataState: "approved", shippingProfileState: "approved",
  goalMappings: [], relatedGuideSlugs: [], prohibitedClaims: [], subscriptionEligible: true, lastReviewed: "2026-10-05", openSupplierQuestions: [],
};
const repository = createInMemorySubscriptionRepository();
let paymentCalls = 0;
const calls: Array<{ mode: string; input: unknown; result: unknown }> = [];
function service(enabled: boolean) {
  return createSubscriptionService({ repository, catalog: new Map([[product.sku, product]]), lots: [],
    commerceEnabled: true, quantumCommerceEnabled: false, isMembershipActive: () => true,
    hasEffectiveAgreement: () => true, requiredAgreementKeys: [],
    payment: { retrieveStatus: async () => { paymentCalls++; return { ok: false, code: "DISABLED", retryable: false, message: "Synthetic provider disabled" }; } },
    resolveRenewalPaymentReference: () => null, isCurrentLiveActivation: () => true,
    purchaseExpansionPersistenceAvailable: enabled,
  });
}
export async function create(mode: string, input: Parameters<ReturnType<typeof service>["create"]>[1]) {
  // The actual production composition is never imported. Only this local proof
  // enables the service seam for synthetic pending/lost-response cases.
  const result = await service(mode !== "blocked").create("synthetic-browser-customer", input, new Date());
  calls.push({ mode, input, result });
  return result;
}
export async function proof() {
  const subscriptions = await service(false).listForMember("synthetic-browser-customer");
  return { syntheticOnly: true, calls, subscriptions, paymentCalls,
    events: await Promise.all(subscriptions.map(record => repository.listEvents(record.subscriptionId))),
    referralAttribution: "not_implemented_in_subscription_record", commissionIntegration: "not_connected", payoutIntegration: "not_connected" };
}

export const detail = { ok: true, product: {
  id: "synthetic-product", slug: "synthetic-product", displayName: "Synthetic Research", canonicalName: "Synthetic Research",
  aliases: [], lane: "research_material", category: "Research", classification: "Research material", summary: "Synthetic review only.",
  displayState: "unavailable", media: null, price: null, readiness: null, selection: null, variantCount: 0,
  updatedAt: "2026-10-05T12:00:00.000Z", audience: "member", currency: "USD", evaluatedAt: "2026-10-05T12:00:00.000Z",
  overview: null, specifications: null, researchInformation: null, storageInformation: null, shippingInformation: null,
  returnInformation: null, disclaimers: null, reviewDate: null, variants: [], relatedProducts: [], researchOnlyBoundary: true,
} };
