import type {
  CareStatusDto,
  CustomerAccountOverviewDto,
  CustomerAccountResult,
  CustomerOrdersDto,
  DocumentSummaryDto,
  SupportCaseSummaryDto,
} from "@shared/research/customer-account/contract";
import type {
  CustomerSubscriptionDto,
  SubscriptionPageDto,
  SupportRequestInput,
  SupportRequestResult,
} from "./types";

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
    const response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
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

export const loadAccountOrders = (token: string | null) =>
  accountPortalFetch<CustomerOrdersDto>(token, "/orders");

export const loadAccountSubscription = async (token: string | null): Promise<CustomerAccountResult<SubscriptionPageDto>> => {
  const [subscription, documents] = await Promise.all([
    accountPortalFetch<CustomerSubscriptionDto>(token, "/subscription"),
    accountPortalFetch<readonly DocumentSummaryDto[]>(token, "/documents"),
  ]);
  if (subscription.kind !== "ok") return subscription;
  if (documents.kind !== "ok") return documents;
  return {
    kind: "ok",
    data: {
      subscription: subscription.data,
      billingDocuments: documents.data.filter((document) => document.kind === "receipt"),
    },
  };
};

export const loadAccountCare = (token: string | null) =>
  accountPortalFetch<CareStatusDto>(token, "/care");

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
  if (!downloadPath.startsWith("/api/research/customer-account/documents/") || downloadPath.startsWith("//")) {
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
