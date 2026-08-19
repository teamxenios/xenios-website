import { useMemo } from "react";
import { useLocation, useParams } from "wouter";
import {
  isMasterOfferingFamily,
  type MasterOfferingVariantView,
} from "@shared/research/master-offerings/contract";
import {
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
} from "@shared/research/early-access-quantity";
import { addCartLine } from "../adapters/commerce";
import { useResearch } from "../core";
import { MEMBER_ROUTES } from "../lib/routes";
import { ResearchEmptyState } from "../ui/kit";
import { MASTER_OFFERING_STATE_COPY } from "./catalogApi";
import {
  createCatalogCartHandoff,
  type CatalogCartHandoff,
  type ExistingCart,
} from "./catalog-cart-handoff";
import type { AcceptedExactVariantQuantityCapability } from "./integration-packet";
import { MasterOfferingDetailSurface } from "./MasterOfferingDetailSurface";

/**
 * The founder normal-order band, restated from the one shared quantity policy
 * the server itself enforces on every cart line. This is a courtesy band for
 * the stepper, not authority: the server re-reads every quantity from the raw
 * request, and a value outside the band is refused there regardless of what
 * this object says.
 */
const FOUNDER_QUANTITY_SOURCE_VERSION = `early-access-quantity:${EARLY_ACCESS_MIN_QUANTITY}-${EARLY_ACCESS_MAX_QUANTITY}`;

/**
 * The accepted exact-variant quantity capability for one server-resolved
 * purchase action. Only `add_to_cart` has one, and its identity is copied from
 * the action the server emitted, so the capability can never name a variant
 * the server did not authorize.
 */
export function founderQuantityCapabilityFor(
  variant: MasterOfferingVariantView,
): AcceptedExactVariantQuantityCapability | null {
  const action = variant.action;
  if (action.kind !== "add_to_cart") return null;
  return {
    source: "accepted_quantity_policy",
    productId: action.productId,
    variantId: action.variantId,
    minimum: EARLY_ACCESS_MIN_QUANTITY,
    maximum: EARLY_ACCESS_MAX_QUANTITY,
    aggregateMaximum: EARLY_ACCESS_MAX_QUANTITY,
    sourceVersion: FOUNDER_QUANTITY_SOURCE_VERSION,
  };
}

/**
 * The existing cart, adapted. `addCartLine` is the one mounted cart door
 * (POST /api/research/cart/lines); this wrapper translates the handoff's
 * exact-variant request into that door's SKU-keyed line and relays the cart's
 * own machine code back unrewritten, so a `commerce_disabled` answer surfaces
 * as exactly that rather than as a fake success or a generic error.
 */
export function createMemberCartAdapter(memberToken: string | null): ExistingCart {
  return {
    async addExactVariant(request) {
      const result = await addCartLine(memberToken, {
        sku: request.sku,
        quantity: request.quantity,
        purchaseMode: "one_time",
      });
      if (result.kind === "ok") return { ok: true };
      switch (result.kind) {
        case "denied":
          return { ok: false, code: result.code };
        case "unauthorized":
          return { ok: false, code: result.code ?? "auth_required" };
        case "forbidden":
          return { ok: false, code: result.code ?? "cart_forbidden" };
        case "unavailable":
          // The cart door is not mounted or not serving. Truthfully not a
          // purchase, and truthfully not the member's fault.
          return { ok: false, code: "cart_unavailable" };
        case "error":
          return { ok: false, code: result.code ?? "cart_error" };
      }
    },
  };
}

/**
 * The routed entry point for one v2 offering.
 *
 * BOTH SEGMENTS ARE THE ADDRESS. The v2 detail API is
 * `/products/:family/:slug`, so a link carrying only a slug cannot restore the
 * product it points at. That is why this route is `:family/:slug` and why the
 * card's href carries both.
 *
 * Everything a deep link needs is in the URL. The surface arrives cold, reads
 * the two params, and fetches: there is no list state to inherit and no cache
 * to warm, so a shared link, a bookmark and a hard reload all land on the same
 * page.
 *
 * A family outside the closed vocabulary is answered here rather than sent to
 * the server, which would refuse it as an invalid request. The member sees the
 * honest "not in the catalog" copy instead of a generic error.
 *
 * This route is the composition point for the cart handoff: it injects the
 * existing cart adapter and the founder quantity capability into the detail
 * surface. The surface still renders Add to Cart only where the server
 * resolved one, and a cart refusal surfaces as its truthful copy.
 */
export default function FullCatalogProductRoute() {
  const { family = "", slug = "" } = useParams<{
    family: string;
    slug: string;
  }>();
  const { memberToken } = useResearch();
  const [, navigate] = useLocation();

  // One handoff per member session on this page: the in-flight set inside it
  // is what turns a double click into one add, so it must not be rebuilt on
  // every render.
  const cart = useMemo<CatalogCartHandoff>(
    () => createCatalogCartHandoff(createMemberCartAdapter(memberToken)),
    [memberToken],
  );

  if (!isMasterOfferingFamily(family) || slug.trim() === "") {
    const copy = MASTER_OFFERING_STATE_COPY.not_found;
    return (
      <main className="grid min-w-0 gap-6">
        <ResearchEmptyState title={copy.title} body={copy.body} />
      </main>
    );
  }

  return (
    <MasterOfferingDetailSurface
      memberToken={memberToken}
      family={family}
      slug={slug}
      cart={cart}
      capabilityFor={founderQuantityCapabilityFor}
      // A successful add lands the member on the existing cart page, where the
      // line they just added is visible. Showing the real cart is the honest
      // confirmation; this page has no cart rendering of its own to fake one.
      onAdded={() => navigate(MEMBER_ROUTES.cart)}
    />
  );
}
