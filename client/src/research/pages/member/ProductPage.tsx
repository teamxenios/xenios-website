import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import type {
  MemberCatalogVariant,
  MemberProductDetail,
} from "@shared/research/member-catalog";
import { useResearch } from "../../core";
import { adaptMemberProductDetail } from "../../adapters/memberCatalog";
import { getMemberProductDetail } from "../../adapters/memberCatalogApi";
import { addCartLine } from "../../adapters/commerce";
import {
  MemberProductDetailExperience,
  type AddToCartOutcome,
} from "../../products-diagnostics/MemberProductDetailExperience";
import type { MemberCatalogSurfaceState } from "../../products-diagnostics/MemberCatalogExperience";

export default function ProductPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { memberToken } = useResearch();
  const [product, setProduct] = useState<MemberProductDetail | null>(null);
  const [state, setState] = useState<MemberCatalogSurfaceState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>();
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
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
  }, [memberToken, slug]);

  useEffect(() => {
    void load();
    return () => {
      requestGeneration.current += 1;
    };
  }, [load]);

  // Adds one unit of the server-authorized selection to the member cart. The
  // outcome vocabulary keeps the experience honest: commerce answers its
  // closed disabled code today (STATE 1), which renders as calmly not open,
  // never a crash or a fake success.
  const addToCart = useCallback(
    async (variant: MemberCatalogVariant): Promise<AddToCartOutcome> => {
      if (!variant.selection) {
        return { kind: "not_open", message: "This variant is not currently available to order." };
      }
      const result = await addCartLine(memberToken, {
        sku: variant.selection.sku,
        quantity: 1,
        purchaseMode: "one_time",
      });
      if (result.kind === "ok") return { kind: "added" };
      if (result.kind === "unauthorized") return { kind: "signed_out" };
      if (result.kind === "denied" || result.kind === "forbidden" || result.kind === "unavailable") {
        return {
          kind: "not_open",
          message: "Ordering is not open yet. The item stays in the catalog and nothing is wrong with your account.",
        };
      }
      return { kind: "error", message: result.message };
    },
    [memberToken],
  );

  return (
    <MemberProductDetailExperience
      product={product}
      state={state}
      errorMessage={errorMessage}
      onRetry={() => void load()}
      onAddToCart={addToCart}
    />
  );
}
