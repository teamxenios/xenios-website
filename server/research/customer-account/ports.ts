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
import type { CatalogPriorityDto } from "@shared/research/product-activation/contract";

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

export type CustomerDocumentBytes = Readonly<{
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}>;

export interface CustomerDocumentsPort {
  documentsFor(memberKey: string): Promise<readonly DocumentSummaryDto[]>;
  /**
   * Byte read for one OWNED document. OPTIONAL: absent (or resolving null)
   * means downloads are not available and the route answers a denial; the
   * listing then ships an empty downloadPath so the client renders its honest
   * "Download unavailable" state instead of a dead button. Ownership is
   * enforced INSIDE the implementation — the storage query is scoped by
   * memberKey, so a foreign documentId is indistinguishable from a missing one.
   */
  openDocument?(memberKey: string, documentId: string): Promise<CustomerDocumentBytes | null>;
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

/**
 * Read-only member projection of the audited product-activation overlay:
 * statuses only, never counts/provenance/checklists. OPTIONAL because the
 * fixture/memory compositions predate it; when absent, the route answers a
 * denial rather than inventing a projection.
 */
export interface CatalogPriorityPort {
  catalogPriorityFor(): Promise<CatalogPriorityDto>;
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
  catalogPriority?: CatalogPriorityPort;
}>;
