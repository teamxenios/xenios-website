// ---------------------------------------------------------------------------
// xenios research: the NATIVE e-signature atomic commit.
//
// The final legal commit is ONE database transaction that (1) verifies the
// signing request, (2) inserts the immutable legal SignatureRecord, (3)
// transitions the request to completed, and (4) upserts the archive record.
// All four commit or roll back together, so a native SignatureRecord can only
// ever exist together with its completed request. Storage uploads happen BEFORE
// this and stay outside the transaction (evidence_stored is non-activating), so
// a failed commit leaves no signature, the request not completed, and the
// activation gate unadvanced.
//
// In production this is a Supabase RPC (a Postgres function; the transaction is
// the database's). In tests and non-Supabase runs it is an in-memory function
// over the injected stores that performs the four effects as one unit, checking
// every precondition before the first write.
// ---------------------------------------------------------------------------

import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";
import { DuplicateSignature, type SignaturesStore } from "../signatures";
import type {
  ArchiveRecord,
  EsignStore,
  NativeCommitFn,
  NativeCommitInput,
  NativeCommitResult,
} from "./contracts";

async function upsertArchive(esign: EsignStore, archive: ArchiveRecord): Promise<void> {
  // Exactly one archive row per (member, version): a member signs a given
  // document version once (unique signature), so the version id is the archive's
  // natural key. This keeps a retry or a concurrent loser from adding a second
  // row even though each attempt minted its own archive id.
  const existing = await esign.archive.listByMember(archive.memberId);
  if (existing.some((a) => a.documentVersionId === archive.documentVersionId)) return;
  await esign.archive.insert(archive);
}

/**
 * The in-memory / non-Supabase atomic commit over the injected signatures and
 * esign stores. It re-verifies the request (member, exact version, exact
 * idempotency key, state evidence_stored, refs + hashes present) BEFORE any
 * write, so a precondition failure writes nothing. The whole body is SERIALIZED
 * through a promise chain (mirroring the production RPC's SELECT ... FOR UPDATE),
 * so concurrent retries run one at a time: the first commits, and every later
 * one sees the request already `completed` and replays the existing signature,
 * yielding exactly one signature, one completed request, and one archive row.
 * True cross-table rollback is provided by the Postgres transaction in
 * production (createSupabaseNativeCommit).
 */
export function createInMemoryNativeCommit(signatures: SignaturesStore, esign: EsignStore): NativeCommitFn {
  let lock: Promise<unknown> = Promise.resolve();
  const run = async (input: NativeCommitInput): Promise<NativeCommitResult> => {
    const req = await esign.requests.getById(input.completedRequest.id);
    if (!req) return { ok: false, code: "request_missing" };
    if (req.memberId !== input.memberId) return { ok: false, code: "member_mismatch" };
    if (req.idempotencyKey !== input.idempotencyKey) return { ok: false, code: "commit_error" };
    if (req.xeniosDocumentVersionIds[0] !== input.documentVersionId) {
      return { ok: false, code: "version_mismatch" };
    }
    if (req.nativeCompletionState === "completed") {
      // Already committed (a prior attempt or a concurrent winner): replay with
      // the existing signature. No second insert, no second archive row.
      const existing = await signatures.getSignature(input.memberId, input.documentVersionId);
      if (existing) return { ok: true, signature: existing, replayed: true };
      // completed row but no signature is an impossible state under this commit;
      // fall through and (re)insert so the two agree.
    } else if (req.nativeCompletionState !== "evidence_stored") {
      return { ok: false, code: "request_not_evidence_stored" };
    }
    if (!req.signedPdfRef || !req.certificateRef || !req.signedPdfHash || !req.certificateHash) {
      return { ok: false, code: "evidence_incomplete" };
    }

    // The atomic effects. Signature first (unique member+version).
    try {
      await signatures.insertSignature(input.signature);
    } catch (error) {
      if (error instanceof DuplicateSignature) {
        // A signature already exists (belt-and-suspenders under serialization).
        // The existing signature stands; bind the request + archive to it.
        const winner = await signatures.getSignature(input.memberId, input.documentVersionId);
        if (winner) {
          await esign.requests.update({ ...input.completedRequest, xeniosAcceptanceEventIds: [winner.id] });
          await upsertArchive(esign, input.archive);
          return { ok: true, signature: winner, replayed: true };
        }
      }
      return { ok: false, code: "commit_error" };
    }
    await esign.requests.update(input.completedRequest);
    await upsertArchive(esign, input.archive);
    return { ok: true, signature: input.signature, replayed: false };
  };
  return (input: NativeCommitInput): Promise<NativeCommitResult> => {
    const result = lock.then(() => run(input));
    // Keep the chain alive whatever the outcome, so one failure does not wedge it.
    lock = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

/** Row shape helpers for the RPC payload (snake_case, matching the SQL). */
function signatureRow(signature: NativeCommitInput["signature"]): Record<string, unknown> {
  return {
    id: signature.id,
    member_id: signature.memberId,
    document_version_id: signature.documentVersionId,
    category: signature.category,
    semver: signature.semver,
    content_hash: signature.contentHash,
    typed_legal_name: signature.typedLegalName,
    full_document_shown: signature.fullDocumentShown,
    affirmative_consent: signature.affirmativeConsent,
    separate_acknowledgment: signature.separateAcknowledgment,
    electronic_consent_version_id: signature.electronicConsentVersionId,
    ip_hash: signature.ipHash,
    user_agent_hash: signature.userAgentHash,
    signed_at: signature.signedAt,
  };
}

/**
 * The production atomic commit: a single Supabase RPC whose Postgres function
 * (research_fm_native_esign_commit) runs the four effects in ONE transaction.
 * The member id is passed as an explicit parameter and re-verified server-side
 * against the request; the client-supplied acting identity is never trusted.
 */
export function createSupabaseNativeCommit(
  client?: { rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
): NativeCommitFn {
  return async (input: NativeCommitInput): Promise<NativeCommitResult> => {
    const db = client ?? (getSupabaseAdmin() as unknown as NonNullable<typeof client>);
    let data: unknown;
    let error: unknown;
    try {
      ({ data, error } = await db.rpc("research_fm_native_esign_commit", {
        p_member_id: input.memberId,
        p_document_version_id: input.documentVersionId,
        p_idempotency_key: input.idempotencyKey,
        p_signature: signatureRow(input.signature),
        p_signed_at: input.signature.signedAt,
        p_signature_id: input.signature.id,
      }));
    } catch {
      return { ok: false, code: "commit_error" };
    }
    if (error) return { ok: false, code: "commit_error" };
    const result = (data ?? {}) as { ok?: boolean; code?: NativeCommitResult extends { ok: false } ? string : string; replayed?: boolean };
    if (result.ok !== true) {
      const code = (result.code as NativeCommitResult extends { ok: false } ? never : string) ?? "commit_error";
      return { ok: false, code: code as never };
    }
    return { ok: true, signature: input.signature, replayed: result.replayed === true };
  };
}

/** Supabase RPC when configured, else the in-memory commit over the given stores. */
export function resolveNativeCommit(signatures: SignaturesStore, esign: EsignStore): NativeCommitFn {
  return supabaseConfigured() ? createSupabaseNativeCommit() : createInMemoryNativeCommit(signatures, esign);
}
