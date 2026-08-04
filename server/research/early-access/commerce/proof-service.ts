/**
 * Early Access payment proof history. Server only, pure, side effect free.
 *
 * `payment-proof.ts` validates ONE submission in isolation. This module is the lane
 * that remembers them: which proof is currently on file for an order, which ones it
 * replaced, and who uploaded each. That history is what the verification lane reads
 * before a human is allowed to decide anything.
 *
 * METADATA ONLY, still. The record has no field for bytes, no field for a download
 * URL, and no field a byte carrying value could occupy. A request that tries to hand
 * bytes to this lane is refused with a dedicated code rather than silently truncated
 * to its metadata, because a caller that believes it uploaded a file and did not is a
 * worse failure than a loud refusal.
 *
 * APPEND ONLY. A customer who sends a clearer photo does not edit the old record. A
 * new record is appended naming the one it supersedes, so the sequence a human
 * actually reviewed is reconstructable afterwards. There is no update and no delete.
 *
 * EVERY STORED STRING IS HOSTILE. The filename, the storage reference, and the
 * uploader all arrive from outside. Path separators, traversal runs, null bytes, and
 * control characters are refused in all of them, so nothing this module records can
 * later be concatenated into a path, a header, or a log line and mean something else.
 */

import {
  isEarlyAccessPaymentOptionCode,
  type EarlyAccessPaymentOptionCode,
} from "@shared/research/early-access-payment-options";
import {
  accepted,
  carriesAnyKey,
  isBoundedInteger,
  isBoundedText,
  isCanonicalTimestamp,
  isNotBefore,
  isOneOf,
  isSafeIdentifier,
  readPlainArray,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";
import { readEarlyAccessOrder, type EarlyAccessOrderStatus } from "./early-access-order";
import {
  EARLY_ACCESS_PROOF_CONTENT_TYPES,
  EARLY_ACCESS_PROOF_MAX_BYTES,
  PROOF_BYTE_BEARING_KEYS,
  describeProofSubmission,
  earlyAccessProofObjectKey,
  type EarlyAccessProofContentType,
} from "./payment-proof";

/**
 * A bounded chain. A customer correcting a photo a few times is normal; an unbounded
 * chain is a way to make a reviewer lose track of which proof is current.
 */
export const EARLY_ACCESS_MAX_PROOFS_PER_ORDER = 8;

/**
 * The uploader is a named party, never "the system". Spaces, dots, at signs, colons,
 * and hyphens cover a human name, a login, and a service account reference. Slashes,
 * backslashes, and control characters are outside the class by construction.
 */
const UPLOADER = /^[A-Za-z0-9][A-Za-z0-9 _.@:-]{2,127}$/;

/** A traversal run has no legitimate place in a filename or an opaque reference. */
const TRAVERSAL = "..";

export type ProofAttachmentFailureCode =
  | "proof_bytes_supplied"
  | "input_invalid"
  | "order_invalid"
  | "order_not_awaiting_payment"
  | "proof_id_invalid"
  | "filename_invalid"
  | "content_type_unsupported"
  | "byte_size_invalid"
  | "submitted_at_invalid"
  | "method_unsupported"
  | "storage_ref_invalid"
  | "uploader_invalid"
  | "proof_history_invalid"
  | "proof_id_duplicate"
  | "proof_limit_reached"
  | "proof_chain_broken"
  | "supersede_not_permitted"
  | "supersede_required"
  | "supersede_target_stale"
  | "uploaded_at_before_prior";

/**
 * One proof as it is stored. Note what is absent: no bytes, no signed URL, no
 * verification state, and no amount. A proof is a claim about a payment, so it
 * carries nothing that could be mistaken for a settlement.
 */
export type EarlyAccessProofRecord = Readonly<{
  proofId: string;
  orderId: string;
  /** The storage provider's own opaque handle. Never a path, never a URL. */
  storageRef: string;
  /** Derived from validated ids, so a hostile ref cannot steer where bytes land. */
  objectKey: string;
  filename: string;
  contentType: EarlyAccessProofContentType;
  byteSize: number;
  method: EarlyAccessPaymentOptionCode;
  uploadedBy: string;
  uploadedAt: string;
  /** One based position in this order's chain. The last entry is the current proof. */
  sequence: number;
  supersedesProofId: string | null;
}>;

export const EARLY_ACCESS_PROOF_RECORD_KEYS = [
  "proofId",
  "orderId",
  "storageRef",
  "objectKey",
  "filename",
  "contentType",
  "byteSize",
  "method",
  "uploadedBy",
  "uploadedAt",
  "sequence",
  "supersedesProofId",
] as const;

export type EarlyAccessProofAttachment = Readonly<{
  record: EarlyAccessProofRecord;
  supersededProofId: string | null;
  orderStatus: "payment_under_review";
  transition: Readonly<{ from: EarlyAccessOrderStatus; to: "payment_under_review" }>;
  /** Structural, not advisory: this lane has no type in which payment is settled. */
  paid: false;
  verified: false;
}>;

export type ProofAttachmentResult = CommerceResult<
  EarlyAccessProofAttachment,
  ProofAttachmentFailureCode
>;

const ATTACH_REQUIRED_KEYS = [
  "order",
  "proofs",
  "proofId",
  "storageRef",
  "filename",
  "contentType",
  "byteSize",
  "method",
  "uploadedBy",
  "uploadedAt",
  "supersedesProofId",
] as const;

/**
 * Opaque means opaque. A reference that carries a separator or a traversal run is a
 * path in disguise, and a path from an untrusted party is how the proof for one order
 * gets written over the proof for another.
 */
export function isOpaqueStorageRef(value: unknown): value is string {
  return isSafeIdentifier(value) && !value.includes(TRAVERSAL);
}

export function isProofUploader(value: unknown): value is string {
  return typeof value === "string" && UPLOADER.test(value);
}

/**
 * The dangerous-character half of the filename rule, applied on the way OUT of
 * storage. `payment-proof.ts` owns the write-path rule, including the agreement
 * between extension and content type; this asks only whether a string that already
 * reached the database is still safe to hand to a path, a header, or a log line.
 */
export function isStorableFilename(value: unknown): value is string {
  return (
    isBoundedText(value, 200) &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes(TRAVERSAL)
  );
}

/** Validate one stored proof record. Fails closed on any deviation. */
export function readEarlyAccessProofRecord(value: unknown): EarlyAccessProofRecord | null {
  const record = readPlainRecord(value, EARLY_ACCESS_PROOF_RECORD_KEYS);
  if (!record) return null;
  if (!isSafeIdentifier(record.proofId)) return null;
  if (!isSafeIdentifier(record.orderId)) return null;
  if (!isOpaqueStorageRef(record.storageRef)) return null;
  // Re-derived rather than trusted, so a stored key that points somewhere else fails.
  if (record.objectKey !== earlyAccessProofObjectKey(record.orderId, record.proofId)) return null;
  if (!isStorableFilename(record.filename)) return null;
  if (!isOneOf(record.contentType, EARLY_ACCESS_PROOF_CONTENT_TYPES)) return null;
  if (!isBoundedInteger(record.byteSize, 1, EARLY_ACCESS_PROOF_MAX_BYTES)) return null;
  if (!isEarlyAccessPaymentOptionCode(record.method)) return null;
  if (!isProofUploader(record.uploadedBy)) return null;
  if (!isCanonicalTimestamp(record.uploadedAt)) return null;
  if (!isBoundedInteger(record.sequence, 1, EARLY_ACCESS_MAX_PROOFS_PER_ORDER)) return null;
  if (record.supersedesProofId !== null && !isSafeIdentifier(record.supersedesProofId)) return null;
  // The first proof supersedes nothing; every later one must name what it replaced.
  if (record.sequence === 1 && record.supersedesProofId !== null) return null;
  if (record.sequence > 1 && record.supersedesProofId === null) return null;

  return Object.freeze({
    proofId: record.proofId,
    orderId: record.orderId,
    storageRef: record.storageRef,
    objectKey: record.objectKey,
    filename: record.filename,
    contentType: record.contentType,
    byteSize: record.byteSize,
    method: record.method,
    uploadedBy: record.uploadedBy,
    uploadedAt: record.uploadedAt,
    sequence: record.sequence,
    supersedesProofId: record.supersedesProofId === null ? null : record.supersedesProofId,
  });
}

/**
 * Read a whole chain and confirm it is a chain: contiguous sequence numbers, each
 * record superseding exactly its predecessor, no repeated proof id, one order. A
 * history that does not hold together is refused rather than partially believed,
 * because "which proof is current" is the question the verification lane depends on.
 */
export function readEarlyAccessProofHistory(
  value: unknown,
): readonly EarlyAccessProofRecord[] | null {
  const entries = readPlainArray(value, EARLY_ACCESS_MAX_PROOFS_PER_ORDER);
  if (!entries) return null;

  const records: EarlyAccessProofRecord[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const record = readEarlyAccessProofRecord(entries[index]);
    if (!record) return null;
    if (record.sequence !== index + 1) return null;
    if (seen.has(record.proofId)) return null;
    seen.add(record.proofId);
    if (index > 0) {
      const prior = records[index - 1] as EarlyAccessProofRecord;
      if (record.orderId !== prior.orderId) return null;
      if (record.supersedesProofId !== prior.proofId) return null;
      if (!isNotBefore(record.uploadedAt, prior.uploadedAt)) return null;
    }
    records.push(record);
  }
  return Object.freeze(records);
}

/** The proof a reviewer must be looking at. Anything earlier has been replaced. */
export function currentProof(
  history: readonly EarlyAccessProofRecord[],
): EarlyAccessProofRecord | null {
  return history.length === 0 ? null : (history[history.length - 1] as EarlyAccessProofRecord);
}

/**
 * Describe the attachment of one proof to an order.
 *
 * The existing chain is supplied rather than fetched, so the decision is a pure
 * function of its inputs and every branch is reachable from a test. The order
 * snapshot is supplied for the same reason `payment-proof.ts` asks for it: the
 * transition is computed against real order state, not against a customer's claim.
 */
export function describeProofAttachment(input: unknown): ProofAttachmentResult {
  if (carriesAnyKey(input, PROOF_BYTE_BEARING_KEYS)) return refused("proof_bytes_supplied");

  const record = readPlainRecord(input, ATTACH_REQUIRED_KEYS);
  if (!record) return refused("input_invalid");

  // Checked before anything else is read, because these two strings are the untrusted
  // surface this module adds to the one `payment-proof.ts` already covers.
  if (!isOpaqueStorageRef(record.storageRef)) return refused("storage_ref_invalid");
  if (!isProofUploader(record.uploadedBy)) return refused("uploader_invalid");

  const order = readEarlyAccessOrder(record.order);
  if (!order) return refused("order_invalid");

  const history = readEarlyAccessProofHistory(record.proofs);
  if (!history) return refused("proof_history_invalid");
  if (history.some((entry) => entry.orderId !== order.orderId)) {
    return refused("proof_history_invalid");
  }
  if (history.length >= EARLY_ACCESS_MAX_PROOFS_PER_ORDER) return refused("proof_limit_reached");

  // Reuse, not reimplementation: filename, content type, byte size, timestamp, method,
  // the accepting statuses, and the storage intent are all decided by the module that
  // already owns those rules, and its refusal codes are surfaced unchanged.
  const submission = describeProofSubmission({
    order: record.order,
    proofId: record.proofId,
    filename: record.filename,
    contentType: record.contentType,
    byteSize: record.byteSize,
    submittedAt: record.uploadedAt,
    method: record.method,
  });
  if (!submission.ok) return refused(submission.code);
  const described = submission.value;

  if (history.some((entry) => entry.proofId === described.proofId)) {
    return refused("proof_id_duplicate");
  }
  // Two records pointing at one stored object would make "which one did the admin
  // review" unanswerable, which is the whole reason the chain exists.
  if (history.some((entry) => entry.storageRef === record.storageRef)) {
    return refused("storage_ref_invalid");
  }

  const prior = currentProof(history);
  const supersedes = record.supersedesProofId;
  let supersededProofId: string | null = null;
  if (prior === null) {
    if (supersedes !== null) return refused("supersede_not_permitted");
  } else {
    if (supersedes === null) return refused("supersede_required");
    // Naming an already replaced proof means the uploader is working from a stale
    // view, and the resulting chain would have two records claiming to be current.
    if (supersedes !== prior.proofId) return refused("supersede_target_stale");
    if (!isNotBefore(described.submittedAt, prior.uploadedAt)) {
      return refused("uploaded_at_before_prior");
    }
    supersededProofId = prior.proofId;
  }

  const stored: EarlyAccessProofRecord = Object.freeze({
    proofId: described.proofId,
    orderId: described.orderId,
    storageRef: record.storageRef,
    objectKey: described.storageIntent.objectKey,
    filename: described.filename,
    contentType: described.contentType,
    byteSize: described.byteSize,
    method: described.method,
    uploadedBy: record.uploadedBy,
    uploadedAt: described.submittedAt,
    sequence: history.length + 1,
    supersedesProofId: supersededProofId,
  });

  return accepted(
    Object.freeze({
      record: stored,
      supersededProofId,
      orderStatus: described.orderStatus,
      transition: described.transition,
      paid: false as const,
      verified: false as const,
    }),
  );
}

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

export type ProofAppendResult = CommerceResult<
  EarlyAccessProofRecord,
  ProofAttachmentFailureCode
>;

/** Append-only by construction: there is no update, no delete, and no clear. */
export interface EarlyAccessProofRepository {
  append(record: unknown): Promise<ProofAppendResult>;
  /** Every proof ever attached to an order, oldest first. */
  history(orderId: string): Promise<readonly EarlyAccessProofRecord[]>;
  current(orderId: string): Promise<EarlyAccessProofRecord | null>;
}

export class InMemoryProofRepository implements EarlyAccessProofRepository {
  private readonly byOrder = new Map<string, readonly EarlyAccessProofRecord[]>();
  private readonly seenProofIds = new Set<string>();

  /**
   * The record is re-validated on the way in even though the pure function already
   * built it, because a repository that trusts its caller is a repository that can be
   * handed a hand-written record by a later, less careful call site.
   */
  async append(record: unknown): Promise<ProofAppendResult> {
    const validated = readEarlyAccessProofRecord(record);
    if (!validated) return refused("input_invalid");
    if (this.seenProofIds.has(validated.proofId)) return refused("proof_id_duplicate");

    const chain = this.byOrder.get(validated.orderId) ?? [];
    if (chain.length >= EARLY_ACCESS_MAX_PROOFS_PER_ORDER) return refused("proof_limit_reached");
    if (validated.sequence !== chain.length + 1) return refused("proof_chain_broken");
    const prior = currentProof(chain);
    if (prior === null) {
      if (validated.supersedesProofId !== null) return refused("proof_chain_broken");
    } else if (validated.supersedesProofId !== prior.proofId) {
      return refused("proof_chain_broken");
    }
    if (chain.some((entry) => entry.storageRef === validated.storageRef)) {
      return refused("storage_ref_invalid");
    }

    this.byOrder.set(validated.orderId, Object.freeze([...chain, validated]));
    this.seenProofIds.add(validated.proofId);
    return accepted(validated);
  }

  async history(orderId: string): Promise<readonly EarlyAccessProofRecord[]> {
    return this.byOrder.get(orderId) ?? Object.freeze([]);
  }

  async current(orderId: string): Promise<EarlyAccessProofRecord | null> {
    return currentProof(await this.history(orderId));
  }
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

export type AttachProofInput = Readonly<{
  order: unknown;
  proofId: unknown;
  storageRef: unknown;
  filename: unknown;
  contentType: unknown;
  byteSize: unknown;
  method: unknown;
  uploadedBy: unknown;
  uploadedAt: unknown;
  supersedesProofId: unknown;
}>;

/**
 * Attach one proof, reading the existing chain from the repository.
 *
 * The repository read happens first and the append last, with the whole decision made
 * in between by a pure function, so the only thing this wrapper contributes is I/O.
 */
export async function attachPaymentProof(
  repository: EarlyAccessProofRepository,
  input: AttachProofInput,
): Promise<ProofAttachmentResult> {
  const order = readEarlyAccessOrder(input.order);
  if (!order) return refused("order_invalid");

  const history = await repository.history(order.orderId);
  const described = describeProofAttachment({
    order: input.order,
    proofs: [...history],
    proofId: input.proofId,
    storageRef: input.storageRef,
    filename: input.filename,
    contentType: input.contentType,
    byteSize: input.byteSize,
    method: input.method,
    uploadedBy: input.uploadedBy,
    uploadedAt: input.uploadedAt,
    supersedesProofId: input.supersedesProofId,
  });
  if (!described.ok) return described;

  const appended = await repository.append(described.value.record);
  if (!appended.ok) return refused(appended.code);
  return described;
}
