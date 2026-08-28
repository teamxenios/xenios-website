// SYNTHETIC fixtures for the customer-account surface. Every name, email,
// reference and date below is invented for tests and UI development. Real
// customer data must NEVER appear in this file, in any fixture, snapshot,
// screenshot or test output — that rule is load-bearing, not stylistic.

import {
  createMembershipDto,
  type CareEnrollmentDto,
  type CustomerAccountOverviewDto,
  type CustomerOrdersDto,
  type DocumentSummaryDto,
  type MembershipDto,
  type OrderSummaryDto,
  type SupportCaseSummaryDto,
} from "./contract";

export const FIXTURE_MEMBERSHIP_MANUAL: MembershipDto = createMembershipDto({
  state: "active",
  billing: "current",
  planLabel: "Xenios Research Membership",
  renewal: Object.freeze({
    state: "scheduled" as const,
    nextRenewalAt: "2026-09-26T00:00:00.000Z",
  }),
  manageUrl: null,
  manualBilling: true,
});

export const FIXTURE_MEMBERSHIP_NONE: MembershipDto = createMembershipDto({
  state: "none",
  billing: "none",
  planLabel: null,
  renewal: Object.freeze({ state: "not_scheduled" as const, nextRenewalAt: null }),
  manageUrl: null,
  manualBilling: true,
});

/** Access active while the billing ledger says past_due — the two truths diverge. */
export const FIXTURE_MEMBERSHIP_PAST_DUE_BILLING: MembershipDto = createMembershipDto({
  state: "active",
  billing: "past_due",
  planLabel: "Xenios Research Membership",
  renewal: Object.freeze({ state: "unavailable" as const, nextRenewalAt: null }),
  manageUrl: null,
  manualBilling: true,
});

export const FIXTURE_CARE_ENROLLED: CareEnrollmentDto = Object.freeze({
  sourceState: "available" as const,
  enrolled: true,
  status: Object.freeze({
    stage: "provider_review" as const,
    updatedAt: "2026-08-24T15:30:00.000Z",
    neutralSummary: "Your intake is with the provider team.",
  }),
  pharmacyState: "none" as const,
});

/** A CONNECTED Care source that reports no enrollment — a knowable fact. */
export const FIXTURE_CARE_NONE: CareEnrollmentDto = Object.freeze({
  sourceState: "available" as const,
  enrolled: false,
  status: Object.freeze({ stage: null, updatedAt: null, neutralSummary: null }),
  pharmacyState: "none" as const,
});

/** No durable Care source — carries NO enrollment claim at all (P1-D). */
export const FIXTURE_CARE_UNAVAILABLE: CareEnrollmentDto = Object.freeze({
  sourceState: "unavailable" as const,
});

export const FIXTURE_ORDERS: readonly OrderSummaryDto[] = Object.freeze([
  Object.freeze({
    reference: "XRR-20260820-TESTFIX01",
    recordKind: "request" as const,
    placedAt: "2026-08-20T18:12:00.000Z",
    detailAvailability: "available" as const,
    itemLabel: "Example Research Material A",
    variantLabel: "10 mg",
    quantity: 2,
    paymentState: "unpaid" as const,
    fulfillmentState: "unfulfilled" as const,
    trackingUrl: null,
    lotCoaAvailable: false,
  }),
  Object.freeze({
    reference: "XRR-20260811-TESTFIX02",
    recordKind: "request" as const,
    placedAt: "2026-08-11T09:03:00.000Z",
    detailAvailability: "available" as const,
    itemLabel: "Example Research Material B",
    variantLabel: "5 mg",
    quantity: 1,
    paymentState: "paid" as const,
    fulfillmentState: "shipped" as const,
    trackingUrl: "https://tracking.invalid/fixture/1Z999TEST",
    lotCoaAvailable: true,
  }),
]);

export const FIXTURE_CUSTOMER_ORDERS: CustomerOrdersDto = Object.freeze({
  research: FIXTURE_ORDERS,
  carePharmacy: Object.freeze([
    Object.freeze({
      intakeState: "submitted" as const,
      providerReviewState: "pending" as const,
      pharmacyState: "none" as const,
      trackingUrl: null,
      updatedAt: "2026-08-24T15:30:00.000Z",
    }),
  ]),
  carePharmacyHistory: Object.freeze({
    availability: "available" as const,
    authoritativeRecordCount: 1,
  }),
  history: Object.freeze({
    availability: "partial" as const,
    authoritativeRecordCount: null,
    sources: Object.freeze({
      commerce: Object.freeze({ connected: true, complete: true }),
      xea: Object.freeze({ connected: true, complete: true }),
      xec: Object.freeze({ connected: false, complete: false }),
      xrr: Object.freeze({ connected: false, complete: false }),
    }),
  }),
});

/**
 * A Care source can return known records while still being incomplete. Its
 * rows remain visible, but their array length is never promoted to a total.
 */
export const FIXTURE_CUSTOMER_ORDERS_CARE_PARTIAL: CustomerOrdersDto = Object.freeze({
  ...FIXTURE_CUSTOMER_ORDERS,
  carePharmacyHistory: Object.freeze({
    availability: "partial" as const,
    authoritativeRecordCount: null,
  }),
});

export const FIXTURE_DOCUMENTS: readonly DocumentSummaryDto[] = Object.freeze([
  Object.freeze({
    id: "doc-fixture-0001",
    kind: "receipt" as const,
    title: "Order receipt XRR-20260811-TESTFIX02",
    issuedAt: "2026-08-11T09:05:00.000Z",
    downloadPath: "/api/research/customer-account/documents/doc-fixture-0001",
  }),
  Object.freeze({
    id: "doc-fixture-0002",
    kind: "coa" as const,
    title: "Certificate of Analysis — Example Research Material B, lot FX-1",
    issuedAt: "2026-08-12T10:00:00.000Z",
    downloadPath: "/api/research/customer-account/documents/doc-fixture-0002",
  }),
]);

export const FIXTURE_SUPPORT_CASES: readonly SupportCaseSummaryDto[] = Object.freeze([
  Object.freeze({
    id: "case-fixture-0001",
    category: "order" as const,
    subject: "Shipping address update",
    state: "open" as const,
    lastUpdateAt: "2026-08-25T12:00:00.000Z",
    responseExpectation: "We reply within one business day.",
  }),
]);

export const FIXTURE_ACCOUNT_OVERVIEW: CustomerAccountOverviewDto = Object.freeze({
  identity: Object.freeze({
    displayName: "Test Customer",
    email: "test.customer@example.invalid",
    accountStatus: "active" as const,
    memberSince: "2026-07-01T00:00:00.000Z",
  }),
  partnerAttribution: null,
  membership: FIXTURE_MEMBERSHIP_MANUAL,
  careEnrollment: FIXTURE_CARE_ENROLLED,
  researchOrders: FIXTURE_ORDERS,
  orderHistory: Object.freeze({
    availability: "partial" as const,
    authoritativeRecordCount: null,
    sources: Object.freeze({
      commerce: Object.freeze({ connected: true, complete: true }),
      xea: Object.freeze({ connected: true, complete: true }),
      xec: Object.freeze({ connected: false, complete: false }),
      xrr: Object.freeze({ connected: false, complete: false }),
    }),
  }),
  accountStanding: "attention" as const,
  productInterests: Object.freeze([
    Object.freeze({
      interestKey: "bpc157-tb500",
      displayLabel: "BPC-157 / TB-500 blends",
      availability: "request_only" as const,
      recordedAt: "2026-08-26T00:00:00.000Z",
    }),
    Object.freeze({
      interestKey: "retatrutide",
      displayLabel: "Retatrutide",
      availability: "request_only" as const,
      recordedAt: "2026-08-26T00:00:00.000Z",
    }),
  ]),
  documents: FIXTURE_DOCUMENTS,
  supportCases: FIXTURE_SUPPORT_CASES,
  nextAdministrativeAction: "Confirm your shipping address for your open order.",
});

/** A staff projection of the same account: attribution becomes visible. */
export const FIXTURE_ACCOUNT_OVERVIEW_STAFF: CustomerAccountOverviewDto = Object.freeze({
  ...FIXTURE_ACCOUNT_OVERVIEW,
  partnerAttribution: Object.freeze({
    sourcePartner: "vitality_advisors",
    relationshipOwner: "Vitality Advisors relationship owner",
  }),
});
