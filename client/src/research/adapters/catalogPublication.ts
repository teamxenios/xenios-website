import { newMutationKey } from "./productAdmin";
import { apiGet } from "../lib/api";
import { validEditorHead } from "../pages/adminx/publicationEditor";
import type { CandidatePreview, CommandBody, CommandResult, EditorHead, EditorPort, PublicationOperation, ReadResult } from "../pages/adminx/publicationEditor";

const UUID = /^(?!00000000-0000-0000-0000-000000000000$)[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const CONFLICTS = new Set(["publication_generation_conflict", "source_version_conflict", "publication_source_version_conflict", "publication_idempotency_conflict", "publication_already_current", "publication_not_previously_published", "publication_not_published"]);
const REFUSALS = new Set(["invalid_shape", "invalid_identity", "invalid_selection", "invalid_revision", "invalid_generation", "invalid_idempotency_key", "reason_required"]);

/** Same-origin bearer/no-store discipline as the existing ProductAdmin client.
 * GET is bound to the selected5a7e67fc contract, not a claim that the backend
 * exists. Missing, denied or malformed reads stay closed and never default0.
 * No actor, approval, storage locator or offering ID is sent from the browser.
 */
export function createCatalogPublicationPort(token: string, productId: string, variantId: string,
  readCurrent?: () => Promise<ReadResult<EditorHead>>): EditorPort {
  if (!token || !UUID.test(productId) || !UUID.test(variantId) || (readCurrent !== undefined && typeof readCurrent !== "function")) throw new Error("publication_client_scope_required");
  const base = `/api/admin/research/products/${productId}/variants/${variantId}/catalog-publication`;
  async function post(operation: string, body: unknown, key?: string): Promise<{ status: number; data: unknown } | null> {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(`${base}/${operation}`, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: abort.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(key === undefined ? {} : { "Idempotency-Key": key }) }, body: JSON.stringify(body) });
      if (response.status === 401 || response.status === 403) return { status: response.status, data: null };
      if (!(response.headers.get("Content-Type") ?? "").toLowerCase().includes("application/json") || !response.body) return null;
      reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let bytes = 0;
      for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 128 * 1024) return null; chunks.push(part.value); }
      const raw = new Uint8Array(bytes); let at = 0; for (const chunk of chunks) { raw.set(chunk, at); at += chunk.length; }
      return { status: response.status, data: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)) };
    } catch { return null; }
    finally {
      clearTimeout(timer); abort.abort();
      try { if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); } } catch { /* Original result remains authoritative. */ }
    }
  }
  return {
    readCurrent: readCurrent ?? (() => readCatalogPublicationHead(token, productId, variantId)),
    newKey: () => newMutationKey("catalog-publication"),
    async preview(mediaId: string): Promise<ReadResult<CandidatePreview>> {
      if (!UUID.test(mediaId)) return { kind: "unavailable" };
      const reply = await post("preview", { mediaId });
      if (reply?.status === 401 || reply?.status === 403) return { kind: "denied" };
      return reply?.status === 200 && reply.data && typeof reply.data === "object" ? { kind: "ok", data: reply.data as CandidatePreview } : { kind: "unavailable" };
    },
    async command(operation: PublicationOperation, body: CommandBody, key: string): Promise<CommandResult> {
      if (!["seal", "publish", "withdraw", "rollback"].includes(operation) || typeof key !== "string" || !key || key.length > 200) return { kind: "refused" };
      const reply = await post(operation, body, key);
      if (!reply) return { kind: "unknown" };
      if (reply.status === 401 || reply.status === 403) return { kind: "denied" };
      if (reply.status === 200) return reply.data !== null && typeof reply.data === "object" && !Array.isArray(reply.data)
        ? { kind: "ok", data: reply.data as Extract<CommandResult, { kind: "ok" }>["data"] } : { kind: "unknown" };
      const value = reply.data as { error?: unknown; operationConfirmed?: unknown } | null;
      if (value?.operationConfirmed === false && typeof value.error === "string") {
        if (reply.status === 409 && CONFLICTS.has(value.error)) return { kind: "conflict", code: value.error };
        if (reply.status === 400 && REFUSALS.has(value.error)) return { kind: "refused", code: value.error };
      }
      return { kind: "unknown" };
    },
  };
}

/** The exact existing ProductAdmin bearer/no-store API client; no query/body,
 * browser offering identity, role, cursor or approval is supplied to this read.
 */
export async function readCatalogPublicationHead(token: string, productId: string, variantId: string): Promise<ReadResult<EditorHead>> {
  if (!token || !UUID.test(productId) || !UUID.test(variantId)) return { kind: "denied" };
  const result = await apiGet<EditorHead>(`/api/admin/research/products/${productId}/variants/${variantId}/catalog-publication`, token);
  if (result.kind === "unauthorized" || result.kind === "forbidden" || result.kind === "denied") return { kind: "denied" };
  if (result.kind !== "ok" || !validEditorHead(result.data, productId, variantId)) return { kind: "unavailable" };
  return { kind: "ok", data: result.data };
}
