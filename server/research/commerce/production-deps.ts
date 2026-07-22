import type { CommerceDependencies } from "./routes";
import { products as legacyProducts } from "../products-data";
import { adaptLegacyCatalog } from "../catalog/legacy-adapter";
import { createCatalogService } from "../catalog/catalog-service";

// ---------------------------------------------------------------------------
// Production commerce dependencies (integration lane).
//
// The commerce HTTP surface is registered with these deps by the integration
// wiring. Two things are true at once and both are honest:
//
//   1. The CATALOG read path is real. It is backed by the provenance-adapted
//      legacy catalog, so the member catalog and goal pages render with
//      supplier facts gated by their confirmation state (an unconfirmed fact is
//      never shown as fact). commerceEnabled is false, so nothing is presented
//      as purchasable.
//
//   2. Every STATEFUL surface (cart writes, checkout, orders, subscriptions,
//      claims, store credit, partners, admin queues) FAILS CLOSED. Their
//      database tables (migrations 20-26) are not provisioned and their
//      production repositories are the next commerce build step, so each read
//      returns empty and each write returns { ok: false, code: "commerce_disabled" }.
//      This is the disabled-provider pattern the rest of the system uses: a
//      capability that is not ready refuses cleanly rather than half-working.
//
// This is deliberately NOT a claim that commerce is live. Product commerce
// stays gated by NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED (false), by per-SKU
// purchase eligibility (0 of 15 today; no COAs on file), and by the absent
// payment provider. See docs/research-commerce/PURCHASE_ELIGIBILITY_FINAL.md.
// ---------------------------------------------------------------------------

const COMMERCE_ENABLED = process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED === "true";
const QUANTUM_ENABLED = process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED === "true" && process.env.RESEARCH_QUANTUM_COMMERCE_ENABLED === "true";

const DISABLED = { ok: false as const, code: "commerce_disabled" as const };

export function buildCommerceDependencies(now: () => Date = () => new Date()): CommerceDependencies {
  // Real catalog, provenance-gated. Reviewed date is the catalog review date;
  // it labels the adapted records, it is not a live inventory timestamp.
  const adapted = adaptLegacyCatalog(legacyProducts, "2026-07-20");
  const catalogService = createCatalogService({
    products: adapted.products,
    commerceEnabled: COMMERCE_ENABLED,
    quantumCommerceEnabled: QUANTUM_ENABLED,
  });

  return {
    catalog: {
      listProducts: () => catalogService.listProducts(),
      getProduct: (slug) => catalogService.getProduct(slug),
      listGoals: () => catalogService.listGoals(),
    },
    // Evidence-domain guides exist (server/research/evidence), but the
    // evidence-to-commerce DTO adapter is the next content-integration step, so
    // the member guide surface reads empty rather than presenting unmapped data.
    guides: {
      listForMember: () => Promise.resolve([]),
      getForMember: () => Promise.resolve(null),
    },
    cart: {
      getCart: (memberId) => Promise.resolve({ owner: memberId, lines: [], commerceEnabled: false }),
      addLine: () => Promise.resolve(DISABLED),
      updateLine: () => Promise.resolve(DISABLED),
      removeLine: () => Promise.resolve(DISABLED),
    },
    checkout: {
      submit: async () => DISABLED,
    },
    orders: {
      listForMember: () => Promise.resolve([]),
      getForMember: () => Promise.resolve(null),
    },
    subscriptions: {
      listForMember: () => Promise.resolve([]),
      apply: () => Promise.resolve(DISABLED),
    },
    claims: {
      submitClaim: () => Promise.resolve(DISABLED),
      listForMember: () => Promise.resolve([]),
    },
    storeCredit: {
      forMember: (memberId) => Promise.resolve({ owner: memberId, balanceCents: 0, entries: [] }),
    },
    partners: {
      findByMemberId: () => Promise.resolve(null),
      dashboardFor: (partnerId) => Promise.resolve({ partnerId, provisioned: false }),
      listLinks: () => Promise.resolve([]),
    },
    capabilities: {
      memberVisible: () => ({
        product_commerce: { enabled: COMMERCE_ENABLED },
        quantum_commerce: { enabled: QUANTUM_ENABLED },
      }),
    },
    adminQueues: {
      commerce: () => Promise.resolve({ provisioned: false, items: [] }),
    },
    now,
  };
}
