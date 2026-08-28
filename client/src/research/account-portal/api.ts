import type {
  CareEnrollmentDto,
  CustomerAccountOverviewDto,
  CustomerAccountResult,
  CustomerOrdersDto,
  DocumentSummaryDto,
  SupportCaseSummaryDto,
} from "@shared/research/customer-account/contract";
import type { CatalogPriorityDto } from "@shared/research/product-activation/contract";
import type {
  CustomerSubscriptionDto,
  SubscriptionPageDto,
  SupportRequestInput,
  SupportRequestResult,
} from "./types";
import { safeAccountPath } from "./format";

const API_ROOT = "/api/research/customer-account";

function isEnvelope<T>(value: unknown): value is CustomerAccountResult<T> {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "ok" || kind === "denied" || kind === "error";
}

export async function accountPortalFetch<T>(
  token: string | null,
  path: string,
  init?: RequestInit,
): Promise<CustomerAccountResult<T>> {
  if (!token) return { kind: "denied", reason: "auth_required" };

  try {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${token}`);
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      // The verified member boundary wins over caller-supplied headers.
      headers,
    });
    const body: unknown = await response.json().catch(() => null);
    if (isEnvelope<T>(body) && (response.ok || body.kind !== "ok")) return body;
    if (response.status === 401 || response.status === 403) {
      return { kind: "denied", reason: "account_access_denied" };
    }
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export const loadAccountOverview = (token: string | null) =>
  accountPortalFetch<CustomerAccountOverviewDto>(token, "/overview");

export const loadCatalogPriority = (token: string | null) =>
  accountPortalFetch<CatalogPriorityDto>(token, "/catalog-priority");

export type AccountOverviewPageDto = Readonly<{
  overview: CustomerAccountOverviewDto;
  /** Null when the projection is unavailable — the section hides honestly. */
  catalogPriority: CatalogPriorityDto | null;
}>;

export const loadAccountOverviewPage = async (
  token: string | null,
): Promise<CustomerAccountResult<AccountOverviewPageDto>> => {
  const [overview, catalogPriority] = await Promise.all([
    loadAccountOverview(token),
    loadCatalogPriority(token),
  ]);
  if (overview.kind !== "ok") return overview;
  return {
    kind: "ok",
    data: {
      overview: overview.data,
      // Degrades honestly: a denied/error projection hides the availability
      // section rather than inventing statuses for it.
      catalogPriority: catalogPriority.kind === "ok" ? catalogPriority.data : null,
    },
  };
};

export const loadAccountOrders = (token: string | null) =>
  accountPortalFetch<CustomerOrdersDto>(token, "/orders");

export const loadAccountSubscription = async (token: string | null): Promise<CustomerAccountResult<SubscriptionPageDto>> => {
  const [subscription, documents] = await Promise.all([
    accountPortalFetch<CustomerSubscriptionDto>(token, "/subscription"),
    accountPortalFetch<readonly DocumentSummaryDto[]>(token, "/documents"),
  ]);
  if (subscription.kind !== "ok") return subscription;
  // An authorization failure still closes the whole private view. A document
  // service error, however, must not hide membership facts that were read
  // successfully; it becomes an explicit unavailable subsection instead.
  if (documents.kind === "denied") return documents;
  return {
    kind: "ok",
    data: {
      subscription: subscription.data,
      billingDocuments: documents.kind === "ok"
        ? documents.data.filter((document) => document.kind === "receipt")
        : null,
    },
  };
};

// The /care endpoint answers the FULL CareEnrollmentDto — enrolled flag,
// NESTED status, pharmacyState. This generic is the one canonical shape the
// server sends and CareView consumes (P1-6): declaring the inner status type
// here once hid every real enrollment behind an always-undefined `.stage`.
export const loadAccountCare = (token: string | null) =>
  accountPortalFetch<CareEnrollmentDto>(token, "/care");

export const loadAccountDocuments = (token: string | null) =>
  accountPortalFetch<readonly DocumentSummaryDto[]>(token, "/documents");

export const loadAccountSupport = (token: string | null) =>
  accountPortalFetch<readonly SupportCaseSummaryDto[]>(token, "/support");

export const createAccountSupportCase = (token: string | null, input: SupportRequestInput) =>
  accountPortalFetch<SupportRequestResult>(token, "/support", {
    method: "POST",
    body: JSON.stringify(input),
  });

export async function downloadAccountDocument(
  token: string | null,
  downloadPath: string,
): Promise<"ok" | "denied" | "error"> {
  if (!token) return "denied";
  if (!safeAccountPath(downloadPath)) {
    return "error";
  }
  try {
    const response = await fetch(downloadPath, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403) return "denied";
    if (!response.ok) return "error";
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "";
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    return "ok";
  } catch {
    return "error";
  }
}
