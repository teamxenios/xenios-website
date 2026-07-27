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

  return (
    <MemberProductDetailExperience
      product={product}
      state={state}
      errorMessage={errorMessage}
      onRetry={() => void load()}
    />
  );
}
