// Composition of the customer account overview. Read-only, fail-closed.

import type {
  CareEnrollmentDto,
  CustomerAccountOverviewDto,
  CustomerOrdersDto,
  MembershipDto,
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
export function nextAdministrativeAction(
  membership: MembershipDto,
  care: CareEnrollmentDto,
  orders: CustomerOrdersDto,
): string | null {
  if (care.sourceState === "available" && care.enrolled) {
    if (care.status.stage === "intake_needed") return "Complete your Care intake.";
    if (care.status.stage === "follow_up_required") {
      return "The provider team requested a follow-up — check your messages.";
    }
    if (care.status.stage === "appointment_needed") return "Schedule your appointment.";
  }
  if (orders.research.some((o) => o.paymentState === "unpaid")) {
    return "An order is awaiting payment — payment instructions arrive by email.";
  }
  // Billing truth and access state prompt independently (P1-5), and every
  // attention-worthy billing fact prompts — disputed included (P1-C).
  if (membership.state === "past_due" || membership.billing === "past_due") {
    return "Your membership payment is past due.";
  }
  if (membership.billing === "disputed") {
    return "Your membership billing needs attention — a payment is disputed.";
  }
  return null;
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
  const careKnowable =
    care.sourceState === "available" &&
    orders.carePharmacyHistory.availability === "available";
  return billingSettled && historyComplete && careKnowable ? "current" : "indeterminate";
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
      const partnerAttribution = view.staff
        ? await ports.attribution.attributionFor(memberKey)
        : null;
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
          nextAdministrativeAction: nextAdministrativeAction(membership, careEnrollment, orders),
          accountStanding: accountStanding(
            membership,
            careEnrollment,
            orders,
            nextAdministrativeAction(membership, careEnrollment, orders),
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
