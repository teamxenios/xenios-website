import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resend = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: "research-mail-id" }, error: null })),
}));

vi.mock("../services/email", () => ({
  getResendClient: async () => ({
    client: { emails: { send: resend.send } },
    // A generic provider default must never become a Research sender.
    fromEmail: "Generic Site <team@xeniostechnology.com>",
    replyToEmail: "team@xeniostechnology.com",
  }),
}));
vi.mock("../services/email-config", () => ({
  adminRecipients: () => ["admin@example.test"],
}));

import { MEMBER_PLATFORM_TEMPLATES } from "./member-platform-emails";
import { sendApplicationReceived } from "./membership-emails";

const CANONICAL_FROM = "Xenios Research <research@xeniostechnology.com>";
const CANONICAL_REPLY_TO = "research@xeniostechnology.com";

describe("canonical Research sender across lifecycle email systems", () => {
  beforeEach(() => {
    resend.send.mockClear();
    delete process.env.RESEARCH_EMAIL_FROM;
    delete process.env.RESEARCH_EMAIL_REPLY_TO;
  });

  afterEach(() => {
    delete process.env.RESEARCH_EMAIL_FROM;
    delete process.env.RESEARCH_EMAIL_REPLY_TO;
  });

  it("uses the canonical identity for application and approval-lifecycle mail", async () => {
    await sendApplicationReceived({
      email: "applicant@example.test",
      firstName: "Avery",
      token: "opaque-status-token",
    });
    expect(resend.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: CANONICAL_FROM,
        replyTo: CANONICAL_REPLY_TO,
      }),
    );
  });

  it("uses the canonical identity for member-platform mail", async () => {
    await MEMBER_PLATFORM_TEMPLATES.member_document_ready({
      recipient: "member@example.test",
      payload: { firstName: "Avery", title: "Research plan" },
    });
    expect(resend.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: CANONICAL_FROM,
        replyTo: CANONICAL_REPLY_TO,
      }),
    );
  });

  it("uses only explicit Research overrides, never provider-wide sender defaults", async () => {
    process.env.RESEARCH_EMAIL_FROM = "Xenios Research <research@configured.example>";
    process.env.RESEARCH_EMAIL_REPLY_TO = "research-replies@configured.example";
    await MEMBER_PLATFORM_TEMPLATES.member_question_answer_ready({
      recipient: "member@example.test",
      payload: { firstName: "Avery" },
    });
    expect(resend.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Xenios Research <research@configured.example>",
        replyTo: "research-replies@configured.example",
      }),
    );
    expect(JSON.stringify(resend.send.mock.calls)).not.toContain("team@xeniostechnology.com");
  });
});
