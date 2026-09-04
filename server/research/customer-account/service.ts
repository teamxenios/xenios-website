// Composition of the customer account overview. Read-only, fail-closed.

import {
  membershipRenewalMirrorMatches,
  isCustomerAccountOrderReference,
  type CareEnrollmentDto,
  type CustomerAccountOverviewDto,
  type CustomerAccountActionTarget,
  type CustomerOrdersDto,
  type MembershipDto,
  type SupportCaseSummaryDto,
} from "@shared/research/customer-account/contract";
import type { CustomerAccountPorts } from "./ports";

export type OverviewResolution =
  | Readonly<{ kind: "ok"; overview: CustomerAccountOverviewDto }>
  | Readonly<{ kind: "unknown_customer" }>
  | Readonly<{ kind: "error" }>;

/**
 * The single next ADMINISTRATIVE step. Administrative means: an action on the
 * account itself. Never a product suggestion, never anything clinical.
 * Care rules apply only when the Care SOURCE is available (P1-D): an unwired
 * adapter can neither demand an intake nor prove none is needed.
 */
export function resolveNextAdministrativeAction(
  membership: MembershipDto,
  care: CareEnrollmentDto,
  orders: CustomerOrdersDto,
  supportCases: readonly SupportCaseSummaryDto[] = [],
): Readonly<{ message: string; target: CustomerAccountActionTarget }> | null {
  if (care.sourceState === "available" && care.enrolled) {
    if (care.status.stage === "intake_needed") {
      return { message: "Your Care intake needs attention.", target: { kind: "care" } };
    }
    if (care.status.stage === "follow_up_required") {
      return { message: "The provider team requested a follow-up.", target: { kind: "care" } };
    }
    if (care.status.stage === "appointment_needed") {
      return { message: "An appointment is needed in your Care workflow.", target: { kind: "care" } };
    }
  }
  // A request is not an order, and an identifier prefix proves neither kind
  // nor payment obligation. Do not demand payment on cancelled/exceptional or
  // unknown fulfillment records; their outstanding action is not knowable.
  const unpaidOrder = orders.research.find((order) =>
    order.recordKind === "order" && order.paymentState === "unpaid" &&
    (order.fulfillmentState === "unfulfilled" || order.fulfillmentState === "processing"),
  );
  if (unpaidOrder) {
    return {
      message: "An order is recorded as unpaid. Review its details before taking the next step.",
      target: isCustomerAccountOrderReference(unpaidOrder.reference)
        ? { kind: "order", reference: unpaidOrder.reference }
        : { kind: "orders" },
    };
  }
  // Billing truth and access state prompt independently (P1-5), and every
  // attention-worthy billing fact prompts — disputed included (P1-C).
  if (membership.state === "past_due" || membership.billing === "past_due") {
    return { message: "Your membership payment is past due.", target: { kind: "membership" } };
  }
  if (membership.billing === "disputed") {
    return { message: "Your membership billing needs attention — a payment is disputed.", target: { kind: "membership" } };
  }
  if (supportCases.some((item) => item.state === "waiting_on_customer")) {
    return { message: "A support case is waiting for your response.", target: { kind: "support" } };
  }
  return null;
}

/** Compatibility text projection; both fields always derive from one resolver. */
export function nextAdministrativeAction(
  membership: MembershipDto,
  care: CareEnrollmentDto,
  orders: CustomerOrdersDto,
): string | null {
  return resolveNextAdministrativeAction(membership, care, orders)?.message ?? null;
}

/**
 * P1-B/P1-C: whether the account may be DECLARED current. "Your account is
 * up to date" is a factual claim over the complete account; it is provable
 * only when nothing demands attention AND every truth source backing the
 * claim is actually connected and complete. Anything less is
 * "indeterminate" — no action is recorded, but the all-clear cannot be
 * asserted, and the UI must say so neutrally rather than render green.
 */
export function accountStanding(
  membership: MembershipDto,
  care: CareEnrollmentDto,
  orders: CustomerOrdersDto,
  action: string | null,
): "current" | "attention" | "indeterminate" {
  if (action !== null) return "attention";
  const billingSettled = membership.billing === "current" || membership.billing === "none";
  const historyComplete = orders.history.availability === "complete";
  // A complete list does not make every row's state knowable. Suppressing an
  // unsupported payment demand must not turn ambiguity or an exception into
  // a green all-clear. Confirmed cancellation/refund is not itself unfinished
  // work; unknown facts remain unknown independently of that terminal state.
  const researchRowsSettled = orders.research.every((order) =>
    order.recordKind !== "unknown" &&
    order.paymentState !== "unknown" &&
    order.fulfillmentState !== "unknown" &&
    order.fulfillmentState !== "exception" &&
    (order.paymentState !== "unpaid" || order.fulfillmentState === "cancelled"),
  );
  const careKnowable =
    care.sourceState === "available" &&
    orders.carePharmacyHistory.availability === "available";
  return billingSettled && historyComplete && researchRowsSettled && careKnowable ? "current" : "indeterminate";
}

export function createCustomerAccountService(ports: CustomerAccountPorts) {
  async function resolveOverview(
    memberKey: string,
    view: Readonly<{ staff: boolean }>,
  ): Promise<OverviewResolution> {
    try {
      const identity = await ports.identity.identityFor(memberKey);
      if (identity === null) return { kind: "unknown_customer" };
      const [membership, careEnrollment, orders, interests, documents, supportCases] =
        await Promise.all([
          ports.membership.membershipFor(memberKey),
          ports.care.careFor(memberKey),
          ports.orders.ordersFor(memberKey),
          ports.interests.interestsFor(memberKey),
          ports.documents.documentsFor(memberKey),
          ports.support.casesFor(memberKey),
        ]);
      if (!membershipRenewalMirrorMatches(membership)) {
        throw new Error("membership_renewal_mirror_invalid");
      }
      const partnerAttribution = view.staff
        ? await ports.attribution.attributionFor(memberKey)
        : null;
      const nextAction = resolveNextAdministrativeAction(membership, careEnrollment, orders, supportCases);
      return {
        kind: "ok",
        overview: {
          identity: {
            displayName: identity.displayName,
            email: identity.email,
            accountStatus: identity.accountStatus,
            memberSince: identity.memberSince,
          },
          partnerAttribution,
          membership,
          careEnrollment,
          researchOrders: orders.research,
          orderHistory: orders.history,
          productInterests: interests,
          documents,
          supportCases,
          nextAdministrativeAction: nextAction?.message ?? null,
          nextAdministrativeActionTarget: nextAction?.target ?? null,
          accountStanding: accountStanding(
            membership,
            careEnrollment,
            orders,
            nextAction?.message ?? null,
          ),
        },
      };
    } catch {
      // A half-true account page is worse than an honest error.
      return { kind: "error" };
    }
  }

  return { resolveOverview };
}

export type CustomerAccountService = ReturnType<typeof createCustomerAccountService>;
