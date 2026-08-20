import {
  isMasterOfferingFamily,
  type MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import {
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
} from "@shared/research/early-access-quantity";
import {
  isActionablePublicAction,
  type PublicStorefrontVariant,
} from "@shared/research/storefront/contract";
import type { CustomerAction } from "@shared/research/launch/customer-action";

/**
 * The commercial intent a signed-out visitor formed on the public storefront,
 * and the exact continuation URLs that preserve it.
 *
 * THE RULE THIS MODULE EXISTS FOR: a visitor who is asked to sign in must
 * return to the exact commercial flow they left, never the homepage. The
 * member sign-in page already honors a validated `returnTo`
 * (client/src/research/lib/member-routing.ts, safeResearchReturnTo), and its
 * validation keeps the PATH inside the registered member routes while
 * preserving the query string. So the intent rides the query string of the
 * one member page that can act on it: the v2 catalog detail page, which
 * reads `variant`, `qty`, and `intent` and preselects them.
 *
 * Everything here is validation and string building. It grants nothing: the
 * member page re-resolves every action and price from the server after
 * sign-in, so a hand-edited intent can at most preselect a variant the server
 * then refuses.
 */

/** The server's own slug shape, mirrored from the v2 detail door. */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,191}$/;
/** Variant ids are catalog-generated tokens; nothing else may ride this slot. */
const SAFE_VARIANT_ID = /^[A-Za-z0-9._-]{1,80}$/;

export interface StorefrontIntent {
  family: MasterOfferingFamily;
  slug: string;
  variantId: string;
  quantity: number;
  action: CustomerAction;
}

/**
 * Validate one candidate intent. Null means "carry no intent", never an
 * exception: a continue button with a malformed intent still signs the
 * visitor in, it just lands them on the product page without preselection.
 */
export function safeStorefrontIntent(candidate: {
  family: string;
  slug: string;
  variantId: string;
  quantity: number;
  action: CustomerAction;
}): StorefrontIntent | null {
  if (!isMasterOfferingFamily(candidate.family)) return null;
  if (!SAFE_SLUG.test(candidate.slug)) return null;
  if (!SAFE_VARIANT_ID.test(candidate.variantId)) return null;
  if (
    !Number.isSafeInteger(candidate.quantity) ||
    candidate.quantity < EARLY_ACCESS_MIN_QUANTITY ||
    candidate.quantity > EARLY_ACCESS_MAX_QUANTITY
  ) {
    return null;
  }
  if (!isActionablePublicAction(candidate.action)) return null;
  return {
    family: candidate.family,
    slug: candidate.slug,
    variantId: candidate.variantId,
    quantity: candidate.quantity,
    action: candidate.action,
  };
}

/**
 * The member catalog detail page for this intent, with the selection in the
 * query string. This exact path shape is already admitted by
 * safeResearchReturnTo (DYNAMIC_MEMBER_PATHS), and the query survives it.
 */
export function memberReturnToForIntent(intent: StorefrontIntent): string {
  const params = new URLSearchParams();
  params.set("variant", intent.variantId);
  params.set("qty", String(intent.quantity));
  params.set("intent", intent.action.toLowerCase());
  return `/research/member/catalog/${intent.family}/${intent.slug}?${params.toString()}`;
}

/** Sign in, then return to the exact commercial flow. */
export function signInHrefForIntent(intent: StorefrontIntent | null): string {
  if (intent === null) return "/research/sign-in";
  return `/research/sign-in?returnTo=${encodeURIComponent(
    memberReturnToForIntent(intent),
  )}`;
}

/**
 * The private Early Access door. Its unlock re-renders the ordering surface
 * in place, so there is no returnTo to carry; the customer continues inside
 * the Early Access catalog, which serves the same products with that lane's
 * own prices.
 */
export const EARLY_ACCESS_HREF = "/research/early-access";

/** The membership application, for a visitor with neither credential. */
export const APPLY_HREF = "/research/apply";

/** The Care pathway hand-off for CARE-resolved offerings. */
export const CARE_HREF = "/research/access-hub";

/**
 * Read a preselection out of the member detail page's own location search.
 * Everything is revalidated here; a crafted link can preselect at most a
 * variant id the page then fails to find, which leaves the default selection.
 */
export function preselectionFromSearch(search: string): {
  variantId: string | null;
  quantity: number | null;
} {
  try {
    const params = new URLSearchParams(search);
    const variant = params.get("variant") ?? "";
    const rawQty = params.get("qty") ?? "";
    const quantity = /^[1-9]\d{0,3}$/.test(rawQty) ? Number(rawQty) : null;
    return {
      variantId: SAFE_VARIANT_ID.test(variant) ? variant : null,
      quantity:
        quantity !== null &&
        quantity >= EARLY_ACCESS_MIN_QUANTITY &&
        quantity <= EARLY_ACCESS_MAX_QUANTITY
          ? quantity
          : null,
    };
  } catch {
    return { variantId: null, quantity: null };
  }
}

/**
 * Whether the public detail surface should offer a quantity control for a
 * variant: only when the action is one a quantity travels with.
 */
export function intentCarriesQuantity(variant: PublicStorefrontVariant): boolean {
  return variant.action === "BUY_NOW" || variant.action === "ASSISTED_ORDER";
}
