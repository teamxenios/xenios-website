/**
 * THE TRANSIENT PROOF BOUNDARY.
 *
 * THE FOUNDER ARCHITECTURE, RESTATED AS CODE. Payment proof bytes exist inside
 * ONE request and inside ONE provider send, and nowhere else. They are never
 * written to Postgres, never written to Supabase Storage, never placed in the
 * notification outbox, never base64 encoded into a durable payload, never
 * written to the filesystem, and never logged.
 *
 * HOW THAT IS ENFORCED RATHER THAN PROMISED. `validateTransientProof` returns
 * a `TransientProofDescriptor` that HAS NO FIELD CAPABLE OF HOLDING BYTES. The
 * bytes are a separate argument that the caller passes directly to the sender
 * and then drops. A future caller who tries to persist "the proof" reaches for
 * the descriptor, and the descriptor is metadata. The one thing carried forward
 * is the SHA-256, which is a fingerprint: it identifies the file for
 * reconciliation and duplicate detection and cannot reconstruct it.
 *
 * `assertNoProofBytes` is the second, independent boundary. Anything on its way
 * to a durable store or an outbox payload passes through it, and it refuses a
 * record carrying a byte bearing key even if some future code path builds one.
 * That mirrors `assertEmailPayloadSafe` in the membership lane, and it exists
 * for the same reason: the rule has to survive people who have not read this
 * comment.
 *
 * WHAT VALIDATION MEANS HERE. Size, then container structure, then the
 * declared type against the real one, then a rebuilt filename. Refusals are
 * coded so the route can map them to a scoped status, and no refusal ever
 * echoes any part of the file.
 */

import { createHash } from "node:crypto";
import type { EarlyAccessProofConcept } from "../hardening-contract";
import {
  EARLY_ACCESS_PROOF_CONTENT_TYPES,
  type EarlyAccessProofContentType,
} from "../commerce/payment-proof";

import {
  validateProofContainer,
  type ContainerRefusalCode,
  type PdfStructuralParser,
} from "./containers";
import { safeProofFilename } from "./filename";

/**
 * Which of the contract's three proof concepts this module implements.
 *
 * Named rather than assumed, because the three are not interchangeable and a
 * settlement that accepts evidence has to say which provenance it accepted.
 * This lane is `transient_email_only`, and it is neither the admin-recorded
 * external proof nor the single-product flow's bucket upload.
 */
export const TRANSIENT_PROOF_CONCEPT: EarlyAccessProofConcept = "transient_email_only";

/**
 * The transport ceiling for one upload.
 *
 * Lower than the 15 MB the accelerator proposed, and the reason is memory
 * rather than taste. The raw body, the provider's base64 encoding of it, and
 * the JSON string that carries that encoding coexist in the heap for the
 * duration of one send, so peak cost is roughly 2.8x the file. At 8 MB that is
 * about 22 MB per concurrent send, which a small container survives at the
 * concurrency cap in `concurrency.ts`. At 15 MB it is about 42 MB each, and
 * four of them is an out of memory kill during a customer's checkout.
 *
 * A phone screenshot of a bank transfer is well under 1 MB. A scanned PDF
 * statement is a few MB. Nothing legitimate in this flow approaches the cap.
 */
export const TRANSIENT_PROOF_MAX_BYTES = 8 * 1024 * 1024;

export type TransientProofRefusalCode =
  | "bytes_missing"
  | "too_large"
  | "content_type_unsupported"
  | ContainerRefusalCode;

/**
 * Everything downstream is allowed to know about the file.
 *
 * Note what is absent: there is no `bytes`, no `buffer`, no `base64`, no
 * `content`, no `url`, and no storage key. There is deliberately no place to
 * put one.
 */
export type TransientProofDescriptor = Readonly<{
  contentType: EarlyAccessProofContentType;
  byteSize: number;
  /** Lowercase hex. The durable identity of this exact file. */
  sha256: string;
  /** Rebuilt, safe to attach and to echo. */
  filename: string;
  /** True when the submitted filename contained material that was removed. */
  filenameRewritten: boolean;
  /** Structural, so no consumer can mistake this for a stored object. */
  persisted: false;
}>;

export type TransientProofResult =
  | Readonly<{ ok: true; descriptor: TransientProofDescriptor }>
  | Readonly<{ ok: false; code: TransientProofRefusalCode }>;

/**
 * Keys that would carry, or point at, the bytes.
 *
 * A superset of `PROOF_BYTE_BEARING_KEYS` in `commerce/payment-proof.ts`,
 * because this boundary also guards outbound payloads where a link to the
 * object is as much of a violation as the object itself.
 */
export const TRANSIENT_PROOF_FORBIDDEN_KEYS = Object.freeze([
  "attachment",
  "attachments",
  "base64",
  "binary",
  "blob",
  "body",
  "buffer",
  "bytes",
  "content",
  "data",
  "dataUrl",
  "downloadUrl",
  "file",
  "fileContents",
  "objectKey",
  "payload",
  "raw",
  "signedUrl",
  "storageKey",
  "storagePath",
  "stream",
  "url",
] as const);

export class ProofBytesRefused extends Error {
  constructor(readonly keys: readonly string[]) {
    super("Proof bytes or a pointer to them reached a boundary that must never carry either.");
    this.name = "ProofBytesRefused";
  }
}

/**
 * Refuse a record that carries bytes, or a pointer to bytes, anywhere in it.
 *
 * Walks nested objects and arrays, because a violation is far more likely to
 * appear one level down inside a line item or a metadata bag than at the top.
 * Depth is bounded so a cyclic or adversarial structure cannot hang the
 * request; the seen set makes cycles safe rather than fatal.
 */
export function assertNoProofBytes(value: unknown, maxDepth = 8): void {
  const offending: string[] = [];
  const seen = new WeakSet<object>();

  const walk = (node: unknown, depth: number): void => {
    if (depth > maxDepth || node === null || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (Array.isArray(node)) {
      for (const entry of node) walk(entry, depth + 1);
      return;
    }

    for (const key of Object.keys(node as Record<string, unknown>)) {
      if ((TRANSIENT_PROOF_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
        offending.push(key);
      }
      walk((node as Record<string, unknown>)[key], depth + 1);
    }
  };

  walk(value, 0);
  if (offending.length > 0) {
    const unique: string[] = [];
    for (let index = 0; index < offending.length; index += 1) {
      if (unique.indexOf(offending[index]) === -1) unique.push(offending[index]);
    }
    throw new ProofBytesRefused(Object.freeze(unique));
  }
}

function refuse(code: TransientProofRefusalCode): TransientProofResult {
  return Object.freeze({ ok: false as const, code });
}

/**
 * Validate one upload and reduce it to metadata.
 *
 * The order matters. Size is checked before any structural walk so a hostile
 * 8 MB file is refused before it costs a CRC pass, and the container walk runs
 * before the hash so a refused file is never fingerprinted.
 */
export async function validateTransientProof(input: {
  readonly bytes: Uint8Array;
  readonly declaredContentType: unknown;
  readonly declaredFilename: unknown;
  readonly pdfParser: PdfStructuralParser;
  readonly maxBytes?: number;
}): Promise<TransientProofResult> {
  const bytes = input.bytes;
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return refuse("bytes_missing");

  const maxBytes = input.maxBytes ?? TRANSIENT_PROOF_MAX_BYTES;
  if (bytes.length > maxBytes) return refuse("too_large");

  const declared = input.declaredContentType;
  if (
    typeof declared !== "string" ||
    !(EARLY_ACCESS_PROOF_CONTENT_TYPES as readonly string[]).includes(declared)
  ) {
    return refuse("content_type_unsupported");
  }
  const declaredContentType = declared as EarlyAccessProofContentType;

  const container = await validateProofContainer({
    bytes,
    declaredContentType,
    pdfParser: input.pdfParser,
  });
  if (!container.ok) return refuse(container.code);

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const filename = safeProofFilename(input.declaredFilename, container.contentType);

  return Object.freeze({
    ok: true as const,
    descriptor: Object.freeze({
      contentType: container.contentType,
      byteSize: bytes.length,
      sha256,
      filename: filename.value,
      filenameRewritten: filename.rewritten,
      persisted: false as const,
    }),
  });
}
