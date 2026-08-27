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
 */
export function nextAdministrativeAction(
  membership: MembershipDto,
  care: CareEnrollmentDto,
  orders: CustomerOrdersDto,
): string | null {
  if (care.enrolled && care.status.stage === "intake_needed") {
    return "Complete your Care intake.";
  }
  if (care.enrolled && care.status.stage === "follow_up_required") {
    return "The provider team requested a follow-up — check your messages.";
  }
  if (care.enrolled && care.status.stage === "appointment_needed") {
    return "Schedule your appointment.";
  }
  if (orders.research.some((o) => o.paymentState === "awaiting_payment")) {
    return "An order is awaiting payment — payment instructions arrive by email.";
  }
  if (membership.state === "past_due") {
    return "Your membership payment is past due.";
  }
  return null;
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
          productInterests: interests,
          documents,
          supportCases,
          nextAdministrativeAction: nextAdministrativeAction(membership, careEnrollment, orders),
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
