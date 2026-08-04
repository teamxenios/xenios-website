import { careApiFetch } from "./api";

/**
 * The loader behind the four patient service surfaces: instructions, supplies,
 * messages, and support.
 *
 * These four addresses are declared in `CARE_ROUTE_CONTRACTS` in
 * `shared/care/contracts.ts`, which is the only contract these pages are built
 * against. On this release no handler is registered for any of them, so the
 * API 404 guard in `server/index.ts` answers each one with a JSON 404. That is
 * a distinct fact from "you have none of these", and it is the reason
 * `not_served` exists as its own state rather than collapsing into `error` or,
 * far worse, into an empty list.
 *
 * A surface that answers "no instructions" when the truth is "nothing here can
 * read an instruction" is the failure this whole module is shaped to prevent.
 * Every state below is a different sentence a patient can act on:
 *
 * - `loading`      the read is in flight and nothing is claimed yet
 * - `not_served`   the address exists, this release answers nothing there
 * - `disabled`     Care itself is switched off, in the server's own words
 * - `auth_required` nobody is signed in
 * - `forbidden`    signed in, without the permission this surface needs
 * - `error`        something failed, and nothing is claimed about the records
 * - `ready`        a response the page was able to trust completely
 *
 * `ready` still carries a storage state, because a served route can report
 * that the table behind it does not exist. That case is again not "you have
 * none", and the pages say so.
 *
 * This module deliberately does not import from any branch-local shared
 * contract. It reads only `shared/care/contracts.ts`, which is on main, so
 * these surfaces compile and render honestly today and begin returning records
 * the moment the handlers land.
 */

export type CarePatientSurfaceState<T> =
  | { kind: "loading" }
  | { kind: "not_served"; contract: string }
  | { kind: "disabled"; message: string }
  | { kind: "auth_required" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; data: T };

/**
 * Whether the record behind a read exists at all.
 *
 * Shaped to match what the served handlers report, and validated rather than
 * assumed: a response that omits it, or sends something else in its place, is
 * treated as storage whose state is unknown, which the pages render as unknown
 * rather than as available.
 */
export interface CareSurfaceStorage {
  available: boolean;
  missingTables: readonly string[];
}

export const CARE_SURFACE_STORAGE_UNKNOWN: CareSurfaceStorage = {
  available: false,
  missingTables: [],
};

export function isCareSurfaceStorage(value: unknown): value is CareSurfaceStorage {
  const storage = value as Partial<CareSurfaceStorage> | null;
  return (
    typeof storage === "object" &&
    storage !== null &&
    typeof storage.available === "boolean" &&
    Array.isArray(storage.missingTables) &&
    storage.missingTables.every((table) => typeof table === "string")
  );
}

export function readStorage(body: Record<string, unknown>): CareSurfaceStorage {
  return isCareSurfaceStorage(body.storage)
    ? { available: body.storage.available, missingTables: [...body.storage.missingTables] }
    : CARE_SURFACE_STORAGE_UNKNOWN;
}

/**
 * Care transmits nothing.
 *
 * This sentence is written here, in the browser, rather than taken from the
 * response, because a page must never be able to tell a patient that something
 * was sent on the strength of a field a server sent it. If a future response
 * ever claimed transmission was enabled, these surfaces would still say
 * nothing is sent, and that is the safe direction to be wrong in.
 */
export const CARE_NO_TRANSMISSION_NOTICE =
  "Nothing written here is sent anywhere. Care has no way to deliver a message: no email, no text message, and no notification goes to you, to a clinician, or to anyone else. What you write is recorded so a person can read it later, and nobody has been told it exists.";

export const CARE_EMERGENCY_NOTICE =
  "This is not emergency care and nobody is watching this page. If this may be an emergency, contact local emergency services now.";

/**
 * Plain wording for a read that was served but whose backing record is absent.
 */
export function storageMissingExplanation(
  storage: CareSurfaceStorage,
  subject: string,
): string {
  const named =
    storage.missingTables.length > 0
      ? ` The missing record is named ${storage.missingTables.join(", ")}.`
      : "";
  return `${subject} cannot be shown, because the record that would hold it does not exist yet.${named} This does not mean you have none. Nothing is being hidden from you, and nothing has been recorded.`;
}

/** Plain wording for an address this release answers nothing at. */
export function notServedExplanation(contract: string, subject: string): string {
  return `${subject} cannot be shown, because this release answers nothing at ${contract}. The address is part of the Care contract and this page is already built against it, so this surface will start showing records as soon as it is served. Until then this is not an empty list, and nothing about your own records is being claimed here.`;
}

/**
 * `parse` returns null for any body the page cannot completely trust, which
 * becomes the error state. A response is never partially believed.
 */
export async function loadCarePatientSurface<T>(
  contract: string,
  parse: (body: Record<string, unknown>) => T | null,
): Promise<CarePatientSurfaceState<T>> {
  try {
    const response = await careApiFetch(contract);
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.status === 404) return { kind: "not_served", contract };
    if (response.status === 401) return { kind: "auth_required" };
    if (response.status === 403) return { kind: "forbidden" };
    if (response.status === 503 && body.code === "care_disabled") {
      return {
        kind: "disabled",
        message:
          typeof body.message === "string" && body.message.length > 0
            ? body.message
            : "Care is being prepared.",
      };
    }
    if (!response.ok || body.ok !== true) return { kind: "error" };
    const data = parse(body);
    return data === null ? { kind: "error" } : { kind: "ready", data };
  } catch {
    return { kind: "error" };
  }
}

/**
 * The outcome of writing a record.
 *
 * `recorded` is the only success, and its wording everywhere is "recorded",
 * never "sent". There is no state here that means delivered, because no such
 * thing happens.
 */
export type CareRecordWriteState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "recorded" }
  | { kind: "not_served"; contract: string }
  | { kind: "not_recorded"; message: string; missingTables: readonly string[] }
  | { kind: "refused"; message: string }
  | { kind: "invalid" }
  | { kind: "auth_required" }
  | { kind: "forbidden" }
  | { kind: "disabled"; message: string }
  | { kind: "error" };

function refusalMessage(body: Record<string, unknown>, fallback: string): string {
  return typeof body.message === "string" && body.message.length > 0
    ? body.message
    : fallback;
}

function missingTables(body: Record<string, unknown>): readonly string[] {
  return Array.isArray(body.missingTables)
    ? body.missingTables.filter((table): table is string => typeof table === "string")
    : [];
}

/**
 * Write a record, and believe it was written only when the server returns a
 * record. Anything else is reported to the patient as not recorded.
 */
export async function recordCarePatientEntry(
  contract: string,
  payload: Record<string, unknown>,
  confirms: (body: Record<string, unknown>) => boolean,
): Promise<CareRecordWriteState> {
  try {
    const response = await careApiFetch(contract, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.status === 404) return { kind: "not_served", contract };
    if (response.status === 401) return { kind: "auth_required" };
    if (response.status === 400) return { kind: "invalid" };
    if (response.status === 403) {
      return body.code === "care_forbidden"
        ? { kind: "forbidden" }
        : {
            kind: "refused",
            message: refusalMessage(
              body,
              "This was not recorded and nobody will see it. Start again rather than assuming it was kept.",
            ),
          };
    }
    if (response.status === 503) {
      if (body.code === "care_disabled") {
        return {
          kind: "disabled",
          message: refusalMessage(body, "Care is being prepared."),
        };
      }
      return {
        kind: "not_recorded",
        message: refusalMessage(
          body,
          "This was not recorded and nobody will see it. Nothing here can hold it yet.",
        ),
        missingTables: missingTables(body),
      };
    }
    if (!response.ok || body.ok !== true || !confirms(body)) return { kind: "error" };
    return { kind: "recorded" };
  } catch {
    return { kind: "error" };
  }
}

/**
 * A per-submission key, so a retry after a timeout cannot record the same
 * entry twice. The served write schemas require at least eight characters.
 */
export function newIdempotencyKey(): string {
  const api = globalThis.crypto as Crypto | undefined;
  if (typeof api?.randomUUID === "function") return api.randomUUID();
  if (typeof api?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    api.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `care-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** A readable label for a value the server may extend without telling us. */
export function labelFor<T extends string>(
  labels: Readonly<Record<T, string>>,
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" && value in labels
    ? labels[value as T]
    : fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
