import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { ImportDryRunReportDto } from "@shared/research/client-import/contract";
import type { ProductActivationStatus } from "@shared/research/product-activation/contract";
import {
  FIXTURE_ACCOUNT_OVERVIEW,
  FIXTURE_CARE_ENROLLED,
  FIXTURE_CUSTOMER_ORDERS,
  FIXTURE_DOCUMENTS,
  FIXTURE_MEMBERSHIP_MANUAL,
  FIXTURE_SUPPORT_CASES,
} from "@shared/research/customer-account/fixtures";
import { fixturesAllowed } from "../../lib/fixtures";
import { ACCOUNT_PORTAL_ROUTES } from "../../lib/routes";
import { CurrentDemandCollection } from "../../catalog-priority/CurrentDemandCollection";
import {
  CURRENT_CLIENT_DEMAND_DEFINITIONS,
  PENDING_VARIANT_PLACEHOLDERS,
  type PriorityCatalogItem,
} from "../../catalog-priority/priority-config";
import { ClientImportDryRunSummaryView } from "../../pages/adminx/client-imports";
import { AccountPortalShell } from "../AccountPortalShell";
import { AccountCareView } from "../views/CareView";
import { AccountDocumentsView } from "../views/DocumentsView";
import { AccountOrdersView } from "../views/OrdersView";
import { AccountOverviewView } from "../views/OverviewView";
import { AccountSubscriptionView } from "../views/SubscriptionView";
import { AccountSupportView } from "../views/SupportView";
import "../../../index.css";
import "./review.css";

type ReviewScreen =
  | "overview"
  | "orders"
  | "subscription"
  | "care"
  | "documents"
  | "support"
  | "catalog"
  | "pending"
  | "admin-import";

const SCREEN = (new URLSearchParams(window.location.search).get("screen") ?? "overview") as ReviewScreen;

const REVIEW_STATUS: readonly ProductActivationStatus[] = [
  "request_only",
  "provider_required",
  "verbally_confirmed_pending_documentation",
  "pending_pharmacy_activation",
  "held",
  "request_only",
  "provider_required",
  "unavailable",
  "request_only",
] as const;

const REVIEW_DEMAND_ITEMS: readonly PriorityCatalogItem[] = CURRENT_CLIENT_DEMAND_DEFINITIONS.map((item, index) => ({
  ...item,
  activationStatus: REVIEW_STATUS[index] ?? "unavailable",
  detailsPath: null,
  actionPath: REVIEW_STATUS[index] === "provider_required"
    ? ACCOUNT_PORTAL_ROUTES.care
    : REVIEW_STATUS[index] === "request_only" || REVIEW_STATUS[index]?.includes("pending")
      ? ACCOUNT_PORTAL_ROUTES.support
      : null,
}));

const SYNTHETIC_IMPORT_REPORT: ImportDryRunReportDto = Object.freeze({
  batchId: "batch-synthetic-review-01",
  sourceLabel: "Synthetic pilot intake workbook",
  dryRun: true,
  totalRows: 48,
  rejectedRows: 2,
  rejectionCounts: Object.freeze({ blank_name: 1, name_too_long: 1, product_too_long: 0, malformed_row: 0 }),
  processedRows: 46,
  uniquePeople: 31,
  duplicateNameRows: 7,
  multiInterestPeople: 12,
  missingContact: 31,
  mappedInterestMentions: 44,
  distinctInterestKeys: 9,
  unmappedInterests: Object.freeze([Object.freeze({ ref: "5eebc0de0001", occurrences: 1 })]),
  ambiguousBlendStrings: Object.freeze([Object.freeze({ ref: "5eebc0de0002", occurrences: 2 })]),
  consentStatusCounts: Object.freeze({ pending: 31, granted: 0, declined: 0 }),
  accountStatusCounts: Object.freeze({ not_invited: 31, invitation_approved: 0, invited: 0, active: 0 }),
  invitationEligible: 0,
  exceptions: Object.freeze([
    Object.freeze({ kind: "ambiguous_blend" as const, ref: "5eebc0de0002", occurrences: 2 }),
    Object.freeze({ kind: "unmapped_interest" as const, ref: "5eebc0de0001", occurrences: 1 }),
  ]),
  interestBreakdown: Object.freeze([
    Object.freeze({ interestKey: "example-priority-a", mentions: 14 }),
    Object.freeze({ interestKey: "example-priority-b", mentions: 9 }),
  ]),
});

function AccountFrame({
  path,
  eyebrow,
  title,
  lead,
  children,
}: {
  path: string;
  eyebrow?: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <AccountPortalShell currentPath={path} eyebrow={eyebrow} title={title} lead={lead}>
      {children}
    </AccountPortalShell>
  );
}

function Review() {
  if (!fixturesAllowed()) return <p>This review entry is disabled.</p>;

  switch (SCREEN) {
    case "orders":
      return <AccountFrame path={ACCOUNT_PORTAL_ROUTES.orders} eyebrow="Orders + fulfillment" title="Orders, without ambiguity." lead="Research orders and Care/pharmacy fulfillment remain visibly separate."><AccountOrdersView data={FIXTURE_CUSTOMER_ORDERS} /></AccountFrame>;
    case "subscription":
      return <AccountFrame path={ACCOUNT_PORTAL_ROUTES.subscription} eyebrow="Membership + billing" title="Membership, separated from Care." lead="Plan and renewal status without confusing membership with provider or pharmacy operations."><AccountSubscriptionView data={{ subscription: { membership: FIXTURE_MEMBERSHIP_MANUAL, careEnrollment: FIXTURE_CARE_ENROLLED }, billingDocuments: FIXTURE_DOCUMENTS.filter((document) => document.kind === "receipt") }} /></AccountFrame>;
    case "care":
      return <AccountFrame path={ACCOUNT_PORTAL_ROUTES.care} eyebrow="Care operations" title="Care, step by step." lead="A neutral operational timeline without clinical detail or implied outcomes."><AccountCareView data={FIXTURE_CARE_ENROLLED} /></AccountFrame>;
    case "documents":
      return <AccountFrame path={ACCOUNT_PORTAL_ROUTES.documents} eyebrow="Secure records" title="Documents in one place." lead="Approved customer-facing account records only."><AccountDocumentsView documents={FIXTURE_DOCUMENTS} onDownload={async () => "ok"} /></AccountFrame>;
    case "support":
      return <AccountFrame path={ACCOUNT_PORTAL_ROUTES.support} eyebrow="Account support" title="The right help, in the right lane." lead="Account, order, Care-operation, or pharmacy-operation support."><AccountSupportView cases={FIXTURE_SUPPORT_CASES} onSubmit={async (input) => ({ kind: "ok", data: { id: "case-synthetic-new", category: input.category, subject: input.subject, state: "open", lastUpdateAt: "2026-08-26T18:00:00.000Z", responseExpectation: "A response expectation will appear after routing." } })} /></AccountFrame>;
    case "catalog":
      return <AccountFrame path={ACCOUNT_PORTAL_ROUTES.home} eyebrow="Catalog priority" title="Demand, organized by pathway." lead="A review-only projection of the config-driven priority collection; no counts, prices, or unsupported activation claims."><CurrentDemandCollection items={REVIEW_DEMAND_ITEMS} /></AccountFrame>;
    case "pending":
      return <AccountFrame path={ACCOUNT_PORTAL_ROUTES.home} eyebrow="Activation review" title="Exact variants stay pending." lead="Missing formulations remain request-only or pending until the activation contract has complete documentation and approval."><CurrentDemandCollection items={PENDING_VARIANT_PLACEHOLDERS} title="Pending exact-variant review" lead="These placeholders are not live or orderable." /></AccountFrame>;
    case "admin-import":
      return <div className="account-review-admin"><ClientImportDryRunSummaryView report={SYNTHETIC_IMPORT_REPORT} attribution={{ sourcePartner: "Example advisory partner", relationshipOwner: "Assigned account lead" }} disposition={{ approved: 0, blocked: 31, skipped: 0 }} /></div>;
    case "overview":
    default:
      return <AccountFrame path={ACCOUNT_PORTAL_ROUTES.home} title="Your account, clearly organized." lead="Membership, Research orders, Care operations, documents, and support—each with its own source of truth."><AccountOverviewView data={FIXTURE_ACCOUNT_OVERVIEW} /></AccountFrame>;
  }
}

document.title = `Xenios account review · ${SCREEN}`;
createRoot(document.getElementById("root")!).render(<StrictMode><div className="account-review-root"><Review /></div></StrictMode>);

