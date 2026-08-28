// In-memory ports for tests and local development. Seeded ONLY with synthetic
// fixture data — never with real customer information.

import {
  FIXTURE_ACCOUNT_OVERVIEW,
  FIXTURE_CARE_NONE,
  FIXTURE_CUSTOMER_ORDERS,
  FIXTURE_MEMBERSHIP_NONE,
} from "@shared/research/customer-account/fixtures";
import type {
  CareEnrollmentDto,
  CustomerOrdersDto,
  DocumentSummaryDto,
  MembershipDto,
  PartnerAttributionDto,
  ProductInterestDto,
  SupportCaseSummaryDto,
} from "@shared/research/customer-account/contract";
import type { CustomerAccountPorts, CustomerIdentity } from "./ports";

export type MemoryCustomerSeed = Readonly<{
  identity: CustomerIdentity;
  membership?: MembershipDto;
  care?: CareEnrollmentDto;
  orders?: CustomerOrdersDto;
  interests?: readonly ProductInterestDto[];
  documents?: readonly DocumentSummaryDto[];
  supportCases?: readonly SupportCaseSummaryDto[];
  attribution?: PartnerAttributionDto | null;
}>;

export function createMemoryCustomerAccountPorts(
  seeds: readonly MemoryCustomerSeed[],
): CustomerAccountPorts {
  const byKey = new Map(seeds.map((s) => [s.identity.memberKey, s]));
  const opened: SupportCaseSummaryDto[] = [];
  let caseCounter = 0;

  const seedOf = (memberKey: string): MemoryCustomerSeed | null => byKey.get(memberKey) ?? null;

  return {
    identity: {
      async identityFor(memberKey) {
        return seedOf(memberKey)?.identity ?? null;
      },
    },
    membership: {
      async membershipFor(memberKey) {
        return seedOf(memberKey)?.membership ?? FIXTURE_MEMBERSHIP_NONE;
      },
    },
    care: {
      async careFor(memberKey) {
        return seedOf(memberKey)?.care ?? FIXTURE_CARE_NONE;
      },
    },
    orders: {
      async ordersFor(memberKey) {
        return (
          seedOf(memberKey)?.orders ?? {
            research: [],
            carePharmacy: [],
            carePharmacyHistory: {
              availability: "unavailable",
              authoritativeRecordCount: null,
            },
            history: {
              availability: "partial",
              authoritativeRecordCount: null,
              sources: {
                commerce: { connected: true, complete: true },
                xea: { connected: true, complete: true },
                xec: { connected: false, complete: false },
                xrr: { connected: false, complete: false },
              },
            },
          }
        );
      },
    },
    interests: {
      async interestsFor(memberKey) {
        return seedOf(memberKey)?.interests ?? [];
      },
    },
    documents: {
      async documentsFor(memberKey) {
        return seedOf(memberKey)?.documents ?? [];
      },
    },
    support: {
      async casesFor(memberKey) {
        const seeded = seedOf(memberKey)?.supportCases ?? [];
        return [...seeded, ...opened.filter((c) => c.id.startsWith(`case-${memberKey}-`))];
      },
      async openCase(memberKey, input) {
        caseCounter += 1;
        const created: SupportCaseSummaryDto = {
          id: `case-${memberKey}-${caseCounter}`,
          category: input.category as SupportCaseSummaryDto["category"],
          subject: input.subject,
          state: "open",
          lastUpdateAt: new Date(0).toISOString(),
          responseExpectation: "We reply within one business day.",
        };
        opened.push(created);
        return created;
      },
    },
    attribution: {
      async attributionFor(memberKey) {
        return seedOf(memberKey)?.attribution ?? null;
      },
    },
  };
}

/** Two synthetic customers: one rich account, one empty account. */
export function defaultMemorySeeds(): readonly MemoryCustomerSeed[] {
  return [
    {
      identity: {
        memberKey: "member-fixture-1",
        displayName: FIXTURE_ACCOUNT_OVERVIEW.identity.displayName,
        email: FIXTURE_ACCOUNT_OVERVIEW.identity.email,
        accountStatus: "active",
        memberSince: FIXTURE_ACCOUNT_OVERVIEW.identity.memberSince,
      },
      membership: FIXTURE_ACCOUNT_OVERVIEW.membership,
      care: FIXTURE_ACCOUNT_OVERVIEW.careEnrollment,
      orders: FIXTURE_CUSTOMER_ORDERS,
      interests: FIXTURE_ACCOUNT_OVERVIEW.productInterests,
      documents: FIXTURE_ACCOUNT_OVERVIEW.documents,
      supportCases: FIXTURE_ACCOUNT_OVERVIEW.supportCases,
      attribution: { sourcePartner: "vitality_advisors", relationshipOwner: "Vitality Advisors relationship owner" },
    },
    {
      identity: {
        memberKey: "member-fixture-2",
        displayName: "Empty Fixture",
        email: "empty.fixture@example.invalid",
        accountStatus: "active",
        memberSince: null,
      },
    },
  ];
}
