import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductSummaryDto } from "@shared/research/commerce-api";
import { useResearch } from "../../core";
import { listProducts } from "../../adapters/commerce";
import {
  getProductPlatform,
  type ProductPlatformResponse,
  type ProductTruthState,
} from "../../adapters/products-diagnostics";
import {
  ProductCatalogExperience,
  type ProductCardView,
  type Website3SurfaceState,
} from "../../products-diagnostics";

type PageState =
  | { phase: "loading" }
  | {
      phase: "ok";
      commerce: ProductSummaryDto[];
      platform: ProductPlatformResponse;
    }
  | { phase: "unavailable" }
  | { phase: "error"; message: string };

const STATUS_LABELS: Record<
  ProductTruthState,
  ProductCardView["statusLabel"]
> = {
  available: "Available",
  request_access: "Request access",
  coming_soon: "Coming soon",
  documentation_pending: "Documentation pending",
  out_of_stock: "Out of stock",
  under_review: "Under review",
  clinician_pathway_pending: "Clinician pathway pending",
  not_currently_offered: "Not currently offered",
};

function formatPrice(cents: number | null): string | null {
  if (cents === null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function toProductCards(
  platform: ProductPlatformResponse,
  commerce: readonly ProductSummaryDto[],
): ProductCardView[] {
  const commerceBySlug = new Map(commerce.map((product) => [product.slug, product]));
  const familyLabels = new Map(
    platform.families.map((family) => [family.family, family.label]),
  );

  return platform.products.map((product) => {
    const canonical = commerceBySlug.get(product.slug);
    const statusLabel = STATUS_LABELS[product.truthState];
    return {
      slug: product.slug,
      requiredInputRecordId: product.productId,
      displayName: product.displayName,
      family: product.family,
      familyLabel: familyLabels.get(product.family) ?? product.family.replaceAll("_", " "),
      statusLabel,
      summary:
        `${statusLabel} catalog record. Product details show only confirmed facts, ` +
        "current documentation state, and server-authoritative ordering availability.",
      // A canonical commerce row that explicitly withholds price (null) wins.
      // Null is a meaningful fail-closed value, not a reason to fall back to
      // another projection.
      priceLabel: formatPrice(
        canonical ? canonical.priceCents : product.priceCents,
      ),
      aliases: [
        ...product.searchAliases,
        ...(canonical ? [canonical.sku] : []),
      ],
    };
  });
}

export default function Products() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<PageState>({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const [commerce, platform] = await Promise.all([
      listProducts(memberToken),
      getProductPlatform(memberToken),
    ]);
    if (commerce.kind === "ok" && platform.kind === "ok") {
      setState({
        phase: "ok",
        commerce: commerce.data.products,
        platform: platform.data,
      });
      return;
    }
    if (
      [commerce, platform].some(
        (result) =>
          result.kind === "unavailable" ||
          result.kind === "unauthorized" ||
          result.kind === "forbidden" ||
          result.kind === "denied",
      )
    ) {
      setState({ phase: "unavailable" });
      return;
    }
    const failed = [commerce, platform].find(
      (result) => result.kind === "error",
    );
    setState({
      phase: "error",
      message:
        failed?.kind === "error"
          ? failed.message
          : "The catalog could not be loaded.",
    });
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const products = useMemo(
    () =>
      state.phase === "ok"
        ? toProductCards(state.platform, state.commerce)
        : [],
    [state],
  );
  const surfaceState: Website3SurfaceState =
    state.phase === "loading"
      ? "loading"
      : state.phase === "unavailable"
        ? "unavailable"
        : state.phase === "error"
          ? "error"
          : "ok";

  return (
    <ProductCatalogExperience
      products={products}
      state={surfaceState}
      errorMessage={state.phase === "error" ? state.message : undefined}
      onRetry={() => void load()}
    />
  );
}
