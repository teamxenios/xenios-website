// Typed API client for the Supreme frontend. One envelope, one bearer
// discipline: member-authed calls attach the member token; every call is
// no-store; failures normalize to a single shape so route boundaries render
// one honest error state. This client NEVER invents data: a missing endpoint
// (404) surfaces as { kind: "unavailable" } so pages show a pending state.

export type ApiResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized" }
  | { kind: "forbidden"; message?: string }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

export async function apiGet<T>(path: string, token?: string | null): Promise<ApiResult<T>> {
  return request<T>("GET", path, undefined, token);
}

export async function apiPost<T>(path: string, body: unknown, token?: string | null): Promise<ApiResult<T>> {
  return request<T>("POST", path, body, token);
}

async function request<T>(method: string, path: string, body: unknown, token?: string | null): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 401) return { kind: "unauthorized" };
    if (res.status === 403) {
      const b = await res.json().catch(() => null);
      return { kind: "forbidden", message: b?.message };
    }
    if (res.status === 404 || res.status === 501 || res.status === 503) return { kind: "unavailable" };
    const parsed = await res.json().catch(() => null);
    if (!res.ok || parsed === null) {
      return { kind: "error", message: parsed?.message ?? "Something went wrong. Please try again." };
    }
    return { kind: "ok", data: parsed as T };
  } catch {
    return { kind: "error", message: "The connection failed. Please try again." };
  }
}
