import {
  REFERRAL_API,
  type RecommendationCapture,
  type RecommendationContext,
  type RecommendationLink,
  type RecommendationLinks,
  type ReferralLifecycle,
} from "@shared/research/referral-v1";
import { isRecoveryHash } from "@shared/research/recovery";
import { getSupabaseBrowser, isRecoveryAccessToken } from "@/lib/supabaseBrowser";

export type RecommendationResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "error"; code: string; status: number };

async function request<T>(path: string, options: { token?: string | null; body?: unknown; key?: string; csrf?: string } = {}): Promise<RecommendationResult<T>> {
  try {
    const response = await fetch(path, {
      method: options.body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.key ? { "Idempotency-Key": options.key } : {}),
        ...(options.csrf ? { "X-Xenios-Referral-CSRF": options.csrf } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.ok !== true) {
      return { kind: "error", status: response.status, code: typeof body?.code === "string" ? body.code : "unavailable" };
    }
    return { kind: "ok", data: body as T };
  } catch {
    return { kind: "error", status: 0, code: "connection_failed" };
  }
}

const signedOut = { kind: "error", code: "sign_in_required", status: 401 } as const;
export const listRecommendationLinks = (token: string | null) => token
  ? request<RecommendationLinks>(REFERRAL_API.links, { token }) : Promise.resolve(signedOut);
export const createRecommendationLink = (token: string, destinationPath: string, key: string) =>
  request<{ link: RecommendationLink }>(REFERRAL_API.links, { token, body: { destinationPath }, key });
export const revokeRecommendationLink = (token: string, id: string, key: string) =>
  request<{ link: RecommendationLink }>(`${REFERRAL_API.links}/${encodeURIComponent(id)}/revoke`, { token, body: {}, key });
export const resolveRecommendation = (code: string) => request<RecommendationContext>(REFERRAL_API.resolve, { body: { code } });
export const bootstrapRecommendation = () => request<{ csrfToken: string }>(REFERRAL_API.bootstrap, { body: {} });
/** Read the existing identity only at the explicit capture action, never create one. */
export async function recommendationMemberToken(provided?: string | null): Promise<string | null> {
  if (typeof window !== "undefined" && isRecoveryHash(window.location.hash)) return null;
  try {
    const client = provided === undefined ? await getSupabaseBrowser() : null;
    const token = provided === undefined ? (client ? (await client.auth.getSession()).data.session?.access_token ?? null : null) : provided;
    return token && !isRecoveryAccessToken(token) ? token : null;
  } catch {
    // An unavailable session is anonymous; never substitute another credential.
    return null;
  }
}
export const captureRecommendation = async (code: string, csrf: string, token?: string | null) =>
  request<RecommendationCapture>(REFERRAL_API.capture, { body: { code }, csrf, token: await recommendationMemberToken(token) });
export const loadReferralLifecycle = (token: string) => request<ReferralLifecycle>(REFERRAL_API.admin, { token });

/** Do not expose arbitrary upstream messages, identifiers or response bodies. */
export function recommendationError(result: { status: number; code: string }): string {
  if (result.status === 401) return "Your session has ended. Sign in again to continue.";
  if (result.status === 403) return "This account is not authorized to manage referral links. Access is checked by Xenios.";
  if (result.status === 429) return "Too many requests. Wait a moment before trying again.";
  if (result.status === 409) return "This link changed or the request conflicts with an earlier action. Refresh the list before trying again.";
  if (result.status === 503 || result.status === 404) return "The recommendation service is not available right now. Please try again later.";
  return "We could not confirm the result. Retry the same action to check it safely, or contact support.";
}
