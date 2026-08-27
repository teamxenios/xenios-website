// SYNTHETIC fixtures for the customer-account surface. Every name, email,
// reference and date below is invented for tests and UI development. Real
// customer data must NEVER appear in this file, in any fixture, snapshot,
// screenshot or test output — that rule is load-bearing, not stylistic.

import type {
  CareEnrollmentDto,
  CustomerAccountOverviewDto,
  CustomerOrdersDto,
  DocumentSummaryDto,
  MembershipDto,
  OrderSummaryDto,
  SupportCaseSummaryDto,
} from "./contract";

export const FIXTURE_MEMBERSHIP_MANUAL: MembershipDto = Object.freeze({
  state: "active",
  planLabel: "Xenios Research Membership",
  nextRenewalAt: "2026-09-26T00:00:00.000Z",
  manageUrl: null,
  manualBilling: true,
});

export const FIXTURE_MEMBERSHIP_NONE: MembershipDto = Object.freeze({
  state: "none",
  planLabel: null,
  nextRenewalAt: null,
  manageUrl: null,
  manualBilling: true,
});

export const FIXTURE_CARE_ENROLLED: CareEnrollmentDto = Object.freeze({
  enrolled: true,
  status: Object.freeze({
    stage: "provider_review" as const,
    updatedAt: "2026-08-24T15:30:00.000Z",
    neutralSummary: "Your intake is with the provider team.",
  }),
  pharmacyState: "none" as const,
});

export const FIXTURE_CARE_NONE: CareEnrollmentDto = Object.freeze({
  enrolled: false,
  status: Object.freeze({ stage: null, updatedAt: null, neutralSummary: null }),
  pharmacyState: "none" as const,
});

export const FIXTURE_ORDERS: readonly OrderSummaryDto[] = Object.freeze([
  Object.freeze({
    reference: "XRR-20260820-TESTFIX01",
    placedAt: "2026-08-20T18:12:00.000Z",
    itemLabel: "Example Research Material A",
    variantLabel: "10 mg",
    quantity: 2,
    paymentState: "awaiting_payment" as const,
    fulfillmentState: "unfulfilled" as const,
    trackingUrl: null,
    lotCoaAvailable: false,
  }),
  Object.freeze({
    reference: "XRR-20260811-TESTFIX02",
    placedAt: "2026-08-11T09:03:00.000Z",
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
    relationshipOwner: "Seth Grant",
  }),
});
