import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";
import type {
  EsignStore,
  NativeClaimFn,
  NativeClaimInput,
  NativeClaimResult,
  SigningRequestRecord,
} from "./contracts";

function preparingRecord(input: NativeClaimInput, createdAt = input.createdAt): SigningRequestRecord {
  return {
    id: input.requestId,
    memberId: input.memberId,
    packetOrDocumentId: input.documentVersionId,
    mode: "esign_document",
    provider: "xenios_native",
    providerTemplateId: null,
    providerTemplateVersion: null,
    providerDocumentId: null,
    xeniosDocumentVersionIds: [input.documentVersionId],
    sourceContentHashes: [input.sourceContentHash],
    signerIdentifier: input.signerIdentifier,
    signingLinkStatus: "created",
    nativeCompletionState: "preparing",
    nativeIntentHash: input.nativeIntentHash,
    nativeAttemptId: input.nativeAttemptId,
    nativeAttemptExpiresAt: input.attemptExpiresAt,
    viewedAt: null,
    signedAt: null,
    completedAt: null,
    declinedAt: null,
    expiredAt: null,
    signedPdfRef: null,
    certificateRef: null,
    signedPdfHash: null,
    certificateHash: null,
    verifiedEventIds: [],
    providerEventHistory: [],
    xeniosAcceptanceEventIds: [],
    idempotencyKey: input.idempotencyKey,
    createdAt,
    updatedAt: input.createdAt,
  };
}

/** Serialized reference implementation for tests and unconfigured local runs. */
export function createInMemoryNativeClaim(esign: EsignStore): NativeClaimFn {
  let lock: Promise<unknown> = Promise.resolve();
  const run = async (input: NativeClaimInput): Promise<NativeClaimResult> => {
    const byKey = await esign.requests.getByIdempotencyKey(input.memberId, input.idempotencyKey);
    if (byKey) {
      if (
        byKey.xeniosDocumentVersionIds[0] !== input.documentVersionId ||
        (byKey.nativeIntentHash && byKey.nativeIntentHash !== input.nativeIntentHash)
      ) return { ok: false, code: "idempotency_conflict" };
      if (byKey.nativeCompletionState === "completed") {
        return { ok: true, claimed: false, code: "already_completed", requestId: byKey.id, createdAt: byKey.createdAt };
      }
      const expired = Boolean(
        byKey.nativeAttemptExpiresAt &&
        new Date(byKey.nativeAttemptExpiresAt).getTime() <= new Date(input.createdAt).getTime(),
      );
      if (byKey.nativeCompletionState !== "failed_cleanup_required" && !expired) {
        return { ok: false, code: "in_progress" };
      }
      const retry = preparingRecord({ ...input, requestId: byKey.id }, byKey.createdAt);
      await esign.requests.update(retry);
      return { ok: true, claimed: true, requestId: retry.id, createdAt: retry.createdAt };
    }

    const sameVersion = (await esign.requests.listByMember(input.memberId)).find(
      (record) =>
        record.provider === "xenios_native" &&
        record.xeniosDocumentVersionIds[0] === input.documentVersionId &&
        ["preparing", "evidence_stored", "completed"].includes(record.nativeCompletionState ?? ""),
    );
    if (sameVersion) {
      if (sameVersion.nativeCompletionState === "completed") {
        return {
          ok: true,
          claimed: false,
          code: "already_completed",
          requestId: sameVersion.id,
          createdAt: sameVersion.createdAt,
        };
      }
      const expired = Boolean(
        sameVersion.nativeAttemptExpiresAt &&
        new Date(sameVersion.nativeAttemptExpiresAt).getTime() <= new Date(input.createdAt).getTime(),
      );
      if (!expired) return { ok: false, code: "in_progress" };
      await esign.requests.markNativeAttemptFailed({
        ...sameVersion,
        nativeCompletionState: "failed_cleanup_required",
        updatedAt: input.createdAt,
      });
    }

    await esign.requests.insert(preparingRecord(input));
    return { ok: true, claimed: true, requestId: input.requestId, createdAt: input.createdAt };
  };

  return (input) => {
    const result = lock.then(() => run(input));
    lock = result.then(() => undefined, () => undefined);
    return result;
  };
}

export function createSupabaseNativeClaim(
  client?: { rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
): NativeClaimFn {
  return async (input) => {
    const db = client ?? (getSupabaseAdmin() as unknown as NonNullable<typeof client>);
    try {
      const { data, error } = await db.rpc("research_fm_native_esign_claim", {
        p_request_id: input.requestId,
        p_attempt_id: input.nativeAttemptId,
        p_intent_hash: input.nativeIntentHash,
        p_member_id: input.memberId,
        p_document_version_id: input.documentVersionId,
        p_source_content_hash: input.sourceContentHash,
        p_idempotency_key: input.idempotencyKey,
        p_signer_identifier: input.signerIdentifier,
        p_created_at: input.createdAt,
        p_attempt_expires_at: input.attemptExpiresAt,
      });
      if (error) return { ok: false, code: "claim_error" };
      const result = (data ?? {}) as Record<string, unknown>;
      if (result.ok !== true) {
        const code = result.code;
        return {
          ok: false,
          code: code === "idempotency_conflict" || code === "in_progress" ? code : "claim_error",
        };
      }
      const requestId = typeof result.request_id === "string" ? result.request_id : input.requestId;
      const createdAt = typeof result.created_at === "string" ? result.created_at : input.createdAt;
      if (result.code === "already_completed") {
        return { ok: true, claimed: false, code: "already_completed", requestId, createdAt };
      }
      return { ok: true, claimed: true, requestId, createdAt };
    } catch {
      return { ok: false, code: "claim_error" };
    }
  };
}

export function resolveNativeClaim(esign: EsignStore): NativeClaimFn {
  return supabaseConfigured() ? createSupabaseNativeClaim() : createInMemoryNativeClaim(esign);
}
