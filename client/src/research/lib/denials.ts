// Denial presentation: the one place a machine denial code becomes member
// copy. The UI routes on code, never on message, so every code in the frozen
// CommerceDenialCode union (shared/research/commerce-api.ts) has its own copy
// here, written by us; the server message is never the primary text. Unknown
// codes fall back to a calm generic denial rather than leaking raw codes.
//
// Tones:
//   pending  the capability is simply not switched on yet; nothing is wrong
//   notice   something real happened and is being handled; not an error
//   error    the request itself did not go through

import type { CommerceDenialCode } from "@shared/research/commerce-api";

export type DenialTone = "pending" | "notice" | "error";

export interface DenialPresentation {
  title: string;
  body: string;
  tone: DenialTone;
}

type Copy = { title: string; body: string; tone: DenialTone };

// Exhaustive over CommerceDenialCode: a new code in the frozen union fails
// this file's typecheck until copy exists for it.
const DENIAL_COPY: Record<CommerceDenialCode, Copy> = {
  // Inherited account-state guards.
  activation_required: {
    title: "Activate your membership first.",
    body: "This area opens once your membership is activated. Nothing here is lost.",
    tone: "error",
  },
  billing_past_due: {
    title: "Billing needs attention.",
    body: "Your membership payment is past due. Update billing to continue; nothing you entered was lost.",
    tone: "error",
  },
  membership_inactive: {
    title: "Membership is not active.",
    body: "This area is for active members. Reactivate your membership to continue.",
    tone: "error",
  },
  recovery_session: {
    title: "Not available during password recovery.",
    body: "Finish resetting your password first, then sign in normally to continue.",
    tone: "error",
  },

  // Capability gates: built, waiting to be switched on.
  capability_disabled: {
    title: "This feature is not switched on yet.",
    body: "It is built and waiting. It opens the moment it is switched on, with no change to this flow.",
    tone: "pending",
  },
  commerce_disabled: {
    title: "Ordering is not open yet.",
    body: "Nothing you entered was lost. Ordering opens once commerce is switched on, and this exact flow will work unchanged.",
    tone: "pending",
  },
  payment_disabled: {
    title: "Payments are not switched on yet.",
    body: "Payment processing opens once it is configured. Your cart and details are kept.",
    tone: "pending",
  },

  // Catalog and purchasability.
  product_not_found: {
    title: "Product not found.",
    body: "This product does not exist or is no longer listed. Browse the catalog for current products.",
    tone: "error",
  },
  product_not_purchasable: {
    title: "This product cannot be ordered right now.",
    body: "It stays listed while its checks complete, and ordering opens when they pass.",
    tone: "error",
  },
  unconfirmed_supplier_facts: {
    title: "Awaiting supplier confirmation.",
    body: "A supplier fact for this product has not been confirmed in writing yet. It becomes orderable once documentation clears review.",
    tone: "notice",
  },
  lane_not_purchasable: {
    title: "This item is not orderable.",
    body: "This listing is not part of the ordering system. Nothing is wrong with your account.",
    tone: "error",
  },
  quantity_invalid: {
    title: "That quantity cannot be ordered.",
    body: "Adjust the quantity and try again.",
    tone: "error",
  },
  insufficient_stock: {
    title: "Not enough stock.",
    body: "The requested quantity is more than what is available right now. Lower the quantity or check back soon.",
    tone: "error",
  },

  // Cart and checkout.
  cart_empty: {
    title: "Your cart is empty.",
    body: "Add a product to the cart before checking out.",
    tone: "error",
  },
  cart_revalidation_failed: {
    title: "Your cart needs a quick review.",
    body: "Something in the cart changed since it was added. Review the flagged lines and try again.",
    tone: "error",
  },
  agreement_required: {
    title: "An agreement needs your acceptance.",
    body: "Review and accept the required agreement to continue. Your cart is unchanged.",
    tone: "notice",
  },
  address_invalid: {
    title: "That address did not check out.",
    body: "Review the shipping address fields and try again.",
    tone: "error",
  },
  state_not_serviceable: {
    title: "We cannot ship to that state yet.",
    body: "Orders to this state are not serviceable right now. Nothing you entered was lost.",
    tone: "error",
  },
  shipping_unavailable: {
    title: "Shipping cannot be quoted right now.",
    body: "Please try again shortly. Your cart is unchanged.",
    tone: "error",
  },
  payment_failed: {
    title: "The payment did not go through.",
    body: "No charge was completed. Check the payment details and try again.",
    tone: "error",
  },
  large_order_review_required: {
    title: "Order received, pending review.",
    body: "Large orders get a personal review before processing. Typical turnaround is about two hours.",
    tone: "notice",
  },

  // Orders and subscriptions.
  order_not_found: {
    title: "Order not found.",
    body: "This order does not exist on your account. Check the order history list.",
    tone: "error",
  },
  order_state_invalid: {
    title: "That change is not available for this order.",
    body: "The order has moved past the point where this action applies.",
    tone: "error",
  },
  subscription_not_found: {
    title: "Subscription not found.",
    body: "This subscription does not exist on your account.",
    tone: "error",
  },
  subscription_action_invalid: {
    title: "That change is not available.",
    body: "The subscription is not in a state that allows this action. Refresh and try again.",
    tone: "error",
  },

  // Guides.
  guide_not_found: {
    title: "Guide not found.",
    body: "This guide does not exist or has been removed.",
    tone: "error",
  },
  guide_not_published: {
    title: "This guide is not published yet.",
    body: "It is being prepared and reviewed. It appears in your library the moment it is published.",
    tone: "notice",
  },

  // Partners and commissions.
  partner_not_found: {
    title: "No partner account found.",
    body: "There is no partner account attached to this sign-in.",
    tone: "error",
  },
  partner_not_active: {
    title: "Your partner account is not active.",
    body: "Partner tools open when the account is active. Reach out to the team if this seems wrong.",
    tone: "error",
  },
  commission_not_visible: {
    title: "This commission is not visible.",
    body: "Commission detail is shown once it is eligible for display.",
    tone: "error",
  },

  // Authority.
  forbidden: {
    title: "You do not have access to this.",
    body: "This area belongs to a different account type. Nothing is wrong with your session.",
    tone: "error",
  },
};

const FALLBACK: Copy = {
  title: "This is not available right now.",
  body: "The request was declined. Please try again, or contact support if it keeps happening.",
  tone: "error",
};

/** Every code this module has copy for (exactly the frozen union). */
export const KNOWN_DENIAL_CODES = Object.keys(DENIAL_COPY) as CommerceDenialCode[];

/**
 * Resolve a denial code to member-facing copy. The optional server message is
 * accepted for signature stability but never rendered as the primary text;
 * copy is ours, per code, so wording stays calm and consistent.
 */
export function denialPresentation(code: string, _message?: string): DenialPresentation {
  const copy = (DENIAL_COPY as Record<string, Copy>)[code] ?? FALLBACK;
  return { title: copy.title, body: copy.body, tone: copy.tone };
}

/**
 * One line of member-facing text for any non-ok result, for the inline
 * feedback spots (a form notice, a toast line) that cannot host the full
 * two-part denial panel. A coded denial routes through denialPresentation, so
 * these spots stay on code rather than drifting onto server message text.
 * `fallback` is the caller's own sentence for an endpoint that is not
 * published yet, which is a pending state and not an error.
 */
export function failureText(
  result: { kind: string; code?: string; message?: string },
  fallback: string,
): string {
  if (result.kind === "denied" && result.code) {
    const copy = denialPresentation(result.code, result.message);
    return `${copy.title} ${copy.body}`;
  }
  if (result.kind === "unauthorized") {
    return "Your session has ended. Sign in again to continue.";
  }
  if (result.kind === "forbidden") {
    return result.message ?? "This action is not allowed for your account.";
  }
  if (result.kind === "error") {
    return result.message ?? fallback;
  }
  return fallback;
}
