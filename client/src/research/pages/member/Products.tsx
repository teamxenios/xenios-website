import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import type { ProductSummaryDto } from "@shared/research/commerce-api";
import { useResearch } from "../../core";
import { listProducts } from "../../adapters/commerce";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchFilterBar,
  ResearchRouteBoundary,
  ResearchSearch,
  ResearchStatusBadge,
  useDebounced,
} from "../../ui/kit";
import {
  AVAILABILITY_META,
  GUIDE_STATE_LABELS,
  LANE_LABELS,
  goalLabel,
  priceLabel,
} from "./commerce-presentation";

// ---------------------------------------------------------------------------
// Member catalog (/research/member/products). Every card renders straight
// from the frozen ProductSummaryDto (GET /api/research/products): displayName,
// lane, availability, goal mappings, guide state, and price. The honesty
// rules are structural: a null price renders "Pricing not yet confirmed"
// (never $0.00), and a product that is not purchasable simply has no buy
// affordance on the card; the detail page explains why.
// ---------------------------------------------------------------------------

type PageState =
  | { phase: "loading" }
  | { phase: "ok"; products: ProductSummaryDto[] }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error"; message?: string };

function productHref(slug: string): string {
  return MEMBER_ROUTES.product.replace(":slug", slug);
}

function guideHref(slug: string): string {
  return MEMBER_ROUTES.guide.replace(":slug", slug);
}

function ProductCard({ product }: { product: ProductSummaryDto }) {
  const availability = AVAILABILITY_META[product.availability];
  return (
    <li className="card" data-testid={`ra-product-card-${product.slug}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div style={{ minWidth: 0 }}>
          <p className="mono-label text-ink-mute">{LANE_LABELS[product.lane]}</p>
          <p className="body-m font-700 mt-1">
            <Link href={productHref(product.slug)}>{product.displayName}</Link>
          </p>
          {product.goalMappings.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Goals this maps to">
              {product.goalMappings.map((goal) => (
                <span key={goal} className="chip text-ink-2">
                  {goalLabel(goal)}
                </span>
              ))}
            </div>
          )}
          <p className="body-s text-ink-mute mt-2">
            {product.relatedGuideSlugs.length > 0 ? (
              <>
                {GUIDE_STATE_LABELS[product.guideState]}:{" "}
                {product.relatedGuideSlugs.map((slug, i) => (
                  <span key={slug}>
                    {i > 0 && ", "}
                    <Link href={guideHref(slug)} data-testid={`ra-product-guide-link-${slug}`}>
                      {slug.replace(/-/g, " ")}
                    </Link>
                  </span>
                ))}
              </>
            ) : (
              GUIDE_STATE_LABELS[product.guideState]
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ResearchStatusBadge label={availability.label} tone={availability.tone} />
          <p className="body-s tabular text-ink-2" data-testid="ra-product-price">
            {priceLabel(product.priceCents)}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={productHref(product.slug)} className="btn btn-secondary">
          View product
        </Link>
        {/* No buy affordance here, by rule: purchasing is decided on the
            detail page, and only when the server says purchasable. */}
      </div>
    </li>
  );
}

export default function Products() {
  const { member, memberChecking, memberToken } = useResearch();
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await listProducts(memberToken);
    switch (result.kind) {
      case "ok":
        setState({ phase: "ok", products: result.data.products });
        return;
      case "denied":
        setState({ phase: "denied", code: result.code, message: result.message });
        return;
      case "unauthorized":
        setState({ phase: "unauthorized" });
        return;
      case "forbidden":
      case "unavailable":
        setState({ phase: "unavailable" });
        return;
      case "error":
        setState({ phase: "error", message: result.message });
        return;
    }
  }, [memberToken]);

  useEffect(() => {
    if (memberChecking) return;
    void load();
  }, [load, memberChecking]);

  const products = state.phase === "ok" ? state.products : [];

  const visible = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const haystack = [
        p.displayName,
        p.sku,
        LANE_LABELS[p.lane],
        ...p.goalMappings.map((g) => goalLabel(g)),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [products, debouncedQuery]);

  const boundaryState: "loading" | "unauthorized" | "ok" | "error" | "unavailable" = memberChecking
    ? "loading"
    : !member
      ? "unauthorized"
      : state.phase === "loading"
        ? "loading"
        : state.phase === "unauthorized"
          ? "unauthorized"
          : state.phase === "error"
            ? "error"
            : state.phase === "unavailable"
              ? "unavailable"
              : "ok";

  return (
    <ResearchMemberShell
      title="Products"
      lead="The research catalog for active members. Availability is controlled product by product, pricing appears only once it is confirmed, and documentation status is always shown honestly."
    >
      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage={state.phase === "error" ? state.message : undefined}
        onRetry={() => void load()}
        unavailableTitle="The catalog is not available yet."
        unavailableBody="Products appear here once the catalog is published to your membership. Nothing is wrong with your account."
      >
        {state.phase === "denied" ? (
          <ResearchDenialNotice code={state.code} message={state.message} />
        ) : (
          <>
            <ResearchFilterBar>
              <ResearchSearch value={query} onChange={setQuery} label="Search products" placeholder="Search the catalog" />
            </ResearchFilterBar>

            <div className="card mt-4 flex flex-wrap items-center justify-between gap-4" aria-label="Browse by goal">
              <p className="body-s text-ink-2">Prefer to start from an outcome? Browse the catalog by research goal.</p>
              <Link href={MEMBER_ROUTES.goals} className="btn btn-ghost">
                Browse by goal
              </Link>
            </div>

            <section className="mt-6" aria-label="Product list">
              {products.length === 0 ? (
                <ResearchEmptyState
                  title="No products are published yet."
                  body="The catalog appears here as products clear review. Nothing is wrong with your membership."
                />
              ) : visible.length === 0 ? (
                <ResearchEmptyState
                  title="No matches."
                  body="Try a different search term."
                  action={
                    <button type="button" className="btn btn-secondary" onClick={() => setQuery("")}>
                      Clear search
                    </button>
                  }
                />
              ) : (
                <ul className="grid gap-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {visible.map((product) => (
                    <ProductCard key={product.sku} product={product} />
                  ))}
                </ul>
              )}
            </section>

            <div className="card mt-8 flex flex-wrap items-center justify-between gap-4" aria-label="Related areas">
              <p className="body-s text-ink-2">Guides explain the documentation and evidence behind the catalog.</p>
              <Link href={MEMBER_ROUTES.guides} className="btn btn-ghost">
                Browse the Guides
              </Link>
            </div>
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
