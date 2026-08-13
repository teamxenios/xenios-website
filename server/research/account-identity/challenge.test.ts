import { describe, expect, it } from "vitest";
import {
  accountChallengeMatches,
  accountClaimLink,
  createAccountChallenge,
  hashAccountChallenge,
} from "./challenge";

describe("account ownership challenges", () => {
  it("creates a high-entropy token while exposing only a stable hash to persistence", () => {
    const challenge = createAccountChallenge();
    expect(challenge.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(challenge.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge.tokenHash).not.toContain(challenge.token);
    expect(accountChallengeMatches(challenge.token, challenge.tokenHash)).toBe(true);
    expect(accountChallengeMatches(`${challenge.token}x`, challenge.tokenHash)).toBe(false);
    expect(hashAccountChallenge(challenge.token)).toBe(challenge.tokenHash);
  });

  it("refuses non-HTTPS claim links outside localhost", () => {
    expect(() => accountClaimLink("http://example.com", "claim", "token")).toThrow("HTTPS");
    expect(accountClaimLink("https://xeniostechnology.com", "claim", "token"))
      .toBe("https://xeniostechnology.com/research/account/claim-history?claim=claim&token=token");
  });
});
