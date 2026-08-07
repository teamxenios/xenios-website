import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AffiliateCodePublicResult, AffiliateCodeState } from "@shared/research/affiliate-system";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PUBLIC_ERROR = "This access code is invalid or no longer active. Contact Xenios support or the person who shared the invitation.";

export type AffiliateCodeRecord = Readonly<{
  codeId: string;
  affiliateId: string;
  publicDisplayName: string | null;
  codeHash: string;
  maskedPrefix: string;
  lastFour: string;
  state: AffiliateCodeState;
  startsAt: string;
  expiresAt: string | null;
  maximumUses: number | null;
  successfulUses: number;
  campaignId: string | null;
  accessMode: "attribution_only" | "unlock_early_access";
}>;

export interface AffiliateCodeRepository {
  byHash(codeHash: string): Promise<AffiliateCodeRecord | null>;
  recordAttempt(input: Readonly<{ codeId: string | null; ipHash: string; success: boolean; at: string }>): Promise<void>;
  consume(codeId: string, expectedSuccessfulUses: number, at: string): Promise<boolean>;
  createAttributionSession(input: Readonly<{ affiliateId: string; codeId: string; campaignId: string | null; expiresAt: string; at: string }>): Promise<string>;
}

function normalized(value: string): string {
  return value.trim().toUpperCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}

export function affiliateCodeHash(secret: string, code: string): string {
  if (secret.length < 32) throw new Error("AFFILIATE_CODE_HMAC_SECRET must be at least 32 characters.");
  return createHmac("sha256", secret).update("xenios:affiliate-code:v1|").update(normalized(code)).digest("hex");
}

export function generateAffiliateCode(alias: string, randomLength = 6): string {
  const cleanAlias = normalized(alias).replace(/[^A-Z0-9-]/g, "").slice(0, 16) || "PARTNER";
  if (!Number.isInteger(randomLength) || randomLength < 4 || randomLength > 8) throw new Error("Random code segment must be 4 to 8 characters.");
  let random = "";
  const bytes = randomBytes(randomLength);
  for (let index = 0; index < randomLength; index += 1) random += ALPHABET[bytes[index]! % ALPHABET.length];
  return `XR-${cleanAlias}-${random}`;
}

function safeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export async function validateAffiliateCustomerCode(input: Readonly<{
  code: string;
  ipHash: string;
  now: string;
  hmacSecret: string;
  attributionWindowDays: number;
  repo: AffiliateCodeRepository;
}>): Promise<AffiliateCodePublicResult> {
  const hash = affiliateCodeHash(input.hmacSecret, input.code);
  const record = await input.repo.byHash(hash);
  const nowMs = Date.parse(input.now);
  const valid = record !== null && safeEqualHex(record.codeHash, hash) &&
    (record.state === "active" || record.state === "testing") &&
    Date.parse(record.startsAt) <= nowMs &&
    (record.expiresAt === null || Date.parse(record.expiresAt) > nowMs) &&
    (record.maximumUses === null || record.successfulUses < record.maximumUses);
  await input.repo.recordAttempt({ codeId: record?.codeId ?? null, ipHash: input.ipHash, success: valid, at: input.now });
  if (!valid || record === null) return Object.freeze({ valid: false as const, accessGranted: false as const, message: PUBLIC_ERROR });
  if (!(await input.repo.consume(record.codeId, record.successfulUses, input.now))) {
    return Object.freeze({ valid: false as const, accessGranted: false as const, message: PUBLIC_ERROR });
  }
  const expiresAt = new Date(nowMs + input.attributionWindowDays * 86_400_000).toISOString();
  const attributionToken = await input.repo.createAttributionSession({
    affiliateId: record.affiliateId,
    codeId: record.codeId,
    campaignId: record.campaignId,
    expiresAt,
    at: input.now,
  });
  return Object.freeze({
    valid: true as const,
    accessGranted: record.accessMode === "unlock_early_access",
    publicDisplayName: record.publicDisplayName,
    attributionToken,
    supportState: record.state,
  });
}
