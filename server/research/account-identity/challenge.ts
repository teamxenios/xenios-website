import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type AccountChallenge = {
  token: string;
  tokenHash: string;
};

// The raw token belongs only in the outbound email and confirmation request.
// Persistence receives tokenHash; audit records receive neither value.
export function createAccountChallenge(): AccountChallenge {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashAccountChallenge(token) };
}

export function hashAccountChallenge(token: string): string {
  return createHash("sha256").update(`xenios:account-challenge:v1\0${token}`, "utf8").digest("hex");
}

export function accountChallengeMatches(token: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  const actual = Buffer.from(hashAccountChallenge(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function accountClaimLink(siteUrl: string, claimId: string, token: string): string {
  const base = new URL(siteUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error("Account claim links require HTTPS.");
  }
  const url = new URL("/research/account/claim-history", base);
  url.searchParams.set("claim", claimId);
  url.searchParams.set("token", token);
  return url.toString();
}

export function organizationInvitationLink(siteUrl: string, invitationId: string, token: string): string {
  const base = new URL(siteUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error("Organization invitation links require HTTPS.");
  }
  const url = new URL("/research/account/organization-invitation", base);
  url.searchParams.set("invitation", invitationId);
  url.searchParams.set("token", token);
  return url.toString();
}
