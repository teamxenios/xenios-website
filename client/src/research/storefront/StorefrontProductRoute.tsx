import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import SeoHead from "@/components/SeoHead";
import {
  isMasterOfferingFamily,
  type MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import type { PublicStorefrontDetail } from "@shared/research/storefront/contract";
import { ResearchEmptyState } from "../ui/kit";
import {
  PUBLIC_STOREFRONT_STATE_COPY,
  getPublicStorefrontDetail,
  toPublicStorefrontSurfaceState,
  type PublicStorefrontSurfaceState,
} from "./storefrontApi";
import { StorefrontProductPage } from "./StorefrontProductPage";

/**
 * The routed public product page.
 *
 * BOTH SEGMENTS ARE THE ADDRESS, exactly as on the member detail route: the
 * detail API is keyed by family AND slug, so a link carrying only a slug
 * cannot restore the product it points at. Everything the page needs is in
 * the URL, so a shared link, a bookmark, and a hard reload all land on the
 * same product.
 */

function DetailSkeleton() {
  return (
    <div
      className="container-x grid min-w-0 gap-4"
      aria-hidden="true"
      data-testid="sf-detail-skeleton"
      style={{ paddingTop: 32 }}
    >
      <div className="h-3 w-32 rounded bg-[var(--surface-2,#e5e5e5)]" />
      <div className="h-8 w-2/3 rounded bg-[var(--surface-2,#e5e5e5)]" />
      <div className="h-3 w-full rounded bg-[var(--surface-2,#e5e5e5)]" />
      <div className="card h-24" />
    </div>
  );
}

function NotAvailable({
  state,
  onRetry,
}: {
  state: Exclude<PublicStorefrontSurfaceState, "ok" | "loading">;
  onRetry: () => void;
}) {
  const copy = PUBLIC_STOREFRONT_STATE_COPY[state];
  return (
    <div
      className="container-x grid min-w-0 gap-6"
      style={{ paddingTop: 48, paddingBottom: 64 }}
    >
      <ResearchEmptyState
        title={copy.title}
        body={copy.body}
        action={
          <div className="flex flex-wrap gap-3">
            <Link
              href="/research/catalog"
              className="btn btn-primary min-h-[44px]"
              data-testid="sf-detail-browse"
            >
              Browse catalog
            </Link>
            {state === "error" && (
              <button
                type="button"
                className="btn btn-secondary min-h-[44px]"
                data-testid="sf-detail-retry"
                onClick={onRetry}
              >
                Try again
              </button>
            )}
            <Link
              href="/research/sign-in"
              className="btn btn-secondary min-h-[44px]"
              data-testid="sf-detail-signin"
            >
              Member sign in
            </Link>
          </div>
        }
      />
    </div>
  );
}

export function StorefrontProductSurface({
  family,
  slug,
  fetchDetail = getPublicStorefrontDetail,
}: {
  family: MasterOfferingFamily;
  slug: string;
  fetchDetail?: typeof getPublicStorefrontDetail;
}) {
  const [product, setProduct] = useState<PublicStorefrontDetail | null>(null);
  const [state, setState] = useState<PublicStorefrontSurfaceState>("loading");
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setState("loading");
    const result = await fetchDetail(family, slug);
    if (mine !== generation.current) return;
    if (result.kind === "ok" && result.data?.ok === true) {
      setProduct(result.data.product);
      setState("ok");
      return;
    }
    setProduct(null);
    setState(
      result.kind === "ok" ? "unavailable" : toPublicStorefrontSurfaceState(result),
    );
  }, [fetchDetail, family, slug]);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  if (state === "loading") {
    return (
      <>
        <p className="sr-only" role="status" aria-live="polite">
          Loading the product
        </p>
        <DetailSkeleton />
      </>
    );
  }

  if (state !== "ok" || product === null) {
    return (
      <NotAvailable
        state={state === "ok" ? "unavailable" : state}
        onRetry={() => void load()}
      />
    );
  }

  return <StorefrontProductPage product={product} />;
}

export default function StorefrontProductRoute() {
  const { family = "", slug = "" } = useParams<{
    family: string;
    slug: string;
  }>();

  // A family outside the closed vocabulary is answered here rather than sent
  // to the server, which would refuse it as an invalid request. The visitor
  // sees the honest "not in the catalog" copy instead of a generic error.
  if (!isMasterOfferingFamily(family) || slug.trim() === "") {
    return (
      <NotAvailable state="not_found" onRetry={() => undefined} />
    );
  }

  return (
    <>
      <SeoHead
        title="Research catalog, xenios research"
        description="A product in the Xenios Research catalog."
        path={`/research/catalog/${family}/${slug}`}
        robots="noindex, nofollow"
      />
      <StorefrontProductSurface family={family} slug={slug} />
    </>
  );
}
