import { createHash } from "node:crypto";

import type {
  EarlyAccessProofReservation,
  EarlyAccessProofStorage,
} from "../routes/ports";
import {
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "./executor";

/**
 * The durable private proof storage.
 *
 * What "storage" means here is exactly what the port says it means: BYTES
 * NEVER PASS THROUGH THIS PROCESS. A reservation validates the stated
 * metadata (type, size, digest), records it against a PRIVATE bucket, and
 * returns an opaque handle. The bucket has no policies and is not public, so
 * no supplier, affiliate, or anonymous path to an object exists, and no
 * public URL can be minted. A preview for the verifying admin is a
 * short-lived signed URL produced by the injected signer, never a stored
 * link.
 *
 * The handle derivation matches the synthetic default exactly
 * (`eaproof.<sha256(objectKey)[0:40]>`), so a deployment that upgrades from
 * synthetic to durable does not change the shape of any stored record.
 */

export const EARLY_ACCESS_PROOF_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

/** 25 MiB. The database constraint states the same number. */
export const EARLY_ACCESS_PROOF_MAX_BYTES = 26_214_400;

export const EARLY_ACCESS_PROOF_BUCKET_DEFAULT =
  "research-ea-payment-proofs-production";

const SHA256_HEX = /^[a-f0-9]{64}$/;

const RESERVE_RPC = "research_early_access_reserve_proof_object";

export type EarlyAccessProofPreviewSigner = (
  input: Readonly<{ bucketId: string; objectKey: string; expiresInSeconds: number }>,
) => Promise<string | null>;

export type SupabaseEarlyAccessProofStorageOptions = Readonly<{
  query: EarlyAccessPersistenceQuery;
  bucketId?: string;
  /**
   * Optional signer for a short-lived admin preview. Injected so this module
   * never touches the storage client or a credential. Absent, previews are
   * simply unavailable; nothing else changes.
   */
  signPreviewUrl?: EarlyAccessProofPreviewSigner;
}>;

export class SupabaseEarlyAccessProofStorage implements EarlyAccessProofStorage {
  private readonly query: EarlyAccessPersistenceQuery;
  private readonly bucketId: string;
  private readonly signPreviewUrl: EarlyAccessProofPreviewSigner | null;

  constructor(options: SupabaseEarlyAccessProofStorageOptions) {
    this.query = options.query;
    this.bucketId =
      typeof options.bucketId === "string" && options.bucketId.length > 0
        ? options.bucketId
        : EARLY_ACCESS_PROOF_BUCKET_DEFAULT;
    this.signPreviewUrl = options.signPreviewUrl ?? null;
  }

  /**
   * Reserve a private object. Null is the port's refusal: a repeated object
   * key, an unlisted content type, an implausible size, or a malformed
   * digest all answer null, and the route refuses the proof truthfully.
   */
  async reserve(input: EarlyAccessProofReservation): Promise<string | null> {
    if (!isAllowedContentType(input.contentType)) return null;
    if (
      !Number.isSafeInteger(input.byteSize) ||
      input.byteSize <= 0 ||
      input.byteSize > EARLY_ACCESS_PROOF_MAX_BYTES
    ) {
      return null;
    }
    if (typeof input.sha256 !== "string" || !SHA256_HEX.test(input.sha256)) return null;
    if (typeof input.objectKey !== "string" || input.objectKey.length === 0) return null;

    const storageRef = earlyAccessProofStorageRef(input.objectKey);
    const raw = await runEarlyAccessCall(this.query, {
      fn: RESERVE_RPC,
      args: {
        p_storage_ref: storageRef,
        p_bucket_id: this.bucketId,
        p_object_key: input.objectKey,
        p_content_type: input.contentType,
        p_byte_size: input.byteSize,
        p_sha256: input.sha256,
      },
    });
    return raw === storageRef ? storageRef : null;
  }

  /**
   * A short-lived signed preview of a reserved object, for the verifying
   * admin only. Null when no signer is configured or signing fails; a
   * preview is a convenience, never a stored fact.
   */
  async previewUrl(
    objectKey: string,
    expiresInSeconds = 300,
  ): Promise<string | null> {
    if (this.signPreviewUrl === null) return null;
    if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0) return null;
    // Never longer than ten minutes: a long-lived signed URL is a public URL
    // with extra steps.
    const bounded = Math.min(expiresInSeconds, 600);
    try {
      return await this.signPreviewUrl({
        bucketId: this.bucketId,
        objectKey,
        expiresInSeconds: bounded,
      });
    } catch {
      return null;
    }
  }
}

export function earlyAccessProofStorageRef(objectKey: string): string {
  return `eaproof.${createHash("sha256").update(objectKey, "utf8").digest("hex").slice(0, 40)}`;
}

function isAllowedContentType(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (EARLY_ACCESS_PROOF_CONTENT_TYPES as readonly string[]).includes(value)
  );
}
