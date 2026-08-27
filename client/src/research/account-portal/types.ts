import type {
  CareEnrollmentDto,
  DocumentSummaryDto,
  MembershipDto,
  SupportCaseCategory,
  SupportCaseSummaryDto,
} from "@shared/research/customer-account/contract";

/**
 * Page-level projections for endpoints whose response objects are declared
 * inline by the shared contract. These types add no product or account truth;
 * they only name the exact UI payloads used by this route family.
 */
export type CustomerSubscriptionDto = Readonly<{
  membership: MembershipDto | null;
  careEnrollment: CareEnrollmentDto | null;
}>;

export type SubscriptionPageDto = Readonly<{
  subscription: CustomerSubscriptionDto;
  billingDocuments: readonly DocumentSummaryDto[];
}>;

export type SupportRequestInput = Readonly<{
  category: SupportCaseCategory;
  subject: string;
  description: string;
}>;

export type SupportRequestResult = SupportCaseSummaryDto;

