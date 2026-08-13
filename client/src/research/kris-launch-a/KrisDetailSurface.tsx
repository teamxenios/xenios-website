import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KrisCatalogDetailView,
  KrisFamily,
} from "@shared/research/kris-launch-a/contract";
import { ResearchEmptyState } from "../ui/kit";
import {
  KRIS_STATE_COPY,
  getKrisDetail,
  toKrisSurfaceState,
  type KrisSurfaceState,
} from "./catalogApi";
import { KrisDetail } from "./KrisDetail";

/**
 * The item page: fetch and states.
 *
 * A deep link to an item is a link someone shares, bookmarks and reloads, so
 * everything here has to survive arriving cold with nothing but a family and a
 * slug in the URL. There is no list state to inherit and no cache to warm.
 */

function KrisDetailSkeleton() {
  return (
    <div
      className="grid min-w-0 gap-4"
      aria-hidden="true"
      data-testid="kris-detail-skeleton"
    >
      <div className="h-3 w-32 rounded bg-[var(--surface-2,#e5e5e5)]" />
      <div className="h-8 w-2/3 rounded bg-[var(--surface-2,#e5e5e5)]" />
      <div className="h-3 w-full rounded bg-[var(--surface-2,#e5e5e5)]" />
      <div className="card h-24" />
    </div>
  );
}

export function KrisDetailSurface({
  memberToken,
  family,
  slug,
  fetchDetail = getKrisDetail,
}: {
  memberToken: string | null;
  family: KrisFamily;
  slug: string;
  fetchDetail?: typeof getKrisDetail;
}) {
  const [item, setItem] = useState<KrisCatalogDetailView | null>(null);
  const [state, setState] = useState<KrisSurfaceState>("loading");
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setState("loading");
    const result = await fetchDetail(memberToken, family, slug);
    if (mine !== generation.current) return;
    if (result.kind === "ok" && result.data && "id" in result.data) {
      setItem(result.data);
      setState("ok");
      return;
    }
    setItem(null);
    setState(result.kind === "ok" ? "unavailable" : toKrisSurfaceState(result));
  }, [fetchDetail, memberToken, family, slug]);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  if (state === "loading") {
    return (
      <main className="grid min-w-0 gap-6">
        <p className="sr-only" role="status" aria-live="polite">
          Loading the item
        </p>
        <KrisDetailSkeleton />
      </main>
    );
  }

  if (state !== "ok" || item === null) {
    const copy = KRIS_STATE_COPY[state === "ok" ? "unavailable" : state];
    const recoverable = state === "error" || state === "unavailable";
    return (
      <main className="grid min-w-0 gap-6">
        <ResearchEmptyState
          title={copy.title}
          body={copy.body}
          action={
            recoverable ? (
              <button
                type="button"
                className="btn btn-secondary min-h-[44px]"
                data-testid="kris-detail-retry"
                onClick={() => void load()}
              >
                Try again
              </button>
            ) : undefined
          }
        />
      </main>
    );
  }

  return <KrisDetail item={item} />;
}

export default KrisDetailSurface;
