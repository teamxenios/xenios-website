import {
  REFERRAL_API,
  normalizeReadableReferralCode,
  safeReferralDestination,
  type RecommendationCapture,
  type RecommendationContext,
  type RecommendationLink,
  type RecommendationLinks,
  type RecommendationReadableAlias,
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

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** An ephemeral UI partition only. The authenticated server remains authority. */
export function readableAliasSession(token: string | null): string | null {
  try {
    if (!token || isRecoveryAccessToken(token)) return null;
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const value = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    return uuid.test(value.sub) && uuid.test(value.session_id) ? `${value.sub}:${value.session_id}` : null;
  } catch { return null; }
}

export type ReadableCodeCommand = Readonly<
  { kind: "assign"; code: string; linkId: string; key: string }
  | { kind: "reassign"; code: string; expectedLinkId: string; linkId: string; reason: string; key: string }
>;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => record(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
export function isReadableAlias(value: unknown): value is RecommendationReadableAlias {
  if (!exact(value, ["code", "assignedAt", "link"]) || typeof value.code !== "string" || normalizeReadableReferralCode(value.code) !== value.code || !timestamp(value.assignedAt)) return false;
  const link = value.link;
  return exact(link, ["id", "url", "destinationPath", "state", "createdAt", "expiresAt", "revokedAt", "opens", "accountsLinked"])
    && typeof link.id === "string" && uuid.test(link.id)
    && safeReferralDestination(link.destinationPath) !== null
    && (link.url === null || typeof link.url === "string")
    && ["ready", "revoked", "expired", "partner_inactive", "unavailable"].includes(String(link.state))
    && timestamp(link.createdAt) && timestamp(link.expiresAt) && (link.revokedAt === null || timestamp(link.revokedAt))
    && typeof link.opens === "number" && Number.isSafeInteger(link.opens) && link.opens >= 0
    && typeof link.accountsLinked === "number" && Number.isSafeInteger(link.accountsLinked) && link.accountsLinked >= 0;
}
export function validReadableCodeCommand(command: ReadableCodeCommand): boolean {
  return exact(command, command.kind === "assign" ? ["kind", "code", "linkId", "key"] : ["kind", "code", "expectedLinkId", "linkId", "reason", "key"])
    && typeof command.code === "string" && normalizeReadableReferralCode(command.code) === command.code && uuid.test(command.linkId) && uuid.test(command.key)
    && (command.kind === "assign" || (command.kind === "reassign" && uuid.test(command.expectedLinkId) && command.expectedLinkId !== command.linkId
      && typeof command.reason === "string" && command.reason === command.reason.trim()
      && command.reason.length >= 3 && command.reason.length <= 200 && !/[\x00-\x1f\x7f]/.test(command.reason)));
}
type AliasOptions = { current: () => boolean; signal?: AbortSignal };
const obsolete = { kind: "error", status: 0, code: "operation_retired" } as const;
/** No implicit Auth lookup, anonymous fallback, redirect, or automatic retry. */
async function aliasRequest(path: string, token: string, options: AliasOptions, body?: unknown, key?: string, csrf?: string): Promise<RecommendationResult<unknown>> {
  if (!options.current() || options.signal?.aborted) return obsolete;
  try {
    const response = await fetch(path, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      redirect: "error", referrerPolicy: "no-referrer", signal: options.signal,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(key ? { "Idempotency-Key": key } : {}),
        ...(csrf ? { "X-Xenios-Referral-CSRF": csrf } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!options.current() || options.signal?.aborted) return obsolete;
    const payload: unknown = await response.json().catch(() => null);
    if (!options.current() || options.signal?.aborted) return obsolete;
    if (!response.ok) return { kind: "error", status: response.status, code: "request_rejected" };
    return { kind: "ok", data: payload };
  } catch { return options.current() ? { kind: "error", status: 0, code: "connection_failed" } : obsolete; }
}
async function boundedAlias<T>(options: AliasOptions, action: (bounded: AliasOptions) => Promise<RecommendationResult<T>>): Promise<RecommendationResult<T>> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<RecommendationResult<T>>(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ kind: "error", status: 0, code: "connection_failed" }); }, 30_000); });
  try { return await Promise.race([action({ current: options.current, signal: controller.signal }), timeout]); }
  finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
}
export async function listReadableAliases(token: string, options: AliasOptions): Promise<RecommendationResult<RecommendationReadableAlias[]>> {
  if (!readableAliasSession(token)) return signedOut;
  return boundedAlias<RecommendationReadableAlias[]>(options, async bounded => {
    const result = await aliasRequest(REFERRAL_API.readableAliases, token, bounded);
    if (result.kind === "error") return result;
    const data = result.data;
    if (!exact(data, ["ok", "aliases"]) || data.ok !== true || !Array.isArray(data.aliases) || !data.aliases.every(isReadableAlias)
      || new Set(data.aliases.map(alias => alias.code)).size !== data.aliases.length
      || new Set(data.aliases.map(alias => alias.link.id)).size !== data.aliases.length) return { kind: "error", status: 0, code: "invalid_response" };
    return { kind: "ok", data: data.aliases };
  });
}
export async function mutateReadableAlias(token: string, command: ReadableCodeCommand, options: AliasOptions): Promise<RecommendationResult<true>> {
  if (!readableAliasSession(token)) return signedOut;
  if (!validReadableCodeCommand(command)) return { kind: "error", status: 400, code: "invalid_input" };
  // Bootstrap the existing signed visitor cookie explicitly, for every attempt.
  // The caller freezes command + key; the CSRF value is never the command identity.
  return boundedAlias<true>(options, async bounded => {
    const bootstrap = await aliasRequest(REFERRAL_API.bootstrap, token, bounded, {});
    if (bootstrap.kind === "error") return bootstrap;
    if (!exact(bootstrap.data, ["ok", "csrfToken"]) || bootstrap.data.ok !== true
      || typeof bootstrap.data.csrfToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(bootstrap.data.csrfToken)) return { kind: "error", status: 0, code: "invalid_response" };
    const { kind, key, ...body } = command;
    const result = await aliasRequest(kind === "assign" ? REFERRAL_API.readableAliases : REFERRAL_API.reassignReadableAlias,
      token, bounded, body, key, bootstrap.data.csrfToken);
    if (result.kind === "error") return result;
    const value = result.data;
    const valid = kind === "assign"
      ? exact(value, ["ok", "alias", "created"]) && value.ok === true && typeof value.created === "boolean"
      : exact(value, ["ok", "alias", "previousLinkId", "reassignedAt", "replayed"]) && value.ok === true
        && value.previousLinkId === (command as Extract<ReadableCodeCommand, { kind: "reassign" }>).expectedLinkId
        && timestamp(value.reassignedAt) && typeof value.replayed === "boolean";
    if (!valid || !record(value) || !isReadableAlias(value.alias) || value.alias.code !== command.code || value.alias.link.id !== command.linkId)
      return { kind: "error", status: 0, code: "invalid_response" };
    // A receipt is not the current alias target. The UI must refetch the list.
    return { kind: "ok", data: true };
  });
}

/** Do not expose arbitrary upstream messages, identifiers or response bodies. */
export function recommendationError(result: { status: number; code: string }): string {
  if (result.status === 401) return "Your session has ended. Sign in again to continue.";
  if (result.status === 403) return "This account is not authorized to manage referral links. Access is checked by Xenios.";
  if (result.status === 429) return "Too many requests. Wait a moment before trying again.";
  if (result.status === 409) return "This link changed or the request conflicts with an earlier action. Refresh the list before trying again.";
  if (result.status === 503 || result.status === 404) return "The recommendation service is not available right now. Please try again later.";
  return "We could not confirm the result. Retry the same action to check it safely, or contact support.";
}
