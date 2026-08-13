import type {
  AccountApiErrorCode,
  AccountContextDto,
  BusinessProfile,
  OrganizationDashboardDto,
  OrganizationRole,
  RequestCustomerClaimInput,
  UpdateBusinessProfileInput,
} from "@shared/research/account-identity";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

export type AccountResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "denied"; code: AccountApiErrorCode; message: string }
  | { kind: "error"; message: string };

async function accessToken(): Promise<string | null> {
  const supabase = await getSupabaseBrowser();
  return supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null;
}

async function accountFetch<T>(path: string, init?: RequestInit): Promise<AccountResult<T>> {
  const token = await accessToken();
  if (!token) return { kind: "denied", code: "AUTH_REQUIRED", message: "Sign in is required." };
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.ok) return { kind: "ok", data: body as T };
    if (body?.code) {
      return {
        kind: "denied",
        code: body.code as AccountApiErrorCode,
        message: String(body.message || "This action is not available."),
      };
    }
    return { kind: "error", message: "The account service returned an unexpected response." };
  } catch {
    return { kind: "error", message: "The account service is unavailable. Please try again." };
  }
}

export const getAccountContext = () => accountFetch<AccountContextDto>("/api/research/account/context");

export const getOrganizationDashboard = (organizationId: string) =>
  accountFetch<OrganizationDashboardDto>(
    `/api/research/account/organizations/${encodeURIComponent(organizationId)}/dashboard`,
  );

export const updateBusinessProfile = (organizationId: string, patch: UpdateBusinessProfileInput) =>
  accountFetch<BusinessProfile>(
    `/api/research/account/organizations/${encodeURIComponent(organizationId)}/profile`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );

export const requestCustomerClaim = (input: RequestCustomerClaimInput) =>
  accountFetch<{ claimId: string; deliveryAccepted: boolean }>("/api/research/account/claims/request", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const confirmCustomerClaim = (claimId: string, challengeToken: string) =>
  accountFetch<{ customerRef: string; linked: boolean; replayed: boolean }>(
    "/api/research/account/claims/confirm",
    { method: "POST", body: JSON.stringify({ claimId, challengeToken }) },
  );

export const acknowledgeInitialPasswordChange = () =>
  accountFetch<{ cleared: true }>("/api/research/account/security/password-change-complete", { method: "POST" });

export const inviteOrganizationUser = (organizationId: string, email: string, roles: OrganizationRole[]) =>
  accountFetch<{ invitationId: string; deliveryAccepted: boolean }>(
    `/api/research/account/organizations/${encodeURIComponent(organizationId)}/users/invitations`,
    { method: "POST", body: JSON.stringify({ email, roles }) },
  );

export const acceptOrganizationInvitation = (invitationId: string, invitationToken: string) =>
  accountFetch<{ organizationId: string; accepted: boolean; replayed: boolean }>(
    "/api/research/account/organization-invitations/accept",
    { method: "POST", body: JSON.stringify({ invitationId, invitationToken }) },
  );

export const requestOrderAgain = (
  organizationId: string,
  source: string,
  sourceOrderId: string,
  note: string | null = null,
) =>
  accountFetch<{ requestId: string; replayed: boolean }>(
    `/api/research/account/organizations/${encodeURIComponent(organizationId)}/orders/request-again`,
    { method: "POST", body: JSON.stringify({ source, sourceOrderId, note }) },
  );
