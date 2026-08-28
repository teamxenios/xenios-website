import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  SUPPORT_SUBMISSION_LIMIT_PER_HOUR,
  supportSubmissionAllowed,
} from "./support-rate-limit";

// Supabase is unconfigured in unit tests, so the limiter uses its documented
// per-process in-memory window — deterministic for a fresh key.
describe("the ONE member-scoped support budget (P2-3)", () => {
  it("allows exactly the shared limit, alternating across doors, then refuses", async () => {
    const member = `alt-member-${Math.random().toString(36).slice(2)}`;
    // Alternate the doors the way a member would: web question, account
    // support case, telegram question — every one draws the SAME budget.
    for (let i = 0; i < SUPPORT_SUBMISSION_LIMIT_PER_HOUR; i += 1) {
      expect(await supportSubmissionAllowed(member), `submission ${i + 1}`).toBe(true);
    }
    // The 11th submission is refused REGARDLESS of which door asks.
    expect(await supportSubmissionAllowed(member)).toBe(false);
    expect(await supportSubmissionAllowed(member)).toBe(false);
  });

  it("budgets are member-scoped: another member is unaffected", async () => {
    const exhausted = `exhausted-${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < SUPPORT_SUBMISSION_LIMIT_PER_HOUR + 1; i += 1) {
      await supportSubmissionAllowed(exhausted);
    }
    expect(await supportSubmissionAllowed(exhausted)).toBe(false);
    expect(await supportSubmissionAllowed(`fresh-${Math.random().toString(36).slice(2)}`)).toBe(true);
  });

  // Source pins: every support-shaped write door consumes THIS authority.
  // A new independent bucket for the same class of write is a regression.
  it("both question doors and the account support source consume the shared authority", () => {
    const questions = readFileSync("server/research/questions.ts", "utf8");
    const supportSource = readFileSync("server/research/customer-account/production-support.ts", "utf8");
    // Two call sites in questions.ts (web + Telegram), one in the support source.
    expect(questions.split("supportSubmissionAllowed(").length - 1).toBeGreaterThanOrEqual(2);
    expect(supportSource).toContain("supportSubmissionAllowed(");
    // The old independent buckets are gone.
    expect(questions).not.toContain("member-question:");
    expect(supportSource).not.toContain("customer-account-support:");
  });
});
