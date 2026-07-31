import type { CareStorageState } from "@shared/care/safety";
import { careApiFetch } from "./api";

/**
 * The states a Care read can be in, and one loader that produces them.
 *
 * Both of the surfaces added with the labs and adverse event handlers show the
 * same set: checking, not signed in, not permitted, being prepared, temporarily
 * unavailable, or ready. Sharing the loader keeps them from drifting into
 * different answers for the same server response, and keeps every unexpected
 * response failing closed rather than rendering as "you have nothing".
 */
export type CareReadState<T> =
  | { kind: "loading" }
  | { kind: "disabled"; message: string }
  | { kind: "auth_required" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; data: T };

export function isCareStorageState(value: unknown): value is CareStorageState {
  const storage = value as Partial<CareStorageState> | null;
  return (
    typeof storage === "object" &&
    storage !== null &&
    typeof storage.available === "boolean" &&
    Array.isArray(storage.missingTables)
  );
}

/**
 * `parse` returns null for any body the page cannot trust, which becomes the
 * error state. A response is never partially believed.
 */
export async function loadCareRead<T>(
  path: string,
  parse: (body: Record<string, unknown>) => T | null,
): Promise<CareReadState<T>> {
  try {
    const response = await careApiFetch(path);
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (response.status === 401) return { kind: "auth_required" };
    if (response.status === 403) return { kind: "forbidden" };
    if (response.status === 503 && body?.code === "care_disabled") {
      return {
        kind: "disabled",
        message:
          typeof body.message === "string" && body.message.length > 0
            ? body.message
            : "Care is being prepared.",
      };
    }
    if (!response.ok || body?.ok !== true) return { kind: "error" };
    const data = parse(body);
    return data === null ? { kind: "error" } : { kind: "ready", data };
  } catch {
    return { kind: "error" };
  }
}

/** Plain wording for a read whose backing record does not exist yet. */
export function storageMissingExplanation(
  storage: CareStorageState,
  subject: string,
): string {
  return `${subject} cannot be shown because the record that would hold it does not exist yet (${storage.missingTables.join(", ")}). Nothing is being hidden from you, and nothing has been recorded.`;
}
