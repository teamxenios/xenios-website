import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MasterOfferingDetailView,
  MasterOfferingFamily,
  MasterOfferingVariantView,
} from "@shared/research/master-offerings/contract";
import { ResearchEmptyState } from "../ui/kit";
import {
  MASTER_OFFERING_STATE_COPY,
  getMasterOfferingDetail,
  toMasterOfferingSurfaceState,
  type MasterOfferingSurfaceState,
} from "./catalogApi";
import { MasterOfferingDetail } from "./MasterOfferingDetail";
import type { AcceptedExactVariantQuantityCapability } from "./integration-packet";
import type { CatalogCartHandoff, CatalogCartOutcome } from "./catalog-cart-handoff";

/**
 * The exact-variant page: fetch, states, and the handoff into the existing cart.
 *
 * A deep link to a product is a link someone shares, bookmarks, and reloads, so
 * everything here has to survive arriving cold with nothing but a family and a
 * slug in the URL. There is no client-side cache to warm and no list state to
 * inherit.
 *
 * Routed nowhere. The composition root decides when a member reaches it.
 */

/** Plain-language copy for a refusal from the handoff. Never a raw code. */
const REFUSAL_COPY: Readonly<
  Record<Exclude<CatalogCartOutcome, { ok: true }>["reason"], string>
> = {
  not_purchasable:
    "This variant is not available for direct checkout. Use the request option above.",
  quantity_unauthorized:
    "A quantity has not been approved for this exact variant yet.",
  quantity_out_of_band: "That quantity is outside the approved range.",
  already_in_flight: "That is already being added.",
  cart_refused: "The cart could not accept this right now. Please try again.",
};

/**
 * Copy for specific cart refusal codes worth more than the generic sentence.
 * `commerce_disabled` in particular must stay truthful: the cart is off, the
 * request path still works, and "try again" would be a lie. Routed on the
 * machine code, never on a message.
 */
const CART_REFUSAL_CODE_COPY: Readonly<Record<string, string>> = {
  commerce_disabled:
    "Direct checkout is not enabled yet. This variant can still be requested through the request option.",
};

function refusalCopy(outcome: Exclude<CatalogCartOutcome, { ok: true }>): string {
  if (outcome.reason === "cart_refused" && outcome.code !== undefined) {
    return CART_REFUSAL_CODE_COPY[outcome.code] ?? REFUSAL_COPY.cart_refused;
  }
  return REFUSAL_COPY[outcome.reason];
}

function DetailSkeleton() {
  return (
    <div className="grid min-w-0 gap-4" aria-hidden="true" data-testid="mo-detail-skeleton">
      <div className="h-3 w-32 rounded bg-[var(--surface-2,#e5e5e5)]" />
      <div className="h-8 w-2/3 rounded bg-[var(--surface-2,#e5e5e5)]" />
      <div className="h-3 w-full rounded bg-[var(--surface-2,#e5e5e5)]" />
      <div className="card h-24" />
    </div>
  );
}

export function MasterOfferingDetailSurface({
  memberToken,
  family,
  slug,
  initialVariantId = null,
  initialQuantity = null,
  capabilityFor,
  cart,
  fetchDetail = getMasterOfferingDetail,
  onAdded,
}: {
  memberToken: string | null;
  family: MasterOfferingFamily;
  slug: string;
  /** Validated URL intent; it selects only a variant present in the fresh DTO. */
  initialVariantId?: string | null;
  initialQuantity?: number | null;
  capabilityFor?: (
    variant: MasterOfferingVariantView,
  ) => AcceptedExactVariantQuantityCapability | null;
  /** The existing cart, injected. This surface implements none. */
  cart?: CatalogCartHandoff;
  fetchDetail?: typeof getMasterOfferingDetail;
  onAdded?: (request: { productId: string; variantId: string; quantity: number }) => void;
}) {
  const [product, setProduct] = useState<MasterOfferingDetailView | null>(null);
  const [state, setState] = useState<MasterOfferingSurfaceState>("loading");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setState("loading");
    setRefusal(null);
    const result = await fetchDetail(memberToken, family, slug);
    if (mine !== generation.current) return;
    if (result.kind === "ok" && result.data?.ok === true) {
      setProduct(result.data.product);
      setState("ok");
      return;
    }
    setProduct(null);
    setState(
      result.kind === "ok" ? "unavailable" : toMasterOfferingSurfaceState(result),
    );
  }, [fetchDetail, memberToken, family, slug]);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const handleAdd = useCallback(
    async (
      action: Parameters<
        NonNullable<Parameters<typeof MasterOfferingDetail>[0]["onAddToCart"]>
      >[0],
      quantity: number,
    ) => {
      if (!cart || adding) return;
      const variant = product?.variants.find(
        (entry) => entry.action.kind === "add_to_cart" &&
          entry.action.variantId === action.variantId,
      );
      setAdding(true);
      setRefusal(null);
      try {
        const outcome = await cart.add(
          action,
          quantity,
          variant && capabilityFor ? capabilityFor(variant) : null,
        );
        if (outcome.ok) {
          onAdded?.({
            productId: outcome.request.productId,
            variantId: outcome.request.variantId,
            quantity: outcome.request.quantity,
          });
          return;
        }
        setRefusal(refusalCopy(outcome));
      } finally {
        setAdding(false);
      }
    },
    [cart, adding, product, capabilityFor, onAdded],
  );

  if (state === "loading") {
    return (
      <div className="grid min-w-0 gap-6">
        <p className="sr-only" role="status" aria-live="polite">
          Loading the product
        </p>
        <DetailSkeleton />
      </div>
    );
  }

  if (state !== "ok" || product === null) {
    const copy = MASTER_OFFERING_STATE_COPY[state === "ok" ? "unavailable" : state];
    const recoverable = state === "error" || state === "unavailable";
    return (
      <div className="grid min-w-0 gap-6">
        <ResearchEmptyState
          title={copy.title}
          body={copy.body}
          action={
            recoverable ? (
              <button
                type="button"
                className="btn btn-secondary min-h-[44px]"
                data-testid="mo-detail-retry"
                onClick={() => void load()}
              >
                Try again
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <>
      <MasterOfferingDetail
        key={`${initialVariantId ?? ""}:${initialQuantity ?? ""}`}
        product={product}
        initialVariantId={initialVariantId}
        initialQuantity={initialQuantity}
        capabilityFor={capabilityFor}
        onAddToCart={cart ? (action, quantity) => void handleAdd(action, quantity) : undefined}
      />
      {refusal !== null && (
        <p
          className="body-s text-ink-mute min-w-0 break-words"
          role="status"
          aria-live="polite"
          data-testid="mo-add-refusal"
        >
          {refusal}
        </p>
      )}
    </>
  );
}

export default MasterOfferingDetailSurface;
