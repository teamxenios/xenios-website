// Production bootstrap for the customer-account ports.
//
// HONEST PARTIALITY, ON PURPOSE. The account surface composes eight concerns,
// and today only some of them have durable production sources. Each port
// below either reads its real source or returns the truthful empty/none state
// — never a plausible invention. The doc comment on each port names the
// source it graduates to, so wiring work is enumerable instead of archeological.
//
// Graduation map (do NOT rebuild these; wire them):
//   orders     → server/research/assisted-order (XRR requests by customer) and
//                server/research/early-access/orders member history (ledger 67),
//                unified later by the canonical XO- order lane when mounted.
//   membership → research_members.status + research_member_billing (ledger 9),
//                Stripe portal link once RESEARCH_MEMBERSHIP_BILLING_ENABLED.
//   care       → server/care capability + intake/appointment/prescription
//                repositories (Care-1..4) once Care leaves `disabled`.
//   documents  → research_plan_documents + EA receipts/COA access surfaces.
//   support    → research_member_questions / research_sla_events.
//   interests  → research_customer_product_interests (candidate SQL in
//                supabase/candidates/20260826_research_client_accounts_blitz.sql).
//   attribution→ research_affiliate_customer_bindings (candidate, 20260819) +
//                partner registry; staff projection only.

import { getMemberByAuthUserId, type MemberRow } from "../member-auth";
import type { CustomerAccountPorts, CustomerIdentity } from "./ports";

function identityFromMemberRow(row: MemberRow): CustomerIdentity {
  return {
    memberKey: row.id,
    displayName: row.first_name || row.email,
    email: row.email,
    accountStatus: row.status === "active" ? "active" : "inactive",
    memberSince: typeof row.created_at === "string" ? row.created_at : null,
  };
}

export type MemberLookup = (memberKey: string) => Promise<MemberRow | null>;

/**
 * The production ports. `lookupMember` is injectable for tests; production
 * passes nothing and gets the Supabase-backed lookup. Every unproven concern
 * returns its truthful empty state rather than failing the whole surface —
 * an account page that says "no orders yet" is honest while the real order
 * sources are being wired; one that errors tells the customer nothing.
 */
export function buildProductionCustomerAccountPorts(
  lookupMember?: MemberLookup,
): CustomerAccountPorts {
  const lookup: MemberLookup =
    lookupMember ??
    (async (memberKey) => {
      // research_members.id is the member key the guard attaches; member-auth
      // resolves by auth_user_id, so production passes a lookup bound to the
      // guard-resolved row instead when it registers. This fallback resolves
      // by auth user id for completeness and returns null on any mismatch.
      return getMemberByAuthUserId(memberKey);
    });

  return {
    identity: {
      async identityFor(memberKey) {
        const row = await lookup(memberKey);
        return row === null ? null : identityFromMemberRow(row);
      },
    },
    membership: {
      // Graduates to research_member_billing + Stripe portal. Until billing is
      // enabled the truthful state is: membership exists administratively for
      // an active member, billed manually/offline, with no portal link.
      async membershipFor(memberKey) {
        const row = await lookup(memberKey);
        const active = row?.status === "active";
        return {
          state: active ? "active" : "none",
          planLabel: active ? "Xenios Research Membership" : null,
          nextRenewalAt: null,
          manageUrl: null,
          manualBilling: true,
        };
      },
    },
    care: {
      // Graduates to server/care once the capability leaves `disabled`.
      async careFor() {
        return {
          enrolled: false,
          status: { stage: null, updatedAt: null, neutralSummary: null },
          pharmacyState: "none",
        };
      },
    },
    orders: {
      // Graduates to assisted-order + EA member history (see map above).
      async ordersFor() {
        return { research: [], carePharmacy: [] };
      },
    },
    interests: {
      // Graduates to research_customer_product_interests (candidate SQL).
      async interestsFor() {
        return [];
      },
    },
    documents: {
      // Graduates to research_plan_documents + EA receipt/COA surfaces.
      async documentsFor() {
        return [];
      },
    },
    support: {
      // Graduates to research_member_questions / research_sla_events. Until
      // then a support write has nowhere durable to go: refuse, don't pretend.
      async casesFor() {
        return [];
      },
      async openCase() {
        throw new Error("support_capability_pending");
      },
    },
    attribution: {
      // Staff projection; graduates to the affiliate customer bindings table.
      async attributionFor() {
        return null;
      },
    },
  };
}
