// Ports for the customer-account read surface. Each port answers for exactly
// one concern; the service composes them and NOTHING here mutates anything.
//
// Every port is keyed by the acting member's opaque key, which comes ONLY from
// the injected guard (`req.researchMember`) — no handler reads an identity
// from a body, query, or path, so no request field can address another
// customer. A port that cannot answer throws; the service fails the whole
// read closed rather than composing a partially-true account page.

import type {
  CareEnrollmentDto,
  CustomerOrdersDto,
  DocumentSummaryDto,
  MembershipDto,
  PartnerAttributionDto,
  ProductInterestDto,
  SupportCaseSummaryDto,
} from "@shared/research/customer-account/contract";

export type CustomerIdentity = Readonly<{
  memberKey: string;
  displayName: string;
  email: string;
  accountStatus: "invited" | "active" | "inactive";
  memberSince: string | null;
}>;

export interface CustomerIdentityPort {
  identityFor(memberKey: string): Promise<CustomerIdentity | null>;
}

export interface MembershipPort {
  membershipFor(memberKey: string): Promise<MembershipDto>;
}

export interface CareStatusPort {
  careFor(memberKey: string): Promise<CareEnrollmentDto>;
}

export interface CustomerOrdersPort {
  ordersFor(memberKey: string): Promise<CustomerOrdersDto>;
}

export interface ProductInterestsPort {
  interestsFor(memberKey: string): Promise<readonly ProductInterestDto[]>;
}

export interface CustomerDocumentsPort {
  documentsFor(memberKey: string): Promise<readonly DocumentSummaryDto[]>;
}

export interface SupportCasesPort {
  casesFor(memberKey: string): Promise<readonly SupportCaseSummaryDto[]>;
  openCase(
    memberKey: string,
    input: Readonly<{ category: string; subject: string; description: string }>,
  ): Promise<SupportCaseSummaryDto>;
}

/**
 * Staff-only projection: who introduced this customer. The customer-facing
 * service never calls it; only the staff view resolver does.
 */
export interface PartnerAttributionPort {
  attributionFor(memberKey: string): Promise<PartnerAttributionDto | null>;
}

export type CustomerAccountPorts = Readonly<{
  identity: CustomerIdentityPort;
  membership: MembershipPort;
  care: CareStatusPort;
  orders: CustomerOrdersPort;
  interests: ProductInterestsPort;
  documents: CustomerDocumentsPort;
  support: SupportCasesPort;
  attribution: PartnerAttributionPort;
}>;
