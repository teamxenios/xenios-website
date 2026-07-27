import { useCallback, useEffect, useState } from "react";
import type { MemberCatalog } from "@shared/research/member-catalog";
import { useResearch } from "../../core";
import { getMemberCatalog } from "../../adapters/memberCatalogApi";
import {
  adaptMemberCatalog,
} from "../../adapters/memberCatalog";
import {
  MemberCatalogExperience,
  type MemberCatalogSurfaceState,
} from "../../products-diagnostics/MemberCatalogExperience";

const EMPTY_CATALOG: MemberCatalog = {
  audience: "member",
  currency: "USD",
  evaluatedAt: new Date(0).toISOString(),
  items: [],
  categories: [],
  lanes: [],
};

export default function Products() {
  const { memberToken } = useResearch();
  const [catalog, setCatalog] = useState<MemberCatalog>(EMPTY_CATALOG);
  const [state, setState] = useState<MemberCatalogSurfaceState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>();

  const load = useCallback(async () => {
    setState("loading");
    setErrorMessage(undefined);
    const result = await getMemberCatalog(memberToken);
    if (result.kind === "ok") {
      const adapted = adaptMemberCatalog(result.data);
      if (adapted.ok) {
        setCatalog(adapted.catalog);
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
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <MemberCatalogExperience
      catalog={catalog}
      state={state}
      errorMessage={errorMessage}
      onRetry={() => void load()}
    />
  );
}
