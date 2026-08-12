import { describe, expect, it, vi } from "vitest";
import { RESEARCH_INTAKE_ADDRESS, type ResearchIntakeItem } from "@shared/research/admin-crm-supplier-operations";
import { createResearchMailboxIntakeBridge, ResearchIntakeRefusal } from "./intake-bridge";

function harness() {
  const saved: Array<{ item: ResearchIntakeItem; fingerprint: string }> = [];
  const bridge = createResearchMailboxIntakeBridge({
    saveIntakeWithAudit: vi.fn(async (item, fingerprint) => {
      saved.push({ item, fingerprint });
      return item;
    }),
  });
  return { bridge, saved };
}

const base = {
  messageId: "<mail-1001@example.com>",
  recipientAddress: RESEARCH_INTAKE_ADDRESS,
  senderAddress: "buyer@example.com",
  subject: "Wholesale pricing request",
  plainText: "Our clinic would like current pricing and availability.",
  receivedAt: "2026-08-12T14:00:00.000Z",
};

describe("research mailbox intake bridge", () => {
  it("records canonical intake with audit and never creates an outbound reply", async () => {
    const { bridge, saved } = harness();
    const item = await bridge(base);
    expect(item).toMatchObject({
      sourceAddress: RESEARCH_INTAKE_ADDRESS,
      category: "price",
      state: "needs_human_review",
      urgency: "routine",
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(item)).not.toContain("reply");
  });

  it("escalates safety language for human review without diagnosing", async () => {
    const { bridge } = harness();
    const item = await bridge({ ...base, subject: "Possible adverse event", plainText: "A customer reported a reaction." });
    expect(item.category).toBe("safety_escalation");
    expect(item.urgency).toBe("critical");
    expect(item.state).toBe("needs_human_review");
  });

  it("refuses any recipient other than the canonical research mailbox", async () => {
    const { bridge, saved } = harness();
    await expect(bridge({ ...base, recipientAddress: "team@xeniostechnology.com" })).rejects.toBeInstanceOf(
      ResearchIntakeRefusal,
    );
    expect(saved).toHaveLength(0);
  });

  it("produces the same identity for a provider retry of the same message", async () => {
    const { bridge } = harness();
    const first = await bridge(base);
    const retry = await bridge({ ...base, subject: "provider changed this on retry" });
    expect(retry.intakeId).toBe(first.intakeId);
  });
});
