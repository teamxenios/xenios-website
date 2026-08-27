import { describe, expect, it } from "vitest";

import {
  createMemberQuestionsSupportSource,
  type SupportQuestionRow,
} from "./production-support";

function row(overrides: Partial<SupportQuestionRow>): SupportQuestionRow {
  return {
    id: "q-1",
    member_id: "member-1",
    category: "other",
    status: "pending",
    body_text: "[portal:order] Where is my order\n\nIt has been a week.",
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("member-questions support source", () => {
  it("maps portal-marked rows back to their exact portal category and subject", async () => {
    const source = createMemberQuestionsSupportSource({
      listRows: async () => [row({})],
      insertRow: async () => {
        throw new Error("unused");
      },
    });
    const cases = await source.casesFor("member-1");
    expect(cases).toHaveLength(1);
    expect(cases[0].category).toBe("order");
    expect(cases[0].subject).toBe("Where is my order");
    expect(cases[0].state).toBe("open");
  });

  it("maps classic questions-surface rows conservatively", async () => {
    const source = createMemberQuestionsSupportSource({
      listRows: async () => [
        row({ id: "q-2", category: "shipping", body_text: "Tracking says stalled" }),
        row({ id: "q-3", category: "plan", body_text: "About my plan document" }),
      ],
      insertRow: async () => {
        throw new Error("unused");
      },
    });
    const cases = await source.casesFor("member-1");
    expect(cases.find((c) => c.id === "q-2")?.category).toBe("order");
    expect(cases.find((c) => c.id === "q-3")?.category).toBe("account");
  });

  it("maps question statuses to portal states without claiming false resolution", async () => {
    const source = createMemberQuestionsSupportSource({
      listRows: async () => [
        row({ id: "a", status: "pending" }),
        row({ id: "b", status: "being_reviewed" }),
        row({ id: "c", status: "more_information_needed" }),
        row({ id: "d", status: "answer_ready" }),
        row({ id: "e", status: "completed" }),
        row({ id: "f", status: "status_from_the_future" }),
      ],
      insertRow: async () => {
        throw new Error("unused");
      },
    });
    const byId = new Map((await source.casesFor("member-1")).map((c) => [c.id, c.state]));
    expect(byId.get("a")).toBe("open");
    expect(byId.get("b")).toBe("open");
    expect(byId.get("c")).toBe("waiting_on_customer");
    expect(byId.get("d")).toBe("resolved");
    expect(byId.get("e")).toBe("resolved");
    expect(byId.get("f")).toBe("open");
  });

  it("PROPAGATES a failed durable read instead of rendering an empty lie", async () => {
    const source = createMemberQuestionsSupportSource({
      listRows: async () => {
        throw new Error("support_read_failed");
      },
      insertRow: async () => {
        throw new Error("unused");
      },
    });
    await expect(source.casesFor("member-1")).rejects.toThrow("support_read_failed");
  });

  it("writes a pending web row carrying the portal marker and the SLA target", async () => {
    let written: Record<string, unknown> | null = null;
    const source = createMemberQuestionsSupportSource({
      listRows: async () => [],
      insertRow: async (r) => {
        written = r;
        return row({
          id: "q-new",
          category: String(r.category),
          body_text: String(r.body_text),
          status: "pending",
          created_at: String(r.created_at),
          updated_at: String(r.updated_at),
        });
      },
      now: () => new Date("2026-08-27T00:00:00.000Z"),
    });
    const created = await source.openCase("member-1", {
      category: "pharmacy",
      subject: "COA question",
      description: "Which lot is current?",
    });
    expect(created.state).toBe("open");
    expect(created.category).toBe("pharmacy");
    expect(created.subject).toBe("COA question");
    expect(written).not.toBeNull();
    const record = written as unknown as Record<string, unknown>;
    expect(record.member_id).toBe("member-1");
    expect(record.status).toBe("pending");
    expect(record.source).toBe("web");
    // portal category preserved in the marker; column stays in the CHECK vocabulary
    expect(record.category).toBe("other");
    expect(String(record.body_text)).toContain("[portal:pharmacy] COA question");
    expect(record.sla_target_at).toBe("2026-08-27T12:00:00.000Z");
  });

  it("refuses a write past the throttle budget", async () => {
    const source = createMemberQuestionsSupportSource({
      listRows: async () => [],
      insertRow: async () => {
        throw new Error("must_not_write");
      },
      allowWrite: async () => false,
    });
    await expect(
      source.openCase("member-1", { category: "order", subject: "x", description: "y" }),
    ).rejects.toThrow("support_rate_limited");
  });

  it("never serializes a queue position or a response deadline promise", async () => {
    const source = createMemberQuestionsSupportSource({
      listRows: async () => [row({})],
      insertRow: async () => {
        throw new Error("unused");
      },
    });
    const wire = JSON.stringify(await source.casesFor("member-1"));
    expect(wire).not.toMatch(/queue|position|within \d+ hours|12 hours/i);
  });
});
