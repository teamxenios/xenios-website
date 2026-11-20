import { z } from "zod";
import { ACCOUNT_MANAGEMENT_PATHS, ACCOUNT_SETTINGS_PATH, accountManagementConfigSchema, accountIdentityReplySchema,
  accountRegistrationSchema, accountRegistrationReplySchema, accountManagementErrorSchema,
  accountSelfMutationSchema, accountSelfMutationReplySchema, accountReauthenticateReplySchema,
  type AccountRegistration, type AccountSelfMutation } from "@shared/research/account-management";

export class AccountApiError extends Error {
  constructor(readonly code: string, readonly status = 503) { super("The account operation could not be confirmed."); }
}
async function boundedJson(response: Response): Promise<unknown> {
  const maximum = 16384;
  if (Number(response.headers?.get("content-length")) > maximum) throw new AccountApiError("account_unavailable");
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maximum) throw new AccountApiError("account_unavailable");
    return JSON.parse(text);
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximum) { await reader.cancel(); throw new AccountApiError("account_unavailable"); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}
export function createAccountManagementApi(fetcher: typeof fetch = (input, init) => fetch(input, init)) {
  async function call<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
    try {
      const response = await fetcher(path, { ...init, credentials: "same-origin", cache: "no-store" });
      const raw = await boundedJson(response);
      if (!response.ok) {
        const error = accountManagementErrorSchema.safeParse(raw);
        throw new AccountApiError(error.success ? error.data.code : "account_unavailable", response.status);
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new AccountApiError("account_unavailable");
      return parsed.data;
    } catch (error) {
      if (error instanceof AccountApiError) throw error;
      throw new AccountApiError("account_unavailable");
    }
  }
  return {
    async config() {
      const config = await call(ACCOUNT_MANAGEMENT_PATHS.config, accountManagementConfigSchema);
      if (config.confirmationRedirect) {
        const url = new URL(config.confirmationRedirect);
        if (url.origin !== window.location.origin || url.pathname !== "/research/sign-in" || url.hash
          || url.username || url.password || url.searchParams.get("returnTo") !== ACCOUNT_SETTINGS_PATH
          || [...url.searchParams.keys()].join(",") !== "returnTo") throw new AccountApiError("account_unavailable");
      }
      if ((config.registrationEnabled || config.selfEditsEnabled) && !config.confirmationRedirect) throw new AccountApiError("account_unavailable");
      return config;
    },
    async identity(token: string) {
      if (!token || token.length > 16384 || /[\r\n]/u.test(token)) throw new AccountApiError("authentication_required", 401);
      return (await call(ACCOUNT_MANAGEMENT_PATHS.identity, accountIdentityReplySchema, { headers: { Authorization: `Bearer ${token}` } })).identity;
    },
    register(input: AccountRegistration) {
      const parsed = accountRegistrationSchema.safeParse(input);
      if (!parsed.success) return Promise.reject(new AccountApiError("invalid_input", 400));
      return call(ACCOUNT_MANAGEMENT_PATHS.register, accountRegistrationReplySchema, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
    },
    async mutate(token: string, input: AccountSelfMutation) {
      if (!token || token.length > 16384 || /[\r\n]/u.test(token)) return Promise.reject(new AccountApiError("authentication_required", 401));
      const parsed = accountSelfMutationSchema.safeParse(input);
      if (!parsed.success) return Promise.reject(new AccountApiError("invalid_input", 400));
      const reply = await call(ACCOUNT_MANAGEMENT_PATHS.identity, accountSelfMutationReplySchema, { method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (reply.operation !== parsed.data.operation) throw new AccountApiError("account_outcome_unconfirmed");
      return reply;
    },
    reauthenticate(token: string) {
      if (!token || token.length > 16384 || /[\r\n]/u.test(token)) return Promise.reject(new AccountApiError("authentication_required", 401));
      return call(ACCOUNT_MANAGEMENT_PATHS.reauthenticate, accountReauthenticateReplySchema, { method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
    },
  };
}
export const accountManagementApi = createAccountManagementApi();
