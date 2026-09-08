/** Member-token transport. No identity, response or credentials are persisted. */
export class WorkspaceError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); this.name = "WorkspaceError"; }
}
export function workspaceErrorMessage(error: unknown): string {
  if (error instanceof WorkspaceError) {
    if (error.status === 401) return "Your session ended. Sign in again.";
    if (error.status === 403 || error.status === 404) return "This account does not have access to that record.";
    if (error.status === 409) return "This record changed. Refresh and review the latest version before trying again.";
    if (error.status === 428) return "Complete your account security requirements before continuing.";
    if (error.status === 429) return "Too many attempts. Wait before trying again.";
    if (error.status === 400) return "Check the entered fields and try again.";
  }
  return "The request could not be confirmed. Refresh to check its result before making a new request.";
}
export async function workspaceRequest<T>(path: string, token: string, options: { method?: "GET" | "POST" | "PATCH"; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  if (!token) throw new WorkspaceError("AUTH_REQUIRED", 401);
  if (!path.startsWith("/api/") || /[\\\r\n]/.test(path) || path.startsWith("//")) throw new WorkspaceError("INVALID_PATH", 400);
  const response = await fetch(path, {
    method: options.method ?? "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: options.signal,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(options.body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  let data: unknown;
  try { data = await response.json(); } catch { throw new WorkspaceError("INVALID_RESPONSE", 503); }
  if (!response.ok || !data || typeof data !== "object" || (data as { ok?: boolean }).ok !== true) {
    throw new WorkspaceError("REQUEST_REFUSED", response.status >= 400 ? response.status : 503);
  }
  return data as T;
}
/** A generation fence invalidates old callbacks synchronously on identity change. */
export class PrincipalFence {
  private generation = 0;
  private identity: string | null = null;
  private disposed = false;
  bind(identity: string | null): void { if (this.identity !== identity) { this.identity = identity; this.generation++; } }
  ticket(): () => boolean {
    const generation = this.generation, identity = this.identity;
    return () => !this.disposed && identity !== null && generation === this.generation && identity === this.identity;
  }
  invalidate(): void { this.generation++; }
  dispose(): void { this.disposed = true; this.generation++; }
}
export function operationKey(): string {
  if (!globalThis.crypto?.randomUUID) throw new WorkspaceError("SECURE_RANDOM_UNAVAILABLE", 503);
  return globalThis.crypto.randomUUID();
}
