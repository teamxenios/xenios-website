import type { RequestIntentDetail, RequestIntentReceipt, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import { RequestIntentError, type RequestIntentRepository, type RequestIntentStaffReader, type StoredIntent } from "./service";

export interface RequestIntentRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}
function receipt(value: unknown): RequestIntentReceipt {
  if (typeof value !== "object" || value === null) throw new RequestIntentError("invalid_persistence_result", 503);
  const row = value as Record<string, unknown>;
  if (row.kind !== "unapproved_selection_request" || row.status !== "pending_review"
    || typeof row.requestId !== "string" || typeof row.publicReference !== "string"
    || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) {
    throw new RequestIntentError("invalid_persistence_result", 503);
  }
  // Whitelist; never return an unexpected private field in a customer receipt.
  return { kind: row.kind, status: row.status, requestId: row.requestId,
    publicReference: row.publicReference, createdAt: row.createdAt };
}
function stored(value: unknown): StoredIntent {
  if (typeof value !== "object" || value === null) throw new RequestIntentError("invalid_persistence_result", 503);
  const row = value as Record<string, unknown>;
  if (typeof row.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(row.fingerprint)) {
    throw new RequestIntentError("invalid_persistence_result", 503);
  }
  return { receipt: receipt(row.receipt), fingerprint: row.fingerprint };
}
async function call(client: RequestIntentRpcClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await client.rpc(name, args);
  if (result.error) {
    if (result.error.code === "23505" && result.error.message === "request_intent_attempt_conflict") {
      throw new RequestIntentError("attempt_conflict", 409);
    }
    // Never expose provider errors, request payloads, SQL diagnostics or credentials.
    throw new RequestIntentError("request_intent_persistence_uncertain", 503);
  }
  return result.data;
}
export function requestIntentRepository(serviceRoleClient: RequestIntentRpcClient): RequestIntentRepository {
  return {
    async findAttempt(ownerHash, attemptHash) {
      const data = await call(serviceRoleClient, "request_intent_find_attempt", { p_owner_hash: ownerHash, p_attempt_hash: attemptHash });
      return data === null ? null : stored(data);
    },
    async createOrReplay(record) {
      return stored(await call(serviceRoleClient, "request_intent_create_or_replay", {
        p_owner_hash: record.ownerHash, p_attempt_hash: record.attemptHash,
        p_fingerprint: record.fingerprint, p_detail: record.detail,
      }));
    },
  };
}
/** Server-only client; pass the actor solely from requireCarePermission's verified principal. */
export function requestIntentStaffReader(serviceRoleClient: RequestIntentRpcClient): RequestIntentStaffReader {
  return {
    async list(verifiedActorSubjectId, page) {
      const data = await call(serviceRoleClient, "request_intent_staff_list", { p_actor_user_id: verifiedActorSubjectId, p_page: page });
      const row = data as RequestIntentQueuePage;
      if (!row || !Array.isArray(row.items) || !Number.isSafeInteger(row.total) || row.total < 0) {
        throw new RequestIntentError("invalid_persistence_result", 503);
      }
      return { items: row.items.map((item) => ({ ...receipt(item), lineCount: item.lineCount })),
        total: row.total, page: row.page, pageSize: row.pageSize };
    },
    async get(requestId, verifiedActorSubjectId) {
      const data = await call(serviceRoleClient, "request_intent_staff_get", {
        p_request_id: requestId, p_actor_user_id: verifiedActorSubjectId,
      });
      if (data === null) return null;
      const row = data as RequestIntentDetail;
      const publicPart = receipt(row);
      if (!row.contact || !Array.isArray(row.agreements) || !Array.isArray(row.lines)
        || row.lines.some((line) => line.reviewState !== "pending")) {
        throw new RequestIntentError("invalid_persistence_result", 503);
      }
      return { ...publicPart, contact: row.contact, agreements: row.agreements, lines: row.lines };
    },
  };
}
