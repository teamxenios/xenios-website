/**
 * Request-scoped Product Control selection assembly for Master Offerings.
 *
 * This module does not decide whether a product may be sold. It gathers the
 * canonical Product Control, required-input, readiness, audience, and
 * inventory facts and delegates that decision to `selectCartProduct`, the
 * existing cart selection authority.
 *
 * Inventory is deliberately read in a second pass. Product, variant, price,
 * media, audience, and readiness failures are returned before a lot query is
 * attempted. Only an otherwise-valid selection may ask the inventory reader
 * for the exact variant's current facts.
 */

import type {
  CartAudienceEligibility,
  CartProductSelectionRequest,
  CartProductSelectionResult,
  CartProductSelectionSource,
} from "@shared/research/cart-product-selection";
import type { AdminProductDetail } from "@shared/research/product-admin";
import type {
  DomainReadiness,
  RequiredInput,
} from "@shared/research/required-inputs";
import type { VariantInventoryFactsReader } from "../catalog/member-catalog-service";
import { selectCartProduct } from "../commerce/cart-product-selection";
import type { PricingProductSource } from "../pricing/authoritative-price-resolver";
import type { ProductControlSelectionAuthority } from "./product-control-adapter";

export interface ProductControlCartSelectionDependencies {
  /** A request-scoped Product Control snapshot shared with price resolution. */
  products: PricingProductSource;
  requiredInputs: {
    list(domain?: string): Promise<RequiredInput[]>;
    readinessAll(): Promise<DomainReadiness[]>;
  };
  inventory: VariantInventoryFactsReader;
  /** Server-derived authorization only. Never build this from request input. */
  audienceEligibility():
    | Promise<CartAudienceEligibility | null>
    | CartAudienceEligibility
    | null;
}

function sourceFor(
  product: AdminProductDetail | null,
  requiredInputs: readonly RequiredInput[],
  readiness: readonly DomainReadiness[],
  audienceEligibility: CartAudienceEligibility | null,
): CartProductSelectionSource {
  return {
    products: product === null ? [] : [product],
    variants: product?.variants ?? [],
    prices: product?.prices ?? [],
    media: product?.media ?? [],
    requiredInputs,
    readiness,
    audienceEligibility,
    inventoryEligibility: null,
  };
}

function exactVariant(
  product: AdminProductDetail,
  variantId: string,
): AdminProductDetail["variants"][number] | null {
  const matches = product.variants.filter(
    (variant) => variant.id === variantId,
  );
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Adapt the existing canonical readers into the existing canonical selector.
 *
 * One instance is intended to live for one HTTP request. Repository promises
 * are memoized only for that lifetime, so every variant on a page sees one
 * readiness snapshot while a later request re-reads current state.
 */
export function createProductControlCartSelectionAuthority(
  dependencies: ProductControlCartSelectionDependencies,
): ProductControlSelectionAuthority {
  let requiredInputs: Promise<readonly RequiredInput[]> | null = null;
  let readiness: Promise<readonly DomainReadiness[]> | null = null;
  let audienceEligibility: Promise<CartAudienceEligibility | null> | null =
    null;
  const inventory = new Map<
    string,
    ReturnType<VariantInventoryFactsReader["readVariantInventoryFacts"]>
  >();

  const readRequiredInputs = () => {
    if (requiredInputs === null) {
      requiredInputs = Promise.resolve(dependencies.requiredInputs.list());
      requiredInputs.catch(() => undefined);
    }
    return requiredInputs;
  };

  const readReadiness = () => {
    if (readiness === null) {
      readiness = Promise.resolve(dependencies.requiredInputs.readinessAll());
      readiness.catch(() => undefined);
    }
    return readiness;
  };

  const readAudienceEligibility = () => {
    if (audienceEligibility === null) {
      audienceEligibility = Promise.resolve(dependencies.audienceEligibility());
      audienceEligibility.catch(() => undefined);
    }
    return audienceEligibility;
  };

  const readInventory = (
    product: AdminProductDetail,
    request: CartProductSelectionRequest,
  ) => {
    const variant = exactVariant(product, request.variantId);
    if (variant === null) return null;
    const key = `${product.id}|${variant.id}|${request.evaluatedAt}`;
    const cached = inventory.get(key);
    if (cached !== undefined) return cached;
    const pending = dependencies.inventory.readVariantInventoryFacts({
      productId: product.id,
      variant,
      evaluatedAt: request.evaluatedAt,
    });
    pending.catch(() => undefined);
    inventory.set(key, pending);
    return pending;
  };

  return {
    async select(request): Promise<CartProductSelectionResult> {
      const requestValidation = selectCartProduct(
        request,
        sourceFor(null, [], [], null),
      );
      if (
        !requestValidation.ok &&
        requestValidation.code === "invalid_request"
      ) {
        return requestValidation;
      }

      const product = await dependencies.products.readProductForPricing(
        request.productId,
      );

      // Product identity is checked before the shared governance reads. This
      // keeps a missing/foreign product from fanning out into unrelated stores.
      if (product === null || product.id !== request.productId) {
        return selectCartProduct(request, sourceFor(product, [], [], null));
      }

      const [inputs, domains, audience] = await Promise.all([
        readRequiredInputs(),
        readReadiness(),
        readAudienceEligibility(),
      ]);
      const preliminarySource = sourceFor(product, inputs, domains, audience);
      const preliminary = selectCartProduct(request, preliminarySource);
      if (
        preliminary.ok ||
        preliminary.code !== "inventory_eligibility_missing"
      ) {
        return preliminary;
      }

      const pendingInventory = readInventory(product, request);
      if (pendingInventory === null) {
        // The preliminary selector can reach inventory only after proving one
        // exact variant. Retain a fail-closed result if that invariant changes.
        return { ok: false, code: "variant_ambiguous" };
      }
      const facts = await pendingInventory;
      return selectCartProduct(request, {
        ...preliminarySource,
        inventoryEligibility: facts.inventory,
      });
    },
  };
}
