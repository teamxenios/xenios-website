import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import type { MemberProductDetail } from "@shared/research/member-catalog";
import { useResearch } from "../../core";
import { adaptMemberProductDetail } from "../../adapters/memberCatalog";
import { getMemberProductDetail } from "../../adapters/memberCatalogApi";
import {
  MemberProductDetailExperience,
} from "../../products-diagnostics/MemberProductDetailExperience";
import type { MemberCatalogSurfaceState } from "../../products-diagnostics/MemberCatalogExperience";
import { ProductSubscriptionCreate } from "../../product-subscriptions/ProductSubscriptionCreate";

export default function ProductPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { memberToken } = useResearch();
  const scope = JSON.stringify([memberToken, slug]);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [product, setProduct] = useState<MemberProductDetail | null>(null);
  const [state, setState] = useState<MemberCatalogSurfaceState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>();
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoadedScope(scope);
    setState("loading");
    setProduct(null);
    setErrorMessage(undefined);
    const result = await getMemberProductDetail(memberToken, slug);
    if (generation !== requestGeneration.current) return;
    if (result.kind === "ok") {
      const adapted = adaptMemberProductDetail(result.data);
      if (adapted.ok) {
        if (
          adapted.product.slug.trim().toLowerCase() !==
          slug.trim().toLowerCase()
        ) {
          setState("unavailable");
          return;
        }
        setProduct(adapted.product);
        setState("ok");
      } else if (adapted.code === "not_found") {
        setState("ok");
      } else {
        setState("unavailable");
      }
      return;
    }
    if (result.kind === "unauthorized" || result.kind === "forbidden") {
      setState("unauthorized");
      return;
    }
    if (result.kind === "denied" || result.kind === "unavailable") {
      setState("unavailable");
      return;
    }
    setErrorMessage(result.message);
    setState("error");
  }, [memberToken, slug, scope]);

  useEffect(() => {
    void load();
    return () => {
      requestGeneration.current += 1;
    };
  }, [load]);

  // Hide the previous account/product immediately on a new render, before
  // the loading effect runs. Generation checks discard late read responses.
  const current = loadedScope === scope;
  const displayedProduct = current ? product : null;
  const displayedState = current ? state : "loading";

  return (
    <>
      <MemberProductDetailExperience
        product={displayedProduct}
        state={displayedState}
        errorMessage={current ? errorMessage : undefined}
        onRetry={() => void load()}
      />
      <div className="research-app container-x pb-8" hidden={displayedState !== "ok" || !displayedProduct?.researchOnlyBoundary}>
        {/* MemberProductDetail has no subscription offer/current price-version
            projection. A cart selection or visible price cannot supply it.
            Keep the mount unavailable until canonical offer authority exists.
            Its attempt owner stays mounted across detail loading and retries. */}
        <ProductSubscriptionCreate memberToken={memberToken} product={null} commerceEnabled={false}
          visible={displayedState === "ok" && displayedProduct?.researchOnlyBoundary === true} />
      </div>
    </>
  );
}
