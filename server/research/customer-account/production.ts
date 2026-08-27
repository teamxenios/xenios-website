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

import type { MembershipDisplayState } from "@shared/research/customer-account/contract";
import { getMemberByAuthUserId, type MemberRow } from "../member-auth";
import type {
  CatalogPriorityPort,
  CustomerAccountPorts,
  CustomerDocumentsPort,
  CustomerIdentity,
  CustomerOrdersPort,
  SupportCasesPort,
} from "./ports";

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
 * The graduated concerns the composition root injects when their durable
 * sources exist. Every absent source keeps the truthful empty behavior below.
 */
export type ProductionAccountSources = Readonly<{
  orders?: CustomerOrdersPort;
  support?: SupportCasesPort;
  documents?: CustomerDocumentsPort;
  catalogPriority?: CatalogPriorityPort;
}>;

// Mirrors requireActiveMember's billing rule (member-auth.ts): billing_state
// participates only while RESEARCH_MEMBERSHIP_BILLING_ENABLED is on; a MISSING
// state on an active member reads as verified-legacy; sponsored_b2b is exempt.
const billingEnabled = () => process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED === "true";

function membershipStateOf(row: MemberRow | null): MembershipDisplayState {
  if (row === null) return "none";
  const status = String(row.status ?? "");
  if (status === "active") {
    if (!billingEnabled()) return "active";
    const billing = String((row as Record<string, unknown>).billing_state ?? "");
    const sponsored = String((row as Record<string, unknown>).access_basis ?? "") === "sponsored_b2b";
    if (billing === "" || billing === "active" || sponsored) return "active";
    if (billing === "past_due" || billing === "disputed") return "past_due";
    if (billing === "cancelled" || billing === "refunded") return "canceled";
    // not_started / activation_pending / subscription_pending / unknown:
    // billing has not completed, so no active plan is claimed.
    return "none";
  }
  if (status === "past_due") return "past_due";
  if (status === "cancelled" || status === "closed") return "canceled";
  return "none";
}

/**
 * The production ports. `lookupMember` is injectable for tests; production
 * passes a lookup bound to the guard-resolved member row. `sources` carries
 * the concerns that HAVE graduated to durable sources; every absent source
 * returns its truthful empty state rather than failing the whole surface —
 * an account page that says "no orders yet" is honest while the real order
 * sources are being wired; one that errors tells the customer nothing.
 */
export function buildProductionCustomerAccountPorts(
  lookupMember?: MemberLookup,
  sources?: ProductionAccountSources,
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
      // research_members.status + billing_state (ledger row 9), mirroring
      // requireActiveMember's rule. manageUrl stays null and manualBilling
      // stays true: the Stripe seam has no production caller and no
      // billing-portal-session capability, so there is nothing real to link.
      async membershipFor(memberKey) {
        const row = await lookup(memberKey);
        const state = membershipStateOf(row);
        return {
          state,
          planLabel: state === "none" ? null : "Xenios Research Membership",
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
    orders: sources?.orders ?? {
      // Ungraduated fallback. The composition root injects the commerce
      // member-orders projection (orders-projection.ts) over the ONE decorated
      // MemberOrdersService; XRR assisted-order request history additionally
      // needs a list-by-member RPC that does not exist yet.
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
    documents: sources?.documents ?? {
      // Ungraduated fallback. The composition root injects the plan-documents
      // source (production-documents.ts); EA receipt/COA surfaces remain
      // future graduations with their own kinds.
      async documentsFor() {
        return [];
      },
    },
    support: sources?.support ?? {
      // Ungraduated fallback: a support write with no durable source has
      // nowhere to go — refuse, don't pretend. The composition root injects
      // the research_member_questions source (production-support.ts).
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
    ...(sources?.catalogPriority ? { catalogPriority: sources.catalogPriority } : {}),
  };
}
