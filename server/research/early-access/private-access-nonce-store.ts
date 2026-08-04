import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure hash-only contract for a future durable one-time nonce store.
 *
 * Raw nonces, opaque cookie handles, and the hashing secret never appear in the
 * returned record. This is a validation/planning contract only: two callers
 * holding the same stale record can both produce plans. Only the PostgreSQL
 * exchange RPC provides serialization and durable one-time enforcement.
 */

export const PRIVATE_ACCESS_NONCE_ROLE = "private_early_access_member" as const;
export const PRIVATE_ACCESS_NONCE_TTL_SECONDS = 5 * 60;

const NONCE_HASH_DOMAIN = "xenios:research:private-early-access:nonce";
const SESSION_HASH_DOMAIN = "xenios:research:private-early-access:session-handle";
const MIN_SECRET_BYTES = 32;
const MAX_SECRET_BYTES = 4_096;
const OPAQUE_BYTES = 32;
const OPAQUE_LENGTH = 43;
const JAVASCRIPT_DATE_MAX_MS = 8_640_000_000_000_000;
const MAX_NOW_MS = JAVASCRIPT_DATE_MAX_MS - PRIVATE_ACCESS_NONCE_TTL_SECONDS * 1_000;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const LOWER_HEX_SHA256 = /^[a-f0-9]{64}$/;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const PREPARE_KEYS = ["nonce", "now", "ownerId", "role", "storeSecret"] as const;
const CONSUME_KEYS = ["nonce", "now", "ownerId", "record", "role", "sessionHandle", "storeSecret"] as const;
const RECORD_KEYS = [
  "consumedAtEpochSeconds",
  "exchangedSessionHash",
  "expiresAtEpochSeconds",
  "issuedAtEpochSeconds",
  "nonceHash",
  "ownerId",
  "role",
] as const;

type PlainRecord = Record<string, unknown>;

export type PrivateAccessNonceFailureCode =
  | "CONFIGURATION_INVALID"
  | "INPUT_INVALID"
  | "NONCE_INVALID"
  | "OWNER_MISMATCH"
  | "ROLE_MISMATCH"
  | "NONCE_NOT_YET_VALID"
  | "NONCE_EXPIRED"
  | "NONCE_REPLAYED";

export type PrivateAccessNonceRecord = Readonly<{
  nonceHash: string;
  ownerId: string;
  role: typeof PRIVATE_ACCESS_NONCE_ROLE;
  issuedAtEpochSeconds: number;
  expiresAtEpochSeconds: number;
  consumedAtEpochSeconds: number | null;
  exchangedSessionHash: string | null;
}>;

export type PrivateAccessNoncePrepareResult =
  | Readonly<{ ok: true; value: PrivateAccessNonceRecord }>
  | Readonly<{ ok: false; code: PrivateAccessNonceFailureCode }>;

export type PrivateAccessNonceConsumeResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        record: PrivateAccessNonceRecord;
        receipt: Readonly<{
          nonceHash: string;
          sessionHash: string;
          ownerId: string;
          role: typeof PRIVATE_ACCESS_NONCE_ROLE;
          consumedAtEpochSeconds: number;
        }>;
      }>;
    }>
  | Readonly<{ ok: false; code: PrivateAccessNonceFailureCode }>;

function failure(code: PrivateAccessNonceFailureCode): Readonly<{
  ok: false;
  code: PrivateAccessNonceFailureCode;
}> {
  return Object.freeze({ ok: false as const, code });
}

function readExactPlainRecord(input: unknown, expectedKeys: readonly string[]): PlainRecord | null {
  try {
    if (typeof input !== "object" || input === null) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(input);
    if (
      ownKeys.length !== expectedKeys.length ||
      ownKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const detached: PlainRecord = Object.create(null) as PlainRecord;
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor)) return null;
      detached[key] = descriptor.value;
    }
    return detached;
  } catch {
    return null;
  }
}

function validSecret(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const bytes = Buffer.byteLength(value, "utf8");
  return bytes >= MIN_SECRET_BYTES && bytes <= MAX_SECRET_BYTES;
}

function canonicalOpaque(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== OPAQUE_LENGTH || !BASE64URL.test(value)) return false;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === OPAQUE_BYTES && decoded.toString("base64url") === value;
  } catch {
    return false;
  }
}

function validNow(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= MAX_NOW_MS;
}

function hashOpaque(secret: string, domain: string, value: string): string {
  return createHmac("sha256", secret).update(`${domain}\0${value}`, "utf8").digest("hex");
}

function fixedHashEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === 32 && rightBuffer.length === 32 && timingSafeEqual(leftBuffer, rightBuffer);
}

function nonceRecord(input: unknown): PrivateAccessNonceRecord | null {
  const record = readExactPlainRecord(input, RECORD_KEYS);
  if (!record) return null;
  if (
    typeof record.nonceHash !== "string" ||
    !LOWER_HEX_SHA256.test(record.nonceHash) ||
    typeof record.ownerId !== "string" ||
    !CANONICAL_UUID.test(record.ownerId) ||
    record.role !== PRIVATE_ACCESS_NONCE_ROLE ||
    !Number.isSafeInteger(record.issuedAtEpochSeconds) ||
    Number(record.issuedAtEpochSeconds) <= 0 ||
    !Number.isSafeInteger(record.expiresAtEpochSeconds) ||
    Number(record.expiresAtEpochSeconds) - Number(record.issuedAtEpochSeconds) !== PRIVATE_ACCESS_NONCE_TTL_SECONDS ||
    (record.exchangedSessionHash !== null &&
      (typeof record.exchangedSessionHash !== "string" || !LOWER_HEX_SHA256.test(record.exchangedSessionHash))) ||
    ((record.consumedAtEpochSeconds === null) !== (record.exchangedSessionHash === null)) ||
    (record.consumedAtEpochSeconds !== null &&
      (!Number.isSafeInteger(record.consumedAtEpochSeconds) ||
        Number(record.consumedAtEpochSeconds) < Number(record.issuedAtEpochSeconds) ||
        Number(record.consumedAtEpochSeconds) >= Number(record.expiresAtEpochSeconds)))
  ) {
    return null;
  }
  return Object.freeze({
    nonceHash: record.nonceHash,
    ownerId: record.ownerId,
    role: PRIVATE_ACCESS_NONCE_ROLE,
    issuedAtEpochSeconds: Number(record.issuedAtEpochSeconds),
    expiresAtEpochSeconds: Number(record.expiresAtEpochSeconds),
    consumedAtEpochSeconds: record.consumedAtEpochSeconds === null ? null : Number(record.consumedAtEpochSeconds),
    exchangedSessionHash: record.exchangedSessionHash === null ? null : String(record.exchangedSessionHash),
  });
}

/** Build a hash-only nonce plan; the database authors durable timestamps. */
export function preparePrivateAccessNonce(input: unknown): PrivateAccessNoncePrepareResult {
  const record = readExactPlainRecord(input, PREPARE_KEYS);
  if (!record) return failure("INPUT_INVALID");
  if (!validSecret(record.storeSecret)) return failure("CONFIGURATION_INVALID");
  if (
    !canonicalOpaque(record.nonce) ||
    typeof record.ownerId !== "string" ||
    !CANONICAL_UUID.test(record.ownerId) ||
    record.role !== PRIVATE_ACCESS_NONCE_ROLE ||
    !validNow(record.now)
  ) {
    return failure("INPUT_INVALID");
  }
  const issuedAt = Math.floor(record.now / 1_000);
  const value: PrivateAccessNonceRecord = Object.freeze({
    nonceHash: hashOpaque(record.storeSecret, NONCE_HASH_DOMAIN, record.nonce),
    ownerId: record.ownerId,
    role: PRIVATE_ACCESS_NONCE_ROLE,
    issuedAtEpochSeconds: issuedAt,
    expiresAtEpochSeconds: issuedAt + PRIVATE_ACCESS_NONCE_TTL_SECONDS,
    consumedAtEpochSeconds: null,
    exchangedSessionHash: null,
  });
  return Object.freeze({ ok: true as const, value });
}

/**
 * Validate and plan a single atomic grant exchange. A durable adapter must
 * consume the nonce and create the reusable session in one database function;
 * it must never implement this as a read followed by later independent writes.
 */
export function consumePrivateAccessNonce(input: unknown): PrivateAccessNonceConsumeResult {
  const inputRecord = readExactPlainRecord(input, CONSUME_KEYS);
  if (!inputRecord) return failure("INPUT_INVALID");
  if (!validSecret(inputRecord.storeSecret)) return failure("CONFIGURATION_INVALID");
  if (
    !canonicalOpaque(inputRecord.nonce) ||
    !canonicalOpaque(inputRecord.sessionHandle) ||
    typeof inputRecord.ownerId !== "string" ||
    !CANONICAL_UUID.test(inputRecord.ownerId) ||
    inputRecord.role !== PRIVATE_ACCESS_NONCE_ROLE ||
    !validNow(inputRecord.now)
  ) {
    return failure("INPUT_INVALID");
  }
  const stored = nonceRecord(inputRecord.record);
  if (!stored) return failure("INPUT_INVALID");

  const expectedNonceHash = hashOpaque(inputRecord.storeSecret, NONCE_HASH_DOMAIN, inputRecord.nonce);
  const expectedSessionHash = hashOpaque(
    inputRecord.storeSecret,
    SESSION_HASH_DOMAIN,
    inputRecord.sessionHandle,
  );
  if (!fixedHashEqual(stored.nonceHash, expectedNonceHash)) return failure("NONCE_INVALID");
  if (stored.ownerId !== inputRecord.ownerId) return failure("OWNER_MISMATCH");
  if (stored.role !== inputRecord.role) return failure("ROLE_MISMATCH");

  const nowSeconds = Math.floor(inputRecord.now / 1_000);
  if (stored.issuedAtEpochSeconds > nowSeconds) {
    return failure("NONCE_NOT_YET_VALID");
  }
  if (nowSeconds >= stored.expiresAtEpochSeconds) return failure("NONCE_EXPIRED");
  if (stored.consumedAtEpochSeconds !== null) return failure("NONCE_REPLAYED");

  const consumed: PrivateAccessNonceRecord = Object.freeze({
    ...stored,
    consumedAtEpochSeconds: nowSeconds,
    exchangedSessionHash: expectedSessionHash,
  });
  const receipt = Object.freeze({
    nonceHash: consumed.nonceHash,
    sessionHash: expectedSessionHash,
    ownerId: consumed.ownerId,
    role: consumed.role,
    consumedAtEpochSeconds: nowSeconds,
  });
  return Object.freeze({ ok: true as const, value: Object.freeze({ record: consumed, receipt }) });
}
