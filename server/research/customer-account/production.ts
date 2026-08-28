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

import type {
  MembershipBillingDisplayState,
  MembershipDisplayState,
} from "@shared/research/customer-account/contract";
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

// P1-5 (2026-08-27): DISPLAY truth and ACCESS enforcement are now separate
// questions. The RESEARCH_MEMBERSHIP_BILLING_ENABLED flag still governs the
// guards (member-auth.ts); it plays NO part in what this projection says.
// Access state comes from research_members.status alone; billing state comes
// from the stored billing_state alone — a known past_due/disputed/cancelled/
// refunded billing fact renders as itself whether or not enforcement is on,
// and a value we cannot read renders "unknown", never "current".

function membershipStateOf(row: MemberRow | null): MembershipDisplayState {
  if (row === null) return "none";
  switch (String(row.status ?? "")) {
    case "active":
      return "active";
    case "pending_activation":
      return "pending";
    case "past_due":
      return "past_due";
    case "paused":
      return "paused";
    case "cancelled":
    case "closed":
      return "canceled";
    default:
      return "inactive";
  }
}

function billingDisplayOf(row: MemberRow | null): MembershipBillingDisplayState {
  if (row === null) return "none";
  const raw = (row as Record<string, unknown>).billing_state;
  if (raw === undefined || raw === null || raw === "") {
    // Pre-migration rows carry no billing column: that is an absence of
    // knowledge, not a clean bill. "unknown", never a fabricated "current".
    return "unknown";
  }
  switch (String(raw)) {
    case "active":
      return "current";
    case "past_due":
      return "past_due";
    case "disputed":
      return "disputed";
    case "cancelled":
      return "cancelled";
    case "refunded":
      return "refunded";
    case "not_started":
    case "activation_pending":
    case "subscription_pending":
      // Billing has not begun/completed: there is no billing relationship to
      // report yet, and that too is a truth, not an erasure.
      return "none";
    default:
      return "unknown";
  }
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
      // research_members.status for ACCESS + billing_state (ledger row 9) for
      // BILLING, independently (P1-5). manageUrl and nextRenewalAt stay null:
      // the Stripe seam has no production caller, no billing-portal-session
      // capability, and no renewal schedule — nothing real exists to link or
      // date, so nothing is invented.
      async membershipFor(memberKey) {
        const row = await lookup(memberKey);
        const state = membershipStateOf(row);
        return {
          state,
          billing: billingDisplayOf(row),
          planLabel: state === "none" ? null : "Xenios Research Membership",
          renewal: { state: "unavailable", nextRenewalAt: null },
          nextRenewalAt: null,
          manageUrl: null,
          manualBilling: true,
        };
      },
    },
    care: {
      // P1-D: no durable Care source is wired in production, and the absence
      // of an adapter is NOT the fact "this person is not enrolled" — it is
      // the fact "we cannot know". The discriminated sourceState carries
      // exactly that, and every surface renders it as "Care status
      // unavailable". Graduates to server/care once the capability leaves
      // `disabled`; only then can "not enrolled" ever be asserted.
      async careFor() {
        return { sourceState: "unavailable" };
      },
    },
    orders: sources?.orders ?? {
      // Ungraduated fallback. The composition root injects the commerce
      // member-orders projection (orders-projection.ts) over the ONE decorated
      // MemberOrdersService; XRR assisted-order request history additionally
      // needs a list-by-member RPC that does not exist yet. With NO source
      // wired, the honest claim is availability: "unavailable" — never a
      // silently-empty list presented as the whole truth (P1-B).
      async ordersFor() {
        const disconnected = { connected: false, complete: false };
        return {
          research: [],
          carePharmacy: [],
          carePharmacyHistory: {
            availability: "unavailable",
            authoritativeRecordCount: null,
          },
          history: {
            availability: "unavailable",
            authoritativeRecordCount: null,
            sources: { commerce: disconnected, xea: disconnected, xec: disconnected, xrr: disconnected },
          },
        };
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
