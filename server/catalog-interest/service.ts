import { createHash } from "node:crypto";
import {
  CATALOG_INTEREST_CUSTOMER_EVENT,
  CATALOG_INTEREST_NOTICE_VERSION,
  CATALOG_INTEREST_TEAM_EVENT,
  CATALOG_MARKETING_NOTICE_VERSION,
  type CatalogInterestReceipt,
  type CatalogInterestRequest,
} from "@shared/catalog-interest";
import type { CatalogAuthority } from "./authority";

export interface CatalogInterestRecordInput {
  requestId: string;
  fingerprint: string;
  email: string;
  marketingConsent: boolean;
  deliveryNoticeVersion: string;
  marketingNoticeVersion: string | null;
  catalogRevision: string;
  catalogUrl: string;
  catalogApprovedAt: string;
  catalogExpiresAt: string;
  catalogRevokedAt: string | null;
  authorityState: "approved" | "manual_review";
  teamRecipient: string;
  customerEventKey: string;
  teamEventKey: string;
  customerEventType: typeof CATALOG_INTEREST_CUSTOMER_EVENT;
  teamEventType: typeof CATALOG_INTEREST_TEAM_EVENT;
}

export type CatalogInterestRecordResult = CatalogInterestReceipt | {
  ok: false;
  code: "request_conflict";
};

export interface CatalogInterestStore {
  record(input: CatalogInterestRecordInput): Promise<CatalogInterestRecordResult>;
}

export interface CatalogInterestServiceDependencies {
  authority(): CatalogAuthority | null;
  teamRecipient(): string | null;
  store: CatalogInterestStore;
}

export function catalogInterestFingerprint(input: Readonly<{
  email: string;
  marketingConsent: boolean;
  catalogRevision: string;
}>): string {
  return createHash("sha256")
    .update([
      input.email,
      input.marketingConsent ? "1" : "0",
      CATALOG_INTEREST_NOTICE_VERSION,
      input.catalogRevision,
    ].join("\n"), "utf8")
    .digest("hex");
}

export async function recordCatalogInterest(
  deps: CatalogInterestServiceDependencies,
  request: CatalogInterestRequest,
): Promise<CatalogInterestRecordResult> {
  const authority = deps.authority();
  const teamRecipient = deps.teamRecipient();
  if (!authority || !teamRecipient) {
    throw new Error("catalog interest unavailable");
  }

  return deps.store.record({
    requestId: request.requestId,
    fingerprint: catalogInterestFingerprint({
      email: request.email,
      marketingConsent: request.marketingConsent,
      catalogRevision: authority.revision,
    }),
    email: request.email,
    marketingConsent: request.marketingConsent,
    deliveryNoticeVersion: CATALOG_INTEREST_NOTICE_VERSION,
    marketingNoticeVersion: request.marketingConsent
      ? CATALOG_MARKETING_NOTICE_VERSION
      : null,
    catalogRevision: authority.revision,
    catalogUrl: authority.url,
    catalogApprovedAt: authority.approvedAt,
    catalogExpiresAt: authority.expiresAt,
    catalogRevokedAt: authority.revokedAt,
    authorityState: authority.state,
    teamRecipient,
    customerEventKey: `catalog-interest:${request.requestId}:customer`,
    teamEventKey: `catalog-interest:${request.requestId}:team`,
    customerEventType: CATALOG_INTEREST_CUSTOMER_EVENT,
    teamEventType: CATALOG_INTEREST_TEAM_EVENT,
  });
}
