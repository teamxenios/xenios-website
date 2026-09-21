// Typed API client for the Supreme frontend. One envelope, one bearer
// discipline: member-authed calls attach the member token; every call is
// no-store; failures normalize to a single shape so route boundaries render
// one honest error state. This client NEVER invents data: a missing endpoint
// (404) surfaces as { kind: "unavailable" } so pages show a pending state.

// Denial envelope (frozen by the integration coordinator, used by every
// backend lane): { ok: false, code: "<machine_code>", message? }. ROUTE ON
// CODE, NEVER ON MESSAGE (messages change, codes do not). Known codes:
// activation_required, billing_past_due, membership_inactive,
// recovery_session, commerce_disabled, large_order_review_required,
// guide_not_published.
export type ApiResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized"; code?: string }
  | { kind: "forbidden"; code?: string; message?: string }
  | { kind: "denied"; code: string; message?: string }
  | { kind: "unavailable" }
  | { kind: "error"; code?: string; message: string };

export async function apiGet<T>(path: string, token?: string | null, knownNotFoundDenials: readonly string[] = []): Promise<ApiResult<T>> {
  return request<T>("GET", path, undefined, token, knownNotFoundDenials);
}

export async function apiPost<T>(path: string, body: unknown, token?: string | null, knownNotFoundDenials: readonly string[] = []): Promise<ApiResult<T>> {
  return request<T>("POST", path, body, token, knownNotFoundDenials);
}

export async function apiPatch<T>(path: string, body: unknown, token?: string | null): Promise<ApiResult<T>> {
  return request<T>("PATCH", path, body, token);
}

export async function apiPut<T>(path: string, body: unknown, token?: string | null): Promise<ApiResult<T>> {
  return request<T>("PUT", path, body, token);
}

// DELETE sends no body unless one is explicitly given.
export async function apiDelete<T>(path: string, token?: string | null, body?: unknown): Promise<ApiResult<T>> {
  return request<T>("DELETE", path, body, token);
}

const UNUSED_BODY_BYTE_LIMIT = 64 * 1024;
const UNUSED_BODY_DRAIN_BUDGET_MS = 250;

async function releaseUnusedBody(response: Response): Promise<void> {
  // Discard a small finite body without parsing or trusting it. Cancelling a
  // normal error response aborts its transport; draining lets it finish cleanly.
  // A broken/oversized stream must not delay the already-known unavailable state.
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let completed = false;
  let stopped = false;
  try {
    if (!response.body) return;
    const bodyReader = response.body.getReader();
    reader = bodyReader;
    const startedAt = performance.now();
    const drain = async () => {
      let bytes = 0;
      // Check elapsed time inside the loop too: a stream of immediately ready
      // empty chunks must not starve the timer by perpetually queuing microtasks.
      while (!stopped && performance.now() - startedAt < UNUSED_BODY_DRAIN_BUDGET_MS) {
        const { done, value } = await bodyReader.read();
        if (done) { completed = true; return; }
        bytes += value.byteLength;
        if (bytes > UNUSED_BODY_BYTE_LIMIT) return;
      }
    };
    await Promise.race([
      drain(),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, UNUSED_BODY_DRAIN_BUDGET_MS); }),
    ]);
  } catch { /* Cleanup never changes the original response status. */ }
  finally {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    if (reader) {
      if (!completed) {
        // Underlying cancellation is allowed to stall or reject. Observe its
        // rejection, but do not wait on it before returning the original status.
        try { void reader.cancel().catch(() => {}); } catch { /* Preserve status. */ }
      }
      try { reader.releaseLock(); } catch { /* Preserve status. */ }
    }
  }
}

async function request<T>(method: string, path: string, body: unknown, token?: string | null, knownNotFoundDenials: readonly string[] = []): Promise<ApiResult<T>> {
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
    if (res.status === 401) {
      const b = await res.json().catch(() => null);
      return { kind: "unauthorized", code: b?.code };
    }
    if (res.status === 403) {
      const b = await res.json().catch(() => null);
      // A machine code makes this a routable denial, not a generic forbidden.
      if (typeof b?.code === "string") return { kind: "denied", code: b.code, message: b?.message };
      return { kind: "forbidden", message: b?.message };
    }
    if (res.status === 404 || res.status === 501 || res.status === 503) {
      // Only an explicitly opted-in endpoint's known missing-record denial
      // differs from an unpublished API. Unknown/HTML/invalid 404s and all
      // default callers retain unavailable semantics; no permission is added.
      if (res.status === 404 && knownNotFoundDenials.length > 0
        && (res.headers.get("content-type") ?? "").includes("application/json")) {
        const missing = await res.json().catch(() => null);
        if (missing?.ok === false && typeof missing.code === "string" && knownNotFoundDenials.includes(missing.code)) {
          return { kind: "denied", code: missing.code,
            ...(typeof missing.message === "string" ? { message: missing.message } : {}) };
        }
        return { kind: "unavailable" };
      }
      await releaseUnusedBody(res);
      return { kind: "unavailable" };
    }
    // An unpublished API path falls through to the SPA catch-all and returns
    // the app shell as HTML with 200 (dev AND production). That is an
    // unpublished endpoint, not an error: report unavailable so pages render
    // their designed pending states.
    const contentType = res.headers.get("content-type") ?? "";
    if (res.ok && !contentType.includes("application/json")) {
      await releaseUnusedBody(res);
      return { kind: "unavailable" };
    }
    const parsed = await res.json().catch(() => null);
    // Coordinator envelope: a body with ok:false and a machine code is a
    // routable denial regardless of HTTP status (e.g. commerce_disabled,
    // large_order_review_required, guide_not_published).
    if (parsed && parsed.ok === false && typeof parsed.code === "string") {
      return { kind: "denied", code: parsed.code, message: parsed.message };
    }
    if (!res.ok || parsed === null) {
      return { kind: "error", code: parsed?.code, message: parsed?.message ?? "Something went wrong. Please try again." };
    }
    return { kind: "ok", data: parsed as T };
  } catch {
    return { kind: "error", message: "The connection failed. Please try again." };
  }
}
